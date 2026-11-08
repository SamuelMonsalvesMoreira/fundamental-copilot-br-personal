/**
 * Coleta da CVM → SQLite.
 *
 *   1. Cadastro + FCA: companhias e seus tickers na B3.
 *   2. DFP (anual) e ITR (trimestral) de cada ano: demonstrações,
 *      contas padronizadas e quantidade de ações.
 *
 * Cada arquivo só é baixado de novo se mudou na CVM (Last-Modified/tamanho),
 * a menos que `force` seja usado.
 */
import type Database from "better-sqlite3";
import { decodeLatin1 } from "../csv";
import { downloadBuffer, remoteVersion } from "../http";
import { lastOkRemoteVersion, trackRun } from "../runs";
import { extractZipEntry } from "../zip";
import { parseCadastro, parseFcaTickers, type TickerRow } from "./registry";
import { detectLayout, standardize } from "./standardize";
import { parsePackage, type CvmDoc } from "./statements";
import { CVM_SOURCE, cvmUrls } from "./urls";
import { refreshSnapshots } from "../snapshots";

type Log = (msg: string) => void;

export interface CvmOptions {
  force?: boolean;
  log?: Log;
}

const nowIso = () => new Date().toISOString();

// ─── Cadastro e tickers ──────────────────────────────────────────────────────

export async function ingestRegistry(sqlite: Database.Database, opts: CvmOptions = {}) {
  const log = opts.log ?? (() => {});
  const year = new Date().getFullYear();

  return trackRun(sqlite, { job: "cvm:cadastro", source: `${CVM_SOURCE} — Cadastro e FCA`, sourceUrl: cvmUrls.cadastro }, async () => {
    log("Baixando cadastro de companhias…");
    const cadBytes = await downloadBuffer(cvmUrls.cadastro);
    if (!cadBytes) throw new Error("Cadastro da CVM não encontrado");
    const cadastro = parseCadastro(decodeLatin1(cadBytes));

    // FCA do ano corrente e do anterior: empresas que ainda não reentregaram
    // o FCA este ano continuam aparecendo pelo do ano passado.
    const tickers = new Map<string, TickerRow>();
    let fcaAsOf: string | null = null;
    for (const y of [year - 1, year]) {
      log(`Baixando FCA ${y}…`);
      const zip = await downloadBuffer(cvmUrls.fca(y));
      if (!zip) continue;
      const csv = extractZipEntry(zip, `fca_cia_aberta_valor_mobiliario_${y}.csv`);
      if (!csv) continue;
      const rows = parseFcaTickers(decodeLatin1(csv));
      // o ano mais novo substitui tudo daquela companhia
      const cnpjs = new Set(rows.map((r) => r.cnpj));
      for (const [t, r] of tickers) if (cnpjs.has(r.cnpj)) tickers.delete(t);
      for (const r of rows) tickers.set(r.ticker, r);
      for (const r of rows) if (!fcaAsOf || r.referenceDate > fcaAsOf) fcaAsOf = r.referenceDate;
    }
    if (tickers.size === 0) throw new Error("Nenhum ticker encontrado no FCA");

    const listed = new Set([...tickers.values()].map((t) => t.cnpj));
    const segmentByCnpj = new Map([...tickers.values()].map((t) => [t.cnpj, t.segment]));
    const now = nowIso();

    const upsertCompany = sqlite.prepare(
      `INSERT INTO companies (cnpj, cvm_code, name, trade_name, sector, status, listing_segment, source, updated_at)
       VALUES (@cnpj, @cvmCode, @name, @tradeName, @sector, @status, @segment, @source, @now)
       ON CONFLICT(cnpj) DO UPDATE SET cvm_code = excluded.cvm_code, name = excluded.name,
         trade_name = excluded.trade_name, sector = excluded.sector, status = excluded.status,
         listing_segment = excluded.listing_segment, source = excluded.source, updated_at = excluded.updated_at`,
    );
    const insertTicker = sqlite.prepare(
      `INSERT INTO tickers (ticker, cnpj, share_class, shares_per_unit, unit_composition, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    const known = new Set(cadastro.map((c) => c.cnpj));
    let companies = 0;
    sqlite.transaction(() => {
      for (const c of cadastro) {
        if (!listed.has(c.cnpj)) continue;
        upsertCompany.run({ ...c, segment: segmentByCnpj.get(c.cnpj) ?? null, source: `${CVM_SOURCE} — Cadastro`, now });
        companies++;
      }
      // tickers: lista atual substitui a anterior (tickers cancelados somem)
      sqlite.prepare(`DELETE FROM tickers`).run();
      for (const t of tickers.values()) {
        if (!known.has(t.cnpj)) continue;
        insertTicker.run(t.ticker, t.cnpj, t.shareClass, t.sharesPerUnit, t.unitComposition, `${CVM_SOURCE} — FCA`, now);
      }
    })();

    const tickerCount = (sqlite.prepare(`SELECT COUNT(*) n FROM tickers`).get() as { n: number }).n;
    log(`${companies} companhias e ${tickerCount} tickers.`);
    return { rows: companies, dataAsOf: fcaAsOf, message: `${tickerCount} tickers` };
  });
}

// ─── DFP / ITR ───────────────────────────────────────────────────────────────

export interface PackageOptions extends CvmOptions {
  /** Guardar as linhas completas das demonstrações (além das contas padronizadas). */
  storeRawLines?: boolean;
}

export async function ingestPackage(sqlite: Database.Database, doc: CvmDoc, year: number, opts: PackageOptions = {}) {
  const log = opts.log ?? (() => {});
  const url = doc === "DFP" ? cvmUrls.dfp(year) : cvmUrls.itr(year);
  const job = `cvm:${doc.toLowerCase()}:${year}`;

  return trackRun(sqlite, { job, source: `${CVM_SOURCE} — ${doc} ${year}`, sourceUrl: url }, async () => {
    const version = await remoteVersion(url);
    if (!version) return { skipped: true, rows: 0, message: "arquivo ainda não publicado pela CVM" };
    if (!opts.force && version === lastOkRemoteVersion(sqlite, job)) {
      log(`${doc} ${year}: sem mudanças desde a última coleta.`);
      return { skipped: true, rows: 0, remoteVersion: version, message: "sem mudanças" };
    }

    const listed = new Set(
      (sqlite.prepare(`SELECT cnpj FROM companies`).all() as { cnpj: string }[]).map((r) => r.cnpj),
    );
    if (listed.size === 0) throw new Error("Cadastro vazio: rode a coleta do cadastro antes");

    log(`${doc} ${year}: baixando…`);
    const zip = await downloadBuffer(url);
    if (!zip) return { skipped: true, rows: 0, message: "arquivo não encontrado" };
    log(`${doc} ${year}: ${(zip.length / 1e6).toFixed(1)} MB, lendo…`);
    const pkg = parsePackage(zip, doc, year, (c) => listed.has(c));

    const stmts = {
      filing: sqlite.prepare(
        `INSERT OR REPLACE INTO filings (cnpj, doc, period_end, version, received_at, link) VALUES (?, ?, ?, ?, ?, ?)`,
      ),
      delLines: sqlite.prepare(`DELETE FROM statement_lines WHERE cnpj = ? AND doc = ? AND period_end = ?`),
      delValuesBalance: sqlite.prepare(
        `DELETE FROM fin_values WHERE cnpj = ? AND doc = ? AND period_end = ?`,
      ),
      line: sqlite.prepare(
        `INSERT OR REPLACE INTO statement_lines
           (cnpj, doc, statement, consolidated, period_start, period_end, code, name, value, fixed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      value: sqlite.prepare(
        `INSERT OR REPLACE INTO fin_values (cnpj, metric, period_start, period_end, value, doc, consolidated, origin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      shares: sqlite.prepare(
        `INSERT OR REPLACE INTO share_counts
           (cnpj, period_end, doc, ordinary, preferred, total, treasury_ordinary, treasury_preferred, treasury_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      layout: sqlite.prepare(`UPDATE companies SET layout = ? WHERE cnpj = ?`),
    };

    let rawCount = 0;
    let valueCount = 0;
    let latestPeriod: string | null = null;

    sqlite.transaction(() => {
      for (const f of pkg.filings) stmts.filing.run(f.cnpj, f.doc, f.periodEnd, f.version, f.receivedAt, f.link);

      for (const [key, lines] of pkg.lines) {
        const [cnpj, periodEnd] = key.split("|");
        if (!latestPeriod || periodEnd > latestPeriod) latestPeriod = periodEnd;
        stmts.delLines.run(cnpj, doc, periodEnd);
        stmts.delValuesBalance.run(cnpj, doc, periodEnd);

        if (opts.storeRawLines) {
          for (const l of lines) {
            stmts.line.run(cnpj, doc, l.statement, l.consolidated ? 1 : 0, l.periodStart, l.periodEnd, l.code, l.name, l.value, l.fixed ? 1 : 0);
            rawCount++;
          }
        }

        const layout = detectLayout(lines);
        if (lines.some((l) => l.statement === "DRE")) stmts.layout.run(layout, cnpj);
        for (const v of standardize(lines, layout)) {
          stmts.value.run(cnpj, v.metric, v.periodStart, v.periodEnd, v.value, doc, v.consolidated ? 1 : 0, v.origin);
          valueCount++;
        }
      }

      for (const s of pkg.shareCounts) {
        stmts.shares.run(s.cnpj, s.periodEnd, s.doc, s.ordinary, s.preferred, s.total, s.treasuryOrdinary, s.treasuryPreferred, s.treasuryTotal);
      }
    })();

    log(`${doc} ${year}: ${pkg.lines.size} documentos, ${valueCount} valores padronizados, ${rawCount} linhas brutas.`);
    return {
      rows: valueCount,
      dataAsOf: latestPeriod,
      remoteVersion: version,
      message: `${pkg.lines.size} documentos`,
    };
  });
}

// ─── Tudo ────────────────────────────────────────────────────────────────────

export interface FullOptions extends CvmOptions {
  fromYear?: number;
  toYear?: number;
  /** Quantos anos (mais recentes) de ITR guardam as linhas completas. */
  rawItrYears?: number;
  skipRegistry?: boolean;
}

export async function ingestCvm(sqlite: Database.Database, opts: FullOptions = {}) {
  const current = new Date().getFullYear();
  const fromYear = opts.fromYear ?? current - 11;
  const toYear = opts.toYear ?? current;
  const rawItrYears = opts.rawItrYears ?? 2;
  const errors: string[] = [];

  if (!opts.skipRegistry) await ingestRegistry(sqlite, opts);

  for (let y = fromYear; y <= toYear; y++) {
    // A DFP do ano corrente só existe a partir do ano seguinte.
    for (const doc of ["DFP", "ITR"] as const) {
      if (doc === "DFP" && y >= current) continue;
      try {
        await ingestPackage(sqlite, doc, y, {
          ...opts,
          storeRawLines: doc === "DFP" || y > toYear - rawItrYears,
        });
      } catch (err) {
        const msg = `${doc} ${y}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        opts.log?.(`ERRO ${msg}`);
      }
    }
  }
  const snap = refreshSnapshots(sqlite);
  opts.log?.(`Indicadores recalculados para ${snap.count} companhias.`);
  return { errors };
}

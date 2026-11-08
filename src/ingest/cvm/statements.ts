/**
 * Leitura dos pacotes DFP (anual) e ITR (trimestral) da CVM.
 *
 * Regras:
 * - Só a coluna "ÚLTIMO" (exercício do documento). O "PENÚLTIMO" é a
 *   comparação com o ano anterior e já existe no documento daquele ano.
 * - Só a versão mais recente de cada documento (reapresentações substituem).
 * - Consolidado quando a companhia publica; senão, individual.
 * - Valores convertidos para R$ (ESCALA_MOEDA "MIL" → ×1000), exceto o
 *   lucro por ação (3.99.*), que já vem em R$/ação.
 */
import { decodeLatin1, iterateCsv, parseCvmNumber } from "../csv";
import { extractZipEntry, listZipEntries } from "../zip";
import type { StatementCode, StatementLine } from "./standardize";
import { cnpjDigits, normalizeText } from "./urls";

export type CvmDoc = "DFP" | "ITR";

export const STATEMENTS: StatementCode[] = ["BPA", "BPP", "DRE", "DFC_MD", "DFC_MI", "DVA"];

export interface Filing {
  cnpj: string;
  doc: CvmDoc;
  periodEnd: string;
  version: number;
  receivedAt: string | null;
  link: string | null;
}

export interface ShareCount {
  cnpj: string;
  periodEnd: string;
  doc: CvmDoc;
  version: number;
  ordinary: number | null;
  preferred: number | null;
  total: number | null;
  treasuryOrdinary: number | null;
  treasuryPreferred: number | null;
  treasuryTotal: number | null;
}

export interface ParsedPackage {
  doc: CvmDoc;
  year: number;
  filings: Filing[];
  /** linhas por documento: chave `${cnpj}|${periodEnd}` */
  lines: Map<string, StatementLine[]>;
  shareCounts: ShareCount[];
}

const docKey = (cnpj: string, periodEnd: string) => `${cnpj}|${periodEnd}`;

function fileName(doc: CvmDoc, year: number, part: string) {
  return `${doc.toLowerCase()}_cia_aberta_${part}${part ? "_" : ""}${year}.csv`;
}

function readCsv(zip: Uint8Array, name: string): Generator<Record<string, string>> | null {
  const bytes = extractZipEntry(zip, name);
  return bytes ? iterateCsv(decodeLatin1(bytes)) : null;
}

/** Linhas de um arquivo de demonstração, já filtradas (ÚLTIMO, versão máxima). */
export function parseStatementRows(
  rows: Iterable<Record<string, string>>,
  statement: StatementCode,
  consolidated: boolean,
  keep: (cnpj: string) => boolean,
): Map<string, StatementLine[]> {
  const byDoc = new Map<string, { version: number; lines: StatementLine[] }>();

  for (const r of rows) {
    if (normalizeText(r.ORDEM_EXERC) !== "ultimo") continue;
    const cnpj = cnpjDigits(r.CNPJ_CIA);
    if (!keep(cnpj)) continue;
    const key = docKey(cnpj, r.DT_REFER);
    const version = Number(r.VERSAO) || 0;
    let entry = byDoc.get(key);
    if (!entry || version > entry.version) byDoc.set(key, (entry = { version, lines: [] }));
    else if (version < entry.version) continue;

    const raw = parseCvmNumber(r.VL_CONTA);
    const isPerShare = r.CD_CONTA.startsWith("3.99");
    const scale = !isPerShare && normalizeText(r.ESCALA_MOEDA ?? "") === "mil" ? 1000 : 1;
    entry.lines.push({
      cnpj,
      statement,
      consolidated,
      periodStart: r.DT_INI_EXERC ?? "",
      periodEnd: r.DT_FIM_EXERC,
      code: r.CD_CONTA,
      name: r.DS_CONTA.trim(),
      value: raw === null ? null : raw * scale,
      fixed: r.ST_CONTA_FIXA === "S",
    });
  }

  const out = new Map<string, StatementLine[]>();
  for (const [k, v] of byDoc) out.set(k, v.lines);
  return out;
}

export function parseFilingIndex(rows: Iterable<Record<string, string>>, doc: CvmDoc, keep: (cnpj: string) => boolean) {
  const out = new Map<string, Filing>();
  for (const r of rows) {
    const cnpj = cnpjDigits(r.CNPJ_CIA);
    if (!keep(cnpj)) continue;
    const f: Filing = {
      cnpj,
      doc,
      periodEnd: r.DT_REFER,
      version: Number(r.VERSAO) || 0,
      receivedAt: r.DT_RECEB || null,
      link: r.LINK_DOC || null,
    };
    const k = docKey(cnpj, f.periodEnd);
    const cur = out.get(k);
    if (!cur || f.version > cur.version) out.set(k, f);
  }
  return [...out.values()];
}

export function parseShareCounts(rows: Iterable<Record<string, string>>, doc: CvmDoc, keep: (cnpj: string) => boolean) {
  const out = new Map<string, ShareCount>();
  const n = (s: string | undefined) => parseCvmNumber(s);
  for (const r of rows) {
    const cnpj = cnpjDigits(r.CNPJ_CIA);
    if (!keep(cnpj)) continue;
    const s: ShareCount = {
      cnpj,
      periodEnd: r.DT_REFER,
      doc,
      version: Number(r.VERSAO) || 0,
      ordinary: n(r.QT_ACAO_ORDIN_CAP_INTEGR),
      preferred: n(r.QT_ACAO_PREF_CAP_INTEGR),
      total: n(r.QT_ACAO_TOTAL_CAP_INTEGR),
      treasuryOrdinary: n(r.QT_ACAO_ORDIN_TESOURO),
      treasuryPreferred: n(r.QT_ACAO_PREF_TESOURO),
      treasuryTotal: n(r.QT_ACAO_TOTAL_TESOURO),
    };
    const k = docKey(cnpj, s.periodEnd);
    const cur = out.get(k);
    if (!cur || s.version > cur.version) out.set(k, s);
  }
  return [...out.values()];
}

/** Lê um pacote ZIP inteiro (DFP ou ITR de um ano) para as companhias desejadas. */
export function parsePackage(
  zip: Uint8Array,
  doc: CvmDoc,
  year: number,
  keep: (cnpj: string) => boolean,
): ParsedPackage {
  const entries = new Set(listZipEntries(zip));
  const csv = (part: string) => {
    const name = fileName(doc, year, part);
    return entries.has(name) ? readCsv(zip, name) : null;
  };

  const indexRows = csv("");
  const filings = indexRows ? parseFilingIndex(indexRows, doc, keep) : [];
  const capRows = csv("composicao_capital");
  const shareCounts = capRows ? parseShareCounts(capRows, doc, keep) : [];

  // Quem publica consolidado? (decidido pela DRE consolidada)
  const lines = new Map<string, StatementLine[]>();
  const add = (m: Map<string, StatementLine[]>) => {
    for (const [k, v] of m) {
      const cur = lines.get(k);
      if (cur) cur.push(...v);
      else lines.set(k, v);
    }
  };

  const conRows = csv("DRE_con");
  const dreCon = conRows ? parseStatementRows(conRows, "DRE", true, keep) : new Map();
  const hasCon = new Set(dreCon.keys());

  for (const st of STATEMENTS) {
    const con = st === "DRE" ? dreCon : (() => {
      const rows = csv(`${st}_con`);
      return rows ? parseStatementRows(rows, st, true, keep) : new Map<string, StatementLine[]>();
    })();
    for (const k of [...con.keys()]) if (!hasCon.has(k)) con.delete(k);
    add(con);

    const indRows = csv(`${st}_ind`);
    if (indRows) {
      const ind = parseStatementRows(indRows, st, false, keep);
      for (const k of [...ind.keys()]) if (hasCon.has(k)) ind.delete(k);
      add(ind);
    }
  }

  return { doc, year, filings, lines, shareCounts };
}

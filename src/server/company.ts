import "server-only";
import { sqlite } from "@/db/client";
import { buildQuarterly, FinTable, type MetricMap } from "@/analytics/periods";
import { debtOf, ebitdaOf, type Indicator } from "@/analytics/indicators";
import { averageAnnualDividends, defaultDcfAssumptions, graham, type DcfDefaults, type ValuationResult } from "@/analytics/valuation";
import { analyzeByCnpj, findTicker, loadCompanyMeta, loadPeers, type CompanyMeta, type PeerRow } from "@/data/company-data";
import { ensureTickerHistory, hasBrapiToken } from "@/ingest/brapi";
import { getMacroSnapshot } from "./macro";

export interface SeriesPoint {
  label: string; // "2025" ou "3T26"
  end: string;
  revenue: number | null;
  grossProfit: number | null;
  ebitda: number | null;
  ebit: number | null;
  netIncome: number | null;
  grossMargin: number | null;
  ebitdaMargin: number | null;
  netMargin: number | null;
  netDebt: number | null;
  netDebtEbitda: number | null;
  equity: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  fcf: number | null;
  dividendsPaid: number | null;
}

export interface StatementTable {
  statement: "DRE" | "BPA" | "BPP" | "DFC";
  years: string[]; // datas de fim, antigas → recentes
  rows: Array<{ code: string; name: string; depth: number; values: Array<number | null> }>;
}

export interface CompanyPageData {
  ticker: string;
  meta: CompanyMeta;
  classes: Array<{ ticker: string; shareClass: string; close: number | null; changePct: number | null; date: string | null }>;
  quote: { close: number; changePct: number | null; date: string; volume: number | null } | null;
  indicators: Record<string, Indicator>;
  ttm: { end: string; kind: "annual" | "ttm"; composition: string } | null;
  sources: { financials: string | null; price: string | null };
  marketCapNote: string | null;
  sharesOutstanding: number | null;
  annual: SeriesPoint[];
  quarterly: SeriesPoint[];
  priceHistory: Array<{ date: string; close: number }>;
  dividendsByYear: Array<{ year: number; perShare: number | null; paid: number | null }>;
  valuation: {
    price: number | null;
    graham: ValuationResult;
    lpa: number | null;
    vpa: number | null;
    bazin: { averageDps: number | null; perYear: Array<{ year: number; total: number }>; source: string };
    dcf: DcfDefaults;
    applicable: boolean;
  };
  peers: PeerRow[];
  macroDate: string | null;
  historyStatus: { tokenConfigured: boolean; message: string | null };
}

const n = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? null : v);
const ratio = (a: number | undefined, b: number | undefined) => (a !== undefined && b !== undefined && b > 0 ? a / b : null);

function toPoint(label: string, end: string, v: MetricMap): SeriesPoint {
  const ebitda = ebitdaOf(v);
  const { netDebt } = debtOf(v);
  const fcf = v.operatingCashFlow !== undefined && v.capex !== undefined ? v.operatingCashFlow - v.capex : undefined;
  return {
    label,
    end,
    revenue: n(v.revenue),
    grossProfit: n(v.grossProfit),
    ebitda: n(ebitda),
    ebit: n(v.ebit),
    netIncome: n(v.netIncomeParent),
    grossMargin: ratio(v.grossProfit, v.revenue),
    ebitdaMargin: ratio(ebitda, v.revenue),
    netMargin: ratio(v.netIncomeParent, v.revenue),
    netDebt: n(netDebt),
    netDebtEbitda: netDebt !== undefined && ebitda !== undefined && ebitda > 0 ? netDebt / ebitda : null,
    equity: n(v.equityParent),
    operatingCashFlow: n(v.operatingCashFlow),
    capex: n(v.capex),
    fcf: n(fcf),
    dividendsPaid: n(v.dividendsPaid),
  };
}

/** Demonstrações anuais (DFP) como publicadas, até 3 níveis de conta. */
function loadStatements(cnpj: string, years = 10): StatementTable[] {
  const ends = (
    sqlite
      .prepare(`SELECT DISTINCT period_end AS e FROM statement_lines WHERE cnpj = ? AND doc = 'DFP' ORDER BY e DESC LIMIT ?`)
      .all(cnpj, years) as { e: string }[]
  )
    .map((r) => r.e)
    .reverse();
  if (ends.length === 0) return [];
  const lines = sqlite
    .prepare(
      `SELECT statement, code, name, period_end AS end, value FROM statement_lines
        WHERE cnpj = ? AND doc = 'DFP' AND period_end >= ?
          AND (length(code) - length(replace(code, '.', ''))) <= 2
          AND statement IN ('DRE', 'BPA', 'BPP', 'DFC_MI', 'DFC_MD')
          AND code NOT LIKE '3.99%'`,
    )
    .all(cnpj, ends[0]) as Array<{ statement: string; code: string; name: string; end: string; value: number | null }>;

  const tables: StatementTable[] = [];
  for (const st of ["DRE", "BPA", "BPP", "DFC"] as const) {
    const sel = lines.filter((l) => (st === "DFC" ? l.statement.startsWith("DFC") : l.statement === st));
    const byCode = new Map<string, { name: string; values: Map<string, number | null> }>();
    for (const l of sel) {
      const row = byCode.get(l.code) ?? { name: l.name, values: new Map() };
      row.values.set(l.end, l.value);
      row.name = l.name; // nome mais recente
      byCode.set(l.code, row);
    }
    const codeSort = (a: string, b: string) => {
      const pa = a.split(".").map(Number);
      const pb = b.split(".").map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? -1) - (pb[i] ?? -1);
        if (d) return d;
      }
      return 0;
    };
    const rows = [...byCode.entries()]
      .sort(([a], [b]) => codeSort(a, b))
      .map(([code, r]) => ({ code, name: r.name, depth: code.split(".").length - 1, values: ends.map((e) => r.values.get(e) ?? null) }))
      // esconde linhas sempre zeradas (contas do plano padrão que a empresa não usa)
      .filter((r) => r.values.some((v) => v !== null && v !== 0));
    if (rows.length) tables.push({ statement: st, years: ends, rows });
  }
  return tables;
}

export function getStatements(ticker: string): StatementTable[] {
  const ref = findTicker(sqlite, ticker);
  return ref ? loadStatements(ref.cnpj) : [];
}

/** Fechamentos semanais (último pregão de cada semana) para o gráfico de preço. */
function loadPriceHistory(ticker: string) {
  const rows = sqlite
    .prepare(`SELECT date, close FROM quotes_daily WHERE ticker = ? ORDER BY date`)
    .all(ticker) as Array<{ date: string; close: number }>;
  if (rows.length < 30) return rows;
  const out: typeof rows = [];
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i];
    const next = rows[i + 1];
    const week = (d: string) => Math.floor(Date.parse(d) / (7 * 86_400_000));
    if (!next || week(next.date) !== week(cur.date)) out.push(cur);
  }
  return out;
}

export async function getCompanyPage(rawTicker: string): Promise<CompanyPageData | null> {
  const ref = findTicker(sqlite, rawTicker);
  if (!ref) return null;
  const meta = loadCompanyMeta(sqlite, ref.cnpj);
  if (!meta) return null;

  // Histórico/proventos sob demanda (cache de 24 h). Sem token, falha rápido e registra.
  let historyMessage: string | null = null;
  try {
    await ensureTickerHistory(sqlite, ref.ticker);
  } catch (err) {
    historyMessage = err instanceof Error ? err.message : String(err);
  }

  const a = analyzeByCnpj(sqlite, ref.cnpj, ref.ticker);
  const table = new FinTable(a.input.rows);
  const annual = a.annual.slice(-10).map((p) => toPoint(String(p.year), p.end, p.values));
  const quarterly = buildQuarterly(table, 12).map((q) => toPoint(q.label, q.end, q.values));

  const classes = a.input.tickers.map((t) => {
    const q = sqlite
      .prepare(`SELECT close, change_pct AS changePct, date FROM quotes_daily WHERE ticker = ? ORDER BY date DESC LIMIT 1`)
      .get(t.ticker) as { close: number; changePct: number | null; date: string } | undefined;
    return { ticker: t.ticker, shareClass: t.shareClass, close: q?.close ?? null, changePct: q?.changePct ?? null, date: q?.date ?? null };
  });
  const quoteRow = sqlite
    .prepare(`SELECT close, change_pct AS changePct, date, volume FROM quotes_daily WHERE ticker = ? ORDER BY date DESC LIMIT 1`)
    .get(ref.ticker) as CompanyPageData["quote"] | undefined;

  // proventos por ano: por ação (brapi, ticker atual) e pagos no total (DFC)
  const divsTicker = a.input.dividends.filter((d) => d.ticker === ref.ticker);
  const years = new Set<number>([...annual.map((p) => Number(p.label)), ...divsTicker.map((d) => Number(d.exDate.slice(0, 4)))]);
  const dividendsByYear = [...years]
    .filter((y) => Number.isFinite(y))
    .sort()
    .slice(-10)
    .map((year) => ({
      year,
      perShare: divsTicker.length ? divsTicker.filter((d) => d.exDate.startsWith(String(year))).reduce((s, d) => s + d.value, 0) : null,
      paid: annual.find((p) => p.label === String(year))?.dividendsPaid ?? null,
    }));

  const macro = getMacroSnapshot();
  const selic = macro.find((m) => m.key === "selic")?.value ?? null;
  const ipca = macro.find((m) => m.key === "ipca12m")?.value ?? null;
  const ind = a.indicators;
  const price = quoteRow?.close ?? null;
  const dpsAvg = averageAnnualDividends(a.input.dividends, ref.ticker, quoteRow?.date ?? new Date().toISOString().slice(0, 10));
  // sem proventos por ação: média de dividendos pagos (DFC) ÷ ações
  let bazinSource = "brapi.dev — proventos por data ex, média dos últimos 3 anos";
  let averageDps = dpsAvg?.average ?? null;
  let perYear = dpsAvg?.perYear ?? [];
  if (averageDps === null && a.sharesOutstanding) {
    const last3 = annual.slice(-3).filter((p) => p.dividendsPaid !== null);
    if (last3.length) {
      averageDps = last3.reduce((s, p) => s + (p.dividendsPaid ?? 0), 0) / last3.length / a.sharesOutstanding;
      perYear = last3.map((p) => ({ year: Number(p.label), total: (p.dividendsPaid ?? 0) / a.sharesOutstanding! }));
      bazinSource = "CVM — dividendos e JCP pagos (DFC) ÷ ações em circulação, média de 3 anos";
    }
  }

  return {
    ticker: ref.ticker,
    meta,
    classes,
    quote: quoteRow ?? null,
    indicators: ind,
    ttm: a.ttm ? { end: a.ttm.end, kind: a.ttm.kind, composition: a.ttm.composition } : null,
    sources: a.sources,
    marketCapNote: a.marketCap?.note ?? null,
    sharesOutstanding: a.sharesOutstanding,
    annual,
    quarterly,
    priceHistory: loadPriceHistory(ref.ticker),
    dividendsByYear,
    valuation: {
      price,
      lpa: ind.lpa.value,
      vpa: ind.vpa.value,
      graham: graham(ind.lpa.value, ind.vpa.value, price),
      bazin: { averageDps, perYear, source: bazinSource },
      dcf: defaultDcfAssumptions({
        annual: a.annual,
        revenueCagr5y: ind.revenueCagr5y.value,
        selic,
        ipca12m: ipca,
        netDebt: ind.netDebt.value,
        minority: a.ttm?.values.minorityInterest ?? null,
        shares: a.sharesOutstanding,
      }),
      applicable: meta.layout === "standard" || meta.layout === null,
    },
    peers: loadPeers(sqlite, ref.cnpj, 10),
    macroDate: macro[0]?.date ?? null,
    historyStatus: { tokenConfigured: hasBrapiToken(), message: historyMessage },
  };
}

export interface SearchResult {
  ticker: string;
  name: string;
  sector: string | null;
  close: number | null;
  changePct: number | null;
}

/** Busca por ticker ou nome (para o autocomplete). Prioriza ticker exato e mais negociados. */
export function searchTickers(q: string, limit = 8): SearchResult[] {
  const term = q.trim().toUpperCase();
  if (!term) return [];
  const like = `%${term}%`;
  return sqlite
    .prepare(
      `SELECT t.ticker,
              COALESCE(c.trade_name, c.name) AS name,
              s.sector,
              q.close, q.change_pct AS changePct,
              CASE WHEN t.ticker = @term THEN 0 WHEN t.ticker LIKE @prefix THEN 1 ELSE 2 END AS rank,
              COALESCE(q.volume, 0) AS vol
         FROM tickers t
         JOIN companies c USING (cnpj)
         LEFT JOIN company_snapshots s ON s.cnpj = t.cnpj
         LEFT JOIN quotes_daily q ON q.ticker = t.ticker AND q.date = (SELECT MAX(date) FROM quotes_daily WHERE ticker = t.ticker)
        WHERE t.ticker LIKE @like OR UPPER(c.name) LIKE @like OR UPPER(COALESCE(c.trade_name, '')) LIKE @like
        ORDER BY rank, vol DESC
        LIMIT @limit`,
    )
    .all({ term, prefix: `${term}%`, like, limit }) as SearchResult[];
}

/** Maiores empresas por valor de mercado (página inicial). */
export function topCompanies(limit = 12) {
  return sqlite
    .prepare(
      `SELECT s.ticker, s.name, s.sector, s.price, s.market_cap AS marketCap, s.pl, s.roe, s.dy,
              (SELECT change_pct FROM quotes_daily q WHERE q.ticker = s.ticker ORDER BY date DESC LIMIT 1) AS changePct
         FROM company_snapshots s WHERE s.market_cap IS NOT NULL ORDER BY s.market_cap DESC LIMIT ?`,
    )
    .all(limit) as Array<{ ticker: string; name: string; sector: string; price: number | null; marketCap: number; pl: number | null; roe: number | null; dy: number | null; changePct: number | null }>;
}

/**
 * Leitura dos dados de uma companhia no SQLite e montagem da análise.
 * Usado pelo servidor Next (via src/server) e pelos scripts de coleta.
 */
import type Database from "better-sqlite3";
import { analyzeCompany, type CompanyAnalysis, type CompanyInput, type DividendRecord, type TickerQuote } from "@/analytics/indicators";
import type { FinRow } from "@/analytics/periods";
import type { Layout } from "@/ingest/cvm/standardize";

export interface CompanyMeta {
  cnpj: string;
  cvmCode: string;
  name: string;
  tradeName: string | null;
  layout: Layout | null;
  cvmSector: string | null;
  subsector: string | null;
  sector: string;
  listingSegment: string | null;
  logo: string | null;
  shareScaleNote: string | null;
}

export interface TickerRef {
  ticker: string;
  cnpj: string;
  shareClass: string;
}

/**
 * Subsetores que a brapi grafa de formas diferentes mas são o mesmo grupo
 * de pares. Chave = sectorKey do nome original; valor = nome unificado.
 */
const SECTOR_ALIASES: Record<string, string> = {
  "bancos diversificados": "Bancos",
  "maquinas e equipamentos": "Máquinas e Equipamentos",
  "maq e equip industriais": "Máquinas e Equipamentos",
  "maquinas e equipamentos industriais": "Máquinas e Equipamentos",
  "motores compressores e outros": "Máquinas e Equipamentos",
  equipamentos: "Máquinas e Equipamentos",
  "maquinas equipamentos veiculos e pecas": "Material de Transporte",
  "mineracao de minerais metalicos": "Minerais Metálicos",
  siderurgia: "Siderurgia e Metalurgia",
  "metalurgia e siderurgia": "Siderurgia e Metalurgia",
  "petroquimicos e borracha": "Petroquímicos",
  "servicos medicos": "Hospitais e Diagnósticos",
  "servicos medicos hospitalares": "Hospitais e Diagnósticos",
  "serv med hospit analises e diagnosticos": "Hospitais e Diagnósticos",
  "tecidos vestuario e calcados": "Têxtil e Vestuário",
  "textil e vestuario": "Têxtil e Vestuário",
  vestuario: "Têxtil e Vestuário",
  seguradoras: "Seguros",
  resseguradoras: "Seguros",
  "corretoras de seguros e resseguros": "Seguros",
  "exploracao refino e distribuicao": "Exploração, Refino e Distribuição",
};

/** Setor legível: subsetor B3 (via brapi) ou setor da CVM sem o prefixo de holding. */
export function sectorLabel(subsector: string | null, cvmSector: string | null): string {
  let label = "Sem setor";
  if (subsector && !subsector.includes("�")) label = subsector;
  else if (cvmSector) label = cvmSector.replace(/^Emp\.\s*Adm\.\s*Part\.\s*-\s*/i, "").trim();
  return SECTOR_ALIASES[sectorKey(label)] ?? label;
}

/** Chave para agrupar pares (ignora acentos e variações de grafia). */
export function sectorKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findTicker(sqlite: Database.Database, ticker: string): TickerRef | null {
  return (
    (sqlite
      .prepare(`SELECT ticker, cnpj, share_class AS shareClass FROM tickers WHERE ticker = ?`)
      .get(ticker.toUpperCase().trim()) as TickerRef | undefined) ?? null
  );
}

export function loadCompanyMeta(sqlite: Database.Database, cnpj: string): CompanyMeta | null {
  const row = sqlite
    .prepare(
      `SELECT c.cnpj, c.cvm_code AS cvmCode, c.name, c.trade_name AS tradeName, c.layout,
              c.sector AS cvmSector, c.listing_segment AS listingSegment, c.share_scale_note AS shareScaleNote,
              (SELECT m.subsector FROM tickers t JOIN market_info m USING (ticker) WHERE t.cnpj = c.cnpj AND m.subsector IS NOT NULL LIMIT 1) AS subsector,
              (SELECT m.logo FROM tickers t JOIN market_info m USING (ticker) WHERE t.cnpj = c.cnpj AND m.logo IS NOT NULL LIMIT 1) AS logo
         FROM companies c WHERE c.cnpj = ?`,
    )
    .get(cnpj) as Omit<CompanyMeta, "sector"> | undefined;
  if (!row) return null;
  return { ...row, sector: sectorLabel(row.subsector, row.cvmSector) };
}

export function loadCompanyInput(sqlite: Database.Database, cnpj: string, preferredTicker?: string): CompanyInput & { tickers: TickerRef[] } {
  const rows = sqlite
    .prepare(
      `SELECT metric, period_start AS periodStart, period_end AS periodEnd, value, doc, origin
         FROM fin_values WHERE cnpj = ?`,
    )
    .all(cnpj) as FinRow[];

  const shareRow = sqlite
    .prepare(
      `SELECT s.period_end AS periodEnd, s.ordinary, s.preferred, s.treasury_ordinary AS treasuryOrdinary,
              s.treasury_preferred AS treasuryPreferred, c.share_scale AS scale
         FROM share_counts s JOIN companies c USING (cnpj)
        WHERE s.cnpj = ? ORDER BY s.period_end DESC LIMIT 1`,
    )
    .get(cnpj) as CompanyInput["shares"] | undefined;

  const tickers = sqlite
    .prepare(`SELECT ticker, cnpj, share_class AS shareClass FROM tickers WHERE cnpj = ? ORDER BY ticker`)
    .all(cnpj) as TickerRef[];

  const quotes = sqlite
    .prepare(
      `SELECT t.ticker, t.share_class AS shareClass, q.close, q.date, q.market_cap AS marketCap, q.volume
         FROM tickers t
         JOIN quotes_daily q ON q.ticker = t.ticker
        WHERE t.cnpj = ? AND q.date = (SELECT MAX(date) FROM quotes_daily WHERE ticker = t.ticker)`,
    )
    .all(cnpj) as TickerQuote[];

  const dividends = sqlite
    .prepare(
      `SELECT d.ticker, d.ex_date AS exDate, d.value_per_share AS value, d.kind
         FROM dividends d JOIN tickers t USING (ticker) WHERE t.cnpj = ?`,
    )
    .all(cnpj) as DividendRecord[];

  const layout = (sqlite.prepare(`SELECT layout FROM companies WHERE cnpj = ?`).get(cnpj) as { layout: Layout | null } | undefined)?.layout ?? null;

  // ticker principal: o pedido, senão o mais negociado no último pregão
  const byVolume = [...quotes].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  const ticker =
    (preferredTicker && tickers.find((t) => t.ticker === preferredTicker.toUpperCase())?.ticker) ??
    byVolume[0]?.ticker ??
    tickers[0]?.ticker ??
    "";

  return { layout, rows, shares: shareRow ?? null, quotes, dividends, ticker, tickers };
}

export function analyzeByCnpj(sqlite: Database.Database, cnpj: string, preferredTicker?: string): CompanyAnalysis & { input: ReturnType<typeof loadCompanyInput> } {
  const input = loadCompanyInput(sqlite, cnpj, preferredTicker);
  return { ...analyzeCompany(input), input };
}

export interface PeerRow {
  cnpj: string;
  ticker: string;
  name: string;
  marketCap: number | null;
  pl: number | null;
  pvp: number | null;
  evEbitda: number | null;
  roe: number | null;
  netMargin: number | null;
  dy: number | null;
  netDebtEbitda: number | null;
}

/** Empresas do mesmo setor, ordenadas por valor de mercado (inclui a própria). */
export function loadPeers(sqlite: Database.Database, cnpj: string, limit = 8): PeerRow[] {
  return sqlite
    .prepare(
      `SELECT cnpj, ticker, name, market_cap AS marketCap, pl, pvp, ev_ebitda AS evEbitda, roe,
              net_margin AS netMargin, dy, net_debt_ebitda AS netDebtEbitda
         FROM company_snapshots
        WHERE sector_key = (SELECT sector_key FROM company_snapshots WHERE cnpj = ?)
          AND price IS NOT NULL
        ORDER BY market_cap DESC NULLS LAST
        LIMIT ?`,
    )
    .all(cnpj, limit) as PeerRow[];
}

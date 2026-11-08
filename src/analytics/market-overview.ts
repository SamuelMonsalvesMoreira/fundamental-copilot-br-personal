/** Resumo do mercado para a tela Panorama: totais, medianas e setores. */
import { median, PEER_RULES } from "./peers";

export interface MarketRow {
  ticker: string;
  name: string;
  sector: string;
  marketCap: number;
  liquidity: number | null;
  pl: number | null;
  pvp: number | null;
  roe: number | null;
  dy: number | null;
  netDebtEbitda: number | null;
  priceDate: string | null;
  financialsEnd: string | null;
}

export interface SectorRow {
  sector: string;
  companies: number;
  marketCap: number;
  medianRoe: number | null;
}

export interface MarketOverview {
  /** empresas com cotação e valor de mercado */
  all: number;
  totalMarketCap: number;
  /** empresas com liquidez mínima: base das medianas, do gráfico e da tabela */
  liquid: MarketRow[];
  minLiquidity: number;
  aboveSelic: number | null;
  medianPl: number | null;
  medianRoe: number | null;
  medianDy: number | null;
  priceDate: string | null;
  financialsEnd: string | null;
  sectors: SectorRow[];
}

const nonNull = (xs: Array<number | null>) => xs.filter((v): v is number => v !== null);
const positive = (xs: Array<number | null>) => nonNull(xs).filter((v) => v > 0);
const latest = (xs: Array<string | null>) => xs.filter((d): d is string => Boolean(d)).sort().at(-1) ?? null;

export function buildOverview(rows: MarketRow[], selic: number | null): MarketOverview {
  const minLiquidity = PEER_RULES.minLiquidity;
  const liquid = rows.filter((r) => (r.liquidity ?? 0) >= minLiquidity);

  const bySector = new Map<string, MarketRow[]>();
  for (const r of rows) bySector.set(r.sector, [...(bySector.get(r.sector) ?? []), r]);
  const sectors = [...bySector.entries()]
    .map(([sector, list]) => ({
      sector,
      companies: list.length,
      marketCap: list.reduce((s, r) => s + r.marketCap, 0),
      medianRoe: median(nonNull(list.map((r) => r.roe))),
    }))
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 10);

  return {
    all: rows.length,
    totalMarketCap: rows.reduce((s, r) => s + r.marketCap, 0),
    liquid,
    minLiquidity,
    aboveSelic: selic === null ? null : liquid.filter((r) => r.roe !== null && r.roe > selic).length,
    medianPl: median(positive(liquid.map((r) => r.pl))),
    medianRoe: median(nonNull(liquid.map((r) => r.roe))),
    medianDy: median(positive(liquid.map((r) => r.dy))),
    priceDate: latest(rows.map((r) => r.priceDate)),
    financialsEnd: latest(rows.map((r) => r.financialsEnd)),
    sectors,
  };
}

import "server-only";
import { sqlite } from "@/db/client";
import {
  assumptionsSchema,
  defaultAssumptions,
  projectEarnings,
  type ProjectionAssumptions,
  type ProjectionBase,
  type ProjectionResult,
} from "@/analytics/projections";
import { getCompanyPage, type CompanyPageData } from "./company";
import { getMacroSnapshot } from "./macro";

export interface ProjectionContext {
  ticker: string;
  base: ProjectionBase;
  defaults: ProjectionAssumptions;
  notes: Record<string, string>;
  saved: ProjectionAssumptions | null;
  savedAt: string | null;
  avgCost: number | null;
  selic: number | null;
  /** lucro e dividendos reais dos últimos anos, para o gráfico */
  history: Array<{ label: string; netIncome: number | null; dividends: number | null }>;
  baseLabel: string | null;
  isFinancial: boolean;
  unitNote: string | null;
}

function loadSaved(ticker: string): { assumptions: ProjectionAssumptions; updatedAt: string } | null {
  const row = sqlite.prepare(`SELECT assumptions, updated_at AS updatedAt FROM projections WHERE ticker = ?`).get(ticker) as
    | { assumptions: string; updatedAt: string }
    | undefined;
  if (!row) return null;
  try {
    const parsed = assumptionsSchema.safeParse(JSON.parse(row.assumptions));
    return parsed.success ? { assumptions: parsed.data, updatedAt: row.updatedAt } : null;
  } catch {
    return null;
  }
}

/** Preço médio ponderado das posições do ticker na carteira. */
function averageCost(ticker: string): number | null {
  const r = sqlite
    .prepare(`SELECT SUM(quantity * avg_price) AS cost, SUM(quantity) AS qty FROM portfolio_positions WHERE ticker = ?`)
    .get(ticker) as { cost: number | null; qty: number | null };
  return r.qty && r.qty > 0 && r.cost ? r.cost / r.qty : null;
}

export function buildProjectionContext(p: CompanyPageData): ProjectionContext {
  const macro = getMacroSnapshot();
  const ind = p.indicators;
  const { assumptions, notes } = defaultAssumptions({
    annual: p.annual,
    earningsCagr5y: ind.earningsCagr5y?.value ?? null,
    revenueCagr5y: ind.revenueCagr5y?.value ?? null,
    ttmPayout: ind.payout?.value ?? null,
    currentPl: ind.pl?.value ?? null,
    ipca12m: macro.find((m) => m.key === "ipca12m")?.value ?? null,
    ttmNetMargin: ind.netMargin?.value ?? null,
  });
  const saved = loadSaved(p.ticker);
  return {
    ticker: p.ticker,
    base: {
      netIncome: p.ttmValues.netIncome,
      revenue: p.ttmValues.revenue,
      shares: p.sharesOutstanding,
      price: p.quote?.close ?? null,
      baseEnd: p.ttm?.end ?? null,
    },
    defaults: assumptions,
    notes,
    saved: saved?.assumptions ?? null,
    savedAt: saved?.updatedAt ?? null,
    avgCost: averageCost(p.ticker),
    selic: macro.find((m) => m.key === "selic")?.value ?? null,
    history: p.annual.slice(-5).map((a) => ({ label: a.label, netIncome: a.netIncome, dividends: a.dividendsPaid })),
    baseLabel: p.ttm ? (p.ttm.kind === "ttm" ? `12 meses até ${p.ttm.end}` : `exercício até ${p.ttm.end}`) : null,
    isFinancial: p.meta.layout === "bank" || p.meta.layout === "insurance",
    unitNote: p.unitNote,
  };
}

export interface SavedProjectionView {
  ticker: string;
  name: string;
  sector: string;
  updatedAt: string;
  assumptions: ProjectionAssumptions;
  price: number | null;
  avgCost: number | null;
  result: ProjectionResult;
}

/** Todas as projeções salvas, recalculadas com preço e lucro atuais. */
export async function listSavedProjections(): Promise<SavedProjectionView[]> {
  const rows = sqlite.prepare(`SELECT ticker FROM projections ORDER BY updated_at DESC`).all() as { ticker: string }[];
  const out: SavedProjectionView[] = [];
  for (const { ticker } of rows) {
    const view = await getSavedProjection(ticker);
    if (view) out.push(view);
  }
  return out;
}

export async function getSavedProjection(ticker: string): Promise<SavedProjectionView | null> {
  const saved = loadSaved(ticker);
  if (!saved) return null;
  const p = await getCompanyPage(ticker);
  if (!p) return null;
  const ctx = buildProjectionContext(p);
  return {
    ticker: p.ticker,
    name: p.meta.tradeName ?? p.meta.name,
    sector: p.meta.sector,
    updatedAt: saved.updatedAt,
    assumptions: saved.assumptions,
    price: ctx.base.price,
    avgCost: ctx.avgCost,
    result: projectEarnings(ctx.base, saved.assumptions, { avgCost: ctx.avgCost }),
  };
}

/**
 * Modelos de valuation. Todos são funções puras: as premissas entram
 * explícitas e podem ser editadas na interface.
 *
 * São modelos simples, para estudo — não são preço-alvo nem recomendação.
 */
import type { AnnualPoint } from "./periods";
import type { DividendRecord } from "./indicators";

export interface ValuationResult {
  /** valor justo por ação (R$) */
  value: number | null;
  /** potencial em relação ao preço atual (fração) */
  upside: number | null;
  formula: string;
  missing?: string;
}

const upsideOf = (fair: number | null, price: number | null) =>
  fair !== null && price ? fair / price - 1 : null;

// ─── Graham ──────────────────────────────────────────────────────────────────

/** Valor intrínseco de Graham: √(22,5 × LPA × VPA). */
export function graham(lpa: number | null, vpa: number | null, price: number | null): ValuationResult {
  const formula = "√(22,5 × LPA × VPA)";
  if (lpa === null || vpa === null) return { value: null, upside: null, formula, missing: "falta LPA ou VPA" };
  if (lpa <= 0 || vpa <= 0) return { value: null, upside: null, formula, missing: "LPA ou VPA negativo: fórmula não se aplica" };
  const value = Math.sqrt(22.5 * lpa * vpa);
  return { value, upside: upsideOf(value, price), formula };
}

// ─── Bazin ───────────────────────────────────────────────────────────────────

export interface BazinInput {
  /** dividendos por ação médios por ano */
  dividendsPerShare: number | null;
  /** rendimento mínimo exigido (padrão 6%) */
  minYield: number;
  price: number | null;
}

/** Preço-teto de Bazin: dividendos por ação anuais ÷ rendimento mínimo. */
export function bazin({ dividendsPerShare, minYield, price }: BazinInput): ValuationResult {
  const formula = `Dividendos por ação (média anual) ÷ ${(minYield * 100).toFixed(1).replace(".", ",")}%`;
  if (dividendsPerShare === null) return { value: null, upside: null, formula, missing: "sem histórico de dividendos por ação" };
  if (minYield <= 0) return { value: null, upside: null, formula, missing: "rendimento mínimo deve ser positivo" };
  const value = dividendsPerShare / minYield;
  return { value, upside: upsideOf(value, price), formula };
}

/**
 * Dividendos por ação médios dos últimos `years` anos-calendário completos,
 * pela data ex. Anos sem nenhum provento contam como zero (se houver histórico
 * anterior), para não inflar a média.
 */
export function averageAnnualDividends(divs: DividendRecord[], ticker: string, refDate: string, years = 3) {
  const own = divs.filter((d) => d.ticker === ticker);
  if (own.length === 0) return null;
  const lastYear = Number(refDate.slice(0, 4)) - 1;
  const firstWithData = Math.min(...own.map((d) => Number(d.exDate.slice(0, 4))));
  const perYear: Array<{ year: number; total: number }> = [];
  for (let y = lastYear - years + 1; y <= lastYear; y++) {
    if (y < firstWithData) continue;
    perYear.push({ year: y, total: own.filter((d) => d.exDate.startsWith(String(y))).reduce((s, d) => s + d.value, 0) });
  }
  if (perYear.length === 0) return null;
  return { average: perYear.reduce((s, p) => s + p.total, 0) / perYear.length, perYear };
}

// ─── DCF ─────────────────────────────────────────────────────────────────────

export interface DcfAssumptions {
  /** fluxo de caixa livre do ano-base (R$) */
  baseFcf: number;
  /** crescimento anual do FCF nos anos de projeção */
  growthRate: number;
  /** anos de projeção explícita */
  years: number;
  /** crescimento na perpetuidade (nominal) */
  terminalGrowth: number;
  /** taxa de desconto (custo de capital, nominal) */
  discountRate: number;
  /** dívida líquida + minoritários (R$), subtraída do valor da firma */
  netDebt: number;
  /** ações em circulação */
  shares: number;
}

export interface DcfResult extends ValuationResult {
  projections: Array<{ year: number; fcf: number; discountFactor: number; presentValue: number }>;
  terminalValue: number | null;
  presentTerminalValue: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
  /** fração do valor que vem da perpetuidade — alta = muito sensível às premissas */
  terminalShare: number | null;
}

export function dcf(a: DcfAssumptions, price: number | null): DcfResult {
  const formula = "Σ FCF projetado ÷ (1 + taxa)^t + valor terminal descontado − dívida líquida, ÷ ações";
  const empty = { projections: [], terminalValue: null, presentTerminalValue: null, enterpriseValue: null, equityValue: null, terminalShare: null };
  if (!(a.shares > 0)) return { value: null, upside: null, formula, missing: "quantidade de ações indisponível", ...empty };
  if (a.discountRate <= a.terminalGrowth)
    return { value: null, upside: null, formula, missing: "a taxa de desconto precisa ser maior que o crescimento na perpetuidade", ...empty };
  if (a.years < 1 || a.years > 20) return { value: null, upside: null, formula, missing: "anos de projeção entre 1 e 20", ...empty };

  const projections: DcfResult["projections"] = [];
  let fcf = a.baseFcf;
  for (let y = 1; y <= a.years; y++) {
    fcf = fcf * (1 + a.growthRate);
    const discountFactor = 1 / Math.pow(1 + a.discountRate, y);
    projections.push({ year: y, fcf, discountFactor, presentValue: fcf * discountFactor });
  }
  const terminalValue = (fcf * (1 + a.terminalGrowth)) / (a.discountRate - a.terminalGrowth);
  const presentTerminalValue = terminalValue * projections.at(-1)!.discountFactor;
  const enterpriseValue = projections.reduce((s, p) => s + p.presentValue, 0) + presentTerminalValue;
  const equityValue = enterpriseValue - a.netDebt;
  const value = equityValue / a.shares;
  return {
    value,
    upside: upsideOf(value, price),
    formula,
    projections,
    terminalValue,
    presentTerminalValue,
    enterpriseValue,
    equityValue,
    terminalShare: enterpriseValue > 0 ? presentTerminalValue / enterpriseValue : null,
    missing: a.baseFcf <= 0 ? "fluxo de caixa livre do ano-base negativo: resultado pouco significativo" : undefined,
  };
}

export interface DcfDefaults extends Partial<DcfAssumptions> {
  notes: Record<string, string>;
}

/**
 * Premissas iniciais (o usuário pode editar todas):
 * - FCF base: média de 3 anos de (caixa operacional − capex), suaviza anos atípicos.
 * - Crescimento: CAGR de receita de 5 anos, limitado entre 0% e 12%.
 * - Perpetuidade: IPCA 12 meses (crescimento real zero), entre 2% e 6%.
 * - Desconto: Selic + 3 p.p. de prêmio de risco.
 */
export function defaultDcfAssumptions(input: {
  annual: AnnualPoint[];
  revenueCagr5y: number | null;
  selic: number | null;
  ipca12m: number | null;
  netDebt: number | null;
  minority: number | null;
  shares: number | null;
}): DcfDefaults {
  const notes: Record<string, string> = {};
  const fcfs = input.annual
    .slice(-3)
    .map((a) =>
      a.values.operatingCashFlow !== undefined && a.values.capex !== undefined
        ? { year: a.year, fcf: a.values.operatingCashFlow - a.values.capex }
        : null,
    )
    .filter((x): x is { year: number; fcf: number } => x !== null);
  const baseFcf = fcfs.length ? fcfs.reduce((s, x) => s + x.fcf, 0) / fcfs.length : undefined;
  notes.baseFcf = fcfs.length
    ? `média de (caixa operacional − capex) em ${fcfs.map((f) => f.year).join(", ")}`
    : "sem fluxo de caixa operacional/capex nos últimos anos";

  const g = input.revenueCagr5y === null ? 0.05 : Math.min(0.12, Math.max(0, input.revenueCagr5y));
  notes.growthRate = input.revenueCagr5y === null ? "5% (sem histórico de 5 anos de receita)" : "CAGR de receita de 5 anos, limitado entre 0% e 12%";

  const tg = input.ipca12m === null ? 0.04 : Math.min(0.06, Math.max(0.02, input.ipca12m));
  notes.terminalGrowth = "IPCA 12 meses (crescimento real zero na perpetuidade), entre 2% e 6%";

  const dr = (input.selic ?? 0.1) + 0.03;
  notes.discountRate = input.selic === null ? "10% + 3 p.p. (sem Selic no banco)" : "Selic meta + 3 p.p. de prêmio de risco";

  return {
    baseFcf,
    growthRate: g,
    years: 5,
    terminalGrowth: tg,
    discountRate: dr,
    netDebt: input.netDebt === null ? undefined : input.netDebt + (input.minority ?? 0),
    shares: input.shares ?? undefined,
    notes,
  };
}

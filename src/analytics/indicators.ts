/**
 * Indicadores fundamentalistas.
 *
 * Cada indicador devolve o valor E a explicação: fórmula, entradas (com
 * período e fonte) e, se não puder ser calculado, o motivo. É isso que a
 * interface mostra no "ⓘ" e que a IA usa para citar os números.
 *
 * Convenções:
 * - Lucro = lucro atribuído aos controladores (exclui minoritários).
 * - Resultado e fluxo de caixa: últimos 12 meses (TTM).
 * - Balanço: data do último documento; médias usam o mesmo mês um ano antes.
 * - EBITDA = EBIT + depreciação/amortização (Resolução CVM 156, sem ajustes).
 * - Dívida bruta = empréstimos e financiamentos (inclui debêntures e
 *   arrendamentos quando a empresa os classifica nessa conta).
 */
import type { Layout } from "@/ingest/cvm/standardize";
import { addYears, buildAnnual, buildTtm, FinTable, type AnnualPoint, type FinRow, type MetricMap, type TtmResult } from "./periods";

export type IndicatorFormat = "multiple" | "percent" | "currency" | "perShare" | "number";

export interface IndicatorInput {
  label: string;
  value: number | null;
  format: IndicatorFormat;
  period?: string;
  source?: string;
}

export interface Indicator {
  key: string;
  label: string;
  group: "valuation" | "rentabilidade" | "margens" | "endividamento" | "dividendos" | "crescimento" | "tamanho";
  value: number | null;
  format: IndicatorFormat;
  formula: string;
  inputs: IndicatorInput[];
  period: string;
  /** false = não se aplica a este tipo de empresa (ex.: EBITDA de banco) */
  applicable: boolean;
  /** motivo quando value === null */
  missing?: string;
  note?: string;
}

export interface ShareInfo {
  periodEnd: string;
  ordinary: number | null;
  preferred: number | null;
  treasuryOrdinary: number | null;
  treasuryPreferred: number | null;
  /** fator de escala conferido (1 ou 1000); null = não conferido */
  scale: number | null;
}

export interface TickerQuote {
  ticker: string;
  shareClass: "ON" | "PN" | "UNIT" | string;
  close: number;
  date: string;
  /** valor de mercado da companhia informado pela brapi */
  marketCap: number | null;
  volume: number | null;
}

export interface DividendRecord {
  ticker: string;
  exDate: string;
  value: number;
  kind: string;
}

export interface CompanyInput {
  layout: Layout | null;
  rows: FinRow[];
  shares: ShareInfo | null;
  quotes: TickerQuote[];
  dividends: DividendRecord[];
  /** ticker principal (o mais negociado) — base do preço e do DY */
  ticker: string;
}

export interface CompanyAnalysis {
  ttm: TtmResult | null;
  annual: AnnualPoint[];
  price: { ticker: string; close: number; date: string } | null;
  sharesOutstanding: number | null;
  marketCap: { value: number; method: "calculado" | "brapi"; note: string } | null;
  indicators: Record<string, Indicator>;
  sources: { financials: string | null; price: string | null };
}

const CVM = "CVM";
const BRAPI = "brapi.dev";

const fmtDateBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Divisão segura: null se faltar dado ou denominador ≤ 0 quando exigido positivo. */
function div(a: number | null | undefined, b: number | null | undefined, requirePositiveDenominator = true): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (requirePositiveDenominator ? b <= 0 : b === 0) return null;
  return a / b;
}

const sumDefined = (...xs: Array<number | undefined>) =>
  xs.every((x) => x === undefined) ? undefined : xs.reduce<number>((s, x) => s + (x ?? 0), 0);

export function cagr(start: number | undefined, end: number | undefined, years: number): number | null {
  if (start === undefined || end === undefined || start <= 0 || end <= 0 || years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

/** Dívida bruta, caixa (caixa + aplicações de curto prazo) e dívida líquida. */
export function debtOf(v: MetricMap) {
  const grossDebt = sumDefined(v.shortTermDebt, v.longTermDebt);
  const cash = sumDefined(v.cash, v.shortTermInvestments);
  const netDebt = grossDebt !== undefined && cash !== undefined ? grossDebt - cash : undefined;
  return { grossDebt, cash, netDebt };
}

export const ebitdaOf = (v: MetricMap) =>
  v.ebit !== undefined && v.depreciationAmortization !== undefined ? v.ebit + v.depreciationAmortization : undefined;

/** Alíquota efetiva entre 0% e 34%; fora disso (prejuízo, créditos fiscais) usa 34%. */
export function effectiveTaxRate(v: MetricMap): number {
  if (v.pretaxIncome && v.pretaxIncome > 0 && v.incomeTax !== undefined) {
    const r = -v.incomeTax / v.pretaxIncome;
    if (r >= 0 && r <= 0.34) return r;
  }
  return 0.34;
}

/** Quantidade de ações em circulação (sem tesouraria), por classe, já na escala certa. */
export function outstandingShares(s: ShareInfo | null) {
  if (!s || !s.scale) return null;
  const on = Math.max(0, (s.ordinary ?? 0) - (s.treasuryOrdinary ?? 0)) * s.scale;
  const pn = Math.max(0, (s.preferred ?? 0) - (s.treasuryPreferred ?? 0)) * s.scale;
  return { on, pn, total: on + pn };
}

/** Valor de mercado: ações ON × preço ON + ações PN × preço PN; senão, o da brapi. */
export function marketCapOf(shares: ShareInfo | null, quotes: TickerQuote[]): CompanyAnalysis["marketCap"] {
  const out = outstandingShares(shares);
  const on = quotes.find((q) => q.shareClass === "ON");
  const pn = quotes.find((q) => q.shareClass === "PN");
  if (out && (on || pn)) {
    const pOn = on?.close ?? pn!.close;
    const pPn = pn?.close ?? on!.close;
    const value = out.on * pOn + out.pn * pPn;
    if (value > 0) {
      const approx = (out.on > 0 && !on) || (out.pn > 0 && !pn);
      return {
        value,
        method: "calculado",
        note: approx
          ? "ações em circulação × preço (uma das classes sem cotação própria usa o preço da outra)"
          : "ações em circulação × preço de cada classe",
      };
    }
  }
  const brapi = Math.max(0, ...quotes.map((q) => q.marketCap ?? 0));
  if (brapi > 0) return { value: brapi, method: "brapi", note: "valor de mercado informado pela brapi.dev" };
  return null;
}

const NOT_FOR_FINANCIALS = new Set([
  "evEbitda",
  "evEbit",
  "psr",
  "grossMargin",
  "ebitdaMargin",
  "ebitMargin",
  "roic",
  "netDebtEbitda",
  "netDebtEquity",
  "currentRatio",
  "ebitda",
  "netDebt",
  "ev",
]);

export function analyzeCompany(input: CompanyInput): CompanyAnalysis {
  const table = new FinTable(input.rows);
  const annual = buildAnnual(table);
  const ttm = buildTtm(table);
  const t = ttm?.values ?? {};
  const layout = input.layout ?? "standard";
  const isFinancial = layout !== "standard";

  const mainQuote = input.quotes.find((q) => q.ticker === input.ticker) ?? input.quotes[0] ?? null;
  const price = mainQuote ? { ticker: mainQuote.ticker, close: mainQuote.close, date: mainQuote.date } : null;
  const shares = outstandingShares(input.shares);
  const mcap = marketCapOf(input.shares, input.quotes);

  const finPeriod = ttm ? (ttm.kind === "ttm" ? `12 meses até ${fmtDateBr(ttm.end)}` : `ano até ${fmtDateBr(ttm.end)}`) : "—";
  const balPeriod = ttm ? `em ${fmtDateBr(ttm.end)}` : "—";
  const pricePeriod = price ? `fechamento de ${fmtDateBr(price.date)}` : "—";
  const finSource = ttm ? (ttm.kind === "ttm" ? `${CVM} (ITR + DFP: ${ttm.composition})` : `${CVM} (DFP)`) : CVM;

  // balanço de um ano antes, para médias
  const prevBal = ttm ? table.balance(addYears(ttm.end, -1)) ?? {} : {};
  const avg = (a: number | undefined, b: number | undefined) =>
    a === undefined ? undefined : b === undefined ? a : (a + b) / 2;

  const { grossDebt, cash, netDebt } = debtOf(t);
  const ebitda = ebitdaOf(t);
  const ev =
    mcap && netDebt !== undefined ? mcap.value + netDebt + (t.minorityInterest ?? 0) : undefined;
  const ni = t.netIncomeParent;
  const equityParent = t.equityParent;

  const indicators: Record<string, Indicator> = {};
  const add = (ind: Omit<Indicator, "applicable"> & { applicable?: boolean }) => {
    const applicable = ind.applicable ?? !(isFinancial && NOT_FOR_FINANCIALS.has(ind.key));
    const value = applicable && ind.value !== null && Number.isFinite(ind.value) ? ind.value : null;
    let missing = ind.missing;
    if (!applicable) missing = `não se aplica a ${layout === "bank" ? "bancos" : "seguradoras"}`;
    else if (value === null && !missing) {
      const absent = ind.inputs.filter((i) => i.value === null).map((i) => i.label);
      missing = absent.length ? `falta: ${absent.join(", ")}` : "não calculável (denominador zero ou negativo)";
    }
    indicators[ind.key] = { ...ind, value, applicable, missing };
  };

  const inMcap: IndicatorInput = {
    label: "Valor de mercado",
    value: mcap?.value ?? null,
    format: "currency",
    period: pricePeriod,
    source: mcap?.method === "brapi" ? BRAPI : `${BRAPI} (preço) + ${CVM} (nº de ações)`,
  };
  const fin = (label: string, value: number | undefined | null, period = finPeriod): IndicatorInput => ({
    label,
    value: value ?? null,
    format: "currency",
    period,
    source: finSource,
  });
  const bal = (label: string, value: number | undefined | null) => fin(label, value, balPeriod);

  // ── tamanho ──
  add({ key: "marketCap", label: "Valor de mercado", group: "tamanho", value: mcap?.value ?? null, format: "currency", formula: mcap?.note ?? "ações em circulação × preço", inputs: [inMcap], period: pricePeriod });
  add({ key: "ev", label: "Valor da firma (EV)", group: "tamanho", value: ev ?? null, format: "currency", formula: "Valor de mercado + dívida líquida + minoritários", inputs: [inMcap, bal("Dívida líquida", netDebt), bal("Participação de minoritários", t.minorityInterest ?? 0)], period: balPeriod });
  add({ key: "ebitda", label: "EBITDA (12m)", group: "tamanho", value: ebitda ?? null, format: "currency", formula: "EBIT + depreciação e amortização", inputs: [fin("EBIT", t.ebit), fin("Depreciação e amortização", t.depreciationAmortization)], period: finPeriod });
  add({ key: "netDebt", label: "Dívida líquida", group: "endividamento", value: netDebt ?? null, format: "currency", formula: "Empréstimos e financiamentos (CP + LP) − caixa − aplicações financeiras de curto prazo", inputs: [bal("Dívida bruta", grossDebt), bal("Caixa e aplicações", cash)], period: balPeriod });

  // ── por ação ──
  const lpa = shares ? div(ni, shares.total, true) : null;
  const vpa = shares ? div(equityParent, shares.total, true) : null;
  const inShares: IndicatorInput = { label: "Ações em circulação", value: shares?.total ?? null, format: "number", period: input.shares ? `em ${fmtDateBr(input.shares.periodEnd)}` : undefined, source: `${CVM} (composição do capital)` };
  const sharesMissing = input.shares && !input.shares.scale ? "quantidade de ações não conferida contra o valor de mercado" : undefined;
  add({ key: "lpa", label: "LPA (12m)", group: "valuation", value: lpa, format: "perShare", formula: "Lucro líquido dos controladores ÷ ações em circulação", inputs: [fin("Lucro líquido (controladores)", ni), inShares], period: finPeriod, missing: shares ? undefined : sharesMissing });
  add({ key: "vpa", label: "VPA", group: "valuation", value: vpa, format: "perShare", formula: "Patrimônio líquido dos controladores ÷ ações em circulação", inputs: [bal("Patrimônio líquido (controladores)", equityParent), inShares], period: balPeriod, missing: shares ? undefined : sharesMissing });

  // ── valuation ──
  add({ key: "pl", label: "P/L", group: "valuation", value: div(mcap?.value, ni), format: "multiple", formula: "Valor de mercado ÷ lucro líquido dos controladores (12m)", inputs: [inMcap, fin("Lucro líquido (controladores)", ni)], period: finPeriod, note: ni !== undefined && ni <= 0 ? "lucro negativo: P/L não tem significado" : undefined });
  add({ key: "pvp", label: "P/VP", group: "valuation", value: div(mcap?.value, equityParent), format: "multiple", formula: "Valor de mercado ÷ patrimônio líquido dos controladores", inputs: [inMcap, bal("Patrimônio líquido (controladores)", equityParent)], period: balPeriod });
  add({ key: "evEbitda", label: "EV/EBITDA", group: "valuation", value: div(ev, ebitda), format: "multiple", formula: "Valor da firma ÷ EBITDA (12m)", inputs: [{ label: "EV", value: ev ?? null, format: "currency", period: balPeriod }, fin("EBITDA", ebitda)], period: finPeriod });
  add({ key: "evEbit", label: "EV/EBIT", group: "valuation", value: div(ev, t.ebit), format: "multiple", formula: "Valor da firma ÷ EBIT (12m)", inputs: [{ label: "EV", value: ev ?? null, format: "currency", period: balPeriod }, fin("EBIT", t.ebit)], period: finPeriod });
  add({ key: "psr", label: "P/Receita", group: "valuation", value: div(mcap?.value, t.revenue), format: "multiple", formula: "Valor de mercado ÷ receita líquida (12m)", inputs: [inMcap, fin("Receita líquida", t.revenue)], period: finPeriod });

  // ── rentabilidade ──
  const avgEquity = avg(equityParent, prevBal.equityParent);
  add({ key: "roe", label: "ROE", group: "rentabilidade", value: div(ni, avgEquity), format: "percent", formula: "Lucro líquido dos controladores (12m) ÷ patrimônio líquido médio (atual e 12 meses antes)", inputs: [fin("Lucro líquido (controladores)", ni), bal("PL médio (controladores)", avgEquity)], period: finPeriod });
  const taxRate = effectiveTaxRate(t);
  const nopat = t.ebit !== undefined ? t.ebit * (1 - taxRate) : undefined;
  const prevDebt = debtOf(prevBal);
  const investedNow = t.equity !== undefined && netDebt !== undefined ? t.equity + netDebt : undefined;
  const investedPrev = prevBal.equity !== undefined && prevDebt.netDebt !== undefined ? prevBal.equity + prevDebt.netDebt : undefined;
  const avgInvested = avg(investedNow, investedPrev);
  add({ key: "roic", label: "ROIC", group: "rentabilidade", value: div(nopat, avgInvested), format: "percent", formula: `EBIT × (1 − alíquota efetiva ${(taxRate * 100).toFixed(0)}%) ÷ capital investido médio (patrimônio líquido + dívida líquida)`, inputs: [fin("EBIT", t.ebit), bal("Capital investido médio", avgInvested)], period: finPeriod });
  const avgAssets = avg(t.totalAssets, prevBal.totalAssets);
  add({ key: "roa", label: "ROA", group: "rentabilidade", value: div(ni, avgAssets), format: "percent", formula: "Lucro líquido dos controladores (12m) ÷ ativo total médio", inputs: [fin("Lucro líquido (controladores)", ni), bal("Ativo total médio", avgAssets)], period: finPeriod });

  // ── margens ──
  const rev = t.revenue;
  add({ key: "grossMargin", label: "Margem bruta", group: "margens", value: div(t.grossProfit, rev), format: "percent", formula: "Lucro bruto ÷ receita líquida", inputs: [fin("Lucro bruto", t.grossProfit), fin("Receita líquida", rev)], period: finPeriod });
  add({ key: "ebitdaMargin", label: "Margem EBITDA", group: "margens", value: div(ebitda, rev), format: "percent", formula: "EBITDA ÷ receita líquida", inputs: [fin("EBITDA", ebitda), fin("Receita líquida", rev)], period: finPeriod });
  add({ key: "ebitMargin", label: "Margem EBIT", group: "margens", value: div(t.ebit, rev), format: "percent", formula: "EBIT ÷ receita líquida", inputs: [fin("EBIT", t.ebit), fin("Receita líquida", rev)], period: finPeriod });
  add({ key: "netMargin", label: "Margem líquida", group: "margens", value: isFinancial ? null : div(ni, rev), applicable: !isFinancial, format: "percent", formula: "Lucro líquido dos controladores ÷ receita líquida", inputs: [fin("Lucro líquido (controladores)", ni), fin("Receita líquida", rev)], period: finPeriod });

  // ── endividamento ──
  add({ key: "netDebtEbitda", label: "Dívida líquida/EBITDA", group: "endividamento", value: ebitda !== undefined && ebitda > 0 && netDebt !== undefined ? netDebt / ebitda : null, format: "multiple", formula: "Dívida líquida ÷ EBITDA (12m); negativo = caixa líquido", inputs: [bal("Dívida líquida", netDebt), fin("EBITDA", ebitda)], period: finPeriod });
  add({ key: "netDebtEquity", label: "Dívida líquida/PL", group: "endividamento", value: div(netDebt, t.equity), format: "multiple", formula: "Dívida líquida ÷ patrimônio líquido total", inputs: [bal("Dívida líquida", netDebt), bal("Patrimônio líquido", t.equity)], period: balPeriod });
  add({ key: "currentRatio", label: "Liquidez corrente", group: "endividamento", value: div(t.currentAssets, t.currentLiabilities), format: "multiple", formula: "Ativo circulante ÷ passivo circulante", inputs: [bal("Ativo circulante", t.currentAssets), bal("Passivo circulante", t.currentLiabilities)], period: balPeriod });

  // ── dividendos ──
  const dyInfo = dividendYield(input, mainQuote);
  add({ key: "dy", label: "Dividend yield (12m)", group: "dividendos", value: dyInfo.value, format: "percent", formula: dyInfo.formula, inputs: dyInfo.inputs, period: dyInfo.period, note: dyInfo.note });
  add({ key: "payout", label: "Payout (12m)", group: "dividendos", value: ni !== undefined && ni > 0 ? div(t.dividendsPaid, ni) : null, format: "percent", formula: "Dividendos e JCP pagos (fluxo de caixa, 12m) ÷ lucro líquido dos controladores (12m)", inputs: [fin("Dividendos e JCP pagos", t.dividendsPaid), fin("Lucro líquido (controladores)", ni)], period: finPeriod, note: "Usa o valor efetivamente pago no período, que pode se referir a lucros de anos anteriores." });

  // ── crescimento (5 anos, exercícios completos) ──
  const last = annual.at(-1);
  const base = last ? annual.find((a) => a.year === last.year - 5) : undefined;
  const growthPeriod = last && base ? `${base.year}–${last.year}` : "5 anos";
  add({ key: "revenueCagr5y", label: "CAGR receita (5 anos)", group: "crescimento", value: cagr(base?.values.revenue, last?.values.revenue, 5), format: "percent", formula: "(Receita do último ano ÷ receita de 5 anos antes)^(1/5) − 1", inputs: [fin(`Receita ${base?.year ?? "—"}`, base?.values.revenue, String(base?.year ?? "")), fin(`Receita ${last?.year ?? "—"}`, last?.values.revenue, String(last?.year ?? ""))], period: growthPeriod, missing: !base ? "menos de 6 exercícios completos disponíveis" : undefined });
  add({ key: "earningsCagr5y", label: "CAGR lucro (5 anos)", group: "crescimento", value: cagr(base?.values.netIncomeParent, last?.values.netIncomeParent, 5), format: "percent", formula: "(Lucro do último ano ÷ lucro de 5 anos antes)^(1/5) − 1", inputs: [fin(`Lucro ${base?.year ?? "—"}`, base?.values.netIncomeParent, String(base?.year ?? "")), fin(`Lucro ${last?.year ?? "—"}`, last?.values.netIncomeParent, String(last?.year ?? ""))], period: growthPeriod, missing: !base ? "menos de 6 exercícios completos disponíveis" : (base.values.netIncomeParent ?? 0) <= 0 || (last?.values.netIncomeParent ?? 0) <= 0 ? "lucro negativo em uma das pontas: CAGR não tem significado" : undefined });

  return {
    ttm,
    annual,
    price,
    sharesOutstanding: shares?.total ?? null,
    marketCap: mcap,
    indicators,
    sources: {
      financials: ttm ? finSource : null,
      price: price ? `${BRAPI} — ${pricePeriod}` : null,
    },
  };
}

/**
 * Dividend yield de 12 meses. Preferência: proventos por ação do ticker
 * (brapi, por data ex). Sem eles: dividendos pagos na DFC ÷ valor de mercado.
 */
function dividendYield(input: CompanyInput, q: TickerQuote | null) {
  if (q) {
    const since = addYears(q.date, -1);
    const own = input.dividends.filter((d) => d.ticker === q.ticker && d.exDate > since && d.exDate <= q.date);
    const hasAnyHistory = input.dividends.some((d) => d.ticker === q.ticker);
    if (hasAnyHistory) {
      const dps = own.reduce((s, d) => s + d.value, 0);
      return {
        value: dps / q.close,
        formula: "Proventos por ação com data ex nos últimos 12 meses ÷ preço",
        inputs: [
          { label: "Proventos por ação (12m)", value: dps, format: "perShare" as const, period: `data ex de ${fmtDateBr(since)} a ${fmtDateBr(q.date)}`, source: BRAPI },
          { label: `Preço ${q.ticker}`, value: q.close, format: "perShare" as const, period: `fechamento de ${fmtDateBr(q.date)}`, source: BRAPI },
        ],
        period: `12 meses até ${fmtDateBr(q.date)}`,
        note: undefined as string | undefined,
      };
    }
  }
  // fallback pelo fluxo de caixa
  const table = new FinTable(input.rows);
  const ttm = buildTtm(table);
  const paid = ttm?.values.dividendsPaid;
  const mcap = marketCapOf(input.shares, input.quotes);
  return {
    value: paid !== undefined && mcap ? paid / mcap.value : null,
    formula: "Dividendos e JCP pagos (fluxo de caixa, 12m) ÷ valor de mercado",
    inputs: [
      { label: "Dividendos e JCP pagos (12m)", value: paid ?? null, format: "currency" as const, period: ttm ? `12 meses até ${fmtDateBr(ttm.end)}` : undefined, source: CVM },
      { label: "Valor de mercado", value: mcap?.value ?? null, format: "currency" as const, source: BRAPI },
    ],
    period: ttm ? `12 meses até ${fmtDateBr(ttm.end)}` : "—",
    note: "Estimado pelo fluxo de caixa (sem histórico de proventos por ação). Configure o token da brapi para o cálculo por data ex.",
  };
}

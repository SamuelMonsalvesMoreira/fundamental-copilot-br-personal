/**
 * Projeções do usuário: lucro, lucro por ação e dividendos futuros.
 *
 * Os pontos de partida vêm dos dados reais (lucro de 12 meses, ações em
 * circulação, preço), mas tudo daqui para a frente é PREMISSA: nada aqui é
 * dado oficial nem previsão do app. Funções puras, sem acesso ao banco.
 */
import { z } from "zod";

const overrideSchema = z.object({
  netIncome: z.number().finite().optional(),
  payout: z.number().min(0).max(2).optional(),
});

export const assumptionsSchema = z.object({
  mode: z.enum(["lucro", "receita"]),
  years: z.number().int().min(1).max(10),
  /** crescimento anual do lucro (modo lucro) ou da receita (modo receita) */
  growth: z.number().min(-0.9).max(2),
  /** margem líquida usada no modo receita */
  netMargin: z.number().min(-1).max(1),
  payout: z.number().min(0).max(2),
  /** P/L de saída para estimar o preço no último ano; null = não estimar */
  exitPl: z.number().min(0).max(200).nullable(),
  /** valores digitados ano a ano; a chave é o ano da projeção (1, 2, ...) */
  overrides: z.record(z.string().regex(/^\d{1,2}$/), overrideSchema),
});

export type ProjectionAssumptions = z.infer<typeof assumptionsSchema>;

export interface ProjectionBase {
  /** lucro dos controladores de 12 meses (R$) */
  netIncome: number | null;
  revenue: number | null;
  shares: number | null;
  price: number | null;
  /** fim do período-base (AAAA-MM-DD) */
  baseEnd: string | null;
}

export interface ProjectionRow {
  year: number;
  end: string | null;
  revenue: number | null;
  netIncome: number;
  netIncomeOverridden: boolean;
  growth: number | null;
  eps: number | null;
  payout: number;
  payoutOverridden: boolean;
  dividends: number;
  dps: number | null;
  yieldOnPrice: number | null;
  yieldOnCost: number | null;
  impliedPl: number | null;
}

export interface ProjectionResult {
  rows: ProjectionRow[];
  totalDividends: number;
  cumulativeDps: number | null;
  exitPrice: number | null;
  totalReturn: number | null;
  annualizedReturn: number | null;
  missing: string[];
}

function nextEnd(baseEnd: string | null, year: number): string | null {
  if (!baseEnd) return null;
  const y = Number(baseEnd.slice(0, 4)) + year;
  const rest = baseEnd.slice(4);
  return `${y}${rest === "-02-29" ? "-02-28" : rest}`;
}

export function projectEarnings(
  base: ProjectionBase,
  a: ProjectionAssumptions,
  opts: { avgCost?: number | null; growthDelta?: number } = {},
): ProjectionResult {
  const growth = a.growth + (opts.growthDelta ?? 0);
  const rows: ProjectionRow[] = [];
  const missing: string[] = [];
  if (a.mode === "lucro" && base.netIncome === null) missing.push("lucro-base indisponível");
  if (a.mode === "receita" && base.revenue === null) missing.push("receita-base indisponível");
  if (base.shares === null) missing.push("quantidade de ações não conferida: valores por ação indisponíveis");
  if (base.price === null) missing.push("sem cotação: rendimento e retorno indisponíveis");

  let prevIncome = base.netIncome;
  let revenue = base.revenue;
  const perShare = (v: number) => (base.shares && base.shares > 0 ? v / base.shares : null);

  for (let year = 1; year <= a.years; year++) {
    const o = a.overrides[String(year)];
    revenue = revenue === null ? null : revenue * (1 + growth);

    let computed: number | null;
    if (a.mode === "receita") computed = revenue === null ? null : revenue * a.netMargin;
    // crescimento sobre lucro negativo não tem significado: mantém o valor
    else computed = prevIncome === null ? null : prevIncome > 0 ? prevIncome * (1 + growth) : prevIncome;

    const netIncome = o?.netIncome ?? computed;
    if (netIncome === null) {
      prevIncome = null;
      continue;
    }
    const payout = o?.payout ?? a.payout;
    // prejuízo não distribui dividendo
    const dividends = Math.max(0, netIncome) * payout;
    const eps = perShare(netIncome);
    const dps = perShare(dividends);
    rows.push({
      year,
      end: nextEnd(base.baseEnd, year),
      revenue: a.mode === "receita" ? revenue : null,
      netIncome,
      netIncomeOverridden: o?.netIncome !== undefined,
      growth: prevIncome !== null && prevIncome > 0 ? netIncome / prevIncome - 1 : null,
      eps,
      payout,
      payoutOverridden: o?.payout !== undefined,
      dividends,
      dps,
      yieldOnPrice: dps !== null && base.price ? dps / base.price : null,
      yieldOnCost: dps !== null && opts.avgCost ? dps / opts.avgCost : null,
      impliedPl: eps !== null && eps > 0 && base.price ? base.price / eps : null,
    });
    prevIncome = netIncome;
  }

  const last = rows.at(-1);
  const hasDps = rows.length > 0 && rows.every((r) => r.dps !== null);
  const cumulativeDps = hasDps ? rows.reduce((s, r) => s + (r.dps ?? 0), 0) : null;
  const exitPrice = last && a.exitPl && last.eps !== null && last.eps > 0 ? last.eps * a.exitPl : null;

  let totalReturn: number | null = null;
  let annualizedReturn: number | null = null;
  if (exitPrice !== null && cumulativeDps !== null && base.price && last) {
    totalReturn = (exitPrice + cumulativeDps) / base.price - 1;
    // não reinveste dividendos: visão simples, ponta a ponta
    annualizedReturn = Math.pow(1 + totalReturn, 1 / last.year) - 1;
  }

  return {
    rows,
    totalDividends: rows.reduce((s, r) => s + r.dividends, 0),
    cumulativeDps,
    exitPrice,
    totalReturn,
    annualizedReturn,
    missing,
  };
}

export const SCENARIOS = [
  { id: "pessimista", label: "Pessimista", delta: -0.05 },
  { id: "base", label: "Base", delta: 0 },
  { id: "otimista", label: "Otimista", delta: 0.05 },
] as const;

export interface DefaultsInput {
  annual: Array<{ netIncome: number | null; dividendsPaid: number | null; revenue: number | null }>;
  earningsCagr5y: number | null;
  revenueCagr5y: number | null;
  ttmPayout: number | null;
  currentPl: number | null;
  ipca12m: number | null;
  ttmNetMargin: number | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Premissas iniciais, cada uma com a explicação de onde saiu. */
export function defaultAssumptions(i: DefaultsInput): { assumptions: ProjectionAssumptions; notes: Record<string, string> } {
  const notes: Record<string, string> = {};

  let growth: number;
  if (i.earningsCagr5y !== null) {
    growth = clamp(i.earningsCagr5y, 0, 0.12);
    notes.growth = "CAGR de lucro de 5 anos, limitado entre 0% e 12%";
  } else if (i.revenueCagr5y !== null) {
    growth = clamp(i.revenueCagr5y, 0, 0.12);
    notes.growth = "CAGR de receita de 5 anos (sem CAGR de lucro), limitado entre 0% e 12%";
  } else {
    growth = i.ipca12m === null ? 0.04 : clamp(i.ipca12m, 0, 0.12);
    notes.growth = "IPCA de 12 meses (sem histórico de 5 anos)";
  }

  const ratios = i.annual
    .slice(-3)
    .filter((p) => p.netIncome !== null && p.netIncome > 0 && p.dividendsPaid !== null)
    .map((p) => (p.dividendsPaid as number) / (p.netIncome as number));
  let payout: number;
  if (ratios.length) {
    payout = clamp(ratios.reduce((s, x) => s + x, 0) / ratios.length, 0, 1);
    notes.payout = `média de dividendos pagos ÷ lucro em ${ratios.length} ano(s), limitada a 100%`;
  } else if (i.ttmPayout !== null) {
    payout = clamp(i.ttmPayout, 0, 1);
    notes.payout = "payout dos últimos 12 meses, limitado a 100%";
  } else {
    payout = 0.25;
    notes.payout = "25%, o dividendo mínimo legal usual (sem histórico de pagamentos)";
  }

  const validPl = i.currentPl !== null && i.currentPl > 0 && i.currentPl <= 40;
  notes.exitPl = validPl ? "P/L atual (múltiplo constante)" : "P/L atual indisponível ou fora de 0–40x: informe o seu";
  notes.netMargin = i.ttmNetMargin === null ? "sem margem de 12 meses: informe a sua" : "margem líquida dos últimos 12 meses";

  return {
    assumptions: {
      mode: "lucro",
      years: 5,
      growth: Number(growth.toFixed(4)),
      netMargin: Number((i.ttmNetMargin ?? 0.1).toFixed(4)),
      payout: Number(payout.toFixed(4)),
      exitPl: validPl ? Number((i.currentPl as number).toFixed(2)) : null,
      overrides: {},
    },
    notes,
  };
}

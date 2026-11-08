/**
 * Períodos: anual (DFP), últimos 12 meses (TTM) e trimestral (3 meses).
 *
 * As contas de resultado e de fluxo de caixa chegam como "acumulado no ano"
 * (YTD). Para os últimos 12 meses:
 *
 *     TTM = acumulado do ano atual + último ano fechado − mesmo acumulado do ano anterior
 *
 * Ex.: TTM até 30/09/2026 = 9M26 + ano de 2025 − 9M25.
 * Se faltar qualquer parcela, a conta fica sem valor (nunca estimamos).
 */
import type { Metric } from "@/ingest/cvm/standardize";

export interface FinRow {
  metric: Metric;
  periodStart: string; // '' para saldos de balanço
  periodEnd: string;
  value: number;
  doc: "DFP" | "ITR";
  origin?: string;
}

export type MetricMap = Partial<Record<Metric, number>>;

export const FLOW_METRICS: Metric[] = [
  "revenue",
  "costOfRevenue",
  "grossProfit",
  "ebit",
  "financialResult",
  "pretaxIncome",
  "incomeTax",
  "netIncome",
  "netIncomeParent",
  "depreciationAmortization",
  "operatingCashFlow",
  "investingCashFlow",
  "financingCashFlow",
  "capex",
  "dividendsPaid",
];

const isFlow = (m: Metric) => FLOW_METRICS.includes(m);

// ─── datas ───────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** Soma anos a uma data ISO (29/02 vira 28/02). */
export function addYears(iso: string, years: number): string {
  const y = Number(iso.slice(0, 4)) + years;
  let md = iso.slice(4);
  if (md === "-02-29") md = "-02-28";
  return `${y}${md}`;
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);
}

/** Mesmo dia/mês, tolerando fim de mês (28/02 ~ 29/02). */
const sameDate = (a: string, b: string) => a === b || Math.abs(daysBetween(a, b)) <= 1;

// ─── estrutura de consulta ───────────────────────────────────────────────────

export class FinTable {
  /** fluxos: `${start}|${end}` → valores; balanço: end → valores */
  readonly flows = new Map<string, MetricMap>();
  readonly balances = new Map<string, MetricMap>();
  readonly origins = new Map<string, string>();

  constructor(rows: FinRow[]) {
    for (const r of rows) {
      if (isFlow(r.metric) && r.periodStart) {
        const k = `${r.periodStart}|${r.periodEnd}`;
        const m = this.flows.get(k) ?? {};
        m[r.metric] = r.value;
        this.flows.set(k, m);
      } else if (!r.periodStart) {
        const m = this.balances.get(r.periodEnd) ?? {};
        m[r.metric] = r.value;
        this.balances.set(r.periodEnd, m);
      }
      if (r.origin) this.origins.set(`${r.metric}|${r.periodStart}|${r.periodEnd}`, r.origin);
    }
  }

  flow(start: string, end: string): MetricMap | undefined {
    const exact = this.flows.get(`${start}|${end}`);
    if (exact) return exact;
    for (const [k, v] of this.flows) {
      const [s, e] = k.split("|");
      if (sameDate(s, start) && sameDate(e, end)) return v;
    }
    return undefined;
  }

  balance(end: string): MetricMap | undefined {
    const exact = this.balances.get(end);
    if (exact) return exact;
    for (const [e, v] of this.balances) if (sameDate(e, end)) return v;
    return undefined;
  }

  /** Períodos de fluxo com ~12 meses (exercícios completos), mais recente primeiro. */
  fiscalYears(): Array<{ start: string; end: string }> {
    return [...this.flows.keys()]
      .map((k) => {
        const [start, end] = k.split("|");
        return { start, end };
      })
      .filter((p) => {
        const d = daysBetween(p.start, p.end);
        return d >= 360 && d <= 371;
      })
      .sort((a, b) => b.end.localeCompare(a.end));
  }

  /** Período acumulado mais recente (o mais longo, entre os que terminam na data mais nova). */
  latestYtd(): { start: string; end: string } | null {
    let best: { start: string; end: string } | null = null;
    for (const k of this.flows.keys()) {
      const [start, end] = k.split("|");
      if (!this.flows.get(k)?.revenue && this.flows.get(k)?.netIncome === undefined) continue;
      if (!best || end > best.end || (end === best.end && start < best.start)) best = { start, end };
    }
    return best;
  }
}

// ─── séries ──────────────────────────────────────────────────────────────────

export interface AnnualPoint {
  /** ano do fim do exercício */
  year: number;
  start: string;
  end: string;
  values: MetricMap;
}

/** Exercícios completos com resultado + balanço do fim do exercício. */
export function buildAnnual(t: FinTable): AnnualPoint[] {
  return t
    .fiscalYears()
    .map(({ start, end }) => ({
      year: Number(end.slice(0, 4)),
      start,
      end,
      values: { ...(t.balance(end) ?? {}), ...(t.flow(start, end) ?? {}) },
    }))
    .sort((a, b) => a.year - b.year);
}

export interface TtmResult {
  /** fim do período mais recente */
  end: string;
  /** "anual" quando o último dado é a própria DFP; "ttm" quando combina ITR + DFP */
  kind: "annual" | "ttm";
  /** descrição legível da composição, ex.: "9M26 + 2025 − 9M25" */
  composition: string;
  values: MetricMap;
}

const shortPeriod = (start: string, end: string) => {
  const months = Math.round(daysBetween(start, end) / 30.4);
  return `${months}M${end.slice(2, 4)}`;
};

export function buildTtm(t: FinTable): TtmResult | null {
  const ytd = t.latestYtd();
  if (!ytd) return null;
  const balance = t.balance(ytd.end) ?? {};
  const len = daysBetween(ytd.start, ytd.end);

  if (len >= 360) {
    return {
      end: ytd.end,
      kind: "annual",
      composition: `exercício encerrado em ${ytd.end}`,
      values: { ...balance, ...(t.flow(ytd.start, ytd.end) ?? {}) },
    };
  }

  const cur = t.flow(ytd.start, ytd.end) ?? {};
  const prevFyEnd = addDays(ytd.start, -1);
  const prevFy = t.fiscalYears().find((p) => sameDate(p.end, prevFyEnd));
  const prevFyValues = prevFy ? t.flow(prevFy.start, prevFy.end) : undefined;
  const prevYtd = t.flow(addYears(ytd.start, -1), addYears(ytd.end, -1));

  const values: MetricMap = { ...balance };
  for (const m of FLOW_METRICS) {
    const a = cur[m];
    const b = prevFyValues?.[m];
    const c = prevYtd?.[m];
    if (a !== undefined && b !== undefined && c !== undefined) values[m] = a + b - c;
  }
  return {
    end: ytd.end,
    kind: "ttm",
    composition: `${shortPeriod(ytd.start, ytd.end)} + ${prevFyEnd.slice(0, 4)} − ${shortPeriod(addYears(ytd.start, -1), addYears(ytd.end, -1))}`,
    values,
  };
}

export interface QuarterPoint {
  start: string;
  end: string;
  label: string; // "3T26"
  values: MetricMap;
}

/**
 * Trimestres de 3 meses: usa o valor trimestral publicado quando existe
 * (DRE do ITR); senão, diferença entre acumulados (sempre para o 4º tri e a DFC).
 */
export function buildQuarterly(t: FinTable, maxQuarters = 20): QuarterPoint[] {
  const ends = new Set<string>();
  for (const k of t.flows.keys()) ends.add(k.split("|")[1]);
  const sortedEnds = [...ends].sort().reverse();
  const out: QuarterPoint[] = [];

  for (const end of sortedEnds) {
    if (out.length >= maxQuarters) break;
    // início do exercício que contém esse fim
    const ytdKey = [...t.flows.keys()]
      .map((k) => k.split("|"))
      .filter(([, e]) => e === end)
      .sort(([a], [b]) => a.localeCompare(b))[0];
    if (!ytdKey) continue;
    const [fyStart] = ytdKey;
    const ytd = t.flow(fyStart, end)!;
    const qStart = addDays(addMonths(end, -3), 1);
    const direct = t.flow(qStart, end);
    const prevEnd = addDays(qStart, -1);
    const prevYtd = prevEnd < fyStart ? {} : t.flow(fyStart, prevEnd);

    const values: MetricMap = {};
    for (const m of FLOW_METRICS) {
      if (direct?.[m] !== undefined) values[m] = direct[m];
      else if (ytd[m] !== undefined && prevYtd && (prevEnd < fyStart || prevYtd[m] !== undefined)) {
        values[m] = ytd[m]! - (prevEnd < fyStart ? 0 : prevYtd[m]!);
      }
    }
    if (Object.keys(values).length === 0) continue;
    const q = quarterOf(end, fyStart);
    out.push({ start: qStart, end, label: `${q}T${end.slice(2, 4)}`, values: { ...(t.balance(end) ?? {}), ...values } });
  }
  return out.reverse();
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

function quarterOf(end: string, fyStart: string): number {
  return Math.min(4, Math.max(1, Math.round(daysBetween(fyStart, end) / 91.3)));
}

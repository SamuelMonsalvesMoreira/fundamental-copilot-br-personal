/**
 * Screener: filtros sobre os indicadores pré-calculados (company_snapshots).
 *
 * Regras:
 * - Empresa sem o dado NÃO passa num filtro sobre aquele dado (nunca
 *   tratamos ausente como zero).
 * - Múltiplos de preço (P/L, P/VP, EV/EBITDA) negativos não passam em
 *   filtros de "máximo": P/L < 10 não deve trazer empresa com prejuízo.
 */

export interface ScreenerRow {
  cnpj: string;
  ticker: string;
  name: string;
  sector: string;
  layout: string | null;
  price: number | null;
  priceDate: string | null;
  financialsEnd: string | null;
  marketCap: number | null;
  /** volume financeiro do último pregão (R$) */
  liquidity: number | null;
  pl: number | null;
  pvp: number | null;
  evEbitda: number | null;
  roe: number | null;
  roic: number | null;
  netMargin: number | null;
  ebitdaMargin: number | null;
  netDebtEbitda: number | null;
  dy: number | null;
  payout: number | null;
  revenueCagr5y: number | null;
  earningsCagr5y: number | null;
}

export type NumericField = Exclude<
  keyof ScreenerRow,
  "cnpj" | "ticker" | "name" | "sector" | "layout" | "priceDate" | "financialsEnd" | "price"
>;

export interface FieldDef {
  key: NumericField;
  label: string;
  /** como o usuário digita: "percent" = 15 significa 15% */
  unit: "percent" | "multiple" | "currency";
  /** múltiplo de preço: valores ≤ 0 não passam em filtros de máximo */
  priceMultiple?: boolean;
}

export const FIELDS: FieldDef[] = [
  { key: "pl", label: "P/L", unit: "multiple", priceMultiple: true },
  { key: "pvp", label: "P/VP", unit: "multiple", priceMultiple: true },
  { key: "evEbitda", label: "EV/EBITDA", unit: "multiple", priceMultiple: true },
  { key: "dy", label: "Dividend yield", unit: "percent" },
  { key: "roe", label: "ROE", unit: "percent" },
  { key: "roic", label: "ROIC", unit: "percent" },
  { key: "netMargin", label: "Margem líquida", unit: "percent" },
  { key: "ebitdaMargin", label: "Margem EBITDA", unit: "percent" },
  { key: "netDebtEbitda", label: "Dív. líq./EBITDA", unit: "multiple" },
  { key: "payout", label: "Payout", unit: "percent" },
  { key: "revenueCagr5y", label: "CAGR receita 5a", unit: "percent" },
  { key: "earningsCagr5y", label: "CAGR lucro 5a", unit: "percent" },
  { key: "marketCap", label: "Valor de mercado", unit: "currency" },
  { key: "liquidity", label: "Liquidez diária", unit: "currency" },
];

export const fieldDef = (k: NumericField) => FIELDS.find((f) => f.key === k)!;

/** Filtro como o usuário digita (percentuais em %, valores em R$ milhões). */
export interface Filter {
  field: NumericField;
  min?: number | null;
  max?: number | null;
}

/** Converte o número digitado para a unidade interna (fração / R$). */
export function toInternal(field: NumericField, v: number): number {
  const u = fieldDef(field).unit;
  if (u === "percent") return v / 100;
  if (u === "currency") return v * 1e6;
  return v;
}

export function passes(row: ScreenerRow, f: Filter): boolean {
  const v = row[f.field];
  if (v === null || v === undefined || !Number.isFinite(v)) return false;
  const def = fieldDef(f.field);
  if (f.min !== null && f.min !== undefined && v < toInternal(f.field, f.min)) return false;
  if (f.max !== null && f.max !== undefined) {
    if (def.priceMultiple && v <= 0) return false;
    if (v > toInternal(f.field, f.max)) return false;
  }
  return true;
}

export interface ScreenerQuery {
  filters: Filter[];
  sector?: string | null;
  excludeFinancials?: boolean;
  sort?: { field: NumericField; dir: "asc" | "desc" };
}

export function applyScreener(rows: ScreenerRow[], q: ScreenerQuery): ScreenerRow[] {
  const active = q.filters.filter((f) => (f.min ?? null) !== null || (f.max ?? null) !== null);
  const out = rows.filter(
    (r) =>
      (!q.sector || r.sector === q.sector) &&
      (!q.excludeFinancials || r.layout === "standard" || r.layout === null) &&
      active.every((f) => passes(r, f)),
  );
  if (q.sort) {
    const { field, dir } = q.sort;
    const s = dir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const x = a[field];
      const y = b[field];
      if (x === null && y === null) return 0;
      if (x === null) return 1; // ausentes sempre no fim
      if (y === null) return -1;
      return (x - y) * s;
    });
  }
  return out;
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  query: ScreenerQuery;
}

const LIQ = { field: "liquidity", min: 1 } as const; // R$ 1 mi/dia

export const PRESETS: Preset[] = [
  {
    id: "valor-dividendos",
    label: "Valor + dividendos",
    description: "ROE > 15%, P/L < 10, DY > 6%, liquidez > R$ 1 mi/dia",
    query: { filters: [{ field: "roe", min: 15 }, { field: "pl", max: 10 }, { field: "dy", min: 6 }, LIQ], sort: { field: "dy", dir: "desc" } },
  },
  {
    id: "qualidade",
    label: "Qualidade",
    description: "ROIC > 15%, margem líquida > 10%, dív. líq./EBITDA < 2",
    query: {
      filters: [{ field: "roic", min: 15 }, { field: "netMargin", min: 10 }, { field: "netDebtEbitda", max: 2 }, LIQ],
      excludeFinancials: true,
      sort: { field: "roic", dir: "desc" },
    },
  },
  {
    id: "crescimento",
    label: "Crescimento",
    description: "CAGR de receita > 10% e de lucro > 10% em 5 anos",
    query: { filters: [{ field: "revenueCagr5y", min: 10 }, { field: "earningsCagr5y", min: 10 }, LIQ], sort: { field: "earningsCagr5y", dir: "desc" } },
  },
  {
    id: "graham",
    label: "Barata pelo patrimônio",
    description: "P/L < 15, P/VP < 1,5, ROE > 10%",
    query: { filters: [{ field: "pl", max: 15 }, { field: "pvp", max: 1.5 }, { field: "roe", min: 10 }, LIQ], sort: { field: "pvp", dir: "asc" } },
  },
];

// ─── URL ─────────────────────────────────────────────────────────────────────

/** Serializa filtros na URL: ?pl=,10&roe=15,&setor=Bancos&ord=dy.desc */
export function queryToParams(q: ScreenerQuery): URLSearchParams {
  const p = new URLSearchParams();
  // filtros vazios também vão (",") para continuarem visíveis na tela
  for (const f of q.filters) p.set(f.field, `${f.min ?? ""},${f.max ?? ""}`);
  if (q.sector) p.set("setor", q.sector);
  if (q.excludeFinancials) p.set("semFinanceiras", "1");
  if (q.sort) p.set("ord", `${q.sort.field}.${q.sort.dir}`);
  return p;
}

export function paramsToQuery(p: URLSearchParams): ScreenerQuery {
  const num = (s: string | undefined) => (s === undefined || s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
  const filters: Filter[] = [];
  for (const f of FIELDS) {
    const raw = p.get(f.key);
    if (!raw) continue;
    const [a, b] = raw.split(",");
    filters.push({ field: f.key, min: num(a), max: num(b) });
  }
  const ord = p.get("ord")?.split(".");
  const sortField = ord && FIELDS.some((f) => f.key === ord[0]) ? (ord[0] as NumericField) : null;
  return {
    filters,
    sector: p.get("setor"),
    excludeFinancials: p.get("semFinanceiras") === "1",
    sort: sortField ? { field: sortField, dir: ord![1] === "asc" ? "asc" : "desc" } : { field: "marketCap", dir: "desc" },
  };
}

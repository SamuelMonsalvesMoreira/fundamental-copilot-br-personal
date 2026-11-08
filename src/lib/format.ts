/**
 * Formatação de números e datas em pt-BR.
 * Valor ausente (null/undefined/NaN/Infinity) vira sempre "—": nunca
 * mostramos zero no lugar de um dado que falta.
 */

export const MISSING = "—";

type Num = number | null | undefined;

const isValid = (v: Num): v is number => typeof v === "number" && Number.isFinite(v);

const fmt = (digits: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** 1234.5 → "1.234,50" */
export function formatNumber(v: Num, digits = 2): string {
  return isValid(v) ? fmt(digits).format(v) : MISSING;
}

/** 12.3 → "R$ 12,30" */
export function formatCurrency(v: Num, digits = 2): string {
  return isValid(v) ? `R$ ${fmt(digits).format(v)}` : MISSING;
}

/** Valores grandes em reais: 1.5e9 → "R$ 1,50 bi" */
export function formatCompactCurrency(v: Num, digits = 2): string {
  if (!isValid(v)) return MISSING;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const units: Array<[number, string]> = [
    [1e12, "tri"],
    [1e9, "bi"],
    [1e6, "mi"],
    [1e3, "mil"],
  ];
  for (const [size, label] of units) {
    if (abs >= size) return `${sign}R$ ${fmt(digits).format(abs / size)} ${label}`;
  }
  return `${sign}R$ ${fmt(digits).format(abs)}`;
}

/** Fração → percentual: 0.1534 → "15,34%" */
export function formatPercent(v: Num, digits = 1): string {
  return isValid(v) ? `${fmt(digits).format(v * 100)}%` : MISSING;
}

/** Variação com sinal: 0.012 → "+1,20%" */
export function formatSignedPercent(v: Num, digits = 2): string {
  if (!isValid(v)) return MISSING;
  const s = v > 0 ? "+" : "";
  return `${s}${fmt(digits).format(v * 100)}%`;
}

/** Múltiplo: 8.234 → "8,2x" */
export function formatMultiple(v: Num, digits = 1): string {
  return isValid(v) ? `${fmt(digits).format(v)}x` : MISSING;
}

/** Direção de uma variação, para colorir verde/vermelho. */
export function trendOf(v: Num): "up" | "down" | "flat" | "none" {
  if (!isValid(v)) return "none";
  if (v > 0) return "up";
  if (v < 0) return "down";
  return "flat";
}

/** "2026-11-07" ou ISO completo → "07/11/2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return MISSING;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** ISO completo → "07/11/2026 18:30" no fuso de São Paulo */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return MISSING;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(",", "");
}

/** Quantidades grandes sem moeda: 4.2e9 → "4,20 bi" */
export function formatCompactNumber(v: Num, digits = 2): string {
  if (!isValid(v)) return MISSING;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  for (const [size, label] of [
    [1e12, "tri"],
    [1e9, "bi"],
    [1e6, "mi"],
    [1e3, "mil"],
  ] as const) {
    if (abs >= size) return `${sign}${fmt(digits).format(abs / size)} ${label}`;
  }
  return `${sign}${fmt(0).format(abs)}`;
}

export type ValueFormat = "multiple" | "percent" | "currency" | "perShare" | "number";

/** Formata um valor conforme o tipo do indicador. */
export function formatByType(v: Num, format: ValueFormat): string {
  switch (format) {
    case "multiple":
      return formatMultiple(v, 2);
    case "percent":
      return formatPercent(v, 1);
    case "currency":
      return formatCompactCurrency(v);
    case "perShare":
      return formatCurrency(v);
    case "number":
      return formatCompactNumber(v);
  }
}

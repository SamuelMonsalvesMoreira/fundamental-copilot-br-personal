/**
 * Unidade de digitação de valores grandes: a mesma que o app usa para mostrar
 * o valor de referência (R$ 18,2 bi → digita-se em bilhões; R$ 450 mi → em milhões).
 */
export interface MoneyUnit {
  factor: number;
  label: "bi" | "mi";
  name: "bilhões" | "milhões";
}

const BI: MoneyUnit = { factor: 1e9, label: "bi", name: "bilhões" };
const MI: MoneyUnit = { factor: 1e6, label: "mi", name: "milhões" };

export function moneyUnit(reference: number | null | undefined): MoneyUnit {
  return reference !== null && reference !== undefined && Math.abs(reference) >= 1e9 ? BI : MI;
}

/** 20_020_000_000 em bilhões → "20,02". Sem separador de milhar, para editar fácil. */
export function toUnitText(value: number | null, unit: MoneyUnit): string {
  if (value === null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: unit.label === "bi" ? 2 : 1, useGrouping: false }).format(value / unit.factor);
}

/** Aceita "20,5", "20.5", "1.234,5" e "1.234". Devolve reais, ou null se não for número. */
export function parseUnitText(text: string, unit: MoneyUnit): number | null {
  let t = text.trim().replace(/\s/g, "");
  if (t === "" || t === "-") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t) * unit.factor;
}

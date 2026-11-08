import "server-only";
import { sqlite } from "@/db/client";
import type { Indicator } from "@/analytics/indicators";
import { analyzeByCnpj, findTicker, loadCompanyMeta } from "@/data/company-data";
import { toPoint, type SeriesPoint } from "./company";

export interface CompareItem {
  ticker: string;
  name: string;
  sector: string;
  layout: string | null;
  price: number | null;
  priceDate: string | null;
  financialsEnd: string | null;
  indicators: Record<string, Indicator>;
  annual: SeriesPoint[];
}

export const MAX_COMPARE = 4;

/** Normaliza a lista de tickers da URL: maiúsculas, sem repetidos, no máximo 4. */
export function parseTickers(raw: string | string[] | undefined): string[] {
  const s = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  return [...new Set(s.split(/[,\s]+/).map((t) => t.trim().toUpperCase()).filter((t) => /^[A-Z0-9]{4}\d{1,2}$/.test(t)))].slice(0, MAX_COMPARE);
}

export function getCompareData(tickers: string[]): { items: CompareItem[]; unknown: string[] } {
  const items: CompareItem[] = [];
  const unknown: string[] = [];
  for (const t of tickers) {
    const ref = findTicker(sqlite, t);
    const meta = ref ? loadCompanyMeta(sqlite, ref.cnpj) : null;
    if (!ref || !meta) {
      unknown.push(t);
      continue;
    }
    const a = analyzeByCnpj(sqlite, ref.cnpj, ref.ticker);
    items.push({
      ticker: ref.ticker,
      name: meta.tradeName ?? meta.name,
      sector: meta.sector,
      layout: meta.layout,
      price: a.price?.close ?? null,
      priceDate: a.price?.date ?? null,
      financialsEnd: a.ttm?.end ?? null,
      indicators: a.indicators,
      annual: a.annual.slice(-10).map((p) => toPoint(String(p.year), p.end, p.values)),
    });
  }
  return { items, unknown };
}

/**
 * Histórico de preços e proventos pelo Yahoo Finance (sem token).
 *
 * É um endpoint público, mas não é uma API oficial: pode mudar sem aviso e os
 * termos do Yahoo restringem uso automatizado. Por isso o volume é baixo
 * (cache por ticker e pausa entre chamadas) e o uso é pessoal.
 */
import { fetchWithRetry } from "./http";

export const YAHOO_SOURCE = "Yahoo Finance";

export interface TickerHistoryData {
  history: Array<{ date: string; close: number; adjClose: number | null; volume: number | null }>;
  dividends: Array<{ exDate: string; paymentDate: string | null; kind: string; value: number }>;
  source: string;
  range: string;
}

interface ChartResult {
  meta?: { gmtoffset?: number };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }>;
    adjclose?: Array<{ adjclose?: Array<number | null> }>;
  };
  events?: { dividends?: Record<string, { amount?: number; date?: number }> };
}

export interface ChartResponse {
  chart?: { result?: ChartResult[] | null; error?: { description?: string } | null };
}

/** Data local do pregão: o carimbo do Yahoo vem em UTC, com o deslocamento da bolsa. */
const localDate = (epoch: number, offset: number) => new Date((epoch + offset) * 1000).toISOString().slice(0, 10);

export function parseYahooChart(json: ChartResponse): Omit<TickerHistoryData, "source" | "range"> {
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(json.chart?.error?.description ?? "Yahoo não retornou dados para este ticker");
  const offset = result.meta?.gmtoffset ?? -10800;
  const quote = result.indicators?.quote?.[0];
  const adj = result.indicators?.adjclose?.[0]?.adjclose;

  const history: TickerHistoryData["history"] = [];
  (result.timestamp ?? []).forEach((ts, i) => {
    const close = quote?.close?.[i];
    if (typeof close !== "number" || close <= 0) return;
    history.push({ date: localDate(ts, offset), close, adjClose: adj?.[i] ?? null, volume: quote?.volume?.[i] ?? null });
  });

  const dividends = Object.values(result.events?.dividends ?? {})
    .filter((d): d is { amount: number; date: number } => typeof d.amount === "number" && d.amount > 0 && typeof d.date === "number")
    .map((d) => ({ exDate: localDate(d.date, offset), paymentDate: null, kind: "PROVENTO", value: d.amount }))
    .sort((a, b) => a.exDate.localeCompare(b.exDate));

  return { history, dividends };
}

export async function fetchYahooData(ticker: string): Promise<TickerHistoryData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}.SA?range=10y&interval=1d&events=div`;
  const res = await fetchWithRetry(url, { timeoutMs: 30_000, retries: 1, headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
  if (!res.ok) throw new Error(`Yahoo respondeu HTTP ${res.status} para ${ticker}`);
  return { ...parseYahooChart((await res.json()) as ChartResponse), source: YAHOO_SOURCE, range: "10y" };
}

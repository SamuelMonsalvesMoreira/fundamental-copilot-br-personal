/**
 * Cotações e proventos — brapi.dev
 *
 * - Lista diária (`/quote/list`): preço, variação, volume, valor de mercado e
 *   subsetor de todas as ações em UMA chamada. Funciona sem token.
 * - Histórico e proventos por ticker: a fonte principal é o Yahoo (ver
 *   ../history.ts); a brapi é a reserva, se houver BRAPI_TOKEN.
 */
import type Database from "better-sqlite3";
import { fetchWithRetry } from "../http";
import { trackRun } from "../runs";
import type { TickerHistoryData } from "../yahoo";

export const BRAPI_SOURCE = "brapi.dev";
const BASE = "https://brapi.dev/api";

export class BrapiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export const hasBrapiToken = () => Boolean(process.env.BRAPI_TOKEN?.trim());

async function brapiGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  // Token no cabeçalho, nunca na URL (não aparece em logs).
  const token = process.env.BRAPI_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchWithRetry(url.toString(), { timeoutMs: 60_000, headers });
  const body = (await res.json().catch(() => null)) as (T & { error?: boolean; message?: string; code?: string }) | null;
  if (!res.ok || !body || body.error) {
    throw new BrapiError(body?.message ?? `HTTP ${res.status}`, body?.code, res.status);
  }
  return body;
}

/** Data (AAAA-MM-DD) no fuso de São Paulo. */
export function spDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

// ─── Lista diária ────────────────────────────────────────────────────────────

export interface ListStock {
  stock: string;
  name?: string;
  close?: number | null;
  change?: number | null;
  volume?: number | null;
  market_cap?: number | null;
  logo?: string | null;
  sector?: string | null;
  subsector?: string | null;
  type?: string;
  subType?: string;
}

interface QuoteResult {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketTime?: string;
  marketCap?: number | null;
  historicalDataPrice?: Array<{ date: number; close: number | null; volume?: number | null; adjustedClose?: number | null }>;
  dividendsData?: {
    cashDividends?: Array<{
      rate: number;
      label?: string;
      exDate?: string | null;
      lastDatePrior?: string | null;
      paymentDate?: string | null;
    }>;
  };
}

/** Normaliza a lista: só ações/units com preço. */
export function parseQuoteList(stocks: ListStock[]) {
  return stocks
    .filter((s) => s.type === "stock" && (s.subType === "stock" || s.subType === "unit"))
    .filter((s) => typeof s.close === "number" && s.close > 0)
    .map((s) => ({
      ticker: s.stock.toUpperCase(),
      name: s.name ?? null,
      close: s.close as number,
      changePct: typeof s.change === "number" ? s.change / 100 : null,
      volume: s.volume ?? null,
      marketCap: s.market_cap ?? null,
      logo: s.logo ?? null,
      sector: s.sector ?? null,
      subsector: s.subsector?.trim() || null,
      subType: s.subType ?? null,
    }));
}

/**
 * Data do pregão a que a lista se refere. A lista não informa a data, e o
 * `regularMarketTime` é a hora da atualização (pode cair num sábado). Usamos
 * a data do último candle diário de um ticker de referência (PETR4,
 * disponível sem token).
 */
async function referenceTradingDate(): Promise<string> {
  const body = await brapiGet<{ results: QuoteResult[] }>("/quote/PETR4", { range: "5d", interval: "1d" });
  const last = parseHistory(body.results?.[0] ?? { symbol: "PETR4" }).at(-1);
  if (!last) throw new BrapiError("Sem data de referência do pregão");
  return last.date;
}

export async function ingestQuoteList(sqlite: Database.Database, opts: { log?: (m: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  return trackRun(sqlite, { job: "brapi:list", source: `${BRAPI_SOURCE} — cotações do dia`, sourceUrl: "https://brapi.dev/docs" }, async () => {
    const date = await referenceTradingDate();
    const body = await brapiGet<{ stocks: ListStock[] }>("/quote/list", { type: "stock", limit: "5000" });
    const rows = parseQuoteList(body.stocks ?? []);
    const now = new Date().toISOString();

    const upInfo = sqlite.prepare(
      `INSERT INTO market_info (ticker, name, sector, subsector, sub_type, logo, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker) DO UPDATE SET name = excluded.name, sector = excluded.sector,
         subsector = excluded.subsector, sub_type = excluded.sub_type, logo = excluded.logo,
         source = excluded.source, updated_at = excluded.updated_at`,
    );
    // Se o candle diário (histórico) já existe para o pregão, o fechamento dele
    // prevalece: a lista pode trazer o último preço negociado, que às vezes
    // difere centavos do fechamento oficial.
    const upQuote = sqlite.prepare(
      `INSERT INTO quotes_daily (ticker, date, close, volume, market_cap, change_pct, source, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker, date) DO UPDATE SET
         close = CASE WHEN quotes_daily.adj_close IS NULL THEN excluded.close ELSE quotes_daily.close END,
         volume = COALESCE(quotes_daily.volume, excluded.volume),
         market_cap = excluded.market_cap, change_pct = excluded.change_pct, fetched_at = excluded.fetched_at`,
    );

    sqlite.transaction(() => {
      for (const r of rows) {
        upInfo.run(r.ticker, r.name, r.sector, r.subsector, r.subType, r.logo, BRAPI_SOURCE, now);
        upQuote.run(r.ticker, date, r.close, r.volume, r.marketCap, r.changePct, BRAPI_SOURCE, now);
      }
    })();

    log(`${rows.length} cotações de ${date}.`);
    return { rows: rows.length, dataAsOf: date };
  });
}

// ─── Histórico e proventos por ticker ────────────────────────────────────────

const RANGES = ["10y", "5y", "2y", "1y", "3mo"] as const;

export function parseDividends(result: QuoteResult) {
  // A mesma data ex pode ter dois pagamentos de valor igual, e eles são distintos:
  // somamos por data e tipo em vez de descartar como duplicados.
  const byKey = new Map<string, { exDate: string; paymentDate: string | null; kind: string; value: number }>();
  for (const d of result.dividendsData?.cashDividends ?? []) {
    if (!(d.rate > 0)) continue;
    // "data com" = lastDatePrior; data ex = dia útil seguinte (exDate quando informado)
    const ex = d.exDate ?? d.lastDatePrior;
    if (!ex) continue;
    const exDate = spDate(new Date(ex));
    const kind = (d.label ?? "DIVIDENDO").toUpperCase().trim();
    const cur = byKey.get(`${exDate}|${kind}`);
    if (cur) cur.value += d.rate;
    else byKey.set(`${exDate}|${kind}`, { exDate, paymentDate: d.paymentDate ? spDate(new Date(d.paymentDate)) : null, kind, value: d.rate });
  }
  return [...byKey.values()];
}

export function parseHistory(result: QuoteResult) {
  return (result.historicalDataPrice ?? [])
    .filter((p) => typeof p.close === "number" && p.close > 0)
    .map((p) => ({
      date: spDate(new Date(p.date * 1000)),
      close: p.close as number,
      adjClose: p.adjustedClose ?? null,
      volume: p.volume ?? null,
    }));
}

/** Histórico e proventos pela brapi: reserva, se o Yahoo falhar e houver token. */
export async function fetchBrapiTickerData(rawTicker: string): Promise<TickerHistoryData> {
  const ticker = rawTicker.toUpperCase();
  let lastErr: unknown = null;
  for (const range of RANGES) {
    try {
      const body = await brapiGet<{ results: QuoteResult[] }>(`/quote/${encodeURIComponent(ticker)}`, { range, interval: "1d", dividends: "true" });
      const result = body.results?.[0];
      if (result) return { history: parseHistory(result), dividends: parseDividends(result), source: BRAPI_SOURCE, range };
    } catch (err) {
      lastErr = err;
      if (err instanceof BrapiError && (err.code === "MISSING_TOKEN" || err.status === 404)) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new BrapiError("falha ao buscar histórico");
}

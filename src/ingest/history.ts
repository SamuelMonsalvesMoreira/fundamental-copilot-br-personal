/**
 * Histórico de preços e proventos por ticker, guardado no banco.
 * Fonte principal: Yahoo Finance (sem token). Se falhar e houver BRAPI_TOKEN,
 * tenta a brapi.
 */
import type Database from "better-sqlite3";
import { fetchBrapiTickerData, hasBrapiToken } from "./brapi";
import { trackRun } from "./runs";
import { fetchYahooData, YAHOO_SOURCE, type TickerHistoryData } from "./yahoo";

export interface TickerFetchResult {
  ticker: string;
  historyPoints: number;
  dividends: number;
  range: string | null;
  source: string;
}

export async function fetchTickerHistory(sqlite: Database.Database, rawTicker: string): Promise<TickerFetchResult> {
  const ticker = rawTicker.toUpperCase();
  const now = new Date().toISOString();
  const mark = sqlite.prepare(
    `INSERT OR REPLACE INTO ticker_fetches (ticker, kind, fetched_at, status, message) VALUES (?, 'history', ?, ?, ?)`,
  );

  let data: TickerHistoryData;
  try {
    data = await fetchYahooData(ticker);
  } catch (yahooError) {
    if (!hasBrapiToken()) {
      mark.run(ticker, now, "error", (yahooError as Error).message);
      throw yahooError;
    }
    try {
      data = await fetchBrapiTickerData(ticker);
    } catch (brapiError) {
      mark.run(ticker, now, "error", (brapiError as Error).message);
      throw brapiError;
    }
  }

  const upQuote = sqlite.prepare(
    `INSERT INTO quotes_daily (ticker, date, close, volume, adj_close, source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ticker, date) DO UPDATE SET close = excluded.close, volume = excluded.volume,
       adj_close = excluded.adj_close, source = excluded.source, fetched_at = excluded.fetched_at`,
  );
  const insDiv = sqlite.prepare(
    `INSERT OR REPLACE INTO dividends (ticker, ex_date, payment_date, kind, value_per_share, source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  sqlite.transaction(() => {
    for (const p of data.history) upQuote.run(ticker, p.date, p.close, p.volume, p.adjClose, data.source, now);
    // substitui tudo: fontes diferentes agrupam os proventos de formas diferentes
    if (data.history.length > 0) sqlite.prepare(`DELETE FROM dividends WHERE ticker = ?`).run(ticker);
    for (const d of data.dividends) insDiv.run(ticker, d.exDate, d.paymentDate, d.kind, d.value, data.source, now);
  })();
  mark.run(ticker, now, "ok", `${data.history.length} pregões (${data.range}), ${data.dividends.length} proventos, ${data.source}`);
  return { ticker, historyPoints: data.history.length, dividends: data.dividends.length, range: data.range, source: data.source };
}

/** Busca o histórico só se a última busca tiver mais de `maxAgeHours`. */
export async function ensureTickerHistory(sqlite: Database.Database, ticker: string, maxAgeHours = 24) {
  const row = sqlite
    .prepare(`SELECT fetched_at AS f, status FROM ticker_fetches WHERE ticker = ? AND kind = 'history'`)
    .get(ticker.toUpperCase()) as { f: string; status: string } | undefined;
  const ageH = row ? (Date.now() - Date.parse(row.f)) / 3_600_000 : Infinity;
  // erros são tentados de novo depois de 1 h
  if (row && ((row.status === "ok" && ageH < maxAgeHours) || (row.status === "error" && ageH < 1))) return null;
  return fetchTickerHistory(sqlite, ticker);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Atualiza o ticker mais negociado de cada empresa, além da watchlist e da
 * carteira. Devagar de propósito, e desiste se a fonte começar a recusar.
 */
export async function refreshHistories(
  sqlite: Database.Database,
  opts: { maxAgeHours?: number; pauseMs?: number; log?: (m: string) => void } = {},
) {
  const { maxAgeHours = 24 * 7, pauseMs = 350, log = () => {} } = opts;
  return trackRun(sqlite, { job: "yahoo:historico", source: `${YAHOO_SOURCE} — preços e proventos`, sourceUrl: "https://finance.yahoo.com" }, async () => {
    const tickers = (
      sqlite
        .prepare(
          `SELECT ticker FROM (
             SELECT t.ticker, ROW_NUMBER() OVER (PARTITION BY t.cnpj ORDER BY COALESCE(q.volume, 0) DESC) AS rn
               FROM tickers t JOIN quotes_daily q ON q.ticker = t.ticker AND q.date = (SELECT MAX(date) FROM quotes_daily)
           ) WHERE rn = 1
           UNION SELECT ticker FROM watchlist
           UNION SELECT ticker FROM portfolio_positions`,
        )
        .all() as { ticker: string }[]
    ).map((r) => r.ticker);

    let updated = 0;
    let failed = 0;
    let streak = 0;
    for (const ticker of tickers) {
      try {
        const r = await ensureTickerHistory(sqlite, ticker, maxAgeHours);
        streak = 0;
        if (!r) continue;
        updated++;
        await sleep(pauseMs);
      } catch {
        failed++;
        if (++streak >= 5) {
          log("Fonte recusou 5 tickers seguidos: parando por agora.");
          break;
        }
        await sleep(pauseMs);
      }
    }
    log(`Histórico: ${updated} tickers atualizados, ${failed} sem dados.`);
    return { rows: updated, message: `${tickers.length} tickers verificados; ${failed} sem dados` };
  });
}

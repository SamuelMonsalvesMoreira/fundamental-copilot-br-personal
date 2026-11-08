import "server-only";
import { sqlite } from "@/db/client";
import { computePortfolio, type PortfolioSummary, type Position } from "@/analytics/portfolio";

export interface WatchItem {
  ticker: string;
  name: string | null;
  sector: string | null;
  addedAt: string;
  note: string | null;
  close: number | null;
  changePct: number | null;
  date: string | null;
  pl: number | null;
  pvp: number | null;
  roe: number | null;
  dy: number | null;
  netDebtEbitda: number | null;
}

const lastQuote = `(SELECT q.%s FROM quotes_daily q WHERE q.ticker = w.ticker ORDER BY q.date DESC LIMIT 1)`;

export function getWatchlist(): WatchItem[] {
  const col = (c: string) => lastQuote.replace("%s", c);
  return sqlite
    .prepare(
      `SELECT w.ticker, w.added_at AS addedAt, w.note,
              COALESCE(c.trade_name, c.name) AS name, s.sector,
              ${col("close")} AS close, ${col("change_pct")} AS changePct, ${col("date")} AS date,
              s.pl, s.pvp, s.roe, s.dy, s.net_debt_ebitda AS netDebtEbitda
         FROM watchlist w
         LEFT JOIN tickers t ON t.ticker = w.ticker
         LEFT JOIN companies c ON c.cnpj = t.cnpj
         LEFT JOIN company_snapshots s ON s.cnpj = t.cnpj
        ORDER BY w.added_at DESC`,
    )
    .all() as WatchItem[];
}

export function isWatched(ticker: string): boolean {
  return Boolean(sqlite.prepare(`SELECT 1 FROM watchlist WHERE ticker = ?`).get(ticker.toUpperCase()));
}

export function getPortfolio(): PortfolioSummary & { names: Record<string, string> } {
  const positions = sqlite
    .prepare(`SELECT id, ticker, quantity, avg_price AS avgPrice, opened_at AS openedAt, note FROM portfolio_positions ORDER BY ticker, id`)
    .all() as Position[];
  const prices: Record<string, { close: number; date: string }> = {};
  const dy: Record<string, number | null> = {};
  const names: Record<string, string> = {};
  for (const t of new Set(positions.map((p) => p.ticker))) {
    const q = sqlite.prepare(`SELECT close, date FROM quotes_daily WHERE ticker = ? ORDER BY date DESC LIMIT 1`).get(t) as { close: number; date: string } | undefined;
    if (q) prices[t] = q;
    const s = sqlite
      .prepare(
        `SELECT s.dy, COALESCE(c.trade_name, c.name) AS name FROM tickers tk
           JOIN companies c ON c.cnpj = tk.cnpj LEFT JOIN company_snapshots s ON s.cnpj = tk.cnpj WHERE tk.ticker = ?`,
      )
      .get(t) as { dy: number | null; name: string } | undefined;
    dy[t] = s?.dy ?? null;
    if (s?.name) names[t] = s.name;
  }
  return { ...computePortfolio(positions, prices, dy), names };
}

export function tickerExists(ticker: string): boolean {
  return Boolean(sqlite.prepare(`SELECT 1 FROM tickers WHERE ticker = ?`).get(ticker));
}

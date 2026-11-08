"use server";

import { refresh } from "next/cache";
import { sqlite } from "@/db/client";
import { validatePosition } from "@/analytics/portfolio";
import { ensureTickerHistory } from "@/ingest/history";
import { tickerExists } from "./portfolio";

const clean = (t: unknown) => String(t ?? "").trim().toUpperCase();

export async function toggleWatchlist(ticker: string): Promise<{ watched: boolean; error?: string }> {
  const t = clean(ticker);
  if (!tickerExists(t)) return { watched: false, error: "Ticker não encontrado." };
  const exists = sqlite.prepare(`SELECT 1 FROM watchlist WHERE ticker = ?`).get(t);
  if (exists) sqlite.prepare(`DELETE FROM watchlist WHERE ticker = ?`).run(t);
  else {
    sqlite.prepare(`INSERT INTO watchlist (ticker, added_at) VALUES (?, ?)`).run(t, new Date().toISOString());
    // já busca histórico e proventos para a watchlist
    await ensureTickerHistory(sqlite, t).catch(() => null);
  }
  refresh();
  return { watched: !exists };
}

export async function updateWatchNote(ticker: string, note: string) {
  sqlite.prepare(`UPDATE watchlist SET note = ? WHERE ticker = ?`).run(note.trim().slice(0, 200) || null, clean(ticker));
  refresh();
}

export interface PositionFormState {
  errors: string[];
  ok?: boolean;
}

export async function addPosition(_prev: PositionFormState, form: FormData): Promise<PositionFormState> {
  const num = (k: string) => Number(String(form.get(k) ?? "").replace(/\./g, "").replace(",", "."));
  const input = {
    ticker: clean(form.get("ticker")),
    quantity: num("quantity"),
    avgPrice: Number(String(form.get("avgPrice") ?? "").replace(",", ".")),
    openedAt: String(form.get("openedAt") ?? "") || null,
    note: String(form.get("note") ?? "").trim().slice(0, 200) || null,
  };
  const errors = validatePosition(input);
  if (errors.length === 0 && !tickerExists(input.ticker)) errors.push(`${input.ticker} não está entre os tickers listados.`);
  if (errors.length) return { errors };
  sqlite
    .prepare(`INSERT INTO portfolio_positions (ticker, quantity, avg_price, opened_at, note) VALUES (?, ?, ?, ?, ?)`)
    .run(input.ticker, input.quantity, input.avgPrice, input.openedAt, input.note);
  refresh();
  return { errors: [], ok: true };
}

export async function removePosition(id: number) {
  sqlite.prepare(`DELETE FROM portfolio_positions WHERE id = ?`).run(id);
  refresh();
}

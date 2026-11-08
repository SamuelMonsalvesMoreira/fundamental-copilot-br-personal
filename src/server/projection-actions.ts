"use server";

import { refresh } from "next/cache";
import { sqlite } from "@/db/client";
import { assumptionsSchema } from "@/analytics/projections";
import { tickerExists } from "./portfolio";

const clean = (t: string) => t.trim().toUpperCase();

export async function saveProjection(ticker: string, assumptions: unknown): Promise<{ ok: boolean; error?: string }> {
  const t = clean(ticker);
  if (!tickerExists(t)) return { ok: false, error: "Ticker não encontrado." };
  const parsed = assumptionsSchema.safeParse(assumptions);
  if (!parsed.success) return { ok: false, error: "Premissas fora dos limites permitidos." };
  sqlite
    .prepare(
      `INSERT INTO projections (ticker, assumptions, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(ticker) DO UPDATE SET assumptions = excluded.assumptions, updated_at = excluded.updated_at`,
    )
    .run(t, JSON.stringify(parsed.data), new Date().toISOString());
  refresh();
  return { ok: true };
}

export async function deleteProjection(ticker: string): Promise<void> {
  sqlite.prepare(`DELETE FROM projections WHERE ticker = ?`).run(clean(ticker));
  refresh();
}

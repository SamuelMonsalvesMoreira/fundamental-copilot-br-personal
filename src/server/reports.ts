import "server-only";
import { sqlite } from "@/db/client";
import type { ToolTraceEntry } from "@/ai/agent";
import type { Verification } from "@/ai/verify";

export interface SavedReport {
  id: number;
  ticker: string;
  model: string;
  createdAt: string;
  dataAsOf: string | null;
  content: string;
  priceDate: string | null;
  tools: string[];
  unverified: string[];
}

export function saveReport(r: { ticker: string; model: string; content: string; dataAsOf: string | null; priceDate: string | null; trace: ToolTraceEntry[]; verification: Verification }) {
  sqlite
    .prepare(`INSERT INTO ai_reports (ticker, model, created_at, data_as_of, content, tool_trace) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(r.ticker, r.model, new Date().toISOString(), r.dataAsOf, r.content, JSON.stringify({ priceDate: r.priceDate, trace: r.trace, verification: r.verification }));
}

/** Relatório mais recente do ticker (ou de outra classe da mesma empresa). */
export function getLatestReport(ticker: string): SavedReport | null {
  const row = sqlite
    .prepare(
      `SELECT id, ticker, model, created_at AS createdAt, data_as_of AS dataAsOf, content, tool_trace AS trace
         FROM ai_reports WHERE ticker = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(ticker.toUpperCase()) as (Omit<SavedReport, "tools" | "unverified" | "priceDate"> & { trace: string | null }) | undefined;
  if (!row) return null;
  let meta: { priceDate?: string | null; trace?: ToolTraceEntry[]; verification?: Verification } = {};
  try {
    meta = row.trace ? JSON.parse(row.trace) : {};
  } catch {
    /* rastro corrompido: mostra só o texto */
  }
  return {
    id: row.id,
    ticker: row.ticker,
    model: row.model,
    createdAt: row.createdAt,
    dataAsOf: row.dataAsOf,
    content: row.content,
    priceDate: meta.priceDate ?? null,
    tools: [...new Set((meta.trace ?? []).filter((t) => t.ok).map((t) => t.name))],
    unverified: meta.verification?.unverified ?? [],
  };
}

import "server-only";
import { sqlite } from "@/db/client";

export interface JobStatus {
  job: string;
  source: string;
  sourceUrl: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  rows: number | null;
  dataAsOf: string | null;
  message: string | null;
}

/** Última execução de cada coleta. */
export function getLatestJobRuns(): JobStatus[] {
  return sqlite
    .prepare(
      `SELECT job, source, source_url AS sourceUrl, status, started_at AS startedAt,
              finished_at AS finishedAt, rows, data_as_of AS dataAsOf, message
         FROM ingest_runs r
        WHERE id = (SELECT MAX(id) FROM ingest_runs WHERE job = r.job)
        ORDER BY job`,
    )
    .all() as JobStatus[];
}

const COUNTED_TABLES = ["companies", "tickers", "quotes_daily", "dividends", "macro_series"] as const;

/** Quantidade de linhas por tabela principal. */
export function getTableCounts(): Record<(typeof COUNTED_TABLES)[number], number> {
  const out = {} as Record<(typeof COUNTED_TABLES)[number], number>;
  for (const t of COUNTED_TABLES) {
    out[t] = (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  }
  return out;
}

export function getSchemaVersion(): number {
  return sqlite.pragma("user_version", { simple: true }) as number;
}

import type Database from "better-sqlite3";

/** Registro de cada coleta na tabela ingest_runs (mostrada em /dados). */

export interface RunInfo {
  job: string;
  source: string;
  sourceUrl?: string;
}

export interface RunResult {
  rows?: number;
  dataAsOf?: string | null;
  remoteVersion?: string | null;
  message?: string | null;
}

export function startRun(sqlite: Database.Database, info: RunInfo): number {
  const r = sqlite
    .prepare(
      `INSERT INTO ingest_runs (job, source, source_url, status, started_at) VALUES (?, ?, ?, 'running', ?)`,
    )
    .run(info.job, info.source, info.sourceUrl ?? null, new Date().toISOString());
  return Number(r.lastInsertRowid);
}

export function finishRun(
  sqlite: Database.Database,
  id: number,
  status: "ok" | "error" | "skipped",
  result: RunResult = {},
) {
  sqlite
    .prepare(
      `UPDATE ingest_runs
          SET status = ?, finished_at = ?, rows = ?, data_as_of = ?, remote_version = ?, message = ?
        WHERE id = ?`,
    )
    .run(
      status,
      new Date().toISOString(),
      result.rows ?? null,
      result.dataAsOf ?? null,
      result.remoteVersion ?? null,
      result.message ?? null,
      id,
    );
}

/** Versão remota da última coleta bem-sucedida de um job. */
export function lastOkRemoteVersion(sqlite: Database.Database, job: string): string | null {
  const row = sqlite
    .prepare(
      `SELECT remote_version AS v FROM ingest_runs
        WHERE job = ? AND status = 'ok' AND remote_version IS NOT NULL
        ORDER BY id DESC LIMIT 1`,
    )
    .get(job) as { v: string } | undefined;
  return row?.v ?? null;
}

/** Executa uma coleta registrando início, fim e erro. */
export async function trackRun<T extends RunResult & { skipped?: boolean }>(
  sqlite: Database.Database,
  info: RunInfo,
  fn: () => Promise<T>,
): Promise<T> {
  const id = startRun(sqlite, info);
  try {
    const result = await fn();
    finishRun(sqlite, id, result.skipped ? "skipped" : "ok", result);
    return result;
  } catch (err) {
    finishRun(sqlite, id, "error", { message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

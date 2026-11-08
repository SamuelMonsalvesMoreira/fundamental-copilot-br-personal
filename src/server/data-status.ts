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
  /** Última vez que a fonte foi verificada (inclui verificações sem mudanças). */
  checkedAt: string | null;
}

/**
 * Por coleta: a última execução que efetivamente gravou dados (ou falhou),
 * mais a hora da verificação mais recente.
 */
export function getLatestJobRuns(): JobStatus[] {
  return sqlite
    .prepare(
      `SELECT job, source, source_url AS sourceUrl, status, started_at AS startedAt,
              finished_at AS finishedAt, rows, data_as_of AS dataAsOf, message,
              (SELECT MAX(COALESCE(finished_at, started_at)) FROM ingest_runs x WHERE x.job = r.job) AS checkedAt
         FROM ingest_runs r
        WHERE id = COALESCE(
          (SELECT MAX(id) FROM ingest_runs WHERE job = r.job AND status <> 'skipped'),
          (SELECT MAX(id) FROM ingest_runs WHERE job = r.job))
        ORDER BY CASE WHEN job LIKE 'cvm:cadastro' THEN 0 ELSE 1 END, job DESC`,
    )
    .all() as JobStatus[];
}

const COUNTED_TABLES = [
  "companies",
  "tickers",
  "filings",
  "fin_values",
  "statement_lines",
  "quotes_daily",
  "dividends",
  "macro_series",
] as const;

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

export interface CoverageSummary {
  latestDfp: string | null;
  latestItr: string | null;
  oldestDfp: string | null;
  companiesWithFinancials: number;
}

/** Período mais recente/antigo disponível e quantas empresas têm demonstrações. */
export function getCoverageSummary(): CoverageSummary {
  return sqlite
    .prepare(
      `SELECT
         (SELECT MAX(period_end) FROM filings WHERE doc = 'DFP') AS latestDfp,
         (SELECT MAX(period_end) FROM filings WHERE doc = 'ITR') AS latestItr,
         (SELECT MIN(period_end) FROM filings WHERE doc = 'DFP') AS oldestDfp,
         (SELECT COUNT(DISTINCT cnpj) FROM fin_values) AS companiesWithFinancials`,
    )
    .get() as CoverageSummary;
}

export interface MarketSummary {
  latestQuoteDate: string | null;
  quotedTickers: number;
  sharesVerified: number;
  sharesInThousands: number;
  sharesUnverified: number;
}

export function getMarketSummary(): MarketSummary {
  const q = sqlite
    .prepare(
      `SELECT MAX(date) AS d,
              (SELECT COUNT(*) FROM quotes_daily WHERE date = (SELECT MAX(date) FROM quotes_daily WHERE source = 'brapi.dev')) AS n
         FROM quotes_daily`,
    )
    .get() as { d: string | null; n: number };
  const s = sqlite
    .prepare(
      `SELECT SUM(share_scale IS NOT NULL) AS ok, SUM(share_scale > 1) AS thousands,
              SUM(share_scale IS NULL AND share_scale_note IS NOT NULL) AS bad
         FROM companies`,
    )
    .get() as { ok: number | null; thousands: number | null; bad: number | null };
  return {
    latestQuoteDate: q.d,
    quotedTickers: q.n,
    sharesVerified: s.ok ?? 0,
    sharesInThousands: s.thousands ?? 0,
    sharesUnverified: s.bad ?? 0,
  };
}

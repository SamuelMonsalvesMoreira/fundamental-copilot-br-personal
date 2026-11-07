/**
 * Migrações SQL versionadas. Cada item é aplicado uma única vez, em ordem,
 * controlado por `PRAGMA user_version`. Nunca edite uma migração já
 * publicada: acrescente uma nova ao final.
 *
 * Mantenha estas tabelas em sincronia com `schema.ts`.
 */
import type Database from "better-sqlite3";

export const MIGRATIONS: string[] = [
  // 1 — base: cadastro, cotações, macro, coletas, carteira, relatórios
  `
  CREATE TABLE companies (
    cnpj TEXT PRIMARY KEY,
    cvm_code TEXT NOT NULL,
    name TEXT NOT NULL,
    trade_name TEXT,
    sector TEXT,
    status TEXT,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE tickers (
    ticker TEXT PRIMARY KEY,
    cnpj TEXT NOT NULL,
    share_class TEXT,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX tickers_cnpj_idx ON tickers (cnpj);

  CREATE TABLE quotes_daily (
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    close REAL NOT NULL,
    volume REAL,
    market_cap REAL,
    source TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (ticker, date)
  );
  CREATE TABLE dividends (
    ticker TEXT NOT NULL,
    ex_date TEXT NOT NULL,
    payment_date TEXT,
    kind TEXT NOT NULL,
    value_per_share REAL NOT NULL,
    source TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (ticker, ex_date, kind, value_per_share)
  );
  CREATE TABLE macro_series (
    series_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    value REAL NOT NULL,
    source TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (series_id, date)
  );
  CREATE TABLE ingest_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    rows INTEGER,
    data_as_of TEXT,
    remote_version TEXT,
    message TEXT
  );
  CREATE INDEX ingest_runs_job_idx ON ingest_runs (job, started_at);

  CREATE TABLE watchlist (
    ticker TEXT PRIMARY KEY,
    added_at TEXT NOT NULL,
    note TEXT
  );
  CREATE TABLE portfolio_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    quantity REAL NOT NULL,
    avg_price REAL NOT NULL,
    opened_at TEXT,
    note TEXT
  );
  CREATE TABLE ai_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data_as_of TEXT,
    content TEXT NOT NULL,
    tool_trace TEXT
  );
  CREATE INDEX ai_reports_ticker_idx ON ai_reports (ticker, created_at);
  `,
];

/** Aplica as migrações pendentes. Retorna a versão final do esquema. */
export function migrate(sqlite: Database.Database): number {
  const current = sqlite.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const apply = sqlite.transaction(() => {
      sqlite.exec(MIGRATIONS[v]);
      sqlite.pragma(`user_version = ${v + 1}`);
    });
    apply();
  }
  return MIGRATIONS.length;
}

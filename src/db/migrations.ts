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

  // 2 — demonstrações da CVM (DFP/ITR)
  `
  ALTER TABLE companies ADD COLUMN layout TEXT;          -- standard | bank | insurance
  ALTER TABLE companies ADD COLUMN listing_segment TEXT; -- Novo Mercado, Nível 1...

  -- Documentos entregues (um por companhia/documento/data de referência)
  CREATE TABLE filings (
    cnpj TEXT NOT NULL,
    doc TEXT NOT NULL,              -- DFP | ITR
    period_end TEXT NOT NULL,       -- DT_REFER
    version INTEGER NOT NULL,
    received_at TEXT,               -- DT_RECEB
    link TEXT,
    PRIMARY KEY (cnpj, doc, period_end)
  );

  -- Linhas das demonstrações como publicadas (consolidado quando houver)
  CREATE TABLE statement_lines (
    cnpj TEXT NOT NULL,
    doc TEXT NOT NULL,
    statement TEXT NOT NULL,        -- BPA | BPP | DRE | DFC_MD | DFC_MI | DVA
    consolidated INTEGER NOT NULL,
    period_start TEXT NOT NULL,     -- '' para balanço
    period_end TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    value REAL,                     -- em R$ (já multiplicado pela escala)
    fixed INTEGER NOT NULL,         -- conta fixa do plano CVM
    PRIMARY KEY (cnpj, doc, statement, period_start, period_end, code)
  ) WITHOUT ROWID;

  -- Contas padronizadas (receita, EBIT, dívida...) usadas pelos indicadores
  CREATE TABLE fin_values (
    cnpj TEXT NOT NULL,
    metric TEXT NOT NULL,
    period_start TEXT NOT NULL,     -- '' para saldos de balanço
    period_end TEXT NOT NULL,
    value REAL NOT NULL,
    doc TEXT NOT NULL,
    consolidated INTEGER NOT NULL,
    origin TEXT NOT NULL,           -- conta/regra de onde o valor saiu
    PRIMARY KEY (cnpj, metric, period_start, period_end)
  ) WITHOUT ROWID;

  -- Composição do capital (quantidade de ações)
  CREATE TABLE share_counts (
    cnpj TEXT NOT NULL,
    period_end TEXT NOT NULL,
    doc TEXT NOT NULL,
    ordinary REAL,
    preferred REAL,
    total REAL,
    treasury_ordinary REAL,
    treasury_preferred REAL,
    treasury_total REAL,
    PRIMARY KEY (cnpj, period_end)
  );
  `,

  // 3 — mercado (brapi) e escala da quantidade de ações
  `
  -- Dados de mercado por ticker (lista diária da brapi)
  CREATE TABLE market_info (
    ticker TEXT PRIMARY KEY,
    name TEXT,
    sector TEXT,            -- setor (inglês, classificação da brapi)
    subsector TEXT,         -- subsetor B3 (português)
    sub_type TEXT,          -- stock | unit
    logo TEXT,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  ALTER TABLE quotes_daily ADD COLUMN change_pct REAL;
  ALTER TABLE quotes_daily ADD COLUMN adj_close REAL;

  -- Fator que converte share_counts para unidades (1 ou 1000...), conferido
  -- contra o valor de mercado. NULL = ainda não conferido.
  ALTER TABLE companies ADD COLUMN share_scale REAL;
  ALTER TABLE companies ADD COLUMN share_scale_note TEXT;

  -- Controle das buscas sob demanda por ticker (histórico, proventos)
  CREATE TABLE ticker_fetches (
    ticker TEXT NOT NULL,
    kind TEXT NOT NULL,     -- history | dividends
    fetched_at TEXT NOT NULL,
    status TEXT NOT NULL,   -- ok | error
    message TEXT,
    PRIMARY KEY (ticker, kind)
  );
  `,

  // 4 — indicadores calculados por companhia (pares, screener, comparador)
  `
  CREATE TABLE company_snapshots (
    cnpj TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,          -- ticker principal (mais negociado)
    name TEXT NOT NULL,
    sector TEXT NOT NULL,
    sector_key TEXT NOT NULL,
    layout TEXT,
    price REAL,
    price_date TEXT,
    financials_end TEXT,
    market_cap REAL,
    volume REAL,
    pl REAL, pvp REAL, ev_ebitda REAL, psr REAL,
    roe REAL, roic REAL, roa REAL,
    gross_margin REAL, ebitda_margin REAL, net_margin REAL,
    net_debt_ebitda REAL, current_ratio REAL,
    dy REAL, payout REAL,
    revenue_cagr5y REAL, earnings_cagr5y REAL,
    revenue_ttm REAL, net_income_ttm REAL,
    computed_at TEXT NOT NULL
  );
  CREATE INDEX company_snapshots_sector_idx ON company_snapshots (sector_key);
  `,

  // 5 — premissas de projeção do usuário, por ticker
  `
  CREATE TABLE projections (
    ticker TEXT PRIMARY KEY,
    assumptions TEXT NOT NULL,     -- JSON validado por assumptionsSchema
    updated_at TEXT NOT NULL
  );
  `,

  // 6 — composição das units (ex.: TAEE11 = 1 ON + 2 PN)
  `
  ALTER TABLE tickers ADD COLUMN shares_per_unit REAL;
  ALTER TABLE tickers ADD COLUMN unit_composition TEXT;
  `,

  // 7 — pares escolhidos pelo usuário
  `
  CREATE TABLE peer_choices (
    cnpj TEXT NOT NULL,
    peer_ticker TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (cnpj, peer_ticker)
  );
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

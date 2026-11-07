/**
 * Esquema do banco local (SQLite via Drizzle).
 *
 * Regra do projeto: todo dado guardado aqui carrega a FONTE e a DATA de
 * referência, para que a interface e a IA possam sempre citá-las.
 *
 * As tabelas de demonstrações financeiras (DFP/ITR) entram na Etapa 1.
 */
import { sqliteTable, text, real, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

/** Companhias abertas (cadastro CVM). */
export const companies = sqliteTable("companies", {
  cnpj: text("cnpj").primaryKey(), // só dígitos
  cvmCode: text("cvm_code").notNull(),
  name: text("name").notNull(), // denominação social
  tradeName: text("trade_name"), // nome de pregão / comercial
  sector: text("sector"), // setor de atividade (CVM)
  status: text("status"), // situação do registro
  source: text("source").notNull(),
  updatedAt: text("updated_at").notNull(), // ISO
});

/** Códigos de negociação (B3) ligados à companhia. */
export const tickers = sqliteTable(
  "tickers",
  {
    ticker: text("ticker").primaryKey(), // ex.: PETR4
    cnpj: text("cnpj").notNull(),
    shareClass: text("share_class"), // ON, PN, UNIT...
    source: text("source").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("tickers_cnpj_idx").on(t.cnpj)],
);

/** Cotações diárias (fechamento). */
export const quotesDaily = sqliteTable(
  "quotes_daily",
  {
    ticker: text("ticker").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    close: real("close").notNull(),
    volume: real("volume"),
    marketCap: real("market_cap"),
    source: text("source").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.date] })],
);

/** Proventos (dividendos e JCP) por ação. */
export const dividends = sqliteTable(
  "dividends",
  {
    ticker: text("ticker").notNull(),
    exDate: text("ex_date").notNull(),
    paymentDate: text("payment_date"),
    kind: text("kind").notNull(), // DIVIDENDO | JCP | ...
    valuePerShare: real("value_per_share").notNull(),
    source: text("source").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.exDate, t.kind, t.valuePerShare] })],
);

/** Séries macroeconômicas do Banco Central (SGS). */
export const macroSeries = sqliteTable(
  "macro_series",
  {
    seriesId: integer("series_id").notNull(), // 432 Selic meta, 433 IPCA, 12 CDI...
    date: text("date").notNull(), // YYYY-MM-DD
    value: real("value").notNull(),
    source: text("source").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.seriesId, t.date] })],
);

/** Histórico de coletas: alimenta a tela /dados e o rodapé de cada tela. */
export const ingestRuns = sqliteTable(
  "ingest_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    job: text("job").notNull(), // ex.: cvm:dfp, brapi:quotes, bcb:sgs
    source: text("source").notNull(), // nome legível da fonte
    sourceUrl: text("source_url"),
    status: text("status").notNull(), // running | ok | error
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    rows: integer("rows"),
    dataAsOf: text("data_as_of"), // data de referência dos dados coletados
    remoteVersion: text("remote_version"), // ETag/Last-Modified do arquivo remoto
    message: text("message"),
  },
  (t) => [index("ingest_runs_job_idx").on(t.job, t.startedAt)],
);

/** Watchlist pessoal. */
export const watchlist = sqliteTable("watchlist", {
  ticker: text("ticker").primaryKey(),
  addedAt: text("added_at").notNull(),
  note: text("note"),
});

/** Posições da carteira pessoal. */
export const portfolioPositions = sqliteTable("portfolio_positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  quantity: real("quantity").notNull(),
  avgPrice: real("avg_price").notNull(),
  openedAt: text("opened_at"),
  note: text("note"),
});

/** Relatórios gerados pela IA, guardados com a data dos dados usados. */
export const aiReports = sqliteTable(
  "ai_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    model: text("model").notNull(),
    createdAt: text("created_at").notNull(),
    dataAsOf: text("data_as_of"),
    content: text("content").notNull(), // markdown
    toolTrace: text("tool_trace"), // JSON com as chamadas de ferramentas usadas
  },
  (t) => [index("ai_reports_ticker_idx").on(t.ticker, t.createdAt)],
);

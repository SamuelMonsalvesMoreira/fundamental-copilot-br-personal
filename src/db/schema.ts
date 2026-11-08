/**
 * Esquema do banco local (SQLite via Drizzle).
 *
 * Regra do projeto: todo dado guardado aqui carrega a FONTE e a DATA de
 * referência, para que a interface e a IA possam sempre citá-las.
 *
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
  layout: text("layout"), // standard | bank | insurance (formato das demonstrações)
  listingSegment: text("listing_segment"),
  shareScale: real("share_scale"), // multiplica share_counts (CVM às vezes informa em milhares)
  shareScaleNote: text("share_scale_note"),
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
    changePct: real("change_pct"),
    adjClose: real("adj_close"),
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

/** Documentos DFP/ITR entregues à CVM. */
export const filings = sqliteTable(
  "filings",
  {
    cnpj: text("cnpj").notNull(),
    doc: text("doc").notNull(), // DFP | ITR
    periodEnd: text("period_end").notNull(),
    version: integer("version").notNull(),
    receivedAt: text("received_at"),
    link: text("link"),
  },
  (t) => [primaryKey({ columns: [t.cnpj, t.doc, t.periodEnd] })],
);

/** Linhas das demonstrações como publicadas na CVM (valores em R$). */
export const statementLines = sqliteTable(
  "statement_lines",
  {
    cnpj: text("cnpj").notNull(),
    doc: text("doc").notNull(),
    statement: text("statement").notNull(), // BPA | BPP | DRE | DFC_MD | DFC_MI | DVA
    consolidated: integer("consolidated", { mode: "boolean" }).notNull(),
    periodStart: text("period_start").notNull(), // '' para balanço
    periodEnd: text("period_end").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    value: real("value"),
    fixed: integer("fixed", { mode: "boolean" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.cnpj, t.doc, t.statement, t.periodStart, t.periodEnd, t.code] })],
);

/** Contas padronizadas extraídas das demonstrações (ver src/ingest/cvm/standardize.ts). */
export const finValues = sqliteTable(
  "fin_values",
  {
    cnpj: text("cnpj").notNull(),
    metric: text("metric").notNull(),
    periodStart: text("period_start").notNull(), // '' para saldos de balanço
    periodEnd: text("period_end").notNull(),
    value: real("value").notNull(),
    doc: text("doc").notNull(),
    consolidated: integer("consolidated", { mode: "boolean" }).notNull(),
    origin: text("origin").notNull(),
  },
  (t) => [primaryKey({ columns: [t.cnpj, t.metric, t.periodStart, t.periodEnd] })],
);

/** Quantidade de ações (composição do capital, DFP/ITR). */
export const shareCounts = sqliteTable(
  "share_counts",
  {
    cnpj: text("cnpj").notNull(),
    periodEnd: text("period_end").notNull(),
    doc: text("doc").notNull(),
    ordinary: real("ordinary"),
    preferred: real("preferred"),
    total: real("total"),
    treasuryOrdinary: real("treasury_ordinary"),
    treasuryPreferred: real("treasury_preferred"),
    treasuryTotal: real("treasury_total"),
  },
  (t) => [primaryKey({ columns: [t.cnpj, t.periodEnd] })],
);

/** Informações de mercado por ticker (lista diária da brapi). */
export const marketInfo = sqliteTable("market_info", {
  ticker: text("ticker").primaryKey(),
  name: text("name"),
  sector: text("sector"),
  subsector: text("subsector"),
  subType: text("sub_type"),
  logo: text("logo"),
  source: text("source").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Controle de buscas sob demanda (histórico/proventos) por ticker. */
export const tickerFetches = sqliteTable(
  "ticker_fetches",
  {
    ticker: text("ticker").notNull(),
    kind: text("kind").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    status: text("status").notNull(),
    message: text("message"),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.kind] })],
);

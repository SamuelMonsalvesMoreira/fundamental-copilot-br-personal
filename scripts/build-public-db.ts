/**
 * Gera os bancos do site público, sem nenhum dado pessoal.
 *
 *   npm run public:db -- seed     # data/seed.db: base completa que o robô diário atualiza
 *   npm run public:db -- site     # data/public.db: versão enxuta que vai para o site
 *
 * Os dois abrem de `DATABASE_PATH` (padrão data/app.db).
 */
import "./env";
import Database from "better-sqlite3";
import { existsSync, rmSync, statSync } from "node:fs";

const PERSONAL = ["watchlist", "portfolio_positions", "projections", "peer_choices", "ai_reports"];

/** Só o que as telas públicas leem; o histórico detalhado é o que mais pesa. */
const STATEMENT_YEARS = 3;

const mode = process.argv[2];
if (mode !== "seed" && mode !== "site") throw new Error("Use: public:db -- seed | site");

const source = process.env.DATABASE_PATH || "data/app.db";
const target = mode === "seed" ? "data/seed.db" : "data/public.db";
if (!existsSync(source)) throw new Error(`Banco não encontrado: ${source}`);
for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(target + suffix, { force: true });

const from = new Database(source, { readonly: true, fileMustExist: true });
from.prepare("VACUUM INTO ?").run(target);
from.close();

const db = new Database(target);
db.pragma("journal_mode = DELETE");
for (const table of PERSONAL) db.prepare(`DELETE FROM ${table}`).run();

if (mode === "site") {
  const cut = `${new Date().getFullYear() - STATEMENT_YEARS}-01-01`;
  // A aba Demonstrações só mostra balanços anuais recentes.
  const lines = db.prepare("DELETE FROM statement_lines WHERE period_end < ? OR doc <> 'DFP'").run(cut).changes;
  // Os gráficos usam um ponto por semana: acima de um ano, basta o último pregão de cada semana.
  const dailyUntil = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  db.prepare(
    `CREATE TEMP TABLE keep_quotes AS
       SELECT ticker, MAX(date) AS date FROM quotes_daily WHERE date < ? GROUP BY ticker, strftime('%Y-%W', date)`,
  ).run(dailyUntil);
  db.exec("CREATE UNIQUE INDEX temp.keep_quotes_idx ON keep_quotes (ticker, date)");
  const quotes = db
    .prepare(
      `DELETE FROM quotes_daily WHERE date < ? AND NOT EXISTS (
         SELECT 1 FROM keep_quotes k WHERE k.ticker = quotes_daily.ticker AND k.date = quotes_daily.date
       )`,
    )
    .run(dailyUntil).changes;
  db.exec("DROP TABLE keep_quotes");
  console.log(`Removidas: ${lines} linhas de demonstrações e ${quotes} cotações antigas.`);
}

db.exec("VACUUM");
for (const table of PERSONAL) {
  const { n } = db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
  if (n !== 0) throw new Error(`Tabela pessoal não ficou vazia: ${table}`);
}
db.close();
console.log(`${target}: ${(statSync(target).size / 1024 / 1024).toFixed(1)} MB`);

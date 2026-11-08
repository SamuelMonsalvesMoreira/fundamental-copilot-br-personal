/**
 * Coleta de mercado.
 *
 *   npm run ingest:market                 # macro + cotações do dia + escala de ações
 *   npm run ingest:market -- --full-macro # recarrega as séries do BCB desde 2010
 *   npm run ingest:market -- --ticker WEGE3 --ticker PETR4   # histórico e proventos (exige BRAPI_TOKEN)
 */
import "./env";
import { parseArgs } from "node:util";
import { openDatabase } from "../src/db/open";
import { fetchTickerHistory } from "../src/ingest/brapi";
import { ingestDailyMarket } from "../src/ingest/market";

const { values } = parseArgs({
  options: {
    "full-macro": { type: "boolean", default: false },
    ticker: { type: "string", multiple: true },
  },
});

const log = (m: string) => console.log(`[${new Date().toLocaleTimeString("pt-BR")}] ${m}`);
const { sqlite } = openDatabase();

try {
  if (values.ticker?.length) {
    for (const t of values.ticker) {
      try {
        const r = await fetchTickerHistory(sqlite, t);
        log(`${r.ticker}: ${r.historyPoints} pregões (${r.range}), ${r.dividends} proventos.`);
      } catch (err) {
        log(`ERRO ${t}: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    }
  } else {
    const { errors } = await ingestDailyMarket(sqlite, { log, fullMacro: values["full-macro"] });
    if (errors.length) process.exitCode = 1;
  }
} finally {
  sqlite.close();
}

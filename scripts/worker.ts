/**
 * Agendador das coletas. Deixe rodando junto com o app:
 *
 *   npm run worker          # só o agendador
 *   npm run dev:all         # app + agendador
 *
 * Ao iniciar, roda na hora qualquer coleta que esteja atrasada.
 */
import "./env";
import cron from "node-cron";
import { openDatabase } from "../src/db/open";
import { ingestCvm } from "../src/ingest/cvm";
import { ingestDailyMarket } from "../src/ingest/market";
import { hoursSinceLastOk, isMarketStale, JOBS, TIMEZONE } from "../src/ingest/schedule";

const log = (m: string) => console.log(`[worker ${new Date().toLocaleString("pt-BR", { timeZone: TIMEZONE })}] ${m}`);
const { sqlite } = openDatabase();

let busy = false;
async function exclusive(name: string, fn: () => Promise<unknown>) {
  if (busy) {
    log(`${name}: outra coleta em andamento, pulando.`);
    return;
  }
  busy = true;
  log(`${name}: iniciando.`);
  try {
    await fn();
    log(`${name}: concluída.`);
  } catch (err) {
    log(`${name}: ERRO ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    busy = false;
  }
}

const runMarket = () => exclusive(JOBS.market.name, () => ingestDailyMarket(sqlite, { log }));
const runCvm = () => {
  const year = new Date().getFullYear();
  return exclusive(JOBS.cvm.name, () => ingestCvm(sqlite, { fromYear: year - 1, log }));
};

cron.schedule(JOBS.market.cron, runMarket, { timezone: TIMEZONE });
cron.schedule(JOBS.cvm.cron, runCvm, { timezone: TIMEZONE });
log(`Agendado: mercado "${JOBS.market.cron}", CVM "${JOBS.cvm.cron}" (${TIMEZONE}).`);

// Recupera atrasos ao iniciar
if (hoursSinceLastOk(sqlite, JOBS.cvm.runJob) > JOBS.cvm.maxAgeHours) await runCvm();
if (isMarketStale(hoursSinceLastOk(sqlite, JOBS.market.runJob))) await runMarket();

const shutdown = () => {
  log("Encerrando.");
  sqlite.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

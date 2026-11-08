/**
 * Rotina diária de mercado: macro (BCB), cotações do dia (brapi),
 * conferência da escala de ações e histórico dos tickers da watchlist.
 */
import type Database from "better-sqlite3";
import { ingestMacro } from "./bcb";
import { ingestQuoteList } from "./brapi";
import { refreshHistories } from "./history";
import { resolveShareScales } from "./share-scale";
import { refreshSnapshots } from "./snapshots";

export async function ingestDailyMarket(sqlite: Database.Database, opts: { log?: (m: string) => void; fullMacro?: boolean } = {}) {
  const log = opts.log ?? (() => {});
  const errors: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      const msg = `${name}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      log(`ERRO ${msg}`);
    }
  };

  await step("Banco Central", () => ingestMacro(sqlite, { full: opts.fullMacro, log }));
  await step("Cotações", () => ingestQuoteList(sqlite, { log }));
  await step("Escala das ações", async () => {
    const s = resolveShareScales(sqlite);
    log(`Escala de ações: ${s.resolved} conferidas (${s.thousands} em milhares), ${s.unresolved} sem conferência.`);
  });

  // Preços e proventos: cada ticker é atualizado no máximo uma vez por semana.
  await step("Histórico", () => refreshHistories(sqlite, { log }));

  await step("Indicadores", async () => {
    const r = refreshSnapshots(sqlite);
    log(`Indicadores recalculados para ${r.count} companhias.`);
  });
  return { errors };
}

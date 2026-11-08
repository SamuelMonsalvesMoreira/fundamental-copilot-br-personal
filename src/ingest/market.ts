/**
 * Rotina diária de mercado: macro (BCB), cotações do dia (brapi),
 * conferência da escala de ações e histórico dos tickers da watchlist.
 */
import type Database from "better-sqlite3";
import { ingestMacro } from "./bcb";
import { ensureTickerHistory, hasBrapiToken, ingestQuoteList } from "./brapi";
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

  if (hasBrapiToken()) {
    const watch = sqlite.prepare(`SELECT ticker FROM watchlist`).all() as { ticker: string }[];
    for (const { ticker } of watch) {
      await step(`Histórico ${ticker}`, async () => {
        const r = await ensureTickerHistory(sqlite, ticker, 20);
        if (r) log(`${ticker}: ${r.historyPoints} pregões, ${r.dividends} proventos.`);
      });
    }
  } else {
    log("BRAPI_TOKEN não configurado: histórico e proventos por ticker não serão atualizados.");
  }
  await step("Indicadores", async () => {
    const r = refreshSnapshots(sqlite);
    log(`Indicadores recalculados para ${r.count} companhias.`);
  });
  return { errors };
}

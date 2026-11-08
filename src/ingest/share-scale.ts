/**
 * Escala da quantidade de ações.
 *
 * Na "composição do capital" da CVM muitas empresas informam a quantidade
 * em MILHARES (Itaú: 11.026.869 em vez de ~11 bilhões), e o arquivo não
 * diz qual escala foi usada. Resolvemos comparando com o valor de mercado
 * informado pela brapi:
 *
 *     valor de mercado ≈ ações ON × preço ON + ações PN × preço PN
 *
 * e escolhendo o fator (1 ou 1.000) que deixa os dois mais próximos.
 * Se nenhum fator ficar perto (diferença maior que ~2x), não arriscamos:
 * a escala fica indefinida e os indicadores por ação ficam indisponíveis.
 */
import type Database from "better-sqlite3";

export const CANDIDATE_SCALES = [1, 1000, 1_000_000] as const;
/** Tolerância: o valor calculado precisa estar entre 1/2,2x e 2,2x do de mercado. */
const MAX_LOG_DIFF = Math.log10(2.2);

export interface ScaleInput {
  marketCap: number | null; // brapi, R$
  ordinary: number | null; // CVM, ações em circulação ON (escala desconhecida)
  preferred: number | null;
  priceOrdinary: number | null;
  pricePreferred: number | null;
}

export interface ScaleDecision {
  scale: number | null;
  ratio: number | null; // valor de mercado / calculado com o fator escolhido
  note: string;
}

export function chooseShareScale(i: ScaleInput): ScaleDecision {
  if (!i.marketCap || i.marketCap <= 0) return { scale: null, ratio: null, note: "sem valor de mercado para conferir" };
  const on = i.ordinary ?? 0;
  const pn = i.preferred ?? 0;
  // se uma classe não tem cotação própria, usa o preço da outra
  const pOn = i.priceOrdinary ?? i.pricePreferred;
  const pPn = i.pricePreferred ?? i.priceOrdinary;
  if (!pOn || !pPn || on + pn <= 0) return { scale: null, ratio: null, note: "sem preço ou quantidade de ações" };

  const base = on * pOn + pn * pPn;
  let best: ScaleDecision = { scale: null, ratio: null, note: "" };
  let bestDiff = Infinity;
  for (const f of CANDIDATE_SCALES) {
    const ratio = i.marketCap / (base * f);
    const diff = Math.abs(Math.log10(ratio));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = { scale: f, ratio, note: "" };
    }
  }
  if (bestDiff > MAX_LOG_DIFF) {
    return { scale: null, ratio: best.ratio, note: `valor de mercado não confere com nenhuma escala (razão ${best.ratio?.toFixed(2)})` };
  }
  return { ...best, note: best.scale === 1 ? "unidades" : `informado em ${best.scale === 1000 ? "milhares" : "milhões"}` };
}

/** Aplica a decisão a todas as companhias com cotação e composição do capital. */
export function resolveShareScales(sqlite: Database.Database) {
  const companies = sqlite
    .prepare(
      `SELECT c.cnpj,
              s.ordinary - COALESCE(s.treasury_ordinary, 0)   AS ordinary,
              s.preferred - COALESCE(s.treasury_preferred, 0) AS preferred
         FROM companies c
         JOIN share_counts s ON s.cnpj = c.cnpj
        WHERE s.period_end = (SELECT MAX(period_end) FROM share_counts WHERE cnpj = c.cnpj)`,
    )
    .all() as Array<{ cnpj: string; ordinary: number | null; preferred: number | null }>;

  // última cotação + valor de mercado de cada ticker da companhia
  const quotes = sqlite.prepare(
    `SELECT t.share_class AS cls, q.close, q.market_cap AS mcap
       FROM tickers t
       JOIN quotes_daily q ON q.ticker = t.ticker
      WHERE t.cnpj = ? AND q.date = (SELECT MAX(date) FROM quotes_daily WHERE ticker = t.ticker)`,
  );
  const update = sqlite.prepare(`UPDATE companies SET share_scale = ?, share_scale_note = ? WHERE cnpj = ?`);

  const stats = { resolved: 0, unresolved: 0, thousands: 0 };
  sqlite.transaction(() => {
    for (const c of companies) {
      const qs = quotes.all(c.cnpj) as Array<{ cls: string; close: number; mcap: number | null }>;
      const on = qs.find((q) => q.cls === "ON");
      const pn = qs.find((q) => q.cls === "PN");
      const marketCap = Math.max(0, ...qs.map((q) => q.mcap ?? 0)) || null;
      const d = chooseShareScale({
        marketCap,
        ordinary: c.ordinary,
        preferred: c.preferred,
        priceOrdinary: on?.close ?? null,
        pricePreferred: pn?.close ?? null,
      });
      // sem cotação de ON/PN (só units), não há como conferir
      update.run(d.scale, d.note, c.cnpj);
      if (d.scale === null) stats.unresolved++;
      else {
        stats.resolved++;
        if (d.scale > 1) stats.thousands++;
      }
    }
  })();
  return stats;
}

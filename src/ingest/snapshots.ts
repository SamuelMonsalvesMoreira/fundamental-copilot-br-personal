/**
 * Recalcula os indicadores de todas as companhias e guarda em
 * company_snapshots (base de pares, screener e comparador).
 * Roda depois de cada coleta de mercado ou da CVM.
 */
import type Database from "better-sqlite3";
import { analyzeByCnpj, loadCompanyMeta, sectorKey } from "@/data/company-data";

export function refreshSnapshots(sqlite: Database.Database) {
  const cnpjs = (sqlite.prepare(`SELECT DISTINCT cnpj FROM fin_values`).all() as { cnpj: string }[]).map((r) => r.cnpj);
  const insert = sqlite.prepare(
    `INSERT OR REPLACE INTO company_snapshots (
       cnpj, ticker, name, sector, sector_key, layout, price, price_date, financials_end, market_cap, volume,
       pl, pvp, ev_ebitda, psr, roe, roic, roa, gross_margin, ebitda_margin, net_margin,
       net_debt_ebitda, current_ratio, dy, payout, revenue_cagr5y, earnings_cagr5y,
       revenue_ttm, net_income_ttm, computed_at)
     VALUES (@cnpj, @ticker, @name, @sector, @sectorKey, @layout, @price, @priceDate, @financialsEnd, @marketCap, @volume,
       @pl, @pvp, @evEbitda, @psr, @roe, @roic, @roa, @grossMargin, @ebitdaMargin, @netMargin,
       @netDebtEbitda, @currentRatio, @dy, @payout, @revenueCagr5y, @earningsCagr5y,
       @revenueTtm, @netIncomeTtm, @now)`,
  );
  const now = new Date().toISOString();
  let count = 0;

  const rows = cnpjs.flatMap((cnpj) => {
    const meta = loadCompanyMeta(sqlite, cnpj);
    if (!meta) return [];
    const a = analyzeByCnpj(sqlite, cnpj);
    if (!a.input.ticker) return [];
    const v = (k: string) => a.indicators[k]?.value ?? null;
    const q = a.input.quotes.find((x) => x.ticker === a.input.ticker);
    return [
      {
        cnpj,
        ticker: a.input.ticker,
        name: meta.tradeName ?? meta.name,
        sector: meta.sector,
        sectorKey: sectorKey(meta.sector),
        layout: meta.layout,
        price: a.price?.close ?? null,
        priceDate: a.price?.date ?? null,
        financialsEnd: a.ttm?.end ?? null,
        marketCap: a.marketCap?.value ?? null,
        volume: q?.volume ?? null,
        pl: v("pl"),
        pvp: v("pvp"),
        evEbitda: v("evEbitda"),
        psr: v("psr"),
        roe: v("roe"),
        roic: v("roic"),
        roa: v("roa"),
        grossMargin: v("grossMargin"),
        ebitdaMargin: v("ebitdaMargin"),
        netMargin: v("netMargin"),
        netDebtEbitda: v("netDebtEbitda"),
        currentRatio: v("currentRatio"),
        dy: v("dy"),
        payout: v("payout"),
        revenueCagr5y: v("revenueCagr5y"),
        earningsCagr5y: v("earningsCagr5y"),
        revenueTtm: a.ttm?.values.revenue ?? null,
        netIncomeTtm: a.ttm?.values.netIncomeParent ?? null,
        now,
      },
    ];
  });

  sqlite.transaction(() => {
    sqlite.prepare(`DELETE FROM company_snapshots`).run();
    for (const r of rows) {
      insert.run(r);
      count++;
    }
  })();
  return { count };
}

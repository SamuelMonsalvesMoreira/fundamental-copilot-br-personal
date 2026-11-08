import "server-only";
import { sqlite } from "@/db/client";
import type { ScreenerRow } from "@/analytics/screener";

/** Todas as empresas com cotação e indicadores calculados. */
export function getScreenerRows(): ScreenerRow[] {
  return sqlite
    .prepare(
      `SELECT cnpj, ticker, name, sector, layout, price, price_date AS priceDate, financials_end AS financialsEnd,
              market_cap AS marketCap, volume * price AS liquidity,
              pl, pvp, ev_ebitda AS evEbitda, roe, roic, net_margin AS netMargin, ebitda_margin AS ebitdaMargin,
              net_debt_ebitda AS netDebtEbitda, dy, payout, revenue_cagr5y AS revenueCagr5y, earnings_cagr5y AS earningsCagr5y
         FROM company_snapshots
        WHERE price IS NOT NULL
        ORDER BY market_cap DESC NULLS LAST`,
    )
    .all() as ScreenerRow[];
}

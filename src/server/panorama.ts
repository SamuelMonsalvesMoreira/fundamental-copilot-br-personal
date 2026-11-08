import "server-only";
import { buildOverview, type MarketRow } from "@/analytics/market-overview";
import { sqlite } from "@/db/client";
import { getMacroSnapshot } from "./macro";

export function getPanorama() {
  const rows = sqlite
    .prepare(
      `SELECT ticker, name, sector, market_cap AS marketCap, price * volume AS liquidity, pl, pvp, roe, dy,
              net_debt_ebitda AS netDebtEbitda, price_date AS priceDate, financials_end AS financialsEnd
         FROM company_snapshots
        WHERE price IS NOT NULL AND market_cap IS NOT NULL
        ORDER BY market_cap DESC`,
    )
    .all() as MarketRow[];
  const macro = getMacroSnapshot();
  const selic = macro.find((m) => m.key === "selic")?.value ?? null;
  return { overview: buildOverview(rows, selic), macro, selic };
}

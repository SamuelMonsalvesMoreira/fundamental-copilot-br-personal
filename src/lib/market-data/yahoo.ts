import type { MarketDataQuote } from "./types";

interface YahooChartMeta {
  symbol?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketTime?: number;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{ meta?: YahooChartMeta }>;
    error?: unknown;
  };
}

interface YahooReportedValue {
  raw?: number;
}

interface YahooTimeseriesPoint {
  reportedValue?: YahooReportedValue;
}

interface YahooTimeseriesResult {
  meta?: { type?: string[] };
  trailingMarketCap?: YahooTimeseriesPoint[];
  quarterlyBasicAverageShares?: YahooTimeseriesPoint[];
}

interface YahooTimeseriesResponse {
  timeseries?: {
    result?: YahooTimeseriesResult[];
  };
}

const YAHOO_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; FundamentalCopilotBR/1.0)",
};

function toYahooSymbol(ticker: string): string {
  const normalized = ticker.trim().toUpperCase();
  return normalized.endsWith(".SA") ? normalized : `${normalized}.SA`;
}

function latestRaw(points?: YahooTimeseriesPoint[]): number | undefined {
  if (!points?.length) return undefined;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const raw = points[index]?.reportedValue?.raw;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  }
  return undefined;
}

async function getYahooMarketCap(symbol: string, price: number): Promise<number | undefined> {
  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const threeYearsAgo = nowSeconds - 3 * 365 * 24 * 60 * 60;
    const url = new URL(
      `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`,
    );
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("type", "trailingMarketCap,quarterlyBasicAverageShares");
    url.searchParams.set("period1", String(threeYearsAgo));
    url.searchParams.set("period2", String(nowSeconds + 24 * 60 * 60));

    const response = await fetch(url, {
      headers: YAHOO_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return undefined;

    const data = (await response.json()) as YahooTimeseriesResponse;
    const results = data.timeseries?.result ?? [];
    const marketCapResult = results.find((item) => item.meta?.type?.includes("trailingMarketCap"));
    const marketCap = latestRaw(marketCapResult?.trailingMarketCap);
    if (marketCap) return marketCap;

    const sharesResult = results.find((item) => item.meta?.type?.includes("quarterlyBasicAverageShares"));
    const shares = latestRaw(sharesResult?.quarterlyBasicAverageShares);
    return shares ? shares * price : undefined;
  } catch {
    return undefined;
  }
}

export async function getYahooQuote(ticker: string): Promise<MarketDataQuote | null> {
  try {
    const symbol = toYahooSymbol(ticker);
    const url = new URL(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
    );
    url.searchParams.set("interval", "1d");
    url.searchParams.set("range", "5d");

    const response = await fetch(url, {
      headers: YAHOO_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as YahooChartResponse;
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;

    const previousClose = meta.previousClose ?? meta.chartPreviousClose;
    const change = typeof previousClose === "number" ? price - previousClose : undefined;
    const changePercent =
      typeof previousClose === "number" && previousClose !== 0
        ? (change! / previousClose) * 100
        : undefined;
    const marketCap = await getYahooMarketCap(symbol, price);

    return {
      ticker: ticker.trim().toUpperCase().replace(/\.SA$/, ""),
      price,
      change,
      changePercent,
      marketCap,
      updatedAt:
        typeof meta.regularMarketTime === "number"
          ? new Date(meta.regularMarketTime * 1000).toISOString()
          : undefined,
      source: "yahoo",
    };
  } catch {
    return null;
  }
}

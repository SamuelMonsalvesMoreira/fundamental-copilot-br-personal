export interface MarketDataQuote {
  ticker: string;
  price: number;
  change?: number;
  changePercent?: number;
  marketCap?: number;
  updatedAt?: string;
  source: "yahoo" | "brapi" | "mock";
}

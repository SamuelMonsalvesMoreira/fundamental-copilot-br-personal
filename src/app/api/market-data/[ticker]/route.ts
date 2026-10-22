import { NextResponse } from "next/server";
import { getYahooQuote } from "@/lib/market-data/yahoo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  try {
    const { ticker } = await params;

    if (!ticker || typeof ticker !== "string") {
      return NextResponse.json({ quote: null });
    }

    const quote = await getYahooQuote(ticker.toUpperCase());
    return NextResponse.json({ quote });
  } catch {
    return NextResponse.json({ quote: null });
  }
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { getYahooQuote } from "./yahoo";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getYahooQuote", () => {
  it("normalizes a B3 ticker and maps Yahoo data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        chart: {
          result: [{
            meta: {
              symbol: "PETR4.SA",
              regularMarketPrice: 40,
              chartPreviousClose: 38,
              regularMarketTime: 1_700_000_000,
            },
          }],
          error: null,
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        timeseries: {
          result: [{
            meta: { type: ["trailingMarketCap"] },
            trailingMarketCap: [{ reportedValue: { raw: 500_000_000_000 } }],
          }],
        },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const quote = await getYahooQuote("petr4");

    expect(fetchMock.mock.calls[0][0].toString()).toContain("PETR4.SA");
    expect(quote).toMatchObject({
      ticker: "PETR4",
      price: 40,
      change: 2,
      marketCap: 500_000_000_000,
      source: "yahoo",
    });
    expect(quote?.changePercent).toBeCloseTo(5.2632, 3);
  });

  it("returns null when Yahoo does not return a usable price", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ chart: { result: [{ meta: {} }] } }), { status: 200 }),
    ));

    await expect(getYahooQuote("VALE3")).resolves.toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { buildOverview, type MarketRow } from "./market-overview";

const row = (ticker: string, marketCap: number, over: Partial<MarketRow> = {}): MarketRow => ({
  ticker,
  name: ticker,
  sector: "Bancos",
  marketCap,
  liquidity: 1_000_000,
  pl: 10,
  pvp: 1,
  roe: 0.2,
  dy: 0.05,
  netDebtEbitda: 1,
  priceDate: "2026-11-06",
  financialsEnd: "2026-09-30",
  ...over,
});

describe("panorama do mercado", () => {
  it("soma o valor de todas, mas calcula medianas só das líquidas", () => {
    const o = buildOverview([row("A3", 100, { pl: 8 }), row("B3", 200, { pl: 12 }), row("ILIQ3", 50, { pl: 90, liquidity: 480 })], 0.1375);
    expect(o.all).toBe(3);
    expect(o.totalMarketCap).toBe(350);
    expect(o.liquid.map((r) => r.ticker)).toEqual(["A3", "B3"]);
    expect(o.medianPl).toBe(10);
  });

  it("múltiplos negativos ficam fora da mediana; ROE negativo entra", () => {
    const o = buildOverview([row("A3", 1, { pl: 8, roe: -0.1 }), row("B3", 1, { pl: -5, roe: 0.3 })], 0.1375);
    expect(o.medianPl).toBe(8);
    expect(o.medianRoe).toBeCloseTo(0.1);
  });

  it("conta quem tem ROE acima da Selic e não inventa sem Selic", () => {
    const rows = [row("A3", 1, { roe: 0.2 }), row("B3", 1, { roe: 0.1 }), row("C3", 1, { roe: null })];
    expect(buildOverview(rows, 0.1375).aboveSelic).toBe(1);
    expect(buildOverview(rows, null).aboveSelic).toBeNull();
  });

  it("ordena os dez maiores setores por valor de mercado", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`S${i}`, i + 1, { sector: `Setor ${i}` }));
    const o = buildOverview(rows, null);
    expect(o.sectors).toHaveLength(10);
    expect(o.sectors[0]).toMatchObject({ sector: "Setor 11", marketCap: 12, companies: 1 });
  });

  it("usa as datas mais recentes e aceita banco vazio", () => {
    const o = buildOverview([row("A3", 1, { priceDate: "2026-11-05", financialsEnd: null }), row("B3", 1)], null);
    expect(o.priceDate).toBe("2026-11-06");
    expect(o.financialsEnd).toBe("2026-09-30");
    expect(buildOverview([], null)).toMatchObject({ all: 0, medianPl: null, priceDate: null, sectors: [] });
  });
});

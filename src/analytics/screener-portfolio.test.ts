import { describe, expect, it } from "vitest";
import { computePortfolio, validatePosition } from "./portfolio";
import { applyScreener, paramsToQuery, passes, PRESETS, queryToParams, type ScreenerRow } from "./screener";

const row = (over: Partial<ScreenerRow>): ScreenerRow => ({
  cnpj: "1",
  ticker: "AAAA3",
  name: "A",
  sector: "Bancos",
  layout: "standard",
  price: 10,
  priceDate: "2026-11-06",
  financialsEnd: "2026-09-30",
  marketCap: 1e10,
  liquidity: 5e6,
  pl: 8,
  pvp: 1,
  evEbitda: 5,
  roe: 0.2,
  roic: 0.18,
  netMargin: 0.12,
  ebitdaMargin: 0.25,
  netDebtEbitda: 1,
  dy: 0.07,
  payout: 0.5,
  revenueCagr5y: 0.1,
  earningsCagr5y: 0.12,
  ...over,
});

describe("screener", () => {
  it("percentuais e valores digitados como o usuário pensa (15 = 15%, 1 = R$ 1 mi)", () => {
    expect(passes(row({ roe: 0.16 }), { field: "roe", min: 15 })).toBe(true);
    expect(passes(row({ roe: 0.14 }), { field: "roe", min: 15 })).toBe(false);
    expect(passes(row({ liquidity: 900_000 }), { field: "liquidity", min: 1 })).toBe(false);
  });

  it("P/L negativo não passa em 'P/L < 10'", () => {
    expect(passes(row({ pl: -3 }), { field: "pl", max: 10 })).toBe(false);
    expect(passes(row({ pl: 9.9 }), { field: "pl", max: 10 })).toBe(true);
  });

  it("dívida líquida/EBITDA negativa (caixa líquido) passa em 'máximo 2'", () => {
    expect(passes(row({ netDebtEbitda: -0.5 }), { field: "netDebtEbitda", max: 2 })).toBe(true);
  });

  it("dado ausente não passa (nunca vira zero)", () => {
    expect(passes(row({ dy: null }), { field: "dy", min: 0 })).toBe(false);
  });

  it("filtro do exemplo: ROE > 15%, P/L < 10, DY > 6%", () => {
    const rows = [row({ ticker: "OK" }), row({ ticker: "CARA", pl: 12 }), row({ ticker: "SEMDY", dy: null })];
    const out = applyScreener(rows, PRESETS[0].query);
    expect(out.map((r) => r.ticker)).toEqual(["OK"]);
  });

  it("ordena com ausentes no fim", () => {
    const rows = [row({ ticker: "A", dy: 0.05 }), row({ ticker: "B", dy: null }), row({ ticker: "C", dy: 0.09 })];
    expect(applyScreener(rows, { filters: [], sort: { field: "dy", dir: "desc" } }).map((r) => r.ticker)).toEqual(["C", "A", "B"]);
  });

  it("filtros vão e voltam da URL", () => {
    const q = { filters: [{ field: "pl" as const, max: 10 }, { field: "roe" as const, min: 15 }], sector: "Bancos", sort: { field: "dy" as const, dir: "desc" as const } };
    const back = paramsToQuery(queryToParams(q));
    expect(back.filters).toEqual([
      { field: "pl", min: null, max: 10 },
      { field: "roe", min: 15, max: null },
    ]);
    expect(back.sector).toBe("Bancos");
    expect(back.sort).toEqual({ field: "dy", dir: "desc" });
  });
});

describe("carteira", () => {
  const positions = [
    { id: 1, ticker: "AAAA3", quantity: 100, avgPrice: 10, openedAt: null, note: null },
    { id: 2, ticker: "BBBB4", quantity: 50, avgPrice: 20, openedAt: null, note: null },
    { id: 3, ticker: "SEMQ3", quantity: 10, avgPrice: 5, openedAt: null, note: null },
  ];
  const s = computePortfolio(
    positions,
    { AAAA3: { close: 12, date: "2026-11-06" }, BBBB4: { close: 18, date: "2026-11-06" } },
    { AAAA3: 0.05, BBBB4: null },
  );

  it("valor, resultado e peso", () => {
    expect(s.value).toBe(1200 + 900);
    expect(s.pnl).toBe(2100 - 2000); // só posições com cotação
    expect(s.positions[0].pnlPct).toBeCloseTo(0.2);
    expect(s.positions[0].weight).toBeCloseTo(1200 / 2100);
    expect(s.unpriced).toEqual(["SEMQ3"]);
    expect(s.cost).toBe(2050);
  });

  it("proventos estimados só com DY conhecido", () => {
    expect(s.income12m).toBeCloseTo(60);
    expect(s.positions[1].income12m).toBeNull();
  });

  it("valida a entrada", () => {
    expect(validatePosition({ ticker: "WEGE3", quantity: 10, avgPrice: 40 })).toEqual([]);
    expect(validatePosition({ ticker: "x", quantity: 0, avgPrice: -1 })).toHaveLength(3);
  });
});

/**
 * Conferência com números PUBLICADOS pelas empresas (releases de resultado
 * do 4T25 / ano de 2025). Os dados de entrada são as DFPs reais da CVM
 * (recorte em __fixtures__/dfp-2019-2025.json).
 *
 * Diferenças esperadas e tolerâncias:
 * - Empresas divulgam EBITDA "ajustado" e lucro "recorrente"; nós usamos os
 *   valores contábeis, sem ajustes. Por isso algumas comparações têm margem.
 *
 * Fontes:
 * - WEG 4T25 (25/02/2026): receita 2025 R$ 40.804,1 mi; lucro R$ 6.376,2 mi;
 *   caixa líquido R$ 2,652 bi; ROIC 32,5%.
 * - Petrobras 4T25: lucro 2025 R$ 110,1 bi; EBITDA ajustado R$ 237,2 bi;
 *   dívida líquida/EBITDA ajustado 1,42x; dívida líquida US$ 60,6 bi.
 * - Itaú 4T25: lucro recorrente 2025 R$ 46,8 bi; ROE recorrente 23,4%.
 */
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/dfp-2019-2025.json";
import { analyzeCompany, type CompanyInput } from "./indicators";
import type { FinRow } from "./periods";
import type { Layout } from "@/ingest/cvm/standardize";

type Fx = { layout: Layout; rows: FinRow[]; shares: { periodEnd: string; ordinary: number; preferred: number; treasuryOrdinary: number; treasuryPreferred: number } };
const companies = fixture.companies as unknown as Record<string, Fx>;

function analyze(ticker: string, scale: number, price: { close: number; shareClass: "ON" | "PN" }) {
  const c = companies[ticker];
  const input: CompanyInput = {
    layout: c.layout,
    rows: c.rows,
    shares: { ...c.shares, scale },
    quotes: [{ ticker, shareClass: price.shareClass, close: price.close, date: "2025-12-30", marketCap: null, volume: 1 }],
    dividends: [],
    ticker,
  };
  return analyzeCompany(input);
}

const BI = 1e9;
const MI = 1e6;

describe("WEG (WEGE3) — 2025", () => {
  const a = analyze("WEGE3", 1, { close: 45, shareClass: "ON" });
  const v = a.ttm!.values;

  it("usa o exercício de 2025 completo", () => {
    expect(a.ttm?.kind).toBe("annual");
    expect(a.ttm?.end).toBe("2025-12-31");
  });

  it("receita e lucro iguais ao release", () => {
    expect(v.revenue! / MI).toBeCloseTo(40_804.1, 0);
    expect(v.netIncomeParent! / MI).toBeCloseTo(6_376.2, 0);
  });

  it("caixa líquido próximo do divulgado (R$ 2,652 bi, ±3%)", () => {
    const netCash = -a.indicators.netDebt.value!;
    expect(Math.abs(netCash / (2.652 * BI) - 1)).toBeLessThan(0.03);
  });

  it("ROIC segue a fórmula documentada (a WEG divulga 32,5% com outra base de capital)", () => {
    // NOPAT = 7.998,7 × (1 − 16,8%) = 6.652,1 mi
    // capital investido médio = média(PL + dívida líquida) de 2024 e 2025
    //   2025: 18.553,4 + 4.590,8 − 7.279,9 = 15.864,3 | 2024: 23.125,2 + 3.595,2 − 7.996,1 = 18.724,4
    // ROIC = 6.652,1 / 17.294,3 = 38,5%. A WEG usa "capital empregado" próprio;
    // com PL + dívida bruta daria 26,7%. O divulgado (32,5%) fica entre os dois.
    expect(a.indicators.roic.value!).toBeCloseTo(0.3846, 3);
    expect(a.indicators.roic.value!).toBeGreaterThan(0.267);
  });

  it("margem EBITDA e crescimento coerentes", () => {
    // EBITDA = EBIT 7.998,7 + D&A 1.001,3 = 9.000,0 mi → margem 22,1%
    expect(a.indicators.ebitda.value! / MI).toBeCloseTo(9_000.0, 0);
    expect(a.indicators.ebitdaMargin.value!).toBeCloseTo(0.2206, 3);
    // receita 2020 R$ 17,47 bi → 2025 R$ 40,80 bi
    expect(a.indicators.revenueCagr5y.value!).toBeCloseTo(Math.pow(40.804 / 17.47, 1 / 5) - 1, 2);
  });
});

describe("Petrobras (PETR4) — 2025", () => {
  const a = analyze("PETR4", 1, { close: 31, shareClass: "PN" });
  const v = a.ttm!.values;

  it("lucro igual ao release (R$ 110,1 bi)", () => {
    expect(v.netIncomeParent! / BI).toBeCloseTo(110.1, 1);
  });

  it("dívida líquida inclui arrendamentos, como a Petrobras divulga (~US$ 60,6 bi)", () => {
    // ~R$ 333 bi ao câmbio de fim de 2025 (~R$ 5,5/US$)
    const nd = a.indicators.netDebt.value! / BI;
    expect(nd).toBeGreaterThan(60.6 * 5.3);
    expect(nd).toBeLessThan(60.6 * 5.7);
  });

  it("EBITDA contábil próximo do ajustado (R$ 237,2 bi, ±5%)", () => {
    expect(Math.abs(a.indicators.ebitda.value! / (237.2 * BI) - 1)).toBeLessThan(0.05);
  });

  it("dívida líquida/EBITDA próxima da divulgada (1,42x, ±0,1)", () => {
    expect(Math.abs(a.indicators.netDebtEbitda.value! - 1.42)).toBeLessThan(0.1);
  });
});

describe("Itaú (ITUB4) — 2025", () => {
  // CVM informa a composição do capital em milhares para o Itaú
  const a = analyze("ITUB4", 1000, { close: 38, shareClass: "PN" });

  it("lucro contábil dos controladores", () => {
    expect(a.ttm!.values.netIncomeParent! / BI).toBeCloseTo(44.857, 2);
  });

  it("ROE contábil coerente com o ROE recorrente divulgado (23,4%)", () => {
    // Ajustando pela diferença entre lucro contábil (44,9) e recorrente (46,8)
    const expected = 0.234 * (44.857 / 46.8);
    expect(Math.abs(a.indicators.roe.value! - expected)).toBeLessThan(0.015);
  });

  it("não calcula indicadores sem sentido para bancos", () => {
    for (const k of ["evEbitda", "ebitdaMargin", "netDebtEbitda", "roic", "grossMargin"]) {
      expect(a.indicators[k].applicable).toBe(false);
      expect(a.indicators[k].value).toBeNull();
      expect(a.indicators[k].missing).toContain("bancos");
    }
  });

  it("ações em circulação ~11 bilhões com a escala conferida", () => {
    expect(a.sharesOutstanding! / BI).toBeGreaterThan(10.9);
    expect(a.sharesOutstanding! / BI).toBeLessThan(11.1);
  });
});

import { describe, expect, it } from "vitest";
import { analyzeCompany, cagr, effectiveTaxRate, marketCapOf, type CompanyInput } from "./indicators";
import { addYears, buildQuarterly, buildTtm, FinTable, type FinRow } from "./periods";
import { averageAnnualDividends, bazin, dcf, defaultDcfAssumptions, graham } from "./valuation";

const flow = (metric: FinRow["metric"], start: string, end: string, value: number, doc: FinRow["doc"] = "ITR"): FinRow => ({ metric, periodStart: start, periodEnd: end, value, doc });
const bal = (metric: FinRow["metric"], end: string, value: number): FinRow => ({ metric, periodStart: "", periodEnd: end, value, doc: "ITR" });

describe("períodos", () => {
  const rows: FinRow[] = [
    flow("revenue", "2025-01-01", "2025-12-31", 100, "DFP"),
    flow("revenue", "2025-01-01", "2025-09-30", 70),
    flow("revenue", "2026-01-01", "2026-09-30", 90),
    flow("revenue", "2026-07-01", "2026-09-30", 32),
    flow("revenue", "2026-01-01", "2026-06-30", 58),
    flow("netIncome", "2026-01-01", "2026-09-30", 9),
    bal("cash", "2026-09-30", 50),
  ];

  it("TTM = acumulado do ano + ano anterior − acumulado anterior", () => {
    const t = buildTtm(new FinTable(rows))!;
    expect(t.kind).toBe("ttm");
    expect(t.end).toBe("2026-09-30");
    expect(t.values.revenue).toBe(90 + 100 - 70);
    expect(t.composition).toBe("9M26 + 2025 − 9M25");
    expect(t.values.cash).toBe(50);
  });

  it("não estima quando falta uma parcela", () => {
    const t = buildTtm(new FinTable(rows))!;
    expect(t.values.netIncome).toBeUndefined(); // falta 2025 e 9M25 de lucro
  });

  it("trimestres: usa o publicado ou a diferença de acumulados", () => {
    const q = buildQuarterly(new FinTable(rows));
    const q3 = q.find((x) => x.label === "3T26")!;
    expect(q3.values.revenue).toBe(32);
    const q4 = q.find((x) => x.label === "4T25")!;
    expect(q4.values.revenue).toBe(30); // 100 − 70
  });

  it("datas", () => {
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
  });
});

describe("primitivas", () => {
  it("CAGR não existe com valores negativos", () => {
    expect(cagr(100, 161.051, 5)).toBeCloseTo(0.1, 6);
    expect(cagr(-10, 100, 5)).toBeNull();
  });

  it("alíquota efetiva limitada a 0–34%", () => {
    expect(effectiveTaxRate({ pretaxIncome: 100, incomeTax: -20 })).toBeCloseTo(0.2);
    expect(effectiveTaxRate({ pretaxIncome: 100, incomeTax: 10 })).toBe(0.34);
    expect(effectiveTaxRate({ pretaxIncome: -5, incomeTax: 0 })).toBe(0.34);
  });

  it("valor de mercado por classe; sem escala conferida usa a brapi", () => {
    const shares = { periodEnd: "2026-09-30", ordinary: 100, preferred: 50, treasuryOrdinary: 10, treasuryPreferred: 0, scale: 1 };
    const quotes = [
      { ticker: "ABCD3", shareClass: "ON", close: 10, date: "2026-11-06", marketCap: 999, volume: 1 },
      { ticker: "ABCD4", shareClass: "PN", close: 8, date: "2026-11-06", marketCap: 999, volume: 2 },
    ];
    expect(marketCapOf(shares, quotes)).toMatchObject({ value: 90 * 10 + 50 * 8, method: "calculado" });
    expect(marketCapOf({ ...shares, scale: null }, quotes)).toMatchObject({ value: 999, method: "brapi" });
  });
});

describe("indicadores", () => {
  const base: CompanyInput = {
    layout: "standard",
    ticker: "ABCD3",
    shares: { periodEnd: "2025-12-31", ordinary: 1000, preferred: 0, treasuryOrdinary: 0, treasuryPreferred: 0, scale: 1 },
    quotes: [{ ticker: "ABCD3", shareClass: "ON", close: 20, date: "2026-01-10", marketCap: null, volume: 1 }],
    dividends: [],
    rows: [
      flow("revenue", "2025-01-01", "2025-12-31", 1000, "DFP"),
      flow("ebit", "2025-01-01", "2025-12-31", 200, "DFP"),
      flow("depreciationAmortization", "2025-01-01", "2025-12-31", 50, "DFP"),
      flow("netIncomeParent", "2025-01-01", "2025-12-31", 100, "DFP"),
      flow("dividendsPaid", "2025-01-01", "2025-12-31", 40, "DFP"),
      bal("equityParent", "2025-12-31", 600),
      bal("equityParent", "2024-12-31", 400),
      bal("equity", "2025-12-31", 600),
      bal("shortTermDebt", "2025-12-31", 100),
      bal("longTermDebt", "2025-12-31", 300),
      bal("cash", "2025-12-31", 150),
    ],
  };
  const a = analyzeCompany(base);
  const i = a.indicators;

  it("valuation e rentabilidade", () => {
    expect(a.marketCap?.value).toBe(20_000);
    expect(i.pl.value).toBe(200); // 20.000 / 100
    expect(i.pvp.value).toBeCloseTo(20_000 / 600);
    expect(i.roe.value).toBeCloseTo(100 / 500); // PL médio (600+400)/2
    expect(i.netDebt.value).toBe(250);
    expect(i.ebitda.value).toBe(250);
    expect(i.netDebtEbitda.value).toBe(1);
    expect(i.evEbitda.value).toBeCloseTo((20_000 + 250) / 250);
    expect(i.lpa.value).toBe(0.1);
    expect(i.payout.value).toBe(0.4);
  });

  it("DY pela DFC quando não há proventos por ação, avisando", () => {
    expect(i.dy.value).toBeCloseTo(40 / 20_000);
    expect(i.dy.note).toContain("fluxo de caixa");
  });

  it("DY pelos proventos por data ex quando existem", () => {
    const b = analyzeCompany({
      ...base,
      dividends: [
        { ticker: "ABCD3", exDate: "2025-06-01", value: 1, kind: "DIVIDENDO" },
        { ticker: "ABCD3", exDate: "2024-06-01", value: 5, kind: "DIVIDENDO" }, // fora dos 12m
      ],
    });
    expect(b.indicators.dy.value).toBeCloseTo(1 / 20);
  });

  it("explica o que falta em vez de mostrar zero", () => {
    expect(i.grossMargin.value).toBeNull();
    expect(i.grossMargin.missing).toContain("Lucro bruto");
    expect(i.revenueCagr5y.missing).toContain("exercícios");
  });
});

describe("valuation", () => {
  it("Graham", () => {
    expect(graham(2, 18, 15).value).toBeCloseTo(Math.sqrt(22.5 * 2 * 18));
    expect(graham(-1, 10, 15).value).toBeNull();
  });

  it("Bazin", () => {
    const r = bazin({ dividendsPerShare: 1.2, minYield: 0.06, price: 15 });
    expect(r.value).toBeCloseTo(20);
    expect(r.upside).toBeCloseTo(20 / 15 - 1);
  });

  it("média anual de proventos conta anos sem pagamento como zero", () => {
    const d = averageAnnualDividends(
      [
        { ticker: "X", exDate: "2023-05-01", value: 1.5, kind: "DIVIDENDO" },
        { ticker: "X", exDate: "2025-05-01", value: 1.5, kind: "DIVIDENDO" },
      ],
      "X",
      "2026-11-06",
    )!;
    expect(d.perYear.map((p) => p.total)).toEqual([1.5, 0, 1.5]);
    expect(d.average).toBeCloseTo(1);
  });

  it("DCF bate com o cálculo manual", () => {
    const r = dcf({ baseFcf: 100, growthRate: 0.1, years: 2, terminalGrowth: 0.03, discountRate: 0.13, netDebt: 50, shares: 10 }, 100);
    const f1 = 110 / 1.13;
    const f2 = 121 / 1.13 ** 2;
    const tv = (121 * 1.03) / 0.1 / 1.13 ** 2;
    expect(r.enterpriseValue).toBeCloseTo(f1 + f2 + tv, 6);
    expect(r.value).toBeCloseTo((f1 + f2 + tv - 50) / 10, 6);
  });

  it("DCF recusa taxa ≤ crescimento na perpetuidade", () => {
    expect(dcf({ baseFcf: 1, growthRate: 0, years: 5, terminalGrowth: 0.1, discountRate: 0.1, netDebt: 0, shares: 1 }, 1).missing).toContain("taxa de desconto");
  });

  it("premissas padrão limitadas e explicadas", () => {
    const d = defaultDcfAssumptions({ annual: [], revenueCagr5y: 0.3, selic: 0.1375, ipca12m: 0.0458, netDebt: 10, minority: 2, shares: 5 });
    expect(d.growthRate).toBe(0.12);
    expect(d.discountRate).toBeCloseTo(0.1675);
    expect(d.terminalGrowth).toBeCloseTo(0.0458);
    expect(d.netDebt).toBe(12);
    expect(d.notes.discountRate).toContain("Selic");
  });
});

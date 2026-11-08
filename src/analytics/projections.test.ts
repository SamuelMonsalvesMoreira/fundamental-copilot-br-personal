import { describe, expect, it } from "vitest";
import { assumptionsSchema, defaultAssumptions, projectEarnings, type ProjectionAssumptions, type ProjectionBase } from "./projections";

const base: ProjectionBase = { netIncome: 1000, revenue: 10000, shares: 100, price: 100, baseEnd: "2026-09-30" };
const a: ProjectionAssumptions = { mode: "lucro", years: 3, growth: 0.1, netMargin: 0.1, payout: 0.5, exitPl: 10, overrides: {} };

describe("projeções", () => {
  it("projeta lucro, LPA, dividendo e rendimento", () => {
    const r = projectEarnings(base, a, { avgCost: 50 });
    expect(r.rows.map((x) => Math.round(x.netIncome))).toEqual([1100, 1210, 1331]);
    expect(r.rows[0].end).toBe("2027-09-30");
    expect(r.rows[0].eps).toBeCloseTo(11);
    expect(r.rows[0].dps).toBeCloseTo(5.5);
    expect(r.rows[0].yieldOnPrice).toBeCloseTo(0.055);
    expect(r.rows[0].yieldOnCost).toBeCloseTo(0.11);
  });

  it("calcula preço implícito e retorno sem reinvestir dividendos", () => {
    const r = projectEarnings(base, a);
    expect(r.exitPrice).toBeCloseTo(133.1);
    expect(r.cumulativeDps).toBeCloseTo(5.5 + 6.05 + 6.655);
    expect(r.totalReturn).toBeCloseTo((133.1 + 18.205) / 100 - 1);
    expect(r.annualizedReturn).toBeCloseTo(Math.pow(1.51305, 1 / 3) - 1);
  });

  it("valor digitado num ano substitui o calculado e os seguintes partem dele", () => {
    const r = projectEarnings(base, { ...a, overrides: { "2": { netIncome: 2000, payout: 0.8 } } });
    expect(r.rows[1]).toMatchObject({ netIncome: 2000, netIncomeOverridden: true, payout: 0.8, payoutOverridden: true, dividends: 1600 });
    expect(r.rows[2].netIncome).toBeCloseTo(2200);
    expect(r.rows[2].payout).toBe(0.5);
  });

  it("modo receita usa crescimento da receita e margem", () => {
    const r = projectEarnings(base, { ...a, mode: "receita", growth: 0.2, netMargin: 0.15 });
    expect(r.rows[0].revenue).toBeCloseTo(12000);
    expect(r.rows[0].netIncome).toBeCloseTo(1800);
  });

  it("prejuízo não paga dividendo nem cresce por percentual", () => {
    const r = projectEarnings({ ...base, netIncome: -500 }, a);
    expect(r.rows[0]).toMatchObject({ netIncome: -500, dividends: 0, growth: null, impliedPl: null });
    expect(r.exitPrice).toBeNull();
  });

  it("cenários somam a diferença ao crescimento", () => {
    expect(projectEarnings(base, a, { growthDelta: 0.05 }).rows[0].netIncome).toBeCloseTo(1150);
  });

  it("sem ações conferidas mostra totais e avisa, sem inventar valores por ação", () => {
    const r = projectEarnings({ ...base, shares: null }, a);
    expect(r.rows[0].netIncome).toBeCloseTo(1100);
    expect(r.rows[0].dps).toBeNull();
    expect(r.cumulativeDps).toBeNull();
    expect(r.missing.join()).toContain("ações");
  });

  it("sem lucro-base, só anos digitados aparecem", () => {
    const r = projectEarnings({ ...base, netIncome: null }, { ...a, overrides: { "1": { netIncome: 700 } } });
    expect(r.rows.map((x) => x.year)).toEqual([1, 2, 3]);
    expect(r.rows[1].netIncome).toBeCloseTo(770);
    const none = projectEarnings({ ...base, netIncome: null }, a);
    expect(none.rows).toEqual([]);
    expect(none.missing.join()).toContain("lucro-base");
  });
});

describe("premissas padrão", () => {
  const input = { annual: [], earningsCagr5y: null, revenueCagr5y: null, ttmPayout: null, currentPl: null, ipca12m: 0.0458, ttmNetMargin: null };

  it("limita o crescimento e explica a origem", () => {
    const d = defaultAssumptions({ ...input, earningsCagr5y: 0.22 });
    expect(d.assumptions.growth).toBe(0.12);
    expect(d.notes.growth).toContain("CAGR de lucro");
  });

  it("payout pela média dos anos com lucro; sem histórico usa 25%", () => {
    const d = defaultAssumptions({
      ...input,
      annual: [
        { netIncome: 100, dividendsPaid: 40, revenue: 1 },
        { netIncome: -10, dividendsPaid: 5, revenue: 1 },
        { netIncome: 100, dividendsPaid: 60, revenue: 1 },
      ],
    });
    expect(d.assumptions.payout).toBeCloseTo(0.5);
    expect(defaultAssumptions(input).assumptions.payout).toBe(0.25);
  });

  it("P/L de saída só quando o atual faz sentido", () => {
    expect(defaultAssumptions({ ...input, currentPl: 8.2 }).assumptions.exitPl).toBe(8.2);
    expect(defaultAssumptions({ ...input, currentPl: 95 }).assumptions.exitPl).toBeNull();
  });

  it("valida premissas salvas", () => {
    expect(assumptionsSchema.safeParse(a).success).toBe(true);
    expect(assumptionsSchema.safeParse({ ...a, years: 50 }).success).toBe(false);
    expect(assumptionsSchema.safeParse({ ...a, overrides: { x: {} } }).success).toBe(false);
  });
});

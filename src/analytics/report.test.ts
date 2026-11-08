import { describe, expect, it } from "vitest";
import { projectEarnings } from "./projections";
import { buildReport, type ReportOptions } from "./report";
import type { CompanyPageData, SeriesPoint } from "@/server/company";
import type { Indicator } from "./indicators";

const ind = (key: string, value: number | null, extra: Partial<Indicator> = {}): Indicator => ({
  key,
  label: key,
  group: "valuation",
  value,
  format: "multiple",
  formula: "",
  inputs: [],
  period: "",
  applicable: true,
  ...extra,
});

const point = (label: string, over: Partial<SeriesPoint> = {}): SeriesPoint => ({
  label,
  end: `${label}-12-31`,
  revenue: 1000,
  grossProfit: 400,
  ebitda: 250,
  ebit: 200,
  netIncome: 100,
  grossMargin: 0.4,
  ebitdaMargin: 0.25,
  netMargin: 0.1,
  netDebt: 100,
  netDebtEbitda: 0.4,
  equity: 500,
  operatingCashFlow: 200,
  capex: 50,
  fcf: 150,
  dividendsPaid: 40,
  ...over,
});

function page(indicators: Record<string, number | null>, over: Partial<CompanyPageData> = {}): CompanyPageData {
  const peers = [
    { cnpj: "1", ticker: "AAAA3", name: "A", marketCap: 1, pl: 10, pvp: 1, evEbitda: 5, roe: 0.1, netMargin: 0.1, dy: 0.05, netDebtEbitda: 1 },
    { cnpj: "2", ticker: "BBBB3", name: "B", marketCap: 1, pl: 12, pvp: 1.2, evEbitda: 6, roe: 0.12, netMargin: 0.1, dy: 0.05, netDebtEbitda: 1 },
  ];
  return {
    ticker: "ABCD3",
    meta: { cnpj: "9", cvmCode: "1", name: "ABCD SA", tradeName: "ABCD", layout: "standard", cvmSector: null, subsector: null, sector: "Máquinas", listingSegment: null, logo: null, shareScaleNote: null },
    classes: [],
    quote: { close: 20, changePct: 0, date: "2026-11-06", volume: 1, source: "Yahoo Finance" },
    indicators: Object.fromEntries(Object.entries(indicators).map(([k, v]) => [k, ind(k, v)])),
    ttm: { end: "2026-09-30", kind: "ttm", composition: "9M26 + 2025 − 9M25" },
    ttmValues: { revenue: 1000, netIncome: 100 },
    sources: { financials: null, price: null },
    unitNote: null,
    marketCapNote: null,
    sharesOutstanding: 100,
    annual: ["2021", "2022", "2023", "2024", "2025"].map((y) => point(y)),
    quarterly: [],
    priceHistory: [],
    historySource: "Yahoo Finance",
    dividendsByYear: [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, perShare: 1, paid: 40 })),
    valuation: { price: 20, graham: { value: 15, upside: -0.25, formula: "" }, lpa: 1, vpa: 5, bazin: { averageDps: 1.2, perYear: [], source: "" }, dcf: { notes: {} }, applicable: false },
    peers,
    peerGroup: { peers, quality: "boa", note: "" },
    ownHistory: null,
    macroDate: null,
    macro: { selic: 0.1375, cdi: 0.1365, ipca12m: 0.0458 },
    historyStatus: { message: null },
    watched: false,
    ...over,
  } as CompanyPageData;
}

const opts: ReportOptions = { macro: { selic: 0.1375, cdi: 0.1365, ipca12m: 0.0458 } };
const texts = (r: ReturnType<typeof buildReport>, id: string) => r.sections.find((s) => s.id === id)?.items ?? [];

describe("relatório pré-moldado", () => {
  it("empresa forte recebe sinais positivos com os números", () => {
    const r = buildReport(page({ roe: 0.25, roic: 0.2, netDebtEbitda: -0.3, currentRatio: 2, pl: 7, pvp: 0.8, marketCap: 2e9, netMargin: 0.1, revenueCagr5y: 0.12, earningsCagr5y: 0.15, dy: 0.08, payout: 0.5 }), opts);
    expect(texts(r, "rentabilidade")[0]).toMatchObject({ tone: "pos" });
    expect(texts(r, "rentabilidade")[0].text).toContain("25,0%");
    expect(texts(r, "divida")[0].text).toContain("Caixa líquido");
    expect(r.pillars.find((p) => p.label === "Rentabilidade")?.status).toBe("Forte");
    expect(r.pillars.find((p) => p.label === "Dívida e caixa")?.status).toBe("Forte");
    expect(r.summary[0]).toContain("ABCD (ABCD3)");
  });

  it("aponta riscos: ROE abaixo da Selic, dívida alta, payout acima de 100%", () => {
    const r = buildReport(page({ roe: 0.05, netDebtEbitda: 4.2, currentRatio: 0.7, payout: 1.4, dy: 0.03 }), opts);
    expect(texts(r, "rentabilidade")[0]).toMatchObject({ tone: "neg" });
    expect(texts(r, "rentabilidade")[0].text).toContain("Selic");
    expect(texts(r, "divida").filter((i) => i.tone === "neg")).toHaveLength(2);
    expect(texts(r, "dividendos").some((i) => i.tone === "neg" && i.text.includes("mais do que lucrou"))).toBe(true);
  });

  it("compara com a mediana dos pares", () => {
    const r = buildReport(page({ pl: 5, pvp: 2, roe: 0.2 }), opts);
    const m = texts(r, "pares");
    expect(m.find((i) => i.text.startsWith("P/L"))).toMatchObject({ tone: "pos" });
    expect(m.find((i) => i.text.startsWith("P/VP"))).toMatchObject({ tone: "neg" });
  });

  it("grupo fraco não vira conclusão de caro ou barato", () => {
    const base = page({ pl: 30, roe: 0.3 });
    const r = buildReport({ ...base, peerGroup: { peers: base.peers, quality: "fraca", note: "Comparação pouco confiável." } }, opts);
    const m = texts(r, "pares");
    expect(m.every((i) => i.tone === "neu")).toBe(true);
    expect(m.find((i) => i.text.startsWith("P/L"))?.text).toContain("porte bem diferente");
    expect(m.at(-1)?.text).toBe("Comparação pouco confiável.");
  });

  it("compara com o histórico da própria ação", () => {
    const r = buildReport(page({ pl: 10, pvp: 3 }, { ownHistory: { years: [], medianPl: 20, medianPvp: 3 } }), opts);
    const own = texts(r, "pares").filter((i) => i.text.startsWith("Frente ao próprio histórico"));
    expect(own[0]).toMatchObject({ tone: "pos" });
    expect(own[0].text).toContain("50% abaixo");
    expect(own[1]).toMatchObject({ tone: "neu" });
  });

  it("banco: não fala de EBITDA e deixa Dívida como sem dado", () => {
    const base = page({ roe: 0.2, netDebtEbitda: null });
    const r = buildReport({ ...base, meta: { ...base.meta, layout: "bank" } }, opts);
    expect(texts(r, "divida")[0].text).toContain("não se aplica");
    expect(r.pillars.find((p) => p.label === "Dívida e caixa")?.status).toBe("Sem dado");
  });

  it("lista prejuízos e compara o último trimestre com o do ano anterior", () => {
    const r = buildReport(
      page({}, {
        annual: ["2021", "2022", "2023", "2024", "2025"].map((y) => point(y, { netIncome: y === "2022" ? -50 : 100 })),
        quarterly: [point("3T25", { revenue: 100, netIncome: 10 }), point("3T26", { revenue: 120, netIncome: 8 })],
      }),
      opts,
    );
    expect(texts(r, "crescimento").at(-1)?.text).toContain("2022");
    const t = texts(r, "tendencias");
    expect(t.find((i) => i.text.startsWith("Receita do 3T26"))).toMatchObject({ tone: "pos" });
    expect(t.find((i) => i.text.startsWith("Lucro do 3T26"))).toMatchObject({ tone: "neg" });
  });

  it("usa o lucro estimado pelo usuário no cenário", () => {
    const result = projectEarnings(
      { netIncome: 100, revenue: 1000, shares: 100, price: 20, baseEnd: "2026-09-30" },
      { mode: "lucro", years: 1, growth: 0.05, netMargin: 0.1, payout: 0.5, exitPl: null, overrides: { "1": { netIncome: 200 } } },
      { avgCost: 10 },
    );
    const r = buildReport(page({}), { ...opts, scenario: { result, netIncomeBase: 100, avgCost: 10, isSaved: false } });
    const s = r.scenario.map((i) => i.text).join(" ");
    expect(s).toContain("+100,0%");
    expect(s).toContain("R$ 2,00"); // LPA
    expect(s).toContain("R$ 1,00"); // dividendo por ação
    expect(s).toContain("5,0%"); // DY sobre o preço
    expect(s).toContain("10,0%"); // DY sobre o custo
  });

  it("explica o que falta e nunca recomenda", () => {
    const base = page({ roe: 0.2 });
    base.indicators.pl = ind("pl", null, { missing: "lucro negativo" });
    const r = buildReport(base, opts);
    expect(r.missing).toContain("pl: lucro negativo");
    const all = JSON.stringify(r).toLowerCase();
    expect(all).not.toMatch(/\b(compre|comprar|venda|vender|recomend)/);
  });
});

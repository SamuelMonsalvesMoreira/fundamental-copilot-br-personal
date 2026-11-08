import { describe, expect, it } from "vitest";
import { itauDfp2025, wegDfp2025 } from "./fixtures";
import { detectLayout, standardize, type FinValue, type StatementLine } from "./standardize";

const get = (values: FinValue[], metric: string, periodStart?: string) =>
  values.find((v) => v.metric === metric && (periodStart === undefined || v.periodStart === periodStart));

describe("standardize — formato padrão (WEG, DFP 2025)", () => {
  const v = standardize(wegDfp2025);

  it("detecta o formato", () => expect(detectLayout(wegDfp2025)).toBe("standard"));

  it("extrai a DRE pelas contas fixas", () => {
    expect(get(v, "revenue")?.value).toBe(40_804_110_000);
    expect(get(v, "grossProfit")?.value).toBe(13_681_633_000);
    expect(get(v, "ebit")?.value).toBe(7_998_741_000);
    expect(get(v, "netIncome")?.value).toBe(6_775_958_000);
    expect(get(v, "netIncomeParent")?.value).toBe(6_376_219_000);
    expect(get(v, "netIncomeParent")?.origin).toBe("3.11.01");
  });

  it("usa a depreciação da DVA (positiva)", () => {
    expect(get(v, "depreciationAmortization")).toMatchObject({ value: 1_001_296_000, origin: "7.04.01" });
  });

  it("estima capex só com imobilizado/intangível (sem aquisições nem vendas)", () => {
    expect(get(v, "capex")).toMatchObject({ value: 2_691_321_000, origin: "regra:6.02.02+6.02.03" });
  });

  it("identifica dividendos/JCP pagos", () => {
    expect(get(v, "dividendsPaid")?.value).toBe(5_384_800_000);
  });

  it("extrai caixa, dívida e patrimônio", () => {
    expect(get(v, "cash")?.value).toBe(6_296_498_000);
    expect(get(v, "shortTermInvestments")?.value).toBe(983_367_000);
    expect(get(v, "shortTermDebt")?.value).toBe(3_549_314_000);
    expect(get(v, "longTermDebt")?.value).toBe(1_041_508_000);
    expect(get(v, "equity")?.value).toBe(18_553_364_000);
    expect(get(v, "equityParent")?.value).toBe(18_553_364_000 - 1_136_200_000);
    // balanço não tem início de período
    expect(get(v, "cash")?.periodStart).toBe("");
  });
});

describe("standardize — formato de banco (Itaú, DFP 2025)", () => {
  const v = standardize(itauDfp2025);

  it("detecta o formato", () => expect(detectLayout(itauDfp2025)).toBe("bank"));

  it("acha o lucro mesmo com código diferente (3.09 em vez de 3.11)", () => {
    expect(get(v, "netIncome")).toMatchObject({ value: 45_849_000_000, origin: "3.09" });
    expect(get(v, "netIncomeParent")).toMatchObject({ value: 44_857_000_000, origin: "3.09.01" });
  });

  it("não inventa dívida bruta nem EBIT para bancos", () => {
    expect(get(v, "shortTermDebt")).toBeUndefined();
    expect(get(v, "longTermDebt")).toBeUndefined();
    expect(get(v, "ebit")).toBeUndefined();
  });

  it("acha o patrimônio no código 2.08 e o caixa no 1.01", () => {
    expect(get(v, "equity")?.value).toBe(215_076_000_000);
    expect(get(v, "equityParent")?.value).toBe(204_501_000_000);
    expect(get(v, "cash")?.value).toBe(37_144_000_000);
  });
});

describe("standardize — casos especiais", () => {
  const base = (over: Partial<StatementLine>): StatementLine => ({
    cnpj: "1",
    statement: "DRE",
    consolidated: false,
    periodStart: "2026-01-01",
    periodEnd: "2026-06-30",
    code: "3.01",
    name: "Receita de Venda de Bens e/ou Serviços",
    value: 100,
    fixed: true,
    ...over,
  });

  it("separa o trimestre (3 meses) do acumulado no ano", () => {
    const v = standardize([
      base({}),
      base({ periodStart: "2026-04-01", value: 60 }),
    ]);
    expect(get(v, "revenue", "2026-01-01")?.value).toBe(100);
    expect(get(v, "revenue", "2026-04-01")?.value).toBe(60);
  });

  it("demonstração individual: lucro inteiro é da controladora", () => {
    const v = standardize([base({ code: "3.11", name: "Lucro/Prejuízo do Período", value: 42 })]);
    expect(get(v, "netIncomeParent")?.value).toBe(42);
  });

  it("aceita as variações de descrição do lucro (ex.: Bradesco)", () => {
    const v = standardize([
      base({ code: "3.11", name: "Lucro ou Prejuízo Líquido Consolidado do Período", value: 23.92 }),
      base({ code: "3.11.01", name: "Atribuído aos Sócios da Empresa Controladora", value: 23.67 }),
    ]);
    expect(get(v, "netIncome")?.value).toBe(23.92);
    expect(get(v, "netIncomeParent")).toMatchObject({ value: 23.67, origin: "3.11.01" });
  });

  it("valor ausente não vira zero", () => {
    const v = standardize([base({ value: null })]);
    expect(get(v, "revenue")).toBeUndefined();
  });

  it("usa a DFC como plano B para depreciação quando não há DVA", () => {
    const v = standardize([
      base({ statement: "DFC_MI", code: "6.01", name: "Caixa Líquido Atividades Operacionais", value: 500 }),
      base({ statement: "DFC_MI", code: "6.01.01.02", name: "Depreciação e amortização", value: 70 }),
      base({ statement: "DFC_MI", code: "6.01.01.03", name: "Amortização de direito de uso", value: 30 }),
      base({ statement: "DFC_MI", code: "6.01.01.04", name: "Amortização de custos de captação", value: 5 }),
    ]);
    expect(get(v, "depreciationAmortization")).toMatchObject({ value: 100, origin: "regra:6.01.01.02+6.01.01.03" });
  });
});

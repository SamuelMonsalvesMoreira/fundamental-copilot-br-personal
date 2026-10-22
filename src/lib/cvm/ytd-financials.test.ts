import { describe, expect, it } from "vitest";
import type { QuarterlyFinancialRecord } from "./types";
import { buildLatestYtdFinancialRow } from "./ytd-financials";

const quarter = (
  fiscalYear: number,
  value: number,
  quarterNumber: 1 | 2 | 3 | 4,
): QuarterlyFinancialRecord => ({
  ticker: "TEST3",
  fiscalYear,
  quarter: quarterNumber,
  period: `${fiscalYear}Q${quarterNumber}`,
  periodEndDate: `${fiscalYear}-${String(quarterNumber * 3).padStart(2, "0")}-30`,
  revenue: value,
  ebit: value / 2,
  netIncome: value / 3,
  operatingCashFlow: value / 2,
  capex: value / 4,
  freeCashFlow: value / 4,
  cash: value,
  totalDebt: value * 2,
  netDebt: value,
  source: "cvm_itr",
});

describe("buildLatestYtdFinancialRow", () => {
  it("soma os trimestres de 2026 e identifica o último período disponível", () => {
    const result = buildLatestYtdFinancialRow(
      [{ year: "2025", receita: 400, ebitda: 100, fcl: 50 }],
      [quarter(2026, 100, 1), quarter(2026, 130, 2)],
    );

    expect(result).toMatchObject({
      year: "2026",
      receita: 230,
      ebitda: 115,
      fcl: 57.5,
      latestQuarter: 2,
      isPartial: true,
    });
  });

  it("não duplica um ano que já existe na série anual", () => {
    expect(buildLatestYtdFinancialRow(
      [{ year: "2026", receita: 500, ebitda: 120, fcl: 60 }],
      [quarter(2026, 100, 1)],
    )).toBeNull();
  });

  it("mantém somente a versão mais recente de um trimestre duplicado", () => {
    const older = quarter(2026, 100, 1);
    const newer = { ...quarter(2026, 110, 1), periodEndDate: "2026-03-31" };
    const result = buildLatestYtdFinancialRow([], [older, newer]);
    expect(result?.receita).toBe(110);
  });
});


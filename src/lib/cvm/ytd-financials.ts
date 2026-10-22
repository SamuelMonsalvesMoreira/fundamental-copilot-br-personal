import type { FinancialYear } from "@/data/companies/types";
import type { QuarterlyFinancialRecord } from "./types";

export interface PartialFinancialYear extends FinancialYear {
  isPartial: true;
  latestQuarter: 1 | 2 | 3 | 4;
  periodEndDate: string;
}

const sumAvailable = (
  rows: QuarterlyFinancialRecord[],
  key: "revenue" | "ebit" | "freeCashFlow",
): number => {
  const values = rows.map(row => row[key]).filter((value): value is number => value !== null);
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0);
};

/** Builds a year-to-date chart row from official CVM ITR quarters. */
export function buildLatestYtdFinancialRow(
  annualRows: FinancialYear[],
  quarterlyRows: QuarterlyFinancialRecord[],
): PartialFinancialYear | null {
  if (quarterlyRows.length === 0) return null;

  const latestFiscalYear = Math.max(...quarterlyRows.map(row => row.fiscalYear));
  const latestAnnualYear = Math.max(
    0,
    ...annualRows.map(row => Number.parseInt(row.year, 10)).filter(Number.isFinite),
  );
  if (latestFiscalYear <= latestAnnualYear) return null;

  const byQuarter = new Map<number, QuarterlyFinancialRecord>();
  quarterlyRows
    .filter(row => row.fiscalYear === latestFiscalYear)
    .sort((a, b) => a.periodEndDate.localeCompare(b.periodEndDate))
    .forEach(row => byQuarter.set(row.quarter, row));

  const currentYearRows = [...byQuarter.values()].sort((a, b) => a.quarter - b.quarter);
  const latest = currentYearRows[currentYearRows.length - 1];
  if (!latest || currentYearRows.every(row => row.revenue === null)) return null;

  return {
    year: String(latestFiscalYear),
    receita: sumAvailable(currentYearRows, "revenue"),
    ebitda: sumAvailable(currentYearRows, "ebit"),
    fcl: sumAvailable(currentYearRows, "freeCashFlow"),
    isPartial: true,
    latestQuarter: latest.quarter,
    periodEndDate: latest.periodEndDate,
  };
}


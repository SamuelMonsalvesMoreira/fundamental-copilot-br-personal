import { describe, expect, it } from "vitest";
import {
  MISSING,
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMultiple,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  trendOf,
} from "./format";

describe("format", () => {
  it("formata números em pt-BR", () => {
    expect(formatNumber(1234.5)).toBe("1.234,50");
    expect(formatCurrency(12.3)).toBe("R$ 12,30");
    expect(formatMultiple(8.234)).toBe("8,2x");
    expect(formatPercent(0.1534)).toBe("15,3%");
    expect(formatSignedPercent(0.012)).toBe("+1,20%");
    expect(formatSignedPercent(-0.012)).toBe("-1,20%");
  });

  it("compacta valores grandes", () => {
    expect(formatCompactCurrency(1.5e9)).toBe("R$ 1,50 bi");
    expect(formatCompactCurrency(-2.3e6)).toBe("-R$ 2,30 mi");
    expect(formatCompactCurrency(4.1e12)).toBe("R$ 4,10 tri");
    expect(formatCompactCurrency(950)).toBe("R$ 950,00");
  });

  it("nunca mostra zero no lugar de dado ausente", () => {
    for (const v of [null, undefined, NaN, Infinity]) {
      expect(formatNumber(v)).toBe(MISSING);
      expect(formatPercent(v)).toBe(MISSING);
      expect(formatCompactCurrency(v)).toBe(MISSING);
    }
    expect(trendOf(null)).toBe("none");
  });

  it("formata datas", () => {
    expect(formatDate("2026-11-07")).toBe("07/11/2026");
    expect(formatDate("2026-11-07T21:00:00Z")).toBe("07/11/2026");
    expect(formatDate("lixo")).toBe(MISSING);
    expect(formatDateTime("2026-11-07T21:30:00Z")).toBe("07/11/2026 18:30");
  });
});

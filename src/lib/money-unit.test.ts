import { describe, expect, it } from "vitest";
import { moneyUnit, parseUnitText, toUnitText } from "./money-unit";

const bi = moneyUnit(18.2e9);
const mi = moneyUnit(450e6);

describe("unidade de digitação", () => {
  it("segue o tamanho do valor de referência", () => {
    expect(bi.label).toBe("bi");
    expect(mi.label).toBe("mi");
    expect(moneyUnit(-3e9).label).toBe("bi");
    expect(moneyUnit(null).label).toBe("mi");
  });

  it("mostra o valor na unidade, com vírgula", () => {
    expect(toUnitText(20_020_000_000, bi)).toBe("20,02");
    expect(toUnitText(18.2e9, bi)).toBe("18,2");
    expect(toUnitText(1_234_500_000, mi)).toBe("1234,5");
    expect(toUnitText(null, bi)).toBe("");
  });

  it("lê vírgula, ponto e milhar no formato brasileiro", () => {
    expect(parseUnitText("20,5", bi)).toBe(20.5e9);
    expect(parseUnitText("20.5", bi)).toBe(20.5e9);
    expect(parseUnitText("1.234,5", mi)).toBe(1234.5e6);
    expect(parseUnitText("1.234", mi)).toBe(1234e6);
    expect(parseUnitText("-2,5", bi)).toBe(-2.5e9);
  });

  it("recusa o que não é número", () => {
    expect(parseUnitText("", bi)).toBeNull();
    expect(parseUnitText("20,", bi)).toBeNull();
    expect(parseUnitText("abc", bi)).toBeNull();
  });
});

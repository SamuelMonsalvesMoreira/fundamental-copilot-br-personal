import { describe, expect, it } from "vitest";
import { calculate } from "./calc";
import { collectNumbers, extractNumbers, verifyAnswer } from "./verify";

describe("calculadora", () => {
  it("respeita precedência, parênteses, potência e vírgula decimal", () => {
    expect(calculate("2 + 3 * 4")).toBe(14);
    expect(calculate("(2 + 3) * 4")).toBe(20);
    expect(calculate("2 ^ 3 ^ 2")).toBe(512);
    expect(calculate("-3 + 1,5")).toBe(-1.5);
    expect(calculate("(40804,1 / 37990) - 1")).toBeCloseTo(0.0741, 4);
  });

  it("recusa o que não é aritmética", () => {
    expect(() => calculate("process.exit()")).toThrow();
    expect(() => calculate("1/0")).toThrow("divisão por zero");
    expect(() => calculate("(1+2")).toThrow();
  });
});

describe("verificação de números", () => {
  it("extrai números em formato brasileiro com unidades", () => {
    const n = extractNumbers("Receita de R$ 40,8 bi, margem de 22,1%, P/L de 32,3x e 1.234 ações.");
    expect(n.map((x) => [x.value, x.unit])).toEqual([
      [40.8e9, "currency"],
      [22.1, "percent"],
      [32.3, "multiple"],
      [1234, "plain"],
    ]);
  });

  it("aceita números que vieram das ferramentas, com arredondamento e mudança de unidade", () => {
    // ferramenta: receita em R$ mi, margem como fração, P/L
    const sources = collectNumbers({ receita_mi: 40804.1, margem: 0.2206, pl: 32.25 });
    const v = verifyAnswer("A receita foi de R$ 40,8 bilhões, margem EBITDA de 22,1% e P/L de 32,3x.", sources);
    expect(v.unverified).toEqual([]);
    expect(v.checked).toBe(3);
  });

  it("marca número que não veio de nenhuma ferramenta", () => {
    const v = verifyAnswer("O ROE foi de 35% em 2025.", collectNumbers({ roe: 0.296 }));
    expect(v.unverified).toEqual(["35%"]);
  });

  it("ignora anos, datas e contagens pequenas", () => {
    const v = verifyAnswer("Entre 2020 e 2025 (5 anos), até 30/09/2026, no 3T26.", []);
    expect(v.checked).toBe(0);
  });
});

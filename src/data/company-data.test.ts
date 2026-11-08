import { describe, expect, it } from "vitest";
import { sectorKey, sectorLabel } from "./company-data";

describe("setores", () => {
  it("unifica grafias diferentes do mesmo subsetor", () => {
    expect(sectorLabel("Máq. e Equip. Industriais", null)).toBe("Máquinas e Equipamentos");
    expect(sectorLabel("Máquinas e Equipamentos", null)).toBe("Máquinas e Equipamentos");
    expect(sectorLabel("Exploração. Refino e Distribuição", null)).toBe("Exploração, Refino e Distribuição");
    expect(sectorKey("Exploração. Refino e Distribuição")).toBe(sectorKey("Exploração, Refino e Distribuição"));
  });

  it("usa o setor da CVM sem o prefixo de holding quando não há subsetor", () => {
    expect(sectorLabel(null, "Emp. Adm. Part. - Energia Elétrica")).toBe("Energia Elétrica");
    expect(sectorLabel(null, null)).toBe("Sem setor");
  });
});

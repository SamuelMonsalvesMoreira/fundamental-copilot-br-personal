import { describe, expect, it } from "vitest";
import { parseCvmRegistryCsv, scoreCompanyNameMatch } from "./company-resolver";

describe("scoreCompanyNameMatch", () => {
  it("matches legal-name variations", () => {
    expect(scoreCompanyNameMatch("Irani Papel e Embalagem S.A.", "IRANI PAPEL E EMBALAGEM S.A.")).toBe(1);
    expect(scoreCompanyNameMatch("Companhia Siderúrgica Nacional", "CIA SIDERURGICA NACIONAL")).toBeGreaterThan(0.7);
  });

  it("rejects unrelated companies", () => {
    expect(scoreCompanyNameMatch("Irani Papel e Embalagem", "Banco do Brasil")).toBe(0);
  });
});

describe("parseCvmRegistryCsv", () => {
  it("returns only active registrations", () => {
    const csv = [
      "CNPJ_CIA;DENOM_SOCIAL;DENOM_COMERC;DT_REG;DT_CONST;DT_CANCEL;MOTIVO_CANCEL;SIT_REG;DT_INI_SIT;CD_CVM",
      "92.791.243/0001-03;IRANI PAPEL E EMBALAGEM S.A.;IRANI PAPEL E EMBALAGEM S.A.;;;;;ATIVO;;2429",
      "00.000.000/0001-00;EMPRESA ANTIGA S.A.;ANTIGA;;;;;CANCELADA;;9999",
    ].join("\n");

    expect(parseCvmRegistryCsv(csv)).toEqual([
      expect.objectContaining({ cvmCode: "2429", cnpj: "92.791.243/0001-03" }),
    ]);
  });
});



import { describe, expect, it } from "vitest";
import { iterateCsv, splitCsvLine } from "../csv";
import { parseCadastro, parseFcaTickers, parseUnitComposition } from "./registry";
import { hasRealValues, parseShareCounts, parseStatementRows } from "./statements";

const csv = (header: string[], rows: string[][]) =>
  [header.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n") + "\r\n";

describe("CSV da CVM", () => {
  it("respeita aspas e ignora linhas vazias", () => {
    expect(splitCsvLine('a;"b;c";"d ""e"""')).toEqual(["a", "b;c", 'd "e"']);
    const rows = [...iterateCsv("X;Y\r\n1;2\r\n\r\n3;4\r\n")];
    expect(rows).toEqual([
      { X: "1", Y: "2" },
      { X: "3", Y: "4" },
    ]);
  });
});

describe("cadastro e FCA", () => {
  it("prefere o registro ativo quando o CNPJ se repete", () => {
    const text = csv(
      ["CNPJ_CIA", "DENOM_SOCIAL", "DENOM_COMERC", "CD_CVM", "SETOR_ATIV", "SIT", "DT_CANCEL"],
      [
        ["84.429.695/0001-11", "WEG S.A. ANTIGA", "", "5410", "", "CANCELADA", "2000-01-01"],
        ["84.429.695/0001-11", "WEG S.A.", "WEG SA", "005410", "Máquinas", "ATIVO", ""],
      ],
    );
    expect(parseCadastro(text)).toEqual([
      { cnpj: "84429695000111", cvmCode: "5410", name: "WEG S.A.", tradeName: "WEG SA", sector: "Máquinas", status: "ATIVO" },
    ]);
  });

  it("pega só ações/units negociadas em bolsa, da versão mais recente do FCA", () => {
    const H = ["CNPJ_Companhia", "Data_Referencia", "Versao", "Valor_Mobiliario", "Codigo_Negociacao", "Mercado", "Data_Fim_Negociacao", "Segmento"];
    const text = csv(H, [
      ["07.859.971/0001-30", "2026-01-01", "1", "Ações Ordinárias", "TAEE3", "Bolsa", "", "Nível 2"],
      ["07.859.971/0001-30", "2026-01-01", "1", "Units", "TAEE11", "Bolsa", "", "Nível 2"],
      ["07.859.971/0001-30", "2026-01-01", "1", "Debêntures", "TAEE17", "Balcão Organizado", "", ""],
      ["07.859.971/0001-30", "2025-01-01", "3", "Ações Preferenciais", "TAEE5", "Bolsa", "", ""], // versão antiga
      ["11.111.111/0001-11", "2026-01-01", "1", "Ações Ordinárias", "XPTO3", "Bolsa", "2026-02-01", ""], // encerrada
    ]);
    const t = parseFcaTickers(text);
    expect(t.map((x) => x.ticker).sort()).toEqual(["TAEE11", "TAEE3"]);
    expect(t.find((x) => x.ticker === "TAEE11")?.shareClass).toBe("UNIT");
  });
});

describe("composição das units (textos reais do FCA)", () => {
  it.each([
    ["1 ON / 2 PN", 1, 2],
    ["1 ON E 2 PN", 1, 2],
    ["1 ação ordinária e 4 ações preferenciais", 1, 4],
    ["2 ações preferenciais e 1 ação ordinária", 1, 2],
    ["1 ON e 2PNs", 1, 2],
    ["1 ON E 2 PNA", 1, 2],
    ["1 KLBN3 + 4 KLBN4", 1, 4],
    ["1 ON + 1 PN", 1, 1],
  ])("%s", (text, on, pn) => {
    expect(parseUnitComposition(text)).toEqual({ on, pn, total: on + pn });
  });

  it("não adivinha quando não entende", () => {
    expect(parseUnitComposition("")).toBeNull();
    expect(parseUnitComposition("N/A")).toBeNull();
    expect(parseUnitComposition("1 PN + 3 Recibos de Subscrição")).toBeNull();
  });
});

describe("demonstrações DFP/ITR", () => {
  const H = ["CNPJ_CIA", "DT_REFER", "VERSAO", "ESCALA_MOEDA", "ORDEM_EXERC", "DT_INI_EXERC", "DT_FIM_EXERC", "CD_CONTA", "DS_CONTA", "VL_CONTA", "ST_CONTA_FIXA"];

  it("usa só ÚLTIMO, a versão mais nova e converte MIL para reais (exceto LPA)", () => {
    const text = csv(H, [
      ["84.429.695/0001-11", "2025-12-31", "1", "MIL", "ÚLTIMO", "2025-01-01", "2025-12-31", "3.01", "Receita", "999.0000000000", "S"],
      ["84.429.695/0001-11", "2025-12-31", "2", "MIL", "ÚLTIMO", "2025-01-01", "2025-12-31", "3.01", "Receita", "40804110.0000000000", "S"],
      ["84.429.695/0001-11", "2025-12-31", "2", "MIL", "PENÚLTIMO", "2024-01-01", "2024-12-31", "3.01", "Receita", "1.0", "S"],
      ["84.429.695/0001-11", "2025-12-31", "2", "MIL", "ÚLTIMO", "2025-01-01", "2025-12-31", "3.99.01", "Lucro Básico por Ação", "1.5200000000", "N"],
    ]);
    const m = parseStatementRows(iterateCsv(text), "DRE", true, () => true);
    const lines = m.get("84429695000111|2025-12-31")!;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ code: "3.01", value: 40_804_110_000, periodStart: "2025-01-01" });
    expect(lines[1]).toMatchObject({ code: "3.99.01", value: 1.52 });
  });

  it("documento todo zerado não conta como preenchido (consolidado vazio da TIM)", () => {
    const line = (code: string, value: number | null) => ({ cnpj: "1", statement: "DRE" as const, consolidated: true, periodStart: "", periodEnd: "2025-12-31", code, name: "x", value, fixed: true });
    expect(hasRealValues([line("3.01", 0), line("3.11", 0), line("3.99.01", 1.5)])).toBe(false);
    expect(hasRealValues([line("3.01", null)])).toBe(false);
    expect(hasRealValues([line("3.01", 10)])).toBe(true);
  });

  it("filtra companhias fora da lista", () => {
    const text = csv(H, [["00.000.000/0001-91", "2025-12-31", "1", "MIL", "ÚLTIMO", "2025-01-01", "2025-12-31", "3.01", "R", "1", "S"]]);
    expect(parseStatementRows(iterateCsv(text), "DRE", true, () => false).size).toBe(0);
  });

  it("lê a composição do capital", () => {
    const text = csv(
      ["CNPJ_CIA", "DT_REFER", "VERSAO", "QT_ACAO_ORDIN_CAP_INTEGR", "QT_ACAO_PREF_CAP_INTEGR", "QT_ACAO_TOTAL_CAP_INTEGR", "QT_ACAO_ORDIN_TESOURO", "QT_ACAO_PREF_TESOURO", "QT_ACAO_TOTAL_TESOURO"],
      [["84.429.695/0001-11", "2025-12-31", "1", "4197317998", "0", "4197317998", "1622025", "0", "1622025"]],
    );
    expect(parseShareCounts(iterateCsv(text), "DFP", () => true)[0]).toMatchObject({ total: 4_197_317_998, treasuryTotal: 1_622_025 });
  });
});

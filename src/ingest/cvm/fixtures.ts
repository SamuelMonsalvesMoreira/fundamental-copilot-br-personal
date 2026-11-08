/**
 * Trechos reais (reduzidos) da DFP 2025 consolidada publicada na CVM,
 * usados nos testes. Valores em R$ mil, como no arquivo original.
 */
import type { StatementCode, StatementLine } from "./standardize";

type Row = [code: string, name: string, valueMil: number];

function lines(
  cnpj: string,
  statement: StatementCode,
  periodStart: string,
  periodEnd: string,
  rows: Row[],
): StatementLine[] {
  return rows.map(([code, name, v]) => ({
    cnpj,
    statement,
    consolidated: true,
    periodStart,
    periodEnd,
    code,
    name,
    value: v * 1000,
    fixed: true,
  }));
}

const WEG = "84429695000111";
const ITAU = "60872504000123";
const FY = ["2025-01-01", "2025-12-31"] as const;

/** WEG S.A. — DFP 2025 (formato padrão). */
export const wegDfp2025: StatementLine[] = [
  ...lines(WEG, "DRE", ...FY, [
    ["3.01", "Receita de Venda de Bens e/ou Serviços", 40804110],
    ["3.02", "Custo dos Bens e/ou Serviços Vendidos", -27122477],
    ["3.03", "Resultado Bruto", 13681633],
    ["3.04", "Despesas/Receitas Operacionais", -5682892],
    ["3.05", "Resultado Antes do Resultado Financeiro e dos Tributos", 7998741],
    ["3.06", "Resultado Financeiro", 148936],
    ["3.07", "Resultado Antes dos Tributos sobre o Lucro", 8147677],
    ["3.08", "Imposto de Renda e Contribuição Social sobre o Lucro", -1371719],
    ["3.09", "Resultado Líquido das Operações Continuadas", 6775958],
    ["3.11", "Lucro/Prejuízo Consolidado do Período", 6775958],
    ["3.11.01", "Atribuído a Sócios da Empresa Controladora", 6376219],
    ["3.11.02", "Atribuído a Sócios Não Controladores", 399739],
  ]),
  ...lines(WEG, "DVA", ...FY, [
    ["7.04", "Retenções", -1001296],
    ["7.04.01", "Depreciação, Amortização e Exaustão", -1001296],
  ]),
  ...lines(WEG, "DFC_MI", ...FY, [
    ["6.01", "Caixa Líquido Atividades Operacionais", 6451033],
    ["6.01.01", "Caixa Gerado nas Operações", 10412769],
    ["6.01.01.02", "Depreciação, Amortização e Exaustão", 1001296],
    ["6.02", "Caixa Líquido Atividades de Investimento", -2910810],
    ["6.02.02", "Imobilizado", -2563450],
    ["6.02.03", "Intangível", -127871],
    ["6.02.04", "Recebimento na venda de Ativo Imobilizado e Intangível", 49783],
    ["6.02.09", "Aquisição de empresa - combinação de negócio (líquido do caixa)", -200575],
    ["6.03", "Caixa Líquido Atividades de Financiamento", -4362871],
    ["6.03.04", "Dividendos/juros sobre capital próprio pagos", -5384800],
  ]),
  ...lines(WEG, "BPA", "", "2025-12-31", [
    ["1", "Ativo Total", 42645030],
    ["1.01", "Ativo Circulante", 26910845],
    ["1.01.01", "Caixa e Equivalentes de Caixa", 6296498],
    ["1.01.02", "Aplicações Financeiras", 983367],
    ["1.02", "Ativo Não Circulante", 15734185],
    ["1.02.03", "Imobilizado", 11511802],
    ["1.02.04", "Intangível", 2784989],
  ]),
  ...lines(WEG, "BPP", "", "2025-12-31", [
    ["2", "Passivo Total", 42645030],
    ["2.01", "Passivo Circulante", 17386401],
    ["2.01.04", "Empréstimos e Financiamentos", 3549314],
    ["2.02", "Passivo Não Circulante", 6705265],
    ["2.02.01", "Empréstimos e Financiamentos", 1041508],
    ["2.03", "Patrimônio Líquido Consolidado", 18553364],
    ["2.03.09", "Participação dos Acionistas Não Controladores", 1136200],
  ]),
];

/** Itaú Unibanco — DFP 2025 (formato de banco: códigos diferentes). */
export const itauDfp2025: StatementLine[] = [
  ...lines(ITAU, "DRE", ...FY, [
    ["3.01", "Receitas da Intermediação Financeira", 387118000],
    ["3.02", "Despesas da Intermediação Financeira", -248171000],
    ["3.03", "Resultado Bruto Intermediação Financeira", 138947000],
    ["3.05", "Resultado Antes dos Tributos sobre o Lucro", 50250000],
    ["3.06", "Imposto de Renda e Contribuição Social sobre o Lucro", -4401000],
    ["3.09", "Lucro/Prejuízo Consolidado do Período", 45849000],
    ["3.09.01", "Atribuído a Sócios da Empresa Controladora", 44857000],
    ["3.09.02", "Atribuído a Sócios Não Controladores", 992000],
  ]),
  ...lines(ITAU, "BPA", "", "2025-12-31", [
    ["1", "Ativo Total", 3066169000],
    ["1.01", "Caixa e Equivalentes de Caixa", 37144000],
  ]),
  ...lines(ITAU, "BPP", "", "2025-12-31", [
    ["2", "Passivo Total", 3066169000],
    ["2.03", "Passivos Financeiros ao Custo Amortizado", 2350901000],
    ["2.08", "Patrimônio Líquido Consolidado", 215076000],
    ["2.08.09", "Participação dos Acionistas Não Controladores", 10575000],
  ]),
];

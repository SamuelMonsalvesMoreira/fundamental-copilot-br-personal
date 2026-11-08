/**
 * Padronização das contas da CVM.
 *
 * Os códigos das contas mudam conforme o formato da empresa (indústria,
 * banco, seguradora): o lucro líquido é 3.11 numa indústria, 3.09 num banco
 * e 3.13 numa seguradora. Por isso localizamos as contas pela DESCRIÇÃO das
 * contas fixas do plano da CVM, não só pelo código.
 *
 * Cada valor gerado guarda em `origin` de qual conta (ou regra) ele saiu,
 * para que a interface e a IA possam explicar de onde veio o número.
 */
import { normalizeText } from "./urls";

export type Layout = "standard" | "bank" | "insurance";
export type StatementCode = "BPA" | "BPP" | "DRE" | "DFC_MD" | "DFC_MI" | "DVA";

export interface StatementLine {
  cnpj: string;
  statement: StatementCode;
  consolidated: boolean;
  periodStart: string; // '' para balanço
  periodEnd: string;
  code: string;
  name: string;
  value: number | null;
  fixed: boolean;
}

export type Metric =
  // DRE
  | "revenue"
  | "costOfRevenue"
  | "grossProfit"
  | "ebit"
  | "financialResult"
  | "pretaxIncome"
  | "incomeTax"
  | "netIncome"
  | "netIncomeParent"
  | "epsBasic"
  // DVA / DFC
  | "depreciationAmortization"
  | "operatingCashFlow"
  | "investingCashFlow"
  | "financingCashFlow"
  | "capex"
  | "dividendsPaid"
  // Balanço
  | "totalAssets"
  | "currentAssets"
  | "cash"
  | "shortTermInvestments"
  | "fixedAssets"
  | "intangibleAssets"
  | "currentLiabilities"
  | "nonCurrentLiabilities"
  | "shortTermDebt"
  | "longTermDebt"
  | "equity"
  | "minorityInterest"
  | "equityParent";

export interface FinValue {
  metric: Metric;
  periodStart: string;
  periodEnd: string;
  value: number;
  consolidated: boolean;
  origin: string;
}

const depth = (code: string) => code.split(".").length - 1;
const isChildOf = (code: string, parent: string) => code.startsWith(parent + ".") && depth(code) === depth(parent) + 1;

/** Detecta o formato pela primeira conta da DRE. */
export function detectLayout(lines: StatementLine[]): Layout {
  const first = lines.find((l) => l.statement === "DRE" && l.code === "3.01");
  const name = first ? normalizeText(first.name) : "";
  if (name.includes("intermedia")) return "bank";
  if (name.includes("segurad")) return "insurance";
  return "standard";
}

/** Agrupa linhas de uma mesma demonstração e período. */
function groupByPeriod(lines: StatementLine[]) {
  const groups = new Map<string, StatementLine[]>();
  for (const l of lines) {
    const k = `${l.statement}|${l.periodStart}|${l.periodEnd}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(l);
  }
  return groups;
}

class Finder {
  private readonly byCode = new Map<string, StatementLine>();
  constructor(readonly lines: StatementLine[]) {
    for (const l of lines) this.byCode.set(l.code, l);
  }
  code(code: string) {
    return this.byCode.get(code);
  }
  /** Primeira linha (na profundidade indicada) cuja descrição satisfaz o teste. */
  find(test: (name: string) => boolean, opts: { depth?: number; parent?: string } = {}) {
    return this.lines.find(
      (l) =>
        (opts.depth === undefined || depth(l.code) === opts.depth) &&
        (opts.parent === undefined || isChildOf(l.code, opts.parent)) &&
        test(normalizeText(l.name)),
    );
  }
  children(parent: string) {
    return this.lines.filter((l) => isChildOf(l.code, parent));
  }
}

const startsWith = (prefix: string) => (n: string) => n.startsWith(prefix);
const equals = (s: string) => (n: string) => n === s;

// Regras para contas de texto livre na DFC (não são contas fixas).
const CAPEX_RE =
  /(imobilizad|intangive|ativo fixo|ativos fixos|capex|investimentos? em (ativo|bens|imobilizado)|aquisic(ao|oes) de (bens|ativos?|imobilizado|intangive)|adic(ao|oes) (ao|de|do) (imobilizado|intangivel)|ativo de contrato|infraestrutura)/;
const CAPEX_EXCLUDE_RE =
  /(venda|vendas|alienac|recebimento|recebid|baixa|resgate|controlad|coligad|participac|combinac|dividend|juros|emprestimo)/;
const DIVIDENDS_RE = /(dividend|juros sobre (o )?capital|jscp|jcp)/;
const DIVIDENDS_EXCLUDE_RE = /(recebid|recebimento)/;
const NET_INCOME_RE = /^lucro( ou |\/)prejuizo (liquido )?(consolidado )?do periodo$/;
const PARENT_RE = /^atribuido (a|aos) socios da empresa controladora/;
const DA_RE = /(deprecia|amortiza|exaust)/;
const DA_EXCLUDE_RE = /(custo|agio|desagio|emprestimo|financiamento|debenture|juros|captac|ajuste a valor)/;

/**
 * Converte as linhas de UM documento (uma companhia, uma data de referência)
 * em valores padronizados.
 */
export function standardize(lines: StatementLine[], layout: Layout = detectLayout(lines)): FinValue[] {
  const out: FinValue[] = [];

  const push = (
    metric: Metric,
    line: Pick<StatementLine, "periodStart" | "periodEnd" | "consolidated">,
    value: number | null | undefined,
    origin: string,
  ) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    out.push({
      metric,
      periodStart: line.periodStart,
      periodEnd: line.periodEnd,
      value,
      consolidated: line.consolidated,
      origin,
    });
  };
  const pushLine = (metric: Metric, l: StatementLine | undefined, transform = (v: number) => v) => {
    if (l && l.value !== null) push(metric, l, transform(l.value), l.code);
  };

  const groups = groupByPeriod(lines);
  const dfcPeriodsSeen = new Set<string>();
  const daPeriods = new Set<string>();

  // DVA antes da DFC: a DVA tem a conta fixa de depreciação; a DFC é o plano B.
  const ordered = [...groups.entries()].sort(([a], [b]) => {
    const rank = (k: string) => (k.startsWith("DVA") ? 0 : k.startsWith("DFC") ? 1 : 2);
    return rank(a) - rank(b);
  });

  for (const [, g] of ordered) {
    const f = new Finder(g);
    const st = g[0].statement;
    const periodKey = `${g[0].periodStart}|${g[0].periodEnd}`;

    if (st === "DRE") {
      pushLine("revenue", f.code("3.01"));
      if (layout === "standard") pushLine("costOfRevenue", f.code("3.02"));
      pushLine("grossProfit", f.find(startsWith("resultado bruto"), { depth: 1 }));
      pushLine("ebit", f.find(equals("resultado antes do resultado financeiro e dos tributos"), { depth: 1 }));
      pushLine("financialResult", f.find(equals("resultado financeiro"), { depth: 1 }));
      pushLine("pretaxIncome", f.find(startsWith("resultado antes dos tributos sobre o lucro"), { depth: 1 }));
      pushLine("incomeTax", f.find(startsWith("imposto de renda e contribuicao social sobre o lucro"), { depth: 1 }));

      // Variações reais: "Lucro/Prejuízo Consolidado do Período", "Lucro/Prejuízo do Período",
      // "Lucro ou Prejuízo Líquido (Consolidado) do Período" (Bradesco e outros).
      const net = f.find((n) => NET_INCOME_RE.test(n), { depth: 1 });
      pushLine("netIncome", net);
      if (net) {
        const parent = f.find((n) => PARENT_RE.test(n), { parent: net.code });
        if (parent) pushLine("netIncomeParent", parent);
        else pushLine("netIncomeParent", net); // demonstração individual: tudo é da controladora
      }
      // LPA vem em R$/ação; muitas empresas deixam zerado — só guardamos se preenchido.
      const eps = f.find(equals("lucro basico por acao"), { depth: 2 }) ?? f.code("3.99.01");
      if (eps && eps.value) push("epsBasic", eps, eps.value, eps.code);
    }

    if (st === "DVA") {
      const da = f.find(startsWith("depreciacao, amortizacao e exaustao"));
      if (da && da.value !== null) {
        push("depreciationAmortization", da, Math.abs(da.value), da.code);
        daPeriods.add(periodKey);
      }
    }

    if (st === "DFC_MI" || st === "DFC_MD") {
      if (dfcPeriodsSeen.has(periodKey)) continue; // só um método por período
      dfcPeriodsSeen.add(periodKey);
      pushLine("operatingCashFlow", f.code("6.01"));
      pushLine("investingCashFlow", f.code("6.02"));
      pushLine("financingCashFlow", f.code("6.03"));

      const capexLines = f
        .children("6.02")
        .filter((l) => (l.value ?? 0) < 0)
        .filter((l) => {
          const n = normalizeText(l.name);
          return CAPEX_RE.test(n) && !CAPEX_EXCLUDE_RE.test(n);
        });
      if (capexLines.length > 0) {
        const total = capexLines.reduce((s, l) => s + Math.abs(l.value ?? 0), 0);
        push("capex", g[0], total, `regra:${capexLines.map((l) => l.code).join("+")}`);
      }

      const divLines = f
        .children("6.03")
        .filter((l) => (l.value ?? 0) < 0)
        .filter((l) => {
          const n = normalizeText(l.name);
          return DIVIDENDS_RE.test(n) && !DIVIDENDS_EXCLUDE_RE.test(n);
        });
      if (divLines.length > 0) {
        const total = divLines.reduce((s, l) => s + Math.abs(l.value ?? 0), 0);
        push("dividendsPaid", g[0], total, `regra:${divLines.map((l) => l.code).join("+")}`);
      }

      // Plano B para depreciação: ajustes da DFC, se a DVA não trouxe o valor.
      if (!daPeriods.has(periodKey) && layout === "standard") {
        const daLines = f.lines.filter((l) => {
          if (!l.code.startsWith("6.01.01.")) return false;
          const n = normalizeText(l.name);
          return DA_RE.test(n) && !DA_EXCLUDE_RE.test(n) && (l.value ?? 0) > 0;
        });
        if (daLines.length > 0) {
          const total = daLines.reduce((s, l) => s + (l.value ?? 0), 0);
          push("depreciationAmortization", g[0], total, `regra:${daLines.map((l) => l.code).join("+")}`);
        }
      }
    }

    if (st === "BPA") {
      pushLine("totalAssets", f.code("1"));
      const current = f.find(equals("ativo circulante"), { depth: 1 });
      pushLine("currentAssets", current);
      pushLine("cash", f.find(equals("caixa e equivalentes de caixa"), { depth: current ? 2 : 1 }));
      if (current) {
        pushLine("shortTermInvestments", f.find(startsWith("aplicacoes financeiras"), { parent: current.code }));
      }
      const nonCurrent = f.find(equals("ativo nao circulante"), { depth: 1 });
      if (nonCurrent) {
        pushLine("fixedAssets", f.find(equals("imobilizado"), { parent: nonCurrent.code }));
        pushLine("intangibleAssets", f.find(equals("intangivel"), { parent: nonCurrent.code }));
      } else {
        pushLine("fixedAssets", f.find(equals("imobilizado"), { depth: 1 }));
        pushLine("intangibleAssets", f.find(equals("intangivel"), { depth: 1 }));
      }
    }

    if (st === "BPP") {
      const current = f.find(equals("passivo circulante"), { depth: 1 });
      const nonCurrent = f.find(equals("passivo nao circulante"), { depth: 1 });
      pushLine("currentLiabilities", current);
      pushLine("nonCurrentLiabilities", nonCurrent);
      // Dívida bruta só faz sentido no formato padrão (em bancos, captação é a atividade).
      if (layout === "standard") {
        if (current) pushLine("shortTermDebt", f.find(equals("emprestimos e financiamentos"), { parent: current.code }));
        if (nonCurrent) pushLine("longTermDebt", f.find(equals("emprestimos e financiamentos"), { parent: nonCurrent.code }));
      }
      const equity = f.find(startsWith("patrimonio liquido"), { depth: 1 });
      pushLine("equity", equity);
      if (equity && equity.value !== null) {
        const minority = f.find(startsWith("participacao dos acionistas nao controladores"), { parent: equity.code });
        const minorityValue = minority?.value ?? 0;
        if (minority) pushLine("minorityInterest", minority);
        push(
          "equityParent",
          equity,
          equity.value - minorityValue,
          minority ? `${equity.code}-${minority.code}` : equity.code,
        );
      }
    }
  }

  return out;
}

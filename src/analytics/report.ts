/**
 * Relatório pré-moldado: texto gerado por regras fixas a partir dos números,
 * sem IA e sem custo. As mesmas entradas sempre geram o mesmo relatório.
 *
 * Os limites abaixo são referências usuais de análise, não verdades universais,
 * e o relatório não recomenda comprar ou vender.
 */
import type { ProjectionResult } from "./projections";
import { peerMedians } from "./peers";
import { dcf } from "./valuation";
import type { CompanyPageData, SeriesPoint } from "@/server/company";
import { formatCompactCurrency as money, formatCurrency as brl, formatDate, formatMultiple as mult, formatPercent as pct, formatSignedPercent as signed } from "@/lib/format";

export type Tone = "pos" | "neg" | "neu";

export interface ReportItem {
  tone: Tone;
  text: string;
}

export interface ReportSection {
  id: string;
  title: string;
  items: ReportItem[];
}

export interface Pillar {
  label: string;
  status: "Forte" | "Neutro" | "Atenção" | "Sem dado";
}

export interface AutoReport {
  summary: string[];
  pillars: Pillar[];
  highlights: Array<{ label: string; value: string }>;
  sections: ReportSection[];
  scenario: ReportItem[];
  missing: string[];
}

export interface ReportOptions {
  macro: { selic: number | null; cdi: number | null; ipca12m: number | null };
  scenario?: { result: ProjectionResult; netIncomeBase: number | null; avgCost: number | null; isSaved: boolean } | null;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const nonNull = <T,>(xs: Array<T | null | undefined>) => xs.filter((x): x is T => x !== null && x !== undefined);

function pillarOf(items: ReportItem[]): Pillar["status"] {
  if (items.length === 0) return "Sem dado";
  const pos = items.filter((i) => i.tone === "pos").length;
  const neg = items.filter((i) => i.tone === "neg").length;
  if (pos === 0 && neg === 0) return "Neutro";
  if (pos >= neg * 2 && pos > 0) return "Forte";
  if (neg >= pos * 2 && neg > 0) return "Atenção";
  return "Neutro";
}

/** Mesmo trimestre do ano anterior: "3T26" → "3T25". */
function yearAgo(series: SeriesPoint[], point: SeriesPoint) {
  const m = /^(\d)T(\d\d)$/.exec(point.label);
  if (!m) return undefined;
  const label = `${m[1]}T${String(Number(m[2]) - 1).padStart(2, "0")}`;
  return series.find((p) => p.label === label);
}

export function buildReport(d: CompanyPageData, opts: ReportOptions): AutoReport {
  const v = (k: string) => d.indicators[k]?.value ?? null;
  const applicable = (k: string) => d.indicators[k]?.applicable ?? false;
  const isFinancial = d.meta.layout === "bank" || d.meta.layout === "insurance";
  const { selic, cdi, ipca12m } = opts.macro;
  const name = d.meta.tradeName ?? d.meta.name;
  const annual = d.annual;
  const last = annual.at(-1);
  const period = d.ttm ? (d.ttm.kind === "ttm" ? `12 meses até ${formatDate(d.ttm.end)}` : `exercício até ${formatDate(d.ttm.end)}`) : "período indisponível";

  // ── rentabilidade ──
  const profit: ReportItem[] = [];
  const roe = v("roe");
  if (roe !== null) {
    if (roe >= 0.15) profit.push({ tone: "pos", text: `ROE de ${pct(roe)} (${period}), acima da referência de 15%.` });
    else if (selic !== null && roe < selic) profit.push({ tone: "neg", text: `ROE de ${pct(roe)} (${period}), abaixo da Selic de ${pct(selic, 2)}.` });
    else profit.push({ tone: "neu", text: `ROE de ${pct(roe)} (${period}), em faixa intermediária.` });
  }
  const roic = v("roic");
  if (roic !== null) {
    if (roic >= 0.15) profit.push({ tone: "pos", text: `ROIC de ${pct(roic)}: bom retorno sobre o capital investido no negócio.` });
    else if (roic < 0.08) profit.push({ tone: "neg", text: `ROIC de ${pct(roic)}: retorno baixo sobre o capital investido.` });
    else profit.push({ tone: "neu", text: `ROIC de ${pct(roic)}, em faixa intermediária.` });
  }
  if (!isFinancial && annual.length >= 3 && last?.netMargin !== null && last?.netMargin !== undefined) {
    const avg = median(nonNull(annual.slice(-5, -1).map((p) => p.netMargin)));
    if (avg !== null) {
      const diff = last.netMargin - avg;
      if (diff >= 0.015) profit.push({ tone: "pos", text: `Margem líquida de ${pct(last.netMargin)} em ${last.label}, acima da mediana dos anos anteriores (${pct(avg)}).` });
      else if (diff <= -0.015) profit.push({ tone: "neg", text: `Margem líquida de ${pct(last.netMargin)} em ${last.label}, abaixo da mediana dos anos anteriores (${pct(avg)}).` });
      else profit.push({ tone: "neu", text: `Margem líquida de ${pct(last.netMargin)} em ${last.label}, estável frente à mediana dos anos anteriores (${pct(avg)}).` });
    }
  }

  // ── endividamento e caixa ──
  const debt: ReportItem[] = [];
  const nde = v("netDebtEbitda");
  if (isFinancial) {
    debt.push({ tone: "neu", text: "Dívida/EBITDA não se aplica a bancos e seguradoras: captar recursos faz parte da atividade." });
  } else if (nde !== null) {
    if (nde < 0) debt.push({ tone: "pos", text: `Caixa líquido: o caixa supera a dívida (${formatNde(nde)} do EBITDA).` });
    else if (nde <= 1.5) debt.push({ tone: "pos", text: `Dívida líquida/EBITDA de ${mult(nde, 2)}, nível confortável.` });
    else if (nde <= 3) debt.push({ tone: "neu", text: `Dívida líquida/EBITDA de ${mult(nde, 2)}, nível moderado.` });
    else debt.push({ tone: "neg", text: `Dívida líquida/EBITDA de ${mult(nde, 2)}, acima de 3x.` });
  }
  const liq = v("currentRatio");
  if (liq !== null && applicable("currentRatio")) {
    if (liq < 1) debt.push({ tone: "neg", text: `Liquidez corrente de ${mult(liq, 2)}: o passivo de curto prazo supera o ativo de curto prazo.` });
    else if (liq >= 1.5) debt.push({ tone: "pos", text: `Liquidez corrente de ${mult(liq, 2)}, folga no curto prazo.` });
  }
  if (!isFinancial) {
    const fcfs = nonNull(annual.slice(-5).map((p) => p.fcf));
    if (fcfs.length >= 3) {
      const positive = fcfs.filter((x) => x > 0).length;
      const tone: Tone = positive >= fcfs.length - 1 ? "pos" : positive <= fcfs.length / 2 ? "neg" : "neu";
      debt.push({ tone, text: `Fluxo de caixa livre positivo em ${positive} dos últimos ${fcfs.length} anos (capex estimado pela DFC).` });
    }
  }

  // ── crescimento ──
  const growth: ReportItem[] = [];
  const rc = v("revenueCagr5y");
  if (rc !== null) {
    if (rc >= 0.1) growth.push({ tone: "pos", text: `Receita cresceu ${pct(rc)} ao ano em 5 anos.` });
    else if (ipca12m !== null && rc < ipca12m) growth.push({ tone: "neg", text: `Receita cresceu ${pct(rc)} ao ano em 5 anos, menos que o IPCA atual de ${pct(ipca12m, 2)}.` });
    else growth.push({ tone: "neu", text: `Receita cresceu ${pct(rc)} ao ano em 5 anos.` });
  }
  const ec = v("earningsCagr5y");
  if (ec !== null) {
    if (ec >= 0.1) growth.push({ tone: "pos", text: `Lucro cresceu ${pct(ec)} ao ano em 5 anos.` });
    else if (ec < 0) growth.push({ tone: "neg", text: `Lucro encolheu ${pct(Math.abs(ec))} ao ano em 5 anos.` });
    else growth.push({ tone: "neu", text: `Lucro cresceu ${pct(ec)} ao ano em 5 anos.` });
  }
  const losses = annual.filter((p) => p.netIncome !== null && p.netIncome < 0);
  if (annual.length >= 5) {
    if (losses.length === 0) growth.push({ tone: "pos", text: `Sem prejuízo nos ${annual.length} exercícios disponíveis.` });
    else growth.push({ tone: losses.length >= 2 ? "neg" : "neu", text: `Prejuízo em ${losses.length} dos ${annual.length} exercícios (${losses.map((p) => p.label).join(", ")}).` });
  }

  // ── dividendos ──
  const income: ReportItem[] = [];
  const dy = v("dy");
  if (dy !== null) {
    const ref = cdi !== null ? ` O CDI atual é de ${pct(cdi, 2)} ao ano.` : "";
    income.push({ tone: dy >= 0.06 ? "pos" : "neu", text: `Dividend yield de ${pct(dy)} em 12 meses.${ref}` });
    if (d.indicators.dy?.note) income.push({ tone: "neu", text: d.indicators.dy.note });
  }
  const recent = d.dividendsByYear.filter((y) => y.year < new Date(d.quote?.date ?? Date.now()).getFullYear()).slice(-5);
  if (recent.length >= 3) {
    const paid = recent.filter((y) => (y.perShare ?? 0) > 0 || (y.paid ?? 0) > 0).length;
    const tone: Tone = paid === recent.length ? "pos" : paid <= recent.length / 2 ? "neg" : "neu";
    income.push({ tone, text: `Pagou proventos em ${paid} dos últimos ${recent.length} anos.` });
  }
  const payout = v("payout");
  if (payout !== null) {
    if (payout > 1) income.push({ tone: "neg", text: `Payout de ${pct(payout)}: pagou mais do que lucrou em 12 meses, o que pode não se sustentar.` });
    else income.push({ tone: "neu", text: `Payout de ${pct(payout)} em 12 meses.` });
  }

  // ── preço e pares ──
  const market: ReportItem[] = [];
  const others = d.peers.filter((p) => p.ticker !== d.ticker);
  const group = d.peerGroup;
  const weak = group.quality === "fraca";
  const meds = peerMedians(d.peers, d.ticker);
  const hist = d.ownHistory;
  const vsOwn = (label: string, own: number | null, med: number | null | undefined, digits: number) => {
    if (own === null || own <= 0 || med === null || med === undefined) return;
    const diff = own / med - 1;
    const base = `Frente ao próprio histórico: ${label} de ${mult(own, digits)} contra mediana de ${mult(med, digits)} nos últimos fins de ano`;
    if (diff <= -0.2) market.push({ tone: "pos", text: `${base}, ${pct(-diff, 0)} abaixo.` });
    else if (diff >= 0.2) market.push({ tone: "neg", text: `${base}, ${pct(diff, 0)} acima.` });
    else market.push({ tone: "neu", text: `${base}, em linha.` });
  };
  vsOwn("P/L", v("pl"), hist?.medianPl, 1);
  vsOwn("P/VP", v("pvp"), hist?.medianPvp, 2);
  const compare = (label: string, own: number | null, med: number | null, digits: number) => {
    if (own === null || own <= 0 || med === null) return;
    const diff = own / med - 1;
    if (weak) {
      market.push({ tone: "neu", text: `${label} de ${mult(own, digits)} contra mediana de ${mult(med, digits)} de empresas de porte bem diferente.` });
      return;
    }
    const base = `${label} de ${mult(own, digits)} contra mediana de ${mult(med, digits)} dos pares`;
    if (diff <= -0.2) market.push({ tone: "pos", text: `${base}: ${pct(-diff, 0)} mais barata.` });
    else if (diff >= 0.2) market.push({ tone: "neg", text: `${base}: ${pct(diff, 0)} mais cara.` });
    else market.push({ tone: "neu", text: `${base}: em linha com o setor.` });
  };
  if (others.length >= 2) {
    compare("P/L", v("pl"), meds.pl, 1);
    compare("P/VP", v("pvp"), meds.pvp, 2);
    if (!isFinancial) compare("EV/EBITDA", v("evEbitda"), meds.evEbitda, 1);
    if (roe !== null && meds.roe !== null) market.push({ tone: weak ? "neu" : roe > meds.roe ? "pos" : "neg", text: `ROE de ${pct(roe)} ${roe > meds.roe ? "acima" : "abaixo"} da mediana de ${pct(meds.roe)} dos pares.` });
    if (group.quality === "fraca" || group.quality === "ampla") market.push({ tone: "neu", text: group.note });
  } else {
    market.push({ tone: "neu", text: `Poucos pares com dados em “${d.meta.sector}” para uma comparação confiável.` });
  }

  // ── tendências (informativo) ──
  const trends: ReportItem[] = [];
  const five = annual.slice(-5);
  if (five.length >= 2) {
    const a = five[0];
    const b = five[five.length - 1];
    if (a.revenue !== null && b.revenue !== null) trends.push({ tone: "neu", text: `Receita: de ${money(a.revenue, 1)} em ${a.label} para ${money(b.revenue, 1)} em ${b.label}.` });
    if (a.netIncome !== null && b.netIncome !== null) trends.push({ tone: "neu", text: `Lucro: de ${money(a.netIncome, 1)} em ${a.label} para ${money(b.netIncome, 1)} em ${b.label}.` });
    if (!isFinancial && a.ebitdaMargin !== null && b.ebitdaMargin !== null) trends.push({ tone: "neu", text: `Margem EBITDA: de ${pct(a.ebitdaMargin)} em ${a.label} para ${pct(b.ebitdaMargin)} em ${b.label}.` });
    if (!isFinancial && a.netDebt !== null && b.netDebt !== null) trends.push({ tone: "neu", text: `Dívida líquida: de ${money(a.netDebt, 1)} em ${a.label} para ${money(b.netDebt, 1)} em ${b.label} (negativo = caixa líquido).` });
  }
  const lq = d.quarterly.at(-1);
  if (lq) {
    const ya = yearAgo(d.quarterly, lq);
    if (ya?.revenue && lq.revenue !== null && ya.revenue > 0) trends.push({ tone: lq.revenue >= ya.revenue ? "pos" : "neg", text: `Receita do ${lq.label}: ${money(lq.revenue, 1)}, ${signed(lq.revenue / ya.revenue - 1, 1)} sobre o ${ya.label}.` });
    if (ya?.netIncome && lq.netIncome !== null && ya.netIncome > 0) trends.push({ tone: lq.netIncome >= ya.netIncome ? "pos" : "neg", text: `Lucro do ${lq.label}: ${money(lq.netIncome, 1)}, ${signed(lq.netIncome / ya.netIncome - 1, 1)} sobre o ${ya.label}.` });
  }

  // ── valuation (informativo: resultado dos modelos) ──
  const models: ReportItem[] = [];
  const val = d.valuation;
  const modelLine = (label: string, value: number | null, upside: number | null, missing?: string) =>
    models.push({
      tone: "neu",
      text: value !== null ? `${label}: ${brl(value)} por ação (${signed(upside, 1)} frente ao preço de ${brl(val.price)}).` : `${label}: indisponível (${missing ?? "faltam dados"}).`,
    });
  modelLine("Graham", val.graham.value, val.graham.upside, val.graham.missing);
  if (val.bazin.averageDps !== null && val.price) {
    const teto = val.bazin.averageDps / 0.06;
    modelLine("Bazin (rendimento mínimo de 6%)", teto, teto / val.price - 1);
  } else modelLine("Bazin", null, null, "sem histórico de dividendos por ação");
  if (val.applicable && val.dcf.baseFcf !== undefined && val.dcf.shares !== undefined && val.dcf.netDebt !== undefined) {
    const r = dcf(
      { baseFcf: val.dcf.baseFcf, growthRate: val.dcf.growthRate ?? 0.05, years: val.dcf.years ?? 5, terminalGrowth: val.dcf.terminalGrowth ?? 0.04, discountRate: val.dcf.discountRate ?? 0.15, netDebt: val.dcf.netDebt, shares: val.dcf.shares },
      val.price,
    );
    modelLine("DCF com premissas padrão", r.value, r.upside, r.missing);
    if (r.value !== null && r.terminalShare !== null && r.terminalShare > 0.75) models.push({ tone: "neu", text: `No DCF, ${pct(r.terminalShare, 0)} do valor vem da perpetuidade: resultado muito sensível às premissas.` });
  } else if (!val.applicable) {
    models.push({ tone: "neu", text: "DCF não se aplica a bancos e seguradoras." });
  }

  // ── cenário do usuário ──
  const scenario: ReportItem[] = [];
  if (opts.scenario && opts.scenario.result.rows.length > 0) {
    const { result, netIncomeBase, avgCost, isSaved } = opts.scenario;
    const first = result.rows[0];
    const growthText = netIncomeBase && netIncomeBase > 0 ? ` (${signed(first.netIncome / netIncomeBase - 1, 1)} sobre os ${money(netIncomeBase, 1)} atuais)` : "";
    scenario.push({ tone: "neu", text: `Lucro estimado para os próximos 12 meses: ${money(first.netIncome, 1)}${growthText}.` });
    if (first.eps !== null) scenario.push({ tone: "neu", text: `Lucro por ação estimado de ${brl(first.eps)}${first.impliedPl !== null ? `, o que dá um P/L projetado de ${mult(first.impliedPl, 1)}` : ""}.` });
    if (first.dps !== null) {
      const ref = cdi !== null && first.yieldOnPrice !== null ? ` Referência: CDI de ${pct(cdi, 2)} ao ano.` : "";
      scenario.push({ tone: "neu", text: `Com payout de ${pct(first.payout, 0)}, dividendo estimado de ${brl(first.dps)} por ação, ou ${pct(first.yieldOnPrice)} sobre o preço atual.${ref}` });
    }
    if (avgCost !== null && first.yieldOnCost !== null) scenario.push({ tone: "neu", text: `Sobre o seu preço médio de ${brl(avgCost)}, o rendimento estimado é de ${pct(first.yieldOnCost)}.` });
    if (isSaved && result.rows.length > 1) {
      const end = result.rows.at(-1)!;
      scenario.push({ tone: "neu", text: `Na sua projeção de ${end.year} anos: lucro de ${money(end.netIncome, 1)} no último ano e ${brl(result.cumulativeDps)} de dividendos por ação acumulados.` });
      if (result.exitPrice !== null) scenario.push({ tone: "neu", text: `Preço implícito de ${brl(result.exitPrice)} no último ano, retorno de ${signed(result.annualizedReturn, 1)} ao ano sem reinvestir dividendos.` });
    }
  }

  const pillars: Pillar[] = [
    { label: "Rentabilidade", status: pillarOf(profit) },
    { label: "Dívida e caixa", status: isFinancial ? "Sem dado" : pillarOf(debt) },
    { label: "Crescimento", status: pillarOf(growth) },
    { label: "Dividendos", status: pillarOf(income) },
    { label: "Preço relativo", status: others.length >= 2 || hist ? pillarOf(market) : "Sem dado" },
  ];

  const summary: string[] = [];
  const mcap = v("marketCap");
  summary.push(`${name} (${d.ticker}) atua em ${d.meta.sector}${mcap !== null ? ` e vale ${money(mcap, 1)} em bolsa` : ""}.`);
  const lucro = d.ttmValues.netIncome;
  if (lucro !== null) {
    const margin = v("netMargin");
    summary.push(`Nos resultados de ${period}, teve lucro de ${money(lucro, 1)}${d.ttmValues.revenue !== null && !isFinancial ? ` sobre receita de ${money(d.ttmValues.revenue, 1)}` : ""}${margin !== null ? ` (margem líquida de ${pct(margin)})` : ""}.`);
  }
  const pl = v("pl");
  const pvp = v("pvp");
  if (d.quote && (pl !== null || pvp !== null)) summary.push(`A ${brl(d.quote.close)} (${formatDate(d.quote.date)}), negocia a ${[pl !== null ? `P/L de ${mult(pl, 1)}` : null, pvp !== null ? `P/VP de ${mult(pvp, 2)}` : null].filter(Boolean).join(" e ")}.`);

  const highlight = (label: string, value: string, key: string) => (v(key) !== null ? { label, value } : null);
  const highlights = nonNull([
    highlight("P/L", mult(pl, 1), "pl"),
    highlight("P/VP", mult(pvp, 2), "pvp"),
    highlight("ROE", pct(roe), "roe"),
    highlight("DY 12m", pct(dy), "dy"),
    highlight("Margem líq.", pct(v("netMargin")), "netMargin"),
    highlight("Dív. líq./EBITDA", mult(nde, 2), "netDebtEbitda"),
  ]);

  const sections: ReportSection[] = [
    { id: "rentabilidade", title: "Rentabilidade", items: profit },
    { id: "divida", title: "Dívida e geração de caixa", items: debt },
    { id: "crescimento", title: "Crescimento", items: growth },
    { id: "dividendos", title: "Dividendos", items: income },
    { id: "pares", title: "Preço frente ao próprio histórico e aos pares", items: market },
    { id: "tendencias", title: "Tendências", items: trends },
    { id: "valuation", title: "Modelos de valuation (estudo)", items: models },
  ].filter((s) => s.items.length > 0);

  const missing = Object.values(d.indicators)
    .filter((i) => i.applicable && i.value === null && i.missing)
    .map((i) => `${i.label}: ${i.missing}`);

  return { summary, pillars, highlights, sections, scenario, missing };
}

function formatNde(nde: number) {
  return mult(Math.abs(nde), 2);
}

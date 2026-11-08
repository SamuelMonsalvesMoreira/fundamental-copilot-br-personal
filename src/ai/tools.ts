import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { dcf } from "@/analytics/valuation";
import { getCompanyPage, getStatements, searchTickers, type CompanyPageData, type SeriesPoint } from "@/server/company";
import { getMacroSnapshot } from "@/server/macro";
import { calculate } from "./calc";

/**
 * Ferramentas do copiloto. Todas leem o banco local (dados da CVM, Banco
 * Central e brapi já coletados) — a IA nunca "lembra" números.
 *
 * Convenções das respostas:
 * - valores monetários em R$ milhões (campo termina em `_mi`);
 * - frações como 0,153 = 15,3% (campo termina em `_fracao`) ou já em %;
 * - todo resultado traz `periodo` e `fonte`; dado ausente vem como null
 *   com o motivo, nunca como zero.
 */

type Tool = Anthropic.Beta.BetaTool;

const tickerProp = { type: "string", description: "Código de negociação na B3, ex.: WEGE3, PETR4, ITUB4" } as const;

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "buscar_empresa",
    description: "Procura empresas listadas na B3 por ticker ou nome. Use quando o usuário citar uma empresa sem o ticker exato.",
    input_schema: { type: "object", properties: { consulta: { type: "string", description: "Ticker ou parte do nome" } }, required: ["consulta"] },
  },
  {
    name: "resumo_empresa",
    description: "Dados cadastrais e de mercado: nome, setor, tipo (empresa comum, banco, seguradora), preço e data, valor de mercado, período dos últimos resultados e fontes.",
    input_schema: { type: "object", properties: { ticker: tickerProp }, required: ["ticker"] },
  },
  {
    name: "indicadores",
    description:
      "Todos os indicadores fundamentalistas calculados (P/L, P/VP, EV/EBITDA, ROE, ROIC, margens, dívida líquida/EBITDA, dividend yield, payout, CAGR...) com valor, fórmula, período, fonte e motivo quando indisponível ou não aplicável.",
    input_schema: { type: "object", properties: { ticker: tickerProp }, required: ["ticker"] },
  },
  {
    name: "historico_financeiro",
    description:
      "Série histórica de resultados e balanço: receita, lucro bruto, EBITDA, EBIT, lucro líquido, margens, dívida líquida, dívida líquida/EBITDA, patrimônio, caixa operacional, capex, fluxo de caixa livre, dividendos pagos, com variação anual. Anual (até 10 exercícios) ou trimestral (últimos 12 trimestres).",
    input_schema: {
      type: "object",
      properties: { ticker: tickerProp, periodicidade: { type: "string", enum: ["anual", "trimestral"] } },
      required: ["ticker", "periodicidade"],
    },
  },
  {
    name: "pares_setor",
    description: "Empresas do mesmo setor (até 10 maiores) com P/L, P/VP, EV/EBITDA, ROE, margem líquida, DY e dívida líquida/EBITDA, mais a mediana do grupo.",
    input_schema: { type: "object", properties: { ticker: tickerProp }, required: ["ticker"] },
  },
  {
    name: "macro",
    description: "Indicadores macroeconômicos do Banco Central: Selic meta, CDI anualizado e IPCA acumulado em 12 meses, com datas.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "valuation",
    description:
      "Modelos de valuation: Graham, Bazin (rendimento mínimo de 6%) e DCF simples com premissas padrão explicadas. Opcionalmente recalcula o DCF com outras premissas (em fração: 0,15 = 15%).",
    input_schema: {
      type: "object",
      properties: {
        ticker: tickerProp,
        taxa_desconto: { type: "number", description: "Opcional. Fração, ex.: 0.15" },
        crescimento: { type: "number", description: "Opcional. Crescimento anual do FCF, fração" },
        perpetuidade: { type: "number", description: "Opcional. Crescimento na perpetuidade, fração" },
        anos: { type: "integer", description: "Opcional. Anos de projeção (1 a 20)" },
      },
      required: ["ticker"],
    },
  },
  {
    name: "dividendos",
    description: "Histórico de proventos: por ação e por ano (brapi, quando disponível) e total pago no ano pela companhia (DFC/CVM), além de DY e payout de 12 meses.",
    input_schema: { type: "object", properties: { ticker: tickerProp }, required: ["ticker"] },
  },
  {
    name: "demonstracao",
    description:
      "Linhas de uma demonstração anual como publicada na CVM (DFP), em R$ milhões, para o ano pedido e o anterior: DRE, BPA (ativo), BPP (passivo e patrimônio) ou DFC (fluxo de caixa). Use para detalhes como composição da dívida ou do caixa.",
    input_schema: {
      type: "object",
      properties: { ticker: tickerProp, tipo: { type: "string", enum: ["DRE", "BPA", "BPP", "DFC"] }, ano: { type: "integer", description: "Opcional. Padrão: último disponível" } },
      required: ["ticker", "tipo"],
    },
  },
  {
    name: "calcular",
    description:
      "Calculadora aritmética (+ - * / ^ e parênteses). Use SEMPRE que precisar derivar um número (variação, soma, razão) a partir dos dados, em vez de calcular de cabeça.",
    input_schema: { type: "object", properties: { expressao: { type: "string", description: "Ex.: (40804.1 / 37990.2 - 1) * 100" } }, required: ["expressao"] },
  },
].map((t) => ({ ...t, eager_input_streaming: true }) as Tool);

// ─── validação das entradas (o modelo pode mandar entradas incompletas) ─────

const T = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}\d{1,2}$/, "ticker inválido");
const SCHEMAS = {
  buscar_empresa: z.object({ consulta: z.string().min(1).max(40) }),
  resumo_empresa: z.object({ ticker: T }),
  indicadores: z.object({ ticker: T }),
  historico_financeiro: z.object({ ticker: T, periodicidade: z.enum(["anual", "trimestral"]) }),
  pares_setor: z.object({ ticker: T }),
  macro: z.object({}),
  valuation: z.object({
    ticker: T,
    taxa_desconto: z.number().min(0).max(1).optional(),
    crescimento: z.number().min(-0.5).max(1).optional(),
    perpetuidade: z.number().min(-0.1).max(0.2).optional(),
    anos: z.number().int().min(1).max(20).optional(),
  }),
  dividendos: z.object({ ticker: T }),
  demonstracao: z.object({ ticker: T, tipo: z.enum(["DRE", "BPA", "BPP", "DFC"]), ano: z.number().int().min(2000).max(2100).optional() }),
  calcular: z.object({ expressao: z.string().min(1).max(300) }),
} as const;

export type ToolName = keyof typeof SCHEMAS;

// ─── execução ────────────────────────────────────────────────────────────────

const mi = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round((v / 1e6) * 10) / 10);
const r = (v: number | null | undefined, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
const CVM = "CVM Dados Abertos (DFP/ITR)";

export class ToolContext {
  private readonly pages = new Map<string, CompanyPageData | null>();
  async page(ticker: string) {
    if (!this.pages.has(ticker)) this.pages.set(ticker, await getCompanyPage(ticker));
    const p = this.pages.get(ticker)!;
    if (!p) throw new ToolError(`Ticker ${ticker} não encontrado entre as ações listadas na B3 (cadastro CVM).`);
    return p;
  }
}

export class ToolError extends Error {}

function seriesOut(points: SeriesPoint[]) {
  return points.map((p, i) => {
    const prev = points[i - 1];
    const yoy = (a: number | null, b: number | null | undefined) => (a !== null && b !== null && b !== undefined && b > 0 ? r(a / b - 1) : null);
    return {
      periodo: p.label,
      fim: p.end,
      receita_mi: mi(p.revenue),
      receita_var_fracao: prev ? yoy(p.revenue, prev.revenue) : null,
      lucro_bruto_mi: mi(p.grossProfit),
      ebitda_mi: mi(p.ebitda),
      ebit_mi: mi(p.ebit),
      lucro_liquido_controladores_mi: mi(p.netIncome),
      lucro_var_fracao: prev ? yoy(p.netIncome, prev.netIncome) : null,
      margem_bruta_fracao: r(p.grossMargin),
      margem_ebitda_fracao: r(p.ebitdaMargin),
      margem_liquida_fracao: r(p.netMargin),
      divida_liquida_mi: mi(p.netDebt),
      divida_liquida_ebitda: r(p.netDebtEbitda, 2),
      patrimonio_controladores_mi: mi(p.equity),
      caixa_operacional_mi: mi(p.operatingCashFlow),
      capex_mi: mi(p.capex),
      fluxo_caixa_livre_mi: mi(p.fcf),
      dividendos_pagos_mi: mi(p.dividendsPaid),
    };
  });
}

export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<unknown> {
  if (!(name in SCHEMAS)) throw new ToolError(`Ferramenta desconhecida: ${name}`);
  const parsed = SCHEMAS[name as ToolName].safeParse(rawInput);
  if (!parsed.success) throw new ToolError(`Entrada inválida: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  const input = parsed.data as Record<string, unknown>;

  switch (name as ToolName) {
    case "buscar_empresa":
      return { resultados: searchTickers(String(input.consulta), 6).map((s) => ({ ticker: s.ticker, nome: s.name, setor: s.sector, preco: s.close })) };

    case "resumo_empresa": {
      const p = await ctx.page(String(input.ticker));
      return {
        ticker: p.ticker,
        nome: p.meta.tradeName ?? p.meta.name,
        razao_social: p.meta.name,
        setor: p.meta.sector,
        tipo: p.meta.layout === "bank" ? "banco" : p.meta.layout === "insurance" ? "seguradora" : "empresa não financeira",
        segmento_listagem: p.meta.listingSegment,
        outras_classes: p.classes.map((c) => c.ticker),
        preco: p.quote ? { valor: p.quote.close, data: p.quote.date, variacao_dia_fracao: r(p.quote.changePct), fonte: "brapi.dev" } : null,
        valor_mercado_mi: mi(p.indicators.marketCap?.value),
        acoes_em_circulacao: p.sharesOutstanding,
        resultados_periodo: p.ttm ? (p.ttm.kind === "ttm" ? `12 meses até ${p.ttm.end} (${p.ttm.composition})` : `exercício até ${p.ttm.end}`) : null,
        fontes: p.sources,
      };
    }

    case "indicadores": {
      const p = await ctx.page(String(input.ticker));
      return {
        ticker: p.ticker,
        periodo_resultados: p.ttm?.end ?? null,
        indicadores: Object.values(p.indicators).map((i) => ({
          chave: i.key,
          nome: i.label,
          valor: i.value === null ? null : r(i.value, 4),
          formato: i.format === "percent" ? "fração (0,15 = 15%)" : i.format === "currency" ? "R$" : i.format === "multiple" ? "múltiplo (x)" : i.format === "perShare" ? "R$ por ação" : "número",
          periodo: i.period,
          formula: i.formula,
          entradas: i.inputs.map((x) => ({ nome: x.label, valor: x.value === null ? null : x.format === "currency" ? mi(x.value) : r(x.value), unidade: x.format === "currency" ? "R$ mi" : x.format, periodo: x.period, fonte: x.source })),
          aplicavel: i.applicable,
          indisponivel_motivo: i.missing ?? null,
          observacao: i.note ?? null,
        })),
      };
    }

    case "historico_financeiro": {
      const p = await ctx.page(String(input.ticker));
      const anual = input.periodicidade === "anual";
      return {
        ticker: p.ticker,
        periodicidade: input.periodicidade,
        unidade: "R$ milhões; *_fracao em fração (0,15 = 15%)",
        fonte: anual ? `${CVM} — DFP consolidada` : `${CVM} — ITR/DFP (trimestres de 3 meses)`,
        observacoes: [
          "lucro = atribuído aos controladores",
          "EBITDA = EBIT + depreciação (sem ajustes)",
          "capex estimado pelas linhas de imobilizado/intangível da DFC",
          p.meta.layout !== "standard" && p.meta.layout !== null ? "empresa financeira: EBITDA, dívida e margens não se aplicam" : null,
        ].filter(Boolean),
        serie: seriesOut(anual ? p.annual : p.quarterly),
      };
    }

    case "pares_setor": {
      const p = await ctx.page(String(input.ticker));
      const med = (k: keyof (typeof p.peers)[number]) => {
        const xs = p.peers.map((x) => x[k] as number | null).filter((v): v is number => v !== null).sort((a, b) => a - b);
        if (!xs.length) return null;
        const m = Math.floor(xs.length / 2);
        return r(xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2);
      };
      return {
        setor: p.meta.sector,
        fonte: "Indicadores calculados com dados da CVM e cotações da brapi.dev (último pregão)",
        empresas: p.peers.map((x) => ({
          ticker: x.ticker,
          nome: x.name,
          valor_mercado_mi: mi(x.marketCap),
          pl: r(x.pl, 2),
          pvp: r(x.pvp, 2),
          ev_ebitda: r(x.evEbitda, 2),
          roe_fracao: r(x.roe),
          margem_liquida_fracao: r(x.netMargin),
          dy_fracao: r(x.dy),
          divida_liquida_ebitda: r(x.netDebtEbitda, 2),
        })),
        mediana: { pl: med("pl"), pvp: med("pvp"), ev_ebitda: med("evEbitda"), roe_fracao: med("roe"), margem_liquida_fracao: med("netMargin"), dy_fracao: med("dy") },
      };
    }

    case "macro":
      return { fonte: "Banco Central do Brasil — SGS", valores: getMacroSnapshot().map((m) => ({ nome: m.label, valor_fracao_ao_ano: r(m.value), data: m.date })) };

    case "valuation": {
      const p = await ctx.page(String(input.ticker));
      const v = p.valuation;
      const custom = ["taxa_desconto", "crescimento", "perpetuidade", "anos"].some((k) => input[k] !== undefined);
      const base = v.dcf;
      const dcfInput =
        v.applicable && base.baseFcf !== undefined && base.shares !== undefined && base.netDebt !== undefined
          ? {
              baseFcf: base.baseFcf,
              growthRate: (input.crescimento as number | undefined) ?? base.growthRate ?? 0.05,
              years: (input.anos as number | undefined) ?? base.years ?? 5,
              terminalGrowth: (input.perpetuidade as number | undefined) ?? base.terminalGrowth ?? 0.04,
              discountRate: (input.taxa_desconto as number | undefined) ?? base.discountRate ?? 0.15,
              netDebt: base.netDebt,
              shares: base.shares,
            }
          : null;
      const d = dcfInput ? dcf(dcfInput, v.price) : null;
      return {
        ticker: p.ticker,
        preco_atual: v.price,
        aviso: "Modelos simplificados para estudo; não são preço-alvo nem recomendação.",
        graham: { valor_por_acao: r(v.graham.value, 2), potencial_fracao: r(v.graham.upside), formula: v.graham.formula, lpa: r(v.lpa, 2), vpa: r(v.vpa, 2), indisponivel_motivo: v.graham.missing ?? null },
        bazin: {
          dividendos_por_acao_media: r(v.bazin.averageDps, 4),
          rendimento_minimo_fracao: 0.06,
          preco_teto: v.bazin.averageDps !== null ? r(v.bazin.averageDps / 0.06, 2) : null,
          por_ano: v.bazin.perYear.map((x) => ({ ano: x.year, por_acao: r(x.total, 4) })),
          fonte: v.bazin.source,
        },
        dcf: d
          ? {
              premissas: {
                fcf_base_mi: mi(dcfInput!.baseFcf),
                crescimento_fracao: r(dcfInput!.growthRate),
                anos: dcfInput!.years,
                perpetuidade_fracao: r(dcfInput!.terminalGrowth),
                taxa_desconto_fracao: r(dcfInput!.discountRate),
                divida_liquida_mais_minoritarios_mi: mi(dcfInput!.netDebt),
                acoes: dcfInput!.shares,
                origem: custom ? "premissas informadas na pergunta" : base.notes,
              },
              valor_por_acao: r(d.value, 2),
              potencial_fracao: r(d.upside),
              parcela_do_valor_na_perpetuidade_fracao: r(d.terminalShare),
              alerta: d.missing ?? null,
            }
          : { indisponivel_motivo: v.applicable ? "faltam fluxo de caixa, dívida ou quantidade de ações" : "não se aplica a bancos e seguradoras" },
      };
    }

    case "dividendos": {
      const p = await ctx.page(String(input.ticker));
      return {
        ticker: p.ticker,
        por_ano: p.dividendsByYear.map((d) => ({ ano: d.year, por_acao: r(d.perShare, 4), total_pago_mi: mi(d.paid) })),
        fontes: { por_acao: "brapi.dev (data ex)", total_pago: `${CVM} — DFC (valor pago no ano)` },
        dy_12m_fracao: r(p.indicators.dy?.value),
        dy_metodo: p.indicators.dy?.formula ?? null,
        dy_observacao: p.indicators.dy?.note ?? null,
        payout_12m_fracao: r(p.indicators.payout?.value),
      };
    }

    case "demonstracao": {
      const tables = getStatements(String(input.ticker));
      const t = tables.find((x) => x.statement === input.tipo);
      if (!t) throw new ToolError(`Demonstração ${input.tipo} não disponível para ${input.ticker}.`);
      let idx = t.years.length - 1;
      if (input.ano) {
        idx = t.years.findIndex((y) => y.startsWith(String(input.ano)));
        if (idx < 0) throw new ToolError(`Ano ${input.ano} não disponível. Anos: ${t.years.map((y) => y.slice(0, 4)).join(", ")}.`);
      }
      return {
        ticker: String(input.ticker),
        demonstracao: input.tipo,
        unidade: "R$ milhões",
        fonte: `${CVM} — DFP, como publicada`,
        periodos: [t.years[idx - 1], t.years[idx]].filter(Boolean),
        linhas: t.rows
          .filter((row) => row.depth <= 2)
          .map((row) => ({ conta: row.code, nome: row.name, valores_mi: [row.values[idx - 1], row.values[idx]].filter((_, i) => i > 0 || idx > 0).map(mi) })),
      };
    }

    case "calcular": {
      try {
        return { expressao: input.expressao, resultado: calculate(String(input.expressao)) };
      } catch (err) {
        throw new ToolError(`Não foi possível calcular: ${(err as Error).message}`);
      }
    }
  }
}

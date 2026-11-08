/**
 * Cadastro de companhias e códigos de negociação.
 *
 * - Cadastro (cad_cia_aberta.csv): nome, código CVM, setor, situação.
 * - FCA, tabela "valor_mobiliario": liga cada CNPJ aos seus tickers na B3.
 *   Assim o mapeamento ticker → empresa é automático, sem lista feita à mão.
 */
import { iterateCsv } from "../csv";
import { cnpjDigits, normalizeText } from "./urls";

export interface CadastroRow {
  cnpj: string;
  cvmCode: string;
  name: string;
  tradeName: string | null;
  sector: string | null;
  status: string | null;
}

export function parseCadastro(text: string): CadastroRow[] {
  const byCnpj = new Map<string, CadastroRow & { canceled: boolean }>();
  for (const r of iterateCsv(text)) {
    if (!r.CNPJ_CIA) continue;
    const row = {
      cnpj: cnpjDigits(r.CNPJ_CIA),
      cvmCode: String(Number(r.CD_CVM)),
      name: r.DENOM_SOCIAL.trim(),
      tradeName: r.DENOM_COMERC?.trim() || null,
      sector: r.SETOR_ATIV?.trim() || null,
      status: r.SIT?.trim() || null,
      canceled: Boolean(r.DT_CANCEL),
    };
    // O mesmo CNPJ pode aparecer mais de uma vez (registros antigos cancelados).
    const prev = byCnpj.get(row.cnpj);
    if (!prev || (prev.canceled && !row.canceled)) byCnpj.set(row.cnpj, row);
  }
  return [...byCnpj.values()].map((r) => ({
    cnpj: r.cnpj,
    cvmCode: r.cvmCode,
    name: r.name,
    tradeName: r.tradeName,
    sector: r.sector,
    status: r.status,
  }));
}

export interface TickerRow {
  ticker: string;
  cnpj: string;
  shareClass: "ON" | "PN" | "UNIT";
  segment: string | null;
  referenceDate: string;
  /** só units: total de ações por unit, lido do FCA */
  sharesPerUnit: number | null;
  unitComposition: string | null;
}

/**
 * Lê a composição de uma unit no texto livre do FCA:
 * "1 ON / 2 PN", "1 ação ordinária e 4 ações preferenciais",
 * "1 KLBN3 + 4 KLBN4", "1 ON e 2PNs". Retorna null se não entender.
 */
export function parseUnitComposition(text: string | null | undefined): { on: number; pn: number; total: number } | null {
  if (!text) return null;
  const t = normalizeText(text);
  if (/recibo|bonus/.test(t)) return null;
  let on = 0;
  let pn = 0;
  for (const m of t.matchAll(/(\d+)\s*(?:\([a-z]+\)\s*)?(?:ac(?:ao|oes)\s+)?(ordinarias?|on\b|preferenciais|preferencial|pna?s?\b|[a-z]{4}[3-8]\b)/g)) {
    const qty = Number(m[1]);
    const kind = m[2];
    if (kind.startsWith("ordin") || kind === "on" || kind.endsWith("3")) on += qty;
    else pn += qty;
  }
  const total = on + pn;
  return total > 0 ? { on, pn, total } : null;
}

const TICKER_RE = /^[A-Z0-9]{4}(3|4|5|6|7|8|11)$/;

function shareClassOf(valorMobiliario: string): TickerRow["shareClass"] | null {
  const v = normalizeText(valorMobiliario);
  if (v === "acoes ordinarias") return "ON";
  if (v === "acoes preferenciais") return "PN";
  if (v === "units") return "UNIT";
  return null;
}

/**
 * Extrai os tickers negociados em bolsa. Considera só a versão mais recente
 * do FCA de cada companhia e ignora valores mobiliários com negociação encerrada.
 */
export function parseFcaTickers(text: string): TickerRow[] {
  const rows = [...iterateCsv(text)];

  // versão mais recente por companhia
  const latest = new Map<string, { date: string; version: number }>();
  for (const r of rows) {
    const cnpj = cnpjDigits(r.CNPJ_Companhia);
    const cand = { date: r.Data_Referencia, version: Number(r.Versao) || 0 };
    const cur = latest.get(cnpj);
    if (!cur || cand.date > cur.date || (cand.date === cur.date && cand.version > cur.version)) {
      latest.set(cnpj, cand);
    }
  }

  const out = new Map<string, TickerRow>();
  for (const r of rows) {
    const cnpj = cnpjDigits(r.CNPJ_Companhia);
    const l = latest.get(cnpj)!;
    if (r.Data_Referencia !== l.date || (Number(r.Versao) || 0) !== l.version) continue;
    if (normalizeText(r.Mercado) !== "bolsa") continue;
    if (r.Data_Fim_Negociacao) continue;
    const shareClass = shareClassOf(r.Valor_Mobiliario);
    if (!shareClass) continue;
    const ticker = r.Codigo_Negociacao.trim().toUpperCase();
    if (!TICKER_RE.test(ticker)) continue;
    const composition = shareClass === "UNIT" ? r.Composicao_BDR_Unit?.trim() || null : null;
    out.set(ticker, {
      ticker,
      cnpj,
      shareClass,
      segment: r.Segmento?.trim() || null,
      referenceDate: l.date,
      sharesPerUnit: parseUnitComposition(composition)?.total ?? null,
      unitComposition: composition,
    });
  }
  return [...out.values()];
}

/**
 * Séries do Banco Central (SGS — Sistema Gerenciador de Séries Temporais).
 * API pública, sem token: https://api.bcb.gov.br/dados/serie/bcdata.sgs.{id}/dados
 *
 * Limite da API: séries diárias aceitam no máximo 10 anos por consulta,
 * então buscamos em janelas.
 */
import type Database from "better-sqlite3";
import { fetchWithRetry } from "../http";
import { trackRun } from "../runs";

export const BCB_SOURCE = "Banco Central do Brasil — SGS";

export interface SgsSeries {
  id: number;
  key: string;
  label: string;
  unit: string;
  periodicity: "daily" | "monthly";
}

export const SGS_SERIES: SgsSeries[] = [
  { id: 432, key: "selic", label: "Selic meta", unit: "% a.a.", periodicity: "daily" },
  { id: 12, key: "cdi", label: "CDI", unit: "% a.d.", periodicity: "daily" },
  { id: 433, key: "ipca", label: "IPCA mensal", unit: "% a.m.", periodicity: "monthly" },
  { id: 13522, key: "ipca12m", label: "IPCA 12 meses", unit: "% em 12 meses", periodicity: "monthly" },
];

export const sgsUrl = (id: number, from: string, to: string) =>
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${id}/dados?formato=json&dataInicial=${from}&dataFinal=${to}`;

/** "2026-11-08" → "08/11/2026" */
const toBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** "08/11/2026" → "2026-11-08" */
export const fromBr = (br: string) => `${br.slice(6, 10)}-${br.slice(3, 5)}-${br.slice(0, 2)}`;

export interface SgsPoint {
  date: string;
  value: number;
}

/**
 * Converte a resposta do SGS. Descarta datas futuras: a Selic meta é
 * publicada até a próxima reunião do Copom, o que não é um dado observado.
 */
export function parseSgs(json: unknown, today: string): SgsPoint[] {
  if (!Array.isArray(json)) return [];
  const out: SgsPoint[] = [];
  for (const item of json) {
    const d = (item as { data?: string }).data;
    const v = Number(String((item as { valor?: string }).valor ?? "").replace(",", "."));
    if (!d || !Number.isFinite(v)) continue;
    const date = fromBr(d);
    if (date > today) continue;
    out.push({ date, value: v });
  }
  return out;
}

/** Janelas de até ~10 anos entre duas datas ISO. */
export function windows(from: string, to: string, years = 9): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let start = from;
  while (start <= to) {
    const endYear = Number(start.slice(0, 4)) + years;
    const end = `${endYear}${start.slice(4)}` < to ? `${endYear}${start.slice(4)}` : to;
    out.push([start, end]);
    const next = new Date(end + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    start = next.toISOString().slice(0, 10);
  }
  return out;
}

const todaySaoPaulo = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export async function ingestMacro(sqlite: Database.Database, opts: { full?: boolean; log?: (m: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  const today = todaySaoPaulo();
  const insert = sqlite.prepare(
    `INSERT OR REPLACE INTO macro_series (series_id, date, value, source, fetched_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const lastDate = sqlite.prepare(`SELECT MAX(date) AS d FROM macro_series WHERE series_id = ?`);

  return trackRun(sqlite, { job: "bcb:sgs", source: BCB_SOURCE, sourceUrl: "https://www3.bcb.gov.br/sgspub" }, async () => {
    let total = 0;
    let asOf: string | null = null;
    for (const s of SGS_SERIES) {
      const last = (lastDate.get(s.id) as { d: string | null }).d;
      // incremental: refaz os últimos 60 dias (revisões); completo: desde 2010
      let from = "2010-01-01";
      if (last && !opts.full) {
        const d = new Date(last + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - 60);
        from = d.toISOString().slice(0, 10);
      }
      const points: SgsPoint[] = [];
      for (const [a, b] of windows(from, today)) {
        const res = await fetchWithRetry(sgsUrl(s.id, toBr(a), toBr(b)), { timeoutMs: 60_000 });
        if (res.status === 404) continue;
        if (!res.ok) throw new Error(`SGS ${s.id}: HTTP ${res.status}`);
        points.push(...parseSgs(await res.json(), today));
      }
      const now = new Date().toISOString();
      sqlite.transaction(() => {
        for (const p of points) insert.run(s.id, p.date, p.value, BCB_SOURCE, now);
      })();
      total += points.length;
      const latest = points.at(-1)?.date ?? null;
      if (latest && (!asOf || latest > asOf)) asOf = latest;
      log(`${s.label}: ${points.length} pontos (até ${latest ?? "—"})`);
    }
    return { rows: total, dataAsOf: asOf, message: SGS_SERIES.map((s) => s.label).join(", ") };
  });
}

import "server-only";
import { sqlite } from "@/db/client";
import { BCB_SOURCE } from "@/ingest/bcb";

export interface MacroValue {
  key: "selic" | "cdi" | "ipca12m";
  label: string;
  /** fração ao ano (0.1375 = 13,75% a.a.) */
  value: number;
  date: string;
  source: string;
}

/** Converte taxa diária (% a.d.) em anual com 252 dias úteis. */
export const annualizeDaily = (pctPerDay: number) => Math.pow(1 + pctPerDay / 100, 252) - 1;

/** Últimos valores de Selic, CDI e IPCA 12 meses. */
export function getMacroSnapshot(): MacroValue[] {
  const last = sqlite.prepare(
    `SELECT date, value FROM macro_series WHERE series_id = ? ORDER BY date DESC LIMIT 1`,
  );
  const out: MacroValue[] = [];
  const selic = last.get(432) as { date: string; value: number } | undefined;
  if (selic) out.push({ key: "selic", label: "Selic meta", value: selic.value / 100, date: selic.date, source: BCB_SOURCE });
  const cdi = last.get(12) as { date: string; value: number } | undefined;
  if (cdi) out.push({ key: "cdi", label: "CDI (anualizado)", value: annualizeDaily(cdi.value), date: cdi.date, source: BCB_SOURCE });
  const ipca = last.get(13522) as { date: string; value: number } | undefined;
  if (ipca) out.push({ key: "ipca12m", label: "IPCA 12 meses", value: ipca.value / 100, date: ipca.date, source: BCB_SOURCE });
  return out;
}

/**
 * Agenda das coletas.
 *
 * - Mercado (cotações + macro): dias úteis às 19h30 (após o fechamento da B3).
 * - CVM (cadastro, DFP/ITR do ano atual e anterior): todo dia às 7h. Só baixa
 *   o que mudou, então quase sempre termina em segundos. Na prática os balanços
 *   chegam trimestralmente.
 *
 * Como o computador pessoal nem sempre está ligado no horário, ao iniciar o
 * agendador recupera o atraso: se a última coleta bem-sucedida for antiga
 * demais, ela roda na hora.
 */
import type Database from "better-sqlite3";

export const TIMEZONE = "America/Sao_Paulo";

export interface Job {
  name: string;
  cron: string;
  /** job em ingest_runs usado para saber quando foi a última coleta */
  runJob: string;
  /** idade máxima (horas) antes de rodar ao iniciar */
  maxAgeHours: number;
}

export const JOBS = {
  market: { name: "Mercado (cotações e macro)", cron: "30 19 * * 1-5", runJob: "brapi:list", maxAgeHours: 30 },
  cvm: { name: "CVM (DFP/ITR)", cron: "0 7 * * *", runJob: "cvm:cadastro", maxAgeHours: 26 },
} satisfies Record<string, Job>;

/** Horas desde a última coleta bem-sucedida do job (Infinity se nunca rodou). */
export function hoursSinceLastOk(sqlite: Database.Database, runJob: string, now = Date.now()): number {
  const row = sqlite
    .prepare(
      `SELECT MAX(COALESCE(finished_at, started_at)) AS t FROM ingest_runs WHERE job = ? AND status IN ('ok', 'skipped')`,
    )
    .get(runJob) as { t: string | null };
  return row.t ? (now - Date.parse(row.t)) / 3_600_000 : Infinity;
}

/** No fim de semana não há pregão novo: a coleta de sexta continua valendo. */
export function isMarketStale(hoursSince: number, now = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(now);
  const weekendAllowance = weekday === "Sat" ? 24 : weekday === "Sun" ? 48 : weekday === "Mon" ? 72 : 0;
  return hoursSince > JOBS.market.maxAgeHours + weekendAllowance;
}

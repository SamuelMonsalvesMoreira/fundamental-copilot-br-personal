import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";
import { migrate } from "./migrations";

export const DEFAULT_DB_PATH = "data/app.db";

/** Abre (ou cria) o banco, aplica migrações e devolve o cliente Drizzle. */
export function openDatabase(path = process.env.DATABASE_PATH || DEFAULT_DB_PATH) {
  const isMemory = path === ":memory:";
  // Caminho definido em tempo de execução: não deve ser rastreado pelo bundler.
  const file = isMemory ? path : resolve(/*turbopackIgnore: true*/ path);
  if (!isMemory) mkdirSync(dirname(file), { recursive: true });

  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  migrate(sqlite);

  return { sqlite, db: drizzle(sqlite, { schema }) };
}

export type AppDatabase = ReturnType<typeof openDatabase>["db"];

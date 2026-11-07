import "server-only";
import { openDatabase } from "./open";

/**
 * Conexão única com o SQLite para o servidor Next.js.
 * Scripts de coleta (fora do Next) usam `openDatabase` diretamente.
 */
const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof openDatabase> };

export const { db, sqlite } = (globalForDb.__db ??= openDatabase());

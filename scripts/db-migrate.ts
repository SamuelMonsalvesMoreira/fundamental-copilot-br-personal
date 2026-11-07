/** Cria o banco local (se não existir) e aplica as migrações pendentes. */
import "./env";
import { openDatabase, DEFAULT_DB_PATH } from "../src/db/open";

const path = process.env.DATABASE_PATH || DEFAULT_DB_PATH;
const { sqlite } = openDatabase(path);
console.log(`Banco pronto em ${path} (esquema v${sqlite.pragma("user_version", { simple: true })}).`);
sqlite.close();

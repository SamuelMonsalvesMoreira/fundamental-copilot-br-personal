/**
 * Coleta da CVM.
 *
 *   npm run ingest:cvm                   # cadastro + DFP/ITR dos últimos ~11 anos
 *   npm run ingest:cvm -- --from 2024    # a partir de um ano
 *   npm run ingest:cvm -- --force        # baixa de novo mesmo sem mudanças
 *   npm run ingest:cvm -- --only cadastro
 */
import "./env";
import { parseArgs } from "node:util";
import { openDatabase } from "../src/db/open";
import { ingestCvm, ingestRegistry } from "../src/ingest/cvm";

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    force: { type: "boolean", default: false },
    only: { type: "string" },
  },
});

const log = (m: string) => console.log(`[${new Date().toLocaleTimeString("pt-BR")}] ${m}`);
const { sqlite } = openDatabase();

try {
  if (values.only === "cadastro") {
    await ingestRegistry(sqlite, { force: values.force, log });
  } else {
    const { errors } = await ingestCvm(sqlite, {
      fromYear: values.from ? Number(values.from) : undefined,
      toYear: values.to ? Number(values.to) : undefined,
      force: values.force,
      log,
    });
    if (errors.length) {
      console.error(`\n${errors.length} arquivo(s) com erro:\n- ${errors.join("\n- ")}`);
      process.exitCode = 1;
    }
  }
} finally {
  sqlite.close();
}

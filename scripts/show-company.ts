/** Mostra a análise de um ticker no terminal: npm run show -- WEGE3 */
import "./env";
import { openDatabase } from "../src/db/open";
import { analyzeByCnpj, findTicker } from "../src/data/company-data";

const { sqlite } = openDatabase();
for (const t of process.argv.slice(2)) {
  const ref = findTicker(sqlite, t);
  if (!ref) {
    console.log(`${t}: ticker não encontrado`);
    continue;
  }
  const a = analyzeByCnpj(sqlite, ref.cnpj, t);
  console.log(`\n== ${t} | ${a.ttm?.kind} ${a.ttm?.composition} | preço ${a.price?.close} (${a.price?.date}) | ações ${a.sharesOutstanding}`);
  for (const i of Object.values(a.indicators)) {
    const v = i.value === null ? `— (${i.missing})` : i.format === "percent" ? `${(i.value * 100).toFixed(2)}%` : i.format === "currency" ? `${(i.value / 1e9).toFixed(2)} bi` : i.value.toFixed(2);
    console.log(`  ${i.label.padEnd(26)} ${v}`);
  }
}
sqlite.close();

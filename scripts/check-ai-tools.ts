/**
 * Executa todas as ferramentas do copiloto contra o banco local, sem chamar
 * a API do Claude. Útil para conferir o que a IA vai receber.
 *   npm run check:ai-tools -- WEGE3
 */
import "./env";
import { executeTool, TOOL_DEFINITIONS, ToolContext } from "../src/ai/tools";

const ticker = process.argv[2] ?? "WEGE3";
const ctx = new ToolContext();
const inputs: Record<string, unknown> = {
  buscar_empresa: { consulta: ticker.slice(0, 4) },
  resumo_empresa: { ticker },
  indicadores: { ticker },
  historico_financeiro: { ticker, periodicidade: "anual" },
  pares_setor: { ticker },
  macro: {},
  valuation: { ticker },
  dividendos: { ticker },
  demonstracao: { ticker, tipo: "BPP" },
  calcular: { expressao: "(40804.1 / 37990.2 - 1) * 100" },
};
for (const t of TOOL_DEFINITIONS) {
  try {
    const out = await executeTool(t.name, inputs[t.name], ctx);
    const json = JSON.stringify(out);
    console.log(`OK   ${t.name.padEnd(22)} ${String(json.length).padStart(6)} chars  ${json.slice(0, 150)}`);
  } catch (err) {
    console.log(`ERRO ${t.name.padEnd(22)} ${(err as Error).message}`);
  }
}
// entradas inválidas devem virar erro claro, não exceção genérica
for (const [name, input] of [["indicadores", { ticker: "x" }], ["historico_financeiro", { ticker }], ["valuation", { ticker: "ZZZZ3" }]] as const) {
  try {
    await executeTool(name, input, ctx);
    console.log(`??   ${name} aceitou entrada inválida`);
  } catch (err) {
    console.log(`OK   erro esperado em ${name}: ${(err as Error).message}`);
  }
}

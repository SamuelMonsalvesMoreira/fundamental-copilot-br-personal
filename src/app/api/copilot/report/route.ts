import { z } from "zod";
import { hasApiKey, REPORT_MODEL, runAgent } from "@/ai/agent";
import { contextBlock, REPORT_SYSTEM } from "@/ai/prompts";
import { noKeyResponse, sseResponse } from "@/ai/stream-response";
import { executeTool, TOOL_DEFINITIONS, ToolContext } from "@/ai/tools";
import { saveReport } from "@/server/reports";

const Body = z.object({ ticker: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}\d{1,2}$/) });

/** Gera o relatório completo (modelo mais capaz) e salva no banco ao final. */
export async function POST(request: Request) {
  if (!hasApiKey()) return noKeyResponse();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Requisição inválida." }, { status: 400 });
  const { ticker } = parsed.data;
  const ctx = new ToolContext();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const model = REPORT_MODEL();

  return sseResponse(async (emit, signal) => {
    const out = await runAgent({
      model,
      effort: "high",
      system: REPORT_SYSTEM,
      context: contextBlock(ticker, today),
      tools: TOOL_DEFINITIONS,
      messages: [{ role: "user", content: `Escreva o relatório de análise fundamentalista de ${ticker}.` }],
      maxTokens: 64000,
      maxIterations: 14,
      executeTool: (name, input) => executeTool(name, input, ctx),
      onEvent: emit,
      signal,
    });
    if (out && out.text.trim()) {
      const page = await ctx.page(ticker).catch(() => null);
      saveReport({ ticker, model, content: out.text, dataAsOf: page?.ttm?.end ?? null, priceDate: page?.quote?.date ?? null, trace: out.trace, verification: out.verification });
    }
  }, request);
}

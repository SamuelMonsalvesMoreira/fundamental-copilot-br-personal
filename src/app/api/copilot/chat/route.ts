import { z } from "zod";
import { CHAT_MODEL, hasApiKey, runAgent } from "@/ai/agent";
import { CHAT_SYSTEM, contextBlock } from "@/ai/prompts";
import { noKeyResponse, sseResponse } from "@/ai/stream-response";
import { executeTool, TOOL_DEFINITIONS, ToolContext } from "@/ai/tools";

const Body = z.object({
  ticker: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}\d{1,2}$/),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(8000) }))
    .min(1)
    .max(30)
    .refine((m) => m.at(-1)?.role === "user", "a última mensagem deve ser do usuário"),
});

/**
 * Chat do copiloto. O histórico chega só com o texto das mensagens: cada
 * pergunta consulta as ferramentas de novo, então os números estão sempre
 * atualizados com o banco.
 */
export async function POST(request: Request) {
  if (!hasApiKey()) return noKeyResponse();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Requisição inválida." }, { status: 400 });
  const { ticker, messages } = parsed.data;
  const ctx = new ToolContext();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return sseResponse(async (emit, signal) => {
    await runAgent({
      model: CHAT_MODEL(),
      effort: "medium",
      system: CHAT_SYSTEM,
      context: contextBlock(ticker, today),
      tools: TOOL_DEFINITIONS,
      messages: messages.map((m) => ({ role: m.role, content: m.text })),
      maxTokens: 16000,
      executeTool: (name, input) => executeTool(name, input, ctx),
      onEvent: emit,
      signal,
    });
  }, request);
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent } from "./agent";

/** Mensagem amigável para erros da API do Claude. */
export function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Chave da API do Claude inválida. Confira ANTHROPIC_API_KEY no .env.local.";
  if (err instanceof Anthropic.PermissionDeniedError) return "A chave da API não tem permissão para este modelo.";
  if (err instanceof Anthropic.RateLimitError) return "Limite de uso da API atingido. Tente de novo em instantes.";
  if (err instanceof Anthropic.BadRequestError) return `Requisição recusada pela API: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Não foi possível conectar à API do Claude. Verifique a internet.";
  if (err instanceof Anthropic.APIError) return `Erro da API do Claude (${err.status ?? "?"}). Tente novamente.`;
  return err instanceof Error ? err.message : "Erro inesperado.";
}

/**
 * Resposta em Server-Sent Events: cada evento do agente vira uma linha
 * `data: {...}`. O navegador lê com fetch + ReadableStream.
 */
export function sseResponse(run: (emit: (e: AgentEvent) => void, signal: AbortSignal) => Promise<void>, request: Request): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* cliente desconectou */
        }
      };
      try {
        await run(emit, request.signal);
      } catch (err) {
        if (!request.signal.aborted) emit({ type: "error", message: friendlyError(err) });
      } finally {
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      }
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}

export const noKeyResponse = () =>
  Response.json(
    { error: "Copiloto desativado: defina ANTHROPIC_API_KEY no arquivo .env.local e reinicie o app (npm run dev)." },
    { status: 503 },
  );

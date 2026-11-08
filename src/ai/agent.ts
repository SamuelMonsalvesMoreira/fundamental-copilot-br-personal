/**
 * Loop do copiloto: o Claude pede ferramentas, nós executamos contra o
 * banco local e devolvemos os resultados, até ele terminar a resposta.
 * O texto é transmitido em tempo real; no final, os números citados são
 * conferidos contra os resultados das ferramentas.
 */
import Anthropic from "@anthropic-ai/sdk";
import { collectNumbers, verifyAnswer, type Verification } from "./verify";

type Msg = Anthropic.Beta.BetaMessageParam;
type Tool = Anthropic.Beta.BetaTool;
type FinalMessage = Anthropic.Beta.BetaMessage;

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; input: unknown; ok: boolean; error?: string }
  | { type: "done"; text: string; verification: Verification; trace: ToolTraceEntry[]; model: string }
  | { type: "error"; message: string };

export interface ToolTraceEntry {
  name: string;
  input: unknown;
  ok: boolean;
  /** resumo do resultado (os números ficam para a verificação) */
  error?: string;
}

/** O mínimo que o loop precisa de um stream do SDK (facilita testar sem rede). */
export interface StreamLike {
  on(event: "text", cb: (delta: string) => void): unknown;
  finalMessage(): Promise<FinalMessage>;
}

export interface AgentOptions {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  system: string;
  context: string;
  tools: Tool[];
  messages: Msg[];
  maxTokens: number;
  maxIterations?: number;
  executeTool: (name: string, input: unknown) => Promise<unknown>;
  onEvent: (e: AgentEvent) => void;
  /** cria o stream; por padrão usa o SDK com fallback do servidor */
  createStream?: (params: Anthropic.Beta.MessageCreateParamsStreaming) => StreamLike;
  signal?: AbortSignal;
}

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  client ??= new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente (.env.local)
  return client;
}

export const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());

export const CHAT_MODEL = () => process.env.CLAUDE_CHAT_MODEL?.trim() || "claude-sonnet-5-5";
export const REPORT_MODEL = () => process.env.CLAUDE_REPORT_MODEL?.trim() || "claude-opus-5-5";

export async function runAgent(opts: AgentOptions): Promise<{ text: string; verification: Verification; trace: ToolTraceEntry[] } | null> {
  const create =
    opts.createStream ??
    ((params) => getClient().beta.messages.stream(params, { signal: opts.signal }) as unknown as StreamLike);

  const messages: Msg[] = [...opts.messages];
  const trace: ToolTraceEntry[] = [];
  const sourceNumbers: number[] = [];
  let finalText = "";
  let jsonRetries = 0;

  for (let i = 0; i < (opts.maxIterations ?? 10); i++) {
    const stream = create({
      model: opts.model,
      max_tokens: opts.maxTokens,
      // Fallback do servidor: se o modelo recusar por política, outro modelo continua.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort },
      // Ferramentas + regras fixas formam o prefixo cacheado; o contexto variável vem depois.
      tools: opts.tools,
      system: [
        { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
        { type: "text", text: opts.context },
      ],
      messages,
      stream: true,
    });
    stream.on("text", (delta) => {
      finalText += delta;
      opts.onEvent({ type: "text", delta });
    });

    let message: FinalMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Só re-tenta quando a entrada de uma ferramenta veio com JSON quebrado.
      if (err instanceof Anthropic.APIError || opts.signal?.aborted || jsonRetries++ >= 2) throw err;
      continue;
    }

    if (message.stop_reason === "refusal") {
      opts.onEvent({ type: "error", message: "O modelo recusou responder a esta pergunta." });
      return null;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      if (message.stop_reason === "max_tokens") finalText += "\n\n_(Resposta interrompida por limite de tamanho.)_";
      break;
    }
    if (message.stop_reason === "max_tokens") throw new Error("Entrada de ferramenta truncada (limite de tokens).");

    // conteúdo do assistente volta inalterado (inclui blocos de raciocínio)
    messages.push({ role: "assistant", content: message.content });

    // ferramentas em paralelo; todos os resultados numa única mensagem
    const results = await Promise.all(
      toolUses.map(async (tu): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        try {
          const out = await opts.executeTool(tu.name, tu.input);
          collectNumbers(out, sourceNumbers);
          trace.push({ name: tu.name, input: tu.input, ok: true });
          opts.onEvent({ type: "tool", name: tu.name, input: tu.input, ok: true });
          return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          trace.push({ name: tu.name, input: tu.input, ok: false, error: msg });
          opts.onEvent({ type: "tool", name: tu.name, input: tu.input, ok: false, error: msg });
          return { type: "tool_result", tool_use_id: tu.id, content: msg, is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
    // o texto anterior às ferramentas era só preâmbulo: a resposta final é o que vem depois
    finalText = "";
  }

  // números das mensagens do usuário também valem (ex.: premissas que ele mesmo deu)
  for (const m of opts.messages) if (m.role === "user" && typeof m.content === "string") collectNumbers(m.content, sourceNumbers);
  const verification = verifyAnswer(finalText, sourceNumbers);
  opts.onEvent({ type: "done", text: finalText, verification, trace, model: opts.model });
  return { text: finalText, verification, trace };
}

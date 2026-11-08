import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgent, type AgentEvent, type StreamLike } from "./agent";

type Block = Anthropic.Beta.BetaContentBlock;

/** Stream falso: emite o texto dos blocos e devolve a mensagem final. */
function fakeStream(content: Block[], stop: Anthropic.Beta.BetaMessage["stop_reason"]): StreamLike {
  const handlers: Array<(d: string) => void> = [];
  return {
    on(_e, cb) {
      handlers.push(cb);
      return this;
    },
    async finalMessage() {
      for (const b of content) if (b.type === "text") handlers.forEach((h) => h(b.text));
      return { id: "m", type: "message", role: "assistant", model: "fake", content, stop_reason: stop, stop_sequence: null } as unknown as Anthropic.Beta.BetaMessage;
    },
  };
}

const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as unknown as Block;
const text = (t: string) => ({ type: "text", text: t, citations: null }) as unknown as Block;

describe("loop do copiloto", () => {
  it("executa ferramentas, devolve os resultados e verifica os números da resposta", async () => {
    const calls: Anthropic.Beta.MessageCreateParamsStreaming[] = [];
    const script = [
      fakeStream([text("Vou consultar. "), toolUse("t1", "indicadores", { ticker: "WEGE3" })], "tool_use"),
      fakeStream([text("O ROE é de 29,6% e o P/L de 32,3x, mas a margem é de 50%.")], "end_turn"),
    ];
    const events: AgentEvent[] = [];
    const out = await runAgent({
      model: "fake",
      effort: "medium",
      system: "s",
      context: "c",
      tools: [],
      messages: [{ role: "user", content: "A empresa é rentável?" }],
      maxTokens: 1000,
      executeTool: async (name, input) => {
        expect(name).toBe("indicadores");
        expect(input).toEqual({ ticker: "WEGE3" });
        return { roe: 0.296, pl: 32.25 };
      },
      onEvent: (e) => events.push(e),
      createStream: (p) => {
        calls.push(structuredClone(p));
        return script.shift()!;
      },
    });

    expect(calls).toHaveLength(2);
    // 2ª chamada: pergunta + turno do assistente (inalterado) + resultados
    const second = calls[1].messages;
    expect(second).toHaveLength(3);
    expect(second[2]).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1" }] });
    // prefixo cacheado e fallback do servidor
    expect(calls[0].system).toMatchObject([{ cache_control: { type: "ephemeral" } }, { text: "c" }]);
    expect(calls[0].fallbacks).toBe("default");

    expect(out?.text).toBe("O ROE é de 29,6% e o P/L de 32,3x, mas a margem é de 50%.");
    expect(out?.verification.unverified).toEqual(["50%"]);
    expect(events.some((e) => e.type === "tool" && e.ok)).toBe(true);
  });

  it("erro numa ferramenta vira tool_result com is_error, sem derrubar a conversa", async () => {
    const calls: Anthropic.Beta.MessageCreateParamsStreaming[] = [];
    const script = [fakeStream([toolUse("t1", "indicadores", { ticker: "XXXX3" })], "tool_use"), fakeStream([text("Não encontrei esse ticker.")], "end_turn")];
    await runAgent({
      model: "fake",
      effort: "low",
      system: "s",
      context: "c",
      tools: [],
      messages: [{ role: "user", content: "?" }],
      maxTokens: 100,
      executeTool: async () => {
        throw new Error("Ticker XXXX3 não encontrado");
      },
      onEvent: () => {},
      createStream: (p) => {
        calls.push(structuredClone(p));
        return script.shift()!;
      },
    });
    expect(calls[1].messages[2]).toMatchObject({ content: [{ is_error: true, content: "Ticker XXXX3 não encontrado" }] });
  });

  it("recusa encerra sem resposta", async () => {
    const events: AgentEvent[] = [];
    const out = await runAgent({
      model: "fake",
      effort: "low",
      system: "s",
      context: "c",
      tools: [],
      messages: [{ role: "user", content: "?" }],
      maxTokens: 100,
      executeTool: async () => null,
      onEvent: (e) => events.push(e),
      createStream: () => fakeStream([], "refusal"),
    });
    expect(out).toBeNull();
    expect(events[0]).toMatchObject({ type: "error" });
  });
});

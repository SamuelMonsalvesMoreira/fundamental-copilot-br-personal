"use client";

import { useEffect, useRef, useState } from "react";
import { BotIcon, SendIcon, SquareIcon } from "lucide-react";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Markdown, readAgentStream, ToolChips, UnverifiedNote, type ToolStatus } from "./shared";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  tools?: ToolStatus[];
  unverified?: string[];
  error?: string;
  pending?: boolean;
}

export function CopilotChat({ ticker, enabled, isFinancial }: { ticker: string; enabled: boolean; isFinancial: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const suggestions = isFinancial
    ? ["A rentabilidade (ROE) está acima dos pares?", "Como evoluiu o lucro nos últimos anos?", "Os dividendos são sustentáveis?", "Está barata pelo P/VP?"]
    : ["A dívida da empresa está controlada?", "Como evoluíram as margens nos últimos 5 anos?", "Os dividendos são sustentáveis?", "Está cara ou barata em relação aos pares?"];

  const updateLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1])]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history = [...messages.filter((m) => !m.error && m.text), { role: "user" as const, text: q }];
    setMessages([...messages, { role: "user", text: q }, { role: "assistant", text: "", tools: [], pending: true }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await readAgentStream(
        "/api/copilot/chat",
        { ticker, messages: history.slice(-20).map((m) => ({ role: m.role, text: m.text })) },
        (e) => {
          if (e.type === "text") updateLast((m) => ({ ...m, text: m.text + e.delta }));
          else if (e.type === "tool") updateLast((m) => ({ ...m, text: "", tools: [...(m.tools ?? []), { name: e.name, ok: e.ok, error: e.error }] }));
          else if (e.type === "done") updateLast((m) => ({ ...m, text: e.text, unverified: e.verification.unverified, pending: false }));
          else if (e.type === "error") updateLast((m) => ({ ...m, error: e.message, pending: false }));
        },
        ctrl.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") updateLast((m) => ({ ...m, error: (err as Error).message, pending: false }));
    } finally {
      updateLast((m) => ({ ...m, pending: false }));
      setBusy(false);
      abortRef.current = null;
    }
  }

  if (!enabled) {
    return (
      <EmptyState
        icon={BotIcon}
        title="Copiloto desativado"
        description={
          <>
            Para conversar com a IA sobre {ticker}, defina <code className="font-mono">ANTHROPIC_API_KEY</code> no arquivo{" "}
            <code className="font-mono">.env.local</code> e reinicie o app.
          </>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {messages.length === 0 ? (
        <div className="grid gap-3 rounded-xl border bg-card p-4">
          <p className="text-sm">
            Pergunte sobre <span className="num font-semibold">{ticker}</span>. As respostas usam só os números do banco local (CVM,
            Banco Central e brapi) e citam o período de cada dado.
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-full border px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ol className="grid gap-4" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={cn("grid gap-2", m.role === "user" && "justify-items-end")}>
              {m.role === "user" ? (
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">{m.text}</p>
              ) : (
                <div className="grid max-w-full gap-2 rounded-2xl rounded-bl-sm border bg-card px-4 py-3">
                  <ToolChips tools={m.tools ?? []} running={m.pending && !m.text} />
                  {m.text && <Markdown>{m.text}</Markdown>}
                  {m.unverified && <UnverifiedNote numbers={m.unverified} />}
                  {m.error && <p className="text-sm text-destructive">{m.error}</p>}
                </div>
              )}
            </li>
          ))}
          <div ref={endRef} />
        </ol>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 rounded-xl border bg-card p-2 focus-within:ring-3 focus-within:ring-ring/30"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder={`Pergunte sobre ${ticker}… (Enter envia, Shift+Enter quebra linha)`}
          aria-label="Pergunta para o copiloto"
          className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        {busy ? (
          <Button type="button" variant="outline" size="icon" aria-label="Parar" onClick={() => abortRef.current?.abort()}>
            <SquareIcon />
          </Button>
        ) : (
          <Button type="submit" size="icon" aria-label="Enviar" disabled={!input.trim()}>
            <SendIcon />
          </Button>
        )}
      </form>
      <p className="text-xs text-muted-foreground">
        Respostas geradas por IA a partir dos dados do app; podem conter erros. Números que não batem com os dados consultados são
        sinalizados. Não é recomendação de investimento.
      </p>
    </div>
  );
}

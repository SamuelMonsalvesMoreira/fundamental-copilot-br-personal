"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangleIcon, CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import type { AgentEvent } from "@/ai/agent";
import { cn } from "@/lib/utils";

/** Lê o stream SSE das rotas do copiloto e chama `onEvent` para cada evento. */
export async function readAgentStream(url: string, body: unknown, onEvent: (e: AgentEvent) => void, signal?: AbortSignal) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? `Erro ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)) as AgentEvent);
    }
  }
}

export const TOOL_LABELS: Record<string, string> = {
  buscar_empresa: "buscando empresa",
  resumo_empresa: "resumo da empresa",
  indicadores: "indicadores",
  historico_financeiro: "histórico financeiro",
  pares_setor: "pares do setor",
  macro: "Selic, CDI e IPCA",
  valuation: "valuation",
  dividendos: "dividendos",
  demonstracao: "demonstração financeira",
  calcular: "cálculo",
};

export interface ToolStatus {
  name: string;
  ok: boolean;
  error?: string;
}

export function ToolChips({ tools, running }: { tools: ToolStatus[]; running?: boolean }) {
  if (tools.length === 0 && !running) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Dados consultados">
      {tools.map((t, i) => (
        <span
          key={i}
          title={t.error}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
            t.ok ? "text-muted-foreground" : "border-destructive/40 text-destructive",
          )}
        >
          {t.ok ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
          {TOOL_LABELS[t.name] ?? t.name}
        </span>
      ))}
      {running && (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Loader2Icon className="size-3 animate-spin" /> consultando dados…
        </span>
      )}
    </div>
  );
}

export function UnverifiedNote({ numbers }: { numbers: string[] }) {
  if (numbers.length === 0) return null;
  return (
    <p className="flex gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs">
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <span>
        Números não encontrados diretamente nos dados consultados (podem ser cálculos ou arredondamentos — confira):{" "}
        <span className="num">{numbers.join(", ")}</span>
      </span>
    </p>
  );
}

/** Markdown da IA com estilos próprios (sem HTML bruto). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="grid gap-2 text-sm leading-relaxed [&_em]:text-muted-foreground [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 className="mt-3 text-base font-semibold" {...p} />,
          h2: (p) => <h3 className="mt-4 border-b pb-1 text-base font-semibold" {...p} />,
          h3: (p) => <h4 className="mt-3 text-sm font-semibold" {...p} />,
          table: (p) => (
            <div className="overflow-x-auto">
              <table className="w-full text-xs [&_td]:border-t [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left" {...p} />
            </div>
          ),
          a: ({ href, ...p }) => <a href={href} target="_blank" rel="noreferrer" className="underline" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

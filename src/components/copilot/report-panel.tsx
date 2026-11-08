"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileTextIcon, Loader2Icon, PrinterIcon, RefreshCwIcon } from "lucide-react";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/format";
import type { SavedReport } from "@/server/reports";
import { Markdown, readAgentStream, ToolChips, UnverifiedNote, type ToolStatus } from "./shared";

export function ReportPanel({ ticker, report, enabled, model }: { ticker: string; report: SavedReport | null; enabled: boolean; model: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function generate() {
    setRunning(true);
    setText("");
    setTools([]);
    setError(null);
    setUnverified(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await readAgentStream(
        "/api/copilot/report",
        { ticker },
        (e) => {
          if (e.type === "text") setText((t) => t + e.delta);
          else if (e.type === "tool") {
            setText("");
            setTools((ts) => [...ts, { name: e.name, ok: e.ok, error: e.error }]);
          } else if (e.type === "done") {
            setText(e.text);
            setUnverified(e.verification.unverified);
          } else if (e.type === "error") setError(e.message);
        },
        ctrl.signal,
      );
      router.refresh(); // carrega o relatório salvo
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  if (!enabled) {
    return (
      <EmptyState
        icon={FileTextIcon}
        title="Relatório automático desativado"
        description={
          <>
            Defina <code className="font-mono">ANTHROPIC_API_KEY</code> no arquivo <code className="font-mono">.env.local</code> e reinicie o app para gerar relatórios.
          </>
        }
      />
    );
  }

  const showLive = running || text || error;
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Pontos fortes, riscos, tendências, pares e valuation, escritos pela IA ({model}) a partir dos dados do app. Leva cerca de 1 a 3 minutos.
        </p>
        <div className="flex gap-2">
          {report && !showLive && (
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <PrinterIcon /> Imprimir
            </Button>
          )}
          {running ? (
            <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>
              Cancelar
            </Button>
          ) : (
            <Button size="sm" onClick={generate}>
              {report ? <RefreshCwIcon /> : <FileTextIcon />} {report ? "Gerar de novo" : "Gerar relatório"}
            </Button>
          )}
        </div>
      </div>

      {showLive ? (
        <article className="grid gap-3 rounded-xl border bg-card p-5">
          <ToolChips tools={tools} running={running && !text} />
          {running && text && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" /> escrevendo…
            </p>
          )}
          {text && <Markdown>{text}</Markdown>}
          {unverified && <UnverifiedNote numbers={unverified} />}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </article>
      ) : report ? (
        <article className="grid gap-3 rounded-xl border bg-card p-5">
          <p className="text-xs text-muted-foreground">
            Gerado em {formatDateTime(report.createdAt)} por {report.model} · resultados até {formatDate(report.dataAsOf)}
            {report.priceDate && <> · preço de {formatDate(report.priceDate)}</>} · dados consultados: {report.tools.join(", ") || "—"}
          </p>
          <Markdown>{report.content}</Markdown>
          <UnverifiedNote numbers={report.unverified} />
        </article>
      ) : (
        <EmptyState icon={FileTextIcon} title={`Nenhum relatório de ${ticker} ainda`} description="Clique em “Gerar relatório” para a IA analisar os números da empresa." />
      )}
    </div>
  );
}

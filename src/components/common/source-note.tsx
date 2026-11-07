import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SourceRef {
  /** Nome da fonte, ex.: "CVM — DFP 2025" */
  source: string;
  /** Data de referência dos dados (ISO) */
  asOf?: string | null;
  url?: string | null;
}

/** Rodapé "Fonte · Dados de" exibido em toda tela/cartão com dados. */
export function SourceNote({ sources, className }: { sources: SourceRef[]; className?: string }) {
  if (sources.length === 0) return null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {sources.map((s, i) => (
        <span key={`${s.source}-${i}`}>
          {i > 0 && " · "}
          Fonte:{" "}
          {s.url ? (
            <a href={s.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {s.source}
            </a>
          ) : (
            s.source
          )}
          {s.asOf && <> — dados de {formatDate(s.asOf)}</>}
        </span>
      ))}
    </p>
  );
}

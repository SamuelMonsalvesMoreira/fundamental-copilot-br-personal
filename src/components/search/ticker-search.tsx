"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatSignedPercent, trendOf } from "@/lib/format";

interface Result {
  ticker: string;
  name: string;
  sector: string | null;
  close: number | null;
  changePct: number | null;
}

/**
 * Busca por ticker ou nome com autocomplete.
 * Teclado: ↑/↓ navegam, Enter abre, Esc fecha. Atalho global: "/" ou Ctrl+K.
 */
export function TickerSearch({
  size = "default",
  autoFocus = false,
  className,
  onSelect,
  placeholder,
}: {
  size?: "default" | "lg";
  autoFocus?: boolean;
  className?: string;
  /** se informado, chama em vez de abrir a página da empresa */
  onSelect?: (ticker: string) => void;
  placeholder?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term) return; // lista some porque showList exige texto
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { results: Result[] };
        setResults(body.results);
        setActive(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError(true);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // atalho global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName);
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) {
        if (size !== "default" || onSelect) return; // só o campo do cabeçalho responde ao atalho
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [size, onSelect]);

  const go = (ticker: string) => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    if (onSelect) onSelect(ticker);
    else router.push(`/empresa/${ticker}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      const pick = results[active]?.ticker ?? (/^[A-Z0-9]{4}\d{1,2}$/i.test(q.trim()) ? q.trim().toUpperCase() : null);
      if (pick) go(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showList = open && q.trim().length > 0;

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-background px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
          size === "lg" ? "h-12" : "h-9",
        )}
      >
        {loading ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" /> : <SearchIcon className="size-4 text-muted-foreground" />}
        <input
          ref={inputRef}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? (size === "lg" ? "Busque um ticker ou empresa: PETR4, ITUB4, WEG…" : "Buscar ticker…")}
          className={cn("w-full bg-transparent outline-none placeholder:text-muted-foreground", size === "lg" ? "text-base" : "text-sm")}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${results[active].ticker}` : undefined}
          aria-label="Buscar ticker ou empresa"
          autoComplete="off"
          spellCheck={false}
        />
        {size === "default" && (
          <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground lg:inline">/</kbd>
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-96 overflow-auto rounded-lg border bg-popover p-1 shadow-lg"
        >
          {error && <li className="px-3 py-2 text-sm text-destructive">Não foi possível buscar agora. Tente de novo.</li>}
          {!error && !loading && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">Nenhuma empresa encontrada para “{q.trim()}”.</li>
          )}
          {results.map((r, i) => {
            const trend = trendOf(r.changePct);
            return (
              <li
                key={r.ticker}
                id={`${listId}-${r.ticker}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(r.ticker);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                <span className="num w-16 shrink-0 text-sm font-semibold">{r.ticker}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{r.name}</span>
                  {r.sector && <span className="block truncate text-xs text-muted-foreground">{r.sector}</span>}
                </span>
                {r.close !== null && (
                  <span className="text-right">
                    <span className="num block text-sm">{formatCurrency(r.close)}</span>
                    <span
                      className={cn(
                        "num block text-xs",
                        trend === "up" && "text-positive",
                        trend === "down" && "text-negative",
                        (trend === "flat" || trend === "none") && "text-muted-foreground",
                      )}
                    >
                      {formatSignedPercent(r.changePct)}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

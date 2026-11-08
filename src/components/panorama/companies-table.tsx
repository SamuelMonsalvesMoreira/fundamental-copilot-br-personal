"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { MarketRow } from "@/analytics/market-overview";
import { formatCompactCurrency, formatMultiple, formatPercent, MISSING } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey = "ticker" | "sector" | "marketCap" | "pl" | "pvp" | "roe" | "dy" | "netDebtEbitda";

const COLS: Array<{ key: SortKey; label: string; fmt?: (v: number) => string; className?: string }> = [
  { key: "ticker", label: "Empresa" },
  { key: "sector", label: "Setor" },
  { key: "marketCap", label: "Valor de mercado", fmt: (v) => formatCompactCurrency(v, 1) },
  { key: "pl", label: "P/L", fmt: (v) => formatMultiple(v, 1) },
  { key: "pvp", label: "P/VP", fmt: (v) => formatMultiple(v, 2) },
  { key: "roe", label: "ROE", fmt: (v) => formatPercent(v) },
  { key: "dy", label: "DY", fmt: (v) => formatPercent(v) },
  { key: "netDebtEbitda", label: "DL/EBITDA", fmt: (v) => formatMultiple(v, 2) },
];

const isText = (k: SortKey) => k === "ticker" || k === "sector";

export function CompaniesTable({ rows, selic }: { rows: MarketRow[]; selic: number | null }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "marketCap", dir: -1 });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => `${r.ticker} ${r.name} ${r.sector}`.toLowerCase().includes(q)) : rows;
    return [...filtered].sort((a, b) => {
      const [x, y] = [a[sort.key], b[sort.key]];
      if (x === null) return 1; // vazios sempre no fim
      if (y === null) return -1;
      return (typeof x === "string" ? x.localeCompare(String(y), "pt-BR") : x - Number(y)) * sort.dir;
    });
  }, [rows, query, sort]);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: isText(key) ? 1 : -1 }));

  return (
    <div className="grid grid-cols-1 gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar ticker, empresa ou setor"
        aria-label="Buscar ticker, empresa ou setor"
        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30 sm:w-80"
      />
      <div className="max-h-[32rem] overflow-auto rounded-xl border">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
            <tr>
              {COLS.map((c) => {
                const active = sort.key === c.key;
                const Arrow = sort.dir === 1 ? ArrowUpIcon : ArrowDownIcon;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined} className={cn("font-medium", isText(c.key) ? "text-left" : "text-right")}>
                    <button type="button" onClick={() => toggle(c.key)} className={cn("inline-flex w-full items-center gap-1 px-3 py-2 whitespace-nowrap hover:text-foreground", !isText(c.key) && "justify-end", active && "text-foreground")}>
                      {c.label}
                      {active && <Arrow className="size-3" aria-hidden />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.ticker} className="border-t hover:bg-muted/40">
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  <Link href={`/empresa/${r.ticker}`} className="num font-semibold hover:underline">{r.ticker}</Link>
                  <span className="block max-w-48 truncate text-xs text-muted-foreground">{r.name}</span>
                </th>
                <td className="max-w-44 truncate px-3 py-1.5 text-xs text-muted-foreground">{r.sector}</td>
                {COLS.slice(2).map((c) => {
                  const v = r[c.key] as number | null;
                  return (
                    <td key={c.key} className={cn("num px-3 py-1.5 text-right", v === null && "text-muted-foreground", c.key === "roe" && v !== null && selic !== null && v > selic && "text-positive")}>
                      {v === null ? MISSING : c.fmt!(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="border-t p-4 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { XIcon } from "lucide-react";
import { EmptyState } from "@/components/common/states";
import { IndicatorExplanation } from "@/components/company/indicator-grid";
import { TickerSearch } from "@/components/search/ticker-search";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatByType, formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CompareItem } from "@/server/compare";

const ROWS: Array<{ group: string; keys: Array<{ key: string; better?: "low" | "high" }> }> = [
  { group: "Valuation", keys: [{ key: "pl", better: "low" }, { key: "pvp", better: "low" }, { key: "evEbitda", better: "low" }, { key: "psr", better: "low" }] },
  { group: "Rentabilidade", keys: [{ key: "roe", better: "high" }, { key: "roic", better: "high" }, { key: "roa", better: "high" }] },
  { group: "Margens", keys: [{ key: "grossMargin", better: "high" }, { key: "ebitdaMargin", better: "high" }, { key: "netMargin", better: "high" }] },
  { group: "Endividamento", keys: [{ key: "netDebtEbitda", better: "low" }, { key: "netDebtEquity", better: "low" }, { key: "currentRatio", better: "high" }] },
  { group: "Dividendos", keys: [{ key: "dy", better: "high" }, { key: "payout" }] },
  { group: "Crescimento", keys: [{ key: "revenueCagr5y", better: "high" }, { key: "earningsCagr5y", better: "high" }] },
  { group: "Tamanho", keys: [{ key: "marketCap" }, { key: "ev" }, { key: "ebitda" }] },
];

const PRICE_MULTIPLES = new Set(["pl", "pvp", "evEbitda", "psr"]);
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

/** Índice do melhor valor da linha (ignora ausentes e múltiplos de preço negativos). */
function bestIndex(items: CompareItem[], key: string, better?: "low" | "high"): number | null {
  if (!better || items.length < 2) return null;
  let best: number | null = null;
  items.forEach((it, i) => {
    const v = it.indicators[key]?.value;
    if (v === null || v === undefined) return;
    if (PRICE_MULTIPLES.has(key) && v <= 0) return;
    const b = best === null ? null : items[best].indicators[key]!.value!;
    if (b === null || (better === "low" ? v < b : v > b)) best = i;
  });
  return best;
}

export function CompareView({ items, unknown }: { items: CompareItem[]; unknown: string[] }) {
  const router = useRouter();
  const go = (tickers: string[]) => router.push(tickers.length ? `/comparar?t=${tickers.join(",")}` : "/comparar");
  const tickers = items.map((i) => i.ticker);

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {items.map((it, i) => (
          <span key={it.ticker} className="inline-flex items-center gap-1.5 rounded-lg border bg-card py-1 pr-1 pl-2.5 text-sm">
            <span className="size-2 rounded-full" style={{ background: COLORS[i] }} />
            <span className="num font-semibold">{it.ticker}</span>
            <button onClick={() => go(tickers.filter((t) => t !== it.ticker))} aria-label={`Remover ${it.ticker}`} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <XIcon className="size-3.5" />
            </button>
          </span>
        ))}
        {items.length < 4 && (
          <TickerSearch className="w-64" placeholder="Adicionar empresa…" onSelect={(t) => !tickers.includes(t) && go([...tickers, t])} />
        )}
      </div>
      {unknown.length > 0 && <p className="text-sm text-warning">Não encontrado: {unknown.join(", ")}.</p>}

      {items.length < 2 ? (
        <EmptyState
          title={items.length === 0 ? "Escolha de 2 a 4 empresas" : "Adicione pelo menos mais uma empresa"}
          description={
            <>
              Use a busca acima, ou experimente{" "}
              <Link className="underline" href="/comparar?t=ITUB4,BBDC4,BBAS3,SANB11">bancos</Link>,{" "}
              <Link className="underline" href="/comparar?t=PETR4,PRIO3,VBBR3">petróleo</Link> ou{" "}
              <Link className="underline" href="/comparar?t=WEGE3,EMBJ3,TUPY3">indústria</Link>.
            </>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="sticky left-0 bg-muted/90 px-3 py-2 text-left font-medium">Indicador</th>
                  {items.map((it) => (
                    <th key={it.ticker} scope="col" className="px-3 py-2 text-right font-medium">
                      <Link href={`/empresa/${it.ticker}`} className="num text-sm font-semibold text-foreground hover:underline">{it.ticker}</Link>
                      <span className="block truncate font-normal">{it.sector}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <th scope="row" className="sticky left-0 bg-card px-3 py-2 text-left font-normal text-muted-foreground">Preço</th>
                  {items.map((it) => (
                    <td key={it.ticker} className="num px-3 py-2 text-right">{formatCurrency(it.price)}</td>
                  ))}
                </tr>
                {ROWS.map((g) => (
                  <RowGroup key={g.group} title={g.group} rows={g.keys} items={items} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Destaque = melhor da linha (múltiplos de preço negativos e dados ausentes não contam). Resultados dos últimos 12 meses:{" "}
            {items.map((it) => `${it.ticker} até ${formatDate(it.financialsEnd)}`).join(", ")} (CVM). Preços de{" "}
            {formatDate(items[0].priceDate)} (brapi.dev). Toque em um valor para ver o cálculo.
          </p>
          <CompareCharts items={items} />
        </>
      )}
    </div>
  );
}

function RowGroup({ title, rows, items }: { title: string; rows: Array<{ key: string; better?: "low" | "high" }>; items: CompareItem[] }) {
  const visible = rows.filter((r) => items.some((it) => it.indicators[r.key]?.applicable));
  if (visible.length === 0) return null;
  return (
    <>
      <tr className="border-t bg-muted/30">
        <th colSpan={items.length + 1} scope="rowgroup" className="px-3 py-1.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</th>
      </tr>
      {visible.map((r) => {
        const best = bestIndex(items, r.key, r.better);
        const label = items.find((it) => it.indicators[r.key])?.indicators[r.key].label ?? r.key;
        return (
          <tr key={r.key} className="border-t">
            <th scope="row" className="sticky left-0 bg-card px-3 py-2 text-left font-normal">{label}</th>
            {items.map((it, i) => {
              const ind = it.indicators[r.key];
              if (!ind) return <td key={it.ticker} />;
              return (
                <td key={it.ticker} className="px-1 py-1 text-right">
                  <Popover>
                    <PopoverTrigger
                      className={cn(
                        "num rounded-md px-2 py-1 hover:bg-muted",
                        i === best && "bg-positive/10 font-semibold text-positive",
                        ind.value === null && "text-muted-foreground",
                      )}
                    >
                      {ind.applicable ? formatByType(ind.value, ind.format) : "n/a"}
                    </PopoverTrigger>
                    <PopoverContent className="w-80 text-sm">
                      <p className="mb-1 text-xs text-muted-foreground">{it.ticker}</p>
                      <IndicatorExplanation ind={ind} />
                    </PopoverContent>
                  </Popover>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function CompareCharts({ items }: { items: CompareItem[] }) {
  // anos em comum a todas
  const years = [...new Set(items.flatMap((it) => it.annual.map((p) => p.label)))].sort();
  const base = years.find((y) => items.every((it) => (it.annual.find((p) => p.label === y)?.revenue ?? 0) > 0));
  const indexed = years
    .filter((y) => !base || y >= base)
    .map((y) => {
      const row: Record<string, string | number | null> = { year: y };
      for (const it of items) {
        const b = it.annual.find((p) => p.label === base)?.revenue;
        const v = it.annual.find((p) => p.label === y)?.revenue;
        row[it.ticker] = b && v ? (v / b) * 100 : null;
      }
      return row;
    });
  const margins = years.map((y) => {
    const row: Record<string, string | number | null> = { year: y };
    for (const it of items) row[it.ticker] = it.annual.find((p) => p.label === y)?.netMargin ?? null;
    return row;
  });
  const anyMargin = items.some((it) => it.layout === "standard" || it.layout === null);

  const chart = (title: string, sub: string, data: typeof indexed, fmt: (v: number) => string) => (
    <figure className="rounded-xl border bg-card p-4">
      <figcaption className="mb-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </figcaption>
      <div className="h-60">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 4, right: 8, top: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="year" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={fmt} width={44} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v) => (typeof v === "number" ? fmt(v) : "—")} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            {items.map((it, i) => (
              <Line key={it.ticker} dataKey={it.ticker} stroke={COLORS[i]} strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Fonte: CVM (DFP), exercícios anuais.</p>
    </figure>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {chart("Crescimento da receita", base ? `Índice: receita de ${base} = 100` : "Sem ano-base em comum", indexed, (v) => v.toFixed(0))}
      {anyMargin && chart("Margem líquida", "Lucro dos controladores ÷ receita", margins, (v) => formatPercent(v, 0))}
    </div>
  );
}

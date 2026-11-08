"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { XIcon } from "lucide-react";
import { simulateProfit, type MarketRow } from "@/analytics/market-overview";
import { Button } from "@/components/ui/button";
import { formatCompactCurrency, formatMultiple, formatPercent, formatSignedPercent, MISSING } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PanoramaScatter } from "./scatter-chart";

const KEY = "simulador-lucro-v1";
const MAX_COMPANIES = 8;
const SCENARIOS = [-0.1, 0.1, 0.2];

interface Item {
  ticker: string;
  estimateMi: number | null;
}

// As estimativas ficam só no navegador de quem usa: nada vai para o servidor.
let memory = "[]";
const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
};
const write = (items: Item[]) => {
  memory = JSON.stringify(items);
  try {
    localStorage.setItem(KEY, memory);
  } catch {
    // navegação privada: segue só na memória
  }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", l);
  };
};

function parse(raw: string): Item[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((i): i is Item => typeof i?.ticker === "string" && (i.estimateMi === null || typeof i.estimateMi === "number"));
  } catch {
    return [];
  }
}

export function ProfitSimulator({ rows, liquid, selic }: { rows: MarketRow[]; liquid: MarketRow[]; selic: number | null }) {
  const raw = useSyncExternalStore(subscribe, read, () => "[]");
  const items = useMemo(() => parse(raw), [raw]);
  const [query, setQuery] = useState("");
  const byTicker = useMemo(() => new Map(rows.map((r) => [r.ticker, r])), [rows]);

  const lines = items.flatMap((item) => {
    const row = byTicker.get(item.ticker);
    if (!row) return [];
    const estimate = item.estimateMi === null ? null : item.estimateMi * 1e6;
    return [{ item, row, sim: simulateProfit(row, estimate) }];
  });

  const add = (ticker: string) => {
    if (!byTicker.has(ticker) || items.some((i) => i.ticker === ticker) || items.length >= MAX_COMPANIES) return;
    write([...items, { ticker, estimateMi: null }]);
  };
  const setEstimate = (ticker: string, estimateMi: number | null) => write(items.map((i) => (i.ticker === ticker ? { ...i, estimateMi } : i)));
  const remove = (ticker: string) => write(items.filter((i) => i.ticker !== ticker));

  const onQuery = (value: string) => {
    const ticker = value.trim().toUpperCase();
    if (byTicker.has(ticker)) {
      add(ticker);
      setQuery("");
    } else setQuery(value);
  };

  const simulated = lines
    .filter((l) => l.item.estimateMi !== null)
    .map((l) => ({ ticker: l.row.ticker, pl: l.row.pl, roe: l.row.roe, plForward: l.sim.plForward, roeForward: l.sim.roeForward }));

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          list="simulador-empresas"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          disabled={items.length >= MAX_COMPANIES}
          placeholder={items.length >= MAX_COMPANIES ? `Máximo de ${MAX_COMPANIES} empresas` : "Adicionar empresa: digite o ticker"}
          aria-label="Adicionar empresa ao simulador"
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30 sm:w-72"
        />
        <datalist id="simulador-empresas">
          {rows.map((r) => (
            <option key={r.ticker} value={r.ticker}>{r.name}</option>
          ))}
        </datalist>
        {items.length === 0 &&
          liquid.slice(0, 3).map((r) => (
            <Button key={r.ticker} variant="outline" size="sm" onClick={() => add(r.ticker)}>
              + {r.ticker}
            </Button>
          ))}
      </div>

      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Empresa</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Lucro 12m</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Sua estimativa, próximo ano</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Variação</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">P/L hoje</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">P/L projetado</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">ROE hoje</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">ROE projetado</th>
                <th scope="col" className="w-9 px-1"><span className="sr-only">Retirar</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ item, row, sim }) => (
                <tr key={row.ticker} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <Link href={`/empresa/${row.ticker}`} className="num font-semibold hover:underline">{row.ticker}</Link>
                    <span className="block max-w-40 truncate text-xs text-muted-foreground">{row.name}</span>
                  </th>
                  <td className="num px-3 py-2 text-right">{formatCompactCurrency(row.netIncome, 1)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center rounded-md border bg-background focus-within:ring-3 focus-within:ring-ring/30">
                        <input
                          type="number"
                          inputMode="decimal"
                          step={100}
                          value={item.estimateMi ?? ""}
                          placeholder={row.netIncome !== null ? String(Math.round(row.netIncome / 1e6)) : ""}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setEstimate(row.ticker, e.target.value === "" || !Number.isFinite(n) ? null : n);
                          }}
                          aria-label={`Lucro estimado de ${row.ticker} em R$ milhões`}
                          className="num w-24 bg-transparent px-2 py-1 text-sm outline-none"
                        />
                        <span className="pr-2 text-xs text-muted-foreground">mi</span>
                      </span>
                      {row.netIncome !== null && row.netIncome > 0 &&
                        SCENARIOS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setEstimate(row.ticker, Math.round((row.netIncome! * (1 + s)) / 1e6))}
                            aria-label={`Estimar lucro de ${row.ticker} ${s > 0 ? "maior" : "menor"} em ${Math.abs(s * 100)}%`}
                            className="num rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {s > 0 ? "+" : "−"}{Math.abs(s * 100)}%
                          </button>
                        ))}
                    </div>
                  </td>
                  <td className={cn("num px-3 py-2 text-right", sim.growth !== null && sim.growth > 0 && "text-positive", sim.growth !== null && sim.growth < 0 && "text-negative")}>{sim.growth === null ? MISSING : formatSignedPercent(sim.growth, 1)}</td>
                  <td className="num px-3 py-2 text-right">{row.pl === null ? MISSING : formatMultiple(row.pl, 1)}</td>
                  <td className="num px-3 py-2 text-right font-semibold">{sim.plForward === null ? MISSING : formatMultiple(sim.plForward, 1)}</td>
                  <td className="num px-3 py-2 text-right">{row.roe === null ? MISSING : formatPercent(row.roe)}</td>
                  <td className={cn("num px-3 py-2 text-right font-semibold", sim.roeForward !== null && selic !== null && sim.roeForward > selic && "text-positive")}>{sim.roeForward === null ? MISSING : formatPercent(sim.roeForward)}</td>
                  <td className="px-1 text-center">
                    <Button variant="ghost" size="icon-xs" onClick={() => remove(row.ticker)} aria-label={`Retirar ${row.ticker} do simulador`}>
                      <XIcon />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {simulated.length > 0 && (
        <figure className="rounded-xl border bg-card p-4">
          <figcaption className="mb-2 text-sm font-medium">Antes e depois da sua estimativa</figcaption>
          <PanoramaScatter rows={liquid} selic={selic} simulated={simulated} />
          <p className="mt-1 text-xs text-muted-foreground">Círculo vazio: hoje. Círculo azul: com a sua estimativa. Empresas fora da escala do gráfico seguem na tabela.</p>
        </figure>
      )}

      <p className="text-xs text-muted-foreground">
        P/L projetado = valor de mercado atual ÷ lucro estimado. ROE projetado = lucro estimado ÷ patrimônio atual. Preço e patrimônio ficam iguais aos de hoje. A estimativa é sua e fica só neste navegador; não é previsão nem recomendação de investimento.
      </p>
    </div>
  );
}

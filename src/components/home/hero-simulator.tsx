"use client";

import Link from "next/link";
import { useState } from "react";
import { simulateProfit, type MarketRow } from "@/analytics/market-overview";
import { formatCompactCurrency, formatMultiple, formatPercent } from "@/lib/format";
import { moneyUnit, parseUnitText, toUnitText } from "@/lib/money-unit";
import { cn } from "@/lib/utils";

const START_GROWTH = 0.1;

/** A frase de abertura: o simulador de lucro em uma linha. */
export function HeroSimulator({ options, dataDate }: { options: MarketRow[]; dataDate: string | null }) {
  const [ticker, setTicker] = useState(options[0]?.ticker);
  const row = options.find((o) => o.ticker === ticker) ?? options[0];
  const unit = moneyUnit(row?.netIncome);
  const start = (r: MarketRow) => toUnitText((r.netIncome ?? 0) * (1 + START_GROWTH), moneyUnit(r.netIncome));
  const [draft, setDraft] = useState(() => (row ? start(row) : ""));
  if (!row || row.netIncome === null) return null;

  const estimate = parseUnitText(draft, unit);
  const sim = simulateProfit(row, estimate);
  const growth = sim.growth;
  const pick = (r: MarketRow) => {
    setTicker(r.ticker);
    setDraft(start(r));
  };

  return (
    <section aria-label="Simule o lucro de uma empresa" className="grid gap-6">
      <p className="max-w-4xl text-3xl leading-[1.25] font-medium tracking-tight text-balance sm:text-[2.6rem] sm:leading-[1.2]">
        Se <span className="font-semibold tabular-nums">{row.ticker}</span> lucrar R${" "}
        <label className="inline-flex items-baseline">
          <span className="sr-only">Lucro estimado de {row.ticker} no próximo ano, em R$ {unit.name}</span>
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ width: `${Math.max(2, draft.length) + 0.6}ch` }}
            className="border-b-2 border-primary tabular-nums bg-transparent text-center text-primary outline-none focus-visible:bg-primary/10"
          />
        </label>{" "}
        {unit.label} no próximo ano
        {growth !== null && (
          <span className="text-muted-foreground">
            {", "}
            {Math.abs(growth) < 0.0005 ? "o mesmo dos últimos 12 meses" : `${formatPercent(Math.abs(growth), 0)} ${growth > 0 ? "acima" : "abaixo"} dos últimos 12 meses`}
          </span>
        )}
        , o P/L vai de <span className="tabular-nums">{formatMultiple(row.pl, 1)}</span> para{" "}
        <span className="font-semibold tabular-nums">{sim.plForward === null ? "—" : formatMultiple(sim.plForward, 1)}</span>.
      </p>

      <p className="max-w-2xl text-sm text-muted-foreground">
        Hoje {row.ticker} lucra {formatCompactCurrency(row.netIncome, 1)} em 12 meses e tem ROE de {formatPercent(row.roe)}; com o seu número, o ROE iria para{" "}
        {sim.roeForward === null ? "—" : formatPercent(sim.roeForward)}. Preço e patrimônio ficam os de hoje{dataDate ? `, com dados até ${dataDate.split("-").reverse().join("/")}` : ""}.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Testar com</span>
        {options.map((o) => (
          <button
            key={o.ticker}
            type="button"
            onClick={() => pick(o)}
            aria-pressed={o.ticker === row.ticker}
            className={cn(
              "num rounded-md border px-2.5 py-1 text-sm transition-colors hover:bg-muted",
              o.ticker === row.ticker ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
            )}
          >
            {o.ticker}
          </button>
        ))}
        <Link href="/panorama#simulador" className="ml-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
          Comparar várias empresas no simulador
        </Link>
      </div>
    </section>
  );
}

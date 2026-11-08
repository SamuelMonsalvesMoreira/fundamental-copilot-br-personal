"use client";

import { InfoIcon } from "lucide-react";
import type { Indicator } from "@/analytics/indicators";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatByType } from "@/lib/format";
import { cn } from "@/lib/utils";

const GROUPS: Array<{ key: Indicator["group"]; title: string; keys: string[] }> = [
  { key: "valuation", title: "Valuation", keys: ["pl", "pvp", "evEbitda", "evEbit", "psr", "lpa", "vpa"] },
  { key: "rentabilidade", title: "Rentabilidade", keys: ["roe", "roic", "roa"] },
  { key: "margens", title: "Margens", keys: ["grossMargin", "ebitdaMargin", "ebitMargin", "netMargin"] },
  { key: "endividamento", title: "Endividamento", keys: ["netDebt", "netDebtEbitda", "netDebtEquity", "currentRatio"] },
  { key: "dividendos", title: "Dividendos", keys: ["dy", "payout"] },
  { key: "crescimento", title: "Crescimento", keys: ["revenueCagr5y", "earningsCagr5y"] },
  { key: "tamanho", title: "Tamanho", keys: ["marketCap", "ev", "ebitda"] },
];

export function IndicatorGrid({ indicators }: { indicators: Record<string, Indicator> }) {
  return (
    <div className="grid gap-6">
      {GROUPS.map((g) => {
        const items = g.keys.map((k) => indicators[k]).filter((i): i is Indicator => Boolean(i) && i.applicable);
        if (items.length === 0) return null;
        return (
          <section key={g.key} aria-labelledby={`grp-${g.key}`}>
            <h3 id={`grp-${g.key}`} className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {g.title}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              {items.map((i) => (
                <IndicatorCell key={i.key} ind={i} />
              ))}
            </div>
          </section>
        );
      })}
      <NotApplicable indicators={indicators} />
    </div>
  );
}

function IndicatorCell({ ind }: { ind: Indicator }) {
  const negative = ind.value !== null && ind.value < 0;
  return (
    <Popover>
      <PopoverTrigger
        className="group flex flex-col items-start rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-ring/50 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
        aria-label={`${ind.label}: ver como foi calculado`}
      >
        <span className="flex w-full items-center justify-between gap-1 text-xs text-muted-foreground">
          {ind.label}
          <InfoIcon className="size-3 opacity-40 group-hover:opacity-100" aria-hidden />
        </span>
        <span className={cn("num mt-1 text-lg leading-tight font-semibold", ind.value === null && "text-muted-foreground", negative && "text-negative")}>
          {formatByType(ind.value, ind.format)}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm">
        <IndicatorExplanation ind={ind} />
      </PopoverContent>
    </Popover>
  );
}

export function IndicatorExplanation({ ind }: { ind: Indicator }) {
  return (
    <div className="grid gap-2">
      <div>
        <p className="font-medium">{ind.label}</p>
        <p className="num text-xl font-semibold">{formatByType(ind.value, ind.format)}</p>
        <p className="text-xs text-muted-foreground">{ind.period}</p>
      </div>
      <p className="text-xs">
        <span className="text-muted-foreground">Fórmula: </span>
        {ind.formula}
      </p>
      {ind.inputs.length > 0 && (
        <dl className="grid gap-1 rounded-md bg-muted/60 p-2 text-xs">
          {ind.inputs.map((inp, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_auto] gap-x-3">
              <dt>{inp.label}</dt>
              <dd className={cn("num text-right", inp.value === null && "text-muted-foreground")}>{formatByType(inp.value, inp.format)}</dd>
              {(inp.period || inp.source) && (
                <dd className="col-span-2 text-[11px] text-muted-foreground">{[inp.period, inp.source].filter(Boolean).join(" · ")}</dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {ind.missing && <p className="text-xs text-warning">Indisponível: {ind.missing}</p>}
      {ind.note && <p className="text-xs text-muted-foreground">{ind.note}</p>}
    </div>
  );
}

function NotApplicable({ indicators }: { indicators: Record<string, Indicator> }) {
  const na = Object.values(indicators).filter((i) => !i.applicable);
  if (na.length === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Não se aplicam a este tipo de empresa: {na.map((i) => i.label).join(", ")}.
    </p>
  );
}

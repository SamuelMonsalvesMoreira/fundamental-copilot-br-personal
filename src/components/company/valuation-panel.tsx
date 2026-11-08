"use client";

import { useMemo, useState } from "react";
import { RotateCcwIcon } from "lucide-react";
import { bazin, dcf, type ValuationResult } from "@/analytics/valuation";
import { Button } from "@/components/ui/button";
import { formatCompactCurrency, formatCurrency, formatPercent, formatSignedPercent, trendOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CompanyPageData } from "@/server/company";

type V = CompanyPageData["valuation"];

function Upside({ v }: { v: number | null }) {
  const t = trendOf(v);
  if (v === null) return null;
  return (
    <span className={cn("num text-sm font-medium", t === "up" && "text-positive", t === "down" && "text-negative")}>
      {formatSignedPercent(v, 1)} vs. preço atual
    </span>
  );
}

function ResultCard({ title, result, children, footer }: { title: string; result: ValuationResult; children?: React.ReactNode; footer: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border bg-card p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{result.formula}</p>
      <div className="mt-3">
        {result.value !== null ? (
          <>
            <p className="num text-3xl font-semibold tracking-tight">{formatCurrency(result.value)}</p>
            <Upside v={result.upside} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Indisponível: {result.missing}</p>
        )}
        {result.value !== null && result.missing && <p className="mt-1 text-xs text-warning">{result.missing}</p>}
      </div>
      {children && <div className="mt-4 grid gap-3">{children}</div>}
      <div className="mt-auto pt-4 text-[11px] text-muted-foreground">{footer}</div>
    </section>
  );
}

function PercentInput({ label, value, onChange, step = 0.5, hint }: { label: string; value: number; onChange: (v: number) => void; step?: number; hint?: string }) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center rounded-md border bg-background focus-within:ring-3 focus-within:ring-ring/30">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={Number((value * 100).toFixed(2))}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n / 100);
          }}
          className="num w-full bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        <span className="pr-2 text-muted-foreground">%</span>
      </span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function NumberInput({ label, value, onChange, suffix, hint, step = 1 }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; hint?: string; step?: number }) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center rounded-md border bg-background focus-within:ring-3 focus-within:ring-ring/30">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="num w-full bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        {suffix && <span className="pr-2 whitespace-nowrap text-muted-foreground">{suffix}</span>}
      </span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function ValuationPanel({ v, ticker }: { v: V; ticker: string }) {
  // Bazin
  const [minYield, setMinYield] = useState(0.06);
  const bz = bazin({ dividendsPerShare: v.bazin.averageDps, minYield, price: v.price });

  // DCF
  const defaults = useMemo(
    () => ({
      baseFcfMi: v.dcf.baseFcf !== undefined ? Math.round(v.dcf.baseFcf / 1e6) : 0,
      growthRate: v.dcf.growthRate ?? 0.05,
      years: v.dcf.years ?? 5,
      terminalGrowth: v.dcf.terminalGrowth ?? 0.04,
      discountRate: v.dcf.discountRate ?? 0.15,
    }),
    [v.dcf],
  );
  const [a, setA] = useState(defaults);
  const set = <K extends keyof typeof a>(k: K) => (val: (typeof a)[K]) => setA((s) => ({ ...s, [k]: val }));
  const canDcf = v.applicable && v.dcf.shares !== undefined && v.dcf.netDebt !== undefined && v.dcf.baseFcf !== undefined;
  const run = (dr: number, tg: number) =>
    dcf(
      { baseFcf: a.baseFcfMi * 1e6, growthRate: a.growthRate, years: a.years, terminalGrowth: tg, discountRate: dr, netDebt: v.dcf.netDebt ?? 0, shares: v.dcf.shares ?? 0 },
      v.price,
    );
  const result = canDcf
    ? run(a.discountRate, a.terminalGrowth)
    : { value: null, upside: null, formula: "Fluxo de caixa descontado", missing: !v.applicable ? "não se aplica a bancos e seguradoras (fluxo de caixa livre não representa o negócio)" : "faltam dados de caixa, dívida ou quantidade de ações", projections: [], terminalShare: null, enterpriseValue: null, equityValue: null };

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ResultCard
          title="Graham"
          result={v.graham}
          footer={
            <>
              LPA {formatCurrency(v.lpa)} · VPA {formatCurrency(v.vpa)} · preço {ticker} {formatCurrency(v.price)}. Pensado para empresas
              lucrativas e estáveis; não considera crescimento.
            </>
          }
        />
        <ResultCard
          title="Bazin (preço-teto)"
          result={bz}
          footer={<>Base: {v.bazin.source}.</>}
        >
          <PercentInput label="Rendimento mínimo exigido" value={minYield} onChange={setMinYield} hint="Bazin usava 6% ao ano" />
          {v.bazin.perYear.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Dividendos por ação:{" "}
              {v.bazin.perYear.map((p) => (
                <span key={p.year} className="num mr-2">
                  {p.year}: {formatCurrency(p.total)}
                </span>
              ))}
              · média <span className="num">{formatCurrency(v.bazin.averageDps)}</span>
            </p>
          )}
        </ResultCard>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">Fluxo de caixa descontado (DCF simples)</h3>
            <p className="text-xs text-muted-foreground">{result.formula}</p>
          </div>
          {canDcf && (
            <Button variant="ghost" size="sm" onClick={() => setA(defaults)}>
              <RotateCcwIcon /> Premissas padrão
            </Button>
          )}
        </div>

        {canDcf ? (
          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className="grid content-start gap-3 sm:grid-cols-2">
              <NumberInput label="FCF do ano-base" value={a.baseFcfMi} onChange={set("baseFcfMi")} suffix="R$ mi" step={100} hint={v.dcf.notes.baseFcf} />
              <NumberInput label="Anos de projeção" value={a.years} onChange={(n) => set("years")(Math.max(1, Math.min(20, Math.round(n))))} />
              <PercentInput label="Crescimento anual do FCF" value={a.growthRate} onChange={set("growthRate")} hint={v.dcf.notes.growthRate} />
              <PercentInput label="Crescimento na perpetuidade" value={a.terminalGrowth} onChange={set("terminalGrowth")} hint={v.dcf.notes.terminalGrowth} />
              <PercentInput label="Taxa de desconto" value={a.discountRate} onChange={set("discountRate")} hint={v.dcf.notes.discountRate} />
              <div className="grid gap-1 text-xs">
                <span className="text-muted-foreground">Dívida líquida + minoritários</span>
                <span className="num py-1.5 text-sm">{formatCompactCurrency(v.dcf.netDebt)}</span>
                <span className="text-muted-foreground">Ações: <span className="num">{new Intl.NumberFormat("pt-BR").format(v.dcf.shares ?? 0)}</span></span>
              </div>
            </div>

            <div className="grid content-start gap-4">
              <div>
                {result.value !== null ? (
                  <>
                    <p className="num text-3xl font-semibold tracking-tight">{formatCurrency(result.value)}</p>
                    <Upside v={result.upside} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Indisponível: {result.missing}</p>
                )}
                {result.value !== null && result.missing && <p className="mt-1 text-xs text-warning">{result.missing}</p>}
                {result.terminalShare !== null && result.terminalShare > 0.75 && (
                  <p className="mt-1 text-xs text-warning">
                    {formatPercent(result.terminalShare, 0)} do valor vem da perpetuidade: o resultado é muito sensível às premissas.
                  </p>
                )}
              </div>

              {result.projections.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 text-left font-medium">Ano</th>
                        {result.projections.map((p) => (
                          <th key={p.year} className="num py-1 text-right font-medium">+{p.year}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <th className="py-1 text-left font-normal text-muted-foreground">FCF</th>
                        {result.projections.map((p) => (
                          <td key={p.year} className="num py-1 text-right">{formatCompactCurrency(p.fcf, 1)}</td>
                        ))}
                      </tr>
                      <tr className="border-t">
                        <th className="py-1 text-left font-normal text-muted-foreground">Valor presente</th>
                        {result.projections.map((p) => (
                          <td key={p.year} className="num py-1 text-right">{formatCompactCurrency(p.presentValue, 1)}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <Sensitivity run={run} base={a} />
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Indisponível: {result.missing}.</p>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Modelos simplificados para estudo. O resultado depende fortemente das premissas e não é preço-alvo nem
        recomendação de investimento.
      </p>
    </div>
  );
}

function Sensitivity({ run, base }: { run: (dr: number, tg: number) => { value: number | null }; base: { discountRate: number; terminalGrowth: number } }) {
  const drs = [-0.02, -0.01, 0, 0.01, 0.02].map((d) => base.discountRate + d);
  const tgs = [-0.01, 0, 0.01].map((d) => base.terminalGrowth + d);
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-xs text-muted-foreground">Sensibilidade: valor por ação (linhas = taxa de desconto, colunas = perpetuidade)</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th />
            {tgs.map((t) => (
              <th key={t} className="num py-1 text-right font-medium">{formatPercent(t, 1)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drs.map((d) => (
            <tr key={d} className="border-t">
              <th className="num py-1 text-left font-medium text-muted-foreground">{formatPercent(d, 1)}</th>
              {tgs.map((t) => {
                const r = d > t ? run(d, t).value : null;
                const isBase = Math.abs(d - base.discountRate) < 1e-9 && Math.abs(t - base.terminalGrowth) < 1e-9;
                return (
                  <td key={t} className={cn("num py-1 text-right", isBase && "font-semibold text-primary")}>
                    {r === null ? "—" : formatCurrency(r)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { isDemo } from "@/lib/demo";
import { useMemo, useState, useTransition } from "react";
import { Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { CheckCircle2Icon, CircleAlertIcon, CircleIcon, FileDownIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { projectEarnings, type ProjectionAssumptions } from "@/analytics/projections";
import { buildReport, type Pillar, type ReportItem, type Tone } from "@/analytics/report";
import { Button } from "@/components/ui/button";
import { formatCompactNumber, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CompanyPageData } from "@/server/company";
import type { ProjectionContext } from "@/server/projections";
import { saveProjection } from "@/server/projection-actions";
import { PercentInput } from "./valuation-panel";

const TONE: Record<Tone, { icon: typeof CircleIcon; cls: string; label: string }> = {
  pos: { icon: CheckCircle2Icon, cls: "text-positive", label: "Ponto positivo" },
  neg: { icon: CircleAlertIcon, cls: "text-negative", label: "Ponto de atenção" },
  neu: { icon: CircleIcon, cls: "text-muted-foreground", label: "Informação" },
};

const PILLAR: Record<Pillar["status"], string> = {
  Forte: "border-positive/40 bg-positive/10 text-positive",
  Neutro: "bg-muted text-foreground",
  Atenção: "border-negative/40 bg-negative/10 text-negative",
  "Sem dado": "bg-muted/50 text-muted-foreground",
};

function Items({ items }: { items: ReportItem[] }) {
  return (
    <ul className="grid gap-1.5">
      {items.map((it, i) => {
        const t = TONE[it.tone];
        const Icon = t.icon;
        return (
          <li key={i} className="flex gap-2 text-sm leading-relaxed">
            <Icon className={cn("mt-1 size-3.5 shrink-0", t.cls)} aria-label={t.label} />
            <span>{it.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function AutoReport({ data, ctx }: { data: CompanyPageData; ctx: ProjectionContext }) {
  const base = ctx.saved ?? ctx.defaults;
  const savedEstimate = ctx.saved?.overrides["1"]?.netIncome ?? null;
  const [estimateMi, setEstimateMi] = useState<number | null>(savedEstimate === null ? null : Math.round(savedEstimate / 1e6));
  const [payout, setPayout] = useState(ctx.saved?.overrides["1"]?.payout ?? base.payout);
  const [pending, start] = useTransition();

  const assumptions: ProjectionAssumptions = useMemo(() => {
    const overrides = { ...base.overrides };
    const first = { ...(overrides["1"] ?? {}), payout };
    if (estimateMi !== null) first.netIncome = estimateMi * 1e6;
    else delete first.netIncome;
    overrides["1"] = first;
    return { ...base, overrides };
  }, [base, estimateMi, payout]);

  const hasScenario = estimateMi !== null || ctx.saved !== null;
  const result = useMemo(() => projectEarnings(ctx.base, assumptions, { avgCost: ctx.avgCost }), [ctx.base, assumptions, ctx.avgCost]);
  const report = useMemo(
    () =>
      buildReport(data, {
        macro: data.macro,
        scenario: hasScenario ? { result, netIncomeBase: ctx.base.netIncome, avgCost: ctx.avgCost, isSaved: ctx.saved !== null } : null,
      }),
    [data, hasScenario, result, ctx.base.netIncome, ctx.avgCost, ctx.saved],
  );

  const save = () =>
    start(async () => {
      const r = await saveProjection(ctx.ticker, assumptions);
      if (r.ok) toast.success("Estimativa salva");
      else toast.error(r.error ?? "Não foi possível salvar");
    });

  const exportPdf = () => {
    const title = document.title;
    document.title = `Relatorio_${data.ticker}_${new Date().toISOString().slice(0, 10)}`;
    window.print();
    document.title = title;
  };

  const chart = data.annual.slice(-8).map((p) => ({ label: p.label, receita: p.revenue, lucro: p.netIncome }));

  return (
    <div className="grid grid-cols-1 gap-4">
      <section className="grid gap-3 rounded-xl border bg-card p-4 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">Sua estimativa</h3>
            <p className="text-xs text-muted-foreground">Coloque o lucro que você espera; o relatório recalcula na hora. Opcional.</p>
          </div>
          <div className="flex gap-2">
            {!isDemo && (
            <Button variant="outline" size="sm" onClick={save} disabled={pending || (estimateMi === null && !ctx.saved)}>
              <SaveIcon /> Salvar estimativa
            </Button>
            )}
            <Button size="sm" onClick={exportPdf}>
              <FileDownIcon /> Exportar PDF
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:max-w-lg sm:grid-cols-2">
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Lucro estimado, próximos 12 meses</span>
            <span className="flex items-center rounded-md border bg-background focus-within:ring-3 focus-within:ring-ring/30">
              <input
                type="number"
                inputMode="decimal"
                step={100}
                value={estimateMi ?? ""}
                placeholder={ctx.base.netIncome !== null ? String(Math.round(ctx.base.netIncome / 1e6)) : ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = Number(raw);
                  setEstimateMi(raw === "" || !Number.isFinite(n) ? null : n);
                }}
                aria-label="Lucro estimado em R$ milhões"
                className="num w-full bg-transparent px-2 py-1.5 text-sm outline-none"
              />
              <span className="pr-2 whitespace-nowrap text-muted-foreground">R$ mi</span>
            </span>
            <span className="text-[11px] text-muted-foreground">Vazio: usa sua projeção salva, se houver.</span>
          </label>
          <PercentInput label="Payout esperado" value={payout} onChange={setPayout} step={1} hint={ctx.notes.payout} />
        </div>
      </section>

      <article className="grid gap-5 rounded-xl border bg-card p-5 print:border-0 print:p-0">
        <header className="grid gap-1">
          <p className="text-xs font-medium text-primary">Relatório fundamentalista · gerado por regras, sem IA</p>
          <h2 className="text-xl font-semibold tracking-tight">
            {data.meta.tradeName ?? data.meta.name} <span className="num text-muted-foreground">({data.ticker})</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Resultados: {data.ttm ? `até ${formatDate(data.ttm.end)} (CVM)` : "sem demonstrações"} · Preço:{" "}
            {data.quote ? `${formatDate(data.quote.date)} (${data.quote.source})` : "sem cotação"} · Macro: Banco Central
          </p>
        </header>

        <div className="grid gap-1.5 text-sm leading-relaxed">
          {report.summary.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Placar por tema">
          {report.pillars.map((p) => (
            <div key={p.label} className={cn("rounded-lg border px-3 py-2", PILLAR[p.status])}>
              <p className="text-[11px] opacity-80">{p.label}</p>
              <p className="text-sm font-semibold">{p.status}</p>
            </div>
          ))}
        </div>

        {report.highlights.length > 0 && (
          <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {report.highlights.map((h) => (
              <div key={h.label} className="rounded-lg bg-muted/50 px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{h.label}</dt>
                <dd className="num text-base font-semibold">{h.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {report.scenario.length > 0 && (
          <section className="rounded-lg border border-warning/40 bg-warning/10 p-4 [break-inside:avoid]">
            <h3 className="mb-2 text-sm font-semibold">Seu cenário (estimativa sua, não é dado oficial)</h3>
            <Items items={report.scenario} />
          </section>
        )}

        {chart.length >= 2 && (
          <figure className="[break-inside:avoid]">
            <figcaption className="mb-2 text-sm font-semibold">Receita e lucro por ano</figcaption>
            <div className="h-48">
              <ResponsiveContainer>
                <ComposedChart data={chart} margin={{ left: 4, right: 4, top: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(n: number) => formatCompactNumber(n, 1)} width={52} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
                  <Bar dataKey="receita" name="Receita" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                  <Bar dataKey="lucro" name="Lucro" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground">
              <span className="text-[var(--chart-1)]">■</span> Receita <span className="ml-2 text-[var(--chart-2)]">■</span> Lucro dos controladores · CVM (DFP)
            </p>
          </figure>
        )}

        {report.sections.map((s) => (
          <section key={s.id} className="grid gap-2 [break-inside:avoid]">
            <h3 className="border-b pb-1 text-sm font-semibold">{s.title}</h3>
            <Items items={s.items} />
          </section>
        ))}

        {report.missing.length > 0 && (
          <section className="grid gap-1 [break-inside:avoid]">
            <h3 className="border-b pb-1 text-sm font-semibold">Dados indisponíveis</h3>
            <ul className="grid gap-0.5 text-xs text-muted-foreground">
              {report.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </section>
        )}

        <p className="border-t pt-3 text-xs text-muted-foreground">
          Texto gerado automaticamente por regras fixas a partir dos dados do app. Os limites usados são referências usuais, não verdades absolutas. Material
          educacional: não constitui recomendação de investimento.
        </p>
      </article>
    </div>
  );
}

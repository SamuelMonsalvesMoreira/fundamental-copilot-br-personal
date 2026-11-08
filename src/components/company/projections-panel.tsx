"use client";

import { isDemo } from "@/lib/demo";
import { useMemo, useState, useTransition } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FlaskConicalIcon, RotateCcwIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { projectEarnings, SCENARIOS, type ProjectionAssumptions, type ProjectionRow } from "@/analytics/projections";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCompactCurrency, formatCompactNumber, formatCurrency, formatDate, formatDateTime, formatMultiple, formatPercent, formatSignedPercent, MISSING, trendOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProjectionContext } from "@/server/projections";
import { deleteProjection, saveProjection } from "@/server/projection-actions";
import { NumberInput, PercentInput } from "./valuation-panel";

const signClass = (v: number | null) => {
  const t = trendOf(v);
  return t === "up" ? "text-positive" : t === "down" ? "text-negative" : "";
};

/** Célula editável: vazia volta ao valor calculado. */
function OverrideCell({
  shown,
  overridden,
  label,
  parse,
  onCommit,
}: {
  shown: string;
  overridden: boolean;
  label: string;
  parse: (raw: string) => number | null;
  onCommit: (v: number | null) => void;
}) {
  return (
    <input
      key={shown}
      aria-label={label}
      defaultValue={shown}
      inputMode="decimal"
      onBlur={(e) => {
        const raw = e.target.value.trim();
        if (raw === shown) return;
        if (raw === "") return onCommit(null);
        const v = parse(raw);
        if (v === null) {
          e.target.value = shown;
          toast.error("Número inválido");
          return;
        }
        onCommit(v);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cn(
        "num w-24 rounded border bg-transparent px-1.5 py-1 text-right text-sm outline-none focus:border-ring",
        overridden ? "border-primary bg-primary/10 font-semibold" : "border-transparent hover:border-input",
      )}
    />
  );
}

const parseMi = (raw: string) => {
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n * 1e6 : null;
};
const parsePct = (raw: string) => {
  const n = Number(raw.replace("%", "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 200 ? n / 100 : null;
};
const miText = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v / 1e6);
const pctText = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v * 100);
const endLabel = (r: ProjectionRow) => (r.end ? `até ${r.end.slice(5, 7)}/${r.end.slice(0, 4)}` : `ano ${r.year}`);

export function ProjectionsPanel({ ctx }: { ctx: ProjectionContext }) {
  const [a, setA] = useState<ProjectionAssumptions>(ctx.saved ?? ctx.defaults);
  const [pending, start] = useTransition();
  const set = <K extends keyof ProjectionAssumptions>(k: K) => (v: ProjectionAssumptions[K]) => setA((s) => ({ ...s, [k]: v }));

  const dirty = JSON.stringify(a) !== JSON.stringify(ctx.saved ?? ctx.defaults);
  const result = useMemo(() => projectEarnings(ctx.base, a, { avgCost: ctx.avgCost }), [ctx.base, a, ctx.avgCost]);
  const scenarios = useMemo(
    () => SCENARIOS.map((s) => ({ ...s, r: projectEarnings(ctx.base, a, { avgCost: ctx.avgCost, growthDelta: s.delta }) })),
    [ctx.base, a, ctx.avgCost],
  );

  const setOverride = (year: number, field: "netIncome" | "payout", value: number | null) =>
    setA((s) => {
      const key = String(year);
      const cur = { ...(s.overrides[key] ?? {}) };
      if (value === null) delete cur[field];
      else cur[field] = value;
      const overrides = { ...s.overrides };
      if (Object.keys(cur).length) overrides[key] = cur;
      else delete overrides[key];
      return { ...s, overrides };
    });

  const save = () =>
    start(async () => {
      const r = await saveProjection(ctx.ticker, a);
      if (r.ok) toast.success("Projeção salva");
      else toast.error(r.error ?? "Não foi possível salvar");
    });
  const remove = () =>
    start(async () => {
      await deleteProjection(ctx.ticker);
      setA(ctx.defaults);
      toast.success("Projeção excluída");
    });

  const chartData = [
    ...ctx.history.map((h) => ({ label: h.label, real: h.netIncome, dividendos: h.dividends, projetado: null as number | null, divProj: null as number | null })),
    ...result.rows.map((r) => ({ label: `+${r.year}`, real: null as number | null, dividendos: null as number | null, projetado: r.netIncome, divProj: r.dividends })),
  ];
  const hasOverrides = Object.keys(a.overrides).length > 0;

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <FlaskConicalIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          <span className="font-medium">Projeção sua, não é dado oficial.</span> O ponto de partida é real ({ctx.baseLabel ?? "sem resultados"}, CVM;
          preço de mercado), mas todos os valores futuros dependem das premissas abaixo. Não é previsão nem recomendação de investimento.
        </p>
      </div>

      <section className="grid gap-4 rounded-xl border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="grid content-start gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Premissas</h3>
            {!ctx.isFinancial && (
              <ToggleGroup value={[a.mode]} onValueChange={(v: string[]) => v[0] && set("mode")(v[0] as ProjectionAssumptions["mode"])} variant="outline" size="sm" aria-label="Forma de projetar">
                <ToggleGroupItem value="lucro">Pelo lucro</ToggleGroupItem>
                <ToggleGroupItem value="receita">Receita × margem</ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <PercentInput label={a.mode === "lucro" ? "Crescimento anual do lucro" : "Crescimento anual da receita"} value={a.growth} onChange={set("growth")} hint={a.mode === "lucro" ? ctx.notes.growth : undefined} />
            {a.mode === "receita" && <PercentInput label="Margem líquida" value={a.netMargin} onChange={set("netMargin")} hint={ctx.notes.netMargin} />}
            <PercentInput label="Payout (parte do lucro distribuída)" value={a.payout} onChange={set("payout")} step={1} hint={ctx.notes.payout} />
            <NumberInput label="Anos de projeção" value={a.years} onChange={(n) => set("years")(Math.max(1, Math.min(10, Math.round(n))))} />
            <NumberInput label="P/L no último ano (0 = não estimar preço)" value={a.exitPl ?? 0} step={0.5} onChange={(n) => set("exitPl")(n > 0 ? Math.min(200, n) : null)} suffix="x" hint={ctx.notes.exitPl} />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!isDemo && (
            <Button size="sm" onClick={save} disabled={pending || (!dirty && ctx.saved !== null)}>
              <SaveIcon /> Salvar projeção
            </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setA(ctx.defaults)} disabled={pending}>
              <RotateCcwIcon /> Premissas padrão
            </Button>
            {ctx.saved && (
              <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
                <Trash2Icon /> Excluir
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {dirty ? "Alterações não salvas" : ctx.savedAt ? `Salva em ${formatDateTime(ctx.savedAt)}` : "Ainda não salva"}
            </span>
          </div>
        </div>

        <div className="grid content-start gap-3">
          <h3 className="text-sm font-medium">Resultado por cenário</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1 text-left font-medium" />
                  {scenarios.map((s) => (
                    <th key={s.id} scope="col" className={cn("py-1 text-right font-medium", s.delta === 0 && "text-foreground")}>
                      {s.label}
                      <span className="num block text-[10px] font-normal">{formatPercent(a.growth + s.delta, 1)} a.a.</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Lucro no último ano", (r) => formatCompactCurrency(r.rows.at(-1)?.netIncome, 1)],
                    ["Dividendo/ação no último ano", (r) => formatCurrency(r.rows.at(-1)?.dps)],
                    ["Dividendos/ação acumulados", (r) => formatCurrency(r.cumulativeDps)],
                    ["Preço implícito no último ano", (r) => formatCurrency(r.exitPrice)],
                    ["Retorno total", (r) => formatSignedPercent(r.totalReturn, 1)],
                    ["Retorno ao ano", (r) => formatSignedPercent(r.annualizedReturn, 1)],
                  ] as Array<[string, (r: (typeof scenarios)[number]["r"]) => string]>
                ).map(([label, fn]) => (
                  <tr key={label} className="border-t">
                    <th scope="row" className="py-1.5 text-left font-normal text-muted-foreground">{label}</th>
                    {scenarios.map((s) => (
                      <td key={s.id} className={cn("num py-1.5 text-right", s.delta === 0 && "font-semibold")}>{fn(s.r)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Cenários somam ±5 p.p. ao crescimento{hasOverrides ? "; anos digitados à mão não mudam entre cenários" : ""}. Retorno = preço implícito + dividendos,
            sem reinvestir, sobre {formatCurrency(ctx.base.price)}. Referência: Selic atual de {formatPercent(ctx.selic, 2)} a.a. (a taxa muda com o tempo).
          </p>
        </div>
      </section>

      {result.missing.length > 0 && <p className="text-sm text-warning">Atenção: {result.missing.join("; ")}.</p>}

      {result.rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Ano</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Lucro (R$ mi)</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Var.</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">LPA</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Payout (%)</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Dividendos</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Div./ação</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">DY s/ preço</th>
                  {ctx.avgCost !== null && <th scope="col" className="px-3 py-2 text-right font-medium">DY s/ seu custo</th>}
                  <th scope="col" className="px-3 py-2 text-right font-medium">P/L projetado</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.year} className="border-t">
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">
                      <span className="num font-semibold">+{r.year}</span>
                      <span className="block text-[11px] text-muted-foreground">{endLabel(r)}</span>
                    </th>
                    <td className="px-2 py-1 text-right">
                      <OverrideCell shown={miText(r.netIncome)} overridden={r.netIncomeOverridden} label={`Lucro do ano ${r.year} em R$ milhões`} parse={parseMi} onCommit={(v) => setOverride(r.year, "netIncome", v)} />
                    </td>
                    <td className={cn("num px-3 py-1.5 text-right", signClass(r.growth))}>{formatSignedPercent(r.growth, 1)}</td>
                    <td className="num px-3 py-1.5 text-right">{formatCurrency(r.eps)}</td>
                    <td className="px-2 py-1 text-right">
                      <OverrideCell shown={pctText(r.payout)} overridden={r.payoutOverridden} label={`Payout do ano ${r.year} em %`} parse={parsePct} onCommit={(v) => setOverride(r.year, "payout", v)} />
                    </td>
                    <td className="num px-3 py-1.5 text-right">{formatCompactCurrency(r.dividends, 1)}</td>
                    <td className="num px-3 py-1.5 text-right font-semibold">{formatCurrency(r.dps)}</td>
                    <td className="num px-3 py-1.5 text-right">{formatPercent(r.yieldOnPrice)}</td>
                    {ctx.avgCost !== null && <td className="num px-3 py-1.5 text-right">{formatPercent(r.yieldOnCost)}</td>}
                    <td className="num px-3 py-1.5 text-right">{r.impliedPl === null ? MISSING : formatMultiple(r.impliedPl, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Lucro e payout podem ser digitados em cada ano (célula destacada); deixe vazio para voltar ao cálculo. Os anos seguintes partem do valor digitado.
            Base: lucro dos controladores de {formatCompactCurrency(ctx.base.netIncome, 1)} (até {formatDate(ctx.base.baseEnd)}); quantidade de ações constante
            {ctx.base.shares ? ` (${formatCompactNumber(ctx.base.shares)})` : ""}
            {ctx.unitNote ? `. ${ctx.unitNote}` : ""}
            {ctx.avgCost !== null ? `; seu preço médio: ${formatCurrency(ctx.avgCost)}` : ""}.
          </p>

          <figure className="rounded-xl border bg-card p-4">
            <figcaption className="mb-3">
              <p className="text-sm font-medium">Lucro e dividendos: histórico e projeção</p>
              <p className="text-xs text-muted-foreground">R$; anos reais da CVM (DFP) e projeção conforme as premissas</p>
            </figcaption>
            <div className="h-60">
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ left: 4, right: 4, top: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v: number) => formatCompactNumber(v, 1)} width={52} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => (typeof v === "number" ? formatCompactCurrency(v, 2) : MISSING)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
                  <Bar dataKey="real" name="Lucro real" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="dividendos" name="Dividendos pagos" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="projetado" name="Lucro projetado" fill="var(--chart-1)" fillOpacity={0.4} stroke="var(--chart-1)" strokeDasharray="3 2" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="divProj" name="Dividendos projetados" fill="var(--chart-2)" fillOpacity={0.4} stroke="var(--chart-2)" strokeDasharray="3 2" radius={[3, 3, 0, 0]} maxBarSize={28} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </figure>
        </>
      )}
    </div>
  );
}

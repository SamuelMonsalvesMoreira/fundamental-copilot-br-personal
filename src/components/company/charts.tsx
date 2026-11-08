"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/common/states";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCompactNumber, formatCurrency, formatDate, formatMultiple, formatPercent } from "@/lib/format";
import type { CompanyPageData, SeriesPoint } from "@/server/company";

const C = {
  c1: "var(--chart-1)",
  c2: "var(--chart-2)",
  c3: "var(--chart-3)",
  c4: "var(--chart-4)",
  pos: "var(--positive)",
  neg: "var(--negative)",
  grid: "var(--border)",
  axis: "var(--muted-foreground)",
};

const axisProps = {
  stroke: C.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

const money = (v: number) => formatCompactNumber(v, 1);
const pct = (v: number) => formatPercent(v, 0);

function ChartCard({ title, subtitle, children, source }: { title: string; subtitle?: string; children: React.ReactNode; source: string }) {
  return (
    <figure className="rounded-xl border bg-card p-4">
      <figcaption className="mb-3">
        <p className="text-sm font-medium">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </figcaption>
      <div className="h-60 w-full">{children}</div>
      <p className="mt-2 text-[11px] text-muted-foreground">{source}</p>
    </figure>
  );
}

function TooltipBox({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | null; color?: string; dataKey?: string | number }>;
  label?: string | number;
  format: (v: number, key: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{typeof label === "string" && /^\d{4}-\d{2}-\d{2}$/.test(label) ? formatDate(label) : label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num">{p.value === null || p.value === undefined ? "—" : format(p.value, String(p.dataKey))}</span>
        </p>
      ))}
    </div>
  );
}

const hasAny = (data: SeriesPoint[], keys: Array<keyof SeriesPoint>) => data.some((d) => keys.some((k) => d[k] !== null));

export function CompanyCharts({ data }: { data: CompanyPageData }) {
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");
  const series = period === "annual" ? data.annual : data.quarterly;
  const isFinancial = data.meta.layout === "bank" || data.meta.layout === "insurance";
  const periodLabel = period === "annual" ? `exercícios ${data.annual[0]?.label ?? ""}–${data.annual.at(-1)?.label ?? ""}` : "últimos trimestres (3 meses)";
  const src = `Fonte: CVM (${period === "annual" ? "DFP" : "ITR e DFP"}) · lucro atribuído aos controladores`;

  if (data.annual.length === 0 && data.quarterly.length === 0) {
    return <EmptyState title="Sem demonstrações financeiras" description="A CVM ainda não tem DFP/ITR desta companhia no banco local." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{periodLabel}</p>
        <ToggleGroup
          value={[period]}
          onValueChange={(v: string[]) => v[0] && setPeriod(v[0] as "annual" | "quarterly")}
          variant="outline"
          size="sm"
          aria-label="Período dos gráficos"
        >
          <ToggleGroupItem value="annual">Anual</ToggleGroupItem>
          <ToggleGroupItem value="quarterly">Trimestral</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Receita e lucro líquido" subtitle="R$" source={src}>
          <ResponsiveContainer>
            <ComposedChart data={series} margin={{ left: 4, right: 4, top: 4 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis tickFormatter={money} width={52} {...axisProps} />
              <Tooltip content={<TooltipBox format={(v) => formatCompactNumber(v, 2)} />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke={C.axis} strokeOpacity={0.4} />
              <Bar dataKey="revenue" name="Receita" fill={C.c1} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="netIncome" name="Lucro líquido" fill={C.c2} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {!isFinancial && hasAny(series, ["grossMargin", "ebitdaMargin", "netMargin"]) && (
          <ChartCard title="Margens" subtitle="% da receita líquida" source={src}>
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ left: 4, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis tickFormatter={pct} width={44} {...axisProps} />
                <Tooltip content={<TooltipBox format={(v) => formatPercent(v, 1)} />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke={C.axis} strokeOpacity={0.4} />
                <Line dataKey="grossMargin" name="Bruta" stroke={C.c1} strokeWidth={2} dot={false} connectNulls />
                <Line dataKey="ebitdaMargin" name="EBITDA" stroke={C.c3} strokeWidth={2} dot={false} connectNulls />
                <Line dataKey="netMargin" name="Líquida" stroke={C.c2} strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {!isFinancial && hasAny(series, ["netDebt"]) && (
          <ChartCard title="Endividamento" subtitle="Dívida líquida (R$) e dívida líquida/EBITDA (x)" source={`${src} · negativo = caixa líquido`}>
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ left: 4, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis yAxisId="l" tickFormatter={money} width={52} {...axisProps} />
                <YAxis yAxisId="r" orientation="right" tickFormatter={(v: number) => `${v.toFixed(1)}x`} width={40} {...axisProps} />
                <Tooltip content={<TooltipBox format={(v, k) => (k === "netDebtEbitda" ? formatMultiple(v, 2) : formatCompactNumber(v, 2))} />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine yAxisId="l" y={0} stroke={C.axis} strokeOpacity={0.4} />
                <Bar yAxisId="l" dataKey="netDebt" name="Dívida líquida" fill={C.c4} radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Line yAxisId="r" dataKey="netDebtEbitda" name="DL/EBITDA" stroke={C.c3} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {hasAny(series, ["operatingCashFlow", "fcf"]) && (
          <ChartCard title="Fluxo de caixa" subtitle="Caixa operacional, capex e fluxo de caixa livre (R$)" source={`${src} · capex estimado pelas linhas de imobilizado/intangível da DFC`}>
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ left: 4, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis tickFormatter={money} width={52} {...axisProps} />
                <Tooltip content={<TooltipBox format={(v) => formatCompactNumber(v, 2)} />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke={C.axis} strokeOpacity={0.4} />
                <Bar dataKey="operatingCashFlow" name="Caixa operacional" fill={C.c1} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar dataKey="capex" name="Capex" fill={C.c4} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Line dataKey="fcf" name="FCL" stroke={C.c2} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <DividendsChart data={data} />
        <PriceChart data={data} />
      </div>
    </div>
  );
}

function DividendsChart({ data }: { data: CompanyPageData }) {
  const rows = data.dividendsByYear;
  const perShare = rows.some((r) => r.perShare !== null && r.perShare > 0);
  const paid = rows.some((r) => r.paid !== null);
  if (!perShare && !paid) {
    return (
      <ChartCard title="Dividendos" source="Fontes: mercado (por ação) · CVM (pagos, DFC)">
        <EmptyState title="Sem dados de dividendos" description="Nem proventos por ação (brapi) nem dividendos pagos na DFC estão disponíveis." className="h-full" />
      </ChartCard>
    );
  }
  return (
    <ChartCard
      title="Dividendos"
      subtitle={perShare ? `Proventos por ação de ${data.ticker} por ano (data ex), R$` : "Dividendos e JCP pagos no ano (DFC), R$"}
      source={perShare ? `Fonte: ${data.historySource ?? "mercado"} — proventos em dinheiro por data ex` : "Fonte: CVM — DFC (valor pago no ano, pode se referir a lucros anteriores)."}
    >
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ left: 4, right: 4, top: 4 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="year" {...axisProps} />
          <YAxis tickFormatter={perShare ? (v: number) => v.toFixed(2).replace(".", ",") : money} width={52} {...axisProps} />
          <Tooltip content={<TooltipBox format={(v) => (perShare ? formatCurrency(v) : formatCompactNumber(v, 2))} />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          <Bar dataKey={perShare ? "perShare" : "paid"} name={perShare ? "Por ação" : "Pagos"} fill={C.c2} radius={[3, 3, 0, 0]} maxBarSize={28} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function PriceChart({ data }: { data: CompanyPageData }) {
  const h = data.priceHistory;
  if (h.length < 30) {
    return (
      <ChartCard title={`Cotação ${data.ticker}`} source="Fonte: Yahoo Finance">
        <EmptyState
          title="Histórico de preços indisponível"
          description="A fonte de cotações não retornou o histórico deste ticker."
          className="h-full"
        />
      </ChartCard>
    );
  }
  const first = h[0];
  const last = h.at(-1)!;
  const up = last.close >= first.close;
  return (
    <ChartCard
      title={`Cotação ${data.ticker}`}
      subtitle={`Fechamento semanal, ${formatDate(first.date)} a ${formatDate(last.date)} (não ajustado por proventos)`}
      source="Fonte: Yahoo Finance"
    >
      <ResponsiveContainer>
        <AreaChart data={h} margin={{ left: 4, right: 4, top: 4 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={up ? C.pos : C.neg} stopOpacity={0.25} />
              <stop offset="100%" stopColor={up ? C.pos : C.neg} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(0, 4)} minTickGap={40} {...axisProps} />
          <YAxis tickFormatter={(v: number) => v.toFixed(0)} width={40} domain={["auto", "auto"]} {...axisProps} />
          <Tooltip content={<TooltipBox format={(v) => formatCurrency(v)} />} labelFormatter={(d) => formatDate(String(d))} />
          <Area dataKey="close" name="Fechamento" stroke={up ? C.pos : C.neg} strokeWidth={1.5} fill="url(#priceFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

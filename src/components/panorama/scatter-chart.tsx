"use client";

import { useRouter } from "next/navigation";
import { CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { MarketRow } from "@/analytics/market-overview";
import { formatMultiple, formatPercent } from "@/lib/format";

const PL_MAX = 40;
const ROE_MIN = -0.2;
const ROE_MAX = 0.6;

type Point = Pick<MarketRow, "ticker" | "sector" | "pl" | "roe">;

/** Empresa simulada: onde está hoje e para onde vai com o lucro estimado. */
export interface SimulatedPoint {
  ticker: string;
  pl: number | null;
  roe: number | null;
  plForward: number | null;
  roeForward: number | null;
}

const inRange = (pl: number | null, roe: number | null) => pl !== null && pl > 0 && pl <= PL_MAX && roe !== null && roe >= ROE_MIN && roe <= ROE_MAX;

function PointTip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  const d = payload?.[0]?.payload as Point | undefined;
  if (!active || !d) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="num font-semibold">{d.ticker}</p>
      <p className="max-w-52 truncate text-muted-foreground">{d.sector}</p>
      <p className="num mt-1">P/L {formatMultiple(d.pl, 1)} · ROE {formatPercent(d.roe)}</p>
    </div>
  );
}

export function PanoramaScatter({ rows, selic, simulated }: { rows: MarketRow[]; selic: number | null; simulated?: SimulatedPoint[] }) {
  const router = useRouter();
  const pts = rows.filter((r) => inRange(r.pl, r.roe));
  const above = pts.filter((r) => selic !== null && r.roe! > selic);
  const below = pts.filter((r) => selic === null || r.roe! <= selic);
  const open = (p: unknown) => {
    const ticker = (p as { payload?: Point } | undefined)?.payload?.ticker;
    if (ticker) router.push(`/empresa/${ticker}`);
  };

  const simulating = simulated !== undefined;
  const moves = (simulated ?? []).filter((s) => inRange(s.pl, s.roe) && inRange(s.plForward, s.roeForward));
  const today: Point[] = (simulated ?? []).filter((s) => inRange(s.pl, s.roe)).map((s) => ({ ticker: s.ticker, sector: "Hoje", pl: s.pl, roe: s.roe }));
  const forward: Point[] = (simulated ?? []).filter((s) => inRange(s.plForward, s.roeForward)).map((s) => ({ ticker: s.ticker, sector: "Com a sua estimativa", pl: s.plForward, roe: s.roeForward }));

  return (
    <div className="h-80">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 14, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--border)" />
          <XAxis type="number" dataKey="pl" name="P/L" domain={[0, PL_MAX]} ticks={[0, 10, 20, 30, 40]} tickFormatter={(v: number) => `${v}x`} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
          <YAxis type="number" dataKey="roe" name="ROE" domain={[ROE_MIN, ROE_MAX]} ticks={[-0.2, 0, 0.2, 0.4, 0.6]} tickFormatter={(v: number) => formatPercent(v, 0)} width={46} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
          <ZAxis range={[36, 36]} />
          {selic !== null && <ReferenceLine y={selic} stroke="var(--warning)" strokeDasharray="4 3" label={{ value: `Selic ${formatPercent(selic, 2)}`, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} />}
          {moves.map((s) => (
            <ReferenceLine key={s.ticker} segment={[{ x: s.pl!, y: s.roe! }, { x: s.plForward!, y: s.roeForward! }]} stroke="var(--foreground)" strokeOpacity={0.6} />
          ))}
          <Tooltip content={<PointTip />} cursor={false} isAnimationActive={false} />
          {simulating ? (
            <Scatter data={pts} fill="var(--muted-foreground)" fillOpacity={0.22} isAnimationActive={false} />
          ) : (
            <>
              <Scatter data={below} fill="var(--muted-foreground)" fillOpacity={0.45} isAnimationActive={false} onClick={open} cursor="pointer" />
              <Scatter data={above} fill="var(--chart-1)" fillOpacity={0.85} isAnimationActive={false} onClick={open} cursor="pointer" />
            </>
          )}
          {simulating && <Scatter data={today} fill="var(--card)" stroke="var(--foreground)" strokeWidth={1.5} isAnimationActive={false} />}
          {simulating && (
            <Scatter data={forward} fill="var(--chart-1)" isAnimationActive={false}>
              <LabelList dataKey="ticker" position="top" fontSize={11} fill="var(--foreground)" />
            </Scatter>
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

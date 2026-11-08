import { formatDate, formatPercent } from "@/lib/format";
import type { MacroValue } from "@/server/macro";

/** Faixa com Selic, CDI e IPCA — cada valor com a data de referência. */
export function MacroStrip({ values }: { values: MacroValue[] }) {
  if (values.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {values.map((v) => (
        <div key={v.key} className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{v.label}</p>
          <p className="num mt-1 text-xl font-semibold">{formatPercent(v.value, 2)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {v.source} · {formatDate(v.date)}
          </p>
        </div>
      ))}
    </div>
  );
}

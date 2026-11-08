import Link from "next/link";
import { EmptyState } from "@/components/common/states";
import type { PeerRow } from "@/data/company-data";
import { formatCompactCurrency, formatMultiple, formatPercent, MISSING } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLS: Array<{ key: keyof PeerRow; label: string; fmt: (v: number | null) => string; better?: "low" | "high" }> = [
  { key: "marketCap", label: "Valor de mercado", fmt: (v) => formatCompactCurrency(v, 1) },
  { key: "pl", label: "P/L", fmt: (v) => formatMultiple(v, 1), better: "low" },
  { key: "pvp", label: "P/VP", fmt: (v) => formatMultiple(v, 2), better: "low" },
  { key: "evEbitda", label: "EV/EBITDA", fmt: (v) => formatMultiple(v, 1), better: "low" },
  { key: "roe", label: "ROE", fmt: (v) => formatPercent(v), better: "high" },
  { key: "netMargin", label: "Margem líq.", fmt: (v) => formatPercent(v), better: "high" },
  { key: "dy", label: "DY", fmt: (v) => formatPercent(v), better: "high" },
  { key: "netDebtEbitda", label: "DL/EBITDA", fmt: (v) => formatMultiple(v, 1), better: "low" },
];

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function PeersTable({ peers, current, sector }: { peers: PeerRow[]; current: string; sector: string }) {
  if (peers.length <= 1) {
    return <EmptyState title="Sem pares com cotação neste setor" description={`Nenhuma outra empresa listada em “${sector}” tem cotação e demonstrações no banco local.`} />;
  }
  // P/L e EV/EBITDA negativos não entram na mediana (não têm significado)
  const medians = Object.fromEntries(
    COLS.map((c) => [c.key, median(peers.map((p) => p[c.key] as number | null).filter((v): v is number => v !== null && (c.better !== "low" || c.key === "netDebtEbitda" || v > 0)))]),
  );
  const self = peers.find((p) => p.ticker === current);

  return (
    <div className="grid gap-2">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="sticky left-0 bg-muted/90 px-3 py-2 text-left font-medium">Empresa</th>
              {COLS.map((c) => (
                <th key={c.key} scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {peers.map((p) => (
              <tr key={p.ticker} className={cn("border-t", p.ticker === current && "bg-primary/5")}>
                <th scope="row" className={cn("sticky left-0 px-3 py-2 text-left font-normal", p.ticker === current ? "bg-[color-mix(in_oklch,var(--card),var(--primary)_6%)]" : "bg-card")}>
                  <Link href={`/empresa/${p.ticker}`} className="num font-semibold hover:underline">{p.ticker}</Link>
                  <span className="block max-w-48 truncate text-xs text-muted-foreground">{p.name}</span>
                </th>
                {COLS.map((c) => {
                  const v = p[c.key] as number | null;
                  return (
                    <td key={c.key} className={cn("num px-3 py-2 text-right", v === null && "text-muted-foreground")}>{v === null ? MISSING : c.fmt(v)}</td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t bg-muted/40 text-xs">
              <th scope="row" className="sticky left-0 bg-muted/90 px-3 py-2 text-left font-medium">Mediana do grupo</th>
              {COLS.map((c) => (
                <td key={c.key} className="num px-3 py-2 text-right">{c.fmt(medians[c.key])}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Setor “{sector}” (subsetor B3 via brapi.dev), até 10 maiores por valor de mercado
        {self ? "" : "; a empresa atual não tem cotação e não aparece na lista"}. Indicadores calculados com os dados da CVM e
        cotações do último pregão. Múltiplos negativos ficam fora da mediana.
      </p>
    </div>
  );
}

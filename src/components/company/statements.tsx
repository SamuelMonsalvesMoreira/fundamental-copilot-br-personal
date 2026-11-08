"use client";

import { useState } from "react";
import { EmptyState } from "@/components/common/states";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MISSING } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StatementTable } from "@/server/company";

const LABELS: Record<StatementTable["statement"], string> = {
  DRE: "Resultado (DRE)",
  BPA: "Ativo",
  BPP: "Passivo e PL",
  DFC: "Fluxo de caixa",
};

const mi = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
/** Valores em R$ milhões, negativos entre parênteses (padrão contábil). */
const fmtMi = (v: number | null) => {
  if (v === null) return MISSING;
  const x = v / 1e6;
  return x < 0 ? `(${mi.format(Math.abs(x))})` : mi.format(x);
};

export function Statements({ tables, cvmCode }: { tables: StatementTable[]; cvmCode: string }) {
  const [sel, setSel] = useState<StatementTable["statement"]>(tables[0]?.statement ?? "DRE");
  const table = tables.find((t) => t.statement === sel);

  if (tables.length === 0) {
    return <EmptyState title="Demonstrações não disponíveis" description="Não há DFP desta companhia no banco local." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup value={[sel]} onValueChange={(v: string[]) => v[0] && setSel(v[0] as StatementTable["statement"])} variant="outline" size="sm" aria-label="Demonstração">
          {tables.map((t) => (
            <ToggleGroupItem key={t.statement} value={t.statement}>
              {LABELS[t.statement]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">R$ milhões · consolidado quando disponível</p>
      </div>

      {table && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-56 bg-muted/90 px-3 py-2 text-left font-medium sm:min-w-80">
                  Conta
                </th>
                {table.years.map((y) => (
                  <th key={y} scope="col" className="num px-3 py-2 text-right font-medium">
                    {y.slice(0, 4)}
                    {y.slice(5) !== "12-31" && <span className="block text-[10px] opacity-70">até {y.slice(8, 10)}/{y.slice(5, 7)}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r.code} className={cn("border-t", r.depth === 0 && "bg-muted/40 font-semibold", r.depth === 1 && "font-medium")}>
                  <th scope="row" className="sticky left-0 min-w-56 bg-card px-3 py-1.5 text-left leading-snug font-[inherit] sm:min-w-80" style={{ paddingLeft: `${0.75 + r.depth * 0.9}rem` }}>
                    <span className="mr-2 font-mono text-[10px] text-muted-foreground">{r.code}</span>
                    {r.name}
                  </th>
                  {r.values.map((v, i) => (
                    <td key={i} className={cn("num px-3 py-1.5 text-right whitespace-nowrap", v !== null && v < 0 && "text-negative", v === null && "text-muted-foreground")}>
                      {fmtMi(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Fonte: CVM — DFP (Demonstrações Financeiras Padronizadas), versão mais recente de cada ano, como publicada pela
        companhia (código CVM {cvmCode}). Contas zeradas em todos os anos foram ocultadas.
      </p>
    </div>
  );
}

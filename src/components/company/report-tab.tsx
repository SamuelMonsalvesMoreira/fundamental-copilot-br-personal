"use client";

import { useState } from "react";
import { ReportPanel } from "@/components/copilot/report-panel";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CompanyPageData } from "@/server/company";
import type { ProjectionContext } from "@/server/projections";
import type { SavedReport } from "@/server/reports";
import { AutoReport } from "./auto-report";

/** Relatório automático (grátis) e, se houver chave, a versão com IA. */
export function ReportTab({
  data,
  ctx,
  aiEnabled,
  aiReport,
  aiModel,
}: {
  data: CompanyPageData;
  ctx: ProjectionContext;
  aiEnabled: boolean;
  aiReport: SavedReport | null;
  aiModel: string;
}) {
  const [mode, setMode] = useState<"auto" | "ia">("auto");
  if (!aiEnabled) return <AutoReport data={data} ctx={ctx} />;
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="print:hidden">
        <ToggleGroup value={[mode]} onValueChange={(v: string[]) => v[0] && setMode(v[0] as "auto" | "ia")} variant="outline" size="sm" aria-label="Tipo de relatório">
          <ToggleGroupItem value="auto">Automático (grátis)</ToggleGroupItem>
          <ToggleGroupItem value="ia">Com IA (pago por uso)</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {mode === "auto" ? <AutoReport data={data} ctx={ctx} /> : <ReportPanel ticker={data.ticker} report={aiReport} enabled model={aiModel} />}
    </div>
  );
}

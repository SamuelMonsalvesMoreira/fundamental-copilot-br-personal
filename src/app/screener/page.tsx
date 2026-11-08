import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { ScreenerClient } from "@/components/screener/screener-client";
import { Skeleton } from "@/components/ui/skeleton";
import { getScreenerRows } from "@/server/screener";

export const metadata: Metadata = { title: "Screener" };

export default function ScreenerPage() {
  return (
    <>
      <PageHeader
        title="Screener"
        description="Filtre as ações da B3 pelos indicadores. Percentuais em % (digite 15 para 15%), valores em R$ milhões. Os filtros ficam no endereço da página, para salvar ou compartilhar."
      />
      <Suspense fallback={<Skeleton className="h-[520px]" />}>
        <Screener />
      </Suspense>
    </>
  );
}

async function Screener() {
  await connection();
  const rows = getScreenerRows();
  if (rows.length === 0) {
    return <EmptyState title="Sem dados para filtrar" description="Rode as coletas (npm run ingest:cvm e npm run ingest:market) para calcular os indicadores." />;
  }
  const sectors = [...new Set(rows.map((r) => r.sector))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const quoteDate = rows.reduce<string | null>((m, r) => (r.priceDate && (!m || r.priceDate > m) ? r.priceDate : m), null);
  return <ScreenerClient rows={rows} sectors={sectors} quoteDate={quoteDate} />;
}

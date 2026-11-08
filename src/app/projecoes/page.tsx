import { notFound } from "next/navigation";
import { isDemo } from "@/lib/demo";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { FlaskConicalIcon } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { ProjectionSearch } from "@/components/company/projection-search";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactCurrency, formatCurrency, formatDateTime, formatPercent, formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listSavedProjections } from "@/server/projections";

export const metadata: Metadata = { title: "Projeções" };

export default function ProjecoesPage() {
  if (isDemo) notFound();
  return (
    <>
      <PageHeader
        title="Projeções"
        description="Suas estimativas de lucro e dividendos por empresa, recalculadas com o preço e o lucro mais recentes."
        actions={<ProjectionSearch />}
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Saved />
      </Suspense>
    </>
  );
}

async function Saved() {
  await connection();
  const items = await listSavedProjections();
  if (items.length === 0) {
    return (
      <EmptyState
        icon={FlaskConicalIcon}
        title="Nenhuma projeção salva"
        description={
          <>
            Busque uma empresa acima, ajuste as premissas na aba Projeções e salve. Por exemplo:{" "}
            <Link className="underline" href="/empresa/TAEE11#projecoes">TAEE11</Link> ou <Link className="underline" href="/empresa/WEGE3#projecoes">WEGE3</Link>.
          </>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">Empresa</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Preço</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Crescimento</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Payout</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Lucro +1 ano</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Div./ação +1 ano</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">DY projetado</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Preço implícito</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Retorno a.a.</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Salva em</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const first = p.result.rows[0];
              return (
                <tr key={p.ticker} className="border-t hover:bg-muted/40">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <Link href={`/empresa/${p.ticker}#projecoes`} className="num font-semibold hover:underline">{p.ticker}</Link>
                    <span className="block max-w-48 truncate text-xs text-muted-foreground">{p.name}</span>
                  </th>
                  <td className="num px-3 py-2 text-right">{formatCurrency(p.price)}</td>
                  <td className="num px-3 py-2 text-right">{formatPercent(p.assumptions.growth)}</td>
                  <td className="num px-3 py-2 text-right">{formatPercent(p.assumptions.payout, 0)}</td>
                  <td className="num px-3 py-2 text-right">{formatCompactCurrency(first?.netIncome, 1)}</td>
                  <td className="num px-3 py-2 text-right font-semibold">{formatCurrency(first?.dps)}</td>
                  <td className="num px-3 py-2 text-right">{formatPercent(first?.yieldOnPrice)}</td>
                  <td className="num px-3 py-2 text-right">{formatCurrency(p.result.exitPrice)}</td>
                  <td className={cn("num px-3 py-2 text-right", (p.result.annualizedReturn ?? 0) > 0 && "text-positive", (p.result.annualizedReturn ?? 0) < 0 && "text-negative")}>
                    {formatSignedPercent(p.result.annualizedReturn, 1)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">{formatDateTime(p.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Valores futuros são projeções suas, a partir das premissas salvas; não são dados oficiais, previsão nem recomendação de investimento.
      </p>
    </div>
  );
}

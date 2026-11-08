import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { MacroStrip } from "@/components/common/macro-strip";
import { PageHeader } from "@/components/common/page-header";
import { SourceNote } from "@/components/common/source-note";
import { EmptyState } from "@/components/common/states";
import { CompaniesTable } from "@/components/panorama/companies-table";
import { PanoramaScatter } from "@/components/panorama/scatter-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactCurrency, formatMultiple, formatPercent } from "@/lib/format";
import { getPanorama } from "@/server/panorama";

export const metadata: Metadata = { title: "Panorama" };

export default function PanoramaPage() {
  return (
    <>
      <PageHeader title="Panorama" description="Como está o mercado, com os dados mais recentes do banco local." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

async function Content() {
  await connection();
  const { overview: o, macro, selic } = getPanorama();
  if (o.all === 0) {
    return <EmptyState title="Ainda sem dados de mercado" description="Rode npm run setup para fazer a primeira coleta." />;
  }
  const maxSector = o.sectors[0]?.marketCap ?? 1;

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="grid gap-2">
        {selic !== null && o.aboveSelic !== null && (
          <p className="text-base">
            Com a Selic em <strong className="num font-semibold">{formatPercent(selic, 2)}</strong>,{" "}
            <strong className="num font-semibold">{o.aboveSelic}</strong> das <strong className="num font-semibold">{o.liquid.length}</strong> empresas líquidas têm ROE acima dela.
          </p>
        )}
        <SourceNote
          sources={[
            { source: "CVM (balanços)", asOf: o.financialsEnd },
            { source: "brapi.dev e Yahoo Finance (preços)", asOf: o.priceDate },
          ]}
        />
      </div>

      <MacroStrip values={macro} />

      <section aria-label="Números principais" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Valor de mercado somado" value={formatCompactCurrency(o.totalMarketCap, 1)} />
        <Tile label="P/L mediano" value={formatMultiple(o.medianPl, 1)} />
        <Tile label="ROE mediano" value={formatPercent(o.medianRoe)} />
        <Tile label="Dividend yield mediano (12m)" value={formatPercent(o.medianDy)} />
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="min-w-0 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium">Preço e rentabilidade</h2>
          <p className="mb-3 text-xs text-muted-foreground">Cada ponto é uma empresa líquida com lucro: P/L no eixo horizontal, ROE no vertical. Em azul, ROE acima da Selic. Clique para abrir.</p>
          <PanoramaScatter rows={o.liquid} selic={selic} />
        </section>

        <section className="min-w-0 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium">Maiores setores por valor de mercado</h2>
          <p className="mb-3 text-xs text-muted-foreground">Dez maiores, com o ROE mediano das empresas de cada setor.</p>
          <ul className="grid gap-2.5">
            {o.sectors.map((s) => (
              <li key={s.sector} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                <span className="truncate" title={s.sector}>{s.sector}</span>
                <span className="h-4"><span className="block h-full rounded-sm bg-chart-1" style={{ width: `${(100 * s.marketCap) / maxSector}%` }} /></span>
                <span className="num text-muted-foreground">{formatCompactCurrency(s.marketCap, 1)} · ROE {formatPercent(s.medianRoe, 0)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="grid grid-cols-1 gap-2">
        <h2 className="text-sm font-medium">Empresas líquidas</h2>
        <CompaniesTable rows={o.liquid} selic={selic} />
      </section>

      <p className="text-xs text-muted-foreground">
        Empresas líquidas negociaram ao menos {formatCompactCurrency(o.minLiquidity, 0)} no último pregão; medianas, gráfico e tabela consideram só esse grupo, e o valor somado considera todas as {o.all} com cotação.
        P/L e DY medianos usam apenas valores positivos. O gráfico mostra P/L até 40x e ROE de −20% a 60%. Não é recomendação de investimento.
      </p>
    </div>
  );
}

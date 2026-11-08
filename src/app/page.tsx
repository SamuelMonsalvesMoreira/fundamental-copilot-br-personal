import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { MacroStrip } from "@/components/common/macro-strip";
import { EmptyState } from "@/components/common/states";
import { TickerSearch } from "@/components/search/ticker-search";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactCurrency, formatCurrency, formatDate, formatMultiple, formatPercent, formatSignedPercent, trendOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { topCompanies } from "@/server/company";
import { getMarketSummary } from "@/server/data-status";
import { getMacroSnapshot } from "@/server/macro";

const SUGGESTIONS = ["PETR4", "ITUB4", "WEGE3", "VALE3", "BBAS3", "TAEE11"];

export default function Home() {
  return (
    <div className="grid gap-10">
      <section className="mx-auto grid w-full max-w-2xl gap-4 pt-6 text-center sm:pt-10">
        <p className="text-sm font-medium text-primary">Análise fundamentalista · B3</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ações brasileiras pelos números publicados.</h1>
        <p className="text-muted-foreground">
          Demonstrações oficiais da CVM, macro do Banco Central e cotações do último pregão, com a fonte e a data de cada número.
        </p>
        <TickerSearch size="lg" className="mt-2 text-left" />
        <div className="flex flex-wrap justify-center gap-1.5">
          {SUGGESTIONS.map((t) => (
            <Link key={t} href={`/empresa/${t}`} className="num rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {t}
            </Link>
          ))}
        </div>
      </section>

      <Suspense fallback={<HomeSkeleton />}>
        <MarketOverview />
      </Suspense>
    </div>
  );
}

async function MarketOverview() {
  await connection();
  const macro = getMacroSnapshot();
  const market = getMarketSummary();
  const top = topCompanies(15);

  if (top.length === 0) {
    return (
      <EmptyState
        title="Banco local vazio"
        description={
          <>
            Rode <code className="font-mono">npm run ingest:cvm</code> e <code className="font-mono">npm run ingest:market</code> para baixar os dados.
          </>
        }
      />
    );
  }

  return (
    <div className="grid gap-6">
      <MacroStrip values={macro} />
      <section aria-labelledby="top-title" className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="top-title" className="text-lg font-semibold">Maiores empresas da bolsa</h2>
          <p className="text-xs text-muted-foreground">
            Cotações de {formatDate(market.latestQuoteDate)} (brapi.dev) · indicadores com dados da CVM
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Empresa</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Preço</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Dia</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Valor de mercado</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">P/L</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">ROE</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">DY</th>
              </tr>
            </thead>
            <tbody>
              {top.map((c) => {
                const t = trendOf(c.changePct);
                return (
                  <tr key={c.ticker} className="border-t transition-colors hover:bg-muted/40">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <Link href={`/empresa/${c.ticker}`} className="num font-semibold hover:underline">{c.ticker}</Link>
                      <span className="block max-w-56 truncate text-xs text-muted-foreground">{c.name} · {c.sector}</span>
                    </th>
                    <td className="num px-3 py-2 text-right">{formatCurrency(c.price)}</td>
                    <td className={cn("num px-3 py-2 text-right", t === "up" && "text-positive", t === "down" && "text-negative")}>{formatSignedPercent(c.changePct)}</td>
                    <td className="num px-3 py-2 text-right">{formatCompactCurrency(c.marketCap, 1)}</td>
                    <td className="num px-3 py-2 text-right">{formatMultiple(c.pl, 1)}</td>
                    <td className="num px-3 py-2 text-right">{formatPercent(c.roe)}</td>
                    <td className="num px-3 py-2 text-right">{formatPercent(c.dy)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

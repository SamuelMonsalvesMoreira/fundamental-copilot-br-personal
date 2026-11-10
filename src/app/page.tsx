import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { MacroStrip } from "@/components/common/macro-strip";
import { EmptyState } from "@/components/common/states";
import { TickerSearch } from "@/components/search/ticker-search";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactCurrency, formatCurrency, formatDate, formatMultiple, formatPercent, formatSignedPercent, trendOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HeroSimulator } from "@/components/home/hero-simulator";
import { topCompanies } from "@/server/company";
import { getPanorama } from "@/server/panorama";
import { getMarketSummary } from "@/server/data-status";
import { getMacroSnapshot } from "@/server/macro";

const HERO_TICKERS = ["WEGE3", "ITUB4", "PETR4", "VALE3", "TAEE11"];
const REPO_URL = "https://github.com/SamuelMonsalvesMoreira/fundamental-copilot-br-personal";

export default function Home() {
  return (
    <div className="grid gap-14">
      <div className="grid gap-8 pt-4 sm:pt-8">
        <h1 className="text-sm font-medium text-primary">Análise fundamentalista de ações da B3, com dados oficiais e cenários de lucro</h1>
        <Suspense fallback={<Skeleton className="h-40 max-w-4xl" />}>
          <Hero />
        </Suspense>
        <TickerSearch size="lg" className="max-w-2xl" />
      </div>

      <Suspense fallback={<Skeleton className="h-48" />}>
        <StartHere />
      </Suspense>

      <Suspense fallback={<HomeSkeleton />}>
        <MarketOverview />
      </Suspense>
    </div>
  );
}

async function Hero() {
  await connection();
  const { rows, overview } = getPanorama();
  const options = HERO_TICKERS.map((t) => rows.find((r) => r.ticker === t)).filter(
    (r): r is NonNullable<typeof r> => r !== undefined && r.netIncome !== null && r.netIncome > 0 && r.pl !== null,
  );
  return <HeroSimulator options={options} dataDate={overview.priceDate} />;
}

async function StartHere() {
  await connection();
  const { overview: o, selic } = getPanorama();
  const places = [
    {
      href: "/panorama",
      title: "Panorama do mercado",
      text:
        selic !== null && o.aboveSelic !== null
          ? `${o.aboveSelic} das ${o.liquid.length} empresas líquidas têm ROE acima da Selic de ${formatPercent(selic, 2)}.`
          : "Medianas do mercado, setores e o gráfico de preço por rentabilidade.",
    },
    { href: "/empresa/WEGE3", title: "Página de uma empresa", text: "Indicadores com fórmula e fonte, 10 anos de gráficos, valuation, pares de porte parecido e relatório em PDF." },
    { href: "/screener", title: "Screener", text: `Filtre as ${o.all} empresas com cotação por P/L, ROE, dividendos e dívida.` },
    { href: "/comparar", title: "Comparador", text: "Duas a quatro empresas lado a lado, com os mesmos indicadores." },
  ];
  const steps = [
    { title: "Coleta", text: "Balanços da CVM, juros e inflação do Banco Central, preços e proventos da brapi.dev e do Yahoo Finance." },
    { title: "Cálculo", text: "Indicadores com fórmula, período e fonte. Dado ausente aparece como ausente, nunca como zero." },
    {
      title: "Publicação",
      text: `Todo dia útil, depois do fechamento, um robô atualiza e republica o site. Preços de ${formatDate(o.priceDate)}, balanços até ${formatDate(o.financialsEnd)}.`,
    },
  ];

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-16">
      <section aria-labelledby="start-title" className="grid content-start gap-3">
        <h2 id="start-title" className="text-lg font-semibold">Por onde começar</h2>
        <ul className="divide-y border-y">
          {places.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="group grid gap-0.5 py-3.5 transition-colors hover:bg-muted/40 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4 sm:px-2">
                <span className="font-medium group-hover:text-primary">{p.title}</span>
                <span className="text-sm text-muted-foreground">{p.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-title" className="grid content-start gap-3">
        <h2 id="how-title" className="text-lg font-semibold">De onde vêm os números</h2>
        <ol className="grid gap-4">
          {steps.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
              <span aria-hidden className="num flex size-7 items-center justify-center rounded-full border text-xs text-muted-foreground">{i + 1}</span>
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">
          Projeto pessoal de estudo, com código aberto no{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">GitHub</a>.
          Nada aqui é recomendação de investimento.
        </p>
      </section>
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
    <div className="grid grid-cols-1 gap-6">
      <MacroStrip values={macro} />
      <section aria-labelledby="top-title" className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="top-title" className="text-lg font-semibold">Maiores empresas da bolsa hoje</h2>
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
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

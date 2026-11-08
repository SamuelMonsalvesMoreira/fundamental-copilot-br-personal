import { notFound } from "next/navigation";
import { isDemo } from "@/lib/demo";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { StarIcon, WalletIcon } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { PositionForm, PositionsTable, WatchlistTable } from "@/components/portfolio/portfolio-client";
import { Skeleton } from "@/components/ui/skeleton";
import { getPortfolio, getWatchlist } from "@/server/portfolio";

export const metadata: Metadata = { title: "Carteira" };

export default function CarteiraPage() {
  if (isDemo) notFound();
  return (
    <>
      <PageHeader title="Carteira e watchlist" description="Empresas que você acompanha e suas posições, com cotações do último pregão." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Portfolio />
      </Suspense>
    </>
  );
}

async function Portfolio() {
  await connection();
  const watch = getWatchlist();
  const portfolio = getPortfolio();

  return (
    <div className="grid grid-cols-1 gap-8">
      <section aria-labelledby="watch-title" className="grid grid-cols-1 gap-3">
        <h2 id="watch-title" className="text-lg font-semibold">Watchlist</h2>
        {watch.length === 0 ? (
          <EmptyState
            icon={StarIcon}
            title="Nenhuma empresa na watchlist"
            description={<>Abra uma empresa (ex.: <Link className="underline" href="/empresa/WEGE3">WEGE3</Link>) e clique em “Acompanhar”.</>}
          />
        ) : (
          <WatchlistTable items={watch} />
        )}
      </section>

      <section aria-labelledby="pos-title" className="grid grid-cols-1 gap-3">
        <h2 id="pos-title" className="text-lg font-semibold">Carteira</h2>
        <PositionForm />
        {portfolio.positions.length === 0 ? (
          <EmptyState icon={WalletIcon} title="Nenhuma posição cadastrada" description="Adicione ticker, quantidade e preço médio para acompanhar valor, resultado e proventos estimados." />
        ) : (
          <PositionsTable summary={portfolio} names={portfolio.names} />
        )}
        <p className="text-xs text-muted-foreground">
          Valores com o fechamento do último pregão (brapi.dev). Proventos estimados usam o dividend yield de 12 meses de cada empresa e
          não são previsão de pagamento. Não é recomendação de investimento.
        </p>
      </section>
    </div>
  );
}

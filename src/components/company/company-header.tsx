import Link from "next/link";
import { GitCompareArrowsIcon } from "lucide-react";
import { WatchButton } from "@/components/portfolio/portfolio-client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatCurrency, formatDate, formatSignedPercent, trendOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CompanyPageData } from "@/server/company";

const LAYOUT_LABEL = { bank: "Banco", insurance: "Seguradora" } as const;

export function CompanyHeader({ data }: { data: CompanyPageData }) {
  const { meta, quote, classes, ticker } = data;
  const trend = trendOf(quote?.changePct);
  const comparePeers = [ticker, ...data.peers.filter((p) => p.ticker !== ticker).slice(0, 3).map((p) => p.ticker)];
  return (
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {meta.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meta.logo} alt="" width={44} height={44} className="size-11 shrink-0 rounded-lg border bg-white object-contain p-1" />
        ) : (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted text-xs font-semibold">{ticker.slice(0, 4)}</div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="num text-2xl font-semibold tracking-tight">{ticker}</h1>
            {meta.layout && meta.layout !== "standard" && <Badge variant="secondary">{LAYOUT_LABEL[meta.layout]}</Badge>}
          </div>
          <p className="truncate text-sm text-muted-foreground" title={meta.name}>
            {meta.tradeName ?? meta.name}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            <span>{meta.sector}</span>
            {meta.listingSegment && <span>· {meta.listingSegment}</span>}
            <span>· CNPJ {meta.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}</span>
          </p>
          {classes.length > 1 && (
            <nav aria-label="Outras classes de ação" className="mt-2 flex flex-wrap gap-1">
              {classes.map((c) => (
                <Link
                  key={c.ticker}
                  href={`/empresa/${c.ticker}`}
                  aria-current={c.ticker === ticker ? "page" : undefined}
                  className={cn(
                    "num rounded-md border px-2 py-0.5 text-xs",
                    c.ticker === ticker ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {c.ticker} <span className="opacity-60">{c.shareClass}</span>
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>

      <div className="text-left sm:text-right">
        {quote ? (
          <>
            <p className="num text-3xl font-semibold tracking-tight">{formatCurrency(quote.close)}</p>
            <p
              className={cn(
                "num text-sm font-medium",
                trend === "up" && "text-positive",
                trend === "down" && "text-negative",
                (trend === "flat" || trend === "none") && "text-muted-foreground",
              )}
            >
              {formatSignedPercent(quote.changePct)} no dia
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Fechamento de {formatDate(quote.date)} · brapi.dev
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sem cotação disponível para {ticker}.</p>
        )}
        <div className="mt-3 flex gap-2 sm:justify-end">
          <WatchButton ticker={ticker} watched={data.watched} />
          {comparePeers.length > 1 && (
            <Link href={`/comparar?t=${comparePeers.join(",")}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <GitCompareArrowsIcon /> Comparar com pares
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

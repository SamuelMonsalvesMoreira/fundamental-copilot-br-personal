import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CompanyCharts } from "@/components/company/charts";
import { CompanyHeader } from "@/components/company/company-header";
import { CompanyTabs } from "@/components/company/company-tabs";
import { IndicatorGrid } from "@/components/company/indicator-grid";
import { PeersTable } from "@/components/company/peers-table";
import { Statements } from "@/components/company/statements";
import { ValuationPanel } from "@/components/company/valuation-panel";
import { CompanyPageSkeleton } from "@/components/company/skeleton";
import { CopilotChat } from "@/components/copilot/chat";
import { ReportPanel } from "@/components/copilot/report-panel";
import { hasApiKey, REPORT_MODEL } from "@/ai/agent";
import { getLatestReport } from "@/server/reports";
import { formatCompactCurrency, formatDate } from "@/lib/format";
import { getCompanyPage, getStatements, type CompanyPageData } from "@/server/company";

export async function generateMetadata({ params }: PageProps<"/empresa/[ticker]">): Promise<Metadata> {
  const { ticker } = await params;
  return { title: ticker.toUpperCase() };
}

export default function EmpresaPage({ params }: PageProps<"/empresa/[ticker]">) {
  return (
    <Suspense fallback={<CompanyPageSkeleton />}>
      <Company params={params} />
    </Suspense>
  );
}

async function Company({ params }: { params: PageProps<"/empresa/[ticker]">["params"] }) {
  await connection();
  const { ticker } = await params;
  const data = await getCompanyPage(decodeURIComponent(ticker));
  if (!data) notFound();
  const statements = getStatements(data.ticker);
  const aiEnabled = hasApiKey();
  const isFinancial = data.meta.layout === "bank" || data.meta.layout === "insurance";

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 [&>*]:min-w-0">
      <CompanyHeader data={data} />
      <CompanyTabs
        tabs={[
          { value: "visao-geral", label: "Visão geral", content: <Overview data={data} /> },
          { value: "graficos", label: "Gráficos", content: <CompanyCharts data={data} /> },
          { value: "demonstracoes", label: "Demonstrações", content: <Statements tables={statements} cvmCode={data.meta.cvmCode} /> },
          { value: "valuation", label: "Valuation", content: <ValuationPanel v={data.valuation} ticker={data.ticker} /> },
          { value: "pares", label: "Pares", content: <PeersTable peers={data.peers} current={data.ticker} sector={data.meta.sector} /> },
          { value: "copiloto", label: "Copiloto", content: <CopilotChat ticker={data.ticker} enabled={aiEnabled} isFinancial={isFinancial} /> },
          { value: "relatorio", label: "Relatório", content: <ReportPanel ticker={data.ticker} report={getLatestReport(data.ticker)} enabled={aiEnabled} model={REPORT_MODEL()} /> },
        ]}
      />
    </div>
  );
}

function Overview({ data }: { data: CompanyPageData }) {
  const t = data.ttm;
  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-4">
        <span>
          <span className="font-medium text-foreground">Resultados: </span>
          {t ? (t.kind === "ttm" ? `últimos 12 meses até ${formatDate(t.end)} (${t.composition})` : `exercício até ${formatDate(t.end)}`) : "sem demonstrações"}
          {" · CVM"}
        </span>
        <span>
          <span className="font-medium text-foreground">Preço: </span>
          {data.quote ? `${data.ticker}, fechamento de ${formatDate(data.quote.date)} · brapi.dev` : "sem cotação"}
        </span>
        {data.marketCapNote && (
          <span>
            <span className="font-medium text-foreground">Valor de mercado: </span>
            {formatCompactCurrency(data.indicators.marketCap?.value)} ({data.marketCapNote})
          </span>
        )}
        {data.meta.shareScaleNote && data.sharesOutstanding === null && (
          <span className="text-warning">Quantidade de ações não conferida: {data.meta.shareScaleNote}. Indicadores por ação indisponíveis.</span>
        )}
      </div>

      {!t ? (
        <p className="text-sm text-muted-foreground">Esta companhia ainda não tem demonstrações financeiras no banco local.</p>
      ) : (
        <IndicatorGrid indicators={data.indicators} />
      )}

      {!data.historyStatus.tokenConfigured && (
        <p className="text-xs text-muted-foreground">
          Dividend yield calculado pelo fluxo de caixa. Com o token gratuito da brapi (BRAPI_TOKEN), passa a usar os proventos
          por ação e mostra o histórico de cotações.
        </p>
      )}
      <p className="text-xs text-muted-foreground">Toque em um indicador para ver a fórmula, os números usados, o período e a fonte.</p>
    </div>
  );
}

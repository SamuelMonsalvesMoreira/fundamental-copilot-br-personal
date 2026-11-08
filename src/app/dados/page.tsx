import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { MacroStrip } from "@/components/common/macro-strip";
import {
  getCoverageSummary,
  getLatestJobRuns,
  getMarketSummary,
  getSchemaVersion,
  getTableCounts,
} from "@/server/data-status";
import { getMacroSnapshot } from "@/server/macro";

export const metadata: Metadata = { title: "Dados e fontes" };

const TABLE_LABELS: Record<string, string> = {
  companies: "Companhias",
  tickers: "Tickers",
  filings: "Documentos DFP/ITR",
  fin_values: "Valores padronizados",
  statement_lines: "Linhas de demonstrações",
  quotes_daily: "Cotações diárias",
  dividends: "Proventos",
  macro_series: "Pontos macro",
};

export default function DadosPage() {
  return (
    <>
      <PageHeader
        title="Dados e fontes"
        description="Quando cada fonte foi coletada pela última vez, quantos registros existem no banco local e se houve erros."
      />
      <Suspense fallback={<StatusSkeleton />}>
        <DataStatus />
      </Suspense>
    </>
  );
}

async function DataStatus() {
  await connection(); // sempre ler o estado atual do banco
  const runs = getLatestJobRuns();
  const counts = getTableCounts();
  const schemaVersion = getSchemaVersion();
  const coverage = getCoverageSummary();
  const market = getMarketSummary();
  const macro = getMacroSnapshot();

  return (
    <div className="grid gap-6">
      <MacroStrip values={macro} />
      {market.latestQuoteDate && (
        <p className="text-sm text-muted-foreground">
          Cotações de <span className="num text-foreground">{formatNumber(market.quotedTickers, 0)}</span> ações no
          pregão de <span className="num text-foreground">{formatDate(market.latestQuoteDate)}</span> (brapi.dev).
          Quantidade de ações conferida contra o valor de mercado em{" "}
          <span className="num text-foreground">{market.sharesVerified}</span> companhias (
          {market.sharesInThousands} informam em milhares na CVM);{" "}
          <span className="num text-foreground">{market.sharesUnverified}</span> não puderam ser conferidas e ficam sem
          indicadores por ação.
        </p>
      )}
      {!market.tokenConfigured && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <p className="font-medium">Token da brapi não configurado</p>
          <p className="mt-1 text-muted-foreground">
            As cotações do dia funcionam sem token, mas o histórico de preços e os proventos de cada empresa precisam
            do token gratuito. Crie em brapi.dev, coloque em <code className="font-mono">BRAPI_TOKEN</code> no arquivo{" "}
            <code className="font-mono">.env.local</code> e reinicie o app.
          </p>
        </div>
      )}
      {coverage.latestDfp && (
        <p className="text-sm text-muted-foreground">
          Demonstrações da CVM de <span className="num text-foreground">{formatDate(coverage.oldestDfp)}</span> até{" "}
          <span className="num text-foreground">{formatDate(coverage.latestItr ?? coverage.latestDfp)}</span> (último
          balanço anual: <span className="num text-foreground">{formatDate(coverage.latestDfp)}</span>) para{" "}
          <span className="num text-foreground">{formatNumber(coverage.companiesWithFinancials, 0)}</span> companhias.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(counts).map(([table, n]) => (
          <Card key={table} size="sm">
            <CardHeader>
              <CardTitle className="text-xs font-normal text-muted-foreground">{TABLE_LABELS[table]}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="num text-2xl font-semibold">{formatNumber(n, 0)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coletas</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <EmptyState
              title="Nenhuma coleta executada ainda"
              description={<>Rode <code className="font-mono">npm run ingest:cvm</code> para baixar as demonstrações da CVM.</>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coleta</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Registros</TableHead>
                  <TableHead>Dados de</TableHead>
                  <TableHead>Verificada em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.job}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{r.job}</TableCell>
                    <TableCell>
                      {r.sourceUrl ? (
                        <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                          {r.source}
                        </a>
                      ) : (
                        r.source
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                      {r.message && <p className="mt-1 text-xs text-muted-foreground">{r.message}</p>}
                    </TableCell>
                    <TableCell className="num text-right">{formatNumber(r.rows, 0)}</TableCell>
                    <TableCell className="num">{formatDate(r.dataAsOf)}</TableCell>
                    <TableCell className="num">{formatDateTime(r.checkedAt ?? r.finishedAt ?? r.startedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Versão do esquema do banco: {schemaVersion}</p>
    </div>
  );
}

const STATUS: Record<string, { label: string; variant: "secondary" | "destructive" | "outline" }> = {
  ok: { label: "Atualizado", variant: "secondary" },
  skipped: { label: "Não publicado", variant: "outline" },
  error: { label: "Erro", variant: "destructive" },
  running: { label: "Em andamento", variant: "outline" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.running;
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function StatusSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

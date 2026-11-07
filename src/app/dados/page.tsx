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
import { getLatestJobRuns, getSchemaVersion, getTableCounts } from "@/server/data-status";

export const metadata: Metadata = { title: "Dados e fontes" };

const TABLE_LABELS: Record<string, string> = {
  companies: "Companhias",
  tickers: "Tickers",
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

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
              description="O banco local foi criado, mas ainda está vazio. A coleta da CVM, do Banco Central e das cotações será adicionada nas próximas etapas."
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
                  <TableHead>Executada em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.job}>
                    <TableCell className="font-mono text-xs">{r.job}</TableCell>
                    <TableCell>{r.source}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "ok" ? "secondary" : r.status === "error" ? "destructive" : "outline"}>
                        {r.status === "ok" ? "OK" : r.status === "error" ? "Erro" : "Em andamento"}
                      </Badge>
                      {r.message && <p className="mt-1 text-xs text-muted-foreground">{r.message}</p>}
                    </TableCell>
                    <TableCell className="num text-right">{formatNumber(r.rows, 0)}</TableCell>
                    <TableCell className="num">{formatDate(r.dataAsOf)}</TableCell>
                    <TableCell className="num">{formatDateTime(r.finishedAt ?? r.startedAt)}</TableCell>
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

function StatusSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

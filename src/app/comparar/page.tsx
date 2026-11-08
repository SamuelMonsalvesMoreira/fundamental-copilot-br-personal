import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/common/page-header";
import { CompareView } from "@/components/compare/compare-view";
import { Skeleton } from "@/components/ui/skeleton";
import { getCompareData, parseTickers } from "@/server/compare";

export const metadata: Metadata = { title: "Comparar empresas" };

export default function CompararPage({ searchParams }: PageProps<"/comparar">) {
  return (
    <>
      <PageHeader title="Comparar empresas" description="De 2 a 4 empresas lado a lado, com os mesmos critérios de cálculo." />
      <Suspense fallback={<Skeleton className="h-[480px]" />}>
        <Compare searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Compare({ searchParams }: { searchParams: PageProps<"/comparar">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { items, unknown } = getCompareData(parseTickers(sp.t));
  return <CompareView items={items} unknown={unknown} />;
}

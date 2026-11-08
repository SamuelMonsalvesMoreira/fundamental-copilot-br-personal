"use client";

import { useRouter } from "next/navigation";
import { TickerSearch } from "@/components/search/ticker-search";

/** Busca que abre direto a aba Projeções da empresa escolhida. */
export function ProjectionSearch() {
  const router = useRouter();
  return <TickerSearch className="w-64" placeholder="Projetar uma empresa…" onSelect={(t) => router.push(`/empresa/${t}#projecoes`)} />;
}

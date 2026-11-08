"use server";

import { refresh } from "next/cache";
import { sqlite } from "@/db/client";

const clean = (t: string) => t.trim().toUpperCase();
const cnpjOf = (ticker: string) => (sqlite.prepare(`SELECT cnpj FROM tickers WHERE ticker = ?`).get(ticker) as { cnpj: string } | undefined)?.cnpj;

/** Define o grupo de pares da empresa. Lista vazia volta à seleção automática. */
export async function savePeers(ticker: string, peers: string[]): Promise<{ ok: boolean; error?: string }> {
  const cnpj = cnpjOf(clean(ticker));
  if (!cnpj) return { ok: false, error: "Ticker não encontrado." };
  const chosen = [...new Set(peers.map(clean))].filter((t) => {
    const c = cnpjOf(t);
    return c !== undefined && c !== cnpj;
  });
  if (chosen.length > 12) return { ok: false, error: "Escolha no máximo 12 empresas." };
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    sqlite.prepare(`DELETE FROM peer_choices WHERE cnpj = ?`).run(cnpj);
    const ins = sqlite.prepare(`INSERT INTO peer_choices (cnpj, peer_ticker, added_at) VALUES (?, ?, ?)`);
    for (const t of chosen) ins.run(cnpj, t, now);
  })();
  refresh();
  return { ok: true };
}

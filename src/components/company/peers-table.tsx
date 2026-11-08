"use client";

import Link from "next/link";
import { useTransition } from "react";
import { RotateCcwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { peerMedians, type OwnHistory, type PeerGroup, type PeerQuality, type PeerRow } from "@/analytics/peers";
import { EmptyState } from "@/components/common/states";
import { TickerSearch } from "@/components/search/ticker-search";
import { Button } from "@/components/ui/button";
import { formatCompactCurrency, formatCurrency, formatMultiple, formatPercent, MISSING } from "@/lib/format";
import { cn } from "@/lib/utils";
import { savePeers } from "@/server/peer-actions";

const COLS: Array<{ key: "marketCap" | "pl" | "pvp" | "evEbitda" | "roe" | "netMargin" | "dy" | "netDebtEbitda"; label: string; fmt: (v: number | null) => string }> = [
  { key: "marketCap", label: "Valor de mercado", fmt: (v) => formatCompactCurrency(v, 1) },
  { key: "pl", label: "P/L", fmt: (v) => formatMultiple(v, 1) },
  { key: "pvp", label: "P/VP", fmt: (v) => formatMultiple(v, 2) },
  { key: "evEbitda", label: "EV/EBITDA", fmt: (v) => formatMultiple(v, 1) },
  { key: "roe", label: "ROE", fmt: (v) => formatPercent(v) },
  { key: "netMargin", label: "Margem líq.", fmt: (v) => formatPercent(v) },
  { key: "dy", label: "DY", fmt: (v) => formatPercent(v) },
  { key: "netDebtEbitda", label: "DL/EBITDA", fmt: (v) => formatMultiple(v, 1) },
];

const QUALITY: Record<PeerQuality, { label: string; cls: string }> = {
  boa: { label: "Comparação boa", cls: "border-positive/40 bg-positive/10 text-positive" },
  ampla: { label: "Setor ampliado", cls: "border-warning/40 bg-warning/10" },
  fraca: { label: "Comparação fraca", cls: "border-negative/40 bg-negative/10 text-negative" },
  escolhida: { label: "Escolhidos por você", cls: "bg-accent text-accent-foreground" },
};

export function PeersTable({ group, current, sector, history }: { group: PeerGroup; current: string; sector: string; history: OwnHistory | null }) {
  const [pending, start] = useTransition();
  const { peers, quality, note } = group;
  const others = peers.filter((p) => p.ticker !== current);
  const self = peers.find((p) => p.ticker === current);
  const medians = peerMedians(peers, current);
  const isCustom = quality === "escolhida";

  const save = (list: string[], done: string) =>
    start(async () => {
      const r = await savePeers(current, list);
      if (r.ok) toast.success(done);
      else toast.error(r.error ?? "Não foi possível salvar");
    });
  const names = others.map((p) => p.ticker);
  const add = (t: string) => {
    if (t === current) return;
    if (names.includes(t)) return void toast.info(`${t} já está no grupo`);
    save([...names, t], `${t} adicionada ao grupo`);
  };
  const remove = (p: PeerRow) => {
    const rest = names.filter((t) => t !== p.ticker);
    if (rest.length === 0) return void toast.info("Mantenha ao menos uma empresa ou volte à seleção automática");
    save(rest, `${p.ticker} retirada do grupo`);
  };

  return (
    <div className="grid grid-cols-1 gap-5">
      <section className="grid grid-cols-1 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn("rounded-md border px-2 py-0.5 text-xs font-medium", QUALITY[quality].cls)}>{QUALITY[quality].label}</span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="w-64 max-w-full">
              <TickerSearch onSelect={add} placeholder="Adicionar empresa ao grupo…" />
            </div>
            {isCustom && (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => save([], "Seleção automática restaurada")}>
                <RotateCcwIcon /> Voltar ao automático
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{note}</p>

        {others.length === 0 ? (
          <EmptyState title="Sem pares para comparar" description={`Nenhuma empresa de “${sector}” atende aos critérios mínimos. Você pode adicionar empresas acima.`} />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="sticky left-0 bg-muted/90 px-3 py-2 text-left font-medium">Empresa</th>
                  {COLS.map((c) => (
                    <th key={c.key} scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">{c.label}</th>
                  ))}
                  <th scope="col" className="w-9 px-1"><span className="sr-only">Retirar</span></th>
                </tr>
              </thead>
              <tbody>
                {peers.map((p) => (
                  <tr key={p.ticker} className={cn("border-t", p.ticker === current && "bg-primary/5")}>
                    <th scope="row" className={cn("sticky left-0 px-3 py-2 text-left font-normal", p.ticker === current ? "bg-[color-mix(in_oklch,var(--card),var(--primary)_6%)]" : "bg-card")}>
                      <Link href={`/empresa/${p.ticker}`} className="num font-semibold hover:underline">{p.ticker}</Link>
                      <span className="block max-w-48 truncate text-xs text-muted-foreground">{p.name}</span>
                    </th>
                    {COLS.map((c) => {
                      const v = p[c.key];
                      return <td key={c.key} className={cn("num px-3 py-2 text-right", v === null && "text-muted-foreground")}>{v === null ? MISSING : c.fmt(v)}</td>;
                    })}
                    <td className="px-1 text-center">
                      {p.ticker !== current && (
                        <Button variant="ghost" size="icon-xs" disabled={pending} onClick={() => remove(p)} aria-label={`Retirar ${p.ticker} do grupo`}>
                          <XIcon />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/40 text-xs">
                  <th scope="row" className="sticky left-0 bg-muted/90 px-3 py-2 text-left font-medium">Mediana dos pares</th>
                  {COLS.map((c) => (
                    <td key={c.key} className="num px-3 py-2 text-right">{c.fmt(medians[c.key])}</td>
                  ))}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Indicadores calculados com dados da CVM e cotações do último pregão. A mediana não inclui {current}; múltiplos negativos ficam de fora.</p>
      </section>

      {history && (
        <section className="grid grid-cols-1 gap-2">
          <h3 className="text-sm font-medium">{current} frente ao próprio histórico</h3>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Fim do ano</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Preço</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">P/L</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">P/VP</th>
                </tr>
              </thead>
              <tbody>
                {history.years.map((y) => (
                  <tr key={y.end} className="border-t">
                    <th scope="row" className="num px-3 py-2 text-left font-normal">{y.label}</th>
                    <td className="num px-3 py-2 text-right">{formatCurrency(y.price)}</td>
                    <td className={cn("num px-3 py-2 text-right", y.pl === null && "text-muted-foreground")}>{y.pl === null ? MISSING : formatMultiple(y.pl, 1)}</td>
                    <td className={cn("num px-3 py-2 text-right", y.pvp === null && "text-muted-foreground")}>{y.pvp === null ? MISSING : formatMultiple(y.pvp, 2)}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/40 text-xs">
                  <th scope="row" className="px-3 py-2 text-left font-medium">Mediana</th>
                  <td />
                  <td className="num px-3 py-2 text-right">{formatMultiple(history.medianPl, 1)}</td>
                  <td className="num px-3 py-2 text-right">{formatMultiple(history.medianPvp, 2)}</td>
                </tr>
                {self && (
                  <tr className="border-t bg-primary/5 font-medium">
                    <th scope="row" className="px-3 py-2 text-left font-medium">Hoje</th>
                    <td />
                    <td className="num px-3 py-2 text-right">{formatMultiple(self.pl, 1)}</td>
                    <td className="num px-3 py-2 text-right">{formatMultiple(self.pvp, 2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Aproximação: preço de fim de ano ajustado por desdobramentos × quantidade atual de ações ÷ lucro e patrimônio do ano (CVM). Emissões e recompras grandes distorcem os anos antigos.
          </p>
        </section>
      )}
    </div>
  );
}

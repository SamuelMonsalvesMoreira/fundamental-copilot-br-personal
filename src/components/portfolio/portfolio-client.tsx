"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { Loader2Icon, StarIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { PortfolioSummary } from "@/analytics/portfolio";
import { Button } from "@/components/ui/button";
import { formatCompactCurrency, formatCurrency, formatDate, formatMultiple, formatPercent, formatSignedPercent, MISSING, trendOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WatchItem } from "@/server/portfolio";
import { addPosition, removePosition, toggleWatchlist, type PositionFormState } from "@/server/portfolio-actions";

const trendClass = (v: number | null | undefined) => {
  const t = trendOf(v);
  return t === "up" ? "text-positive" : t === "down" ? "text-negative" : "text-muted-foreground";
};

// ─── botão de favoritar (página da empresa) ─────────────────────────────────

export function WatchButton({ ticker, watched }: { ticker: string; watched: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={watched ? "secondary" : "outline"}
      size="sm"
      disabled={pending}
      aria-pressed={watched}
      onClick={() =>
        start(async () => {
          const r = await toggleWatchlist(ticker);
          if (r.error) toast.error(r.error);
          else toast.success(r.watched ? `${ticker} adicionada à watchlist` : `${ticker} removida da watchlist`);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <StarIcon className={cn(watched && "fill-current text-warning")} />}
      {watched ? "Na watchlist" : "Acompanhar"}
    </Button>
  );
}

// ─── watchlist ───────────────────────────────────────────────────────────────

export function WatchlistTable({ items }: { items: WatchItem[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">Empresa</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Preço</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Dia</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">P/L</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">P/VP</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">ROE</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">DY</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">DL/EBITDA</th>
            <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((w) => (
            <tr key={w.ticker} className="border-t hover:bg-muted/40">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <Link href={`/empresa/${w.ticker}`} className="num font-semibold hover:underline">{w.ticker}</Link>
                <span className="block max-w-56 truncate text-xs text-muted-foreground">{w.name ?? "—"}{w.sector ? ` · ${w.sector}` : ""}</span>
              </th>
              <td className="num px-3 py-2 text-right">{formatCurrency(w.close)}</td>
              <td className={cn("num px-3 py-2 text-right", trendClass(w.changePct))}>{formatSignedPercent(w.changePct)}</td>
              <td className="num px-3 py-2 text-right">{formatMultiple(w.pl, 1)}</td>
              <td className="num px-3 py-2 text-right">{formatMultiple(w.pvp, 2)}</td>
              <td className="num px-3 py-2 text-right">{formatPercent(w.roe)}</td>
              <td className="num px-3 py-2 text-right">{formatPercent(w.dy)}</td>
              <td className="num px-3 py-2 text-right">{formatMultiple(w.netDebtEbitda, 1)}</td>
              <td className="px-2 py-2 text-right">
                <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Remover ${w.ticker} da watchlist`} onClick={() => start(() => toggleWatchlist(w.ticker).then(() => undefined))}>
                  <Trash2Icon />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── carteira ────────────────────────────────────────────────────────────────

export function PositionForm() {
  const [state, action, pending] = useActionState<PositionFormState, FormData>(addPosition, { errors: [] });
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      toast.success("Posição adicionada");
    }
  }, [state]);

  const field = "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30";
  return (
    <form ref={formRef} action={action} className="grid gap-3 rounded-xl border bg-card p-4">
      <p className="text-sm font-medium">Adicionar posição</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Ticker</span>
          <input name="ticker" required placeholder="WEGE3" autoCapitalize="characters" className={cn(field, "num uppercase")} />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Quantidade</span>
          <input name="quantity" required inputMode="numeric" placeholder="100" className={cn(field, "num")} />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Preço médio (R$)</span>
          <input name="avgPrice" required inputMode="decimal" placeholder="38,50" className={cn(field, "num")} />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Data (opcional)</span>
          <input name="openedAt" type="date" className={field} />
        </label>
        <div className="col-span-2 flex items-end sm:col-span-1">
          <Button type="submit" disabled={pending} className="w-full">
            {pending && <Loader2Icon className="animate-spin" />} Adicionar
          </Button>
        </div>
      </div>
      {state.errors.length > 0 && (
        <ul role="alert" className="text-xs text-destructive">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Os dados da carteira ficam só no banco local deste computador.</p>
    </form>
  );
}

export function PositionsTable({ summary, names }: { summary: PortfolioSummary; names: Record<string, string> }) {
  const [pending, start] = useTransition();
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Valor atual" value={formatCompactCurrency(summary.value)} />
        <Stat label="Custo" value={formatCompactCurrency(summary.cost)} />
        <Stat label="Resultado" value={`${formatCompactCurrency(summary.pnl)} (${formatSignedPercent(summary.pnlPct, 1)})`} className={trendClass(summary.pnl)} />
        <Stat label="Proventos estimados (12m)" value={formatCompactCurrency(summary.income12m)} hint="DY 12m de cada empresa × valor da posição" />
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">Ativo</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Qtd.</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Preço médio</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Cotação</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Valor</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Resultado</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Peso</th>
              <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {summary.positions.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/40">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <Link href={`/empresa/${p.ticker}`} className="num font-semibold hover:underline">{p.ticker}</Link>
                  <span className="block max-w-48 truncate text-xs text-muted-foreground">
                    {names[p.ticker] ?? ""}
                    {p.openedAt ? ` · desde ${formatDate(p.openedAt)}` : ""}
                  </span>
                </th>
                <td className="num px-3 py-2 text-right">{new Intl.NumberFormat("pt-BR").format(p.quantity)}</td>
                <td className="num px-3 py-2 text-right">{formatCurrency(p.avgPrice)}</td>
                <td className="num px-3 py-2 text-right">
                  {formatCurrency(p.price)}
                  {p.priceDate && <span className="block text-[10px] text-muted-foreground">{formatDate(p.priceDate)}</span>}
                </td>
                <td className="num px-3 py-2 text-right">{formatCompactCurrency(p.value)}</td>
                <td className={cn("num px-3 py-2 text-right", trendClass(p.pnl))}>
                  {formatCompactCurrency(p.pnl)}
                  <span className="block text-[11px]">{formatSignedPercent(p.pnlPct, 1)}</span>
                </td>
                <td className="num px-3 py-2 text-right">{p.weight === null ? MISSING : formatPercent(p.weight)}</td>
                <td className="px-2 py-2 text-right">
                  <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Excluir posição de ${p.ticker}`} onClick={() => start(() => removePosition(p.id))}>
                    <Trash2Icon />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summary.unpriced.length > 0 && (
        <p className="text-xs text-warning">Sem cotação (fora dos totais de valor e resultado): {summary.unpriced.join(", ")}.</p>
      )}
    </div>
  );
}

function Stat({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 text-lg font-semibold", className)}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

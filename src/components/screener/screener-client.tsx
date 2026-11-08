"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { applyScreener, FIELDS, fieldDef, paramsToQuery, PRESETS, queryToParams, type NumericField, type ScreenerQuery, type ScreenerRow } from "@/analytics/screener";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { formatCompactCurrency, formatCurrency, formatDate, formatMultiple, formatPercent, MISSING } from "@/lib/format";
import { cn } from "@/lib/utils";

const fmt = (k: NumericField, v: number | null) => {
  if (v === null) return MISSING;
  const u = fieldDef(k).unit;
  return u === "percent" ? formatPercent(v) : u === "currency" ? formatCompactCurrency(v, 1) : formatMultiple(v, 1);
};

const COLUMNS: NumericField[] = ["marketCap", "pl", "pvp", "evEbitda", "roe", "netMargin", "netDebtEbitda", "dy", "revenueCagr5y", "liquidity"];

export function ScreenerClient({ rows, sectors, quoteDate }: { rows: ScreenerRow[]; sectors: string[]; quoteDate: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = useMemo(() => paramsToQuery(new URLSearchParams(params.toString())), [params]);
  const result = useMemo(() => applyScreener(rows, query), [rows, query]);

  const update = (q: ScreenerQuery) => router.replace(`${pathname}?${queryToParams(q).toString()}`, { scroll: false });
  const setFilter = (field: NumericField, side: "min" | "max", raw: string) => {
    const v = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    if (v !== null && !Number.isFinite(v)) return;
    const others = query.filters.filter((f) => f.field !== field);
    const cur = query.filters.find((f) => f.field === field) ?? { field };
    update({ ...query, filters: [...others, { ...cur, [side]: v }] });
  };
  const removeFilter = (field: NumericField) => update({ ...query, filters: query.filters.filter((f) => f.field !== field) });
  const addFilter = (field: NumericField) => update({ ...query, filters: [...query.filters, { field, min: null, max: null }] });
  const unused = FIELDS.filter((f) => !query.filters.some((x) => x.field === f.key));

  const shown = query.filters;

  const sortBy = (field: NumericField) =>
    update({ ...query, sort: { field, dir: query.sort?.field === field && query.sort.dir === "desc" ? "asc" : "desc" } });

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros prontos">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => update(p.query)}
            className="rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:border-ring/50 hover:bg-accent/40"
          >
            <span className="block text-sm font-medium">{p.label}</span>
            <span className="block text-xs text-muted-foreground">{p.description}</span>
          </button>
        ))}
      </div>

      <section aria-label="Filtros" className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((f) => {
            const def = fieldDef(f.field);
            const unit = def.unit === "percent" ? "%" : def.unit === "currency" ? "R$ mi" : "x";
            return (
              // a chave inclui os valores: ao aplicar um filtro pronto, os campos são recriados
              <div key={`${f.field}:${f.min ?? ""}:${f.max ?? ""}`} className="flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5">
                <span className="w-28 shrink-0 text-xs font-medium">{def.label}</span>
                <input
                  aria-label={`${def.label} mínimo`}
                  inputMode="decimal"
                  placeholder="mín"
                  defaultValue={f.min ?? ""}
                  onBlur={(e) => setFilter(f.field, "min", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="num w-full min-w-0 rounded border bg-transparent px-1.5 py-1 text-sm outline-none focus:border-ring"
                />
                <span className="text-xs text-muted-foreground">a</span>
                <input
                  aria-label={`${def.label} máximo`}
                  inputMode="decimal"
                  placeholder="máx"
                  defaultValue={f.max ?? ""}
                  onBlur={(e) => setFilter(f.field, "max", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="num w-full min-w-0 rounded border bg-transparent px-1.5 py-1 text-sm outline-none focus:border-ring"
                />
                <span className="w-9 shrink-0 text-[11px] text-muted-foreground">{unit}</span>
                <button onClick={() => removeFilter(f.field)} aria-label={`Remover filtro ${def.label}`} className="text-muted-foreground hover:text-foreground">
                  <XIcon className="size-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            <PlusIcon className="size-3.5 text-muted-foreground" />
            <select
              aria-label="Adicionar filtro"
              value=""
              onChange={(e) => e.target.value && addFilter(e.target.value as NumericField)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Adicionar filtro…</option>
              {unused.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </label>
          <select
            aria-label="Setor"
            value={query.sector ?? ""}
            onChange={(e) => update({ ...query, sector: e.target.value || null })}
            className="max-w-56 rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Todos os setores</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={Boolean(query.excludeFinancials)} onChange={(e) => update({ ...query, excludeFinancials: e.target.checked })} />
            Sem bancos e seguradoras
          </label>
          {(query.filters.length > 0 || query.sector || query.excludeFinancials) && (
            <Button variant="ghost" size="sm" onClick={() => update({ filters: [], sort: query.sort })}>
              Limpar
            </Button>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          <span className="num font-semibold">{result.length}</span> de <span className="num">{rows.length}</span> empresas
        </p>
        <p className="text-xs text-muted-foreground">
          Cotações de {formatDate(quoteDate)} (brapi.dev) · resultados dos últimos 12 meses (CVM) · empresas sem o dado não passam no filtro
        </p>
      </div>

      {result.length === 0 ? (
        <EmptyState title="Nenhuma empresa passou nos filtros" description="Afrouxe algum critério ou remova o filtro de setor." />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="sticky left-0 bg-muted/90 px-3 py-2 text-left font-medium">Empresa</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Preço</th>
                {COLUMNS.map((c) => {
                  const active = query.sort?.field === c;
                  return (
                    <th key={c} scope="col" aria-sort={active ? (query.sort!.dir === "asc" ? "ascending" : "descending") : "none"} className="px-1 py-1 text-right font-medium">
                      <button onClick={() => sortBy(c)} className={cn("inline-flex items-center gap-0.5 rounded px-2 py-1 whitespace-nowrap hover:bg-muted", active && "text-foreground")}>
                        {fieldDef(c).label}
                        {active && (query.sort!.dir === "asc" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {result.slice(0, 200).map((r) => (
                <tr key={r.cnpj} className="border-t hover:bg-muted/40">
                  <th scope="row" className="sticky left-0 bg-card px-3 py-2 text-left font-normal">
                    <Link href={`/empresa/${r.ticker}`} className="num font-semibold hover:underline">{r.ticker}</Link>
                    <span className="block max-w-48 truncate text-xs text-muted-foreground">{r.sector}</span>
                  </th>
                  <td className="num px-3 py-2 text-right">{formatCurrency(r.price)}</td>
                  {COLUMNS.map((c) => (
                    <td key={c} className={cn("num px-3 py-2 text-right", r[c] === null && "text-muted-foreground", r[c] !== null && (r[c] as number) < 0 && "text-negative")}>
                      {fmt(c, r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.length > 200 && <p className="text-xs text-muted-foreground">Mostrando as 200 primeiras. Refine os filtros para ver menos.</p>}
    </div>
  );
}

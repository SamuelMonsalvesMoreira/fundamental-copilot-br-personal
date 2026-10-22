"use client";

import { useEffect, useMemo, useState } from "react";
import SectionCard from "./SectionCard";
import type { QuarterlyFinancialRecord } from "@/lib/cvm/types";

type ViewMode = "quarterly" | "ltm";

interface ApiResponse {
  quarterly?: QuarterlyFinancialRecord[];
  updatedAt?: string;
  error?: string;
}

const FLOW_FIELDS = ["revenue", "ebit", "netIncome", "operatingCashFlow", "capex", "freeCashFlow"] as const;
const COLS: { label: string; key: keyof QuarterlyFinancialRecord }[] = [
  { label: "Período", key: "period" },
  { label: "Receita", key: "revenue" },
  { label: "EBIT", key: "ebit" },
  { label: "Lucro", key: "netIncome" },
  { label: "CFO", key: "operatingCashFlow" },
  { label: "Capex", key: "capex" },
  { label: "FCF", key: "freeCashFlow" },
  { label: "Caixa", key: "cash" },
  { label: "Dív. total", key: "totalDebt" },
  { label: "Dív. líquida", key: "netDebt" },
];

function fmtBRL(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}B`;
}

function buildLtm(rows: QuarterlyFinancialRecord[]): QuarterlyFinancialRecord | null {
  const actual = [...rows].sort((a, b) => a.periodEndDate.localeCompare(b.periodEndDate)).slice(-4);
  if (actual.length < 4) return null;
  const latest = actual[actual.length - 1];
  const sum = (key: typeof FLOW_FIELDS[number]) => {
    const values = actual.map(row => row[key]);
    return values.some(value => value === null)
      ? null
      : values.reduce<number>((total, value) => total + (value ?? 0), 0);
  };
  return {
    ...latest,
    period: `LTM ${latest.period}`,
    revenue: sum("revenue"),
    ebit: sum("ebit"),
    netIncome: sum("netIncome"),
    operatingCashFlow: sum("operatingCashFlow"),
    capex: sum("capex"),
    freeCashFlow: sum("freeCashFlow"),
  };
}

export default function QuarterlyFinancialsPanel({ ticker }: { ticker: string }) {
  const [rows, setRows] = useState<QuarterlyFinancialRecord[] | null>(null);
  const [mode, setMode] = useState<ViewMode>("quarterly");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setError(null);
    fetch(`/api/cvm/quarterly/${encodeURIComponent(ticker)}`, { signal: controller.signal })
      .then(response => response.json())
      .then((body: ApiResponse) => {
        if (body.error && !body.quarterly?.length) setError(body.error);
        setRows(body.quarterly ?? []);
      })
      .catch(errorValue => {
        if (errorValue instanceof DOMException && errorValue.name === "AbortError") return;
        setError("Não foi possível carregar os trimestres da CVM.");
      });
    return () => controller.abort();
  }, [ticker]);

  const recentRows = useMemo(
    () => [...(rows ?? [])].sort((a, b) => b.periodEndDate.localeCompare(a.periodEndDate)).slice(0, 8),
    [rows],
  );
  const ltm = useMemo(() => buildLtm(rows ?? []), [rows]);
  const visibleRows = mode === "ltm" ? (ltm ? [ltm] : []) : recentRows;
  const latest = recentRows[0];

  return (
    <SectionCard
      title="Resultados trimestrais e últimos 12 meses"
      subtitle={latest ? `CVM ITR · último realizado: ${latest.period} (${latest.periodEndDate.split("-").reverse().join("/")})` : `CVM ITR · ${ticker}`}
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["quarterly", "ltm"] as const).map(value => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            style={{
              border: "1px solid #cbd5e1", borderRadius: 6, minHeight: 36, padding: "6px 12px",
              background: mode === value ? "#0f172a" : "#fff", color: mode === value ? "#fff" : "#475569",
              fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            {value === "quarterly" ? "Trimestral" : "Últimos 12 meses"}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div style={styles.state}>Buscando o ITR mais recente...</div>
      ) : error ? (
        <div style={{ ...styles.state, color: "#b91c1c" }}>{error}</div>
      ) : visibleRows.length === 0 ? (
        <div style={styles.state}>Ainda não há quatro trimestres suficientes para calcular o LTM.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead><tr>{COLS.map(col => <th key={col.key} style={col.key === "period" ? styles.thPeriod : styles.th}>{col.label}</th>)}</tr></thead>
            <tbody>
              {visibleRows.map(row => (
                <tr key={row.period}>
                  {COLS.map(col => (
                    <td key={col.key} style={col.key === "period" ? styles.tdPeriod : styles.td}>
                      {col.key === "period" ? row.period : fmtBRL(row[col.key] as number | null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ margin: "12px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
        Realizado = linha contínua nas projeções. Valores LTM somam os quatro últimos trimestres; caixa e dívidas usam o saldo do trimestre mais recente. Projeções permanecem identificadas separadamente na aba Projeções.
      </p>
    </SectionCard>
  );
}

const styles = {
  state: { fontSize: 13, color: "#64748b", textAlign: "center" as const, padding: "20px 0" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" },
  th: { textAlign: "right" as const, padding: "7px 10px", color: "#64748b", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" as const },
  thPeriod: { textAlign: "left" as const, padding: "7px 10px", color: "#64748b", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" as const },
  td: { textAlign: "right" as const, padding: "7px 10px", color: "#0f172a", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" as const },
  tdPeriod: { textAlign: "left" as const, padding: "7px 10px", color: "#334155", fontWeight: 700, borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" as const },
};


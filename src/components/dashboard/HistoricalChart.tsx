"use client";

import React, { useEffect, useMemo, useState } from "react";
import SectionCard from "./SectionCard";
import type { QuarterlyFinancialRecord } from "@/lib/cvm/types";
import { buildLatestYtdFinancialRow } from "@/lib/cvm/ytd-financials";

interface FinancialRow {
  year: string;
  receita: number;
  ebitda: number;
  fcl: number;
  isPartial?: boolean;
  latestQuarter?: 1 | 2 | 3 | 4;
  periodEndDate?: string;
}

const METRICS = [
  { key: "receita" as const, label: "Receita",              color: "#2563eb" },
  { key: "ebitda"  as const, label: "EBITDA",               color: "#0ea5e9" },
  { key: "fcl"     as const, label: "Fluxo de Caixa Livre", color: "#38bdf8" },
];

interface QuarterlyResponse {
  quarterly?: QuarterlyFinancialRecord[];
}

export default function HistoricalChart({ data, ticker }: { data: FinancialRow[]; ticker?: string }) {
  const [activeMetric, setActiveMetric] = useState<string>("all");
  const [quarterly, setQuarterly] = useState<QuarterlyFinancialRecord[]>([]);

  useEffect(() => {
    if (!ticker) {
      setQuarterly([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/cvm/quarterly/${encodeURIComponent(ticker)}`, { signal: controller.signal })
      .then(response => response.json())
      .then((body: QuarterlyResponse) => setQuarterly(body.quarterly ?? []))
      .catch(error => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setQuarterly([]);
      });
    return () => controller.abort();
  }, [ticker]);

  const partialRow = useMemo(
    () => buildLatestYtdFinancialRow(data, quarterly),
    [data, quarterly],
  );
  const chartData = useMemo(
    () => partialRow ? [...data, partialRow] : data,
    [data, partialRow],
  );

  const W = 560, H = 200, PAD = { top: 10, right: 10, bottom: 28, left: 52 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const visible = activeMetric === "all" ? METRICS : METRICS.filter(m => m.key === activeMetric);
  const allVals = chartData.flatMap(d => visible.map(m => d[m.key]));
  const maxVal = Math.max(10, Math.ceil(Math.max(...allVals, 0) / 10) * 10);

  const xStep = chartW / Math.max(chartData.length, 1);
  const barGroupW = xStep * 0.72;
  const barW = barGroupW / visible.length;
  const yTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];
  const y = (v: number) => chartH - (v / maxVal) * chartH;

  const toggles = [{ key: "all", label: "Todos" }, ...METRICS];
  const firstYear = chartData[0]?.year;
  const lastAnnualYear = [...data].at(-1)?.year;
  const annualRange = firstYear && lastAnnualYear ? `AF${firstYear}–AF${lastAnnualYear}` : "sem histórico anual";
  const subtitle = partialRow
    ? `BRL Bilhões · ${annualRange} + ${partialRow.year} até ${partialRow.latestQuarter}T`
    : firstYear && lastAnnualYear
      ? `BRL Bilhões · AF${firstYear}–AF${lastAnnualYear}`
      : "BRL Bilhões";

  return (
    <SectionCard
      title="Financeiros Históricos"
      subtitle={subtitle}
      action={
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {toggles.map(t => (
            <button key={t.key} onClick={() => setActiveMetric(t.key)} style={{
              fontSize: 11, padding: "3px 8px", borderRadius: 5, cursor: "pointer",
              fontFamily: "inherit",
              ...(activeMetric === t.key
                ? { background: "#eff6ff", border: "1px solid #bfdbfe", color: "#2563eb", fontWeight: 600 }
                : { border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b" }),
            }}>{t.label}</button>
          ))}
        </div>
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Financeiros históricos${partialRow ? `, incluindo ${partialRow.year} acumulado até o ${partialRow.latestQuarter}º trimestre` : ""}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          {METRICS.map(metric => (
            <pattern key={metric.key} id={`partial-${metric.key}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={metric.color} opacity="0.72" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeWidth="2" opacity="0.8" />
            </pattern>
          ))}
        </defs>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={0} y1={y(v)} x2={chartW} y2={y(v)} stroke="#f1f5f9" strokeWidth={1}/>
              <text x={-6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="#94a3b8"
                fontFamily="JetBrains Mono, monospace">
                {v === 0 ? "" : `R$${v}B`}
              </text>
            </g>
          ))}
          {chartData.map((d, di) => {
            const groupX = di * xStep + xStep * 0.14;
            return (
              <g key={d.year}>
                {visible.map((m, mi) => {
                  const bx = groupX + mi * barW;
                  const bh = (d[m.key] / maxVal) * chartH;
                  const by = chartH - bh;
                  return (
                    <rect
                      key={m.key} x={bx} y={by} width={barW - 2} height={bh}
                      fill={d.isPartial ? `url(#partial-${m.key})` : m.color} rx={2} opacity={0.9}
                      aria-label={`${m.label}: R$${d[m.key]}B${d.isPartial ? `, acumulado até ${d.latestQuarter}T` : ""}`}
                    />
                  );
                })}
                <text x={groupX + barGroupW / 2} y={chartH + 14}
                  textAnchor="middle" fontSize={11} fill={d.isPartial ? "#b45309" : "#94a3b8"}>
                  <tspan x={groupX + barGroupW / 2}>{d.year}</tspan>
                  {d.isPartial && <tspan x={groupX + barGroupW / 2} dy="10" fontSize={8}>até {d.latestQuarter}T</tspan>}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
        {METRICS.filter(m => activeMetric === "all" || m.key === activeMetric).map(m => (
          <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: m.color }}></div>
            <span style={{ fontSize: 11, color: "#64748b" }}>{m.label}</span>
          </div>
        ))}
        {partialRow && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}>
            <div style={{ width: 11, height: 11, borderRadius: 2, border: "1px dashed #d97706", background: "#fffbeb" }} />
            <span style={{ fontSize: 11, color: "#92400e" }}>Parcial · acumulado até {partialRow.latestQuarter}T</span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}


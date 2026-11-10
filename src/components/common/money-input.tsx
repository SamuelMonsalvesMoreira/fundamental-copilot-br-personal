"use client";

import { useState } from "react";
import { moneyUnit, parseUnitText, toUnitText } from "@/lib/money-unit";
import { cn } from "@/lib/utils";

/**
 * Campo de valor em reais digitado na mesma unidade do valor de referência
 * (bilhões ou milhões). `value` e `onChange` são sempre em reais.
 */
export function MoneyInput({
  value,
  reference,
  onChange,
  ariaLabel,
  className,
}: {
  value: number | null;
  reference: number | null;
  onChange: (reais: number | null) => void;
  ariaLabel: string;
  className?: string;
}) {
  const unit = moneyUnit(reference);
  const [draft, setDraft] = useState(() => toUnitText(value, unit));
  const [seen, setSeen] = useState(value);

  // Valor trocado de fora (botões de cenário, outra aba): mostra o novo.
  if (value !== seen) {
    setSeen(value);
    if (parseUnitText(draft, unit) !== value) setDraft(toUnitText(value, unit));
  }

  return (
    <span className={cn("flex items-center rounded-md border bg-background focus-within:ring-3 focus-within:ring-ring/30", className)}>
      <span className="pl-2 text-xs text-muted-foreground">R$</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={toUnitText(reference, unit)}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (raw.trim() === "") {
            setSeen(null);
            onChange(null);
            return;
          }
          const n = parseUnitText(raw, unit);
          if (n !== null) {
            setSeen(n);
            onChange(n);
          }
        }}
        aria-label={`${ariaLabel}, em R$ ${unit.name}`}
        className="num w-20 min-w-0 flex-1 bg-transparent px-1.5 py-1 text-sm outline-none"
      />
      <span className="pr-2 text-xs text-muted-foreground">{unit.label}</span>
    </span>
  );
}

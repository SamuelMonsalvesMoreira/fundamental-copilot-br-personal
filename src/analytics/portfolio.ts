/** Carteira: valor atual, resultado e peso de cada posição. */

export interface Position {
  id: number;
  ticker: string;
  quantity: number;
  avgPrice: number;
  openedAt: string | null;
  note: string | null;
}

export interface PositionView extends Position {
  price: number | null;
  priceDate: string | null;
  cost: number;
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
  weight: number | null;
  /** proventos estimados para 12 meses (DY 12m × valor) */
  income12m: number | null;
}

export interface PortfolioSummary {
  positions: PositionView[];
  cost: number;
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
  income12m: number | null;
  /** posições sem cotação: o total exclui essas */
  unpriced: string[];
}

export function computePortfolio(
  positions: Position[],
  prices: Record<string, { close: number; date: string } | undefined>,
  dy: Record<string, number | null | undefined>,
): PortfolioSummary {
  const base = positions.map((p) => {
    const q = prices[p.ticker];
    const cost = p.quantity * p.avgPrice;
    const value = q ? p.quantity * q.close : null;
    const y = dy[p.ticker];
    return {
      ...p,
      price: q?.close ?? null,
      priceDate: q?.date ?? null,
      cost,
      value,
      pnl: value === null ? null : value - cost,
      pnlPct: value === null || cost <= 0 ? null : value / cost - 1,
      income12m: value === null || y === null || y === undefined ? null : value * y,
    };
  });

  const priced = base.filter((p) => p.value !== null);
  const total = priced.reduce((s, p) => s + (p.value ?? 0), 0);
  const pricedCost = priced.reduce((s, p) => s + p.cost, 0);
  const withIncome = priced.filter((p) => p.income12m !== null);

  return {
    positions: base.map((p) => ({ ...p, weight: p.value !== null && total > 0 ? p.value / total : null })),
    cost: base.reduce((s, p) => s + p.cost, 0),
    value: priced.length ? total : null,
    pnl: priced.length ? total - pricedCost : null,
    pnlPct: priced.length && pricedCost > 0 ? total / pricedCost - 1 : null,
    income12m: withIncome.length ? withIncome.reduce((s, p) => s + (p.income12m ?? 0), 0) : null,
    unpriced: base.filter((p) => p.value === null).map((p) => p.ticker),
  };
}

/** Validação dos campos de uma nova posição. Retorna mensagens de erro (vazio = ok). */
export function validatePosition(input: { ticker: string; quantity: number; avgPrice: number; openedAt?: string | null }): string[] {
  const errors: string[] = [];
  if (!/^[A-Z0-9]{4}\d{1,2}$/.test(input.ticker)) errors.push("Ticker inválido.");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) errors.push("Quantidade deve ser maior que zero.");
  if (!Number.isFinite(input.avgPrice) || input.avgPrice <= 0) errors.push("Preço médio deve ser maior que zero.");
  if (input.openedAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.openedAt)) errors.push("Data inválida.");
  return errors;
}

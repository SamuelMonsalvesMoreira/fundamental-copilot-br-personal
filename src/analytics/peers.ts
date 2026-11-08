/**
 * Escolha dos pares de uma empresa e comparação com o próprio histórico.
 *
 * Comparar uma empresa de R$ 200 bi com outras de R$ 200 mi, ou com ações que
 * quase não negociam, gera conclusões falsas. Por isso o grupo é filtrado por
 * dados, liquidez e porte, e informa quando a comparação é fraca.
 */

export interface PeerRow {
  cnpj: string;
  ticker: string;
  name: string;
  marketCap: number | null;
  pl: number | null;
  pvp: number | null;
  evEbitda: number | null;
  roe: number | null;
  netMargin: number | null;
  dy: number | null;
  netDebtEbitda: number | null;
  /** volume financeiro do último pregão, em R$ */
  liquidity: number | null;
  priceDate: string | null;
  financialsEnd: string | null;
}

/** boa: mesmo setor e porte · ampla: inclui o setor CVM · fraca: porte muito diferente · escolhida: pelo usuário */
export type PeerQuality = "boa" | "ampla" | "fraca" | "escolhida";

export interface PeerGroup {
  /** a própria empresa vem junto, para aparecer na tabela */
  peers: PeerRow[];
  quality: PeerQuality;
  note: string;
}

export const PEER_RULES = {
  minLiquidity: 500_000,
  maxQuoteLagDays: 10,
  maxFinancialsLagDays: 400,
  /** porte de até 10× para mais ou para menos */
  sizeBand: 10,
  maxPeers: 8,
  minPeers: 3,
};

const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

function isUsable(c: PeerRow, target: PeerRow) {
  if (c.cnpj === target.cnpj || c.marketCap === null || c.marketCap <= 0) return false;
  if (c.pl === null && c.pvp === null && c.evEbitda === null) return false;
  if ((c.liquidity ?? 0) < PEER_RULES.minLiquidity) return false;
  if (!c.priceDate || !target.priceDate || days(c.priceDate, target.priceDate) > PEER_RULES.maxQuoteLagDays) return false;
  if (!c.financialsEnd || !target.financialsEnd || days(c.financialsEnd, target.financialsEnd) > PEER_RULES.maxFinancialsLagDays) return false;
  return true;
}

/** Quantas vezes uma empresa é maior que a outra (sempre ≥ 1). */
const sizeRatio = (c: PeerRow, target: PeerRow) => {
  const r = c.marketCap! / target.marketCap!;
  return r >= 1 ? r : 1 / r;
};

const byCap = (a: PeerRow, b: PeerRow) => (b.marketCap ?? -1) - (a.marketCap ?? -1);

export function selectPeers(
  target: PeerRow,
  sector: PeerRow[],
  broad: PeerRow[],
  labels: { sector: string; broad: string | null },
): PeerGroup {
  const closest = (xs: PeerRow[]) => [...xs].sort((a, b) => sizeRatio(a, target) - sizeRatio(b, target));
  const build = (chosen: PeerRow[], quality: PeerQuality, note: string): PeerGroup => ({
    peers: [target, ...closest(chosen).slice(0, PEER_RULES.maxPeers)].sort(byCap),
    quality,
    note,
  });

  const usable = sector.filter((c) => isUsable(c, target));
  const left = sector.filter((c) => c.cnpj !== target.cnpj).length - usable.length;
  const leftNote = left > 0 ? ` ${left} ${left === 1 ? "empresa do setor ficou" : "empresas do setor ficaram"} de fora por baixa liquidez ou dados incompletos.` : "";

  if (target.marketCap === null || target.marketCap <= 0) {
    return build(usable, "fraca", `Sem valor de mercado desta empresa para comparar o porte: a comparação é pouco confiável.${leftNote}`);
  }

  const inBand = (c: PeerRow) => sizeRatio(c, target) <= PEER_RULES.sizeBand;
  const similar = usable.filter(inBand);
  if (similar.length >= PEER_RULES.minPeers) {
    return build(similar, "boa", `Mesmo setor (“${labels.sector}”), porte de até ${PEER_RULES.sizeBand}× para mais ou para menos e liquidez mínima no último pregão.${leftNote}`);
  }

  const wider = broad.filter((c) => isUsable(c, target) && inBand(c));
  if (labels.broad && similar.length + wider.length >= PEER_RULES.minPeers) {
    return build([...similar, ...wider], "ampla", `Poucas empresas de porte parecido em “${labels.sector}”: o grupo inclui outras do setor amplo da CVM (“${labels.broad}”), que podem ter negócios diferentes.${leftNote}`);
  }

  return build(usable, "fraca", `Não há empresas suficientes de porte parecido em “${labels.sector}”. A tabela mostra as mais próximas, mas a comparação é pouco confiável.${leftNote}`);
}

export function customGroup(target: PeerRow, chosen: PeerRow[]): PeerGroup {
  return { peers: [target, ...chosen.filter((c) => c.cnpj !== target.cnpj)].sort(byCap), quality: "escolhida", note: "Grupo escolhido por você." };
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type PeerMetric = "marketCap" | "pl" | "pvp" | "evEbitda" | "roe" | "netMargin" | "dy" | "netDebtEbitda";
const METRICS: PeerMetric[] = ["marketCap", "pl", "pvp", "evEbitda", "roe", "netMargin", "dy", "netDebtEbitda"];
/** múltiplos negativos não têm significado e ficam fora da mediana */
const POSITIVE_ONLY = new Set<PeerMetric>(["pl", "pvp", "evEbitda"]);

/** Mediana dos pares, sem a própria empresa. Nula com menos de 2 valores. */
export function peerMedians(peers: PeerRow[], selfTicker: string): Record<PeerMetric, number | null> {
  const others = peers.filter((p) => p.ticker !== selfTicker);
  const entries = METRICS.map((k) => {
    const xs = others.map((p) => p[k]).filter((v): v is number => v !== null && (!POSITIVE_ONLY.has(k) || v > 0));
    return [k, xs.length >= 2 ? median(xs) : null] as const;
  });
  return Object.fromEntries(entries) as Record<PeerMetric, number | null>;
}

export interface OwnHistoryYear {
  label: string;
  end: string;
  price: number;
  pl: number | null;
  pvp: number | null;
}

export interface OwnHistory {
  years: OwnHistoryYear[];
  medianPl: number | null;
  medianPvp: number | null;
}

/**
 * P/L e P/VP nos últimos fechamentos de ano. O preço histórico já vem ajustado
 * por desdobramentos, então é multiplicado pela quantidade ATUAL de ações. É uma
 * aproximação: emissões e recompras grandes no período distorcem o resultado.
 */
export function ownHistory(
  prices: Array<{ date: string; close: number }>,
  annual: Array<{ label: string; end: string; netIncome: number | null; equity: number | null }>,
  shares: number | null,
): OwnHistory | null {
  if (!shares || shares <= 0 || prices.length === 0) return null;
  const years: OwnHistoryYear[] = [];
  for (const y of annual.slice(-5)) {
    let price: { date: string; close: number } | undefined;
    for (const p of prices) {
      if (p.date > y.end) break;
      price = p;
    }
    if (!price || days(price.date, y.end) > 15) continue;
    const cap = price.close * shares;
    years.push({
      label: y.label,
      end: y.end,
      price: price.close,
      pl: y.netIncome !== null && y.netIncome > 0 ? cap / y.netIncome : null,
      pvp: y.equity !== null && y.equity > 0 ? cap / y.equity : null,
    });
  }
  const medianOf = (xs: Array<number | null>) => {
    const valid = xs.filter((v): v is number => v !== null);
    return valid.length >= 3 ? median(valid) : null;
  };
  const medianPl = medianOf(years.map((y) => y.pl));
  const medianPvp = medianOf(years.map((y) => y.pvp));
  return medianPl === null && medianPvp === null ? null : { years, medianPl, medianPvp };
}

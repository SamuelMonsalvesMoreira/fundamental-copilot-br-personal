import { describe, expect, it } from "vitest";
import { customGroup, ownHistory, peerMedians, selectPeers, type PeerRow } from "./peers";

const row = (ticker: string, marketCap: number | null, over: Partial<PeerRow> = {}): PeerRow => ({
  cnpj: ticker,
  ticker,
  name: ticker,
  marketCap,
  pl: 10,
  pvp: 1,
  evEbitda: 5,
  roe: 0.1,
  netMargin: 0.1,
  dy: 0.05,
  netDebtEbitda: 1,
  liquidity: 10_000_000,
  priceDate: "2026-11-06",
  financialsEnd: "2026-09-30",
  ...over,
});

const labels = { sector: "Máquinas", broad: "Máquinas e Veículos" };
const tickers = (peers: PeerRow[]) => peers.map((p) => p.ticker);
const T = row("ALVO3", 10e9);

describe("seleção de pares", () => {
  it("grupo bom: mesmo setor e porte parecido, ordenado por valor de mercado", () => {
    const g = selectPeers(T, [row("A3", 20e9), row("B3", 5e9), row("C3", 2e9), row("MICRO3", 100e6)], [], labels);
    expect(g.quality).toBe("boa");
    expect(tickers(g.peers)).toEqual(["A3", "ALVO3", "B3", "C3"]);
  });

  it("retira quem quase não negocia, está defasado ou não tem múltiplos", () => {
    const g = selectPeers(
      T,
      [
        row("A3", 20e9),
        row("B3", 5e9),
        row("C3", 2e9),
        row("ILIQ3", 9e9, { liquidity: 480 }),
        row("VELHO3", 9e9, { financialsEnd: "2025-06-30" }),
        row("PARADA3", 9e9, { priceDate: "2026-09-01" }),
        row("VAZIO3", 9e9, { pl: null, pvp: null, evEbitda: null }),
      ],
      [],
      labels,
    );
    expect(tickers(g.peers)).toEqual(["A3", "ALVO3", "B3", "C3"]);
    expect(g.note).toContain("4 empresas do setor ficaram de fora");
  });

  it("amplia para o setor da CVM quando faltam empresas parecidas", () => {
    const g = selectPeers(T, [row("A3", 20e9)], [row("X3", 8e9), row("Y3", 30e9), row("TINY3", 1e6)], labels);
    expect(g.quality).toBe("ampla");
    expect(tickers(g.peers)).toEqual(["Y3", "A3", "ALVO3", "X3"]);
  });

  it("empresa sem pares do mesmo porte recebe aviso de comparação fraca", () => {
    const weg = row("WEGE3", 200e9);
    const g = selectPeers(weg, [row("A3", 5e9), row("B3", 1e9)], [], labels);
    expect(g.quality).toBe("fraca");
    expect(g.note).toContain("pouco confiável");
    expect(tickers(g.peers)).toContain("A3");
  });

  it("limita o tamanho do grupo às empresas de porte mais próximo", () => {
    const sector = Array.from({ length: 12 }, (_, i) => row(`P${i}`, 10e9 + i * 3e9));
    const g = selectPeers(T, sector, [], labels);
    expect(g.peers).toHaveLength(9);
    expect(tickers(g.peers)).not.toContain("P11");
  });

  it("grupo escolhido pelo usuário ignora os filtros", () => {
    const g = customGroup(T, [row("ILIQ3", 1e6, { liquidity: 0 }), T]);
    expect(g.quality).toBe("escolhida");
    expect(tickers(g.peers)).toEqual(["ALVO3", "ILIQ3"]);
  });
});

describe("mediana dos pares", () => {
  it("não inclui a própria empresa nem múltiplos negativos", () => {
    const m = peerMedians([row("ALVO3", 1, { pl: 100 }), row("A3", 1, { pl: 8 }), row("B3", 1, { pl: 12 }), row("C3", 1, { pl: -3 })], "ALVO3");
    expect(m.pl).toBe(10);
  });

  it("mantém valores negativos onde eles têm significado", () => {
    const m = peerMedians([row("A3", 1, { netDebtEbitda: -1 }), row("B3", 1, { netDebtEbitda: -3 })], "ALVO3");
    expect(m.netDebtEbitda).toBe(-2);
  });

  it("não calcula mediana com um único valor", () => {
    expect(peerMedians([row("ALVO3", 1), row("A3", 1)], "ALVO3").pl).toBeNull();
  });
});

describe("histórico da própria ação", () => {
  const prices = [
    { date: "2022-12-29", close: 10 },
    { date: "2023-12-28", close: 20 },
    { date: "2024-12-30", close: 30 },
    { date: "2025-12-30", close: 40 },
  ];
  const year = (y: number, netIncome: number | null, equity: number | null = 500) => ({ label: String(y), end: `${y}-12-31`, netIncome, equity });

  it("calcula P/L e P/VP de cada fim de ano e a mediana", () => {
    const h = ownHistory(prices, [year(2022, 100), year(2023, 100), year(2024, 100), year(2025, 100)], 100)!;
    expect(h.years.map((y) => y.pl)).toEqual([10, 20, 30, 40]);
    expect(h.years[0].pvp).toBe(2);
    expect(h.medianPl).toBe(25);
    expect(h.medianPvp).toBe(5);
  });

  it("prejuízo fica sem P/L e fora da mediana", () => {
    const h = ownHistory(prices, [year(2022, -50), year(2023, 100), year(2024, 100), year(2025, 100)], 100)!;
    expect(h.years[0].pl).toBeNull();
    expect(h.medianPl).toBe(30);
  });

  it("ignora ano sem cotação próxima do fechamento", () => {
    const h = ownHistory(prices.slice(2), [year(2022, 100), year(2023, 100), year(2024, 100), year(2025, 100)], 100);
    expect(h).toBeNull();
  });

  it("sem quantidade de ações não calcula", () => {
    expect(ownHistory(prices, [year(2022, 100)], null)).toBeNull();
  });
});

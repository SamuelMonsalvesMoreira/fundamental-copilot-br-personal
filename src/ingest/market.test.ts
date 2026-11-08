import { describe, expect, it } from "vitest";
import { fromBr, parseSgs, windows } from "./bcb";
import { parseDividends, parseHistory, parseQuoteList, spDate } from "./brapi";
import { chooseShareScale } from "./share-scale";

describe("Banco Central (SGS)", () => {
  it("converte datas e descarta datas futuras (Selic meta até o próximo Copom)", () => {
    const pts = parseSgs(
      [
        { data: "05/11/2026", valor: "13.75" },
        { data: "09/12/2026", valor: "13.75" },
        { data: "06/11/2026", valor: "lixo" },
      ],
      "2026-11-08",
    );
    expect(pts).toEqual([{ date: "2026-11-05", value: 13.75 }]);
    expect(fromBr("01/09/2026")).toBe("2026-09-01");
  });

  it("divide períodos longos em janelas de até 10 anos", () => {
    const w = windows("2010-01-01", "2026-11-08");
    expect(w[0]).toEqual(["2010-01-01", "2019-01-01"]);
    expect(w[1]).toEqual(["2019-01-02", "2026-11-08"]);
    expect(windows("2026-10-01", "2026-11-08")).toEqual([["2026-10-01", "2026-11-08"]]);
  });
});

describe("brapi", () => {
  it("mantém só ações e units com preço; variação em fração", () => {
    const rows = parseQuoteList([
      { stock: "WEGE3", close: 48.19, change: -0.23, volume: 1, market_cap: 2e11, type: "stock", subType: "stock", subsector: "Máquinas e Equipamentos" },
      { stock: "TAEE11", close: 40.21, change: 1.54, market_cap: null, type: "stock", subType: "unit" },
      { stock: "HGLG11", close: 160, type: "fund", subType: "fii" },
      { stock: "XPTO3", close: 0, type: "stock", subType: "stock" },
    ]);
    expect(rows.map((r) => r.ticker)).toEqual(["WEGE3", "TAEE11"]);
    expect(rows[0].changePct).toBeCloseTo(-0.0023);
    expect(rows[1].marketCap).toBeNull();
  });

  it("converte histórico (epoch) para a data de São Paulo", () => {
    // 2026-11-06 00:00 em São Paulo = 03:00 UTC
    const h = parseHistory({ symbol: "PETR4", historicalDataPrice: [{ date: 1793934000, close: 45.36, adjustedClose: 45.36, volume: 10 }] });
    expect(h).toEqual([{ date: "2026-11-06", close: 45.36, adjClose: 45.36, volume: 10 }]);
    expect(spDate(new Date("2026-11-07T02:00:00Z"))).toBe("2026-11-06");
  });

  it("lê proventos em dinheiro (JCP/dividendos) e ignora valores zerados", () => {
    const d = parseDividends({
      symbol: "PETR4",
      dividendsData: {
        cashDividends: [
          { rate: 0.2025, label: "JCP", exDate: "2026-08-24T03:00:00.000Z", paymentDate: "2026-12-21T03:00:00.000Z" },
          { rate: 0, label: "DIVIDENDO", exDate: "2026-08-24T03:00:00.000Z" },
        ],
      },
    });
    expect(d).toEqual([{ exDate: "2026-08-24", paymentDate: "2026-12-21", kind: "JCP", value: 0.2025 }]);
  });

  it("dois pagamentos iguais na mesma data são somados, não descartados", () => {
    const pay = { rate: 0.3505, label: "JCP", exDate: "2026-06-02T03:00:00.000Z" };
    const d = parseDividends({ symbol: "PETR4", dividendsData: { cashDividends: [pay, pay] } });
    expect(d).toHaveLength(1);
    expect(d[0].value).toBeCloseTo(0.701);
  });
});

describe("Yahoo Finance", () => {
  it("lê preços e proventos com a data do pregão em São Paulo", async () => {
    const { parseYahooChart } = await import("./yahoo");
    const r = parseYahooChart({
      chart: {
        result: [
          {
            meta: { gmtoffset: -10800 },
            timestamp: [1793970000, 1794056400],
            indicators: { quote: [{ close: [45.36, null], volume: [10, null] }], adjclose: [{ adjclose: [44.1, null] }] },
            events: { dividends: { a: { amount: 0.7481, date: 1793970000 }, b: { amount: 0, date: 1793970000 } } },
          },
        ],
        error: null,
      },
    });
    expect(r.history).toEqual([{ date: "2026-11-06", close: 45.36, adjClose: 44.1, volume: 10 }]);
    expect(r.dividends).toEqual([{ exDate: "2026-11-06", paymentDate: null, kind: "PROVENTO", value: 0.7481 }]);
  });

  it("ticker inexistente vira erro claro", async () => {
    const { parseYahooChart } = await import("./yahoo");
    expect(() => parseYahooChart({ chart: { result: null, error: { description: "No data found" } } })).toThrow("No data found");
  });
});

describe("escala da quantidade de ações", () => {
  it("Itaú: CVM informa em milhares", () => {
    // ~5,62 bi ON a R$ 36 e ~5,40 bi PN a R$ 40,53; valor de mercado ~R$ 464 bi
    const d = chooseShareScale({ marketCap: 464e9, ordinary: 5_617_743, preferred: 5_403_616, priceOrdinary: 36, pricePreferred: 40.53 });
    expect(d.scale).toBe(1000);
  });

  it("WEG: CVM informa em unidades", () => {
    const d = chooseShareScale({ marketCap: 210e9, ordinary: 4_195_829_691, preferred: 0, priceOrdinary: 48.19, pricePreferred: null });
    expect(d.scale).toBe(1);
  });

  it("sem valor de mercado: usa a escala com P/VP plausível (ex.: Klabin, só a unit tem cotação)", () => {
    const d = chooseShareScale({ marketCap: null, ordinary: 2_000_000_000, preferred: 4_000_000_000, priceOrdinary: 3.52, pricePreferred: 3.52, equity: 11e9 });
    expect(d.scale).toBe(1);
    expect(d.note).toContain("patrimônio");
    const k = chooseShareScale({ marketCap: null, ordinary: 2_000_000, preferred: 4_000_000, priceOrdinary: 3.52, pricePreferred: 3.52, equity: 11e9 });
    expect(k.scale).toBe(1000);
  });

  it("sem valor de mercado e sem P/VP plausível: não decide", () => {
    expect(chooseShareScale({ marketCap: null, ordinary: 1000, preferred: 0, priceOrdinary: 1, pricePreferred: null, equity: 1e12 }).scale).toBeNull();
    expect(chooseShareScale({ marketCap: null, ordinary: 1e6, preferred: 0, priceOrdinary: 10, pricePreferred: null, equity: null }).scale).toBeNull();
  });

  it("não arrisca quando nada confere ou falta dado", () => {
    expect(chooseShareScale({ marketCap: 1e9, ordinary: 1e6, preferred: 0, priceOrdinary: 50, pricePreferred: null }).scale).toBeNull();
    expect(chooseShareScale({ marketCap: null, ordinary: 1e6, preferred: 0, priceOrdinary: 50, pricePreferred: null }).scale).toBeNull();
  });
});

describe("agenda", () => {
  it("considera o fim de semana ao decidir se as cotações estão atrasadas", async () => {
    const { isMarketStale } = await import("./schedule");
    // segunda 10h (SP): coleta de sexta 19h30 tem ~62 h → ainda vale
    expect(isMarketStale(62, new Date("2026-11-09T13:00:00Z"))).toBe(false);
    // quarta: 40 h sem coleta → atrasada
    expect(isMarketStale(40, new Date("2026-11-11T13:00:00Z"))).toBe(true);
    expect(isMarketStale(Infinity)).toBe(true);
  });
});

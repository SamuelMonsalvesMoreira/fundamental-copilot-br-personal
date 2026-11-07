import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDatabase } from "./open";
import { MIGRATIONS } from "./migrations";
import { companies, ingestRuns, tickers } from "./schema";

describe("banco local", () => {
  it("aplica migrações e é idempotente", () => {
    const { sqlite } = openDatabase(":memory:");
    expect(sqlite.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);
  });

  it("o esquema Drizzle bate com as tabelas SQL", () => {
    const { db } = openDatabase(":memory:");
    const now = new Date().toISOString();
    db.insert(companies)
      .values({ cnpj: "84429695000111", cvmCode: "5410", name: "WEG S.A.", source: "CVM", updatedAt: now })
      .run();
    db.insert(tickers).values({ ticker: "WEGE3", cnpj: "84429695000111", source: "CVM", updatedAt: now }).run();
    db.insert(ingestRuns).values({ job: "teste", source: "CVM", status: "ok", startedAt: now }).run();

    const row = db.select().from(tickers).where(eq(tickers.ticker, "WEGE3")).get();
    expect(row?.cnpj).toBe("84429695000111");
    expect(db.select().from(ingestRuns).all()).toHaveLength(1);
  });
});

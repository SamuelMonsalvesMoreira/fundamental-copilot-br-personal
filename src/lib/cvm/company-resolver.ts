import { B3_UNIVERSE } from "@/data/b3-universe";
import { getYahooSecurityProfile } from "@/lib/market-data/yahoo";
import { getCvmCompanyByTicker } from "./company-map";
import type { CvmCompany, CvmRegistryCompany } from "./types";

const CVM_REGISTRY_URL =
  "https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv";
const REGISTRY_TTL_MS = 24 * 60 * 60 * 1000;

const LEGAL_STOP_WORDS = new Set([
  "a", "as", "da", "das", "de", "do", "dos", "e",
  "sa", "s", "cia", "companhia", "participacao", "participacoes",
  "holding", "holdings", "brasil", "brasileira", "brasileiro",
]);

let registryCache: { rows: CvmRegistryCompany[]; loadedAt: number } | null = null;
let registryPromise: Promise<CvmRegistryCompany[]> | null = null;
const resolutionCache = new Map<string, ResolvedCvmCompany | null>();

export interface ResolvedCvmCompany extends CvmCompany {
  resolutionSource: "static_map" | "cvm_registry_match";
  matchConfidence: number;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function meaningfulTokens(value: string): string[] {
  return normalizeName(value)
    .split(/\s+/)
    .filter(token => token.length >= 2 && !LEGAL_STOP_WORDS.has(token));
}

/** Pure and exported for regression tests. */
export function scoreCompanyNameMatch(left: string, right: string): number {
  const leftTokens = meaningfulTokens(left);
  const rightTokens = meaningfulTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const a = new Set(leftTokens);
  const b = new Set(rightTokens);
  const intersection = [...a].filter(token => b.has(token));
  if (intersection.length === 0) return 0;

  const compactLeft = leftTokens.join("");
  const compactRight = rightTokens.join("");
  if (compactLeft === compactRight) return 1;

  const coverage = intersection.length / Math.max(a.size, b.size);
  const containment =
    compactLeft.length >= 5 && compactRight.length >= 5 &&
    (compactLeft.includes(compactRight) || compactRight.includes(compactLeft));

  const distinctiveOverlap = intersection.some(token => token.length >= 5);
  const bonus = containment ? 0.2 : distinctiveOverlap ? 0.08 : 0;
  return Math.min(1, coverage + bonus);
}

/** Parses only active companies from the public CVM company registry. */
export function parseCvmRegistryCsv(text: string): CvmRegistryCompany[] {
  const rows: CvmRegistryCompany[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    const columns = line.split(";");
    if (columns.length < 10) continue;

    const status = columns[7]?.trim();
    const cvmCode = columns[9]?.trim();
    const companyName = columns[1]?.trim();
    if (status !== "ATIVO" || !cvmCode || !companyName) continue;

    rows.push({
      cnpj: columns[0]?.trim() ?? "",
      companyName,
      tradingName: columns[2]?.trim() || undefined,
      cvmCode: String(parseInt(cvmCode, 10)),
      status,
    });
  }

  return rows;
}

async function loadCvmRegistry(): Promise<CvmRegistryCompany[]> {
  if (registryCache && Date.now() - registryCache.loadedAt < REGISTRY_TTL_MS) {
    return registryCache.rows;
  }
  if (registryPromise) return registryPromise;

  registryPromise = (async () => {
    try {
      const response = await fetch(CVM_REGISTRY_URL, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return registryCache?.rows ?? [];
      const bytes = await response.arrayBuffer();
      const text = new TextDecoder("windows-1252").decode(bytes);
      const rows = parseCvmRegistryCsv(text);
      if (rows.length > 0) registryCache = { rows, loadedAt: Date.now() };
      return rows;
    } catch {
      return registryCache?.rows ?? [];
    } finally {
      registryPromise = null;
    }
  })();

  return registryPromise;
}

function staticResolution(ticker: string): ResolvedCvmCompany | null {
  const company = getCvmCompanyByTicker(ticker);
  if (!company?.hasCvmMapping || !company.cvmCode) return null;
  return {
    ...company,
    resolutionSource: "static_map",
    matchConfidence: 1,
  };
}

/**
 * Resolves an unregistered ticker by using Yahoo only to discover its display
 * name, then matching that name against the authoritative active-company CVM
 * registry. Low-confidence matches are rejected instead of guessing.
 */
export async function resolveCvmCompanyByTicker(
  rawTicker: string,
): Promise<ResolvedCvmCompany | null> {
  const ticker = rawTicker.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{4}\d{1,2}$/.test(ticker)) return null;

  const staticCompany = staticResolution(ticker);
  if (staticCompany) return staticCompany;
  if (resolutionCache.has(ticker)) return resolutionCache.get(ticker) ?? null;

  const asset = B3_UNIVERSE.find(item => item.ticker === ticker);
  const yahoo = await getYahooSecurityProfile(ticker);
  const candidateNames = [
    asset?.companyName,
    asset?.tradingName,
    yahoo?.longName,
    yahoo?.shortName,
  ].filter((value): value is string => Boolean(value?.trim()));

  if (candidateNames.length === 0) {
    resolutionCache.set(ticker, null);
    return null;
  }

  const registry = await loadCvmRegistry();
  let best: { row: CvmRegistryCompany; score: number } | null = null;

  for (const row of registry) {
    const registryNames = [row.companyName, row.tradingName].filter(
      (value): value is string => Boolean(value?.trim()),
    );
    for (const candidateName of candidateNames) {
      for (const registryName of registryNames) {
        const score = scoreCompanyNameMatch(candidateName, registryName);
        if (!best || score > best.score) best = { row, score };
      }
    }
  }

  // Require a strong match. A false CVM identity is worse than no analysis.
  if (!best || best.score < 0.68) {
    resolutionCache.set(ticker, null);
    return null;
  }

  const resolved: ResolvedCvmCompany = {
    ticker,
    tradingName: asset?.tradingName ?? yahoo?.shortName ?? best.row.tradingName ?? ticker,
    companyName: best.row.companyName,
    cvmCode: best.row.cvmCode,
    cnpj: best.row.cnpj,
    sector: asset?.sector,
    hasCvmMapping: true,
    resolutionSource: "cvm_registry_match",
    matchConfidence: best.score,
  };

  resolutionCache.set(ticker, resolved);
  return resolved;
}



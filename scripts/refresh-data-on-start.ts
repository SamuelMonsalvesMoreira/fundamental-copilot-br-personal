/**
 * Checks the official CVM archives before starting the development server.
 * Heavy cache rebuilds only run when the remote archive version changed.
 *
 * This script is intentionally fail-open: a network/CVM failure never blocks
 * `npm run dev`; the application keeps the last valid cache and its API routes
 * can still use the live fallback.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

type SourceName = "itr" | "dfp" | "ipe";

interface RefreshState {
  checkedAt: string;
  sources: Partial<Record<SourceName, string>>;
}

const projectRoot = process.cwd();
const statePath = join(projectRoot, ".data-refresh-state.json");
const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const currentYear = new Date().getFullYear();
const annualYear = currentYear - 1;

const sourceUrls: Record<SourceName, string> = {
  itr: `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${currentYear}.zip`,
  dfp: `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${annualYear}.zip`,
  ipe: `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_${currentYear}.zip`,
};

function readState(): RefreshState | null {
  if (!existsSync(statePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf-8")) as RefreshState;
    return parsed && typeof parsed.sources === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function remoteFingerprint(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const etag = response.headers.get("etag") ?? "";
    const modified = response.headers.get("last-modified") ?? "";
    const length = response.headers.get("content-length") ?? "";
    const fingerprint = [etag, modified, length].filter(Boolean).join("|");
    return fingerprint || null;
  } catch {
    return null;
  }
}

function runScript(
  script: string,
  env: Record<string, string | undefined> = {},
  args: string[] = [],
): boolean {
  const result = spawnSync(
    process.execPath,
    ["--max-old-space-size=4096", tsxCli, join(projectRoot, "scripts", script), ...args],
    {
      cwd: projectRoot,
      stdio: "inherit",
      env: { ...process.env, ...env },
    },
  );
  return result.status === 0;
}

async function main(): Promise<void> {
  if (process.env.SKIP_DATA_REFRESH === "1") {
    console.log("[dados] Atualização automática ignorada por SKIP_DATA_REFRESH=1.");
    return;
  }

  console.log("[dados] Verificando versões mais recentes na CVM...");
  const previous = readState();
  const entries = await Promise.all(
    (Object.keys(sourceUrls) as SourceName[]).map(async name => [
      name,
      await remoteFingerprint(sourceUrls[name]),
    ] as const),
  );
  const fingerprints = Object.fromEntries(entries) as Partial<Record<SourceName, string>>;
  const reachable = entries.filter(([, fingerprint]) => fingerprint !== null);

  if (reachable.length === 0) {
    console.warn("[dados] CVM indisponível. Mantendo o último cache válido.");
    return;
  }

  const forced = process.env.FORCE_DATA_REFRESH === "1";
  const changed = (name: SourceName) =>
    Boolean(fingerprints[name]) && (forced || previous?.sources[name] !== fingerprints[name]);
  const dfpChanged = changed("dfp");
  const itrChanged = changed("itr");
  const ipeChanged = changed("ipe");

  if (process.argv.includes("--check-only")) {
    const names = (["dfp", "itr", "ipe"] as SourceName[]).filter(changed);
    console.log(`[dados] Fontes com atualização: ${names.length > 0 ? names.join(", ") : "nenhuma"}.`);
    return;
  }

  if (!dfpChanged && !itrChanged && !ipeChanged) {
    console.log("[dados] Cache já está sincronizado com a CVM.");
    writeFileSync(statePath, JSON.stringify({ checkedAt: new Date().toISOString(), sources: fingerprints }, null, 2));
    return;
  }

  let ok = true;
  if (dfpChanged) {
    console.log(`[dados] Nova DFP ${annualYear} detectada. Atualizando dados anuais e documentos...`);
    ok = runScript("precompute-cvm-cache.ts") && ok;
  } else if (ipeChanged) {
    console.log("[dados] Novas publicações corporativas detectadas. Atualizando documentos...");
    ok = runScript("precompute-cvm-cache.ts", {}, ["--documents-only"]) && ok;
  }

  if (itrChanged || dfpChanged) {
    const startYear = dfpChanged ? annualYear : currentYear;
    console.log(`[dados] Atualizando trimestres ${startYear}–${currentYear} e projeções...`);
    ok = runScript("precompute-cvm-quarterly-cache.ts", {
      CVM_ITR_START_YEAR: String(startYear),
      CVM_ITR_END_YEAR: String(currentYear),
      CVM_ITR_MERGE: "1",
    }) && ok;
    ok = runScript("precompute-time-series-cache.ts") && ok;
    ok = runScript("precompute-baseline-forecasts.ts") && ok;
  }

  if (ok) {
    writeFileSync(statePath, JSON.stringify({ checkedAt: new Date().toISOString(), sources: fingerprints }, null, 2));
    console.log("[dados] Dados CVM e projeções atualizados.");
  } else {
    console.warn("[dados] A atualização ficou incompleta; o projeto iniciará com o último cache válido.");
  }
}

main().catch(error => {
  console.warn(`[dados] Não foi possível atualizar agora: ${error instanceof Error ? error.message : String(error)}`);
  // Do not rethrow: predev must never prevent the local application from opening.
});


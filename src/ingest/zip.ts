import { unzipSync } from "fflate";

/** Lista os arquivos dentro de um ZIP sem descompactá-los. */
export function listZipEntries(zip: Uint8Array): string[] {
  const names: string[] = [];
  unzipSync(zip, {
    filter: (f) => {
      names.push(f.name);
      return false;
    },
  });
  return names;
}

/**
 * Extrai um único arquivo do ZIP (descompacta só ele, para economizar memória).
 * Retorna null se o arquivo não existir.
 */
export function extractZipEntry(zip: Uint8Array, name: string): Uint8Array | null {
  const out = unzipSync(zip, { filter: (f) => f.name === name });
  return out[name] ?? null;
}

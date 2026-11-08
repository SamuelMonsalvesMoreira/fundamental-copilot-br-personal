/** HTTP com nova tentativa e tempo limite, usado por todas as coletas. */

const USER_AGENT = "fundamental-copilot-br/1.0 (uso pessoal; dados abertos)";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

interface FetchOptions {
  method?: "GET" | "HEAD";
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { method = "GET", timeoutMs = 120_000, retries = 3, headers = {} } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: { "User-Agent": USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      // 4xx (exceto 429) não melhora tentando de novo
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) return res;
      lastError = new HttpError(`HTTP ${res.status} em ${url}`, res.status);
    } catch (err) {
      lastError = err;
    }
    if (attempt < retries) await sleep(1000 * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new HttpError(`Falha ao acessar ${url}`);
}

/** Baixa um arquivo inteiro para a memória. Retorna null se não existir (404). */
export async function downloadBuffer(url: string, timeoutMs = 600_000): Promise<Uint8Array | null> {
  const res = await fetchWithRetry(url, { timeoutMs });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(`HTTP ${res.status} em ${url}`, res.status);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * "Versão" de um arquivo remoto (Last-Modified + tamanho), usada para
 * pular downloads quando nada mudou. null se o arquivo não existir.
 */
export async function remoteVersion(url: string): Promise<string | null> {
  const res = await fetchWithRetry(url, { method: "HEAD", timeoutMs: 30_000 });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(`HTTP ${res.status} em ${url}`, res.status);
  const lm = res.headers.get("last-modified") ?? "";
  const len = res.headers.get("content-length") ?? "";
  const etag = res.headers.get("etag") ?? "";
  return [lm, len, etag].filter(Boolean).join(" | ") || null;
}

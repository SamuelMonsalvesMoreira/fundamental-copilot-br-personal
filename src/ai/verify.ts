/**
 * Verificação de números citados pela IA.
 *
 * Toda resposta é conferida contra os números que as ferramentas
 * devolveram naquela conversa. Números do texto que não batem com nenhum
 * dado consultado (considerando arredondamento e mudança de unidade, como
 * fração → % ou R$ → R$ bi) são marcados como "não verificados" e
 * mostrados ao usuário. Isso não prova que o número está errado — só que
 * ele não veio diretamente das ferramentas.
 */

export interface CitedNumber {
  raw: string;
  value: number;
  decimals: number;
  /** multiplicador aplicado pelo sufixo (bi = 1e9...), 1 sem sufixo */
  scale: number;
  unit: "percent" | "multiple" | "currency" | "plain";
}

/** Coleta todos os números de um objeto JSON (resultado de ferramenta). */
export function collectNumbers(data: unknown, out: number[] = []): number[] {
  if (typeof data === "number" && Number.isFinite(data)) out.push(data);
  else if (typeof data === "string") {
    for (const n of extractNumbers(data)) out.push(n.value);
  } else if (Array.isArray(data)) for (const d of data) collectNumbers(d, out);
  else if (data && typeof data === "object") for (const v of Object.values(data)) collectNumbers(v, out);
  return out;
}

// número pt-BR: 1.234,56 | 40,8 | -3 | 1234.5 (aceita também ponto decimal simples)
const NUM_RE = /(?<![\w/])(-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?|-?\d+\.\d+)(\s*(?:%|x\b|vezes\b|p\.p\.|bi\b|bilh[õo]es?\b|mi\b|milh[õo]es?\b|mil\b|tri\b|trilh[õo]es?\b))?/gi;

/** Extrai números de um texto em português. */
export function extractNumbers(text: string): CitedNumber[] {
  const out: CitedNumber[] = [];
  for (const m of text.matchAll(NUM_RE)) {
    const raw = m[1];
    let norm: string;
    if (raw.includes(",")) norm = raw.replace(/\./g, "").replace(",", ".");
    else if (/^\-?\d{1,3}(\.\d{3})+$/.test(raw)) norm = raw.replace(/\./g, "");
    else norm = raw;
    let value = Number(norm);
    if (!Number.isFinite(value)) continue;
    const decimals = norm.includes(".") ? norm.split(".")[1].length : 0;
    const suffix = (m[2] ?? "").trim().toLowerCase();
    let unit: CitedNumber["unit"] = "plain";
    let scale = 1;
    if (suffix === "%" || suffix === "p.p.") unit = "percent";
    else if (suffix === "x" || suffix === "vezes") unit = "multiple";
    else if (suffix) {
      unit = "currency";
      if (suffix.startsWith("bi")) scale = 1e9;
      else if (suffix === "mil") scale = 1e3;
      else if (suffix === "mi" || suffix.startsWith("milh")) scale = 1e6;
      else if (suffix.startsWith("tri")) scale = 1e12;
    }
    value *= scale;
    out.push({ raw: m[0].trim(), value, decimals, scale, unit });
  }
  return out;
}

/** Números que não precisam de verificação: anos, datas, contagens pequenas. */
function isExempt(n: CitedNumber, text: string, raw: string): boolean {
  if (n.unit === "plain") {
    if (Number.isInteger(n.value) && n.value >= 1990 && n.value <= 2040) return true; // anos
    if (Number.isInteger(n.value) && Math.abs(n.value) <= 12) return true; // "5 anos", "3T26"
    // partes de data (07/11/2026) ou de código (3T26, PETR4)
    if (new RegExp(`\\d/${raw}|${raw}/\\d|\\d[TQ]${raw}`).test(text)) return true;
  }
  return false;
}

/** Variações de unidade de um número de origem. */
function variants(v: number): number[] {
  return [v, v * 100, v / 100, v * 1000, v / 1000, v * 1e6, v / 1e6, v * 1e9, v / 1e9];
}

function matches(cited: CitedNumber, source: number): boolean {
  // tolerância: meia unidade da última casa exibida (na escala do sufixo) ou 0,6%
  const unitTol = 0.5 * Math.pow(10, -cited.decimals) * cited.scale;
  for (const s of variants(source)) {
    const diff = Math.abs(Math.abs(cited.value) - Math.abs(s));
    if (diff <= Math.max(unitTol, Math.abs(s) * 0.006)) return true;
  }
  return false;
}

export interface Verification {
  checked: number;
  unverified: string[];
}

export function verifyAnswer(text: string, sourceNumbers: number[]): Verification {
  const cited = extractNumbers(text);
  const unverified: string[] = [];
  let checked = 0;
  for (const c of cited) {
    const digits = c.raw.match(/-?[\d.,]+/)?.[0] ?? c.raw;
    if (isExempt(c, text, digits)) continue;
    checked++;
    if (!sourceNumbers.some((s) => matches(c, s))) unverified.push(c.raw);
  }
  return { checked, unverified: [...new Set(unverified)] };
}

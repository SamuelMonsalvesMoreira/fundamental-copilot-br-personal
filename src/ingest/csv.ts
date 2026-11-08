/**
 * Leitor de CSV no formato da CVM: separador ";", codificação Latin-1,
 * primeira linha com cabeçalho, aspas opcionais.
 */

/** Decodifica bytes Latin-1 (ISO-8859-1), o padrão dos arquivos da CVM. */
export function decodeLatin1(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

/** Divide uma linha respeitando campos entre aspas ("a;b" vira um campo). */
export function splitCsvLine(line: string, sep = ";"): string[] {
  if (!line.includes('"')) return line.split(sep);
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Percorre as linhas como objetos { coluna: valor } sem montar um array
 * gigante na memória.
 */
export function* iterateCsv(text: string, sep = ";"): Generator<Record<string, string>> {
  let pos = 0;
  const nextLine = (): string | null => {
    if (pos >= text.length) return null;
    let end = text.indexOf("\n", pos);
    if (end === -1) end = text.length;
    let line = text.slice(pos, end);
    pos = end + 1;
    if (line.endsWith("\r")) line = line.slice(0, -1);
    return line;
  };

  const headerLine = nextLine();
  if (headerLine === null) return;
  const header = splitCsvLine(headerLine.replace(/^﻿/, ""), sep);

  for (let line = nextLine(); line !== null; line = nextLine()) {
    if (line === "") continue;
    const cells = splitCsvLine(line, sep);
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? "";
    yield row;
  }
}

/** Número no formato da CVM ("123.4500000000", com ponto decimal). */
export function parseCvmNumber(s: string | undefined): number | null {
  if (s === undefined || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

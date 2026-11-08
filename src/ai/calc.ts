/**
 * Calculadora segura para a ferramenta `calcular` do copiloto.
 * Aceita números (ponto ou vírgula decimal), + - * / ^, parênteses e
 * sinal unário. Nada de eval: um parser de precedência simples.
 */

type Tok = { t: "num"; v: number } | { t: "op"; v: string } | { t: "(" } | { t: ")" };

function tokenize(expr: string): Tok[] {
  const s = expr.replace(/\s+/g, "");
  if (s.length === 0 || s.length > 300) throw new Error("expressão vazia ou longa demais");
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.,]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.,]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      // vírgula = decimal; pontos só como decimal se não houver vírgula
      const norm = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
      const v = Number(norm);
      if (!Number.isFinite(v)) throw new Error(`número inválido: ${raw}`);
      out.push({ t: "num", v });
      i = j;
    } else if ("+-*/^".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
    } else if (c === "(") {
      out.push({ t: "(" });
      i++;
    } else if (c === ")") {
      out.push({ t: ")" });
      i++;
    } else {
      throw new Error(`caractere não permitido: ${c}`);
    }
  }
  return out;
}

export function calculate(expr: string): number {
  const toks = tokenize(expr);
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];

  // expr := term (('+'|'-') term)*
  function parseExpr(): number {
    let v = parseTerm();
    while (peek()?.t === "op" && ["+", "-"].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  // term := power (('*'|'/') power)*
  function parseTerm(): number {
    let v = parsePower();
    while (peek()?.t === "op" && ["*", "/"].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      const r = parsePower();
      if (op === "/" && r === 0) throw new Error("divisão por zero");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  // power := unary ('^' power)?   (associativa à direita)
  function parsePower(): number {
    const base = parseUnary();
    if (peek()?.t === "op" && (peek() as { v: string }).v === "^") {
      next();
      return Math.pow(base, parsePower());
    }
    return base;
  }
  function parseUnary(): number {
    const p = peek();
    if (p?.t === "op" && (p.v === "-" || p.v === "+")) {
      next();
      const v = parseUnary();
      return p.v === "-" ? -v : v;
    }
    return parsePrimary();
  }
  function parsePrimary(): number {
    const p = next();
    if (!p) throw new Error("expressão incompleta");
    if (p.t === "num") return p.v;
    if (p.t === "(") {
      const v = parseExpr();
      if (next()?.t !== ")") throw new Error("parêntese não fechado");
      return v;
    }
    throw new Error("expressão inválida");
  }

  const result = parseExpr();
  if (pos !== toks.length) throw new Error("expressão inválida");
  if (!Number.isFinite(result)) throw new Error("resultado não finito");
  return result;
}

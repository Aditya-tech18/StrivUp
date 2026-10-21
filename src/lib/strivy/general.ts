/**
 * src/lib/strivy/general.ts
 *
 * Helpers for general (non-STRIVUP) questions:
 *
 *  - solveMath(): "2+2?" is answered exactly, without a model and without
 *    eval(). A tiny recursive-descent parser over + - * / % ^ and brackets.
 *  - wantsRedirect(): whether a general answer gets a short "ask me about
 *    STRIVUP too" line. About half the time, never twice in a row, so it
 *    doesn't read like a footer stuck on every reply.
 */

/** The value of a plain sum, or null if the text isn't one (or is unsafe/huge). */
export function solveMath(message: string): number | null {
  const expr = message
    .toLowerCase()
    .replace(/^(what is|whats|what s|calculate|solve)\s*/, "")
    .replace(/\s*(=|equals|kitna hota hai|kitna hai|kitna|kya hai|hota hai)?\s*\??\s*$/, "")
    .replace(/[x×]/g, "*")
    .replace(/÷/g, "/")
    .replace(/\s+/g, "");
  if (!expr || expr.length > 60 || !/^[\d.+\-*/%^()]+$/.test(expr) || !/[+\-*/%^]/.test(expr))
    return null;

  let i = 0;
  const peek = () => expr[i];
  function number(): number {
    const m = /^\d+(?:\.\d+)?/.exec(expr.slice(i));
    if (!m) throw new Error("number");
    i += m[0].length;
    return Number(m[0]);
  }
  function factor(): number {
    if (peek() === "-") {
      i++;
      return -factor();
    }
    if (peek() === "(") {
      i++;
      const v = sum();
      if (peek() !== ")") throw new Error(")");
      i++;
      return v;
    }
    return number();
  }
  function power(): number {
    const base = factor();
    if (peek() === "^") {
      i++;
      const exp = power();
      if (Math.abs(exp) > 64) throw new Error("big");
      return base ** exp;
    }
    return base;
  }
  function product(): number {
    let v = power();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = expr[i++];
      const r = power();
      if ((op === "/" || op === "%") && r === 0) throw new Error("div0");
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function sum(): number {
    let v = product();
    while (peek() === "+" || peek() === "-") {
      const op = expr[i++];
      const r = product();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  try {
    const value = sum();
    if (i !== expr.length || !Number.isFinite(value) || Math.abs(value) > 1e15) return null;
    return value;
  } catch {
    return null;
  }
}

/** A number as people write it: 4, 2.5, 0.333333 (6 decimals at most). */
export function formatAnswer(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6)));
}

function hash(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * About 60% of general answers get a redirect, picked from the message so
 * it's stable for tests. Never when the previous reply already had one.
 */
export function wantsRedirect(message: string, previousHadRedirect: boolean): boolean {
  if (previousHadRedirect) return false;
  return hash(message.trim().toLowerCase()) % 10 < 6;
}

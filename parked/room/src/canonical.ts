/**
 * Canonical bytes (R-SIG-2, R-SIG-3) and a strict JSON parser.
 *
 * - `canonicalize` writes the RFC 8785 (JCS) form of a value in the signed
 *   profile: safe integers only, no negative zero, well-formed strings, plain
 *   objects and arrays only, no `undefined`.
 * - `parseStrict` reads JSON text and refuses duplicate keys, numbers that
 *   are not safe integers, and lone surrogates (R-SIG-3).
 *
 * Both are pure and synchronous, so sealing can run inside one SQLite
 * transaction with no `await` (R-ADM-6, R-LOG-2).
 */

export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalError";
  }
}

/** True when the string has no lone surrogate (R-SIG-3). */
export function wellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

function str(s: string): string {
  if (!wellFormed(s)) throw new CanonicalError("a string has a lone surrogate");
  // JSON.stringify escapes exactly as RFC 8785 section 3.2.2.2 requires.
  return JSON.stringify(s);
}

/** The RFC 8785 text of `value`. Throws `CanonicalError` outside the signed profile. */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) throw new CanonicalError("a number is not a safe integer");
      if (Object.is(value, -0)) throw new CanonicalError("negative zero is not allowed");
      return String(value);
    case "string":
      return str(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new CanonicalError("only plain objects can be signed");
      const obj = value as Record<string, unknown>;
      // RFC 8785 sorts keys by UTF-16 code units, which is JavaScript's default order.
      const keys = Object.keys(obj).sort();
      const parts: string[] = [];
      for (const k of keys) {
        const v = obj[k];
        if (v === undefined) throw new CanonicalError(`field ${k} is undefined; omit absent fields`);
        parts.push(`${str(k)}:${canonicalize(v)}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new CanonicalError(`a ${typeof value} cannot be signed`);
  }
}

const encoder = new TextEncoder();

export function utf8(s: string): Uint8Array {
  return encoder.encode(s);
}

/** The canonical bytes of `value` (R-SIG-2). */
export function canonicalBytes(value: unknown): Uint8Array {
  return utf8(canonicalize(value));
}

// ------------------------------------------------------------ strict parser

/** Parse JSON text in the signed profile. Throws `CanonicalError` on anything else (R-SIG-3). */
export function parseStrict(text: string): unknown {
  let i = 0;
  const ws = () => {
    while (i < text.length) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++;
      else break;
    }
  };
  const fail = (what: string): never => {
    throw new CanonicalError(`invalid JSON at ${i}: ${what}`);
  };
  let depth = 0;
  const value = (): unknown => {
    ws();
    const c = text[i];
    if (c === "{") return object();
    if (c === "[") return array();
    if (c === '"') return string();
    if (c === "t") return literal("true", true);
    if (c === "f") return literal("false", false);
    if (c === "n") return literal("null", null);
    if (c === "-" || (c !== undefined && c >= "0" && c <= "9")) return number();
    return fail("unexpected character");
  };
  const literal = (word: string, v: unknown) => {
    if (text.startsWith(word, i)) {
      i += word.length;
      return v;
    }
    return fail(`expected ${word}`);
  };
  const number = () => {
    const m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(text.slice(i, i + 40));
    if (!m) return fail("bad number");
    i += m[0].length;
    if (m[2] !== undefined || m[3] !== undefined) fail("only integers are allowed");
    const n = Number(m[0]);
    if (!Number.isSafeInteger(n)) fail("number is not a safe integer");
    if (Object.is(n, -0)) fail("negative zero is not allowed");
    return n;
  };
  const string = (): string => {
    i++; // opening quote
    let out = "";
    for (;;) {
      if (i >= text.length) fail("unterminated string");
      const c = text.charCodeAt(i);
      if (c === 0x22) {
        i++;
        break;
      }
      if (c < 0x20) fail("control character in string");
      if (c === 0x5c) {
        const e = text[i + 1];
        i += 2;
        switch (e) {
          case '"': out += '"'; break;
          case "\\": out += "\\"; break;
          case "/": out += "/"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "n": out += "\n"; break;
          case "r": out += "\r"; break;
          case "t": out += "\t"; break;
          case "u": {
            const hex = text.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("bad unicode escape");
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
            break;
          }
          default:
            fail("bad escape");
        }
        continue;
      }
      out += text[i];
      i++;
    }
    if (!wellFormed(out)) fail("lone surrogate in string");
    return out;
  };
  const array = () => {
    if (++depth > 64) fail("nesting too deep");
    i++;
    const out: unknown[] = [];
    ws();
    if (text[i] === "]") {
      i++;
      depth--;
      return out;
    }
    for (;;) {
      out.push(value());
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        break;
      }
      fail("expected , or ]");
    }
    depth--;
    return out;
  };
  const object = () => {
    if (++depth > 64) fail("nesting too deep");
    i++;
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const seen = new Set<string>();
    ws();
    if (text[i] === "}") {
      i++;
      depth--;
      return toPlain(out);
    }
    for (;;) {
      ws();
      if (text[i] !== '"') fail("expected a key");
      const k = string();
      if (seen.has(k)) fail(`duplicate key ${JSON.stringify(k)}`);
      seen.add(k);
      ws();
      if (text[i] !== ":") fail("expected :");
      i++;
      out[k] = value();
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") {
        i++;
        break;
      }
      fail("expected , or }");
    }
    depth--;
    return toPlain(out);
  };
  const result = value();
  ws();
  if (i !== text.length) fail("trailing characters");
  return result;
}

/** Copy a null-prototype object onto a plain one, keeping `__proto__` as an ordinary key. */
function toPlain(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) Object.defineProperty(out, k, { value: o[k], enumerable: true, writable: true, configurable: true });
  return out;
}

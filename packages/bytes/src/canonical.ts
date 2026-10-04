/**
 * Canonical JSON and a strict parser (scope contract, section 2.1).
 *
 * `canonicalize` writes the RFC 8785 form of a value in Artroom's profile,
 * which is narrower than RFC 8785: every number is a safe integer and never
 * negative zero; strings have no lone surrogate; only plain objects and
 * arrays; no `undefined` and no array hole; at most 64 levels deep. Within
 * that profile one value has exactly one byte form, and the output is what
 * RFC 8785 gives.
 *
 * `parseStrict` reads JSON text in the same profile and also refuses
 * duplicate keys. Both are pure and synchronous, so a scope can seal an entry
 * inside one storage transaction. Both throw `CanonicalError` and nothing
 * else.
 */

export class CanonicalError extends Error {
  override readonly name = "CanonicalError";
}

/** Deeper values are refused, so hostile or cyclic input cannot exhaust the stack. */
export const MAX_DEPTH = 64;

const encoder = new TextEncoder();
// `ignoreBOM` keeps a leading byte order mark in the text, where the parser refuses it.
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

/** True when the string has no lone surrogate. RFC 8785 section 3.2.2.2 makes one an error. */
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
  // For a well-formed string, JSON.stringify escapes exactly as RFC 8785 section 3.2.2.2 requires.
  return JSON.stringify(s);
}

function write(value: unknown, depth: number): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) throw new CanonicalError("a number is not a safe integer");
      if (Object.is(value, -0)) throw new CanonicalError("negative zero is not allowed");
      // For a safe integer this is the ECMAScript form that RFC 8785 section 3.2.2.3 requires.
      return String(value);
    case "string":
      return str(value);
    case "object": {
      if (depth >= MAX_DEPTH) throw new CanonicalError("nesting too deep");
      if (Array.isArray(value)) {
        // By index, not `map`: `map` skips a hole, which would then be written as nothing.
        const parts: string[] = [];
        for (let i = 0; i < value.length; i++) parts.push(write(value[i], depth + 1));
        return `[${parts.join(",")}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new CanonicalError("only plain objects and arrays are allowed");
      const obj = value as Record<string, unknown>;
      // RFC 8785 section 3.2.3 sorts keys by UTF-16 code units, which is JavaScript's default order.
      const parts: string[] = [];
      for (const k of Object.keys(obj).sort()) {
        const v = obj[k];
        if (v === undefined) throw new CanonicalError(`field ${k} is undefined; omit absent fields`);
        parts.push(`${str(k)}:${write(v, depth + 1)}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new CanonicalError(`a ${typeof value} is not allowed`);
  }
}

/** The RFC 8785 text of `value`. Throws `CanonicalError` outside the profile. */
export function canonicalize(value: unknown): string {
  return write(value, 0);
}

/** The UTF-8 bytes of the canonical text. */
export function canonicalBytes(value: unknown): Uint8Array {
  return utf8(canonicalize(value));
}

/** Parse UTF-8 bytes in the profile. Malformed UTF-8 and a byte order mark are refused. */
export function parseStrictBytes(bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    throw new CanonicalError("the bytes are not UTF-8");
  }
  return parseStrict(text);
}

/** Parse JSON text in the profile. Throws `CanonicalError` on anything else. */
export function parseStrict(text: string): unknown {
  let i = 0;
  let depth = 0;
  const fail = (what: string): never => {
    throw new CanonicalError(`invalid JSON at ${i}: ${what}`);
  };
  const ws = () => {
    for (;;) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++;
      else break;
    }
  };
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
    if (!text.startsWith(word, i)) fail(`expected ${word}`);
    i += word.length;
    return v;
  };
  const number = () => {
    // 40 characters hold any safe integer; a longer run of digits fails the safe-integer check.
    const m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(text.slice(i, i + 40));
    if (!m) return fail("bad number");
    if (m[2] !== undefined || m[3] !== undefined) fail("only integers are allowed");
    const n = Number(m[0]);
    if (!Number.isSafeInteger(n)) fail("a number is not a safe integer");
    if (Object.is(n, -0)) fail("negative zero is not allowed");
    i += m[0].length;
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
    if (++depth > MAX_DEPTH) fail("nesting too deep");
    i++;
    const out: unknown[] = [];
    ws();
    if (text[i] === "]") i++;
    else
      for (;;) {
        out.push(value());
        ws();
        const c = text[i++];
        if (c === "]") break;
        if (c !== ",") fail("expected , or ]");
      }
    depth--;
    return out;
  };
  const object = () => {
    if (++depth > MAX_DEPTH) fail("nesting too deep");
    i++;
    const out: Record<string, unknown> = {};
    const seen = new Set<string>();
    ws();
    if (text[i] === "}") i++;
    else
      for (;;) {
        ws();
        if (text[i] !== '"') fail("expected a key");
        const k = string();
        if (seen.has(k)) fail(`duplicate key ${JSON.stringify(k)}`);
        seen.add(k);
        ws();
        if (text[i++] !== ":") fail("expected :");
        // defineProperty, so that `__proto__` is an ordinary key and not the prototype.
        Object.defineProperty(out, k, { value: value(), enumerable: true, writable: true, configurable: true });
        ws();
        const c = text[i++];
        if (c === "}") break;
        if (c !== ",") fail("expected , or }");
      }
    depth--;
    return out;
  };
  const result = value();
  ws();
  if (i !== text.length) fail("trailing characters");
  return result;
}

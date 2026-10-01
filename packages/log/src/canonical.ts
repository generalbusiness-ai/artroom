/**
 * Canonical bytes (R-SIG-2, R-SIG-3) and a strict JSON parser.
 *
 * `canonicalize` writes the RFC 8785 (JCS) form of a value in the signed
 * profile. `parseStrict` reads JSON text and refuses duplicate keys, numbers
 * that are not safe integers, and lone surrogates. Both are synchronous.
 */

export class CanonicalError extends Error {
  override readonly name = "CanonicalError";
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

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
      if (!wellFormed(value)) throw new CanonicalError("a string has a lone surrogate");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new CanonicalError("only plain objects can be signed");
      const obj = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const k of Object.keys(obj).sort()) {
        const v = obj[k];
        if (v === undefined) throw new CanonicalError(`field ${k} is undefined`);
        if (!wellFormed(k)) throw new CanonicalError("a key has a lone surrogate");
        parts.push(`${JSON.stringify(k)}:${canonicalize(v)}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new CanonicalError(`a ${typeof value} cannot be signed`);
  }
}

export function canonicalBytes(value: unknown): Uint8Array {
  return utf8(canonicalize(value));
}

/** Parse JSON text, refusing duplicate keys, unsafe numbers and lone surrogates (R-SIG-3). */
export function parseStrict(text: string): unknown {
  let i = 0;
  const fail = (msg: string): never => {
    throw new CanonicalError(`${msg} at offset ${i}`);
  };
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i]!)) i++;
  };
  const value = (): unknown => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      const seen = new Set<string>();
      ws();
      if (text[i] === "}") {
        i++;
        return { ...out };
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail("expected a key");
        const k = string();
        if (seen.has(k)) fail(`duplicate key ${JSON.stringify(k)}`);
        seen.add(k);
        ws();
        if (text[i++] !== ":") fail("expected :");
        Object.defineProperty(out, k, { value: value(), enumerable: true, writable: true, configurable: true });
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
      const plain: Record<string, unknown> = {};
      for (const k of Object.keys(out)) Object.defineProperty(plain, k, { value: out[k], enumerable: true, writable: true, configurable: true });
      return plain;
    }
    if (c === "[") {
      i++;
      const out: unknown[] = [];
      ws();
      if (text[i] === "]") {
        i++;
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
      return out;
    }
    if (c === '"') return string();
    if (text.startsWith("true", i)) return (i += 4), true;
    if (text.startsWith("false", i)) return (i += 5), false;
    if (text.startsWith("null", i)) return (i += 4), null;
    const m = /^-?(0|[1-9][0-9]*)/.exec(text.slice(i, i + 40));
    if (!m) return fail("unexpected character");
    if (/^[.eE]/.test(text[i + m[0].length] ?? "")) fail("only integers are allowed");
    const n = Number(m[0]);
    if (!Number.isSafeInteger(n) || Object.is(n, -0)) fail("a number is not a safe integer");
    i += m[0].length;
    return n;
  };
  const string = (): string => {
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    if (text[i] !== '"') fail("unterminated string");
    i++;
    const s = JSON.parse(text.slice(start, i)) as string;
    if (!wellFormed(s)) fail("a string has a lone surrogate");
    return s;
  };
  const out = value();
  ws();
  if (i !== text.length) fail("trailing characters");
  return out;
}

/**
 * Canonical bytes (R-SIG-2, R-SIG-3): the RFC 8785 JSON Canonicalization
 * Scheme, restricted to Artroom's signed-JSON profile.
 *
 * - Object keys are sorted by UTF-16 code units, as RFC 8785 requires.
 * - Strings are escaped as `JSON.stringify` escapes them, which matches
 *   RFC 8785 for well-formed strings.
 * - Every number must be a safe integer, and never negative zero.
 * - Lone surrogates, non-plain objects, `NaN`, `Infinity`, bigints and
 *   functions are refused.
 * - A property whose value is `undefined` is omitted: an absent optional
 *   field is never written as `null` (R-SIG-3).
 */

import { artroomError } from "./errors.ts";

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function refuse(path: string, what: string): never {
  throw artroomError("bad-request", `Cannot sign ${path}: ${what} (R-SIG-3).`);
}

function str(value: string, path: string): string {
  if (LONE_SURROGATE.test(value)) refuse(path, "a string holds a lone surrogate");
  return JSON.stringify(value);
}

function walk(value: unknown, path: string): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return str(value, path);
    case "number":
      if (!Number.isSafeInteger(value)) refuse(path, `${value} is not a safe integer`);
      if (Object.is(value, -0)) refuse(path, "negative zero");
      return String(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item, i) => {
          if (item === undefined) refuse(`${path}[${i}]`, "an array holds undefined");
          return walk(item, `${path}[${i}]`);
        }).join(",")}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) refuse(path, "only plain objects can be signed");
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort();
      return `{${keys.map((k) => `${str(k, path)}:${walk(record[k], `${path}.${k}`)}`).join(",")}}`;
    }
    default:
      return refuse(path, `a ${typeof value} cannot be signed`);
  }
}

/** The RFC 8785 canonical JSON text of `value`. Throws `bad-request` outside the profile. */
export function canonicalize(value: unknown): string {
  if (value === undefined) refuse("$", "undefined");
  return walk(value, "$");
}

const encoder = new TextEncoder();

/** The UTF-8 bytes of the canonical JSON text (R-SIG-2). */
export function canonicalBytes(value: unknown): Uint8Array {
  return encoder.encode(canonicalize(value));
}

/** The SHA-256 digest of the canonical bytes, as `sha256:<hex>` (R-ID-7). */
export async function digestOf(value: unknown): Promise<`sha256:${string}`> {
  return `sha256:${await sha256Hex(canonicalBytes(value))}`;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

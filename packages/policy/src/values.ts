/**
 * Plain-JSON checks and canonical JSON, ported from atseq
 * `src/core/values.ts` without behavioural change.
 *
 * `canonicalJson` validates without coercion and measures the evaluation
 * caps. For the values this profile admits (safe integers, well-formed
 * strings, plain objects and arrays) its output is also the RFC 8785
 * canonical form, so `integrity.ts` digests the same bytes.
 */

import { PROFILE } from "./profile.ts";
import { PolicyEvalError } from "./errors.ts";
import type { Json } from "@generalbusiness/artroom-contract";

const encoder = new TextEncoder();
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
const engineArrayKeys = new Set(["sequence", "outerWrapper", "keepSingleton", "cons", "tupleStream", "push"]);
const INDEX = /^(0|[1-9][0-9]*)$/;

export function safeName(name: string): boolean {
  return !forbidden.has(name) && !name.startsWith("_jsonata_");
}

/**
 * Validate `value` as profile JSON and return its canonical text.
 * `charge` is called with the UTF-8 size of every token, for the
 * inspection budget. `engineArrays` admits JSONata's sequence metadata.
 * `intermediate` admits negative zero, which arithmetic may consume.
 */
export function canonicalJson(
  value: unknown,
  maxBytes: number = PROFILE.inputBytes,
  maxDepth: number = PROFILE.inputDepth,
  charge?: (bytes: number) => void,
  engineArrays = false,
  intermediate = false,
): string {
  let bytes = 0;
  const active = new Set<object>();
  function token(text: string): string {
    const size = encoder.encode(text).length;
    charge?.(size);
    bytes += size;
    if (bytes > maxBytes) throw new PolicyEvalError("value_bytes", `Value exceeds ${maxBytes} UTF-8 bytes`);
    return text;
  }
  function walk(v: unknown, depth: number, path: string): string {
    if (v === null || typeof v === "boolean") return token(String(v));
    if (typeof v === "number") {
      if (!Number.isSafeInteger(v) || (!intermediate && Object.is(v, -0)))
        throw new PolicyEvalError("wire_number", `${path}: expected safe integer, excluding negative zero`);
      return token(String(v));
    }
    if (typeof v === "string") {
      if (!v.isWellFormed()) throw new PolicyEvalError("unicode", `${path}: unpaired surrogate`);
      return token(JSON.stringify(v));
    }
    if (!v || typeof v !== "object") throw new PolicyEvalError("wire_value", `${path}: unsupported value`);
    if (depth >= maxDepth) throw new PolicyEvalError("value_depth", `${path}: container depth exceeds ${maxDepth}`);
    if (active.has(v)) throw new PolicyEvalError("wire_value", `${path}: cycle`);
    active.add(v);
    if (Object.getOwnPropertySymbols(v).length) throw new PolicyEvalError("wire_value", `${path}: symbol property`);
    let result: string;
    if (Array.isArray(v)) {
      if (Object.getPrototypeOf(v) !== Array.prototype)
        throw new PolicyEvalError("wire_value", `${path}: expected plain array`);
      for (const key of Object.keys(v)) {
        if (INDEX.test(key) && Number(key) < v.length) continue;
        if (engineArrays && engineArrayKeys.has(key)) continue;
        throw new PolicyEvalError("wire_value", `${path}: extra array property ${key}`);
      }
      token("[");
      const parts: string[] = [];
      for (let i = 0; i < v.length; i++) {
        if (i) token(",");
        if (!Object.hasOwn(v, i)) throw new PolicyEvalError("wire_value", `${path}: sparse array`);
        const desc = Object.getOwnPropertyDescriptor(v, i)!;
        if (!("value" in desc)) throw new PolicyEvalError("wire_value", `${path}/${i}: accessor`);
        parts.push(walk(desc.value, depth + 1, `${path}/${i}`));
      }
      token("]");
      result = `[${parts.join(",")}]`;
    } else {
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
        throw new PolicyEvalError("wire_value", `${path}: expected plain object`);
      token("{");
      const parts: string[] = [];
      for (const key of Object.keys(v).sort()) {
        if (!safeName(key)) throw new PolicyEvalError("reserved_key", `${path}/${key}: reserved in this profile`);
        if (!key.isWellFormed()) throw new PolicyEvalError("unicode", `${path}: invalid Unicode key`);
        if (parts.length) token(",");
        const name = token(JSON.stringify(key));
        token(":");
        const desc = Object.getOwnPropertyDescriptor(v, key)!;
        if (!("value" in desc)) throw new PolicyEvalError("wire_value", `${path}/${key}: accessor`);
        parts.push(`${name}:${walk(desc.value, depth + 1, `${path}/${key}`)}`);
      }
      token("}");
      result = `{${parts.join(",")}}`;
    }
    active.delete(v);
    return result;
  }
  return walk(value, 0, "$");
}

/** An owned copy of profile JSON, checked against `maxBytes`. */
export function jsonCopy(value: unknown, maxBytes?: number, engineArrays = false): Json {
  return JSON.parse(canonicalJson(value, maxBytes, undefined, undefined, engineArrays)) as Json;
}

// ------------------------------------------------------------------ memo

/** Recorded sizes of the containers in one frozen, owned rule input. */
export type SizeMemo = WeakMap<object, { readonly bytes: number; readonly height: number }>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const tokenSize = (text: string) => encoder.encode(text).length;

/**
 * Copy, check, freeze and measure a rule input once. Every container's
 * canonical byte size and height is recorded, so a rule that reads the input
 * again (for example `$$` inside a filter) is charged the recorded size
 * without a second walk. This keeps atseq's accounting exactly: the charge
 * equals the sum of the tokens a walk would charge. (Room-core spike,
 * 2026-10-01: 6 to 11 times faster deployed, identical outputs.)
 */
export class PreparedInput {
  constructor(
    readonly value: Json,
    readonly memo: SizeMemo,
  ) {}
}

export function prepareInput(input: unknown): PreparedInput {
  const value = deepFreeze(jsonCopy(input));
  const memo: SizeMemo = new WeakMap();
  const walk = (v: Json): { bytes: number; height: number } => {
    if (v === null || typeof v !== "object") return { bytes: tokenSize(typeof v === "string" ? JSON.stringify(v) : String(v)), height: 0 };
    let bytes = 2;
    let height = 0;
    if (Array.isArray(v)) {
      bytes += Math.max(0, v.length - 1);
      for (const item of v) {
        const s = walk(item);
        bytes += s.bytes;
        height = Math.max(height, s.height);
      }
    } else {
      const keys = Object.keys(v);
      bytes += Math.max(0, keys.length - 1);
      for (const key of keys) {
        const s = walk((v as Record<string, Json>)[key]!);
        bytes += tokenSize(JSON.stringify(key)) + 1 + s.bytes;
        height = Math.max(height, s.height);
      }
    }
    const size = { bytes, height: height + 1 };
    memo.set(v, size);
    return size;
  };
  walk(value);
  return new PreparedInput(value, memo);
}

/**
 * Inspect one intermediate result, charging the same bytes as
 * `canonicalJson(value, maxBytes, maxDepth, charge, true, true)`, but
 * charging a recorded input container in one step.
 */
export function inspectIntermediate(
  value: unknown,
  maxBytes: number,
  maxDepth: number,
  charge: (bytes: number) => void,
  memo: SizeMemo | undefined,
): void {
  let bytes = 0;
  const active = new Set<object>();
  const add = (size: number) => {
    charge(size);
    bytes += size;
    if (bytes > maxBytes) throw new PolicyEvalError("value_bytes", `Value exceeds ${maxBytes} UTF-8 bytes`);
  };
  const walk = (v: unknown, depth: number, path: string): void => {
    if (v === null || typeof v === "boolean") return add(String(v).length);
    if (typeof v === "number") {
      if (!Number.isSafeInteger(v)) throw new PolicyEvalError("wire_number", `${path}: expected safe integer, excluding negative zero`);
      return add(String(v).length);
    }
    if (typeof v === "string") {
      if (!v.isWellFormed()) throw new PolicyEvalError("unicode", `${path}: unpaired surrogate`);
      return add(tokenSize(JSON.stringify(v)));
    }
    if (!v || typeof v !== "object") throw new PolicyEvalError("wire_value", `${path}: unsupported value`);
    if (depth >= maxDepth) throw new PolicyEvalError("value_depth", `${path}: container depth exceeds ${maxDepth}`);
    const known = memo?.get(v);
    if (known) {
      if (depth + known.height > maxDepth) throw new PolicyEvalError("value_depth", `${path}: container depth exceeds ${maxDepth}`);
      return add(known.bytes);
    }
    if (active.has(v)) throw new PolicyEvalError("wire_value", `${path}: cycle`);
    active.add(v);
    if (Object.getOwnPropertySymbols(v).length) throw new PolicyEvalError("wire_value", `${path}: symbol property`);
    if (Array.isArray(v)) {
      if (Object.getPrototypeOf(v) !== Array.prototype) throw new PolicyEvalError("wire_value", `${path}: expected plain array`);
      for (const key of Object.keys(v)) {
        if (INDEX.test(key) && Number(key) < v.length) continue;
        if (engineArrayKeys.has(key)) continue;
        throw new PolicyEvalError("wire_value", `${path}: extra array property ${key}`);
      }
      add(1);
      for (let i = 0; i < v.length; i++) {
        if (i) add(1);
        if (!Object.hasOwn(v, i)) throw new PolicyEvalError("wire_value", `${path}: sparse array`);
        const desc = Object.getOwnPropertyDescriptor(v, i)!;
        if (!("value" in desc)) throw new PolicyEvalError("wire_value", `${path}/${i}: accessor`);
        walk(desc.value, depth + 1, `${path}/${i}`);
      }
      add(1);
    } else {
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
        throw new PolicyEvalError("wire_value", `${path}: expected plain object`);
      add(1);
      let first = true;
      for (const key of Object.keys(v).sort()) {
        if (!safeName(key)) throw new PolicyEvalError("reserved_key", `${path}/${key}: reserved in this profile`);
        if (!key.isWellFormed()) throw new PolicyEvalError("unicode", `${path}: invalid Unicode key`);
        if (!first) add(1);
        first = false;
        add(tokenSize(JSON.stringify(key)));
        add(1);
        const desc = Object.getOwnPropertyDescriptor(v, key)!;
        if (!("value" in desc)) throw new PolicyEvalError("wire_value", `${path}/${key}: accessor`);
        walk(desc.value, depth + 1, `${path}/${key}`);
      }
      add(1);
    }
    active.delete(v);
  };
  walk(value, 0, "$");
}

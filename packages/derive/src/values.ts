/** Values of the field types of section 6.2, as they appear in an intent, a slot and an effect. */

import type { Bounds, FactRef, FieldType, MemberRef, ScopeKind, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, isDigest, isIncarnation, isScopeId, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import { timeMs } from "./time.ts";

export const SCOPE_KINDS: readonly ScopeKind[] = ["directory", "membership", "rules", "destination", "inbox", "task", "lane"];

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const hasOnly = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every((k) => k in v);

export function isScopeRef(v: unknown): v is ScopeRef {
  return isObject(v) && hasOnly(v, ["scope", "inc", "kind"]) && isScopeId(v["scope"]) && isIncarnation(v["inc"]) && SCOPE_KINDS.includes(v["kind"] as ScopeKind);
}

export function isMemberRef(v: unknown): v is MemberRef {
  return isObject(v) && hasOnly(v, ["membership", "member"]) && isScopeRef(v["membership"]) && typeof v["member"] === "string" && /^@./.test(v["member"]) && wellFormed(v["member"]);
}

/** A member handle within its bound. A slot never holds a longer one, so an entry that lists a slot's members has a known size. */
export const memberFits = (v: MemberRef, bounds: Pick<Bounds, "memberBytes">): boolean => utf8(v.member).length <= bounds.memberBytes;

export function isFactRef(v: unknown): v is FactRef {
  return isObject(v) && hasOnly(v, ["at", "seq", "hash"]) && isScopeRef(v["at"]) && isLocalId(v["seq"]) && isDigest(v["hash"]);
}

/** A local item's ID is the `seq` of the entry that opened it. */
export const isLocalId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** A Git object ID: SHA-1 or SHA-256, lowercase hex. */
const isObjectId = (v: unknown) => typeof v === "string" && /^([0-9a-f]{40}|[0-9a-f]{64})$/.test(v);

/** True when `v` is a value of `type`. An `item` is checked as a local ID only; whether it exists is a question for the state. */
export function isValue(type: FieldType, v: unknown, bounds: Bounds): boolean {
  switch (type.type) {
    case "text": return typeof v === "string" && wellFormed(v) && utf8(v).length <= type.max;
    case "int": return typeof v === "number" && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= type.min && v <= type.max;
    case "bool": return typeof v === "boolean";
    case "time": return timeMs(v) !== null;
    case "enum": return typeof v === "string" && type.of.includes(v);
    case "member": return isMemberRef(v) && memberFits(v, bounds);
    case "item": return isLocalId(v);
    case "fact": return isFactRef(v);
    case "scope": return isScopeRef(v) && v.kind === type.kind;
    case "digest": return isDigest(v);
    case "commit": case "tree": return isObjectId(v);
    case "list": return Array.isArray(v) && v.length <= Math.min(type.max, bounds.listElements) && v.every((e) => isValue(type.of, e, bounds));
  }
}

/** Equality of two values: equal canonical JSON. An empty slot or an absent field is `null`, and equals only another. */
export function same(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}

/** Byte order of two strings: by their UTF-8 bytes (section 5.2). */
export function byteOrder(a: string, b: string): number {
  const x = utf8(a);
  const y = utf8(b);
  for (let i = 0; i < x.length && i < y.length; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}

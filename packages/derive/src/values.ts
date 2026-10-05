/** Values of the field types of section 6.2, as they appear in an intent, a slot and an effect. */

import type { Bounds, FieldType, MemberRef } from "@generalbusiness/artroom-contract";
import { SCOPE_KINDS, canonicalize, isDigest, isFactRef, isLocalId, isMemberRef, isRecord, isScopeRef, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import { timeMs } from "./time.ts";

/** The scope kinds, from the bytes package, which holds the one guard of each identifier. */
export { SCOPE_KINDS };

/**
 * What a record holds under a name, or undefined. For every record keyed by
 * a name that a definition, an intent or a message chose: a field, a slot,
 * an item type, a state, an act, a rule, a handler, a relationship. Only an
 * own property is a member of such a record, so `__proto__`, `constructor`
 * and `toString` are names like any other, and a name the record does not
 * hold resolves to nothing. Such a record is built so that each name is an
 * own property: by `JSON.parse`, the strict parser, `Object.fromEntries`,
 * a spread, or a computed key in a literal. It is never built by assigning
 * to `record[name]`, which for `__proto__` sets the prototype instead.
 */
export const own = <T>(record: Readonly<Record<string, T>> | null | undefined, name: string): T | undefined =>
  (record !== null && record !== undefined && Object.hasOwn(record, name) ? record[name] : undefined);

/** The guards of a reference and of a position are the bytes package's, beside the other fixed records of the contract. */
export { isFactRef, isLocalId, isMemberRef, isScopeRef, isRecord as isObject };

/** A member handle within its bound. A slot never holds a longer one, so an entry that lists a slot's members has a known size. */
export const memberFits = (v: MemberRef, bounds: Pick<Bounds, "memberBytes">): boolean => utf8(v.member).length <= bounds.memberBytes;

/** A Git object ID: SHA-1 or SHA-256, lowercase hex. */
const isObjectId = (v: unknown) => typeof v === "string" && /^([0-9a-f]{40}|[0-9a-f]{64})$/.test(v);

/**
 * True when `v` is a value of `type`. An `item` is checked as a local ID
 * only; whether it exists is a question for the state. The value of a
 * detached text is its digest (section 6.2); whether the text is at hand,
 * and within the field's `max`, is a question for what came with the input.
 */
export function isValue(type: FieldType, v: unknown, bounds: Bounds): boolean {
  switch (type.type) {
    case "text": return type.detached ? isDigest(v) : typeof v === "string" && wellFormed(v) && utf8(v).length <= type.max;
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
    // Section 6.2: a record has named members. An unknown member is refused, and a member that is not required may be absent.
    case "record": return isRecord(v) && Object.keys(v).every((m) => Object.hasOwn(type.of, m)) && Object.entries(type.of).every(([m, of]) => (Object.hasOwn(v, m) ? isValue(of, v[m], bounds) : !of.required));
  }
}

/**
 * Section 6.2: a member of a record is named after what holds the record,
 * with a dot. `k.item` is the member `item` of the record that `k` names.
 * `held` gives what a name holds, or undefined when nothing has that name. A
 * name that holds something is read whole, also when it has a dot. Null:
 * nothing has the name, or what it leads to is no record with that member.
 */
export function memberOf(held: (name: string) => unknown, name: string): unknown {
  const whole = held(name);
  if (whole !== undefined) return whole;
  for (let dot = name.indexOf("."); dot !== -1; dot = name.indexOf(".", dot + 1)) {
    let value = held(name.slice(0, dot));
    if (value === undefined) continue;
    for (const member of name.slice(dot + 1).split(".")) value = isRecord(value) ? own(value, member) : undefined;
    return value ?? null;
  }
  return null;
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

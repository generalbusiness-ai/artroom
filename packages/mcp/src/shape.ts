/**
 * What the server checks before it signs: each field against the type its
 * act declares, with a detached text replaced by its digest and kept for
 * `texts`; `@handle` read as a member of the scope's membership; and the
 * revision of each item the act names, from the target's summary (the
 * command line's `expectedOf`). It checks no guard, grant or state: the
 * scope judges those, and checks every field again with its own bounds.
 */

import type { FactRef, FieldValue, Item, MemberRef, ScopeRef } from "@generalbusiness/dap-contract";
import { isDigest, isFactRef, isMemberRef, isRecord, isScopeRef, textDigest, timeMs, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import type { ActLike, FieldLike } from "./describe.ts";
import { clip } from "./errors.ts";

/** A value that is not of its declared shape. Nothing was signed. */
export class Unshaped extends Error {
  constructor(readonly field: string, readonly what: string, readonly declared: string) { super(`${field} ${what}`); }
}

const declaredOf = (type: FieldLike): string => (typeof type["code"] === "string" && (type.type === undefined || type.type === "code") ? `the platform type ${type["code"]}` : String(type.type));

/**
 * Sets a name a definition chose as an own, enumerable property. A plain assignment would treat `__proto__` as the prototype
 * setter, so a field, a record member, a presented fact or an `also` alias of that lawful name would vanish from the intent.
 */
function put<T>(out: Record<string, T>, name: string, value: T): void {
  Object.defineProperty(out, name, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * A name's value only when it is an own property: an absent name is absent, never what the prototype holds. So an optional
 * field, record member or presented fact named `__proto__`, `constructor` or `toString` that the caller left out stays out, and
 * the scope applies its own default (derive's readFields reads the same way).
 */
function ownValue(record: Readonly<Record<string, unknown>> | undefined, name: string): unknown {
  return record !== undefined && Object.hasOwn(record, name) ? record[name] : undefined;
}

interface Shaping { membership: ScopeRef | null; texts: Map<string, string> }

function shaped(type: FieldLike, value: unknown, path: string, at: Shaping): FieldValue {
  const not = (what: string): never => { throw new Unshaped(path, what, declaredOf(type)); };
  // A field whose type is a platform mark: the scope's rule decides; it is signed as given.
  if (typeof type["code"] === "string" && (type.type === undefined || type.type === "code")) return value as FieldValue;
  switch (type.type) {
    case "text": {
      if (typeof value !== "string" || !wellFormed(value)) return not("is not a text");
      if (type["detached"]) {
        // The digest of a text given in texts, or the text itself.
        if (isDigest(value) && at.texts.has(value)) return value;
        if (utf8(value).length > Number(type["max"])) return not(`is longer than ${String(type["max"])} bytes`);
        const digest = textDigest(value);
        at.texts.set(digest, value);
        return digest;
      }
      if (utf8(value).length > Number(type["max"])) return not(`is longer than ${String(type["max"])} bytes`);
      return value;
    }
    case "int": return typeof value === "number" && Number.isSafeInteger(value) && value >= Number(type["min"]) && value <= Number(type["max"]) ? value : not(`is not a whole number from ${String(type["min"])} to ${String(type["max"])}`);
    case "bool": return typeof value === "boolean" ? value : not("is not true or false");
    case "time": return typeof value === "string" && timeMs(value) !== null ? value : not("is not a time in RFC 3339 UTC with Z");
    case "enum": return typeof value === "string" && (type["of"] as string[]).includes(value) ? value : not(`is not one of ${(type["of"] as string[]).join(", ")}`);
    case "member": {
      if (typeof value === "string" && value.startsWith("@") && at.membership) return { membership: at.membership, member: value } as MemberRef as unknown as FieldValue;
      return isMemberRef(value) ? value as unknown as FieldValue : not("is not a member: give @handle, or { membership, member }");
    }
    case "item": return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : not("is not a local item ID");
    case "fact": return isFactRef(value) ? value as FactRef as unknown as FieldValue : not("is not a fact: { at, seq, hash }");
    case "scope": return isScopeRef(value) && value.kind === type["kind"] ? value as unknown as FieldValue : not(`is not a reference to a ${String(type["kind"])} scope: { scope, inc, kind }`);
    case "digest": return isDigest(value) ? value : not("is not a digest: sha256: and 64 hex characters");
    case "commit": case "tree": return typeof value === "string" && /^([0-9a-f]{40}|[0-9a-f]{64})$/.test(value) ? value : not("is not a Git object ID");
    case "list": {
      if (!Array.isArray(value)) return not("is not a list");
      if (value.length > Number(type["max"])) return not(`has more than ${String(type["max"])} elements`);
      return value.map((v, i) => shaped(type["of"] as FieldLike, v, `${path}.${i}`, at));
    }
    case "record": {
      if (!isRecord(value)) return not("is not a record");
      return named(type["of"] as Record<string, FieldLike>, value, path, at);
    }
    default: return value as FieldValue;
  }
}

function named(types: Readonly<Record<string, FieldLike>>, given: Readonly<Record<string, unknown>>, path: string, at: Shaping): Record<string, FieldValue> {
  for (const name of Object.keys(given)) if (!Object.hasOwn(types, name)) throw new Unshaped(`${path}.${clip(name)}`, "is not declared", "no such field");
  const out: Record<string, FieldValue> = {};
  for (const [name, type] of Object.entries(types)) {
    const value = ownValue(given, name);
    if (value === undefined) { if (type.required) throw new Unshaped(`${path}.${name}`, "is required", declaredOf(type)); continue; }
    put(out, name, shaped(type, value, `${path}.${name}`, at));
  }
  return out;
}

/** The fields as the intent holds them, and the detached texts that go beside it. */
export function shapeFields(act: ActLike, fields: Readonly<Record<string, unknown>>, texts: readonly string[], membership: ScopeRef | null): { fields: Record<string, FieldValue>; texts: string[] } {
  const at: Shaping = { membership, texts: new Map(texts.map((t) => [textDigest(t), t])) };
  const shapedFields = named(act.fields, fields, "fields", at);
  // Only the texts that a field names travel; the scope keeps no other.
  const named_ = new Set<string>();
  const walk = (v: unknown) => { if (typeof v === "string" && at.texts.has(v)) named_.add(v); else if (Array.isArray(v)) v.forEach(walk); else if (isRecord(v)) Object.values(v).forEach(walk); };
  walk(shapedFields);
  return { fields: shapedFields, texts: [...named_].map((d) => at.texts.get(d)!) };
}

/** The facts presented beside the intent, by the names the act declares. */
export function shapePresented(act: ActLike, presented: Readonly<Record<string, unknown>> | undefined): Record<string, FactRef> {
  const declared = act.presents ?? {};
  const out: Record<string, FactRef> = {};
  for (const name of Object.keys(presented ?? {})) if (!Object.hasOwn(declared, name)) throw new Unshaped(`presented.${clip(name)}`, "is not declared", "no such presented fact");
  for (const [name, p] of Object.entries(declared)) {
    const value = ownValue(presented, name);
    if (value === undefined) { if (p.required) throw new Unshaped(`presented.${name}`, "is required", `a fact of kind ${p.kind.join(" or ")}`); continue; }
    if (!isFactRef(value)) throw new Unshaped(`presented.${name}`, "is not a fact: { at, seq, hash }", `a fact of kind ${p.kind.join(" or ")}`);
    put(out, name, value);
  }
  return out;
}

/** Whether the act is on an item: then `on` is required. */
export function needsOn(act: ActLike): boolean {
  return act.step === "transition" || (act.step === "comment" && act.on !== null);
}

/**
 * The revision of each item the act names, as the summary has it now: the
 * item it is on, the one item of a type, and an item a field names. A name
 * that a rule selects has no key: the scope resolves it. The scope checks
 * every revision again and refuses one that moved.
 */
export function expectedOf(act: ActLike, items: readonly Item[], on: number | null, fields: Readonly<Record<string, FieldValue>>): Record<string, number> {
  const expected: Record<string, number> = {};
  if (act.step === "transition" && on !== null) {
    const at = items.find((item) => item.id === on)?.revision;
    if (at !== undefined) expected["on"] = at;
  }
  const bound = new Map<string, Item | null>();
  const subject = (name: string): Item | null => {
    if (bound.has(name)) return bound.get(name)!;
    if (name === "on") return items.find((item) => item.id === on) ?? null;
    const rule = ownValue(act.also, name.replace(/^also\./, "")) as { item?: string; one?: true; by?: string; code?: string; via?: { slot: string; of: string } } | undefined;
    if (!rule || rule.code !== undefined) return null;
    bound.set(name, null);
    const via = rule.via ? subject(rule.via.of)?.refs[rule.via.slot] : undefined;
    const id = typeof via === "number" ? via : via && typeof via === "object" && "seq" in via ? (via as FactRef).seq : undefined;
    const item = rule.one ? items.find((i) => i.type === rule.item) : rule.by !== undefined && typeof ownValue(fields, rule.by) === "number" ? items.find((i) => i.id === ownValue(fields, rule.by!)) : items.find((i) => i.id === id);
    bound.set(name, item ?? null);
    return item ?? null;
  };
  for (const [name, rule] of Object.entries(act.also)) {
    if ((rule as { code?: string }).code !== undefined) continue;
    const item = subject(name);
    if (item) put(expected, name, item.revision);
  }
  return expected;
}

/**
 * The fields as the scope will read them, for resolving the act's subjects only, never signed. Two steps, as derive takes them:
 * readFields gives each declared field the caller gave, else its declared default (an own value, else `default`; an absent
 * optional with no default stays absent); then readFacts puts each local fact, one whose scope and incarnation are the
 * target's, as its `seq`, in a declared fact field and in the lists and records that hold one. A foreign fact stays a fact, so
 * its `seq` never names a local item. The intent carries the fields as given: the original fact, and no default.
 */
export function effectiveFields(act: ActLike, fields: Readonly<Record<string, FieldValue>>, at: Pick<ScopeRef, "scope" | "inc"> | null): Record<string, FieldValue> {
  const local = (v: unknown): boolean => at !== null && isFactRef(v) && v.at.scope === at.scope && v.at.inc === at.inc;
  const normal = (type: FieldLike | undefined, value: unknown): unknown => {
    if (type?.type === "list" && Array.isArray(value)) return value.map((v) => normal(type["of"] as FieldLike, v));
    if (type?.type === "record" && isRecord(value)) {
      const out: Record<string, unknown> = {};
      for (const name of Object.keys(value)) put(out, name, normal(ownValue(type["of"] as Record<string, FieldLike>, name) as FieldLike | undefined, ownValue(value, name)));
      return out;
    }
    return type?.type === "fact" && local(value) ? (value as FactRef).seq : value;
  };
  const out: Record<string, FieldValue> = {};
  for (const [name, type] of Object.entries(act.fields)) {
    const value = Object.hasOwn(fields, name) ? ownValue(fields, name) : type["default"];
    if (value !== undefined) put(out, name, normal(type, value) as FieldValue);
  }
  return out;
}

/** The fields of an act that name a value beside the intent, with the domain each states. */
export function valuePlaces(act: ActLike, fields: Readonly<Record<string, FieldValue>>): { name: string; domain: string; digest: string }[] {
  const out: { name: string; domain: string; digest: string }[] = [];
  for (const [name, type] of Object.entries(act.fields)) {
    const value = type["value"];
    const digest = ownValue(fields, name);
    if (type.type === "digest" && isRecord(value) && typeof value["domain"] === "string" && typeof digest === "string") out.push({ name, domain: value["domain"], digest });
  }
  return out;
}

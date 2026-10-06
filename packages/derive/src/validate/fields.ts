/**
 * Field types and the declared fields of an act (scope contract, section
 * 6.2), and when a value of one type may be copied into another (section
 * 6.6).
 */

import type { FieldType } from "@generalbusiness/artroom-contract";
import { isScopeKind } from "@generalbusiness/artroom-bytes";
import { isObject, isValue, own } from "../values.ts";
import { stepKind } from "./capability.ts";
import { mark, marked, type Defining } from "./context.ts";
import { at, type Rec } from "./shape.ts";

const FIELD_SHAPES: Readonly<Record<string, readonly string[]>> = {
  text: ["max"], int: ["min", "max"], bool: [], time: [], enum: ["of"], member: [], item: ["of"], fact: ["kind", "under"], scope: ["kind"], digest: [], commit: [], tree: [], record: ["of"], list: ["of", "max"],
};

/**
 * Section 6.6: every value of `from` is a value of `to`. The two are the same
 * type, and the bounds of `from` are inside those of `to`: a text's `max`, an
 * integer's range, an enum's values, a reference's kind, a fact's kinds, a
 * list's `max` and its elements, and a record's members: each member of
 * `from` is one of `to`, and `to` requires none that `from` may lack. A copy
 * needs this; a comparison does not.
 */
export function assignable(from: FieldType, to: FieldType): boolean {
  // Section 6.1: a value of a type that is a mark is assignable to that type only: the type that the same rule checks.
  const [a, b] = [codeOf(from), codeOf(to)];
  if (a !== null || b !== null) return a === b;
  switch (from.type) {
    // A detached text is held as its digest, and a plain one as its bytes: neither is a value of the other.
    case "text": return to.type === "text" && from.max <= to.max && (from.detached === true) === (to.detached === true);
    case "int": return to.type === "int" && from.min >= to.min && from.max <= to.max;
    case "enum": return to.type === "enum" && from.of.every((v) => to.of.includes(v));
    case "item": return to.type === "item" && from.of === to.of;
    case "scope": return to.type === "scope" && from.kind === to.kind;
    case "fact": return to.type === "fact" && from.kind.every((k) => to.kind.includes(k)) && from.under === to.under;
    case "list": return to.type === "list" && from.max <= to.max && assignable(from.of, to.of);
    case "record": {
      if (to.type !== "record") return false;
      const members = to.of;
      return Object.entries(from.of).every(([m, of]) => Object.hasOwn(members, m) && assignable(of, members[m]!))
        && Object.entries(members).every(([m, of]) => !of.required || own(from.of, m)?.required === true);
    }
    default: return from.type === to.type;
  }
}

/** The rule that checks a type which is a mark, in platform data (section 6.1, place 3). Null: the type is one that the forms write. */
export const codeOf = (type: FieldType | null | undefined): string | null => (marked(type) ? String((type as Record<string, unknown>)["code"]) : null);

/**
 * One field type. `markable`: the type is that of a field of an act or of a
 * handler, or of a slot, where platform data may write a mark in place of a
 * type (section 6.1, place 3). `extra`: the members a field or a slot may carry beside
 * its type. `detachable`: the type is that of a field of an act or of a
 * message, or of a value slot, which are the places a detached text is held
 * (section 6.2). Null: it is not one, which is reported.
 */
export function fieldType(d: Defining, v: unknown, path: string, extra: readonly string[] = [], nested = false, detachable = false, markable = false): FieldType | null {
  const { bounds, problems, bad, rec, str, int } = d;
  const before = problems.length;
  if (d.platform && markable && marked(v)) {
    // The data states no shape for the value. The rule checks each value, so nothing of the type is checked here, and a default,
    // which only the rule could check, is not written.
    const o = mark(d, v, path, "type", ["type"], extra.filter((member) => member !== "default"));
    if (o && o["type"] !== "code") bad("shape", at(path, "type"), "the type of a mark is code");
    return o && problems.length === before ? (v as unknown as FieldType) : null;
  }
  const keys = isObject(v) && typeof v["type"] === "string" ? own(FIELD_SHAPES, v["type"]) : undefined;
  if (!keys) return bad("shape", path, "must be a field type");
  const o = rec(v, path, ["type", ...keys], (v as Rec)["type"] === "text" ? [...extra, "detached"] : extra);
  if (!o) return null;
  switch (o["type"]) {
    case "text":
      if ((int(o["max"], at(path, "max")) ?? 0) > bounds.textBytes) bad("bound", at(path, "max"), `at most ${bounds.textBytes} bytes`);
      // Section 6.2: a detached text is held beside the input and named in it by digest. Its bytes are kept under that digest
      // for the field or the slot that names it, so a value that nothing came with has none: it takes no default.
      if ("detached" in o) {
        if (o["detached"] !== true) bad("shape", at(path, "detached"), "is true, or is left out");
        else if (!detachable) bad("shape", at(path, "detached"), "a detached text is a field of an act or of a message, or a value slot: not an element, a member or a reference");
        else if ("default" in o) bad("shape", at(path, "default"), "a detached text has no default: no bytes would come with it");
      }
      break;
    case "int":
      if (!Number.isSafeInteger(o["min"]) || !Number.isSafeInteger(o["max"]) || (o["min"] as number) > (o["max"] as number)) bad("shape", path, "min and max must be integers, min not above max");
      break;
    case "enum":
      if (!Array.isArray(o["of"]) || o["of"].length === 0 || o["of"].some((e) => typeof e !== "string") || new Set(o["of"]).size !== o["of"].length) bad("shape", at(path, "of"), "must be a list of distinct strings");
      break;
    case "item":
      if (typeof o["of"] !== "string" || !d.typeNames.has(o["of"])) bad("name", at(path, "of"), "names no item type");
      break;
    case "fact":
      // Section 6.2: an entry of one of those kinds, under a definition of that name.
      if (!Array.isArray(o["kind"]) || o["kind"].length === 0 || o["kind"].some((e) => typeof e !== "string" || e === "") || new Set(o["kind"]).size !== o["kind"].length) bad("shape", at(path, "kind"), "must be a list of distinct kinds");
      else if (o["kind"].length > bounds.listElements) bad("bound", at(path, "kind"), `has ${o["kind"].length}; at most ${bounds.listElements}`);
      // Section 6.2: the kind of a preparation entry is its capability and step, as in `hold@1:check`.
      else for (const kind of o["kind"] as string[]) stepKind(d, kind, at(path, "kind"));
      str(o["under"], at(path, "under"));
      break;
    case "scope":
      if (!isScopeKind(o["kind"])) bad("shape", at(path, "kind"), "is not a scope kind");
      break;
    case "record": {
      // Section 6.2: a record has named members, each with a type, required or not. A member is named after what holds the
      // record, with a dot, so its own name has none.
      const members = d.entries(o["of"], at(path, "of"), null);
      if (members.length === 0 && isObject(o["of"])) bad("shape", at(path, "of"), "a record has a member");
      for (const [m, mv] of members) {
        const p = at(at(path, "of"), m);
        if (m.includes(".")) bad("shape", p, "a member's name has no dot");
        if (fieldType(d, mv, p, ["required"]) && isObject(mv)) d.bool(mv["required"], at(p, "required"));
      }
      break;
    }
    case "list":
      if (nested) bad("shape", path, "a list of lists is not a field type");
      else fieldType(d, o["of"], at(path, "of"), [], true);
      if ((int(o["max"], at(path, "max")) ?? 0) > bounds.listElements) bad("bound", at(path, "max"), `at most ${bounds.listElements} elements`);
      break;
  }
  return problems.length === before ? (v as unknown as FieldType) : null;
}

/**
 * Section 6.2: the type that a name leads to, where a member of a record is
 * named after what holds the record, with a dot. `typed` gives the type of
 * what a name holds; null when only the commit knows it; undefined when
 * nothing has that name. A name that holds something is read whole, also
 * when it has a dot. A member of what only the commit knows is known only
 * to the commit too. Undefined: nothing has the name, or what it leads to is
 * a type that the definition states and that is no record with that member.
 */
export function memberType(typed: (name: string) => FieldType | null | undefined, name: string): FieldType | null | undefined {
  const whole = typed(name);
  if (whole !== undefined) return whole;
  for (let dot = name.indexOf("."); dot !== -1; dot = name.indexOf(".", dot + 1)) {
    let type = typed(name.slice(0, dot));
    if (type === undefined) continue;
    // An element whose type only the commit knows may hold any member: one that is not there is none.
    for (const member of name.slice(dot + 1).split(".")) type = type === null ? null : type?.type === "record" ? own(type.of, member) : undefined;
    return type;
  }
  return undefined;
}

/**
 * The places of an act that name a value beside the intent (section 6.2,
 * "How a version states a place", revision 19): each field of type `digest`
 * that states `value`, with the byte domain of the place and the bound on
 * one value of that domain, in the order of the field names as written.
 * Only platform data states one, so an act of a declared definition has
 * none.
 */
export function valuePlaces(fields: Readonly<Record<string, unknown>> | undefined): { field: string; domain: string; max: number }[] {
  return Object.entries(fields ?? {}).flatMap(([field, type]) => {
    const value = isObject(type) && type["type"] === "digest" && isObject(type["value"]) ? type["value"] : null;
    return value && typeof value["domain"] === "string" && typeof value["max"] === "number" ? [{ field, domain: value["domain"], max: value["max"] }] : [];
  });
}

/**
 * The fields an act or a handler declares, each with its type. A field that
 * is not one is reported and left out. `places`: the fields are those of an
 * act, where platform data may state that a field of type `digest` names a
 * value: `value: { domain, max }`. Without the platform option the member
 * is unknown, and is refused as any unknown member is.
 */
export function declaredFields(d: Defining, v: unknown, path: string, places = false): Map<string, FieldType> {
  const { bounds, bad, entries, bool, rec, str, int } = d;
  const fields = new Map<string, FieldType>();
  for (const [f, fv] of entries(v, path, null)) {
    const p = at(path, f);
    const placed = d.platform && places && isObject(fv) && fv["type"] === "digest" && "value" in fv;
    const type = fieldType(d, fv, p, ["required", "default", ...(placed ? ["value"] : [])], false, true, true);
    if (!type) continue;
    if (placed) {
      // `domain` is the byte domain of the place, and `max` the bound on one value of that domain, in canonical bytes. Two fields
      // of one definition that state one domain state one `max`. A place has no default: no value would come with it.
      const place = rec((fv as Rec)["value"], at(p, "value"), ["domain", "max"]);
      const domain = place && str(place["domain"], at(at(p, "value"), "domain"));
      const max = place && int(place["max"], at(at(p, "value"), "max"), 1);
      if (domain === null || max === null || domain === undefined || max === undefined) continue;
      if (d.places.has(domain) && d.places.get(domain) !== max) { bad("shape", at(at(p, "value"), "max"), `another field states the domain ${domain} with the bound ${d.places.get(domain)}; one domain has one bound`); continue; }
      if ("default" in (fv as Rec)) { bad("shape", at(p, "default"), "a field that names a value has no default: no value would come with it"); continue; }
      d.places.set(domain, max);
    }
    const fo = fv as Rec;
    if (bool(fo["required"], at(p, "required")) === null) continue;
    // Section 6.2: an optional field may have a default.
    if ("default" in fo && (fo["required"] === true || codeOf(type) !== null || !isValue(type, fo["default"], bounds))) bad("shape", at(p, "default"), "is a value of the field's type, on an optional field");
    fields.set(f, type);
  }
  return fields;
}

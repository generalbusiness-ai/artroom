/**
 * Field types and the declared fields of an act (scope contract, section
 * 6.2), and when a value of one type may be copied into another (section
 * 6.6).
 */

import type { FieldType } from "@generalbusiness/artroom-contract";
import { isScopeKind } from "@generalbusiness/artroom-bytes";
import { isObject, isValue, own } from "../values.ts";
import type { Defining } from "./context.ts";
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
  switch (from.type) {
    case "text": return to.type === "text" && from.max <= to.max;
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

/** One field type. `extra`: the members a field or a slot may carry beside its type. Null: it is not one, which is reported. */
export function fieldType(d: Defining, v: unknown, path: string, extra: readonly string[] = [], nested = false): FieldType | null {
  const { bounds, problems, bad, rec, str, int } = d;
  const before = problems.length;
  const keys = isObject(v) && typeof v["type"] === "string" ? own(FIELD_SHAPES, v["type"]) : undefined;
  if (!keys) return bad("shape", path, "must be a field type");
  const o = rec(v, path, ["type", ...keys], extra);
  if (!o) return null;
  switch (o["type"]) {
    case "text":
      if ((int(o["max"], at(path, "max")) ?? 0) > bounds.textBytes) bad("bound", at(path, "max"), `at most ${bounds.textBytes} bytes`);
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
 * when it has a dot. Undefined: nothing has the name, or what it leads to is
 * no record that the definition states with that member.
 */
export function memberType(typed: (name: string) => FieldType | null | undefined, name: string): FieldType | null | undefined {
  const whole = typed(name);
  if (whole !== undefined) return whole;
  for (let dot = name.indexOf("."); dot !== -1; dot = name.indexOf(".", dot + 1)) {
    let type = typed(name.slice(0, dot));
    if (type === undefined) continue;
    for (const member of name.slice(dot + 1).split(".")) type = type?.type === "record" ? own(type.of, member) : undefined;
    return type;
  }
  return undefined;
}

/** The fields an act declares, each with its type. A field that is not one is reported and left out. */
export function declaredFields(d: Defining, v: unknown, path: string): Map<string, FieldType> {
  const { bounds, bad, entries, bool } = d;
  const fields = new Map<string, FieldType>();
  for (const [f, fv] of entries(v, path, null)) {
    const p = at(path, f);
    const type = fieldType(d, fv, p, ["required", "default"]);
    if (!type) continue;
    const fo = fv as Rec;
    if (bool(fo["required"], at(p, "required")) === null) continue;
    // Section 6.2: an optional field may have a default.
    if ("default" in fo && (fo["required"] === true || !isValue(type, fo["default"], bounds))) bad("shape", at(p, "default"), "is a value of the field's type, on an optional field");
    fields.set(f, type);
  }
  return fields;
}

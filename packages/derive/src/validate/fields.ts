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
  text: ["max"], int: ["min", "max"], bool: [], time: [], enum: ["of"], member: [], item: ["of"], fact: ["kind", "under"], scope: ["kind"], digest: [], commit: [], tree: [], list: ["of", "max"],
};

/**
 * Section 6.6: every value of `from` is a value of `to`. The two are the same
 * type, and the bounds of `from` are inside those of `to`: a text's `max`, an
 * integer's range, an enum's values, a reference's kind, a list's `max` and
 * its elements. A copy needs this; a comparison does not.
 */
export function assignable(from: FieldType, to: FieldType): boolean {
  switch (from.type) {
    case "text": return to.type === "text" && from.max <= to.max;
    case "int": return to.type === "int" && from.min >= to.min && from.max <= to.max;
    case "enum": return to.type === "enum" && from.of.every((v) => to.of.includes(v));
    case "item": return to.type === "item" && from.of === to.of;
    case "scope": return to.type === "scope" && from.kind === to.kind;
    case "fact": return to.type === "fact" && from.kind === to.kind && from.under === to.under;
    case "list": return to.type === "list" && from.max <= to.max && assignable(from.of, to.of);
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
      str(o["kind"], at(path, "kind"));
      str(o["under"], at(path, "under"));
      break;
    case "scope":
      if (!isScopeKind(o["kind"])) bad("shape", at(path, "kind"), "is not a scope kind");
      break;
    case "list":
      if (nested) bad("shape", path, "a list of lists is not a field type");
      else fieldType(d, o["of"], at(path, "of"), [], true);
      if ((int(o["max"], at(path, "max")) ?? 0) > bounds.listElements) bad("bound", at(path, "max"), `at most ${bounds.listElements} elements`);
      break;
  }
  return problems.length === before ? (v as unknown as FieldType) : null;
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

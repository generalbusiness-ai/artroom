/**
 * A request that is bound to the item that it settles, at the validator
 * (scope contract, revision 23, section 17.2a: "A request that is bound to
 * a holder", "An index that an item type declares" and "The source of
 * `bound.of`: a binding selector"; rows I3-55, I3-58 and I3-61). Each form
 * is platform data: the validator reads it only with its platform option,
 * and refuses it in a declared definition as any member that it does not
 * know.
 *
 * - `indexes`, on an item type: check 6. An ill-stated one is
 *   `unsupported-definition`.
 * - `holds.decisions`, on an item type: for the message name of a `tell`
 *   handler that states `bound`, the most bound requests that are decided
 *   for one item.
 * - `bound: { of, where }`, on a `tell` handler whose `opens` is null.
 * - A mark at place 2 that binds the name which `bound.of` names is a
 *   binding selector. It states `code`, `row`, `item`, `index` and `key`,
 *   and no other member. Each failure of its source is `bound-source`.
 *
 * I3 merge: `holds` has three members more, `operations`, `requests` and
 * `items`, and an act has `adds`. They are row I3-44's. `held`, below,
 * reads `decisions`; `holds.ts` reads the other three members and derives
 * their amounts.
 */

import type { FieldType } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { INDEXED_TYPES, INDEXES_MOST } from "../binding.ts";
import { isObject, own } from "../values.ts";
import { mark, type Defining, type Slot, type Type } from "./context.ts";
import { at, type Rec } from "./shape.ts";

/**
 * Check 6: `indexes` is a list of 1 to 4 names, none twice. Each is a slot
 * of `refs` or of `values` of the type, fixed and required, of one of the
 * seven types. Null: it is stated ill, which is reported.
 */
export function indexes(d: Defining, v: unknown, path: string, slots: ReadonlyMap<string, Slot>): readonly string[] | null {
  const ill = (where: string, why: string): null => d.bad("unsupported-definition", where, why);
  if (!Array.isArray(v) || v.length < 1 || v.length > INDEXES_MOST) return ill(path, `is a list of 1 to ${INDEXES_MOST} names of slots of the type`);
  let ok = true;
  v.forEach((name, i) => {
    const slot = typeof name === "string" ? slots.get(name) : undefined;
    if (v.indexOf(name) !== i) ok = ill(at(path, i), "names a slot twice") ?? false;
    else if (!slot || slot.kind === "party") ok = ill(at(path, i), "names no slot of refs or of values of the type") ?? false;
    else if (!slot.fixed || !slot.required) ok = ill(at(path, i), "an indexed slot is fixed and required, so that each item has one key from its opening") ?? false;
    else if (!INDEXED_TYPES.includes(slot.type.type)) ok = ill(at(path, i), `an indexed slot is of one of the types: ${INDEXED_TYPES.join(", ")}`) ?? false;
  });
  return ok ? (v as string[]) : null;
}

/**
 * `holds`, as far as this source reads it: `decisions`, a count for each
 * message name. Each count is a whole number, at least 1, within the
 * ceiling that stands in until R4 sets one: the bound on the elements of a
 * list (section 17.2a, check 1). That each key is the message of a handler
 * that states `bound` is checked when the handlers are read (`decisions`).
 */
export function held(d: Defining, v: unknown, path: string): ReadonlyMap<string, number> | null {
  const o = d.rec(v, path, [], ["decisions", "operations", "requests", "items"]);
  if (!o) return null;
  const counts = new Map<string, number>();
  for (const [message, n] of d.entries(o["decisions"] ?? {}, at(path, "decisions"), null)) {
    const p = at(at(path, "decisions"), message);
    const count = d.int(n, p, 1);
    if (count !== null && count > d.bounds.listElements) d.bad("bound", p, `is ${count}; at most ${d.bounds.listElements}`);
    else if (count !== null) counts.set(message, count);
  }
  return counts;
}

/** A type as two declarations state it, to compare: the same `type` and the same members beside it, where the kinds of a `fact` are a set. */
const stated = (type: FieldType): string | null => {
  const { required: _, default: __, value: ___, ...members } = type as FieldType & Rec;
  // A type with no canonical bytes equals none. The definition is refused for it at the end, and nothing is thrown here.
  try {
    return canonicalize(type.type === "fact" ? { ...members, kind: [...new Set(type.kind)].sort() } : members);
  } catch {
    return null;
  }
};

/** What a mark at place 2 is read against when it binds the name that `bound.of` names: the handler's message and its declared fields. */
export interface Selecting { message: string | null; fields: ReadonlyMap<string, FieldType>; written: unknown }

/**
 * A mark at place 2, in platform data. `selecting` is given where the mark
 * binds the name that the `bound.of` of its handler names: it is then a
 * binding selector, and each thing that it lacks is `bound-source`. Any
 * other mark at place 2 states neither `index` nor `key`. The mark as it
 * was read, or null.
 */
export function alsoMark(d: Defining, v: Rec, path: string, selecting: Selecting | null): Rec | null {
  const source = (why: string): void => { d.bad("bound-source", path, why); };
  if (!selecting) {
    if ("index" in v || "key" in v) source("a mark at place 2 that is no binding selector states neither index nor key");
    return mark(d, v, path, "also", ["item"], ["index", "key"]);
  }
  // The five members, and no other: no `clock`, no `most` and no `refusals`. So the source of a binding is given no clock, no
  // observation and no fetched entry.
  const more = Object.keys(v).filter((k) => !["code", "row", "item", "index", "key"].includes(k));
  if (more.length > 0) source(`a binding selector states code, row, item, index and key, and no other member: not ${more.join(", ")}`);
  const o = mark(d, v, path, "also", ["item"], Object.keys(v));
  const t = o && typeof o["item"] === "string" ? d.types.get(o["item"]) : undefined;
  if (!o || !t) return o;
  if (selecting.message === null || !t.decisions?.has(selecting.message)) source(`a binding selector gives an item of a type that lists the handler's message in decisions, and ${t.name} does not`);
  if (typeof o["index"] !== "string") { source("a binding selector states the index that it uses: a slot that the indexes of its type lists"); return o; }
  if (!t.indexes?.includes(o["index"])) { source(`${o["index"]} is no slot that the indexes of ${t.name} lists`); return o; }
  const slot = t.slots.get(o["index"])!;
  const field = typeof o["key"] === "string" ? selecting.fields.get(o["key"]) : undefined;
  const declared = typeof o["key"] === "string" && isObject(selecting.written) ? own(selecting.written, o["key"]) : undefined;
  if (!field || !isObject(declared) || declared["required"] !== true || stated(field) === null || stated(field) !== stated(slot.type)) source(`the key of a binding selector is a required field of the handler whose type is the type of the slot ${o["index"]}`);
  return o;
}

const OPERANDS: readonly string[] = ["sender", "field", "slot"];

/**
 * `bound: { of, where }` on a handler. `of` is a name of `also`. The name
 * is bound by `by`, by `one`, by a `via` whose every subject a written rule
 * binds, or by a mark at place 2, which is then the handler's binding
 * selector. Each `where` is an `equals` or a `differs` that reads the
 * sender, a field of the message or a slot of that item, and nothing else.
 */
export function bound(d: Defining, v: unknown, path: string, handler: { tell: boolean; opens: unknown; message: string | null; fields: ReadonlyMap<string, FieldType> }, also: { types: ReadonlyMap<string, Type>; marked: ReadonlySet<string>; through: ReadonlySet<string> }): void {
  const { bad, rec, list, form } = d;
  if (!handler.tell || handler.opens !== null) bad("shape", path, "only a tell handler whose opens is null states bound");
  const o = rec(v, path, ["of", "where"]);
  if (!o) return;
  const name = typeof o["of"] === "string" && o["of"].startsWith("also.") ? o["of"].slice(5) : null;
  const t = name === null ? undefined : also.types.get(name);
  if (name === null || !t) { bad("name", at(path, "of"), "names no name of also of the handler"); return; }
  // A source that is reached through a slot of a name which a mark binds could rest on what that rule was given.
  if (also.through.has(name)) bad("bound-source", at(path, "of"), "the name is reached through a name that a mark binds: its source is a written rule whose every subject a written rule binds, or a binding selector");
  // A binding selector is checked where its mark is read (`alsoMark`). A written source needs the type to list the message too.
  else if (!also.marked.has(name) && (handler.message === null || !t.decisions?.has(handler.message))) bad("name", at(path, "of"), `names an item of a type that lists the handler's message in decisions, and ${t.name} does not`);
  list(o["where"], at(path, "where"), d.bounds.guards).forEach((w, i) => {
    const p = at(at(path, "where"), i);
    const f = form(w, p, ["equals", "differs"]);
    const sides = f && rec(f[1], at(p, f[0]), ["a", "b"]);
    for (const side of sides ? ["a", "b"] : []) {
      const x = sides![side];
      const q = at(at(p, f![0]), side);
      const k = isObject(x) && Object.keys(x).length > 0 ? Object.keys(x)[0]! : "";
      const exact = isObject(x) && (k === "sender" ? x["sender"] === true && Object.keys(x).length === 1
        : k === "field" ? Object.keys(x).length === 1 && typeof x["field"] === "string" && handler.fields.has(x["field"])
        : Object.keys(x).length === 2 && x["of"] === o["of"] && typeof x["slot"] === "string" && t.slots.has(x["slot"]));
      if (!OPERANDS.includes(k) || !exact) bad("shape", q, "a where of bound reads the sender, a field of the message or a slot of the bound item, and nothing else");
    }
  });
  if (handler.message !== null) d.bindings.push({ message: handler.message, type: t.name, path });
}

/** Each key of `decisions` is the message of a `tell` handler that states `bound`, whose `of` names that item type. */
export function decisions(d: Defining): void {
  for (const type of d.types.values()) {
    for (const message of type.decisions?.keys() ?? []) {
      if (!d.bindings.some((binding) => binding.message === message && binding.type === type.name)) d.bad("name", at(at(at(at("items", type.name), "holds"), "decisions"), message), `is the message of no tell handler that states bound, whose of names ${type.name}`);
    }
  }
}

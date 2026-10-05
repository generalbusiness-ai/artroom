/**
 * Ranges and list guards (scope contract, section 6.5): the local items a
 * range covers, and the forms `each`, `has`, `anyOf`, `distinct` and
 * `sameSet`. A list of guards has three results, and so has each of these
 * forms: true, false, or not completed. None is true or false on evidence
 * that the rest of an enumeration could overturn.
 */

import type { FieldType, Guard, Operand, Range, Subject, Where } from "@generalbusiness/artroom-contract";
import type { GuardResult, Judging } from "./guards.ts";
import { equal, operand } from "./operand.ts";
import type { Item } from "./state.ts";
import { own } from "./values.ts";

// ---------------------------------------------------------------- three results

/**
 * A list of guards: false when one is false on a completed evaluation;
 * otherwise not completed when one is not; otherwise true. So every guard
 * is evaluated until one is false: a guard that is not completed does not
 * end the list, because a later one may still be false.
 */
export function all(results: Iterable<() => GuardResult>): GuardResult {
  let open: GuardResult | null = null;
  for (const result of results) {
    const r = result();
    if (r === "fail") return "fail";
    if (r !== "pass") open ??= r;
  }
  return open ?? "pass";
}

/** Alternatives, or the elements of a `has`: true when one is true; otherwise not completed when one is not; otherwise false. */
export function any(results: Iterable<() => GuardResult>): GuardResult {
  let open: GuardResult | null = null;
  for (const result of results) {
    const r = result();
    if (r === "pass") return "pass";
    if (r !== "fail") open ??= r;
  }
  return open ?? "fail";
}

// ---------------------------------------------------------------- ranges

/** One clause of a `where` or a `match`. A slot with no `of` is read from `item`. */
export const holds = (j: Judging, w: Where, item: Item | null): boolean =>
  ("equals" in w ? equal(j, operand(j, w.equals.a, item), operand(j, w.equals.b, item)) : !equal(j, operand(j, w.differs.a, item), operand(j, w.differs.b, item)));

/** The items of the `except` subjects, once each. An unbound subject leaves nothing out. */
export function excepted(j: Judging, r: Range): Item[] {
  const left = new Map<number, Item>();
  for (const s of r.except ?? []) {
    const item = j.subjects.get(s);
    if (item) left.set(item.id, item);
  }
  return [...left.values()];
}

/**
 * Reads the items a range covers, in ascending order of item ID, a page at
 * a time, up to the work limit. `each` returns true when its result is
 * completed and no further item could change it. `all`: every covered item
 * was read, which is complete evidence. `stopped`: `each` said so.
 * `unfinished`: the scan stopped at the work limit, and completes nothing.
 */
export function scan(j: Judging, r: Range, each: (item: Item) => boolean): "all" | "stopped" | "unfinished" {
  const states = [...new Set(r.states)];
  const left = new Set(excepted(j, r).map((i) => i.id));
  const where = r.where ?? [];
  let read = 0;
  let after: number | null = null;
  for (;;) {
    const limit = Math.min(j.bounds.guardPage, j.bounds.guardScan - read);
    if (limit <= 0) return "unfinished";
    const page = j.view.page(r.type, states, after, limit);
    for (const item of page.items) {
      read++;
      after = item.id;
      if (left.has(item.id) || !where.every((w) => holds(j, w, item))) continue;
      if (each(item)) return "stopped";
    }
    if (!page.more) return "all";
    if (page.items.length === 0) return "unfinished";
  }
}

/** Every item a range covers, from complete evidence. Null: the scan did not finish, so the set is not known. */
export function covered(j: Judging, r: Range): Item[] | null {
  const items: Item[] = [];
  return scan(j, r, (item) => { items.push(item); return false; }) === "all" ? items : null;
}

// ---------------------------------------------------------------- elements

/** The type of the element a list form binds under that name, or of a member of it, when the definition states it. */
export function typeOfElement(j: Judging, name: string): FieldType | null {
  const [as, ...members] = name.split(".");
  let type: FieldType | null = j.elementTypes?.get(as!) ?? null;
  for (const m of members) type = type?.type === "record" ? (own(type.of, m) ?? null) : null;
  return type;
}

/** The type of the elements of the list an operand reads, when the definition states it, as the validator derived it. */
function elementType(j: Judging, list: Operand, item: Item | null): FieldType | null {
  let type: FieldType | null | undefined = null;
  if ("part" in list && list.part !== undefined) return null;
  if ("field" in list) type = own(j.fieldTypes, list.field);
  else if ("element" in list) type = typeOfElement(j, list.element);
  else if ("slot" in list) {
    const of = list.of === undefined ? item : list.of === "each" ? j.each : j.subjects.get(list.of);
    const declared = of ? own(j.definition.declared.items, of.type) : undefined;
    type = own(declared?.refs, list.slot)?.to ?? own(declared?.values, list.slot)?.of;
  }
  return type?.type === "list" ? type.of : null;
}

/**
 * One judging for each element of the list an operand reads, with the
 * element bound to `as`. An absent field, an empty slot and an unbound
 * subject are the empty list. Null: the value is not a list, which only a
 * value the definition gives no type can be.
 */
export function bindEach(j: Judging, list: Operand, as: string, item: Item | null): Judging[] | null {
  const value = operand(j, list, item);
  if (value !== null && !Array.isArray(value)) return null;
  const type = elementType(j, list, item);
  return ((value ?? []) as readonly unknown[]).map((element) => ({ ...j, elements: new Map(j.elements).set(as, element), elementTypes: new Map(j.elementTypes).set(as, type) }));
}

// ---------------------------------------------------------------- the list forms

type ListGuard = Extract<Guard, { each: unknown } | { has: unknown } | { anyOf: unknown } | { distinct: unknown } | { sameSet: unknown }>;

/**
 * A list form. `of` is the form's subject, which each nested guard takes
 * unless it names its own, and `item` is that subject's item. `judge`
 * judges one nested guard.
 */
export function listGuard(j: Judging, g: ListGuard, of: Subject, item: Item | null, judge: (j: Judging, g: Guard, of: Subject) => GuardResult): GuardResult {
  const list = (inner: Judging, guards: readonly Guard[]) => all(guards.map((n) => () => judge(inner, n, of)));
  if ("anyOf" in g) return any(g.anyOf.map((alternative) => () => list(j, alternative)));
  const form = "each" in g ? g.each : "has" in g ? g.has : "distinct" in g ? g.distinct : g.sameSet;
  const bound = bindEach(j, form.list, form.as, item);
  // A value that is not a list has no elements to judge. It fails closed.
  if (bound === null) return "fail";
  const where = (clauses: readonly Where[] | undefined) => bound.filter((b) => (clauses ?? []).every((w) => holds(b, w, item)));
  // An empty list holds for `each` and fails for `has`. The enumeration of the list is always complete; the form is not, when a nested guard that it needs is not.
  if ("each" in g) return all(where(g.each.where).flatMap((b) => g.each.guards.map((n) => () => judge(b, n, of))));
  if ("has" in g) return any(where(g.has.where).map((b) => () => list(b, g.has.guards ?? [])));

  // `sameSet` is an exact set, so it needs complete evidence for the range it reads.
  const items = "sameSet" in g ? covered(j, g.sameSet.items) : [];
  if (items === null) return "guard-incomplete";
  // No two elements have equal keys, and no key is none.
  const by = "sameSet" in g ? g.sameSet.key : g.distinct.key;
  const keys = bound.map((b) => operand(b, by, item));
  if (keys.some((key, i) => key === null || keys.slice(0, i).some((earlier) => equal(j, earlier, key)))) return "fail";
  if (!("sameSet" in g)) return "pass";
  // The keys are distinct, so they are exactly the local IDs of the items when there are as many and each is one of them.
  const matched = keys.map((key) => items.find((i) => equal(j, key, i.id)));
  if (keys.length !== items.length || !matched.every((m) => m !== undefined)) return "fail";
  if (!bound.every((b, n) => (g.sameSet.match ?? []).every((w) => holds(b, w, matched[n]!)))) return "fail";
  return g.sameSet.ordered && matched.some((m, n) => n > 0 && matched[n - 1]!.id >= m!.id) ? "fail" : "pass";
}

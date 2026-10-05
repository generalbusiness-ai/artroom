/** Guard forms (scope contract, section 6.5). */

import type { FieldType } from "@generalbusiness/artroom-contract";
import { isObject } from "../values.ts";
import { capabilityGuard } from "./capability.ts";
import { onSubject, subject, type Ctx, type Defining, type Type } from "./context.ts";
import { fieldOf, isDetached, operand, type Read } from "./operands.ts";
import { at, type Rec } from "./shape.ts";

const GUARDS = ["state", "signer", "notIn", "set", "unset", "equals", "differs", "some", "none", "count", "every", "fact", "before", "after", "rule", "each", "has", "anyOf", "distinct", "sameSet", "capability"];

/** The guards of one written list, counted with those nested in them (section 6.1). */
interface Nesting { count: number }

/**
 * The clauses of a `where` or a `match`: each an `equals` or a `differs` of
 * two operands. A slot with no `of` is read from the item that `owner`
 * gives. Returns the slots of that item which the clauses read.
 */
function clauses(d: Defining, v: unknown, path: string, ctx: Ctx, owner: () => Type | null, guard: boolean): Set<string> {
  const slots = new Set<string>();
  d.list(v, path, d.bounds.guards).forEach((w, i) => {
    const f = d.form(w, at(path, i), ["equals", "differs"]);
    const pair = f && d.rec(f[1], at(path, i), ["a", "b"]);
    if (!pair) return;
    // Section 6.5: each operand is validated by itself.
    for (const side of ["a", "b"]) {
      const slot = operand(d, pair[side], at(at(path, i), side), ctx, owner, guard)?.slot;
      if (typeof slot === "string") slots.add(slot);
    }
  });
  return slots;
}

/**
 * A range: the local items of one type, in the listed states, that pass
 * every clause of its `where`, but those of the `except` subjects. `more`:
 * the members that the form which holds the range takes beside it. `guard`:
 * the range is read by a guard, which may not read the item that its act
 * opens. Returns the type, and the record as it was read.
 */
export function range(d: Defining, x: unknown, p: string, ctx: Ctx, more: readonly string[] = [], guard = true): { type: Type; read: Rec } | null {
  const { bounds, types, indexes, bad, rec, list, names } = d;
  const r = rec(x, p, ["type", "states"], ["where", "except", ...more]);
  if (!r) return null;
  const t = typeof r["type"] === "string" ? types.get(r["type"]) : undefined;
  if (!t) return bad("name", at(p, "type"), "names no item type");
  names(r["states"], at(p, "states"), t.states, "state");
  // In a `where`, a slot with no `of` is a slot of each item the range covers.
  const slots = clauses(d, r["where"] ?? [], at(p, "where"), ctx, () => t, guard);
  if (slots.size > 0 || (Array.isArray(r["where"]) && r["where"].length > 0)) indexes.push({ path: p, type: t.name, slots: [...slots].sort() });
  // Section 6.5: the items of those subjects are left out. A subject of another type could leave nothing out.
  if ("except" in r) list(r["except"], at(p, "except"), bounds.also + 1).forEach((s, i) => {
    const named = subject(d, s, at(at(p, "except"), i), ctx, false);
    if (named === null || named === "scope") return;
    if (named.name !== t.name) bad("name", at(at(p, "except"), i), `names no subject of type ${t.name}`);
    else if (ctx.nascent && onSubject(s)) bad("nascent-guard", at(at(p, "except"), i), "the item this entry opens is not in the range yet");
  });
  return { type: t, read: r };
}

/** One guard of an act or handler. `depth`: how deep it is nested; a guard as written is at 1. `inherited`: the subject of the guard that holds it. */
export function guard(d: Defining, v: unknown, path: string, ctx: Ctx, nesting: Nesting = { count: 0 }, depth = 1, inherited?: unknown): void {
  const { bounds, rules, bad, rec, form, list, int, bool, names, str } = d;
  nesting.count++;
  const f = form(v, path, GUARDS, ["of", "ifPresent", "reason"]);
  if (!f) return;
  const [k, x] = f;
  const o = v as Rec;
  const p = at(path, k);
  if ("of" in o && subject(d, o["of"], at(path, "of"), ctx, true) === null) return;
  // Section 6.5: a nested guard takes the enclosing guard's subject unless it names its own.
  const of = "of" in o ? o["of"] : inherited;
  /** The subject as an item this guard reads. The item an `open` act opens has nothing to read yet. */
  const item = (): Type | null => {
    const s = subject(d, of, path, ctx, false);
    if (s === null || s === "scope") return null;
    if (ctx.nascent && onSubject(of)) return bad("nascent-guard", path, "a guard may not read the item its act opens");
    return s;
  };
  let namesField = false;
  /** A field or a presented fact that the operand names: what `ifPresent` is for. */
  const named = (read: Read | null) => { if (read && (read.fields.length > 0 || read.form === "presented")) namesField = true; };
  const pair = (e: unknown, ep: string, a: (v: unknown, path: string) => Read | null) => {
    const r = rec(e, ep, ["a", "b"]);
    if (!r) return;
    // Section 6.5: each operand is validated by itself. A valid first operand excuses nothing about the second.
    named(a(r["a"], at(ep, "a")));
    named(operand(d, r["b"], at(ep, "b"), ctx, item));
  };
  /** The guards nested in a list form, each with what the form binds. */
  const nested = (gs: unknown, gp: string, inner: Ctx) => {
    if (depth >= bounds.guardDepth) { bad("bound", gp, `guards are nested at most ${bounds.guardDepth} deep`); return; }
    list(gs, gp, bounds.guards).forEach((g, i) => guard(d, g, at(gp, i), inner, nesting, depth + 1, of));
  };
  /**
   * The list that a list form reads, and the name it binds each element to.
   * Returns what the forms inside it may name: the element, with its type
   * when the definition states it. A `state` guard inside the form shows
   * nothing about the subject for the effects, so `live` is its own.
   */
  const binding = (r: Rec): Ctx | null => {
    const read = operand(d, r["list"], at(p, "list"), ctx, item);
    const as = str(r["as"], at(p, "as"));
    if (as?.includes(".")) return bad("shape", at(p, "as"), "a dot names a member of a record element, so the name has none");
    if (!read || as === null) return null;
    if (read.type !== null && read.type.type !== "list") return bad("name", at(p, "list"), "names no list");
    const element: FieldType | null = read.type?.type === "list" ? read.type.of : null;
    return { ...ctx, elements: new Map(ctx.elements).set(as, element), live: new Set() };
  };
  switch (k) {
    case "state": {
      const t = item();
      if (t && names(x, p, t.states, "state").every((s) => t.states.get(s) === false)) ctx.live.add((of as string | undefined) ?? "on");
      break;
    }
    case "signer": case "notIn": {
      if (!ctx.signer) bad("name", p, "there is no signer here");
      const t = item();
      if (t) names(x, p, { has: (s) => t.slots.get(s)?.kind === "party" }, "party slot");
      break;
    }
    case "set": case "unset": {
      const t = item();
      if (t && (typeof x !== "string" || !t.slots.has(x))) bad("name", p, "names no slot");
      break;
    }
    case "equals": case "differs":
      pair(x, p, (a, ap) => operand(d, a, ap, ctx, item));
      break;
    case "some": case "none": case "count": {
      const r = range(d, x, p, ctx, k === "count" ? ["min", "max"] : [])?.read;
      if (!r || k !== "count") break;
      // Section 6.5: a bound is a number, or an operand that reads one from a slot or a field.
      const bound = (name: string): number | null | undefined => {
        if (!(name in r)) return undefined;
        if (!isObject(r[name])) return int(r[name], at(p, name));
        const read = operand(d, r[name], at(p, name), ctx, item);
        if (read?.type && read.type.type !== "int") bad("name", at(p, name), "names no integer");
        return null;
      };
      const [min, max] = [bound("min"), bound("max")];
      if (min === undefined && max === undefined) bad("shape", p, "a count needs a min or a max");
      if (typeof min === "number" && typeof max === "number" && min > max) bad("shape", p, "min is above max");
      break;
    }
    case "every": {
      const r = rec(x, p, ["list", "states"]);
      if (!r) break;
      // A field of that name, when the act has one; otherwise a slot of the subject.
      let type = fieldOf({ field: r["list"] }, ctx);
      if (type) namesField = true;
      else {
        const t = item();
        if (!t) break;
        type = (typeof r["list"] === "string" && t.slots.get(r["list"])?.type) || null;
      }
      const listed = type?.type === "list" && type.of.type === "item" ? d.types.get(type.of.of) : undefined;
      if (!listed) bad("name", at(p, "list"), "names no field or slot that is a list of items");
      else names(r["states"], at(p, "states"), listed.states, "state");
      break;
    }
    case "fact": {
      // Section 6.5: the entry is named by a field, by a fact presented beside the intent, or by an element that a list form binds.
      const by = form(x, p, ["field", "presented", "element"], ["where"]);
      if (!by) break;
      const r = x as Rec;
      if (by[0] === "field") {
        namesField = true;
        if (fieldOf(r, ctx)?.type !== "fact") bad("name", at(p, "field"), "names no field of type fact");
      } else {
        if ("where" in r) { bad("shape", at(p, "where"), "is for a fact that a field names"); break; }
        const read = operand(d, { [by[0]]: by[1] }, at(p, by[0]), ctx, item);
        named(read);
        // The kind and the definition's name are compared with the type, so the definition must state it.
        if (read && read.type?.type !== "fact") bad("name", at(p, by[0]), `names no ${by[0] === "presented" ? "presented fact" : "element"} of type fact`);
        break;
      }
      // `a` is a field of the named entry's intent or message, which this definition cannot resolve; `b` is read in this act.
      list(r["where"] ?? [], at(p, "where"), bounds.guards).forEach((w, i) => {
        const wo = rec(w, at(at(p, "where"), i), ["equals"]);
        if (wo) pair(wo["equals"], at(at(p, "where"), i), (a, ap) => (isObject(a) && Object.keys(a).length === 1 && typeof a["field"] === "string" ? null : bad("shape", ap, "must be a field of the entry's intent or message")));
      });
      break;
    }
    case "before": case "after": {
      const r = rec(x, p, ["slot"]);
      const t = r && item();
      const s = t && typeof r["slot"] === "string" ? t.slots.get(r["slot"]) : undefined;
      if (t && !(s?.kind === "value" && s.type.type === "time")) bad("name", p, "names no value slot of type time");
      break;
    }
    case "rule":
      if (typeof x !== "string" || !rules.has(x)) bad("rule", p, "names no rule the definition declares");
      // Section 6.2: a rule reads the fields and the subjects' records whole (section 6.5), so it would read a detached value.
      if ([...(ctx.fields?.values() ?? [])].some(isDetached) || [ctx.on, ...ctx.also.values()].some((t) => t !== null && [...t.slots.values()].some((s) => isDetached(s.type)))) {
        bad("redactable-read", p, "a rule reads every field and every subject, and one of them holds a detached text");
      }
      break;
    case "capability":
      // Section 6.11: a guard that a listed capability declares. Its refusal has the name the capability gives, so a `reason` names nothing.
      capabilityGuard(d, x, p, ctx, item);
      break;
    case "each": case "has": {
      const r = k === "each" ? rec(x, p, ["list", "as", "guards"], ["where"]) : rec(x, p, ["list", "as", "where"], ["guards"]);
      const inner = r && binding(r);
      if (!r || !inner) break;
      // A slot with no `of` is a slot of the guard's own subject: only a range has items of its own.
      clauses(d, r["where"] ?? [], at(p, "where"), inner, item, true);
      nested(r["guards"] ?? [], at(p, "guards"), inner);
      break;
    }
    case "anyOf": {
      const alternatives = list(x, p, bounds.guards);
      // With no alternative the guard could never hold.
      if (Array.isArray(x) && alternatives.length === 0) bad("shape", p, "must not be empty");
      alternatives.forEach((a, i) => nested(a, at(p, i), { ...ctx, live: new Set() }));
      break;
    }
    case "distinct": case "sameSet": {
      const r = k === "distinct" ? rec(x, p, ["list", "as", "key"]) : rec(x, p, ["list", "as", "key", "items"], ["match", "ordered"]);
      const inner = r && binding(r);
      if (!r || !inner) break;
      const key = operand(d, r["key"], at(p, "key"), inner, item);
      if (k === "distinct") break;
      // Section 6.5: the keys are the local IDs of the items that the range covers, and `match` holds between each element and its item.
      // The range is read once for the whole form, so its `where` names no element.
      const items = range(d, r["items"], at(p, "items"), ctx);
      if (!items) break;
      if (key?.type?.type === "item" && key.type.of !== items.type.name) bad("name", at(p, "key"), `names no item of type ${items.type.name}`);
      clauses(d, r["match"] ?? [], at(p, "match"), inner, () => items.type, true);
      if ("ordered" in r) bool(r["ordered"], at(p, "ordered"));
      break;
    }
  }
  // Section 6.5: `reason` names the refusal. It changes no judgment.
  if ("reason" in o) str(o["reason"], at(path, "reason"));
  if ("ifPresent" in o && (bool(o["ifPresent"], at(path, "ifPresent")) === null || !namesField)) bad("shape", at(path, "ifPresent"), "is for a guard that names a field or a presented fact");
}

/** The guards of one act or handler, or of one condition, in the order written. */
export function guards(d: Defining, v: unknown, path: string, ctx: Ctx): void {
  const nesting: Nesting = { count: 0 };
  d.list(v, path, d.bounds.guards).forEach((g, i) => guard(d, g, at(path, i), ctx, nesting));
  // Section 6.1: the guards of one act or handler, counting those nested in `each`, `has` and `anyOf`.
  if (nesting.count > d.bounds.nestedGuards) d.bad("bound", path, `has ${nesting.count} guards, counting those nested; at most ${d.bounds.nestedGuards}`);
}

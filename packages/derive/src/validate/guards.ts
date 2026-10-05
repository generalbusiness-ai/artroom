/** Guard forms (scope contract, section 6.5). */

import { isObject } from "../values.ts";
import { onSubject, subject, type Ctx, type Defining, type Type } from "./context.ts";
import { fieldOf, operand, type Read } from "./operands.ts";
import { at, type Rec } from "./shape.ts";

const GUARDS = ["state", "signer", "notIn", "set", "unset", "equals", "differs", "some", "none", "count", "every", "fact", "before", "after", "rule"];

/** One guard of an act or handler. */
export function guard(d: Defining, v: unknown, path: string, ctx: Ctx): void {
  const { bounds, types, rules, indexes, bad, rec, form, list, int, bool, names } = d;
  const f = form(v, path, GUARDS, ["of", "ifPresent", "reason"]);
  if (!f) return;
  const [k, x] = f;
  const o = v as Rec;
  const p = at(path, k);
  if ("of" in o && subject(d, o["of"], at(path, "of"), ctx, true) === null) return;
  /** The subject as an item this guard reads. The item an `open` act opens has nothing to read yet. */
  const item = (): Type | null => {
    const s = subject(d, o["of"], path, ctx, false);
    if (s === null || s === "scope") return null;
    if (ctx.nascent && onSubject(o["of"])) return bad("nascent-guard", path, "a guard may not read the item its act opens");
    return s;
  };
  let namesField = false;
  const pair = (e: unknown, ep: string, a: (v: unknown, path: string) => Read | null) => {
    const r = rec(e, ep, ["a", "b"]);
    if (!r) return;
    // Section 6.5: each operand is validated by itself. A valid first operand excuses nothing about the second.
    const read = [a(r["a"], at(ep, "a")), operand(d, r["b"], at(ep, "b"), ctx, item)];
    if (read.some((o) => o && o.fields.length > 0)) namesField = true;
  };
  switch (k) {
    case "state": {
      const t = item();
      if (t && names(x, p, t.states, "state").every((s) => t.states.get(s) === false)) ctx.live.add((o["of"] as string | undefined) ?? "on");
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
      const r = rec(x, p, ["type", "states"], k === "count" ? ["where", "min", "max"] : ["where"]);
      if (!r) break;
      const t = typeof r["type"] === "string" ? types.get(r["type"]) : undefined;
      if (!t) { bad("name", at(p, "type"), "names no item type"); break; }
      names(r["states"], at(p, "states"), t.states, "state");
      const slots = new Set<string>();
      list(r["where"] ?? [], at(p, "where"), bounds.guards).forEach((w, i) => {
        const wo = rec(w, at(at(p, "where"), i), ["equals"]);
        const eq = wo && rec(wo["equals"], at(at(p, "where"), i), ["a", "b"]);
        if (!eq) return;
        // In a `where`, a slot with no `of` is a slot of each item the range covers.
        for (const side of ["a", "b"]) {
          const slot = operand(d, eq[side], at(at(at(p, "where"), i), side), ctx, () => t)?.slot;
          if (typeof slot === "string") slots.add(slot);
        }
      });
      if (slots.size > 0 || (Array.isArray(r["where"]) && r["where"].length > 0)) indexes.push({ path: p, type: t.name, slots: [...slots].sort() });
      if (k === "count") {
        const min = "min" in r ? int(r["min"], at(p, "min")) : undefined;
        const max = "max" in r ? int(r["max"], at(p, "max")) : undefined;
        if (min === undefined && max === undefined) bad("shape", p, "a count needs a min or a max");
        if (typeof min === "number" && typeof max === "number" && min > max) bad("shape", p, "min is above max");
      }
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
      const of = type?.type === "list" && type.of.type === "item" ? types.get(type.of.of) : undefined;
      if (!of) bad("name", at(p, "list"), "names no field or slot that is a list of items");
      else names(r["states"], at(p, "states"), of.states, "state");
      break;
    }
    case "fact": {
      const r = rec(x, p, ["field"], ["where"]);
      if (!r) break;
      namesField = true;
      if (fieldOf(r, ctx)?.type !== "fact") bad("name", at(p, "field"), "names no field of type fact");
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
      break;
  }
  // Section 6.5: `reason` names the refusal. It changes no judgment.
  if ("reason" in o) d.str(o["reason"], at(path, "reason"));
  if ("ifPresent" in o && (bool(o["ifPresent"], at(path, "ifPresent")) === null || !namesField)) bad("shape", at(path, "ifPresent"), "is for a guard that names a field");
}

/** The guards of one act or handler, in the order written. */
export function guards(d: Defining, v: unknown, path: string, ctx: Ctx): void {
  d.list(v, path, d.bounds.guards).forEach((g, i) => guard(d, g, at(path, i), ctx));
}

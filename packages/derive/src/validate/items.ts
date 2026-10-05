/** Item types: their states and their party, reference and value slots (scope contract, section 6.3). */

import type { FieldType } from "@generalbusiness/artroom-contract";
import { isValue } from "../values.ts";
import type { Defining, Slot } from "./context.ts";
import { fieldType } from "./fields.ts";
import { at } from "./shape.ts";

/** Reads every item type into `d.types`. One with a problem is reported and left out. */
export function itemTypes(d: Defining, v: unknown): void {
  const { bounds, problems, bad, rec, entries, int, bool } = d;
  for (const [name, tv] of entries(v, "items", bounds.items)) {
    const path = at("items", name);
    const before = problems.length;
    const o = rec(tv, path, ["many", "max", "states", "initial", "parties", "refs", "values"]);
    if (!o) continue;
    const many = bool(o["many"], at(path, "many"));
    const max = int(o["max"], at(path, "max"), 1);
    if (many === false && max !== null && max !== 1) bad("shape", at(path, "max"), "a type that is not `many` has max 1");
    const states = new Map<string, boolean>();
    for (const [s, sv] of entries(o["states"], at(path, "states"), bounds.states)) {
      const so = rec(sv, at(at(path, "states"), s), ["final"]);
      if (so && bool(so["final"], at(at(path, "states"), s)) !== null) states.set(s, so["final"] as boolean);
    }
    if (typeof o["initial"] !== "string" || !states.has(o["initial"])) bad("name", at(path, "initial"), "names no state");
    const slots = new Map<string, Slot>();
    const slot = (kind: Slot["kind"], bound: number, required: readonly string[], optional: readonly string[]) => {
      for (const [s, sv] of entries(o[kind === "party" ? "parties" : `${kind}s`], at(path, kind === "party" ? "parties" : `${kind}s`), bound)) {
        const p = at(at(path, kind === "party" ? "parties" : `${kind}s`), s);
        const so = rec(sv, p, ["fixed", "required", ...required], optional);
        if (!so || bool(so["fixed"], at(p, "fixed")) === null || bool(so["required"], at(p, "required")) === null) continue;
        if (slots.has(s)) { bad("shape", p, "one item type has two slots of this name"); continue; }
        let type: FieldType | null;
        if (kind === "party") {
          if (bool(so["list"], at(p, "list")) === null || bool(so["author"], at(p, "author")) === null) continue;
          // Section 6.3: a party list holds at most 64 members. One that declares no `max` holds the bound itself.
          if ("max" in so && (!so["list"] || (int(so["max"], at(p, "max"), 1) ?? 0) > bounds.partyMembers)) bad("bound", at(p, "max"), `only a list has a max, of at most ${bounds.partyMembers}`);
          type = so["list"] ? { type: "list", of: { type: "member" }, max: (so["max"] as number | undefined) ?? bounds.partyMembers } : { type: "member" };
        } else type = fieldType(d, so[kind === "ref" ? "to" : "of"], at(p, kind === "ref" ? "to" : "of"), [], false, kind === "value");
        if (!type) continue;
        // Section 6.2: a detached text is kept under its digest for the slot that names it. A default would name bytes that nothing holds.
        if (type.type === "text" && type.detached && "default" in so) bad("shape", at(p, "default"), "a detached text has no default: no bytes would come with it");
        if ("default" in so && !isValue(type, so["default"], bounds)) bad("shape", at(p, "default"), "is not a value of the slot's type");
        slots.set(s, { kind, fixed: so["fixed"] as boolean, required: so["required"] as boolean, list: so["list"] === true, type, hasDefault: "default" in so });
      }
    };
    slot("party", bounds.parties, ["list", "author"], ["max"]);
    slot("ref", bounds.refs, ["to"], []);
    slot("value", bounds.values, ["of"], ["default"]);
    if (problems.length === before) d.types.set(name, { name, states, initial: o["initial"] as string, slots });
  }
}

/** The item form of the hold capability (scope contract, section 6.8). */

import { isObject } from "../values.ts";
import { onSubject, type Ctx, type Defining, type Type } from "./context.ts";
import { operand } from "./operands.ts";
import { at } from "./shape.ts";

/** True when a list of written effects holds a `hold` effect of that kind on the primary item. */
export const holdDoes = (effects: unknown, what: string) => Array.isArray(effects) && effects.some((e) => isObject(e) && isObject(e["hold"]) && e["hold"]["do"] === what && onSubject(e["of"]));

/** The hold types: each type that a `hold: open` effect on the primary item of an `open` act targets. They are needed before any effect is read. */
export function holdTypesOf(acts: Readonly<Record<string, unknown>>): string[] {
  const found: string[] = [];
  for (const a of Object.values(acts)) if (isObject(a) && a["step"] === "open" && typeof a["on"] === "string" && holdDoes(a["effects"], "open")) found.push(a["on"]);
  return found;
}

/** A `hold` effect on the subject `s`, named `sk`. Returns what it sets, for the conflict check. */
export function holdEffect(d: Defining, x: unknown, p: string, s: Type, sk: string, ctx: Ctx, nascent: boolean): string | null {
  const { bad, rec, form } = d;
  const r = rec(x, p, ["do"], ["extent"]);
  if (!r) return null;
  if (!d.holds) bad("capability", p, "the definition does not list hold@1");
  // Section 4.1: a hold is opened by an `open` act whose primary item is the hold. Any other opening would be a second item.
  if (r["do"] === "open") { if (!nascent || ctx.timed) bad("one-item", p, "a hold is opened only as the primary item of an open act"); }
  else if (r["do"] !== "renew" && r["do"] !== "end") bad("shape", at(p, "do"), "is open, renew or end");
  else if (!d.holdTypes.has(s.name)) bad("hold", p, `${s.name} is not a type that a hold: open effect targets`);
  else if (r["do"] === "renew" && (ctx.timed || nascent)) bad("hold", p, "a hold is renewed by an act on the hold");
  if ("extent" in r) {
    const e = form(r["extent"], at(p, "extent"), ["field", "slot"]);
    if (e) operand(d, r["extent"], at(p, "extent"), ctx, () => s);
  }
  return `the hold of ${sk}`;
}

/**
 * Section 6.8, as far as the first delivery needs it: the hold's end is a
 * time slot under a timed rule that ends the hold, set at the opening. `set`
 * holds the slots that the opening act's effects set.
 */
export function opensHold(d: Defining, effects: unknown, on: Type, set: ReadonlySet<unknown>, timed: Readonly<Record<string, unknown>>, path: string): void {
  if (holdDoes(effects, "open") && !Object.values(timed).some((r) => isObject(r) && r["on"] === on.name && holdDoes(r["effects"], "end") && set.has(r["deadline"]))) {
    d.bad("hold", path, "an act that opens a hold sets the deadline slot of a timed rule that ends it");
  }
}

/** The slots a hold type must have: `holder`, and `under` when it has one. */
export function holdSlots(d: Defining): void {
  for (const name of d.holdTypes) {
    const t = d.types.get(name);
    if (!t) continue;
    const holder = t.slots.get("holder");
    const under = t.slots.get("under");
    if (!(holder?.kind === "party" && !holder.list)) d.bad("hold", at("items", name), "a hold type has a party slot `holder` that holds one member");
    if (under && !(under.kind === "ref" && under.type.type === "item")) d.bad("hold", at("items", name), "a hold's `under` is a reference to a local item");
  }
}

/**
 * The item form of the hold capability (scope contract, section 6.8): the
 * `hold` effect, and what a definition that has a hold type must hold. The
 * hold type is the item type that an act with `hold: { do: "open" }` opens.
 *
 * Only the capability sets a hold's holder, its epoch and its state. So the
 * validator refuses a written effect that sets one of them, and the fold
 * derives all three from a `hold` record.
 */

import type { DeclaredDefinition, TimedRule } from "@generalbusiness/artroom-contract";
import { isObject, own } from "../values.ts";
import { onSubject, type Ctx, type Defining, type Type } from "./context.ts";
import { operand } from "./operands.ts";
import { at, type Rec } from "./shape.ts";
import { RECORD_BYTES } from "./sizes.ts";

/** The slots of a hold type that the capability names. */
const HOLDER = "holder";
const UNDER = "under";
const EPOCH = "epoch";

/** True when a list of written effects holds a `hold` effect of that kind on the primary item. */
export const holdDoes = (effects: unknown, what: string) => Array.isArray(effects) && effects.some((e) => isObject(e) && isObject(e["hold"]) && e["hold"]["do"] === what && onSubject(e["of"]));

/** The final state of a hold type. Null: the type is not two states, one that is not final, its initial, and one that is. */
export function endedState(t: Type): string | null {
  const final = [...t.states].filter(([, is]) => is).map(([state]) => state);
  return t.states.size === 2 && final.length === 1 && t.states.get(t.initial) === false ? final[0]! : null;
}

/**
 * The hold types: each type that a `hold: open` effect on the primary item
 * of an `open` act targets. They are needed before any effect is read.
 *
 * The capability gives a hold its holder and its epoch at the opening:
 * `hold: open` sets both, and every act that opens a hold type has that
 * effect (`opensHold`). So no written effect sets either, though both may
 * be required. Each is marked here as a slot that holds a value from the
 * opening, as a slot with a default does.
 */
export function holdTypes(d: Defining, acts: Readonly<Record<string, unknown>>): void {
  for (const a of Object.values(acts)) if (isObject(a) && a["step"] === "open" && typeof a["on"] === "string" && holdDoes(a["effects"], "open")) d.holdTypes.add(a["on"]);
  for (const name of d.holdTypes) {
    const t = d.types.get(name);
    if (!t) continue;
    if (t.slots.get(EPOCH)?.hasDefault) d.bad("hold", at(at(at("items", name), "values"), EPOCH), "only the hold effect sets a hold's epoch, so it has no default");
    for (const given of [HOLDER, EPOCH]) {
      const slot = t.slots.get(given);
      if (slot) t.slots.set(given, { ...slot, hasDefault: true });
    }
  }
}

/** A `hold` effect on the subject `s`, named `sk`. Returns what it sets, for the conflict check. */
export function holdEffect(d: Defining, x: unknown, p: string, s: Type, sk: string, ctx: Ctx, nascent: boolean): string | null {
  const { bad, rec } = d;
  const r = rec(x, p, ["do"], ["extent"]);
  if (!r) return null;
  const what = r["do"];
  if (!d.holds) bad("capability", p, "the definition does not list hold@1");
  // Section 4.1: a hold is opened by an `open` act whose primary item is the hold. Any other opening would be a second item.
  // A handler has no signer to be the holder: `receives` refuses, as `hold`, a handler that opens a hold type or has `hold: open`.
  if (what === "open") { if (!nascent) bad("one-item", p, "a hold is opened only as the primary item of an open act"); }
  else if (what !== "renew" && what !== "end") bad("shape", at(p, "do"), "is open, renew or end");
  else if (!d.holdTypes.has(s.name)) bad("hold", p, `${s.name} is not a type that a hold: open effect targets`);
  // The holder is the signer of the entry that renews. A timed rule, a handler and the entry that runs a result clause have none.
  else if (what === "renew" && (!ctx.signer || ctx.clause || nascent)) bad("hold", p, "a hold is renewed by an act on the hold");
  // It counts as a `state` effect (section 6.8), so in an act or a handler it needs what one needs: a subject that a guard shows is live.
  else if (what === "end" && !ctx.clause && !ctx.live.has(sk)) bad("final", p, "hold: end needs a `state` guard on its subject that lists no final state");
  // Section 6.8: `extent` is an operand that the validator checks. It is recorded only by an ordinary `value` effect.
  if ("extent" in r) operand(d, r["extent"], at(p, "extent"), ctx, () => s, false);
  return what === "end" ? `the state of ${sk}` : `the hold of ${sk}`;
}

/**
 * Section 6.8: every act that opens a hold type opens it with `hold: open`,
 * which gives the hold its holder and its epoch. The slots the act sets and
 * the timed rules are no longer read here: `holdForms` reads them.
 */
export function opensHold(d: Defining, effects: unknown, on: Type, _set: ReadonlySet<unknown>, _timed: Readonly<Record<string, unknown>>, path: string): void {
  if (d.holdTypes.has(on.name) && !holdDoes(effects, "open")) d.bad("hold", path, "an act that opens a hold type has a hold: open effect");
}

/** Each list of effects of the definition as written, with its path and the item type that each subject names. */
function* effectLists(top: Rec): Generator<{ list: unknown[]; path: string; typeOf: (of: unknown) => unknown; act: boolean }> {
  for (const [family, primary] of [["acts", "on"], ["receives", "opens"], ["timed", "on"]] as const) {
    for (const [name, o] of isObject(top[family]) ? Object.entries(top[family]) : []) {
      if (!isObject(o)) continue;
      const path = at(family, name);
      const also = o["also"];
      const typeOf = (of: unknown): unknown => {
        if (onSubject(of)) return o[primary];
        const named = typeof of === "string" && of.startsWith("also.") && isObject(also) ? own(also, of.slice(5)) : undefined;
        return isObject(named) ? named["item"] : undefined;
      };
      if (Array.isArray(o["effects"])) yield { list: o["effects"], path: at(path, "effects"), typeOf, act: family === "acts" };
      // The clauses of each request that it sends: they run in a later entry, on the same subjects.
      for (const [i, send] of (Array.isArray(o["sends"]) ? o["sends"] : []).entries()) {
        for (const [form, body] of isObject(send) ? Object.entries(send) : []) {
          for (const [clause, list] of isObject(body) && isObject(body["result"]) ? Object.entries(body["result"]) : []) {
            if (Array.isArray(list)) yield { list, path: at(at(at(at(at(path, "sends"), i), form), "result"), clause), typeOf, act: false };
          }
        }
      }
    }
  }
}

/**
 * Section 6.8: what the validator requires of a definition that has a hold
 * type. `top` is the definition as written. It is read after the acts, the
 * handlers and the timed rules, so each form in it has been checked.
 */
export function holdForms(d: Defining, top: Rec): void {
  const { bad } = d;
  const timed = isObject(top["timed"]) ? top["timed"] : {};
  /** For each hold type that is read whole: the slot that holds its end. */
  const ends = new Map<string, string>();
  for (const name of d.holdTypes) {
    const t = d.types.get(name);
    if (!t) continue;
    const path = at("items", name);
    if (endedState(t) === null) bad("hold", path, "a hold type has two states: one that is not final, its initial, and one that is final");
    const holder = t.slots.get(HOLDER);
    if (!(holder?.kind === "party" && !holder.list && !holder.fixed)) bad("hold", path, "a hold type has a party slot `holder` that holds one member and is not fixed");
    const under = t.slots.get(UNDER);
    if (!(under?.kind === "ref" && under.type.type === "item" && under.fixed && under.required)) bad("hold", path, "a hold type has a reference slot `under` to a local item, fixed and required");
    // A hold under a hold would end with it, and so would a hold under that one. The contract states no such chain, so none is taken.
    else if (d.holdTypes.has(under.type.of)) bad("hold", path, "a hold is not under a hold");
    const epoch = t.slots.get(EPOCH);
    // An opening sets the epoch to 1 and an end raises it, so the slot holds 1 and 2 at the least.
    if (!(epoch?.kind === "value" && epoch.type.type === "int" && epoch.required && epoch.type.min <= 1 && epoch.type.max >= 2)) bad("hold", path, "a hold type has a value slot `epoch` of type int, required, that holds 1 and 2");
    // The timed rule: one rule on the hold type that ends the hold at the end time. A timed rule applies in live states only, and
    // a hold type has one, so the rule's `states` is that state.
    const rules = Object.values(timed).filter((r): r is Rec => isObject(r) && r["on"] === name && holdDoes(r["effects"], "end"));
    const rule = rules.length === 1 ? rules[0]! : null;
    const end = typeof rule?.["deadline"] === "string" ? t.slots.get(rule["deadline"]) : undefined;
    if (!rule) bad("hold", path, "a hold type has one timed rule whose effects include hold: end");
    else if (!(end?.kind === "value" && end.type.type === "time" && end.required)) bad("hold", path, "the deadline of the rule that ends a hold is a value slot of type time, required");
    else ends.set(name, rule["deadline"] as string);
  }
  if (d.holdTypes.size === 0) return;

  // The opening act: exactly one grant is used by the acts that have `hold: open`.
  const acts = isObject(top["acts"]) ? Object.values(top["acts"]) : [];
  if (new Set(acts.filter((a) => isObject(a) && a["step"] === "open" && holdDoes(a["effects"], "open")).map((a) => (a as Rec)["grant"])).size > 1) bad("hold", "acts", "exactly one grant is used by the acts that open a hold");

  // What only the capability sets, and how an end time is set.
  for (const { list, path, typeOf, act } of effectLists(top)) {
    const holds = new Map<unknown, { hold: number; renews: boolean; setsEnd: boolean }>();
    list.forEach((e, i) => {
      if (!isObject(e)) return;
      const type = typeOf(e["of"]);
      if (typeof type !== "string" || !d.holdTypes.has(type)) return;
      const p = at(path, i);
      const seen = holds.get(e["of"] ?? "on") ?? { hold: 0, renews: false, setsEnd: false };
      holds.set(e["of"] ?? "on", seen);
      const [party, value, hold] = [e["party"], e["value"], e["hold"]];
      if ("state" in e) bad("hold", p, "a hold's state is set by hold: end");
      if (isObject(party) && party["slot"] === HOLDER) bad("hold", p, "a hold's holder is set by the hold effect, from the signer");
      if (isObject(value) && value["slot"] === EPOCH) bad("hold", p, "only the hold effect sets a hold's epoch");
      if (isObject(value) && value["slot"] === ends.get(type)) {
        seen.setsEnd = true;
        if (!(isObject(value["from"]) && "time" in value["from"])) bad("hold", p, "a hold's end is set from the commit time plus a constant");
      }
      if (isObject(hold)) {
        if (++seen.hold > 1) bad("conflict", p, "another effect is also a hold effect on this subject");
        // Asked only of a hold type whose end slot is known: one without it is reported above.
        seen.renews ||= hold["do"] === "renew" && ends.has(type);
      }
    });
    // A renewal sets the end the same way the opening does.
    if (act) for (const seen of holds.values()) if (seen.renews && !seen.setsEnd) bad("hold", path, "an act that renews a hold sets its end");
  }
}

/**
 * The most canonical bytes that the ends of holds add to the entry of one
 * timed rule (section 6.4, "a timed entry always fits"). When the rule
 * takes its item to a final state, every live hold under that item ends in
 * the same entry, and a hold type's `max` bounds its live holds. Each end is
 * one record with an epoch.
 */
export function heldUnderBytes(declared: DeclaredDefinition, holds: Iterable<string>, rule: TimedRule): number {
  const type = own(declared.items, rule.on)!;
  if (!rule.effects.some((e) => "state" in e && own(type.states, e.state)?.final)) return 0;
  let bytes = 0;
  for (const name of holds) {
    const hold = own(declared.items, name)!;
    const under = own(hold.refs, UNDER)?.to;
    if (under?.type === "item" && under.of === rule.on) bytes += hold.max * (RECORD_BYTES + 20);
  }
  return bytes;
}

/**
 * The item form of the hold capability (scope contract, section 6.8): what a
 * `hold` effect derives, how its record changes the hold item, and the rule
 * that a hold ends with what it is under.
 *
 * A hold is an item of a hold type, which the validator has checked: two
 * states, one of them final; a party slot `holder`; a fixed reference slot
 * `under` to a local item; and a value slot `epoch`. Only a `hold` record
 * changes the holder, the epoch or the state of a hold. The fold applies the
 * record with `changeHold`, and the judges apply it to their working copy
 * with the same function, so both see the same hold afterwards.
 */

import type { Effect, ItemType, RefusalReason } from "@generalbusiness/artroom-contract";
import { UNDER, withMembers, withPrincipal, type Signer } from "./attribution.ts";
import type { Judging } from "./guards.ts";
import type { Item } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { own, same } from "./values.ts";

/** The slots of a hold type that the capability names: the member who holds, and the count that fences that member's writes. */
export const HOLDER = "holder";
export const EPOCH = "epoch";

export type HoldEffect = Extract<Effect, { effect: "hold" }>;

/** The state of a hold type that is not final, and the one that is. */
export function holdStates(type: ItemType): { held: string; ended: string } {
  const ended = Object.keys(type.states).find((state) => type.states[state]!.final);
  if (ended === undefined || type.states[type.initial]?.final !== false) throw new Error("a hold type has a state that is not final, its initial, and one that is");
  return { held: type.initial, ended };
}

const epochOf = (hold: Item): number => (own(hold.values, EPOCH) as number | null | undefined) ?? 0;

/**
 * One `hold` record on its hold. Every record sets the epoch. `open` and
 * `renew` make the signer the holder, who joins the item's attribution
 * history with the signer's principal (section 6.7). `end` sets the final
 * state. An entry with no signer changes no holder: only an act opens or
 * renews a hold.
 */
export function changeHold(hold: Item, effect: HoldEffect, definition: ValidDefinition, signer: Signer | null): Item {
  const type = own(definition.declared.items, hold.type);
  if (!type || !definition.holdTypes.includes(hold.type)) throw new Error(`item ${hold.id} is no hold, and a hold effect changes a hold`);
  const values = { ...hold.values, [EPOCH]: effect.epoch };
  if (effect.change === "end") return { ...hold, state: holdStates(type).ended, values };
  if (!signer) return { ...hold, values };
  return { ...hold, parties: { ...hold.parties, [HOLDER]: signer.member }, values, attributed: withMembers(hold.attributed, withPrincipal(signer.member, signer)) };
}

/**
 * The record of one written `hold` effect on `hold`, as it is before the
 * effect (section 6.8).
 *
 * - `open`: the epoch is 1.
 * - `renew`: the epoch rises by one when the signer is not the holder.
 * - `end`: the epoch rises by one. It is total: on a hold that is not final
 *   it is never refused.
 *
 * The epoch is a declared slot, so it has a most. An end must always have
 * room to rise, so a renewal by another member is refused when it would
 * leave none.
 */
export function deriveHold(j: Judging, hold: Item, what: "open" | "renew" | "end"): { ok: true; effect: HoldEffect } | { ok: false; reason: RefusalReason; detail: string } {
  // I2 merge: the records and operations that `hold@1` keeps for a hold (section 6.11) are step 11's and I3's. Only the item form is derived here.
  const epoch = epochOf(hold);
  if (what === "open") return { ok: true, effect: { effect: "hold", item: hold.id, change: "open", epoch: 1 } };
  if (what === "end") return { ok: true, effect: { effect: "hold", item: hold.id, change: "end", epoch: epoch + 1 } };
  const other = !same(own(hold.parties, HOLDER) ?? null, j.signer?.member ?? null);
  const of = own(own(j.definition.declared.items, hold.type)!.values, EPOCH)!.of;
  if (other && of.type === "int" && epoch + 2 > of.max) return { ok: false, reason: "bad-field", detail: "the hold's epoch could not rise again when the hold ends" };
  return { ok: true, effect: { effect: "hold", item: hold.id, change: "renew", epoch: epoch + (other ? 1 : 0) } };
}

/**
 * Section 6.8, a hold ends with what it is under: when the effects of an
 * entry take an item to a final state, every hold that is not final and
 * whose `under` names that item ends in the same entry. Each end is a `hold`
 * record, in the order of the hold types' names and then of the holds' IDs.
 *
 * `working` holds each subject of the entry as its written effects left it,
 * and `j.subjects` as it was before them. `subject` in the result names the
 * hold when it is one of those subjects, so that the caller ends its working
 * copy too.
 *
 * The evidence is complete. A hold that is not final is live, a type's `max`
 * bounds its live items, and the state's index gives them by type and state.
 * So one page of `max` items is every hold of a type that could be under the
 * item, and no hold is passed over.
 */
export function endsUnder(j: Judging, working: ReadonlyMap<string, Item>): { subject: string | null; effect: HoldEffect }[] {
  const { declared, holdTypes } = j.definition;
  const final = (item: Item) => own(own(declared.items, item.type)?.states, item.state)?.final === true;
  const ended = new Set<number>();
  for (const [subject, item] of working) {
    const was = j.subjects.get(subject);
    if (final(item) && !(was && final(was))) ended.add(item.id);
  }
  const ends: { subject: string | null; effect: HoldEffect }[] = [];
  if (ended.size === 0) return ends;
  const named = new Map([...working].map(([subject, item]) => [item.id, subject]));
  for (const name of holdTypes) {
    const type = own(declared.items, name)!;
    const { held } = holdStates(type);
    // The holds that were live before the entry, each as the entry's effects left it; then one that the entry itself opens.
    const holds = j.view.page(name, [held], null, type.max).items.map((hold) => working.get(named.get(hold.id) ?? "") ?? hold);
    const opened = working.get("on");
    if (opened && opened.type === name && !j.subjects.has("on")) holds.push(opened);
    for (const hold of holds) {
      const under = own(hold.refs, UNDER);
      if (hold.state !== held || typeof under !== "number" || !ended.has(under)) continue;
      ends.push({ subject: named.get(hold.id) ?? null, effect: { effect: "hold", item: hold.id, change: "end", epoch: epochOf(hold) + 1 } });
    }
  }
  return ends;
}

/** Shared item transformations for judgment, recorded fold and C1 projection. */
import type { Digest, Effect, Entry, ItemType, MemberRef } from "@generalbusiness/dap-contract";
import { withActing, withMembers, withPrincipal, type Signer } from "./attribution.ts";
import { HOLDER, changeHold } from "./hold.ts";
import type { Item, Party } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { own, same } from "./values.ts";

/** The effects that change one item. */
export type ItemEffect = Extract<Effect, { effect: "state" | "party" | "ref" | "value" | "list" | "hold" }>;

/** The slot of a hold type whose member is the holder (section 6.8). */
export { HOLDER };

/** Section 6.3: a new item is in its initial state, each slot takes its default or is empty, and its revision is 1. */
export function newItem(effect: Extract<Effect, { effect: "open" }>, type: ItemType, opened: Digest | null): Item {
  const each = <T, V>(slots: Record<string, T>, value: (slot: T) => V) => Object.fromEntries(Object.entries(slots).map(([name, slot]) => [name, value(slot)]));
  return {
    id: effect.item, type: effect.type, state: effect.state, revision: 1, opened,
    parties: each(type.parties, (s): Party => (s.list ? [] : null)), refs: each(type.refs, () => null), values: each(type.values, (s) => s.default ?? null),
    attributed: [],
  };
}

/** The signer of an act entry, as the grant it was judged on states it. The judge records exactly that one grant. */
export function signerOf(entry: Entry): Signer | null {
  const grant = entry.input.type === "act" ? entry.input.authority[0] : undefined;
  return grant ? { member: grant.subject, principal: grant.principal } : null;
}

/**
 * One effect on one item. The judges use it on their working copy and the
 * fold on the state, so both see the same item afterwards. A member put in an
 * `author` slot, or made the holder of a hold, joins the item's attribution
 * history, with the signer's principal when that member is the signer. And
 * whenever a member of that history signs an entry that changes the item,
 * the principal of the grant judged for that entry joins it (section 6.7).
 */
export function changeItem(item: Item, effect: ItemEffect, definition: ValidDefinition, signer: Signer | null): Item {
  const changed = changeSlots(item, effect, definition, signer);
  const attributed = withActing(changed.attributed, signer);
  return attributed === changed.attributed ? changed : { ...changed, attributed };
}

// A slot is set by a spread with a computed key, which defines an own property whatever the slot is named (`own`, in values.ts).
function changeSlots(item: Item, effect: ItemEffect, definition: ValidDefinition, signer: Signer | null): Item {
  const type = own(definition.declared.items, item.type)!;
  const attributes = (slot: string) => own(type.parties, slot)?.author === true || (slot === HOLDER && definition.holdTypes.includes(item.type));
  const noted = (slot: string, member: MemberRef) => (attributes(slot) ? withMembers(item.attributed, withPrincipal(member, signer)) : item.attributed);
  switch (effect.effect) {
    case "state": return { ...item, state: effect.state };
    case "party": {
      const value: Party = effect.member ?? (own(type.parties, effect.slot)?.list ? [] : null);
      return { ...item, parties: { ...item.parties, [effect.slot]: value }, attributed: effect.member ? noted(effect.slot, effect.member) : item.attributed };
    }
    case "list": {
      const held = own(item.parties, effect.slot);
      const list = Array.isArray(held) ? (held as readonly MemberRef[]) : [];
      const next = effect.change === "add" ? withMembers(list, [effect.member]) : list.filter((m) => !same(m, effect.member));
      return { ...item, parties: { ...item.parties, [effect.slot]: next }, attributed: effect.change === "add" ? noted(effect.slot, effect.member) : item.attributed };
    }
    case "ref": return { ...item, refs: { ...item.refs, [effect.slot]: effect.to } };
    case "value": return { ...item, values: { ...item.values, [effect.slot]: effect.value } };
    case "hold": return changeHold(item, effect, definition, signer);
  }
}


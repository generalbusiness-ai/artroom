/**
 * Effect derivation (scope contract, sections 6.3, 6.6 and 6.8): from the
 * written effect forms of an act or rule to the `Effect` records of its
 * entry. Each record is applied to a working copy by the same function the
 * fold uses, so a later effect, a send and the `required-unset` check read
 * the items as the fold will leave them.
 */

import type { Effect, EffectForm, FactRef, FieldValue, MemberRef, Notify, RefusalReason } from "@generalbusiness/artroom-contract";
import { attribution } from "./attribution.ts";
import { HOLDER, changeItem, newItem, type ItemEffect } from "./fold.ts";
import { members, slotOf, type Judging } from "./guards.ts";
import type { Item } from "./state.ts";
import { timeMs, timeOf } from "./time.ts";
import { isMemberRef, isValue, same } from "./values.ts";

export type Derived<T> = ({ ok: true } & T) | { ok: false; reason: RefusalReason; detail: string };

/**
 * `opens`: the item type this entry opens, or null. `working` in the result
 * holds each subject as it is after the effects, with the opened item as `on`.
 */
export function deriveEffects(j: Judging, forms: readonly EffectForm[], attention: readonly Notify[], opens: string | null): Derived<{ effects: Effect[]; working: Map<string, Item> }> {
  const items = j.definition.declared.items;
  const working = new Map(j.subjects);
  const effects: Effect[] = [];
  const refuse = (reason: RefusalReason, detail: string) => ({ ok: false, reason, detail }) as const;
  /**
   * A field's value, or null. An act's fields were checked against their
   * types. A handler's message declares none (section 6.4), so there the
   * value is checked against the slot it would fill.
   */
  const fieldFor = (name: string, fits: (value: FieldValue) => boolean): Derived<{ value: FieldValue | null }> => {
    const value = j.fields[name] ?? null;
    return value === null || Object.hasOwn(j.fieldTypes, name) || fits(value) ? { ok: true, value } : refuse("bad-field", `${name} is not a value of the slot's type`);
  };
  const apply = (subject: string, effect: ItemEffect) => {
    effects.push(effect);
    working.set(subject, changeItem(working.get(subject)!, effect, j.definition, j.signer));
  };

  if (opens !== null) {
    // Section 6.3, "Opening, exactly": the initial state, each default, then the opening effects in the order written.
    const open = { effect: "open", item: j.self, type: opens, state: items[opens]!.initial } as const;
    effects.push(open);
    working.set("on", newItem(open, items[opens]!, null));
  }

  const renewals: { at: number; subject: string }[] = [];
  for (const [i, form] of forms.entries()) {
    const subject = form.of ?? "on";
    const item = working.get(subject)!;
    const type = items[item.type]!;
    const id = item.id;
    /** A list may take one more member. */
    const room = (slot: string) => members(working.get(subject)!.parties[slot]).length < Math.min(type.parties[slot]?.max ?? j.bounds.listElements, j.bounds.listElements);

    if ("state" in form) {
      // Section 6.3: an item in a final state refuses every transition.
      if (type.states[item.state]?.final) return refuse("final", `effects.${i}: item ${id} is ${item.state}`);
      apply(subject, { effect: "state", item: id, state: form.state });
    } else if ("party" in form) {
      const { slot, from, list } = form.party;
      let member: MemberRef | null;
      if (from === null) member = null;
      else if ("signer" in from) member = j.signer?.member ?? null;
      else if ("fact" in from) {
        const ref = j.fields[from.fact] as FactRef | undefined;
        const input = ref ? j.facts.get(ref.hash)?.entry.input : undefined;
        const value = input?.type === "act" ? input.signed.intent.fields[from.field] : undefined;
        if (value !== undefined && !isMemberRef(value)) return refuse("bad-field", `effects.${i}: the fact's field ${from.field} is not a member`);
        member = value ?? null;
      } else if ("field" in from) {
        const field = fieldFor(from.field, isMemberRef);
        if (!field.ok) return field;
        member = field.value as MemberRef | null;
      } else member = (item.parties[from.slot] as MemberRef | null | undefined) ?? null;
      const has = member !== null && members(item.parties[slot]).some((m) => same(m, member));
      if (list === undefined) apply(subject, { effect: "party", item: id, slot, member });
      else if (member && list === "add" && !has) {
        if (!room(slot)) return refuse("slot-full", `effects.${i}: ${slot}`);
        apply(subject, { effect: "list", item: id, slot, change: "add", member });
      } else if (member && list === "remove" && has) apply(subject, { effect: "list", item: id, slot, change: "remove", member });
    } else if ("ref" in form) {
      const { slot, from } = form.ref;
      // Section 6.4: inside a scope, `self` is a local reference to the entry being written, and so to the item it opens.
      const field = from !== null && from !== "self" && "field" in from ? fieldFor(from.field, (v) => isValue(type.refs[slot]!.to, v, j.bounds)) : null;
      if (field && !field.ok) return field;
      const to: FieldValue | null = from === null ? null : from === "self" ? j.self : field ? field.value : "slot" in from ? (item.refs[from.slot] ?? null) : null;
      apply(subject, { effect: "ref", item: id, slot, to });
    } else if ("value" in form) {
      const { slot, from } = form.value;
      // The commit time plus a constant: a derived deadline, such as a new hold's end (section 5.2, step 6.4).
      const field = "field" in from ? fieldFor(from.field, (v) => isValue(type.values[slot]!.of, v, j.bounds)) : null;
      if (field && !field.ok) return field;
      const value: FieldValue | null = field ? field.value : "const" in from ? from.const : "time" in from ? timeOf(timeMs(j.clock.reading)! + from.time.plusSeconds * 1000) : null;
      apply(subject, { effect: "value", item: id, slot, value });
    } else if ("attribute" in form) {
      // Section 6.7: the attribution of the named subject, not of the item that receives it.
      const { slot } = form.attribute;
      for (const member of attribution(working.get(form.attribute.of)!, j.signer)) {
        if (members(working.get(subject)!.parties[slot]).some((m) => same(m, member))) continue;
        if (!room(slot)) return refuse("slot-full", `effects.${i}: ${slot}`);
        apply(subject, { effect: "list", item: id, slot, change: "add", member });
      }
    } else if (form.hold.do === "open") apply(subject, { effect: "hold", item: id, change: "open", epoch: 1 });
    else if (form.hold.do === "end") apply(subject, { effect: "hold", item: id, change: "end", epoch: (item.epoch ?? 0) + 1 });
    else {
      // Whether a renewal is by another holder is known only when every effect has run. Its place in the order is kept.
      renewals.push({ at: effects.length, subject });
      effects.push({ effect: "hold", item: id, change: "renew", epoch: item.epoch ?? 0 });
    }
  }
  for (const { at, subject } of renewals) {
    const item = working.get(subject)!;
    // Section 6.8: the epoch rises when the hold is renewed by another holder.
    const other = !same(j.subjects.get(subject)?.parties[HOLDER] ?? null, item.parties[HOLDER] ?? null);
    const effect: ItemEffect = { effect: "hold", item: item.id, change: "renew", epoch: (item.epoch ?? 0) + (other ? 1 : 0) };
    effects[at] = effect;
    working.set(subject, changeItem(item, effect, j.definition, j.signer));
  }

  if (opens !== null) {
    // Section 6.3: after the opening effects every required slot must hold a value.
    const opened = working.get("on")!;
    const type = items[opens]!;
    for (const [slot, rule] of [...Object.entries(type.parties), ...Object.entries(type.refs), ...Object.entries(type.values)]) {
      if (rule.required && slotOf(opened, slot) === null) return refuse("required-unset", slot);
    }
  }

  for (const { notify } of attention) {
    // Section 6.6: the members in that slot as it was before the effects, or as it is after.
    const told = members((notify.when === "before" ? j.subjects : working).get(notify.of)?.parties[notify.slot]);
    if (told.length > 0) effects.push({ effect: "attention", item: working.get(notify.of)!.id, members: told, reason: notify.reason });
  }
  return { ok: true, effects, working };
}

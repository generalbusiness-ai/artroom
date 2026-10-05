/**
 * Effect derivation (scope contract, sections 6.3 and 6.6 to 6.8): from the
 * written effect forms of an act or rule to the `Effect` records of its
 * entry. Each record is applied to a working copy by the same function the
 * fold uses, so a later effect, a send and the `required-unset` check read
 * the items as the fold will leave them.
 *
 * An effect is applied when its subject is bound, its source is present and
 * its condition lets it through. An effect that is not applied records
 * nothing and is judged by no rule.
 */

import type { Condition, Effect, EffectForm, FieldType, FieldValue, MemberRef, Notify, Operand, RefusalReason, UnavailableReason } from "@generalbusiness/artroom-contract";
import { attribution, byMember, historyOf } from "./attribution.ts";
import { isEntryOf, isLocalFact } from "./fields.ts";
import { changeItem, newItem, type ItemEffect } from "./fold.ts";
import { judgeGuards, members, readsUnbound, slotOf, type Judging } from "./guards.ts";
import { deriveHold, endsUnder } from "./hold.ts";
import { bindEach, covered, typeOfElement } from "./lists.ts";
import { kindOf, operand } from "./operand.ts";
import type { Item } from "./state.ts";
import { LAST_MS, timeMs, timeOf } from "./time.ts";
import { unsupported } from "./unsupported.ts";
import { isFactRef, isLocalId, isMemberRef, isValue, memberFits, own, same } from "./values.ts";

/**
 * What a derivation gives: its result, a refusal, or `unavailable`. The last
 * is no refusal: the input is not judged, for that reason, because a
 * condition, or a range that a source or a send reads, was not completed
 * (sections 6.6 and 6.7).
 */
export type Derived<T> = ({ ok: true } & T) | { ok: false; reason: RefusalReason; detail: string } | { ok: false; unavailable: UnavailableReason };

const isList = (from: unknown): from is readonly Operand[] => Array.isArray(from);

/**
 * True when the definition states the type of what the operand reads. The
 * validator has then shown that the slot can hold it (section 6.6). It is
 * the validator's own rule: a part that is read from an entry's bytes has
 * no stated type, and a position, the `seq` of an entry or the revision of
 * an update, has a type and no stated bounds. The commit checks both.
 */
function stated(j: Judging, o: Operand): boolean {
  const part = "part" in o ? o.part : undefined;
  if (part !== undefined && part !== "ref") return part === "intent";
  if ("field" in o) return Object.hasOwn(j.fieldTypes, o.field);
  if ("element" in o) return typeOfElement(j, o.element) !== null;
  if ("update" in o) return false;
  if ("source" in o) return o.source === "intent";
  return "slot" in o || "presented" in o || "item" in o || "signer" in o || "intent" in o;
}

/**
 * Section 6.6: a slot never holds a value outside its type. Where the
 * validator could not know the type of a source, the commit checks the value
 * itself. Returns the value as the slot holds it, or undefined when it is
 * not a value of the slot's type.
 *
 * A reference's kind is a bound. A fact is a value of a `fact` slot only
 * when its entry is at hand and is of a kind and a definition that the slot
 * states: this scope's own entry, the source entry of a delivery, or an
 * entry that was fetched for the input. A fact to this scope is held in
 * normal form. An item is a local item of the slot's type, named by its ID,
 * or by the fact of the entry of this scope that opened it.
 */
function held(j: Judging, type: FieldType, value: unknown): FieldValue | undefined {
  if (type.type === "list") {
    if (!Array.isArray(value) || value.length > Math.min(type.max, j.bounds.listElements)) return undefined;
    const each = value.map((v) => held(j, type.of, v));
    return each.includes(undefined) ? undefined : (each as FieldValue[]);
  }
  if (type.type === "item") {
    const id = isLocalId(value) ? value : isFactRef(value) && isLocalFact(value, j.scope.at) && j.view.item(value.seq)?.opened === value.hash ? value.seq : null;
    return id !== null && j.view.item(id)?.type === type.of ? id : undefined;
  }
  if (type.type === "fact") {
    if (!isFactRef(value)) return undefined;
    const local = isLocalFact(value, j.scope.at);
    const kept = local ? j.own?.(value.seq) : undefined;
    const fetched = local ? undefined : j.source && same(j.source.fact, value) ? j.source : j.facts.get(value.hash);
    const entry = kept?.hash === value.hash ? kept.entry : fetched && isEntryOf(fetched.entry, value) ? fetched.entry : null;
    const kind = entry && kindOf(entry, j.definition, local);
    const under = fetched ? fetched.under : j.definition.declared.name;
    return kind && type.kind.includes(kind) && under === type.under ? (local ? value.seq : value) : undefined;
  }
  return isValue(type, value, j.bounds) ? (value as FieldValue) : undefined;
}

/**
 * `opens`: the item type this entry opens, or null. `working` in the result
 * holds each subject as it is after the effects, with the opened item as `on`.
 */
export function deriveEffects(j: Judging, forms: readonly EffectForm[], attention: readonly Notify[], opens: string | null): Derived<{ effects: Effect[]; working: Map<string, Item> }> {
  const items = j.definition.declared.items;
  const working = new Map(j.subjects);
  const effects: Effect[] = [];
  const refuse = (reason: RefusalReason, detail: string) => ({ ok: false, reason, detail }) as const;
  const notJudged = (unavailable: UnavailableReason) => ({ ok: false, unavailable }) as const;
  // A source reads each subject as the effects written before it left it, and the item this entry opens as `on`.
  const after: Judging = { ...j, subjects: working };
  const apply = (subject: string, effect: ItemEffect) => {
    effects.push(effect);
    working.set(subject, changeItem(working.get(subject)!, effect, j.definition, j.signer));
  };
  /**
   * Section 6.6, `if` and `unless`: with `if`, the form is applied only when
   * every guard holds; with `unless`, only when not every guard holds. The
   * guards are judged on the state before the entry's effects. A condition
   * that is not completed, and that no other condition of the form decides,
   * leaves the input not judged. Section 6.4: a form whose `if` reads an
   * unbound subject is not applied.
   */
  const lets = (c: Condition): boolean | UnavailableReason => {
    if (c.if && readsUnbound(j, c.if)) return false;
    const holds = c.if ? judgeGuards(j, c.if).result : "pass";
    const bars = c.unless ? judgeGuards(j, c.unless).result : "fail";
    if (holds === "fail" || bars === "pass") return false;
    return holds !== "pass" ? holds : bars !== "fail" ? bars : true;
  };

  if (opens !== null) {
    // Section 6.3, "Opening, exactly": the initial state, each default, then the opening effects in the order written.
    const open = { effect: "open", item: j.self, type: opens, state: own(items, opens)!.initial } as const;
    effects.push(open);
    working.set("on", newItem(open, own(items, opens)!, null));
  }

  for (const [i, form] of forms.entries()) {
    const subject = form.of ?? "on";
    const item = working.get(subject);
    // Section 6.6: an effect whose subject is unbound is not applied.
    if (!item) continue;
    const through = lets(form);
    if (through === false) continue;
    if (through !== true) return notJudged(through);
    const type = own(items, item.type)!;
    const id = item.id;
    const bad = (what: string) => refuse("bad-field", `effects.${i}: ${what}`);

    // Section 6.6, "An absent source": an effect whose source reads none is not applied. `null` is written to empty a slot.
    const from = "party" in form ? form.party.from : "ref" in form ? form.ref.from : "value" in form ? form.value.from : null;
    const reads = from !== null && from !== "self" && !isList(from) && !("time" in from) ? from : null;
    const source = reads ? operand(after, reads, item) : null;
    if (reads && source === null) continue;
    // Section 6.7: the base of an attribution is the history of the subject it names. When that subject is unbound the effect is not applied.
    if ("attribute" in form && !working.has(form.attribute.of)) continue;

    // Section 6.6: no effect of any kind changes an item that was final before the entry, however the entry orders its effects.
    // An entry that takes a live item to a final state may carry its other effects on that item. The rule covers every effect
    // that is applied, also one that records no change.
    const was = j.subjects.get(subject);
    if (was && own(type.states, was.state)?.final) return refuse("final", `effects.${i}: item ${id} is ${was.state}`);
    /** The value as the slot holds it. The validator has shown it for a source of a stated type; the commit checks any other. */
    const fits = (to: FieldType): FieldValue | undefined => (stated(j, reads!) ? (source as FieldValue) : held(j, to, source));
    /** Whatever its source, a member put in a slot is a member reference within the bound of a handle. */
    const member = (v: unknown): MemberRef | null => (isMemberRef(v) && memberFits(v, j.bounds) ? v : null);
    const listed = (slot: string) => members(own(working.get(subject)!.parties, slot));
    /** The most members a list may hold. */
    const most = (slot: string) => Math.min(own(type.parties, slot)?.max ?? j.bounds.partyMembers, j.bounds.partyMembers);

    if ("state" in form) {
      apply(subject, { effect: "state", item: id, state: form.state });
    } else if ("party" in form) {
      const { slot, list } = form.party;
      const has = (m: MemberRef) => listed(slot).some((x) => same(x, m));
      if (from === null) apply(subject, { effect: "party", item: id, slot, member: null });
      else if (list !== undefined || !own(type.parties, slot)!.list) {
        const one = member(source);
        if (!one) return bad("the source is not a member, or its handle is longer than a handle may be");
        if (list === undefined) apply(subject, { effect: "party", item: id, slot, member: one });
        else if (list === "add" && !has(one)) {
          if (listed(slot).length >= most(slot)) return refuse("slot-full", `effects.${i}: ${slot}`);
          apply(subject, { effect: "list", item: id, slot, change: "add", member: one });
        } else if (list === "remove" && has(one)) apply(subject, { effect: "list", item: id, slot, change: "remove", member: one });
      } else {
        // Section 6.6: a list slot is set whole, from a list operand or from a list of member operands. An operand of the list that reads none gives no member.
        const given = isList(from) ? from.map((o) => operand(after, o, item)).filter((v) => v !== null) : source;
        if (!Array.isArray(given)) return bad("the source is not a list of members");
        const whole: MemberRef[] = [];
        for (const v of given) {
          const one = member(v);
          if (!one) return bad("the source holds a value that is not a member, or a handle longer than a handle may be");
          if (!whole.some((m) => same(m, one))) whole.push(one);
        }
        if (whole.length > most(slot)) return refuse("slot-full", `effects.${i}: ${slot}`);
        // One `list` record for each member that leaves, and then one for each that joins, each in byte order of member identifier.
        const before = listed(slot);
        for (const gone of before.filter((m) => !whole.some((w) => same(w, m))).sort(byMember)) apply(subject, { effect: "list", item: id, slot, change: "remove", member: gone });
        for (const joined of whole.filter((w) => !before.some((m) => same(m, w))).sort(byMember)) apply(subject, { effect: "list", item: id, slot, change: "add", member: joined });
      }
    } else if ("ref" in form) {
      const { slot } = form.ref;
      // Section 6.4: inside a scope, `self` is a local reference to the entry being written, and so to the item it opens.
      // Section 6.6: a copy preserves its source. A slot source is the slot of that name, of whatever kind.
      const to = from === null ? null : from === "self" ? j.self : fits(own(type.refs, slot)!.to);
      if (to === undefined) return bad("the source is not a value of the slot's type");
      apply(subject, { effect: "ref", item: id, slot, to });
    } else if ("value" in form) {
      const { slot } = form.value;
      // The commit time plus a constant: a derived deadline, such as a new hold's end (section 5.2, step 6.4).
      // The validator bounds the offset, so the sum is a safe integer. A time past the last timestamp is not a value of the slot.
      const derived = form.value.from !== null && "time" in form.value.from ? timeMs(j.clock.reading)! + form.value.from.time.plusSeconds * 1000 : null;
      if (derived !== null && derived > LAST_MS) return bad("the derived time is past the last timestamp");
      const value = derived !== null ? timeOf(derived) : from === null ? null : fits(own(type.values, slot)!.of);
      if (value === undefined) return bad("the source is not a value of the slot's type");
      apply(subject, { effect: "value", item: id, slot, value });
    } else if ("attribute" in form) {
      // Section 6.7: the attribution of the named subject, not of the item that receives it, as it stands after the effects
      // written before this one: a member whom an earlier effect of this entry made the holder of a hold under the subject is in it.
      const { slot } = form.attribute;
      const more: MemberRef[] = [];
      for (const [n, w] of (form.attribute.with ?? []).entries()) {
        // Each further source gives party slots, or lists of members. One that reads an unbound subject or an absent fact adds nothing.
        let lists: readonly unknown[];
        if ("items" in w) {
          // A range in a source is an exact set, so it needs complete evidence, as a guard does.
          const range = covered(j, w.items);
          if (range === null) return notJudged("guard-incomplete");
          lists = range.map((r) => members(own(r.parties, w.slot)));
        } else if ("subject" in w) lists = [members(own(working.get(w.subject)?.parties, w.slot))];
        else if ("each" in w) {
          const bound = bindEach(after, w.each, w.as, item);
          if (bound === null) return bad(`with.${n} reads a value that is not a list`);
          lists = bound.map((b) => operand(b, w.list, item));
        } else lists = [operand(after, w.list, item)];
        for (const list of lists) {
          if (list === null) continue;
          if (!Array.isArray(list)) return bad(`with.${n} reads a value that is not a list of members`);
          for (const v of list) {
            const one = member(v);
            if (!one) return bad(`with.${n} holds a value that is not a member, or a handle longer than a handle may be`);
            more.push(one);
          }
        }
      }
      // The union of the base and every source, with duplicates removed, in byte order of member identifier. No truncation.
      for (const one of attribution(historyOf(working.get(form.attribute.of)!, working.values(), j.definition, j.signer), j.signer, more)) {
        if (listed(slot).some((m) => same(m, one))) continue;
        if (!memberFits(one, j.bounds)) return bad("a member's handle is longer than a handle may be");
        if (listed(slot).length >= most(slot)) return refuse("slot-full", `effects.${i}: ${slot}`);
        apply(subject, { effect: "list", item: id, slot, change: "add", member: one });
      }
    } else if (!("hold" in form)) return unsupported("that effect");
    else {
      // Section 6.8: the hold capability's effect on the hold item.
      const hold = deriveHold(j, item, form.hold.do);
      if (!hold.ok) return refuse(hold.reason, `effects.${i}: ${hold.detail}`);
      apply(subject, hold.effect);
    }
  }
  // Section 6.8: a hold ends with what it is under. These are the capability's own effects, after the written ones (section 4.1).
  for (const { subject, effect } of endsUnder(j, working)) {
    if (subject === null) effects.push(effect);
    else apply(subject, effect);
  }

  if (opens !== null) {
    // Section 6.3: after the opening effects every required slot must hold a value.
    const opened = working.get("on")!;
    const type = own(items, opens)!;
    for (const [slot, rule] of [...Object.entries(type.parties), ...Object.entries(type.refs), ...Object.entries(type.values)]) {
      if (rule.required && slotOf(opened, slot) === null) return refuse("required-unset", slot);
    }
  }

  for (const { notify } of attention) {
    // Section 6.6: a notice with `if` is made only when its guards hold, on the state before the effects.
    const through = lets(notify.if ? { if: notify.if } : {});
    if (through === false) continue;
    if (through !== true) return notJudged(through);
    // The members in that slot as it was before the effects, or as it is after. An unbound subject has none.
    const told = members(own((notify.when === "before" ? j.subjects : working).get(notify.of)?.parties, notify.slot));
    if (told.length > 0) effects.push({ effect: "attention", item: working.get(notify.of)!.id, members: told, reason: notify.reason });
  }
  return { ok: true, effects, working };
}

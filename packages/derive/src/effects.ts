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

import type { Condition, Effect, EffectForm, FieldType, FieldValue, Mark, MemberRef, Notify, Operand, PlatformData, RefusalReason, UnavailableReason } from "@generalbusiness/artroom-contract";
import { attribution, byMember, historyOf } from "./attribution.ts";
import { capabilityEffect } from "./capability.ts";
import { isEntryOf, isLocalFact } from "./fields.ts";
import { changeItem, newItem, type ItemEffect } from "./fold.ts";
import { judgeGuards, members, readsUnbound, slotOf, type Judging } from "./guards.ts";
import { EPOCH, HOLDER, deriveHold, endsUnder, type HoldEffect } from "./hold.ts";
import { bindEach, covered, typeOfElement } from "./lists.ts";
import { givenTo, markOf, ofCodedType, outside, ruleFor, run, type RuleEffect } from "./marks.ts";
import { kindOf, operand } from "./operand.ts";
import type { Item } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { LAST_MS, timeMs, timeOf } from "./time.ts";
import { unsupported } from "./unsupported.ts";
import { isFactRef, isLocalId, isMemberRef, isObject, isValue, memberFits, own, same } from "./values.ts";
import { isDigest, isEffect } from "@generalbusiness/artroom-bytes";

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
 * or by the fact of the entry of this scope that opened it. An element of a
 * list and a member of a record are each checked by their declared type, to
 * any depth, as `readFacts` checks the fields of an input.
 */
function held(j: Judging, type: FieldType, value: unknown): FieldValue | undefined {
  if (type.type === "list") {
    if (!Array.isArray(value) || value.length > Math.min(type.max, j.bounds.listElements)) return undefined;
    const each = value.map((v) => held(j, type.of, v));
    return each.includes(undefined) ? undefined : (each as FieldValue[]);
  }
  if (type.type === "record") {
    // Section 6.2: an unknown member is refused, and a member that is not required may be absent.
    if (!isObject(value) || Object.keys(value).some((m) => !Object.hasOwn(type.of, m))) return undefined;
    const members: [string, FieldValue][] = [];
    for (const [m, of] of Object.entries(type.of)) {
      const member = Object.hasOwn(value, m) ? held(j, of, value[m]) : undefined;
      if (member === undefined && (of.required || Object.hasOwn(value, m))) return undefined;
      if (member !== undefined) members.push([m, member]);
    }
    return Object.fromEntries(members);
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
    const kind = entry && kindOf(entry);
    const under = fetched ? fetched.under : j.definition.declared.name;
    return kind && type.kind.includes(kind) && under === type.under ? (local ? value.seq : value) : undefined;
  }
  return isValue(type, value, j.bounds) ? (value as FieldValue) : undefined;
}

/** The slot that holds the end of a hold of that type: the deadline of the timed rule that ends it, of which a hold type has one (section 6.8). */
const endOf = (definition: ValidDefinition, type: string): string | undefined =>
  Object.values(definition.declared.timed).find((rule) => rule.on === type && rule.effects.some((e) => "hold" in e && e.hold.do === "end"))?.deadline;

/** The members of `Effect` that a rule returns (section 6.1). Every other member is a fault of the rule. */
const BY_RULE: readonly string[] = ["open", "state", "party", "list", "ref", "value", "operation", "attempt"];

/**
 * `opens`: the item type this entry opens, or null. `working` in the result
 * holds each subject as it is after the effects, with the opened item as `on`.
 * `opened`: the item that this entry opens, whatever opens it: the row, or
 * in platform data a rule. Null: it opens none.
 *
 * Section 4.2, check 11: in platform data a mark in the written list gives
 * its rule's effects at the mark's position, and every check on effects is
 * made on the joined list. An entry opens at most one item. No two effects
 * set one slot, or the state, of one item, apart from successive changes of
 * one party list. Each value is checked against its slot's type. A slot
 * whose type is a mark is checked by that mark's rule, for each effect that
 * sets it.
 */
export function deriveEffects(j: Judging, forms: readonly EffectForm[], attention: readonly Notify[], opens: string | null): Derived<{ effects: Effect[]; working: Map<string, Item>; opened: Item | null }> {
  const items = j.definition.declared.items;
  const working = new Map(j.subjects);
  const effects: Effect[] = [];
  /** The items that a rule's effects change and that are no subject of the row, by ID, as the effects left them. The item that a rule opens is one. */
  const others = new Map<number, Item>();
  /** What each applied effect set, by item, for the conflict check on the joined list: whether a rule set it, and whether it is one change of a party list. */
  const set = new Map<string, { rule: boolean; successive: boolean }>();
  /**
   * Section 6.1, "The joined lists are checked as one". The validator has
   * checked each pair of written effects. A pair with an effect of a rule is
   * checked here, on the effects that are applied. Such a conflict is a
   * fault of the rule, which leaves the input not judged.
   */
  const sets = (effect: Effect, by: Mark | null): void => {
    if (effect.effect !== "state" && effect.effect !== "party" && effect.effect !== "list" && effect.effect !== "ref" && effect.effect !== "value") return;
    const what = JSON.stringify([effect.item, effect.effect === "state" ? null : effect.slot]);
    const [earlier, successive] = [set.get(what), effect.effect === "list"];
    const culprit = by ?? (earlier?.rule ? ({ code: "of an earlier mark", row: "" } satisfies Mark) : null);
    if (earlier && culprit && !(earlier.successive && successive)) throw outside(culprit, "an effect that conflicts with another effect of the entry");
    set.set(what, { rule: by !== null || (earlier?.rule ?? false), successive });
  };
  /** Section 4.1: the capability's own effects follow the written ones. */
  const records: Effect[] = [];
  const refuse = (reason: RefusalReason, detail: string) => ({ ok: false, reason, detail }) as const;
  const notJudged = (unavailable: UnavailableReason) => ({ ok: false, unavailable }) as const;
  // A source reads each subject as the effects written before it left it, and the item this entry opens as `on`.
  const after: Judging = { ...j, subjects: working };
  const apply = (subject: string, effect: ItemEffect) => {
    sets(effect, null);
    effects.push(effect);
    working.set(subject, changeItem(working.get(subject)!, effect, j.definition, j.signer));
  };
  /** The item that this entry opens, when a rule opens it. */
  let byRule: Item | null = null;
  /** The mark whose rule opened each operation that a rule of this entry opens, by the operation's ordinal. */
  const openers = new Map<number, Mark>();
  /**
   * The effects of one rule, at its mark's position (section 6.1, place 5).
   * Each is a member of the allowed list, in the contract's form, on a local
   * item, in a slot and a state that its type declares, and on a fixed slot
   * only of the item that the entry opens. Anything else is a fault of the
   * rule. An operation's owner, kind and ordinal, and the shape of an
   * attempt, are checked here, on the effects joined so far. Whether each
   * operation has its first attempt is asked of the whole entry, by
   * `paired`. The checks on effects are the ones that a written
   * effect meets, and refuse as they do: `final`, `bad-field` for a value
   * outside its slot's type, and `slot-full`.
   */
  const join = (mark: Mark, at: number): Derived<object> | null => {
    const rule = ruleFor(j, mark, "effect");
    const given = run(mark, () => rule.run(givenTo(j)));
    if (!Array.isArray(given) || given.length > rule.most) throw outside(mark, `no list of at most ${rule.most} effects`);
    const bad = (what: string) => refuse("bad-field", `effects.${at}: the rule ${mark.code} ${what}`);
    for (const effect of given as readonly RuleEffect[]) {
      if (!isEffect(effect) || !BY_RULE.includes(effect.effect)) throw outside(mark, "a value that is none of the effects that a rule returns");
      if (effect.effect === "operation") {
        // Section 6.1, "An operation that a rule opens": its owner is this definition, and its kind is one that `outcomes` lists.
        const kinds = (j.definition.declared as unknown as PlatformData).outcomes;
        const k = effects.filter((e) => e.effect === "operation").length;
        if (effect.owner !== j.platform?.named || own(kinds, effect.kind) === undefined || effect.k !== k || !Number.isSafeInteger(effect.attempts) || effect.attempts < 1) throw outside(mark, "an operation that its definition does not own, or out of its ordinal");
        effects.push(effect);
        openers.set(effect.k, mark);
        continue;
      }
      if (effect.effect === "attempt") {
        // The attempt that a rule opens is attempt 1 of an operation that this entry opens. Every other record of an attempt is an outcome's own.
        const k = typeof effect.operation === "object" ? effect.operation.k : -1;
        const open = effects.some((e) => e.effect === "operation" && e.k === k) && !effects.some((e) => e.effect === "attempt" && typeof e.operation === "object" && e.operation.k === k);
        if (!open || effect.attempt !== 1 || effect.result !== "opened" || effect.selected !== null) throw outside(mark, "an attempt that is not the first of an operation that its entry opens");
        effects.push(effect);
        continue;
      }
      if (effect.effect === "open") {
        // Section 4.1: an entry opens at most one item, whatever opens it, and its ID is the entry's `seq`. Section 6.3: in its initial state.
        // Section 6.8: a hold is opened by `hold: open`, as the primary item of an act. No rule returns that record, so none opens a hold.
        const type = own(items, effect.type);
        if (opens !== null || byRule || !type || effect.item !== j.self || effect.state !== type.initial || j.definition.holdTypes.includes(effect.type)) throw outside(mark, "an opening that its entry cannot make");
        byRule = newItem(effect, type, null);
        others.set(effect.item, byRule);
        effects.push(effect);
        continue;
      }
      const subject = [...working].find(([, item]) => item.id === effect.item)?.[0];
      const item = subject !== undefined ? working.get(subject)! : (others.get(effect.item) ?? j.view.item(effect.item));
      if (!item) throw outside(mark, `an effect on item ${effect.item}, which does not exist`);
      const type = own(items, item.type)!;
      // Section 6.3: only an effect of the entry that opens an item sets one of its fixed slots, or empties one. The validator
      // refuses a written effect that could do otherwise, so no input makes one: from a rule it is a fault, and no refusal. An
      // item's ID is the `seq` of the entry that opened it, so the item that this entry opens is the one whose ID is `self`.
      const declared = effect.effect === "state" ? undefined : effect.effect === "ref" ? own(type.refs, effect.slot) : effect.effect === "value" ? own(type.values, effect.slot) : own(type.parties, effect.slot);
      if (declared?.fixed && item.id !== j.self) throw outside(mark, `an effect on a fixed slot of item ${item.id}, which its entry does not open`);
      // Section 6.8: only a `hold` record changes the state, the holder or the epoch of a hold, and its end is set from the commit
      // time. The validator refuses a written effect that sets one of the four. No rule returns a `hold` record, so a rule sets none.
      if (j.definition.holdTypes.includes(item.type) && (effect.effect === "state" || [HOLDER, EPOCH, endOf(j.definition, item.type)].includes(effect.slot))) throw outside(mark, `an effect on what only the hold capability sets, of hold ${item.id}`);
      // Section 6.6: no effect changes an item that was final before the entry.
      const was = subject !== undefined ? j.subjects.get(subject) : effect.item === j.self ? undefined : j.view.item(effect.item);
      if (was && own(type.states, was.state)?.final) return refuse("final", `effects.${at}: item ${item.id} is ${was.state}`);
      const of = { item: item.id, slot: "slot" in effect ? effect.slot : "" };
      /** The value as the slot holds it, or undefined when it is not a value of the slot's type: by the type's rule when the type is a mark, and else as data. */
      const fits = (to: FieldType, value: FieldValue): FieldValue | undefined => {
        const coded = ofCodedType(j, to, value, of);
        // Section 4.1: an item's ID is the `seq` of the entry that opened it. So a rule may name the item that this entry opens, which
        // the state before the entry does not hold yet: the destination's `branch.judging` "may be the one that the entry itself
        // opens" (authority note, section 12.1.5; I3 deltas, entry FA4). It is a value of the slot when it is of the slot's type.
        if (coded === null && to.type === "item" && value === j.self) return ([...working.values()].find((opened) => opened.id === j.self) ?? byRule)?.type === to.of ? value : undefined;
        return coded === null ? held(j, to, value) : coded ? value : undefined;
      };
      let applied: ItemEffect = effect;
      if (effect.effect === "state") {
        if (own(type.states, effect.state) === undefined) throw outside(mark, `a state that ${item.type} does not declare`);
      } else if (effect.effect === "party" || effect.effect === "list") {
        const slot = own(type.parties, effect.slot);
        if (!slot || (effect.effect === "list" ? !slot.list : slot.list && effect.member !== null)) throw outside(mark, `an effect on a party slot that ${item.type} does not declare so`);
        if (effect.member !== null && !memberFits(effect.member, j.bounds)) return bad("gives a member whose handle is longer than a handle may be");
        const listed = members(own(item.parties, effect.slot));
        // Section 6.3: adding a member who is already in a list, or removing one who is not, records no effect.
        if (effect.effect === "list" && listed.some((m) => same(m, effect.member)) === (effect.change === "add")) continue;
        if (effect.effect === "list" && effect.change === "add" && listed.length >= Math.min(slot.max ?? j.bounds.partyMembers, j.bounds.partyMembers)) return refuse("slot-full", `effects.${at}: ${effect.slot}`);
      } else {
        const to = effect.effect === "ref" ? own(type.refs, effect.slot)?.to : own(type.values, effect.slot)?.of;
        if (!to) throw outside(mark, `an effect on a slot that ${item.type} does not declare`);
        const value = effect.effect === "ref" ? effect.to : effect.value;
        // Section 6.2: the bytes of a detached text are kept for the input that came with them. A rule reads a text's digest only, and holds no bytes.
        if (value !== null && to.type === "text" && to.detached) throw outside(mark, "a value for a detached text, whose bytes no rule holds");
        const kept = value === null ? null : fits(to, value);
        if (kept === undefined) return bad(`gives ${effect.slot} a value outside the slot's type`);
        applied = effect.effect === "ref" ? { ...effect, to: kept } : { ...effect, value: kept };
      }
      sets(applied, mark);
      effects.push(applied);
      const changed = changeItem(item, applied, j.definition, j.signer);
      if (subject !== undefined) working.set(subject, changed);
      else others.set(item.id, changed);
      if (byRule && changed.id === byRule.id) byRule = changed;
    }
    return null;
  };
  /**
   * Section 4.3, item 2: the entry that opens an operation opens its attempt
   * 1. It is a property of the entry's joined effects (section 6.1, "The
   * joined lists are checked as one"), and of no one rule's list: one mark
   * may open the operation and a later mark its first attempt. So it is
   * asked once, after every mark of the list has given its effects. The
   * fault is of the rule that opened the operation.
   */
  const paired = (): void => {
    for (const [k, mark] of openers) {
      if (!effects.some((e) => e.effect === "attempt" && typeof e.operation === "object" && e.operation.k === k)) throw outside(mark, "an operation that its entry leaves with no first attempt");
    }
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
    const mark = markOf(form);
    if (mark) {
      const stopped = join(mark, i);
      if (stopped) return stopped as Derived<never>;
      continue;
    }
    const subject = form.of ?? "on";
    if ("capability" in form) {
      // Section 6.11: a capability's effect changes the capability's own records and no item. It is applied when its condition
      // lets it through, and when the subject it names is bound. Its arguments read each subject as the effects before it left it.
      if (form.of !== undefined && !working.has(subject)) continue;
      const through = lets(form);
      if (through === false) continue;
      if (through !== true) return notJudged(through);
      const derived = capabilityEffect(after, form.capability, working.get(subject) ?? null);
      if (typeof derived === "string") return notJudged(derived);
      records.push(...derived);
      continue;
    }
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
    /**
     * The value as the slot holds it. The validator has shown it for a source of a stated type; the commit checks any other.
     * Section 6.1, place 3: a slot whose type is a mark is checked by that mark's rule, for each effect that would set it.
     */
    const fits = (to: FieldType, slot: string): FieldValue | undefined => {
      const coded = ofCodedType(j, to, source, { item: id, slot });
      return coded !== null ? (coded ? (source as FieldValue) : undefined) : stated(j, reads!) ? (source as FieldValue) : held(j, to, source);
    };
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
      const to = from === null ? null : from === "self" ? j.self : fits(own(type.refs, slot)!.to, slot);
      if (to === undefined) return bad("the source is not a value of the slot's type");
      apply(subject, { effect: "ref", item: id, slot, to });
    } else if ("value" in form) {
      const { slot } = form.value;
      // The commit time plus a constant: a derived deadline, such as a new hold's end (section 5.2, step 6.4).
      // The validator bounds the offset, so the sum is a safe integer. A time past the last timestamp is not a value of the slot.
      const derived = form.value.from !== null && "time" in form.value.from ? timeMs(j.clock.reading)! + form.value.from.time.plusSeconds * 1000 : null;
      if (derived !== null && derived > LAST_MS) return bad("the derived time is past the last timestamp");
      const value = derived !== null ? timeOf(derived) : from === null ? null : fits(own(type.values, slot)!.of, slot);
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
    } else if ("redact" in form) {
      // Section 6.6: the bytes of every text the slot has held are removed: each digest that the scope keeps for the slot, and the
      // one an earlier effect of this entry put there. The effect records those digests, and its entry is the tombstone. The
      // slot keeps its digest. With no text to remove the effect would change nothing, and is not recorded.
      const { slot } = form.redact;
      const texts = [...j.view.texts(id, slot)];
      const now = own(working.get(subject)!.values, slot);
      if (isDigest(now) && now !== own(was?.values, slot) && !texts.includes(now)) texts.push(now);
      if (texts.length > 0) effects.push({ effect: "redact", item: id, slot, texts });
    } else if (!("hold" in form)) return unsupported("that effect");
    else {
      // Section 6.8: the hold capability's effect on the hold item.
      const hold = deriveHold(j, item, form.hold.do);
      if (!hold.ok) return refuse(hold.reason, `effects.${i}: ${hold.detail}`);
      apply(subject, hold.effect);
    }
  }
  // The whole-entry boundary for what the rules gave: every form of the list is derived, so every mark has joined. Section 4.3,
  // item 1: a genesis may seal an operation as a held duty, with no attempt. Which genesis does is not built yet (I3 deltas, entry
  // EB12), so a genesis is not asked.
  if (j.self !== 0) paired();
  // Section 6.8: a hold ends with what it is under. These are the capability's own effects, after the written ones (section 4.1):
  // first the records of each written capability effect, then the ends.
  effects.push(...records);
  // An item that a rule changed and that is no subject of the row is read as the rule left it, under a name that no subject has:
  // a hold ends with such an item too, when a rule took it to a final state.
  const left = new Map<string, Item>([...[...others].map(([id, item]) => [`item ${id}`, item] as const), ...working]);
  for (const { subject, effect } of endsUnder(j, left)) {
    if (subject === null || !working.has(subject)) effects.push(effect);
    else apply(subject, effect);
  }
  // Authority note, section 5.7, "What is derived, and at which entry": when the definition's holds have a workspace, the code of
  // `hold@1` derives the fork, the instance and the token records of each `hold` effect of this entry, and the operations they
  // open. It runs after the entry's declared effects and the ends, over the state before the entry. It refuses nothing. With rules
  // that have no such code, as with none, the entry holds the item form only.
  const holds = effects.filter((effect): effect is HoldEffect => effect.effect === "hold");
  if (holds.length > 0 && j.capabilities?.workspace) {
    const k = effects.filter((effect) => effect.effect === "operation").length;
    const derived = j.capabilities.workspace(j.view, j.definition, j.self, k, holds, (id) => [...working.values()].find((held) => held.id === id) ?? null);
    // Section 6.1, "In the commit": code that returns more than it declared has a fault, and the input is not judged.
    const most = j.capabilities.maxima?.filter((m) => m.form === "workspace").reduce((n, m) => n + m.effects, 0);
    if (most !== undefined && derived.length > holds.length * most) throw new Error(`the workspace of ${holds.length} holds declares at most ${holds.length * most} effects, and it returned ${derived.length}`);
    effects.push(...derived);
    // The count of `counted` holds before an entry is derived. An entry that would still pass the bound is refused, by the
    // bound's name, and nothing is cut short. An entry that cannot be refused never reaches this: its opening was refused.
    if (records.length + derived.length > j.bounds.derivedEffects) return refuse("entry-too-large", "derivedEffects");
  } else if (records.length > j.bounds.derivedEffects) return refuse("entry-too-large", "derivedEffects");

  // Section 6.3: after the opening effects every required slot must hold a value. The item is the one that the row opens, or in
  // platform data the one that a rule opened.
  const opened: Item | null = opens !== null ? working.get("on")! : byRule;
  if (opened) {
    const type = own(items, opened.type)!;
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
  return { ok: true, effects, working, opened };
}

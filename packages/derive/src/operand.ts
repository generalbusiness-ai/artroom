/**
 * Operands and parts (scope contract, sections 6.2 and 6.5): what a guard,
 * an effect or a send reads, and what a part reads inside an entry that a
 * fact reference names. Every value is read from what section 5.1 allows:
 * the input's own bytes, this scope's state and history, and entries that
 * were fetched by hash before the turn. An operand that reads nothing is
 * none, which is `null` here. A part is never an error.
 */

import type { Entry, EntryPart, FactRef, FieldValue, Operand, Part, ScopeRef } from "@generalbusiness/artroom-contract";
import { intentDigest } from "@generalbusiness/artroom-bytes";
import { creationFields, isEntryOf, isLocalFact } from "./fields.ts";
import { bound } from "./handlers.ts";
import type { Judging } from "./guards.ts";
import type { Item } from "./state.ts";
import { isFactRef, isLocalId, isObject, memberOf, own, same } from "./values.ts";

/** What a slot holds, or null. An empty list is unset. */
export function slotOf(item: Item, slot: string): FieldValue | null {
  const v = own(item.parties, slot) ?? own(item.refs, slot) ?? own(item.values, slot) ?? null;
  return Array.isArray(v) && v.length === 0 ? null : (v as FieldValue | null);
}

// ---------------------------------------------------------------- the kind of an entry (section 6.2)

/**
 * The kind that a `fact` type's `kind` is compared with: the act kind of an
 * act; the genesis act's kind of a genesis; `timed:` and its rule's key of a
 * timed entry; and, for a delivery of a request that a handler received,
 * the handler's message name, which for a relationship update is the
 * relationship's name. Null: the entry has no kind that is derived here.
 *
 * A request that no handler of its receiver's definition receives is decided
 * `refused`, `unknown-message`. Its entry has no kind: the name in it is the
 * sender's choice, and could be an act kind of this definition, or `timed:`
 * and a rule's key. The decision is in the entry's bytes, so a reader that
 * does not hold the receiver's definition reads it too.
 *
 * A genesis entry holds its act's kind, as the member `kind` of its input
 * (section 4.1). Every reader reads it there, for this scope's own genesis
 * and for the genesis of a scope under any other definition. A reader that
 * does not hold the foreign definition cannot check the value: it relies on
 * the foreign scope's judge, as for every other member of a fetched entry.
 * The kind does not name the definition. The `under` check does that.
 */
export function kindOf(entry: Entry): string | null {
  const input = entry.input;
  if (input.type === "act") return input.signed.intent.kind;
  if (input.type === "genesis") return input.kind;
  if (input.type === "timed") return `timed:${input.rule}`;
  if (input.type !== "delivery" || input.message.class !== "request" || !("decision" in input)) return null;
  if (input.decision === "refused" && input.reason?.code === "unknown-message") return null;
  const body = input.message.body;
  if (!isObject(body)) return null;
  const name = input.message.type === "tell" ? body["message"] : input.message.type === "relate" ? body["name"] : null;
  return typeof name === "string" ? name : null;
}

// ---------------------------------------------------------------- an entry that a fact reference names

/** A fact reference as an operand holds it: a foreign fact, or a local entry reference, which is a `seq` of this scope. */
type Held = FactRef | number;

/**
 * The entry a fact reference names, with whether it is this scope's own.
 * Null: its bytes are not at hand. A foreign entry is at hand when the input
 * named it, so that it was fetched and verified whole: a fact field, or the
 * source entry of a delivery. A local entry is read from this scope's own
 * history. A foreign fact that names this scope and was not put in normal
 * form, as in a message's undeclared field, is read from that history only
 * when the history has that hash at that position.
 */
function entryOf(j: Judging, ref: Held): { entry: Entry; local: boolean } | null {
  if (typeof ref === "number") {
    const kept = j.own?.(ref);
    return kept ? { entry: kept.entry, local: true } : null;
  }
  if (isLocalFact(ref, j.scope.at)) {
    const kept = j.own?.(ref.seq);
    return kept && kept.hash === ref.hash ? { entry: kept.entry, local: true } : null;
  }
  const fetched = j.source && same(j.source.fact, ref) ? j.source : j.facts.get(ref.hash);
  return fetched && isEntryOf(fetched.entry, ref) ? { entry: fetched.entry, local: false } : null;
}

/** The effects of an entry on one item of its own scope, by local ID. An effect on the item an entry opens names it by the entry's `seq`. */
const effectsOn = (entry: Entry, item: unknown) => entry.effects.filter((e) => "item" in e && e.item === item);

/**
 * What an entry's own effects gave one slot of one item, or its state. Null
 * when no effect of the entry set it. A party list is the list of the members
 * that the entry's effects left in it, in the order of the effects.
 */
function given(entry: Entry, item: unknown, slot: string): unknown {
  let value: unknown = null;
  for (const e of effectsOn(entry, item)) {
    if (slot === "state") { if (e.effect === "open" || e.effect === "state") value = e.state; }
    else if (!("slot" in e) || e.slot !== slot) continue;
    else if (e.effect === "party") value = e.member;
    else if (e.effect === "ref") value = e.to;
    else if (e.effect === "value") value = e.value;
    else if (e.effect === "list") {
      const list = Array.isArray(value) ? value.filter((m) => !same(m, e.member)) : [];
      value = e.change === "add" ? [...list, e.member] : list;
    }
  }
  return Array.isArray(value) && value.length === 0 ? null : value;
}

/**
 * A field of the entry's intent, or of the message it delivered. A genesis
 * has the fields of its founding intent, or of its creation request.
 *
 * The rule: a field is read as the scope that wrote the entry holds it, and
 * never through a declaration of another scope. `local`: the entry is this
 * scope's own, so this scope's definition is the one that admitted it, and a
 * message's fields are read by the types of the handler that received them.
 * A foreign entry was fetched and checked against the hash in its reference.
 * Its reader knows its bytes, its kind and the name of its definition, and
 * does not hold that definition. A handler or a genesis act of the reader's
 * own with the same name says nothing about it. So a field of a foreign
 * entry is the value that the entry's bytes hold, with no type applied:
 *
 * - of an act, and of a founded genesis, the field of the signed intent;
 * - of a delivered request, the field of the message as it was sent: the
 *   `fields` of a `tell`, and the `detail` of a `relate`;
 * - of a created genesis, the field of the creation request as it was sent.
 *
 * A message as it was sent holds the mark `{ "self": true }` where its sender
 * named the entry it was writing (section 6.6). The bytes do not tell that
 * mark from a record with a member `self`: only the receiver's declared type
 * does. So the mark is not resolved in a foreign entry. It is read as that
 * record, which equals no fact reference. A reference to an earlier entry
 * is whole in the bytes, and is read whole.
 *
 * A request of this scope's own history that no handler received, which was
 * decided `unknown-message`, is read in the same way: no declaration of this
 * scope admitted its fields, as none gave it a kind (`kindOf`).
 */
function fieldOf(j: Judging, entry: Entry, local: boolean, name: string): unknown {
  const input = entry.input;
  if (input.type === "act") return own(input.signed.intent.fields, name) ?? null;
  if (input.type === "genesis" && input.founding) return own(input.founding.intent.fields, name) ?? null;
  const message = input.type === "genesis" ? input.message : input.type === "delivery" && input.message.class === "request" ? input.message : null;
  const body = message?.body;
  if (!message || !isObject(body)) return null;
  const unread = input.type === "delivery" && "decision" in input && input.decision === "refused" && input.reason?.code === "unknown-message";
  if (!local || unread) {
    const sent = message.type === "relate" ? body["detail"] : body["fields"];
    return isObject(sent) ? (own(sent, name) ?? null) : null;
  }
  if (input.type === "genesis") return own(input.source ? creationFields(message, input.source, own(j.definition.declared.acts, j.definition.declared.genesis)!.fields) : null, name) ?? null;
  return input.type === "delivery" ? (own(bound(j.definition, message, input.from)?.fields ?? null, name) ?? null) : null;
}

/** One part of the entry that `ref` names. `at` is that entry's scope. */
function entryPart(j: Judging, ref: Held, at: ScopeRef, part: EntryPart, item: Item | null): unknown {
  // Read from the reference. Nothing is fetched.
  if (part === "ref") return ref;
  if (part === "scope") return at;
  if (part === "seq") return typeof ref === "number" ? ref : ref.seq;
  // Read from the entry's bytes.
  const found = entryOf(j, ref);
  if (!found) return null;
  const { entry, local } = found;
  const input = entry.input;
  if (part === "kind") return kindOf(entry);
  if (part === "intent") return input.type === "act" ? intentDigest(input.signed.intent) : input.type === "genesis" && input.founding ? intentDigest(input.founding.intent) : null;
  // The primary item: the item the entry opens, by the entry's own `seq`, or the item an act or a timed entry is on.
  if (part === "on") return entry.effects.some((e) => e.effect === "open") ? entry.seq : input.type === "act" ? input.signed.intent.on : input.type === "timed" ? input.item : null;
  if ("field" in part) return fieldOf(j, entry, local, part.field);
  if ("opened" in part) return entry.effects.some((e) => e.effect === "open") ? given(entry, entry.seq, part.opened) : null;
  if ("set" in part) {
    const id = operand(j, part.set.item, item);
    return isLocalId(id) ? given(entry, id, part.set.slot) : null;
  }
  // Section 6.5: a member of a capability record that this entry's effects hold, written `kind.member`. None when the entry holds
  // no record of that kind, or more than one.
  const [kind, ...member] = part.carried.split(".");
  const records = entry.effects.filter((e) => e.effect === "record" && e.kind === kind);
  const record = records.length === 1 ? records[0] : undefined;
  return record?.effect === "record" ? (own(record.values, member.join(".")) ?? null) : null;
}

/** A part of the entry that a fact reference names. Null when the value is not a fact reference, or the entry does not have the part. */
function partOf(j: Judging, value: unknown, part: Part, item: Item | null): unknown {
  const ref: Held | null = isFactRef(value) ? value : isLocalId(value) ? value : null;
  if (ref === null) return null;
  const at = typeof ref === "number" ? j.scope.at : ref.at;
  if (typeof part === "string" || !("of" in part)) return entryPart(j, ref, at, part, item);
  // When the part named by `of` is itself a fact reference: its scope or its position. The entry behind it is not read.
  const inner = entryPart(j, ref, at, part.of, item);
  return !isFactRef(inner) ? null : part.then === "scope" ? inner.at : inner.seq;
}

// ---------------------------------------------------------------- operands (section 6.5)

/**
 * An operand's value. A slot with no `of` is read from `item`: the form's
 * own subject, or in the `where` of a range each item that the range covers.
 * An absent field, an empty slot, an unbound subject and a part that an
 * entry does not have are all null.
 */
export function operand(j: Judging, o: Operand, item: Item | null): unknown {
  if ("const" in o) return o.const;
  if ("none" in o) return null;
  if ("signer" in o) return j.signer?.member ?? null;
  if ("scope" in o) return j.scope.at;
  if ("intent" in o) return j.intent ?? null;
  if ("sender" in o) return j.sender ?? null;
  if ("update" in o) return j.update?.[o.update] ?? null;
  if ("result" in o) return j.result?.name ?? null;
  if ("item" in o) return (o.item === "each" ? j.each : j.subjects.get(o.item))?.id ?? null;
  if ("source" in o) return j.source ? partOf(j, j.source.fact, o.source, item) : null;
  let value: unknown;
  if ("field" in o) value = own(j.fields, o.field) ?? null;
  else if ("presented" in o) value = own(j.presented, o.presented) ?? null;
  else if ("element" in o) value = memberOf((name) => j.elements?.get(name), o.element);
  else {
    const of = o.of === undefined ? item : o.of === "each" ? (j.each ?? null) : (j.subjects.get(o.of) ?? null);
    value = of ? slotOf(of, o.slot) : null;
  }
  return o.part === undefined ? value : partOf(j, value, o.part, item);
}

/**
 * Equality of two values that operands read (section 6.2): equal canonical
 * JSON, after local facts are put in normal form. A fact reference to this
 * scope's own entry, with that entry's hash, is that entry's `seq`, where
 * it is the value, an element of a list or a member of a record, to any
 * depth. So a record as an entry's bytes hold it equals the same record as
 * `readFacts` gave it to a field or a slot. Null equals null and nothing
 * else.
 */
export function equal(j: Judging, a: unknown, b: unknown): boolean {
  const normal = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normal);
    if (isFactRef(v)) return isLocalFact(v, j.scope.at) && j.own?.(v.seq)?.hash === v.hash ? v.seq : v;
    return isObject(v) ? Object.fromEntries(Object.entries(v).map(([name, member]) => [name, normal(member)])) : v;
  };
  return same(normal(a), normal(b));
}

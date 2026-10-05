/**
 * What the judges share (scope contract, sections 5.2, 6.2, 6.4 and 7.4):
 * how the fields of an input are read, how a delivered message finds its
 * handler, how the written forms of an act or handler are derived, and how
 * the clause of an earlier send is run again from the entry that sent it.
 */

import type { ActType, Advisory, Bounds, Digest, Effect, EffectForm, Entry, FactRef, FactUse, FieldType, FieldValue, Guard, Notify, Prepared, ReceiveType, RefusalReason, Request, ResultClauses, ScopeKind, Send, SendForm, UnavailableReason } from "@generalbusiness/artroom-contract";
import { canonicalBytes, digestBytes, entryHash, isIntent } from "@generalbusiness/artroom-bytes";
import type { Signer } from "./attribution.ts";
import { deriveEffects } from "./effects.ts";
import { signerOf } from "./fold.ts";
import { judgeGuard, type Fetched, type Judging, type RuleInput } from "./guards.ts";
import { deriveSends } from "./sends.ts";
import type { Item, OwnRequest, ScopeState, StateView } from "./state.ts";
import type { Clock } from "./time.ts";
import { keptMessage, type ValidDefinition } from "./validate.ts";
import { byteOrder, isFactRef, isLocalId, isObject, isValue, own, same } from "./values.ts";

/** What every judge is given: the one reading of the commit, the bounds, and the retained inputs. */
export interface Reading {
  clock: Clock;                         // the one reading of this commit (section 5.3); see `clockOf`
  bounds: Bounds;
  facts: readonly Fetched[];            // fetched before the turn; each entry's bytes already checked against its hash
  prepared: readonly Prepared[];        // the rule results of preparation (section 5.2, step 5)
  asked?: RuleInput[] | undefined;      // set by `prepareRules` only
}

/** The shape of section 2.1, which the bytes package guards beside the contract's other fixed records. */
export { isIntent };

/** Each value in a field with the type it must have: the field itself, or each element of a list. */
function leaves(type: FieldType, value: FieldValue): [FieldType, FieldValue][] {
  return type.type === "list" ? (value as readonly FieldValue[]).flatMap((v) => leaves(type.of, v)) : [[type, value]];
}

/** Section 6.2: each field is required or optional, an optional field may have a default, and an unknown field is refused. */
export function readFields(types: ActType["fields"], given: Readonly<Record<string, unknown>>, bounds: Bounds): { ok: true; fields: Record<string, FieldValue> } | { ok: false; detail: string } {
  // Each name is set as an own property, whatever the name is (`own`, in values.ts).
  const fields: [string, FieldValue][] = [];
  for (const name of Object.keys(given)) if (!Object.hasOwn(types, name)) return { ok: false, detail: `${name} is not a field of this act` };
  for (const [name, type] of Object.entries(types)) {
    const value = Object.hasOwn(given, name) ? given[name] : type.default;
    if (value === undefined && type.required) return { ok: false, detail: `${name} is required` };
    if (value === undefined) continue;
    if (!isValue(type, value, bounds)) return { ok: false, detail: `${name} is not a value of its type` };
    fields.push([name, value as FieldValue]);
  }
  return { ok: true, fields: Object.fromEntries(fields) };
}

/**
 * Every foreign fact the fields name, once each, in the byte order of the
 * field names: what step 1 of section 5.2 fetches before the turn. `fields`
 * are values of their types, as `readFields` returns them.
 */
export function factsNamed(types: ActType["fields"], fields: Readonly<Record<string, FieldValue>>): FactRef[] {
  const named = new Map<Digest, FactRef>();
  for (const name of Object.keys(fields).sort(byteOrder)) {
    const declared = own(types, name);
    if (!declared) continue;
    for (const [type, value] of leaves(declared, fields[name]!)) if (type.type === "fact" && !named.has((value as FactRef).hash)) named.set((value as FactRef).hash, value as FactRef);
  }
  return [...named.values()];
}

/** `no-item` carries the foreign facts read before the missing item, so an entry that records that refusal records them (section 9.2). */
export type Facts = { result: "read"; facts: Map<Digest, Fetched>; uses: FactUse[] } | { result: "no-item"; detail: string; uses: FactUse[] } | { result: "unavailable" };

/** What a use records of a foreign entry: the entry by fact, and the digest of its canonical bytes (section 9.2). */
export const useOf = (fact: FactRef, entry: Entry): FactUse => ({ fact, content: digestBytes(canonicalBytes(entry)) });

/** True when `entry` is the entry that `fact` names. */
export const isEntryOf = (entry: Entry, fact: FactRef): boolean => entry.seq === fact.seq && same(entry.at, fact.at) && entryHash(entry) === fact.hash;

/**
 * What the fields name: local items, which must exist, and foreign facts,
 * which must have been fetched. In the byte order of the field names.
 *
 * Section 6.5: a fact reference is verified whole. Every reference is checked
 * against the fetched entry, by scope, incarnation, position and hash, before
 * anything is deduplicated. So a later reference with the hash of a verified
 * one and another scope or position is not taken for it, and two references
 * that both pass are one reference: the map by hash and the list of uses
 * then hold that fact once.
 */
export function readFacts(view: StateView, types: ActType["fields"], fields: Readonly<Record<string, FieldValue>>, available: readonly Fetched[]): Facts {
  const facts = new Map<Digest, Fetched>();
  const uses: FactUse[] = [];
  for (const name of Object.keys(fields).sort(byteOrder)) {
    // A field with no declared type, as a handler's message has, names no item and no fact here.
    const declared = own(types, name);
    if (!declared) continue;
    for (const [type, value] of leaves(declared, fields[name]!)) {
      if (type.type === "item" && view.item(value as number)?.type !== type.of) return { result: "no-item", detail: `${name} names no ${type.of}`, uses };
      if (type.type !== "fact") continue;
      const ref = value as FactRef;
      const fetched = available.find((f) => f.fact.hash === ref.hash);
      // Section 5.2, step 1: a foreign entry that was not fetched, or is not the entry the reference names, is a dependency that is not available.
      if (!fetched || !isEntryOf(fetched.entry, ref)) return { result: "unavailable" };
      if (facts.has(ref.hash)) continue;
      facts.set(ref.hash, fetched);
      uses.push(useOf(ref, fetched.entry));
    }
  }
  return { result: "read", facts, uses };
}

// ---------------------------------------------------------------- messages and handlers (sections 6.4 and 7.4)

const isSelf = (v: unknown): boolean => isObject(v) && Object.keys(v).length === 1 && v["self"] === true;

/** Section 6.4: in a message `self` is not expanded by the sender. The receiver reads it as the envelope's `from`. */
function unmarked(value: unknown, from: FactRef): unknown {
  return isSelf(value) ? from : Array.isArray(value) ? value.map((v) => unmarked(v, from)) : value;
}

/** The fields of a delivered message, with each `self` read. Null when they are not a set of named values. */
export function messageFields(sent: unknown, from: FactRef): Record<string, FieldValue> | null {
  return isObject(sent) ? Object.fromEntries(Object.entries(sent).map(([name, v]) => [name, unmarked(v, from) as FieldValue])) : null;
}

/** The fields a creation request gives the child's genesis act (section 7.2). */
export function creationFields(message: Request | null, from: FactRef): Record<string, FieldValue> | null {
  return message && isObject(message.body) ? messageFields(message.body["fields"], from) : null;
}

/** A relationship update as its receiver reads it (section 7.3). `item` is the owner's item, by the fact of the entry that opened it. */
export interface Update { name: string; item: FactRef; state: string; detail: Record<string, FieldValue> }

export function updateOf(message: Request, from: FactRef): Update | null {
  const body = message.body;
  if (message.type !== "relate" || !isObject(body) || typeof body["name"] !== "string" || typeof body["state"] !== "string") return null;
  const item = unmarked(body["item"], from);
  const detail = messageFields(body["detail"], from);
  // The owner names its own item: the entry it is writing, or an earlier entry of its own history.
  if (!detail || !isFactRef(item) || !same(item.at, from.at)) return null;
  return { name: body["name"], item, state: body["state"], detail };
}

/**
 * The handler a delivered message runs, and the fields that handler reads.
 * A `tell` runs the handler whose `message` is the name the request
 * declares. A `relate` runs the handler for `relate:<name>`, with the
 * update's name, state and item beside its detail. An advisory runs the
 * handler for its type. In each case the handler must be for a scope of the
 * sender's kind; the validator has shown there is at most one. Null: the
 * body is not the shape of its message. `handler` null: the definition
 * declares none.
 */
export function bound(definition: ValidDefinition, message: Request | Advisory, from: FactRef): { kind: string; handler: ReceiveType | null; fields: Record<string, FieldValue> } | null {
  const body = message.body;
  let kind: string;
  let fields: Record<string, FieldValue> | null;
  if (message.class === "advisory") [kind, fields] = [message.type, isObject(body) && Object.hasOwn(body, "fields") ? messageFields(body["fields"], from) : {}];
  else if (message.type === "tell") {
    if (!isObject(body) || typeof body["message"] !== "string") return null;
    [kind, fields] = [body["message"], messageFields(body["fields"], from)];
    // A name the platform keeps never reaches a handler through a `tell`.
    if (keptMessage(kind)) return fields && { kind, handler: null, fields };
  } else if (message.type === "relate") {
    const update = updateOf(message, from);
    if (!update) return null;
    [kind, fields] = [`relate:${update.name}`, { ...update.detail, name: update.name, state: update.state, item: update.item }];
  } else return null;
  if (!fields) return null;
  const sender: ScopeKind = from.at.kind;
  const handler = Object.values(definition.declared.receives).find((h) => h.message === kind && h.from.kind === sender) ?? null;
  return { kind, handler, fields };
}

/** The local item a handler's field names: by its local ID, or by the fact of the entry of this scope that opened it. */
function localItem(view: StateView, scope: Pick<ScopeState, "at">, v: unknown): Item | null {
  if (isLocalId(v)) return view.item(v);
  if (!isFactRef(v) || v.at.scope !== scope.at.scope || v.at.inc !== scope.at.inc) return null;
  const item = view.item(v.seq);
  return item?.opened === v.hash ? item : null;
}

// ---------------------------------------------------------------- deriving the written forms

/** The guards, effects, sends and attention of one act or handler. */
export interface Forms { guards: readonly Guard[]; effects: readonly EffectForm[]; sends: readonly SendForm[]; attention: readonly Notify[] }

export type Ran =
  | { result: "ran"; effects: Effect[]; sends: Send[]; prepared: Prepared[]; judgesTime: boolean }
  /** `prepared`: the rule results the guards read before the refusal. An entry that records the refusal records them (section 9.2). */
  | { result: "refused"; reason: RefusalReason; detail: string; prepared: Prepared[] }
  | { result: "unavailable"; reason: UnavailableReason };

/** True when an effect sets a slot from the commit time. */
const timesEffect = (e: EffectForm): boolean => "value" in e && "time" in e.value.from;

/**
 * Guards, then effects, then sends, for one input whose subjects are
 * resolved (section 5.2, step 6.4). `judgesTime`: a guard read the clock, or
 * an effect derived a time from it, so the entry is not written while the
 * clock is behind (section 5.3).
 */
export function derive(j: Judging, forms: Forms, opens: string | null, cause: Digest, first = 0): Ran {
  for (const [i, guard] of forms.guards.entries()) {
    const result = judgeGuard(j, guard);
    if (result === "fail") return { result: "refused", reason: "guard-failed", detail: `guards.${i}`, prepared: j.used };
    if (result !== "pass") return { result: "unavailable", reason: result };
  }
  const effects = deriveEffects(j, forms.effects, forms.attention, opens);
  if (!effects.ok) return { result: "refused", reason: effects.reason, detail: effects.detail, prepared: j.used };
  const sends = deriveSends(j, forms.sends, effects.working, cause, first);
  if (!sends.ok) return { result: "refused", reason: sends.reason, detail: sends.detail, prepared: j.used };
  const judgesTime = forms.guards.some((g) => "before" in g || "after" in g) || forms.effects.some(timesEffect);
  return { result: "ran", effects: effects.effects, sends: sends.sends, prepared: j.used, judgesTime };
}

/**
 * A handler, run on a delivered message (section 6.4): it has guards and
 * effects like an act, no signer and no primary item. Each `also` name is
 * resolved from a field of the message, and no two may name one item.
 */
export function runHandler(view: StateView, definition: ValidDefinition, context: Reading, scope: ScopeState, handler: ReceiveType, kind: string, fields: Record<string, FieldValue>, cause: Digest): Ran {
  const subjects = new Map<string, Item>();
  for (const [name, also] of Object.entries(handler.also)) {
    const item = localItem(view, scope, own(fields, also.by));
    if (item?.type !== also.item) return { result: "refused", reason: "no-item", detail: `${also.by} names no ${also.item}`, prepared: [] };
    subjects.set(`also.${name}`, item);
  }
  if (new Set([...subjects.values()].map((i) => i.id)).size !== subjects.size) return { result: "refused", reason: "alias", detail: "two names resolve to one item", prepared: [] };
  const j: Judging = {
    view, definition, bounds: context.bounds, clock: context.clock, scope, self: scope.head.seq + 1, kind, fields, fieldTypes: {}, subjects, signer: null,
    facts: new Map(), prepared: context.prepared, used: [], asked: context.asked,
  };
  return derive(j, handler, null, cause);
}

// ---------------------------------------------------------------- the clause of an earlier send (sections 6.6 and 7.4)

export type Clause = keyof ResultClauses | "conflict";

/**
 * The effects of one clause of a request this scope sent, when its result or
 * its diagnosis is recorded. The send's form, and the fields, subjects and
 * signer its clause reads, are read again from `origin`, the entry that sent
 * it, which the caller supplies from this scope's own history and which is
 * checked against the hash the state keeps. The subjects are read as they are
 * now. A clause whose effects cannot apply now, as when its item has reached
 * a final state, changes nothing: the result is still recorded.
 *
 * `uses`: the foreign entries this judgment read. A clause with effects reads
 * every fact the origin's fields name, so the entry that records the clause
 * records them again (section 9.2). The origin entry recorded them first.
 */
export function runClause(view: StateView, definition: ValidDefinition, context: Reading & { origin?: Entry | null | undefined }, scope: ScopeState, request: OwnRequest, clause: Clause):
  { result: "ran"; effects: Effect[]; uses: FactUse[]; judgesTime: boolean } | { result: "unavailable"; reason: UnavailableReason } {
  const origin = context.origin;
  if (!origin || origin.seq !== request.seq || entryHash(origin) !== request.hash) return { result: "unavailable", reason: "unavailable" };
  const { declared } = definition;
  const input = origin.input;
  let frame: { kind: string; fields: Record<string, FieldValue>; fieldTypes: ActType["fields"]; subjects: [string, Item | null][]; signer: Signer | null; sends: readonly SendForm[]; first: number };
  if (input.type === "act" || input.type === "genesis") {
    const intent = input.type === "act" ? input.signed.intent : input.founding?.intent;
    const kind = input.type === "act" ? input.signed.intent.kind : declared.genesis;
    const act = own(declared.acts, kind)!;
    const given = intent ? intent.fields : input.type === "genesis" && input.source ? creationFields(input.message, input.source) : null;
    const read = readFields(act.fields, given ?? {}, context.bounds);
    if (!read.ok) throw new Error(`entry ${origin.seq} was sealed with fields its act does not take`);
    const on = act.step === "open" ? origin.seq : intent?.on;
    const subjects: [string, Item | null][] = Object.entries(act.also).map(([name, also]) => [`also.${name}`, view.item(own(read.fields, also.by) as number)]);
    if (typeof on === "number") subjects.push(["on", view.item(on)]);
    // A child's genesis sends its result at ordinal 0, before the sends its act declares.
    // The clause reads the member who signed the origin, and no principal. The entry that records the clause has no signer, so
    // the fold adds no principal for it; a principal here would put a member in an `attribute` effect whom the fold then leaves
    // out of the item's history. A grant is judged for the entry it is presented with, and for no later entry.
    const signed = signerOf(origin);
    frame = { kind, fields: read.fields, fieldTypes: act.fields, subjects, signer: signed && { member: signed.member, principal: null }, sends: act.sends, first: input.type === "genesis" && input.source ? 1 : 0 };
  } else if (input.type === "delivery" && (input.message.class === "request" || input.message.class === "advisory")) {
    const b = bound(definition, input.message, input.from);
    if (!b?.handler) throw new Error(`entry ${origin.seq} sent a request and ran no handler`);
    const handler = b.handler;
    frame = { kind: b.kind, fields: b.fields, fieldTypes: {}, subjects: Object.entries(handler.also).map(([name, also]) => [`also.${name}`, localItem(view, scope, own(b.fields, also.by))]), signer: null, sends: handler.sends, first: 0 };
  } else throw new Error(`entry ${origin.seq} is not one that sends a request`);

  const form = frame.sends[request.n - frame.first];
  if (!form || "index" in form) throw new Error(`entry ${origin.seq} declares no request at ordinal ${request.n}`);
  const clauses: ResultClauses & { conflict?: readonly EffectForm[] } = "create" in form ? form.create.result : "tell" in form ? form.tell.result : form.relate.result;
  const forms = clauses[clause] ?? [];
  if (forms.length === 0) return { result: "ran", effects: [], uses: [], judgesTime: false };

  // The uses of the origin are the facts its fields name; a clause may read one (section 6.6, a party from a fetched fact).
  const facts = readFacts(view, frame.fieldTypes, frame.fields, context.facts);
  if (facts.result !== "read") return { result: "unavailable", reason: "dependency-unavailable" };
  const subjects = new Map<string, Item>();
  for (const [name, item] of frame.subjects) {
    if (!item) throw new Error(`entry ${origin.seq} names an item that does not exist`);
    subjects.set(name, item);
  }
  const j: Judging = {
    view, definition, bounds: context.bounds, clock: context.clock, scope, self: scope.head.seq + 1, kind: frame.kind, fields: frame.fields, fieldTypes: frame.fieldTypes, subjects, signer: frame.signer,
    facts: facts.facts, prepared: [], used: [],
  };
  const effects = deriveEffects(j, forms, [], null);
  return { result: "ran", effects: effects.ok ? effects.effects : [], uses: facts.uses, judgesTime: forms.some(timesEffect) };
}

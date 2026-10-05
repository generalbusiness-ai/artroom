/**
 * What the judges share beside the reading of fields (scope contract,
 * sections 5.2, 6.4, 6.6 and 7.4): how a delivered message finds its
 * handler, how an act or handler selects its other items, how the written
 * forms of an act or handler are derived, and how the clause of an earlier
 * send is run again from the entry that sent it.
 */

import type { ActType, Advisory, AlsoRule, Bounds, Digest, Effect, EffectForm, Entry, FactRef, FactUse, FieldType, FieldValue, Guard, Notify, Prepared, Reason, ReceiveType, RefusalReason, Request, ResultClauses, ScopeRef, Send, SendForm, UnavailableReason } from "@generalbusiness/artroom-contract";
import { entryHash } from "@generalbusiness/artroom-bytes";
import type { Signer } from "./attribution.ts";
import { deriveEffects } from "./effects.ts";
import { creationFields, factsNamed, isLocalFact, messageFields, readFacts, readFields, updateOf, type Reading, type Update } from "./fields.ts";
import { signerOf } from "./fold.ts";
import { judgeGuards, slotOf, type Fetched, type Judging } from "./guards.ts";
import { conditionsReadClock, deriveSends, formOf, readsClock } from "./sends.ts";
import type { Item, OwnRequest, ScopeState, StateView } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isFactRef, isLocalId, isObject, own } from "./values.ts";

// ---------------------------------------------------------------- messages and handlers (sections 6.4 and 7.4)

/**
 * The handler a delivered message runs, and the fields the message gives it.
 * A handler is found by the message's class and name and the sender's kind:
 * a `tell` by the name the request declares, a `relate` by the
 * relationship's name, and an advisory by its type. The validator has shown
 * there is at most one. The fields are the message's own, and for a `relate`
 * the update's detail. Null: the body is not the shape of its message.
 * `handler` null: the definition declares none.
 */
export function bound(definition: ValidDefinition, message: Request | Advisory, from: FactRef): { kind: string; handler: ReceiveType | null; fields: Record<string, FieldValue> } | null {
  const body = message.body;
  let kind: string;
  let fields: Record<string, FieldValue> | null;
  if (message.class === "advisory") [kind, fields] = [message.type, isObject(body) && Object.hasOwn(body, "fields") ? messageFields(body["fields"], from) : {}];
  else if (message.type === "tell") {
    if (!isObject(body) || typeof body["message"] !== "string") return null;
    [kind, fields] = [body["message"], messageFields(body["fields"], from)];
  } else if (message.type === "relate") {
    const update = updateOf(message, from);
    if (!update) return null;
    [kind, fields] = [update.name, update.detail];
  } else return null;
  if (!fields) return null;
  const cls = message.class === "advisory" ? "advisory" : message.type;
  const handler = Object.values(definition.declared.receives).find((h) => h.class === cls && h.message === kind && h.from.kind === from.at.kind) ?? null;
  return { kind, handler, fields };
}

/**
 * The fields of a message, read against the fields its handler declares
 * (section 6.4). An unknown or ill-typed field is not read. A message names
 * a local item of its receiver by the fact of the entry that opened it
 * (section 6.6). So in a field of type `item`, or a list of them, that fact
 * is read as the item's local ID. A fact that names no such entry is left
 * as it is, and is then no value of the field's type.
 */
function messageRead(view: StateView, at: ScopeRef, handler: ReceiveType, given: Readonly<Record<string, FieldValue>>, bounds: Bounds) {
  const local = (type: FieldType | undefined, v: FieldValue): FieldValue => {
    if (type?.type === "list" && Array.isArray(v)) return v.map((e: FieldValue) => local(type.of, e));
    return type?.type === "item" && isFactRef(v) && isLocalFact(v, at) && view.item(v.seq)?.opened === v.hash ? v.seq : v;
  };
  return readFields(handler.fields, Object.fromEntries(Object.entries(given).map(([name, v]) => [name, local(own(handler.fields, name), v)])), bounds);
}

/**
 * The foreign entries that the declared fields of a delivered message name,
 * beside the source entry: what its receiver fetches before the turn, as it
 * fetches those an act names (section 5.2, step 1). None when the message
 * runs no handler, or its fields are not the ones the handler declares.
 */
export function messageFacts(view: StateView, definition: ValidDefinition, message: Request | Advisory, from: FactRef, bounds: Bounds): FactRef[] {
  const scope = view.scope();
  const b = scope && bound(definition, message, from);
  if (!scope || !b?.handler) return [];
  const read = messageRead(view, scope.at, b.handler, b.fields, bounds);
  return read.ok ? factsNamed(b.handler.fields, read.fields, scope.at).filter((f) => f.hash !== from.hash) : [];
}

// ---------------------------------------------------------------- the other items of an act or handler (section 6.4)

/**
 * The items of a type that is not `many`, lowest ID first, and no more than
 * two: `one` selects an item only when there is exactly one. `before`: only
 * the items that existed before the entry at that position.
 */
function ones(view: StateView, definition: ValidDefinition, type: string, before?: number): Item[] {
  const found = view.page(type, Object.keys(own(definition.declared.items, type)!.states), null, 2).items;
  return before === undefined ? [...found] : found.filter((i) => i.id < before);
}

/**
 * Each `also` name that is bound, with the item it selects. `by` selects the
 * item that a field names: by its local ID, or by a local fact, which is the
 * position of the entry that opened the item. `via` selects the item that a
 * slot of another subject names. `one` selects the one item of a type that
 * is not `many`. A name is unbound, and is left out, when its field is
 * absent, when its slot is empty or its subject is unbound, or when the type
 * has no item yet. A name that selects something which is no item of its
 * type refuses the input, `no-item`; so does a `one` type with two items.
 *
 * A `via` is resolved after the subject whose slot it reads, whatever the
 * order of the names: a canonical definition keeps none. `on`: the primary
 * item when it exists before the entry. `before`: for a clause that runs in
 * a later entry, the position of the entry that made the send; `one` then
 * selects among the items that entry found.
 */
export function alsoItems(view: StateView, definition: ValidDefinition, also: Readonly<Record<string, AlsoRule>>, fields: Readonly<Record<string, FieldValue>>, on: Item | null, before?: number):
  { ok: true; items: [string, Item][] } | { ok: false; detail: string } {
  const found = new Map<string, Item | null>();
  let refusal: string | null = null;
  const typed = (name: string, type: string, id: unknown): Item | null => {
    const item = isLocalId(id) ? view.item(id) : null;
    if (item?.type === type) return item;
    refusal ??= `${name} names no ${type}`;
    return null;
  };
  const resolve = (name: string): Item | null => {
    const known = found.get(name);
    if (known !== undefined) return known;
    const rule = own(also, name);
    found.set(name, null);
    let item: Item | null = null;
    if (!rule) return null;
    if ("by" in rule) {
      const id = own(fields, rule.by);
      item = id === undefined ? null : typed(name, rule.item, id);
    } else if ("via" in rule) {
      const from = rule.via.of === "on" ? on : resolve(rule.via.of.slice(5));
      const id = from ? slotOf(from, rule.via.slot) : null;
      item = id === null ? null : typed(name, rule.item, id);
    } else {
      const all = ones(view, definition, rule.item, before);
      if (all.length > 1) refusal ??= `${name}: there is more than one ${rule.item}`;
      item = all.length === 1 ? all[0]! : null;
    }
    found.set(name, item);
    return item;
  };
  const items = Object.keys(also).flatMap((name): [string, Item][] => { const item = resolve(name); return item ? [[name, item]] : []; });
  return refusal === null ? { ok: true, items } : { ok: false, detail: refusal };
}

/** Section 6.3: `max` bounds the live items of a type. What an opening of one more, into that state, would pass; or null. */
export function overMax(view: StateView, definition: ValidDefinition, type: string, state: string): string | null {
  const declared = own(definition.declared.items, type)!;
  const live = Object.entries(declared.states).reduce((n, [s, { final }]) => (final ? n : n + view.count(type, s)), 0);
  return !own(declared.states, state)?.final && live + 1 > declared.max ? `${type} has ${live} live items` : null;
}

// ---------------------------------------------------------------- deriving the written forms

/** The guards, effects, sends and attention of one act or handler. */
export interface Forms { guards: readonly Guard[]; effects: readonly EffectForm[]; sends: readonly SendForm[]; attention: readonly Notify[] }

export type Ran =
  | { result: "ran"; effects: Effect[]; sends: Send[]; prepared: Prepared[]; judgesTime: boolean }
  /** `name`: the reason the failed guard declares. `prepared`: the rule results the guards read before the refusal. An entry that records the refusal records them (section 9.2). */
  | { result: "refused"; reason: RefusalReason; name?: string; detail: string; prepared: Prepared[] }
  | { result: "unavailable"; reason: UnavailableReason };

/** Section 4.2: when a failed guard declares a `reason`, that is the refusal's name. */
export const refusalName = (guard: Guard): { name?: string } => (guard.reason === undefined ? {} : { name: guard.reason });

/** True when an effect sets a slot from the commit time. */
const timesEffect = (e: EffectForm): boolean => "value" in e && e.value.from !== null && "time" in e.value.from;

/**
 * Guards, then effects, then sends, for one input whose subjects are
 * resolved (section 5.2, step 6.4). `judgesTime`: a guard read the clock, or
 * an effect derived a time from it, so the entry is not written while the
 * clock is behind (section 5.3). `directory`: the directory the scope
 * records, when the entry is its genesis.
 */
export function derive(j: Judging, forms: Forms, opens: string | null, cause: Digest, first = 0, directory?: ScopeRef | null): Ran {
  // Section 6.5: the guards are one list with three results. A guard that is false refuses, also after one that is not completed.
  // Section 6.4: a guard whose subject is unbound is not evaluated, and an effect whose subject is unbound is not applied.
  const guards = judgeGuards(j, forms.guards);
  if (guards.result === "fail") return { result: "refused", reason: "guard-failed", ...refusalName(forms.guards[guards.at]!), detail: `guards.${guards.at}`, prepared: j.used };
  if (guards.result !== "pass") return { result: "unavailable", reason: guards.result };
  // Sections 6.6 and 6.7: a condition, or a range that a source or a send reads, that is not completed leaves the input not judged.
  const effects = deriveEffects(j, forms.effects, forms.attention, opens);
  if (!effects.ok) return "unavailable" in effects ? { result: "unavailable", reason: effects.unavailable } : { result: "refused", reason: effects.reason, detail: effects.detail, prepared: j.used };
  const sends = deriveSends(j, forms.sends, effects.working, cause, first, directory);
  if (!sends.ok) return "unavailable" in sends ? { result: "unavailable", reason: sends.unavailable } : { result: "refused", reason: sends.reason, detail: sends.detail, prepared: j.used };
  const full = opens === null ? null : overMax(j.view, j.definition, opens, effects.working.get("on")!.state);
  if (full !== null) return { result: "refused", reason: "type-full", detail: full, prepared: j.used };
  const judgesTime = readsClock(forms.guards) || forms.effects.some(timesEffect) || conditionsReadClock(forms.sends, forms.attention);
  return { result: "ran", effects: effects.effects, sends: sends.sends, prepared: j.used, judgesTime };
}

/**
 * What a handler reads of its delivery beside the message's fields (section
 * 6.5): the source entry, which the receiver read and checked before it
 * recorded anything, and for a relationship update the update being applied.
 */
export interface Sent { source: Fetched; update: Update | null }

/** What a handler did. `uses`: the foreign entries that its message's fields name, which the entry records beside the source entry (section 9.2). */
export type Handled = (Exclude<Ran, { result: "unavailable" }> & { uses: FactUse[] }) | Extract<Ran, { result: "unavailable" }>;

/**
 * A handler, run on a delivered message (section 6.4): it has guards and
 * effects like an act, and no signer. `given` are the message's fields,
 * which are read against the fields the handler declares. A handler that
 * opens a type which is `many` opens one item, and that is its `on`. One
 * that opens a type which is not `many` opens it only if the scope has none;
 * otherwise `on` is the one that exists. No two names may select one item.
 */
export function runHandler(view: StateView, definition: ValidDefinition, context: Reading, scope: ScopeState, handler: ReceiveType, kind: string, given: Readonly<Record<string, FieldValue>>, cause: Digest, sent?: Sent): Handled {
  const refused = (reason: RefusalReason, detail: string, uses: FactUse[] = []): Handled => ({ result: "refused", reason, detail, prepared: [], uses });
  const { bounds } = context;
  const read = messageRead(view, scope.at, handler, given, bounds);
  if (!read.ok) return refused("bad-field", read.detail);
  // The source entry is one of the foreign entries this entry uses.
  if (factsNamed(handler.fields, read.fields, scope.at).length >= bounds.usesPerEntry) return refused("bad-field", `more than ${bounds.usesPerEntry} foreign entries`);
  // Section 6.2: a fact that names this scope is a local fact. A foreign one was fetched before the turn, or the delivery is not decided.
  const named = readFacts(view, handler.fields, read.fields, sent ? [...context.facts, sent.source] : context.facts, { at: scope.at, own: context.own });
  if (named.result === "unavailable") return { result: "unavailable", reason: "dependency-unavailable" };
  if (named.result !== "read") return refused(named.result, named.detail, named.uses);
  const { fields, facts, uses } = named;

  const subjects = new Map<string, Item>();
  let opens: string | null = null;
  if (handler.opens !== null) {
    const held = own(definition.declared.items, handler.opens)!.many ? [] : ones(view, definition, handler.opens);
    if (held.length > 1) return refused("no-item", `there is more than one ${handler.opens}`, uses);
    if (held.length === 1) subjects.set("on", held[0]!);
    else opens = handler.opens;
  }
  // The item this entry opens does not exist yet, and the validator lets no `via` of a handler read `on`.
  const also = alsoItems(view, definition, handler.also, fields, null);
  if (!also.ok) return refused("no-item", also.detail, uses);
  for (const [name, item] of also.items) subjects.set(`also.${name}`, item);
  if (new Set([...subjects.values()].map((i) => i.id)).size !== subjects.size) return refused("alias", "two names resolve to one item", uses);
  const j: Judging = {
    view, definition, bounds, clock: context.clock, scope, self: scope.head.seq + 1, kind, fields, fieldTypes: handler.fields, subjects, signer: null,
    facts, prepared: context.prepared, used: [], asked: context.asked, own: context.own,
    // Section 6.5: `sender` is the envelope's source scope, `source` reads the source entry, and `update` the update, whose revision is the `seq` of the owner's entry.
    sender: sent?.source.fact.at, source: sent?.source, update: sent?.update ? { state: sent.update.state, item: sent.update.item, revision: sent.source.fact.seq } : undefined,
  };
  const ran = derive(j, handler, opens, cause);
  return ran.result === "unavailable" ? ran : { ...ran, uses };
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
 *
 * `answered`: for a result, the scope that answered and the reason on the
 * result, which a clause may read as `sender` and `result` (section 6.6). A
 * diagnosis has neither.
 */
export function runClause(view: StateView, definition: ValidDefinition, context: Reading & { origin?: Entry | null | undefined }, scope: ScopeState, request: OwnRequest, clause: Clause, answered?: { sender: ScopeRef; reason?: Reason }):
  { result: "ran"; effects: Effect[]; uses: FactUse[]; judgesTime: boolean } | { result: "unavailable"; reason: UnavailableReason } {
  const origin = context.origin;
  if (!origin || origin.seq !== request.seq || entryHash(origin) !== request.hash) return { result: "unavailable", reason: "unavailable" };
  const { declared } = definition;
  const input = origin.input;
  /** What the origin gives its clauses: its fields, how it selects its items, its primary item by ID, and its signer. */
  let frame: { kind: string; fields: Record<string, FieldValue>; fieldTypes: ActType["fields"]; also: Readonly<Record<string, AlsoRule>>; on: number | null; signer: Signer | null; sends: readonly SendForm[] };
  if (input.type === "act" || input.type === "genesis") {
    const intent = input.type === "act" ? input.signed.intent : input.founding?.intent;
    const kind = input.type === "act" ? input.signed.intent.kind : declared.genesis;
    const act = own(declared.acts, kind)!;
    const given = intent ? intent.fields : input.type === "genesis" && input.source ? creationFields(input.message, input.source) : null;
    const read = readFields(act.fields, given ?? {}, context.bounds);
    if (!read.ok) throw new Error(`entry ${origin.seq} was sealed with fields its act does not take`);
    const on = act.step === "open" ? origin.seq : intent?.on;
    // The clause reads the member who signed the origin, and no principal. The entry that records the clause has no signer, so
    // the fold adds no principal for it; a principal here would put a member in an `attribute` effect whom the fold then leaves
    // out of the item's history. A grant is judged for the entry it is presented with, and for no later entry.
    const signed = signerOf(origin);
    frame = { kind, fields: read.fields, fieldTypes: act.fields, also: act.also, on: typeof on === "number" ? on : null, signer: signed && { member: signed.member, principal: null }, sends: act.sends };
  } else if (input.type === "delivery" && (input.message.class === "request" || input.message.class === "advisory")) {
    const b = bound(definition, input.message, input.from);
    if (!b?.handler) throw new Error(`entry ${origin.seq} sent a request and ran no handler`);
    const handler = b.handler;
    const read = messageRead(view, scope.at, handler, b.fields, context.bounds);
    if (!read.ok) throw new Error(`entry ${origin.seq} was sealed with fields its handler does not take`);
    // The handler's primary item: the one the origin opened, or the one item of the type that it found.
    const on = handler.opens === null ? null : origin.effects.some((e) => e.effect === "open") ? origin.seq : (ones(view, definition, handler.opens, origin.seq)[0]?.id ?? null);
    frame = { kind: b.kind, fields: read.fields, fieldTypes: handler.fields, also: handler.also, on, signer: null, sends: handler.sends };
  } else throw new Error(`entry ${origin.seq} is not one that sends a request`);

  // A send that was not made took no ordinal, and a fan-out made several: the form is found from the send the entry recorded.
  const form = formOf(definition, frame.sends, origin, request.n);
  if (!form || "index" in form) throw new Error(`entry ${origin.seq} declares no request at ordinal ${request.n}`);
  const clauses: ResultClauses & { conflict?: readonly EffectForm[] } = "create" in form ? form.create.result : "tell" in form ? form.tell.result : form.relate.result;
  const forms = clauses[clause] ?? [];
  if (forms.length === 0) return { result: "ran", effects: [], uses: [], judgesTime: false };

  // The uses of the origin are the facts its fields name; a clause may read one (section 6.6, a party from a fetched fact).
  // A local fact that the origin's fields name was checked when the origin was judged. It is put in normal form again here.
  const facts = readFacts(view, frame.fieldTypes, frame.fields, context.facts, { at: scope.at, own: context.own });
  if (facts.result !== "read") return { result: "unavailable", reason: "dependency-unavailable" };
  // Section 6.6: a clause's subjects are those of the entry that made the send, as that entry resolved them, and they are read as
  // they are now. A name that the origin left unbound stays unbound. The validator lets a clause name no subject that was
  // selected through a slot which may have changed since.
  const subjects = new Map<string, Item>();
  const on = frame.on === null ? null : view.item(frame.on);
  const also = alsoItems(view, definition, frame.also, facts.fields, on, origin.seq);
  if ((frame.on !== null && !on) || !also.ok) throw new Error(`entry ${origin.seq} names an item that does not exist`);
  if (on) subjects.set("on", on);
  for (const [name, item] of also.items) subjects.set(`also.${name}`, item);
  const j: Judging = {
    view, definition, bounds: context.bounds, clock: context.clock, scope, self: scope.head.seq + 1, kind: frame.kind, fields: facts.fields, fieldTypes: frame.fieldTypes, subjects, signer: frame.signer,
    facts: facts.facts, prepared: [], used: [], own: context.own, sender: answered?.sender, result: answered?.reason,
  };
  const effects = deriveEffects(j, forms, [], null);
  // Section 6.6: a clause's condition that is not completed leaves the result not recorded now. It is offered again.
  if (!effects.ok && "unavailable" in effects) return { result: "unavailable", reason: effects.unavailable };
  return { result: "ran", effects: effects.ok ? effects.effects : [], uses: facts.uses, judgesTime: forms.some(timesEffect) };
}

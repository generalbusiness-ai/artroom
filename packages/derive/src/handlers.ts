/**
 * What the judges share beside the reading of fields (scope contract,
 * sections 5.2, 6.4, 6.6 and 7.4): how a delivered message finds its
 * handler, how an act or handler selects its other items, how the written
 * forms of an act or handler are derived, and how the clause of an earlier
 * send is run again from the entry that sent it.
 */

import type { ActType, Advisory, AlsoMark, AlsoRule, Bounds, Digest, Effect, EffectForm, Entry, FactRef, FactUse, FieldType, FieldValue, Guard, Input, Notify, PlatformData, Prepared, Reason, ReceiveType, RefusalReason, Request, ResultClauses, ScopeRef, Send, SendForm, SendMark, Settles, UnavailableReason } from "@generalbusiness/artroom-contract";
import { entryHash } from "@generalbusiness/artroom-bytes";
import type { Signer } from "./attribution.ts";
import { deriveEffects } from "./effects.ts";
import { creationFields, factsNamed, isLocalFact, messageFields, presentedTypes, readFacts, readFields, textsNamed, updateOf, type Reading, type Update } from "./fields.ts";
import { signerOf } from "./fold.ts";
import { judgeGuards, slotOf, type Fetched, type Judging } from "./guards.ts";
import { fieldOutsideType, markOf, selectedBy, type AtHand, type Giving, type JudgedInput } from "./marks.ts";
import { listedBy, rowsOfClause, settle, waits, type Needed, type Settled, type Settling } from "./observes.ts";
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
 * the update's detail. Null: the message states no name. `fields` null: the
 * body is not the shape of its message. `handler` null: the definition
 * declares none. A handler is looked for before the fields are read, so a
 * message that no handler receives is `unknown-message` whatever it holds.
 *
 * `under`: the name of the definition that the sender pins, where the
 * caller has read the source entry. A handler whose `from` names another
 * definition does not receive the message, and its field types say nothing
 * of it. The validator allows one handler for a class, a name and a kind,
 * so no other handler receives it either.
 */
export function bound(definition: ValidDefinition, message: Request | Advisory, from: FactRef, under?: string): { kind: string; handler: ReceiveType | null; fields: Record<string, FieldValue> | null } | null {
  const body = message.body;
  let kind: string;
  if (message.class === "advisory") kind = message.type;
  else if (message.type === "tell" || message.type === "relate") {
    const named = isObject(body) ? body[message.type === "tell" ? "message" : "name"] : undefined;
    if (typeof named !== "string") return null;
    kind = named;
  } else return null;
  const cls = message.class === "advisory" ? "advisory" : message.type;
  const found = Object.values(definition.declared.receives).find((h) => h.class === cls && h.message === kind && h.from.kind === from.at.kind) ?? null;
  const handler = found && (under === undefined || found.from.under === undefined || found.from.under === under) ? found : null;
  // The mark `self` is read by the type that the handler declares for the field.
  const types = handler?.fields ?? {};
  let fields: Record<string, FieldValue> | null;
  if (message.class === "advisory") fields = isObject(body) && Object.hasOwn(body, "fields") ? messageFields(body["fields"], from, types) : {};
  else if (message.type === "tell") fields = messageFields((body as Record<string, unknown>)["fields"], from, types);
  else fields = updateOf(message, from) ? messageFields((body as Record<string, unknown>)["detail"], from, types) : null;
  return { kind, handler, fields };
}

/**
 * The fields of a message, read against the fields its handler declares
 * (section 6.4). An unknown or ill-typed field is not read. A message names
 * a local item of its receiver by the fact of the entry that opened it
 * (section 6.6). So where the declared type is `item`, in a field, an element
 * of a list or a member of a record, to any depth, that fact is read as the
 * item's local ID: the inverse of `wire` in `sends.ts`. A fact that names no
 * such entry is left as it is, and is then no value of the type. Whether
 * the item is of the declared type is checked with the other items, by
 * `readFacts`.
 */
function messageRead(view: StateView, at: ScopeRef, handler: ReceiveType, given: Readonly<Record<string, FieldValue>>, bounds: Bounds) {
  const local = (type: FieldType | undefined, v: FieldValue): FieldValue => {
    if (type?.type === "list" && Array.isArray(v)) return v.map((e: FieldValue) => local(type.of, e));
    if (type?.type === "record" && isObject(v)) return Object.fromEntries(Object.entries(v).map(([name, member]) => [name, local(own(type.of, name), member as FieldValue)]));
    return type?.type === "item" && isFactRef(v) && isLocalFact(v, at) && view.item(v.seq)?.opened === v.hash ? v.seq : v;
  };
  return readFields(handler.fields, Object.fromEntries(Object.entries(given).map(([name, v]) => [name, local(own(handler.fields, name), v)])), bounds);
}

/**
 * The foreign entries that the declared fields of a delivered message name,
 * beside the source entry: what its receiver fetches before the turn, as it
 * fetches those an act names (section 5.2, step 1). None when the message
 * runs no handler, or its fields are not the ones the handler declares.
 * `under`: the name of the definition that the sender pins, which the
 * receiver read with the source entry.
 */
export function messageFacts(view: StateView, definition: ValidDefinition, message: Request | Advisory, from: FactRef, bounds: Bounds, under: string): FactRef[] {
  const scope = view.scope();
  const b = scope && bound(definition, message, from, under);
  if (!scope || !b?.handler || !b.fields) return [];
  const read = messageRead(view, scope.at, b.handler, b.fields, bounds);
  return read.ok ? factsNamed(b.handler.fields, read.fields, scope.at).filter((f) => f.hash !== from.hash) : [];
}

/**
 * The digest of each detached text that an input names (section 6.2): in
 * the fields of an act, of a founding or of a creation, and in the declared
 * fields of a message that a handler receives. The scope keeps the bytes of
 * each as a retained input with the entry that records the input, and a
 * verifier asks for the same ones. A result, a control, a message that no
 * handler receives, and an input that is not an act of the definition name
 * none. `under`: for a delivery, the name of the definition that its
 * sender pins, as the receiver read it with the source entry.
 */
export function inputTexts(definition: ValidDefinition, input: Input, under?: string): Digest[] {
  const { acts, genesis } = definition.declared;
  if (input.type === "act") return textsNamed(own(acts, input.signed.intent.kind)?.fields ?? {}, input.signed.intent.fields);
  if (input.type === "genesis") return textsNamed(own(acts, genesis)!.fields, input.founding ? input.founding.intent.fields : input.source ? creationFields(input.message, input.source, own(acts, genesis)!.fields) : null);
  return input.type === "delivery" && (input.message.class === "request" || input.message.class === "advisory") ? messageTexts(definition, input.message, input.from, under) : [];
}

/** The digest of each detached text that the declared fields of a delivered message name. None when no handler receives the message. `under`: as for `bound`. */
export function messageTexts(definition: ValidDefinition, message: Request | Advisory, from: FactRef, under: string | undefined): Digest[] {
  const b = bound(definition, message, from, under);
  return b?.handler ? textsNamed(b.handler.fields, b.fields) : [];
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
 *
 * Section 4.2, check 8: in platform data a name may be a mark, and its rule
 * gives one local item of the stated type, or none. `select` runs that
 * rule, with the names that are bound so far. With none the name is
 * unbound. Without `select`, as for a clause that runs in a later entry, a
 * name that a mark selects is unbound: the validator lets no clause name
 * one. `marked` in the result: the names that a mark selects, which have no
 * key in an intent's `expected`.
 */
export function alsoItems(view: StateView, definition: ValidDefinition, also: Readonly<Record<string, AlsoRule>>, fields: Readonly<Record<string, FieldValue>>, on: Item | null, before?: number,
  select?: (mark: AlsoMark, bound: ReadonlyMap<string, Item>) => Item | null): { ok: true; items: [string, Item][]; marked: ReadonlySet<string> } | { ok: false; detail: string } {
  const marked = new Set<string>();
  /** The subjects that are bound when a rule is run: the primary item, and each name resolved before it. */
  const bound = (): Map<string, Item> => new Map([...(on ? [["on", on] as const] : []), ...[...found].flatMap(([name, item]) => (item ? [[`also.${name}`, item] as const] : []))]);
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
    const mark = markOf(rule) as AlsoMark | null;
    if (mark) {
      marked.add(name);
      item = select ? select(mark, bound()) : null;
    } else if ("by" in rule) {
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
  return refusal === null ? { ok: true, items, marked } : { ok: false, detail: refusal };
}

/** Section 6.3: `max` bounds the live items of a type. What an opening of one more, into that state, would pass; or null. */
export function overMax(view: StateView, definition: ValidDefinition, type: string, state: string): string | null {
  const declared = own(definition.declared.items, type)!;
  const live = Object.entries(declared.states).reduce((n, [s, { final }]) => (final ? n : n + view.count(type, s)), 0);
  return !own(declared.states, state)?.final && live + 1 > declared.max ? `${type} has ${live} live items` : null;
}

// ---------------------------------------------------------------- deriving the written forms

/** The guards, effects, sends and attention of one act or handler, and what it declares that it settles. */
export interface Forms { guards: readonly Guard[]; effects: readonly EffectForm[]; sends: readonly SendForm[]; attention: readonly Notify[]; settles?: Settles | undefined }

export type Ran =
  /** `settles`: the form declares that it settles an item, the item was in a listed state, and these effects take it out of them (section 17.3). */
  | { result: "ran"; effects: Effect[]; sends: Send[]; prepared: Prepared[]; judgesTime: boolean; settles: boolean }
  /** `name`: the reason the failed guard declares. `prepared`: the rule results the guards read before the refusal. An entry that records the refusal records them (section 9.2). */
  | { result: "refused"; reason: RefusalReason; name?: string; detail: string; prepared: Prepared[] }
  | { result: "unavailable"; reason: UnavailableReason };

/** Section 4.2: when a failed guard declares a `reason`, that is the refusal's name. */
export const refusalName = (guard: Guard): { name?: string } => (guard.reason === undefined ? {} : { name: guard.reason });

/** True when an effect sets a slot from the commit time, or its condition reads the clock. */
const timesEffect = (e: EffectForm): boolean => ("value" in e && e.value.from !== null && "time" in e.value.from) || readsClock(e.if) || readsClock(e.unless);

/** What a judge gives a rule before the forms of a row are derived: at check 7 no subject is bound, and at check 8 those bound so far. A handler has no signer. */
export const giving = (view: StateView, context: Reading, scope: Pick<ScopeState, "at" | "creator">, self: number, judged: JudgedInput, ran: { clock: boolean }, fields: Readonly<Record<string, FieldValue>>, facts: ReadonlyMap<Digest, Fetched>, source?: Fetched): Giving =>
  ({ view, clock: context.clock, bounds: context.bounds, scope, self, fields, subjects: new Map(), signer: null, facts, own: context.own, source, platform: context.platform, judged, ran });

/**
 * Guards, then effects, then sends, for one input whose subjects are
 * resolved (section 5.2, step 6.4). `judgesTime`: a guard or a condition of
 * the forms reads the clock, at any depth, or an effect derives a time from
 * it, so the entry is not written while the clock is behind (section 5.3). `directory`: the directory the scope
 * records, when the entry is its genesis.
 */
export function derive(j: Judging, forms: Forms, opens: string | null, cause: Digest, first = 0, directory?: ScopeRef | null): Ran {
  // Section 6.5: the guards are one list with three results. A guard that is false refuses, also after one that is not completed.
  // Section 6.4: a guard whose subject is unbound is not evaluated, and an effect whose subject is unbound is not applied.
  const guards = judgeGuards(j, forms.guards);
  if (guards.result === "fail") {
    const failed = forms.guards[guards.at]!;
    // Section 4.2: a capability guard that does not hold is `capability-refused`, with the name its capability declares.
    const declined = j.declined?.get(failed);
    if (declined !== undefined) return { result: "refused", reason: "capability-refused", name: declined, detail: `guards.${guards.at}`, prepared: j.used };
    // Section 4.2: a mark in the written list is a guard of the list. Its path is its position, and its name is the refusal that
    // its rule states. The code is `guard-failed`, or the one that the rule's specification states.
    const coded = j.coded?.get(failed);
    if (coded) return { result: "refused", reason: coded.code ?? "guard-failed", name: coded.name, detail: `guards.${guards.at}`, prepared: j.used };
    return { result: "refused", reason: "guard-failed", ...refusalName(failed), detail: `guards.${guards.at}`, prepared: j.used };
  }
  if (guards.result !== "pass") return { result: "unavailable", reason: guards.result };
  // Sections 6.6 and 6.7: a condition, or a range that a source or a send reads, that is not completed leaves the input not judged.
  const effects = deriveEffects(j, forms.effects, forms.attention, opens);
  if (!effects.ok) return "unavailable" in effects ? { result: "unavailable", reason: effects.unavailable } : { result: "refused", reason: effects.reason, detail: effects.detail, prepared: j.used };
  const sends = deriveSends(j, forms.sends, effects.working, cause, first, directory, effects.opened !== null);
  if (!sends.ok) return "unavailable" in sends ? { result: "unavailable", reason: sends.unavailable } : { result: "refused", reason: sends.reason, detail: sends.detail, prepared: j.used };
  // Section 6.3: `max` bounds the live items of a type, whatever opens the item: the row, or in platform data a rule.
  const full = effects.opened === null ? null : overMax(j.view, j.definition, effects.opened.type, effects.opened.state);
  if (full !== null) return { result: "refused", reason: "type-full", detail: full, prepared: j.used };
  // Section 6.1, "A rule that reads the clock": an entry for which such a rule was run judges time.
  const judgesTime = readsClock(forms.guards) || forms.effects.some(timesEffect) || conditionsReadClock(forms.sends, forms.attention) || j.ran?.clock === true;
  // Section 17.3: a form that declares `settles` is judged in full. It settles when its subject is in a listed state at the
  // commit and the entry takes it out of the listed states. Any other entry of the form is new work.
  const settled = forms.settles && "of" in forms.settles ? forms.settles : null;
  const [was, is] = settled ? [j.subjects.get(settled.of), effects.working.get(settled.of)] : [];
  const settles = !!settled && !!was && !!is && settled.in.includes(was.state) && !settled.in.includes(is.state);
  return { result: "ran", effects: effects.effects, sends: sends.sends, prepared: j.used, judgesTime, settles };
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
export function runHandler(view: StateView, definition: ValidDefinition, context: Reading, scope: ScopeState, handler: ReceiveType, kind: string, given: Readonly<Record<string, FieldValue>>, cause: Digest, sent?: Sent, judged?: JudgedInput): Handled {
  const refused = (reason: RefusalReason, detail: string, uses: FactUse[] = []): Handled => ({ result: "refused", reason, detail, prepared: [], uses });
  const { bounds } = context;
  const read = messageRead(view, scope.at, handler, given, bounds);
  if (!read.ok) return refused("bad-field", read.detail);
  // The source entry is one of the foreign entries this entry uses.
  if (factsNamed(handler.fields, read.fields, scope.at).length >= bounds.usesPerEntry) return refused("bad-field", `more than ${bounds.usesPerEntry} foreign entries`);
  // Section 6.2: a fact that names this scope is a local fact. A foreign one was fetched before the turn, or the delivery is not decided.
  const named = readFacts(view, handler.fields, read.fields, sent ? [...context.facts, sent.source] : context.facts, { at: scope.at, own: context.own, texts: context.texts });
  if (named.result === "unavailable") return { result: "unavailable", reason: "dependency-unavailable" };
  if (named.result !== "read") return refused(named.result, named.detail, named.uses);
  const { fields, facts, uses } = named;
  // Platform data: what a rule of this row is given before the row's forms are derived (section 6.1). A handler has no check 9.
  const clocked = { clock: false };
  const g = judged ? giving(view, context, scope, scope.head.seq + 1, judged, clocked, fields, facts, sent?.source) : null;
  // Section 4.2, check 7: a field whose type is a mark is checked by the mark's rule.
  const outside = g && fieldOutsideType(g, handler.fields);
  if (outside) return refused("bad-field", `${outside} is not a value of its type`, uses);

  const subjects = new Map<string, Item>();
  let opens: string | null = null;
  if (handler.opens !== null) {
    const held = own(definition.declared.items, handler.opens)!.many ? [] : ones(view, definition, handler.opens);
    if (held.length > 1) return refused("no-item", `there is more than one ${handler.opens}`, uses);
    if (held.length === 1) subjects.set("on", held[0]!);
    else opens = handler.opens;
  }
  // The item this entry opens does not exist yet, and the validator lets no `via` of a handler read `on`.
  // Section 4.2, check 8: a name of `also` that a mark selects is resolved by the mark's rule.
  const also = alsoItems(view, definition, handler.also, fields, null, undefined, g ? (mark, bound) => selectedBy({ ...g, subjects: bound }, mark) : undefined);
  if (!also.ok) return refused("no-item", also.detail, uses);
  for (const [name, item] of also.items) subjects.set(`also.${name}`, item);
  if (new Set([...subjects.values()].map((i) => i.id)).size !== subjects.size) return refused("alias", "two names resolve to one item", uses);
  const j: Judging = {
    view, definition, bounds, clock: context.clock, scope, self: scope.head.seq + 1, kind, fields, fieldTypes: handler.fields, subjects, signer: null,
    facts, prepared: context.prepared, used: [], asked: context.asked, own: context.own, snapshot: context.snapshot, capabilities: context.capabilities, platform: context.platform, judged, ran: clocked,
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
 * result, which a clause may read as `sender` and `result` (section 6.6),
 * and the verified source entry of the result. A diagnosis has none.
 *
 * `judged`: the input of the entry that runs the clause, the delivery of
 * the result or the diagnosis, for a mark among the clause's effects, in
 * platform data. Its rule is run when the clause runs (section 4.2).
 *
 * `beside`: for the delivery of a result, the further observations at hand,
 * which a rule of the clause reads and the entry then retains (sections 4.1
 * and 16.1). A diagnosis may hold none, and is given none.
 */
export function runClause(view: StateView, definition: ValidDefinition, context: Reading & { origin?: Entry | null | undefined }, scope: ScopeState, request: OwnRequest, clause: Clause, answered?: { sender: ScopeRef; reason?: Reason; source?: Fetched }, judged?: JudgedInput, beside?: AtHand,
  given?: Pick<Settling, "observed" | "values" | "observing">):
  { result: "ran"; effects: Effect[]; uses: FactUse[]; judgesTime: boolean; rows?: Settled } | { result: "unavailable"; reason: UnavailableReason; missing?: readonly Needed[]; rows?: Settled } {
  const origin = context.origin;
  if (!origin || origin.seq !== request.seq || entryHash(origin) !== request.hash) return { result: "unavailable", reason: "unavailable" };
  const { declared } = definition;
  const input = origin.input;
  /** What the origin gives its clauses: its fields, how it selects its items, its primary item by ID, and its signer. */
  let frame: { kind: string; fields: Record<string, FieldValue>; fieldTypes: ActType["fields"]; also: Readonly<Record<string, AlsoRule>>; on: number | null; signer: Signer | null; sends: readonly SendForm[];
               presents?: ActType["presents"]; presented?: Readonly<Record<string, FieldValue>>;
               /** The send of an outcome's mark, which made the request: an outcome entry has no written list to find it in. */
               sent?: SendMark };
  if (input.type === "act" || input.type === "genesis") {
    const intent = input.type === "act" ? input.signed.intent : input.founding?.intent;
    const kind = input.type === "act" ? input.signed.intent.kind : declared.genesis;
    const act = own(declared.acts, kind)!;
    const given = intent ? intent.fields : input.type === "genesis" && input.source ? creationFields(input.message, input.source, act.fields) : null;
    const read = readFields(act.fields, given ?? {}, context.bounds);
    if (!read.ok) throw new Error(`entry ${origin.seq} was sealed with fields its act does not take`);
    const on = act.step === "open" ? origin.seq : intent?.on;
    // The clause reads the member who signed the origin, and no principal. The entry that records the clause has no signer, so
    // the fold adds no principal for it; a principal here would put a member in an `attribute` effect whom the fold then leaves
    // out of the item's history. A grant is judged for the entry it is presented with, and for no later entry.
    const signed = signerOf(origin);
    frame = { kind, fields: read.fields, fieldTypes: act.fields, also: act.also, on: typeof on === "number" ? on : null, signer: signed && { member: signed.member, principal: null }, sends: act.sends };
    // The facts that were presented beside the origin's intent, which a clause may read as the act's guards did.
    if (input.type === "act") [frame.presents, frame.presented] = [act.presents, input.presented];
  } else if (input.type === "delivery" && (input.message.class === "request" || input.message.class === "advisory")) {
    const b = bound(definition, input.message, input.from);
    if (!b?.handler || !b.fields) throw new Error(`entry ${origin.seq} sent a request and ran no handler`);
    const handler = b.handler;
    const read = messageRead(view, scope.at, handler, b.fields, context.bounds);
    if (!read.ok) throw new Error(`entry ${origin.seq} was sealed with fields its handler does not take`);
    // The handler's primary item: the one the origin opened, or the one item of the type that it found.
    const on = handler.opens === null ? null : origin.effects.some((e) => e.effect === "open") ? origin.seq : (ones(view, definition, handler.opens, origin.seq)[0]?.id ?? null);
    frame = { kind: b.kind, fields: read.fields, fieldTypes: handler.fields, also: handler.also, on, signer: null, sends: handler.sends };
  } else if (input.type === "outcome") {
    // Platform data, section 6.1, place 7: an outcome entry has no row in the data. The mark of its kind may hold one `send`, whose
    // clauses are the mark's own (revision 17, "A request of an outcome's rule, and its clauses"). Such an entry sends that one
    // request and no other, at ordinal 0. A request of a kind whose mark holds no send has no clause written anywhere: its result
    // is recorded, and changes nothing. The clause is found by the kind of the outcome, which its input holds, and by nothing else.
    const marked = input.owner === context.platform?.named ? own((declared as unknown as PlatformData).outcomes, input.kind)?.send : undefined;
    if (!marked || request.n !== 0) return { result: "ran", effects: [], uses: [], judgesTime: false };
    // An outcome has no field, no subject and no signer: each effect of the clause is an effect mark, whose rule finds its items.
    frame = { kind: input.kind, fields: {}, fieldTypes: {}, also: {}, on: null, signer: null, sends: [], sent: marked as unknown as SendMark };
  } else throw new Error(`entry ${origin.seq} is not one that sends a request`);

  // A send that was not made took no ordinal, and a fan-out made several: the form is found from the send the entry recorded.
  const form = frame.sent ?? formOf(definition, frame.sends, origin, request.n);
  if (!form || "index" in form) throw new Error(`entry ${origin.seq} declares no request at ordinal ${request.n}`);
  // The clauses of a request that a rule gave are its mark's own, as data (section 6.1, place 6).
  const marked = markOf(form) as SendMark | null;
  const written = marked ? null : (form as Exclude<SendForm, { index: unknown }>);
  const clauses = (marked ? marked.result : "create" in written! ? written.create.result : "tell" in written! ? written.tell.result : written!.relate.result) as ResultClauses & { conflict?: readonly EffectForm[] };
  const forms = clauses[clause] ?? [];
  // Revision 20, section 16.1: the rows of this clause, for the delivery of a result that runs it, under a definition whose data
  // states rows. A request that a rule gave states none: its mark holds its clauses, and no text gives a mark rows (I3 deltas,
  // entry GA5). A diagnosis holds no observation, so `undelivered` has none.
  const rows = definition.observing && written && beside && given && clause !== "undelivered" ? rowsOfClause(written, clause) : [];
  if (beside && definition.observing) beside.rows = { status: [], listed: new Set(), retained: [], values: [] };
  if (forms.length === 0 && rows.length === 0) return { result: "ran", effects: [], uses: [], judgesTime: false };

  // The uses of the origin are the facts its fields name; a clause may read one (section 6.6, a party from a fetched fact).
  // A local fact that the origin's fields name was checked when the origin was judged. It is put in normal form again here.
  // A detached text that the origin's fields name was checked when the origin was judged, and is not asked for again.
  const local = { at: scope.at, own: context.own, texts: () => null };
  const facts = readFacts(view, frame.fieldTypes, frame.fields, context.facts, local);
  const presented = readFacts(view, presentedTypes(frame.presents), frame.presented ?? {}, context.facts, local);
  if (facts.result !== "read" || presented.result !== "read") return { result: "unavailable", reason: "dependency-unavailable" };
  // Section 6.6: a clause's subjects are those of the entry that made the send, as that entry resolved them, and they are read as
  // they are now. A name that the origin left unbound stays unbound. The validator lets a clause name no subject that was
  // selected through a slot which may have changed since.
  const subjects = new Map<string, Item>();
  const on = frame.on === null ? null : view.item(frame.on);
  const also = alsoItems(view, definition, frame.also, facts.fields, on, origin.seq);
  if ((frame.on !== null && !on) || !also.ok) throw new Error(`entry ${origin.seq} names an item that does not exist`);
  if (on) subjects.set("on", on);
  for (const [name, item] of also.items) subjects.set(`also.${name}`, item);
  // Section 6.6: a clause of a fan-out send reads `each`, the item of that send. The validator lets a clause read it only where the
  // update's `item` is that item, so the send that the origin recorded names it.
  const update = written && "relate" in written && written.relate.each ? updateOf(origin.sends.find((s) => s.n === request.n)!.message as Request, { at: scope.at, seq: origin.seq, hash: request.hash }) : null;
  const j: Judging = {
    view, definition, bounds: context.bounds, clock: context.clock, scope, self: scope.head.seq + 1, kind: frame.kind, fields: facts.fields, fieldTypes: frame.fieldTypes, subjects, signer: frame.signer,
    facts: new Map([...facts.facts, ...presented.facts]), prepared: [], used: [], own: context.own, sender: answered?.sender, result: answered?.reason, each: (update && view.item(update.item.seq)) ?? undefined,
    presented: presented.fields, capabilities: context.capabilities, platform: context.platform, judged, ran: { clock: false }, beside,
    // The clause of an outcome's send has no field that names a fact. Its rule may give the fact of the entry that answered, which
    // is at hand as the verified source entry of the result, and which the entry that records the result retains.
    ...(frame.sent && answered?.source ? { source: answered.source } : {}),
  };
  // Section 16.1, "In the commit": for a clause the list is derived before any rule of the entry runs. A source reads what a clause
  // reads: the state as it is now, the fields and the facts of the entry that sent the request, and the result. A member of another
  // repository is left out. A subject with no observation at hand, which the scope can still read, stops the commit. An absent row
  // that states `wait` leaves the result not recorded now: the delivery is tried again. Every other absent row, and every row that
  // is over, is told to the rule, and the entry is written.
  let settled: Settled | undefined;
  if (rows.length > 0 && beside && given) {
    const list = listedBy(j, rows, given.observing?.membership).rows;
    settled = settle(list, { view, bounds: context.bounds, clock: context.clock, ...given });
    if (settled.missing.length > 0) return { result: "unavailable", reason: "authority-unavailable", missing: settled.missing, rows: settled };
    if (waits(list, settled)) return { result: "unavailable", reason: "authority-unavailable", rows: settled };
    const { status } = settled;
    beside.rows = { status: rows.map((_, n) => status.get(n) ?? null), listed: settled.listed, retained: settled.retained, values: settled.values };
  }
  const effects = deriveEffects(j, forms, [], null);
  // Section 6.6: a clause's condition that is not completed leaves the result not recorded now. It is offered again.
  if (!effects.ok && "unavailable" in effects) return { result: "unavailable", reason: effects.unavailable };
  // Section 6.3: `max` bounds the live items of a type, whatever opens the item. In platform data a rule of the clause may open
  // one. Past the bound the clause's effects cannot apply now, and it changes nothing, as above.
  const applies = effects.ok && (effects.opened === null || overMax(view, definition, effects.opened.type, effects.opened.state) === null);
  return { result: "ran", effects: applies ? effects.effects : [], uses: [...facts.uses, ...presented.uses.filter((use) => !facts.facts.has(use.fact.hash))], judgesTime: forms.some(timesEffect) || j.ran?.clock === true, ...(settled ? { rows: settled } : {}) };
}

/**
 * What the judges share beside the reading of fields (scope contract,
 * sections 5.2, 6.4, 6.6 and 7.4): how a delivered message finds its
 * handler, how the written forms of an act or handler are derived, and how
 * the clause of an earlier send is run again from the entry that sent it.
 */

import type { ActType, Advisory, Digest, Effect, EffectForm, Entry, FactRef, FactUse, FieldValue, Guard, Notify, Prepared, Reason, ReceiveType, RefusalReason, Request, ResultClauses, ScopeKind, ScopeRef, Send, SendForm, UnavailableReason } from "@generalbusiness/artroom-contract";
import { entryHash } from "@generalbusiness/artroom-bytes";
import type { Signer } from "./attribution.ts";
import { deriveEffects } from "./effects.ts";
import { creationFields, messageFields, readFacts, readFields, updateOf, type Reading, type Update } from "./fields.ts";
import { signerOf } from "./fold.ts";
import { judgeGuard, type Fetched, type Judging } from "./guards.ts";
import { deriveSends } from "./sends.ts";
import type { Item, OwnRequest, ScopeState, StateView } from "./state.ts";
import { namedBy } from "./unsupported.ts";
import { keptMessage, type ValidDefinition } from "./validate/index.ts";
import { isFactRef, isLocalId, isObject, own } from "./values.ts";

// ---------------------------------------------------------------- messages and handlers (sections 6.4 and 7.4)

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
 * clock is behind (section 5.3).
 */
export function derive(j: Judging, forms: Forms, opens: string | null, cause: Digest, first = 0): Ran {
  for (const [i, guard] of forms.guards.entries()) {
    const result = judgeGuard(j, guard);
    if (result === "fail") return { result: "refused", reason: "guard-failed", ...refusalName(guard), detail: `guards.${i}`, prepared: j.used };
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
 * What a handler reads of its delivery beside the message's fields (section
 * 6.5): the source entry, which the receiver read and checked before it
 * recorded anything, and for a relationship update the update being applied.
 */
export interface Sent { source: Fetched; update: Update | null }

/**
 * A handler, run on a delivered message (section 6.4): it has guards and
 * effects like an act, no signer and no primary item. Each `also` name is
 * resolved from a field of the message, and no two may name one item.
 */
export function runHandler(view: StateView, definition: ValidDefinition, context: Reading, scope: ScopeState, handler: ReceiveType, kind: string, fields: Record<string, FieldValue>, cause: Digest, sent?: Sent): Ran {
  const subjects = new Map<string, Item>();
  for (const [name, also] of Object.entries(handler.also)) {
    const item = localItem(view, scope, own(fields, namedBy(also)));
    if (item?.type !== also.item) return { result: "refused", reason: "no-item", detail: `${namedBy(also)} names no ${also.item}`, prepared: [] };
    subjects.set(`also.${name}`, item);
  }
  if (new Set([...subjects.values()].map((i) => i.id)).size !== subjects.size) return { result: "refused", reason: "alias", detail: "two names resolve to one item", prepared: [] };
  const j: Judging = {
    view, definition, bounds: context.bounds, clock: context.clock, scope, self: scope.head.seq + 1, kind, fields, fieldTypes: {}, subjects, signer: null,
    facts: new Map(), prepared: context.prepared, used: [], asked: context.asked, own: context.own,
    // Section 6.5: `sender` is the envelope's source scope, `source` reads the source entry, and `update` the update, whose revision is the `seq` of the owner's entry.
    sender: sent?.source.fact.at, source: sent?.source, update: sent?.update ? { state: sent.update.state, item: sent.update.item, revision: sent.source.fact.seq } : undefined,
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
  let frame: { kind: string; fields: Record<string, FieldValue>; fieldTypes: ActType["fields"]; subjects: [string, Item | null][]; signer: Signer | null; sends: readonly SendForm[]; first: number };
  if (input.type === "act" || input.type === "genesis") {
    const intent = input.type === "act" ? input.signed.intent : input.founding?.intent;
    const kind = input.type === "act" ? input.signed.intent.kind : declared.genesis;
    const act = own(declared.acts, kind)!;
    const given = intent ? intent.fields : input.type === "genesis" && input.source ? creationFields(input.message, input.source) : null;
    const read = readFields(act.fields, given ?? {}, context.bounds);
    if (!read.ok) throw new Error(`entry ${origin.seq} was sealed with fields its act does not take`);
    const on = act.step === "open" ? origin.seq : intent?.on;
    const subjects: [string, Item | null][] = Object.entries(act.also).map(([name, also]) => [`also.${name}`, view.item(own(read.fields, namedBy(also)) as number)]);
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
    frame = { kind: b.kind, fields: b.fields, fieldTypes: {}, subjects: Object.entries(handler.also).map(([name, also]) => [`also.${name}`, localItem(view, scope, own(b.fields, namedBy(also)))]), signer: null, sends: handler.sends, first: 0 };
  } else throw new Error(`entry ${origin.seq} is not one that sends a request`);

  const form = frame.sends[request.n - frame.first];
  if (!form || "index" in form) throw new Error(`entry ${origin.seq} declares no request at ordinal ${request.n}`);
  const clauses: ResultClauses & { conflict?: readonly EffectForm[] } = "create" in form ? form.create.result : "tell" in form ? form.tell.result : form.relate.result;
  const forms = clauses[clause] ?? [];
  if (forms.length === 0) return { result: "ran", effects: [], uses: [], judgesTime: false };

  // The uses of the origin are the facts its fields name; a clause may read one (section 6.6, a party from a fetched fact).
  // A local fact that the origin's fields name was checked when the origin was judged. It is put in normal form again here.
  const facts = readFacts(view, frame.fieldTypes, frame.fields, context.facts, { at: scope.at, own: context.own });
  if (facts.result !== "read") return { result: "unavailable", reason: "dependency-unavailable" };
  const subjects = new Map<string, Item>();
  for (const [name, item] of frame.subjects) {
    if (!item) throw new Error(`entry ${origin.seq} names an item that does not exist`);
    subjects.set(name, item);
  }
  const j: Judging = {
    view, definition, bounds: context.bounds, clock: context.clock, scope, self: scope.head.seq + 1, kind: frame.kind, fields: facts.fields, fieldTypes: frame.fieldTypes, subjects, signer: frame.signer,
    facts: facts.facts, prepared: [], used: [], own: context.own, sender: answered?.sender, result: answered?.reason,
  };
  const effects = deriveEffects(j, forms, [], null);
  return { result: "ran", effects: effects.ok ? effects.effects : [], uses: facts.uses, judgesTime: forms.some(timesEffect) };
}

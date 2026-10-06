/**
 * The judge of a delivery (scope contract, sections 7.2 to 7.4), for each of
 * the four classes of message: a request, a result, a control and an
 * advisory.
 */

import type { Advisory, CapabilityName, Control, Effect, Entry, FactRef, FactUse, Message, ObservationUse, Prepared, Reason, Request, Result, RoutingRefusal, ScopeRef, Seed, Send } from "@generalbusiness/artroom-contract";
import { deliveryCauseDigest, messageDigest, scopeIdOf, seedDigest } from "@generalbusiness/artroom-bytes";
import { declaredBy, type Recorded } from "./capability.ts";
import { isEntryOf, updateOf, useOf, type Reading } from "./fields.ts";
import { bound, runClause, runHandler, type Clause, type Handled, type Sent } from "./handlers.ts";
import type { Judgment } from "./judge.ts";
import { heldOpenings } from "./ledger.ts";
import { atHand, retainedOf, unjudged, type JudgedInput } from "./marks.ts";
import { recordEffects } from "./prepare.ts";
import type { ScopeState, StateView } from "./state.ts";
import { nextDue } from "./timed.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isFactRef, isLocalId, isObject, isScopeRef, same } from "./values.ts";

/**
 * One delivery as it arrives: the send's address as the sender wrote it, a
 * full reference or, for a creation, a seed; the fact of the entry that sent
 * it; the ordinal of the send; and the message.
 */
export interface Delivered { to: ScopeRef | Seed; from: FactRef; n: number; message: Message }

/** The source entry as read from the source scope (section 7.4), and the name of the definition that scope pins. */
export interface Source { entry: Entry; under: string }

export interface DeliveryContext extends Reading {
  /** The entry the envelope's `from` names. Null: it could not be read, and the delivery is retried. */
  source: Source | null;
  /** For a result: this scope's own entry that sent the request, from its history. */
  origin?: Entry | null | undefined;
  /**
   * For a result: the further observations at hand (sections 4.1 and 16.1),
   * each judged by the guards of an observation before the judge is given
   * it. A rule of the clause that runs reads one, and the entry retains
   * exactly those that were read. No other delivery may hold the member, so
   * a handler of a request or of an advisory is given none. Absent: none.
   */
  observed?: readonly ObservationUse[] | undefined;
}

/** How the resolver of this name answers an address that is not this scope and incarnation (sections 2.3 and 7.4), or null. */
function routing(scope: ScopeState | null, to: unknown): RoutingRefusal | null {
  if (!scope) return "not-found";
  if (isScopeRef(to)) return to.scope !== scope.at.scope || to.kind !== scope.at.kind ? "not-found" : to.inc !== scope.at.inc ? "wrong-incarnation" : null;
  try {
    // A creation is addressed by a seed and names no incarnation.
    return scopeIdOf(to as Seed) === scope.at.scope ? null : "not-found";
  } catch {
    return "not-found";
  }
}

/**
 * Section 7.4, "What the receiver trusts at run time": the entry is the one
 * the fact names, and it holds that send, to that address, at that ordinal,
 * with that message digest.
 */
export function sentBy(entry: Entry, delivered: Delivered): boolean {
  try {
    const send = isEntryOf(entry, delivered.from) ? entry.sends.find((s) => s.n === delivered.n) : undefined;
    return !!send && same(send.to, delivered.to) && messageDigest(send.message) === messageDigest(delivered.message);
  } catch {
    return false; // Bytes that do not parse to canonical values.
  }
}

/** Section 7.3: one owner entry sends at most one update for each key: the target, the owner's item and the name. */
function oneUpdateForKey(source: Entry, from: FactRef, to: ScopeRef, name: string, item: number): boolean {
  const forKey = source.sends.filter((s) => {
    const update = s.message.class === "request" && isScopeRef(s.to) && s.to.scope === to.scope ? updateOf(s.message, from) : null;
    return update?.name === name && update.item.seq === item;
  });
  return forKey.length === 1;
}

/**
 * In a scope under a platform definition a handler, and a clause of a
 * result, may hold marks, and each rule is run at the check of its place,
 * as for an act (section 4.2). A fault of a rule leaves the delivery not
 * judged: transport answers `retry`, and nothing is written (section 6.1).
 */
export function judgeDelivery(view: StateView, definition: ValidDefinition, delivered: Delivered, context: DeliveryContext): Judgment {
  return unjudged(() => deliveryJudged(view, definition, delivered, context));
}

function deliveryJudged(view: StateView, definition: ValidDefinition, delivered: Delivered, context: DeliveryContext): Judgment {
  const unverified = (detail: string): Judgment => ({ result: "source-unverified", detail });
  const { clock } = context;
  const { from, n, message } = delivered;
  const scope = view.scope();

  // A wrong address is refused by the resolver of the name, before anything is read or recorded.
  const refusal = routing(scope, delivered.to);
  if (refusal || !scope) return { result: "routing", reason: refusal ?? "not-found" };

  // The source checks. They are immutable facts about the input (section 5.1).
  if (!isFactRef(from) || !isLocalId(n) || !isObject(message)) return unverified("not a delivery");
  if (!context.source) return { result: "unavailable", reason: "dependency-unavailable" };
  const source = context.source.entry;
  if (!sentBy(source, delivered)) return unverified("the source entry does not hold that send with that message");

  // A repeat is answered with the entry that recorded it, in any state of the scope: a creation request from the genesis.
  // A source scope has one entry at each sequence number, so another entry there is not from a valid history.
  const before = view.decided(from.at, from.seq, n);
  if (before) return before.hash === from.hash ? { result: "repeat", seq: before.by } : unverified("another entry of the source was recorded at that sequence number");

  // Section 5.2, step 6.3: an input that is not timed never passes a due transition.
  const next = nextDue(view, definition, clock.asOf);
  if (next) return { result: "due", next };

  if (message.class === "control") return confirmation(view, scope, delivered, message, source);
  if (message.class === "request" && message.type === "create") return unverified("this scope's genesis answered another creation request");
  // Section 7.2: a provisional scope admits its confirmation and a repeat of its creation request; a refused one only the repeat.
  if (scope.status === "provisional") return { result: "unavailable", reason: "scope-provisional" };
  if (scope.status === "refused") return { result: "refused", reason: "scope-refused", detail: "the scope's genesis was refused" };

  const use = useOf(from, source);
  /** Section 5.3: an entry that judges no time condition may be written clamped; one that does is `clock-behind`. */
  /** `read`: the foreign entries a clause read beside the source entry. Each fact is recorded once (section 9.2). */
  const write = (input: Extract<Judgment, { result: "write" }>["draft"]["input"], effects: readonly Effect[], sends: readonly Send[], prepared: readonly Prepared[], judgesTime: boolean, read: readonly FactUse[] = [], settles = false): Judgment =>
    (judgesTime && clock.behind ? { result: "unavailable", reason: "clock-behind" } : { result: "write", draft: { input, uses: [use, ...read.filter((u) => u.fact.hash !== from.hash)], prepared, effects, sends, judgesTime, settles } });
  /** Section 7.2: the cause of any scope this delivery's handler creates names this one delivery. */
  const cause = () => deliveryCauseDigest({ v: 1, from, n, message: messageDigest(message) });

  /** The input of the entry, whole, as a rule of a platform definition is given it (section 6.1). */
  const judged: JudgedInput = { type: "delivery", from, n, message };
  if (message.class === "result") return result(view, definition, context, scope, delivered, message, source, write, judged);

  /** What a handler reads of this delivery beside the message's fields: the verified source entry, and the update it applies, if it is one. */
  const sent: Sent = { source: { fact: from, entry: source, under: context.source.under }, update: message.class === "request" && message.type === "relate" ? updateOf(message, from) : null };

  if (message.class === "advisory") {
    // As the receiver's own definition says: a handler for its type, or a record with no effect. An advisory has no decision.
    const b = bound(definition, message, from);
    const ran: Handled | null = b?.handler && b.fields && under(b.handler, context.source) ? runHandler(view, definition, context, scope, b.handler, b.kind, b.fields, cause(), sent, judged) : null;
    if (ran?.result === "unavailable") return ran;
    // A handler that refuses leaves the entry with no effect. The entry still records each rule result its guards read, and each
    // foreign entry its fields named.
    const done = ran?.result === "ran" ? ran : { effects: [], sends: [], prepared: ran?.prepared ?? [], judgesTime: false };
    return write({ type: "delivery", from, n, message: message as Advisory }, done.effects, done.sends, done.prepared, done.judgesTime, ran?.uses);
  }
  if (message.class !== "request" || !isScopeRef(delivered.to)) return unverified("not a message of a class the contract defines");

  /**
   * Section 7.4: a verified request gets exactly one deciding entry, and that
   * entry sends exactly one result, which names the request by its source
   * fact and ordinal. The result follows the sends the handler declares.
   */
  const decide = (decision: "applied" | "refused" | "superseded", reason: Reason | undefined, effects: readonly Effect[] = [], sends: readonly Send[] = [], prepared: readonly Prepared[] = [], judgesTime = false, read: readonly FactUse[] = [], settles = false): Judgment => {
    const answer: Result = { class: "result", of: { from, n }, outcome: decision, ...(reason ? { reason } : {}) };
    return write({ type: "delivery", from, n, message: message as Request, decision, ...(reason ? { reason } : {}) }, effects, [...sends, { n: sends.length, to: from.at, message: answer }], prepared, judgesTime, read, settles);
  };
  const b = bound(definition, message, from);
  if (!b) return decide("refused", { code: "bad-field" });
  // Authority note, section 4.2, "A reserved license decision": the first decision of a bound request uses the entry that a standing
  // pin reserved for its number, whatever it decides. So its deciding entry is a settling entry. When it refuses, for any reason, the
  // entry holds one effect: the record whose `decided` is the request's number. A request that is not bound is as it was: new work.
  const reserved = message.type === "tell" ? reservedFor(view, definition, context, scope.at, from.at, b.kind, message.body) : null;
  const refuse = (reason: Reason, prepared: readonly Prepared[] = [], read: readonly FactUse[] = []): Judgment =>
    decide("refused", reason, reserved ? recordEffects(reserved.capability, [reserved.refused]) : [], [], prepared, false, read, reserved !== null);
  // Section 4.2: a request that names no handler of the definition, for a scope of the sender's kind and definition, is decided
  // `refused`. That holds for a relationship update too: a scope keeps a copy only for a relationship it declares a handler for.
  // An entry so decided has no kind (section 6.2): no handler of this definition received it.
  const handler = b.handler && under(b.handler, context.source) ? b.handler : null;
  if (!handler) return refuse({ code: "unknown-message" });
  const given = b.fields;
  if (!given) return refuse({ code: "bad-field" });

  const platform: Effect[] = [];
  let first = false;
  /** Section 17.3: the update takes a copy that awaits its settlement out of the states that its handler's `settles` lists. */
  let settlesCopy = false;
  if (message.type === "relate") {
    const update = updateOf(message, from)!;
    if (!oneUpdateForKey(source, from, delivered.to, update.name, update.item.seq)) return unverified("the source entry has two relate sends for one key");
    // Section 7.3: the copy is keyed by owner scope, owner incarnation, name and owner item. Its revision is the `seq` of the owner's entry,
    // and an update is applied only if its revision is higher than the one held.
    const held = view.relation(from.at, update.name, update.item.seq);
    if (held && from.seq <= held.revision) return decide("superseded", undefined);
    first = !held;
    const pending = handler.settles && "copy" in handler.settles ? handler.settles.copy : null;
    settlesCopy = !!pending && !!held && pending.includes(held.state) && !pending.includes(update.state);
    platform.push({ effect: "relation", owner: from.at, item: update.item.seq, name: update.name, state: update.state, revision: from.seq });
  }

  const ran = runHandler(view, definition, context, scope, handler, b.kind, given, cause(), sent, judged);
  if (ran.result === "unavailable") return ran;
  // A refusal, among them `duplicate-relation` for a handler whose sends hold two for one key: no effect and no send but the result.
  // The deciding entry records each rule result a guard read before the refusal, and each foreign entry the fields named (section 9.2).
  if (ran.result === "refused") return refuse(reasonOf(ran), ran.prepared, ran.uses);
  // Section 7.3: copies are bounded. The first update for a key beyond the number its handler states is refused, like an opening
  // past a type's `max`. An update for a key that is already held is never refused for that reason.
  if (first && view.copies(b.kind, from.at.kind) >= (handler.copies ?? 0)) return refuse({ code: "type-full" }, ran.prepared, ran.uses);
  // A refusal takes nothing out of a pending state, so it is new work (section 17.3). An applied update or message may settle.
  return decide("applied", undefined, [...platform, ...ran.effects], ran.sends, ran.prepared, ran.judgesTime, ran.uses, ran.settles || settlesCopy || reserved !== null);
}

/**
 * The pending record that reserved an entry for this `tell`, as the listed
 * capability that declares such requests answers (section 6.11, "Reserved
 * requests"): the capability, and the one record of a refusal. Null: no
 * listed capability declares a request of that message, the rules have no
 * code for the binding, or the request is not bound.
 */
function reservedFor(view: StateView, definition: ValidDefinition, context: DeliveryContext, at: ScopeRef, from: ScopeRef, message: string, body: unknown): { capability: CapabilityName; refused: Recorded } | null {
  const rules = context.capabilities;
  if (!rules?.bound || !isObject(body)) return null;
  for (const listed of definition.declared.capabilities) {
    const capability: CapabilityName = `${listed.name}@${listed.version}`;
    if (!declaredBy(capability)?.reserved.some((r) => r.request.class === "tell" && r.request.message === message)) continue;
    const refused = rules.bound(capability, view, at, from, body["fields"]);
    if (refused) return { capability, refused };
  }
  return null;
}

/** The reason an entry records for a refusal: the code, and the name when the failed guard declares one (section 4.2). */
export const reasonOf = (refused: { reason: Reason["code"]; name?: string }): Reason => ({ code: refused.reason, ...(refused.name === undefined ? {} : { name: refused.name }) });

/** A handler may name the definition its sender must pin (section 6.4). */
const under = (handler: { from: { under?: string } }, source: Source): boolean => handler.from.under === undefined || handler.from.under === source.under;

/**
 * Section 7.2: a confirmation is admitted only when its envelope's source is
 * the creator the seed names, the source entry is a delivery of the applied
 * result of the creation request, sent by this scope's genesis, and the
 * control names this genesis. Any other is `source-unverified`. The entry
 * activates the scope and judges no time. It opens attempt 1 of each
 * operation that the genesis holds (section 4.3, item 1).
 */
function confirmation(view: StateView, scope: ScopeState, { from, n }: Delivered, message: Control, source: Entry): Judgment {
  const genesis: FactRef = { at: scope.at, seq: 0, hash: scope.genesis.hash };
  const recorded = source.input;
  const admitted = message.type === "confirm" && scope.status === "provisional" && scope.creator !== null && scope.genesis.source !== null
    && from.at.scope === scope.creator.scope && from.at.inc === scope.creator.inc
    && recorded.type === "delivery" && "clause" in recorded && recorded.clause === "applied"
    && same(recorded.message.of, { from: scope.genesis.source, n: scope.genesis.n }) && same(recorded.from, genesis)
    && same(message.genesis, genesis);
  if (!admitted) return { result: "source-unverified", detail: "not the creator's confirmation of this genesis" };
  return { result: "write", draft: { input: { type: "delivery", from, n, message }, uses: [useOf(from, source)], prepared: [], effects: [{ effect: "activate" }, ...heldOpenings(view)], sends: [], judgesTime: false } };
}

/**
 * Section 7.4, "What the sender does with a result". It is admitted only
 * when its `of` names one of this scope's own request sends; its envelope's
 * source is that request's target, or for a creation the scope whose ID is
 * the seed's digest; and the source entry is the entry that decided that
 * request. It runs the matching clause of the send.
 */
function result(view: StateView, definition: ValidDefinition, context: DeliveryContext, scope: ScopeState, { from, n }: Delivered, message: Result, source: Entry,
  write: (input: { type: "delivery"; from: FactRef; n: number; message: Result; clause: Exclude<Clause, "undelivered">; observed?: readonly ObservationUse[] }, effects: readonly Effect[], sends: readonly Send[], prepared: readonly Prepared[], judgesTime: boolean, read: readonly FactUse[]) => Judgment,
  judged: JudgedInput): Judgment {
  const unverified = (detail: string): Judgment => ({ result: "source-unverified", detail });
  const of = message.of;
  const request = isObject(of) && isFactRef(of.from) && isLocalId(of.n) && same(of.from.at, scope.at) ? view.request(of.from.seq, of.n) : null;
  if (!request || request.hash !== of.from.hash) return unverified("the result names no request send of this scope");
  const target = isScopeRef(request.to) ? from.at.scope === request.to.scope && from.at.inc === request.to.inc : from.at.scope === scopeIdOf(request.to) && from.at.kind === request.to.kind;
  if (!target) return unverified("the source is not the scope and incarnation the request addressed");
  const decided = source.input;
  const deciding = decided.type === "delivery" ? "decision" in decided && decided.decision === message.outcome && same(decided.from, of.from) && decided.n === of.n
    : decided.type === "genesis" && request.type === "create" && decided.decision === message.outcome && decided.source !== null && same(decided.source, of.from) && decided.n === of.n;
  if (!deciding) return unverified("the source entry is not the entry that decided the request");

  // An `undelivered` finding is terminal, and a request has one result: a later answer adds nothing.
  if (request.diagnosis?.finding === "undelivered") return { result: "repeat", seq: request.diagnosis.seq };
  let clause: Exclude<Clause, "undelivered"> = message.outcome;
  if (request.result) {
    // Section 7.2: an applied creation result that carries another incarnation than the one held for that seed is a conflict.
    const held = isScopeRef(request.to) ? null : view.creation(seedDigest(request.to));
    if (!held || message.outcome !== "applied" || held.inc === from.at.inc) return { result: "repeat", seq: request.result.seq };
    clause = "conflict";
  }
  // Sections 4.1 and 16.1: a rule of the clause reads a further observation, in platform data, and what it reads is noted.
  const beside = context.observed === undefined ? undefined : atHand(context.observed, undefined);
  const ran = runClause(view, definition, context, scope, request, clause, { sender: from.at, ...(message.reason ? { reason: message.reason } : {}), source: { fact: from, entry: source, under: context.source!.under } }, judged, beside);
  if (ran.result === "unavailable") return ran;
  // Section 7.2: the creator confirms the incarnation of the first applied result it records, and no other.
  const confirm: Send[] = clause === "applied" && request.type === "create" ? [{ n: 0, to: from.at, message: { class: "control", type: "confirm", genesis: from } }] : [];
  // Section 4.1: the entry holds each observation that a rule of its clause read, in ascending order of `read.n`, and no member
  // when none was read. Section 16.1: an entry that retains one judges time, and is never written clamped.
  const retained = retainedOf(beside).observed;
  return write({ type: "delivery", from, n, message, clause, ...(retained.length > 0 ? { observed: retained } : {}) }, ran.effects, confirm, [], ran.judgesTime || retained.length > 0, ran.uses);
}

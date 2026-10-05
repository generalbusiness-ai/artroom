/**
 * The judges: from the state, one input, its retained inputs and one clock
 * reading to the entry that input writes, or to the answer it gets instead
 * (scope contract, sections 4.2, 5.2, 5.3 and 6.4). The runtime calls a judge
 * inside the commit's transaction; a verifier calls the same judge over the
 * folded state and compares what it derives with what the entry records.
 *
 * This file holds the judges of an act and of a timed transition, and what
 * every judge returns. `genesis.ts`, `delivery.ts` and `settle.ts` hold the
 * others. Each builds a `Judging`, derives the written forms with `derive`
 * or `deriveEffects`, and returns a `Draft`.
 */

import type { Effect, Entry, FactRef, FactUse, Grant, GrantMark, Head, Input, MismatchReason, ObservationUse, Prepared, RefusalReason, RoutingRefusal, ScopeRef, Send, SignedIntent, UnavailableReason } from "@generalbusiness/artroom-contract";
import { intentDigest, scopeIdOf, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import type { Signer } from "./attribution.ts";
import { deriveEffects } from "./effects.ts";
import { isIntent, presentedTypes, readFacts, readFields, type Reading } from "./fields.ts";
import { covers } from "./grant.ts";
import type { Judging } from "./guards.ts";
import { alsoItems, derive, giving } from "./handlers.ts";
import { actionOf, atHand, fieldOutsideType, grantByRule, markOf, retainedOf, selectedBy, unjudged, type JudgedInput, type ValueRead } from "./marks.ts";
import type { Item, StateView } from "./state.ts";
import { nextDue, type Due } from "./timed.ts";
import { timeMs, type Clock } from "./time.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { own, same } from "./values.ts";

/**
 * A grant that an act may be judged on, with whether it is current (section
 * 5.1, held authority). `current` is decided in the commit, on the commit's
 * reading, from what was read about the signer before the turn. The judge
 * is given the answer. It reads nothing, and it asks no port.
 */
export interface Presented { grant: Grant; current: boolean }

export interface JudgeContext extends Reading {
  /**
   * What was read about the signer's authority before the turn, as the
   * commit decided it: each grant the act may be judged on. Null: nothing
   * was read that this commit can judge on. An act that reaches check 9 of
   * section 4.2 is then not judged: `authority-unavailable` (section 16.1).
   * A verifier gives the one grant that the entry records, which retains
   * what was read (section 9.3).
   */
  grants: readonly Presented[] | null;
  /**
   * This scope's own membership reference, with its incarnation, as the
   * scope records it: a function of its genesis entry (section 6.6). A
   * grant whose `within` is a filter covers this scope exactly when the
   * filter names this reference (section 16.1). The runtime gives the
   * reference that its authority port read from. A verifier reads the
   * genesis (`membershipOf`). Absent or null: the scope records none, and
   * only a grant that names this scope covers it.
   */
  membership?: ScopeRef | null | undefined;
  /** The facts presented beside the intent, by name, as they arrived (section 6.4). They are not signed. */
  presented?: Readonly<Record<string, unknown>> | undefined;
  /**
   * The further observations at hand for this act (sections 4.1 and 16.1):
   * what the scope read before the turn, of another key, of a member or of
   * the rules, each judged by the guards of an observation before the judge
   * is given it. A verifier gives the records of the entry's own `observed`.
   * Only a rule of a platform definition reads one, and the entry retains
   * exactly those that its rules read. Absent: none is at hand.
   */
  observed?: readonly ObservationUse[] | undefined;
  /**
   * The values that came beside the intent (section 6.2, "A value beside an
   * intent"), each as its canonical bytes. They are not signed. Only a rule
   * of a platform definition reads one, by its domain and its digest, and
   * the scope keeps exactly those that a rule read. Absent: none came.
   */
  values?: readonly string[] | undefined;
}

/** What a judged input writes. `seq`, `prev` and `time` are allocated when it is sealed; see `entryOf`. */
export interface Draft {
  input: Input;
  uses: readonly FactUse[];
  prepared: readonly Prepared[];
  effects: readonly Effect[];
  sends: readonly Send[];
  /** It judges an expiry, a freshness or a deadline, so it is never written while the clock is behind (section 5.3). */
  judgesTime: boolean;
  /**
   * Section 6.2, "Retention": each value beside the intent that a rule of
   * the entry read, by its domain and its digest, with its canonical bytes.
   * The scope keeps each as one retained input, with the entry. It is in no
   * entry: the entry holds the digest in a field of its intent. Absent: the
   * rules read none.
   */
  values?: readonly ValueRead[];
  /**
   * Section 17.3: the entry settles what its form declares with `settles`.
   * Its subject was in a listed state at the commit, and the entry takes it
   * out of the listed states. It is then admitted against its own duty's
   * reservation, and is not asked whether it fits. It is in no entry.
   */
  settles?: boolean;
}

/** `name`: the reason the failed guard declares, if it declares one. `detail` is for the caller and is in no entry. */
export type Refused = { result: "refused"; reason: RefusalReason; name?: string; detail: string; judgedAt: Head };

export type ActJudgment =
  | { result: "write"; draft: Draft }
  | Refused
  | { result: "unavailable"; reason: UnavailableReason }
  | { result: "mismatch"; reason: MismatchReason }
  | { result: "accepted-before"; seq: number }   // the same intent is already sealed in that entry
  | { result: "due"; next: Due };                // section 5.2, step 6.3: nothing is written; the drain runs first

export type TimedJudgment =
  | { result: "write"; draft: Draft }
  | { result: "dropped"; failed: "held" | "reached" | "next" }   // which of the three checks of step 6.3 failed
  | { result: "unavailable"; reason: "clock-behind" };

/**
 * What the judge of a genesis, a delivery, a diagnosis, an outcome or a
 * checkpoint answers. Only `write` records anything.
 */
export type Judgment =
  | { result: "write"; draft: Draft }
  | { result: "source-unverified"; detail: string }               // a source check failed (sections 7.2 and 7.4)
  | { result: "unavailable"; reason: UnavailableReason }          // not decided; offered again. For a delivery, transport answers "retry"
  | { result: "repeat"; seq: number }                             // already recorded, by that entry; nothing is added
  | { result: "due"; next: Due }                                  // section 5.2, step 6.3: the drain runs first
  | { result: "routing"; reason: RoutingRefusal }                 // a delivery addressed to another scope or incarnation (section 7.4)
  | { result: "refused"; reason: RefusalReason; detail: string }; // not an input this scope can ever write

/**
 * The judge of an act, by the checks of section 4.2 in their order. In a
 * scope under a platform definition a row may hold marks, and each rule is
 * run at the check of its mark's place: a field's type at 7, a name of
 * `also` at 8, the grant at 9, a guard at 10, an effect and a slot's type
 * at 11, a send at 12. No rule is run before check 7. A fault of a rule leaves the act not
 * judged: `unavailable`, and nothing is written (section 6.1).
 */
export function judgeAct(view: StateView, definition: ValidDefinition, signed: SignedIntent, context: JudgeContext): ActJudgment {
  return unjudged(() => actJudged(view, definition, signed, context));
}

function actJudged(view: StateView, definition: ValidDefinition, signed: SignedIntent, context: JudgeContext): ActJudgment {
  const scope = view.scope();
  if (!scope) return { result: "unavailable", reason: "unavailable" };
  const refused = (reason: RefusalReason, detail: string): Refused => ({ result: "refused", reason, detail, judgedAt: scope.head });
  const { clock, bounds } = context;
  const { declared } = definition;

  // The signature and the shape are immutable facts about the input (section 5.1). A verifier needs them judged here too.
  if (!verifySignedIntent(signed) || !isIntent(signed.intent)) return refused("bad-intent", "not a signed intent");
  const intent = signed.intent;

  // Addressing (section 2.1).
  if (!intent.to || !same(intent.to, scope.at)) return refused("misaddressed", "to");

  // Section 4.2: the key belongs to the first sealed intent of this actor, for the life of the scope. So the exact retry
  // of an accepted intent is answered with its entry at any time, also after its `notAfter`.
  const digest = intentDigest(intent);
  const earlier = view.accepted(intent.actor, intent.idempotencyKey);
  if (earlier) return earlier.intent === digest ? { result: "accepted-before", seq: earlier.seq } : { result: "mismatch", reason: "idempotency-mismatch" };

  // Lifetime (sections 2.1 and 4.2). An intent stops being admissible at its `notAfter`.
  const asOf = timeMs(clock.asOf)!;
  const notAfter = timeMs(intent.notAfter)!;
  if (asOf >= notAfter) return refused("expired", "notAfter");
  if (notAfter - asOf > bounds.intentLifetimeSeconds * 1000) return refused("bad-intent", "notAfter is further ahead than an intent may live");

  // Section 5.2, step 6.3: an input that is not timed never passes a due transition.
  const next = nextDue(view, definition, clock.asOf);
  if (next) return { result: "due", next };

  // Section 7.2: a provisional scope admits no act; a refused one admits nothing, ever.
  if (scope.status === "provisional") return { result: "unavailable", reason: "scope-provisional" };
  if (scope.status === "refused") return refused("scope-refused", "the scope's genesis was refused");

  const act = own(declared.acts, intent.kind);
  if (!act || intent.kind === declared.genesis) return refused("unknown-act", intent.kind);

  const read = readFields(act.fields, intent.fields, bounds);
  if (!read.ok) return refused("bad-field", read.detail);
  // Section 6.2: a fact that names this scope is a local fact. It is checked against this scope's own entry, and is then its `seq`.
  const local = { at: scope.at, own: context.own, texts: context.texts };
  const named = readFacts(view, act.fields, read.fields, context.facts, local);
  if (named.result === "unavailable") return { result: "unavailable", reason: "dependency-unavailable" };
  if (named.result !== "read") return refused(named.result, named.detail);
  const { fields } = named;
  // Section 6.4: the facts presented beside the intent. Each is one the act declares, is read like a fact field, and is retained
  // in `uses`. What binds it to the intent is a guard that the definition writes. The entry records which were presented.
  const presents = presentedTypes(act.presents);
  const shown = readFields(presents, context.presented ?? {}, bounds);
  if (!shown.ok) return refused("bad-field", `presented: ${shown.detail}`);
  const shownFacts = readFacts(view, presents, shown.fields, context.facts, local);
  if (shownFacts.result === "unavailable") return { result: "unavailable", reason: "dependency-unavailable" };
  if (shownFacts.result !== "read") return refused(shownFacts.result, `presented: ${shownFacts.detail}`);
  const facts = new Map([...named.facts, ...shownFacts.facts]);
  const uses = [...named.uses, ...shownFacts.uses.filter((use) => !named.facts.has(use.fact.hash))];
  if (uses.length > bounds.usesPerEntry) return refused("bad-field", `more than ${bounds.usesPerEntry} foreign entries`);
  // Platform data: what a rule of this row is given (section 6.1). The input is the act as it arrived. No grant is judged yet.
  const clocked = { clock: false };
  const judged: JudgedInput = { type: "act", signed, grant: null, presented: context.presented ?? {} };
  // Sections 4.1 and 6.2: the further observations and the values at hand, which only a rule reads. What a rule reads of them is noted.
  const beside = context.observed === undefined && context.values === undefined ? undefined : atHand(context.observed, context.values);
  const g = { ...giving(view, context, scope, scope.head.seq + 1, judged, clocked, fields, facts), beside };
  // Check 7: a field whose type is a mark is checked by the mark's rule.
  const outside = fieldOutsideType(g, act.fields);
  if (outside) return refused("bad-field", `${outside} is not a value of its type`);

  // Section 6.4: `on` and each `also` name are resolved to local items before any guard or effect.
  const subjects = new Map<string, Item>();
  const expects: string[] = [];
  if (act.step === "open" || act.on === null) {
    if (intent.on !== null) return refused("bad-intent", "this act names no item in `on`");
  } else {
    const item = intent.on === null ? null : view.item(intent.on);
    if (item?.type !== act.on) return refused("no-item", `on names no ${act.on}`);
    subjects.set("on", item);
    if (act.step === "transition") expects.push("on");
  }
  // An `also` name is unbound when its field is absent, its slot is empty or its type has no item yet. It is then no subject, and
  // `expected` has no key for it. A transition's primary item exists before the entry, so a `via` may read its slots.
  // Check 8: a name of `also` that a mark selects is resolved by the mark's rule, which gives one item or none. The signer named
  // no item, so such a name has no key in `expected`. The rule on aliases holds for it.
  const also = alsoItems(view, definition, act.also, fields, act.step === "transition" ? (subjects.get("on") ?? null) : null, undefined, (mark, bound) => selectedBy({ ...g, subjects: bound }, mark));
  if (!also.ok) return refused("no-item", also.detail);
  for (const [name, item] of also.items) {
    subjects.set(`also.${name}`, item);
    if (!also.marked.has(name)) expects.push(name);
  }
  // No aliases: each subject is one distinct item, so its expected revision is checked once and it rises once.
  if (new Set([...subjects.values()].map((i) => i.id)).size !== subjects.size) return refused("alias", "two names resolve to one item");
  if (Object.keys(intent.expected).length !== expects.length || expects.some((k) => !Object.hasOwn(intent.expected, k))) return refused("bad-intent", `expected has one key for each of: ${expects.join(", ")}`);
  for (const key of expects) {
    const item = subjects.get(key === "on" ? "on" : `also.${key}`)!;
    if (own(intent.expected, key) !== item.revision) return refused("revision-moved", `${key} is at revision ${item.revision}`);
  }
  // Section 6.3: an item in a final state refuses every transition. Comments are still allowed.
  const primary = subjects.get("on");
  if (act.step === "transition" && primary && own(own(declared.items, primary.type)!.states, primary.state)?.final) return refused("final", `item ${primary.id} is ${primary.state}`);

  // Section 4.2, check 9. Section 6.4: every act of a declared definition needs a current grant for its `grant` action. In platform data the `grant` of a
  // row may be a mark: its rule stands in place of the grant check. A mark may state an action as well, and then check 9 is made
  // as written first: when a current grant of that action is held for the signing key the check holds, the entry records that
  // grant, and the rule is not run.
  const mark = markOf(act.grant) as GrantMark | null;
  const action = actionOf(act);
  // The first presented grant that qualifies is the one recorded. Section 16.1: a grant's `within` covers this scope when it names
  // it, or when it is a filter whose `membership` is the membership reference that this scope records.
  const presented = action === null ? undefined : context.grants?.find(({ grant, current }) =>
    current && grant.key === intent.actor && grant.actions.includes(action) && covers(grant.within, scope.at, context.membership ?? null)
    && (grant.notAfter === null || asOf < (timeMs(grant.notAfter) ?? -Infinity)));
  let signer: Signer | null;
  if (presented) signer = { member: presented.grant.subject, principal: presented.grant.principal };
  else if (!mark) {
    // Nothing was read about this signer that the commit can judge on: the act is not judged, and nothing above this line was hidden
    // by that. Section 16.1: no judgment rests on a read that was not made, or on one that was discarded.
    if (context.grants === null) return { result: "unavailable", reason: "authority-unavailable" };
    return refused("unauthorized", `no current grant of ${act.grant} to this key in this scope`);
  } else {
    // The rule checks the authority that the specification of its version names, and nothing less. It passes the signing key, with
    // the member that the act's forms read as the signer, or none: the entry then records an empty `authority`. Or it does not,
    // and the act is refused `unauthorized`, with the name that the rule states.
    const answer = grantByRule({ ...g, subjects }, mark);
    if (!answer.pass) {
      // A mark that states an action: with nothing read about the signer, an act that the rule does not pass is not judged. A row
      // whose mark states none reads no observation, so it is never answered so.
      if (action !== null && context.grants === null) return { result: "unavailable", reason: "authority-unavailable" };
      return { ...refused("unauthorized", `the rule ${mark.code} does not pass this key`), ...(answer.name === undefined ? {} : { name: answer.name }) };
    }
    signer = answer.member && { member: answer.member, principal: null };
  }
  const granted = presented?.grant ?? null;

  const j: Judging = {
    view, definition, bounds, clock, scope, self: scope.head.seq + 1, kind: intent.kind, fields, fieldTypes: act.fields, subjects, signer, facts, prepared: context.prepared, used: [], asked: context.asked,
    own: context.own, intent: digest, presented: shownFacts.fields, capabilities: context.capabilities,
    platform: context.platform, judged: { ...judged, grant: granted }, ran: clocked, beside,
  };

  // Guards, then effects, then sends, then the bound on the type it opens, as for a handler. The cause of a scope it creates is the intent's digest.
  const ran = derive(j, act, act.step === "open" ? act.on : null, digest);
  if (ran.result === "unavailable") return ran;
  if (ran.result === "refused") return { ...refused(ran.reason, ran.detail), ...(ran.name === undefined ? {} : { name: ran.name }) };

  // Section 5.3: every act judges its `notAfter` and its grant's expiry on the commit clock, so no act is written while the clock is behind.
  if (clock.behind) return { result: "unavailable", reason: "clock-behind" };
  // The entry records each presented fact as it arrived: a whole fact reference, also for an entry of this scope.
  // Section 4.2: the entry records the one grant judged. An act that the rule of a mark at `grant` passed records none.
  // Section 4.1, "An input may retain observations": the entry holds each further observation that a rule of its row read, in
  // ascending order of `read.n`, and the member is left out when it retains none. Section 6.2: a value that a rule read is kept
  // with the entry, and is in no entry.
  const retained = retainedOf(beside);
  const input = { type: "act", signed, authority: granted ? [granted] : [], presented: shown.fields as Record<string, FactRef>, ...(retained.observed.length > 0 ? { observed: retained.observed } : {}) } as const;
  return { result: "write", draft: { input, uses, prepared: ran.prepared, effects: ran.effects, sends: ran.sends, judgesTime: true, settles: ran.settles, ...(retained.values.length > 0 ? { values: retained.values } : {}) } };
}

/**
 * The selected timed transition (section 5.2, step 6.3). It is written only
 * when all three checks hold: its item still holds that deadline under that
 * rule; the reading is not earlier than the deadline; and no transition
 * earlier in the order is due. Others may be due later in the order; they
 * stay due. A timed entry judges time, so it is never clamped (section 5.3).
 *
 * `capabilities`: the rules that derive what a hold's expiry does to its
 * workspace (authority note, section 5.7, the row "Expiry"). A timed entry
 * has no signer, and these effects need none. A timed rule writes no
 * capability form, so nothing else of the rules is asked.
 */
export function judgeTimed(view: StateView, definition: ValidDefinition, selected: Due, context: Pick<JudgeContext, "clock" | "bounds" | "capabilities">): TimedJudgment {
  const { clock, bounds } = context;
  const scope = view.scope();
  const rule = own(definition.declared.timed, selected.rule);
  const item = view.item(selected.item);
  if (!scope || !rule || !item || item.type !== rule.on || !rule.states.includes(item.state) || own(item.values, rule.deadline) !== selected.due) return { result: "dropped", failed: "held" };
  if (clock.behind) return { result: "unavailable", reason: "clock-behind" };
  if (timeMs(clock.reading)! < timeMs(selected.due)!) return { result: "dropped", failed: "reached" };
  const next = nextDue(view, definition, clock.reading);
  if (next?.item !== selected.item || next.rule !== selected.rule) return { result: "dropped", failed: "next" };

  const j: Judging = { view, definition, bounds, clock, scope, self: scope.head.seq + 1, kind: selected.rule, fields: {}, fieldTypes: {}, subjects: new Map([["on", item]]), signer: null, facts: new Map(), prepared: [], used: [], capabilities: context.capabilities };
  const effects = deriveEffects(j, rule.effects, rule.attention, null);
  // Section 6.4: a timed rule's effects are total. The validator refuses, as `timed-partial`, a rule with an effect that could be
  // refused here, and requires one that takes the item out of the rule's states. So a selection that passes its three checks is
  // written, and its item is not due again under this rule: the drain makes progress. A refusal here is a fault of the validator,
  // and is never answered by passing over the due item.
  if (!effects.ok) throw new Error(`timed rule ${selected.rule} cannot apply: ${"unavailable" in effects ? effects.unavailable : effects.reason}`);
  return { result: "write", draft: { input: { type: "timed", item: selected.item, rule: selected.rule, due: selected.due }, uses: [], prepared: [], effects: effects.effects, sends: [], judgesTime: true } };
}

/**
 * The entry a draft becomes at this head and this reading (section 5.3): the
 * reading is its time, or, when the clock is behind, the previous entry's
 * time with `clamped: true`. A genesis draft becomes entry 0 of the scope its
 * seed and incarnation name. The hash is computed afterwards, over these
 * bytes.
 */
export function entryOf(view: StateView, draft: Draft, clock: Clock): Entry {
  const scope = view.scope();
  const input = draft.input;
  if ((scope === null) !== (input.type === "genesis")) throw new Error("a scope's first entry is its genesis, and it has one");
  if (clock.behind && draft.judgesTime) throw new Error("an entry that judges time is not written while the clock is behind");
  const at: ScopeRef = scope?.at ?? (input.type === "genesis" ? { scope: scopeIdOf(input.seed), inc: input.inc, kind: input.seed.kind } : null as never);
  return {
    v: 1, at, seq: scope ? scope.head.seq + 1 : 0, prev: scope ? scope.head.hash : null, time: clock.asOf, clamped: clock.behind, epoch: 0,
    input, uses: draft.uses, prepared: draft.prepared, effects: draft.effects, sends: draft.sends,
  };
}

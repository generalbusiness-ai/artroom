/**
 * The judges: from the state, one input, its retained inputs and one clock
 * reading to the entry that input writes, or to the answer it gets instead
 * (scope contract, sections 4.2, 5.2, 5.3 and 6.4). The runtime calls a judge
 * inside the commit's transaction; a verifier calls the same judge over the
 * folded state and compares what it derives with what the entry records.
 *
 * This file holds the judges of an act and of a timed transition. Genesis,
 * deliveries, diagnoses, outcomes and checkpoints are judged by functions of
 * the same shape: they build a `Judging`, derive with `judgeGuard`,
 * `deriveEffects` and `deriveSends`, and return a `Draft`.
 */

import type { Bounds, Digest, Effect, Entry, FactRef, FactUse, FieldType, FieldValue, Grant, Head, Input, Intent, MismatchReason, Prepared, RefusalReason, Send, SignedIntent, UnavailableReason } from "@generalbusiness/artroom-contract";
import { canonicalBytes, digestBytes, entryHash, intentDigest, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { deriveEffects } from "./effects.ts";
import { judgeGuard, type Fetched, type Judging } from "./guards.ts";
import { deriveSends } from "./sends.ts";
import type { Item, StateView } from "./state.ts";
import { nextDue, type Due } from "./timed.ts";
import { timeMs, type Clock } from "./time.ts";
import type { ValidDefinition } from "./validate.ts";
import { byteOrder, isLocalId, isObject, isScopeRef, isValue, same } from "./values.ts";

/** A grant as presented, with the authority port's verdict on whether it is current (section 5.1, held authority). */
export interface Presented { grant: Grant; current: boolean }

export interface JudgeContext {
  clock: Clock;                         // the one reading of this commit (section 5.3); see `clockOf`
  grants: readonly Presented[];
  facts: readonly Fetched[];            // fetched before the turn; each entry's bytes already checked against its hash
  prepared: readonly Prepared[];        // the rule results of preparation (section 5.2, step 5)
  bounds: Bounds;
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
}

export type Refused = { result: "refused"; reason: RefusalReason; detail: string; judgedAt: Head };

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

/** The shape of section 2.1. A valid signature over some other shape is not an intent. */
function isIntent(v: unknown): v is Intent {
  return isObject(v) && Object.keys(v).length === 9 && v["v"] === 1 && (v["to"] === null || isScopeRef(v["to"])) && typeof v["actor"] === "string" && typeof v["kind"] === "string"
    && (v["on"] === null || isLocalId(v["on"])) && isObject(v["expected"]) && Object.values(v["expected"]).every(isLocalId) && isObject(v["fields"])
    && typeof v["idempotencyKey"] === "string" && timeMs(v["notAfter"]) !== null;
}

/** Each value in a field with the type it must have: the field itself, or each element of a list. */
function leaves(type: FieldType, value: FieldValue): [FieldType, FieldValue][] {
  return type.type === "list" ? (value as readonly FieldValue[]).flatMap((v) => leaves(type.of, v)) : [[type, value]];
}

export function judgeAct(view: StateView, definition: ValidDefinition, signed: SignedIntent, context: JudgeContext): ActJudgment {
  const scope = view.scope();
  if (!scope) return { result: "unavailable", reason: "unavailable" };
  const refused = (reason: RefusalReason, detail: string): Refused => ({ result: "refused", reason, detail, judgedAt: scope.head });
  const { clock, bounds } = context;
  const { declared } = definition;

  // The signature and the shape are immutable facts about the input (section 5.1). A verifier needs them judged here too.
  if (!verifySignedIntent(signed) || !isIntent(signed.intent)) return refused("bad-intent", "not a signed intent");
  const intent = signed.intent;

  // Addressing and lifetime (sections 2.1 and 4.2). An intent stops being admissible at its `notAfter`.
  if (!intent.to || !same(intent.to, scope.at)) return refused("misaddressed", "to");
  const asOf = timeMs(clock.asOf)!;
  const notAfter = timeMs(intent.notAfter)!;
  if (asOf >= notAfter) return refused("expired", "notAfter");
  if (notAfter - asOf > bounds.intentLifetimeSeconds * 1000) return refused("bad-intent", "notAfter is further ahead than an intent may live");

  // Section 4.2: the key belongs to the first sealed intent of this actor, for the life of the scope.
  const digest = intentDigest(intent);
  const earlier = view.accepted(intent.actor, intent.idempotencyKey);
  if (earlier) return earlier.intent === digest ? { result: "accepted-before", seq: earlier.seq } : { result: "mismatch", reason: "idempotency-mismatch" };

  // Section 5.2, step 6.3: an input that is not timed never passes a due transition.
  const next = nextDue(view, definition, clock.asOf);
  if (next) return { result: "due", next };

  // Section 7.2: a provisional scope admits no act; a refused one admits nothing, ever.
  if (scope.status === "provisional") return { result: "unavailable", reason: "scope-provisional" };
  if (scope.status === "refused") return refused("scope-refused", "the scope's genesis was refused");

  const act = Object.hasOwn(declared.acts, intent.kind) ? declared.acts[intent.kind] : undefined;
  if (!act || intent.kind === declared.genesis) return refused("unknown-act", intent.kind);

  // Section 6.2: each field is required or optional, an optional field may have a default, and an unknown field is refused.
  const fields: Record<string, FieldValue> = {};
  for (const name of Object.keys(intent.fields)) if (!Object.hasOwn(act.fields, name)) return refused("bad-field", `${name} is not a field of ${intent.kind}`);
  for (const [name, type] of Object.entries(act.fields)) {
    const value = Object.hasOwn(intent.fields, name) ? intent.fields[name] : type.default;
    if (value === undefined && type.required) return refused("bad-field", `${name} is required`);
    if (value === undefined) continue;
    if (!isValue(type, value, bounds)) return refused("bad-field", `${name} is not a value of its type`);
    fields[name] = value;
  }
  // What the fields name: local items, which must exist, and foreign facts, which must have been fetched.
  const facts = new Map<Digest, Fetched>();
  const uses: FactUse[] = [];
  for (const name of Object.keys(fields).sort(byteOrder)) {
    for (const [type, value] of leaves(act.fields[name]!, fields[name]!)) {
      if (type.type === "item" && view.item(value as number)?.type !== type.of) return refused("no-item", `${name} names no ${type.of}`);
      if (type.type !== "fact" || facts.has((value as FactRef).hash)) continue;
      const ref = value as FactRef;
      const fetched = context.facts.find((f) => f.fact.hash === ref.hash);
      // Section 5.2, step 1: a foreign entry that was not fetched, or is not the entry the reference names, is a dependency that is not available.
      if (!fetched || fetched.entry.seq !== ref.seq || !same(fetched.entry.at, ref.at) || entryHash(fetched.entry) !== ref.hash) return { result: "unavailable", reason: "dependency-unavailable" };
      facts.set(ref.hash, fetched);
      uses.push({ fact: ref, content: digestBytes(canonicalBytes(fetched.entry)) });
    }
  }
  if (uses.length > bounds.usesPerEntry) return refused("bad-field", `more than ${bounds.usesPerEntry} foreign entries`);

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
  for (const [name, also] of Object.entries(act.also)) {
    const id = fields[also.by];
    const item = typeof id === "number" ? view.item(id) : null;
    if (item?.type !== also.item) return refused("no-item", `${also.by} names no ${also.item}`);
    subjects.set(`also.${name}`, item);
    expects.push(name);
  }
  // No aliases: each subject is one distinct item, so its expected revision is checked once and it rises once.
  if (new Set([...subjects.values()].map((i) => i.id)).size !== subjects.size) return refused("alias", "two names resolve to one item");
  if (Object.keys(intent.expected).length !== expects.length || expects.some((k) => !Object.hasOwn(intent.expected, k))) return refused("bad-intent", `expected has one key for each of: ${expects.join(", ")}`);
  for (const key of expects) {
    const item = subjects.get(key === "on" ? "on" : `also.${key}`)!;
    if (intent.expected[key] !== item.revision) return refused("revision-moved", `${key} is at revision ${item.revision}`);
  }
  // Section 6.3: an item in a final state refuses every transition. Comments are still allowed.
  const primary = subjects.get("on");
  if (act.step === "transition" && primary && declared.items[primary.type]!.states[primary.state]?.final) return refused("final", `item ${primary.id} is ${primary.state}`);

  // Section 6.4: every act needs a current grant for its `grant` action. The first presented grant that qualifies is the one recorded.
  const presented = context.grants.find(({ grant, current }) =>
    current && grant.key === intent.actor && grant.actions.includes(act.grant)
    // A grant that names several scopes by a filter is the authority note's; here a grant covers the one scope it names.
    && isScopeRef(grant.within) && grant.within.scope === scope.at.scope && grant.within.inc === scope.at.inc
    && (grant.notAfter === null || asOf < (timeMs(grant.notAfter) ?? -Infinity)));
  if (!presented) return refused("unauthorized", `no current grant of ${act.grant} to this key in this scope`);
  const signer = { member: presented.grant.subject, principal: presented.grant.principal };

  const j: Judging = { view, definition, bounds, clock, scope, self: scope.head.seq + 1, kind: intent.kind, fields, fieldTypes: act.fields, subjects, signer, facts, prepared: context.prepared };

  for (const [i, guard] of act.guards.entries()) {
    const result = judgeGuard(j, guard);
    if (result === "fail") return refused("guard-failed", `guards.${i}`);
    if (result !== "pass") return { result: "unavailable", reason: result };
  }
  const prepared = act.guards.flatMap((g) => ("rule" in g ? context.prepared.filter((p) => p.rule === g.rule).slice(0, 1) : []));

  const effects = deriveEffects(j, act.effects, act.attention, act.step === "open" ? act.on : null);
  if (!effects.ok) return refused(effects.reason, effects.detail);
  const sends = deriveSends(j, act.sends, effects.working, digest);
  if (!sends.ok) return refused(sends.reason, sends.detail);

  if (act.step === "open" && act.on !== null) {
    // Section 6.3: `max` bounds the live items of a type; an opening that would exceed it is refused.
    const type = declared.items[act.on]!;
    const live = Object.entries(type.states).reduce((n, [state, { final }]) => (final ? n : n + view.count(act.on!, state)), 0);
    if (!type.states[effects.working.get("on")!.state]?.final && live + 1 > type.max) return refused("type-full", `${act.on} has ${live} live items`);
  }

  // Section 5.3: every act judges its `notAfter` and its grant's expiry on the commit clock, so no act is written while the clock is behind.
  if (clock.behind) return { result: "unavailable", reason: "clock-behind" };
  return { result: "write", draft: { input: { type: "act", signed, authority: [presented.grant] }, uses, prepared, effects: effects.effects, sends: sends.sends, judgesTime: true } };
}

/**
 * The selected timed transition (section 5.2, step 6.3). It is written only
 * when all three checks hold: its item still holds that deadline under that
 * rule; the reading is not earlier than the deadline; and no transition
 * earlier in the order is due. Others may be due later in the order; they
 * stay due. A timed entry judges time, so it is never clamped (section 5.3).
 */
export function judgeTimed(view: StateView, definition: ValidDefinition, selected: Due, context: Pick<JudgeContext, "clock" | "bounds">): TimedJudgment {
  const { clock, bounds } = context;
  const scope = view.scope();
  const rule = Object.hasOwn(definition.declared.timed, selected.rule) ? definition.declared.timed[selected.rule] : undefined;
  const item = view.item(selected.item);
  if (!scope || !rule || !item || item.type !== rule.on || !rule.states.includes(item.state) || item.values[rule.deadline] !== selected.due) return { result: "dropped", failed: "held" };
  if (clock.behind) return { result: "unavailable", reason: "clock-behind" };
  if (timeMs(clock.reading)! < timeMs(selected.due)!) return { result: "dropped", failed: "reached" };
  const next = nextDue(view, definition, clock.reading);
  if (next?.item !== selected.item || next.rule !== selected.rule) return { result: "dropped", failed: "next" };

  const j: Judging = { view, definition, bounds, clock, scope, self: scope.head.seq + 1, kind: selected.rule, fields: {}, fieldTypes: {}, subjects: new Map([["on", item]]), signer: null, facts: new Map(), prepared: [] };
  const effects = deriveEffects(j, rule.effects, rule.attention, null);
  // The validator admits no timed rule whose effects can be refused: they change a live item of the rule's own type.
  if (!effects.ok) throw new Error(`timed rule ${selected.rule} cannot apply: ${effects.reason}`);
  return { result: "write", draft: { input: { type: "timed", item: selected.item, rule: selected.rule, due: selected.due }, uses: [], prepared: [], effects: effects.effects, sends: [], judgesTime: true } };
}

/**
 * The entry a draft becomes at this head and this reading (section 5.3): the
 * reading is its time, or, when the clock is behind, the previous entry's
 * time with `clamped: true`. Its hash is computed afterwards, over these
 * bytes.
 */
export function entryOf(view: StateView, draft: Draft, clock: Clock): Entry {
  const scope = view.scope();
  if (!scope) throw new Error("a scope's first entry is its genesis");
  if (clock.behind && draft.judgesTime) throw new Error("an entry that judges time is not written while the clock is behind");
  return {
    v: 1, at: scope.at, seq: scope.head.seq + 1, prev: scope.head.hash, time: clock.asOf, clamped: clock.behind, epoch: 0,
    input: draft.input, uses: draft.uses, prepared: draft.prepared, effects: draft.effects, sends: draft.sends,
  };
}

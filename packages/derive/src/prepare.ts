/**
 * Preparation that has effects (scope contract, sections 4.1, 5.5, 6.11 and
 * 9.3; authority note, section 5.7, "Steps"). A capability's step is asked
 * for with the signed intent that it prepares for. The scope that owns the
 * resource judges the request in a commit and records it as a `preparation`
 * entry, before anything outside the service is caused. The entry holds the
 * exact signed intent, the one grant judged, the capability and the step.
 * It derives the capability's records and the operations that the step
 * opens, each with attempt 1, and nothing else: it opens no item and sends
 * no message.
 *
 * `judgePreparation` is the judge. The runtime calls it inside the commit's
 * transaction, and a verifier calls it over the folded state. It is a pure
 * function of what it is given. The rules of each step are the
 * capability's, given as `Steps`. The decision on the grant is given as a
 * function, `GrantDecision`.
 *
 * The scope indexes a preparation entry by the intent's digest, the
 * capability and the step (`StateView.prepared`; the fold keeps the index).
 * The same three again are answered with the first entry and write nothing.
 * The act's idempotency key is not consumed. `preparationStatus` is what a
 * settlement reports of an intent's preparation (section 9.1).
 *
 * A refusal is an answer and no entry: nothing was caused, and nothing is
 * charged (section 17.3).
 */

import { CAPABILITIES } from "@generalbusiness/artroom-contract";
import type { Capability, CapabilityName, Digest, Effect, FactRef, FieldValue, Grant, Head, Intent, KeyId, OperationId, RefusalReason, ScopeRef, SignedIntent, UnavailableReason } from "@generalbusiness/artroom-contract";
import { intentDigest, isScopeRef, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import type { Signer } from "./attribution.ts";
import type { Capabilities, Recorded } from "./capability.ts";
import { isIntent, type Own, type Reading } from "./fields.ts";
import type { Draft } from "./judge.ts";
import { operationId, operationOpening, operationStanding, type Opening } from "./ledger.ts";
import type { ScopeState, StateView } from "./state.ts";
import { nextDue, type Due } from "./timed.ts";
import { timeMs, type Clock } from "./time.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { own, same } from "./values.ts";

/**
 * The window of the observation that a step's grant is judged on (section
 * 16.1; authority note, sections 3.12, row W3, and 5.7). `ten-seconds`: a
 * write outside the service follows, so the observation is read for this
 * commit and is at most ten seconds old. `ordinary`: nothing is written
 * outside, and the act's own window serves.
 */
export type PreparationWindow = "ten-seconds" | "ordinary";

/** The length of the ten-second window, in seconds (authority note, section 3.12, row W3). The number is the proof plan's. */
export const PREPARATION_WINDOW_SECONDS = 10;

/** What the grant guard is asked for one preparation: the signing key, the action that the capability names for the step, this scope, the window and the commit's one reading. */
export interface GrantAsked { key: KeyId; action: string; scope: ScopeRef; window: PreparationWindow; clock: Clock }

/**
 * The decision on the grant of one preparation, in the commit. `granted`:
 * that grant is to this key, covers the action in this scope and is current
 * on an observation inside the window. The entry records it. `refused`: no
 * such grant. `unavailable`: nothing was read that this commit can judge
 * on, and the step is not judged (section 16.1).
 */
// I3 merge: this is the seam for the grant guard of `derive/src/grant.ts` (plan step 5). The caller builds it from the observation
// that was read before the turn, in one line: `granted: (asked) => grantGuard(observation, asked)`. Nothing here reads a window.
export type GrantDecision = (asked: GrantAsked) => { result: "granted"; grant: Grant } | { result: "refused" } | { result: "unavailable" };

/**
 * What a step's rules are given: the folded state before the entry, the
 * pinned definition, this scope, the `seq` of the entry being written, the
 * intent with its digest, the signer as the judged grant states it, and the
 * commit's one reading. A rule reads nothing else.
 */
export interface StepGiven {
  view: StateView; definition: ValidDefinition; scope: Pick<ScopeState, "at">; self: number;
  intent: Intent; digest: Digest; signer: Signer; clock: Clock;
}

/**
 * How a step's guard refuses (authority note, section 5.7). With a name:
 * `capability-refused`, by the name that the texts give the refusal.
 * Without one: `guard-failed`, for a judgment that the texts state and give
 * no name (I3 deltas, entry EF3).
 */
export type StepRefusal = { reason: "capability-refused"; name: string } | { reason: "guard-failed"; detail: string };

/**
 * What a step derives (section 5.5): the capability's records, and the
 * operations that it opens. Operation `k` of `opens` has the ID
 * `operationId(self, k)`, so a record may name the operation that its own
 * entry opens.
 */
export interface StepDerived { records: readonly Recorded[]; opens: readonly Opening[] }

/** The rules of the capability steps that a runtime or a verifier has code for. Each is a pure function of what it is given. */
export interface Steps {
  /** True when this value has the code of that step. Without it no preparation entry of the step is written (section 9.3, point E13). */
  implements(capability: CapabilityName, step: string): boolean;
  /**
   * The action whose grant the step is judged on, in this scope, and the
   * window of its observation (section 5.5, "What is judged"). Null: the
   * rules can name no action for this request, and it is refused
   * `unauthorized`.
   */
  grant(capability: CapabilityName, step: string, given: Omit<StepGiven, "signer">): { action: string; window: PreparationWindow } | null;
  /** The capability's guards for the step, over local state, and what the step derives. */
  derive(capability: CapabilityName, step: string, given: StepGiven): StepDerived | { refused: StepRefusal };
}

/**
 * The step rules of a capabilities value that has them. The capabilities
 * port carries one value for the guards, the effects and the steps of a
 * capability, and a value with no step rules has none.
 */
// I3 merge: the port's type, `Capabilities`, states no steps (plan step 3). Step 16 gives the port its member, and this goes.
export const stepsOf = (capabilities: Capabilities | null | undefined): Steps | null => {
  const steps = capabilities as Partial<Steps> | null | undefined;
  return steps && typeof steps.derive === "function" && typeof steps.grant === "function" ? (steps as Steps) : null;
};

/** What the judge of a preparation is given beside the state and the definition. */
export interface PreparationContext extends Pick<Reading, "clock" | "bounds"> {
  /** The rules of the steps this runtime has code for. Null or absent: none, and no preparation is judged. */
  steps?: Steps | null | undefined;
  /** The decision on the grant: see `GrantDecision`. */
  granted: GrantDecision;
}

/** One request for a step, as it arrives: untrusted until judged. */
export interface PreparationAsked { signed: SignedIntent; capability: string; step: string }

export type PreparationJudgment =
  | { result: "write"; draft: Draft }
  | { result: "refused"; reason: RefusalReason; name?: string; detail: string; judgedAt: Head }
  | { result: "unavailable"; reason: UnavailableReason }
  | { result: "repeat"; seq: number }             // the same intent, capability and step are sealed in that entry; nothing is written
  | { result: "due"; next: Due };                 // section 5.2, step 6.3: nothing is written; the drain runs first

/** The step that a request names, when the definition lists its capability and that version declares the step. */
function declaredStep(definition: ValidDefinition, capability: unknown, step: unknown): { capability: CapabilityName; foreign: boolean } | null {
  if (typeof capability !== "string" || typeof step !== "string") return null;
  const listed = definition.declared.capabilities.some((c) => `${c.name}@${c.version}` === capability);
  const declared = own((own(CAPABILITIES as Readonly<Record<string, Capability>>, capability))?.steps, step);
  return listed && declared ? { capability: capability as CapabilityName, foreign: declared.foreign } : null;
}

/**
 * The judge of one preparation (section 5.5, "What is judged"; section 9.3,
 * the row "Preparation"). The checks are in the order of an act's (section
 * 4.2), as far as a preparation has them.
 *
 * 1. The signature and the shape of the intent.
 * 2. The capability is one that the pinned definition lists, and the step is
 *    one that its version declares.
 * 3. The address. For a step that is not `foreign`, `to` is this scope. A
 *    `foreign` step may be asked of the scope that owns the resource, for an
 *    intent that is addressed to another scope.
 * 4. A repeat: the same intent, capability and step are answered with the
 *    first entry, at any time, and write nothing.
 * 5. `notAfter`, on the commit clock.
 * 6. The due check of section 5.2, and the scope's status.
 * 7. The grant for the action that the capability names for the step, on an
 *    observation of the kind that the step needs.
 * 8. The capability's guards for the step, over local state.
 *
 * Capacity is asked after the fold, as for any new work (`fits`, in
 * `reserve.ts`): a preparation is never a settling entry.
 */
export function judgePreparation(view: StateView, definition: ValidDefinition, asked: PreparationAsked, context: PreparationContext): PreparationJudgment {
  const scope = view.scope();
  if (!scope) return { result: "unavailable", reason: "unavailable" };
  const refused = (reason: RefusalReason, detail: string, name?: string): PreparationJudgment => ({ result: "refused", reason, detail, judgedAt: scope.head, ...(name === undefined ? {} : { name }) });
  const { clock, bounds } = context;
  const { signed } = asked;

  if (!verifySignedIntent(signed) || !isIntent(signed.intent)) return refused("bad-intent", "not a signed intent");
  const intent = signed.intent;
  // The request names its capability and its step beside the intent. Neither is signed: what a step may do is judged below.
  const named = declaredStep(definition, asked.capability, asked.step);
  if (!named) return refused("bad-field", "the request names no step of a capability that the definition lists");
  const { capability } = named;
  const step = asked.step;

  // Section 5.5: the scope that records a step is the one the intent is addressed to, or another scope when the step is `foreign`.
  if (!isScopeRef(intent.to) || (!named.foreign && !same(intent.to, scope.at))) return refused("misaddressed", "to");

  // Section 5.5, "A repeat". It is answered from the index, like the exact retry of an accepted act: also after `notAfter`.
  const digest = intentDigest(intent);
  const earlier = view.prepared(digest, capability, step);
  if (earlier) return { result: "repeat", seq: earlier.seq };

  const asOf = timeMs(clock.asOf)!;
  const notAfter = timeMs(intent.notAfter)!;
  if (asOf >= notAfter) return refused("expired", "notAfter");
  if (notAfter - asOf > bounds.intentLifetimeSeconds * 1000) return refused("bad-intent", "notAfter is further ahead than an intent may live");

  const next = nextDue(view, definition, clock.asOf);
  if (next) return { result: "due", next };
  if (scope.status === "provisional") return { result: "unavailable", reason: "scope-provisional" };
  if (scope.status === "refused") return refused("scope-refused", "the scope's genesis was refused");

  // Section 9.3, point E13: only the capability's code writes a preparation entry. With no code for the step, none is written.
  const steps = context.steps;
  if (!steps?.implements(capability, step)) return { result: "unavailable", reason: "unavailable" };

  const self = scope.head.seq + 1;
  const given = { view, definition, scope, self, intent, digest, clock };
  const needs = steps.grant(capability, step, given);
  if (!needs) return refused("unauthorized", "the step names no action of this scope for this request");
  const decided = context.granted({ key: intent.actor, action: needs.action, scope: scope.at, window: needs.window, clock });
  if (decided.result === "unavailable") return { result: "unavailable", reason: "authority-unavailable" };
  // The judge keeps its own check of the grant, as the judge of an act does: the key, the action, the scope and its end time.
  const grant = decided.result === "granted" ? decided.grant : null;
  if (!grant || grant.key !== intent.actor || !grant.actions.includes(needs.action) || !isScopeRef(grant.within) || grant.within.scope !== scope.at.scope || grant.within.inc !== scope.at.inc
    || (grant.notAfter !== null && asOf >= (timeMs(grant.notAfter) ?? -Infinity))) return refused("unauthorized", `no current grant of ${needs.action} to this key in this scope`);

  const derived = steps.derive(capability, step, { ...given, signer: { member: grant.subject, principal: grant.principal } });
  if ("refused" in derived) return derived.refused.reason === "capability-refused" ? refused("capability-refused", `the step's guard ${derived.refused.name} does not hold`, derived.refused.name) : refused("guard-failed", derived.refused.detail);

  // Section 5.3: a preparation judges its `notAfter` and its grant on the commit clock, so none is written while the clock is behind.
  if (clock.behind) return { result: "unavailable", reason: "clock-behind" };
  const effects: Effect[] = [...recordEffects(capability, derived.records), ...derived.opens.flatMap((open, k) => operationOpening(k, open))];
  return { result: "write", draft: { input: { type: "preparation", signed, authority: [grant], capability, step }, uses: [], prepared: [], effects, sends: [], judgesTime: true } };
}

/**
 * The `record` effects of a capability's records, in order. A record of a
 * kind or a state that the version does not declare is a fault of the
 * rules, and is not a judgment (section 6.11, point D11): it is thrown.
 */
export function recordEffects(capability: CapabilityName, records: readonly Recorded[]): Extract<Effect, { effect: "record" }>[] {
  const declared = own(CAPABILITIES as Readonly<Record<string, Capability>>, capability);
  return records.map((r) => {
    if (!own(declared?.records, r.kind)?.states.includes(r.state)) throw new Error(`${capability} declares no record ${r.kind} with the state ${r.state}`);
    return { effect: "record", capability, kind: r.kind, key: r.key, state: r.state, values: { ...r.values } };
  });
}

/**
 * What a settlement reports of one preparation entry (section 9.1,
 * "Preparation"): the entry, its capability and step, each operation that
 * the entry opened, and each record that it made, with its state now.
 */
export interface PreparationStatus {
  entry: FactRef; capability: CapabilityName; step: string;
  operations: readonly { operation: OperationId; kind: string; state: "settled" | "pending" | "unknown" }[];
  records: readonly { kind: string; key: readonly FieldValue[]; state: string }[];
}

/**
 * This scope's preparation entries for one intent, at most one for each
 * capability step (section 9.1): what a later act, a later outcome and a
 * settlement find of the intent's preparation. Each operation is `settled`,
 * `pending` while an attempt has no outcome, or `unknown` while an attempt's
 * latest outcome is unknown. Each record is one that the entry made, with
 * the state that the folded state holds for it now. An empty list says that
 * this scope prepared nothing for the intent. It says nothing of another
 * scope.
 *
 * `own` reads this scope's sealed entries. An entry that cannot be read is
 * left out of nothing: the function throws, because the index names it.
 */
export function preparationStatus(view: StateView, history: Own, intent: Digest): PreparationStatus[] {
  return view.preparations(intent).map(({ capability, step, seq }) => {
    const sealed = history(seq);
    if (!sealed) throw new Error(`the preparation entry ${seq} is indexed and cannot be read`);
    const { entry, hash } = sealed;
    const operations = entry.effects.flatMap((effect) => {
      const operation = effect.effect === "operation" ? view.operation(operationId(seq, effect.k)) : null;
      return operation ? [{ operation: operation.id, kind: operation.kind, state: operationStanding(operation) }] : [];
    });
    const records = entry.effects.flatMap((effect) => {
      const record = effect.effect === "record" ? view.record(effect.capability, effect.kind, effect.key) : null;
      return record ? [{ kind: record.kind, key: record.key, state: record.state }] : [];
    });
    return { entry: { at: entry.at, seq, hash }, capability, step, operations, records };
  });
}

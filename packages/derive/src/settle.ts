/**
 * The judges of the entries a scope writes about its own duties (scope
 * contract, sections 4.3, 7.4 and 9.2): a diagnosis of a request that could
 * not be delivered, the outcome of an attempt of an outside operation, and a
 * checkpoint. None has a caller outside the scope: one that is not written
 * is offered again, or is not an input the scope can write.
 */

import type { Attempt, Digest, Entry } from "@generalbusiness/artroom-contract";
import type { Reading } from "./fields.ts";
import { runClause } from "./handlers.ts";
import { namesOwn, outcomeOf, recordedOutcome, type OutcomeOffered, type Owners } from "./ledger.ts";
import { ownersOf } from "./outcomes.ts";
import type { Judgment } from "./judge.ts";
import { unjudged, type PlatformRules } from "./marks.ts";
import { stateDigest, type ScopeState, type StateView } from "./state.ts";
import { nextDue } from "./timed.ts";
import { timeMs } from "./time.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isLocalId } from "./values.ts";

type Settling = Pick<Reading, "clock" | "bounds">;
const invalid = (detail: string): Judgment => ({ result: "refused", reason: "bad-input", detail });

/**
 * What every one of these inputs meets first: the due check of section 5.2,
 * step 6.3, and the rule of section 7.2 that a provisional scope writes only
 * its confirmation and a refused one nothing.
 */
function admitted(view: StateView, definition: ValidDefinition, context: Settling): { scope: ScopeState } | Judgment {
  const scope = view.scope();
  if (!scope) return { result: "unavailable", reason: "unavailable" };
  const next = nextDue(view, definition, context.clock.asOf);
  if (next) return { result: "due", next };
  if (scope.status === "provisional") return { result: "unavailable", reason: "scope-provisional" };
  if (scope.status === "refused") return { result: "refused", reason: "scope-refused", detail: "the scope's genesis was refused" };
  return { scope };
}

const ROUTING: readonly Attempt["answer"][] = ["wrong-incarnation", "not-found"];
const ANSWERS: readonly Attempt["answer"][] = ["none", "retry", ...ROUTING];

/**
 * Section 7.4, "When a request cannot be delivered". The finding follows
 * from the attempt log and from nothing else: `undelivered` only when every
 * attempt was answered by a routing refusal and none went unanswered. Then
 * the send's `undelivered` clause runs. Otherwise the finding is
 * `delivery-unavailable`: no clause runs, the request stays pending, and a
 * later authentic result may still be recorded.
 */
export function judgeDiagnosis(view: StateView, definition: ValidDefinition, diagnosis: { of: { seq: number; n: number }; attempts: readonly Attempt[] }, context: Reading & { origin?: Entry | null | undefined }): Judgment {
  const { of, attempts } = diagnosis;
  const request = isLocalId(of.seq) && isLocalId(of.n) ? view.request(of.seq, of.n) : null;
  // A request has one diagnosis: retransmission stopped when it was written.
  if (request?.diagnosis) return { result: "repeat", seq: request.diagnosis.seq };
  const admit = admitted(view, definition, context);
  if (!("scope" in admit)) return admit;
  if (!request) return invalid("names no request send of this scope");
  if (request.result) return invalid("the request has a recorded result");
  if (attempts.length === 0 || attempts.some((a) => timeMs(a.at) === null || !ANSWERS.includes(a.answer))) return invalid("the log holds at least one attempt, each with a time and an answer");

  const finding = attempts.every((a) => ROUTING.includes(a.answer)) ? "undelivered" : "delivery-unavailable";
  // Platform data: a mark among the effects of the `undelivered` clause is run when the clause runs, and a fault of its rule leaves
  // the diagnosis not written now (section 6.1).
  const ran = finding === "undelivered" ? unjudged(() => runClause(view, definition, context, admit.scope, request, "undelivered", undefined, { type: "diagnosis", of: { seq: of.seq, n: of.n }, attempts })) : { result: "ran", effects: [], uses: [], judgesTime: false } as const;
  if (ran.result === "unavailable") return ran;
  if (ran.judgesTime && context.clock.behind) return { result: "unavailable", reason: "clock-behind" };
  return { result: "write", draft: { input: { type: "diagnosis", of: { seq: of.seq, n: of.n }, finding, attempts }, uses: ran.uses, prepared: [], effects: ran.effects, sends: [], judgesTime: ran.judgesTime } };
}

/**
 * What the judge of an outcome is given beside the reading: the rules of
 * the owners this runtime has code for (`ledger.ts`); and, in a scope under
 * a platform definition, that definition's rules and the scope's own
 * history, which a rule of an outcome entry is given (section 6.1, place 7).
 */
export type OutcomeContext = Settling & { owners?: Owners | undefined; platform?: PlatformRules | undefined; own?: Reading["own"] };

/** `conflict`: the outcome contradicts a recorded `confirmed` or `refused` of the same attempt. It writes nothing, and is answered `outcome-conflict` with the entry it contradicts (section 4.3, item 6). */
export type OutcomeJudgment = Judgment | { result: "conflict"; seq: number };

/**
 * The outcome of one attempt of an outside operation (section 4.3). The
 * rules are the ledger's (`ledger.ts`), in this order. A second copy of a
 * recorded answer, and an answer that contradicts a recorded one, are
 * answered from the history and write nothing. Then the outcome meets what
 * every input of this file meets. Then the ledger derives its entry: the
 * attempt's record with `selected`, the next attempt when one follows, and
 * what the owner derives. The evidence is carried, and its truth is not
 * judged. An outcome judges no time, so it may be written clamped (section
 * 5.3).
 */
export function settleOutcome(view: StateView, definition: ValidDefinition, outcome: OutcomeOffered, context: OutcomeContext): OutcomeJudgment {
  // Section 4.1: an outcome that is offered with another owner or kind than its operation has is `bad-input`, also when it would
  // be a copy of a recorded answer. Nothing is written.
  const operation = view.operation(outcome.operation);
  if (operation && !namesOwn(operation, outcome)) return invalid("the outcome names another owner or kind than its operation has");
  const known = recordedOutcome(view, outcome);
  if (known) return known;
  const admit = admitted(view, definition, context);
  if (!("scope" in admit)) return admit;
  // The owner of the operation may be the platform definition that this scope pins. Its rule for outcome entries of this kind is
  // the one that `outcomes` names. A fault of the rule leaves the outcome not judged, and nothing is written (section 6.1).
  const ran = { clock: false };
  const judged = unjudged(() => outcomeOf(view, definition, outcome, ownersOf(definition, context.platform, context.owners, { clock: context.clock, bounds: context.bounds, own: context.own, ran })));
  // An outcome judges no time. An entry for which a rule read the clock does, and is never written clamped (section 6.1).
  if (judged.result !== "write" || !ran.clock) return judged;
  return context.clock.behind ? { result: "unavailable", reason: "clock-behind" } : { result: "write", draft: { ...judged.draft, judgesTime: true } };
}

/** `settleOutcome`, for a caller that only asks whether the outcome writes an entry: a contradiction is an input that the scope never writes. */
export function judgeOutcome(view: StateView, definition: ValidDefinition, outcome: OutcomeOffered, context: OutcomeContext): Judgment {
  const judged = settleOutcome(view, definition, outcome, context);
  return judged.result === "conflict" ? invalid(`outcome-conflict: entry ${judged.seq} records another answer of that attempt`) : judged;
}

/** The checkpoint a scope may write now: through its head, with the digest of its folded state (section 9.2). */
export function checkpointOf(view: StateView): { through: number; state: Digest } {
  const scope = view.scope();
  if (!scope) throw new Error("a scope with no entry has nothing to checkpoint");
  return { through: scope.head.seq, state: stateDigest(view.all()) };
}

/**
 * Section 9.2: a checkpoint names a `through` sequence and the digest of the
 * state folded through it. It is written as the next entry, so `through` is
 * the head. A wrong digest is refused.
 */
export function judgeCheckpoint(view: StateView, definition: ValidDefinition, checkpoint: { through: number; state: Digest }, context: Settling): Judgment {
  const admit = admitted(view, definition, context);
  if (!("scope" in admit)) return admit;
  if (checkpoint.through !== admit.scope.head.seq) return invalid("a checkpoint is through the head it is written on");
  if (checkpoint.state !== stateDigest(view.all())) return invalid("the digest is not the digest of the folded state");
  return { result: "write", draft: { input: { type: "checkpoint", through: checkpoint.through, state: checkpoint.state }, uses: [], prepared: [], effects: [], sends: [], judgesTime: false } };
}

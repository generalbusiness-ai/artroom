/**
 * The judges of the entries a scope writes about its own duties (scope
 * contract, sections 4.3, 7.4 and 9.2): a diagnosis of a request that could
 * not be delivered, the outcome of an attempt of an outside operation, and a
 * checkpoint. None has a caller outside the scope: one that is not written
 * is offered again, or is not an input the scope can write.
 */

import type { Attempt, Digest, Entry, Input } from "@generalbusiness/artroom-contract";
import { runClause, type Reading } from "./frame.ts";
import type { Judgment } from "./judge.ts";
import { stateDigest, type ScopeState, type StateView } from "./state.ts";
import { nextDue } from "./timed.ts";
import { timeMs } from "./time.ts";
import type { ValidDefinition } from "./validate.ts";
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
  const ran = finding === "undelivered" ? runClause(view, definition, context, admit.scope, request, "undelivered") : { result: "ran", effects: [], uses: [], judgesTime: false } as const;
  if (ran.result === "unavailable") return ran;
  if (ran.judgesTime && context.clock.behind) return { result: "unavailable", reason: "clock-behind" };
  return { result: "write", draft: { input: { type: "diagnosis", of: { seq: of.seq, n: of.n }, finding, attempts }, uses: ran.uses, prepared: [], effects: ran.effects, sends: [], judgesTime: ran.judgesTime } };
}

/**
 * Section 4.3: the operation and the attempt were opened by an earlier
 * entry, and an outcome settles its own numbered attempt and no other, so a
 * later attempt cannot settle an earlier unknown one. `confirmed` and
 * `refused` are final. `unknown` may be followed by the same attempt's
 * outcome when evidence of it is read. The evidence is the authority note's;
 * here it is carried and not read. An outcome judges no time, so it may be
 * written clamped (section 5.3).
 */
export function judgeOutcome(view: StateView, definition: ValidDefinition, outcome: Extract<Input, { type: "outcome" }>, context: Settling): Judgment {
  const attempt = view.operation(outcome.operation)?.attempts.find((a) => a.attempt === outcome.attempt);
  if (attempt?.outcome?.result === outcome.result) return { result: "repeat", seq: attempt.outcome.seq };
  const admit = admitted(view, definition, context);
  if (!("scope" in admit)) return admit;
  if (!attempt) return invalid("no entry opened that attempt of that operation");
  if (attempt.outcome && attempt.outcome.result !== "unknown") return invalid(`the attempt is settled: ${attempt.outcome.result}`);
  if (!["confirmed", "refused", "unknown"].includes(outcome.result)) return invalid("the result is confirmed, refused or unknown");
  const input: Input = { type: "outcome", operation: outcome.operation, attempt: outcome.attempt, result: outcome.result, evidence: outcome.evidence };
  return { result: "write", draft: { input, uses: [], prepared: [], effects: [], sends: [], judgesTime: false } };
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

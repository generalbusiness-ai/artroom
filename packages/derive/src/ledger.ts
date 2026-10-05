/**
 * The ledger of outside effects, as pure rules (scope contract, section 4.3;
 * authority note, sections 5.4, 5.7 and 5.8). An entry opens an operation.
 * An attempt is recorded before it is sent. An outcome is `confirmed`,
 * `refused` or `unknown`. A late answer adds one more outcome and rewrites
 * nothing. A selection is made once.
 *
 * Nothing here reads a clock, storage, the network or the scope's free room.
 * The judges and the fold call these functions in the commit, a verifier
 * calls them again, and the runtime's driver (`scope/src/operations.ts`)
 * sends what they recorded. "Item n" is an item of the contract's section
 * 4.3. "Rule n" is a ledger rule of the authority note's section 5.4.
 *
 * What an owner decides is not here. Which kinds select, when another
 * attempt follows, whether a read is decisive, what evidence is well formed
 * and what an outcome derives beyond the ledger are the owner's: a
 * capability version or a platform definition supplies them as
 * `OperationRules` (plan row P16). With no rules for an owner, no outcome of
 * its operations is judged.
 */

import type { CapabilityName, Digest, Effect, Entry, Evidence, Input, OperationId, PlatformDefinition, Send, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalBytes, digestBytes } from "@generalbusiness/artroom-bytes";
import type { Draft } from "./judge.ts";
import type { AttemptState, Operation, OutcomeState, StateView } from "./state.ts";
import { timeMs, type Clock } from "./time.ts";

export type Owner = CapabilityName | PlatformDefinition;
export type OutcomeInput = Extract<Input, { type: "outcome" }>;
type Result = OutcomeInput["result"];

/** Item 1: the operation's ID is the `seq` of the entry that opened it and the record's ordinal there. */
export const operationId = (seq: number, k: number): OperationId => `${seq}:${k}`;

/** What the entry that opens an operation states: the owner, the kind, and the most attempts the owner allows (item 1; G3). */
export interface Opening { owner: Owner; kind: string; attempts: number }

/** What an owner derives from one outcome beside the ledger's own records: its records, its sends, and the operations it opens, such as a cleanup (item 7). */
export interface OutcomeDerived { effects: readonly Effect[]; sends: readonly Send[]; opens: readonly Opening[] }

/** The owner's rules for one kind of operation. Each is a function of what it is given, and reads nothing else. */
export interface OperationRules {
  /** Item 7: the kind selects one result, as a founding claim selects one repository. */
  selects: boolean;
  /** Item 4: a read of the outside system is decisive for this kind. Rule 3: it never is for a create. */
  read: boolean;
  /** Item 2: the owner's retry rule. Rule 7 and section 17.3: it is not given the scope's free room, so it cannot read it. */
  retries(result: "refused" | "unknown", operation: Operation): boolean;
  /** Item 7: the owner's local guard for a selection. Absent: it holds. */
  holds?(view: StateView, operation: Operation, outcome: OutcomeInput): boolean;
  /** Item 4: the evidence is well formed for this owner. Absent: any body is. */
  wellFormed?(result: Result, evidence: Evidence): boolean;
  /** What the outcome derives beside the ledger's records. Absent: nothing. */
  derives?(view: StateView, operation: Operation, outcome: OutcomeInput, selected: boolean | null): OutcomeDerived;
  /**
   * Section 17.2, row 5: the owner declares what the outcomes of an
   * operation derive. This is the most entries that the operations which one
   * outcome entry of this kind opens, such as a cleanup, reserve, with their
   * own closures (`reservedBy`). Each outcome entry that the operation may
   * still write reserves it (`owed`, in `reserve.ts`), and an outcome that
   * would open more writes nothing. Absent: 0, and an outcome opens none.
   * It counts entries only: the other dimensions of section 17.1 are request
   * `cc570904`'s.
   */
  closure?: number;
}

/** The rules of the owners that a runtime or a verifier has code for. Null: none for that owner and kind. */
export interface Owners { rules(owner: Owner, kind: string): OperationRules | null }

/** The closure that the owner declares for one outcome entry of that kind of operation (section 17.2, row 5). With no rules, no outcome is judged, so none derives anything. */
export const closureOf = (owners: Owners | null | undefined, owner: Owner, kind: string): number => owners?.rules(owner, kind)?.closure ?? 0;

/**
 * The entries that one opening reserves when its entry is folded (section
 * 17.2, row 5): for each attempt it states, its first outcome and its late
 * answer, and with each of those the closure that its owner declares.
 */
export const reservedBy = (open: Opening, owners: Owners | null | undefined): number => 2 * open.attempts * (1 + closureOf(owners, open.owner, open.kind));

/**
 * The effects that open one operation in the entry being derived, at its
 * ordinal `k` there (item 1): its record, and attempt 1 (item 2). Rule 1:
 * these effects are the duty, and they are sealed before any request of the
 * attempt is sent. `held`: a provisional scope's genesis seals the operation
 * as a held duty, with no attempt (item 1; section 7.2).
 *
 * Section 5.8: the entry that opens an operation reserves for every attempt
 * it states, so the number is fixed here and never raised.
 */
// I3 merge: no judge calls this yet, but the one of an outcome, for what its owner opens. The capability rules, a preparation and
// the platform rules open their operations with it, each in its own step.
export function operationOpening(k: number, open: Opening, held = false): Effect[] {
  if (!Number.isSafeInteger(open.attempts) || open.attempts < 1) throw new Error("an operation states at least one attempt");
  const operation: Effect = { effect: "operation", k, owner: open.owner, kind: open.kind, attempts: open.attempts };
  return held ? [operation] : [operation, { effect: "attempt", operation: { k }, attempt: 1, result: "opened", selected: null }];
}

/**
 * Item 1: attempt 1 of each operation that a provisional scope's genesis
 * holds, opened by the entry that records the confirmation. `genesis` is the
 * scope's entry 0.
 */
// I3 merge: the judge of a confirmation does not call this yet. No genesis can declare an operation until an owner's rules exist,
// so the call has no witness. It comes with the first definition whose genesis opens one (plan step 9b; I3 deltas, entry EB12).
export function heldOpenings(view: StateView, genesis: Entry): Effect[] {
  return genesis.effects.flatMap((effect): Effect[] => {
    if (effect.effect !== "operation") return [];
    const operation = operationId(genesis.seq, effect.k);
    return view.operation(operation)?.attempts.length === 0 ? [{ effect: "attempt", operation, attempt: 1, result: "opened", selected: null }] : [];
  });
}

/** The digest of an outcome's evidence, which the folded state keeps so that a second copy of an answer is told from another answer (item 6). */
export const evidenceDigest = (evidence: Evidence): Digest => digestBytes(canonicalBytes(evidence));

const latest = (attempt: AttemptState): OutcomeState | null => attempt.outcomes.at(-1) ?? null;
const decisive = (outcome: OutcomeState | null): boolean => outcome !== null && outcome.result !== "unknown";

/**
 * Item 8: an operation is settled when every attempt that was opened has a
 * `confirmed` or a `refused` outcome. An attempt that is `unknown` keeps it
 * unsettled, whatever a later attempt showed. A held operation has no
 * attempt yet, and is not settled.
 */
export const operationSettled = (operation: Operation): boolean => operation.attempts.length > 0 && operation.attempts.every((a) => decisive(latest(a)));

/**
 * What one operation still reserves, in attempts (section 17.2, row 5;
 * authority note, section 5.8): 2 entries for each attempt that may still be
 * opened or that has no outcome, its first outcome and its late answer, and
 * 1 for each attempt whose latest outcome is `unknown`. A settled operation
 * reserves nothing.
 *
 * Another attempt may still be opened while nothing is selected, fewer than
 * the stated number are opened, and the last attempt has no decisive
 * outcome. A runtime may reserve more than a closure and never less, and
 * this counts every such attempt whatever the owner's retry rule will say.
 */
export function pendingOf(operation: Operation): { opened: number; unknown: number; unopened: number } {
  const last = operation.attempts.at(-1);
  const more = operation.selected === null && (last === undefined || !decisive(latest(last)));
  return {
    opened: operation.attempts.filter((a) => a.outcomes.length === 0).length,
    unknown: operation.attempts.filter((a) => latest(a)?.result === "unknown").length,
    unopened: more ? operation.most - operation.attempts.length : 0,
  };
}

/** What a reader is told of an operation (section 9.1, "Preparation"): `pending` while an attempt has no outcome or none is opened, `unknown` while an attempt's latest outcome is unknown, else `settled`. */
export function operationStanding(operation: Operation): "settled" | "pending" | "unknown" {
  if (operation.attempts.length === 0 || operation.attempts.some((a) => a.outcomes.length === 0)) return "pending";
  return operationSettled(operation) ? "settled" : "unknown";
}

/**
 * The fold of one `operation` record (item 1). A string says why the state
 * cannot take it.
 */
export function openedBy(seq: number, effect: Extract<Effect, { effect: "operation" }>): Operation | string {
  if (!Number.isSafeInteger(effect.attempts) || effect.attempts < 1) return "states no attempt";
  return { id: operationId(seq, effect.k), owner: effect.owner, kind: effect.kind, most: effect.attempts, attempts: [], selected: null };
}

/**
 * The fold of one `attempt` record on its operation. A string says why the
 * state cannot take it. `entry` is the entry that holds the record.
 *
 * - `opened`: attempts are numbered from 1, in order, and none is opened
 *   beyond the stated number (item 2; rule 7).
 * - A result: the entry is the outcome entry of exactly that operation and
 *   attempt, so an outcome changes its own attempt and no other (item 5;
 *   rule 6). An attempt has at most two outcomes, and the second follows
 *   only an `unknown`, which stays (item 3; rule 2). A selection is recorded
 *   once and never moves (item 7).
 */
export function attemptedBy(operation: Operation, effect: Extract<Effect, { effect: "attempt" }>, entry: Entry): Operation | string {
  if (effect.result === "opened") {
    if (effect.attempt !== operation.attempts.length + 1) return `opens attempt ${effect.attempt} out of order`;
    if (effect.attempt > operation.most) return `opens attempt ${effect.attempt} of at most ${operation.most}`;
    if (effect.selected !== null) return "selects with an opening";
    return { ...operation, attempts: [...operation.attempts, { attempt: effect.attempt, opened: entry.seq, outcomes: [] }] };
  }
  const input = entry.input;
  if (input.type !== "outcome" || input.operation !== operation.id || input.attempt !== effect.attempt || input.result !== effect.result) return "records a result that is not its own outcome";
  const attempt = operation.attempts.find((a) => a.attempt === effect.attempt);
  if (!attempt) return "records an outcome of an attempt that no entry opened";
  if (attempt.outcomes.length > 1 || decisive(latest(attempt)) || (attempt.outcomes.length === 1 && effect.result === "unknown")) return "records an outcome of an attempt that has its last one";
  if (effect.selected === true && (effect.result !== "confirmed" || operation.selected !== null)) return "selects a second result, or one that is not confirmed";
  const outcome: OutcomeState = { seq: entry.seq, result: effect.result, evidence: evidenceDigest(input.evidence), selected: effect.selected };
  return {
    ...operation, selected: effect.selected === true ? effect.attempt : operation.selected,
    attempts: operation.attempts.map((a) => (a === attempt ? { ...a, outcomes: [...a.outcomes, outcome] } : a)),
  };
}

/**
 * What an offered outcome meets in the history, before anything is judged
 * (item 6). `repeat`: a second copy of an answer that is recorded writes
 * nothing, and is answered with the recorded entry. `conflict`: an answer
 * that contradicts a recorded `confirmed` or `refused` of the same attempt
 * writes nothing, and is answered `outcome-conflict`, with the entry it
 * contradicts. Null: neither, and the outcome is judged.
 *
 * An `unknown` is no answer. Offered for an attempt that has any outcome, it
 * writes nothing: it is answered with the attempt's first outcome.
 */
export function recordedOutcome(view: StateView, outcome: OutcomeInput): { result: "repeat" | "conflict"; seq: number } | null {
  const outcomes = view.operation(outcome.operation)?.attempts.find((a) => a.attempt === outcome.attempt)?.outcomes ?? [];
  if (outcomes.length === 0) return null;
  if (outcome.result === "unknown") return { result: "repeat", seq: outcomes[0]!.seq };
  let digest: Digest | null = null;
  try {
    digest = evidenceDigest(outcome.evidence);
  } catch {
    // Evidence with no canonical bytes is no copy of anything recorded. With no decisive outcome it is judged, and refused there.
  }
  const same = outcomes.find((o) => o.result === outcome.result && o.evidence === digest);
  if (same) return { result: "repeat", seq: same.seq };
  const final = outcomes.find((o) => decisive(o));
  return final ? { result: "conflict", seq: final.seq } : null;
}

export type OutcomeDerivation =
  | { result: "write"; draft: Draft }
  | { result: "refused"; reason: "bad-input"; detail: string }
  | { result: "unavailable"; reason: "unavailable" };

const invalid = (detail: string): OutcomeDerivation => ({ result: "refused", reason: "bad-input", detail });

/**
 * The entry that one outcome writes (section 4.3), for an outcome that
 * `recordedOutcome` did not answer. The input is the operation, the attempt's
 * number, the result and the evidence. `selected`, the next attempt and
 * what the owner derives are effects, derived here from the state and never
 * supplied (the closing paragraph of section 4.3).
 *
 * The scope cannot check that an answer came from the outside system. That
 * is trusted, and a replay reports it as trusted: `own-answer` for an
 * attempt's own answer, `host-read` for a read (section 9.5).
 */
export function outcomeOf(view: StateView, outcome: OutcomeInput, owners: Owners | undefined): OutcomeDerivation {
  const operation = view.operation(outcome.operation);
  const attempt = operation?.attempts.find((a) => a.attempt === outcome.attempt);
  // Item 5, and rule 1: an outcome is of an attempt that an earlier entry opened. No outcome makes an attempt or an operation.
  if (!operation || !attempt) return invalid("no entry opened that attempt of that operation");
  const { result, evidence } = outcome;
  if (!["confirmed", "refused", "unknown"].includes(result)) return invalid("the result is confirmed, refused or unknown");
  // Item 4: `unknown` has the basis `none`, and no other result has it.
  const bases: readonly unknown[] = result === "unknown" ? ["none"] : ["own-answer", "read"];
  if (typeof evidence !== "object" || evidence === null || !bases.includes(evidence.basis)) return invalid(`a ${result} outcome has no such basis`);
  try {
    evidenceDigest(evidence);
  } catch {
    return invalid("the evidence has no canonical bytes");
  }
  // Item 3: an attempt has at most two outcomes, and the second follows only an `unknown`.
  const first = attempt.outcomes[0] ?? null;
  if (attempt.outcomes.length > 1 || decisive(first) || (first !== null && result === "unknown")) return invalid("the attempt has its last outcome");
  // Rule 2: an outcome that is not known stays unknown until that request's own authenticated answer. So the late answer has the
  // basis `own-answer`, and nothing else follows an `unknown`: not a read, not a listing, not a later attempt, not elapsed time.
  // A completion fence, and a token's end time (rule 4), have no basis in the contract (points O11 and O12): neither settles here.
  if (first !== null && evidence.basis !== "own-answer") return invalid("only that attempt's own answer follows an unknown outcome");
  const rules = owners?.rules(operation.owner, operation.kind) ?? null;
  // Fail closed: `selected` and the next attempt are the owner's to say, so with no rules nothing is derived and nothing is written.
  if (!rules) return { result: "unavailable", reason: "unavailable" };
  // Rule 3 and item 4: a read counts only where the owner defines it as decisive. A listing, an inventory or an occupied name never is for a create.
  if (evidence.basis === "read" && !rules.read) return invalid("a read is not decisive for that kind of operation");
  if (rules.wellFormed && !rules.wellFormed(result, evidence)) return invalid("the evidence is not well formed for its owner");

  // Item 7: `selected` is true when the result is `confirmed`, the slot is empty at this commit and the owner's guard holds. Every
  // other `confirmed` outcome of a selecting operation is recorded as not selected. The order of the outcome entries decides.
  const selected = rules.selects && result === "confirmed" ? operation.selected === null && (rules.holds?.(view, operation, outcome) ?? true) : null;
  // Item 2: the outcome entry of attempt n opens attempt n + 1 when its result is `refused` or `unknown`, the owner's retry rule
  // allows another, fewer than the stated number are opened and nothing is selected. Rule 7: none is opened beyond the stated
  // number, and nothing here reads the scope's free room. The room was reserved by the entry that opened the operation.
  const last = attempt.attempt === operation.attempts.length;
  const next = result !== "confirmed" && last && operation.attempts.length < operation.most && operation.selected === null && rules.retries(result, operation);
  const derived = rules.derives?.(view, operation, outcome, selected) ?? { effects: [], sends: [], opens: [] };
  // Section 17.2, row 5: an outcome entry is never asked whether it fits (section 17.3), so what it opens was reserved with its own
  // operation, as the closure that the owner declares. An owner whose outcome would open more has broken its own declaration:
  // fail closed, and nothing is written.
  if (derived.opens.reduce((entries, open) => entries + reservedBy(open, owners), 0) > (rules.closure ?? 0)) return { result: "unavailable", reason: "unavailable" };
  const effects: Effect[] = [
    { effect: "attempt", operation: operation.id, attempt: attempt.attempt, result, selected },
    ...(next ? [{ effect: "attempt", operation: operation.id, attempt: attempt.attempt + 1, result: "opened", selected: null } as const] : []),
    ...derived.effects,
    // Item 7, and rule 2: a cleanup, like a retry, is a new operation with its own identity and its own attempts.
    ...derived.opens.flatMap((open, k) => operationOpening(k, open)),
  ];
  const input: Input = { type: "outcome", operation: outcome.operation, attempt: outcome.attempt, result, evidence };
  // An outcome judges no time, so it may be written clamped (section 5.3).
  return { result: "write", draft: { input, uses: [], prepared: [], effects, sends: derived.sends, judgesTime: false } };
}

/**
 * Rule 4: a token whose ID and end time are known is past its end when the
 * commit's reading is later than the end time by the margin, and is not
 * earlier than the previous entry's time. The end time is the host's, and
 * the reading is the scope's. It says nothing of a mint whose identity or
 * end time is unknown, or of a push in flight.
 *
 * This is the judgment and no more. The contract has no basis for an
 * outcome by an end time (point O12), so no attempt is settled by it.
 */
export function tokenPast(end: Timestamp, clock: Clock, marginSeconds: number): boolean {
  const at = timeMs(end);
  return at !== null && !clock.behind && timeMs(clock.reading)! > at + marginSeconds * 1000;
}

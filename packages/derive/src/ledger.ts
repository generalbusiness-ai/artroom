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
import { canonicalBytes, digestBytes, isEvidence, isPlatformDefinition } from "@generalbusiness/artroom-bytes";
import type { Own } from "./fields.ts";
import type { Draft } from "./judge.ts";
import type { AttemptState, Operation, OutcomeState, StateView } from "./state.ts";
import { timeMs, type Clock } from "./time.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { own } from "./values.ts";

export type Owner = CapabilityName | PlatformDefinition;
export type OutcomeInput = Extract<Input, { type: "outcome" }>;
type Result = OutcomeInput["result"];

/**
 * An outcome as it is offered (section 4.1, "An outcome states its owner and
 * its kind"). The component that offers it does not choose the operation's
 * owner or its kind: the judge reads both from the `operation` effect that
 * opened the operation, which the folded state holds, and sets them in the
 * input. An offer may state them, as a verifier's does when it derives a
 * sealed input again. An offer that states other values is `bad-input`.
 */
export type OutcomeOffered = Omit<OutcomeInput, "owner" | "kind"> & { owner?: unknown; kind?: unknown };

/** True when the offer states no owner and no kind, or the ones of its operation. */
export const namesOwn = (operation: Pick<Operation, "owner" | "kind">, outcome: OutcomeOffered): boolean =>
  (outcome.owner === undefined || outcome.owner === operation.owner) && (outcome.kind === undefined || outcome.kind === operation.kind);

/** Item 1: the operation's ID is the `seq` of the entry that opened it and the record's ordinal there. */
export const operationId = (seq: number, k: number): OperationId => `${seq}:${k}`;

/** What the entry that opens an operation states: the owner, the kind, and the most attempts the owner allows (item 1; G3). */
export interface Opening {
  owner: Owner; kind: string; attempts: number;
  /** Section 17.2a: the holder that the operation is for, by its item's ID. An opening of a kind that an item holds states it, and no other does. */
  for?: number;
}

/** What an owner derives from one outcome beside the ledger's own records: its records, its sends, and the operations it opens, such as a cleanup (item 7). */
export interface OutcomeDerived { effects: readonly Effect[]; sends: readonly Send[]; opens: readonly Opening[] }

/**
 * The most that one piece of code returns in one entry (section 6.1, "A
 * declared maximum for everything that derives"): effects, requests and
 * operations. Each is a constant of the version, or a constant times a
 * state bound that the version states.
 */
export interface Most { effects: number; requests: number; operations: number }

/**
 * What an owner's rule is told of the outcome entry that is being derived,
 * beside the state: `opens`, the number of the attempt that this entry
 * opens, or null when it opens none; and the pinned definition.
 */
export interface OutcomeAt { opens: number | null; definition: ValidDefinition }

/** The owner's rules for one kind of operation. Each is a function of what it is given, and reads nothing else. */
export interface OperationRules {
  /** Item 7: the kind selects one result, as a founding claim selects one repository. */
  selects: boolean;
  /** Item 4: a read of the outside system is decisive for this kind. Rule 3: it never is for a create. */
  read: boolean;
  /**
   * Item 2: the owner's retry rule. Rule 7 and section 17.3: it is not given the scope's free room, so it cannot read it. From the
   * scope contract's revision 19 (section 6.1, "A rule that decides a further attempt is given the state"; row I3-35) it is given
   * the folded state before the outcome entry, and the outcome as the judge sets it, as every rule of the entry is.
   */
  retries(result: "refused" | "unknown", operation: Operation, view: StateView, outcome: OutcomeInput): boolean;
  /** Item 7: the owner's local guard for a selection. Absent: it holds. */
  holds?(view: StateView, operation: Operation, outcome: OutcomeInput): boolean;
  /**
   * Whether the request of that attempt may be sent now (authority note,
   * section 5.7, "Which entry makes a token": the request of an attempt of a
   * staging "is sent only when both are `live`"). The runtime's driver asks
   * it before the attempt is marked as sent. False: the attempt stays
   * recorded and not sent, and the driver looks at it again after a later
   * outcome entry. It derives nothing and settles nothing. Absent: it may.
   */
  ready?(view: StateView, operation: Operation, attempt: number): boolean;
  /**
   * Item 4: the evidence is well formed for this owner. Absent: any body is. The ledger has checked that the evidence has a basis and
   * a body. It is given the folded state before the outcome entry and the outcome as the judge sets it, as the retry rule is: an
   * owner may state a body that names what its own records hold, such as the name of the attempt (authority note, section 12.1.1).
   */
  wellFormed?(result: Result, evidence: Evidence, view: StateView, outcome: OutcomeInput): boolean;
  /**
   * The body of the evidence of an `unknown` outcome of that attempt, where the owner states one (authority note, sections 12.1.1
   * and 12.1.2: `{ name }`, `{ credential }`, `{ id }` or an empty record). The runtime's driver asks it when no answer came, and
   * offers the outcome with that body and the basis `none`. It derives nothing: the judge checks the body, as it checks every
   * other, by `wellFormed`. `own`: the scope's own earlier entries, by position. Absent: the body is null.
   */
  unknown?(view: StateView, operation: Operation, attempt: number, own: Own): unknown;
  /**
   * The snapshots that the evidence names by digest (section 16.4): each is
   * a retained input, and the scope stores its bytes before the entry that
   * names the digest. Absent: the evidence of this kind names none.
   */
  retains?(evidence: Evidence): readonly Digest[];
  /** What the outcome derives beside the ledger's records. Absent: nothing. */
  derives?(view: StateView, operation: Operation, outcome: OutcomeInput, selected: boolean | null, at: OutcomeAt): OutcomeDerived;
  /**
   * The most that `derives` returns in one outcome entry of this kind, with
   * the two effects of each operation that it opens (section 6.1). An
   * outcome entry cannot be refused, so the count must hold before it is
   * derived: an outcome that would hold more writes nothing. Absent: the
   * owner declares none, and nothing is counted.
   */
  most?: Most;
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

/**
 * The rules of the owners that a runtime or a verifier has code for. Null:
 * none for that owner and kind.
 *
 * `reserves`: the entries that the owners' pending records reserve in this
 * state, beside their operations (section 17.2, row 6: "a capability record
 * awaiting its messages", and what the capability declares). `owed`, in
 * `reserve.ts`, adds it. Absent: the owners keep no record that reserves.
 */
export interface Owners {
  rules(owner: Owner, kind: string): OperationRules | null;
  reserves?(view: StateView, definition: ValidDefinition): number;
}

/**
 * The closure of one outcome entry of that kind of operation, in entries
 * (section 17.2, row 5, and "The closure of an operation"). A kind of the
 * pinned platform definition that states its attempts is counted from its
 * data, by what its mark may start: the validator computed it
 * (`Reserving`). For a held kind that is the part of `one(k)` for one
 * outcome entry. Every other kind has the closure that its owner's rules
 * declare. With no rules, no outcome is judged, so none derives anything.
 */
export function closureOf(owners: Owners | null | undefined, owner: Owner, kind: string, definition?: ValidDefinition): number {
  const counted = isPlatformDefinition(owner) ? own(definition?.reserving?.kinds, kind) : undefined;
  return counted && counted.attempts !== null ? counted.outcome.entries - 1 : (owners?.rules(owner, kind)?.closure ?? 0);
}

/**
 * The entries that one opening reserves when its entry is folded (section
 * 17.2, row 5): for each attempt it states, its first outcome and its late
 * answer, and with each of those the closure of one outcome entry.
 */
export const reservedBy = (open: Opening, owners: Owners | null | undefined, definition?: ValidDefinition): number => 2 * open.attempts * (1 + closureOf(owners, open.owner, open.kind, definition));

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
// The judge of an outcome calls this for what its owner opens, the judge of a preparation for what its step opens, and the code of
// a hold's workspace for a fork's creation and a revocation.
// I3 merge: the platform rules open their operations with it, in their own step.
export function operationOpening(k: number, open: Opening, held = false): Effect[] {
  if (!Number.isSafeInteger(open.attempts) || open.attempts < 1) throw new Error("an operation states at least one attempt");
  const operation: Effect = { effect: "operation", k, owner: open.owner, kind: open.kind, attempts: open.attempts, ...(open.for === undefined ? {} : { for: open.for }) };
  return held ? [operation] : [operation, { effect: "attempt", operation: { k }, attempt: 1, result: "opened", selected: null }];
}

/**
 * Item 1: attempt 1 of each operation that a provisional scope's genesis
 * holds, opened by the entry that records the confirmation. The operations
 * of the genesis, entry 0, are numbered from 0 in the order of its records,
 * so they are read from the folded state by their IDs. One that has an
 * attempt already is not held, and is left as it is.
 */
// The judge of a confirmation calls this (`delivery.ts`). The first genesis that holds an operation is the destination's, by its
// rule `declare-first-head` (plan step 9b; I3 deltas, entries EB12 and ER12).
export function heldOpenings(view: StateView): Effect[] {
  const effects: Effect[] = [];
  for (let k = 0; ; k++) {
    const operation = view.operation(operationId(0, k));
    if (!operation) return effects;
    if (operation.attempts.length === 0) effects.push({ effect: "attempt", operation: operation.id, attempt: 1, result: "opened", selected: null });
  }
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
// `holder`: the item that the operation is for, as the draw of its entry resolved the effect's `for` (section 17.2a; `draws.ts`).
export function openedBy(seq: number, effect: Extract<Effect, { effect: "operation" }>, holder?: number): Operation | string {
  if (!Number.isSafeInteger(effect.attempts) || effect.attempts < 1) return "states no attempt";
  return { id: operationId(seq, effect.k), owner: effect.owner, kind: effect.kind, most: effect.attempts, attempts: [], selected: null, ...(holder === undefined ? {} : { for: holder }) };
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
  // Section 4.1: the outcome's owner and kind are those of the operation, which the entry that opened it states.
  if (input.owner !== operation.owner || input.kind !== operation.kind) return "names another owner or kind than its operation has";
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
export function recordedOutcome(view: StateView, outcome: OutcomeOffered): { result: "repeat" | "conflict"; seq: number } | null {
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
 * supplied (the closing paragraph of section 4.3). The input's `owner` and
 * `kind` are the operation's, read from the state, and an offer that states
 * others is refused (section 4.1).
 *
 * The scope cannot check that an answer came from the outside system. That
 * is trusted, and a replay reports it as trusted: `own-answer` for an
 * attempt's own answer, `host-read` for a read (section 9.5).
 */
export function outcomeOf(view: StateView, definition: ValidDefinition, outcome: OutcomeOffered, owners: Owners | undefined): OutcomeDerivation {
  const operation = view.operation(outcome.operation);
  const attempt = operation?.attempts.find((a) => a.attempt === outcome.attempt);
  // Item 5, and rule 1: an outcome is of an attempt that an earlier entry opened. No outcome makes an attempt or an operation.
  if (!operation || !attempt) return invalid("no entry opened that attempt of that operation");
  if (!namesOwn(operation, outcome)) return invalid("the outcome names another owner or kind than its operation has");
  const { result, evidence } = outcome;
  if (!["confirmed", "refused", "unknown"].includes(result)) return invalid("the result is confirmed, refused or unknown");
  // Section 4.1: the evidence of every outcome has a basis and a body, whatever its owner checks. An owner's rule may narrow the
  // body, and none may let it be absent.
  if (!isEvidence(evidence)) return invalid("the evidence is a basis and a body");
  // Item 4: `unknown` has the basis `none`, and no other result has it.
  const bases: readonly unknown[] = result === "unknown" ? ["none"] : ["own-answer", "read"];
  if (!bases.includes(evidence.basis)) return invalid(`a ${result} outcome has no such basis`);
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
  // What an owner's rule and the entry are given: the input as the judge sets it, with the operation's owner and kind.
  const input: OutcomeInput = { type: "outcome", operation: operation.id, attempt: attempt.attempt, owner: operation.owner, kind: operation.kind, result, evidence };
  if (rules.wellFormed && !rules.wellFormed(result, evidence, view, input)) return invalid("the evidence is not well formed for its owner");

  // Item 7: `selected` is true when the result is `confirmed`, the slot is empty at this commit and the owner's guard holds. Every
  // other `confirmed` outcome of a selecting operation is recorded as not selected. The order of the outcome entries decides.
  const selected = rules.selects && result === "confirmed" ? operation.selected === null && (rules.holds?.(view, operation, input) ?? true) : null;
  // Item 2: the outcome entry of attempt n opens attempt n + 1 when its result is `refused` or `unknown`, the owner's retry rule
  // allows another, fewer than the stated number are opened and nothing is selected. Rule 7: none is opened beyond the stated
  // number, and nothing here reads the scope's free room. The room was reserved by the entry that opened the operation.
  const last = attempt.attempt === operation.attempts.length;
  const next = result !== "confirmed" && last && operation.attempts.length < operation.most && operation.selected === null && rules.retries(result, operation, view, input);
  const derived = rules.derives?.(view, operation, input, selected, { opens: next ? attempt.attempt + 1 : null, definition }) ?? { effects: [], sends: [], opens: [] };
  // Section 17.2, row 5: an outcome entry is never asked whether it fits (section 17.3), so what it opens was reserved with its own
  // operation, as the closure that the owner declares. An owner whose outcome would open more has broken its own declaration:
  // fail closed, and nothing is written.
  // Section 17.2a: an opening that states `for` is of a held kind, and is in no closure: it draws on the count of its holder, and
  // a draw past the count is a fault (`drawsOf`, which every judge asks of the entry that it derived). Nothing is exempt: an
  // opening is inside the closure of its operation, or it is counted by a holder.
  const closed = derived.opens.filter((open) => open.for === undefined).reduce((entries, open) => entries + reservedBy(open, owners, definition), 0);
  if (closed > closureOf(owners, operation.owner, operation.kind, definition)) return { result: "unavailable", reason: "unavailable" };
  // Section 6.1, "An entry that cannot be refused": the same for the most that the owner declares for one outcome entry.
  const { most } = rules;
  if (most && (derived.effects.length + 2 * derived.opens.length > most.effects || derived.sends.length > most.requests || derived.opens.length > most.operations)) return { result: "unavailable", reason: "unavailable" };
  const effects: Effect[] = [
    { effect: "attempt", operation: operation.id, attempt: attempt.attempt, result, selected },
    ...(next ? [{ effect: "attempt", operation: operation.id, attempt: attempt.attempt + 1, result: "opened", selected: null } as const] : []),
    ...derived.effects,
    // Item 7, and rule 2: a cleanup, like a retry, is a new operation with its own identity and its own attempts.
    ...derived.opens.flatMap((open, k) => operationOpening(k, open)),
  ];
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

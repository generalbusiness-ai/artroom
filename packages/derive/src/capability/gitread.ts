/**
 * The rules of `git-read@1` (scope contract, sections 6.11 and 16.4;
 * authority note, sections 3.11 and 6.2): one guard, `ancestry`. It reads
 * the `check` record that the capability `hold@1` keeps for an intent and a
 * root, whose member `record` is the ancestry record of `ancestry.ts`.
 *
 * - `ledgerOf`: the staging lane's own history as the walk and the guard
 *   read it: its roots under the source commitment, and its prior checks.
 * - `gitRead`: the guard, as a `Capabilities` value.
 *
 * What the guard judges in the commit, and what the walk and a replay judge
 * (authority note, section 6.2, "How the guard finds a selected input, and
 * where reachability is judged", decided in revision 21). In the commit it
 * has the folded state, this scope's own entries and the retained snapshot.
 * It has no commit object: none is retained, and a commit is read by its ID
 * from the repository. So it judges the left column of that section's
 * table: guards 1, 2, 6 and 7 in full, and guards 3 to 5 as far as they
 * read the lane's state and the snapshot. That `published` is recorded
 * exactly when the commit is reachable from the recorded head, that no
 * stop is reachable from it, that every commit of a prior check's F is
 * carried unless it is, and that a `selected-report` stop's commit is the
 * commit of its input's report, are derived from commits. The runtime's
 * `walk` derived them when it built the record, and a replay derives them
 * again (section 9.3, "An ancestry record").
 *
 * The step `job-read` (authority note, sections 3.11 and 5.7; plan step 24)
 * is the second half of this file: the checker's signed request for a job's
 * read token, the `token` record that it makes, and the rules of the two
 * operations that this capability then owns, the token's mint and its
 * revocation. `gitRead` is the code of both halves.
 */

import type { CapabilityName, Digest, Evidence, FactRef, FieldValue, Intent, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { isDigest, isFactRef, isLocalId, isRecord, timeMs } from "@generalbusiness/artroom-bytes";
import type { Capabilities, CapabilityGiven, Maximum, Recorded } from "../capability.ts";
import { isLocalFact, type Own } from "../fields.ts";
import { WINDOWS, type Window } from "../grant.ts";
import { operationId, type Opening, type OperationRules, type OutcomeDerived, type OutcomeInput, type Owners } from "../ledger.ts";
import { recordEffects, stepsOf, type StepDerived, type StepGiven, type StepRefusal, type Steps } from "../prepare.ts";
import type { Item, Operation, RecordState, StateView } from "../state.ts";
import type { ValidDefinition } from "../validate/index.ts";
import { own as slotOf, same } from "../values.ts";
import { foreignOn, isAncestryCheck, snapshotOf, snapshotRead, type AncestryCheck, type OwnRoot, type PriorCheck } from "./ancestry.ts";
import { HOLD } from "./hold.ts";

export const GIT_READ: CapabilityName = "git-read@1";

/**
 * The staging lane's history, as the ancestry check reads it (section 6.2):
 * its roots under the source commitment, and its prior checks under it.
 *
 * A prior check is a `check` record that is `recorded`, for a root under
 * the source commitment, whose pin shows that the act was admitted: the pin
 * holds the admitting entry. For an act of this lane the prior check is the
 * entry that admitted the act. For a consumer in another lane it is the
 * check entry itself, once the lane has recorded a `pin-confirm` for the
 * pin, or an `unpin` with the manifest's fact. A root whose act was refused
 * or never admitted, and a pin that is still `provisional`, give none.
 *
 * `own` reads this scope's sealed entries, for the hash of each prior
 * check's entry. `before`: only entries earlier than that position count.
 */
export function ledgerOf(view: StateView, own: Own | undefined, at: ScopeRef, under: unknown, before: number): { roots: OwnRoot[]; checks: PriorCheck[] } {
  const roots = view.records(HOLD, "root", { member: "under", value: under }).map((r) => ({ number: r.key[0] as number, commit: r.values["commit"] as string, state: r.state }));
  const checks = view.records(HOLD, "check", { states: ["recorded"] }).flatMap((check): PriorCheck[] => {
    const consumer = check.values["consumer"];
    const pin = view.record(HOLD, "pin", [consumer as FieldValue, check.values["intent"] as FieldValue]);
    const record = check.values["record"];
    const admitted = pin?.values["admitted"];
    const seq = same(consumer, at) ? admitted : admitted === null || admitted === undefined ? null : check.seq;
    const sealed = isLocalId(seq) && seq < before ? own?.(seq) : null;
    if (!roots.some((r) => r.number === check.values["root"]) || !sealed || !isAncestryCheck(record)) return [];
    return [{ commit: record.commit, root: check.values["root"] as number, checked: { at, seq: sealed.entry.seq, hash: sealed.hash }, foreign: record.start.foreign, F: record.F.map((f) => f.commit) }];
  });
  return { roots, checks };
}

/** The `check` record that the guard reads: this scope's own, for this intent, or the one that a presented check entry carries. */
function checked(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): { state: string; values: Readonly<Record<string, unknown>>; local: { pin: RecordState; root: RecordState } | null } | null {
  const presented = args["pin"];
  if (presented !== null && presented !== undefined) {
    // Section 16.3: another lane's check entry, presented beside the intent and retained in `uses`. The record is what that one
    // sealed entry recorded, and not the record's present state.
    const carried = isFactRef(presented) ? (given.facts.get(presented.hash)?.entry.effects ?? []).filter((e) => e.effect === "record" && e.capability === HOLD && e.kind === "check") : [];
    const only = carried.length === 1 ? carried[0]! : null;
    return only && only.effect === "record" ? { state: only.state, values: only.values, local: null } : null;
  }
  const pin = isDigest(given.intent) ? given.view.record(HOLD, "pin", [given.scope.at, given.intent]) : null;
  const root = pin ? given.view.record(HOLD, "root", [pin.values["root"] as number]) : null;
  const check = pin && root ? given.view.record(HOLD, "check", [given.intent as Digest, root.key[0]!]) : null;
  return pin && root && check ? { state: check.state, values: check.values, local: { pin, root } } : null;
}

/** The state and the reference slot that version 1 of `git-read` reads of a selected input, as `hold@1` reads `holder` and `under` of a hold. */
const SELECTED = "selected";
const FOR = "for";

/**
 * Whether a fact names a selected input of the source commitment at this
 * commit (authority note, section 6.2, "By which names the guard finds an
 * input"). The fact is a local fact of the staging lane: it names this
 * scope, with its incarnation, and the hash of this scope's entry at that
 * position. The input is the item that this entry opened, whose ID is the
 * fact's position. It holds when the item exists, its state is the state
 * named `selected`, and its reference slot named `for` holds the source
 * commitment. The item's type is not named. A fact of another scope fails,
 * and so does every fact in a definition with no such state or slot.
 */
function selectedInput(given: CapabilityGiven, fact: FactRef, under: unknown): boolean {
  if (!isLocalFact(fact, given.scope.at)) return false;
  const item = given.view.item(fact.seq);
  return item !== null && item.opened === fact.hash && item.state === SELECTED && isLocalId(under) && slotOf(item.refs, FOR) === under;
}

/**
 * Guards 2 to 6 of section 6.2, for a record that is this scope's own,
 * against this scope's records and items at this commit: the left column of
 * the table of that section. False: what was read no longer fits the lane's
 * state, and the act is refused `ancestry-stale`.
 */
function fits(record: AncestryCheck, { pin, root }: { pin: RecordState; root: RecordState }, given: CapabilityGiven): boolean {
  // Guard 2: the root is the one that the entry relies on, and it is `live`.
  if (record.root.number !== root.key[0] || pin.values["root"] !== root.key[0] || root.state !== "live") return false;
  const { roots, checks } = ledgerOf(given.view, given.own, given.scope.at, root.values["under"], given.self);
  const prior = (commit: string, fact: FactRef): PriorCheck | undefined => checks.find((c) => c.commit === commit && same(c.checked, fact));
  // Guard 3: sorted at this commit, the staged refs of the snapshot on the commit give the same `foreign`, and the basis stands.
  // The snapshot's bytes are a retained input of this scope, stored before the check entry that names their digest (section 16.4).
  const kept = given.snapshot?.(record.snapshot.digest) ?? null;
  const pairs = kept === null ? null : snapshotRead(record.snapshot.digest, kept);
  const snapshot = pairs ? snapshotOf(pairs) : null;
  if (!snapshot || snapshot.digest !== record.snapshot.digest || snapshot.count !== record.snapshot.count) return false;
  const { start } = record;
  if (foreignOn(snapshot.pairs, record.commit, given.scope.at, roots) !== start.foreign) return false;
  const row = record.F.some((f) => "start" in f);
  if ("basis" in start) {
    if (start.basis.kind === "input" && !selectedInput(given, start.basis.input, root.values["under"])) return false;
    if (start.basis.kind === "own-check" && prior(record.commit, start.basis.checked)?.foreign !== null) return false;
    if (start.basis.kind === "row" && !record.F.some((f) => "start" in f && f.commit === record.commit && f.ref === start.foreign)) return false;
  }
  if (row !== ("basis" in start && start.basis.kind === "row")) return false;
  for (const stop of record.stops) {
    // Guard 6, in full: the stop names an input that is `selected` under the source commitment at this commit.
    if (stop.kind === "selected-report") {
      if (!selectedInput(given, stop.input, root.values["under"])) return false;
      continue;
    }
    // Guard 4: the root, with that number and state, under the source commitment; an earlier prior check of that commit; and the
    // stop is not the act's commit.
    if (stop.commit === record.commit || !prior(stop.commit, stop.checked)) return false;
    if (!roots.some((r) => r.number === stop.root && r.commit === stop.commit && r.state === stop.state)) return false;
  }
  // Guard 5: each carried commit is in the F of the prior check that its `via` stop names.
  return record.F.every((f) => {
    if (!("via" in f)) return true;
    const stop = record.stops.find((s) => s.kind === "own-root" && s.commit === f.via);
    return stop?.kind === "own-root" && prior(stop.commit, stop.checked)?.F.includes(f.commit) === true;
  });
}

const commits = (list: unknown): string[] => (Array.isArray(list) ? list.filter((c): c is string => typeof c === "string") : []);

/**
 * The guard `ancestry` (section 6.11). A `check` record for this intent and
 * commit exists: local, or carried by `pin`. Its state is `recorded`. Its
 * ancestry record names `commit`. When the record is local, guards 2 to 6
 * hold against this scope's records at this commit. And the list F passes
 * the row: for `report`, F is empty; for `manifest`, each commit of F is in
 * `selected` or `earlier`, or is carried through a stop at such a commit.
 *
 * When the record is carried by another lane's entry, that lane judged
 * guards 2 to 6 in the commit of its check entry, and only the commit and
 * the row are judged here.
 *
 * The refusal `unnamed-work` is "with the commit" in the texts. A guard
 * answers with a name alone, so the commit is not carried (I3 deltas, entry
 * EF13).
 */
function ancestry(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): true | string {
  const check = checked(args, given);
  if (!check) return "ancestry-stale";
  if (check.state === "too-large") return "ancestry-too-large";
  const record = check.values["record"];
  if (check.state !== "recorded" || !isAncestryCheck(record) || record.commit !== args["commit"] || check.values["commit"] !== args["commit"]) return "ancestry-stale";
  if (check.local && !fits(record, check.local, given)) return "ancestry-stale";
  const named = new Set([...commits(args["selected"]), ...commits(args["earlier"])]);
  const passes = args["row"] === "report" ? record.F.length === 0 : args["row"] === "manifest" && record.F.every((f) => named.has(f.commit) || ("via" in f && named.has(f.via)));
  return passes ? true : "unnamed-work";
}

// ---------------------------------------------------------------- the step `job-read`

/**
 * The kinds of the operations that `git-read@1` opens, and the attempts of
 * each. The note names no kind. The words are those that `hold@1` uses for
 * the same two effects, so one driver reads both (I3 deltas, entry EW4).
 * A mint has 1 attempt (section 3.11, "What it opens"). A revocation has at
 * most 3, as every revocation has (section 5.7; gap G3).
 */
export const GIT_READ_KINDS = { mint: "mint", revoke: "revoke" } as const;
export const GIT_READ_ATTEMPTS = { mint: 1, revoke: 3 } as const;

/** The action whose grant the step `job-read` is judged on (section 3.11, "What the lane judges in that entry": "The signer holds `change.check`"). */
export const JOB_READ_ACTION = "change.check";

/** The purpose of a job's read token, as its record states it (section 5.7, the record `token`: "check read"), in the form of the other purposes. */
export const CHECK_READ = "check-read";

/**
 * The names by which version 1 of `git-read` reads a job and the lane's copy
 * of the rules, as it reads a selected input by `selected` and `for` (I3
 * deltas, entry EW2). They are the names of the `change` lane's forms: the
 * item type `job`, its state `requested`, its values `name` and `deadline`;
 * and the item type `rules`, whose value `checks` is a list of records with
 * a `name` and a `checker`. A definition without them has no job that this
 * step can read, and the step is refused there.
 */
const JOB = { type: "job", requested: "requested", name: "name", deadline: "deadline" } as const;
const RULES = { type: "rules", checks: "checks", name: "name", checker: "checker" } as const;

/**
 * The signed intent that asks for the step `job-read`. The note says that
 * it "names the job's fact", and leaves its form to this step (section 5.7,
 * "The steps with no act": "its form is not stated here"). It is written as
 * the three intents of that table are (I3 deltas, entry EW1):
 *
 * | `kind` | `to` | `fields` |
 * |---|---|---|
 * | `git-read@1:job-read` | The change lane that holds the job | `job`: the fact of the `request-check` entry that opened the job |
 *
 * `on` is null and `expected` is empty. A field that the table does not
 * name, or a missing one, refuses the step `bad-field`. The kind has the
 * form of a step kind, so the intent can never be admitted as an act. The
 * judge of a preparation has checked `to`: the step is not `foreign`.
 */
function jobReadAsked(intent: Intent): { job: FactRef } | null {
  const names = Object.keys(intent.fields);
  const whole = intent.kind === `${GIT_READ}:job-read` && intent.on === null && Object.keys(intent.expected).length === 0 && names.length === 1 && names[0] === "job";
  const job = whole ? intent.fields["job"] : null;
  return isFactRef(job) ? { job } : null;
}

const failed = (detail: string): { refused: StepRefusal } => ({ refused: { reason: "guard-failed", detail } });

/** The job that a fact names: the item that this scope's entry of that hash opened, of the type `job`. Null: the fact names none here. */
function jobOf(given: Pick<StepGiven, "view" | "scope">, fact: FactRef): Item | null {
  const item = isLocalFact(fact, given.scope.at) && fact.at.kind === given.scope.at.kind ? given.view.item(fact.seq) : null;
  return item !== null && item.type === JOB.type && item.opened === fact.hash ? item : null;
}

/** The checker that the lane's copy of the rules names for a check of that name. Null: the lane holds no one copy, or the copy names the check never or twice. */
function checkerOf(view: StateView, definition: ValidDefinition, name: unknown): unknown {
  const states = Object.keys(slotOf(definition.declared.items, RULES.type)?.states ?? {});
  const copies = states.length === 0 ? [] : view.page(RULES.type, states, null, 2).items;
  const checks = copies.length === 1 ? copies[0]!.values[RULES.checks] : null;
  const named = Array.isArray(checks) ? checks.filter((k) => isRecord(k) && k[RULES.name] === name) : [];
  return named.length === 1 ? (named[0] as Record<string, unknown>)[RULES.checker] : null;
}

/**
 * The step `job-read` (section 3.11, "How a job reaches the checker, and
 * who holds its read token"; section 5.7, the table of steps). The judge of
 * a preparation has checked the signature, `notAfter` and the grant of
 * `change.check` on an observation within ten seconds. Here, in the order
 * of the note's row:
 *
 * 1. The intent is the one of the table above: `bad-field`.
 * 2. The fact names a job of this lane.
 * 3. The signer's member is the checker that the lane's copy of the rules
 *    names for that job's check.
 * 4. The job is `requested`.
 * 5. No `token` record of this capability names the job: it is the first
 *    such entry for it. The same signed intent again is answered with the
 *    first entry by the judge's index, before this code runs. Another
 *    intent for the same job is refused here, and mints nothing (I3
 *    deltas, entry EW5).
 *
 * The note gives none of the refusals 2 to 5 a name, so each is
 * `guard-failed` (I3 deltas, entry EF3).
 *
 * It derives one `token` record, `minting`, with the purpose `check-read`,
 * the job's fact, the job's deadline as `before`, and its mint, an
 * operation with 1 attempt. So at most one read token exists for a job,
 * which is the second support of "at most one run for a job".
 *
 * **A filtered check.** The note adds, "for a filtered check, the snapshot
 * repository's record and its creation". No adopted text says which check
 * is filtered: a configuration has no such member (section 3.11, the table
 * of a configuration's members), and the record has no name and no states.
 * So this step derives no snapshot repository, for any job (I3 deltas,
 * entry EW3). `packages/git/src/snapshot.ts` has what such a creation would
 * write.
 */
function jobRead(given: StepGiven): StepDerived | { refused: StepRefusal } {
  const asked = jobReadAsked(given.intent);
  if (!asked) return { refused: { reason: "bad-field", detail: "the intent is not the one of the step job-read: the job's fact, and nothing else" } };
  const job = jobOf(given, asked.job);
  if (!job) return failed("the fact names no job of this lane");
  const checker = checkerOf(given.view, given.definition, job.values[JOB.name]);
  if (checker === null || checker === undefined || !same(checker, given.signer.member)) return failed("the signer is not the checker that the lane's copy of the rules names for this job's check");
  if (job.state !== JOB.requested) return failed("the job is not requested");
  if (given.view.records(GIT_READ, "token", { member: "job", value: asked.job }).length > 0) return failed("a job-read entry exists for this job");
  const deadline = job.values[JOB.deadline];
  if (timeMs(deadline) === null) return failed("the job states no deadline, so no token can end before it");
  return {
    records: [{ kind: "token", key: [given.view.recordCount(GIT_READ, "token") + 1], state: "minting", values: { purpose: CHECK_READ, job: asked.job, before: deadline, mint: operationId(given.self, 0), id: null, ends: null, revocation: null } }],
    opens: [{ owner: GIT_READ, kind: GIT_READ_KINDS.mint, attempts: GIT_READ_ATTEMPTS.mint }],
  };
}

// ---------------------------------------------------------------- the operations of a job's read token

const NOTHING: OutcomeDerived = { effects: [], sends: [], opens: [] };
const REVOKE: Opening = { owner: GIT_READ, kind: GIT_READ_KINDS.revoke, attempts: GIT_READ_ATTEMPTS.revoke };
const recorded = (made: readonly Recorded[], opens: readonly Opening[] = []): OutcomeDerived => ({ effects: recordEffects(GIT_READ, made), sends: [], opens });
const moved = (r: RecordState, state: string, values: Readonly<Record<string, unknown>> = {}): Recorded => ({ kind: r.kind, key: r.key, state, values: { ...r.values, ...values } });
const tokenBy = (view: StateView, state: string, member: "mint" | "revocation", operation: Operation): RecordState | null => view.records(GIT_READ, "token", { states: [state], member, value: operation.id })[0] ?? null;
const ownAnswer = (result: OutcomeInput["result"], evidence: Evidence): boolean => result === "unknown" || evidence.basis === "own-answer";
/** The body of the evidence of a `confirmed` mint: the host's token ID and end time, as for a token of `hold@1` (section 5.7, "Evidence of each outside effect"; I3 deltas, entry EF5). */
const minted = (body: unknown): { token: string; ends: Timestamp } | null => (isRecord(body) && typeof body["token"] === "string" && body["token"] !== "" && timeMs(body["ends"]) !== null ? { token: body["token"], ends: body["ends"] as Timestamp } : null);

/**
 * Whether the use of a job's read token has ended, or may not begin
 * (section 3.11, "When the token ends"; section 5.7, "A mint that is
 * answered after its use has ended").
 *
 * - The job is decided, or a retry superseded it: every state but
 *   `requested` and `timed-out`. A deadline's timed entry "opens nothing",
 *   and a late answer may still decide a `timed-out` job, so that state
 *   does not end the use.
 * - The token would not end before the job's deadline, by the host's own
 *   end time: `ends` is not earlier than `before`. The note's rule is that
 *   it "ends before the job's deadline". A token that does not is never
 *   `live` (I3 deltas, entry EW6).
 */
function useEnded(view: StateView, token: RecordState, ends: Timestamp): boolean {
  const fact = token.values["job"];
  const job = isFactRef(fact) ? view.item(fact.seq) : null;
  const waiting = job !== null && (job.state === JOB.requested || job.state === "timed-out");
  const before = timeMs(token.values["before"]);
  return !waiting || before === null || timeMs(ends)! >= before;
}

/** The entries that one revocation reserves when it is opened: two for each of its attempts (section 17.2, row 5). */
const REVOKED = 2 * GIT_READ_ATTEMPTS.revoke;

/**
 * The rules of the two operations, as those of a token of `hold@1` are
 * (section 5.7, the record `token`). A mint, by that attempt's own answer:
 * `confirmed` while the use has not ended makes the token `live`, with the
 * host's ID and end time. `confirmed` after it ended makes it `revoking`,
 * straight from `minting`, with the revocation by that ID: the token is
 * never `live`. `refused` makes it `ended`: nothing was minted. `unknown`
 * leaves it `minting`, and nothing is minted again for that operation. A
 * revocation: its `confirmed` outcome makes the token `ended`, and every
 * other outcome leaves it `revoking`, with the duty.
 */
const OPERATION_RULES: Readonly<Record<string, OperationRules>> = {
  [GIT_READ_KINDS.mint]: {
    selects: false, read: false, retries: () => false, closure: REVOKED, most: { effects: 3, requests: 0, operations: 1 },
    wellFormed: (result, evidence) => ownAnswer(result, evidence) && (result !== "confirmed" || minted(evidence.body) !== null),
    derives: (view, operation, outcome) => {
      const token = tokenBy(view, "minting", "mint", operation);
      if (!token || outcome.result === "unknown") return NOTHING;
      if (outcome.result === "refused") return recorded([moved(token, "ended")]);
      const { token: id, ends } = minted(outcome.evidence.body)!;
      if (!useEnded(view, token, ends)) return recorded([moved(token, "live", { id, ends })]);
      return recorded([moved(token, "revoking", { id, ends, revocation: operationId(view.scope()!.head.seq + 1, 0) })], [REVOKE]);
    },
  },
  [GIT_READ_KINDS.revoke]: {
    selects: false, read: false, retries: () => true, wellFormed: ownAnswer, most: { effects: 1, requests: 0, operations: 0 },
    derives: (view, operation, outcome) => {
      const token = outcome.result === "confirmed" ? tokenBy(view, "revoking", "revocation", operation) : null;
      return token ? recorded([moved(token, "ended")]) : NOTHING;
    },
  },
};

/**
 * The entries that the pending records of `git-read@1` reserve, beside
 * their open operations (section 5.8, the row of a job: "its read token is
 * reserved by the step `job-read` that asks for it, as the row for a
 * `token` says"): 6 for each `live` token, for its revocation with at most
 * 3 attempts. While it is `minting`, the closure of its mint holds the same.
 */
const gitReadReserves = (view: StateView): number => REVOKED * view.recordCount(GIT_READ, "token", "live");

// I3 merge: nothing opens the revocation of a `live` read token. The note gives it to "the entry that decides the job, a `check` or
// a `check-error`" (section 3.11). Those are rows of the lane's data, and this capability declares no effect that a row could write,
// so no form lets that entry open an operation (I3 deltas, entry EW7). Until an owner states one, a `live` read token ends by its own
// end time at the host, its record stays `live`, and its duty stays reserved. Only a mint that is answered after the job is decided
// opens its revocation, above.

/**
 * The code of `git-read@1`, as one value for the three places that ask it:
 * the guard `ancestry` (`Capabilities`), the step `job-read` (`Steps`), and
 * the rules of the mint and the revocation of a job's read token, with what
 * a `live` token reserves (`Owners`). The version declares no effect. The
 * value holds no state and reads no port: the judge gives the guard the
 * snapshots that the scope retains.
 */
export function gitRead(): Capabilities & Steps & Owners {
  const step = (form: Maximum["form"], name: string, effects: number, operations: number): Maximum => ({ form, capability: GIT_READ, name, effects, requests: 0, operations });
  return {
    implements: (form: unknown, step?: string) => (typeof form === "string"
      ? form === GIT_READ && step === "job-read"
      : isRecord(form) && form["capability"] === GIT_READ && (form["form"] === "listed" || (form["form"] === "guard" && form["name"] === "ancestry") || (form["form"] === "kind" && form["name"] === `${GIT_READ}:job-read`))),
    guard: (capability, guard, args, given) => {
      if (capability !== GIT_READ || guard !== "ancestry") throw new Error(`${capability} has no code for the guard ${guard}`);
      return ancestry(args, given);
    },
    effect: (capability, effect) => { throw new Error(`${capability} has no code for the effect ${effect}`); },
    grant: (capability, step): { action: string; window: Window } | null => {
      if (capability !== GIT_READ || step !== "job-read") throw new Error(`${capability} has no code for the step ${step}`);
      // Section 3.3, the table of entries: the step `job-read` is judged on an observation that serves that one commit.
      return { action: JOB_READ_ACTION, window: WINDOWS.once };
    },
    derive: (capability, step, given) => {
      if (capability !== GIT_READ || step !== "job-read") throw new Error(`${capability} has no code for the step ${step}`);
      return jobRead(given);
    },
    rules: (owner, kind) => (owner === GIT_READ ? (slotOf(OPERATION_RULES, kind) ?? null) : null),
    reserves: gitReadReserves,
    // Section 6.1, "A declared maximum for everything that derives". The guard derives no effect. The step: one record, and two
    // effects for the one operation that it opens. An outcome: what its rule states above.
    maxima: [step("step", "job-read", 3, 1), ...Object.entries(OPERATION_RULES).map(([kind, rules]) => ({ ...step("outcome", kind, 0, 0), ...rules.most! }))],
  };
}

/**
 * One value for the code of several capability versions: each form, each
 * step and each kind of operation is asked of the part that has its code.
 * `first` may hold more than these, such as what a hold's entries derive for
 * its workspace and the binding of a reserved request, and those members are
 * kept as its own.
 */
export function capabilitiesOf<T extends Capabilities>(first: T, ...others: readonly Capabilities[]): T {
  const parts: readonly Capabilities[] = [first, ...others];
  const by = (capability: string, form: "guard" | "effect", name: string) => parts.find((p) => p.implements({ capability: capability as never, form, name })) ?? first;
  const asked = parts.map((p) => p.implements.bind(p) as (...asked: unknown[]) => boolean);
  // A step is asked with two arguments, a capability and a step, of each part that has steps. A form is asked of every part.
  const stepped = parts.flatMap((p) => stepsOf(p) ?? []);
  const stepOf = (capability: CapabilityName, step: string): Steps => stepped.find((p) => p.implements(capability, step)) ?? stepped[0]!;
  const owning = parts.flatMap((p) => (typeof (p as unknown as Partial<Owners>).rules === "function" ? [p as unknown as Owners] : []));
  return {
    ...first,
    // The declared maxima of every part. A part that declares none leaves the whole value with none, and nothing is counted.
    ...(parts.every((p) => p.maxima) ? { maxima: parts.flatMap((p) => p.maxima!) } : { maxima: undefined }),
    implements: ((...args: unknown[]) => asked.some((implemented) => implemented(...args))) as T["implements"],
    guard: (capability, guard, args, given) => by(capability, "guard", guard).guard(capability, guard, args, given),
    effect: (capability, effect, args, given) => by(capability, "effect", effect).effect(capability, effect, args, given),
    ...(stepped.length === 0 ? {} : {
      grant: ((capability, step, given) => stepOf(capability, step).grant(capability, step, given)) satisfies Steps["grant"],
      derive: ((capability, step, given) => stepOf(capability, step).derive(capability, step, given)) satisfies Steps["derive"],
    }),
    ...(owning.length === 0 ? {} : {
      rules: ((owner, kind) => owning.map((p) => p.rules(owner, kind)).find((rules) => rules !== null) ?? null) satisfies Owners["rules"],
      reserves: ((view, definition) => owning.reduce((n, p) => n + (p.reserves?.(view, definition) ?? 0), 0)) satisfies Owners["reserves"],
    }),
  };
}

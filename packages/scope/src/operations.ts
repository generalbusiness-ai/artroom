/**
 * Outside effects (scope contract, section 4.3; authority note, sections
 * 5.4 and 8.1): the driver of the attempts that entries opened. It sits
 * beside the outbox dispatcher, on the same alarm. The rules of the ledger
 * are derive's (`ledger.ts`). This file sends, and offers the scope what was
 * answered. "Rule n" is a ledger rule of the authority note's section 5.4.
 *
 * An attempt is in one of three places, and each step between them is one
 * durable write.
 *
 * 1. **Recorded.** The entry that opens the attempt is sealed, and its row
 *    is written in the same commit, with a wake-up (rule 1). Nothing was
 *    sent.
 * 2. **Perhaps sent.** Before the one request of the attempt leaves, the
 *    driver writes, durably, the time from which it may have left, and sets
 *    the alarm. That mark is written once and never cleared.
 * 3. **Answered.** The driver offers the scope an `outcome` input through
 *    the turn, like any other input, and derive's judge decides what it
 *    writes: `confirmed` or `refused` from the answer, or `unknown`, with
 *    the basis `none`, when no answer came.
 *
 * So a recorded attempt is sent at most once, across restarts. An attempt
 * that is found marked, with no outcome, is one whose process stopped
 * between the send and the outcome. It may have reached the outside system,
 * so it is never sent again: its outcome is `unknown`, and it stays a duty
 * until that request's own answer arrives (rule 2). A delivery to a scope is
 * idempotent and is sent again until it is acknowledged. An outside effect
 * is not, so nothing of the dispatcher's retry rule is here. A further try
 * is another attempt, which an entry opens (section 4.3, item 2), or another
 * operation. A trusted recovery port may repeat a safe read or retrieve
 * this attempt's retained reply while no outcome can be written; it never
 * repeats the outside mutation or clears its durable send mark.
 *
 * Nothing here runs inside a storage transaction. A pass runs after a
 * commit and from the object's alarm.
 */

import type { Bounds, CapabilityName, DecisiveEvidence, Entry, Evidence, FactRef, FactUse, KeyId, OperationId, PlatformDefinition, RetainedInput, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, isEvidence, isOperationId, isRetainedInput, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { clockOf, recordedOutcome, evidenceValues, valueDigest, settleOutcome, snapshotInput, snapshotRead, timeMs, timeOf, type Clock as Reading, type Fetched, type OutcomeOffered, type Owners } from "@generalbusiness/artroom-derive";
import { ownOf, valuesOf, type Scope } from "./core.ts";
import { report } from "./diag.ts";
import type { Wakes } from "./outbox.ts";
import type { Clock, Ports } from "./ports.ts";
import type { Sealed, Sending, Store } from "./store.ts";
import { LATE, within } from "./turn.ts";

/**
 * The one request of one attempt, as the port is given it. `origin` is the
 * entry that opened the operation: what the request names is read from that
 * entry, which is sealed, and from nothing else. Rule 5: so a request names
 * only what this scope's own records hold, and nothing is swept or guessed.
 */
export interface EffectRequest {
  scope: ScopeRef; operation: OperationId; attempt: number;
  owner: CapabilityName | PlatformDefinition; kind: string;
  origin: Sealed;
  /** Internal ledger bookkeeping, read back after this exact attempt's
   * durable mark. It grants no authority and is not caller-selected over RPC. */
  sentAt?: Timestamp;
}

/**
 * The outside system's answer to one request: that attempt's own answer, or
 * a read that the effect's owner defines as decisive (section 4.3, item 4).
 * The port says so, and the scope cannot check it: that an answer came from
 * the outside system, and was that attempt's own, is trusted, and a replay
 * reports it as trusted (section 9.5, the labels `own-answer` and
 * `host-read`).
 */
export interface EffectAnswer {
  result: "confirmed" | "refused"; evidence: DecisiveEvidence;
  /**
   * The snapshots of staged refs (section 16.4), and values in the byte domains
   * that this pinned owner declares, named by the evidence as retained inputs. The driver checks each against its digest,
   * and the scope stores them in the commit of the outcome entry, so the
   * bytes are there before any entry names the digest. An answer whose
   * evidence names a snapshot that is not given here, and that the scope
   * does not retain, is no answer.
   */
  retain?: readonly RetainedInput[];
}

/** How an offered answer was recorded. `conflict` is the contract's `outcome-conflict`: it contradicts the outcome that entry `seq` records, and nothing is written. */
export type OutcomeRecorded =
  | { recorded: "written"; fact: FactRef }
  | { recorded: "repeat"; seq: number }
  | { recorded: "conflict"; seq: number }
  | { recorded: "refused"; detail: string }
  | { recorded: "unavailable" };

/** Takes the late answer of an attempt that was sent, at any time after it, also after a restart. */
export type LateAnswers = (operation: OperationId, attempt: number, answer: EffectAnswer) => Promise<OutcomeRecorded>;

/**
 * The port for effects outside the service: one request of one attempt.
 *
 * `accepts`: whether this runtime sends requests of that owner and kind at
 * all. It is asked before anything is marked. `send`: one request, and its
 * answer, or null for none. It makes one request for each call, and never
 * repeats one. An answer that is lost, late or ill formed, and a call that
 * fails, each leave the attempt `unknown`. `late`: the driver gives the port
 * the function that takes an answer which arrives after its request was
 * recorded `unknown`, when the driver is made.
 *
 * `judged`: the driver tells the port that the scope has judged a decisive
 * answer of that attempt. `sealed` is the outcome entry that the answer
 * wrote, and the port is told after that entry's commit. Null: the answer
 * wrote no entry, because it was a copy, a contradiction or no answer. An
 * answer that cannot be written yet is not judged, and the port is not told
 * until it is. A port that holds something beside an answer, as the token
 * driver holds a plaintext (authority note, section 5.7, "The plaintext"),
 * releases or drops it here, on what the sealed entry says.
 */
export interface Outside {
  accepts(owner: CapabilityName | PlatformDefinition, kind: string): boolean;
  send(request: EffectRequest): Promise<EffectAnswer | null>;
  late?(deliver: LateAnswers): void;
  judged?(at: { scope: ScopeRef; operation: OperationId; attempt: number }, sealed: Sealed | null): void;
  /**
   * Trusted recovery for an already marked attempt with no recorded outcome.
   * `read` may repeat only a safe host read or retrieve that same attempt's
   * retained own reply. It must never send or repeat a mutation. `accepts`
   * declares the owner/kind for which this guarantee holds; the driver cannot
   * prove it. An unsuccessful read gets the existing drain retry delay only
   * while the owner's rules refuse its unknown outcome. Held answers take
   * precedence, and a written unknown mutation remains unchanged.
   */
  recovery?: {
    accepts(owner: CapabilityName | PlatformDefinition, kind: string): boolean;
    read(request: EffectRequest): Promise<EffectAnswer | null>;
  };
  /**
   * Trusted, pure retrieval of already received own replies, retained
   * durably by this port. One bounded page of public answer metadata only:
   * no plaintext credential, outside call or repeated mutation. `more`
   * means another bounded page remains. The driver cannot prove the port's
   * custody or provenance; it still checks the sent mark and submits each
   * reply through normal late-answer judgment. An answer in hand wins.
   */
  replies?(limit: number): {
    answers: Array<{ operation: OperationId; attempt: number; answer: EffectAnswer }>;
    more: boolean;
  };
  /**
   * The one-time read of a member's read credential, by its nonsecret handle, for the key whose session asks (I5;
   * `destination-host.ts`, `credential`). The plaintext leaves the port's custody as it is answered. Null: nothing is answered.
   * Absent: this port holds no such credential.
   */
  credential?(handle: string, key: KeyId): { token: string; ends: string; remote: string } | null;
}

/**
 * The production default: it sends nothing. So no attempt is sent. Each
 * stays recorded and not sent, with no outcome: its operation reads
 * `pending`, it keeps its reservation, and the driver asks for no wake-up on
 * its account. A host port replaces this (plan step 19). It is the `outside`
 * of `production()` in `ports.ts`.
 */
export const NO_OUTSIDE: Outside = { accepts: () => false, send: () => Promise.resolve(null) };

const keyOf = (operation: OperationId, attempt: number) => `${operation}#${attempt}`;
/**
 * An answer as the contract's outcome can hold it: a decisive result, and evidence with a basis and a body (`isEvidence`). Anything
 * else is no answer. That the evidence has canonical bytes is the ledger's check, in the turn (`derive/src/ledger.ts`, `settleOutcome`).
 */
export const isAnswer = (answer: unknown): answer is EffectAnswer => {
  const a = answer as { result?: unknown; evidence?: unknown; retain?: unknown } | null;
  return typeof a === "object" && a !== null && (a.result === "confirmed" || a.result === "refused") && isEvidence(a.evidence) && a.evidence.basis !== "none" && inputsOf(a) !== null;
};
/**
 * The snapshots and values that came with an answer, each checked against its domain and digest. Null: one of them is no snapshot with
 * that digest, or its bytes are not the snapshot's canonical bytes. The scope stores the bytes as they are given, under the digest,
 * and a retained input's bytes are canonical JSON text (`RetainedInput`): the same pairs in another order or with other spacing have
 * the same digest and are not those bytes.
 */
const canonicalValue = (input: RetainedInput): boolean => {
  try { const value = parseStrict(input.bytes); return typeof input.domain === "string" && canonicalize(value) === input.bytes && valueDigest(input.domain, value) === input.digest; } catch { return false; }
};
const inputsOf = (answer: { retain?: unknown }): readonly RetainedInput[] | null => {
  const given = answer.retain === undefined ? [] : answer.retain;
  const canonical = (input: RetainedInput): boolean => { const pairs = snapshotRead(input.digest, input.bytes); return pairs !== null && snapshotInput(pairs)?.bytes === input.bytes; };
  return Array.isArray(given) && given.every((input) => isRetainedInput(input) && (input.kind === "snapshot" ? canonical(input) : input.kind === "value" && canonicalValue(input))) ? (given as RetainedInput[]) : null;
};

/** An outcome as the driver offers it: it states no owner and no kind, which the judge sets from the operation (section 4.1). `retain`: the snapshots and values that came with its answer, which are no part of the input. */
type Outcome = OutcomeOffered & { retain?: readonly RetainedInput[] | undefined };

export class Operations {
  readonly #scope: Scope;
  readonly #store: Store;
  readonly #outside: Outside;
  readonly #owners: Owners | undefined;
  readonly #clock: Clock;
  readonly #wakes: Wakes;
  readonly #bounds: Bounds;
  readonly #diagnoses: Ports["diagnoses"];
  /**
   * True while an attempt is recorded and not sent because its owner's rule
   * says that it is not ready (`OperationRules.ready`): the request of an
   * attempt of a staging waits for its tokens (authority note, section 5.7).
   * It has no time to be looked at next, so it costs no wake-up (rule 7).
   * The next outcome entry that this driver writes may be what it waits
   * for, so that entry starts the walk again, which looks at every such
   * attempt once more. In memory only: a restart begins the walk in any case.
   */
  #waiting = false;
  /**
   * Answers in hand that the scope could not record yet, by attempt, in the
   * order in which they are offered next (`#replies`): at most one for each
   * attempt that was sent. Each is the `outcome`
   * input as it was first offered, so it keeps the operation, the attempt
   * and the evidence of its answer. An answer stays here until the scope
   * has judged it: written, a copy, a contradiction, or no answer. It is
   * offered again by the row of its attempt while that row is open, and by
   * `#replies` whether the row is open or closed. Nothing here sends: the
   * request of an attempt left once.
   *
   * They are in memory only. A process that ends loses them: the outside
   * system's answer is then gone, and the attempt stays `unknown`, a duty,
   * as rule 2 requires, until that request's own answer is given again.
   */
  readonly #held = new Map<string, Outcome>();
  /**
   * The walk of this object's life over the attempts that nothing could send
   * before: those with no time to look at them next. Each pass takes one
   * page of them, after the row that the walk reached, beside the batch of
   * what is due. Null: the walk has ended. So every such attempt is looked
   * at once after a restart, whatever stands before it and whatever is due.
   */
  #walk: { after: Sending | null } | null = { after: null };
  /**
   * The attempts that a pass of this life left recorded and not sent because the outside port did not accept their kind, by
   * attempt. In memory only, as the walk is. When the port accepts one of them later in the same life, as when the Git host's
   * setting appears, the walk starts again (`reaccepted`), so the attempt is sent at the next turn with no restart. The sent mark
   * keeps it from being sent twice.
   */
  readonly #refused = new Map<string, { owner: CapabilityName | PlatformDefinition; kind: string }>();
  #running: Promise<number> | null = null;
  #again = false;
  /** A trusted retained-reply page has a successor; memory only, reset on restart. */
  #replyMore = false;

  /** Told of an answer that contradicts the outcome that entry `seq` records. It is the operator's record, which no judgment reads. */
  readonly #conflict: ((operation: OperationId, attempt: number, seq: number) => void) | undefined;

  /** `owners`: the rules of the owners this runtime has code for. With none, no outcome can be judged, so nothing is sent. */
  constructor(scope: Scope, store: Store, ports: Pick<Ports, "outside" | "clock" | "owners" | "diagnoses">, wakes: Wakes, bounds: Bounds, conflict?: (operation: OperationId, attempt: number, seq: number) => void) {
    this.#conflict = conflict;
    this.#scope = scope;
    this.#store = store;
    this.#outside = ports.outside;
    this.#owners = ports.owners ?? undefined;
    this.#clock = ports.clock;
    this.#wakes = wakes;
    this.#bounds = bounds;
    this.#diagnoses = ports.diagnoses;
    ports.outside.late?.((operation, attempt, answer) => this.answered(operation, attempt, answer));
  }

  /**
   * Whether the outside port now accepts the kind of an attempt that a pass of this life left unsent because it did not. Bounded:
   * it asks about at most one batch of them, and writes nothing. A pass that finds one starts the walk again (`#pass`).
   */
  reaccepted(): boolean {
    let asked = 0;
    for (const { owner, kind } of this.#refused.values()) {
      if (asked++ >= this.#bounds.deliveryBatch) return false;
      if (this.#outside.accepts(owner, kind)) return true;
    }
    return false;
  }
  /** As `reaccepted`, and each attempt found accepted is let go: the walk looks at it once, and a pass that still cannot send it records it again. */
  #accepted(): boolean {
    let found = false;
    let asked = 0;
    for (const [key, { owner, kind }] of [...this.#refused]) {
      if (asked++ >= this.#bounds.deliveryBatch) break;
      if (this.#outside.accepts(owner, kind)) { this.#refused.delete(key); found = true; }
    }
    return found;
  }

  /**
   * Do what is due, until nothing is. One pass runs at a time: a call while
   * one runs joins it, and the pass looks once more before it ends. Resolves
   * with the number of requests it sent and outcomes it offered.
   */
  run(): Promise<number> {
    this.#again = true;
    return (this.#running ??= (async () => {
      let made = 0;
      try {
        while (this.#again) {
          this.#again = false;
          made += await this.#pass();
        }
      } finally {
        this.#running = null;
      }
      return made;
    })());
  }

  /**
   * One pass over the attempts that have no outcome and are due, and over
   * one page of the walk. Rule 7: a pass is bounded, by two batches of rows
   * and one each of answers in hand and retained replies; with nothing due it writes nothing and asks
   * for no wake-up; and it opens no attempt, which only an entry does.
   */
  async #pass(): Promise<number> {
    const store = this.#store;
    const now = timeMs(this.#clock.read())!;
    const batch = this.#bounds.deliveryBatch;
    // Section 6.1: a scope whose pinned definition this runtime cannot run admits nothing, so no outcome can be written. Nothing
    // is sent and nothing is offered. Each attempt stays as it is recorded, with no wake-up, until a runtime that can run the
    // definition restarts the object. The walk ends at once: it could do nothing for any row.
    const runs = Boolean(this.#scope.pinned()?.definition);
    const replyMore = this.#replyMore;
    if (!runs) this.#replyMore = false;
    if (!this.#walk && runs && this.#accepted()) this.#walk = { after: null };
    const walked = this.#walk;
    // The page has its own batch, so what is due never uses it up. A page that is not full is the last. The walk goes on by the
    // row it reached, so a row that stays as it is recorded is passed, and holds back no row after it.
    const page = walked && runs ? store.parked(walked.after, batch) : [];
    this.#walk = page.length < batch ? null : { after: page.at(-1)! };
    const due = [...store.unsent(now, batch), ...page];
    if (due.length === 0 && (this.#held.size === 0 || !runs)) {
      const resumed = runs ? await this.#resume(batch) : 0;
      if (walked || resumed > 0 || replyMore || this.#replyMore) await this.#wake(now);
      return resumed;
    }
    const scope = store.scope()!;
    const work: (() => Promise<void>)[] = [];
    const offered = new Set<string>();
    for (const row of due) {
      const { operation: id, attempt } = row;
      if (!runs) {
        if (row.next !== null) store.postpone(id, attempt, null);
        continue;
      }
      if (row.sent !== null) {
        // The request may have left: its durable mark has no outcome. An answer in hand wins; otherwise only an accepted safe
        // recovery read may obtain one. With neither, unknown is offered. The original mutation is never sent again.
        const input = this.#held.get(keyOf(id, attempt));
        const recovery = input ? null : this.#recovery(row);
        offered.add(keyOf(id, attempt));
        work.push(() => recovery ? this.#answer(row, recovery.request, now, recovery.read) : this.#offer(row, input ?? this.#unknown(id, attempt), now));
        continue;
      }
      const operation = store.operation(id);
      const origin = store.stored(Number(id.split(":")[0]));
      // Nothing is sent that this runtime cannot send, or whose outcome it could not judge. The attempt stays recorded and not sent,
      // and no wake-up is asked for it (rule 7). The walk after a restart looks at it once more: the object's first call starts it
      // (`object.ts`, `#first`).
      const rules = operation ? this.#scope.owners()?.rules(operation.owner, operation.kind) : null;
      if (!operation || !origin || !this.#outside.accepts(operation.owner, operation.kind) || !rules) {
        if (row.next !== null) store.postpone(id, attempt, null);
        if (operation && origin && rules) this.#refused.set(keyOf(id, attempt), { owner: operation.owner, kind: operation.kind });
        continue;
      }
      this.#refused.delete(keyOf(id, attempt));
      // The owner's rule on when the request may leave, such as the tokens of an attempt of a staging. Not ready: recorded and not
      // sent, with no wake-up, until an outcome entry is written and the walk looks again.
      if (rules.ready && !rules.ready(store, operation, attempt)) {
        if (row.next !== null) store.postpone(id, attempt, null);
        this.#waiting = true;
        continue;
      }
      // Durable before the send: from here on the request may have left. A scope that stops here is woken, by the alarm set below,
      // and records `unknown`.
      store.markSent(id, attempt, timeOf(now), now + this.#bounds.dispatchSeconds * 1000);
      const marked = store.sending(id, attempt);
      if (!marked || marked.operation !== id || marked.attempt !== attempt || marked.sent === null) throw new Error("original attempt has no durable sent mark");
      const request: EffectRequest = { scope: scope.at, operation: id, attempt, owner: operation.owner, kind: operation.kind, origin: { entry: JSON.parse(origin.bytes) as Entry, hash: origin.hash }, sentAt: marked.sent };
      work.push(() => this.#send(row, request, now));
    }
    await this.#wake(now);
    // Rule 6: each attempt is sent and answered by itself. One that waits for its answer delays no other, and its answer changes no other.
    await Promise.all(work.map((start) => start()));
    const replies = runs ? await this.#replies(offered, batch) : 0;
    const resumed = runs ? await this.#resume(batch) : 0;
    await this.#wake(now);
    return work.length + replies + resumed;
  }

  /** One retained page after work/held answers; no network, mark or send. */
  async #resume(batch: number): Promise<number> {
    this.#replyMore = false;
    let answers: Array<{ operation: OperationId; attempt: number; answer: EffectAnswer }>;
    try {
      if (!this.#outside.replies) return 0;
      const page = this.#outside.replies(batch);
      if (typeof page !== "object" || page === null || !Array.isArray(page.answers) || page.answers.length > batch || typeof page.more !== "boolean") throw new Error("invalid retained reply page");
      // Validate and snapshot the entire page before any answer is offered.
      answers = page.answers.map((reply) => {
        if (!reply || !isOperationId(reply.operation) || !Number.isSafeInteger(reply.attempt) || reply.attempt < 1 || !isAnswer(reply.answer)) throw new Error("invalid retained reply metadata");
        return { operation: reply.operation, attempt: reply.attempt, answer: reply.answer };
      });
      this.#replyMore = page.more;
    } catch (failure) {
      report(this.#diagnoses, "outside-replies-failed", "retained-replies", failure);
      return 0;
    }
    let offered = 0;
    for (const reply of answers) {
      if (this.#held.has(keyOf(reply.operation, reply.attempt))) continue;
      await this.answered(reply.operation, reply.attempt, reply.answer);
      offered++;
    }
    return offered;
  }

  /**
   * The answers in hand that no row of this pass offered: each of the first
   * `batch` of them is offered to the scope again. This is how a late
   * answer is written after its attempt's row was closed by the `unknown`
   * entry. Resolves with the number that the scope judged.
   *
   * An answer that cannot be written yet stays in hand as it is, the same
   * input of the same attempt, and goes to the back of the line. The cause
   * is not asked: a turn that is busy keeps every answer out, and a fault
   * of one owner, such as an outcome that would open more than the owner
   * declared, keeps out that owner's answer alone. So the line turns
   * whatever the cause. An answer with n others before it is offered within
   * floor(n / batch) + 1 passes, since none is ever put before it: no
   * answer that stays unavailable holds back another. Its operation keeps
   * what it reserved, because no entry was written.
   *
   * No answer is offered twice in one pass, and no pass asks for a wake-up
   * at once on an answer's account: `#wake` asks for the next after the
   * delay of a turn that left work due, on the scope's clock. So an answer
   * that fails again for its own reason costs one turn in each
   * ceil(held / batch) delays, until it is judged or the process ends.
   */
  async #replies(offered: ReadonlySet<string>, batch: number): Promise<number> {
    let judged = 0;
    for (const [key, input] of [...this.#held].filter(([key]) => !offered.has(key)).slice(0, batch)) {
      const { recorded } = await this.#record(input);
      // Another answer of that attempt took its place while this one was judged: that one keeps its own place.
      if (this.#held.get(key) !== input) continue;
      this.#held.delete(key);
      if (recorded === "unavailable") this.#held.set(key, input);
      else judged++;
    }
    return judged;
  }

  /**
   * The driver's wake for what it holds in memory only, and the alarm at the
   * earliest of all wakes. While pages of the walk remain, the driver asks to
   * be woken at once, as when a retained-reply page has a successor. While an answer is in hand, it asks to be woken after
   * the delay of a turn that left work due. A scope whose definition cannot
   * be run can write nothing, and asks for neither.
   */
  #wake(now: number): void | Promise<void> {
    const runs = Boolean(this.#scope.pinned()?.definition);
    this.#wakes.driver((this.#walk || this.#replyMore) && runs ? now : this.#held.size > 0 && runs ? now + this.#bounds.drainRetrySeconds * 1000 : null);
    return this.#wakes.set();
  }

  /** A bound recovery read, only for a runnable owner; never marks or sends. */
  #recovery(row: Sending): { request: EffectRequest; read: () => Promise<EffectAnswer | null> } | null {
    const operation = this.#store.operation(row.operation);
    try {
      const recovery = this.#outside.recovery;
      const scope = this.#store.scope();
      const origin = this.#store.stored(Number(row.operation.split(":")[0]));
      if (!operation || !scope || !origin || !this.#scope.pinned()?.definition || !this.#scope.owners()?.rules(operation.owner, operation.kind) || !recovery?.accepts(operation.owner, operation.kind)) return null;
      const marked = this.#store.sending(row.operation, row.attempt);
      if (!marked || marked.operation !== row.operation || marked.attempt !== row.attempt || marked.sent === null) return null;
      const request: EffectRequest = { scope: scope.at, operation: row.operation, attempt: row.attempt, owner: operation.owner, kind: operation.kind, origin: { entry: JSON.parse(origin.bytes) as Entry, hash: origin.hash }, sentAt: marked.sent };
      return { request, read: () => recovery.read(request) };
    } catch (failure) {
      report(this.#diagnoses, "outside-recovery-failed", operation ? `${operation.owner}:${operation.kind}` : "owner", failure);
      return null;
    }
  }

  /** The one original request of one attempt. Recovery never calls this. */
  #send(row: Sending, request: EffectRequest, now: number): Promise<void> {
    return this.#answer(row, request, now, () => this.#outside.send(request));
  }

  /** One original answer or a trusted recovery read, offered identically. */
  async #answer(row: Sending, request: EffectRequest, now: number, ask: () => Promise<EffectAnswer | null>): Promise<void> {
    const { operation, attempt } = row;
    // A port that fails gave no answer. What it threw is diagnosed by its name alone, and is passed on to nobody: its text may
    // hold a credential (`diag.ts`).
    const sent = (async () => ask())().catch((failure: unknown) => { report(this.#diagnoses, "outside-call-failed", `${request.owner}:${request.kind}`, failure); return null; });
    const answer = await within(() => sent, this.#bounds.dispatchSeconds);
    if (isAnswer(answer)) return this.#offer(row, { type: "outcome", operation, attempt, result: answer.result, evidence: answer.evidence, retain: answer.retain }, now);
    // No answer in time, none at all, or one that is no answer: the outcome is `unknown`. If the request's own answer still
    // comes, it is the late answer, and adds one more outcome.
    // `answered` keeps it in hand if the scope cannot write it then.
    if (answer === LATE) void sent.then((late) => (isAnswer(late) ? this.answered(operation, attempt, late) : null)).catch(() => null);
    // An answer that is no answer was judged by nobody: the port is told so, and keeps nothing for it.
    else if (answer !== null && !isAnswer(answer)) this.#judged(operation, attempt, null);
    return this.#offer(row, this.#unknown(operation, attempt), now);
  }

  /**
   * The `unknown` outcome of an attempt: no answer came. Its basis is `none`. Its body is the one that the owner of the operation
   * states for an outcome that is not known, read from the scope's own records, or null where the owner states none. A rule that
   * fails here gives null, and the judge then decides whether that body is well formed.
   */
  #unknown(operation: OperationId, attempt: number): Outcome {
    let body: unknown = null;
    try {
      const of = this.#store.operation(operation);
      body = (of && this.#scope.owners()?.rules(of.owner, of.kind)?.unknown?.(this.#store, of, attempt, ownOf(this.#store))) ?? null;
    } catch {
      body = null;
    }
    return { type: "outcome", operation, attempt, result: "unknown", evidence: { basis: "none", body } as Evidence };
  }

  /**
   * Offer the first outcome of an attempt that may have been sent. An answer
   * that the judge refuses is no answer: the attempt is then `unknown`. An
   * answer that cannot be written now is kept in hand and offered again.
   */
  async #offer(row: Sending, input: Outcome, now: number): Promise<void> {
    const { operation, attempt } = row;
    const key = keyOf(operation, attempt);
    let recorded = await this.#record(input);
    if (recorded.recorded === "refused" && input.result !== "unknown") recorded = await this.#record({ ...this.#unknown(operation, attempt), retain: undefined });
    if (recorded.recorded === "unavailable") {
      if (input.result !== "unknown") this.#held.set(key, input);
      return this.#store.postpone(operation, attempt, now + this.#bounds.drainRetrySeconds * 1000);
    }
    this.#held.delete(key);
    // Written, or already written, the row is closed by the entry. An outcome that the scope can never write leaves the attempt as it is, and visible.
    if (recorded.recorded === "refused") this.#store.postpone(operation, attempt, this.#recovery(row) ? now + this.#bounds.drainRetrySeconds * 1000 : null);
  }

  /**
   * An answer to an attempt that was sent, at any time: in time, or after
   * its outcome was recorded `unknown`, or after a restart. The judge decides
   * what it is: the first outcome, the late answer, a copy of a recorded
   * answer, or a contradiction of one. An answer to an attempt that was
   * never sent is no answer to it, and is refused here.
   *
   * An answer that the scope cannot write now, because its turn is
   * unavailable, is answered `unavailable` and kept in hand. The driver
   * offers it again, with a wake-up of its own, until the scope has judged
   * it or the process ends. The first answer in hand for an attempt is the
   * one kept.
   */
  async answered(operation: OperationId, attempt: number, answer: EffectAnswer): Promise<OutcomeRecorded> {
    if (!isAnswer(answer)) return { recorded: "refused", detail: "bad-input: not an answer" };
    const row = isOperationId(operation) && Number.isSafeInteger(attempt) ? this.#store.sending(operation, attempt) : null;
    if (!row || row.sent === null) return { recorded: "refused", detail: "no request of that attempt was sent" };
    const key = keyOf(operation, attempt);
    const input: Outcome = { type: "outcome", operation, attempt, result: answer.result, evidence: answer.evidence, retain: answer.retain };
    const recorded = await this.#record(input);
    if (recorded.recorded === "unavailable") {
      if (!this.#held.has(key)) this.#held.set(key, input);
    } else if (recorded.recorded !== "refused") this.#held.delete(key);
    await this.#wake(timeMs(this.#clock.read())!);
    return recorded;
  }

  /** One `outcome` input, judged in the scope's turn like any other input. */
  async #record(input: Outcome): Promise<OutcomeRecorded> {
    const definition = this.#scope.pinned()?.definition;
    if (!definition) return { recorded: "unavailable" };
    const bounds = this.#bounds;
    const known = recordedOutcome(this.#store, input);
    if (known) {
      if (input.result !== "unknown") this.#judged(input.operation, input.attempt, null);
      if (known.result === "conflict") this.#conflict?.(input.operation, input.attempt, known.seq);
      return { recorded: known.result, seq: known.seq };
    }
    const said = (answer: OutcomeRecorded) => ({ verdict: "answer", answer }) as const;
    // Section 16.4: a snapshot that the evidence names is stored before the entry that names its digest. So each one is given
    // with the answer, or the scope retains it already. Otherwise this is no answer.
    const operation = this.#store.operation(input.operation);
    const retain = input.retain ?? [];
    const rules = operation && this.#scope.owners()?.rules(operation.owner, operation.kind);
    if (rules?.values !== undefined && rules.valueDomains === undefined) return { recorded: "unavailable" };
    const named = rules?.retains?.(input.evidence) ?? [];
    let values: ReturnType<typeof evidenceValues>;
    try { values = evidenceValues(rules, input.evidence); } catch { values = null; }
    const invalidValue = (detail: string): OutcomeRecorded => {
      if (input.result !== "unknown") this.#judged(input.operation, input.attempt, null);
      return { recorded: "refused", detail: `bad-input: ${detail}` };
    };
    if (values === null) return invalidValue("the evidence names a value outside its owner declaration");
    const bytes: string[] = [];
    for (const value of values) {
      const given = retain.find((input) => input.kind === "value" && input.domain === value.domain && input.digest === value.digest) ?? this.#store.retained("value", value.digest, value.domain);
      if (!given || utf8(given.bytes).length > value.max || !canonicalValue(given)) return invalidValue("the evidence names a value whose canonical bytes were not given under its digest and bound");
      bytes.push(given.bytes);
    }
    if (named.some((digest) => !retain.some((given) => given.kind === "snapshot" && given.digest === digest) && this.#store.retained("snapshot", digest) === null)) {
      if (input.result !== "unknown") this.#judged(input.operation, input.attempt, null);
      return { recorded: "refused", detail: "the evidence names a snapshot whose bytes were not given" };
    }
    const wrote: { sealed: Sealed | null } = { sealed: null };
    // Scope contract, revision 20, sections 6.1 and 16.1 (rows I3-40 and I3-41), under a definition whose data states rows of
    // `observes` or the `origin` of an outcome. The judge copies the outcome's `uses` from its origin, and is given the copy that
    // this scope retains of each of those entries: nothing is fetched. The scope reads one observation for each subject of the
    // kind's rows before the turn, in two steps where a row states `second`, and the commit derives both lists again (`Observes`).
    // I3 merge: under a definition whose data states neither, as each platform definition of Artroom until the authority note's
    // rows are adopted (I3 deltas, entry GA1), the judge is given no observation and no foreign entry, as before. A rule that
    // needs one then has a fault, and its outcome stays offered: the destination's `judge`.
    const rows = this.#scope.observes();
    const store = this.#store;
    const retained = (use: FactUse): Fetched | null => {
      const kept = store.retained("entry", use.content);
      return kept ? { fact: use.fact, entry: JSON.parse(kept.bytes) as Entry, under: kept.under ?? "" } : null;
    };
    const context = (clock: Reading) => ({ clock, bounds, owners: this.#owners, platform: this.#scope.pinned()?.platform ?? undefined, own: ownOf(store), ...(definition.observing ? { retained, ...rows.hand() } : {}), values: [...bytes, ...(rows.hand().values ?? [])] });
    await rows.before(() => { const planned = settleOutcome(store, definition, input, context(clockOf(store, this.#clock.read()))); return planned.result === "unavailable" ? planned.missing : undefined; }, 2);
    const end = await rows.turn((stop) => this.#scope.turns.run<OutcomeRecorded>({
      asks: () => [],
      judge: (view, clock) => {
        const judged = settleOutcome(view, definition, input, context(clock));
        // Section 16.1, "In the commit": a subject of the commit's list with no observation at hand stops the commit. The scope
        // reads what is missing, and the turn starts again. The outcome stays offered.
        stop(judged.result === "unavailable" ? judged.missing : undefined);
        switch (judged.result) {
          case "write":
            // Room for this entry was reserved when its operation was opened (sections 17.2, row 5, and 17.3). A scope with no room at all writes nothing.
            if (view.scope()!.head.seq + 1 >= bounds.scopeEntries) return said({ recorded: "unavailable" });
            return {
              // Section 16.1, "A value that a row may retain": each value that a retained observation names is kept with the entry.
              verdict: "write", draft: judged.draft, retain: [...retain.filter((given) => given.kind === "snapshot" && named.includes(given.digest)), ...valuesOf(judged.draft)],
              sealed: (sealed) => { wrote.sealed = sealed; rows.sealed(sealed); return { recorded: "written", fact: { at: sealed.entry.at, seq: sealed.entry.seq, hash: sealed.hash } }; },
              unfit: () => ({ recorded: "refused", detail: "the outcome cannot be an entry" }), full: () => ({ recorded: "unavailable" }),
            };
          case "repeat": return said({ recorded: "repeat", seq: judged.seq });
          case "conflict": return said({ recorded: "conflict", seq: judged.seq });
          case "due": return { verdict: "stop" };
          case "refused": return said({ recorded: "refused", detail: judged.detail });
          default: return said({ recorded: "unavailable" });
        }
      },
    }));
    const recorded: OutcomeRecorded = end.end === "answer" ? end.answer : { recorded: "unavailable" };
    // The turn has ended, so an entry that it wrote is committed. An outcome entry may be what an attempt that is not ready waits
    // for: the walk looks at each of them again.
    if (recorded.recorded === "written" && this.#waiting) {
      this.#waiting = false;
      this.#walk = { after: null };
      this.#again = true;
    }
    // The port is told of each decisive answer that the scope has judged, with the entry that it wrote, if it wrote one.
    if (input.result !== "unknown" && recorded.recorded !== "unavailable") this.#judged(input.operation, input.attempt, recorded.recorded === "written" ? wrote.sealed : null);
    // An incident (authority note, section 12, G13): nothing is written for it, so it is kept in the operator's record alone. It is told
    // once, after the turn, and not from the judgment, which a turn may run again.
    if (recorded.recorded === "conflict") this.#conflict?.(input.operation, input.attempt, recorded.seq);
    return recorded;
  }

  /** Tell the port what became of an answer. A port that fails here changes nothing: the entry is as it was sealed. */
  #judged(operation: OperationId, attempt: number, sealed: Sealed | null): void {
    const scope = this.#store.scope();
    if (!scope || !this.#outside.judged) return;
    try {
      this.#outside.judged({ scope: scope.at, operation, attempt }, sealed);
    } catch (failure) {
      report(this.#diagnoses, "outside-call-failed", "judged", failure);
    }
  }
}

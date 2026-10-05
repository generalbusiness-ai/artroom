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
 * operation.
 *
 * Nothing here runs inside a storage transaction. A pass runs after a
 * commit and from the object's alarm.
 */

import type { Bounds, CapabilityName, DecisiveEvidence, Entry, Evidence, FactRef, Input, OperationId, PlatformDefinition, ScopeRef } from "@generalbusiness/artroom-contract";
import { isOperationId } from "@generalbusiness/artroom-bytes";
import { settleOutcome, timeMs, timeOf, type Owners } from "@generalbusiness/artroom-derive";
import { ownOf, type Scope } from "./core.ts";
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
}

/**
 * The outside system's answer to one request: that attempt's own answer, or
 * a read that the effect's owner defines as decisive (section 4.3, item 4).
 * The port says so, and the scope cannot check it: that an answer came from
 * the outside system, and was that attempt's own, is trusted, and a replay
 * reports it as trusted (section 9.5, the labels `own-answer` and
 * `host-read`).
 */
export interface EffectAnswer { result: "confirmed" | "refused"; evidence: DecisiveEvidence }

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
 */
export interface Outside {
  accepts(owner: CapabilityName | PlatformDefinition, kind: string): boolean;
  send(request: EffectRequest): Promise<EffectAnswer | null>;
  late?(deliver: LateAnswers): void;
}

/**
 * The production default: it sends nothing. So no attempt is sent. Each
 * stays recorded and not sent, with no outcome: its operation reads
 * `pending`, it keeps its reservation, and the driver asks for no wake-up on
 * its account. A host port replaces this (plan step 19). It is the `outside`
 * of `production()` in `ports.ts`.
 */
export const NO_OUTSIDE: Outside = { accepts: () => false, send: () => Promise.resolve(null) };

const UNKNOWN: Evidence = { basis: "none", body: null };
const keyOf = (operation: OperationId, attempt: number) => `${operation}#${attempt}`;
/** An answer as the contract's outcome can hold it. Anything else is no answer. */
const isAnswer = (answer: unknown): answer is EffectAnswer => {
  const a = answer as Partial<EffectAnswer> | null;
  return typeof a === "object" && a !== null && (a.result === "confirmed" || a.result === "refused") && typeof a.evidence === "object" && a.evidence !== null
    && (a.evidence.basis === "own-answer" || a.evidence.basis === "read");
};

type Outcome = Extract<Input, { type: "outcome" }>;

export class Operations {
  readonly #scope: Scope;
  readonly #store: Store;
  readonly #outside: Outside;
  readonly #owners: Owners | undefined;
  readonly #clock: Clock;
  readonly #wakes: Wakes;
  readonly #bounds: Bounds;
  /** Answers in hand that the scope could not record yet, by attempt. They are in memory only: one that is lost with the process leaves its attempt `unknown`. */
  readonly #held = new Map<string, Outcome>();
  /** The first pass of this object's life also looks at the attempts that nothing could send before. */
  #first = true;
  #running: Promise<number> | null = null;
  #again = false;

  /** `owners`: the rules of the owners this runtime has code for. With none, no outcome can be judged, so nothing is sent. */
  constructor(scope: Scope, store: Store, ports: Pick<Ports, "outside" | "clock" | "owners">, wakes: Wakes, bounds: Bounds) {
    this.#scope = scope;
    this.#store = store;
    this.#outside = ports.outside;
    this.#owners = ports.owners ?? undefined;
    this.#clock = ports.clock;
    this.#wakes = wakes;
    this.#bounds = bounds;
    ports.outside.late?.((operation, attempt, answer) => this.answered(operation, attempt, answer));
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
   * One pass over the attempts that have no outcome and are due. Rule 7: a
   * pass is bounded; with nothing due it writes nothing and asks for no
   * wake-up; and it opens no attempt, which only an entry does.
   */
  async #pass(): Promise<number> {
    const store = this.#store;
    const now = timeMs(this.#clock.read())!;
    const due = store.unsent(now, this.#bounds.deliveryBatch, this.#first);
    this.#first = false;
    if (due.length === 0) return 0;
    const scope = store.scope()!;
    // Section 6.1: a scope whose pinned definition this runtime cannot run admits nothing, so no outcome can be written. Nothing
    // is sent and nothing is offered. Each attempt stays as it is recorded, with no wake-up, until a runtime that can run the
    // definition restarts the object.
    const runs = Boolean(this.#scope.pinned()?.definition);
    const work: (() => Promise<void>)[] = [];
    for (const row of due) {
      const { operation: id, attempt } = row;
      if (!runs) {
        if (row.next !== null) store.postpone(id, attempt, null);
        continue;
      }
      if (row.sent !== null) {
        // The request may have left: the mark was written and no outcome followed. The answer in hand is offered if there is one.
        // Otherwise the process stopped between the send and the outcome, and the outcome is `unknown`. It is never sent again.
        const input = this.#held.get(keyOf(id, attempt)) ?? { type: "outcome", operation: id, attempt, result: "unknown", evidence: UNKNOWN };
        work.push(() => this.#offer(row, input, now));
        continue;
      }
      const operation = store.operation(id);
      const origin = store.stored(Number(id.split(":")[0]));
      // Nothing is sent that this runtime cannot send, or whose outcome it could not judge. The attempt stays recorded and not sent,
      // and no wake-up is asked for it (rule 7). The first pass after a restart looks at it once more.
      if (!operation || !origin || !this.#outside.accepts(operation.owner, operation.kind) || !this.#scope.owners()?.rules(operation.owner, operation.kind)) {
        if (row.next !== null) store.postpone(id, attempt, null);
        continue;
      }
      // Durable before the send: from here on the request may have left. A scope that stops here is woken, by the alarm set below,
      // and records `unknown`.
      store.markSent(id, attempt, timeOf(now), now + this.#bounds.dispatchSeconds * 1000);
      const request: EffectRequest = { scope: scope.at, operation: id, attempt, owner: operation.owner, kind: operation.kind, origin: { entry: JSON.parse(origin.bytes) as Entry, hash: origin.hash } };
      work.push(() => this.#send(row, request, now));
    }
    await this.#wakes.set();
    // Rule 6: each attempt is sent and answered by itself. One that waits for its answer delays no other, and its answer changes no other.
    await Promise.all(work.map((start) => start()));
    await this.#wakes.set();
    return work.length;
  }

  /** The one request of one attempt, and the outcome that its answer gives. */
  async #send(row: Sending, request: EffectRequest, now: number): Promise<void> {
    const { operation, attempt } = row;
    const sent = (async () => this.#outside.send(request))();
    const answer = await within(() => sent, this.#bounds.dispatchSeconds);
    if (isAnswer(answer)) return this.#offer(row, { type: "outcome", operation, attempt, result: answer.result, evidence: answer.evidence }, now);
    // No answer in time, none at all, or one that is no answer: the outcome is `unknown`. If the request's own answer still
    // comes, it is the late answer, and adds one more outcome.
    if (answer === LATE) void sent.then((late) => (isAnswer(late) ? this.answered(operation, attempt, late) : null), () => null);
    return this.#offer(row, { type: "outcome", operation, attempt, result: "unknown", evidence: UNKNOWN }, now);
  }

  /**
   * Offer the first outcome of an attempt that may have been sent. An answer
   * that the judge refuses is no answer: the attempt is then `unknown`. One
   * that cannot be written now is kept in hand and offered again.
   */
  async #offer(row: Sending, input: Outcome, now: number): Promise<void> {
    const { operation, attempt } = row;
    const key = keyOf(operation, attempt);
    let recorded = await this.#record(input);
    if (recorded.recorded === "refused" && input.result !== "unknown") recorded = await this.#record({ ...input, result: "unknown", evidence: UNKNOWN });
    if (recorded.recorded === "unavailable") {
      this.#held.set(key, input);
      return this.#store.postpone(operation, attempt, now + this.#bounds.drainRetrySeconds * 1000);
    }
    this.#held.delete(key);
    // Written, or already written, the row is closed by the entry. An outcome that the scope can never write leaves the attempt as it is, and visible.
    if (recorded.recorded === "refused") this.#store.postpone(operation, attempt, null);
  }

  /**
   * An answer to an attempt that was sent, at any time: in time, or after
   * its outcome was recorded `unknown`, or after a restart. The judge decides
   * what it is: the first outcome, the late answer, a copy of a recorded
   * answer, or a contradiction of one. An answer to an attempt that was
   * never sent is no answer to it, and is refused here.
   */
  async answered(operation: OperationId, attempt: number, answer: EffectAnswer): Promise<OutcomeRecorded> {
    if (!isAnswer(answer)) return { recorded: "refused", detail: "not an answer" };
    const row = isOperationId(operation) && Number.isSafeInteger(attempt) ? this.#store.sending(operation, attempt) : null;
    if (!row || row.sent === null) return { recorded: "refused", detail: "no request of that attempt was sent" };
    const recorded = await this.#record({ type: "outcome", operation, attempt, result: answer.result, evidence: answer.evidence });
    if (recorded.recorded === "written") this.#held.delete(keyOf(operation, attempt));
    await this.#wakes.set();
    return recorded;
  }

  /** One `outcome` input, judged in the scope's turn like any other input. */
  async #record(input: Outcome): Promise<OutcomeRecorded> {
    const definition = this.#scope.pinned()?.definition;
    if (!definition) return { recorded: "unavailable" };
    const bounds = this.#bounds;
    const said = (answer: OutcomeRecorded) => ({ verdict: "answer", answer }) as const;
    const end = await this.#scope.turns.run<OutcomeRecorded>({
      asks: () => [],
      judge: (view, clock) => {
        const judged = settleOutcome(view, definition, input, { clock, bounds, owners: this.#owners, platform: this.#scope.pinned()?.platform ?? undefined, own: ownOf(this.#store) });
        switch (judged.result) {
          case "write":
            // Room for this entry was reserved when its operation was opened (sections 17.2, row 5, and 17.3). A scope with no room at all writes nothing.
            if (view.scope()!.head.seq + 1 >= bounds.scopeEntries) return said({ recorded: "unavailable" });
            return {
              verdict: "write", draft: judged.draft, retain: [], sealed: ({ entry, hash }) => ({ recorded: "written", fact: { at: entry.at, seq: entry.seq, hash } }),
              unfit: () => ({ recorded: "refused", detail: "the outcome cannot be an entry" }), full: () => ({ recorded: "unavailable" }),
            };
          case "repeat": return said({ recorded: "repeat", seq: judged.seq });
          case "conflict": return said({ recorded: "conflict", seq: judged.seq });
          case "due": return { verdict: "stop" };
          case "refused": return said({ recorded: "refused", detail: judged.detail });
          default: return said({ recorded: "unavailable" });
        }
      },
    });
    return end.end === "answer" ? end.answer : { recorded: "unavailable" };
  }
}

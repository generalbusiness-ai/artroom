/**
 * Sending (scope contract, sections 7.2 and 7.4): the dispatcher of the
 * outbox rows that each entry wrote with its sends, and the one alarm that
 * wakes it.
 *
 * Delivery is at least once and may be out of order. Before each dispatch
 * the dispatcher writes, durably, that the attempt is starting; afterwards
 * it writes how the attempt was answered. An attempt with no recorded
 * completion reads as unanswered. A send is dispatched again, after a delay
 * that doubles up to a bound, until transport acknowledges it with the fact
 * of the entry that recorded it. That acknowledgment is bookkeeping, for an
 * advisory as for any other send, and is no entry.
 *
 * A request is given up when its log holds as many routing refusals as the
 * retry policy allows. The dispatcher then offers the scope a `diagnosis`
 * input with the log, through the turn like any other input, and derive's
 * judge decides the finding from the log alone. Only a request is ever
 * diagnosed: a result, a control and an advisory have no result, and are
 * sent until they are acknowledged.
 *
 * A provisional scope's held sends are not dispatched and no attempt of
 * them starts: the fold keeps the list, and the entry that records the
 * confirmation empties it.
 *
 * Nothing here runs inside a storage transaction. A pass runs after a
 * commit and from the object's alarm.
 */

import type { Attempt, Bounds, Entry, Timestamp } from "@generalbusiness/dap-contract";
import { judgeDiagnosis, timeMs, timeOf, type Capabilities } from "@generalbusiness/dap-derive";
import { ownOf, retainedFacts, used, type Scope } from "./core.ts";
import type { Alarm, Clock, Transport } from "./ports.ts";
import type { Dispatched, Outgoing, Store } from "./store.ts";
import { LATE, within } from "./turn.ts";
import { outboxCorrelation, metric } from "./operational.ts";

interface DispatchCounts { attempted: number; acknowledged: number; diagnosed: number }

/**
 * One alarm for three wakes (section 5.2): the earliest deadline, which the
 * turn asks for through `deadline`; the next dispatch, which is read from
 * the outbox; and the next attempt of an outside operation that the
 * operations driver has to look at (`operations.ts`), which is read from its
 * rows. The deadline is kept in storage, so any wake can be set again
 * without another being lost, also after a restart. The alarm is always the
 * earliest of them, so a stored wake-up is never replaced by a later one
 * (authority note, section 5.4, rule 7).
 *
 * The driver has one more wake that is in no row: for work it holds in
 * memory only. It is kept here in memory, so no other wake replaces it, and
 * it is gone with the process, as that work is.
 */
export class Wakes {
  readonly #store: Store;
  readonly #alarm: Alarm;
  /** The alarm port the turn uses. */
  readonly deadline: Alarm;
  /** Durable wake owned only by derived signer maintenance. */
  readonly maintenance: Alarm;

  /** False: this scope has no transport, nothing dispatches its sends, and no wake is asked for them. */
  readonly #dispatches: boolean;
  #driver: number | null = null;

  constructor(store: Store, alarm: Alarm, dispatches = true) {
    this.#store = store;
    this.#alarm = alarm;
    this.#dispatches = dispatches;
    this.deadline = { set: (at) => { store.setDeadline(at); return this.set(); } };
    this.maintenance = { set: (at) => { store.setSignerMaintenance(at); return this.set(); } };
  }

  /** When the operations driver next has work that is in memory only, in milliseconds, or null. The next `set` uses it. */
  driver(at: number | null): void { this.#driver = at; }

  /** Set the alarm at the earliest of the wakes, or clear it when there is none. */
  set(): void | Promise<void> {
    const deadline = this.#store.deadline();
    const dispatch = this.#dispatches ? this.#store.nextDispatch() : null;
    const maintenance = this.#store.signerMaintenance();
    const at = [deadline === null ? null : timeMs(deadline), dispatch, this.#store.nextSend(), this.#driver, maintenance === null ? null : timeMs(maintenance)].filter((ms): ms is number => ms !== null);
    return this.#alarm.set(at.length === 0 ? null : timeOf(Math.min(...at)));
  }
}

const ROUTING: readonly Dispatched["answer"][] = ["wrong-incarnation", "not-found"];

export class Dispatcher {
  readonly #scope: Scope;
  readonly #store: Store;
  readonly #transport: Transport;
  readonly #clock: Clock;
  readonly #wakes: Wakes;
  readonly #bounds: Bounds;
  /** For the clause of a diagnosis, which may hold a capability effect (section 6.11). */
  readonly #capabilities: Capabilities | undefined;
  #running: Promise<number> | null = null;
  #again = false;

  constructor(scope: Scope, store: Store, ports: { transport: Transport; clock: Clock; capabilities?: Capabilities | null }, wakes: Wakes, bounds: Bounds) {
    this.#capabilities = ports.capabilities ?? undefined;
    this.#scope = scope;
    this.#store = store;
    this.#transport = ports.transport;
    this.#clock = ports.clock;
    this.#wakes = wakes;
    this.#bounds = bounds;
  }

  /**
   * Dispatch what is due, until nothing is. One pass runs at a time: a call
   * while one runs joins it, and the pass looks once more before it ends.
   * Resolves with the number of dispatches and diagnoses it made.
   */
  run(): Promise<number> {
    this.#again = true;
    return (this.#running ??= (async () => {
      let made = 0;
      const counts: DispatchCounts = { attempted: 0, acknowledged: 0, diagnosed: 0 };
      try {
        while (this.#again) {
          this.#again = false;
          made += await this.#pass(counts);
        }
      } finally {
        this.#running = null;
      }
      metric({ kind: "dispatch", place: "dispatch", end: "ok", a: counts.attempted, b: counts.acknowledged, c: counts.diagnosed });
      return made;
    })());
  }

  async #pass(counts: DispatchCounts): Promise<number> {
    let made = 0;
    for (;;) {
      const now = timeMs(this.#clock.read())!;
      const due = this.#store.outgoing(now, this.#bounds.deliveryBatch);
      if (due.length === 0) break;
      for (const send of due) {
        // The retry policy of section 7.5: so many routing refusals, and a request is given up. The number is never the proof.
        const refused = send.attempts.filter((a) => ROUTING.includes(a.answer)).length;
        if (send.message.class === "request" && refused >= this.#bounds.routingRefusals) await this.#giveUp(send, now, counts);
        else await this.#dispatch(send, now, counts);
        made++;
      }
    }
    await this.#wakes.set();
    return made;
  }

  /** The delay before the attempt after the `count`th: the first delay, doubled each time, up to the longest. */
  #delay(count: number): number {
    const { dispatchRetrySeconds, dispatchRetryMaxSeconds } = this.#bounds;
    return Math.min(dispatchRetrySeconds * 2 ** Math.min(count - 1, 30), dispatchRetryMaxSeconds) * 1000;
  }

  /** One dispatch of one send, with its record before and after. */
  async #dispatch(send: Outgoing, now: number, counts: DispatchCounts): Promise<void> {
    const { seq, n } = send;
    const store = this.#store;
    const at: Timestamp = timeOf(now);
    const logged = (answer: Dispatched["answer"]): Dispatched[] => [...send.attempts, { at, answer }];
    const next = now + this.#delay(send.attempts.length + 1);
    // Section 7.4: the attempt is recorded before it is sent, as unanswered. The alarm is set for its retry before the send
    // leaves, so a scope that stops here is woken and sends again.
    store.attempted(seq, n, logged("none"), next);
    counts.attempted++;
    outboxCorrelation(`${seq}.${n}`);
    await this.#wakes.set();
    const scope = store.scope()!;
    const envelope = { to: send.to, from: { at: scope.at, seq, hash: send.hash }, n, message: send.message };
    const answer = await within(() => this.#transport.send(envelope), this.#bounds.dispatchSeconds);
    // No answer in time, or none at all: the record stays as it was written.
    if (answer === LATE || answer === null) return;
    if (answer.answer === "recorded") {
      store.acknowledge(seq, n, logged("acknowledged"), answer.fact);
      counts.acknowledged++;
      return;
    }
    // A routing refusal by the resolver of the name, or an answer that decided nothing. `source-unverified` to a send of this
    // scope's own sealed entry is logged as a retryable answer: it is not a routing refusal, and it recorded nothing.
    const attempts = logged(answer.answer === "routing" ? answer.reason : "retry");
    const refused = attempts.filter((a) => ROUTING.includes(a.answer)).length;
    // A request that has now met the retry policy is given up in this pass, not after the delay.
    store.attempted(seq, n, attempts, send.message.class === "request" && refused >= this.#bounds.routingRefusals ? now : next);
  }

  /**
   * Section 7.4, "When a request cannot be delivered": a `diagnosis` input
   * with the log, judged in the scope's turn. Written or already written,
   * the request leaves the outgoing sends. Not written now, as when the
   * scope is busy, it is offered again after the drain's retry delay.
   */
  async #giveUp(send: Outgoing, now: number, counts: DispatchCounts): Promise<void> {
    const { seq, n } = send;
    const store = this.#store;
    const bounds = this.#bounds;
    const definition = this.#scope.pinned()?.definition;
    const kept = store.stored(seq);
    // The log as the contract's entry holds it. A request that was acknowledged is never given up.
    const attempts = send.attempts.map((a): Attempt => ({ at: a.at, answer: a.answer === "acknowledged" ? "none" : a.answer }));
    let written = false;
    if (definition && kept) {
      const origin = JSON.parse(kept.bytes) as Entry;
      const facts = retainedFacts(store, origin);
      const end = await this.#scope.turns.run<boolean>({
        asks: () => [],
        judge: (view, clock) => {
          const judged = judgeDiagnosis(view, definition, { of: { seq, n }, attempts }, { clock, bounds, facts, prepared: [], origin, own: ownOf(store), capabilities: this.#capabilities, platform: this.#scope.pinned()?.platform ?? undefined });
          switch (judged.result) {
            case "write":
              // Room for this entry was counted when the request was sent (section 9.2).
              if (view.scope()!.head.seq + 1 >= bounds.scopeEntries) return { verdict: "answer", answer: false };
              return { verdict: "write", draft: judged.draft, retain: used(judged.draft, facts), sealed: () => true, unfit: () => false, full: () => false };
            case "repeat": return { verdict: "answer", answer: true };
            case "due": return { verdict: "stop" };
            default: return { verdict: "answer", answer: false };
          }
        },
      });
      written = end.end === "answer" && end.answer;
    }
    if (!written) store.attempted(seq, n, send.attempts, now + bounds.drainRetrySeconds * 1000);
    else counts.diagnosed++;
  }
}

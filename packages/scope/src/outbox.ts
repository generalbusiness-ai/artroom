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

import type { Attempt, Bounds, Entry, Timestamp } from "@generalbusiness/artroom-contract";
import { judgeDiagnosis, timeMs, timeOf, type Capabilities } from "@generalbusiness/artroom-derive";
import { ownOf, retainedFacts, used, type Scope } from "./core.ts";
import type { Alarm, Clock, Transport } from "./ports.ts";
import type { Dispatched, Outgoing, Store } from "./store.ts";
import { LATE, within } from "./turn.ts";

/**
 * One alarm for two wakes (section 5.2): the earliest deadline, which the
 * turn asks for through `deadline`, and the next dispatch, which is read
 * from the outbox. The deadline is kept in storage, so either wake can be
 * set again without the other being lost, also after a restart.
 */
export class Wakes {
  readonly #store: Store;
  readonly #alarm: Alarm;
  /** The alarm port the turn uses. */
  readonly deadline: Alarm;

  constructor(store: Store, alarm: Alarm) {
    this.#store = store;
    this.#alarm = alarm;
    this.deadline = { set: (at) => { store.setDeadline(at); return this.set(); } };
  }

  /** Set the alarm at the earlier of the two wakes, or clear it when there is neither. */
  set(): void | Promise<void> {
    const deadline = this.#store.deadline();
    const dispatch = this.#store.nextDispatch();
    const at = [deadline === null ? null : timeMs(deadline), dispatch].filter((ms): ms is number => ms !== null);
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

  async #pass(): Promise<number> {
    let made = 0;
    for (;;) {
      const now = timeMs(this.#clock.read())!;
      const due = this.#store.outgoing(now, this.#bounds.deliveryBatch);
      if (due.length === 0) break;
      for (const duty of due) {
        // The retry policy of section 7.5: so many routing refusals, and a request is given up. The number is never the proof.
        const refused = duty.attempts.filter((a) => ROUTING.includes(a.answer)).length;
        if (duty.message.class === "request" && refused >= this.#bounds.routingRefusals) await this.#giveUp(duty, now);
        else await this.#dispatch(duty, now);
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
  async #dispatch(duty: Outgoing, now: number): Promise<void> {
    const { seq, n } = duty;
    const store = this.#store;
    const at: Timestamp = timeOf(now);
    const logged = (answer: Dispatched["answer"]): Dispatched[] => [...duty.attempts, { at, answer }];
    const next = now + this.#delay(duty.attempts.length + 1);
    // Section 7.4: the attempt is recorded before it is sent, as unanswered. The alarm is set for its retry before the send
    // leaves, so a scope that stops here is woken and sends again.
    store.attempted(seq, n, logged("none"), next);
    await this.#wakes.set();
    const scope = store.scope()!;
    const envelope = { to: duty.to, from: { at: scope.at, seq, hash: duty.hash }, n, message: duty.message };
    const answer = await within(() => this.#transport.send(envelope), this.#bounds.dispatchSeconds);
    // No answer in time, or none at all: the record stays as it was written.
    if (answer === LATE || answer === null) return;
    if (answer.answer === "recorded") return store.acknowledge(seq, n, logged("acknowledged"), answer.fact);
    // A routing refusal by the resolver of the name, or an answer that decided nothing. `source-unverified` to a send of this
    // scope's own sealed entry is logged as a retryable answer: it is not a routing refusal, and it recorded nothing.
    const attempts = logged(answer.answer === "routing" ? answer.reason : "retry");
    const refused = attempts.filter((a) => ROUTING.includes(a.answer)).length;
    // A request that has now met the retry policy is given up in this pass, not after the delay.
    store.attempted(seq, n, attempts, duty.message.class === "request" && refused >= this.#bounds.routingRefusals ? now : next);
  }

  /**
   * Section 7.4, "When a request cannot be delivered": a `diagnosis` input
   * with the log, judged in the scope's turn. Written or already written,
   * the request leaves the outgoing sends. Not written now, as when the
   * scope is busy, it is offered again after the drain's retry delay.
   */
  async #giveUp(duty: Outgoing, now: number): Promise<void> {
    const { seq, n } = duty;
    const store = this.#store;
    const bounds = this.#bounds;
    const definition = this.#scope.pinned()?.definition;
    const kept = store.stored(seq);
    // The log as the contract's entry holds it. A request that was acknowledged is never given up.
    const attempts = duty.attempts.map((a): Attempt => ({ at: a.at, answer: a.answer === "acknowledged" ? "none" : a.answer }));
    let written = false;
    if (definition && kept) {
      const origin = JSON.parse(kept.bytes) as Entry;
      const facts = retainedFacts(store, origin);
      const end = await this.#scope.turns.run<boolean>({
        asks: () => [],
        judge: (view, clock) => {
          const judged = judgeDiagnosis(view, definition, { of: { seq, n }, attempts }, { clock, bounds, facts, prepared: [], origin, own: ownOf(store), capabilities: this.#capabilities });
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
    if (!written) store.attempted(seq, n, duty.attempts, now + bounds.drainRetrySeconds * 1000);
  }
}

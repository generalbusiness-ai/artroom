/**
 * The turn: how one input takes effect (scope contract, sections 5.2 and
 * 5.3). The step numbers in the comments are the contract's.
 *
 * A turn is for one waiting input, or for none when an alarm starts it. It
 * drains what is due, notes the head, prepares the input's rules, and
 * commits in one storage transaction. Every decision is derive's: this file
 * reads the clock, counts the two budgets, and writes what a judge drafts.
 *
 * One input at a time (step 2): a queue admits one input to the drain and
 * the snapshot, and one to a commit. A Durable Object lets another request
 * in wherever one waits, and a turn waits in one place only: the
 * evaluation of its rules (step 5), which may take as long as its time
 * limit. That wait is outside the queue. If another input commits
 * meanwhile, the head check of step 6.2 stops this one and it starts again
 * from step 3. An input with no rule to evaluate never waits, so its drain,
 * snapshot and commit are one section.
 */

import type { Bounds, FactRef, Head, Prepared, SignedIntent } from "@generalbusiness/artroom-contract";
import { CanonicalError, canonicalize, entryHash, parseStrict, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { applyEntry, clockOf, entryOf, fits, isEntryOf, isIntent, judgeTimed, nextDue, timeMs, timeOf } from "@generalbusiness/artroom-derive";
import type { Clock as Reading, Draft, Due, Fetched, Owners, PlatformRules, RuleInput, StateView, ValidDefinition } from "@generalbusiness/artroom-derive";
import { ownOf, retainedFacts, snapshotsOf } from "./core.ts";
import type { Ports, Resolver } from "./ports.ts";
import type { Retained, Sealed, Store } from "./store.ts";

// ---------------------------------------------------------------- step 1: before the turn

/** The signature and the shape of an intent. Both are immutable facts about the input (section 5.1). */
export const isSigned = (signed: SignedIntent): boolean => verifySignedIntent(signed) && isIntent(signed.intent);

export const LATE = Symbol("late");

/** The result of `work`, or `LATE` when it takes longer than `seconds` or fails. */
export async function within<T>(work: () => Promise<T>, seconds: number): Promise<T | typeof LATE> {
  let stop = (): void => undefined;
  const late = new Promise<typeof LATE>((resolve) => {
    const timer = setTimeout(() => resolve(LATE), seconds * 1000);
    stop = () => clearTimeout(timer);
  });
  try {
    return await Promise.race([(async () => work())(), late]);
  } catch {
    return LATE;
  } finally {
    stop();
  }
}

/**
 * The foreign entries an input names, each read through the resolver within
 * the fetch time limit and checked against the fact that names it. Null: one
 * could not be read, and the input is answered `dependency-unavailable`.
 * Nothing is held.
 */
export async function fetchFacts(resolver: Resolver, bounds: Bounds, named: readonly FactRef[]): Promise<Fetched[] | null> {
  const read = await Promise.all(named.map(async (fact): Promise<Fetched | null> => {
    const found = await within(() => resolver.read(fact, bounds.fetchSeconds), bounds.fetchSeconds);
    return found !== LATE && found !== null && "entry" in found && isEntryOf(found.entry, fact) ? { fact, entry: found.entry, under: found.under } : null;
  }));
  return read.every((f) => f !== null) ? read : null;
}

// ---------------------------------------------------------------- the waiting input

/** What the commit does with the waiting input (step 6). */
export type Verdict<A> =
  /** Write the draft. `retain`: the inputs it names by digest. `sealed` builds the answer from the sealed entry. `unfit` answers for a draft that cannot be an entry: over the size bound, or not canonical values. */
  /** `full` answers for an entry that admits new duties and would leave no room for them to settle (section 9.2). Nothing is written then. */
  | { verdict: "write"; draft: Draft; retain: readonly Retained[]; sealed(sealed: Sealed): A; unfit(why: "size" | "form"): A; full(head: Head): A }
  /** Step 6.3: a transition is due. Nothing is written, and the turn goes back to step 3. */
  | { verdict: "stop" }
  /** Nothing is written. */
  | { verdict: "answer"; answer: A };

/** An input that is not timed, with the context its judge needs. `A` is what its caller is answered. */
export interface Waiting<A> {
  /** Step 5: what each rule its guards would meet reads, over the snapshot. It judges nothing. */
  asks(view: StateView, clock: Reading): RuleInput[];
  /** Steps 6.3 and 6.4, inside the commit's transaction, on the commit's one reading. */
  judge(view: StateView, clock: Reading, prepared: readonly Prepared[]): Verdict<A>;
}

/**
 * How a turn ends. `answer`: the waiting input's own. `idle`: no input
 * waited and nothing is due. The other three write nothing more and are
 * Unavailable (section 4.2): `busy`, a budget of step 7 is spent;
 * `clock-behind`, a transition is due and the clock is behind (section 5.3);
 * `unavailable`, preparation failed or ran past its time limit, or the
 * scope has no room for a timed entry.
 */
export type End<A> = { end: "answer"; answer: A } | { end: "idle" | "busy" | "clock-behind" | "unavailable" };

/** One section at a time, in the order asked. */
class Queue {
  #last: Promise<unknown> = Promise.resolve();
  run<T>(section: () => T | Promise<T>): Promise<T> {
    const result = this.#last.then(section);
    this.#last = result.catch(() => undefined);
    return result;
  }
}

/** Thrown inside a commit's transaction after the entry was written and folded: the transaction keeps nothing. */
class Full extends Error {}

/** A draft that cannot be an entry. Thrown before anything is written. */
class Unfit extends Error {
  constructor(readonly why: "size" | "form") { super(why); }
}

interface Counts {
  attempts: number;   // timed attempts used (step 7)
  restarts: number;   // stopped commits of the waiting input (step 7)
  wrote: boolean;
  last: Reading | null;   // the turn's latest clock reading
}
interface Attempt { head: Head | null; asks: readonly RuleInput[]; prepared: readonly Prepared[] }

/**
 * The definition this scope pins, read from its own storage: null when this
 * runtime cannot run it, undefined before the genesis. Once a scope has a
 * genesis, every step of every turn runs under this definition and no other.
 */
export type PinnedDefinition = () => ValidDefinition | null | undefined;

/** Later than any deadline: `nextDue` as of this time gives the earliest deadline held. */
const FOREVER = "9999-12-31T23:59:59Z";

export class Turns {
  readonly #queue = new Queue();
  readonly #store: Store;
  readonly #ports: Pick<Ports, "clock" | "rules" | "alarm" | "capabilities">;
  readonly #bounds: Bounds;
  readonly #pinned: PinnedDefinition;
  readonly #owners: () => Owners | undefined;
  readonly #platform: () => PlatformRules | undefined;

  /** `owners`: the rules of the owners of outside operations for this scope, with those of its platform definition (`Scope.owners`). */
  constructor(store: Store, ports: Pick<Ports, "clock" | "rules" | "alarm" | "capabilities">, bounds: Bounds, pinned: PinnedDefinition, owners: () => Owners | undefined, platform: () => PlatformRules | undefined = () => undefined) {
    this.#store = store;
    this.#ports = ports;
    this.#bounds = bounds;
    this.#pinned = pinned;
    this.#owners = owners;
    this.#platform = platform;
  }

  /**
   * Told after each commit that sealed an entry, whoever asked for the turn:
   * a caller's request, the alarm, a delivery, the dispatcher's diagnosis or
   * the operations driver's outcome, also for a late answer. It is told
   * after the transaction has committed and before the turn does anything
   * else, in the turn's own section, so two commits are told in their
   * order. What is no history follows the head from here: the object's open
   * streams and the operator's record (`object.ts`). A listener that fails
   * changes nothing: the entry is sealed.
   */
  #sealed: (() => void) | null = null;
  onSealed(told: () => void): void { this.#sealed = told; }

  /** Run `commit`, one transaction, and tell the listener if the head moved. A transaction that throws committed nothing, and tells nothing. */
  #telling<T>(commit: () => T): T {
    const at = (): number | null => this.#store.scope()?.head.seq ?? null;
    const before = at();
    const done = commit();
    if (this.#sealed && at() !== before) {
      try {
        this.#sealed();
      } catch { /* a notice was lost, and no fact */ }
    }
    return done;
  }

  /**
   * One turn. `waiting` null: an alarm's turn, which runs the drain alone
   * under the same budget. `founding`: the definition a genesis asks for. It
   * is used only while the scope has no genesis; after that the pinned
   * definition is.
   */
  async run<A>(waiting: Waiting<A> | null, founding?: ValidDefinition): Promise<End<A>> {
    const turn: Counts = { attempts: 0, restarts: 0, wrote: false, last: null };
    let resume: Attempt | null = null;
    for (;;) {
      const attempt: Attempt | null = resume;
      const step: End<A> | Attempt = await this.#queue.run(() => this.#section(founding, waiting, turn, attempt));
      if ("end" in step) return step;
      // Step 5: the rules are evaluated over the snapshot, within the time limit. The queue is free meanwhile.
      const prepared = await within(() => this.#ports.rules.evaluate(step.asks), this.#bounds.preparationSeconds);
      if (prepared === LATE) return this.#queue.run(() => this.#close<A>(this.#definition(founding), turn, { end: "unavailable" }));
      resume = { ...step, prepared };
    }
  }

  /** The definition this section runs under: the pinned one, or before the genesis the one the founding asks for. */
  #definition(founding: ValidDefinition | undefined): ValidDefinition | null | undefined {
    const pinned = this.#pinned();
    return pinned === undefined ? founding : pinned;
  }

  /**
   * From step 3, or from a commit whose rules are now prepared, until the
   * turn ends or has rules to evaluate. Nothing here waits but the alarm at
   * the end.
   */
  async #section<A>(founding: ValidDefinition | undefined, waiting: Waiting<A> | null, turn: Counts, resume: Attempt | null): Promise<End<A> | Attempt> {
    const definition = this.#definition(founding);
    if (!definition) return { end: "unavailable" };
    for (let attempt = resume; ; attempt = null) {
      if (!attempt) {
        const stopped = this.#drain(definition, turn);                 // step 3
        if (stopped) return this.#close<A>(definition, turn, stopped);
        if (!waiting) return this.#close<A>(definition, turn, { end: "idle" });
        const head = this.#store.scope()?.head ?? null;                // step 4
        // The walk that finds the rules uses the reading of step 3. Nothing is judged on it.
        const asks = waiting.asks(this.#store, turn.last!);
        if (asks.length > 0) return { head, asks, prepared: [] };
        attempt = { head, asks, prepared: [] };
      }
      const done = this.#commit(definition, waiting!, turn, attempt);  // step 6
      if (done !== "stopped") return this.#close(definition, turn, done);
      // Step 7: each stopped commit of the waiting input is a restart, and a turn has a bounded number.
      if (turn.restarts >= this.#bounds.turnRestarts) return this.#close<A>(definition, turn, { end: "busy" });
      turn.restarts++;
    }
  }

  /**
   * Step 3: while a transition is due, select it, charge one timed attempt,
   * and take it through steps 4 to 6 by itself. Null: nothing is due. The
   * reading here only selects.
   */
  #drain(definition: ValidDefinition, turn: Counts): End<never> | null {
    for (;;) {
      const clock = clockOf(this.#store, this.#ports.clock.read());
      turn.last = clock;
      const scope = this.#store.scope();
      // Section 5.3: when the clock is behind, what is due is judged as of the previous entry's time.
      const due = scope && nextDue(this.#store, definition, clock.asOf);
      if (!scope || !due) return null;
      if (turn.attempts >= this.#bounds.timedAttemptsPerTurn) return { end: "busy" };
      // Section 9.2: room for this entry was counted when its item was opened. A scope with no room at all writes nothing.
      if (scope.head.seq + 1 >= this.#bounds.scopeEntries) return { end: "unavailable" };
      turn.attempts++;
      const done = this.#commitTimed(definition, turn, due, scope.head);
      if (done === "clock-behind") return { end: "clock-behind" };
      // The validator bounds a timed entry's size, so this is a fault: a definition validated under larger bounds. The transition
      // stays due and is never passed over. The turn ends, nothing more is written, and the alarm is set again.
      if (done === "unfit") return { end: "unavailable" };
    }
  }

  /**
   * Steps 4 to 6 for the selected timed input. It is written when it passes
   * its three checks. A dropped selection writes nothing and the drain looks
   * again. A timed entry judges time, so while the clock is behind the drain
   * stops (section 5.3).
   */
  #commitTimed(definition: ValidDefinition, turn: Counts, selected: Due, snapshot: Head): "written" | "dropped" | "clock-behind" | "unfit" {
    try {
      return this.#telling(() => this.#timed(definition, turn, selected, snapshot));
    } catch (error) {
      if (error instanceof Unfit) return "unfit";   // thrown before anything was written
      throw error;
    }
  }

  #timed(definition: ValidDefinition, turn: Counts, selected: Due, snapshot: Head): "written" | "dropped" | "clock-behind" {
    return this.#store.transaction(() => {
      const clock = clockOf(this.#store, this.#ports.clock.read());    // 6.1
      turn.last = clock;
      const head = this.#store.scope()?.head;
      if (head?.seq !== snapshot.seq || head.hash !== snapshot.hash) return "dropped";   // 6.2
      const judged = judgeTimed(this.#store, definition, selected, { clock, bounds: this.#bounds, capabilities: this.#ports.capabilities ?? undefined });   // 6.3 and 6.4
      if (judged.result === "unavailable") return "clock-behind";
      if (judged.result === "dropped") return "dropped";
      this.#seal(definition, judged.draft, clock, []);                 // 6.5
      turn.wrote = true;
      return "written";
    });
  }

  /** Step 6 for the waiting input, in one transaction. `stopped`: nothing was written, and the turn goes back to step 3. */
  #commit<A>(definition: ValidDefinition, waiting: Waiting<A>, turn: Counts, attempt: Attempt): End<A> | "stopped" {
    let full: (() => A) | null = null;
    try {
      return this.#telling(() => this.#store.transaction((): End<A> | "stopped" => this.#judged(definition, waiting, turn, attempt, (answer) => { full = answer; })));
    } catch (error) {
      // The entry would have left an admitted duty no room to settle. The transaction wrote nothing.
      if (error instanceof Full && full) return { end: "answer", answer: (full as () => A)() };
      throw error;
    }
  }

  #judged<A>(definition: ValidDefinition, waiting: Waiting<A>, turn: Counts, attempt: Attempt, refuse: (full: () => A) => void): End<A> | "stopped" {
    {
      const clock = clockOf(this.#store, this.#ports.clock.read());    // 6.1: the one reading
      turn.last = clock;
      const head = this.#store.scope()?.head ?? null;
      if (head?.seq !== attempt.head?.seq || head?.hash !== attempt.head?.hash) return "stopped";   // 6.2
      const verdict = waiting.judge(this.#store, clock, attempt.prepared);   // 6.3 and 6.4
      if (verdict.verdict === "stop") return "stopped";
      if (verdict.verdict === "answer") return { end: "answer", answer: verdict.answer };
      // Section 9.2: the input of each rule result the entry records is retained under its digest.
      const rules = verdict.draft.prepared.map((p): Retained => {
        const asked = attempt.asks.find((a) => a.rule === p.rule && a.digest === p.input);
        if (!asked) throw new Error(`the result of rule ${p.rule} was not prepared in this turn`);
        return { kind: "rule", digest: p.input, bytes: canonicalize(asked.input) };
      });
      try {
        const sealed = this.#seal(definition, verdict.draft, clock, [...verdict.retain, ...rules]);   // 6.5
        // Section 9.2: an entry that admits duties is kept only if every admitted duty still has room to settle. The count is of
        // the state the fold just wrote, so it is under the head check, and a verifier derives the same number. Section 17.3: an
        // entry that settles what its form declares is written against its own duty's reservation, and is not asked.
        if (!fits(this.#store, definition, this.#bounds, sealed.entry.input, verdict.draft.settles, this.#owners())) {
          refuse(() => verdict.full(head ?? { seq: sealed.entry.seq, hash: sealed.hash }));
          throw new Full();
        }
        turn.wrote = true;
        return { end: "answer", answer: verdict.sealed(sealed) };
      } catch (error) {
        if (error instanceof Unfit) return { end: "answer", answer: verdict.unfit(error.why) };
        throw error;
      }
    }
  }

  /**
   * Step 6.5, inside the commit's transaction: the entry at this head and
   * this reading, its hash, its row, the rows of its sends, its retained
   * inputs, the fold, and the removal of each text the entry redacts.
   * `applyEntry` is the only code that changes folded state.
   */
  #seal(definition: ValidDefinition, draft: Draft, clock: Reading, retain: readonly Retained[]): Sealed {
    const entry = entryOf(this.#store, draft, clock);
    let bytes: string;
    try {
      bytes = canonicalize(entry);
    } catch (error) {
      if (error instanceof CanonicalError) throw new Unfit("form");
      throw error;
    }
    const size = utf8(bytes).length;
    if (size > this.#bounds.entryBytes) throw new Unfit("size");
    const hash = entryHash(entry);
    this.#store.append(entry, hash, bytes, size);
    for (const input of retain) this.#store.retain(input);
    applyEntry(this.#store, definition, entry, hash, {
      bounds: this.#bounds, platform: this.#platform(), own: ownOf(this.#store), facts: retainedFacts(this.#store, entry), snapshot: snapshotsOf(this.#store),
      texts: (digest) => { const kept = this.#store.retained("text", digest); if (!kept) return undefined; const text: unknown = parseStrict(kept.bytes); return typeof text === "string" ? utf8(text).length : undefined; },
    });
    // Section 6.6: a redaction removes the bytes of each text it lists from the retained inputs, in the commit that seals its tombstone.
    for (const effect of entry.effects) if (effect.effect === "redact") for (const text of effect.texts) this.#store.forget("text", text);
    return { entry, hash };
  }

  /** The end of a turn. If it wrote, left work due, or was an alarm's, the alarm is set for what is due next. */
  async #close<A>(definition: ValidDefinition | null | undefined, turn: Counts, end: End<A>): Promise<End<A>> {
    if (definition && (turn.wrote || end.end !== "answer")) await this.#wake(definition, turn);
    return end;
  }

  /**
   * The alarm, at the earliest deadline any live item holds. When that
   * deadline has passed, the turn left it due: the alarm is set a retry delay
   * ahead, and the next turn has a new budget (section 5.2, "When the budget
   * is spent"). No deadline: no alarm.
   */
  async #wake(definition: ValidDefinition, turn: Counts): Promise<void> {
    const scope = this.#store.scope();
    if (!scope) return;
    const next = definition.timedTypes.length === 0 ? null : nextDue(this.#store, definition, FOREVER);
    if (!next) return this.#ports.alarm.set(null);
    const now = Math.max(turn.last ? timeMs(turn.last.reading)! : -Infinity, timeMs(scope.time)!);
    await this.#ports.alarm.set(timeMs(next.due)! > now ? next.due : timeOf(now + this.#bounds.drainRetrySeconds * 1000));
  }
}

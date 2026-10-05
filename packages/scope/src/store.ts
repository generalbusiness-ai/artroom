/**
 * The storage one scope's core needs (scope contract, sections 5, 9.2 and
 * 11.6). It is synchronous and transactional: a commit is one call of
 * `transaction`, and everything the commit writes is written inside it.
 *
 * A store is derive's `StateView` and `StateWriter`, so derive's
 * `applyEntry` is the only code that changes folded state. Beside that it
 * keeps what the fold does not: the entries, the row of each send, and the
 * retained inputs. It decides nothing.
 */

import type { Attempt, Digest, DutyId, Entry, FactRef, Message, ScopeRef, Seed, Timestamp } from "@generalbusiness/artroom-contract";
import type { OwnRequest, RangeIndex, StateWriter } from "@generalbusiness/artroom-derive";

/** A sealed entry and its hash. The hash is not part of the entry's bytes (section 4.1). */
export interface Sealed { entry: Entry; hash: Digest }

/** An entry as stored: its canonical JSON, whose UTF-8 bytes are the entry's canonical bytes, and their number. */
export interface Stored { seq: number; hash: Digest; bytes: string; size: number }

/**
 * A retained input (section 9.2): bytes an entry names by digest and does
 * not carry. `definition`: the declaration, under the definition's digest.
 * `entry`: a foreign entry of some `uses`, under its content digest, with the
 * name of the definition its scope pins, which the fetcher supplied. `rule`:
 * the input of one rule evaluation, under its digest.
 *
 * A delivered message, a rule's result and an outcome's evidence are whole
 * inside the entry that records them, so the entry row retains them.
 */
export interface Retained { kind: "definition" | "entry" | "rule"; digest: Digest; bytes: string; under?: string }

/**
 * One dispatch of a send, as the sender's log holds it (section 7.4). It is
 * written with the answer `none` before the dispatch starts, and the answer
 * is written over it when one arrives. So an attempt with no recorded
 * completion reads `none`: unanswered. `acknowledged` is the one answer the
 * contract's `Attempt` does not have: the receiver answered with the fact of
 * the entry that recorded the message. A diagnosis is never written for a
 * send that has one.
 */
export interface Dispatched { at: Timestamp; answer: Attempt["answer"] | "acknowledged" }

/** One send of one entry, as the outbox holds it (section 7.4). The message itself is in the entry. */
export interface Duty {
  duty: DutyId;
  to: ScopeRef | Seed;
  class: Message["class"];
  /** Sealed and not to be dispatched: a send of a provisional scope's genesis, until the confirmation (section 7.2). */
  held: boolean;
  /** The dispatcher's log: one record for each dispatch, in order. */
  attempts: readonly Dispatched[];
  /** The fact transport acknowledged the send with: the entry of the receiver that recorded it. Bookkeeping, not an entry. */
  acknowledged: FactRef | null;
  result: OwnRequest["result"];
  diagnosis: OwnRequest["diagnosis"];
}

/** A send the dispatcher may attempt now: the envelope's parts, and its log so far. */
export interface Outgoing { seq: number; n: number; hash: Digest; to: ScopeRef | Seed; message: Message; attempts: readonly Dispatched[] }

export interface Store extends StateWriter {
  /** Run `work` in one transaction. If it throws, nothing it wrote is kept, and the error is thrown on. */
  transaction<T>(work: () => T): T;
  /** The slots a `where` index must cover, as the validator derived them (section 6.5). Set once the definition is known. */
  cover(indexes: readonly RangeIndex[]): void;

  /** The entry row and one outbox row for each of its sends. The caller then folds the entry with `applyEntry`. */
  append(entry: Entry, hash: Digest, bytes: string, size: number): void;
  retain(input: Retained): void;

  stored(seq: number): Stored | null;
  /** At most `limit` entries from `seq` on, in order. */
  storedFrom(seq: number, limit: number): Stored[];
  retained(kind: Retained["kind"], digest: Digest): Retained | null;
  /** At most `limit` sends after the one at `after`, in the order of `seq` and ordinal. */
  duties(after: { seq: number; n: number } | null, limit: number): { duties: Duty[]; more: boolean };

  // The dispatcher's bookkeeping (section 7.4). None of it is history, and no judgment reads it. Each call is one durable write.

  /**
   * At most `limit` sends whose next attempt is due at `now`, in milliseconds,
   * earliest first. A send is outstanding until transport acknowledges it, and
   * a request also until its result or its diagnosis is recorded. A held send
   * is not outstanding.
   */
  outgoing(now: number, limit: number): Outgoing[];
  /** When the next attempt of any outstanding send is due, in milliseconds, or null. A new send is due at its entry's time. */
  nextDispatch(): number | null;
  /** The send's log, and when its next attempt is due. */
  attempted(seq: number, n: number, attempts: readonly Dispatched[], next: number): void;
  /** Transport acknowledged the send with that fact: it is done. */
  acknowledge(seq: number, n: number, attempts: readonly Dispatched[], fact: FactRef): void;
  /** The deadline the turn last asked to be woken for, kept so that one alarm serves it and the dispatcher (section 5.2). */
  deadline(): Timestamp | null;
  setDeadline(at: Timestamp | null): void;
}

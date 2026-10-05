/**
 * The storage one scope's core needs (scope contract, sections 5, 9.2 and
 * 11.6). It is synchronous and transactional: a commit is one call of
 * `transaction`, and everything the commit writes is written inside it.
 *
 * A store is derive's `StateView` and `StateWriter`, so derive's
 * `applyEntry` is the only code that changes folded state. Beside that it
 * keeps what the fold does not: the entries, the row of each send, and the
 * retained inputs. It decides nothing. `Sealed`, `Duty` and `Dispatched`
 * are the contract's, and are exported here again.
 */

import type { Digest, Dispatched, Duty, Entry, FactRef, Message, RetainedInput, ScopeRef, Sealed, Seed, Timestamp } from "@generalbusiness/artroom-contract";
import type { RangeIndex, StateWriter } from "@generalbusiness/artroom-derive";

export type { Dispatched, Duty, Sealed };

/** An entry as stored: its canonical JSON, whose UTF-8 bytes are the entry's canonical bytes, and their number. */
export interface Stored { seq: number; hash: Digest; bytes: string; size: number }

/**
 * A retained input (section 9.2): the contract's `RetainedInput`. A
 * delivered message, a rule's result and an outcome's evidence are whole
 * inside the entry that records them, so the entry row retains them.
 */
export type Retained = RetainedInput;

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
  /** The UTF-8 bytes of one retained input, or null, without reading it. */
  retainedSize(kind: Retained["kind"], digest: Digest): number | null;
  /** The row of one send, or null. */
  duty(seq: number, n: number): Duty | null;
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

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

import type { Digest, Dispatched, Duty, Entry, FactRef, Message, OperationId, RetainedInput, ScopeRef, Sealed, Seed, Timestamp } from "@generalbusiness/artroom-contract";
import type { Operation, RangeIndex, StateWriter } from "@generalbusiness/artroom-derive";

export type { Dispatched, Duty, Sealed };

/** An entry as stored: its canonical JSON, whose UTF-8 bytes are the entry's canonical bytes, and their number. */
export interface Stored { seq: number; hash: Digest; bytes: string; size: number }

/**
 * A retained input (section 9.2): the contract's `RetainedInput`. A
 * delivered message, a rule's result and an outcome's evidence are whole
 * inside the entry that records them, so the entry row retains them. A
 * detached text is kept as one JSON string under its digest, until a
 * `redact` effect removes it (section 6.6).
 */
export type Retained = RetainedInput;

/** A send the dispatcher may attempt now: the envelope's parts, and its log so far. */
export interface Outgoing { seq: number; n: number; hash: Digest; to: ScopeRef | Seed; message: Message; attempts: readonly Dispatched[] }

/**
 * One attempt of an outside operation, as the driver holds it (scope
 * contract, section 4.3; authority note, section 5.4). The row is written
 * with the entry that opens the attempt, in that entry's commit. None of it
 * is history, and no judgment reads it.
 *
 * `opened`: the entry that opened the attempt. `next`: when the driver looks
 * at it next, in milliseconds, or null while nothing here can send it.
 * `sent`: null while the attempt is recorded and not sent. Otherwise the
 * time written, durably, before its one request left: from then on the
 * request may have reached the outside system, and it is never sent again.
 */
export interface Sending { operation: OperationId; attempt: number; opened: number; next: number | null; sent: Timestamp | null }

/**
 * What a reader sees of one operation (section 9.1): the folded record, with
 * its attempts and their outcomes; `state`, as a preparation status gives it
 * (`pending` while an attempt has no outcome, `unknown` while an attempt's
 * latest outcome is unknown, else `settled`); and `sends`, the driver's
 * bookkeeping for each attempt, which is no history.
 */
export interface OperationStatus {
  operation: Operation;
  state: "settled" | "pending" | "unknown";
  sends: readonly Pick<Sending, "attempt" | "next" | "sent">[];
}

export interface Store extends StateWriter {
  /** Run `work` in one transaction. If it throws, nothing it wrote is kept, and the error is thrown on. */
  transaction<T>(work: () => T): T;
  /** The slots a `where` index must cover, as the validator derived them (section 6.5). Set once the definition is known. */
  cover(indexes: readonly RangeIndex[]): void;

  /**
   * The entry row, one outbox row for each of its sends, and one driver row
   * for each attempt of an outside operation that it opens. An outcome entry
   * closes the driver row of its attempt. The caller then folds the entry
   * with `applyEntry`.
   */
  append(entry: Entry, hash: Digest, bytes: string, size: number): void;
  retain(input: Retained): void;
  /** Remove the bytes of one retained input. Only a redaction does: the entry that holds the `redact` effect is the tombstone (section 6.6). */
  forget(kind: Retained["kind"], digest: Digest): void;

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

  // The operations driver's bookkeeping (section 4.3; authority note, section 5.4). None of it is history, and no judgment reads it.

  /**
   * At most `limit` attempts that have no outcome and are due at `now`, in
   * milliseconds, earliest first.
   */
  unsent(now: number, limit: number): Sending[];
  /**
   * At most `limit` attempts that have no outcome and no time to look at
   * them next, after the one at `after`, in the order of their operations
   * and numbers. No wake-up is kept for these: the driver walks them once
   * after a restart.
   */
  parked(after: Pick<Sending, "operation" | "attempt"> | null, limit: number): Sending[];
  /** When the driver next has an attempt to look at, in milliseconds, or null. */
  nextSend(): number | null;
  /** The driver's row of one attempt, or null: no entry opened it. */
  sending(operation: OperationId, attempt: number): Sending | null;
  /** One durable write, before the request leaves: the attempt may have been sent from `at` on. It is written once and never cleared. */
  markSent(operation: OperationId, attempt: number, at: Timestamp, next: number): void;
  /** When the driver looks at the attempt next, or null for never by itself. */
  postpone(operation: OperationId, attempt: number, next: number | null): void;
  /** At most `limit` operations after the one at `after`, in the order of the entry that opened each and its ordinal there. `open`: only those that are not settled. */
  operations(after: { seq: number; k: number } | null, limit: number, open: boolean): { operations: OperationStatus[]; more: boolean };
  /** One operation as a reader sees it, or null. */
  operationStatus(id: OperationId): OperationStatus | null;

  /** The deadline the turn last asked to be woken for, kept so that one alarm serves it and the dispatcher (section 5.2). */
  deadline(): Timestamp | null;
  setDeadline(at: Timestamp | null): void;
}

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

import type { Attempt, Digest, DutyId, Entry, Message, ScopeRef, Seed } from "@generalbusiness/artroom-contract";
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

/** One send of one entry, as the outbox holds it (section 7.4). The message itself is in the entry. */
export interface Duty {
  duty: DutyId;
  to: ScopeRef | Seed;
  class: Message["class"];
  /** Sealed and not to be dispatched: a send of a provisional scope's genesis, until the confirmation (section 7.2). */
  held: boolean;
  /** The dispatcher's log. Nothing writes it in this step. */
  attempts: readonly Attempt[];
  result: OwnRequest["result"];
  diagnosis: OwnRequest["diagnosis"];
}

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
}

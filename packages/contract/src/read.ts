/**
 * Reads (scope contract, section 9.1). Every list is a page with a stated
 * maximum and a cursor. A read of state is a statement about `at`.
 */

import type { Digest, FactRef, MemberRef, PlatformDefinition, ScopeRef, Seed, Timestamp } from "./scope.ts";
import type { Attempt, DutyId, Entry, Message, Receipt } from "./entry.ts";
import type { FieldValue } from "./intent.ts";
import type { ReadRefusal } from "./result.ts";

/** An opaque, resumable position in a paged read. */
export type Cursor = string;

export type Read<T> =
  | { ok: true; at: { seq: number; hash: Digest }; value: T; complete: boolean; next?: Cursor }
  | { ok: false; reason: ReadRefusal; detail?: FactRef | ScopeRef };

/** Settlement of one signed intent: one receipt or `not-found` (section 4.2). */
export type Settlement = Read<Receipt>;

/** The page bounds of section 9.1. */
export const RETAINED_ITEMS_PAGE = 100;
export const HISTORY_PAGE_ENTRIES = 200;
export const HISTORY_PAGE_BYTES = 1024 * 1024;
export const ENTRY_READ_BYTES = 256 * 1024;
export const COMMENTS_PAGE = 100;
export const INDEX_PAGE_ROWS = 100;
export const OUTBOX_PAGE_DUTIES = 100;
/** One retained input. The contract's table has no row for it; this is the history page's byte bound, and temporary. */
export const RETAINED_INPUT_BYTES = 1024 * 1024;

// ---------------------------------------------------------------- what the reads return

/** A scope is provisional until its creator confirms it; a refused genesis is terminal (section 7.2). */
export type Status = "provisional" | "active" | "refused";

/** A party slot holds one member, or a list of members. An empty slot is `null`; an empty list is unset. */
export type Party = MemberRef | readonly MemberRef[] | null;

/** One item, as entries fold into it (section 6.3). */
export interface Item {
  readonly id: number;                     // the `seq` of its opening entry (section 4.1)
  readonly type: string;
  readonly state: string;
  readonly revision: number;               // section 6.3
  /** The hash of its opening entry, so a send can name it by fact. Null only while that entry is being judged. */
  readonly opened: Digest | null;
  readonly parties: Readonly<Record<string, Party>>;
  readonly refs: Readonly<Record<string, FieldValue | null>>;
  readonly values: Readonly<Record<string, FieldValue | null>>;
  /**
   * The history attribution needs (section 6.7): every member ever in one of
   * its `author` slots, every holder of a hold whose `under` names it, and
   * the principal of each who signed under one: when put in the slot, or
   * later, when changing this item or a hold under it.
   */
  readonly attributed: readonly MemberRef[];
}

/**
 * A scope's summary: its live items, and the exact number of items in each
 * type and state, retained final items included. Final items are counted
 * and not listed; they are read by pages.
 */
export interface Summary {
  scope: ScopeRef; status: Status; definition: Digest | PlatformDefinition; time: Timestamp;
  items: readonly Item[];                                                    // live, by ID
  counts: readonly (readonly [type: string, state: string, n: number])[];    // every type and state of the definition, by type, then state
}

/** A sealed entry and its hash. The hash is not part of the entry's bytes (section 4.1). */
export interface Sealed { entry: Entry; hash: Digest }

/**
 * One dispatch of a send, as the sender's log holds it (section 7.4). It is
 * written with the answer `none` before the dispatch starts, and the answer
 * is written over it when one arrives. `acknowledged` is the one answer an
 * entry's `Attempt` does not have: the receiver answered with the fact of
 * the entry that recorded the message.
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
  /** For a request: the entry that recorded its first result, and the clause that ran. */
  result: { seq: number; clause: "applied" | "refused" | "superseded" | "conflict" } | null;
  /** For a request: the entry that recorded its diagnosis. */
  diagnosis: { seq: number; finding: "undelivered" | "delivery-unavailable" } | null;
}

/**
 * A page of the history as it is stored, for a verifier (sections 9.2 and
 * 9.4): each entry as its canonical JSON text, whose UTF-8 bytes are the
 * entry's canonical bytes, with the hash the service holds for it. A reader
 * hashes the bytes itself before it reads the content, so a changed byte is
 * found at its own entry. `scope` and `definition` are what the service
 * says the scope is; a verifier checks them against the genesis.
 */
export interface LogPage { scope: ScopeRef; definition: Digest | PlatformDefinition; entries: readonly { seq: number; hash: Digest; bytes: string }[] }

/**
 * A retained input (section 9.2): bytes an entry names by digest and does
 * not carry. `definition`: a declaration, under the definition's digest.
 * `entry`: a foreign entry of some `uses`, under its content digest, with
 * `under`, the name of the definition its scope pins, as the fetcher
 * recorded it. `rule`: the input of one rule evaluation, under its digest.
 * `text`: a detached text, as one JSON string, under its digest in the
 * domain `artroom-text-1`, until a `redact` effect removes it (section 6.6).
 * `snapshot`: the list of staged refs that an ancestry record names, as the
 * host returned it and in byte order of `ref`, under its digest in the
 * domain `artroom-snapshot-1` (sections 9.2 and 16.4). It is stored before
 * the entry that names the digest. The contract states the bytes and the
 * domain, and no name for the kind: `snapshot` is its own word for it (I3
 * deltas, entry EL7; confirmed in the contract's revision 19).
 * `value`: a value beside an intent (sections 6.2 and 9.2, revision 19), as
 * its canonical JSON, under its byte domain and its digest there. The
 * record states the domain in `domain`, because the kind alone does not
 * give it, and no other kind states the member. A value in
 * `artroom-definition-1` is a definition, and is kept under the kind
 * `definition`. A value is never removed.
 * `bytes` is canonical JSON text.
 */
export interface RetainedInput { kind: "definition" | "entry" | "rule" | "text" | "snapshot" | "value"; digest: Digest; bytes: string; under?: string; domain?: string }

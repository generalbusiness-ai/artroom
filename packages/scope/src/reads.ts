/**
 * Reads (scope contract, section 9.1). Every read is bounded, is a statement
 * about `at`, the head it was read at, and says whether it is complete. A
 * reader may conclude "no such item", or a count, only from the summary's
 * exact counts or from every page read at one `at`. A page marked
 * `complete: false` supports neither.
 *
 * A read is one synchronous pass over storage, so it sees one head.
 *
 * Who may read is the readers port's to say, and in production that is a
 * read session (authority note, section 3.9; `sessions.ts`). Beside it, a
 * reader may present a signed read (`signed-reads.ts`): the summary, the
 * genesis and the entries of a key that signed an entry of this scope
 * within the authority window of an intent. A reader that presents
 * neither is answered `forbidden` by every read here.
 *
 * Three reads are of what is no history (authority note, section 12, G13
 * and G17): `incidents`, a page of the operator's record of this scope; and
 * the two lists of `waiting`, each a bounded pass over this scope's own
 * sends. Each answers `at`, the head at which it was read, and is no
 * statement about that head: the record and the dispatcher's bookkeeping
 * change with no entry. An age beside a row is for display only, and
 * nothing here changes because a request is old.
 */

import { ENTRY_READ_BYTES, HISTORY_PAGE_BYTES, HISTORY_PAGE_ENTRIES, OUTBOX_PAGE_DUTIES, RETAINED_INPUT_BYTES, RETAINED_ITEMS_PAGE } from "@generalbusiness/artroom-contract";
import type { Cursor, Digest, DutyId, Entry, KeyId, LogPage, OperationId, Read, ReadRefusal, RetainedInput, Summary } from "@generalbusiness/artroom-contract";
import { isDutyId, isOperationId, positionOf } from "@generalbusiness/artroom-bytes";
import { byteOrder, own, type Item, type ScopeState, type ValidDefinition } from "@generalbusiness/artroom-derive";
import type { Pinned } from "./core.ts";
import { waitingIn, type Incident, type OperatorRecord } from "./operator.ts";
import type { ReadName, Readers } from "./ports.ts";
import { checkSignedRead, presentsSignedRead, signerOf, type SignedReading } from "./signed-reads.ts";
import type { Duty, OperationStatus, Sealed, Store, Stored } from "./store.ts";

/** The kinds of retained input that the read route serves by digest. `value` is read by domain as well. */
export const READABLE: readonly RetainedInput["kind"][] = ["definition", "entry", "rule", "text", "snapshot", "value"];

/** The bound of each read. The defaults are the contract's table, and for a retained input the history page's byte bound. */
export interface ReadBounds { retainedItems: number; historyEntries: number; historyBytes: number; entryBytes: number; outboxDuties: number; retainedBytes: number }
export const READ_BOUNDS: ReadBounds = {
  retainedItems: RETAINED_ITEMS_PAGE, historyEntries: HISTORY_PAGE_ENTRIES, historyBytes: HISTORY_PAGE_BYTES, entryBytes: ENTRY_READ_BYTES, outboxDuties: OUTBOX_PAGE_DUTIES,
  retainedBytes: RETAINED_INPUT_BYTES,
};

export type { Summary };

const no = (reason: ReadRefusal) => ({ ok: false, reason }) as const;
/** A cursor made here is a decimal number. */
const position = (cursor: Cursor | undefined, first: number | null): number | null | undefined => (cursor === undefined ? first : (positionOf(cursor) ?? undefined));

/** A duty ID: the `seq` of an entry and the ordinal of one of its sends. */
/** The entry and the ordinal a duty ID names, or null. The form is the bytes package's to judge. */
const dutyOf = (duty: unknown): [seq: number, n: number] | null => (isDutyId(duty) ? (duty.split(".").map(Number) as [number, number]) : null);

/** The entry that opened an operation and its ordinal there, from its ID, or null. The form is the bytes package's to judge. */
const operationOf = (id: unknown): [seq: number, k: number] | null => (isOperationId(id) ? (id.split(":").map(Number) as [number, number]) : null);

export class Reads {
  readonly #store: Store;
  readonly #pinned: () => Pinned | null;
  readonly #readers: Readers;
  readonly #bounds: ReadBounds;
  readonly #record: OperatorRecord | null;
  readonly #signed: SignedReading | null;

  /**
   * `record`: the operator's record of this scope. Null: it keeps none, and the read of it finds nothing.
   * `signed`: the clock and the window that a signed read is judged by. Null: this scope answers no signed read.
   */
  constructor(store: Store, pinned: () => Pinned | null, readers: Readers, bounds: ReadBounds = READ_BOUNDS, record: OperatorRecord | null = null, signed: SignedReading | null = null) {
    this.#store = store;
    this.#pinned = pinned;
    this.#readers = readers;
    this.#bounds = bounds;
    this.#record = record;
    this.#signed = signed;
  }

  /**
   * Who may read is asked first, so a refusal says nothing about what
   * exists. A reader that may not read is answered `forbidden`. A session
   * that could not be judged is answered with the port's own name for that:
   * `sessions-unavailable` or `clock-behind`. Nothing is read in any case.
   */
  /**
   * A reader that presents a signed read is judged by that alone, and never
   * by the readers port: only the reads of `SIGNED_READS`, with `arg` as
   * the argument that the request must name. `signer`: the key of a signed
   * read, whose reads of entries are limited to the genesis and its own.
   * Null: a session or the readers port allowed the read whole.
   */
  #open(reader: unknown, read: ReadName, arg?: string): { scope: ScopeState; pinned: Pinned; signer: KeyId | null } | { ok: false; reason: ReadRefusal } {
    let signer: KeyId | null = null;
    if (presentsSignedRead(reader)) {
      if (!this.#signed) return no("forbidden");
      // A read that a signed read cannot name has no argument here, and no request names it: it is refused by the check.
      const checked = checkSignedRead(this.#signed, this.#store, reader as string, read, arg ?? "");
      if (!("key" in checked)) return no(checked.refused === false ? "forbidden" : checked.refused);
      signer = checked.key;
    } else {
      const allowed = this.#readers.allows(reader, read);
      if (allowed !== true) return no(allowed === false ? "forbidden" : allowed);
    }
    const scope = this.#store.scope();
    const pinned = this.#pinned();
    return scope && pinned ? { scope, pinned, signer } : no("not-found");
  }
  /** Whether the reader that `signer` names may have this stored entry: every reader but a signed one; a signed one, the genesis and its own. */
  #mine(signer: KeyId | null, row: Stored): boolean {
    return signer === null || row.seq === 0 || signerOf(JSON.parse(row.bytes) as Entry, this.#store) === signer;
  }
  /** For a read that needs the definition: its item types and their states. */
  #defined(reader: unknown, read: ReadName, arg?: string): { scope: ScopeState; pinned: Pinned; definition: ValidDefinition } | { ok: false; reason: ReadRefusal } {
    const open = this.#open(reader, read, arg);
    if (!("scope" in open)) return open;
    return open.pinned.definition ? { ...open, definition: open.pinned.definition } : no("unsupported-definition");
  }

  /** One response. Each type's `max` bounds its live items, and the definition bounds the counts. */
  summary(reader: unknown): Read<Summary> {
    const open = this.#defined(reader, "summary", "summary");
    if (!("scope" in open)) return open;
    const { scope, pinned, definition } = open;
    const items: Item[] = [];
    const counts: [string, string, number][] = [];
    let complete = true;
    for (const [name, type] of Object.entries(definition.declared.items).sort(([a], [b]) => byteOrder(a, b))) {
      const states = Object.keys(type.states).sort(byteOrder);
      for (const state of states) counts.push([name, state, this.#store.count(name, state)]);
      const live = this.#store.page(name, states.filter((s) => !own(type.states, s)!.final), null, type.max);
      items.push(...live.items);
      if (live.more) complete = false;
    }
    items.sort((a, b) => a.id - b.id);
    return { ok: true, at: scope.head, value: { scope: scope.at, status: scope.status, definition: pinned.named, time: scope.time, items, counts }, complete };
  }

  /** A page of the retained final items of one type, by ID. Their total is not bounded; each page is. */
  items(reader: unknown, type: string, cursor?: Cursor): Read<readonly Item[]> {
    const open = this.#defined(reader, "items");
    if (!("scope" in open)) return open;
    const declared = own(open.definition.declared.items, type);
    const after = position(cursor, null);
    if (!declared || after === undefined) return no("not-found");
    const final = Object.keys(declared.states).filter((s) => own(declared.states, s)!.final);
    const page = this.#store.page(type, final, after, this.#bounds.retainedItems);
    return { ok: true, at: open.scope.head, value: page.items, complete: !page.more, ...(page.more ? { next: String(page.items.at(-1)!.id) } : {}) };
  }

  /** The stored rows of one history page from `from`: at most the bound's entries and bytes, and at least one entry. */
  #page(from: number): { rows: Stored[]; more: boolean } {
    const rows = this.#store.storedFrom(from, this.#bounds.historyEntries + 1);
    const page: Stored[] = [];
    let bytes = 0;
    for (const row of rows.slice(0, this.#bounds.historyEntries)) {
      if (page.length > 0 && bytes + row.size > this.#bounds.historyBytes) break;
      bytes += row.size;
      page.push(row);
    }
    return { rows: page, more: page.length < rows.length };
  }

  /** A page of the history from the entry the cursor names, or from the genesis: at most the bound's entries and bytes, and at least one entry. */
  history(reader: unknown, cursor?: Cursor): Read<readonly Sealed[]> {
    const open = this.#open(reader, "history", cursor ?? "0");
    if (!("scope" in open)) return open;
    const from = position(cursor, 0);
    if (from === undefined || from === null) return no("not-found");
    const { rows, more } = this.#page(from);
    return { ok: true, at: open.scope.head, value: rows.filter((row) => this.#mine(open.signer, row)).map((row) => ({ entry: JSON.parse(row.bytes) as Entry, hash: row.hash })), complete: !more, ...(more ? { next: String(from + rows.length) } : {}) };
  }

  /**
   * The same page as it is stored (sections 9.2 and 9.4): each entry as its
   * canonical JSON text, with the hash stored for it. A verifier hashes the
   * bytes itself, before it reads the content. The page has the bounds of a
   * history page.
   */
  log(reader: unknown, cursor?: Cursor): Read<LogPage> {
    const open = this.#open(reader, "log", cursor ?? "0");
    if (!("scope" in open)) return open;
    const from = position(cursor, 0);
    if (from === undefined || from === null) return no("not-found");
    const { rows, more } = this.#page(from);
    const value: LogPage = { scope: open.scope.at, definition: open.pinned.named, entries: rows.filter((row) => this.#mine(open.signer, row)).map((row) => ({ seq: row.seq, hash: row.hash, bytes: row.bytes })) };
    return { ok: true, at: open.scope.head, value, complete: !more, ...(more ? { next: String(from + rows.length) } : {}) };
  }

  /**
   * One retained input, by kind and digest (section 9.2). One over the byte bound is `too-large`.
   *
   * Values are read by domain and digest, with the same authority and byte bound as every other retained input.
   */
  retained(reader: unknown, kind: RetainedInput["kind"], digest: Digest, domain?: string): Read<RetainedInput> {
    const open = this.#open(reader, "retained");
    if (!("scope" in open)) return open;
    if (!READABLE.includes(kind) || typeof digest !== "string" || (kind === "value" && (typeof domain !== "string" || domain.length === 0))) return no("not-found");
    // The size is asked of storage first, so an input over the bound is refused before any of it is read into memory.
    const size = this.#store.retainedSize(kind, digest, domain);
    if (size === null) return no("not-found");
    if (size > this.#bounds.retainedBytes) return no("too-large");
    const kept = this.#store.retained(kind, digest, domain);
    if (!kept) return no("not-found");
    return { ok: true, at: open.scope.head, value: kept, complete: true };
  }

  /** One entry by `seq`. */
  entry(reader: unknown, seq: number): Read<Sealed> {
    const open = this.#open(reader, "entry", String(seq));
    if (!("scope" in open)) return open;
    const row = Number.isSafeInteger(seq) ? this.#store.stored(seq) : null;
    if (!row) return no("not-found");
    if (!this.#mine(open.signer, row)) return no("forbidden");
    if (row.size > this.#bounds.entryBytes) return no("too-large");
    return { ok: true, at: open.scope.head, value: { entry: JSON.parse(row.bytes) as Entry, hash: row.hash }, complete: true };
  }

  /** A page of the outbox: each send in the order of its entry and ordinal. The cursor is the last duty of the page before. */
  outbox(reader: unknown, cursor?: Cursor): Read<readonly Duty[]> {
    const open = this.#open(reader, "outbox");
    if (!("scope" in open)) return open;
    const at = cursor === undefined ? null : dutyOf(cursor);
    if (cursor !== undefined && !at) return no("not-found");
    const page = this.#store.duties(at ? { seq: at[0], n: at[1] } : null, this.#bounds.outboxDuties);
    return { ok: true, at: open.scope.head, value: page.duties, complete: !page.more, ...(page.more ? { next: page.duties.at(-1)!.duty } : {}) };
  }

  /** The outbox row of one send, by its duty ID. */
  duty(reader: unknown, duty: DutyId): Read<Duty> {
    const open = this.#open(reader, "outbox");
    if (!("scope" in open)) return open;
    const at = dutyOf(duty);
    const row = at ? this.#store.duty(at[0], at[1]) : null;
    return row ? { ok: true, at: open.scope.head, value: row, complete: true } : no("not-found");
  }

  /**
   * A page of the outside operations (section 4.3), in the order of the
   * entry that opened each and its ordinal there: each with its attempts,
   * their outcomes, its state as a preparation status gives it, and the
   * driver's bookkeeping, which is no history. `open`: only the operations
   * that are not settled, which are the duties this scope still holds. The
   * cursor is the ID of the last operation of the page before.
   */
  operations(reader: unknown, cursor?: Cursor, open = false): Read<readonly OperationStatus[]> {
    const read = this.#open(reader, "operations");
    if (!("scope" in read)) return read;
    const at = cursor === undefined ? null : operationOf(cursor);
    if (cursor !== undefined && !at) return no("not-found");
    const page = this.#store.operations(at ? { seq: at[0], k: at[1] } : null, this.#bounds.outboxDuties, open === true);
    return { ok: true, at: read.scope.head, value: page.operations, complete: !page.more, ...(page.more ? { next: page.operations.at(-1)!.operation.id } : {}) };
  }

  /** One operation, by its ID. */
  operation(reader: unknown, operation: OperationId): Read<OperationStatus> {
    const read = this.#open(reader, "operations");
    if (!("scope" in read)) return read;
    const found = operationOf(operation) ? this.#store.operationStatus(operation) : null;
    return found ? { ok: true, at: read.scope.head, value: found, complete: true } : no("not-found");
  }

  /**
   * A page of the operator's record of this scope (authority note, section
   * 12, G13), in the order in which its rows were written. The cursor is
   * the number of the last row of the page before. It is shown on the
   * repository's admin page: the session of a member whose role holds
   * `membership.*` may read it, and no other session may.
   */
  incidents(reader: unknown, cursor?: Cursor): Read<readonly Incident[]> {
    const open = this.#open(reader, "incidents");
    if (!("scope" in open)) return open;
    const after = position(cursor, null);
    if (after === undefined) return no("not-found");
    const page = this.#record?.page(after, this.#bounds.outboxDuties) ?? { incidents: [], more: false };
    return { ok: true, at: open.scope.head, value: page.incidents, complete: !page.more, ...(page.more ? { next: String(page.incidents.at(-1)!.n) } : {}) };
  }

  /**
   * One of the two lists of requests that wait (authority note, section 12,
   * G17), by the sending scope's own bounded read of its sends. `diagnosed`:
   * a request with a `delivery-unavailable` diagnosis. `unanswered`: a
   * request that transport acknowledged and that has no result. One call
   * passes over one page of the outbox and answers the rows of that page
   * that are in the list, which may be none. `next` is the last send that
   * was passed over, and `complete` says that the outbox ended.
   */
  waiting(reader: unknown, list: "diagnosed" | "unanswered", cursor?: Cursor): Read<readonly Duty[]> {
    const open = this.#open(reader, "waiting");
    if (!("scope" in open)) return open;
    const at = cursor === undefined ? null : dutyOf(cursor);
    if ((list !== "diagnosed" && list !== "unanswered") || (cursor !== undefined && !at)) return no("not-found");
    const page = this.#store.duties(at ? { seq: at[0], n: at[1] } : null, this.#bounds.outboxDuties);
    return { ok: true, at: open.scope.head, value: page.duties.filter((duty) => waitingIn(duty) === list), complete: !page.more, ...(page.more ? { next: page.duties.at(-1)!.duty } : {}) };
  }
}

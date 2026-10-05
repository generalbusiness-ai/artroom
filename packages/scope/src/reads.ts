/**
 * Reads (scope contract, section 9.1). Every read is bounded, is a statement
 * about `at`, the head it was read at, and says whether it is complete. A
 * reader may conclude "no such item", or a count, only from the summary's
 * exact counts or from every page read at one `at`. A page marked
 * `complete: false` supports neither.
 *
 * A read is one synchronous pass over storage, so it sees one head.
 */

import { ENTRY_READ_BYTES, HISTORY_PAGE_BYTES, HISTORY_PAGE_ENTRIES, OUTBOX_PAGE_DUTIES, RETAINED_INPUT_BYTES, RETAINED_ITEMS_PAGE } from "@generalbusiness/artroom-contract";
import type { Cursor, Digest, DutyId, Entry, LogPage, Read, ReadRefusal, RetainedInput, Summary } from "@generalbusiness/artroom-contract";
import { isDutyId, positionOf } from "@generalbusiness/artroom-bytes";
import { byteOrder, own, type Item, type ScopeState, type ValidDefinition } from "@generalbusiness/artroom-derive";
import type { Pinned } from "./core.ts";
import type { ReadName, Readers } from "./ports.ts";
import type { Duty, Sealed, Store, Stored } from "./store.ts";

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

export class Reads {
  readonly #store: Store;
  readonly #pinned: () => Pinned | null;
  readonly #readers: Readers;
  readonly #bounds: ReadBounds;

  constructor(store: Store, pinned: () => Pinned | null, readers: Readers, bounds: ReadBounds = READ_BOUNDS) {
    this.#store = store;
    this.#pinned = pinned;
    this.#readers = readers;
    this.#bounds = bounds;
  }

  /** Who may read is asked first, so a refusal says nothing about what exists. */
  #open(reader: unknown, read: ReadName): { scope: ScopeState; pinned: Pinned } | { ok: false; reason: ReadRefusal } {
    if (!this.#readers.allows(reader, read)) return no("forbidden");
    const scope = this.#store.scope();
    const pinned = this.#pinned();
    return scope && pinned ? { scope, pinned } : no("not-found");
  }
  /** For a read that needs the definition: its item types and their states. */
  #defined(reader: unknown, read: ReadName): { scope: ScopeState; pinned: Pinned; definition: ValidDefinition } | { ok: false; reason: ReadRefusal } {
    const open = this.#open(reader, read);
    if (!("scope" in open)) return open;
    return open.pinned.definition ? { ...open, definition: open.pinned.definition } : no("unsupported-definition");
  }

  /** One response. Each type's `max` bounds its live items, and the definition bounds the counts. */
  summary(reader: unknown): Read<Summary> {
    const open = this.#defined(reader, "summary");
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
    const open = this.#open(reader, "history");
    if (!("scope" in open)) return open;
    const from = position(cursor, 0);
    if (from === undefined || from === null) return no("not-found");
    const { rows, more } = this.#page(from);
    return { ok: true, at: open.scope.head, value: rows.map((row) => ({ entry: JSON.parse(row.bytes) as Entry, hash: row.hash })), complete: !more, ...(more ? { next: String(from + rows.length) } : {}) };
  }

  /**
   * The same page as it is stored (sections 9.2 and 9.4): each entry as its
   * canonical JSON text, with the hash stored for it. A verifier hashes the
   * bytes itself, before it reads the content. The page has the bounds of a
   * history page.
   */
  log(reader: unknown, cursor?: Cursor): Read<LogPage> {
    const open = this.#open(reader, "log");
    if (!("scope" in open)) return open;
    const from = position(cursor, 0);
    if (from === undefined || from === null) return no("not-found");
    const { rows, more } = this.#page(from);
    const value: LogPage = { scope: open.scope.at, definition: open.pinned.named, entries: rows.map((row) => ({ seq: row.seq, hash: row.hash, bytes: row.bytes })) };
    return { ok: true, at: open.scope.head, value, complete: !more, ...(more ? { next: String(from + rows.length) } : {}) };
  }

  /** One retained input, by kind and digest (section 9.2). One over the byte bound is `too-large`. */
  retained(reader: unknown, kind: RetainedInput["kind"], digest: Digest): Read<RetainedInput> {
    const open = this.#open(reader, "retained");
    if (!("scope" in open)) return open;
    if (!(kind === "definition" || kind === "entry" || kind === "rule" || kind === "text") || typeof digest !== "string") return no("not-found");
    // The size is asked of storage first, so an input over the bound is refused before any of it is read into memory.
    const size = this.#store.retainedSize(kind, digest);
    if (size === null) return no("not-found");
    if (size > this.#bounds.retainedBytes) return no("too-large");
    const kept = this.#store.retained(kind, digest);
    if (!kept) return no("not-found");
    return { ok: true, at: open.scope.head, value: kept, complete: true };
  }

  /** One entry by `seq`. */
  entry(reader: unknown, seq: number): Read<Sealed> {
    const open = this.#open(reader, "entry");
    if (!("scope" in open)) return open;
    const row = Number.isSafeInteger(seq) ? this.#store.stored(seq) : null;
    if (!row) return no("not-found");
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
}

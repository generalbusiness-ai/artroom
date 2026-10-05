/**
 * Reads (scope contract, section 9.1). Every read is bounded, is a statement
 * about `at`, the head it was read at, and says whether it is complete. A
 * reader may conclude "no such item", or a count, only from the summary's
 * exact counts or from every page read at one `at`. A page marked
 * `complete: false` supports neither.
 *
 * A read is one synchronous pass over storage, so it sees one head.
 */

import { ENTRY_READ_BYTES, HISTORY_PAGE_BYTES, HISTORY_PAGE_ENTRIES, OUTBOX_PAGE_DUTIES, RETAINED_ITEMS_PAGE } from "@generalbusiness/artroom-contract";
import type { Cursor, Digest, Entry, PlatformDefinition, Read, ReadRefusal, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { byteOrder, type Item, type ScopeState, type Status, type ValidDefinition } from "@generalbusiness/artroom-derive";
import type { Pinned } from "./core.ts";
import type { ReadName, Readers } from "./ports.ts";
import type { Duty, Sealed, Store } from "./store.ts";

/** The bound of each read. The defaults are the contract's table. */
export interface ReadBounds { retainedItems: number; historyEntries: number; historyBytes: number; entryBytes: number; outboxDuties: number }
export const READ_BOUNDS: ReadBounds = {
  retainedItems: RETAINED_ITEMS_PAGE, historyEntries: HISTORY_PAGE_ENTRIES, historyBytes: HISTORY_PAGE_BYTES, entryBytes: ENTRY_READ_BYTES, outboxDuties: OUTBOX_PAGE_DUTIES,
};

/**
 * A scope's summary: its live items, and the exact number of items in each
 * type and state, retained final items included. Final items are counted
 * and not listed; `Reads.items` pages them.
 */
export interface Summary {
  scope: ScopeRef; status: Status; definition: Digest | PlatformDefinition; time: Timestamp;
  items: readonly Item[];                                                    // live, by ID
  counts: readonly (readonly [type: string, state: string, n: number])[];    // every type and state of the definition, by type, then state
}

const no = (reason: ReadRefusal) => ({ ok: false, reason }) as const;
/** A cursor made here is a decimal number. */
const position = (cursor: Cursor | undefined, first: number | null): number | null | undefined => (cursor === undefined ? first : /^(0|[1-9][0-9]{0,15})$/.test(cursor) ? Number(cursor) : undefined);

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
      const live = this.#store.page(name, states.filter((s) => !type.states[s]!.final), null, type.max);
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
    const declared = Object.hasOwn(open.definition.declared.items, type) ? open.definition.declared.items[type] : undefined;
    const after = position(cursor, null);
    if (!declared || after === undefined) return no("not-found");
    const final = Object.keys(declared.states).filter((s) => declared.states[s]!.final);
    const page = this.#store.page(type, final, after, this.#bounds.retainedItems);
    return { ok: true, at: open.scope.head, value: page.items, complete: !page.more, ...(page.more ? { next: String(page.items.at(-1)!.id) } : {}) };
  }

  /** A page of the history from the entry the cursor names, or from the genesis: at most the bound's entries and bytes, and at least one entry. */
  history(reader: unknown, cursor?: Cursor): Read<readonly Sealed[]> {
    const open = this.#open(reader, "history");
    if (!("scope" in open)) return open;
    const from = position(cursor, 0);
    if (from === undefined || from === null) return no("not-found");
    const rows = this.#store.storedFrom(from, this.#bounds.historyEntries + 1);
    const page: Sealed[] = [];
    let bytes = 0;
    for (const row of rows.slice(0, this.#bounds.historyEntries)) {
      if (page.length > 0 && bytes + row.size > this.#bounds.historyBytes) break;
      bytes += row.size;
      page.push({ entry: JSON.parse(row.bytes) as Entry, hash: row.hash });
    }
    const more = page.length < rows.length;
    return { ok: true, at: open.scope.head, value: page, complete: !more, ...(more ? { next: String(from + page.length) } : {}) };
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
    const at = cursor === undefined ? null : /^(0|[1-9][0-9]{0,15})\.(0|[1-9][0-9]{0,5})$/.exec(cursor);
    if (cursor !== undefined && !at) return no("not-found");
    const page = this.#store.duties(at ? { seq: Number(at[1]), n: Number(at[2]) } : null, this.#bounds.outboxDuties);
    return { ok: true, at: open.scope.head, value: page.duties, complete: !page.more, ...(page.more ? { next: page.duties.at(-1)!.duty } : {}) };
  }
}

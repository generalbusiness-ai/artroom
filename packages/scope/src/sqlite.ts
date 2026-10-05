/**
 * The store over SQLite, as a Durable Object has it (scope contract, section
 * 11.6). `Sql` is the little of that storage this file uses: a Durable
 * Object's `ctx.storage.sql.exec` and `ctx.storage.transactionSync` satisfy
 * it.
 *
 * Nothing is kept in memory but the list of indexed slots, which is derived
 * from the definition. So a transaction that does not commit leaves nothing
 * behind, and an object that restarts reads the same state.
 *
 * Every value is canonical JSON in a TEXT column. SQLite stores TEXT as
 * UTF-8, and canonical JSON has no lone surrogate, so the stored bytes are
 * the canonical bytes.
 */

import type { Digest, Entry, FactRef, KeyId, OperationId, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { MemoryState, slotOf, timeMs } from "@generalbusiness/artroom-derive";
import type { Accepted, Decided, HeldCreation, Item, Operation, Outstanding, OwnRequest, Page, RangeIndex, Relation, ScopeState, StateSnapshot } from "@generalbusiness/artroom-derive";
import type { Dispatched, Duty, Outgoing, Retained, Store, Stored } from "./store.ts";

export type SqlValue = string | number | null | ArrayBuffer;
export interface Sql {
  exec(query: string, ...bindings: SqlValue[]): { toArray(): Record<string, SqlValue>[] };
  transaction<T>(closure: () => T): T;
}

/**
 * The tables of one scope.
 *
 * - `meta`: the scope's record: its reference, status, head and last time.
 * - `entry`: the history. `actor`, `idem` and `intent` are set on an act
 *   entry: the idempotency index is an index over the history (section 4.2).
 * - `item`, `item_count`: the items, and the exact number in each type and
 *   state. `item_by_state` is the index of section 6.5, ordered by type,
 *   state and ID, so a page costs the rows it returns.
 * - `item_slot`: for each slot that a range guard's `where` reads, the
 *   slot's value in each item of that type, indexed by value.
 * - `outbox`: one row for each send. `request`, `result` and `diagnosis`
 *   are set for a request, which is the only send with a result. `attempts`,
 *   `next` and `ack` are the dispatcher's: the attempt log, when the next
 *   attempt is due, and the fact transport acknowledged the send with.
 *   `outbox_due` indexes the sends that are still to be dispatched.
 * - `inbox`: each incoming delivery this scope recorded, by source scope,
 *   incarnation, entry and ordinal.
 * - `folded`: folded records that are not items: relationship copies, held
 *   creations and outside operations.
 * - `retained_input`: section 9.2; see `Retained`.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS entry (seq INTEGER PRIMARY KEY, hash TEXT NOT NULL, time TEXT NOT NULL, bytes TEXT NOT NULL, size INTEGER NOT NULL, actor TEXT, idem TEXT, intent TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS entry_by_key ON entry (actor, idem) WHERE actor IS NOT NULL;
CREATE TABLE IF NOT EXISTS item (id INTEGER PRIMARY KEY, type TEXT NOT NULL, state TEXT NOT NULL, record TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS item_by_state ON item (type, state, id);
CREATE TABLE IF NOT EXISTS item_count (type TEXT NOT NULL, state TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (type, state)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS item_slot (id INTEGER NOT NULL, slot TEXT NOT NULL, type TEXT NOT NULL, state TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (id, slot)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS item_by_slot ON item_slot (type, slot, value, state, id);
CREATE TABLE IF NOT EXISTS outbox (seq INTEGER NOT NULL, n INTEGER NOT NULL, target TEXT NOT NULL, class TEXT NOT NULL, message TEXT NOT NULL, held INTEGER NOT NULL DEFAULT 0,
  attempts TEXT NOT NULL DEFAULT '[]', next INTEGER NOT NULL, ack TEXT, request TEXT, result TEXT, diagnosis TEXT, PRIMARY KEY (seq, n)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS outbox_due ON outbox (next, seq, n) WHERE held = 0 AND ack IS NULL AND result IS NULL AND diagnosis IS NULL;
CREATE INDEX IF NOT EXISTS outbox_open ON outbox (seq, n) WHERE request IS NOT NULL AND result IS NULL;
CREATE TABLE IF NOT EXISTS inbox (scope TEXT NOT NULL, inc TEXT NOT NULL, seq INTEGER NOT NULL, n INTEGER NOT NULL, hash TEXT NOT NULL, by INTEGER NOT NULL, PRIMARY KEY (scope, inc, seq, n)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS folded (kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (kind, key)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS retained_input (kind TEXT NOT NULL, digest TEXT NOT NULL, bytes TEXT NOT NULL, under TEXT, PRIMARY KEY (kind, digest)) WITHOUT ROWID;
`;

/** A send that is still to be dispatched: not held, not acknowledged, and for a request with no result and no diagnosis. */
const DUE = "o.held = 0 AND o.ack IS NULL AND o.result IS NULL AND o.diagnosis IS NULL";

type Row = Record<string, SqlValue>;
const json = <T>(text: SqlValue | undefined): T => JSON.parse(text as string) as T;
const orNull = <T>(text: SqlValue | undefined): T | null => (text === null || text === undefined ? null : json<T>(text));

export class SqliteStore implements Store {
  readonly #sql: Sql;
  /** For each item type, the slots a `where` reads. */
  #covered = new Map<string, readonly string[]>();

  constructor(sql: Sql) {
    this.#sql = sql;
    this.#run(SCHEMA);
  }

  #all(query: string, ...bindings: SqlValue[]): Row[] { return this.#sql.exec(query, ...bindings).toArray(); }
  #one(query: string, ...bindings: SqlValue[]): Row | null { return this.#all(query, ...bindings)[0] ?? null; }
  #run(query: string, ...bindings: SqlValue[]): void { this.#sql.exec(query, ...bindings).toArray(); }
  #folded<T>(kind: string, key: string): T | null { return orNull<T>(this.#one("SELECT value FROM folded WHERE kind = ? AND key = ?", kind, key)?.["value"]); }
  #fold(kind: string, key: string, value: unknown): void { this.#run("INSERT INTO folded (kind, key, value) VALUES (?, ?, ?) ON CONFLICT (kind, key) DO UPDATE SET value = excluded.value", kind, key, canonicalize(value)); }

  transaction<T>(work: () => T): T { return this.#sql.transaction(work); }

  cover(indexes: readonly RangeIndex[]): void {
    const covered = new Map<string, string[]>();
    for (const { type, slots } of indexes) covered.set(type, [...new Set([...(covered.get(type) ?? []), ...slots])]);
    this.#covered = covered;
  }

  // ---------------------------------------------------------------- the view (derive's StateView)

  scope(): ScopeState | null { return orNull<ScopeState>(this.#one("SELECT v FROM meta WHERE k = 'scope'")?.["v"]); }
  item(id: number): Item | null { return orNull<Item>(this.#one("SELECT record FROM item WHERE id = ?", id)?.["record"]); }
  count(type: string, state: string): number { return (this.#one("SELECT n FROM item_count WHERE type = ? AND state = ?", type, state)?.["n"] as number | undefined) ?? 0; }

  /**
   * Section 6.5: one ordered read of `item_by_state` for each listed state,
   * from the cursor, of at most one row more than the page; then a merge by
   * ID. So a page costs the rows it returns for each state, whatever the
   * scope retains.
   */
  page(type: string, states: readonly string[], after: number | null, limit: number): Page {
    const found: Item[] = [];
    for (const state of new Set(states)) {
      for (const row of this.#all("SELECT record FROM item WHERE type = ? AND state = ? AND id > ? ORDER BY id LIMIT ?", type, state, after ?? -1, limit + 1)) found.push(json<Item>(row["record"]));
    }
    found.sort((a, b) => a.id - b.id);
    return { items: found.slice(0, limit), more: found.length > limit };
  }

  relation(owner: ScopeRef, name: string, item: number): Relation | null { return this.#folded("relation", canonicalize([owner.scope, owner.inc, name, item])); }
  accepted(actor: KeyId, idempotencyKey: string): Accepted | null {
    const row = this.#one("SELECT seq, intent FROM entry WHERE actor = ? AND idem = ?", actor, idempotencyKey);
    return row && { seq: row["seq"] as number, intent: row["intent"] as Digest };
  }
  request(seq: number, n: number): OwnRequest | null {
    const row = this.#one("SELECT o.seq, o.n, o.target, o.request, o.result, o.diagnosis, e.hash FROM outbox o JOIN entry e ON e.seq = o.seq WHERE o.seq = ? AND o.n = ? AND o.request IS NOT NULL", seq, n);
    return row && requestOf(row);
  }
  decided(from: ScopeRef, seq: number, n: number): Decided | null {
    const row = this.#one("SELECT hash, by FROM inbox WHERE scope = ? AND inc = ? AND seq = ? AND n = ?", from.scope, from.inc, seq, n);
    return row && { from: { scope: from.scope, inc: from.inc }, seq, hash: row["hash"] as Digest, n, by: row["by"] as number };
  }
  creation(seed: Digest): HeldCreation | null { return this.#folded("creation", seed); }
  operation(id: OperationId): Operation | null { return this.#folded("operation", id); }
  /**
   * Counted from the rows of requests with no result, which `outbox_open`
   * indexes, and from the operations, which no form opens yet.
   */
  outstanding(): Outstanding {
    const open = this.#one("SELECT COALESCE(SUM(diagnosis IS NULL), 0) AS requests, COALESCE(SUM(diagnosis LIKE '%\"delivery-unavailable\"%'), 0) AS unavailable FROM outbox WHERE request IS NOT NULL AND result IS NULL")!;
    const attempts = this.#all("SELECT value FROM folded WHERE kind = 'operation'").flatMap((row) => json<Operation>(row["value"]).attempts);
    return {
      requests: open["requests"] as number, unavailable: open["unavailable"] as number,
      opened: attempts.filter((a) => a.outcome === null).length, unknown: attempts.filter((a) => a.outcome?.result === "unknown").length,
    };
  }

  /**
   * Everything, for a checkpoint: the one read that is not bounded. The rows
   * are put in derive's `MemoryState`, whose snapshot fixes the order of each
   * list, so the digest is the one a verifier computes.
   */
  all(): StateSnapshot {
    const memory = new MemoryState();
    const scope = this.scope();
    if (scope) memory.setScope(scope);
    for (const row of this.#all("SELECT record FROM item ORDER BY id")) memory.putItem(json<Item>(row["record"]));
    for (const row of this.#all("SELECT type, state, n FROM item_count WHERE n <> 0")) memory.addCount(row["type"] as string, row["state"] as string, row["n"] as number);
    for (const row of this.#all("SELECT kind, key, value FROM folded")) {
      if (row["kind"] === "relation") memory.putRelation(json(row["value"]));
      else if (row["kind"] === "creation") memory.putCreation(row["key"] as Digest, json(row["value"]));
      else memory.putOperation(json(row["value"]));
    }
    for (const row of this.#all("SELECT seq, actor, idem, intent FROM entry WHERE actor IS NOT NULL")) memory.putAccepted(row["actor"] as KeyId, row["idem"] as string, { seq: row["seq"] as number, intent: row["intent"] as Digest });
    for (const row of this.#all("SELECT o.seq, o.n, o.target, o.request, o.result, o.diagnosis, e.hash FROM outbox o JOIN entry e ON e.seq = o.seq WHERE o.request IS NOT NULL")) memory.putRequest(requestOf(row));
    for (const row of this.#all("SELECT scope, inc, seq, n, hash, by FROM inbox")) {
      // The record keeps the source's scope and incarnation; its kind is not part of the key and is not read.
      const at = { scope: row["scope"], inc: row["inc"], kind: "lane" } as ScopeRef;
      memory.putDecided({ at, seq: row["seq"] as number, hash: row["hash"] as Digest }, row["n"] as number, row["by"] as number);
    }
    return memory.all();
  }

  // ---------------------------------------------------------------- the fold's changes (derive's StateWriter)

  setScope(scope: ScopeState): void {
    const was = this.scope();
    this.#run("INSERT INTO meta (k, v) VALUES ('scope', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", canonicalize(scope));
    // Section 7.2: the held sends are sends of the genesis entry. The flag follows the list the fold keeps.
    if (canonicalize(was?.held ?? []) !== canonicalize(scope.held)) {
      this.#run("UPDATE outbox SET held = 0 WHERE seq = 0 AND held = 1");
      for (const n of scope.held) this.#run("UPDATE outbox SET held = 1 WHERE seq = 0 AND n = ?", n);
    }
  }
  putItem(item: Item): void {
    this.#run("INSERT INTO item (id, type, state, record) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET type = excluded.type, state = excluded.state, record = excluded.record", item.id, item.type, item.state, canonicalize(item));
    for (const slot of this.#covered.get(item.type) ?? []) {
      this.#run("INSERT INTO item_slot (id, slot, type, state, value) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id, slot) DO UPDATE SET state = excluded.state, value = excluded.value", item.id, slot, item.type, item.state, canonicalize(slotOf(item, slot)));
    }
  }
  addCount(type: string, state: string, by: number): void {
    this.#run("INSERT INTO item_count (type, state, n) VALUES (?, ?, ?) ON CONFLICT (type, state) DO UPDATE SET n = n + excluded.n", type, state, by);
  }
  putRelation(r: Relation): void { this.#fold("relation", canonicalize([r.owner.scope, r.owner.inc, r.name, r.item]), r); }
  putAccepted(actor: KeyId, idempotencyKey: string, accepted: Accepted): void {
    this.#run("UPDATE entry SET actor = ?, idem = ?, intent = ? WHERE seq = ?", actor, idempotencyKey, accepted.intent, accepted.seq);
  }
  putRequest(r: OwnRequest): void {
    // The row was written with its entry, by `append`. The send's address and the entry's hash never change.
    if (!this.#one("SELECT 1 AS x FROM outbox WHERE seq = ? AND n = ?", r.seq, r.n)) throw new Error(`no send ${r.seq}.${r.n} is in the outbox`);
    this.#run("UPDATE outbox SET request = ?, result = ?, diagnosis = ? WHERE seq = ? AND n = ?", r.type, r.result && canonicalize(r.result), r.diagnosis && canonicalize(r.diagnosis), r.seq, r.n);
  }
  putDecided(from: FactRef, n: number, by: number): void {
    this.#run("INSERT INTO inbox (scope, inc, seq, n, hash, by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (scope, inc, seq, n) DO UPDATE SET hash = excluded.hash, by = excluded.by", from.at.scope, from.at.inc, from.seq, n, from.hash, by);
  }
  putCreation(seed: Digest, held: HeldCreation): void { this.#fold("creation", seed, held); }
  putOperation(operation: Operation): void { this.#fold("operation", operation.id, operation); }

  // ---------------------------------------------------------------- what the fold does not keep

  append(entry: Entry, hash: Digest, bytes: string, size: number): void {
    this.#run("INSERT INTO entry (seq, hash, time, bytes, size) VALUES (?, ?, ?, ?, ?)", entry.seq, hash, entry.time, bytes, size);
    for (const send of entry.sends) {
      // A new send is due at once: its first attempt may start at its entry's time.
      this.#run("INSERT INTO outbox (seq, n, target, class, message, next) VALUES (?, ?, ?, ?, ?, ?)", entry.seq, send.n, canonicalize(send.to), send.message.class, canonicalize(send.message), timeMs(entry.time)!);
    }
  }
  retain(input: Retained): void {
    this.#run("INSERT INTO retained_input (kind, digest, bytes, under) VALUES (?, ?, ?, ?) ON CONFLICT (kind, digest) DO NOTHING", input.kind, input.digest, input.bytes, input.under ?? null);
  }

  stored(seq: number): Stored | null { return this.storedFrom(seq, 1).find((s) => s.seq === seq) ?? null; }
  storedFrom(seq: number, limit: number): Stored[] {
    return this.#all("SELECT seq, hash, bytes, size FROM entry WHERE seq >= ? ORDER BY seq LIMIT ?", seq, limit).map((row) => ({ seq: row["seq"] as number, hash: row["hash"] as Digest, bytes: row["bytes"] as string, size: row["size"] as number }));
  }
  retained(kind: Retained["kind"], digest: Digest): Retained | null {
    const row = this.#one("SELECT bytes, under FROM retained_input WHERE kind = ? AND digest = ?", kind, digest);
    return row && { kind, digest, bytes: row["bytes"] as string, ...(row["under"] === null ? {} : { under: row["under"] as string }) };
  }
  duty(seq: number, n: number): Duty | null {
    const row = this.#one(`SELECT ${DUTY} FROM outbox WHERE seq = ? AND n = ?`, seq, n);
    return row && dutyOf(row);
  }
  duties(after: { seq: number; n: number } | null, limit: number): { duties: Duty[]; more: boolean } {
    const rows = this.#all(`SELECT ${DUTY} FROM outbox WHERE (seq, n) > (?, ?) ORDER BY seq, n LIMIT ?`, after?.seq ?? -1, after?.n ?? -1, limit + 1);
    return { duties: rows.slice(0, limit).map(dutyOf), more: rows.length > limit };
  }

  // ---------------------------------------------------------------- the dispatcher's bookkeeping

  outgoing(now: number, limit: number): Outgoing[] {
    return this.#all(`SELECT o.seq, o.n, o.target, o.message, o.attempts, e.hash FROM outbox o JOIN entry e ON e.seq = o.seq WHERE ${DUE} AND o.next <= ? ORDER BY o.next, o.seq, o.n LIMIT ?`, now, limit)
      .map((row) => ({ seq: row["seq"] as number, n: row["n"] as number, hash: row["hash"] as Digest, to: json(row["target"]), message: json(row["message"]), attempts: json(row["attempts"]) }));
  }
  nextDispatch(): number | null { return (this.#one(`SELECT MIN(o.next) AS next FROM outbox o WHERE ${DUE}`)?.["next"] as number | null | undefined) ?? null; }
  attempted(seq: number, n: number, attempts: readonly Dispatched[], next: number): void {
    this.#run("UPDATE outbox SET attempts = ?, next = ? WHERE seq = ? AND n = ?", canonicalize(attempts), next, seq, n);
  }
  acknowledge(seq: number, n: number, attempts: readonly Dispatched[], fact: FactRef): void {
    this.#run("UPDATE outbox SET attempts = ?, ack = ? WHERE seq = ? AND n = ?", canonicalize(attempts), canonicalize(fact), seq, n);
  }
  deadline(): Timestamp | null { return (this.#one("SELECT v FROM meta WHERE k = 'deadline'")?.["v"] as Timestamp | undefined) ?? null; }
  setDeadline(at: Timestamp | null): void {
    if (at === null) this.#run("DELETE FROM meta WHERE k = 'deadline'");
    else this.#run("INSERT INTO meta (k, v) VALUES ('deadline', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", at);
  }
}

/** The columns of an outbox row that a read of its duty returns. */
const DUTY = "seq, n, target, class, held, attempts, ack, result, diagnosis";

function dutyOf(row: Row): Duty {
  return {
    duty: `${row["seq"] as number}.${row["n"] as number}`, to: json(row["target"]), class: row["class"] as Duty["class"], held: row["held"] === 1,
    attempts: json(row["attempts"]), acknowledged: orNull(row["ack"]), result: orNull(row["result"]), diagnosis: orNull(row["diagnosis"]),
  };
}

function requestOf(row: Row): OwnRequest {
  return {
    seq: row["seq"] as number, n: row["n"] as number, hash: row["hash"] as Digest, type: row["request"] as OwnRequest["type"], to: json(row["target"]),
    result: orNull(row["result"]), diagnosis: orNull(row["diagnosis"]),
  };
}

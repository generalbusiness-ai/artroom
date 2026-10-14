/**
 * The custody store over SQLite, for the hosted endpoint's agent object
 * (notes/2026-10-13-hosted-mcp-endpoint.md, section 3.6). It keeps the
 * `CustodyStore` contract and the file store's semantics, under the
 * platform's row ceiling and with its own budget:
 *
 * - **Records** are kept as canonical bytes in chunks of at most 1 MiB
 *   (`chunk`), with the row (`record`) written in the same transaction and
 *   read back and compared before `write` returns.
 * - **Segments** hold the outcomes a record spilled, each outcome's canonical
 *   bytes in rows of at most 512 KiB (`segment`, by ordinal and part), with
 *   the record's segment index (`segment_index`: row count, byte count) in
 *   the same transaction. An interrupted spill leaves no row and no change.
 * - **Archive, not deletion.** On a terminal write, terminal records beyond
 *   the newest `terminalMost` or older than `ageDays` move to `archive` and
 *   `archive_chunk` in the same transaction. `read` consults both. Nothing is
 *   deleted.
 * - **Budget.** Two monotone counters in `budget`: `used`, the bytes of every
 *   row as stored, and `reserved`, the completion capacity outstanding for
 *   identities that may still receive a result. An identity's completion
 *   need is counted on what its record rows hold now, never on a forecast:
 *   the record at its bound with every row's overhead, less the record rows
 *   as stored, plus one segment row of growth. `admit`, before anything is
 *   built or signed, reserves that whole need for a new identity; the write
 *   before every send, resubmit and repeat step tops the reservation up to
 *   the need again. Bytes a write stores move from `reserved` to `used`
 *   one for one, so an admitted identity's stored and reserved bytes sum to
 *   its complete cost until its result is written, and no top-up is needed
 *   after signing. A top-up that would cross the budget, or the identity's
 *   own limit, refuses `full` before anything is dispatched, and every
 *   reservation already outstanding stays. A terminal write releases the
 *   unconsumed rest. Reading needs nothing.
 * - **Storage failure is not settlement.** A write that fails (`fail`, a
 *   test's stand-in for `SQLITE_FULL`) rolls its transaction back and throws
 *   a plain error, which custody reports as a recoverable storage failure:
 *   the record stays as it was.
 * - **Locks.** The object interleaves at `await`: one promise chain per
 *   identity and one for admission.
 */

import { canonicalize, utf8 } from "@generalbusiness/artroom-bytes";
import { CustodyError, OUTCOMES_INLINE, RECORD_BYTES, TERMINAL, type CustodyRecord, type CustodyStore, type Outcome } from "./custody.ts";

export type SqlValue = string | number | null | ArrayBuffer | Uint8Array;
/** What this store needs of a Durable Object's SQLite storage: `ctx.storage.sql.exec` and `ctx.storage.transactionSync`. */
export interface Sql {
  exec(query: string, ...bindings: SqlValue[]): { toArray(): Record<string, SqlValue>[] };
  transaction<T>(closure: () => T): T;
}

export const CHUNK_BYTES = 1024 * 1024;
export const SEGMENT_ROW_BYTES = 512 * 1024;
/** What a row is charged beyond its bytes: a chunk or segment row, and the record row. */
export const CHUNK_ROW_OVERHEAD = 96;
export const RECORD_ROW_OVERHEAD = 256;
/** The charged cost of a record of `bytes`: its chunk rows with their overhead, and its record row. */
export const chargedOf = (bytes: number): number => bytes + Math.max(1, Math.ceil(bytes / CHUNK_BYTES)) * CHUNK_ROW_OVERHEAD + RECORD_ROW_OVERHEAD;
/** The most a record's rows are charged: the record at its bound. */
export const RECORD_CHARGED_MOST = chargedOf(RECORD_BYTES);
/** One identity's completion need with nothing stored: the record's rows at its bound, and one more segment row with its overhead. */
export const COMPLETION_BYTES = RECORD_CHARGED_MOST + SEGMENT_ROW_BYTES + CHUNK_ROW_OVERHEAD;
export const CUSTODY_BUDGET = 1024 * 1024 * 1024;
export const IDENTITY_MOST = 64 * 1024 * 1024;

export interface SqliteCustodyBounds {
  budget: number;
  identityMost: number;
  terminalMost: number;
  ageDays: number;
  /** A test's stand-in for a storage failure: called inside each write transaction with what the write is; throwing rolls the transaction back. */
  fail?: (point: "keep" | "dispatch" | "result" | "segment") => void;
}
export const SQLITE_CUSTODY_BOUNDS: SqliteCustodyBounds = { budget: CUSTODY_BUDGET, identityMost: IDENTITY_MOST, terminalMost: 1024, ageDays: 30 };

class Queue {
  #last: Promise<unknown> = Promise.resolve();
  run<T>(section: () => T | Promise<T>): Promise<T> {
    const result = this.#last.then(section);
    this.#last = result.catch(() => undefined);
    return result;
  }
}

const bytesOf = (bytes: SqlValue): Uint8Array => (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer));
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

export function sqliteStore(sql: Sql, bounds: SqliteCustodyBounds = SQLITE_CUSTODY_BOUNDS, now: () => number = Date.now): CustodyStore & { used(): number; reserved(): number; archived(): number; identity(id: string): { stored: number; reserved: number } } {
  sql.exec(`CREATE TABLE IF NOT EXISTS record (id TEXT PRIMARY KEY, phase TEXT NOT NULL, key TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, chunks INTEGER NOT NULL, size INTEGER NOT NULL)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS record_phase ON record (phase, created)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS chunk (id TEXT NOT NULL, idx INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY (id, idx))`);
  sql.exec(`CREATE TABLE IF NOT EXISTS segment (id TEXT NOT NULL, ordinal INTEGER NOT NULL, part INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY (id, ordinal, part))`);
  sql.exec(`CREATE TABLE IF NOT EXISTS segment_index (id TEXT PRIMARY KEY, count INTEGER NOT NULL, bytes INTEGER NOT NULL)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS archive (id TEXT PRIMARY KEY, phase TEXT NOT NULL, key TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, chunks INTEGER NOT NULL, size INTEGER NOT NULL)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS archive_chunk (id TEXT NOT NULL, idx INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY (id, idx))`);
  sql.exec(`CREATE TABLE IF NOT EXISTS identity (id TEXT PRIMARY KEY, stored INTEGER NOT NULL, reserved INTEGER NOT NULL)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS budget (k TEXT PRIMARY KEY, v INTEGER NOT NULL)`);
  sql.exec(`INSERT OR IGNORE INTO budget (k, v) VALUES ('used', 0), ('reserved', 0)`);

  const one = (query: string, ...bindings: SqlValue[]): Record<string, SqlValue> | null => sql.exec(query, ...bindings).toArray()[0] ?? null;
  const budget = (k: "used" | "reserved"): number => Number(one(`SELECT v FROM budget WHERE k = ?`, k)!["v"]);
  const setBudget = (k: "used" | "reserved", v: number) => { sql.exec(`UPDATE budget SET v = ? WHERE k = ?`, v, k); };
  const identityOf = (id: string): { stored: number; reserved: number } => {
    const row = one(`SELECT stored, reserved FROM identity WHERE id = ?`, id);
    return row ? { stored: Number(row["stored"]), reserved: Number(row["reserved"]) } : { stored: 0, reserved: 0 };
  };
  const setIdentity = (id: string, stored: number, reserved: number) => { sql.exec(`INSERT INTO identity (id, stored, reserved) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET stored = excluded.stored, reserved = excluded.reserved`, id, stored, reserved); };
  /**
   * Account `delta` stored bytes to an identity: growth from its reservation first, then from the budget's free space, which may
   * be none; a shrink of an identity that still reserves goes back to its reservation, so that what it stores and what it
   * reserves sum to its complete cost until its result is written.
   */
  const store = (id: string, delta: number) => {
    const me = identityOf(id);
    const used = budget("used"), reserved = budget("reserved");
    if (delta < 0) {
      const back = me.reserved > 0 ? -delta : 0;
      setBudget("used", used + delta);
      setBudget("reserved", reserved + back);
      setIdentity(id, me.stored + delta, me.reserved + back);
      return;
    }
    const fromReserved = Math.min(delta, me.reserved);
    if (used + reserved - fromReserved + delta > bounds.budget) throw new Error("SQLITE_FULL: the custody budget is exhausted");
    setBudget("used", used + delta);
    setBudget("reserved", reserved - fromReserved);
    setIdentity(id, me.stored + delta, me.reserved - fromReserved);
  };
  /** Release what an identity still reserves: at its terminal write. */
  const release = (id: string) => {
    const me = identityOf(id);
    if (me.reserved === 0) return;
    setBudget("reserved", budget("reserved") - me.reserved);
    setIdentity(id, me.stored, 0);
  };
  /** The charged cost of an identity's record rows as stored now, live or archived; 0 when it has no record. */
  const recordCharged = (id: string): number => {
    const row = one(`SELECT size FROM record WHERE id = ?`, id) ?? one(`SELECT size FROM archive WHERE id = ?`, id);
    return row ? Number(row["size"]) : 0;
  };
  /**
   * Top the identity's reservation up to its completion need, before anything is built (`admit`) and before a dispatch. The need
   * is counted on the record rows as stored, never on a forecast, so what a write stores comes out of the reservation one for
   * one and the need at the dispatch is already held. Refuses `full` before anything is written when the top-up would cross the
   * budget or the identity's limit; what is already reserved, for this identity and every other, stays.
   */
  const arm = (id: string) => {
    const me = identityOf(id);
    // The completion need is the net growth a dispatch can cause: the record's rows up to its bound, and one more segment row.
    const need = Math.max(0, RECORD_CHARGED_MOST - recordCharged(id)) + SEGMENT_ROW_BYTES + CHUNK_ROW_OVERHEAD;
    const topUp = Math.max(0, need - me.reserved);
    if (me.stored + need > bounds.identityMost) throw new CustodyError({ held: "full", reason: "budget", bytes: me.stored + need });
    if (topUp === 0) return;
    const used = budget("used"), reserved = budget("reserved");
    if (used + reserved + topUp > bounds.budget) throw new CustodyError({ held: "full", reason: "budget", bytes: used + reserved + topUp });
    setBudget("reserved", reserved + topUp);
    setIdentity(id, me.stored, me.reserved + topUp);
  };
  const rowBytes = (text: Uint8Array): number => text.length + CHUNK_ROW_OVERHEAD;
  const readChunks = (table: "chunk" | "archive_chunk", id: string, count: number): Uint8Array => {
    const rows = sql.exec(`SELECT idx, bytes FROM ${table} WHERE id = ? ORDER BY idx`, id).toArray();
    if (rows.length !== count) throw new Error(`${id}: ${rows.length} chunks where ${count} are recorded`);
    const parts = rows.map((r) => bytesOf(r["bytes"]!));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  };
  const parse = (bytes: Uint8Array): CustodyRecord => JSON.parse(decoder.decode(bytes)) as CustodyRecord;
  /**
   * Move the oldest terminal records past the count or the age to the archive: the same bytes, in the same transaction. A
   * record archived before and made live again (a refusal resubmitted) is archived again in place of its earlier copy: the
   * record itself carries every outcome, and its segment rows were never removed, so nothing of its history is lost.
   */
  const archive = () => {
    const terminal = sql.exec(`SELECT id, updated FROM record WHERE phase IN ('accepted', 'refused', 'mismatch', 'settled') ORDER BY updated ASC`).toArray();
    const old = now() - bounds.ageDays * 86_400_000;
    const due = terminal.filter((r, i) => i < terminal.length - bounds.terminalMost || Date.parse(String(r["updated"])) < old);
    for (const r of due) {
      const id = String(r["id"]);
      sql.exec(`DELETE FROM archive_chunk WHERE id = ?`, id);
      sql.exec(`DELETE FROM archive WHERE id = ?`, id);
      sql.exec(`INSERT INTO archive SELECT * FROM record WHERE id = ?`, id);
      sql.exec(`INSERT INTO archive_chunk SELECT * FROM chunk WHERE id = ?`, id);
      sql.exec(`DELETE FROM chunk WHERE id = ?`, id);
      sql.exec(`DELETE FROM record WHERE id = ?`, id);
    }
  };

  const locks = new Map<string, Queue>();
  const admission = new Queue();
  return {
    used: () => budget("used"),
    reserved: () => budget("reserved"),
    archived: () => Number(one(`SELECT COUNT(*) AS n FROM archive`)!["n"]),
    identity: identityOf,
    lock: async (id) => {
      // One section at a time per identity; a lock is held for the section, and released when it ends.
      if (!locks.has(id)) locks.set(id, new Queue());
      const queue = locks.get(id)!;
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      const taken = new Promise<void>((resolve) => { void queue.run(() => { resolve(); return held; }); });
      await taken;
      return async () => { release(); };
    },
    exclusive: (work) => admission.run(work),
    read: async (id) => {
      const live = one(`SELECT chunks FROM record WHERE id = ?`, id);
      if (live) return parse(readChunks("chunk", id, Number(live["chunks"])));
      const archived = one(`SELECT chunks FROM archive WHERE id = ?`, id);
      if (archived) return parse(readChunks("archive_chunk", id, Number(archived["chunks"])));
      return null;
    },
    write: async (id, record, options = {}) => {
      const bytes = utf8(canonicalize(record));
      const terminal = TERMINAL.has(record.phase);
      sql.transaction(() => {
        // Before a dispatch: the reservation, before anything is written, whatever the record's phase (a step on a terminal act
        // dispatches too). A result's write consumes what is held and reserves nothing.
        if (options.dispatch) arm(id);
        bounds.fail?.(options.dispatch ? "dispatch" : record.phase === "prepared" ? "keep" : "result");
        const before = one(`SELECT size FROM record WHERE id = ?`, id);
        const was = before ? Number(before["size"]) : 0;
        // A record made live again takes its archived copy's place: one owner at a time.
        const archived = one(`SELECT size FROM archive WHERE id = ?`, id);
        if (archived) { sql.exec(`DELETE FROM archive_chunk WHERE id = ?`, id); sql.exec(`DELETE FROM archive WHERE id = ?`, id); }
        sql.exec(`DELETE FROM chunk WHERE id = ?`, id);
        let size = 0;
        let chunks = 0;
        for (let at = 0; at < bytes.length || chunks === 0; at += CHUNK_BYTES, chunks++) {
          const part = bytes.subarray(at, Math.min(bytes.length, at + CHUNK_BYTES));
          sql.exec(`INSERT INTO chunk (id, idx, bytes) VALUES (?, ?, ?)`, id, chunks, part);
          size += rowBytes(part);
        }
        size += RECORD_ROW_OVERHEAD;
        sql.exec(`INSERT INTO record (id, phase, key, created, updated, chunks, size) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET phase = excluded.phase, updated = excluded.updated, chunks = excluded.chunks, size = excluded.size`,
          id, record.phase, record.identity.key, record.created, record.updated, chunks, size);
        store(id, size - (before ? was : archived ? Number(archived["size"]) : 0));
        // Capacity is released only once nothing is in flight: a terminal record whose write precedes a dispatch (a step on a
        // terminal act) keeps its reservation through the step's durable result; a step still `sent` or `unknown` keeps it too.
        const inFlight = options.dispatch || Object.values(record.steps).some((s) => s.phase === "sent" || s.phase === "unknown");
        if (terminal && !inFlight) { release(id); archive(); }
      });
      const back = await (async () => {
        const live = one(`SELECT chunks FROM record WHERE id = ?`, id);
        if (live) return readChunks("chunk", id, Number(live["chunks"]));
        const archived = one(`SELECT chunks FROM archive WHERE id = ?`, id)!;
        return readChunks("archive_chunk", id, Number(archived["chunks"]));
      })();
      if (back.length !== bytes.length || !back.every((b, i) => b === bytes[i])) throw new Error(`${id} read back differs`);
    },
    admit: async (id, bytes) => {
      // Before anything is built or signed: the identity's whole completion need, reserved or refused `full`. The caller's
      // forecast of the envelope is checked against the record's bound by custody itself; it shrinks nothing here.
      void bytes;
      sql.transaction(() => { arm(id); });
    },
    unadmit: async (id) => {
      sql.transaction(() => { if (!one(`SELECT id FROM record WHERE id = ?`, id)) release(id); });
    },
    unresolved: async () => sql.exec(`SELECT id, key, created FROM record WHERE phase NOT IN ('accepted', 'refused', 'mismatch', 'settled') ORDER BY created ASC`).toArray()
      .map((r) => ({ id: String(r["id"]), key: String(r["key"]), created: String(r["created"]) })),
    segment: async (id, at, outcomes) => {
      sql.transaction(() => {
        const index = one(`SELECT count, bytes FROM segment_index WHERE id = ?`, id);
        const count = index ? Number(index["count"]) : 0;
        let held = index ? Number(index["bytes"]) : 0;
        if (count < at) throw new Error(`the segment of ${id} holds fewer outcomes than its record counts`);
        // Cut what an interrupted earlier append left past the record's count, then append, each outcome in rows within the bound.
        if (count > at) {
          const cut = sql.exec(`SELECT bytes FROM segment WHERE id = ? AND ordinal >= ?`, id, at).toArray().reduce((n, r) => n + rowBytes(bytesOf(r["bytes"]!)), 0);
          sql.exec(`DELETE FROM segment WHERE id = ? AND ordinal >= ?`, id, at);
          held -= cut;
          store(id, -cut);
        }
        bounds.fail?.("segment");
        let added = 0;
        outcomes.forEach((outcome, i) => {
          const text = utf8(canonicalize(outcome));
          for (let part = 0, from = 0; from < text.length || part === 0; part++, from += SEGMENT_ROW_BYTES) {
            const piece = text.subarray(from, Math.min(text.length, from + SEGMENT_ROW_BYTES));
            sql.exec(`INSERT INTO segment (id, ordinal, part, bytes) VALUES (?, ?, ?, ?)`, id, at + i, part, piece);
            added += rowBytes(piece);
          }
        });
        sql.exec(`INSERT INTO segment_index (id, count, bytes) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET count = excluded.count, bytes = excluded.bytes`, id, at + outcomes.length, held + added);
        store(id, added);
      });
    },
    segmented: async (id, from, limit) => {
      if (limit <= 0) return [];
      const rows = sql.exec(`SELECT ordinal, part, bytes FROM segment WHERE id = ? AND ordinal >= ? AND ordinal < ? ORDER BY ordinal, part`, id, from, from + limit).toArray();
      const byOrdinal = new Map<number, Uint8Array[]>();
      for (const r of rows) {
        const ordinal = Number(r["ordinal"]);
        if (!byOrdinal.has(ordinal)) byOrdinal.set(ordinal, []);
        byOrdinal.get(ordinal)!.push(bytesOf(r["bytes"]!));
      }
      return [...byOrdinal.keys()].sort((a, b) => a - b).map((ordinal) => {
        const parts = byOrdinal.get(ordinal)!;
        const whole = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let at = 0;
        for (const p of parts) { whole.set(p, at); at += p.length; }
        return JSON.parse(decoder.decode(whole)) as Outcome;
      });
    },
  };
}

export { OUTCOMES_INLINE };

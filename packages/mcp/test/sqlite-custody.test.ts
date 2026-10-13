/**
 * The custody store over SQLite (src/sqlite-custody.ts), on Node's own SQLite: the store's contract and its budget, as the
 * hosted design's H6 states them at the store's level. The object-level cases (resets, interleaving, the budget across control
 * requests) run in the Workers runtime, in the hosted stories.
 */
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import type { Receipt } from "@generalbusiness/dap-contract";
import { canonicalize, utf8 } from "@generalbusiness/artroom-bytes";
import { COMPLETION_BYTES, SEGMENT_ROW_BYTES, sqliteStore, type Sql, type SqlValue, type SqliteCustodyBounds } from "../src/sqlite-custody.ts";
import { CustodyError, RECORD_BYTES, type CustodyRecord, type Outcome } from "../src/custody.ts";

/** Node's SQLite as the store sees a Durable Object's: `exec` with bindings, and a transaction that rolls back on a throw. */
function nodeSql(): Sql & { db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  let depth = 0;
  return {
    db,
    exec: (query, ...bindings) => {
      const statement = db.prepare(query);
      const args = bindings.map((b) => (b instanceof ArrayBuffer ? new Uint8Array(b) : b)) as never[];
      const rows = /^\s*SELECT/i.test(query) ? statement.all(...args) : (statement.run(...args), []);
      return { toArray: () => rows as Record<string, SqlValue>[] };
    },
    transaction: (closure) => {
      if (depth > 0) return closure();
      db.exec("BEGIN");
      depth++;
      try { const result = closure(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; } finally { depth--; }
    },
  };
}

const T = "2026-10-13T20:00:00Z";
const ref = { scope: "sc_target", inc: "in_aaaaaaaaaaaaaaaaaaaaaaaaaa", kind: "lane" } as never;
function recordOf(key: string, phase: CustodyRecord["phase"], padding = 0, outcomes: Outcome[] = []): CustodyRecord {
  return {
    v: 1, identity: { service: "https://s", membership: null, signer: "key_a" as never, target: ref, key }, binding: { definition: "d", kind: "k", declaration: null, pinned: "sha256:0" as never },
    meaning: "sha256:m" as never, envelope: { signed: { intent: { v: 1, kind: "k", notAfter: T, pad: "x".repeat(padding) }, sig: "s" } as never, beside: {} },
    phase, outcomes, count: outcomes.length, attempt: 1, steps: {}, created: T, updated: T,
  };
}
const receipt = (): Receipt => ({ fact: { at: ref, seq: 1 }, hash: "sha256:r", time: T } as unknown as Receipt);
const settled = (n: number): Outcome => ({ at: T, settled: receipt(), attempt: n });
const count = (sql: Sql, table: string, id: string): number => Number(sql.exec(`SELECT COUNT(*) AS n FROM ${table} WHERE id = ?`, id).toArray()[0]!["n"]);
const sized = (record: CustodyRecord): number => utf8(canonicalize(record)).length;

describe("the custody store over SQLite", () => {
  test("a record is written in chunks and read back equal; a storage failure leaves it as it was", async () => {
    const sql = nodeSql();
    let failing = false;
    const store = sqliteStore(sql, { budget: 64 * 1024 * 1024, identityMost: 64 * 1024 * 1024, terminalMost: 1024, ageDays: 30, fail: () => { if (failing) throw new Error("SQLITE_FULL"); } });
    const small = recordOf("small", "prepared");
    await store.write("a", small);
    expect(await store.read("a")).toEqual(small);
    expect(count(sql, "chunk", "a")).toBe(1);
    const large = recordOf("large", "sent", RECORD_BYTES - 128 * 1024);
    expect(sized(large)).toBeGreaterThan(1024 * 1024);
    expect(sized(large)).toBeLessThanOrEqual(RECORD_BYTES);
    await store.write("b", large);
    expect(await store.read("b")).toEqual(large);
    expect(count(sql, "chunk", "b")).toBe(2);
    // A failure inside the write: the transaction rolls back, the record reads as before, and the counters are unchanged.
    const [used, reserved] = [store.used(), store.reserved()];
    failing = true;
    await expect(store.write("a", recordOf("small", "unknown", 0, [{ at: T, lost: true, attempt: 1 }]))).rejects.toThrow(/SQLITE_FULL/);
    failing = false;
    expect(await store.read("a")).toEqual(small);
    expect([store.used(), store.reserved()]).toEqual([used, reserved]);
    expect((await store.unresolved()).map((r) => r.key)).toEqual(["small", "large"]);
  });

  test("outcomes spill to byte-bounded segment rows, in order, split when one is large, with an atomic index", async () => {
    const sql = nodeSql();
    let failing = false;
    const store = sqliteStore(sql, { budget: 256 * 1024 * 1024, identityMost: 64 * 1024 * 1024, terminalMost: 1024, ageDays: 30, fail: () => { if (failing) throw new Error("SQLITE_FULL"); } });
    await store.write("a", recordOf("a", "sent"));
    const many: Outcome[] = Array.from({ length: 120 }, (_, i) => ({ at: T, answer: { answer: "refused", reason: "x".repeat(20 * 1024) + i } as never, attempt: 1 }));
    await store.segment("a", 0, many);
    expect(await store.segmented("a", 0, 120)).toEqual(many);
    expect(await store.segmented("a", 118, 10)).toEqual(many.slice(118));
    // One outcome larger than a segment row is split across rows by part and reads back whole.
    const huge: Outcome = { at: T, answer: { answer: "refused", reason: "y".repeat(SEGMENT_ROW_BYTES + 4096) } as never, attempt: 1 };
    await store.segment("a", 120, [huge]);
    expect(Number(sql.exec(`SELECT COUNT(*) AS n FROM segment WHERE id = ? AND ordinal = 120`, "a").toArray()[0]!["n"])).toBe(2);
    expect(await store.segmented("a", 120, 1)).toEqual([huge]);
    // A repeat at an earlier position cuts what the interrupted append left, so it is idempotent.
    await store.segment("a", 120, [huge]);
    expect(await store.segmented("a", 119, 5)).toEqual([many[119], huge]);
    // An interrupted spill leaves the index and the rows as they were.
    const before = sql.exec(`SELECT count, bytes FROM segment_index WHERE id = ?`, "a").toArray()[0];
    failing = true;
    await expect(store.segment("a", 121, [settled(1)])).rejects.toThrow(/SQLITE_FULL/);
    failing = false;
    expect(sql.exec(`SELECT count, bytes FROM segment_index WHERE id = ?`, "a").toArray()[0]).toEqual(before);
    expect(await store.segmented("a", 121, 1)).toEqual([]);
  });

  test("terminal records past the count move to the archive, with the same bytes, and nothing is deleted", async () => {
    const sql = nodeSql();
    const store = sqliteStore(sql, { budget: 64 * 1024 * 1024, identityMost: 64 * 1024 * 1024, terminalMost: 2, ageDays: 30 });
    const records = ["p", "q", "r"].map((key) => recordOf(key, "accepted", 0, [settled(1)]));
    for (const [i, r] of records.entries()) { r.updated = `2026-10-13T20:0${i}:00Z`; await store.write(r.identity.key, r); }
    expect(store.archived()).toBe(1);
    expect(count(sql, "record", "p")).toBe(0);
    expect(count(sql, "archive", "p")).toBe(1);
    expect(await store.read("p")).toEqual(records[0]);
    expect(await store.read("q")).toEqual(records[1]);
    expect(await store.unresolved()).toEqual([]);
  });

  test("the budget: armed before a dispatch, refused full before anything is written, consumed by results, released at the end", async () => {
    const sql = nodeSql();
    const bounds: SqliteCustodyBounds = { budget: 2 * COMPLETION_BYTES + 64 * 1024, identityMost: 64 * 1024 * 1024, terminalMost: 1024, ageDays: 30 };
    const store = sqliteStore(sql, bounds);
    await store.write("a", recordOf("a", "sent"));
    // The write before the send is part of the dispatch: it draws its own bytes from the reservation it armed.
    expect(store.identity("a").reserved).toBe(COMPLETION_BYTES - store.identity("a").stored);
    expect(store.used() + store.reserved()).toBe(COMPLETION_BYTES);
    await store.write("b", recordOf("b", "sent"));
    const held = 2 * COMPLETION_BYTES;
    expect(store.used() + store.reserved()).toBe(held);
    // A third identity cannot be armed: refused full before dispatch, nothing written, the two reservations intact.
    const error = await store.write("c", recordOf("c", "sent")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CustodyError);
    expect((error as CustodyError).why).toMatchObject({ held: "full", reason: "bytes" });
    expect(await store.read("c")).toBeNull();
    expect(store.used() + store.reserved()).toBe(held);
    // A result for a consumes its reservation, never free space: a terminal write at full succeeds and its receipt reads back.
    const done = recordOf("a", "accepted", 0, [settled(1)]);
    await store.write("a", done);
    expect(await store.read("a")).toEqual(done);
    expect(store.identity("a").reserved).toBe(0);
    expect(store.used()).toBe(store.identity("a").stored + store.identity("b").stored);
    // Replay needs nothing: b's unresolved record is read while the budget is otherwise full.
    expect((await store.read("b"))?.phase).toBe("sent");
    // The released space admits c now.
    await store.write("c", recordOf("c", "sent"));
    expect(store.identity("c").reserved).toBeGreaterThan(0);
  });

  test("an identity's own limit: repeated attempts are paid in advance, and refuse full past the bound", async () => {
    const sql = nodeSql();
    const store = sqliteStore(sql, { budget: 1024 * 1024 * 1024, identityMost: COMPLETION_BYTES + SEGMENT_ROW_BYTES + 256 * 1024, terminalMost: 1024, ageDays: 30 });
    await store.write("a", recordOf("a", "sent"));
    const outcome = (n: number): Outcome => ({ at: T, answer: { answer: "refused", reason: "z".repeat(SEGMENT_ROW_BYTES - 4096) } as never, attempt: n });
    await store.segment("a", 0, [outcome(1)]);
    await store.write("a", recordOf("a", "unknown"));
    await store.segment("a", 1, [outcome(2)]);
    // A further attempt would need more than the identity may hold: refused before dispatch, the record unchanged.
    const error = await store.write("a", recordOf("a", "sent")).catch((e: unknown) => e);
    expect((error as CustodyError).why).toMatchObject({ held: "full" });
    expect((await store.read("a"))?.phase).toBe("unknown");
    expect(await store.segmented("a", 0, 2)).toEqual([outcome(1), outcome(2)]);
  });

  test("locks: one section at a time per identity, and one admission at a time", async () => {
    const store = sqliteStore(nodeSql());
    const order: string[] = [];
    const release1 = (await store.lock("a", T))!;
    const second = store.lock("a", T).then(async (release) => { order.push("second"); await release!(); });
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual([]);
    order.push("first");
    await release1();
    await second;
    expect(order).toEqual(["first", "second"]);
    const seen: number[] = [];
    await Promise.all([1, 2, 3].map((n) => store.exclusive(async () => { seen.push(n); await new Promise((r) => setTimeout(r, 5)); seen.push(-n); })));
    expect(seen).toEqual([1, -1, 2, -2, 3, -3]);
  });
});

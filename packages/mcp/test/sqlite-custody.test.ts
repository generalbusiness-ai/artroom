/**
 * The custody store over SQLite (src/sqlite-custody.ts), on Node's own SQLite: the store's contract and its budget, as the
 * hosted design's H6 states them at the store's level. The object-level cases (resets, interleaving, the budget across control
 * requests) run in the Workers runtime, in the hosted stories.
 */
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import type { Receipt } from "@generalbusiness/dap-contract";
import { canonicalize, utf8 } from "@generalbusiness/artroom-bytes";
import { COMPLETION_BYTES, SEGMENT_ROW_BYTES, chargedOf, sqliteStore, type Sql, type SqlValue, type SqliteCustodyBounds } from "../src/sqlite-custody.ts";
import { Custody, CustodyError, Lost, RECORD_BYTES, identityId, type CustodyRecord, type Outcome } from "../src/custody.ts";

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
    await store.write("a", recordOf("a", "sent"), { dispatch: true });
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
    const bounds: SqliteCustodyBounds = { budget: 2 * COMPLETION_BYTES + 4096, identityMost: 64 * 1024 * 1024, terminalMost: 1024, ageDays: 30 };
    const store = sqliteStore(sql, bounds);
    await store.write("a", recordOf("a", "sent"), { dispatch: true });
    // The need is counted on the record rows as stored: the record up to its bound with its rows' overhead, and one segment row.
    // The write before the send draws its own rows from the reservation it armed, so an identity in flight holds exactly its
    // complete cost between what it stores and what it reserves.
    expect(store.identity("a").stored).toBe(chargedOf(sized(recordOf("a", "sent"))));
    expect(store.identity("a").reserved).toBe(COMPLETION_BYTES - store.identity("a").stored);
    expect(store.used() + store.reserved()).toBe(COMPLETION_BYTES);
    await store.write("b", recordOf("b", "sent"), { dispatch: true });
    const held = 2 * COMPLETION_BYTES;
    expect(store.used() + store.reserved()).toBe(held);
    // A third identity cannot be armed: refused full before dispatch, nothing written, the two reservations intact.
    const error = await store.write("c", recordOf("c", "sent"), { dispatch: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CustodyError);
    expect((error as CustodyError).why).toMatchObject({ held: "full", reason: "budget" });
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
    await store.write("c", recordOf("c", "sent"), { dispatch: true });
    expect(store.identity("c").reserved).toBeGreaterThan(0);
  });

  test("an identity's own limit: repeated attempts are paid in advance, and refuse full past the bound", async () => {
    const sql = nodeSql();
    const store = sqliteStore(sql, { budget: 1024 * 1024 * 1024, identityMost: COMPLETION_BYTES + SEGMENT_ROW_BYTES + 256 * 1024, terminalMost: 1024, ageDays: 30 });
    await store.write("a", recordOf("a", "sent"), { dispatch: true });
    const outcome = (n: number): Outcome => ({ at: T, answer: { answer: "refused", reason: "z".repeat(SEGMENT_ROW_BYTES - 4096) } as never, attempt: n });
    await store.segment("a", 0, [outcome(1)]);
    await store.write("a", recordOf("a", "unknown"));
    await store.segment("a", 1, [outcome(2)]);
    // A further attempt would need more than the identity may hold: refused before dispatch, the record unchanged.
    const error = await store.write("a", recordOf("a", "sent"), { dispatch: true }).catch((e: unknown) => e);
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

test("an archived refusal resubmitted is live again, terminal again and archived again, with its history", async () => {
  const sql = nodeSql();
  const store = sqliteStore(sql, { budget: 64 * 1024 * 1024, identityMost: 64 * 1024 * 1024, terminalMost: 0, ageDays: 30 });
  const refused: Outcome = { at: T, answer: { answer: "refused", reason: "not-yet" } as never, attempt: 1 };
  await store.write("a", recordOf("a", "refused", 0, [refused]));
  expect([store.archived(), count(sql, "record", "a"), count(sql, "archive", "a")]).toEqual([1, 0, 1]);
  // The explicit resubmission: a new attempt, kept unresolved before anything is sent, takes the archived copy's place.
  const again = recordOf("a", "sent", 0, [refused]);
  again.attempt = 2;
  await store.write("a", again, { dispatch: true });
  expect([count(sql, "record", "a"), count(sql, "archive", "a")]).toEqual([1, 0]);
  expect((await store.read("a"))?.attempt).toBe(2);
  // Its terminal result archives it again, in place, with both outcomes.
  const done = recordOf("a", "accepted", 0, [refused, settled(2)]);
  done.attempt = 2;
  await store.write("a", done);
  expect([count(sql, "record", "a"), count(sql, "archive", "a"), store.archived()]).toEqual([0, 1, 1]);
  expect(await store.read("a")).toEqual(done);
  expect(store.identity("a").reserved).toBe(0);
});

test("at a saturated budget, results that the reservation covers are written, and only a dispatch needs new capacity", async () => {
  const sql = nodeSql();
  const first = recordOf("a", "sent");
  // Room for exactly one identity's completion need and nothing more.
  const store = sqliteStore(sql, { budget: COMPLETION_BYTES + 512, identityMost: 64 * 1024 * 1024, terminalMost: 1024, ageDays: 30 });
  await store.write("a", first, { dispatch: true });
  expect(store.used() + store.reserved()).toBe(COMPLETION_BYTES);
  // 65 lost outcomes: the 65th spills a segment row; each result write consumes the held capacity and reserves nothing.
  const outcomes: Outcome[] = [];
  for (let n = 1; n <= 65; n++) {
    outcomes.push({ at: T, lost: true, attempt: 1 });
    const record = recordOf("a", "unknown", 0, outcomes.slice(-64));
    record.count = outcomes.length;
    if (outcomes.length > 64) await store.segment("a", outcomes.length - 65, [outcomes[outcomes.length - 65]!]);
    await store.write("a", record);
  }
  expect((await store.read("a"))?.count).toBe(65);
  expect(await store.segmented("a", 0, 1)).toEqual([outcomes[0]]);
  // A second identity's dispatch is refused full before anything is written; a's receipt is still written from what it holds.
  const error = await store.write("b", recordOf("b", "sent"), { dispatch: true }).catch((e: unknown) => e);
  expect((error as CustodyError).why).toMatchObject({ held: "full" });
  const done = recordOf("a", "accepted", 0, [...outcomes.slice(-63), settled(1)]);
  done.count = 66;
  await store.write("a", done);
  expect((await store.read("a"))?.phase).toBe("accepted");
});

test("a step on a terminal act is a dispatch: it reserves before sending and refuses full at a full budget", async () => {
  const sql = nodeSql();
  const done = recordOf("a", "accepted", 0, [settled(1)]);
  const store = sqliteStore(sql, { budget: sized(done) + 4096, identityMost: 64 * 1024 * 1024, terminalMost: 1024, ageDays: 30 });
  await store.write("a", done);
  expect(store.reserved()).toBe(0);
  // The write before a step's dispatch, on the terminal act: armed, and refused full because the budget admits no completion.
  const stepped = { ...done, steps: { s: { intent: "sha256:i" as never, resource: ref, capability: "hold@1", step: "instance", phase: "sent" as const, answers: [] } } };
  const error = await store.write("a", stepped, { dispatch: true }).catch((e: unknown) => e);
  expect((error as CustodyError).why).toMatchObject({ held: "full" });
  expect((await store.read("a"))?.steps).toEqual({});
});

test("a step on a terminal act keeps its reservation through the dispatch: competing admission waits, loss keeps it, a restart reads it back", async () => {
  const sql = nodeSql();
  const done = recordOf("a", "accepted", 0, [settled(1)]);
  // Room for the accepted record and one step's completion need, and nothing for a second identity while the step is in flight.
  const bounds: SqliteCustodyBounds = { budget: sized(done) + COMPLETION_BYTES + 8192, identityMost: 64 * 1024 * 1024, terminalMost: 1024, ageDays: 30 };
  const store = sqliteStore(sql, bounds);
  const identity = done.identity;
  const id = identityId(identity);   // custody names the record by its identity
  await store.write(id, done);
  const custody = new Custody(store, () => T);
  // The step's delivery pauses after custody armed and wrote the step as sent.
  let resume!: (answer: "accepted" | "lost") => void;
  const paused = new Promise<"accepted" | "lost">((r) => { resume = r; });
  const stepping = custody.step(identity, ref, "hold@1", "instance", async () => {
    const how = await paused;
    if (how === "lost") throw new Lost();
    return { answer: "accepted", receipt: receipt() } as never;
  });
  await new Promise((r) => setTimeout(r, 20));
  expect(store.identity(id).reserved, "the step holds the act's completion capacity while it is in flight").toBeGreaterThan(0);
  // Another identity's dispatch cannot take that space.
  const other = await store.write("b", recordOf("b", "sent"), { dispatch: true }).catch((e: unknown) => e);
  expect((other as CustodyError).why).toMatchObject({ held: "full" });
  // The answer is lost: the step is unknown, the reservation stays, and a store opened again over the same storage reads it.
  resume("lost");
  const lost = await stepping;
  expect(lost.step.phase).toBe("unknown");
  expect(store.identity(id).reserved).toBeGreaterThan(0);
  const again = sqliteStore(sql, bounds);
  expect(Object.values((await again.read(id))!.steps).map((s) => s.phase)).toEqual(["unknown"]);
  expect(again.identity(id).reserved).toBe(store.identity(id).reserved);
  // Asked again, the same signed step is sent and answered; the answer's write consumes the reservation and releases the rest.
  const custody2 = new Custody(again, () => T);
  const answered = await custody2.step(identity, ref, "hold@1", "instance", async () => ({ answer: "accepted", receipt: receipt() }) as never);
  expect(answered.step.phase).toBe("answered");
  expect(again.identity(id).reserved).toBe(0);
  // Now the other identity is admitted.
  await again.write("b", recordOf("b", "sent"), { dispatch: true });
  expect(again.identity("b").reserved).toBeGreaterThan(0);
});

test("a new identity's completion need is admitted before anything is built or signed, and released when nothing came of it", async () => {
  const sql = nodeSql();
  const first = recordOf("a", "sent");
  const store = sqliteStore(sql, { budget: COMPLETION_BYTES + 4096, identityMost: 64 * 1024 * 1024, terminalMost: 1024, ageDays: 30 });
  await store.write(identityId(first.identity), first, { dispatch: true });
  const custody = new Custody(store, () => T);
  // A second identity: the budget admits no second completion need, so build is never called and nothing is signed or kept.
  let built = 0;
  const second = { ...first.identity, key: "b" };
  const error = await custody.send(second, "sha256:m" as never, async () => { built++; return { binding: first.binding, envelope: first.envelope }; }, async () => { throw new Error("never"); }, { notAfter: T }).catch((e: unknown) => e);
  expect((error as CustodyError).why).toMatchObject({ held: "full", reason: "budget" });
  expect(built, "nothing was built or signed").toBe(0);
  expect(await store.read(identityId(second))).toBeNull();
  expect(store.identity(identityId(second)).reserved, "nothing stays reserved for an identity with no record").toBe(0);
  // The first identity's envelope and reservation are untouched; once it completes, the second is admitted and built once.
  expect((await store.read(identityId(first.identity)))?.envelope).toEqual(first.envelope);
  await store.write(identityId(first.identity), recordOf("a", "accepted", 0, [settled(1)]));
  const sent = await custody.send(second, "sha256:m" as never, async () => { built++; return { binding: first.binding, envelope: first.envelope }; }, async () => ({ answer: "accepted", receipt: receipt() }) as never, { notAfter: T });
  expect([built, "answer" in sent ? sent.answer.answer : "lost"]).toEqual([1, "accepted"]);
});

test("the complete charged cost is reserved before anything is built: one byte short, refused with nothing built, kept or reserved; at the boundary, built once, dispatched and answered with no top-up", async () => {
  const first = recordOf("a", "sent");
  const a = identityId(first.identity);
  const second = { ...first.identity, key: "b" };
  const b = identityId(second);
  /** A store with `budget`, holding the first identity in flight. */
  const holding = async (budget: number) => { const store = sqliteStore(nodeSql(), { budget, identityMost: 64 * 1024 * 1024, terminalMost: 1024, ageDays: 30 }); await store.write(a, first, { dispatch: true }); return store; };
  // What an identity in flight holds, however small its record: its stored rows and its reservation sum to the complete cost,
  // which is the record at its bound with every row's overhead and one more segment row with its overhead.
  const probe = await holding(Number.MAX_SAFE_INTEGER);
  expect(probe.identity(a).stored + probe.identity(a).reserved).toBe(COMPLETION_BYTES);
  expect(probe.used() + probe.reserved()).toBe(COMPLETION_BYTES);
  // Exact boundary: one byte short of a second complete cost. Refused before build: nothing built or signed, no record, no reservation.
  const short = await holding(2 * COMPLETION_BYTES - 1);
  let built = 0;
  const refused = await new Custody(short, () => T).send(second, "sha256:m" as never, async () => { built++; return { binding: first.binding, envelope: first.envelope }; }, async () => { throw new Error("never"); }, { notAfter: T }).catch((e: unknown) => e);
  expect((refused as CustodyError).why).toMatchObject({ held: "full", reason: "budget" });
  expect([built, await short.read(b), short.identity(b)]).toEqual([0, null, { stored: 0, reserved: 0 }]);
  expect(short.used() + short.reserved(), "the first identity's holding is untouched").toBe(COMPLETION_BYTES);
  // At the boundary: admitted, built once, the preparation kept, the first dispatch armed from what was admitted, and the
  // result written, with no `full` at any step: at every point the identity's stored and reserved bytes sum to its complete cost.
  const enough = await holding(2 * COMPLETION_BYTES);
  const sums: number[] = [];
  const custody = new Custody(enough, () => T);
  const sent = await custody.send(second, "sha256:m" as never, async () => { built++; sums.push(enough.identity(b).stored + enough.identity(b).reserved); return { binding: first.binding, envelope: first.envelope }; }, async () => { sums.push(enough.identity(b).stored + enough.identity(b).reserved); return { answer: "accepted", receipt: receipt() } as never; }, { notAfter: T });
  expect([built, "answer" in sent ? sent.answer.answer : "lost"]).toEqual([1, "accepted"]);
  expect(sums, "admitted whole before build, and still whole at the dispatch").toEqual([COMPLETION_BYTES, COMPLETION_BYTES]);
  expect(enough.identity(b).reserved, "the result releases the rest").toBe(0);
  expect((await enough.read(b))?.phase).toBe("accepted");
  expect(enough.used() + enough.reserved()).toBe(COMPLETION_BYTES + enough.identity(b).stored);
});

/**
 * Request 5a7290b9: the Room publishes its log without holding it in
 * memory. Lane L's publisher reads the entries from the Room's SQLite in
 * batches (`logSource`), reuses the parent's full segments by ID, and reads
 * a retained file's body only when the parent does not already hold it.
 * Through the real publisher and log remote, over the fakes.
 */

import { describe, expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import { policy, rule } from "@generalbusiness/artroom-policy";
import type { Claim } from "@generalbusiness/artroom-contract";
import { READ_LIMITS, verifyLog } from "@generalbusiness/artroom-log";
import type { Room } from "../../src/index.ts";
import { call, makeRoom, type TestRoom } from "./support.ts";

/** Record the SQL that reads entry and retained bodies while `fn` runs. */
async function spy(r: TestRoom) {
  const reads: { from: number; limit: number }[] = [];
  const bodies: string[] = [];
  await runInDurableObject(r.stub, (room: Room) => {
    const sql = room.core.sql as { all: (q: string, ...b: unknown[]) => unknown[] };
    const all = sql.all.bind(sql);
    sql.all = (q, ...b) => {
      if (/^SELECT body FROM entries WHERE seq > \?/.test(q)) reads.push({ from: Number(b[0]) + 1, limit: Number(b[1]) });
      if (/^SELECT body FROM entries WHERE seq = \?/.test(q)) reads.push({ from: Number(b[0]), limit: 1 });
      if (/^SELECT body FROM retained WHERE digest = \?/.test(q)) bodies.push(String(b[0]));
      return all(q, ...b);
    };
  });
  return { reads, bodies };
}

describe("request 5a7290b9: publication reads the log in batches", () => {
  it("never more than READ_LIMITS.entries entries per read; after the first publication only the last segment is read; a retained file is read only when new", async () => {
    // Every note's refuse decision retains a replay context (R-LOG-7), so retained files grow with the log.
    const r = await makeRoom({ policy: policy(rule({ id: "never", on: "note", refuse: "false", reason: "never", fix: "none" })) });
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    for (let i = 0; i < 1010; i++) await r.admin.ok("note", { act: c.id }, { text: `note ${i}` });
    const seen = await spy(r);
    const p1 = await call<{ through: number; commit: string }>(r.stub.publishLog());
    expect(p1.through).toBeGreaterThan(1000);
    expect(seen.reads.length).toBeGreaterThan(0);
    expect(Math.max(...seen.reads.map((x) => x.limit))).toBeLessThanOrEqual(READ_LIMITS.entries);
    const firstBodies = new Set(seen.bodies);
    expect(firstBodies.size).toBeGreaterThan(1000);

    for (let i = 0; i < 5; i++) await r.admin.ok("note", { act: c.id }, { text: `later ${i}` });
    seen.reads.length = 0;
    seen.bodies.length = 0;
    const p2 = await call<{ through: number; commit: string }>(r.stub.publishLog());
    expect(p2.through).toBe(p1.through + 6); // the checkpoint event and five notes
    expect(Math.max(...seen.reads.map((x) => x.limit))).toBeLessThanOrEqual(READ_LIMITS.entries);
    // Segment 0 is full and published: none of its entries is read again.
    expect(Math.min(...seen.reads.map((x) => x.from))).toBeGreaterThanOrEqual(1000);
    // Only the new notes' replay contexts are read: to hash them, and to send them.
    expect(seen.bodies.length).toBeGreaterThan(0);
    expect(seen.bodies.filter((d) => firstBodies.has(d))).toEqual([]);
    expect(new Set(seen.bodies).size).toBe(5);

    expect(r.world.log.ref).toBe(p2.commit);
    expect(await verifyLog(r.world.artifacts.canonicalRepo())).toMatchObject({ ok: true, failures: [], verifiedThrough: p2.through });
  }, 120_000);
});

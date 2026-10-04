/**
 * The spike-only pin delay (request 8bd623cc; hugh's approval, assert
 * 66a41558). PIN_DELAY_MS unset: the propose's own commit writes the pin, as
 * before. Set: the pin is left to the alarm, which wakes for it when due,
 * after a restart too, and cleans up its due time. A proposal read still
 * finds its pinned ref (R-PROP-1).
 */

import { afterEach, describe, expect, it } from "vitest";
import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { Claim, Proposal } from "@generalbusiness/artroom-contract";
import { setPinDelay, type Room } from "../../src/index.ts";
import { advance, Client, clock, makeRoom, pushChange, tick, until, type TestRoom } from "./support.ts";

// Shorter than the publication's minute, so the pin's due time is the room's next alarm: the wake is exactly bounded.
const DELAY = 30_000;
const inDO = <T>(r: TestRoom, fn: (room: Room, state: DurableObjectState) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const dueRows = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT k, v FROM meta WHERE k LIKE 'pin_due:%'"));
const pinDone = (r: TestRoom, ref: string) => inDO(r, (room) => room.core.sql.all("SELECT done FROM pins WHERE ref = ?", ref)[0]?.["done"]);

/** A fresh stub after the room's object is aborted, as after an eviction or a restart. */
async function restarted(before: TestRoom): Promise<TestRoom> {
  await inDO(before, (_room, state) => state.abort("restart")).catch(() => undefined);
  const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
  return { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
}

async function proposed(r: TestRoom): Promise<{ p: Proposal; head: string }> {
  const c = await r.admin.ok<Claim>("claim", null, { goal: "work", scope: ["src/**"] });
  const head = pushChange(r, c.lane, { "src/app.ts": "export const app = 2;\n" });
  const p = await r.admin.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "bump" });
  return { p, head };
}

afterEach(() => setPinDelay(null));

describe("PIN_DELAY_MS (spike measurement only)", () => {
  it("unset: the propose's own commit writes the pin, with no tick, and records no due time", async () => {
    const r = await makeRoom();
    expect(await inDO(r, (room) => room.core.pinDelayMs)).toBe(0);
    const { p, head } = await proposed(r);
    // No tick: the commit's own step (core.run("pins")) writes it.
    await until(async () => r.world.artifacts.refs.get(p.pinnedRef) === head);
    await inDO(r, (room) => room.core.idle());
    expect(await pinDone(r, p.pinnedRef)).toBe(1);
    expect(await dueRows(r)).toEqual([]);
    expect(await inDO(r, (room) => room.core.nextPinDue())).toBeNull();
    expect(await inDO(r, (room) => [...room.core.loopPendingKinds()])).not.toContain("pins");
  });

  it("set: the commit leaves the pin; the alarm wakes for it when due, not before, and cleans up its due time", async () => {
    setPinDelay(DELAY);
    const r = await makeRoom();
    const { p, head } = await proposed(r);
    const due = clock.now + DELAY;
    await inDO(r, (room) => room.core.idle());
    expect(r.world.artifacts.refs.get(p.pinnedRef)).toBeUndefined();
    expect(await dueRows(r)).toEqual([{ k: `pin_due:${p.pinnedRef}`, v: String(due) }]);
    // Ticks before it is due leave it pending; the wake is bounded by the due time.
    await tick(r, 2);
    expect(await pinDone(r, p.pinnedRef)).toBe(0);
    expect(await inDO(r, (room) => room.core.nextPinDue())).toBe(due);
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBe(due);
    advance(DELAY - 1);
    await tick(r);
    expect(await pinDone(r, p.pinnedRef)).toBe(0);
    // Due: the alarm's step writes it and deletes the due time.
    advance(1);
    await tick(r);
    expect(r.world.artifacts.refs.get(p.pinnedRef)).toBe(head);
    expect(await pinDone(r, p.pinnedRef)).toBe(1);
    expect(await dueRows(r)).toEqual([]);
    expect(await inDO(r, (room) => room.core.nextPinDue())).toBeNull();
  });

  it("set: a pin not yet due is not loop work (no backoff written), and when due it obeys the pins loop's backoff (request 3da1d82b)", async () => {
    setPinDelay(DELAY);
    const r = await makeRoom();
    const { p, head } = await proposed(r);
    const due = clock.now + DELAY;
    await inDO(r, (room) => room.core.idle());
    await tick(r, 3);
    expect(await inDO(r, (room) => [...room.core.loopPendingKinds()])).not.toContain("pins");
    expect(await inDO(r, (room) => room.core.loopBackoff().pins)).toBeUndefined();
    // A pins backoff that ends after the due time holds the pin back, and moves the wake with it.
    await inDO(r, (room) => room.core.sql.all("INSERT INTO meta (k, v) VALUES ('loop_backoff', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", JSON.stringify({ pins: { attempts: 1, next: due + 10_000 } })));
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBe(due + 10_000);
    clock.now = due;
    await tick(r);
    expect(await pinDone(r, p.pinnedRef)).toBe(0);
    clock.now = due + 10_000;
    await tick(r);
    expect(r.world.artifacts.refs.get(p.pinnedRef)).toBe(head);
    expect(await inDO(r, (room) => room.core.loopBackoff().pins)).toBeUndefined();
    expect(await dueRows(r)).toEqual([]);
  });

  it("set: while the canonical repository is gone, a delayed pin is neither woken for nor written (the pins loop's fence)", async () => {
    setPinDelay(DELAY);
    const r = await makeRoom();
    const { p, head } = await proposed(r);
    const due = clock.now + DELAY;
    await inDO(r, (room) => room.core.idle());
    await tick(r, 2);
    await inDO(r, (room) => room.core.sql.all("INSERT INTO meta (k, v) VALUES ('canonical_gone', ?)", JSON.stringify({ since: new Date(clock.now).toISOString(), head: room.core.headSeq() })));
    expect(await inDO(r, (room) => room.core.nextAlarm())).not.toBe(due);
    clock.now = due;
    await tick(r);
    expect(await pinDone(r, p.pinnedRef)).toBe(0);
    expect(await inDO(r, (room) => [...room.core.loopPendingKinds()].filter((k) => room.core.loopAllowed(k)))).not.toContain("pins");
    // The repository back: the pin is written.
    await inDO(r, (room) => room.core.sql.all("DELETE FROM meta WHERE k = 'canonical_gone'"));
    await tick(r);
    expect(r.world.artifacts.refs.get(p.pinnedRef)).toBe(head);
  });

  it("set: the room's next alarm is the earliest of six due times (the delayed pin, the mint ledger, the error upgrade, the job-token pass, the check jobs, the fork token ledger); a backoff holds only its own kind; while the repository is gone the pin, the mint ledger and the job-token pass wait, and the others do not", async () => {
    setPinDelay(DELAY);
    const r = await makeRoom();
    await proposed(r);
    const due = clock.now + DELAY;
    await inDO(r, (room) => room.core.idle());
    await tick(r, 2);
    // Each ledger's due time is set directly on this object's ledgers: only nextAlarm's composition is under test here.
    const next = (mints: number | null, fork: number | null) =>
      inDO(r, (room) => {
        (room.core.mints as unknown as { nextDue: () => number | null }).nextDue = () => mints;
        (room.core.workspaces.forkTokens as unknown as { nextDue: () => number | null }).nextDue = () => fork;
        return room.core.nextAlarm();
      });
    const sql = (q: string, ...b: (string | number)[]) => inDO(r, (room) => room.core.sql.all(q, ...b));
    const meta = (k: string, v: string | null) => (v === null ? sql("DELETE FROM meta WHERE k = ?", k) : sql("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", k, v));
    const job = (at: number | null) =>
      at === null
        ? sql("DELETE FROM check_jobs WHERE id = 'job_probe'")
        : sql("INSERT INTO check_jobs (id, owner, lane, generation, obligation, checker, config, integration, base, state, next_ms) VALUES ('job_probe', 'op_probe', 'act_probe', 1, 'obl_probe', 'tests', 'sha256:probe', ?, ?, 'owed', ?) ON CONFLICT (id) DO UPDATE SET next_ms = excluded.next_ms", "a".repeat(40), "a".repeat(40), at);
    const token = (at: number | null) =>
      at === null ? sql("DELETE FROM job_tokens WHERE token_id = 'tok_probe'") : sql("INSERT INTO job_tokens (token_id, expires_at, next_ms) VALUES ('tok_probe', NULL, ?) ON CONFLICT (token_id) DO UPDATE SET next_ms = excluded.next_ms", at);
    // Alone, the delayed pin; the fork token ledger later than it does not move it.
    expect(await next(null, null)).toBe(due);
    expect(await next(null, due + 5_000)).toBe(due);
    // The fork token ledger earliest: it wins.
    expect(await next(due - 4_000, due - 9_000)).toBe(due - 9_000);
    // Each other candidate earlier than it wins in turn.
    expect(await next(due - 10_000, due - 9_000)).toBe(due - 10_000);
    await job(due - 12_000);
    expect(await next(null, due - 9_000)).toBe(due - 12_000);
    await job(null);
    await token(due - 11_000);
    expect(await next(null, due - 9_000)).toBe(due - 11_000);
    await token(null);
    await meta("error_scrub", "0");
    expect(await next(null, due - 9_000)).toBe(clock.now);
    await meta("error_scrub", null);
    // Its own backoff holds it, and only it: the pin wins.
    await meta("loop_backoff", JSON.stringify({ forkTokens: { attempts: 1, next: due + 30_000 } }));
    expect(await next(null, due - 9_000)).toBe(due);
    // The pins' backoff holds the pin and nothing else: a later mint ledger time wins.
    await meta("loop_backoff", JSON.stringify({ pins: { attempts: 1, next: due + 30_000 } }));
    expect(await next(due + 5_000, null)).toBe(due + 5_000);
    // The mint ledger's backoff holds the ledger and nothing else: the pin wins.
    await meta("loop_backoff", JSON.stringify({ mints: { attempts: 1, next: due + 30_000 } }));
    expect(await next(due - 5_000, null)).toBe(due);
    // The job-token pass's backoff holds only it: the pin wins.
    await meta("loop_backoff", JSON.stringify({ jobTokens: { attempts: 1, next: due + 30_000 } }));
    await token(due - 6_000);
    expect(await next(null, null)).toBe(due);
    await token(null);
    // Other kinds' backoffs (the pins, the mint ledger, the job-token pass) do not hold the fork token ledger.
    await meta("loop_backoff", JSON.stringify({ pins: { attempts: 1, next: due + 30_000 }, mints: { attempts: 1, next: due + 30_000 }, jobTokens: { attempts: 1, next: due + 30_000 } }));
    await token(due - 11_000);
    expect(await next(due - 10_000, due - 9_000)).toBe(due - 9_000);
    await token(null);
    await meta("loop_backoff", null);
    // The repository gone fences the pin, the mint ledger and the job-token pass, not the fork token ledger: forks are
    // not the canonical repository.
    await meta("canonical_gone", JSON.stringify({ since: new Date(clock.now).toISOString(), head: 0 }));
    await token(due - 11_000);
    expect(await next(due - 10_000, due - 9_000)).toBe(due - 9_000);
    await token(null);
    // The check jobs are not fenced either: an earlier job wins.
    await job(due - 12_000);
    expect(await next(due - 10_000, due - 9_000)).toBe(due - 12_000);
    await job(null);
    // Nor is the error upgrade, which still drains (request d29c09fa): due at once.
    await meta("error_scrub", "0");
    expect(await next(due - 10_000, due - 9_000)).toBe(clock.now);
    await meta("error_scrub", null);
    // With nothing else due, the fenced pin, mint ledger and job-token pass do not wake the room at their times.
    await token(due - 11_000);
    expect([due, due - 10_000, due - 11_000]).not.toContain(await next(due - 10_000, null));
    await token(null);
    // While it is gone, the fork token ledger's own backoff still holds it: a check job later than that backoff loses.
    await meta("loop_backoff", JSON.stringify({ forkTokens: { attempts: 1, next: due + 30_000 } }));
    await job(due + 40_000);
    expect(await next(due - 10_000, due - 9_000)).toBe(due + 30_000);
    await job(null);
  });

  it("set, before founding: the room's start dates no pins and the unfounded schedule (founding debt and error upgrade) is unchanged", async () => {
    setPinDelay(DELAY);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(`room_unfounded_pin_${clock.now}`)) as unknown as DurableObjectStub<Room>;
    const seen = await runInDurableObject(stub, (room: Room) => {
      const before = { founded: room.core.founded, pinDue: room.core.nextPinDue(), rows: room.core.sql.all("SELECT k FROM meta WHERE k LIKE 'pin_due:%'").length, due: room.core.unfoundedDue() };
      room.core.sql.all("INSERT INTO meta (k, v) VALUES ('error_scrub', '0')");
      return { ...before, scrub: room.core.unfoundedDue(), now: clock.now };
    });
    expect(seen).toMatchObject({ founded: false, pinDue: null, rows: 0, due: null, scrub: seen.now });
  });

  it("set: a read of the proposal still finds its pinned ref (R-PROP-1)", async () => {
    setPinDelay(DELAY);
    const r = await makeRoom();
    const { p, head } = await proposed(r);
    await r.admin.read({ q: "proposal", ref: { lane: p.lane, generation: 1 } });
    expect(r.world.artifacts.refs.get(p.pinnedRef)).toBe(head);
    expect(await pinDone(r, p.pinnedRef)).toBe(1);
    expect(await dueRows(r)).toEqual([]);
  });

  it("set: the delayed pin survives a restart; the fresh object's stored alarm completes it when due", async () => {
    setPinDelay(DELAY);
    const before = await makeRoom();
    const { p, head } = await proposed(before);
    const due = clock.now + DELAY;
    await inDO(before, (room) => room.core.idle());
    const r = await restarted(before);
    expect(await pinDone(r, p.pinnedRef)).toBe(0);
    expect(await dueRows(r)).toEqual([{ k: `pin_due:${p.pinnedRef}`, v: String(due) }]);
    expect(await inDO(r, (_room, state) => state.storage.getAlarm()), "the fresh object stored an alarm").not.toBeNull();
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBe(due);
    clock.now = due;
    expect(await runDurableObjectAlarm(r.stub as unknown as DurableObjectStub<Room>)).toBe(true);
    await inDO(r, (room) => room.core.idle());
    expect(r.world.artifacts.refs.get(p.pinnedRef)).toBe(head);
    expect(await pinDone(r, p.pinnedRef)).toBe(1);
    expect(await dueRows(r)).toEqual([]);
  });

  it("unset after a delayed pin: the fresh object writes it at once and cleans up the due time it left", async () => {
    setPinDelay(DELAY);
    const before = await makeRoom();
    const { p, head } = await proposed(before);
    await inDO(before, (room) => room.core.idle());
    // The switch is unset (the redeploy after the measurement window); the room restarts under the new value.
    setPinDelay(null);
    const r = await restarted(before);
    expect(await inDO(r, (room) => room.core.pinDelayMs)).toBe(0);
    // Off: the ordinary path, which reads no due time; the pin is pending loop work at once.
    expect(await inDO(r, (room) => room.core.nextPinDue())).toBeNull();
    expect(await inDO(r, (room) => [...room.core.loopPendingKinds()])).toContain("pins");
    // Pending now: the ordinary 5-second loop.
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBe(clock.now + 5_000);
    await tick(r);
    expect(r.world.artifacts.refs.get(p.pinnedRef)).toBe(head);
    expect(await dueRows(r)).toEqual([]);
  });

  // The checker's control ran 150,000 pending pins, to show that scheduling neither reads every pin into memory
  // nor overflows the stack. These two cases pin the cause: one bounded query, whatever the backlog.
  describe("bounded reads for a pending backlog (the checker's control on 48b1fee9)", () => {
    const backlog = (room: Room, n: number, dated: boolean) => {
      room.core.sql.all(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < ${n}) INSERT INTO pins (ref, head, done) SELECT 'refs/artroom/heads/lane_probe/' || x, '${"a".repeat(40)}', 0 FROM n`);
      if (dated) room.core.sql.all(`INSERT INTO meta (k, v) SELECT 'pin_due:' || ref, ? FROM pins WHERE done = 0`, String(clock.now + DELAY));
    };
    /** Rows read by the pin and pin-due queries of one call, with the queries made. */
    const pinReads = (room: Room, state: DurableObjectState, fn: () => unknown) => {
      const original = room.core.sql.all;
      let rows = 0;
      const queries: string[] = [];
      (room.core.sql as { all: unknown }).all = (q: string, ...b: SqlStorageValue[]) => {
        const c = state.storage.sql.exec(q, ...b);
        const out = c.toArray();
        if (/FROM pins|pin_due/.test(q)) {
          rows += c.rowsRead;
          queries.push(q);
        }
        return out;
      };
      try {
        fn();
      } finally {
        (room.core.sql as { all: unknown }).all = original;
      }
      return { rows, queries };
    };

    it("unset: nextAlarm makes one bounded existence check for pins, which stops at the first pending pin", async () => {
      const r = await makeRoom();
      const seen = await inDO(r, async (room, state) => {
        await room.core.idle();
        room.core.run = () => {};
        backlog(room, 1_000, false);
        return pinReads(room, state, () => room.core.nextAlarm());
      });
      expect(seen.queries).toEqual(["SELECT 1 AS x FROM pins WHERE done = 0 LIMIT 1"]);
      expect(seen.rows).toBe(1);
    });

    it("set: nextAlarm reads one due-time row per pending pin, by one aggregate, and no pins scan", async () => {
      setPinDelay(DELAY);
      const r = await makeRoom();
      const seen = await inDO(r, async (room, state) => {
        await room.core.idle();
        room.core.run = () => {};
        backlog(room, 1_000, true);
        return { reads: pinReads(room, state, () => room.core.nextAlarm()), next: room.core.nextAlarm() };
      });
      expect(seen.reads.queries).toEqual(["SELECT MIN(CAST(v AS INTEGER)) AS t FROM meta WHERE k >= 'pin_due:' AND k < 'pin_due;'"]);
      // One row per pending pin's due time, plus the index's end-of-range row.
      expect(seen.reads.rows).toBeLessThanOrEqual(1_001);
      expect(seen.next).toBeLessThanOrEqual(clock.now + DELAY);
    });

    it("unset: a restart with pending pins writes no due times (the default-off start writes nothing)", async () => {
      const before = await makeRoom();
      await inDO(before, async (room) => {
        await room.core.idle();
        backlog(room, 3, false);
      });
      const r = await restarted(before);
      expect(await dueRows(r)).toEqual([]);
      expect(await inDO(r, (room) => [...room.core.loopPendingKinds()])).toContain("pins");
    });

    it("set: a pending pin with no due time (admitted before the switch) is given one at start, due now", async () => {
      const before = await makeRoom();
      await inDO(before, async (room) => {
        await room.core.idle();
        backlog(room, 3, false);
      });
      setPinDelay(DELAY);
      const r = await restarted(before);
      expect((await dueRows(r)).length).toBe(3);
      expect(await inDO(r, (room) => room.core.nextPinDue())).toBe(clock.now);
      expect(await inDO(r, (room) => [...room.core.loopPendingKinds()])).toContain("pins");
    });
  });
});

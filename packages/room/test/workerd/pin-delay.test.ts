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

  it("set, with the mint ledger (main 574568b2): the earliest of the delayed pin and the ledger's due time wins, and each keeps its own fence and backoff", async () => {
    setPinDelay(DELAY);
    const r = await makeRoom();
    await proposed(r);
    const due = clock.now + DELAY;
    await inDO(r, (room) => room.core.idle());
    await tick(r, 2);
    // The ledger's due time is set directly on this object's ledger: only nextAlarm's composition is under test here.
    const withMints = (at: number | null) => inDO(r, (room) => {
      (room.core.mints as unknown as { nextDue: () => number | null }).nextDue = () => at;
      return room.core.nextAlarm();
    });
    const setBackoff = (v: Record<string, unknown>) => inDO(r, (room) => room.core.sql.all("INSERT INTO meta (k, v) VALUES ('loop_backoff', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", JSON.stringify(v)));
    expect(await withMints(due - 5_000)).toBe(due - 5_000);
    expect(await withMints(due + 5_000)).toBe(due);
    expect(await withMints(null)).toBe(due);
    // Each kind's backoff moves only its own due time.
    await setBackoff({ mints: { attempts: 1, next: due + 20_000 } });
    expect(await withMints(due - 5_000)).toBe(due);
    await setBackoff({ pins: { attempts: 1, next: due + 20_000 } });
    expect(await withMints(due + 5_000)).toBe(due + 5_000);
    await inDO(r, (room) => room.core.sql.all("DELETE FROM meta WHERE k = 'loop_backoff'"));
    // The repository gone fences both: neither due time wakes the room.
    await inDO(r, (room) => room.core.sql.all("INSERT INTO meta (k, v) VALUES ('canonical_gone', ?)", JSON.stringify({ since: new Date(clock.now).toISOString(), head: room.core.headSeq() })));
    const fenced = await withMints(due - 5_000);
    expect(fenced).not.toBe(due - 5_000);
    expect(fenced).not.toBe(due);
  });

  it("set, composed with the mint ledger and the error upgrade (main df22d771): the earliest wins; the repository-gone fence holds the pin and the ledger but not the upgrade", async () => {
    setPinDelay(DELAY);
    const r = await makeRoom();
    await proposed(r);
    const due = clock.now + DELAY;
    await inDO(r, (room) => room.core.idle());
    await tick(r, 2);
    const next = (mints: number | null) => inDO(r, (room) => {
      (room.core.mints as unknown as { nextDue: () => number | null }).nextDue = () => mints;
      return room.core.nextAlarm();
    });
    const meta = (k: string, v: string | null) => inDO(r, (room) => (v === null ? room.core.sql.all("DELETE FROM meta WHERE k = ?", k) : room.core.sql.all("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", k, v)));
    // Pin and ledger alone: the earliest of the two.
    expect(await next(due + 5_000)).toBe(due);
    // The error upgrade still running: due at once, ahead of both.
    await meta("error_scrub", "0");
    expect(await next(due - 5_000)).toBe(clock.now);
    // The repository gone: the pin and the ledger are fenced, the upgrade still drains (request d29c09fa).
    await meta("canonical_gone", JSON.stringify({ since: new Date(clock.now).toISOString(), head: 0 }));
    expect(await next(due - 5_000)).toBe(clock.now);
    await meta("error_scrub", null);
    const fenced = await next(due - 5_000);
    expect(fenced).not.toBe(due - 5_000);
    expect(fenced).not.toBe(due);
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
        backlog(room, 5_000, false);
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
        backlog(room, 5_000, true);
        return { reads: pinReads(room, state, () => room.core.nextAlarm()), next: room.core.nextAlarm() };
      });
      expect(seen.reads.queries).toEqual(["SELECT MIN(CAST(v AS INTEGER)) AS t FROM meta WHERE k >= 'pin_due:' AND k < 'pin_due;'"]);
      // One row per pending pin's due time, plus the index's end-of-range row.
      expect(seen.reads.rows).toBeLessThanOrEqual(5_001);
      expect(seen.next).toBeLessThanOrEqual(clock.now + DELAY);
    });

    it("150,000 pending pins: scheduling neither throws nor spreads them, switch unset or set", async () => {
      for (const delay of [null, DELAY]) {
        setPinDelay(delay);
        const r = await makeRoom();
        const out = await inDO(r, async (room) => {
          await room.core.idle();
          room.core.run = () => {};
          backlog(room, 150_000, delay !== null);
          return { pending: [...room.core.loopPendingKinds()], next: room.core.nextAlarm() };
        });
        if (delay === null) expect(out.pending).toContain("pins");
        else expect(out.pending).not.toContain("pins");
        expect(out.next).not.toBeNull();
      }
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

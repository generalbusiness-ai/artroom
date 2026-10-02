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
    expect(await inDO(r, (room) => room.core.nextPinDue())).toBe(clock.now);
    // Pending now: the ordinary 5-second loop.
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBe(clock.now + 5_000);
    await tick(r);
    expect(r.world.artifacts.refs.get(p.pinnedRef)).toBe(head);
    expect(await dueRows(r)).toEqual([]);
  });
});

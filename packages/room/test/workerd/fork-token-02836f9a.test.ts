/**
 * Mint lane F (request 02836f9a): the lane fork's read token for pinning,
 * minted and revoked through the fork's own ledger, which the workspaces own
 * (`Workspaces.forkTokens`), not the canonical mint ledger. Protocol section
 * 32 (R-MINT-2 to R-MINT-7) applied by analogy; plans/README.md, "Mint lane
 * F", maps each test to its rules and mutations.
 *
 * Real Room objects, Durable Object SQLite and stored alarms. Alarms run
 * only through `runDurableObjectAlarm`. The room clock runs a week ahead of
 * real time, with no test alarm delay, so a stored alarm is the Room's own
 * time and never fires by itself. Test hooks are set on one Room object, or
 * on the fake Artifacts repositories of one test's world; no process global
 * is swapped beyond the suite's existing clock and alarm delay, which each
 * test restores.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { Claim, LaneId, Sha } from "@generalbusiness/artroom-contract";
import { forkName } from "@generalbusiness/artroom-git";
import { setAlarmDelay, type Room } from "../../src/index.ts";
import { FakeArtifactsError, artifactsErrors, type FakeRepo } from "../../src/memory/artifacts.ts";
import { Client, clock, day, makeRoom, pushChange, until, type TestRoom } from "./support.ts";

type State = DurableObjectState;
const inDO = <T>(r: TestRoom, fn: (room: Room, state: State) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const alarm = (r: TestRoom) => runDurableObjectAlarm(r.stub as unknown as DurableObjectStub<Room>);
const stored = (r: TestRoom) => inDO(r, (_room, state) => state.storage.getAlarm());
const forkRecords = (r: TestRoom) => inDO(r, (room) => room.core.workspaces.forkTokens.duties({ limit: 1000 }));
const settle = (r: TestRoom) =>
  inDO(r, async (room) => {
    await room.core.idle();
    await room.core.workspaces.forkTokens.idle();
  });

async function ahead<T>(fn: () => Promise<T>): Promise<T> {
  clock.now = Math.max(clock.now, Date.now() + 7 * day); // never backwards
  setAlarmDelay(null);
  try {
    return await fn();
  } finally {
    setAlarmDelay(3600_000);
  }
}

/** A fresh stub after the room's object is aborted, as after an eviction or a crash. */
async function restarted(before: TestRoom): Promise<TestRoom> {
  await inDO(before, (_room, state) => state.abort("restart")).catch(() => undefined);
  const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
  return { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
}

/** On this object, the jobs and landing steps run only when the test runs them. */
const quiet = (r: TestRoom) =>
  inDO(r, async (room) => {
    await room.core.idle();
    const run = room.core.run.bind(room.core);
    room.core.run = (s) => {
      if (s !== "jobs" && s !== "landing") run(s);
    };
  });

/** A room with a lane whose fork holds a new head, ready to pin. */
async function laneRoom(scope = "docs/b/**") {
  const r = await makeRoom();
  await quiet(r);
  const { lane } = await r.admin.ok<Claim>("claim", null, { goal: "a lane", scope: [scope] });
  const head = pushChange(r, lane as LaneId, { [scope.replace("**", "two.md")]: "two" });
  const a = r.world.artifacts;
  const fork = a.repo(forkName(a.canonical, lane as LaneId)) as FakeRepo;
  return { r, a, lane: lane as LaneId, head, fork };
}

const pin = (r: TestRoom, lane: LaneId, head: Sha) => inDO(r, (room) => room.core.ports.artifacts.pinObjects(lane, head));

/** Record every revocation the fork is asked for, from now on. */
function revocations(fork: FakeRepo) {
  const real = fork.revokeToken.bind(fork);
  const asked: string[] = [];
  fork.revokeToken = async (id) => {
    asked.push(id);
    return real(id);
  };
  return asked;
}

/** Lose the answer of the fork's next read token create: Artifacts applies it, and the answer never reaches the Room. */
function loseForkAnswer(fork: FakeRepo): void {
  const real = fork.createToken.bind(fork);
  fork.createToken = async (scope, ttl) => {
    const t = await real(scope, ttl);
    if (scope === "read") {
      fork.createToken = real;
      throw artifactsErrors.transport();
    }
    return t;
  };
}

/** The fork's read tokens, as Artifacts sees them. */
const readTokens = (fork: FakeRepo) => [...fork.tokens.values()].filter((t) => t.scope === "read");

describe("mint lane F: the fork read token through the fork's own ledger, in the Room", () => {
  it("R1 lost answer: the fork's create applies and its answer is lost; pinning fails, one unknown record on the fork's ledger (none on the canonical one), kept across a restart and two alarms past the lifetime, watched, and the applied token is never revoked", () =>
    ahead(async () => {
      const { r: before, a, lane, head, fork } = await laneRoom();
      const asked = revocations(fork);
      loseForkAnswer(fork);
      await expect(pin(before, lane, head)).rejects.toThrow();
      await settle(before);
      const lost = readTokens(fork);
      expect(lost).toHaveLength(1);
      const d = await forkRecords(before);
      expect(d.records.map((x) => [x.fork, x.purpose, x.state, x.tokenId, x.ttlSeconds])).toEqual([[fork.name, `pin-objects:${head}`, "unknown", null, 600]]);
      expect(d.unknown).toBe(1);
      expect((await inDO(before, (room) => room.core.mints.duties({ limit: 1000 }))).records.filter((x) => x.purpose.startsWith("pin-objects:"))).toEqual([]);
      // Restart: the fresh object schedules the overdue observation 1 s ahead, with no request.
      const r = await restarted(before);
      const fresh = await inDO(r, async (room, state) => ({ due: room.core.workspaces.forkTokens.nextDue(), alarm: await state.storage.getAlarm(), now: clock.now }));
      expect(fresh.due).toBe(fresh.now + 1_000);
      expect(fresh.alarm!).toBeLessThanOrEqual(fresh.due!);
      const lists = a.remoteCalls.get("listTokens") ?? 0;
      for (let i = 0; i < 2; i++) {
        clock.now = Math.max(clock.now + 601_000, (await stored(r)) ?? 0);
        expect(await alarm(r)).toBe(true);
        await settle(r);
        const w = await inDO(r, (room) => room.core.workspaces.forkTokens.watch(fork.name));
        expect(w).toMatchObject({ unknown: 1, unaccounted: 0 }); // the lost token has expired by now: watched, never settled
        expect(w!.nextAt).toBe(w!.at! + 60_000 * 2 ** i);
      }
      expect((a.remoteCalls.get("listTokens") ?? 0) - lists).toBeGreaterThanOrEqual(2);
      expect((await forkRecords(r)).records.map((x) => x.state)).toEqual(["unknown"]);
      expect(asked).not.toContain(lost[0]!.id);
      expect(lost[0]!.revoked).toBe(false);
    }));

  it("R2 failed revoke: the fork token's revocation after the pin fails; the record is owed by its ID with safe metadata, and a later alarm revokes it by that ID; its lifetime is 600 s", () =>
    ahead(async () => {
      const { r, lane, head, fork } = await laneRoom();
      const real = fork.revokeToken.bind(fork);
      const asked: string[] = [];
      let failedId: string | null = null;
      fork.revokeToken = async (id) => {
        asked.push(id);
        if (failedId === null) {
          failedId = id;
          throw new FakeArtifactsError("INTERNAL_ERROR", 10400);
        }
        return real(id);
      };
      await pin(r, lane, head);
      await settle(r);
      expect(failedId).not.toBeNull();
      const t = fork.tokens.get(failedId!)!;
      expect(t.scope).toBe("read");
      expect(t.expiresAt - t.createdAt).toBe(600_000);
      expect(t.revoked).toBe(false);
      expect((await forkRecords(r)).records).toEqual([
        expect.objectContaining({ fork: fork.name, state: "owed", tokenId: failedId, lastError: "revocation failed: an error of another kind INTERNAL_ERROR (10400)" }),
      ]);
      for (let i = 0; i < 6 && !t.revoked; i++) {
        clock.now = Math.max(clock.now + 1_000, (await stored(r)) ?? 0);
        expect(await alarm(r)).toBe(true);
        await settle(r);
      }
      expect(t.revoked).toBe(true);
      expect(asked.filter((x) => x === failedId)).toHaveLength(2);
      expect((await forkRecords(r)).records).toEqual([]);
    }));

  it("R3 restart while the fork token is held: storage has an alarm no later than the fork ledger's takeover time; after the object is aborted, the fresh object schedules the debt 1 s ahead with no request, and its alarm revokes the token by its ID", () =>
    ahead(async () => {
      const { r: before, a, lane, head, fork } = await laneRoom();
      // Hold the canonical half's create: the fork token is answered and held by then.
      await inDO(before, async (room, state) => {
        await state.storage.deleteAlarm();
        a.holdToken = (repo, scope) => repo === a.canonical && scope === "write";
        room.core.defer(room.core.ports.artifacts.pinObjects(lane, head).catch(() => undefined));
      });
      await until(async () => (await forkRecords(before)).records.some((x) => x.state === "held"));
      const held = (await forkRecords(before)).records[0]!;
      const seen = await inDO(before, async (_room, state) => ({ alarm: await state.storage.getAlarm() }));
      const takeover = (await forkRecords(before)).takeoverAt!;
      expect(seen.alarm).not.toBeNull();
      expect(seen.alarm!).toBeLessThanOrEqual(takeover);
      await inDO(before, (_room, state) => state.storage.deleteAlarm());
      const r = await restarted(before);
      a.holdToken = null;
      const fresh = await inDO(r, async (room, state) => ({ due: room.core.workspaces.forkTokens.nextDue(), alarm: await state.storage.getAlarm(), now: clock.now }));
      expect((await forkRecords(r)).records.map((x) => [x.state, x.tokenId])).toEqual([["owed", held.tokenId]]);
      expect(fresh.due).toBe(fresh.now + 1_000);
      expect(fresh.alarm!).toBeLessThanOrEqual(fresh.due!);
      const asked = revocations(fork);
      clock.now = fresh.due!;
      expect(await alarm(r)).toBe(true);
      await settle(r);
      expect(asked).toEqual([held.tokenId]);
      expect(fork.tokens.get(held.tokenId!)!.revoked).toBe(true);
      expect((await forkRecords(r)).records).toEqual([]);
    }));

  it("R4 late apply across a crash: the fork's create is held, the object is aborted, and the create applies late with no answer; through alarms alone the fresh object keeps the record unknown, observes the fork, and never revokes the late token", () =>
    ahead(async () => {
      const { r: before, a, lane, head, fork } = await laneRoom();
      await inDO(before, (room) => {
        a.holdToken = (repo) => repo === fork.name;
        room.core.defer(room.core.ports.artifacts.pinObjects(lane, head).catch(() => undefined));
      });
      await until(async () => (await forkRecords(before)).records.some((x) => x.state === "sent"));
      const r = await restarted(before);
      a.holdToken = null;
      const late = fork.mint("read", 600); // Artifacts applies it now; its answer reaches nobody
      const asked = revocations(fork);
      const fresh = await inDO(r, async (room) => ({ d: room.core.workspaces.forkTokens.duties(), due: room.core.workspaces.forkTokens.nextDue(), now: clock.now }));
      expect(fresh.d.records.map((x) => [x.state, x.lastError])).toEqual([["unknown", "taken over: the host stopped before an answer was recorded"]]);
      expect(fresh.due).toBe(fresh.now + 1_000);
      clock.now = fresh.due!;
      expect(await alarm(r)).toBe(true);
      await settle(r);
      const w = await inDO(r, (room) => room.core.workspaces.forkTokens.watch(fork.name));
      expect(w).toMatchObject({ unknown: 1, at: fresh.due });
      expect(w!.unaccounted).toBeGreaterThanOrEqual(1);
      expect(w!.result).toMatch(/live token\(s\) on the fork not accounted for$/);
      // Past the token's lifetime, and another observation: still unknown, and the late token is never revoked.
      clock.now = Math.max(clock.now + 601_000, w!.nextAt!);
      expect(await alarm(r)).toBe(true);
      await settle(r);
      expect((await forkRecords(r)).records.map((x) => x.state)).toEqual(["unknown"]);
      expect(asked).not.toContain(late.id);
      expect(fork.tokens.get(late.id)!.revoked).toBe(false);
    }));

  it("R5 a wake-up that cannot be stored sends no fork create: pinning fails, no record is left, and the fork is not asked for a token", () =>
    ahead(async () => {
      const { r, a, lane, head, fork } = await laneRoom();
      let forkCreates = 0;
      await inDO(r, async (room, state) => {
        await state.storage.deleteAlarm();
        (room as unknown as { storeAlarm: (when: number) => Promise<void> }).storeAlarm = () => Promise.reject(new Error("storage refused the alarm"));
        a.holdToken = (repo) => {
          if (repo === fork.name) forkCreates++;
          return false;
        };
      });
      await expect(pin(r, lane, head)).rejects.toThrow(/storage refused the alarm/);
      a.holdToken = null;
      expect(forkCreates).toBe(0);
      expect(readTokens(fork)).toEqual([]);
      expect((await forkRecords(r)).records).toEqual([]);
    }));

  it("R6 idle: the forkTokens step, the ledger's next due time and the Room's next alarm write nothing, with no records, and with an unknown record whose observation is not yet due (a write spy on this object's SQL)", () =>
    ahead(async () => {
      const { r, lane, head, fork } = await laneRoom();
      const idleRun = () =>
        inDO(r, async (room, state) => {
          const sql = room.core.sql as { all: (q: string, ...b: unknown[]) => unknown[] };
          const real = sql.all;
          let written = 0;
          sql.all = (q: string, ...b: unknown[]) => {
            const c = state.storage.sql.exec(q, ...(b as never[]));
            const rows = c.toArray();
            written += c.rowsWritten;
            return rows;
          };
          try {
            await room.core.steps.forkTokens();
            room.core.workspaces.forkTokens.nextDue();
            room.core.nextAlarm();
            await room.core.workspaces.forkTokens.idle();
            return written;
          } finally {
            sql.all = real;
          }
        });
      expect(await idleRun()).toBe(0);
      loseForkAnswer(fork);
      await expect(pin(r, lane, head)).rejects.toThrow();
      await inDO(r, (room) => room.core.steps.forkTokens()); // the first observation, and the takeover time cleared
      const w = await inDO(r, (room) => room.core.workspaces.forkTokens.watch(fork.name));
      expect(w!.nextAt).toBe(clock.now + 60_000);
      clock.now += 30_000;
      expect(await idleRun()).toBe(0);
      expect(await idleRun()).toBe(0);
      expect((await inDO(r, (room) => room.core.workspaces.forkTokens.watch(fork.name)))!.nextAt).toBe(w!.nextAt);
    }));

  it("R7 the forkTokens step is its own kind of loop work: a failure of the step takes that kind's backoff; an earlier alarm for other work skips it and keeps the backoff; the ledger's next time waits for it; then it runs, revokes, and clears it", () =>
    ahead(async () => {
      const { r, a, fork } = await laneRoom();
      a.failRemote("revokeToken", new FakeArtifactsError("INTERNAL_ERROR", 10400));
      const calls = { n: 0 };
      await inDO(r, async (room) => {
        const t = await room.core.workspaces.forkTokens.mint(fork.name, "test:owed", 600);
        await t.release();
        await room.core.publish(true);
        const ledger = room.core.workspaces.forkTokens;
        const real = ledger.reconcile.bind(ledger);
        ledger.reconcile = async () => {
          if (++calls.n === 1) throw new Error("storage failed");
          return real();
        };
      });
      expect((await forkRecords(r)).owed).toBe(1);
      clock.now += 2_000;
      expect(await alarm(r)).toBe(true);
      const failed = await inDO(r, (room) => ({ fence: room.core.loopBackoff().forkTokens, due: room.core.workspaces.forkTokens.nextDue(), next: room.core.nextAlarm(), now: clock.now }));
      expect(calls.n).toBe(1);
      expect(failed.fence).toEqual({ attempts: 1, next: failed.now + 5_000 });
      expect(failed.due).toBe(failed.now + 1_000);
      expect(failed.next).toBe(failed.fence!.next);
      clock.now += 1_000;
      await inDO(r, (room) => room.core.runAll());
      expect(calls.n).toBe(1);
      expect(await inDO(r, (room) => room.core.loopBackoff().forkTokens)).toEqual(failed.fence);
      clock.now = failed.fence!.next;
      expect(await alarm(r)).toBe(true);
      await settle(r);
      expect(calls.n).toBe(2);
      expect((await forkRecords(r)).owed).toBe(0);
      expect(await inDO(r, (room) => room.core.loopBackoff().forkTokens)).toBeUndefined();
    }));
});

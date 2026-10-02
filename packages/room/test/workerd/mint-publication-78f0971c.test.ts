/**
 * Mint lane B (request 78f0971c): the canonical mint ledger in the Room,
 * with the publication token minted through it. Durable Object controls
 * from notes/2026-10-02-canonical-mint-ownership.md, "Lane B", test 8, under
 * protocol section 32 (R-MINT-2, R-MINT-4, R-MINT-5, R-MINT-7).
 *
 * Real Room objects, Durable Object SQLite and stored alarms, with no
 * request after the first. Alarms run only through `runDurableObjectAlarm`.
 * The room clock runs a week ahead of real time, with no test alarm delay,
 * so a stored alarm is the Room's own time (`alarmTime` keeps it as it is)
 * and never fires by itself during a test. Test hooks are set on one Room
 * object only (its engine's tokens, its ledger's wait, its alarm store);
 * no process global is swapped beyond the suite's existing clock and alarm
 * delay, which each test restores.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { Claim, Landing, LandOp, OpId } from "@generalbusiness/artroom-contract";
import { setAlarmDelay, type Room } from "../../src/index.ts";
import { FakeArtifactsError } from "../../src/memory/artifacts.ts";
import { Client, clock, day, makeRoom, pushChange, until, type TestRoom } from "./support.ts";

type State = DurableObjectState;
const inDO = <T>(r: TestRoom, fn: (room: Room, state: State) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const alarm = (r: TestRoom) => runDurableObjectAlarm(r.stub as unknown as DurableObjectStub<Room>);
const stored = (r: TestRoom) => inDO(r, (_room, state) => state.storage.getAlarm());

/** Run with the room clock a week ahead of real time and no alarm delay; restore both after. */
async function ahead<T>(fn: () => Promise<T>): Promise<T> {
  const saved = clock.now;
  clock.now = Date.now() + 7 * day;
  setAlarmDelay(null);
  try {
    return await fn();
  } finally {
    setAlarmDelay(3600_000);
    clock.now = Math.max(saved, clock.now);
  }
}

/** A fresh stub after the room's object is aborted, as after an eviction or a crash. */
async function restarted(before: TestRoom): Promise<TestRoom> {
  await inDO(before, (_room, state) => state.abort("restart")).catch(() => undefined);
  const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
  return { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
}

/** Claim a lane on `scope`, push to its fork and propose. Returns the lane and head. */
async function proposed(r: TestRoom, scope: string, files: Record<string, string>) {
  const { lane } = await r.admin.ok<Claim>("claim", null, { goal: "a lane", scope: [scope] });
  const head = pushChange(r, lane, files);
  await r.admin.ok("propose", { lane }, { lease: 1, expectedGeneration: 0, head, summary: "a lane" });
  await inDO(r, (room) => room.core.idle());
  return { lane, head };
}

/** Land a proposed lane: the act, then the landing step in the background (no alarm is run): once to prepare, once to reserve and publish. */
async function startLanding(r: TestRoom, lane: string, head: string): Promise<OpId> {
  const l = await r.admin.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
  const op = l.op.id as OpId;
  await inDO(r, (room) => room.core.run("landing"));
  await until(async () => (await opOf(r, op))?.state === "ready");
  await inDO(r, (room) => room.core.idle());
  await inDO(r, (room) => room.core.run("landing"));
  return op;
}

const opOf = (r: TestRoom, op: OpId) => inDO(r, (room) => room.core.landing.view(op) as LandOp | null);
const records = (r: TestRoom) => inDO(r, (room) => room.core.mints.duties({ limit: 1000 }));

/**
 * Hold the first canonical write create that the ledger sends (a `sent`
 * record exists), before Artifacts applies it. Other creates (an
 * integration's, a preview's) are not held. `answer()` lets it go.
 */
async function holdLedgerCreate(r: TestRoom) {
  const a = r.world.artifacts;
  const h = { call: 0, go: false, answer: () => void (h.go = true) };
  await inDO(r, (room) => {
    a.holdToken = (repo, scope, _ttl, n) => {
      if (h.call === 0 && repo === a.canonical && scope === "write" && room.core.mints.duties().records.some((x) => x.state === "sent")) h.call = n;
      return n === h.call && !h.go;
    };
  });
  return h;
}

/** Make the engine stop at `token-answered` once, as a host that stops there would: the ledger keeps the token, `held`. */
function stopAtTokenAnswered(r: TestRoom) {
  let fired = false;
  r.world.landingFault = (point) => {
    if (point === "token-answered" && !fired) {
      fired = true;
      throw new Error("the host stops between the answer and pushToken");
    }
  };
}

/** The canonical repository's token by ID, as Artifacts sees it. */
const token = (r: TestRoom, id: string) => r.world.artifacts.canonicalRepo().tokens.get(id)!;

describe("mint lane B: the publication token through the canonical mint ledger, in the Room", () => {
  it("no alarm stored beforehand: while the publication token's create is held, storage has an alarm no later than the takeover time, stored by the ledger's wake before the create was sent; a wake that takes 20 s of room time comes before the lifetime, which the record holds", () =>
    ahead(async () => {
      const r = await makeRoom();
      const { lane, head } = await proposed(r, "docs/a/**", { "docs/a/one.md": "one" });
      const held = await holdLedgerCreate(r);
      const asked: number[] = [];
      // Nothing stored, and the Room's own scheduling switched off on this object: only a wake can store an alarm now.
      // Storing it takes 20 s of room time.
      await inDO(r, async (room, state) => {
        await state.storage.deleteAlarm();
        const o = room as unknown as { schedule: () => void; storeAlarm: (when: number) => Promise<void> };
        o.schedule = () => {};
        const store = o.storeAlarm.bind(room);
        o.storeAlarm = async (when) => {
          if (asked.length === 0) clock.now += 20_000;
          asked.push(when);
          return store(when);
        };
      });
      expect(await stored(r)).toBeNull();
      const t1 = clock.now;
      const op = await startLanding(r, lane, head);
      await until(async () => held.call > 0);
      const seen = await inDO(r, async (room, state) => ({ alarm: await state.storage.getAlarm(), d: room.core.mints.duties(), now: clock.now }));
      expect(seen.d.records.map((x) => [x.purpose, x.state, x.ttlSeconds, x.sentAt])).toEqual([[`publish:${op}:1`, "sent", 60, t1 + 20_000]]);
      expect(seen.d.takeoverAt).toBe(t1 + 60_000);
      expect(asked).toEqual([t1 + 60_000]);
      expect(seen.alarm).not.toBeNull();
      expect(seen.alarm!).toBeLessThanOrEqual(seen.d.takeoverAt!);
      // The create answers: the token is claimed by pushToken, pushed and revoked, and the record is gone.
      held.answer();
      await until(async () => (await opOf(r, op))?.state === "landed");
      await inDO(r, (room) => room.core.idle());
      expect((await records(r)).records).toEqual([]);
      expect(r.world.artifacts.canonicalRepo().activeTokens()).toEqual([]);
      // The token's expiry ran from the send, after the wake: 60 s from t1 + 20 s.
      const pushed = await inDO(r, (room) => room.core.landing.core.get(op)!.pushes![0]!.tokenId!);
      expect(token(r, pushed).expiresAt).toBe(t1 + 80_000);
    }));

  it("idle: the mints step and the ledger's next due time write nothing, with no records, and with an unknown record whose observation is not yet due (a write spy on this object's SQL)", () =>
    ahead(async () => {
      const r = await makeRoom();
      const spy = (room: Room, state: State) => {
        const sql = room.core.sql as { all: (q: string, ...b: unknown[]) => unknown[] };
        const real = sql.all;
        const seen = { written: 0, restore: () => void (sql.all = real) };
        sql.all = (q: string, ...b: unknown[]) => {
          const c = state.storage.sql.exec(q, ...(b as never[]));
          const rows = c.toArray();
          seen.written += c.rowsWritten;
          return rows;
        };
        return seen;
      };
      const idleRun = () =>
        inDO(r, async (room, state) => {
          const w = spy(room, state);
          try {
            await room.core.steps.mints();
            room.core.mints.nextDue();
            room.core.nextAlarm();
            await room.core.mints.idle();
            return w.written;
          } finally {
            w.restore();
          }
        });
      expect(await idleRun()).toBe(0);
      // An unknown record: its first observation writes the summary once; until the next is due, nothing.
      // A check job's token (a job_tokens row) is known to the Room: the observation does not count it.
      const job = r.world.artifacts.canonicalRepo().mint("read", 300);
      await inDO(r, (room) => room.core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES (?, ?, ?, 'held')", job.id, clock.now + 300_000, clock.now + 300_000));
      r.world.artifacts.loseReply("createToken");
      await inDO(r, (room) => room.core.mints.mint("test:lost", "read", () => 60).catch(() => undefined));
      await inDO(r, (room) => room.core.steps.mints());
      expect((await records(r)).observation.unaccounted).toBe(1); // the lost create's token only
      const next = (await records(r)).observation.nextAt!;
      expect(next).toBe(clock.now + 60_000);
      clock.now += 30_000;
      expect(await idleRun()).toBe(0);
      expect(await idleRun()).toBe(0);
      expect((await records(r)).observation.nextAt).toBe(next);
    }));

  it("a crash with the answer lost: the object is aborted while the create is held and the create applies late; through the alarm alone, the fresh object records it as unknown, stores a bounded alarm for the observation, observes once, and keeps the record", () =>
    ahead(async () => {
      const before = await makeRoom();
      const a = before.world.artifacts;
      const { lane, head } = await proposed(before, "docs/b/**", { "docs/b/two.md": "two" });
      const held = await holdLedgerCreate(before);
      const op = await startLanding(before, lane, head);
      await until(async () => held.call > 0);
      const r = await restarted(before);
      // Artifacts applies the create late; no answer reaches the Room.
      const late = a.canonicalRepo().mint("write", 60);
      // The fresh object took over in its constructor and stored a wake for the observation, with no request.
      const fresh = await inDO(r, async (room, state) => ({ d: room.core.mints.duties(), due: room.core.mints.nextDue(), alarm: await state.storage.getAlarm(), now: clock.now }));
      expect(fresh.d.records.map((x) => [x.purpose, x.state, x.tokenId])).toEqual([[`publish:${op}:1`, "unknown", null]]);
      expect(fresh.d.unknown).toBe(1);
      expect(fresh.due).toBe(fresh.now + 1_000);
      expect(fresh.alarm).not.toBeNull();
      expect(fresh.alarm!).toBeLessThanOrEqual(fresh.due!);
      // Publication tokens' revocations fail, so the next attempt's token is live, in its landing row, when the ledger observes.
      await inDO(r, (room) => {
        (room.core.landing as unknown as { tokens: { revoke: (id: string) => Promise<boolean> } }).tokens.revoke = async () => {
          throw new Error("Artifacts unavailable (revoke)");
        };
      });
      const lists = a.remoteCalls.get("listTokens") ?? 0;
      expect(await alarm(r)).toBe(true);
      await inDO(r, (room) => room.core.idle());
      const after = await inDO(r, async (room, state) => ({ d: room.core.mints.duties(), due: room.core.mints.nextDue(), alarm: await state.storage.getAlarm(), now: clock.now }));
      // Observed once: the late token is the one live token the Room cannot account for; the publication's own is known by its row.
      expect((a.remoteCalls.get("listTokens") ?? 0) - lists).toBe(1);
      expect(after.d.observation).toMatchObject({ at: fresh.now, unaccounted: 1, nextAt: fresh.now + 60_000 });
      const pushed = await inDO(r, (room) => room.core.landing.core.liveTokens(op).map((t) => t.tokenId));
      expect(pushed).toHaveLength(1);
      expect(a.canonicalRepo().activeTokens().map((t) => t.id).sort()).toEqual([late.id, pushed[0]!].sort());
      // The record is kept, never settled by the observation; the next observation's time is stored on time.
      expect(after.d.records.map((x) => x.state)).toEqual(["unknown"]);
      expect(after.due).toBe(fresh.now + 60_000);
      expect(after.alarm!).toBeLessThanOrEqual(after.due!);
      // The publication went forward with a new attempt and landed once.
      expect((await opOf(r, op))?.state).toBe("landed");
      // Past the token's lifetime, and another observation: still unknown, and the late token is never revoked.
      clock.now = after.due! + 1;
      expect(await alarm(r)).toBe(true);
      await inDO(r, (room) => room.core.idle());
      expect((await records(r)).records.map((x) => x.state)).toEqual(["unknown"]);
      expect(token(r, late.id).revoked).toBe(false);
    }));

  it("an earlier alarm runs while the token is held: afterwards storage still has an alarm no later than the takeover time; after the object is aborted, the next alarm takes over and revokes the token by its ID", () =>
    ahead(async () => {
      const before = await makeRoom();
      const { lane, head } = await proposed(before, "docs/c/**", { "docs/c/three.md": "three" });
      stopAtTokenAnswered(before);
      const op = await startLanding(before, lane, head);
      await until(async () => (await records(before)).records.some((x) => x.state === "held"));
      const heldRecord = (await records(before)).records[0]!;
      expect(heldRecord).toMatchObject({ purpose: `publish:${op}:1`, state: "held" });
      const tokenId = heldRecord.tokenId!;
      const takeover = (await records(before)).takeoverAt!;
      // 20 s later an alarm for other work (the landing's) runs; the takeover time is still more than 30 s away.
      clock.now += 20_000;
      expect(await alarm(before)).toBe(true);
      await inDO(before, (room) => room.core.idle());
      expect((await opOf(before, op))?.state).toBe("landed");
      const afterAlarm = await inDO(before, async (room, state) => ({ alarm: await state.storage.getAlarm(), d: room.core.mints.duties() }));
      expect(afterAlarm.d.records.map((x) => x.state)).toEqual(["held"]);
      expect(afterAlarm.d.takeoverAt).toBe(takeover);
      expect(afterAlarm.alarm).not.toBeNull();
      expect(afterAlarm.alarm!).toBeLessThanOrEqual(takeover);
      expect(token(before, tokenId).revoked).toBe(false);
      // The host stops, with no alarm stored. The fresh object stores one for the owed token at start, with no request;
      // the landing has nothing left to do, so only the ledger's debt is due within the minute.
      await inDO(before, (_room, state) => state.storage.deleteAlarm());
      const r = await restarted(before);
      const recovered = await inDO(r, async (room, state) => ({ alarm: await state.storage.getAlarm(), due: room.core.mints.nextDue(), now: clock.now }));
      expect(recovered.due).toBe(recovered.now + 1_000);
      expect(recovered.alarm).toBe(recovered.due);
      expect((await records(r)).records.map((x) => [x.state, x.tokenId])).toEqual([["owed", tokenId]]);
      expect(await alarm(r)).toBe(true);
      await inDO(r, (room) => room.core.mints.idle());
      expect(token(r, tokenId).revoked).toBe(true);
      expect((await records(r)).records).toEqual([]);
      expect(r.world.artifacts.canonicalRepo().activeTokens()).toEqual([]);
    }));

  it("a wake-up that cannot be stored sends no create: the publication attempt ends with safe metadata, and lands once storage recovers", () =>
    ahead(async () => {
      const r = await makeRoom();
      const a = r.world.artifacts;
      const { lane, head } = await proposed(r, "docs/d/**", { "docs/d/four.md": "four" });
      let sentWhilePublishing = 0;
      await inDO(r, async (room, state) => {
        await state.storage.deleteAlarm();
        // Storage refuses every alarm on this object.
        (room as unknown as { storeAlarm: (when: number) => Promise<void> }).storeAlarm = () => Promise.reject(new Error("storage refused the alarm"));
        a.holdToken = () => {
          if (room.core.landing.core.held()) sentWhilePublishing++;
          return false;
        };
      });
      const op = await startLanding(r, lane, head);
      await until(async () => ((await inDO(r, (room) => room.core.landing.core.get(op)?.pushes?.length)) ?? 0) > 0);
      await inDO(r, (room) => room.core.idle());
      const attempt = await inDO(r, (room) => room.core.landing.core.get(op)!.pushes![0]!);
      expect(attempt).toMatchObject({ n: 1, tokenId: null, outcome: "error", detail: "token not minted (create failed: Error)" });
      expect(sentWhilePublishing).toBe(0);
      expect((await records(r)).records).toEqual([]);
      expect(await stored(r)).toBeNull();
      // Storage recovers on a fresh object; the publication goes forward and lands once.
      a.holdToken = null;
      const fresh = await restarted(r);
      clock.now += 5_000;
      expect(await alarm(fresh)).toBe(true);
      await inDO(fresh, (room) => room.core.idle());
      expect((await opOf(fresh, op))?.state).toBe("landed");
      expect(a.canonicalRepo().activeTokens()).toEqual([]);
    }));

  it("the mints step is its own kind of loop work (request 3da1d82b): a failure of the step takes that kind's backoff; an earlier alarm for other work skips it and keeps the backoff; the ledger's next time waits for it; then it runs and clears it", () =>
    ahead(async () => {
      const r = await makeRoom();
      // One owed revocation, due 1 s after its release failed; the log published, so nothing else is due.
      r.world.artifacts.failRemote("revokeToken", new FakeArtifactsError("INTERNAL_ERROR", 10400));
      const calls = { n: 0 };
      await inDO(r, async (room) => {
        const t = await room.core.mints.mint("test:owed", "read", () => 60);
        await t.release();
        await room.core.publish(true);
        // The step fails once, before the ledger runs: as a storage failure would.
        const real = room.core.mints.reconcile.bind(room.core.mints);
        room.core.mints.reconcile = async () => {
          if (++calls.n === 1) throw new Error("storage failed");
          return real();
        };
      });
      expect((await records(r)).owed).toBe(1);
      clock.now += 2_000;
      expect(await alarm(r)).toBe(true);
      const failed = await inDO(r, (room) => ({ fence: room.core.loopBackoff().mints, due: room.core.mints.nextDue(), next: room.core.nextAlarm(), now: clock.now }));
      expect(calls.n).toBe(1);
      expect(failed.fence).toEqual({ attempts: 1, next: failed.now + 5_000 });
      expect(failed.due).toBe(failed.now + 1_000); // the ledger's own time is earlier …
      expect(failed.next).toBe(failed.fence!.next); // … and waits for the step's backoff
      expect(await stored(r)).toBe(failed.fence!.next);
      // An alarm for other work, before the backoff ends: the step is skipped, and its backoff kept.
      clock.now += 1_000;
      await inDO(r, (room) => room.core.runAll());
      expect(calls.n).toBe(1);
      expect(await inDO(r, (room) => room.core.loopBackoff().mints)).toEqual(failed.fence);
      // At the backoff's end it runs: the revocation is made, and the backoff cleared.
      clock.now = failed.fence!.next;
      expect(await alarm(r)).toBe(true);
      await inDO(r, (room) => room.core.mints.idle());
      expect(calls.n).toBe(2);
      expect((await records(r)).owed).toBe(0);
      expect(await inDO(r, (room) => room.core.loopBackoff().mints)).toBeUndefined();
    }));

  it("while the canonical repository is gone, the ledger's work is kept, and neither run nor scheduled (request 3da1d82b)", () =>
    ahead(async () => {
      const r = await makeRoom();
      r.world.artifacts.failRemote("revokeToken", new FakeArtifactsError("INTERNAL_ERROR", 10400));
      const calls = { n: 0 };
      await inDO(r, async (room) => {
        const t = await room.core.mints.mint("test:owed", "read", () => 60);
        await t.release();
        room.core.sql.all("INSERT INTO meta (k, v) VALUES ('canonical_gone', ?)", JSON.stringify({ since: new Date(clock.now).toISOString(), head: room.core.headSeq() }));
        const real = room.core.mints.reconcile.bind(room.core.mints);
        room.core.mints.reconcile = async () => {
          calls.n++;
          return real();
        };
      });
      clock.now += 2_000;
      const s = await inDO(r, async (room) => {
        await room.core.runAll();
        return { due: room.core.mints.nextDue(), next: room.core.nextAlarm(), owed: room.core.mints.duties().owed };
      });
      expect(calls.n).toBe(0);
      expect(s.owed).toBe(1);
      expect(s.due).not.toBeNull();
      expect(s.next).toBeNull();
    }));

  it("several alarms on a live host with a long-held token: each moves the takeover time ahead, and none stores an alarm less than 1 s ahead", () =>
    ahead(async () => {
      const r = await makeRoom();
      const { lane, head } = await proposed(r, "docs/e/**", { "docs/e/five.md": "five" });
      stopAtTokenAnswered(r);
      const op = await startLanding(r, lane, head);
      await until(async () => (await records(r)).records.some((x) => x.state === "held"));
      const tokenId = (await records(r)).records[0]!.tokenId!;
      let last = (await records(r)).takeoverAt!;
      for (let i = 0; i < 4; i++) {
        clock.now += 35_000; // the takeover time is now less than 30 s away
        expect(await alarm(r)).toBe(true);
        await inDO(r, (room) => room.core.idle());
        const s = await inDO(r, async (room, state) => ({ alarm: await state.storage.getAlarm(), d: room.core.mints.duties(), now: clock.now }));
        expect(s.d.records.map((x) => [x.state, x.tokenId])).toEqual([["held", tokenId]]);
        expect(s.d.takeoverAt).toBe(s.now + 60_000);
        expect(s.d.takeoverAt!).toBeGreaterThan(last);
        last = s.d.takeoverAt!;
        expect(s.alarm).not.toBeNull();
        expect(s.alarm! - s.now).toBeGreaterThanOrEqual(1_000);
        expect(s.alarm!).toBeLessThanOrEqual(s.d.takeoverAt!);
      }
      expect((await opOf(r, op))?.state).toBe("landed");
      expect(token(r, tokenId).revoked).toBe(false); // the live host still holds it
    }));

  it("a backlog of 45 owed revocations, the first held unanswered, and no further request: no stored alarm under 1 s ahead or past the held attempt's timeout; a publication lands meanwhile; then alarms alone revoke every record, earliest due first, each next alarm 1 s after its pass; an earlier lease alarm is kept, and a future observation is stored on time", () =>
    ahead(async () => {
      const r = await makeRoom();
      const a = r.world.artifacts;
      const t0 = clock.now;
      // A lane whose lease expires 48 s after the backlog is due: its alarm is earlier than the next observation's time.
      await r.admin.ok<Claim>("claim", null, { goal: "the lease alarm", scope: ["notes/**"] });
      const leaseAt = t0 + 30 * 60_000;
      clock.now = leaseAt - 50_000;
      const { lane, head } = await proposed(r, "docs/f/**", { "docs/f/six.md": "six" });
      const WAIT = 2_000; // the ledger's bounded wait on this object, so the held attempt times out in the test
      // 45 tokens whose release fails: owed, due 1 s later, in row order. And one create whose answer is lost: unknown.
      const ids = await inDO(r, async (room) => {
        (room.core.mints as unknown as { waitMs: number }).waitMs = WAIT;
        const out: string[] = [];
        for (let i = 0; i < 45; i++) {
          const t = await room.core.mints.mint(`test:backlog:${i}`, "read", () => 60);
          a.failRemote("revokeToken", new FakeArtifactsError("INTERNAL_ERROR", 10400));
          await t.release();
          out.push(t.id);
        }
        a.loseReply("createToken");
        await room.core.mints.mint("test:lost", "read", () => 60).catch(() => undefined);
        return out;
      });
      const d0 = await records(r);
      expect([d0.owed, d0.unknown]).toEqual([45, 1]);
      // The backlog's revocations are recorded in order; the first is held unanswered.
      const backlog = new Set(ids);
      const asked: string[] = [];
      const canonical = a.canonicalRepo();
      const realRevoke = canonical.revokeToken.bind(canonical);
      let holdFirst = true;
      let heldOnce = false;
      canonical.revokeToken = async (id: string) => {
        if (backlog.has(id)) asked.push(id);
        if (!heldOnce && id === ids[0]) {
          heldOnce = true;
          while (holdFirst) await new Promise((res) => setTimeout(res, 5));
          return false;
        }
        return realRevoke(id);
      };
      try {
        clock.now += 2_000; // every record is due
        const t2 = clock.now;
        // The first pass starts and holds on its first revocation; the observation runs once.
        expect(await alarm(r)).toBe(true);
        const held = await inDO(r, async (room, state) => ({ alarm: await state.storage.getAlarm(), d: room.core.mints.duties(), due: room.core.mints.nextDue() }));
        expect(asked).toEqual([ids[0]]);
        expect(held.d.observation).toMatchObject({ at: t2, nextAt: t2 + 60_000 });
        expect(held.due).toBe(t2 + WAIT); // not eligible before the held attempt's timeout
        expect(held.alarm! - t2).toBeGreaterThanOrEqual(1_000);
        expect(held.alarm!).toBeLessThanOrEqual(t2 + WAIT);
        // Meanwhile a publication reserves, pushes and lands; the landing's own work then runs at its alarm.
        const op = await startLanding(r, lane, head);
        await until(async () => (await opOf(r, op))?.state === "landed");
        await inDO(r, (room) => room.core.idle());
        expect(await alarm(r)).toBe(true);
        await inDO(r, (room) => room.core.idle());
        const meanwhile = await inDO(r, async (room, state) => ({ alarm: await state.storage.getAlarm(), owed: room.core.mints.duties().owed }));
        expect(asked.filter((x) => x === ids[0])).toHaveLength(1); // the held attempt is not repeated
        expect(meanwhile.owed).toBe(45);
        expect(meanwhile.alarm! - clock.now).toBeGreaterThanOrEqual(1_000);
        expect(meanwhile.alarm!).toBeLessThanOrEqual(t2 + WAIT);
        // The held attempt times out (in real time) and takes its backoff; the rest of its batch is revoked.
        await inDO(r, (room) => room.core.mints.idle());
        const pass1 = await inDO(r, async (room, state) => ({ alarm: await state.storage.getAlarm(), d: room.core.mints.duties({ limit: 1000 }) }));
        expect(asked).toEqual(ids.slice(0, 20));
        expect(pass1.d.owed).toBe(26);
        expect(pass1.d.records.find((x) => x.tokenId === ids[0])).toMatchObject({ state: "owed", dueAt: clock.now + 2_000, lastError: "revocation: no answer in time" });
        expect(pass1.alarm).toBe(clock.now + 1_000); // the backlog continues 1 s after the pass
        // Alarms alone: the next 20, earliest due first; then the last 5 and the held one, now due.
        clock.now += 1_000;
        expect(await alarm(r)).toBe(true);
        await inDO(r, (room) => room.core.mints.idle());
        expect(asked).toEqual([...ids.slice(0, 20), ...ids.slice(20, 40)]);
        expect(await stored(r)).toBe(clock.now + 1_000);
        clock.now += 1_000;
        expect(await alarm(r)).toBe(true);
        await inDO(r, (room) => room.core.mints.idle());
        expect(asked).toEqual([...ids.slice(0, 20), ...ids.slice(20, 40), ...ids.slice(40), ids[0]]);
        const done = await inDO(r, async (room, state) => ({ alarm: await state.storage.getAlarm(), d: room.core.mints.duties({ limit: 1000 }), due: room.core.mints.nextDue() }));
        expect([done.d.owed, done.d.unknown]).toEqual([0, 1]);
        expect(ids.every((id) => token(r, id).revoked)).toBe(true);
        // The last pass's wake at its attempt's timeout stays (a wake never moves an alarm later); it finds nothing due.
        expect(done.alarm! - clock.now).toBeGreaterThanOrEqual(1_000);
        expect(done.alarm!).toBeLessThanOrEqual(clock.now + WAIT);
        clock.now = done.alarm!;
        expect(await alarm(r)).toBe(true);
        await inDO(r, (room) => room.core.mints.idle());
        expect(asked).toHaveLength(46);
        // The earlier lease alarm is kept; the observation, still in the future, is the ledger's next time, exactly.
        expect(await inDO(r, (room) => room.core.mints.nextDue())).toBe(t2 + 60_000);
        expect(leaseAt).toBeLessThan(t2 + 60_000);
        expect(await stored(r)).toBe(leaseAt);
        clock.now = leaseAt;
        expect(await alarm(r)).toBe(true);
        await inDO(r, (room) => room.core.idle());
        expect(await stored(r)).toBe(t2 + 60_000);
      } finally {
        holdFirst = false;
        canonical.revokeToken = realRevoke;
      }
    }));

  it("a ledger record with a readable expiry whose revocations fail ends when that expiry passes, with no revocation recorded; a landing row for the same case stays, with plan 003's record, until tokenRevoked", () =>
    ahead(async () => {
      const r = await makeRoom();
      const a = r.world.artifacts;
      const { lane, head } = await proposed(r, "docs/g/**", { "docs/g/seven.md": "seven" });
      // The ledger's record: released, the revocation fails; owed with Artifacts' reported expiry.
      a.failRemote("revokeToken", ...Array.from({ length: 20 }, () => new FakeArtifactsError("INTERNAL_ERROR", 10400)));
      const ledgerToken = await inDO(r, async (room) => {
        const t = await room.core.mints.mint("test:expiry", "read", () => 60);
        await t.release();
        return { id: t.id, expiresAt: t.expiresAt };
      });
      // The landing's row: a publication whose token revocations fail.
      const failing = async () => {
        throw new Error("Artifacts unavailable (revoke)");
      };
      await inDO(r, (room) => void ((room.core.landing as unknown as { tokens: { revoke: () => Promise<boolean> } }).tokens.revoke = failing));
      const op = await startLanding(r, lane, head);
      await until(async () => (await opOf(r, op))?.state === "landed");
      await inDO(r, (room) => room.core.idle());
      const landingToken = await inDO(r, (room) => room.core.landing.core.get(op)!.pushes![0]!.tokenId!);
      // Every revocation of the ledger's token, by ID, as Artifacts receives it.
      const canonical = a.canonicalRepo();
      const realRevoke = canonical.revokeToken.bind(canonical);
      const asked: number[] = [];
      canonical.revokeToken = async (id: string) => {
        if (id === ledgerToken.id) asked.push(clock.now);
        return realRevoke(id);
      };
      // Alarms while revocations fail, until well past both tokens' expiry.
      for (let i = 0; i < 12; i++) {
        clock.now += 15_000;
        await alarm(r);
        await inDO(r, async (room) => {
          await room.core.idle();
          await room.core.mints.idle();
          await room.core.landing.cleanupDone();
        });
      }
      expect(clock.now).toBeGreaterThan(ledgerToken.expiresAt);
      const state = await inDO(r, (room) => ({
        records: room.core.mints.duties().records,
        rows: room.core.sql.all("SELECT token FROM artroom_land_token").map((x) => x["token"]),
        cleanup: room.core.landing.core.tokenCleanup().map((c) => c.op),
      }));
      expect(state.records).toEqual([]); // settled at its expiry
      expect(token(r, ledgerToken.id).revoked).toBe(false); // with no revocation recorded
      // Revocations were tried before its expiry, and none at or after it.
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.every((at) => at < ledgerToken.expiresAt)).toBe(true);
      const tried = asked.length;
      clock.now += 300_000;
      await alarm(r);
      await inDO(r, (room) => room.core.mints.idle());
      expect(asked).toHaveLength(tried);
      expect(state.rows).toEqual([landingToken]); // the landing's row stays past its token's expiry …
      expect(state.cleanup).toEqual([op]); // … with plan 003's record
      // … until tokenRevoked.
      a.recover();
      await inDO(r, (room) => {
        const tokens = (room.core.landing as unknown as { tokens: { revoke: (id: string) => Promise<boolean> } }).tokens;
        tokens.revoke = async (id) => a.canonicalRepo().revokeToken(id);
      });
      clock.now += 300_000;
      expect(await alarm(r)).toBe(true);
      await inDO(r, (room) => room.core.landing.cleanupDone());
      const end = await inDO(r, (room) => ({ rows: room.core.sql.all("SELECT token FROM artroom_land_token").length, cleanup: room.core.landing.core.tokenCleanup().length }));
      expect(end).toEqual({ rows: 0, cleanup: 0 });
    }));
});

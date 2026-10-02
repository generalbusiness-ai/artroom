/**
 * Request 3da1d82b: idle Durable Object write storms.
 *
 * Measured on the spike (request 8bd623cc): an idle room published its own
 * `checkpoint` entry every minute, forever (7 rows a minute), and a room
 * whose repository the smoke cleanup deleted ran its alarm every 5 seconds,
 * writing one row each time (12 rows and 12 alarm invocations a minute).
 *
 * These tests run the real Room Durable Object (SQLite in workerd) through
 * its real `alarm()`. Each counts storage writes with a spy it installs on
 * that object only: every SQL statement's `rowsWritten` from the cursor, and
 * every alarm the Room stores. No process global is replaced.
 */

import { describe, expect, it } from "vitest";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { AttentionItem, Claim, Landing, LogEntry, Note, Sha, WorkspaceOp } from "@generalbusiness/artroom-contract";
import { forkName } from "@generalbusiness/artroom-git";
import type { Room } from "../../src/index.ts";
import { ALARM } from "../../src/budgets.ts";
import { advance, call, clock, expectOk, failure, hour, makeRoom, pushChange, tick, type TestRoom } from "./support.ts";

const minute = 60_000;
type Stub = DurableObjectStub<Room>;
const stubOf = (room: TestRoom) => room.stub as unknown as Stub;
const inDO = <T>(room: TestRoom, fn: (r: Room) => T) => runInDurableObject(stubOf(room), (r: Room) => fn(r));

/** Writes counted on one Room object: SQL rows written, and alarms stored. */
interface Writes {
  rows: number;
  alarms: number;
  readonly statements: string[];
}

/**
 * Count the Room object's storage writes. The spy replaces the methods of
 * this object's own `Sql` adapter and `storeAlarm`, and reads each cursor's
 * `rowsWritten` from the object's real SQLite.
 */
async function spy(room: TestRoom): Promise<Writes> {
  const w: Writes = { rows: 0, alarms: 0, statements: [] };
  await runInDurableObject(stubOf(room), (r: Room, state) => {
    const sql = r.core.sql as { all: (q: string, ...b: unknown[]) => unknown[] };
    sql.all = (q, ...b) => {
      const c = state.storage.sql.exec(q, ...(b as SqlStorageValue[]));
      const rows = c.toArray();
      if (c.rowsWritten > 0) {
        w.rows += c.rowsWritten;
        w.statements.push(q.slice(0, 80));
      }
      return rows;
    };
    const self = r as unknown as { storeAlarm: (when: number) => Promise<void>; idleSpy: Writes };
    const store = self.storeAlarm.bind(r);
    self.storeAlarm = (when) => {
      w.alarms++;
      return store(when);
    };
    self.idleSpy = w;
  });
  return w;
}

/** The spy is still installed: the object was not replaced, so nothing went uncounted. */
async function stillSpied(room: TestRoom, w: Writes): Promise<void> {
  expect(await inDO(room, (r) => (r as unknown as { idleSpy?: Writes }).idleSpy === w)).toBe(true);
}

/**
 * Run the Room's real alarm at each time it asks for, until `end` (room
 * clock). Returns the room-clock time of each alarm run.
 */
async function alarmsUntil(room: TestRoom, end: number): Promise<number[]> {
  const ran: number[] = [];
  for (;;) {
    const next = await inDO(room, (r) => r.core.nextAlarm());
    if (next === null || next > end) break;
    clock.now = Math.max(clock.now, next);
    expect(await runDurableObjectAlarm(stubOf(room))).toBe(true);
    ran.push(clock.now);
    if (ran.length > 5_000) throw new Error("the alarm never settles");
  }
  clock.now = Math.max(clock.now, end);
  return ran;
}

async function entries(room: TestRoom): Promise<LogEntry[]> {
  return [...(await room.admin.read({ q: "log", req: { limit: 500 } })).acts];
}

const kindOf = (e: LogEntry) => (e.entry.type === "system" ? e.entry.event.type : e.entry.act.envelope.kind);

/** A room with a little history: a lane claimed, noted on and released, all published. */
async function settledRoom(): Promise<TestRoom> {
  const room = await makeRoom();
  const claim = await room.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
  await room.admin.ok<Note>("note", { act: claim.id }, { text: "a note" });
  await room.admin.ok("release", { lane: claim.lane }, { lease: 1 });
  await tick(room);
  // The last real act is published within a minute or so; then the alarm has nothing left to do.
  await alarmsUntil(room, clock.now + 10 * minute);
  return room;
}

describe("request 3da1d82b: an idle room writes nothing", () => {
  it("after the last act's publication settles, a founded idle room writes no rows and stores no alarm over 24 simulated hours of alarm ticks", async () => {
    const room = await settledRoom();
    const log = await entries(room);
    const page = await room.admin.read({ q: "log" });
    // The last act is published, and the only unpublished entry is the checkpoint that names it.
    expect(kindOf(log.at(-1)!)).toBe("checkpoint");
    expect(page.publishedThrough).toBe(page.head - 1);
    expect(await inDO(room, (r) => r.core.nextAlarm())).toBeNull();

    const w = await spy(room);
    const start = clock.now;
    // 24 simulated hours: the Room asks for no alarm in all of it.
    expect(await alarmsUntil(room, start + 24 * hour)).toEqual([]);
    // And an alarm that fires anyway (one stored before a deploy, say), once a minute for two hours, writes nothing.
    for (let i = 0; i < 120; i++) {
      advance(minute);
      await inDO(room, (r) => r.alarm());
    }
    await stillSpied(room, w);
    expect({ rows: w.rows, alarms: w.alarms, statements: w.statements }).toEqual({ rows: 0, alarms: 0, statements: [] });
    expect((await room.admin.read({ q: "log" })).head).toBe(page.head);
    expect(ALARM.idleRowsPerHour).toBe(0);
  });

  it("a checkpoint-only unpublished suffix is never due; a real act after it is due a minute later and is published, and then the room is idle again", async () => {
    const room = await settledRoom();
    const before = await room.admin.read({ q: "log" });
    advance(7 * 24 * hour);
    expect(await inDO(room, (r) => ({ due: r.core.publicationDue(), at: r.core.publicationDueAt(), alarm: r.core.nextAlarm() }))).toEqual({ due: false, at: null, alarm: null });

    const claim = await room.admin.ok<Claim>("claim", null, { goal: "later", scope: ["docs/**"] });
    const sealedAt = clock.now;
    expect(await inDO(room, (r) => r.core.publicationDueAt())).toBe(sealedAt + minute);
    // Its alarm is missed by two minutes: a publication already due is asked for 5 s from now, never at once.
    advance(2 * minute);
    expect(await inDO(room, (r) => ({ due: r.core.publicationDue(), alarm: r.core.nextAlarm() }))).toEqual({ due: true, alarm: clock.now + ALARM.pendingIntervalMs });
    // The lease is the only other timer, half an hour away; the publication comes first.
    const ran = await alarmsUntil(room, sealedAt + 10 * minute);
    expect(ran).toEqual([sealedAt + 2 * minute + ALARM.pendingIntervalMs]);
    const after = await room.admin.read({ q: "log" });
    const log = await entries(room);
    const claimEntry = log.find((e) => e.seq > before.head && kindOf(e) === "claim")!;
    expect(claimEntry).toBeDefined();
    // Published through the claim; the new checkpoint names it and is itself unpublished.
    expect(after.publishedThrough).toBe(claimEntry.seq);
    expect(kindOf(log.at(-1)!)).toBe("checkpoint");
    expect(after.head).toBe(claimEntry.seq + 1);
    // The earlier checkpoint went out with the claim: it is at or below publishedThrough.
    expect(before.head).toBeLessThanOrEqual(after.publishedThrough);
    // Idle again, apart from the held lease's expiry.
    expect(await inDO(room, (r) => r.core.nextAlarm())).toBe((await inDO(room, (r) => r.core.sql.all("SELECT expires_ms FROM lanes WHERE id = ?", claim.lane)[0]!["expires_ms"])) as number);
  });
});

describe("request 3da1d82b: failing work backs off", () => {
  it("a failing publication backs off from 5 s, doubling, to a 5-minute cap: never closer than the backoff allows, and at most 12 retries in every hour after the first", async () => {
    const room = await makeRoom();
    const claim = await room.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    // Released, so no lease expiry falls between the retries.
    await room.admin.ok("release", { lane: claim.lane }, { lease: 1 });
    await tick(room);
    // Every push fails before it reaches the remote, with no answer, for as long as the test runs.
    room.world.log.faults.failBeforePush = 1_000_000;
    const w = await spy(room);
    const start = clock.now;
    const ran = await alarmsUntil(room, start + 3 * hour);
    await stillSpied(room, w);
    const gaps = ran.slice(1).map((t, i) => t - ran[i]!);
    // The first try is a minute after the claim; then each wait doubles from 5 s, and none is over the cap.
    expect(gaps.slice(0, 8)).toEqual([5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(ALARM.pendingIntervalMs);
    expect(Math.max(...gaps)).toBe(ALARM.retryBackoffMaxMs);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeGreaterThanOrEqual(gaps[i - 1]!);
    const inHour = (h: number) => ran.filter((t) => t >= start + h * hour && t < start + (h + 1) * hour).length;
    // The first hour holds the ramp: at most 3600 / 300 + log2(300 / 5) rounded up = 18. Every later hour: 12.
    expect(inHour(0)).toBeLessThanOrEqual(3_600_000 / ALARM.retryBackoffMaxMs + Math.ceil(Math.log2(ALARM.retryBackoffMaxMs / ALARM.pendingIntervalMs)));
    expect(inHour(1)).toBe(12);
    expect(inHour(2)).toBe(12);
    // One row per retry (its backoff), after the first failure stored its cohort, code and backoff (2 rows each);
    // and one alarm stored per run.
    expect(w.rows).toBeLessThanOrEqual(ran.length + 5);
    expect(w.alarms).toBe(ran.length);
    // Nothing was settled: the same cohort is still pending, and the log ref never moved.
    expect(await inDO(room, (r) => r.core.pendingPublication())).not.toBeNull();
    expect(room.world.log.ref).toBeNull();

    // When the remote answers again, the next retry publishes and the backoff is gone.
    room.world.log.faults.failBeforePush = 0;
    await alarmsUntil(room, clock.now + 10 * minute);
    expect(await inDO(room, (r) => ({ pending: r.core.pendingPublication(), retry: r.core.sql.all("SELECT k FROM meta WHERE k IN ('publication_retry', 'publication_error')") }))).toEqual({ pending: null, retry: [] });
    expect((await room.admin.read({ q: "log" })).publishedThrough).toBeGreaterThanOrEqual(2);
  });

  it("a publication the registry does not allow (R-PUB-10) backs off the same way", async () => {
    const room = await makeRoom();
    const claim = await room.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await room.admin.ok("release", { lane: claim.lane }, { lease: 1 });
    await inDO(room, (r) => {
      (r.core as unknown as { isBound: () => Promise<boolean> }).isBound = async () => false;
    });
    const start = clock.now;
    const ran = await alarmsUntil(room, start + 2 * hour);
    const gaps = ran.slice(1).map((t, i) => t - ran[i]!);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(ALARM.pendingIntervalMs);
    expect(Math.max(...gaps)).toBe(ALARM.retryBackoffMaxMs);
    expect(ran.filter((t) => t >= start + hour).length).toBe(12);
    expect((await failure(room.stub.publishLog())).code).toBe("forbidden");
  });

  it("a failing step on the 5-second loop (a pin) backs off to the cap, and the backoff resets once it succeeds", async () => {
    const room = await makeRoom();
    const claim = await room.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const head = pushChange(room, claim.lane, { "src/app.ts": "v2" });
    // The pin's ref write fails, as an outage would, for the next 200 attempts, more than an hour of 5-second retries would make.
    room.world.artifacts.failRemote("pinRef", ...Array.from({ length: 200 }, () => new Error("Artifacts is unavailable (pinRef)")));
    await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "v2" });
    await tick(room);
    expect(await inDO(room, (r) => r.core.sql.all("SELECT done FROM pins"))).toEqual([{ done: 0 }]);
    const start = clock.now;
    const ran = await alarmsUntil(room, start + hour);
    const gaps = ran.slice(1).map((t, i) => t - ran[i]!);
    // The publication runs on its own schedule; the pin's alarms back off to the cap.
    expect(Math.max(...gaps)).toBe(ALARM.retryBackoffMaxMs);
    expect(gaps.filter((g) => g === ALARM.pendingIntervalMs).length).toBeLessThanOrEqual(2);
    expect(ran.length).toBeLessThanOrEqual(20);
    expect(await inDO(room, (r) => r.core.sql.all("SELECT done FROM pins"))).toEqual([{ done: 0 }]);

    // The outage ends: the next retry completes the pin, and the backoff is reset.
    expect(await inDO(room, (r) => r.core.sql.all("SELECT 1 FROM meta WHERE k = 'loop_backoff'").length)).toBe(1);
    room.world.artifacts.recover();
    await alarmsUntil(room, clock.now + 30 * minute);
    expect(await inDO(room, (r) => ({ pins: r.core.sql.all("SELECT done FROM pins"), backoff: r.core.sql.all("SELECT v FROM meta WHERE k = 'loop_backoff'") }))).toEqual({ pins: [{ done: 1 }], backoff: [] });
  });
});

describe("request 3da1d82b: a room whose canonical repository is gone", () => {
  /**
   * The smoke run's shape: a workspace, a proposal, a landing whose token
   * revocation is still owed, a release, and a publication whose answer was
   * lost (an unknown effect). Then the cleanup deletes the fork and the
   * canonical repository.
   */
  async function deletedRoom() {
    const room = await makeRoom();
    const claim = await room.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    expectOk(await room.admin.request<WorkspaceOp>({ kind: "workspace", lane: claim.lane, lease: 1 }));
    await tick(room, 2);
    const head = pushChange(room, claim.lane, { "src/app.ts": "v2" });
    await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "v2" });
    // The landing's token revocation fails, so a revocation is owed afterwards.
    await inDO(room, (r) => {
      (r.core.landing as unknown as { tokens: { revoke: (id: string) => Promise<boolean> } }).tokens.revoke = async () => {
        throw new Error("Artifacts unavailable (revoke)");
      };
    });
    const l = await room.admin.ok<Landing>("land", { lane: claim.lane, generation: 1 }, { lease: 1, head });
    await tick(room, 3);
    expect(((await room.admin.read({ q: "op", op: l.op.id as never })) as { state: string }).state).toBe("landed");
    await room.admin.ok("release", { lane: claim.lane }, { lease: 1 });
    // A second lane whose pin never completed before the repository was deleted: it can never complete now.
    const other = await room.admin.ok<Claim>("claim", null, { goal: "other", scope: ["docs/**"] });
    const otherHead = pushChange(room, other.lane, { "docs/a.md": "a" });
    room.world.artifacts.failRemote("pinRef", ...Array.from({ length: 50 }, () => new Error("Artifacts is unavailable (pinRef)")));
    await room.admin.ok("propose", { lane: other.lane }, { lease: 1, expectedGeneration: 0, head: otherHead, summary: "a" });
    await room.admin.ok("release", { lane: other.lane }, { lease: 1 });
    await tick(room, 2);
    // A push that applied, but whose answer and read-back were lost: the cohort's outcome is unknown.
    room.world.log.faults.lostPushReply = 1;
    room.world.log.faults.lostReadReply = 1;
    expect((await failure(room.stub.publishLog())).code).toBe("unavailable");
    const kept = await inDO(room, (r) => ({
      cohort: r.core.pendingPublication(),
      owed: r.core.landing.core.tokenCleanup().map((t) => ({ op: t.op, n: t.n })),
      pins: r.core.sql.all("SELECT ref, done FROM pins WHERE done = 0"),
    }));
    expect(kept.cohort).not.toBeNull();
    expect(kept.owed).toHaveLength(1);
    expect(kept.pins).toHaveLength(1);
    room.world.artifacts.recover();
    // The log ref as the lost push left it (read before the deletion: the fake makes the repository again when read).
    const ref = room.world.log.ref;
    // The smoke cleanup: the fork, then the canonical repository.
    const a = room.world.artifacts;
    await a.binding.delete(forkName(a.canonical, claim.lane));
    expect(await a.binding.delete(a.canonical)).toBe(true);
    return { room, kept, claim, ref };
  }

  const stalled = async (room: TestRoom) =>
    ((await room.admin.read({ q: "attention", all: true } as never)) as { items: AttentionItem[] }).items.filter((i) => i.why === "log-publication-stalled");

  it("stops rescheduling work that cannot succeed, surfaces exactly one admin item, and keeps the unknown cohort and the owed revocation", async () => {
    const { room, kept } = await deletedRoom();
    const w = await spy(room);
    const start = clock.now;
    const ran = await alarmsUntil(room, start + 2 * hour);
    await stillSpied(room, w);
    // A few runs (lane B's owed revocation on its own backoff, until the publication's retry finds the repository
    // gone), then no alarm at all: nothing like the 720 an hour the spike saw.
    expect(ran.length).toBeLessThanOrEqual(6);
    expect(ran.every((t) => t - start <= 10 * minute)).toBe(true);
    expect(await inDO(room, (r) => r.core.nextAlarm())).toBeNull();

    // Exactly one admin item, open, naming the repository.
    const items = await stalled(room);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ why: "log-publication-stalled", reason: "repository-gone", open: true });
    expect((items[0] as { detail: string }).detail).toContain("NOT_FOUND");

    // Nothing settled or dropped: the same cohort is pending, the owed revocation is still owed.
    const now = await inDO(room, (r) => ({
      cohort: r.core.pendingPublication(),
      owed: r.core.landing.core.tokenCleanup().map((t) => ({ op: t.op, n: t.n })),
      pins: r.core.sql.all("SELECT ref, done FROM pins WHERE done = 0"),
    }));
    expect(now).toEqual(kept);

    // Two more idle hours: nothing written, no alarm.
    const rows = w.rows;
    const alarms = w.alarms;
    expect(await alarmsUntil(room, clock.now + 2 * hour)).toEqual([]);
    for (let i = 0; i < 30; i++) {
      advance(minute);
      await inDO(room, (r) => r.alarm());
    }
    expect({ rows: w.rows - rows, alarms: w.alarms - alarms }).toEqual({ rows: 0, alarms: 0 });
  });

  it("a later act tries once more, still with one admin item; a forced publication also tries; neither reschedules", async () => {
    const { room, claim } = await deletedRoom();
    await alarmsUntil(room, clock.now + hour);
    expect(await stalled(room)).toHaveLength(1);
    // A note is a real entry: it makes the log due once, after a minute.
    const notes = (await entries(room)).filter((e) => kindOf(e) === "note").length;
    await room.admin.ok<Note>("note", { act: claim.id }, { text: "still here" });
    expect((await entries(room)).filter((e) => kindOf(e) === "note").length).toBe(notes + 1);
    const ran = await alarmsUntil(room, clock.now + hour);
    expect(ran.length).toBe(1);
    expect(await stalled(room)).toHaveLength(1);
    expect(await inDO(room, (r) => r.core.nextAlarm())).toBeNull();
    // An operator's forced publication tries, fails, and schedules nothing.
    expect((await failure(room.stub.publishLog())).code).toBe("unavailable");
    expect(await inDO(room, (r) => r.core.nextAlarm())).toBeNull();
    expect(await stalled(room)).toHaveLength(1);
  });

  it("if the repository comes back, a forced publication confirms the kept cohort, the admin item closes, and landing is scheduled again", async () => {
    const { room, kept, ref } = await deletedRoom();
    await alarmsUntil(room, clock.now + hour);
    // The repository is restored, at the same name, with the log ref the lost push wrote.
    room.world.log.ref = ref;
    const p = await call<{ through: number; commit: Sha } | null>(room.stub.publishLog());
    expect(p?.through).toBe(kept.cohort!.through);
    const items = await stalled(room);
    expect(items).toHaveLength(1);
    expect(items[0]!.open).toBe(false);
    expect(await inDO(room, (r) => r.core.canonicalGone())).toBeNull();
    // The owed revocation is due again (lane B's own backoff), so the alarm is set.
    expect(await inDO(room, (r) => r.core.nextAlarm())).not.toBeNull();
  });
});

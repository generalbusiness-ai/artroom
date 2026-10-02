/**
 * Mint lane C (request 5ff58c9a): the other canonical mint sites through the
 * Room's mint ledger. Durable Object controls from
 * notes/2026-10-02-canonical-mint-ownership.md, "Lane C", tests 1, 2, 4 and
 * 5, under protocol section 32 (R-MINT-1 to R-MINT-7) and R-EXEC-9.
 *
 * Real Room objects, Durable Object SQLite and stored alarms. Alarms run
 * only through `runDurableObjectAlarm`. The room clock runs a week ahead of
 * real time, with no test alarm delay, so a stored alarm is the Room's own
 * time and never fires by itself during a test. Test hooks are set on one
 * Room object, or on the fake Artifacts repository of one test's world;
 * no process global is swapped beyond the suite's existing clock and alarm
 * delay, which each test restores.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { Check, CheckerConfig, CheckJob, Claim, Landing, OpId, Proposal, Refusal, Result } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import { setAlarmDelay, type Room } from "../../src/index.ts";
import { artifactsErrors, type FakeRepo } from "../../src/memory/artifacts.ts";
import { addMember, Client, clock, day, makeRoom, pushChange, type TestRoom } from "./support.ts";

type State = DurableObjectState;
const inDO = <T>(r: TestRoom, fn: (room: Room, state: State) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const alarm = (r: TestRoom) => runDurableObjectAlarm(r.stub as unknown as DurableObjectStub<Room>);
const stored = (r: TestRoom) => inDO(r, (_room, state) => state.storage.getAlarm());
const records = (r: TestRoom) => inDO(r, (room) => room.core.mints.duties({ limit: 1000 }));
const jobTokens = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT token_id, expires_at, next_ms, last_error FROM job_tokens ORDER BY token_id"));
const jobsOf = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT state, attempt, next_ms, token FROM check_jobs ORDER BY rowid"));
const settle = (r: TestRoom) =>
  inDO(r, async (room) => {
    await room.core.idle();
    await room.core.mints.idle();
  });
const R = `sha256:${"0".repeat(64)}` as const;
const whole: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R };
const scoped: CheckerConfig = { format: "artroom-checker-v1", inputs: ["src/**"], volatile: false, timeoutSeconds: 60, runner: R };
const refusal: Refusal = { refused: true, rule: "check-binding", reason: "refused by the test service", fix: "none" };
const tokenOf = (job: CheckJob) => /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;

/** Run with the room clock a week ahead of real time and no alarm delay; restore the delay after. */
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

/** Claim a lane on `scope`, push to its fork and propose; pins run. */
async function proposed(r: TestRoom, scope: string, files: Record<string, string>) {
  const { lane } = await r.admin.ok<Claim>("claim", null, { goal: "a lane", scope: [scope] });
  const head = pushChange(r, lane, files);
  await r.admin.ok("propose", { lane }, { lease: 1, expectedGeneration: 0, head, summary: "a lane" });
  await inDO(r, (room) => room.core.idle());
  return { lane, head };
}

/** A room whose proposal owes one check job of `cfg`, refused by the service; the jobs step is the test's to run. */
async function jobRoom(cfg: CheckerConfig) {
  const r = await makeRoom({
    policy: policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" })),
    files: { ".artroom/checkers/unit.json": JSON.stringify(cfg), "package.json": "{}" },
  });
  await quiet(r);
  const alice = await addMember(r, "@alice", "member");
  await addMember(r, "@ci", "checker");
  // The service records each job, what its token could read, and the Room's job token rows when it arrived; it refuses.
  const seen: { job: CheckJob; now: number; reads: boolean; rows: Record<string, unknown>[] }[] = [];
  await inDO(r, (room) => {
    r.world.checkers["unit"] = {
      async handle(job): Promise<Result<Check>> {
        const rows = room.core.sql.all("SELECT token_id, expires_at, next_ms, last_error FROM job_tokens ORDER BY token_id");
        seen.push({ job, now: clock.now, reads: r.world.artifacts.canonicalRepo().admits(tokenOf(job), "read"), rows });
        return refusal;
      },
    };
  });
  const c = await alice.ok<Claim>("claim", null, { goal: "work", scope: ["src/**"] });
  const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
  await alice.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
  await inDO(r, (room) => room.core.idle());
  expect(await jobsOf(r)).toMatchObject([{ state: "owed", attempt: 0 }]);
  const jobs = () =>
    inDO(r, async (room) => {
      await room.core.steps.jobs();
      await room.core.idle();
    });
  return { r, seen, jobs };
}

/** One canonical mint site: how to make a room ready to call it, and the ledger purpose of its token. */
interface Site {
  readonly name: string;
  readonly purpose: RegExp;
  /** Whether the token is claimed into `job_tokens` (a check job), rather than released by the ledger. */
  readonly claimed?: boolean;
  readonly prepare: () => Promise<{ readonly r: TestRoom; readonly run: () => Promise<unknown> }>;
}

const SITES: readonly Site[] = [
  {
    name: "integrate (the landing's staging)",
    purpose: /^integrate:/,
    prepare: async () => {
      const r = await makeRoom();
      await quiet(r);
      const { lane, head } = await proposed(r, "docs/a/**", { "docs/a/one.md": "one" });
      const l = await r.admin.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
      return { r, run: () => inDO(r, (room) => room.core.landing.prepare(l.op.id as OpId)) };
    },
  },
  {
    name: "pinObjects (the canonical half)",
    purpose: /^pin-objects:/,
    prepare: async () => {
      const r = await makeRoom();
      await quiet(r);
      const { lane } = await r.admin.ok<Claim>("claim", null, { goal: "a lane", scope: ["docs/b/**"] });
      const head = pushChange(r, lane, { "docs/b/two.md": "two" });
      return { r, run: () => inDO(r, (room) => room.core.ports.artifacts.pinObjects(lane, head)) };
    },
  },
  {
    name: "pinRef",
    purpose: /^pin-ref:/,
    prepare: async () => {
      const r = await makeRoom();
      await quiet(r);
      const { lane } = await r.admin.ok<Claim>("claim", null, { goal: "a lane", scope: ["docs/c/**"] });
      const head = pushChange(r, lane, { "docs/c/three.md": "three" });
      await inDO(r, (room) => room.core.ports.artifacts.pinObjects(lane, head));
      return { r, run: () => inDO(r, (room) => room.core.ports.artifacts.pinRef(lane, 1, head)) };
    },
  },
  {
    name: "preview (a merge in the sandbox)",
    purpose: /^preview:/,
    prepare: async () => {
      const r = await makeRoom();
      await quiet(r);
      const { lane, head } = await proposed(r, "docs/d/**", { "docs/d/four.md": "four" });
      // A main the lane is not based on: the preview needs the sandbox's merge.
      const a = r.world.artifacts;
      const moved = a.commit(a.main!, { "README.md": "# moved\n" });
      for (const o of a.closure(moved)) a.canonicalRepo().objects.add(o);
      return { r, run: () => inDO(r, (room) => room.core.ports.artifacts.preview(lane, 1, head, moved)) };
    },
  },
  {
    name: "the log remote's readRef",
    purpose: /^log-read:/,
    prepare: async () => {
      const r = await makeRoom();
      await quiet(r);
      await r.admin.ok<Claim>("claim", null, { goal: "a lane", scope: ["docs/e/**"] });
      // Reopened from the ref: the publisher reads it first.
      await inDO(r, (room) => void ((room.core as unknown as { publisherCache: unknown }).publisherCache = null));
      return { r, run: () => inDO(r, (room) => room.core.publish(true).catch(() => null)) };
    },
  },
  {
    name: "the log remote's push",
    purpose: /^log-push:/,
    prepare: async () => {
      const r = await makeRoom();
      await quiet(r);
      await r.admin.ok<Claim>("claim", null, { goal: "a lane", scope: ["docs/f/**"] });
      return { r, run: () => inDO(r, (room) => room.core.publish(true).catch(() => null)) };
    },
  },
  {
    name: "snapshot preparation's canonical read",
    purpose: /^snapshot:/,
    prepare: async () => {
      const { r, jobs } = await jobRoom(scoped);
      return { r, run: jobs };
    },
  },
  {
    name: "a whole-tree check job",
    purpose: /^job:/,
    claimed: true,
    prepare: async () => {
      const { r, jobs } = await jobRoom(whole);
      return { r, run: jobs };
    },
  },
];

type Repo = FakeRepo & { createToken: FakeRepo["createToken"]; revokeToken: FakeRepo["revokeToken"] };

/**
 * Lose the answer of the first create sent for a ledger record whose purpose
 * matches: Artifacts applies it, and the answer never reaches the Room.
 */
async function loseAnswer(r: TestRoom, purpose: RegExp) {
  const repo = r.world.artifacts.canonicalRepo() as Repo;
  const real = repo.createToken.bind(repo);
  const lost = { id: null as string | null, restore: () => void (repo.createToken = real) };
  await inDO(r, (room) => {
    repo.createToken = async (scope, ttl) => {
      const sending = room.core.mints.duties({ limit: 1000 }).records.filter((x) => x.state === "sent").at(-1);
      const t = await real(scope, ttl);
      if (lost.id === null && sending && purpose.test(sending.purpose)) {
        lost.id = t.id;
        throw artifactsErrors.transport();
      }
      return t;
    };
  });
  return lost;
}

/** Fail the first revocation of a token the site's record owns (its ledger record, or a check job's `job_tokens` row). */
async function failRevocation(r: TestRoom, site: Site) {
  const repo = r.world.artifacts.canonicalRepo() as Repo;
  const real = repo.revokeToken.bind(repo);
  const failed = { id: null as string | null, asked: [] as string[], restore: () => void (repo.revokeToken = real) };
  await inDO(r, (room) => {
    repo.revokeToken = async (id) => {
      failed.asked.push(id);
      const owned = site.claimed
        ? room.core.sql.all("SELECT 1 AS x FROM job_tokens WHERE token_id = ?", id).length > 0
        : room.core.mints.duties({ limit: 1000 }).records.some((x) => x.tokenId === id && site.purpose.test(x.purpose));
      if (failed.id === null && owned) {
        failed.id = id;
        throw artifactsErrors.internal();
      }
      return real(id);
    };
  });
  return failed;
}

/** Record every revocation the canonical repository is asked for, from now on. */
function revocations(r: TestRoom) {
  const repo = r.world.artifacts.canonicalRepo() as Repo;
  const real = repo.revokeToken.bind(repo);
  const asked: string[] = [];
  repo.revokeToken = async (id) => {
    asked.push(id);
    return real(id);
  };
  return { asked, restore: () => void (repo.revokeToken = real) };
}

const token = (r: TestRoom, id: string) => r.world.artifacts.canonicalRepo().tokens.get(id)!;

describe("mint lane C (1): a lost answer at each canonical site leaves an unknown record, kept across a restart and two alarms; nothing outside the Room's records is revoked", () => {
  for (const site of SITES)
    it(site.name, () =>
      ahead(async () => {
        const { r: before, run } = await site.prepare();
        const asked = revocations(before);
        try {
          const lost = await loseAnswer(before, site.purpose);
          try {
            await run().catch(() => undefined); // the site's own call may fail: its answer was lost
            await settle(before);
          } finally {
            lost.restore();
          }
          expect(lost.id, "the site's create was sent and its answer lost").not.toBeNull();
          const mine = (await records(before)).records.filter((x) => site.purpose.test(x.purpose));
          expect(mine.map((x) => [x.state, x.tokenId])).toEqual([["unknown", null]]);
          const id = mine[0]!.id;
          // Restart, then two alarms, past the token's lifetime: the record is kept, never settled.
          const r = await restarted(before);
          // The fresh object schedules the overdue observation 1 s ahead, with no request (approval obligation 2) …
          const fresh = await inDO(r, async (room, state) => ({ due: room.core.mints.nextDue(), alarm: await state.storage.getAlarm(), now: clock.now }));
          expect(fresh.due).toBe(fresh.now + 1_000);
          expect(fresh.alarm!).toBeLessThanOrEqual(fresh.due!);
          for (let i = 0; i < 2; i++) {
            clock.now = Math.max(clock.now + 61_000, (await stored(r)) ?? 0);
            expect(await alarm(r)).toBe(true);
            await settle(r);
            // … and after each observation, the next one, still in the future, on time: never postponed by the 1 s step.
            const next = await inDO(r, async (room, state) => ({ due: room.core.mints.nextDue(), at: room.core.mints.duties().observation.nextAt, alarm: await state.storage.getAlarm() }));
            expect(next.due).toBe(next.at);
            expect(next.alarm!).toBeLessThanOrEqual(next.due!);
          }
          const after = await records(r);
          expect(after.records.filter((x) => x.id === id).map((x) => [x.state, x.purpose])).toEqual([["unknown", mine[0]!.purpose]]);
          expect(after.observation.at).not.toBeNull(); // observed, and still kept
          // The applied token is outside every record: never asked to be revoked.
          expect(asked.asked).not.toContain(lost.id);
          expect(token(r, lost.id!).revoked).toBe(false);
        } finally {
          asked.restore();
        }
      }),
    );
});

describe("mint lane C (2): a failed revocation at each canonical site is owed, and revoked by its ID at a later alarm", () => {
  for (const site of SITES)
    it(site.name, () =>
      ahead(async () => {
        const { r, run } = await site.prepare();
        const failed = await failRevocation(r, site);
        try {
          await run();
          await settle(r);
          expect(failed.id, "the site's token was revoked and the revocation failed").not.toBeNull();
          const id = failed.id!;
          expect(token(r, id).revoked).toBe(false);
          // The debt is kept, with safe metadata only: the ledger's owed record, or the check job's token row.
          if (site.claimed) {
            expect(await jobTokens(r)).toEqual([expect.objectContaining({ token_id: id, last_error: "revocation failed: an error of another kind INTERNAL_ERROR (10400)" })]);
          } else {
            const owed = (await records(r)).records.filter((x) => x.tokenId === id);
            expect(owed).toEqual([expect.objectContaining({ state: "owed", lastError: "revocation failed: an error of another kind INTERNAL_ERROR (10400)" })]);
            expect(site.purpose.test(owed[0]!.purpose)).toBe(true);
          }
          // A later alarm revokes it by its ID, and the record ends.
          for (let i = 0; i < 6 && !token(r, id).revoked; i++) {
            clock.now = Math.max(clock.now + 1_000, (await stored(r)) ?? 0);
            expect(await alarm(r)).toBe(true);
            await settle(r);
          }
          expect(token(r, id).revoked).toBe(true);
          expect(failed.asked.filter((x) => x === id)).toHaveLength(2);
          expect((await records(r)).records.filter((x) => x.tokenId === id)).toEqual([]);
          expect((await jobTokens(r)).filter((x) => x["token_id"] === id)).toEqual([]);
        } finally {
          failed.restore();
        }
      }),
    );
});

// ------------------------------------------------------------------ (3) a stored room's mint rows

describe("mint lane C (3): a stored room's open `mint:` rows move into the ledger as unknown records, once", () => {
  it("each open mint row becomes one unknown ledger record at the object's start, none is lost, other job token rows stay, and a later start moves nothing", () =>
    ahead(async () => {
      const before = await makeRoom();
      const d1 = clock.now + 360_000;
      const d2 = clock.now + 720_000;
      // As a room stored before mint lane C: a lost answer's record, a record in flight when the host stopped, a held
      // job token, and no meta key yet.
      await inDO(before, (room) => {
        room.core.sql.all("DELETE FROM meta WHERE k = 'job_mints_moved'");
        room.core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, attempts, last_error) VALUES ('mint:job_aaa_1', ?, ?, 3, 'outcome unknown; 0 live token(s)')", d1, clock.now + 60_000);
        room.core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES ('mint:job_bbb_2', ?, ?, 'minting')", d2, d2);
        room.core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES ('tok_held', ?, ?, 'held')", d1, d1);
      });
      expect((await records(before)).records).toEqual([]);
      const r = await restarted(before);
      const moved = await records(r);
      expect(moved.records.map((x) => [x.purpose, x.state, x.scope, x.notAfter, x.tokenId])).toEqual([
        ["job:job_aaa_1", "unknown", "read", d1, null],
        ["job:job_bbb_2", "unknown", "read", d2, null],
      ]);
      expect([moved.unknown, moved.owed]).toEqual([2, 0]);
      expect((await jobTokens(r)).map((x) => x["token_id"])).toEqual(["tok_held"]);
      // Scheduled with no request: the observation of the unknown records is due.
      expect(await inDO(r, (room) => room.core.mints.nextDue())).toBe(clock.now + 1_000);
      expect((await stored(r))!).toBeLessThanOrEqual(clock.now + 1_000);
      // Once: a row only the earlier code could write is not moved by a later start, and nothing is moved twice.
      await inDO(r, (room) => room.core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES ('mint:job_ccc_1', ?, ?, 'minting')", d1, d1));
      const again = await restarted(r);
      expect((await records(again)).records.map((x) => x.purpose)).toEqual(["job:job_aaa_1", "job:job_bbb_2"]);
      expect((await jobTokens(again)).map((x) => x["token_id"])).toEqual(["mint:job_ccc_1", "tok_held"]);
      // The moved records are kept like any unknown record: observed, never settled.
      clock.now = Math.max(d2, clock.now) + 1;
      expect(await alarm(again)).toBe(true);
      await settle(again);
      expect((await records(again)).records.map((x) => x.state)).toEqual(["unknown", "unknown"]);
    }));
});

// ------------------------------------------------------------------ (4) a check job's deadline

interface MintSeen {
  t0: number;
  wakes: number[];
  record: null | { ttlSeconds: number | null; notAfter: number | null; sentAt: number };
  deadline: number;
}

/**
 * A whole-tree job room whose jobs step the test runs, with the ledger's
 * first wake-up taking 20 s of room time (no alarm stored, and the Room's own
 * scheduling off on this object, so the wake stores one). The hooks run
 * inside the fake's `createToken` for the job's canonical read create:
 * `sent` before Artifacts applies it, `answered` after it has applied and
 * before its answer leaves, and `answer` may change what the answer says.
 * `mint` holds the job's deadline and the ledger's `sent` record as it was
 * when the create was sent.
 */
async function deadlineRoom(hooks: { sent?: (deadline: number) => void; answered?: (deadline: number) => void; answer?: (deadline: number) => { expiresAt: string } } = {}) {
  const { r, seen: jobsSent, jobs } = await jobRoom(whole);
  const a = r.world.artifacts;
  const mint: MintSeen = { t0: 0, wakes: [], record: null, deadline: 0 };
  let answered = false;
  await inDO(r, async (rm, state) => {
    await state.storage.deleteAlarm();
    const o = rm as unknown as { schedule: () => void; storeAlarm: (when: number) => Promise<void> };
    o.schedule = () => {};
    const store = o.storeAlarm.bind(rm);
    o.storeAlarm = async (when) => {
      if (mint.wakes.length === 0) clock.now += 20_000; // the ledger's wake-up takes 20 s of room time
      mint.wakes.push(when);
      return store(when);
    };
    a.holdToken = (repo, scope) => {
      if (repo === a.canonical && scope === "read" && mint.record === null) {
        const rec = rm.core.mints.duties().records.find((x) => x.state === "sent" && x.purpose.startsWith("job:"))!;
        mint.record = { ttlSeconds: rec.ttlSeconds, notAfter: rec.notAfter, sentAt: rec.sentAt };
        mint.deadline = rm.core.sql.all("SELECT next_ms FROM check_jobs")[0]!["next_ms"] as number;
        hooks.sent?.(mint.deadline);
      }
      return false;
    };
    a.holdTokenReply = (repo, scope) => {
      if (repo === a.canonical && scope === "read" && mint.record !== null && !answered) {
        answered = true;
        hooks.answered?.(mint.deadline);
      }
      return false;
    };
    if (hooks.answer) {
      const repo = a.canonicalRepo() as Repo;
      const real = repo.createToken.bind(repo);
      repo.createToken = async (scope, ttl) => {
        const t = await real(scope, ttl);
        return scope === "read" ? { ...t, ...hooks.answer!(mint.deadline) } : t;
      };
    }
  });
  mint.t0 = clock.now;
  const run = async () => {
    try {
      await jobs();
    } finally {
      a.holdToken = null;
      a.holdTokenReply = null;
    }
  };
  return { r, jobsSent, mint, run };
}

/**
 * The lifetime asked and the bound, as the ledger's record held them when the
 * create was sent: the deadline as `notAfter`, and a lifetime computed after
 * the 20 s wake-up, ending 5 s before the deadline.
 */
function expectAskedAfterTheWake(mint: MintSeen) {
  expect(mint.deadline).toBe(mint.t0 + (whole.timeoutSeconds + 300) * 1000);
  expect(mint.wakes[0]).toBe(mint.t0 + 60_000); // the takeover wake-up, stored before the send
  expect(mint.record).toEqual({ sentAt: mint.t0 + 20_000, notAfter: mint.deadline, ttlSeconds: Math.floor((mint.deadline - mint.t0 - 20_000) / 1000) - 5 });
}

/** The job's canonical read tokens, as Artifacts holds them. */
const readTokens = (r: TestRoom) => [...r.world.artifacts.canonicalRepo().tokens.values()].filter((t) => t.scope === "read");

describe("mint lane C (4): a check job's deadline, through issue and the production ledger", () => {
  it("wake delay: the wake-up takes 20 s of room time; the lifetime is asked after it, so the token's expiry is by the deadline, and the job is sent", () =>
    ahead(async () => {
      const { r, jobsSent, mint, run } = await deadlineRoom();
      await run();
      expectAskedAfterTheWake(mint);
      expect(jobsSent).toHaveLength(1);
      expect(jobsSent[0]!.reads).toBe(true);
      const [t] = readTokens(r);
      expect(t!.expiresAt).toBe(mint.deadline - 5_000);
      expect(Date.parse(jobsSent[0]!.job.deadline)).toBe(mint.deadline);
      // Claimed: the ledger's record is gone, and while the job ran its token row held the handoff metadata.
      expect((await records(r)).records).toEqual([]);
      expect(jobsSent[0]!.rows).toEqual([{ token_id: t!.id, expires_at: t!.expiresAt, next_ms: t!.expiresAt, last_error: "held" }]);
    }));

  it("create delay: the create applies 20 s after it is sent and answers at once; its expiry passes the generic check but is after the deadline: no caller gets it, its ID is owed and revoked, and no job is sent", () =>
    ahead(async () => {
      const { r, jobsSent, mint, run } = await deadlineRoom({ sent: () => void (clock.now += 20_000) });
      await run();
      expectAskedAfterTheWake(mint);
      expect(jobsSent).toEqual([]);
      const [t] = readTokens(r);
      expect(t!.expiresAt).toBe(mint.deadline + 15_000);
      expect(t!.expiresAt - (mint.t0 + 40_000)).toBe(mint.record!.ttlSeconds! * 1000); // the generic check passes
      expect(await jobTokens(r)).toEqual([]);
      expect((await records(r)).records).toEqual([expect.objectContaining({ state: "owed", tokenId: t!.id, lastError: "an expiry after notAfter" })]);
      expect(await jobsOf(r)).toMatchObject([{ state: "owed", attempt: 1, token: null }]);
      // Revoked by its ID at the next pass, and the record ends.
      expect(t!.revoked).toBe(false);
      await inDO(r, async (room) => {
        await room.core.steps.mints();
        await room.core.mints.idle();
      });
      expect(t!.revoked).toBe(true);
      expect((await records(r)).records).toEqual([]);
    }));

  it("answer delay: the create applies at once and its answer is held 20 s; the expiry is by the deadline, so the token is claimed and the job sent", () =>
    ahead(async () => {
      const { r, jobsSent, mint, run } = await deadlineRoom({ answered: () => void (clock.now += 20_000) });
      await run();
      expectAskedAfterTheWake(mint);
      expect(jobsSent).toHaveLength(1);
      expect(jobsSent[0]!.now).toBe(mint.t0 + 40_000);
      const [t] = readTokens(r);
      expect(t!.expiresAt).toBe(mint.deadline - 5_000);
      expect((await records(r)).records).toEqual([]);
      expect(jobsSent[0]!.rows).toEqual([expect.objectContaining({ token_id: t!.id, expires_at: t!.expiresAt, last_error: "held" })]);
    }));

  it("boundary: a reported expiry equal to the deadline is accepted, and the job sent; 1 ms later is owed and never given out", () =>
    ahead(async () => {
      const at = await deadlineRoom({ answered: () => void (clock.now += 20_000), answer: (deadline) => ({ expiresAt: new Date(deadline).toISOString() }) });
      await at.run();
      expectAskedAfterTheWake(at.mint);
      expect(at.jobsSent).toHaveLength(1);
      expect(at.jobsSent[0]!.rows).toEqual([expect.objectContaining({ expires_at: at.mint.deadline, last_error: "held" })]);

      const after = await deadlineRoom({ answered: () => void (clock.now += 20_000), answer: (deadline) => ({ expiresAt: new Date(deadline + 1).toISOString() }) });
      await after.run();
      expectAskedAfterTheWake(after.mint);
      expect(after.jobsSent).toEqual([]);
      expect(await jobTokens(after.r)).toEqual([]);
      expect((await records(after.r)).records).toEqual([expect.objectContaining({ state: "owed", expiresAt: after.mint.deadline + 1, lastError: "an expiry after notAfter" })]);
    }));

  it("boundary: dispatch at a clock equal to the deadline sends no job and ends the token; 1 ms before it sends the job", () =>
    ahead(async () => {
      const at = await deadlineRoom({ answered: (deadline) => void (clock.now = deadline) });
      await at.run();
      expectAskedAfterTheWake(at.mint);
      expect(at.jobsSent).toEqual([]);
      expect(await jobsOf(at.r)).toMatchObject([{ state: "owed", attempt: 1, token: null }]);
      // Ended: claimed by the job, then its row settled; the token no longer reads, and no record is left.
      const [t] = readTokens(at.r);
      expect(at.r.world.artifacts.canonicalRepo().admits(t!.plaintext, "read")).toBe(false);
      expect(await jobTokens(at.r)).toEqual([]);
      expect((await records(at.r)).records).toEqual([]);

      const before = await deadlineRoom({ answered: (deadline) => void (clock.now = deadline - 1) });
      await before.run();
      expectAskedAfterTheWake(before.mint);
      expect(before.jobsSent).toHaveLength(1);
      expect(before.jobsSent[0]!.now).toBe(before.mint.deadline - 1);
    }));
});

// ------------------------------------------------------------------ (5) settlement at a known expiry

describe("mint lane C (5): settlement at a known expiry", () => {
  it("a job_tokens row whose revocation fails settles once its known expiry passes, with no revocation recorded; a job's ledger record with no readable expiry is never settled by time", () =>
    ahead(async () => {
      // A job sent with its token; every revocation fails.
      const { r, seen, jobs } = await jobRoom(whole);
      const a = r.world.artifacts;
      for (let i = 0; i < 400; i++) a.failRemote("revokeToken", artifactsErrors.internal());
      await jobs();
      expect(seen).toHaveLength(1);
      const t = readTokens(r).find((x) => x.plaintext === tokenOf(seen[0]!.job))!;
      expect(await jobTokens(r)).toEqual([expect.objectContaining({ token_id: t.id, expires_at: t.expiresAt, last_error: "revocation failed: an error of another kind INTERNAL_ERROR (10400)" })]);
      const asked = revocations(r);
      try {
        // Retried while it can read; settled once its expiry passes, with no further revocation.
        for (let i = 0; i < 40 && (await jobTokens(r)).length > 0; i++) {
          const due = (await jobTokens(r))[0]!["next_ms"] as number;
          clock.now = Math.max(clock.now + 1_000, due);
          await inDO(r, (room) => room.core.steps.jobs());
        }
        expect(await jobTokens(r)).toEqual([]);
        expect(t.revoked).toBe(false);
        expect(asked.asked.length).toBeGreaterThan(0);
        expect(clock.now).toBeGreaterThanOrEqual(t.expiresAt);
        const tried = asked.asked.length;
        clock.now += 600_000;
        await inDO(r, (room) => room.core.steps.jobs());
        expect(asked.asked).toHaveLength(tried);
      } finally {
        asked.restore();
      }

      // The next attempt's create answers with no readable expiry: the ledger owes it, with no expiry, and never settles it by time.
      const repo = a.canonicalRepo() as Repo;
      const real = repo.createToken.bind(repo);
      repo.createToken = async (scope, ttl) => ({ ...(await real(scope, ttl)), expiresAt: "never" });
      try {
        await inDO(r, async (room) => {
          room.core.sql.all("UPDATE check_jobs SET state = 'owed', next_ms = ?", clock.now);
          await room.core.steps.jobs();
          await room.core.idle();
        });
      } finally {
        repo.createToken = real;
      }
      const [owed] = (await records(r)).records;
      expect(owed).toMatchObject({ state: "owed", expiresAt: null, purpose: expect.stringMatching(/^job:/) });
      for (let i = 0; i < 6; i++) {
        clock.now += 3 * 3600_000;
        await inDO(r, async (room) => {
          await room.core.steps.mints();
          await room.core.mints.idle();
        });
      }
      expect((await records(r)).records).toEqual([expect.objectContaining({ id: owed!.id, state: "owed", expiresAt: null })]);
      expect(token(r, owed!.tokenId!).revoked).toBe(false);
    }));
});

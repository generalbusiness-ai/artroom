/**
 * Tokens the Room mints, in the Room: the canonical mint ledger (protocol
 * section 32, R-MINT-1 to R-MINT-7; requests 78f0971c and 5ff58c9a), the
 * forks' read-token ledger (request 02836f9a), check job tokens and their
 * deadlines (R-EXEC-9), and the stored state these arrived in.
 *
 * The ledgers' own rules (what a lost answer, a late answer, a failed
 * revocation or an odd listing becomes) are shown over a fake clock and
 * store in packages/git/test/mints.test.ts and fork-tokens.test.ts. These
 * tests show what the Room adds: every mint site goes through a ledger; the
 * ledger's wake-ups are real stored alarms; a fresh object takes over and
 * schedules what it finds; each kind of work has its own backoff; and the
 * Room's own job token rows and job deadlines.
 *
 * Real Room objects, Durable Object SQLite and stored alarms. In `ahead`,
 * the room clock runs a week ahead of real time with no test alarm delay,
 * so a stored alarm is the Room's own time and never fires by itself; it
 * runs only through `alarm`. Hooks are set on one Room object, or on the
 * fake Artifacts repositories of one test's world.
 */

import { describe, expect, it } from "vitest";
import type { Check, CheckerConfig, CheckJob, Claim, LandOp, LaneId, OpId, PolicyDocument, Refusal, Result, Sha } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import { forkName } from "@generalbusiness/artroom-git";
import type { Room } from "../../src/index.ts";
import { JOB_BATCH, JOBS_DUE_SQL, JOB_TOKENS_DUE_SQL, jobTokensDue, setJobTokenWait } from "../../src/jobs.ts";
import { ROOM_SCRUB_TABLES, safeJobStatus } from "../../src/store.ts";
import { FakeArtifactsError, artifactsErrors, type FakeRepo } from "../../src/memory/artifacts.ts";
import { ahead, alarm, hold, inDO, land, proposed as proposedBy, read, restarted, settle, storedAlarm as stored, type State } from "./core-support.ts";
import { addMember, call, clock, makeRoom, pushChange, tick, until, type TestRoom } from "./support.ts";

const records = (r: TestRoom) => inDO(r, (room) => room.core.mints.duties({ limit: 1000 }));
const forkRecords = (r: TestRoom) => inDO(r, (room) => room.core.workspaces.forkTokens.duties({ limit: 1000 }));
const jobTokens = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT token_id, expires_at, next_ms, last_error FROM job_tokens ORDER BY token_id"));
const jobsOf = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT state, attempt, next_ms, token FROM check_jobs ORDER BY rowid"));
const opOf = (r: TestRoom, op: OpId) => inDO(r, (room) => room.core.landing.view(op) as LandOp | null);
const canonical = (r: TestRoom) => r.world.artifacts.canonicalRepo() as FakeRepo;
/** The canonical repository's token by ID, as Artifacts sees it. */
const token = (r: TestRoom, id: string) => canonical(r).tokens.get(id)!;
const internal = () => new FakeArtifactsError("INTERNAL_ERROR", 10400);
/** The ledger's own alarm work: revocations owed, and an observation if due. */
const mintsStep = (r: TestRoom) =>
  inDO(r, async (room) => {
    await room.core.steps.mints();
    await room.core.mints.idle();
  });

const R = `sha256:${"0".repeat(64)}` as const;
const whole: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R };
const scoped: CheckerConfig = { ...whole, inputs: ["src/**"] };
const refusal: Refusal = { refused: true, rule: "check-binding", reason: "refused by the test service", fix: "none" };
const tokenOf = (job: CheckJob) => /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;

/** The admin claims `scope`, pushes and proposes; the proposal's own work (pins, its preview) is done. */
async function proposed(r: TestRoom, scope: string, files: Record<string, string>) {
  const p = await proposedBy(r, r.admin, [scope], files);
  await inDO(r, (room) => room.core.idle());
  return p;
}

/** Land a proposed lane: the act, then the landing step in the background (no alarm is run): once to prepare, once to reserve and publish. */
async function startLanding(r: TestRoom, lane: string, head: string, beforePublish?: () => Promise<unknown>): Promise<OpId> {
  const op = (await land(r.admin, lane, head)).op.id as OpId;
  await inDO(r, (room) => room.core.run("landing"));
  await until(async () => (await opOf(r, op))?.state === "ready");
  await inDO(r, (room) => room.core.idle());
  // The integration's own staging token is behind it: what follows is the publication's.
  await beforePublish?.();
  await inDO(r, (room) => room.core.run("landing"));
  return op;
}

interface Seen {
  job: CheckJob;
  now: number;
  reads: boolean;
  rows: Record<string, unknown>[];
}

/**
 * A room whose proposal owes one check job for each checker in `checkers`,
 * refused by the service; the jobs and landing steps are the test's to run.
 * The service records each job, what its token could read, and the Room's
 * job token rows when it arrived.
 */
async function jobRoom(checkers: Record<string, CheckerConfig> = { unit: whole }) {
  const names = Object.keys(checkers);
  const base = policy(...names.map((n) => requireCheck(n, { paths: "src/**", by: "@ci", id: `${n}-tests` })));
  const r = await makeRoom({ policy: base as PolicyDocument, files: { ...Object.fromEntries(names.map((n) => [`.artroom/checkers/${n}.json`, JSON.stringify(checkers[n])])), "package.json": "{}" } });
  await hold(r, "jobs", "landing");
  const alice = await addMember(r, "@alice", "member");
  await addMember(r, "@ci", "checker");
  const seen: Seen[] = [];
  await inDO(r, (room) => {
    for (const n of names)
      r.world.checkers[n] = {
        async handle(job): Promise<Result<Check>> {
          // The rows as this object's storage has them; after the object is aborted, a fresh one calls this, and there are none to read here.
          let rows: Record<string, unknown>[] = [];
          try {
            rows = room.core.sql.all("SELECT token_id, expires_at, next_ms, last_error FROM job_tokens ORDER BY token_id");
          } catch {
            rows = [];
          }
          seen.push({ job, now: clock.now, reads: canonical(r).admits(tokenOf(job), "read"), rows });
          return refusal;
        },
      };
  });
  const { lane, head } = await proposedBy(r, alice, ["src/**"], { "src/app.ts": "v2" });
  await inDO(r, (room) => room.core.idle());
  expect(await jobsOf(r)).toMatchObject(names.map(() => ({ state: "owed", attempt: 0 })));
  const jobs = () =>
    inDO(r, async (room) => {
      await room.core.steps.jobs();
      await room.core.idle();
    });
  return { r, alice, lane, head, seen, jobs, from: canonical(r).tokens.size };
}

/** Canonical read tokens, as Artifacts holds them; with `from`, those minted since that many existed. */
const readTokens = (r: TestRoom, from = 0) => [...canonical(r).tokens.values()].slice(from).filter((t) => t.scope === "read");
/** The ledger's records of check job mints (`job:<job>`), as admins see them: never a token's text. */
const jobRecords = async (r: TestRoom) => (await records(r)).records.filter((x) => x.purpose.startsWith("job:"));
const observation = async (r: TestRoom) => (await inDO(r, (room) => room.core.mints.duties())).observation;

/** Record every revocation the repository is asked for, from now on. */
function revocations(repo: FakeRepo) {
  const real = repo.revokeToken.bind(repo);
  const asked: string[] = [];
  repo.revokeToken = async (id) => {
    asked.push(id);
    return real(id);
  };
  return asked;
}

/** `n` canonical read tokens, live for an hour, each in an ended job token row; row i is due at `t0 - n + i`. */
async function endedRows(r: TestRoom, n: number) {
  const t0 = clock.now;
  const ids = Array.from({ length: n }, () => canonical(r).mint("read", 3600).id);
  await inDO(r, (room) => {
    ids.forEach((id, i) => room.core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES (?, ?, ?, 'ended')", id, t0 + 3600_000, t0 - n + i));
  });
  return ids;
}

// ------------------------------------------------------------------ the canonical ledger, in the Room

describe("R-MINT-1: every canonical token is minted through the Room's ledger", () => {
  it("in a walk from a propose to a landing, a publication and two check jobs, each create on the canonical repository is sent under one ledger record of its site, with the site's own lifetime; afterwards no record and no live token is left", () =>
    ahead(async () => {
      const { r, alice, lane, head, seen, jobs } = await jobRoom({ unit: whole, lint: scoped });
      // What the ledger holds as `sent` at the moment Artifacts is asked for each canonical token.
      const creates: { asked: number | undefined; sent: (string | number | null)[][] }[] = [];
      await inDO(r, (room) => {
        const repo = canonical(r);
        const real = repo.createToken.bind(repo);
        repo.createToken = async (scope, ttl) => {
          creates.push({ asked: ttl, sent: room.core.mints.duties({ limit: 1000 }).records.filter((x) => x.state === "sent").map((x) => [x.purpose.split(":")[0]!, x.scope, x.ttlSeconds]) });
          return real(scope, ttl);
        };
      });
      // A second proposal: its pins (pinObjects, pinRef) and, once main has moved, its preview's merge in the sandbox.
      const a = r.world.artifacts;
      const other = await proposed(r, "docs/**", { "docs/guide.md": "more" });
      const moved = a.commit(a.main!, { "README.md": "# moved\n" });
      for (const o of a.closure(moved)) canonical(r).objects.add(o);
      await inDO(r, (room) => room.core.ports.artifacts.preview(other.lane, 1, other.head, moved));
      // The check jobs: a whole-tree job's read token, and a scoped job's snapshot read.
      await jobs();
      expect(seen.map((s) => s.reads)).toContain(true);
      // The landing: its integration, then the publication; and the log, by a publisher reopened from the ref.
      const op = (await land(alice, lane, head)).op.id as OpId;
      await inDO(r, (room) => room.core.landing.prepare(op));
      await inDO(r, (room) => room.core.publish(true));
      await inDO(r, (room) => void ((room.core as unknown as { publisherCache: unknown }).publisherCache = null));
      await r.admin.ok("note", { act: lane }, { text: "one more entry" });
      await inDO(r, (room) => room.core.publish(true));
      await settle(r);

      expect(creates.length).toBeGreaterThan(7);
      // One record in flight for each create, asking for the lifetime the record holds.
      for (const c of creates) expect(c.sent.map((s) => s[2])).toEqual([c.asked]);
      const lifetimes = Object.fromEntries(creates.map((c) => [c.sent[0]![0], [c.sent[0]![1], c.sent[0]![2]]]));
      expect(lifetimes).toEqual({
        "pin-objects": ["write", 600],
        "pin-ref": ["write", 60],
        preview: ["write", 60],
        integrate: ["write", 60],
        "log-read": ["read", 60],
        "log-push": ["write", 60],
        snapshot: ["read", 300],
        // A check job's token ends 5 s before its deadline, the checker's timeout plus 300 s after the send.
        job: ["read", whole.timeoutSeconds + 300 - 5],
      });
      expect((await records(r)).records).toEqual([]);
      expect(await jobTokens(r)).toEqual([]);
      expect(canonical(r).activeTokens()).toEqual([]);
    }));

  it("request df6ff8d3: with Artifacts' clock 67 ms ahead of the Room's, as measured live, proposes are admitted with their heads pinned, both lanes land, the log publishes, and no token is left live or owed in either ledger", async () => {
    const r = await makeRoom();
    // Token expiries and expiry states are Artifacts' own.
    (r.world.artifacts as unknown as { now: () => number }).now = () => clock.now + 67;
    const one = await proposed(r, "docs/a/**", { "docs/a/one.md": "one" });
    const two = await proposed(r, "docs/b/**", { "docs/b/two.md": "two" });
    expect(r.world.artifacts.refs.get(`refs/artroom/objects/${one.head}`)).toBe(one.head);
    const la = await land(r.admin, one.lane, one.head);
    await tick(r, 3);
    expect(r.world.artifacts.main).toBe(one.head);
    // The second lane is no longer a fast-forward of main: its integration is a merge the sandbox builds.
    const lb = await land(r.admin, two.lane, two.head);
    await tick(r, 3);
    expect([one.head, two.head]).not.toContain(r.world.artifacts.main);
    for (const l of [la, lb]) expect(((await read(r, { q: "op", op: l.op.id })) as LandOp).state).toBe("landed");
    expect((await call<{ through: number } | null>(r.stub.publishLog()))?.through).toBeGreaterThan(0);
    const duties = await records(r);
    expect({ records: duties.records, owed: duties.owed, unknown: duties.unknown }).toEqual({ records: [], owed: 0, unknown: 0 });
    expect((await forkRecords(r)).records).toEqual([]);
    expect(canonical(r).activeTokens()).toEqual([]);
  });
});

describe("mint lane B (request 78f0971c): the publication token through the canonical mint ledger, in the Room", () => {
  /**
   * Hold the first canonical write create that the ledger sends for a
   * publication (a `sent` record `publish:…` exists), before Artifacts applies
   * it. Other creates (an integration's, a preview's) are not held.
   * `answer()` lets it go.
   */
  async function holdLedgerCreate(r: TestRoom) {
    const a = r.world.artifacts;
    const h = { call: 0, go: false, answer: () => void (h.go = true) };
    await inDO(r, (room) => {
      a.holdToken = (repo, scope, _ttl, n) => {
        if (h.call === 0 && repo === a.canonical && scope === "write" && room.core.mints.duties().records.some((x) => x.state === "sent" && x.purpose.startsWith("publish:"))) h.call = n;
        return n === h.call && !h.go;
      };
    });
    return h;
  }

  it("R-MINT-2 no alarm stored beforehand: while the publication token's create is held, storage has an alarm no later than the takeover time, stored by the ledger's wake before the create was sent; a wake that takes 20 s of room time comes before the lifetime, which the record holds", () =>
    ahead(async () => {
      const r = await makeRoom();
      const { lane, head } = await proposed(r, "docs/a/**", { "docs/a/one.md": "one" });
      const held = await holdLedgerCreate(r);
      const asked: number[] = [];
      // Once the integration is built: nothing stored, and the Room's own scheduling switched off on this object, so
      // only a wake can store an alarm now. Storing it takes 20 s of room time.
      let t1 = 0;
      const op = await startLanding(r, lane, head, async () => {
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
        // The takeover time is moved only when less than 30 s away: the integration's is pushed past that.
        clock.now += 31_000;
        t1 = clock.now;
      });
      await until(async () => held.call > 0);
      const seen = await inDO(r, async (room, state) => ({ alarm: await state.storage.getAlarm(), d: room.core.mints.duties() }));
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
      expect(canonical(r).activeTokens()).toEqual([]);
      // The token's expiry ran from the send, after the wake: 60 s from t1 + 20 s.
      const pushed = await inDO(r, (room) => room.core.landing.core.get(op)!.pushes![0]!.tokenId!);
      expect(token(r, pushed).expiresAt).toBe(t1 + 80_000);
    }));

  it("R-MINT-5 a crash with the answer lost: the object is aborted while the create is held and the create applies late; through the alarm alone, the fresh object records it as unknown, stores a bounded alarm for the observation, observes once without counting the tokens the Room knows, and keeps the record; the publication goes on and lands once", () =>
    ahead(async () => {
      const before = await makeRoom();
      const a = before.world.artifacts;
      const { lane, head } = await proposed(before, "docs/b/**", { "docs/b/two.md": "two" });
      const held = await holdLedgerCreate(before);
      const op = await startLanding(before, lane, head);
      await until(async () => held.call > 0);
      const r = await restarted(before);
      // Artifacts applies the create late; no answer reaches the Room.
      const late = canonical(r).mint("write", 60);
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
      const after = await inDO(r, async (room, state) => ({ d: room.core.mints.duties(), due: room.core.mints.nextDue(), alarm: await state.storage.getAlarm() }));
      // Observed once: the late token is the one live token the Room cannot account for; the publication's own is known by its row.
      expect((a.remoteCalls.get("listTokens") ?? 0) - lists).toBe(1);
      expect(after.d.observation).toMatchObject({ at: fresh.now, unaccounted: 1, nextAt: fresh.now + 60_000 });
      const pushed = await inDO(r, (room) => room.core.landing.core.liveTokens(op).map((t) => t.tokenId));
      expect(pushed).toHaveLength(1);
      expect(canonical(r).activeTokens().map((t) => t.id).sort()).toEqual([late.id, pushed[0]!].sort());
      // The record is kept, never settled by the observation; the next observation's time is stored on time.
      expect(after.d.records.map((x) => x.state)).toEqual(["unknown"]);
      expect(after.due).toBe(fresh.now + 60_000);
      expect(after.alarm!).toBeLessThanOrEqual(after.due!);
      expect((await opOf(r, op))?.state).toBe("landed");
      // Past the token's lifetime, and another observation: still unknown, and the late token is never revoked.
      clock.now = after.due! + 1;
      expect(await alarm(r)).toBe(true);
      await inDO(r, (room) => room.core.idle());
      expect((await records(r)).records.map((x) => x.state)).toEqual(["unknown"]);
      expect(token(r, late.id).revoked).toBe(false);
    }));

  it("request 3da1d82b: the ledgers' steps and the job token pass are each their own kind of loop work: a failure of the step takes that kind's backoff alone; an earlier alarm for other work skips it and keeps the backoff; the next alarm waits for it; then the step runs, revokes, and clears it", () =>
    ahead(async () => {
      const r = await makeRoom();
      const { lane } = await r.admin.ok<Claim>("claim", null, { goal: "a lane", scope: ["docs/**"] });
      pushChange(r, lane as LaneId, { "docs/one.md": "one" });
      const a = r.world.artifacts;
      const fork = a.repo(forkName(a.canonical, lane as LaneId)) as FakeRepo;
      // One owed revocation in each ledger, and one ended job token; the log published, so nothing else is due.
      a.failRemote("revokeToken", internal(), internal());
      const jobToken = (await endedRows(r, 1))[0]!;
      const ran = { mints: 0, forkTokens: 0, jobTokens: 0 };
      const owed = await inDO(r, async (room) => {
        const t = await room.core.mints.mint("test:owed", "read", () => 60);
        await t.release();
        const f = await room.core.workspaces.forkTokens.mint(fork.name, "test:owed", 600);
        await f.release();
        await room.core.publish(true);
        // Each step fails once, before its work begins: as a storage failure would.
        for (const ledger of [room.core.mints, room.core.workspaces.forkTokens] as const) {
          const kind = ledger === room.core.mints ? "mints" : "forkTokens";
          const real = ledger.reconcile.bind(ledger);
          (ledger as { reconcile: () => Promise<unknown> }).reconcile = async () => {
            if (++ran[kind] === 1) throw new Error("storage failed");
            return real();
          };
        }
        const sql = room.core.sql as { all: (q: string, ...b: unknown[]) => unknown[] };
        const all = sql.all;
        sql.all = (q: string, ...b: unknown[]) => {
          if (q.includes("FROM job_tokens WHERE next_ms <= ? ORDER BY next_ms") && ++ran.jobTokens === 1) throw new Error("storage failed");
          return all(q, ...b);
        };
        return { canonical: t.id, fork: f.id };
      });
      const revoked = () => [token(r, owed.canonical).revoked, fork.tokens.get(owed.fork)!.revoked, token(r, jobToken).revoked];
      clock.now += 2_000;
      await inDO(r, (room) => room.core.runAll());
      const failed = await inDO(r, (room) => ({ fences: room.core.loopBackoff(), due: room.core.mints.nextDue(), next: room.core.nextAlarm(), now: clock.now }));
      expect(ran).toEqual({ mints: 1, forkTokens: 1, jobTokens: 1 });
      const fence = { attempts: 1, next: failed.now + 5_000 };
      expect(failed.fences).toMatchObject({ mints: fence, forkTokens: fence, jobTokens: fence });
      expect(failed.due).toBe(failed.now + 1_000); // the ledger's own time is earlier …
      expect(failed.next).toBe(fence.next); // … and the alarm waits for the step's backoff
      // An alarm for other work, before the backoff ends: the steps are skipped, and their backoffs kept.
      clock.now += 1_000;
      await inDO(r, (room) => room.core.runAll());
      await settle(r);
      expect(ran).toEqual({ mints: 1, forkTokens: 1, jobTokens: 1 });
      expect(await inDO(r, (room) => room.core.loopBackoff())).toMatchObject({ mints: fence, forkTokens: fence, jobTokens: fence });
      expect(revoked()).toEqual([false, false, false]);
      // At the backoff's end they run: the revocations are made, and the backoffs cleared.
      clock.now = fence.next;
      await inDO(r, (room) => room.core.runAll());
      await settle(r);
      expect(revoked()).toEqual([true, true, true]);
      expect(await inDO(r, (room) => room.core.loopBackoff())).toEqual({});
    }));

  it("mint lane C (3): a stored room's open `mint:` job token rows move into the ledger as unknown records at the object's start, once; none is lost, other job token rows stay, and the fresh object schedules their observation with no request", () =>
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

// ------------------------------------------------------------------ the forks' ledger

describe("mint lane F (request 02836f9a): the fork's read token for pinning goes through the fork's own ledger, which the workspaces own", () => {
  it("a create whose answer is lost leaves one unknown record on the fork's ledger and none on the canonical one, kept across a restart and watched by alarms, and the applied token is never revoked; a revocation that fails is owed by its ID with safe metadata, and a later alarm revokes it by that ID; the lifetime is 600 s", () =>
    ahead(async () => {
      const before = await makeRoom();
      await hold(before, "jobs", "landing");
      const { lane } = await before.admin.ok<Claim>("claim", null, { goal: "a lane", scope: ["docs/b/**"] });
      const first = pushChange(before, lane as LaneId, { "docs/b/one.md": "one" });
      const a = before.world.artifacts;
      const fork = a.repo(forkName(a.canonical, lane as LaneId)) as FakeRepo;
      const pin = (r: TestRoom, head: Sha) => inDO(r, (room) => room.core.ports.artifacts.pinObjects(lane as LaneId, head));
      const forkRead = () => [...fork.tokens.values()].filter((t) => t.scope === "read");
      const asked = revocations(fork);
      // The fork's next read create applies, and its answer never reaches the Room.
      const create = fork.createToken.bind(fork);
      fork.createToken = async (scope, ttl) => {
        const t = await create(scope, ttl);
        if (scope !== "read") return t;
        fork.createToken = create;
        throw artifactsErrors.transport();
      };
      await expect(pin(before, first)).rejects.toThrow();
      await settle(before);
      const [lost] = forkRead();
      const d = await forkRecords(before);
      expect(d.records.map((x) => [x.fork, x.purpose, x.state, x.tokenId, x.ttlSeconds])).toEqual([[fork.name, `pin-objects:${first}`, "unknown", null, 600]]);
      expect((await records(before)).records).toEqual([]);
      // Restart: the fresh object schedules the overdue observation 1 s ahead, with no request.
      const r = await restarted(before);
      const fresh = await inDO(r, async (room, state) => ({ due: room.core.workspaces.forkTokens.nextDue(), alarm: await state.storage.getAlarm(), now: clock.now }));
      expect(fresh.due).toBe(fresh.now + 1_000);
      expect(fresh.alarm!).toBeLessThanOrEqual(fresh.due!);
      clock.now = Math.max(clock.now + 601_000, (await stored(r)) ?? 0);
      expect(await alarm(r)).toBe(true);
      await settle(r);
      // The lost token has expired by now: watched, never settled.
      expect(await inDO(r, (room) => room.core.workspaces.forkTokens.watch(fork.name))).toMatchObject({ unknown: 1, unaccounted: 0 });

      // A second pin, whose token's revocation fails once.
      let failedId: string | null = null;
      const revoke = fork.revokeToken.bind(fork);
      fork.revokeToken = async (id) => {
        if (failedId !== null) return revoke(id);
        failedId = id;
        throw internal();
      };
      await hold(r, "jobs", "landing");
      await pin(r, pushChange(r, lane as LaneId, { "docs/b/two.md": "two" }));
      await settle(r);
      const t = fork.tokens.get(failedId!)!;
      expect([t.scope, t.expiresAt - t.createdAt, t.revoked]).toEqual(["read", 600_000, false]);
      expect((await forkRecords(r)).records.filter((x) => x.state !== "unknown")).toEqual([
        expect.objectContaining({ fork: fork.name, state: "owed", tokenId: failedId, lastError: "revocation failed: an error of another kind INTERNAL_ERROR (10400)" }),
      ]);
      for (let i = 0; i < 6 && !t.revoked; i++) {
        clock.now = Math.max(clock.now + 1_000, (await stored(r)) ?? 0);
        expect(await alarm(r)).toBe(true);
        await settle(r);
      }
      expect(t.revoked).toBe(true);
      expect((await forkRecords(r)).records.map((x) => x.state)).toEqual(["unknown"]);
      expect(asked).not.toContain(lost!.id);
      expect(lost!.revoked).toBe(false);
    }));
});

// ------------------------------------------------------------------ check job tokens

describe("R-EXEC-9, mint lane C (4): a check job's deadline, through issue and the production ledger", () => {
  interface MintSeen {
    t0: number;
    wakes: number[];
    record: null | { ttlSeconds: number | null; notAfter: number | null; sentAt: number };
    deadline: number;
  }

  /**
   * A whole-tree job room whose jobs step the test runs, with the ledger's
   * first wake-up taking 20 s of room time (no alarm stored, and the Room's own
   * scheduling off on this object, so the wake stores one). `answered` runs
   * inside the fake's `createToken` after the job's canonical read create has
   * applied and before its answer leaves, and `answer` may change what the
   * answer says. `mint` holds the job's deadline and the ledger's `sent`
   * record as it was when the create was sent.
   */
  async function deadlineRoom(hooks: { answered?: (deadline: number) => void; answer?: (deadline: number) => { expiresAt: string } } = {}) {
    const { r, seen, jobs } = await jobRoom();
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
        const repo = canonical(r);
        const real = repo.createToken.bind(repo);
        repo.createToken = async (scope, ttl) => {
          const t = await real(scope, ttl);
          return scope === "read" ? { ...t, ...hooks.answer!(mint.deadline) } : t;
        };
      }
    });
    mint.t0 = clock.now;
    try {
      await jobs();
    } finally {
      a.holdToken = null;
      a.holdTokenReply = null;
    }
    // The lifetime asked and the bound, as the ledger's record held them when the create was sent: the deadline as
    // `notAfter`, and a lifetime computed after the 20 s wake-up, ending 5 s before the deadline.
    expect(mint.deadline).toBe(mint.t0 + (whole.timeoutSeconds + 300) * 1000);
    expect(mint.wakes[0]).toBe(mint.t0 + 60_000); // the takeover wake-up, stored before the send
    expect(mint.record).toEqual({ sentAt: mint.t0 + 20_000, notAfter: mint.deadline, ttlSeconds: Math.floor((mint.deadline - mint.t0 - 20_000) / 1000) - 5 });
    return { r, seen, mint };
  }

  it("the lifetime is asked after a 20 s wake-up, to end 5 s before the deadline. A reported expiry equal to the deadline, answered 1 ms before it, is accepted: the token is claimed into its job token row and the job sent; an expiry 1 ms later is owed in the ledger and never given out", () =>
    ahead(async () => {
      const at = await deadlineRoom({ answered: (deadline) => void (clock.now = deadline - 1), answer: (deadline) => ({ expiresAt: new Date(deadline).toISOString() }) });
      expect(at.seen).toHaveLength(1);
      expect(at.seen[0]!.now).toBe(at.mint.deadline - 1);
      expect(Date.parse(at.seen[0]!.job.deadline)).toBe(at.mint.deadline);
      // Claimed: the ledger's record is gone, and while the job ran its token row held the handoff metadata.
      const [t] = readTokens(at.r);
      expect(at.seen[0]!.rows).toEqual([{ token_id: t!.id, expires_at: at.mint.deadline, next_ms: at.mint.deadline, last_error: "held" }]);
      expect((await records(at.r)).records).toEqual([]);

      // The answer is held 20 s, so the expiry passes the ledger's own check of the lifetime asked: only the deadline refuses it.
      const after = await deadlineRoom({ answered: () => void (clock.now += 20_000), answer: (deadline) => ({ expiresAt: new Date(deadline + 1).toISOString() }) });
      expect(after.seen).toEqual([]);
      expect(await jobTokens(after.r)).toEqual([]);
      expect((await records(after.r)).records).toEqual([expect.objectContaining({ state: "owed", expiresAt: after.mint.deadline + 1, lastError: "an expiry after notAfter" })]);
      expect(await jobsOf(after.r)).toMatchObject([{ state: "owed", attempt: 1, token: null }]);
    }));

  it("an answer that arrives at a clock equal to the deadline sends no job and ends the token", () =>
    ahead(async () => {
      const at = await deadlineRoom({ answered: (deadline) => void (clock.now = deadline) });
      expect(at.seen).toEqual([]);
      expect(await jobsOf(at.r)).toMatchObject([{ state: "owed", attempt: 1, token: null }]);
      // Ended: claimed by the job, then its row settled; the token no longer reads, and no record is left.
      const [t] = readTokens(at.r);
      expect(canonical(at.r).admits(t!.plaintext, "read")).toBe(false);
      expect(await jobTokens(at.r)).toEqual([]);
      expect((await records(at.r)).records).toEqual([]);
    }));
});

describe("a whole-tree job's token mint whose outcome is unknown stays an open duty, and nothing is sent on it", () => {
  const step = (r: TestRoom) =>
    inDO(r, async (room) => {
      await room.core.steps.jobs();
      await room.core.idle();
    });

  it("applied, then the answer lost: nothing is sent; the job is owed again and its next attempt is sent with a token the Room knows; past the deadline and the lost token's expiry the record is still open, with what the inventory saw", async () => {
    const { r, seen, from } = await jobRoom();
    r.world.artifacts.loseReply("createToken");
    await step(r);
    expect(seen).toEqual([]);
    const [lost] = readTokens(r, from);
    expect(canonical(r).admits(lost!.plaintext, "read")).toBe(true);
    const [row] = await jobsOf(r);
    expect(row).toMatchObject({ state: "owed", attempt: 1, token: null });
    const [recorded] = await jobRecords(r);
    expect(recorded).toMatchObject({ purpose: expect.stringMatching(/^job:job_[0-9a-f]+_1$/), state: "unknown", tokenId: null, expiresAt: null, lastError: "create failed: Error" });
    clock.now = row!["next_ms"] as number;
    await step(r);
    expect(seen.map((s) => s.job.id.slice(-2))).toEqual(["_2"]);
    // Past the deadline, and after the lost token has expired, the inventory is clean: noted, not settled.
    clock.now = Math.max(recorded!.notAfter!, lost!.expiresAt) + 1;
    await mintsStep(r);
    expect(await jobRecords(r)).toEqual([expect.objectContaining({ id: recorded!.id, state: "unknown" })]);
    const seenBy = await observation(r);
    expect(seenBy).toMatchObject({ at: clock.now, unaccounted: 0, result: "0 live token(s) on the canonical repository not accounted for" });
    expect(seenBy.nextAt!).toBeGreaterThan(clock.now);
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBeLessThanOrEqual(seenBy.nextAt!);
  });

  it("review 013dad0c: the mint is held past its deadline and a second jobs step sends the next attempt; when the first mint's answer then arrives, with a token minted in time, it is claimed by the superseded attempt and ended: never sent, no longer able to read, and no record left", async () => {
    const { r, seen, from } = await jobRoom();
    const a = r.world.artifacts;
    const calls = a.remoteCalls.get("createToken") ?? 0;
    // Attempt 1's mint: Artifacts applies it at once, with an expiry within the deadline, and only its answer is held.
    let heldCall = 0;
    a.holdTokenReply = (repo, scope, _ttl, n) => {
      if (scope === "read" && repo === a.canonical && heldCall === 0) heldCall = n;
      return n === heldCall;
    };
    const held = step(r);
    await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
    const [recorded] = await jobRecords(r);
    expect(recorded).toMatchObject({ state: "sent", notAfter: expect.any(Number) });
    clock.now = recorded!.notAfter! + 1;
    await step(r);
    expect(seen.map((s) => s.job.id.slice(-2))).toEqual(["_2"]);
    a.holdTokenReply = null;
    await held;
    const lateToken = readTokens(r, from).find((t) => t.plaintext !== tokenOf(seen[0]!.job));
    expect(lateToken).toBeDefined();
    expect(seen.map((s) => s.job.id.slice(-2))).toEqual(["_2"]);
    expect(canonical(r).admits(lateToken!.plaintext, "read")).toBe(false);
    expect(await jobRecords(r)).toEqual([]);
    expect(await jobTokens(r)).toEqual([]);
  });

  it("the room stops while a mint's answer is outstanding: the fresh object takes the record over as unknown, never settled by the owner's end, and the job's next attempt goes on", async () => {
    const { r: before, seen, from } = await jobRoom();
    const a = before.world.artifacts;
    const calls = a.remoteCalls.get("createToken") ?? 0;
    a.holdTokenReply = (repo, scope) => scope === "read" && repo === a.canonical;
    void step(before).catch(() => undefined);
    await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
    const [recorded] = await jobRecords(before);
    expect(recorded).toMatchObject({ state: "sent", tokenId: null });
    const r = await restarted(before);
    a.holdTokenReply = null;
    expect(readTokens(r, from)[0]!.revoked).toBe(false);
    expect(await jobRecords(r)).toEqual([expect.objectContaining({ id: recorded!.id, state: "unknown" })]);
    expect(await jobsOf(r)).toMatchObject([{ state: "sent", attempt: 1, token: null }]);
    clock.now = recorded!.notAfter!;
    await tick(r);
    expect(seen.length).toBeGreaterThan(0);
    expect((await jobRecords(r)).map((x) => x.id)).toContain(recorded!.id);
  });

  it("the observation of an unknown mint does not count a live token the Room knows by its job token row", async () => {
    const { r, seen, from } = await jobRoom();
    r.world.artifacts.loseReply("createToken");
    await step(r);
    const [recorded] = await jobRecords(r);
    const [lost] = readTokens(r, from);
    // The next attempt's job is sent and not yet answered: its token is live.
    let answer: (() => void) | null = null;
    const sent: CheckJob[] = [];
    r.world.checkers["unit"] = {
      handle(job): Promise<Result<Check>> {
        sent.push(job);
        return new Promise((resolve) => (answer = () => resolve(refusal)));
      },
    };
    clock.now = (await jobsOf(r))[0]!["next_ms"] as number;
    await inDO(r, (room) => room.core.steps.jobs());
    await until(async () => sent.length === 1);
    clock.now = lost!.expiresAt + 1;
    await mintsStep(r);
    expect(canonical(r).admits(tokenOf(sent[0]!), "read")).toBe(true);
    expect(await observation(r)).toMatchObject({ at: clock.now, unaccounted: 0 });
    expect(await jobRecords(r)).toEqual([expect.objectContaining({ id: recorded!.id, state: "unknown" })]);
    expect(seen).toEqual([]);
    await inDO(r, () => answer!());
    await inDO(r, (room) => room.core.idle());
  });
});

describe("mint lane C (5): an ended job token's row", () => {
  it("a revocation that never answers ends within the wait and keeps its debt, and its late answer changes nothing; a repository lookup still out when the wait ends sends nothing, then or when it answers; an expiry that passes during the lookup settles the row with no revocation sent", () =>
    ahead(async () => {
      const { r, seen, jobs } = await jobRoom();
      const repo = canonical(r);
      const real = repo.revokeToken.bind(repo);
      const asked: string[] = [];
      let answer: (v: boolean) => void = () => undefined;
      // The job's token is ended when the service refuses it; its revocation never answers.
      repo.revokeToken = (id) => {
        asked.push(id);
        return new Promise<boolean>((resolve) => (answer = resolve));
      };
      await inDO(r, (room) => setJobTokenWait(room.core, 10));
      expect(await Promise.race([jobs().then(() => "ended"), new Promise((resolve) => setTimeout(() => resolve("held"), 3_000))])).toBe("ended");
      expect(seen).toHaveLength(1);
      const [row] = await jobTokens(r);
      expect(row).toMatchObject({ last_error: "revocation: no answer in time" });
      expect(row!["next_ms"] as number).toBeGreaterThan(clock.now);
      answer(true);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(await jobTokens(r)).toEqual([row]);
      repo.revokeToken = (id) => {
        asked.push(id);
        return real(id);
      };

      // The next pass's lookup of the repository is held past the wait.
      const before = asked.length;
      const binding = await inDO(r, (room) => room.core.artifacts as unknown as { get: (name: string) => Promise<unknown> });
      const get = binding.get.bind(binding);
      let release: () => void = () => undefined;
      binding.get = (name) => new Promise((resolve) => (release = () => resolve(get(name))));
      const pass = () =>
        inDO(r, async (room) => {
          await room.core.steps.jobTokens();
          await room.core.idle();
        });
      clock.now = row!["next_ms"] as number;
      await pass();
      const [waiting] = await jobTokens(r);
      expect(waiting).toMatchObject({ token_id: row!["token_id"], last_error: "the repository was not reached in time" });
      await inDO(r, () => release());
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(asked.length).toBe(before);
      expect(repo.tokens.get(row!["token_id"] as string)!.revoked).toBe(false);

      // The token expires while the next lookup is out.
      binding.get = async (name) => {
        clock.now = row!["expires_at"] as number;
        return get(name);
      };
      clock.now = waiting!["next_ms"] as number;
      expect(clock.now).toBeLessThan(row!["expires_at"] as number);
      await pass();
      expect(await jobTokens(r)).toEqual([]);
      expect(asked.length).toBe(before);
      binding.get = get;
    }));

  it("a job token row whose revocation keeps failing is retried while the token can read, and settled once its known expiry passes, with no revocation recorded and none sent after", () =>
    ahead(async () => {
      const { r, seen, jobs } = await jobRoom();
      for (let i = 0; i < 100; i++) r.world.artifacts.failRemote("revokeToken", internal());
      await jobs();
      expect(seen).toHaveLength(1);
      const t = readTokens(r).find((x) => x.plaintext === tokenOf(seen[0]!.job))!;
      expect(await jobTokens(r)).toEqual([expect.objectContaining({ token_id: t.id, expires_at: t.expiresAt, last_error: "revocation failed: an error of another kind INTERNAL_ERROR (10400)" })]);
      const asked = revocations(canonical(r));
      const pass = () =>
        inDO(r, async (room) => {
          await room.core.steps.jobTokens();
          await room.core.idle();
        });
      // Two retries at the row's own times, each refused; then its expiry passes.
      for (let i = 0; i < 2; i++) {
        clock.now = (await jobTokens(r))[0]!["next_ms"] as number;
        await pass();
      }
      expect(asked).toEqual([t.id, t.id]);
      expect(clock.now).toBeLessThan(t.expiresAt);
      const tried = asked.length;
      clock.now = t.expiresAt;
      await pass();
      expect(await jobTokens(r)).toEqual([]);
      expect(t.revoked).toBe(false);
      clock.now += 600_000;
      await pass();
      expect(asked).toHaveLength(tried);
    }));
});

describe("R-MINT-7: ended job tokens and due jobs are taken in bounded batches, earliest due first, and a fresh object schedules what it finds", () => {
  it("25 ended job tokens due at once, the first revocation held: the alarm returns with the pass under way and its later steps still run; the first pass sends 20, earliest due first; the backlog continues 1 s after the pass", () =>
    ahead(async () => {
      const r = await makeRoom();
      const repo = canonical(r);
      // An act not yet published: the alarm's publication step, which runs after the job token step, publishes it.
      await r.admin.ok<Claim>("claim", null, { goal: "a lane", scope: ["docs/g/**"] });
      clock.now += 10 * 60_000;
      const ids = await endedRows(r, 25);
      await inDO(r, (room) => setJobTokenWait(room.core, 5_000));
      const real = repo.revokeToken.bind(repo);
      const asked: string[] = [];
      let holding = true;
      const mine = new Set(ids);
      repo.revokeToken = async (id) => {
        if (mine.has(id)) asked.push(id); // the log's own tokens are revoked here too
        if (id === ids[0]) while (holding) await new Promise((res) => setTimeout(res, 1));
        return real(id);
      };
      try {
        const before = (await read(r, { q: "log" })).publishedThrough;
        expect(await alarm(r)).toBe(true);
        // The alarm returned while the first revocation was still held: the pass is not awaited.
        expect(asked).toEqual([ids[0]]);
        expect((await read(r, { q: "log" })).publishedThrough).toBeGreaterThan(before);
        // While it is held, its rows are not eligible before the attempt's timeout; no alarm under 1 s ahead, none later.
        expect(await inDO(r, (room) => jobTokensDue(room.core))).toBe(clock.now + 5_000);
        const held = await stored(r);
        expect(held! - clock.now).toBeGreaterThanOrEqual(1_000);
        expect(held!).toBeLessThanOrEqual(clock.now + 5_000);
        holding = false;
        await settle(r);
        expect(asked).toEqual(ids.slice(0, JOB_BATCH));
        expect(await jobTokens(r)).toHaveLength(5);
        expect(await stored(r)).toBe(clock.now + 1_000);
        clock.now += 1_000;
        expect(await alarm(r)).toBe(true);
        await settle(r);
        expect(asked).toEqual(ids);
        expect(ids.every((id) => token(r, id).revoked)).toBe(true);
        expect(await jobTokens(r)).toEqual([]);
        expect(await inDO(r, (room) => room.core.loopBackoff().jobTokens)).toBeUndefined();
      } finally {
        holding = false;
        repo.revokeToken = real;
      }
    }));

  it("25 jobs due at once: one jobs step takes the 20 due earliest; the rest are due 1 s later, and the next step takes them", () =>
    ahead(async () => {
      const r = await makeRoom();
      const t0 = clock.now;
      // Jobs whose lane no longer exists: each is closed as not needed, with no credential; due in reverse row order.
      await inDO(r, (room) => {
        for (let i = 0; i < 25; i++)
          room.core.sql.all(
            "INSERT INTO check_jobs (id, owner, lane, generation, obligation, checker, config, integration, base, state, next_ms) VALUES (?, 'op_x', 'lane_gone', 1, 'obl_x', 'unit', ?, ?, ?, 'owed', ?)",
            `job_${String(i).padStart(2, "0")}`,
            `sha256:${String(i).padStart(64, "0")}`,
            "a".repeat(40),
            "b".repeat(40),
            t0 - i,
          );
      });
      const done = async () => (await inDO(r, (room) => room.core.sql.all("SELECT id FROM check_jobs WHERE state = 'done' ORDER BY id"))).map((x) => String(x["id"]));
      await inDO(r, (room) => room.core.steps.jobs());
      // The earliest due are the last inserted: jobs 05 to 24.
      expect(await done()).toEqual(Array.from({ length: 20 }, (_, i) => `job_${String(i + 5).padStart(2, "0")}`));
      expect(await inDO(r, (room) => room.core.nextAlarm())).toBe(clock.now + 1_000);
      clock.now += 1_000;
      await inDO(r, (room) => room.core.steps.jobs());
      expect(await done()).toHaveLength(25);
    }));

  it("follow-up c9cd4cd8 (2): a fresh object schedules the cleanup debt it finds, with no request and no alarm stored: overdue job token rows 1 s ahead; a future row at its own time, after an earlier lease alarm, which is kept; and a released workspace's owed token revocation and inventory; its alarms alone settle them", () =>
    ahead(async () => {
      const before = await makeRoom();
      await inDO(before, (room) => room.core.publish(true));
      const overdue = await endedRows(before, 3);
      await inDO(before, (_room, state) => state.storage.deleteAlarm());
      let r = await restarted(before);
      expect(await stored(r)).toBe(clock.now + 1_000);
      clock.now += 1_000;
      expect(await alarm(r)).toBe(true);
      await settle(r);
      expect(overdue.every((id) => token(r, id).revoked)).toBe(true);

      // A future row, due after a lane's lease expires: the lease's alarm first, then the row's own time, exactly.
      const { lane } = await r.admin.ok<Claim>("claim", null, { goal: "a lane", scope: ["docs/h/**"] });
      await inDO(r, (room) => room.core.publish(true));
      const leaseAt = (await inDO(r, (room) => room.core.sql.all("SELECT expires_ms FROM lanes WHERE id = ?", lane)))[0]!["expires_ms"] as number;
      const later = canonical(r).mint("read", 3 * 3600).id;
      const dueAt = leaseAt + 10 * 60_000;
      await inDO(r, (room) => room.core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES (?, ?, ?, 'ended')", later, dueAt + 3600_000, dueAt));
      // And a workspace debt: the lane's workspace released, with its token's revocation and its inventory unanswered.
      const a = r.world.artifacts;
      const owed = await inDO(r, async (room) => {
        const ws = room.core.workspaces;
        ws.open(lane, 1, clock.now + 20 * 60_000);
        expect((await ws.provision(lane)).state).toBe("ready");
        a.failRemote("revokeToken", artifactsErrors.transport());
        a.failRemote("listTokens", artifactsErrors.transport());
        return ws.revoke(lane, 1);
      });
      expect(owed).toBeGreaterThan(0);
      const fork = a.repo(forkName(a.canonical, lane));
      expect(fork.activeTokens().length).toBeGreaterThan(0);
      await inDO(r, (_room, state) => state.storage.deleteAlarm());
      r = await restarted(r);
      expect(await inDO(r, (room) => jobTokensDue(room.core))).toBe(dueAt);
      const first = await stored(r);
      expect(first, "the fresh object stored an alarm").not.toBeNull();
      expect(first!).toBeLessThanOrEqual(leaseAt);
      // Alarms alone: the workspace's debt and the lease's expiry first; the job token row waits for its own time.
      for (let i = 0; i < 8 && (await stored(r))! < dueAt; i++) {
        clock.now = Math.max(clock.now, (await stored(r))!);
        expect(await alarm(r)).toBe(true);
        await settle(r);
        expect(token(r, later).revoked).toBe(false);
      }
      expect(await inDO(r, (room) => room.core.workspaces.pendingCleanup())).toBe(0);
      expect(fork.activeTokens()).toEqual([]);
      expect(await stored(r)).toBe(dueAt);
      clock.now = dueAt;
      expect(await alarm(r)).toBe(true);
      await settle(r);
      expect(token(r, later).revoked).toBe(true);
      expect(await jobTokens(r)).toEqual([]);
    }));
});

// ------------------------------------------------------------------ stored state

describe("mint lane C: the due indexes reach a room stored before them (review 993dce7a), as migration 3 after request d29c09fa's scrub at 2", () => {
  /** The query plan's steps for one of the production due queries. */
  const plan = (room: Room, q: string) => room.core.sql.all(`EXPLAIN QUERY PLAN ${q}`, clock.now, JOB_BATCH).map((x) => String(x["detail"]));
  /** Text a stored error field held before request d29c09fa: not safe metadata. */
  const LEGACY = "ArtifactsError: Bearer abcd1234 rejected";
  const version = (room: Room) => room.core.sql.all("SELECT v FROM schema_version WHERE id = 1")[0]!["v"];
  const indexes = (room: Room) => room.core.sql.all("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('job_tokens_due', 'check_jobs_due') ORDER BY name").map((x) => x["name"]);
  const scrubbing = (room: Room) => room.core.sql.all("SELECT k FROM meta WHERE k = 'error_scrub'").length > 0;

  for (const from of [1, 2] as const)
    it(`a room stored at version ${from} reopened: ${from === 1 ? "the error scrub (2) starts and" : "the scrub (already applied) does not rerun, and"} both due indexes are installed; every row, owner, deadline and the history are kept; the due batches read by index with no sort; a reopened room changes nothing more`, () =>
      ahead(async () => {
        const before = await makeRoom();
        const due = clock.now + 3600_000;
        const snapshot = (room: Room) => ({
          tokens: room.core.sql.all("SELECT * FROM job_tokens ORDER BY token_id"),
          jobs: room.core.sql.all("SELECT * FROM check_jobs ORDER BY id"),
          ledger: room.core.mints.duties({ limit: 1000 }).records,
          head: room.core.headSeq(),
          meta: room.core.sql.all("SELECT k, v FROM meta WHERE k NOT IN ('loop_backoff', 'error_scrub') ORDER BY k"),
        });
        // As a room stored at `from`: no due indexes, a held job token, a job token row with a legacy error, an owed job,
        // an unknown mint, and no scrub in progress.
        const was = await inDO(before, async (room, state: State) => {
          await room.core.idle();
          expect(version(room)).toBe(4);
          room.core.sql.all("DROP INDEX job_tokens_due");
          room.core.sql.all("DROP INDEX check_jobs_due");
          room.core.sql.all("DELETE FROM meta WHERE k = 'error_scrub'");
          room.core.sql.all("UPDATE schema_version SET v = ? WHERE id = 1", from);
          room.core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES ('tok_owned', ?, ?, 'held')", due, due);
          room.core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES ('tok_legacy', ?, ?, ?)", due, due, LEGACY);
          room.core.sql.all(
            "INSERT INTO check_jobs (id, owner, lane, generation, obligation, checker, config, integration, base, state, next_ms) VALUES ('job_old', 'op_x', 'lane_x', 1, 'obl_x', 'unit', ?, ?, ?, 'owed', ?)",
            `sha256:${"1".repeat(64)}`,
            "a".repeat(40),
            "b".repeat(40),
            due,
          );
          room.core.mints.adopt([{ purpose: "job:job_old_1", scope: "read", sentAt: clock.now, notAfter: due, note: "an unknown mint kept across the upgrade" }]);
          expect(plan(room, JOB_TOKENS_DUE_SQL).join("; ")).toMatch(/SCAN job_tokens/);
          await state.storage.deleteAlarm();
          return snapshot(room);
        });
        const r = await restarted(before);
        await inDO(r, (room) => {
          expect(version(room)).toBe(4);
          expect(indexes(room)).toEqual(["check_jobs_due", "job_tokens_due"]);
          expect(snapshot(room)).toEqual(was);
          // Step 2's effect: from version 1 the scrub's cursor is stored; from version 2 it is not started again.
          expect(scrubbing(room)).toBe(from === 1);
          // One indexed search each: no scan, and no temporary B-tree for the order.
          expect(plan(room, JOB_TOKENS_DUE_SQL)).toEqual(["SEARCH job_tokens USING COVERING INDEX job_tokens_due (next_ms<?)"]);
          expect(plan(room, JOBS_DUE_SQL)).toEqual(["SEARCH check_jobs USING INDEX check_jobs_due (next_ms<?)"]);
        });
        // The scrub, when started, runs to its end through its own step, and leaves only safe metadata.
        const legacy = (room: Room) => room.core.sql.all("SELECT last_error FROM job_tokens WHERE token_id = 'tok_legacy'")[0]!["last_error"];
        const at4 = await inDO(r, async (room) => {
          for (let i = 0; i < 10 && scrubbing(room); i++) await room.core.steps.errors();
          if (from === 1) expect(legacy(room)).not.toBe(LEGACY);
          else expect(legacy(room)).toBe(LEGACY);
          expect(scrubbing(room)).toBe(false);
          return { ...snapshot(room), legacy: legacy(room) };
        });
        // Reopened: nothing runs again, and nothing changes.
        const again = await restarted(r);
        await inDO(again, (room) => {
          expect(version(room)).toBe(4);
          expect({ ...snapshot(room), legacy: legacy(room) }).toEqual(at4);
          expect(scrubbing(room)).toBe(false);
        });
      }));

  it("review 31ad41d5: a room at version 2 with the error scrub stopped mid-table, reopened: migration 3 adds the indexes and leaves the cursor; production alarms resume the scrub from its cursor, finish it and remove the cursor; a restart then changes nothing", () =>
    ahead(async () => {
      const before = await makeRoom();
      const due = clock.now + 3600_000;
      const jobTokensTable = ROOM_SCRUB_TABLES.findIndex((t) => t.table === "job_tokens");
      expect(jobTokensTable).toBeGreaterThan(0);
      const cursor = JSON.stringify({ table: jobTokensTable, after: "tok_a" });
      await inDO(before, async (room, state) => {
        await room.core.idle();
        room.core.sql.all("DROP INDEX job_tokens_due");
        room.core.sql.all("DROP INDEX check_jobs_due");
        room.core.sql.all("UPDATE schema_version SET v = 2 WHERE id = 1");
        // The scrub stopped in job_tokens after `tok_a`; `tok_b` and `tok_c` still hold legacy text, and `tok_held` is owned.
        for (const id of ["tok_a", "tok_b", "tok_c"]) room.core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES (?, ?, ?, ?)", id, due, due, LEGACY);
        room.core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES ('tok_held', ?, ?, 'held')", due, due);
        room.core.sql.all("INSERT INTO meta (k, v) VALUES ('error_scrub', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", cursor);
        await state.storage.deleteAlarm();
      });
      const r = await restarted(before);
      const opened = await inDO(r, async (room, state) => ({
        v: version(room),
        indexes: indexes(room),
        cursor: room.core.sql.all("SELECT v FROM meta WHERE k = 'error_scrub'")[0]?.["v"],
        alarm: await state.storage.getAlarm(),
        plan: plan(room, JOB_TOKENS_DUE_SQL),
      }));
      expect(opened).toMatchObject({ v: 4, indexes: ["check_jobs_due", "job_tokens_due"], cursor, plan: ["SEARCH job_tokens USING COVERING INDEX job_tokens_due (next_ms<?)"] });
      expect(opened.alarm).not.toBeNull(); // recovery stored the scrub's alarm, with no request
      // Production alarms only.
      for (let i = 0; i < 10 && (await inDO(r, scrubbing)); i++) {
        clock.now = Math.max(clock.now, (await stored(r)) ?? clock.now);
        expect(await alarm(r)).toBe(true);
        await settle(r);
      }
      const rows = async (x: TestRoom) => Object.fromEntries((await jobTokens(x)).map((row) => [row["token_id"], row]));
      const finished = await rows(r);
      expect(await inDO(r, scrubbing)).toBe(false);
      // Resumed after its cursor: the rows after it are safe; the row before it is not revisited.
      expect([finished["tok_b"]!["last_error"], finished["tok_c"]!["last_error"]]).toEqual([safeJobStatus(LEGACY), safeJobStatus(LEGACY)]);
      expect(safeJobStatus(LEGACY)).not.toBe(LEGACY);
      expect(finished["tok_a"]!["last_error"]).toBe(LEGACY);
      // Ownership and deadlines kept.
      expect(finished["tok_held"]).toEqual({ token_id: "tok_held", expires_at: due, next_ms: due, last_error: "held" });
      for (const id of ["tok_a", "tok_b", "tok_c"]) expect([finished[id]!["expires_at"], finished[id]!["next_ms"]]).toEqual([due, due]);
      const again = await restarted(r);
      expect(await rows(again)).toEqual(finished);
      expect(await inDO(again, (room) => ({ v: version(room), scrubbing: scrubbing(room) }))).toEqual({ v: 4, scrubbing: false });
    }));
});

/**
 * What the Room does after an act is sealed: its log, its alarm and its tokens.
 *
 * The log and its publication: construction and notify after commit (R-LOG,
 * R-POL-5), publication without holding the log in memory (request
 * 5a7290b9) and in bounded transfers (lane B follow-up revision 3), and the
 * alarm's economy (request 3da1d82b): an idle room writes nothing, failing
 * work backs off, and a room whose canonical repository is gone stops. The
 * idle and backoff tests run the real Room Durable Object through its real
 * `alarm()`, and count storage writes with a spy on that object only.
 *
 * Tokens the Room mints: the canonical mint ledger (protocol section 32,
 * R-MINT-1 to R-MINT-7; requests 78f0971c and 5ff58c9a), the forks'
 * read-token ledger (request 02836f9a), check job tokens and their
 * deadlines (R-EXEC-9), and the stored state these arrived in.
 *
 * The ledgers' own rules (what a lost answer, a late answer, a failed
 * revocation or an odd listing becomes) are shown over a fake clock and
 * store in packages/git/test/mints.test.ts, fork-tokens.test.ts and
 * landing.test.ts. The token tests here show what the Room adds: every mint
 * site goes through a ledger; the ledger's wake-ups are real stored alarms;
 * a fresh object takes over and schedules what it finds; each kind of work
 * has its own backoff; and the Room's own job token rows and job deadlines.
 * In `ahead`, the room clock runs a week ahead of real time with no test
 * alarm delay, so a stored alarm is the Room's own time and never fires by
 * itself; it runs only through `alarm`.
 *
 * One file, so that the Worker is loaded once for all of them.
 */

import { describe, expect, it } from "vitest";
import { evictDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import type {
  AttentionItem,
  Check,
  CheckerConfig,
  CheckJob,
  Claim,
  EnvelopeKind,
  Landing,
  LandOp,
  LaneId,
  Note,
  OpId,
  PolicyDocument,
  Refusal,
  Result,
  Sha,
  SystemEvent,
  WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import { policy, requireCheck, rule } from "@generalbusiness/artroom-policy/helpers";
import { forkName, type LogPushRequest, type LogStageRequest } from "@generalbusiness/artroom-git";
import { READ_LIMITS, verifyLog, type GitReader } from "@generalbusiness/artroom-log";
import type { Room } from "../../src/index.ts";
import { ALARM } from "../../src/budgets.ts";
import { digestJson } from "../../src/crypto.ts";
import { JOB_BATCH, JOBS_DUE_SQL, JOB_TOKENS_DUE_SQL, jobTokensDue, setJobTokenWait } from "../../src/jobs.ts";
import { ROOM_SCRUB_TABLES, safeJobStatus } from "../../src/store.ts";
import { FakeArtifactsError, artifactsErrors, type FakeRepo } from "../../src/memory/artifacts.ts";
import { ahead, alarm, entries, events, hold, idOf, inDO, kindOf, land, opOf, proposed, proposed as proposedBy, read, restarted, settle, storedAlarm as stored, stubOf, type State } from "./core-support.ts";
import { addMember, advance, call, clock, expectOk, failure, hour, iso, makeRoom, openedWorkspace, pushChange, tick, until, type TestRoom } from "./support.ts";

describe("the log, its publication and the alarm", () => {
  const minute = 60_000;
  const notifying = (id: string, on: EnvelopeKind, why: string): PolicyDocument => policy(rule({ id, kind: "notify", on: [on], to: ["role:admin"], why }));

  describe("section 23, Log construction (R-LOG-2, R-LOG-7, R-LOG-8, R-LOG-12, R-LOG-13)", () => {
    it("a new claim, its notified event, and the first two publications, in the order of the worked example; each decision's replay context and the policy are published under their digests; both commits verify, and a tampered entry does not", async () => {
      const room = await makeRoom({ policy: notifying("new-lanes", "claim", "A new lane was opened.") });
      // Steps 1 to 3: genesis, the initial policy, the claim.
      const claim = expectOk(await room.admin.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
      let log = await entries(room);
      expect(log.map((e) => e.seq)).toEqual([0, 1, 2]);
      const receipt = (log[2]!.entry as unknown as { receipt: { effects: { type: string }[]; decisions: unknown[] } }).receipt;
      expect(receipt.effects[0]).not.toHaveProperty("lane"); // R-LOG-12
      expect(receipt.decisions).toEqual([]); // notify is never in the receipt (R-POL-5)
      // Step 4: the lane ID is derived from h(2).
      expect(claim.lane).toBe(idOf(log[2]!));
      // Steps 5 and 6: notify runs after the commit; its outcome is entry 3.
      await tick(room);
      log = await entries(room);
      const notified = (log[3]!.entry as unknown as { event: Extract<SystemEvent, { type: "notified" }> }).event;
      expect(notified).toMatchObject({ type: "notified", entry: claim.lane, to: ["@admin"] });
      expect(notified.decisions[0]).toMatchObject({ rule: "new-lanes", kind: "notify", outcome: { result: "notify", to: ["@admin"] } });
      expect(notified.decisions[0]!.stamp).toEqual({ profile: "artroom-jsonata-v1", jsonata: "2.2.2", accounting: "artroom-act-budget-v1" });
      // Steps 7 to 9: the first publication, then the checkpoint event naming it.
      const p1 = (await call<{ through: number; commit: Sha }>(room.stub.publishLog()))!;
      expect(p1.through).toBe(3);
      log = await entries(room);
      expect(log[4]!.entry).toEqual({ type: "system", event: { type: "checkpoint", through: 3, hash: log[3]!.hash, commit: p1.commit } });
      expect(await read(room, { q: "log" })).toMatchObject({ publishedThrough: 3, head: 4 });
      // R-LOG-7, R-EVAL-8, R-POL-12: the decision's replay context and the active policy document are in the commit, by digest.
      const c1 = await room.world.log.files(p1.commit);
      const context = JSON.parse(c1.get(`artroom-log/v1/inputs/${notified.decisions[0]!.input.slice(7)}.json`)!) as { kind: string };
      expect(context.kind).toBe("notify");
      expect(digestJson(context)).toBe(notified.decisions[0]!.input);
      expect(c1.get(`artroom-log/v1/policies/${(log[1]!.entry as unknown as { event: { policy: string } }).event.policy.slice(7)}.json`)).toBeDefined();
      // Step 10: more entries. Steps 11 to 13: the second publication; its parent is the first.
      for (let i = 0; i < 5; i++) await room.admin.ok<Note>("note", { act: claim.id }, { text: `note ${i}` });
      const p2 = (await call<{ through: number; commit: Sha }>(room.stub.publishLog()))!;
      expect(p2.through).toBe(9);
      const c2 = await room.world.log.files(p2.commit);
      expect(room.world.artifacts.parents(p2.commit)).toEqual([p1.commit]);
      expect(room.world.log.ref).toBe(p2.commit);
      const seg1 = c1.get("artroom-log/v1/segments/000000000000.jsonl")!.split("\n");
      const seg2 = c2.get("artroom-log/v1/segments/000000000000.jsonl")!.split("\n");
      expect([seg1.length, seg2.length]).toEqual([4, 10]);
      expect(seg2.slice(0, 4)).toEqual(seg1);
      // `artroom verify` (lane L's verifyLog, with policy replay, R-LOG-10) accepts the log at each commit.
      const repo = room.world.artifacts.canonicalRepo();
      const at = (ref: Sha): GitReader => ({ readObject: (sha) => repo.readObject(sha), readRef: async () => ref });
      expect(await verifyLog(at(p1.commit))).toMatchObject({ ok: true, failures: [], verifiedThrough: 3, publishedThrough: 3 });
      const v2 = await verifyLog(at(p2.commit));
      expect(v2).toMatchObject({ ok: true, failures: [], verifiedThrough: 9, publishedThrough: 9, commits: 2 });
      expect(v2.decisionsReplayed).toBeGreaterThan(0);
      const files = Object.fromEntries(c2);
      files["artroom-log/v1/segments/000000000000.jsonl"] = seg2.map((l: string, i: number) => (i === 5 ? l.replace("note 0", "note X") : l)).join("\n");
      const tampered = room.world.log.write(files, p1.commit);
      for (const o of room.world.artifacts.closure(tampered)) repo.objects.add(o);
      expect((await verifyLog(at(tampered))).ok).toBe(false);
    });

    it("section 23, A notify rule hits a runtime failure, and Notify across an activation (R-LOG-13): the claim stays recorded, unchanged; after a retry its notified entry is sealed, with the decisions of the policy version the claim was admitted under", async () => {
      const room = await makeRoom({ policy: notifying("tell-admins", "claim", "V1 rule.") });
      const versionV1 = idOf((await entries(room))[1]!);
      room.world.policy.failures.notify = 1;
      const claim = expectOk(await room.admin.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
      await tick(room);
      const before = await entries(room);
      expect(before.length).toBe(3);
      expect(idOf(before[2]!)).toBe(claim.id);
      expect(room.world.policy.calls.notify).toBe(1);
      // A new version, whose own notify rule is for another kind, is activated before the retry.
      const v2 = notifying("tell-nobody", "note", "V2 rule.");
      await inDO(room, (r) => r.core.sql.transaction(() => r.core.activate(v2, {}, null, iso(clock.now))));
      advance(5_000);
      await tick(room);
      const log = await entries(room);
      const notified = events(log, "notified").at(-1)!.event as unknown as { entry: string; decisions: { rule: string; policy: string }[] };
      expect(notified.entry).toBe(claim.id);
      expect(notified.decisions.map((d) => [d.rule, d.policy])).toEqual([["tell-admins", versionV1]]);
      expect(room.world.policy.calls.notify).toBe(2);
      expect(log[2]).toEqual(before[2]);
    });
  });

  describe("publication reads and sends the log in bounded parts", () => {
    /** Prose, so the secret scan has nothing to find. */
    const prose = (n: number) => Array.from({ length: n }, (_, i) => `line ${i} of a long note about the plan.`).join(" ");

    it("request 5a7290b9: the publisher reads the Room's entries from its SQLite in batches of at most its read limit, and reads a retained file's body only when the parent commit does not hold it", async () => {
      // Every note's refuse decision retains a replay context (R-LOG-7), so retained files grow with the log.
      const r = await makeRoom({ policy: policy(rule({ id: "never", on: "note", refuse: "false", reason: "never", fix: "none" })) });
      const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
      const batch = 8;
      const notes = batch + 2;
      for (let i = 0; i < notes; i++) await r.admin.ok("note", { act: c.id }, { text: `note ${i}` });
      // Record the SQL that reads entry and retained bodies.
      const reads: number[] = [];
      const bodies: string[] = [];
      await inDO(r, async (room) => {
        // This object's publisher, opened as the Room opens it, reads 8 entries at a time: lane L's default is
        // READ_LIMITS.entries (64), which would need a log eight times as long to show the same thing.
        const core = room.core as unknown as { publisherCache: Promise<{ readLimits: typeof READ_LIMITS }> | null; ports: { log: () => Promise<{ readLimits: typeof READ_LIMITS }> } };
        const publisher = await (core.publisherCache ??= core.ports.log());
        expect(publisher.readLimits).toEqual(READ_LIMITS);
        publisher.readLimits = { entries: batch, bytes: READ_LIMITS.bytes } as never;
        const sql = room.core.sql as { all: (q: string, ...b: unknown[]) => unknown[] };
        const all = sql.all.bind(sql);
        sql.all = (q, ...b) => {
          if (/^SELECT body FROM entries WHERE seq > \?/.test(q)) reads.push(Number(b[1]));
          if (/^SELECT body FROM retained WHERE digest = \?/.test(q)) bodies.push(String(b[0]));
          return all(q, ...b);
        };
      });
      const p1 = await call<{ through: number; commit: string }>(r.stub.publishLog());
      expect(p1.through).toBeGreaterThan(batch);
      expect(reads.length).toBeGreaterThan(1);
      expect(Math.max(...reads)).toBe(batch);
      const firstBodies = new Set(bodies);
      expect(firstBodies.size).toBeGreaterThanOrEqual(notes);

      for (let i = 0; i < 5; i++) await r.admin.ok("note", { act: c.id }, { text: `later ${i}` });
      reads.length = 0;
      bodies.length = 0;
      const p2 = await call<{ through: number; commit: string }>(r.stub.publishLog());
      expect(p2.through).toBe(p1.through + 6); // the checkpoint event and five notes
      expect(Math.max(...reads)).toBe(batch);
      // Only the new notes' replay contexts are read: to hash them, and to send them.
      expect(bodies.filter((d) => firstBodies.has(d))).toEqual([]);
      expect(new Set(bodies).size).toBe(5);
      expect(r.world.log.ref).toBe(p2.commit);
      expect(await verifyLog(r.world.artifacts.canonicalRepo())).toMatchObject({ ok: true, failures: [], verifiedThrough: p2.through });
      // That a full segment of 1,000 entries is not read again is lane L's own: packages/log/test/bounded.test.ts.
    });

    it("a publication larger than one transfer is staged through the sandbox in parts within the bound, an object larger than the bound in chunks of itself, and then pushed with no objects; the whole cohort publishes to a verified log head", async () => {
      const r = await makeRoom();
      const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
      await call(r.stub.publishLog());
      for (let i = 0; i < 4; i++) await r.admin.ok("note", { act: c.id }, { text: prose(40) });
      const big = await r.admin.ok("note", { act: c.id }, { text: prose(400) });
      const bound = 4_000;
      r.world.logTransfer = { objects: 100_000, bytes: bound };
      // A new instance opens its publisher with the bound the test sets.
      await evictDurableObject(r.stub);
      // What crosses the sandbox's log routes: each staging call's parts, and each push's object count.
      const stub = r.world.artifacts.logStub as { stageLog: (q: LogStageRequest & { canonical: { remote: string } }) => Promise<unknown>; pushLog: (q: never) => Promise<unknown> };
      const stages: { offset: number; bytes: number; sha: string }[][] = [];
      const pushes: number[] = [];
      const { stageLog, pushLog } = stub;
      stub.stageLog = async (q) => {
        // The decoded length of each part's unpadded base64url.
        stages.push(q.parts.map((p) => ({ offset: p.offset, bytes: Math.floor((p.data.length * 3) / 4), sha: p.sha })));
        return stageLog(q);
      };
      stub.pushLog = async (q: never) => {
        pushes.push((q as LogPushRequest).objects.length);
        return pushLog(q);
      };
      const p = await call<{ through: number; commit: string }>(r.stub.publishLog());
      // One cohort, the whole log: nothing was split or left behind.
      expect(p.through).toBe(big.seq);
      expect((await read(r, { q: "log" })).publishedThrough).toBe(big.seq);
      expect(r.world.log.ref).toBe(p.commit);
      const withParts = stages.filter((s) => s.length > 0);
      expect(withParts.length).toBeGreaterThan(1);
      for (const s of withParts) expect(s.reduce((n, x) => n + x.bytes, 0)).toBeLessThanOrEqual(bound);
      // Some object's later bytes went in a part of their own.
      const chunked = stages.flat().filter((x) => x.offset > 0);
      expect(chunked.length).toBeGreaterThan(0);
      expect(stages.flat().filter((x) => x.sha === chunked[0]!.sha).length).toBeGreaterThan(1);
      expect(pushes).toEqual([0]);
      expect(r.world.artifacts.canonicalRepo().staged.size).toBe(0);
      expect(await verifyLog(r.world.artifacts.canonicalRepo())).toMatchObject({ ok: true, failures: [], verifiedThrough: big.seq, publishedThrough: big.seq });
    });
  });

  // ------------------------------------------------------------------ request 3da1d82b: the alarm's economy

  /** Writes counted on one Room object: SQL rows written, and alarms stored. */
  interface Writes {
    rows: number;
    /** Rows written by the canonical mint ledger's statements (mint lane C: the log remote's tokens are its records). */
    ledgerRows: number;
    alarms: number;
    readonly statements: string[];
  }

  /**
   * Count the Room object's storage writes. The spy replaces the methods of
   * this object's own `Sql` adapter and `storeAlarm`, and reads each cursor's
   * `rowsWritten` from the object's real SQLite.
   */
  async function spy(room: TestRoom): Promise<Writes> {
    const w: Writes = { rows: 0, ledgerRows: 0, alarms: 0, statements: [] };
    await inDO(room, (r, state) => {
      const sql = r.core.sql as { all: (q: string, ...b: unknown[]) => unknown[] };
      sql.all = (q, ...b) => {
        const c = state.storage.sql.exec(q, ...(b as SqlStorageValue[]));
        const rows = c.toArray();
        if (c.rowsWritten > 0) {
          w.rows += c.rowsWritten;
          if (q.includes("artroom_mint")) w.ledgerRows += c.rowsWritten;
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
  const stillSpied = async (room: TestRoom, w: Writes) => expect(await inDO(room, (r) => (r as unknown as { idleSpy?: Writes }).idleSpy === w)).toBe(true);

  /** Run the Room's real alarm at each time it asks for, until `end` (room clock). Returns the room-clock time of each run. */
  async function alarmsUntil(room: TestRoom, end: number): Promise<number[]> {
    const ran: number[] = [];
    for (;;) {
      const next = await inDO(room, (r) => r.core.nextAlarm());
      if (next === null || next > end) break;
      clock.now = Math.max(clock.now, next);
      expect(await runDurableObjectAlarm(stubOf(room))).toBe(true);
      ran.push(clock.now);
      if (ran.length > 500) throw new Error("the alarm never settles");
    }
    clock.now = Math.max(clock.now, end);
    return ran;
  }
  const gapsOf = (ran: number[]) => ran.slice(1).map((t, i) => t - ran[i]!);
  const nextAlarm = (room: TestRoom) => inDO(room, (r) => r.core.nextAlarm());
  const leaseEnd = async (room: TestRoom, lane: string) => (await inDO(room, (r) => r.core.sql.all("SELECT expires_ms FROM lanes WHERE id = ?", lane)[0]!["expires_ms"])) as number;
  /** A room with one released lane: nothing but its log is left to do. */
  async function released(): Promise<TestRoom> {
    const room = await makeRoom();
    const claim = await room.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await room.admin.ok("release", { lane: claim.lane }, { lease: 1 });
    return room;
  }

  describe("request 3da1d82b: an idle room writes nothing", () => {
    it("after the last act's publication settles, the room asks for no alarm in 24 hours, and an alarm that fires anyway writes no row; its unpublished checkpoint is never due; a real act is due a minute later, is published, and the room is idle again", async () => {
      const room = await released();
      await tick(room);
      // The last real act is published within a minute or so; then the alarm has nothing left to do.
      await alarmsUntil(room, clock.now + 10 * minute);
      const before = await read(room, { q: "log" });
      // The last act is published, and the only unpublished entry is the checkpoint that names it.
      expect(kindOf((await entries(room)).at(-1)!)).toBe("checkpoint");
      expect(before.publishedThrough).toBe(before.head - 1);
      expect(await nextAlarm(room)).toBeNull();
      const w = await spy(room);
      expect(await alarmsUntil(room, clock.now + 24 * hour)).toEqual([]);
      // An alarm stored before a deploy, say.
      for (let i = 0; i < 3; i++) {
        advance(minute);
        await inDO(room, (r) => r.alarm());
      }
      await stillSpied(room, w);
      expect({ rows: w.rows, alarms: w.alarms, statements: w.statements }).toEqual({ rows: 0, alarms: 0, statements: [] });
      expect(ALARM.idleRowsPerHour).toBe(0);
      advance(7 * 24 * hour);
      expect(await inDO(room, (r) => ({ due: r.core.publicationDue(), at: r.core.publicationDueAt(), alarm: r.core.nextAlarm() }))).toEqual({ due: false, at: null, alarm: null });

      const claim = await room.admin.ok<Claim>("claim", null, { goal: "later", scope: ["docs/**"] });
      const sealedAt = clock.now;
      expect(await inDO(room, (r) => r.core.publicationDueAt())).toBe(sealedAt + minute);
      // Its alarm is missed by two minutes: a publication already due is asked for 5 s from now, never at once.
      advance(2 * minute);
      expect(await inDO(room, (r) => ({ due: r.core.publicationDue(), alarm: r.core.nextAlarm() }))).toEqual({ due: true, alarm: clock.now + ALARM.pendingIntervalMs });
      // The lease is the only other timer, half an hour away; the publication comes first.
      expect(await alarmsUntil(room, sealedAt + 10 * minute)).toEqual([sealedAt + 2 * minute + ALARM.pendingIntervalMs]);
      const after = await read(room, { q: "log" });
      const log = await entries(room);
      const claimEntry = log.find((e) => e.seq > before.head && kindOf(e) === "claim")!;
      // Published through the claim, the earlier checkpoint with it; the new checkpoint names it and is itself unpublished.
      expect(after).toMatchObject({ publishedThrough: claimEntry.seq, head: claimEntry.seq + 1 });
      expect(kindOf(log.at(-1)!)).toBe("checkpoint");
      // Idle again, apart from the held lease's expiry.
      expect(await nextAlarm(room)).toBe(await leaseEnd(room, claim.lane));
    });
  });

  describe("request 3da1d82b: failing work backs off, and each kind of work keeps its own backoff", () => {
    it("a failing publication backs off from 5 s, doubling, to a 5-minute cap, with a fixed number of rows written per retry; when the remote answers again the next retry publishes and the backoff is gone", async () => {
      const room = await released();
      await tick(room);
      // Every push fails before it reaches the remote, with no answer, for as long as the test runs.
      room.world.log.faults.failBeforePush = 1_000_000;
      const w = await spy(room);
      const ran = await alarmsUntil(room, clock.now + 30 * minute);
      await stillSpied(room, w);
      // The first try is a minute after the claim; then each wait doubles from 5 s, and none is over the cap: 12 an hour.
      const gaps = gapsOf(ran);
      expect(gaps.slice(0, 8)).toEqual([5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
      expect(gaps.length).toBeGreaterThan(8);
      expect(new Set(gaps.slice(6))).toEqual(new Set([ALARM.retryBackoffMaxMs]));
      expect(3_600_000 / ALARM.retryBackoffMaxMs).toBe(12);
      // One row per retry (its backoff), after the first failure stored its cohort, code and backoff (2 rows each);
      // and one alarm stored per run.
      expect(w.rows - w.ledgerRows).toBeLessThanOrEqual(ran.length + 5);
      // Since mint lane C, each log token is a record of the canonical mint ledger: per mint exactly four record
      // statements (the record, the lifetime asked, the answer, the deletion at its revocation), and per run at most two
      // summary writes (the takeover time set, then cleared) and one more stored alarm (the takeover wake-up). A fixed
      // cost per retry, never growing with the retries.
      const count = (head: string) => w.statements.filter((q) => q.startsWith(head)).length;
      const mints = count("INSERT INTO artroom_mint ");
      expect(mints).toBeGreaterThan(0);
      for (const head of ["UPDATE artroom_mint SET ttl = ?", "UPDATE artroom_mint SET state = 'held'", "DELETE FROM artroom_mint WHERE id = ?"]) expect(count(head)).toBe(mints);
      expect(count("UPDATE artroom_mint_summary")).toBeLessThanOrEqual(2 * ran.length);
      expect(w.statements.filter((q) => q.includes("artroom_mint")).length).toBe(4 * mints + count("UPDATE artroom_mint_summary"));
      expect(mints % ran.length).toBe(0); // the same number of mints in every retry
      expect(w.alarms).toBeGreaterThanOrEqual(ran.length);
      expect(w.alarms).toBeLessThanOrEqual(2 * ran.length);
      // Nothing was settled: the same cohort is still pending, and the log ref never moved.
      expect(await inDO(room, (r) => r.core.pendingPublication())).not.toBeNull();
      expect(room.world.log.ref).toBeNull();

      room.world.log.faults.failBeforePush = 0;
      await alarmsUntil(room, clock.now + 10 * minute);
      expect(await inDO(room, (r) => ({ pending: r.core.pendingPublication(), retry: r.core.sql.all("SELECT k FROM meta WHERE k IN ('publication_retry', 'publication_error')") }))).toEqual({ pending: null, retry: [] });
      expect((await read(room, { q: "log" })).publishedThrough).toBeGreaterThanOrEqual(2);
    });

    /**
     * A cold instance (evicted, so `isBound` has no cached answer) whose
     * registry lookup throws, as in an outage. The lookup itself is replaced,
     * on this object only. (A registry that answers "not bound" is in
     * founding.test.ts, R-PUB-10.)
     */
    async function coldRegistry(room: TestRoom): Promise<void> {
      await evictDurableObject(room.stub);
      await inDO(room, (r) => {
        expect((r.core as unknown as { boundCache: boolean }).boundCache).toBe(false);
        const core = r.core as { bound: (repo: string, id: string, name: string) => Promise<boolean>; realBound?: unknown };
        core.realBound = core.bound;
        core.bound = async () => {
          throw new Error("registry unavailable");
        };
      });
    }
    const registryBack = (room: TestRoom) =>
      inDO(room, (r) => {
        const core = r.core as { bound: unknown; realBound?: unknown };
        core.bound = core.realBound;
      });

    // The checker's controls (review of 12227d41): a failure before the work begins backs off too.
    it("a publication on a cold instance whose registry throws (R-PUB-10): it fails closed, backs off 5, 10, 20, 40, 80 s, and is logged each time; when the registry answers again the next retry publishes", async () => {
      const room = await released();
      await coldRegistry(room);
      const pushes = room.world.log.pushes;
      const ran = await alarmsUntil(room, clock.now + 10 * minute);
      expect(gapsOf(ran).slice(0, 5)).toEqual([5_000, 10_000, 20_000, 40_000, 80_000]);
      // Fail-closed: nothing was pushed, nothing is published.
      expect(room.world.log.pushes).toBe(pushes);
      expect(room.world.log.ref).toBeNull();
      expect((await read(room, { q: "log" })).publishedThrough).toBe(-1);
      expect(await inDO(room, (r) => JSON.parse(r.core.sql.all("SELECT v FROM meta WHERE k = 'publication_retry'")[0]!["v"] as string).attempts)).toBe(ran.length);
      expect(room.world.diagnoses.filter((d) => d.event === "publication-failed" && d.step === "publish").map((d) => d.message)).toEqual(ran.map(() => "registry unavailable"));
      // A forced publication says why, as before.
      expect((await failure(room.stub.publishLog())).code).toBe("unavailable");
      await registryBack(room);
      await alarmsUntil(room, clock.now + 10 * minute);
      expect((await read(room, { q: "log" })).publishedThrough).toBeGreaterThanOrEqual(2);
    });

    it("a landing on a cold instance whose registry throws: it fails closed and backs off, instead of asking for the alarm at once; when the registry answers again the operation lands", async () => {
      const room = await makeRoom();
      const { lane, head } = await proposed(room, room.admin, ["src/**"], { "src/app.ts": "v2" });
      await coldRegistry(room);
      const l = await land(room.admin, lane, head);
      // The engine has an accepted operation: it is due at once, every time it is asked.
      expect(await inDO(room, (r) => r.core.landing.nextDue())).toBe(clock.now);
      const main = room.world.artifacts.main;
      const ran = await alarmsUntil(room, clock.now + 10 * minute);
      expect(Math.min(...gapsOf(ran))).toBeGreaterThanOrEqual(ALARM.pendingIntervalMs);
      // The landing and the publication each back off on their own: at most 7 tries each in 10 minutes.
      expect(ran.length).toBeLessThanOrEqual(16);
      expect(room.world.artifacts.main).toBe(main);
      expect(room.world.artifacts.remoteCalls.get("push") ?? 0).toBe(0);
      const logged = room.world.diagnoses.filter((d) => d.event === "step-failed" && d.step === "landing");
      expect(logged.length).toBeGreaterThan(0);
      expect(logged.length).toBeLessThanOrEqual(8);
      expect(logged.every((d) => d.message === "registry unavailable")).toBe(true);
      await registryBack(room);
      await alarmsUntil(room, clock.now + 10 * minute);
      expect((await opOf(room, l.op.id)).state).toBe("landed");
    });

    it("a failing step on the 5-second loop (a pin) backs off to the cap, logging each failure once, and the backoff resets once it succeeds", async () => {
      const room = await makeRoom();
      const claim = await room.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
      const head = pushChange(room, claim.lane, { "src/app.ts": "v2" });
      // The pin's ref write fails, as an outage would, for more attempts than the test makes.
      room.world.artifacts.failRemote("pinRef", ...Array.from({ length: 50 }, () => new Error("Artifacts is unavailable (pinRef)")));
      await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "v2" });
      await tick(room);
      const pins = () => inDO(room, (r) => r.core.sql.all("SELECT done FROM pins"));
      expect(await pins()).toEqual([{ done: 0 }]);
      const ran = await alarmsUntil(room, clock.now + 25 * minute);
      const gaps = gapsOf(ran);
      // The publication runs on its own schedule; the pin's alarms back off to the cap.
      expect(Math.max(...gaps)).toBe(ALARM.retryBackoffMaxMs);
      expect(gaps.filter((g) => g === ALARM.pendingIntervalMs).length).toBeLessThanOrEqual(2);
      expect(ran.length).toBeLessThanOrEqual(12);
      expect(await pins()).toEqual([{ done: 0 }]);
      // Each failed retry is logged through the shared diagnosis (request d268d249), so no more often than it runs.
      const pinLogs = room.world.diagnoses.filter((d) => d.event === "step-failed" && d.step === "pins");
      expect(pinLogs.length).toBeGreaterThan(0);
      expect(pinLogs.length).toBeLessThanOrEqual(ran.length + 1);
      expect(pinLogs[0]).toMatchObject({ name: "Error", message: "Artifacts is unavailable (pinRef)" });
      expect(await inDO(room, (r) => r.core.sql.all("SELECT 1 FROM meta WHERE k = 'loop_backoff'").length)).toBe(1);
      room.world.artifacts.recover();
      await alarmsUntil(room, clock.now + 30 * minute);
      expect(await inDO(room, (r) => ({ pins: r.core.sql.all("SELECT done FROM pins"), backoff: r.core.sql.all("SELECT v FROM meta WHERE k = 'loop_backoff'") }))).toEqual({ pins: [{ done: 1 }], backoff: [] });
    });

    it("a failed pin keeps its backoff when other work fires the alarm first: a lease's expiry, a notification's retry and a check job's retry all run a second later, the pin is not retried, and the next alarm is no later than the pin's", async () => {
      const cfg: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: `sha256:${"0".repeat(64)}` };
      const base = policy(requireCheck("unit", { paths: "src/**", by: "role:checker", id: "unit-tests" }));
      const doc: PolicyDocument = { ...base, rules: [...base.rules, ...notifying("tell-admins", "propose", "A proposal.").rules.filter((r) => r.kind === "notify")] };
      const room = await makeRoom({ policy: doc, files: { ".artroom/checkers/unit.json": JSON.stringify(cfg), "package.json": "{}" } });
      // The checker service does not answer: the job is owed again, due at its retry time. The notify rule fails too.
      let jobsSent = 0;
      room.world.checkers["unit"] = {
        handle: async () => {
          jobsSent++;
          throw new Error("checker service unavailable");
        },
      };
      room.world.policy.failures.notify = 1_000;
      const claim = await room.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
      const other = await room.admin.ok<Claim>("claim", null, { goal: "other", scope: ["docs/**"] });
      const head = pushChange(room, claim.lane, { "src/app.ts": "v2" });
      room.world.artifacts.failRemote("pinRef", ...Array.from({ length: 50 }, () => new Error("pin outage")));
      await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "v2" });
      await tick(room);
      const pinCalls = () => room.world.artifacts.remoteCalls.get("pinRef") ?? 0;
      const calls = pinCalls();
      const pinDue = await inDO(room, (r) => r.core.loopBackoff().pins!.next);
      expect(pinDue).toBe(clock.now + ALARM.pendingIntervalMs);
      // All three due a second from now, before the pin's backoff ends.
      const soon = clock.now + 1_000;
      await inDO(room, (r) => {
        expect(r.core.sql.all("SELECT 1 FROM notify_queue").length).toBe(1);
        expect(r.core.sql.all("SELECT 1 FROM check_jobs WHERE state = 'owed'").length).toBe(1);
        r.core.sql.all("UPDATE lanes SET expires_ms = ? WHERE id = ?", soon, other.lane);
        r.core.sql.all("UPDATE notify_queue SET next_ms = ?", soon);
        r.core.sql.all("UPDATE check_jobs SET next_ms = ? WHERE state = 'owed'", soon);
      });
      const before = { notify: room.world.policy.calls.notify, jobs: jobsSent };
      expect(await nextAlarm(room)).toBe(soon);
      advance(1_000);
      expect(await runDurableObjectAlarm(stubOf(room))).toBe(true);
      expect(pinCalls()).toBe(calls);
      expect((await entries(room)).filter((e) => kindOf(e) === "lease-expired")).toHaveLength(1);
      expect(room.world.policy.calls.notify).toBeGreaterThan(before.notify);
      expect(jobsSent).toBeGreaterThan(before.jobs);
      // The backoff is unchanged, and the next alarm is the earliest due work, the pin's included.
      const after = await inDO(room, (r) => ({ pin: r.core.loopBackoff().pins!.next, alarm: r.core.nextAlarm() }));
      expect(after.pin).toBe(pinDue);
      expect(after.alarm).toBeLessThanOrEqual(pinDue);
      clock.now = pinDue;
      expect(await runDurableObjectAlarm(stubOf(room))).toBe(true);
      expect(pinCalls()).toBeGreaterThan(calls);
    });
  });

  describe("request 3da1d82b: a room whose canonical repository is gone", () => {
    it("stops rescheduling work that cannot succeed, surfaces one admin item, and keeps the unknown cohort and the owed revocation; a later act and a forced publication each try once more and schedule nothing; when the repository comes back a forced publication confirms the kept cohort and the item closes", async () => {
      // The smoke run's shape: a workspace, a proposal, a landing whose token revocation is still owed, a release, and a
      // publication whose answer was lost (an unknown effect). Then the cleanup deletes the fork and the canonical repository.
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
      expect((await opOf(room, l.op.id)).state).toBe("landed");
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
      const state = () =>
        inDO(room, (r) => ({
          cohort: r.core.pendingPublication(),
          owed: r.core.landing.core.tokenCleanup().map((t) => ({ op: t.op, n: t.n })),
          pins: r.core.sql.all("SELECT ref, done FROM pins WHERE done = 0"),
        }));
      const kept = await state();
      expect(kept.cohort).not.toBeNull();
      expect([kept.owed.length, kept.pins.length]).toEqual([1, 1]);
      room.world.artifacts.recover();
      // The log ref as the lost push left it (read before the deletion: the fake makes the repository again when read).
      const ref = room.world.log.ref;
      const a = room.world.artifacts;
      await a.binding.delete(forkName(a.canonical, claim.lane));
      expect(await a.binding.delete(a.canonical)).toBe(true);
      const stalled = async () => ((await read(room, { q: "attention", all: true } as never)) as { items: AttentionItem[] }).items.filter((i) => i.why === "log-publication-stalled");

      const w = await spy(room);
      const start = clock.now;
      const ran = await alarmsUntil(room, start + 2 * hour);
      await stillSpied(room, w);
      // A few runs (lane B's owed revocation on its own backoff, until the publication's retry finds the repository
      // gone), then no alarm at all: nothing like the 720 an hour the spike saw.
      expect(ran.length).toBeLessThanOrEqual(6);
      expect(ran.every((t) => t - start <= 10 * minute)).toBe(true);
      expect(await nextAlarm(room)).toBeNull();
      // The failure and the probe that found the repository gone are both logged (request d268d249).
      const logs = room.world.diagnoses.filter((d) => d.event === "publication-failed");
      expect(logs.map((d) => d.step)).toEqual(expect.arrayContaining(["publish", "canonicalProbe"]));
      expect(logs.find((d) => d.step === "canonicalProbe")!.message).toContain("NOT_FOUND");
      const logged = room.world.diagnoses.length;
      // Exactly one admin item, open, naming the repository.
      let items = await stalled();
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ why: "log-publication-stalled", reason: "repository-gone", open: true });
      expect((items[0] as { detail: string }).detail).toContain("NOT_FOUND");
      // Nothing settled or dropped: the same cohort is pending, the owed revocation is still owed.
      expect(await state()).toEqual(kept);
      // A preview left pending also waits while the repository is gone. Two more idle hours: nothing written, no alarm.
      await inDO(room, (r) => r.core.sql.all("UPDATE previews SET state = 'pending'"));
      const rows = w.rows;
      const alarms = w.alarms;
      expect(await alarmsUntil(room, clock.now + 2 * hour)).toEqual([]);
      for (let i = 0; i < 3; i++) {
        advance(minute);
        await inDO(room, (r) => r.alarm());
      }
      expect({ rows: w.rows - rows, alarms: w.alarms - alarms }).toEqual({ rows: 0, alarms: 0 });
      expect(room.world.diagnoses.length).toBe(logged);

      // A note is a real entry: it makes the log due once, after a minute.
      await room.admin.ok<Note>("note", { act: claim.id }, { text: "still here" });
      expect((await alarmsUntil(room, clock.now + hour)).length).toBe(1);
      expect(await nextAlarm(room)).toBeNull();
      // An operator's forced publication tries, fails, and schedules nothing.
      expect((await failure(room.stub.publishLog())).code).toBe("unavailable");
      expect(await nextAlarm(room)).toBeNull();
      expect(await stalled()).toHaveLength(1);

      // The repository is restored, at the same name, with the log ref the lost push wrote.
      room.world.log.ref = ref;
      const p = await call<{ through: number; commit: Sha } | null>(room.stub.publishLog());
      expect(p?.through).toBe(kept.cohort!.through);
      items = await stalled();
      expect(items.map((i) => i.open)).toEqual([false]);
      expect(await inDO(room, (r) => r.core.canonicalGone())).toBeNull();
      // The owed revocation is due again (lane B's own backoff), so the alarm is set.
      expect(await nextAlarm(room)).not.toBeNull();
    });

    it("while the repository is gone, work that needs it is kept, and neither run nor scheduled: workspace setup, the mint ledger's owed revocations, and ended job tokens", async () => {
      const room = await makeRoom();
      const claim = await room.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
      await openedWorkspace(room, claim.lane);
      const a = room.world.artifacts;
      a.failRemote("revokeToken", new FakeArtifactsError("INTERNAL_ERROR", 10400));
      const jobToken = a.canonicalRepo().mint("read", 3600).id;
      let reconciles = 0;
      await inDO(room, async (r) => {
        const t = await r.core.mints.mint("test:owed", "read", () => 60);
        await t.release();
        r.core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES (?, ?, ?, 'ended')", jobToken, clock.now + 3600_000, clock.now);
        r.core.sql.all("INSERT INTO meta (k, v) VALUES ('canonical_gone', ?)", JSON.stringify({ since: iso(clock.now), head: r.core.headSeq() }));
        const real = r.core.mints.reconcile.bind(r.core.mints);
        r.core.mints.reconcile = async () => {
          reconciles++;
          return real();
        };
      });
      a.recover();
      const calls = () => ({ fork: a.remoteCalls.get("fork") ?? 0, revoke: a.remoteCalls.get("revokeToken") ?? 0 });
      const before = calls();
      clock.now += 2_000;
      // Only the lease's expiry is scheduled, not the 5-second loop for the setup, the ledger's due time or the job token's.
      expect(await inDO(room, (r) => ({ provision: r.core.loopPendingKinds().has("provision"), ledgerDue: r.core.mints.nextDue() !== null, alarm: r.core.nextAlarm() }))).toEqual({ provision: true, ledgerDue: true, alarm: await leaseEnd(room, claim.lane) });
      await inDO(room, (r) => r.alarm());
      await inDO(room, (r) => r.core.idle());
      expect(calls()).toEqual(before);
      expect(reconciles).toBe(0);
      expect(await inDO(room, (r) => ({ ws: r.core.workspaces.view(claim.lane)?.state, owed: r.core.mints.duties().owed, jobTokens: r.core.sql.all("SELECT token_id FROM job_tokens").length }))).toEqual({ ws: "pending", owed: 1, jobTokens: 1 });
    });
  });
});

describe("tokens: the mint ledgers and check jobs", () => {
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
});

/**
 * The log and its publication: construction and notify after commit (R-LOG,
 * R-POL-5), publication without holding the log in memory (request
 * 5a7290b9) and in bounded transfers (lane B follow-up revision 3), and the
 * alarm's economy (request 3da1d82b): an idle room writes nothing, failing
 * work backs off, and a room whose canonical repository is gone stops.
 *
 * The idle and backoff tests run the real Room Durable Object through its
 * real `alarm()`, and count storage writes with a spy on that object only.
 */

import { describe, expect, it } from "vitest";
import { evictDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import type { AttentionItem, CheckerConfig, Claim, EnvelopeKind, Landing, Note, PolicyDocument, Sha, SystemEvent, WorkspaceOp } from "@generalbusiness/artroom-contract";
import { policy, requireCheck, rule } from "@generalbusiness/artroom-policy/helpers";
import { forkName, type LogPushRequest, type LogStageRequest } from "@generalbusiness/artroom-git";
import { READ_LIMITS, verifyLog, type GitReader } from "@generalbusiness/artroom-log";
import { ALARM } from "../../src/budgets.ts";
import { digestJson } from "../../src/crypto.ts";
import { FakeArtifactsError } from "../../src/memory/artifacts.ts";
import { entries, events, idOf, inDO, kindOf, land, opOf, proposed, read, stubOf } from "./core-support.ts";
import { advance, call, clock, expectOk, failure, hour, iso, makeRoom, openedWorkspace, pushChange, tick, type TestRoom } from "./support.ts";

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

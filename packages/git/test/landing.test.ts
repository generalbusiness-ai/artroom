// The landing operation (plan section 8; protocol R-LAND, R-PUB, R-REV-5),
// against real SQLite and the canonical repository in memory
// (`MemoryCanonical`): the engine's own transactions, retries, restarts and
// ordering are real, and no test here starts a process. The same engine over
// real git, and the proof that the memory repository answers as real git
// does, are in git-publisher.test.ts. Test names start with the plan's
// acceptance case or the rule they show.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpId, Sha } from "@generalbusiness/artroom-contract";
import { Landing, REVOKE_TIMEOUT_MS, type FaultPoint } from "../src/landing/engine.ts";
import { TOKEN_CLEANUP_BACKOFF } from "../src/landing/core.ts";
import type { Sql } from "../src/sql.ts";
import { createHash } from "node:crypto";
import {
  Clock,
  ControlledPublisher,
  FakeRoom,
  FakeTokens,
  LedgerHost,
  MemoryCanonical,
  actId,
  deferred,
  edit,
  laneId,
  lines,
  nodeSql,
  opId,
} from "./support.ts";

class Crash extends Error {}

async function world() {
  const f = new MemoryCanonical().init();
  const room = new FakeRoom();
  const tokens = new FakeTokens();
  const clock = new Clock();
  const sql = nodeSql();
  const pub = new ControlledPublisher(f.publisher);
  const engines: Landing[] = [];
  const make = (fault?: (p: FaultPoint, op: OpId) => void, opts: { revokeTimeoutMs?: number } = {}) => {
    for (const e of engines) e.kill(); // a restart replaces the old instance
    const e = new Landing({ sql, room, publisher: pub, tokens, now: clock.now, ...(fault ? { fault } : {}), ...opts });
    engines.push(e);
    return e;
  };
  const engine = make();
  await engine.refreshMain();
  /** Propose generation `g` of lane `n` with `files`, hold it, and accept a landing. */
  const land = async (n: number, files: Record<string, string>, opts: { base?: string; generation?: number; accept?: boolean } = {}) => {
    const g = opts.generation ?? 1;
    const head = await f.propose(laneId(n), g, opts.base ?? f.main, files);
    room.hold(laneId(n), g, head);
    const id = opId(n);
    if (opts.accept !== false) {
      const r = current().accept({ id, lane: laneId(n), generation: g, head, act: actId(500 + n), leaseGeneration: 1, policyVersion: room.policy });
      assert.ok(!("refused" in r), "accepted");
    }
    return { id, head, lane: laneId(n) };
  };
  const current = () => engines[engines.length - 1]!;
  const dispose = () => f.dispose();
  return { f, room, tokens, clock, sql, pub, make, engine, land, current, dispose };
}

type World = Awaited<ReturnType<typeof world>>;

/** Prepare then reserve one operation. */
async function readyAndReserve(w: World, id: OpId) {
  await w.current().prepare(id);
  assert.equal(w.current().view(id)?.state, "ready");
  const r = w.current().reserve(id);
  assert.equal(r.kind, "reserved");
  return r;
}

function landedCount(w: World, id?: OpId) {
  return w.room.events("land-outcome", id).filter((e) => e.outcome.state === "landed").length;
}

function noTokens(w: World, id: OpId) {
  const shown = JSON.stringify([w.current().view(id), w.current().status(), w.current().slot(), w.room.log]);
  assert.ok(!/art_v\d/.test(shown), "a token appears in a view, the status or the log");
}

// --------------------------------------------------------------------------

test("a landing goes accepted → preparing → ready → publishing → landed, with one receipt and its token revoked", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id, head } = await w.land(1, { "src/c.txt": "c\n" });
  assert.equal(w.engine.view(id)?.state, "accepted");
  await readyAndReserve(w, id);
  assert.deepEqual(w.engine.slot(), { state: "held", op: id, publication: 1, reservedAt: w.room.events("land-reserved")[0] && w.room.log.find((e) => e.event.type === "land-reserved")!.seq });
  assert.equal(await w.engine.publish(), true);
  const v = w.engine.view(id);
  assert.equal(v?.state, "landed");
  assert.equal(await w.f.canonicalMain(), head);
  assert.equal(landedCount(w, id), 1);
  assert.deepEqual(w.engine.slot(), { state: "free", last: 1 });
  assert.equal(w.tokens.minted, 1);
  assert.equal(w.tokens.live.size, 0);
  noTokens(w, id);
  assert.deepEqual(w.room.log.map((e) => e.event.type), ["land-reserved", "land-outcome"]);
});

test("R-LAND-1/R-LANE-10: a second landing on a lane in flight is refused", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { lane, head } = await w.land(1, { "src/c.txt": "c\n" });
  const r = w.engine.accept({ id: opId(99), lane, generation: 1, head, act: actId(599), leaseGeneration: 1, policyVersion: w.room.policy });
  assert.ok("refused" in r && r.rule === "land-in-progress");
});

// ------------------------------------------------------- crash recovery

const CRASH_POINTS: FaultPoint[] = ["attempt-recorded", "token-minted", "push-in-flight", "push-returned", "token-revoked", "read-back"];

for (const point of CRASH_POINTS) {
  test(`crash at ${point}: the restarted room's alarm completes forward and lands exactly once (R-PUB-5, R-PUB-7)`, async (t) => {
    const w = await world();
    t.after(w.dispose);
    const { id, head } = await w.land(1, { "src/c.txt": "c\n" });
    let fired = false;
    const crashing = w.make((p) => {
      if (p === point && !fired) {
        fired = true;
        throw new Crash(p);
      }
    });
    await readyAndReserve(w, id);
    await assert.rejects(crashing.publish(), Crash);
    await w.pub.drain(); // a push that started still reaches the remote
    const pushedBefore = w.pub.pushes;
    const pushLanded = (await w.f.canonicalMain()) === head;
    // Restart.
    const restarted = w.make();
    await restarted.reconcile();
    assert.equal(restarted.view(id)?.state, "landed");
    assert.equal(await w.f.canonicalMain(), head);
    assert.equal(landedCount(w, id), 1);
    assert.equal(w.tokens.live.size, 0, "every publication token is revoked");
    assert.deepEqual(restarted.slot(), { state: "free", last: 1 });
    // Crash before push: the restart pushes. Crash after push: it reads back and does not push again.
    assert.equal(w.pub.pushes - pushedBefore, pushLanded ? 0 : 1);
    assert.equal(pushLanded, !["attempt-recorded", "token-minted"].includes(point));
  });
}

test("crash before push, with a ready operation behind it: no later operation reserves until the slot is resolved (R-PUB-7, R-PUB-8)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const a = await w.land(1, { "src/c.txt": "c\n" });
  const b = await w.land(2, { "src/d.txt": "d\n" });
  const crashing = w.make((p) => {
    if (p === "attempt-recorded") throw new Crash(p);
  });
  await crashing.prepare(b.id);
  await readyAndReserve(w, a.id);
  await assert.rejects(crashing.publish(), Crash);
  const restarted = w.make();
  assert.deepEqual(restarted.core.reserveNext(), null, "the slot is still held");
  await restarted.settle();
  assert.equal(restarted.view(a.id)?.state, "landed");
  assert.equal(restarted.view(b.id)?.state, "landed");
  const reserved = w.room.events("land-reserved");
  assert.deepEqual(reserved.map((e) => [e.op, e.publication]), [[a.id, 1], [b.id, 2]]);
  assert.equal(reserved[1]?.expectedMain, a.head, "b re-prepared on a's landing");
});

// ------------------------------------------------------- parallel preparation

test("two operations preparing in parallel: one lands, the other re-prepares on the new main and lands, and both changes survive (R-LAND-4, R-LAND-5, R-LAND-10)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const a = await w.land(1, { "src/a.txt": edit(lines("a"), 2, "from lane a") });
  const b = await w.land(2, { "src/b.txt": edit(lines("b"), 2, "from lane b") });
  w.pub.pauseIntegrations = true;
  const both = Promise.all([w.engine.prepare(a.id), w.engine.prepare(b.id)]);
  await w.pub.waitPaused(2, "integration");
  for (const p of w.pub.pausedIntegrations) p.release();
  w.pub.pauseIntegrations = false;
  await both;
  assert.equal(w.engine.view(a.id)?.state, "ready");
  assert.equal(w.engine.view(b.id)?.state, "ready");
  await readyAndReserve(w, a.id);
  await w.engine.publish();
  assert.equal(w.engine.view(a.id)?.state, "landed");
  // b's integration was built on the old main: it goes back to preparing.
  const bv = w.engine.view(b.id);
  assert.equal(bv?.state, "preparing");
  assert.equal(bv?.expectedMain, a.head);
  assert.equal(bv?.attempts, 2);
  await w.engine.settle();
  const final = w.engine.view(b.id);
  assert.equal(final?.state, "landed");
  const main = await w.f.canonicalMain();
  assert.equal(main, final && "integration" in final ? final.integration : null, "what landed is the integration that was prepared");
  assert.match(await w.f.show(main, "src/a.txt"), /from lane a/);
  assert.match(await w.f.show(main, "src/b.txt"), /from lane b/);
  assert.deepEqual(w.f.parents(main), [a.head, b.head], "a merge of b's head onto a's landing");
});

// ------------------------------------------------------- invalidation before reservation

for (const kind of ["release", "new generation", "policy activation"] as const) {
  test(`${kind} during preparation invalidates the operation (R-LAND-6, R-LAND-9, R-POL-9)`, async (t) => {
    const w = await world();
    t.after(w.dispose);
    const { id, lane, head } = await w.land(1, { "src/c.txt": "c\n" });
    w.pub.pauseIntegrations = true;
    const preparing = w.engine.prepare(id);
    await w.pub.waitPaused(1, "integration");
    if (kind === "release") {
      w.room.lanes.set(lane, { generation: 1, head, leaseGeneration: 1, holder: "released" });
      assert.deepEqual(w.engine.laneChanged(lane, "released").map((o) => o.id), [id]);
    } else if (kind === "new generation") {
      w.room.lanes.set(lane, { generation: 2, head: "e".repeat(40) as Sha, leaseGeneration: 1, holder: "held" });
      assert.deepEqual(w.engine.laneChanged(lane, "generation-moved").map((o) => o.id), [id]);
    } else {
      w.room.policy = actId(2);
      assert.deepEqual(w.engine.policyActivated(w.room.policy), [id]);
    }
    w.pub.pauseIntegrations = false;
    w.pub.pausedIntegrations[0]!.release();
    await preparing; // the stale build result is dropped (R-LAND-3)
    const v = w.engine.view(id);
    if (kind === "policy activation") {
      assert.equal(v?.state, "preparing");
      assert.equal(v?.attempts, 2);
      assert.equal(v?.policyVersion, actId(2));
      await w.engine.settle();
      assert.equal(w.engine.view(id)?.state, "landed");
      assert.equal(w.room.events("land-reserved")[0]?.op, id);
    } else {
      assert.equal(v?.state, "retryable");
      assert.equal(v && "reason" in v ? v.reason : null, kind === "release" ? "released" : "generation-moved");
      assert.equal(w.room.events("land-reserved").length, 0);
      assert.equal(await w.f.canonicalMain(), w.f.main);
    }
  });
}

test("R-LAND-3: a lane change the Room did not report is caught when the build returns", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id, lane, head } = await w.land(1, { "src/c.txt": "c\n" });
  w.room.lanes.set(lane, { generation: 1, head, leaseGeneration: 2, holder: "held" }); // taken over
  await w.engine.prepare(id);
  const v = w.engine.view(id);
  assert.equal(v?.state, "retryable");
  assert.equal(v && "reason" in v ? v.reason : null, "lease-changed");
});

test("R-LAND-7: reservation re-validates authority, evidence and the land input in its one transaction", async (t) => {
  for (const reason of ["authority-lost", "evidence-invalid", "obligation-open"] as const) {
    const w = await world();
    t.after(w.dispose);
    const { id } = await w.land(1, { "src/c.txt": "c\n" });
    await w.engine.prepare(id);
    w.room.invalid.set(id, { reason, fix: "x" });
    assert.deepEqual(w.engine.reserve(id), { kind: "retryable", reason });
    assert.equal(w.engine.view(id)?.state, "retryable");
    assert.deepEqual(w.engine.slot(), { state: "free", last: 0 });
    assert.equal(w.room.events("land-reserved").length, 0);
  }
});

test("R-LAND-7: a generation change at reservation ends the operation; a main move re-prepares it", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const a = await w.land(1, { "src/c.txt": "c\n" });
  await w.engine.prepare(a.id);
  w.room.lanes.set(a.lane, { generation: 2, head: "e".repeat(40) as Sha, leaseGeneration: 1, holder: "held" });
  assert.deepEqual(w.engine.reserve(a.id), { kind: "retryable", reason: "generation-moved" });

  const b = await w.land(2, { "src/d.txt": "d\n" });
  await w.engine.prepare(b.id);
  const moved = await w.f.propose(laneId(9), 1, w.f.main, { "src/z.txt": "z\n" });
  w.f.setMain(moved);
  w.engine.core.observeMain(moved);
  assert.equal(w.engine.view(b.id)?.state, "preparing");
  assert.equal(w.engine.view(b.id)?.expectedMain, moved);
});

test("R-ADMIN-8: a configuration-recovery landing has no land input and lands; a flagged approval that no longer counts stops it at reservation", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const a = await w.land(1, { ".artroom/policy.json": "{}\n" });
  w.room.readinessOf.set(a.id, () => ({ kind: "ready", evidence: [actId(77)], retained: null }));
  await w.engine.prepare(a.id);
  const v = w.engine.view(a.id);
  assert.equal(v?.state === "ready" ? v.landInput : "x", null);
  await w.engine.settle();
  assert.equal(w.engine.view(a.id)?.state, "landed");

  const b = await w.land(2, { ".artroom/checkers/tests.json": "{}\n" }, { base: a.head });
  w.room.readinessOf.set(b.id, () => ({ kind: "ready", evidence: [actId(78)], retained: null }));
  await w.engine.prepare(b.id);
  w.room.invalid.set(b.id, { reason: "evidence-invalid", fix: "a second admin exists: the sole-admin self-approval no longer counts" });
  assert.deepEqual(w.engine.reserve(b.id), { kind: "retryable", reason: "evidence-invalid" });
});

test("a conflict fails the operation with the paths; a failing check fails it; waiting obligations keep it preparing", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const other = await w.f.propose(laneId(9), 1, w.f.main, { "src/a.txt": edit(lines("a"), 3, "main side") });
  w.f.setMain(other);
  w.engine.core.observeMain(other as Sha);
  const a = await w.land(1, { "src/a.txt": edit(lines("a"), 3, "lane side") });
  await w.engine.prepare(a.id);
  const v = w.engine.view(a.id);
  assert.deepEqual(v?.state === "failed" ? v.reason : null, { code: "conflict", paths: ["src/a.txt"] });

  const b = await w.land(2, { "src/d.txt": "d\n" }, { base: other });
  let checked = false;
  w.room.readinessOf.set(b.id, () =>
    checked ? { kind: "failed", reason: { code: "check-failed", check: actId(88) } } : { kind: "waiting", obligations: ["obl_tests"] },
  );
  await w.engine.prepare(b.id);
  const waiting = w.engine.view(b.id);
  assert.deepEqual(waiting?.state === "preparing" ? waiting.waiting : null, ["obl_tests"]);
  checked = true;
  await w.engine.evaluate(b.id);
  assert.equal(w.engine.view(b.id)?.state, "failed");
});

// ------------------------------------------------------- after reservation

test("the push is paused: a release, a new generation, an objecting review and a retired revocation are admitted after the reservation, and the landing completes (R-LAND-8, R-REV-7)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id, lane, head } = await w.land(1, { "src/c.txt": "c\n" });
  const r = await readyAndReserve(w, id);
  w.pub.pausePushes = true;
  const publishing = w.engine.publish();
  await w.pub.waitPaused(1);
  // The Room admits each act and stamps its receipt with `after`.
  const reservedAt = r.kind === "reserved" ? r.reservedAt : -1;
  w.room.lanes.set(lane, { generation: 1, head, leaseGeneration: 1, holder: "released" });
  assert.deepEqual(w.engine.laneChanged(lane, "released"), [], "a release does not touch a reserved landing");
  assert.deepEqual(w.engine.after(), { op: id, reservedAt });
  w.room.lanes.set(lane, { generation: 2, head: "e".repeat(40) as Sha, leaseGeneration: 2, holder: "held" });
  assert.deepEqual(w.engine.laneChanged(lane, "generation-moved"), []);
  assert.deepEqual(w.engine.after(), { op: id, reservedAt }, "objecting review: admitted after the reservation");
  w.room.invalid.set(id, { reason: "authority-lost", fix: "retired" });
  assert.deepEqual(w.engine.after(), { op: id, reservedAt }, "retired revocation: admitted after the reservation");
  w.room.policy = actId(3);
  assert.deepEqual(w.engine.policyActivated(w.room.policy), [], "a policy activation does not touch it either");
  w.pub.paused[0]!.release();
  await publishing;
  assert.equal(w.engine.view(id)?.state, "landed");
  assert.equal(await w.f.canonicalMain(), head);
  assert.equal(w.engine.after(), null);
});

test("the push is paused and a key that is evidence is revoked as compromised; the paused push completes: landed, with a revert lane (R-REV-5, R-REV-6)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id, head } = await w.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(w, id);
  w.pub.pausePushes = true;
  const publishing = w.engine.publish();
  await w.pub.waitPaused(1);
  assert.equal(w.engine.abort(actId(900), "key_compromised", 900)?.id, id);
  assert.equal(await w.engine.enforceAbort(), true);
  // The push had already authenticated, so revoking its token does not stop it here.
  w.pub.paused[0]!.release();
  await publishing;
  const v = w.engine.view(id);
  assert.equal(v?.state, "landed");
  assert.equal(await w.f.canonicalMain(), head);
  assert.ok(v?.state === "landed" && v.revertLane && v.abort?.tokenRevoked === true);
  assert.deepEqual(
    w.room.log.map((e) => e.event.type),
    ["land-reserved", "abort-attempt", "land-outcome", "revert-lane"],
  );
});

test("the push is paused and a compromised revocation arrives; the push is refused at the remote because its token was revoked: aborted (R-REV-5, R-PUB-6)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(w, id);
  w.pub.pausePushes = true;
  w.pub.authAtRemote = w.tokens; // this push has not authenticated yet
  const publishing = w.engine.publish();
  await w.pub.waitPaused(1);
  w.engine.abort(actId(900), "key_compromised", 900);
  await w.engine.enforceAbort();
  w.pub.paused[0]!.release();
  await publishing;
  const v = w.engine.view(id);
  assert.equal(v?.state, "aborted");
  assert.equal(await w.f.canonicalMain(), w.f.main);
  assert.deepEqual(w.engine.slot(), { state: "free", last: 1 });
  assert.equal(w.room.events("land-outcome", id)[0]?.outcome.state, "aborted");
});

test("the push is paused and a compromised revocation arrives; the push gives no answer: unresolved, slot held, no further push, never guessed (R-REV-5)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  const b = await w.land(2, { "src/d.txt": "d\n" });
  await w.engine.prepare(b.id);
  await readyAndReserve(w, id);
  w.pub.pausePushes = true;
  const publishing = w.engine.publish();
  await w.pub.waitPaused(1);
  w.engine.abort(actId(900), "key_compromised", 900);
  await w.engine.enforceAbort();
  w.pub.paused[0]!.abandon();
  await publishing;
  const v = w.engine.view(id);
  assert.equal(v?.state, "unresolved");
  assert.ok(v?.state === "unresolved" && v.abort);
  for (let i = 0; i < 5; i++) {
    w.clock.advance(3_600_000);
    await w.engine.reconcile();
  }
  assert.equal(w.pub.pushes, 1, "no forward push after an abort attempt");
  assert.equal(w.engine.view(id)?.state, "unresolved");
  assert.equal(w.engine.view(b.id)?.state, "ready", "no later operation reserves");
  assert.equal(w.engine.status()?.aborting, true);
  // The old push finally lands: the outcome is landed, with a revert lane.
  w.pub.paused[0]!.release();
  await w.pub.drain();
  w.clock.advance(3_600_000);
  await w.engine.reconcile();
  const end = w.engine.view(id);
  assert.equal(end?.state, "landed");
  assert.ok(end?.state === "landed" && end.revertLane);
});

test("a delayed, already-authenticated push completes after its token's expiry and after a forward retry: one landed receipt, and no operation reserved in between (R-PUB-2, R-PUB-5, R-PUB-8)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id, head } = await w.land(1, { "src/c.txt": "c\n" });
  const b = await w.land(2, { "src/d.txt": "d\n" });
  await w.engine.prepare(b.id);
  await readyAndReserve(w, id);
  w.pub.pausePushes = true;
  const first = w.engine.publish();
  await w.pub.waitPaused(1);
  w.clock.advance(120_000); // the 60 s token has expired; the push is still in flight
  w.pub.paused[0]!.abandon(); // the caller's deadline: outcome unknown
  await first;
  assert.equal(w.engine.view(id)?.state, "unresolved");
  assert.equal(w.room.events("publication-unresolved", id).length, 1);
  assert.equal(w.engine.core.reserveNext(), null, "the slot is held");
  // The forward retry: the same integration, the same lease.
  w.pub.pausePushes = false;
  w.clock.advance(1_000);
  await w.engine.publish();
  assert.equal(w.engine.view(id)?.state, "landed");
  assert.equal(await w.f.canonicalMain(), head);
  const reserved = w.room.events("land-reserved");
  assert.deepEqual(reserved.map((e) => e.op), [id], "nothing else reserved while the slot was held");
  // The next operation lands on top.
  await w.engine.settle();
  assert.equal(w.engine.view(b.id)?.state, "landed");
  const mainAfterB = await w.f.canonicalMain();
  assert.notEqual(mainAfterB, head);
  // Now the delayed push arrives. Its lease fails: main is no longer expectedMain.
  w.pub.paused[0]!.release();
  const late = (await w.pub.paused[0]!.done) as { outcome: string; reason?: string };
  assert.deepEqual([late.outcome, late.reason], ["rejected", "lease"]);
  assert.equal(await w.f.canonicalMain(), mainAfterB, "the late push changed nothing");
  assert.equal(landedCount(w, id), 1);
});

test("a delayed push lands while the forward retry is still in flight: still exactly one landed receipt (R-PUB-5, R-PUB-8)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id, head } = await w.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(w, id);
  w.pub.pausePushes = true;
  await Promise.all([w.engine.publish(), (async () => {
    await w.pub.waitPaused(1);
    w.pub.paused[0]!.abandon();
  })()]);
  w.clock.advance(1_000);
  const retry = w.engine.publish();
  await w.pub.waitPaused(2);
  w.pub.paused[0]!.release(); // the first push lands now
  await w.pub.paused[0]!.done;
  assert.equal(await w.f.canonicalMain(), head);
  w.pub.paused[1]!.release(); // the retry finds main already at the integration
  await retry;
  assert.equal(w.engine.view(id)?.state, "landed");
  assert.equal(landedCount(w, id), 1);
});

test("the forward retry itself fails because Artifacts is unavailable: the slot stays held, shown as unresolved, later reservations wait, and elapsed time releases nothing (R-PUB-5, R-PUB-6)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id, head } = await w.land(1, { "src/c.txt": "c\n" });
  const b = await w.land(2, { "src/d.txt": "d\n" });
  await w.engine.prepare(b.id);
  await readyAndReserve(w, id);
  w.pub.pushDown = true;
  await w.engine.publish();
  assert.equal(w.engine.view(id)?.state, "unresolved");
  const since = w.engine.status()?.since;
  assert.ok(since);
  // Hours pass; forward retries keep failing; the token expires many times over.
  for (let i = 0; i < 12; i++) {
    w.clock.advance(30 * 60_000);
    await w.engine.reconcile();
  }
  const s = w.engine.status();
  assert.equal(s?.state, "unresolved");
  assert.equal(s?.since, since, "unresolved since the first failure");
  assert.ok((s?.pushes.length ?? 0) > 3);
  assert.equal(w.engine.view(b.id)?.state, "ready");
  assert.equal(w.room.events("land-reserved").length, 1);
  assert.equal(w.room.events("publication-unresolved", id).length, 1);
  // Reading main also fails for a while: nothing is decided.
  w.pub.readMainDown = true;
  w.clock.advance(60_000);
  await w.engine.reconcile();
  assert.equal(w.engine.view(id)?.state, "unresolved");
  // Artifacts recovers: the next forward retry lands it, then b reserves.
  w.pub.pushDown = false;
  w.pub.readMainDown = false;
  w.clock.advance(60_000);
  await w.engine.settle();
  assert.equal(w.engine.view(id)?.state, "landed");
  assert.equal(w.engine.view(b.id)?.state, "landed");
  assert.equal(landedCount(w, id), 1);
  assert.match(await w.f.show(await w.f.canonicalMain(), "src/c.txt"), /c/);
  assert.equal(w.f.parents(await w.f.canonicalMain())[0], head);
  assert.equal(w.tokens.live.size, 0);
});

test("another writer moves main during publication: the slot stays held, pushing stops, and admins see an unexpected writer (R-PUB-5)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(w, id);
  const intruder = await w.f.propose(laneId(9), 1, w.f.main, { "x.txt": "x\n" });
  w.f.setMain(intruder);
  await w.engine.publish();
  const v = w.engine.view(id);
  assert.deepEqual(v?.state === "unresolved" ? v.readBack : null, { main: "unexpected", observed: intruder });
  assert.equal(w.engine.status()?.unexpectedWriter, true);
  for (let i = 0; i < 3; i++) {
    w.clock.advance(3_600_000);
    await w.engine.reconcile();
  }
  assert.equal(w.pub.pushes, 1, "no forward push against another writer");
  assert.equal(w.engine.slot().state, "held");
});

// ------------------------------------------------------- the lease race

test("a lease race on publication: of two reservations only one takes the slot (R-PUB-1)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const a = await w.land(1, { "src/c.txt": "c\n" });
  const b = await w.land(2, { "src/d.txt": "d\n" });
  await Promise.all([w.engine.prepare(a.id), w.engine.prepare(b.id)]);
  const results = [w.engine.reserve(a.id), w.engine.reserve(b.id)];
  assert.deepEqual(results.map((r) => r.kind), ["reserved", "slot-held"]);
});

test("a lease race on publication: two rooms that both believe they hold the slot push to one repo; exactly one lands and the other never records landed (R-PUB-1, R-PUB-4)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  // A second room with its own SQLite, publishing into the same canonical repo.
  const room2 = new FakeRoom();
  const pub2 = new ControlledPublisher(w.f.publisher);
  const e2 = new Landing({ sql: nodeSql(), room: room2, publisher: pub2, tokens: new FakeTokens(), now: w.clock.now });
  await e2.refreshMain();
  const a = await w.land(1, { "src/c.txt": "c\n" });
  const headB = await w.f.propose(laneId(2), 1, w.f.main, { "src/d.txt": "d\n" });
  room2.hold(laneId(2), 1, headB);
  e2.accept({ id: opId(2), lane: laneId(2), generation: 1, head: headB, act: actId(502), leaseGeneration: 1, policyVersion: room2.policy });
  await Promise.all([w.engine.prepare(a.id), e2.prepare(opId(2))]);
  assert.equal(w.engine.reserve(a.id).kind, "reserved");
  assert.equal(e2.reserve(opId(2)).kind, "reserved");
  w.pub.pausePushes = true;
  pub2.pausePushes = true;
  const both = Promise.all([w.engine.publish(), e2.publish()]);
  await Promise.all([w.pub.waitPaused(1), pub2.waitPaused(1)]);
  w.pub.paused[0]!.release();
  pub2.paused[0]!.release();
  await both;
  const states = [w.engine.view(a.id)?.state, e2.view(opId(2))?.state];
  assert.deepEqual([...states].sort(), ["landed", "unresolved"]);
  const loser = states[0] === "landed" ? e2 : w.engine;
  assert.equal(loser.status()?.unexpectedWriter, true);
  const main = await w.f.canonicalMain();
  assert.equal(main, states[0] === "landed" ? a.head : headB);
});

// ------------------------------------------------------- tokens

test("each push attempt mints its own token, and every one is revoked; a failed revocation is retried later (R-PUB-3, R-WS-4)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(w, id);
  w.pub.pushDown = true;
  w.tokens.failRevoke = true;
  await w.engine.publish();
  assert.equal(w.tokens.live.size, 1);
  w.tokens.failRevoke = false;
  w.pub.pushDown = false;
  w.clock.advance(5_000);
  await w.engine.reconcile();
  assert.equal(w.engine.view(id)?.state, "landed");
  assert.equal(w.tokens.minted, 2);
  assert.equal(w.tokens.live.size, 0);
  noTokens(w, id);
});

// ------------------------------------------------------- tokens of terminal operations (plan 003)

test("R-PUB-3: the push lands but its token's revocation fails; after a restart, before the token expires, the alarm revokes it: one receipt, slot free", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id, head } = await w.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(w, id);
  w.tokens.failRevoke = true;
  await w.engine.publish();
  // The landing is confirmed by reading main back; the failed revocation changes nothing about it.
  const landedView = w.engine.view(id);
  assert.equal(landedView?.state, "landed");
  assert.equal(await w.f.canonicalMain(), head);
  assert.deepEqual(w.engine.slot(), { state: "free", last: 1 });
  assert.deepEqual([...w.tokens.live], ["tok_1"]);
  const startedAt = w.clock.t;
  const due = w.engine.nextDue();
  assert.ok(due !== null, "the known token's revocation is still owed");
  assert.ok(due > startedAt, "and is not due at once after it just failed");
  // Artifacts recovers and the room restarts on the same SQLite, well before the 60 s token expires.
  w.tokens.failRevoke = false;
  const restarted = w.make();
  assert.equal(restarted.nextDue(), due, "the due time is durable");
  w.clock.t = due;
  assert.ok(w.clock.t - startedAt < 60_000);
  await restarted.reconcile();
  await restarted.cleanupDone();
  assert.deepEqual([...w.tokens.live], [], "the token is revoked");
  assert.deepEqual(w.tokens.revoked, ["tok_1"]);
  assert.equal(restarted.nextDue(), null, "nothing is owed any more");
  // One receipt, the slot free, the operation's view unchanged but for its update time.
  assert.equal(landedCount(w, id), 1);
  assert.deepEqual(w.room.log.map((e) => e.event.type), ["land-reserved", "land-outcome"]);
  assert.deepEqual(restarted.slot(), { state: "free", last: 1 });
  assert.deepEqual({ ...restarted.view(id), updatedAt: "" }, { ...landedView, updatedAt: "" });
  noTokens(w, id);
});

/** Make revocation of chosen token IDs fail, and count every revocation asked for, by token ID. */
function revocations(w: World) {
  const stuck = new Set<string>();
  const asked = new Map<string, number>();
  const real = w.tokens.revoke.bind(w.tokens);
  w.tokens.revoke = async (id: string) => {
    asked.set(id, (asked.get(id) ?? 0) + 1);
    if (stuck.has(id)) throw new Error("Artifacts unavailable (revoke)");
    return real(id);
  };
  return { stuck, asked };
}

test("R-PUB-3: a failed cleanup keeps a durable later due time with capped backoff, is not retried early, and is never given up, however long the token has expired", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(w, id);
  const r = revocations(w);
  r.stuck.add("tok_1");
  await w.engine.publish();
  assert.equal(w.engine.view(id)?.state, "landed");
  assert.equal(r.asked.get("tok_1"), 1);
  const receipt = w.room.log.length;
  const startedAt = w.clock.t;
  let engine = w.engine;
  let waits: number[] = [];
  for (let i = 0; i < 12; i++) {
    const [owed] = engine.core.tokenCleanup();
    assert.ok(owed && owed.op === id && owed.n === 1, "still owed");
    assert.equal(engine.nextDue(), owed.dueAt);
    assert.ok(owed.dueAt > w.clock.t, "in the future");
    waits.push(owed.backoffMs);
    // Not yet due: an alarm for other work does not try it.
    const before = r.asked.get("tok_1");
    w.clock.t = owed.dueAt - 1;
    await engine.reconcile();
    await engine.cleanupDone();
    assert.equal(r.asked.get("tok_1"), before, "not tried before its due time");
    // Due: tried once, fails, rescheduled.
    w.clock.t = owed.dueAt;
    await engine.reconcile();
    await engine.cleanupDone();
    assert.equal(r.asked.get("tok_1"), (before ?? 0) + 1);
    if (i % 4 === 3) engine = w.make(); // restarts keep the schedule
  }
  assert.deepEqual(waits, [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000, 300_000, 300_000]);
  assert.ok(w.clock.t - startedAt > 20 * 60_000, "more than 20 minutes: the 60 s token expired long ago");
  // Neither expiry nor the failed answers decided anything about the landing.
  assert.equal(engine.view(id)?.state, "landed");
  assert.equal(w.room.log.length, receipt, "no event for any revocation attempt");
  assert.deepEqual(engine.slot(), { state: "free", last: 1 });
  // A healthy answer clears the duty.
  r.stuck.clear();
  w.clock.t = engine.core.tokenCleanup()[0]!.dueAt;
  await engine.reconcile();
  await engine.cleanupDone();
  assert.deepEqual(engine.core.tokenCleanup(), []);
  assert.equal(engine.nextDue(), null);
  assert.deepEqual([...w.tokens.live], []);
  assert.equal(landedCount(w, id), 1);
});

test("R-PUB-3: several ended operations owe revocations across a restart; each revokes only its own token, never another operation's or an unrelated one, and a later publication reserves, pushes and lands meanwhile", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const r = revocations(w);
  const a = await w.land(1, { "src/a.txt": "a\n" });
  const b = await w.land(2, { "src/b.txt": "b\n" });
  r.stuck.add("tok_1").add("tok_2");
  await w.engine.settle();
  assert.equal(w.engine.view(a.id)?.state, "landed");
  assert.equal(w.engine.view(b.id)?.state, "landed");
  assert.deepEqual(w.engine.core.tokenCleanup().map((c) => [c.op, c.n]), [[a.id, 1], [b.id, 1]]);
  // Another holder's canonical token, unknown to this engine.
  const unrelated = await w.tokens.mint();
  // Restart. Artifacts recovers, except that a's token is still refused.
  const restarted = w.make();
  r.stuck.delete("tok_2");
  // A later publication, while both revocations are owed. Its push is checked against live tokens at the remote.
  w.pub.authAtRemote = w.tokens;
  const c = await w.land(3, { "src/c.txt": "c\n" });
  w.clock.advance(TOKEN_CLEANUP_BACKOFF.firstMs);
  await restarted.settle();
  const cv = restarted.view(c.id);
  assert.equal(cv?.state, "landed", "the owed revocations neither hold the slot nor stop the next push");
  assert.equal(await w.f.canonicalMain(), cv?.state === "landed" ? cv.integration : null);
  assert.deepEqual(w.room.events("land-reserved").map((e) => [e.op, e.publication]), [[a.id, 1], [b.id, 2], [c.id, 3]]);
  for (const o of [a, b, c]) assert.equal(landedCount(w, o.id), 1);
  // b's token was revoked by its own record; c's by its own publication step; a's stays owed.
  assert.deepEqual([...w.tokens.live].sort(), ["tok_1", unrelated.id].sort());
  assert.deepEqual(Object.fromEntries(r.asked), { tok_1: 2, tok_2: 2, tok_4: 1 });
  assert.equal(r.asked.has(unrelated.id), false, "an unrelated canonical token is never revoked");
  assert.equal(unrelated.id, "tok_3");
  assert.deepEqual(restarted.core.tokenCleanup().map((x) => [x.op, x.n]), [[a.id, 1]]);
  assert.ok(restarted.nextDue()! > w.clock.t);
  // a's token is accepted again later: only a's record is cleared.
  r.stuck.clear();
  w.clock.t = restarted.nextDue()!;
  await restarted.reconcile();
  await restarted.cleanupDone();
  assert.deepEqual([...w.tokens.live], [unrelated.id]);
  assert.deepEqual(restarted.core.tokenCleanup(), []);
  assert.equal(r.asked.get("tok_1"), 3);
});

test("R-PUB-3, R-REV-5: an abort that ends without a push, by its existing definite path, still owes its token's revocation, and the record of the abort attempt stays as it was", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(w, id);
  // A compromised revocation arrives while the token is minted (R-LAND-3), and Artifacts refuses revocations.
  const e = w.make((p) => {
    if (p === "token-minted") w.current().abort(actId(900), "key_compromised", 900);
  });
  w.tokens.failRevoke = true;
  await e.publish(); // the push is not made
  await e.publish(); // the abort attempt is recorded and main is read back: nothing pushed can land
  const v = e.view(id);
  assert.equal(v?.state, "aborted");
  assert.equal(w.pub.pushes, 0);
  assert.equal(await w.f.canonicalMain(), w.f.main);
  assert.deepEqual(e.slot(), { state: "free", last: 1 });
  assert.equal(v?.state === "aborted" ? v.abort.tokenRevoked : null, false);
  assert.deepEqual([...w.tokens.live], ["tok_1"]);
  const log = w.room.log.map((x) => x.event.type);
  assert.deepEqual(log, ["land-reserved", "abort-attempt", "land-outcome"]);
  // Restart; Artifacts recovers; the alarm revokes it.
  w.tokens.failRevoke = false;
  const restarted = w.make();
  w.clock.t = restarted.nextDue()!;
  await restarted.reconcile();
  await restarted.cleanupDone();
  assert.deepEqual([...w.tokens.live], []);
  assert.deepEqual(restarted.core.tokenCleanup(), []);
  assert.deepEqual(w.room.log.map((x) => x.event.type), log, "no new event");
  const after = restarted.view(id);
  assert.equal(after?.state === "aborted" ? after.abort.tokenRevoked : null, false, "the abort attempt's record is history");
});

test("R-PUB-3: a held publication's tokens stay with its own publication steps; a stopped instance's late revocation answer writes nothing", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(w, id);
  w.pub.pushDown = true;
  w.tokens.failRevoke = true;
  await w.engine.publish();
  assert.equal(w.engine.view(id)?.state, "unresolved");
  assert.deepEqual([...w.tokens.live], ["tok_1"]);
  assert.deepEqual(w.engine.core.tokenCleanup(), [], "no cleanup record while the operation holds the slot");
  // It lands on the forward retry, while revocation still fails: now both tokens are owed.
  w.pub.pushDown = false;
  w.clock.advance(5_000);
  await w.engine.publish();
  assert.equal(w.engine.view(id)?.state, "landed");
  const owed = w.engine.core.tokenCleanup();
  assert.deepEqual(owed.map((c) => [c.op, c.n, c.backoffMs]), [[id, 1, 1_000], [id, 2, 1_000]]);
  // An instance asks for a revocation, and is replaced before Artifacts answers.
  w.tokens.failRevoke = false;
  const gate = deferred();
  const real = w.tokens.revoke.bind(w.tokens);
  w.tokens.revoke = async (tok: string) => {
    await gate.promise;
    return real(tok);
  };
  w.clock.t = owed[0]!.dueAt;
  const old = w.engine;
  await old.reconcile(); // returns with the revocation still unanswered
  w.make();
  gate.reject(new Error("Artifacts unavailable (revoke)"));
  await old.cleanupDone();
  assert.deepEqual(w.current().core.tokenCleanup(), owed, "the stopped instance's failure rescheduled nothing");
  // The new instance revokes each of the operation's two tokens by its own ID.
  w.tokens.revoke = real;
  await w.current().reconcile();
  await w.current().cleanupDone();
  assert.deepEqual(w.tokens.revoked, ["tok_1", "tok_2"]);
  assert.deepEqual([...w.tokens.live], []);
  assert.deepEqual(w.current().core.tokenCleanup(), []);
});

/** `p`, or a failure naming `what` if it has not settled within `ms` of real time. */
async function within<T>(p: Promise<T>, what: string, ms = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`still waiting after ${ms} ms: ${what}`)), ms);
    timer.unref();
  });
  try {
    return await Promise.race([p, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Count revocations by token ID; the first revocation of each token in `held` waits for `gate`. */
function heldRevocations(w: World, held: readonly string[]) {
  const asked: string[] = [];
  const gate = deferredGate();
  const real = w.tokens.revoke.bind(w.tokens);
  w.tokens.revoke = async (id: string) => {
    asked.push(id);
    if (held.includes(id) && asked.filter((x) => x === id).length === 1) await gate.promise;
    return real(id);
  };
  return { asked, gate };
}

function deferredGate() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

test("review 14739925: an ended operation's revocation that has not answered holds up no later publication; it stays owed, one attempt at a time; a restarted room retries it, and the dead instance's late answer writes nothing", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const a = await w.land(1, { "src/a.txt": "a\n" });
  await readyAndReserve(w, a.id);
  w.tokens.failRevoke = true;
  await w.engine.publish();
  w.tokens.failRevoke = false;
  assert.equal(w.engine.view(a.id)?.state, "landed");
  const owed = w.engine.core.tokenCleanup();
  const r = heldRevocations(w, ["tok_1"]);
  w.clock.t = owed[0]!.dueAt;
  const e1 = w.engine; // the default timeout: the revocation stays unanswered throughout
  await within(e1.reconcile(), "the alarm returns while an old revocation is unanswered");
  assert.deepEqual(r.asked, ["tok_1"]);
  await within(e1.reconcile(), "a second alarm");
  assert.deepEqual(r.asked, ["tok_1"], "one cleanup pass at a time: not sent again while unanswered");
  // A later publication prepares, reserves, pushes and lands meanwhile.
  const b = await w.land(2, { "src/b.txt": "b\n" });
  await within(readyAndReserve(w, b.id), "the later preparation");
  await within(e1.publish(), "the later publication");
  assert.equal(e1.view(b.id)?.state, "landed");
  assert.equal(w.pub.pushes, 2);
  assert.equal(landedCount(w, b.id), 1);
  assert.deepEqual(e1.slot(), { state: "free", last: 2 });
  assert.deepEqual(r.asked, ["tok_1", "tok_2"], "b's token is revoked by its own publication step");
  assert.deepEqual(e1.core.tokenCleanup(), owed, "a's revocation is still owed, unchanged");
  assert.deepEqual([...w.tokens.live], ["tok_1"]);
  // Restart: the new instance sends it again, and Artifacts answers.
  const e2 = w.make();
  await e2.reconcile();
  await within(e2.cleanupDone(), "the restarted room's cleanup");
  assert.deepEqual(r.asked, ["tok_1", "tok_2", "tok_1"]);
  assert.deepEqual(e2.core.tokenCleanup(), []);
  assert.deepEqual([...w.tokens.live], []);
  // The dead instance's answer finally arrives: it writes nothing.
  r.gate.resolve();
  await within(e1.cleanupDone(), "the dead instance's pass");
  assert.deepEqual(e2.core.tokenCleanup(), []);
  assert.deepEqual(w.room.log.map((x) => x.event.type), ["land-reserved", "land-outcome", "land-reserved", "land-outcome"]);
});

test("review 14739925: a revocation that does not answer in time counts as failed, with backoff; its late answer is not taken as success, and the token stays owed until a later attempt is answered", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const a = await w.land(1, { "src/a.txt": "a\n" });
  await readyAndReserve(w, a.id);
  w.tokens.failRevoke = true;
  await w.engine.publish();
  w.tokens.failRevoke = false;
  const e = w.make(undefined, { revokeTimeoutMs: 20 });
  const r = heldRevocations(w, ["tok_1"]);
  w.clock.t = e.core.tokenCleanup()[0]!.dueAt;
  await e.reconcile();
  await within(e.cleanupDone(), "the timed-out pass");
  const [owed] = e.core.tokenCleanup();
  assert.deepEqual([owed?.op, owed?.n, owed?.backoffMs, owed?.dueAt], [a.id, 1, 2_000, w.clock.t + 2_000]);
  // The late answer: Artifacts did revoke it, but the engine no longer waits for that answer.
  r.gate.resolve();
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual([...w.tokens.live], []);
  assert.deepEqual(e.core.tokenCleanup(), [owed], "still owed: a late answer is dropped");
  // The next attempt is answered (already revoked), and clears it.
  w.clock.t = owed!.dueAt;
  await e.reconcile();
  await within(e.cleanupDone(), "the retry");
  assert.deepEqual(r.asked, ["tok_1", "tok_1"]);
  assert.deepEqual(e.core.tokenCleanup(), []);
  assert.equal(landedCount(w, a.id), 1);
  assert.equal(e.view(a.id)?.state, "landed");
});

test("review 14739925: a slow batch of revocations delays no preparation or publication; the batch completes afterwards", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const ops = [];
  for (let i = 1; i <= 3; i++) ops.push(await w.land(i, { [`src/f${i}.txt`]: `${i}\n` }));
  w.tokens.failRevoke = true;
  await w.engine.settle(50);
  w.tokens.failRevoke = false;
  for (const o of ops) assert.equal(w.engine.view(o.id)?.state, "landed");
  assert.equal(w.engine.core.tokenCleanup().length, 3);
  const r = heldRevocations(w, ["tok_1", "tok_2", "tok_3"]);
  w.clock.t = Math.max(...w.engine.core.tokenCleanup().map((c) => c.dueAt));
  const e = w.engine;
  await within(e.reconcile(), "the alarm that starts the slow batch");
  const d = await w.land(4, { "src/f4.txt": "4\n" });
  await within(e.reconcile(), "an alarm that prepares the next operation");
  assert.equal(e.view(d.id)?.state, "ready");
  await within(e.reconcile(), "an alarm that reserves and publishes it");
  assert.equal(e.view(d.id)?.state, "landed");
  assert.equal(landedCount(w, d.id), 1);
  assert.deepEqual(r.asked, ["tok_1", "tok_4"], "the batch is still on its first answer");
  r.gate.resolve();
  await within(e.cleanupDone(), "the batch");
  assert.deepEqual(r.asked, ["tok_1", "tok_4", "tok_2", "tok_3"]);
  assert.deepEqual(e.core.tokenCleanup(), []);
  assert.deepEqual([...w.tokens.live], []);
});

test("R-PUB-3: one cleanup pass tries at most twenty owed tokens; the rest stay due for the next (adapted from review 14739925's diagnostic)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const a = await w.land(1, { "src/a.txt": "a\n" });
  await readyAndReserve(w, a.id);
  w.tokens.failRevoke = true;
  await w.engine.publish();
  w.tokens.failRevoke = false;
  // Storage with 25 owed tokens on one ended operation.
  const op = w.engine.core.get(a.id)!;
  for (let i = 2; i <= 25; i++) {
    const token = await w.tokens.mint();
    op.pushes!.push({ ...op.pushes![0]!, n: i, tokenId: token.id, tokenRevoked: false });
  }
  w.sql.all("UPDATE artroom_land_op SET body = ? WHERE id = ?", JSON.stringify(op), a.id);
  w.sql.all("DELETE FROM artroom_land_token_cleanup");
  w.sql.all("DELETE FROM artroom_land_meta WHERE k = 'token-cleanup'");
  const e = w.make();
  w.clock.t = e.nextDue()!;
  await e.reconcile();
  await within(e.cleanupDone(), "the first pass");
  assert.equal(e.core.tokenCleanup().length, 5);
  assert.equal(w.tokens.live.size, 5);
  assert.equal(e.nextDue(), w.clock.t, "the rest are still due");
  await e.reconcile();
  await within(e.cleanupDone(), "the second pass");
  assert.deepEqual(e.core.tokenCleanup(), []);
  assert.equal(w.tokens.live.size, 0);
  assert.equal(landedCount(w, a.id), 1);
  assert.deepEqual(e.slot(), { state: "free", last: 1 });
});

test("R-PUB-7: after a restart the held publication is recovered before any ended operation's token is tried", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const a = await w.land(1, { "src/a.txt": "a\n" });
  await readyAndReserve(w, a.id);
  w.tokens.failRevoke = true;
  await w.engine.publish();
  w.tokens.failRevoke = false;
  const b = await w.land(2, { "src/b.txt": "b\n" });
  const crashing = w.make((p) => {
    if (p === "token-minted") throw new Crash(p);
  });
  await readyAndReserve(w, b.id);
  await assert.rejects(crashing.publish(), Crash);
  const r = heldRevocations(w, []);
  const restarted = w.make();
  w.clock.t = restarted.core.tokenCleanup()[0]!.dueAt;
  await restarted.reconcile();
  await within(restarted.cleanupDone(), "the cleanup pass");
  assert.equal(restarted.view(b.id)?.state, "landed");
  assert.deepEqual(r.asked, ["tok_2", "tok_3", "tok_1"], "b's tokens first, by its own recovery; then a's owed token");
  assert.deepEqual([...w.tokens.live], []);
});

/** Land operations 1..n, each with its token's revocation failing, so each owes one. */
async function landedOwing(w: World, n: number) {
  const ops = [];
  for (let i = 1; i <= n; i++) ops.push(await w.land(i, { [`src/f${i}.txt`]: `${i}\n` }));
  w.tokens.failRevoke = true;
  await w.engine.settle(50);
  w.tokens.failRevoke = false;
  for (const o of ops) assert.equal(w.engine.view(o.id)?.state, "landed");
  assert.equal(w.engine.core.tokenCleanup().length, n);
  return ops;
}

test("review f060871b: while a cleanup pass waits on an answer, the owed revocations are due again when its current attempt times out, not at once; other work still sets an earlier wake; a restarted room owes them at once", async (t) => {
  const w = await world();
  t.after(w.dispose);
  await landedOwing(w, 2);
  const gates = new Map([["tok_1", deferredGate()], ["tok_2", deferredGate()]]);
  const r = { asked: [] as string[], gate: gates.get("tok_1")! };
  const real = w.tokens.revoke.bind(w.tokens);
  w.tokens.revoke = async (id: string) => {
    r.asked.push(id);
    await gates.get(id)?.promise;
    return real(id);
  };
  t.after(() => gates.get("tok_2")!.resolve());
  const due = Math.max(...w.engine.core.tokenCleanup().map((c) => c.dueAt));
  w.clock.t = due + 5_000; // both overdue
  const e = w.engine;
  await e.reconcile();
  assert.deepEqual(r.asked, ["tok_1"]);
  assert.equal(e.nextDue(), w.clock.t + REVOKE_TIMEOUT_MS, "not the overdue time: the pass answers or times out by then");
  // The first answer arrives 20 s later; the pass waits on the second: its own attempt sets the wake.
  w.clock.advance(20_000);
  const second = new Promise<void>((res) => {
    const check = () => (r.asked.length === 2 ? res() : setTimeout(check, 2));
    check();
  });
  r.gate.resolve();
  await second;
  assert.deepEqual(r.asked, ["tok_1", "tok_2"]);
  assert.equal(e.nextDue(), w.clock.t + REVOKE_TIMEOUT_MS);
  // Other work due now still wakes the room now.
  const c = await w.land(3, { "src/f3.txt": "3\n" });
  assert.equal(e.nextDue(), w.clock.t);
  w.room.lanes.set(c.lane, { generation: 1, head: c.head, leaseGeneration: 1, holder: "released" });
  e.laneChanged(c.lane, "released");
  assert.equal(e.nextDue(), w.clock.t + REVOKE_TIMEOUT_MS);
  // A restarted room has no pass in flight: the owed revocation is due at once.
  const restarted = w.make();
  assert.equal(restarted.nextDue(), restarted.core.tokenCleanup()[0]!.dueAt);
  assert.ok(restarted.nextDue()! < w.clock.t);
});

test("review f060871b: a revocation answered whose completion cannot commit counts as a failure with backoff; the rest of the batch goes on; when storage cannot record even the retry, the debt keeps its due time", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const ops = await landedOwing(w, 2);
  w.clock.t = Math.max(...w.engine.core.tokenCleanup().map((c) => c.dueAt));
  // The completion transaction fails: deleting a cleanup record aborts.
  w.sql.all("CREATE TRIGGER cleanup_delete_down BEFORE DELETE ON artroom_land_token_cleanup BEGIN SELECT RAISE(ABORT, 'completion down'); END");
  const e = w.engine;
  await e.reconcile();
  await within(e.cleanupDone(), "the pass");
  assert.deepEqual([...w.tokens.live], [], "Artifacts revoked both");
  assert.deepEqual(e.core.tokenCleanup().map((c) => [c.op, c.backoffMs, c.dueAt]), ops.map((o) => [o.id, 2_000, w.clock.t + 2_000]), "both still owed, each on its backoff");
  for (const o of ops) assert.equal(e.core.get(o.id)?.pushes?.[0]?.tokenRevoked, false, "the completion rolled back");
  // Neither can the retry be recorded: the batch still goes on, and the debt keeps its due time.
  w.sql.all("CREATE TRIGGER cleanup_update_down BEFORE UPDATE ON artroom_land_token_cleanup BEGIN SELECT RAISE(ABORT, 'retry down'); END");
  const before = e.core.tokenCleanup();
  w.clock.t = before[1]!.dueAt;
  const asked = w.tokens.revoked.length;
  await e.reconcile();
  await within(e.cleanupDone(), "the second pass");
  assert.equal(w.tokens.revoked.length - asked, 2, "both records were tried");
  assert.deepEqual(e.core.tokenCleanup(), before);
  // Storage recovers: the next answered attempts complete.
  w.sql.all("DROP TRIGGER cleanup_delete_down");
  w.sql.all("DROP TRIGGER cleanup_update_down");
  await e.reconcile();
  await within(e.cleanupDone(), "the third pass");
  assert.deepEqual(e.core.tokenCleanup(), []);
  for (const o of ops) {
    assert.equal(e.core.get(o.id)?.pushes?.[0]?.tokenRevoked, true);
    assert.equal(landedCount(w, o.id), 1);
  }
  assert.deepEqual(e.slot(), { state: "free", last: 2 });
});

test("R-PUB-3: a room stored before the cleanup records existed owes its ended operations' unrevoked tokens once, at start", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(w, id);
  w.tokens.failRevoke = true;
  await w.engine.publish();
  assert.equal(w.engine.view(id)?.state, "landed");
  // The storage as the previous version left it: the token unrevoked in the operation, and no cleanup records.
  w.sql.all("DELETE FROM artroom_land_token_cleanup");
  w.sql.all("DELETE FROM artroom_land_meta WHERE k = 'token-cleanup'");
  assert.equal(w.engine.nextDue(), null);
  w.tokens.failRevoke = false;
  const restarted = w.make();
  assert.deepEqual(restarted.core.tokenCleanup().map((c) => [c.op, c.n]), [[id, 1]]);
  w.clock.t = restarted.nextDue()!;
  await restarted.reconcile();
  await restarted.cleanupDone();
  assert.deepEqual([...w.tokens.live], []);
  assert.equal(landedCount(w, id), 1);
  // Once: a record cleared after adoption is not adopted again.
  w.sql.all("UPDATE artroom_land_op SET body = replace(body, '\"tokenRevoked\":true', '\"tokenRevoked\":false')");
  assert.deepEqual(w.make().core.tokenCleanup(), []);
});

// ------------------------------------------------------- the retained land input (R-LAND-4, R-LAND-7)

test("R-LAND-4, R-LAND-7: preparation retains the reservation-stage land input; reservation compares its bytes, without hashing, and a changed input stops it", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await w.engine.prepare(id);
  const v = w.engine.view(id);
  const canonical = w.room.inputOf(id);
  const digest = `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
  assert.equal(v?.state === "ready" ? v.landInput : null, digest, "ready.landInput is the retained input's digest");
  // An objection arrives before reservation: the input rebuilt now differs.
  w.room.inputNow.set(id, canonical.replace('"approve"', '"approve","object"'));
  const r = w.engine.reserve(id);
  assert.deepEqual(r, { kind: "retryable", reason: "obligation-open" });
  assert.deepEqual(w.room.compared, [{ stage: "reservation", canonical, digest }], "the Room compared the retained bytes");
  assert.equal(w.room.events("land-reserved").length, 0);
});

test("R-LAND-4: the Room's readiness is asked outside any transaction; an answer for an older attempt is dropped", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  const gate = deferred();
  let calls = 0;
  w.room.readinessOf.set(id, async () => {
    calls++;
    if (calls === 1) await gate.promise; // the policy evaluation is slow
    return { kind: "ready", evidence: [actId(50)], retained: null };
  });
  const preparing = w.engine.prepare(id);
  while (calls < 1) await new Promise((r) => setTimeout(r, 5));
  // Main moves while the Room is still answering.
  const moved = await w.f.propose(laneId(9), 1, w.f.main, { "src/z.txt": "z\n" });
  w.f.setMain(moved);
  w.engine.core.observeMain(moved as Sha);
  gate.resolve();
  await preparing;
  const v = w.engine.view(id);
  assert.equal(v?.state, "preparing", "the late answer for attempt 1 was dropped");
  assert.equal(v?.attempts, 2);
  await w.engine.settle();
  assert.equal(w.engine.view(id)?.state, "landed");
  assert.equal(w.room.events("land-reserved")[0]?.expectedMain, moved);
});

test("a readiness answer that failed is asked again by the alarm", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  let calls = 0;
  w.room.readinessOf.set(id, async () => {
    if (++calls === 1) throw new Error("policy runtime unavailable");
    return { kind: "ready", evidence: [actId(50)], retained: null };
  });
  await w.engine.prepare(id);
  assert.equal(w.engine.view(id)?.state, "preparing");
  w.clock.advance(10_000);
  await w.engine.settle();
  assert.equal(w.engine.view(id)?.state, "landed");
  assert.equal(calls, 2);
});

test("core: no push starts after an abort attempt, or once another writer is seen, whatever the driver does", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const a = await w.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(w, a.id);
  w.engine.abort(actId(900), "key_compromised", 900);
  assert.equal(w.engine.core.beginPush(), null);
  w.clock.advance(3_600_000);
  assert.equal(w.engine.core.beginPush(), null);

  const v = await world();
  t.after(v.dispose);
  const b = await v.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(v, b.id);
  const plan = v.engine.core.beginPush()!;
  v.engine.core.pushResult(b.id, plan.n, { outcome: "rejected", reason: "lease", detail: "stale" });
  v.engine.core.readBack(b.id, "9".repeat(40) as Sha);
  v.clock.advance(3_600_000);
  assert.equal(v.engine.core.beginPush(), null);
});

// ------------------------------------------------------- overlapping readiness evaluations (review 50104b16, P1.1)

/** A readiness function whose calls each wait for the test to answer them. */
function scriptedReadiness(w: World, id: OpId) {
  const calls: { answer: (r: import("../src/landing/types.ts").Readiness) => void }[] = [];
  w.room.readinessOf.set(id, () => new Promise((resolve) => calls.push({ answer: resolve })));
  const ready = { kind: "ready" as const, evidence: [actId(50)], retained: null };
  const waiting = { kind: "waiting" as const, obligations: ["obl_tests" as const] };
  const until = async (n: number) => {
    for (let i = 0; calls.length < n; i++) {
      if (i > 1000) throw new Error(`readiness was asked ${calls.length} times, not ${n}`);
      await new Promise((r) => setTimeout(r, 2));
    }
  };
  return { calls, ready, waiting, until };
}

test("readiness: an older 'waiting' answer that arrives after a newer 'ready' one is dropped, and the landing proceeds", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  const s = scriptedReadiness(w, id);
  const preparing = w.engine.prepare(id); // evaluation 1, based on old evidence
  await s.until(1);
  const evaluating = w.engine.evaluate(id); // evidence arrived: evaluation 2
  await s.until(2);
  s.calls[1]!.answer(s.ready);
  await evaluating;
  assert.equal(w.engine.view(id)?.state, "ready");
  s.calls[0]!.answer(s.waiting); // the older answer, late
  await preparing;
  assert.equal(w.engine.view(id)?.state, "ready", "the older answer did not replace the newer one");
  await w.engine.settle();
  assert.equal(w.engine.view(id)?.state, "landed");
});

test("readiness: an older 'ready' answer that arrives after a newer 'waiting' one is dropped", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  const s = scriptedReadiness(w, id);
  const preparing = w.engine.prepare(id);
  await s.until(1);
  const evaluating = w.engine.evaluate(id); // evidence was withdrawn: evaluation 2
  await s.until(2);
  s.calls[1]!.answer(s.waiting);
  await evaluating;
  s.calls[0]!.answer(s.ready);
  await preparing;
  const v = w.engine.view(id);
  assert.equal(v?.state, "preparing");
  assert.deepEqual(v?.state === "preparing" ? v.waiting : null, ["obl_tests"]);
  assert.equal(w.room.events("land-reserved").length, 0);
});

test("readiness: a ready operation with a newer evaluation still out is not reserved until it answers", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  const s = scriptedReadiness(w, id);
  const preparing = w.engine.prepare(id);
  await s.until(1);
  s.calls[0]!.answer(s.ready);
  await preparing;
  const evaluating = w.engine.evaluate(id);
  await s.until(2);
  assert.deepEqual(w.engine.reserve(id), { kind: "not-ready", state: "ready" });
  s.calls[1]!.answer(s.ready);
  await evaluating;
  assert.equal(w.engine.reserve(id).kind, "reserved");
});

test("readiness: a restart while an evaluation is out asks again; the dead instance's late answer changes nothing", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  const s = scriptedReadiness(w, id);
  const preparing = w.engine.prepare(id).catch((e: unknown) => e);
  await s.until(1);
  const restarted = w.make(); // the first instance is gone
  const reconciling = restarted.reconcile();
  await s.until(2);
  s.calls[1]!.answer(s.ready);
  await reconciling;
  s.calls[0]!.answer(s.waiting);
  await preparing;
  assert.equal(restarted.view(id)?.state === "ready" || restarted.view(id)?.state === "publishing" || restarted.view(id)?.state === "landed", true);
  await restarted.settle();
  assert.equal(restarted.view(id)?.state, "landed");
});

// ------------------------------------------------------- mint lane B: the publication token through the mint ledger
//
// notes/2026-10-02-canonical-mint-ownership.md, "Lane B", tests (1) to (7);
// protocol section 32. The engine mints through the production
// `publicationTokens` and a real `MintLedger` on the room's SQLite, over a
// canonical repository double. A restart is a new engine and a new ledger on
// the same SQLite: the ledger's constructor takes over what the stopped host
// left.

/** The SQL a test records while `on`: which statements ran, to show what a step reads. */
function spySql(inner: Sql) {
  const s = {
    on: false,
    queries: [] as string[],
    all: (q: string, ...b: Parameters<Sql["all"]> extends [string, ...infer R] ? R : never) => {
      if (s.on) s.queries.push(q);
      return inner.all(q, ...b);
    },
    transaction: <T>(fn: () => T): T => inner.transaction(fn),
  };
  return s;
}

async function ledgerWorld(o: { waitMs?: number } = {}) {
  const f = new MemoryCanonical().init();
  const room = new FakeRoom();
  const clock = new Clock();
  const sql = spySql(nodeSql());
  const host = new LedgerHost(sql, clock, o.waitMs);
  const pub = new ControlledPublisher(f.publisher);
  // The remote takes a push only with a live token, so the pushed token is the one the room holds.
  pub.authAtRemote = host;
  const engines: Landing[] = [];
  const make = (fault?: (p: FaultPoint, op: OpId) => void) => {
    for (const e of engines) e.kill(); // a restart replaces the old instance …
    if (engines.length > 0) host.start(); // … and its ledger, which takes over
    const e = new Landing({ sql, room, publisher: pub, tokens: host.tokens, now: clock.now, ...(fault ? { fault } : {}) });
    host.known = (id) => e.core.knownToken(id);
    engines.push(e);
    return e;
  };
  const engine = make();
  await engine.refreshMain();
  const current = () => engines[engines.length - 1]!;
  const land = async (n: number, files: Record<string, string>) => {
    const head = await f.propose(laneId(n), 1, f.main, files);
    room.hold(laneId(n), 1, head);
    const id = opId(n);
    const r = current().accept({ id, lane: laneId(n), generation: 1, head, act: actId(500 + n), leaseGeneration: 1, policyVersion: room.policy });
    assert.ok(!("refused" in r), "accepted");
    return { id, head, lane: laneId(n) };
  };
  const ready = async (id: OpId) => {
    await current().prepare(id);
    assert.equal(current().reserve(id).kind, "reserved");
  };
  /** The landing's token rows, by token ID. */
  const rows = () => sql.all("SELECT token, op, n, expires_at FROM artroom_land_token ORDER BY token").map((r) => ({ token: r["token"], op: r["op"], n: r["n"], expiresAt: r["expires_at"] }));
  const records = () => host.mints.duties({ limit: 1000 }).records;
  const pushes = (id: OpId) => (current().core.get(id)?.pushes ?? []).map((p) => ({ n: p.n, tokenId: p.tokenId, tokenRevoked: p.tokenRevoked, outcome: p.outcome }));
  /** Nothing durable or shown holds a token's text or the provider's message. */
  const clean = (id: OpId) => {
    const shown = JSON.stringify([current().view(id), current().status(), current().core.get(id), current().slot(), room.log, host.mints.duties({ limit: 1000 }), sql.all("SELECT * FROM artroom_land_token")]);
    assert.ok(!/art_v\d/.test(shown), "a token's text is stored or shown");
    assert.ok(!shown.includes(host.repo.failureText), "the provider's text is stored or shown");
  };
  return { f, room, clock, sql, host, pub, make, engine, current, land, ready, rows, records, pushes, clean, dispose: () => f.dispose() };
}

test("mint lane B (1), R-MINT-4, R-MINT-7: a host that stops between the mint's answer and pushToken; after a restart within 60 s the ledger revokes that token by its ID, the publication completes forward with a new attempt, and there is one receipt", async (t) => {
  const w = await ledgerWorld();
  t.after(w.dispose);
  const { id, head } = await w.land(1, { "src/c.txt": "c\n" });
  let fired = false;
  const crashing = w.make((p) => {
    if (p === "token-answered" && !fired) {
      fired = true;
      throw new Crash(p);
    }
  });
  await w.ready(id);
  const start = w.clock.t;
  await assert.rejects(crashing.publish(), Crash);
  // The answer is the ledger's alone: held by its record, on no attempt and in no landing row.
  const [first] = w.host.repo.tokens;
  assert.ok(first && w.host.repo.live(first.id));
  assert.deepEqual(w.records().map((r) => [r.purpose, r.state, r.tokenId]), [[`publish:${id}:1`, "held", first.id]]);
  assert.deepEqual(w.pushes(id), [{ n: 1, tokenId: null, tokenRevoked: false, outcome: null }]);
  assert.deepEqual(w.rows(), []);
  // A restart within the token's 60 s: the new ledger takes over, and owes the token at once.
  w.clock.advance(10_000);
  const restarted = w.make();
  assert.deepEqual(w.records().map((r) => [r.state, r.tokenId]), [["owed", first.id]]);
  assert.equal(w.host.mints.nextDue(), w.clock.t + 1_000, "overdue work is due 1 s ahead");
  await restarted.reconcile();
  await w.host.reconcile();
  assert.ok(w.clock.t - start < 60_000);
  assert.equal(w.host.repo.live(first.id), false, "the stopped host's token is revoked");
  assert.deepEqual(w.host.repo.revokes.filter((x) => x === first.id), [first.id], "by its own ID, once");
  // Forward, with a new attempt and its own token, landed once.
  assert.equal(restarted.view(id)?.state, "landed");
  assert.equal(await w.f.canonicalMain(), head);
  assert.equal(w.room.events("land-outcome", id).length, 1);
  const second = w.host.repo.tokens[1]!;
  assert.deepEqual(w.pushes(id), [
    { n: 1, tokenId: null, tokenRevoked: false, outcome: null },
    { n: 2, tokenId: second.id, tokenRevoked: true, outcome: "landed" },
  ]);
  assert.deepEqual(w.host.repo.liveIds(), []);
  assert.deepEqual(w.records(), []);
  assert.deepEqual(w.rows(), []);
  w.clean(id);
});

test("mint lane B (2), R-MINT-2: the first create applies and fails with INTERNAL_ERROR; an unknown record stays, the ledger's retry is a new record, its token is the one pushed, and outcome, slot and receipts are as before", async (t) => {
  const w = await ledgerWorld();
  t.after(w.dispose);
  const { id, head } = await w.land(1, { "src/c.txt": "c\n" });
  await w.ready(id);
  w.host.repo.plans = ["apply-throw"];
  assert.equal(await w.engine.publish(), true);
  assert.equal(w.engine.view(id)?.state, "landed");
  assert.equal(await w.f.canonicalMain(), head);
  assert.deepEqual(w.engine.slot(), { state: "free", last: 1 });
  assert.deepEqual(w.room.log.map((e) => e.event.type), ["land-reserved", "land-outcome"]);
  const [applied, pushed] = w.host.repo.tokens;
  assert.equal(w.host.repo.creates.length, 2);
  assert.deepEqual(w.pushes(id), [{ n: 1, tokenId: pushed!.id, tokenRevoked: true, outcome: "landed" }]);
  // The applied create stays unknown: its token is live, the Room cannot name it, and it is never revoked.
  assert.deepEqual(w.records().map((r) => [r.purpose, r.state, r.tokenId]), [[`publish:${id}:1`, "unknown", null]]);
  assert.equal(w.host.repo.live(applied!.id), true);
  assert.deepEqual(w.host.repo.revokes, [pushed!.id]);
  w.clock.advance(120_000);
  await w.host.reconcile();
  assert.deepEqual(w.records().map((r) => r.state), ["unknown"], "kept after its lifetime and an observation");
  assert.deepEqual(w.host.repo.revokes, [pushed!.id]);
  w.clean(id);
});

test("mint lane B (2), R-MINT-2: a lost answer is the ledger's to keep, never the engine's to retry: one create, one unknown record, the attempt ends with safe metadata only, and the next attempt lands", async (t) => {
  const w = await ledgerWorld();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await w.ready(id);
  w.host.repo.plans = ["lose"];
  assert.equal(await w.engine.publish(), true);
  assert.equal(w.host.repo.creates.length, 1, "the engine does not mint again");
  assert.deepEqual(w.records().map((r) => r.state), ["unknown"]);
  const [lost] = w.pushes(id);
  assert.deepEqual(lost, { n: 1, tokenId: null, tokenRevoked: false, outcome: "error" });
  assert.equal(w.engine.core.get(id)!.pushes![0]!.detail, "token not minted (create failed: Error)");
  assert.equal(w.engine.view(id)?.state, "unresolved");
  w.clock.advance(5_000);
  await w.engine.reconcile();
  assert.equal(w.engine.view(id)?.state, "landed");
  assert.equal(w.room.events("land-outcome", id).length, 1);
  assert.equal(w.host.repo.creates.length, 2);
  w.clean(id);
});

test("mint lane B (3), R-MINT-3, R-MINT-4: a trigger that fails pushToken's transaction leaves the ledger owning the token, with no landing row and no ID on the attempt; the ledger revokes it later, by its ID", async (t) => {
  const w = await ledgerWorld();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await w.ready(id);
  // The operation's save in pushToken fails; nothing else does.
  w.sql.all("CREATE TRIGGER push_token_down BEFORE UPDATE ON artroom_land_op WHEN NEW.body LIKE '%tok_c1%' BEGIN SELECT RAISE(ABORT, 'pushToken down'); END");
  w.host.repo.revokeDown = true;
  await assert.rejects(w.engine.publish(), /pushToken down/);
  await w.engine.cleanupDone();
  assert.deepEqual(w.pushes(id), [{ n: 1, tokenId: null, tokenRevoked: false, outcome: null }]);
  assert.deepEqual(w.rows(), []);
  // The ledger still owns it: the release failed, so it is owed with backoff.
  assert.deepEqual(w.records().map((r) => [r.state, r.tokenId]), [["owed", "tok_c1"]]);
  assert.equal(w.host.repo.live("tok_c1"), true);
  w.host.repo.revokeDown = false;
  w.sql.all("DROP TRIGGER push_token_down");
  w.clock.advance(1_000);
  await w.host.reconcile();
  assert.equal(w.host.repo.live("tok_c1"), false);
  assert.deepEqual(w.records(), []);
  // The publication goes forward with a new token, and lands once.
  w.clock.advance(5_000);
  await w.engine.reconcile();
  assert.equal(w.engine.view(id)?.state, "landed");
  assert.equal(w.room.events("land-outcome", id).length, 1);
  assert.deepEqual(w.host.repo.liveIds(), []);
  w.clean(id);
});

test("mint lane B (4), R-MINT-7: the landing's token row lives from pushToken to tokenRevoked, whether the held operation or plan 003's cleanup pass is answered, and is kept while revocation fails, after the operation ends too", async (t) => {
  const w = await ledgerWorld();
  t.after(w.dispose);
  // a: the held operation's own revocation answers.
  const a = await w.land(1, { "src/a.txt": "a\n" });
  await w.ready(a.id);
  w.pub.pausePushes = true;
  const publishing = w.engine.publish();
  await w.pub.waitPaused(1);
  const [ta] = w.host.repo.tokens;
  assert.deepEqual(w.rows(), [{ token: ta!.id, op: a.id, n: 1, expiresAt: ta!.expiresAt }], "written by pushToken, with the reported expiry");
  assert.equal(w.engine.core.knownToken(ta!.id), true);
  assert.deepEqual(w.records(), [], "claimed from the ledger in the same transaction");
  w.pub.pausePushes = false;
  w.pub.paused[0]!.release();
  await publishing;
  assert.equal(w.engine.view(a.id)?.state, "landed");
  assert.deepEqual(w.rows(), [], "deleted by tokenRevoked");
  assert.equal(w.engine.core.knownToken(ta!.id), false);
  // b: the revocation fails; the operation ends; the row stays with plan 003's record until a cleanup pass is answered.
  const b = await w.land(2, { "src/b.txt": "b\n" });
  await w.ready(b.id);
  w.host.repo.revokeDown = true;
  await w.engine.publish();
  assert.equal(w.engine.view(b.id)?.state, "landed");
  const tb = w.host.repo.tokens[1]!;
  assert.deepEqual(w.rows().map((r) => r.token), [tb.id]);
  assert.deepEqual(w.engine.core.tokenCleanup().map((c) => [c.op, c.n]), [[b.id, 1]]);
  w.clock.advance(2_000);
  await w.engine.reconcile();
  await w.engine.cleanupDone();
  assert.deepEqual(w.rows().map((r) => r.token), [tb.id], "kept while the cleanup pass fails");
  // Past the token's expiry too: a landing row ends only with tokenRevoked.
  w.clock.advance(120_000);
  await w.engine.reconcile();
  await w.engine.cleanupDone();
  assert.deepEqual(w.rows().map((r) => r.token), [tb.id]);
  w.host.repo.revokeDown = false;
  w.clock.advance(300_000);
  await w.engine.reconcile();
  await w.engine.cleanupDone();
  assert.deepEqual(w.rows(), [], "deleted by the cleanup pass's tokenRevoked");
  assert.deepEqual(w.engine.core.tokenCleanup(), []);
  w.clean(b.id);
});

test("mint lane B (4), R-MINT-4: a trigger that fails the token row's insert rolls pushToken back with it; one that fails its delete rolls tokenRevoked back with it", async (t) => {
  const w = await ledgerWorld();
  t.after(w.dispose);
  const a = await w.land(1, { "src/a.txt": "a\n" });
  await w.ready(a.id);
  w.sql.all("CREATE TRIGGER row_insert_down BEFORE INSERT ON artroom_land_token BEGIN SELECT RAISE(ABORT, 'row insert down'); END");
  await assert.rejects(w.engine.publish(), /row insert down/);
  await w.engine.cleanupDone();
  assert.deepEqual(w.pushes(a.id), [{ n: 1, tokenId: null, tokenRevoked: false, outcome: null }], "no ID recorded");
  assert.deepEqual(w.rows(), []);
  assert.equal(w.host.repo.live("tok_c1"), false, "the ledger kept it, and its release revoked it");
  assert.deepEqual(w.host.repo.revokes, ["tok_c1"]);
  assert.deepEqual(w.records(), []);
  w.sql.all("DROP TRIGGER row_insert_down");
  // The delete fails: tokenRevoked does not commit, so the attempt stays unrevoked and the duty stays owed.
  w.sql.all("CREATE TRIGGER row_delete_down BEFORE DELETE ON artroom_land_token BEGIN SELECT RAISE(ABORT, 'row delete down'); END");
  w.clock.advance(5_000);
  await w.engine.reconcile();
  assert.equal(w.engine.view(a.id)?.state, "landed");
  assert.deepEqual(w.pushes(a.id)[1], { n: 2, tokenId: "tok_c2", tokenRevoked: false, outcome: "landed" });
  assert.deepEqual(w.rows().map((r) => r.token), ["tok_c2"]);
  assert.deepEqual(w.engine.core.tokenCleanup().map((c) => [c.op, c.n]), [[a.id, 2]]);
  w.sql.all("DROP TRIGGER row_delete_down");
  w.clock.advance(2_000);
  await w.engine.reconcile();
  await w.engine.cleanupDone();
  assert.deepEqual(w.rows(), []);
  assert.equal(w.pushes(a.id)[1]!.tokenRevoked, true);
  assert.equal(w.room.events("land-outcome", a.id).length, 1);
});

/** One active operation holding its token (its push paused) and one ended operation owing its token's revocation. */
async function heldAndOwed(w: Awaited<ReturnType<typeof ledgerWorld>>) {
  const b = await w.land(2, { "src/b.txt": "b\n" });
  await w.ready(b.id);
  w.host.repo.revokeDown = true;
  await w.engine.publish();
  w.host.repo.revokeDown = false;
  assert.equal(w.engine.view(b.id)?.state, "landed");
  const a = await w.land(1, { "src/a.txt": "a\n" });
  await w.ready(a.id);
  w.pub.pausePushes = true;
  void w.engine.publish().catch(() => undefined);
  await w.pub.waitPaused(1);
  const tb = w.host.repo.tokens[0]!.id;
  const ta = w.host.repo.tokens[1]!.id;
  assert.deepEqual(w.current().core.liveTokens(a.id).map((x) => x.tokenId), [ta]);
  assert.deepEqual(w.current().core.tokenCleanup().map((c) => c.op), [b.id]);
  return { a, b, ta, tb };
}

test("mint lane B (5), R-MINT-7: a room stored before the token rows existed gains a row for an active operation's unrevoked token and for an ended operation's owed token once, at its first start, and not again", async (t) => {
  const w = await ledgerWorld();
  t.after(w.dispose);
  const { a, b, ta, tb } = await heldAndOwed(w);
  // The storage as the previous version left it: no token rows, and no fill recorded.
  w.sql.all("DELETE FROM artroom_land_token");
  w.sql.all("DELETE FROM artroom_land_meta WHERE k = 'token-index'");
  const first = w.make();
  assert.deepEqual(
    w.rows().map((r) => [r.token, r.op, r.n]),
    [
      [tb, b.id, 1],
      [ta, a.id, 1],
    ].sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
  );
  assert.equal(first.core.knownToken(ta) && first.core.knownToken(tb), true);
  // Once: rows removed after the fill are not filled again at the next start.
  w.sql.all("DELETE FROM artroom_land_token");
  w.make();
  assert.deepEqual(w.rows(), []);
  w.pub.paused[0]!.abandon();
});

test("mint lane B (6), R-MINT-5, R-MINT-7: an observation over a listing that holds an active operation's token and an ended operation's owed token counts neither as unaccounted, by point lookups that read no artroom_land_op row", async (t) => {
  const w = await ledgerWorld();
  t.after(w.dispose);
  const { ta, tb } = await heldAndOwed(w);
  // An unknown create (nothing applied) makes an observation due.
  w.host.repo.plans = ["drop"];
  await assert.rejects(w.host.mints.mint("test:unknown", "write", () => 60));
  assert.deepEqual(w.records().map((r) => r.state), ["unknown"]);
  const listed = (await w.host.repo.listTokens()).tokens.filter((x) => x.state === "active").map((x) => x.id).sort();
  assert.deepEqual(listed, [ta, tb].sort());
  w.sql.queries.length = 0;
  w.sql.on = true;
  await w.host.mints.reconcile();
  w.sql.on = false;
  const seen = w.host.mints.duties().observation;
  assert.equal(seen.unaccounted, 0);
  assert.equal(seen.result, "0 live token(s) on the canonical repository not accounted for");
  assert.deepEqual(w.sql.queries.filter((q) => q.includes("artroom_land_op")), [], "no operation is read");
  assert.equal(w.sql.queries.filter((q) => q.includes("artroom_land_token WHERE token")).length, 2, "one point lookup per listed token");
  w.pub.paused[0]!.abandon();
});

test("mint lane B (3), R-MINT-4: the revocation of a token that pushToken did not take runs off the publication queue: publish ends while it is unanswered, and the ledger closes the record when it answers", async (t) => {
  const w = await ledgerWorld();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await w.ready(id);
  w.sql.all("CREATE TRIGGER row_insert_down BEFORE INSERT ON artroom_land_token BEGIN SELECT RAISE(ABORT, 'row insert down'); END");
  w.host.repo.holdRevokes = true;
  await assert.rejects(within(w.engine.publish(), "publish, while the release is unanswered", 2_000), /row insert down/);
  assert.deepEqual(w.host.repo.heldRevokes.map((h) => h.id), ["tok_c1"]);
  assert.deepEqual(w.records().map((r) => [r.state, r.tokenId]), [["held", "tok_c1"]]);
  w.host.repo.heldRevokes[0]!.answer();
  await w.engine.cleanupDone();
  assert.deepEqual(w.records(), []);
  assert.equal(w.host.repo.live("tok_c1"), false);
});

test("mint lane B, R-MINT-4: a publication token's revocation is bounded: unanswered, it ends with the wait, the landing goes on, no retry is sent after it, and plan 003's record revokes it later", async (t) => {
  const w = await ledgerWorld({ waitMs: 20 });
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await w.ready(id);
  w.host.repo.holdRevokes = true;
  await within(w.engine.publish(), "publish, while its token's revocation is unanswered", 5_000);
  assert.equal(w.engine.view(id)?.state, "landed");
  assert.deepEqual(w.engine.core.tokenCleanup().map((c) => [c.op, c.n]), [[id, 1]]);
  // The late answer is a transient error: no retry follows it.
  w.host.repo.holdRevokes = false;
  w.host.repo.heldRevokes[0]!.fail(new Error("10400 internal error"));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(w.host.repo.revokes, ["tok_c1"]);
  w.clock.advance(2_000);
  await w.engine.reconcile();
  await w.engine.cleanupDone();
  assert.deepEqual(w.host.repo.revokes, ["tok_c1", "tok_c1"]);
  assert.equal(w.host.repo.live("tok_c1"), false);
  assert.deepEqual(w.rows(), []);
});

/** Publish with a 20 ms revocation wait while the revocation path is held as `hold` says; the landing ends with its token's revocation owed. */
async function revocationHeldPastTheWait(t: { after: (fn: () => unknown) => void }, hold: (w: Awaited<ReturnType<typeof ledgerWorld>>) => void) {
  const w = await ledgerWorld({ waitMs: 20 });
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await w.ready(id);
  hold(w);
  await within(w.engine.publish(), "publish, while its token's revocation is held", 5_000);
  assert.equal(w.engine.view(id)?.state, "landed");
  return { w, id };
}

/** The debt is kept for a later bounded pass, which revokes the token by its ID. */
async function debtKeptThenRevoked(w: Awaited<ReturnType<typeof ledgerWorld>>, id: OpId, sentBefore: number) {
  assert.deepEqual(w.engine.core.tokenCleanup().map((c) => [c.op, c.n]), [[id, 1]]);
  assert.deepEqual(w.rows().map((r) => r.token), ["tok_c1"]);
  assert.equal(w.host.repo.live("tok_c1"), true);
  w.host.holdLookup = null;
  w.host.holdSleep = false;
  w.host.repo.revokeDown = false;
  w.clock.advance(2_000);
  await w.engine.reconcile();
  await w.engine.cleanupDone();
  assert.equal(w.host.repo.revokes.length, sentBefore + 1);
  assert.equal(w.host.repo.live("tok_c1"), false);
  assert.deepEqual(w.rows(), []);
}

test("review d4a4c681: a revocation whose repository lookup is still out when the bounded wait ends sends nothing when the lookup answers; the debt stays for a later pass", async (t) => {
  const { w, id } = await revocationHeldPastTheWait(t, (w) => {
    w.host.holdLookup = (n) => n === 1;
  });
  assert.equal(w.host.heldLookups.length, 1);
  w.host.heldLookups[0]!();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(w.host.repo.revokes, [], "no provider call after the wait ended");
  await debtKeptThenRevoked(w, id, 0);
});

test("review d4a4c681: a retry whose repository lookup is still out when the bounded wait ends sends nothing when the lookup answers: one provider call, not two", async (t) => {
  const { w, id } = await revocationHeldPastTheWait(t, (w) => {
    w.host.repo.revokeDown = true; // the first attempt fails with a transient error, and is retried
    w.host.holdLookup = (n) => n === 2;
  });
  assert.equal(w.host.heldLookups.length, 1);
  w.host.repo.revokeDown = false;
  w.host.heldLookups[0]!();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(w.host.repo.revokes, ["tok_c1"], "only the first attempt was sent");
  await debtKeptThenRevoked(w, id, 1);
});

test("review d4a4c681: a retry whose sleep outlasts the bounded wait starts no lookup and sends nothing", async (t) => {
  const { w, id } = await revocationHeldPastTheWait(t, (w) => {
    w.host.repo.revokeDown = true;
    w.host.holdSleep = true;
  });
  assert.equal(w.host.heldSleeps.length, 1);
  const lookups = w.host.lookups;
  w.host.repo.revokeDown = false;
  w.host.heldSleeps[0]!();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(w.host.lookups, lookups, "no lookup after the wait ended");
  assert.deepEqual(w.host.repo.revokes, ["tok_c1"]);
  await debtKeptThenRevoked(w, id, 1);
});

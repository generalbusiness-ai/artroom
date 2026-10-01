// The landing operation (plan section 8; protocol R-LAND, R-PUB, R-REV-5),
// against real git and real SQLite. Test names start with the plan's
// acceptance case or the rule they show.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpId, Sha } from "@generalbusiness/artroom-contract";
import { Landing, type FaultPoint } from "../src/landing/engine.ts";
import { GitPublisher } from "../src/publisher/git-publisher.ts";
import { GitOps } from "../src/publisher/gitops.ts";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  Clock,
  ControlledPublisher,
  FakeRoom,
  FakeTokens,
  Fixture,
  actId,
  edit,
  laneId,
  lines,
  localExec,
  nodeSql,
  opId,
  sh,
} from "./support.ts";

class Crash extends Error {}

async function world() {
  const f = await new Fixture().init();
  const room = new FakeRoom();
  const tokens = new FakeTokens();
  const clock = new Clock();
  const sql = nodeSql();
  const pub = new ControlledPublisher(new GitPublisher(f.ops, f.canonical));
  const engines: Landing[] = [];
  const make = (fault?: (p: FaultPoint, op: OpId) => void) => {
    for (const e of engines) e.kill(); // a restart replaces the old instance
    const e = new Landing({ sql, room, publisher: pub, tokens, now: clock.now, ...(fault ? { fault } : {}) });
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
  assert.equal(await sh(w.f.root, "--git-dir", w.f.canonical, "rev-parse", `${main}^1`), a.head);
});

test("serial publication with a rebuild on every main move: wasted preparations, measured", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const n = 5;
  const ops = [];
  for (let i = 1; i <= n; i++) ops.push(await w.land(i, { [`src/f${i}.txt`]: `${i}\n` }));
  await Promise.all(ops.map((o) => w.engine.prepare(o.id)));
  await w.engine.settle(50);
  for (const o of ops) assert.equal(w.engine.view(o.id)?.state, "landed");
  const attempts = ops.map((o) => w.engine.view(o.id)!.attempts);
  const total = attempts.reduce((x, y) => x + y, 0);
  t.diagnostic(`${n} disjoint operations, all ready on one main: ${total} preparations, ${total - n} wasted; per operation ${attempts.join(", ")}`);
  assert.equal(total, (n * (n + 1)) / 2, "each landing re-prepares every operation still waiting");
  assert.equal(w.pub.integrations, total);
  assert.equal(landedCount(w), n);
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
  await sh(w.f.root, "--git-dir", w.f.canonical, "update-ref", "refs/heads/main", moved);
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
  await sh(w.f.root, "--git-dir", w.f.canonical, "update-ref", "refs/heads/main", other);
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
  assert.equal(await sh(w.f.root, "--git-dir", w.f.canonical, "rev-parse", `${await w.f.canonicalMain()}^1`), head);
  assert.equal(w.tokens.live.size, 0);
});

test("another writer moves main during publication: the slot stays held, pushing stops, and admins see an unexpected writer (R-PUB-5)", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await readyAndReserve(w, id);
  const intruder = await w.f.propose(laneId(9), 1, w.f.main, { "x.txt": "x\n" });
  await sh(w.f.root, "--git-dir", w.f.canonical, "update-ref", "refs/heads/main", intruder);
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
  mkdirSync(join(w.f.root, "publisher-room2"));
  const ops2 = new GitOps({ exec: localExec, workdir: join(w.f.root, "publisher-room2"), config: ["protocol.file.allow=always"] });
  const pub2 = new ControlledPublisher(new GitPublisher(ops2, w.f.canonical));
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

// ------------------------------------------------------- the retained land input (R-LAND-4, R-LAND-7)

test("R-LAND-4, R-LAND-7: preparation retains the reservation-stage land input; reservation compares its bytes, without hashing, and a changed input stops it", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const { id } = await w.land(1, { "src/c.txt": "c\n" });
  await w.engine.prepare(id);
  const v = w.engine.view(id);
  const canonical = w.room.inputOf(id);
  const digest = `sha256:${(await import("node:crypto")).createHash("sha256").update(canonical).digest("hex")}`;
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
  const gate = (await import("./support.ts")).deferred();
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
  await sh(w.f.root, "--git-dir", w.f.canonical, "update-ref", "refs/heads/main", moved);
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
    while (calls.length < n) await new Promise((r) => setTimeout(r, 2));
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

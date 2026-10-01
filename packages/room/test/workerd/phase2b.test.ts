/**
 * Phase 2b: the Room with the real adapters on its shared SQLite. Lane B's
 * landing engine, workspaces, pinning and tree diff, and lane L's log
 * publisher, run over fake remotes: an Artifacts namespace and a publisher
 * sandbox over real git objects. Each case is one the checker's P1.9 named.
 */

import { describe, expect, it } from "vitest";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import type { CheckerConfig, Claim, Landing, LandOp, LogEntry, PolicyDocument, Proposal, Review, RosterRecord, SystemEvent, WorkspaceGrant } from "@generalbusiness/artroom-contract";
import { policy, requireCheck, requireReview } from "@generalbusiness/artroom-policy/helpers";
import { checkerInputs, filterSnapshot, snapshotDigest, type SnapshotEntry } from "@generalbusiness/artroom-policy";
import { forkName } from "@generalbusiness/artroom-git";
import { verifyLog } from "@generalbusiness/artroom-log";
import { env } from "cloudflare:workers";
import type { Genesis } from "@generalbusiness/artroom-contract";
import { artifactsLogRemote } from "../../src/logremote.ts";
import type { ArtifactsBinding } from "../../src/artifacts.ts";
import type { RoomEnv } from "../../src/config.ts";
import { draftRoom, foundRoom } from "../../src/founding.ts";
import { roomIdOf } from "../../src/ids.ts";
import { hex } from "../../src/crypto.ts";
import type { Room } from "../../src/index.ts";
import { digestJson } from "../../src/crypto.ts";
import { obligationsFor } from "../../src/obligations.ts";
import { artifactsErrors } from "../../src/memory/artifacts.ts";
import { addMember, advance, call, clock, Client, expectOk, expectRefusal, grant, iso, makeRoom, newKeyPair, openedWorkspace, placeRepo, pushChange, randomBytes, sign, tick, tokenLive, worldFor, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const entries = async (r: TestRoom): Promise<LogEntry[]> => [...(await r.admin.read({ q: "log", req: { limit: 500 } })).acts];
const events = (log: LogEntry[], type: SystemEvent["type"]) => log.filter((e) => e.entry.type === "system" && e.entry.event.type === type);
const op = async (r: TestRoom, id: string) => (await r.admin.read({ q: "op", op: id as never })) as LandOp & { integration?: string };

/** A lane with one change, proposed. */
async function proposed(r: TestRoom, who: Client, scope: string[], changes: Record<string, string>) {
  const c = await who.ok<Claim>("claim", null, { goal: "work", scope });
  const head = pushChange(r, c.lane, changes);
  await who.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
  return { lane: c.lane, head };
}

// ------------------------------------------------------------------ reservation

describe("reservation-time re-validation through lane B's engine (R-LAND-7)", () => {
  it("a reviewer's key retired between ready and reservation, under retiredEvidence: reopens: the landing is retryable evidence-invalid", async () => {
    const r = await makeRoom({ policy: { ...policy(requireReview({ paths: "src/**", from: "role:maintainer", id: "code-review" })), retiredEvidence: "reopens" } });
    const alice = await addMember(r, "@alice", "member");
    const bob = await addMember(r, "@bob", "maintainer");
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    await bob.ok<Review>("review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    // Prepared to ready directly, without the alarm's reservation, so it is still unreserved.
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await inDO(r, (room) => room.core.landing.prepare(l.op.id));
    expect((await op(r, l.op.id)).state).toBe("ready");
    // Retired, not compromised: admission does not invalidate it; reservation re-judges the evidence.
    await r.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "retired" });
    expect((await op(r, l.op.id)).state).toBe("ready");
    await tick(r);
    expect(await op(r, l.op.id)).toMatchObject({ state: "retryable", reason: "evidence-invalid" });
    expect(r.world.artifacts.main).not.toBe(head);
  });
});

// ------------------------------------------------------------------ publication

describe("unknown-outcome publication recovery (R-PUB-5, R-PUB-7)", () => {
  async function ready(r: TestRoom) {
    const alice = await addMember(r, "@alice", "member");
    const { lane, head } = await proposed(r, alice, ["docs/**"], { "docs/a.md": "a" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    return { l, head };
  }

  it("a push that applied but whose report was lost: the read-back decides, and the landing completes with one push", async () => {
    const r = await makeRoom();
    const { l, head } = await ready(r);
    r.world.landing.controls.lostPushReports = 1;
    await tick(r, 2);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
    expect(r.world.artifacts.main).toBe(head);
    expect(r.world.artifacts.remoteCalls.get("push")).toBe(1);
    // Every 60-second publication token was revoked after use (R-PUB-3).
    expect(r.world.artifacts.canonicalRepo().activeTokens()).toEqual([]);
  });

  it("the instance stops while the push is in flight: after a restart, the alarm revokes the dead instance's token, reads main back and completes forward", async () => {
    const r = await makeRoom();
    const { l, head } = await ready(r);
    r.world.landingFault = (point) => {
      if (point === "push-returned") throw new Error("the instance stopped");
    };
    // One alarm prepares; the next reserves and pushes.
    await tick(r, 2);
    expect((await op(r, l.op.id)).state).toBe("publishing");
    expect(r.world.artifacts.canonicalRepo().activeTokens().length).toBe(1);
    r.world.landingFault = null;
    await evictDurableObject(r.stub);
    await tick(r);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
    expect(r.world.artifacts.main).toBe(head);
    expect(r.world.artifacts.remoteCalls.get("push")).toBe(1);
    expect(r.world.artifacts.canonicalRepo().activeTokens()).toEqual([]);
  });

  it("pushes with no answer leave the slot held, unresolved, retried on lane B's backoff; the alarm is set from the engine's next due time", async () => {
    const r = await makeRoom();
    const { l, head } = await ready(r);
    r.world.landing.controls.failPushes = 1;
    await tick(r, 2);
    expect((await op(r, l.op.id)).state).toBe("unresolved");
    const due = await inDO(r, (room) => ({ engine: room.core.landing.nextDue(), alarm: room.core.nextAlarm(), now: room.core.now() }));
    expect(due.engine).toBeGreaterThan(due.now);
    expect(due.alarm).toBeLessThanOrEqual(due.engine!);
    advance(due.engine! - clock.now);
    await tick(r);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
    expect(r.world.artifacts.main).toBe(head);
  });
});

// ------------------------------------------------------------------ workspaces

describe("workspace lease races and delayed cleanup (R-WS, R-CRED-8, R-LANE-8)", () => {
  it("a renewal while the workspace is pending: the token ends within the renewed lease", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await openedWorkspace(r, c.lane);
    advance(600_000);
    await r.admin.ok("renew", { lane: c.lane }, { lease: 1 });
    await tick(r);
    const g = expectOk(await r.admin.request<WorkspaceGrant>({ kind: "workspace-token", lane: c.lane, lease: 1 }));
    const lease = (await r.admin.read({ q: "lane", lane: c.lane })) as unknown as { lease: { expiresAt: string } };
    expect(Date.parse(g.expiresAt)).toBeLessThanOrEqual(Date.parse(lease.lease.expiresAt));
    // Minted after the renewal: it runs past the old deadline.
    expect(Date.parse(g.expiresAt)).toBeGreaterThan(clock.now - 600_000 + 1_800_000 - 10_000);
  });

  it("a take-over while the lease token is being minted: that token is revoked, and the new holder's workspace is the only live access", async () => {
    const r = await makeRoom();
    const alice = await addMember(r, "@alice", "member");
    const bob = await addMember(r, "@bob", "member");
    const c = await alice.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await openedWorkspace(r, c.lane);
    const sql = await inDO(r, (room) => room.core.sql);
    // Alice's lease ends while Artifacts mints her token.
    r.world.artifacts.on("createToken", () => void sql.all("UPDATE lanes SET state = 'unheld', why = 'released', holder = NULL, lease_gen = lease_gen + 1 WHERE id = ?", c.lane));
    await tick(r, 2);
    const fork = r.world.artifacts.repo(forkName(r.world.artifacts.canonical, c.lane));
    expect(fork.activeTokens()).toEqual([]);
    await bob.ok("claim", { lane: c.lane }, { scope: ["src/**"], expectedGeneration: 0 });
    const ws = expectOk(await bob.request<{ id: string }>({ kind: "workspace", lane: c.lane, lease: 3 }));
    await tick(r);
    expect(await r.admin.read({ q: "op", op: ws.id as never })).toMatchObject({ state: "ready", detail: { leaseGeneration: 3 } });
    const g = expectOk(await bob.request<WorkspaceGrant>({ kind: "workspace-token", lane: c.lane, lease: 3 }));
    expect(fork.activeTokens().length).toBe(1);
    expect(tokenLive(r, c.lane, g.token)).toBe(true);
    expectRefusal(await alice.request({ kind: "workspace-token", lane: c.lane, lease: 1 }), "not-holder");
  });

  it("Artifacts cannot revoke at release: the cleanup is owed, the alarm follows lane B's capped backoff, and the token is revoked once Artifacts answers", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const ws = expectOk(await r.admin.request<{ id: string }>({ kind: "workspace", lane: c.lane, lease: 1 }));
    await tick(r);
    expect(await r.admin.read({ q: "op", op: ws.id as never })).toMatchObject({ state: "ready" });
    const g = expectOk(await r.admin.request<WorkspaceGrant>({ kind: "workspace-token", lane: c.lane, lease: 1 }));
    // Artifacts is down for every revocation and listing for a while.
    for (let i = 0; i < 30; i++) {
      r.world.artifacts.failRemote("revokeToken", artifactsErrors.internal());
      r.world.artifacts.failRemote("listTokens", artifactsErrors.internal());
    }
    await r.admin.ok("release", { lane: c.lane }, { lease: 1 });
    await tick(r);
    expect(tokenLive(r, c.lane, g.token)).toBe(true);
    const owed = await inDO(r, (room) => ({ pending: room.core.workspaces.pendingCleanup(), due: room.core.workspaces.nextDue(), alarm: room.core.nextAlarm(), now: room.core.now() }));
    expect(owed.pending).toBeGreaterThan(0);
    // Never due in the past: the alarm never spins, and it is no later than lane B's next duty.
    expect(owed.due).toBeGreaterThan(owed.now);
    expect(owed.alarm).toBeLessThanOrEqual(owed.due!);
    // Artifacts recovers; the alarm at the due time settles the cleanup.
    r.world.artifacts.recover();
    advance(owed.due! - clock.now);
    await tick(r);
    expect(tokenLive(r, c.lane, g.token)).toBe(false);
    expect(await inDO(r, (room) => room.core.workspaces.pendingCleanup())).toBe(0);
  });
});

// ------------------------------------------------------------------ checks

describe("policy activation and recompute, scoped check carry and filtered checker inputs (R-POL-9, R-CARRY-6 to 10, R-OBL-3)", () => {
  const scoped: CheckerConfig = { format: "artroom-checker-v1", inputs: ["src/**"], volatile: false, timeoutSeconds: 60 };
  const whole: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60 };

  async function checkRoom(cfg: CheckerConfig) {
    const doc = policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
    const r = await makeRoom({ policy: doc, files: { ".artroom/checkers/unit.json": JSON.stringify(cfg) } });
    const alice = await addMember(r, "@alice", "member");
    const ci = await addMember(r, "@ci", "checker");
    return { r, doc, alice, ci };
  }

  /** The filtered snapshot of an integration, as a scoped runner receives it. */
  async function snapshotOf(r: TestRoom, integration: string, paths: readonly string[]) {
    const entries: SnapshotEntry[] = [...r.world.artifacts.blobs(integration as never)].map(([p, b]) => [p, "100644", b] as const);
    return snapshotDigest(filterSnapshot(entries, paths));
  }

  function checkBody(r: TestRoom, cfg: CheckerConfig, integration: string, input: unknown) {
    void r;
    return { obligation: "obl_unit-tests", check: "unit", integration, input, config: digestJson(cfg), runner: `sha256:${"0".repeat(64)}`, volatile: false, ok: true, detail: "42 passed" };
  }

  it("a filtered input binds only the room's snapshot over the checker's inputs plus the global inputs", async () => {
    const { r, doc, alice, ci } = await checkRoom(scoped);
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r);
    const integration = (await op(r, l.op.id)).integration!;
    const paths = checkerInputs(scoped.inputs, doc.carry)!;
    const snapshot = await snapshotOf(r, integration, paths);
    expectRefusal(await ci.act("check", { lane, generation: 1 }, checkBody(r, scoped, integration, { kind: "filtered", snapshot, paths: ["src/**"] })), "check-binding");
    expectRefusal(await ci.act("check", { lane, generation: 1 }, checkBody(r, scoped, integration, { kind: "filtered", snapshot: `sha256:${"1".repeat(64)}`, paths })), "check-binding");
    expectOk(await ci.act("check", { lane, generation: 1 }, checkBody(r, scoped, integration, { kind: "filtered", snapshot, paths })));
    await tick(r, 2);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
  });

  async function carryCase(cfg: CheckerConfig, mainChange: Record<string, string>) {
    const { r, doc, alice, ci } = await checkRoom(cfg);
    const bob = await addMember(r, "@bob", "member");
    // Bob's landing moves main first; Alice's is prepared on the old main.
    const other = await proposed(r, bob, Object.keys(mainChange).map((p) => p.split("/")[0] + "/**"), mainChange);
    const first = await bob.ok<Landing>("land", { lane: other.lane, generation: 1 }, { lease: 1, head: other.head });
    const mine = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane: mine.lane, generation: 1 }, { lease: 1, head: mine.head });
    // Both are prepared on the same main; Alice's check passes on her first integration.
    await tick(r);
    const before = await op(r, l.op.id);
    const i1 = before.integration!;
    const paths = checkerInputs(cfg.inputs, doc.carry);
    const input = paths ? { kind: "filtered", snapshot: await snapshotOf(r, i1, paths), paths } : { kind: "tree", tree: r.world.artifacts.treeOf(i1 as never) };
    const check = await ci.ok("check", { lane: mine.lane, generation: 1 }, checkBody(r, cfg, i1, input));
    // Bob's landing reserves first and moves main; Alice's is prepared again on the new main, and the room
    // judges carrying her check onto the new integration.
    await tick(r, 4);
    expect(await op(r, first.op.id)).toMatchObject({ state: "landed" });
    const after = await op(r, l.op.id);
    return { r, l, after, i1, check, mine };
  }

  it("a scoped check carries onto the new integration when main moved outside its inputs: snapshot-identical, and the landing completes", async () => {
    const { r, l, after, i1, check, mine } = await carryCase(scoped, { "docs/guide.md": "more docs" });
    expect(after.state).toBe("landed");
    expect(after.integration).not.toBe(i1);
    // On the new integration, the obligation was met by the earlier check, carried.
    const onNew = await inDO(r, (room) => {
      const policy = room.core.activePolicy();
      return obligationsFor(room.core.sql, mine.lane, 1, { doc: policy.doc, checkers: policy.checkers, integration: after.integration as never })[0]!;
    });
    expect(onNew.state).toBe("met");
    expect(onNew.evidence).toEqual([expect.objectContaining({ basis: "carried", act: check.id, kind: "check", reason: expect.objectContaining({ code: "snapshot-identical" }), rules: [] })]);
    void l;
  });

  it("a scoped check does not carry when main changed a global input (R-CARRY-8): the landing waits for a new check", async () => {
    const { after, i1 } = await carryCase(scoped, { "tests/login.test.ts": "a new failing test" });
    expect(after.state).toBe("preparing");
    expect(after.integration).not.toBe(i1);
    expect((after as unknown as { waiting: string[] }).waiting).toEqual(["obl_unit-tests"]);
  });

  it("a whole-tree check does not carry once main moved: the tree changed", async () => {
    const { after } = await carryCase(whole, { "docs/guide.md": "more docs" });
    expect(after.state).toBe("preparing");
    expect((after as unknown as { waiting: string[] }).waiting).toEqual(["obl_unit-tests"]);
  });

  it("an activation adding a check requirement re-prepares an unreserved landing, recomputes, and the landing waits for the check, then lands", async () => {
    const r = await makeRoom({ files: { ".artroom/checkers/unit.json": JSON.stringify(whole) } });
    const alice = await addMember(r, "@alice", "member");
    const ci = await addMember(r, "@ci", "checker");
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await inDO(r, (room) => room.core.landing.prepare(l.op.id));
    expect((await op(r, l.op.id)).state).toBe("ready");
    const doc: PolicyDocument = policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
    await inDO(r, (room) => room.core.sql.transaction(() => room.core.activate(doc, room.core.activePolicy().checkers, null, iso(clock.now))));
    await tick(r, 3);
    const waiting = await op(r, l.op.id);
    expect(waiting).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    expect(events(await entries(r), "obligations-recomputed").at(-1)!.entry).toMatchObject({ event: { lane, generation: 1, obligations: ["obl_unit-tests"] } });
    await ci.ok("check", { lane, generation: 1 }, checkBody(r, whole, waiting.integration!, { kind: "tree", tree: r.world.artifacts.treeOf(waiting.integration as never) }));
    await tick(r, 3);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
    expect(r.world.artifacts.main).toBe(head);
  });
});

// ------------------------------------------------------------------ offline replay

describe("offline replay of the produced log (lane L's verifyLog, R-LOG-10)", () => {
  it("a session with roster acts, reviews, a check, a landing and a revocation publishes a log that verifies, with every decision replayed", async () => {
    const cfg: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60 };
    const doc = policy(requireReview({ paths: "src/**", from: "role:maintainer", id: "code-review" }), requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
    const r = await makeRoom({ policy: doc, files: { ".artroom/checkers/unit.json": JSON.stringify(cfg) } });
    const alice = await addMember(r, "@alice", "member");
    const bob = await addMember(r, "@bob", "maintainer");
    const ci = await addMember(r, "@ci", "checker");
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    await bob.ok<Review>("review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r);
    const integration = (await op(r, l.op.id)).integration!;
    await ci.ok("check", { lane, generation: 1 }, { obligation: "obl_unit-tests", check: "unit", integration, input: { kind: "tree", tree: r.world.artifacts.treeOf(integration as never) }, config: digestJson(cfg), runner: `sha256:${"0".repeat(64)}`, volatile: false, ok: true, detail: "ok" });
    await tick(r, 3);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
    await r.admin.ok<RosterRecord>("roster", null, { op: "revoke-key", key: bob.key, reason: "retired" });
    await tick(r);
    const last = (await entries(r)).at(-1)!.seq;
    const p = await call<{ through: number; commit: string }>(r.stub.publishLog());
    expect(p.through).toBe(last);
    const report = await verifyLog(r.world.artifacts.canonicalRepo());
    expect(report.failures).toEqual([]);
    expect(report).toMatchObject({ ok: true, verifiedThrough: p.through, publishedThrough: p.through, room: r.id });
    // Every recorded decision, in receipts and in events, was replayed.
    const recorded = (await entries(r)).reduce((n, e) => {
      const x = e.entry as unknown as { receipt?: { decisions?: unknown[] }; event?: { decisions?: unknown[] } };
      return n + (x.receipt?.decisions?.length ?? 0) + (x.event?.decisions?.length ?? 0);
    }, 0);
    expect(recorded).toBeGreaterThan(3);
    expect(report.decisionsReplayed).toBe(recorded);
    const log = await entries(r);
    for (const t of ["land-evaluated", "land-reserved", "land-outcome"] as const) expect(events(log, t).length).toBeGreaterThan(0);
  });
});


// ------------------------------------------------------------------ the production adapters' own guards

describe("the adapters' boundaries", () => {
  it("a repository identity in a namespace this deployment has no Artifacts binding for: found is unavailable, and nothing is read", async () => {
    const admin = newKeyPair();
    const repo = `elsewhere/${hex(randomBytes(16))}`;
    const input = { name: `nb-${hex(randomBytes(6))}`, repo: { kind: "import", grant: grant(repo, admin.key) }, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key };
    const d = await draftRoom(env as unknown as RoomEnv, input, clock.now);
    const world = worldFor(roomIdOf(d.genesis as Genesis));
    placeRepo(world, `test-import/${repo.split("/")[1]}`);
    world.artifacts.main = world.artifacts.commit(null, { "README.md": "# here\n" });
    await expect(foundRoom(env as unknown as RoomEnv, d.genesis, sign(admin.seed, "artroom-genesis-v1", d.genesis), d.draft)).rejects.toMatchObject({ code: "unavailable" });
    expect(world.artifacts.remoteCalls.get("log") ?? 0).toBe(0);
  });

  it("a repository at the lane's fork name that is not a fork of the room's repository is never read as the lane's fork", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const a = r.world.artifacts;
    const head = a.commit(a.main, { "src/app.ts": "v2" });
    // Someone else's repository, at the fork's name, holding the head.
    await a.binding.create(forkName(a.canonical, c.lane));
    const imposter = a.repo(forkName(a.canonical, c.lane));
    for (const o of a.closure(head)) imposter.objects.add(o);
    expectRefusal(await r.admin.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }), "head-unknown");
  });

  it("the production log remote reads the published log exactly through the binding, so verifyLog runs over it; it pushes only through the sandbox", async () => {
    const r = await makeRoom();
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    await call(r.stub.publishLog());
    const a = r.world.artifacts;
    const loc = { namespace: a.namespace, name: a.canonical };
    const remote = artifactsLogRemote(a.binding as unknown as ArtifactsBinding, {}, loc);
    expect(await verifyLog(remote)).toMatchObject({ ok: true, failures: [] });
    // A binding that decodes a blob differently: the object does not hash to what was asked, and is refused.
    const lying = {
      ...a.binding,
      get: async (name: string) => {
        const repo = await a.binding.get(name);
        return Object.assign(Object.create(repo), { readBlob: async () => new Blob(["not what was stored"]) });
      },
    } as unknown as ArtifactsBinding;
    await expect(verifyLog(artifactsLogRemote(lying, {}, loc))).rejects.toThrow(/could not be read exactly/);
    await expect(remote.push([], "refs/artroom/log", "0".repeat(40) as never, null)).rejects.toThrow(/pushLog/);
  });

  it("with a policy carry rule in force, a check does not carry: it reruns", async () => {
    const scopedCfg: CheckerConfig = { format: "artroom-checker-v1", inputs: ["src/**"], volatile: false, timeoutSeconds: 60 };
    const base = policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
    const doc: PolicyDocument = { ...base, rules: [...base.rules, { id: "keep", kind: "carry", evidence: "check", allow: "true" }] };
    const r = await makeRoom({ policy: doc, files: { ".artroom/checkers/unit.json": JSON.stringify(scopedCfg) } });
    const alice = await addMember(r, "@alice", "member");
    const bob = await addMember(r, "@bob", "member");
    const ci = await addMember(r, "@ci", "checker");
    const other = await proposed(r, bob, ["docs/**"], { "docs/guide.md": "more" });
    await bob.ok<Landing>("land", { lane: other.lane, generation: 1 }, { lease: 1, head: other.head });
    const mine = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane: mine.lane, generation: 1 }, { lease: 1, head: mine.head });
    await tick(r);
    const i1 = (await op(r, l.op.id)).integration!;
    const paths = checkerInputs(scopedCfg.inputs, doc.carry)!;
    const entries: SnapshotEntry[] = [...r.world.artifacts.blobs(i1 as never)].map(([p, b]) => [p, "100644", b] as const);
    const snapshot = await snapshotDigest(filterSnapshot(entries, paths));
    await ci.ok("check", { lane: mine.lane, generation: 1 }, { obligation: "obl_unit-tests", check: "unit", integration: i1, input: { kind: "filtered", snapshot, paths }, config: digestJson(scopedCfg), runner: `sha256:${"0".repeat(64)}`, volatile: false, ok: true, detail: "ok" });
    await tick(r, 4);
    expect(await op(r, l.op.id)).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
  });
});

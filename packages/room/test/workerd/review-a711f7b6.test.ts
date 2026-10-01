/**
 * Review a711f7b6. The checker's diagnostics asserted the defective
 * outcomes; each test here asserts the correct one, through the real
 * adapters over fake remotes.
 */

import { describe, expect, it } from "vitest";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import type { CheckBody, CheckerConfig, CheckJob, Claim, Landing, LandOp, PolicyDocument, Proposal, Sha } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import { checkerInputs, filterSnapshot, snapshotDigest, type SnapshotEntry } from "@generalbusiness/artroom-policy";
import { forkName } from "@generalbusiness/artroom-git";
import type { Room } from "../../src/index.ts";
import { digestJson } from "../../src/crypto.ts";
import { obligationsFor } from "../../src/obligations.ts";
import { snapshotCommit } from "../../src/snapshot.ts";
import { artifactsErrors } from "../../src/memory/artifacts.ts";
import { addMember, advance, clock, Client, expectOk, expectRefusal, iso, makeRoom, pushChange, tick, tokenLive, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const op = async (r: TestRoom, id: string) => (await r.admin.read({ q: "op", op: id as never })) as LandOp & { integration?: string; waiting?: string[] };
const RUNNER = `sha256:${"0".repeat(64)}`;

async function proposed(r: TestRoom, who: Client, scope: string[], changes: Record<string, string>) {
  const c = await who.ok<Claim>("claim", null, { goal: "work", scope });
  const head = pushChange(r, c.lane, changes);
  await who.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
  return { lane: c.lane, head };
}

const scoped: CheckerConfig = { format: "artroom-checker-v1", inputs: ["src/**"], volatile: false, timeoutSeconds: 60 };

async function checkRoom(cfg: CheckerConfig = scoped) {
  const doc = policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
  const r = await makeRoom({ policy: doc, files: { ".artroom/checkers/unit.json": JSON.stringify(cfg), "package.json": "{}" } });
  const alice = await addMember(r, "@alice", "member");
  const ci = await addMember(r, "@ci", "checker");
  return { r, doc, alice, ci };
}

async function snapshotOf(r: TestRoom, integration: string, paths: readonly string[]) {
  const entries: SnapshotEntry[] = [...r.world.artifacts.blobs(integration as never)].map(([p, b]) => [p, "100644", b] as const);
  return snapshotDigest(filterSnapshot(entries, paths));
}

function body(cfg: CheckerConfig, integration: string, input: unknown, extra: Partial<CheckBody> = {}) {
  return { obligation: "obl_unit-tests", check: "unit", integration, input, config: digestJson(cfg), runner: RUNNER, volatile: cfg.volatile, ok: true, detail: "42 passed", ...extra };
}

/**
 * Alice's landing becomes ready on a second integration with her scoped check carried from the first; Bob's
 * landing moved main in between. The engine's work runs step by step, so the ready operation stays unreserved.
 */
async function carriedAndReady() {
  const { r, doc, alice, ci } = await checkRoom();
  r.world.runnerDigest = () => RUNNER;
  const bob = await addMember(r, "@bob", "member");
  // The background steps that would reserve it are held back; this test drives the engine itself.
  await inDO(r, async (room) => {
    await room.core.idle();
    const run = room.core.run.bind(room.core);
    room.core.run = (step) => {
      if (step !== "landing" && step !== "recompute") run(step);
    };
  });
  const other = await proposed(r, bob, ["docs/**"], { "docs/guide.md": "more" });
  const first = await bob.ok<Landing>("land", { lane: other.lane, generation: 1 }, { lease: 1, head: other.head });
  const mine = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
  const l = await alice.ok<Landing>("land", { lane: mine.lane, generation: 1 }, { lease: 1, head: mine.head });
  await inDO(r, async (room) => {
    await room.core.landing.prepare(first.op.id);
    await room.core.landing.prepare(l.op.id);
  });
  const i1 = (await op(r, l.op.id)).integration!;
  const paths = checkerInputs(scoped.inputs, doc.carry)!;
  const check = await ci.ok("check", { lane: mine.lane, generation: 1 }, body(scoped, i1, { kind: "filtered", snapshot: await snapshotOf(r, i1, paths), paths }));
  await inDO(r, async (room) => {
    room.core.sql.transaction(() => room.core.landing.reserve(first.op.id));
    await room.core.landing.publish();
    await room.core.landing.refreshMain();
    await room.core.landing.prepare(l.op.id);
  });
  const ready = await op(r, l.op.id);
  expect(ready.state).toBe("ready");
  expect(ready.integration).not.toBe(i1);
  return { r, l, mine, ready, check, ci };
}

const statusOn = (r: TestRoom, lane: string, integration: string) =>
  inDO(r, (room) => {
    const p = room.core.activePolicy();
    return obligationsFor(room.core.sql, lane, 1, { doc: p.doc, checkers: p.checkers, integration: integration as Sha })[0]!;
  });

/** Drive the landing as far as it goes: recompute, prepare, evaluate, reserve, publish. */
async function driveToEnd(r: TestRoom, opId: string) {
  await inDO(r, async (room) => {
    await room.core.recompute();
    await room.core.landing.prepare(opId as never);
    await room.core.landing.evaluate(opId as never);
    room.core.sql.transaction(() => room.core.landing.reserve(opId as never));
    await room.core.landing.publish();
  });
}

// ------------------------------------------------------------------ 1. P1

describe("1. a stored check carry counts only under the policy version that judged it", () => {
  for (const mode of ["checks: false", "a carry rule that refuses checks"] as const)
    it(`an activation with ${mode}: the carried check no longer counts, the obligation is open, and the landing is not reserved`, async () => {
      const { r, l, mine, ready } = await carriedAndReady();
      expect((await statusOn(r, mine.lane, ready.integration!)).state).toBe("met");
      await inDO(r, (room) => {
        const old = room.core.activePolicy();
        const doc: PolicyDocument =
          mode === "checks: false"
            ? { ...old.doc, carry: { ...old.doc.carry, checks: false } }
            : { ...old.doc, rules: [...old.doc.rules, { id: "stop", kind: "carry", evidence: "check", allow: "false" }] };
        room.core.sql.transaction(() => room.core.activate(doc, old.checkers, null, iso(clock.now)));
      });
      const now = await statusOn(r, mine.lane, ready.integration!);
      expect(now.state).toBe("open");
      expect(now.evidence).toEqual([]);
      await driveToEnd(r, l.op.id);
      const after = await op(r, l.op.id);
      expect(after.state).not.toBe("landed");
      expect(after).toMatchObject({ waiting: ["obl_unit-tests"] });
      expect(r.world.artifacts.main).not.toBe(ready.integration);
    });

  it("reservation itself refuses a ready landing whose carried check stopped counting: retryable, evidence-invalid", async () => {
    const { r, l, ready } = await carriedAndReady();
    // The carry is judged under one version; a newer version is active by the time of reservation.
    await inDO(r, (room) => {
      room.core.sql.all("UPDATE check_carries SET policy = 'act_0_00000000'");
      expect(room.core.sql.transaction(() => room.core.landing.reserve(l.op.id))).toMatchObject({ kind: "retryable", reason: "evidence-invalid" });
    });
    expect((await op(r, l.op.id)).state).toBe("retryable");
    void ready;
  });

  it("reservation requires every obligation met on the integration, even one with no evidence the landing relied on", async () => {
    const { r, l } = await carriedAndReady();
    await inDO(r, (room) => {
      room.core.sql.all("UPDATE check_carries SET policy = 'act_0_00000000'");
      // The engine's record of the evidence it relied on, emptied: only the obligations themselves still say no.
      const row = room.core.sql.all("SELECT body FROM artroom_land_op WHERE id = ?", l.op.id)[0]!;
      room.core.sql.all("UPDATE artroom_land_op SET body = ? WHERE id = ?", JSON.stringify({ ...JSON.parse(row["body"] as string), evidence: [] }), l.op.id);
      expect(room.core.sql.transaction(() => room.core.landing.reserve(l.op.id))).toMatchObject({ kind: "retryable", reason: "obligation-open" });
    });
  });

  it("the earlier check's key compromised after the carry: the obligation is open and the landing is not reserved", async () => {
    const { r, l, mine, ready, ci } = await carriedAndReady();
    await r.admin.ok("roster", null, { op: "revoke-key", key: ci.key, reason: "compromised" });
    expect((await statusOn(r, mine.lane, ready.integration!)).state).toBe("open");
    await driveToEnd(r, l.op.id);
    expect((await op(r, l.op.id)).state).not.toBe("landed");
  });

  it("the checker configuration changed: the carried check no longer qualifies", async () => {
    const { r, mine, ready } = await carriedAndReady();
    await inDO(r, (room) => {
      const old = room.core.activePolicy();
      const changed = { ...scoped, timeoutSeconds: 61 };
      room.core.sql.transaction(() => room.core.activate(old.doc, { unit: { config: changed, digest: digestJson(changed) } }, null, iso(clock.now)));
    });
    expect((await statusOn(r, mine.lane, ready.integration!)).state).toBe("open");
  });
});

// ------------------------------------------------------------------ 4b, 4c, 4e

describe("4. check carry fails closed; the signed volatile flag must be the configuration's", () => {
  async function carryUnder(attested: string | null, extraRule?: PolicyDocument["rules"][number]) {
    const base = policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
    const doc: PolicyDocument = extraRule ? { ...base, rules: [...base.rules, extraRule] } : base;
    const r = await makeRoom({ policy: doc, files: { ".artroom/checkers/unit.json": JSON.stringify(scoped), "package.json": "{}" } });
    r.world.runnerDigest = () => attested;
    const alice = await addMember(r, "@alice", "member");
    const bob = await addMember(r, "@bob", "member");
    const ci = await addMember(r, "@ci", "checker");
    const other = await proposed(r, bob, ["docs/**"], { "docs/guide.md": "more" });
    await bob.ok<Landing>("land", { lane: other.lane, generation: 1 }, { lease: 1, head: other.head });
    const mine = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane: mine.lane, generation: 1 }, { lease: 1, head: mine.head });
    await tick(r);
    const i1 = (await op(r, l.op.id)).integration!;
    const paths = checkerInputs(scoped.inputs, doc.carry)!;
    await ci.ok("check", { lane: mine.lane, generation: 1 }, body(scoped, i1, { kind: "filtered", snapshot: await snapshotOf(r, i1, paths), paths }));
    await tick(r, 4);
    return op(r, l.op.id);
  }

  it("no runner environment attested for the checker: the check does not carry (R-CARRY-6 cannot be judged), and the landing waits", async () => {
    expect(await carryUnder(null)).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
  });

  it("another runner environment attested: the check does not carry", async () => {
    expect(await carryUnder(`sha256:${"9".repeat(64)}`)).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
  });

  it("the same runner attested: the check carries and the landing completes", async () => {
    expect(await carryUnder(RUNNER)).toMatchObject({ state: "landed" });
  });

  it("a carry rule for reviews only does not stop a check carrying; one for checks does (its decision cannot be sealed yet)", async () => {
    expect(await carryUnder(RUNNER, { id: "reviews", kind: "carry", evidence: "review", allow: "true" })).toMatchObject({ state: "landed" });
    expect(await carryUnder(RUNNER, { id: "checks", kind: "carry", evidence: "any", allow: "true" })).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
  });

  for (const configured of [false, true])
    it(`a check whose volatile flag contradicts the configuration (volatile: ${configured}) is check-binding; the matching flag is admitted`, async () => {
      const cfg: CheckerConfig = { ...scoped, volatile: configured };
      const { r, doc, alice, ci } = await checkRoom(cfg);
      const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
      const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
      await tick(r);
      const i = (await op(r, l.op.id)).integration!;
      const paths = checkerInputs(cfg.inputs, doc.carry)!;
      const input = { kind: "filtered", snapshot: await snapshotOf(r, i, paths), paths };
      expectRefusal(await ci.act("check", { lane, generation: 1 }, body(cfg, i, input, { volatile: !configured })), "check-binding");
      expectOk(await ci.act("check", { lane, generation: 1 }, body(cfg, i, input)));
    });
});

// ------------------------------------------------------------------ 4d

describe("4d. a scoped check binds the snapshot commit the room recorded for the integration (R-OBL-3, R-CARRY-9)", () => {
  it("contract-shaped CheckJob fixture: the job's integration is the recorded snapshot commit, and the check lane G signs from it is admitted and counts for the landing", async () => {
    const { r, doc, alice, ci } = await checkRoom();
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r);
    const integration = (await op(r, l.op.id)).integration!;
    // The room recorded the snapshot commit when the check obligation started waiting on this integration.
    const rec = await inDO(r, (room) => room.core.sql.all("SELECT * FROM check_snapshots WHERE integration = ?", integration)[0]!);
    const paths = checkerInputs(scoped.inputs, doc.carry)!;
    expect(JSON.parse(rec["paths"] as string)).toEqual([...paths].sort());
    expect(rec["digest"]).toBe(await snapshotOf(r, integration, paths));
    // The commit is a real snapshot: exactly the filtered files, no parents, derived from its inputs alone.
    const entries = filterSnapshot([...r.world.artifacts.blobs(integration as never)].map(([p, b]) => [p, "100644", b] as const), paths);
    const derived = snapshotCommit(entries, "unit", rec["digest"] as never);
    expect(derived.commit).toBe(rec["commit_sha"]);
    for (const o of derived.objects) r.world.artifacts.put(o);
    expect([...r.world.artifacts.blobs(derived.commit)].map(([p]) => p).sort()).toEqual(entries.map(([p]) => p).sort());
    expect(r.world.artifacts.parents(derived.commit)).toEqual([]);
    // The job, as the contract shapes it, and the check body as lane G's Checker builds it from the job.
    const job: CheckJob = {
      id: "job_fixture0000000000",
      room: r.id,
      lane,
      generation: 1,
      head,
      obligation: "obl_unit-tests",
      check: "unit",
      integration: rec["commit_sha"] as Sha,
      input: { kind: "filtered", snapshot: rec["digest"] as never, paths },
      readUrl: "https://artifacts.test/snapshots.git",
      gitAuthEnv: {},
      config: digestJson(scoped),
      landOp: l.op.id,
      deadline: iso(clock.now + 900_000),
    };
    const signedBody: CheckBody = { obligation: job.obligation, check: job.check, integration: job.integration, input: job.input, config: job.config, runner: RUNNER as `sha256:${string}`, volatile: false, ok: true, detail: "Machine-run check", landOp: job.landOp! };
    expectOk(await ci.act("check", { lane: job.lane, generation: job.generation }, signedBody));
    await tick(r, 3);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed", integration });
  });

  it("a snapshot commit with another digest, another checker's commit, or an unrecorded commit is check-binding", async () => {
    const { r, doc, alice, ci } = await checkRoom();
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r);
    const integration = (await op(r, l.op.id)).integration!;
    const rec = await inDO(r, (room) => room.core.sql.all("SELECT * FROM check_snapshots WHERE integration = ?", integration)[0]!);
    const paths = checkerInputs(scoped.inputs, doc.carry)!;
    const commit = rec["commit_sha"] as string;
    expectRefusal(await ci.act("check", { lane, generation: 1 }, body(scoped, commit, { kind: "filtered", snapshot: `sha256:${"1".repeat(64)}`, paths })), "check-binding");
    expectRefusal(await ci.act("check", { lane, generation: 1 }, body(scoped, commit, { kind: "tree", tree: r.world.artifacts.treeOf(integration as never) })), "check-binding");
    expectRefusal(await ci.act("check", { lane, generation: 1 }, body(scoped, "c".repeat(40), { kind: "filtered", snapshot: rec["digest"], paths })), "check-binding");
  });
});

// ------------------------------------------------------------------ 2. P2

describe("2. access opened before lane B's workspaces is cleaned up by lane B when its lease ends", () => {
  /** A ready workspace of the previous revision, with a live 30-minute token, migrated to version 7. */
  async function legacy(opts: { recorded?: boolean } = {}) {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const c = await r.admin.ok<Claim>("claim", null, { goal: "old", scope: ["src/**"] });
    pushChange(r, c.lane, { "src/app.ts": "v2" });
    const fork = r.world.artifacts.repo(forkName(r.world.artifacts.canonical, c.lane));
    const token = fork.mint("write", 1800);
    await inDO(r, (room) => {
      const sql = room.core.sql;
      sql.all("INSERT INTO workspaces (id, lane, lease_gen, state, body, updated_ms) VALUES ('old_ws', ?, 1, 'ready', '{}', ?)", c.lane, clock.now);
      // Recorded, or minted by a provision whose answer was never recorded (pending).
      if (opts.recorded !== false) sql.all("INSERT INTO fork_tokens (id, lane, lease_gen, revoked) VALUES (?, ?, 1, 0)", token.id, c.lane);
      else sql.all("UPDATE workspaces SET state = 'pending' WHERE id = 'old_ws'");
      sql.all("DROP TABLE ws_leases");
      sql.all("DROP TABLE check_carries");
      sql.all("DROP TABLE land_reeval");
      sql.all("UPDATE schema_version SET v = 5");
    });
    await evictDurableObject(r.stub);
    return { r, c, token, bob };
  }
  const pending = (r: TestRoom) => inDO(r, (room) => room.core.workspaces.pendingCleanup());

  it("release without reopening: the old token is revoked through lane B's duties", async () => {
    const { r, c, token } = await legacy();
    expect(tokenLive(r, c.lane, token.plaintext)).toBe(true);
    await r.admin.ok("release", { lane: c.lane }, { lease: 1 });
    await tick(r, 2);
    expect(tokenLive(r, c.lane, token.plaintext)).toBe(false);
    expect(await pending(r)).toBe(0);
  });

  it("a mint whose answer was never recorded: the inventory lane B is owed revokes the unknown token", async () => {
    const { r, c, token } = await legacy({ recorded: false });
    await r.admin.ok("release", { lane: c.lane }, { lease: 1 });
    await tick(r, 2);
    expect(tokenLive(r, c.lane, token.plaintext)).toBe(false);
  });

  it("a recorded token is owed by its ID: revoked even while Artifacts cannot list the fork's tokens", async () => {
    const { r, c, token } = await legacy();
    for (let i = 0; i < 40; i++) r.world.artifacts.failRemote("listTokens", artifactsErrors.internal());
    await r.admin.ok("release", { lane: c.lane }, { lease: 1 });
    await tick(r, 2);
    expect(tokenLive(r, c.lane, token.plaintext)).toBe(false);
    // The inventory is still owed, until Artifacts can list.
    expect(await pending(r)).toBeGreaterThan(0);
  });

  it("expiry without reopening: the old token is revoked", async () => {
    const { r, c, token } = await legacy();
    advance(1800 * 1000 + 1);
    await tick(r, 2);
    expect(tokenLive(r, c.lane, token.plaintext)).toBe(false);
  });

  it("take-over without reopening: the old token is revoked, and with Artifacts down the cleanup stays owed until it answers", async () => {
    const { r, c, token, bob } = await legacy();
    for (let i = 0; i < 20; i++) {
      r.world.artifacts.failRemote("revokeToken", artifactsErrors.internal());
      r.world.artifacts.failRemote("listTokens", artifactsErrors.internal());
    }
    await r.admin.ok("release", { lane: c.lane }, { lease: 1 });
    await bob.ok("claim", { lane: c.lane }, { scope: ["src/**"], expectedGeneration: 0 });
    await tick(r);
    expect(tokenLive(r, c.lane, token.plaintext)).toBe(true);
    expect(await pending(r)).toBeGreaterThan(0);
    r.world.artifacts.recover();
    const due = await inDO(r, (room) => room.core.workspaces.nextDue());
    advance(due! - clock.now);
    await tick(r);
    expect(tokenLive(r, c.lane, token.plaintext)).toBe(false);
    expect(await pending(r)).toBe(0);
  });
});

// ------------------------------------------------------------------ 3. P2

describe("3. a room founded before the canonical remote was stored resolves it before landing work", () => {
  async function oldRoom() {
    const r = await makeRoom();
    const alice = await addMember(r, "@alice", "member");
    const { lane, head } = await proposed(r, alice, ["docs/**"], { "docs/a.md": "a" });
    await inDO(r, (room) => room.core.sql.all("DELETE FROM meta WHERE k = 'canonical_remote'"));
    await evictDurableObject(r.stub);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    return { r, l, head };
  }
  const remote = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT v FROM meta WHERE k = 'canonical_remote'")[0]?.["v"] ?? null);

  it("the landing completes, with the bound repository's own remote stored", async () => {
    const { r, l, head } = await oldRoom();
    await tick(r, 3);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
    expect(r.world.artifacts.main).toBe(head);
    expect(await remote(r)).toBe(r.world.artifacts.canonicalRepo().remote);
  });

  it("a binding that answers for another repository: its remote is not used", async () => {
    const { r, l } = await oldRoom();
    const a = r.world.artifacts;
    const real = a.binding.get;
    (a.binding as { get: typeof real }).get = async (name: string) => {
      const repo = await real(name);
      return Object.assign(Object.create(repo), { info: async () => ({ ...(await repo.info()), name: "someone-else" }) });
    };
    try {
      await tick(r);
    } finally {
      (a.binding as { get: typeof real }).get = real;
    }
    expect(await remote(r)).toBeNull();
    expect((await op(r, l.op.id)).state).not.toBe("landed");
  });

  it("Artifacts is down: nothing is guessed, nothing is pushed, and the next alarm completes it", async () => {
    const { r, l, head } = await oldRoom();
    for (let i = 0; i < 10; i++) r.world.artifacts.failRemote("get", artifactsErrors.internal());
    await tick(r);
    expect(await remote(r)).toBeNull();
    expect(r.world.artifacts.remoteCalls.get("push") ?? 0).toBe(0);
    r.world.artifacts.recover();
    await tick(r, 3);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
    expect(r.world.artifacts.main).toBe(head);
  });
});

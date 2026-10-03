/**
 * Contract amendment 3 (docs/protocol.md section 29), lane A's edits 1, 2,
 * 3, 5, 6 and 7 (request 23b96a18): sealed check carry judgments, the
 * runner pin, the snapshot commit check before a filtered job, jobs over
 * the checker's service binding, advisory obligations and the volatile flag.
 * Each test name starts with the rule it shows.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { Check, CheckBody, CheckerConfig, CheckerService, CheckJob, Claim, Landing, LandOp, LogEntry, PolicyDocument, Proposal, Refusal, RosterRecord, SystemEvent } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import { checkerInputs, filterSnapshot, snapshotDigest, type SnapshotEntry } from "@generalbusiness/artroom-policy";
import { encodeCommit, gitObject, verifyLog } from "@generalbusiness/artroom-log";
import type { Room, SnapshotPort } from "../../src/index.ts";
import { digestJson } from "../../src/crypto.ts";
import { obligationsFor } from "../../src/obligations.ts";
import type { ActivePolicyFull } from "../../src/core.ts";
import { snapshotCommit, snapshotMessage } from "../../src/snapshot.ts";
import { addMember, call, Client, clock, configDigest, expectOk, expectRefusal, iso, makeRoom, pushChange, tick, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const op = async (r: TestRoom, id: string) => (await r.admin.read({ q: "op", op: id as never })) as LandOp & { integration?: string; waiting?: string[]; expectedMain: string };
const entries = async (r: TestRoom): Promise<LogEntry[]> => [...(await r.admin.read({ q: "log", req: { limit: 500 } })).acts];
type CheckCarried = Extract<SystemEvent, { type: "check-carried" }>;
const carriedEvents = async (r: TestRoom) =>
  (await entries(r)).filter((e) => e.entry.type === "system" && e.entry.event.type === "check-carried").map((e) => ({ seq: e.seq, ...((e.entry as { event: CheckCarried }).event) }));

const R = `sha256:${"0".repeat(64)}` as const;
const S = `sha256:${"9".repeat(64)}` as const;
/** Scoped, non-volatile, pinned to R. */
const scoped: CheckerConfig = { format: "artroom-checker-v1", inputs: ["src/**"], volatile: false, timeoutSeconds: 60, runner: R };
/** Whole tree, non-volatile, pinned to R. */
const whole: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R };
const allowChecks = (allow: string) => ({ id: "checks", kind: "carry" as const, evidence: "check" as const, allow });

async function checkRoom(cfg: CheckerConfig, rules: PolicyDocument["rules"] = []) {
  const base = policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
  const doc: PolicyDocument = { ...base, rules: [...base.rules, ...rules] };
  // package.json is a global input: a scoped runner always receives it (R-CARRY-8).
  const r = await makeRoom({ policy: doc, files: { ".artroom/checkers/unit.json": JSON.stringify(cfg), "package.json": "{}" } });
  return { r, doc, alice: await addMember(r, "@alice", "member"), bob: await addMember(r, "@bob", "member"), ci: await addMember(r, "@ci", "checker") };
}

async function proposed(r: TestRoom, who: Client, scope: string[], changes: Record<string, string>) {
  const c = await who.ok<Claim>("claim", null, { goal: "work", scope });
  const head = pushChange(r, c.lane, changes);
  await who.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
  return { lane: c.lane, head };
}

function entriesOf(r: TestRoom, integration: string): SnapshotEntry[] {
  return [...r.world.artifacts.blobs(integration as never)].map(([p, b]) => [p, "100644", b] as const);
}

/** The check body a checker signs: its input is the integration's tree, or the scoped snapshot of it. */
async function bodyFor(r: TestRoom, cfg: CheckerConfig, doc: PolicyDocument, integration: string, extra: Partial<CheckBody> = {}) {
  const paths = checkerInputs(cfg.inputs, doc.carry);
  const input = paths ? { kind: "filtered", snapshot: await snapshotDigest(filterSnapshot(entriesOf(r, integration), paths)), paths } : { kind: "tree", tree: r.world.artifacts.treeOf(integration as never) };
  return { obligation: "obl_unit-tests", check: "unit", integration, input, config: digestJson(cfg), runner: cfg.runner ?? R, volatile: cfg.volatile, ok: true, detail: "42 passed", ...extra };
}

/**
 * Bob's docs landing moves main after Alice's check passed on her first integration I1; her landing is prepared
 * again on I2, and the Room judges carrying her check onto it. `setup` runs once the room has its members.
 */
async function carryCase(cfg: CheckerConfig, rules: PolicyDocument["rules"] = [], setup?: (t: Awaited<ReturnType<typeof checkRoom>>) => void) {
  const t = await checkRoom(cfg, rules);
  setup?.(t);
  const { r, doc, alice, bob, ci } = t;
  const other = await proposed(r, bob, ["docs/**"], { "docs/guide.md": "more docs" });
  const first = await bob.ok<Landing>("land", { lane: other.lane, generation: 1 }, { lease: 1, head: other.head });
  const mine = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
  const l = await alice.ok<Landing>("land", { lane: mine.lane, generation: 1 }, { lease: 1, head: mine.head });
  await tick(r);
  const i1 = (await op(r, l.op.id)).integration!;
  const check = await ci.ok<Check>("check", { lane: mine.lane, generation: 1 }, await bodyFor(r, cfg, doc, i1));
  await tick(r, 4);
  expect(await op(r, first.op.id)).toMatchObject({ state: "landed" });
  return { ...t, l, mine, i1, check, after: await op(r, l.op.id) };
}

/**
 * Like `carryCase`, but the engine is driven step by step, so Alice's landing stops at ready, unreserved, with
 * her check carried onto I2. `beforeI2` runs after main moved, before her landing is prepared on I2.
 */
async function carriedAndReady(rules: PolicyDocument["rules"] = [], beforeI2?: (r: TestRoom) => Promise<void>) {
  const t = await checkRoom(scoped, rules);
  const { r, doc, alice, bob, ci } = t;
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
  const check = await ci.ok<Check>("check", { lane: mine.lane, generation: 1 }, await bodyFor(r, scoped, doc, i1));
  await inDO(r, async (room) => {
    room.core.sql.transaction(() => room.core.landing.reserve(first.op.id));
    await room.core.landing.publish();
    await room.core.landing.refreshMain();
  });
  await beforeI2?.(r);
  await inDO(r, (room) => room.core.landing.prepare(l.op.id));
  const ready = await op(r, l.op.id);
  if (!beforeI2) expect(ready.state).toBe("ready");
  return { ...t, l, mine, i1, check, ready };
}

const statusOn = (r: TestRoom, lane: string, integration: string) =>
  inDO(r, (room) => {
    const p = room.core.activePolicy();
    return obligationsFor(room.core.sql, lane, 1, { doc: p.doc, checkers: p.checkers, integration: integration as never })[0]!;
  });

/** Activate a new policy version now, as an approved change to `.artroom/` would (R-PUB-9). */
const activate = (r: TestRoom, change: (p: ActivePolicyFull) => Pick<ActivePolicyFull, "doc" | "checkers">) =>
  inDO(r, (room) => {
    const next = change(room.core.activePolicy());
    room.core.sql.transaction(() => room.core.activate(next.doc, next.checkers, null, iso(clock.now)));
  });

/** Let the work a commit started finish, such as the proposal's preview. */
const settled = (r: TestRoom) => inDO(r, (room) => room.core.idle());

/** A checker service as a service binding gives it (R-EXEC-8). It records each job and answers as told. */
function checkerService(r: TestRoom, ci: Client, answer: (job: CheckJob) => Partial<CheckBody> | "refuse" = () => ({})) {
  const seen: { job: CheckJob; tokenLive: boolean }[] = [];
  const service: CheckerService = {
    async handle(job) {
      const token = /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;
      seen.push({ job, tokenLive: r.world.artifacts.canonicalRepo().admits(token, "read") });
      const a = answer(job);
      if (a === "refuse") return { refused: true, rule: "check-binding", reason: "refused by the test service", fix: "none" } satisfies Refusal;
      // The service signs the check outside the runner and submits it to the room (lane G's Checker does the same).
      const stub = env.ROOMS.get(env.ROOMS.idFromName(r.id)) as never;
      const signer = new Client({ id: r.id, stub }, ci.keys);
      const body = { obligation: job.obligation, check: job.check, integration: job.integration, input: job.input, config: job.config, runner: job.runner ?? R, volatile: job.volatile, ok: true, detail: "Machine-run check", ...(job.landOp ? { landOp: job.landOp } : {}), ...a };
      return signer.act<Check>("check", { lane: job.lane, generation: job.generation }, body);
    },
  };
  r.world.checkers["unit"] = service;
  return seen;
}

/** Snapshot repositories in place of the Room's own, to steer the commit written; `wrong` makes the publisher write another identity. */
function snapshotRepos(r: TestRoom, mode: { wrong: boolean }) {
  const prepared: string[] = [];
  const repos: SnapshotPort = {
    async prepare(s) {
      prepared.push(s.commit);
      const files = filterSnapshot(entriesOf(r, s.integration), s.paths);
      const right = snapshotCommit(files, s.checker, s.digest);
      const tree = right.objects.at(-2)!.sha;
      const who = "Sandbox Git <git@sandbox.invalid> 1700000000 +0000";
      const commit = mode.wrong ? gitObject("commit", encodeCommit({ tree, parents: [], author: who, committer: who, message: snapshotMessage(s.checker, s.digest) })).sha : right.commit;
      return { commit, remote: `https://artifacts.test/artroom-public/snap-${commit}.git` };
    },
    async mint(_commit, _job, deadline) {
      return { token: "art_v1_snapshotjobtoken0000", expiresAt: deadline };
    },
    async end() {
      return 0;
    },
  };
  r.world.snapshots = repos;
  return prepared;
}

// ------------------------------------------------------------------ 1. R-CARRY-13

describe("R-CARRY-13: every check carry judgment is a sealed check-carried event", () => {
  it("R-CARRY-13 check carried: a carry rule allows it; one carried event, snapshot-identical, with the rule's decision; the carry counts with that event", async () => {
    const { r, mine, after, i1, check } = await carryCase(scoped, [allowChecks("true")]);
    expect(after).toMatchObject({ state: "landed" });
    expect(after.integration).not.toBe(i1);
    const evs = await carriedEvents(r);
    expect(evs).toHaveLength(1);
    const ev = evs[0]!;
    expect(ev).toMatchObject({ op: after.id, lane: mine.lane, generation: 1, integration: after.integration, obligation: "obl_unit-tests", act: check.id, outcome: { carried: true, reason: { code: "snapshot-identical", runner: R } } });
    expect(ev.decisions.map((d) => [d.rule, d.outcome.result])).toEqual([["checks", "carry"]]);
    // The stored carry names its event, and the evidence shows the rule.
    const row = await inDO(r, (room) => room.core.sql.all("SELECT event, policy FROM check_carries")[0]!);
    const id = (await entries(r)).find((e) => e.seq === ev.seq)!;
    expect(row["event"]).toBe(`act_${id.seq}_${id.hash.slice(7, 15)}`);
    expect(row["policy"]).toBe(ev.policy);
    const s = await statusOn(r, mine.lane, after.integration!);
    expect(s.evidence).toEqual([expect.objectContaining({ basis: "carried", act: check.id, rules: ["checks"] })]);
  });

  it("R-CARRY-13 a carry rule for checks refuses it: a notCarried event, policy-rejected, with the decision; and a new job is issued for I2", async () => {
    let seen: { job: CheckJob }[] = [];
    const { r, after, i1, check } = await carryCase(scoped, [allowChecks("false")], ({ r, ci }) => {
      // The checker has a service and snapshot repositories; it answers no job, so only the test's check is recorded.
      snapshotRepos(r, { wrong: false });
      seen = checkerService(r, ci, () => "refuse");
    });
    expect(after).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    const evs = await carriedEvents(r);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ integration: after.integration, act: check.id, outcome: { carried: false, notCarried: { act: check.id, code: "policy-rejected", rule: "checks" } } });
    expect(evs[0]!.decisions.map((d) => [d.rule, d.outcome.result])).toEqual([["checks", "no-carry"]]);
    // The landing had one job for I1, and a new one for I2: it names the snapshot commit the Room recorded for I2, the
    // landing, and I2's base. (Its previews had jobs of their own.)
    const rec = await inDO(r, (room) => room.core.sql.all("SELECT commit_sha, digest FROM check_snapshots WHERE integration = ?", after.integration!)[0]!);
    const landing = seen.filter((s) => s.job.landOp === after.id);
    expect(landing).toHaveLength(2);
    expect(landing[0]!.job.base).not.toBe(after.expectedMain);
    expect(landing[1]!.job).toMatchObject({ integration: rec["commit_sha"], landOp: after.id, base: after.expectedMain, input: { kind: "filtered", snapshot: rec["digest"] } });
    void i1;
  });

  it("R-CARRY-13 a policy activation after the carry: it stops counting, and the next judgment is a new event under the new version", async () => {
    const { r, l, mine, ready, check } = await carriedAndReady();
    const before = await carriedEvents(r);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ act: check.id, outcome: { carried: true } });
    expect((await statusOn(r, mine.lane, ready.integration!)).state).toBe("met");
    await activate(r, (p) => ({ doc: p.doc, checkers: p.checkers }));
    expect((await statusOn(r, mine.lane, ready.integration!)).state).toBe("open");
    await inDO(r, async (room) => {
      await room.core.recompute();
      await room.core.landing.prepare(l.op.id);
      await room.core.landing.evaluate(l.op.id);
    });
    const evs = await carriedEvents(r);
    expect(evs).toHaveLength(2);
    expect(evs[1]).toMatchObject({ act: check.id, outcome: { carried: true } });
    expect(evs[1]!.policy).not.toBe(evs[0]!.policy);
    expect(evs[1]!.policy).toBe(await inDO(r, (room) => room.core.activePolicy().version));
    expect((await statusOn(r, mine.lane, (await op(r, l.op.id)).integration!)).state).toBe("met");
  });

  it("R-CARRY-13 fail closed: a stored carry without its sealed event never counts", async () => {
    const { r, mine, ready } = await carriedAndReady();
    expect((await statusOn(r, mine.lane, ready.integration!)).state).toBe("met");
    // As a Room that sealed no event would have stored it (and as rows from before this change are).
    await inDO(r, (room) => room.core.sql.all("UPDATE check_carries SET event = NULL"));
    expect((await statusOn(r, mine.lane, ready.integration!)).state).toBe("open");
  });

  it("R-CARRY-13, R-LOG-10: artroom verify accepts a log with carried and not-carried events, replaying every decision", async () => {
    // The rule holds the first judgment back; an activation without it judges again and carries.
    const { r, l, mine, after, check } = await carryCase(scoped, [allowChecks("false")]);
    expect(after.state).toBe("preparing");
    await activate(r, (p) => ({ doc: { ...p.doc, rules: [...p.doc.rules.filter((x) => x.id !== "checks"), allowChecks("true")] }, checkers: p.checkers }));
    await tick(r, 4);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
    const evs = await carriedEvents(r);
    expect(evs.map((e) => [e.act, e.outcome.carried])).toEqual([
      [check.id, false],
      [check.id, true],
    ]);
    expect(evs.every((e) => e.lane === mine.lane && e.decisions.length === 1)).toBe(true);
    const p = await call<{ through: number }>(r.stub.publishLog());
    const report = await verifyLog(r.world.artifacts.canonicalRepo());
    expect(report.failures).toEqual([]);
    expect(report).toMatchObject({ ok: true, verifiedThrough: p.through });
    const recorded = (await entries(r)).reduce((n, e) => {
      const x = e.entry as unknown as { receipt?: { decisions?: unknown[] }; event?: { decisions?: unknown[] } };
      return n + (x.receipt?.decisions?.length ?? 0) + (x.event?.decisions?.length ?? 0);
    }, 0);
    expect(report.decisionsReplayed).toBe(recorded);
  });
});

// ------------------------------------------------------------------ 2. R-CARRY-14

describe("R-CARRY-14: the runner environment is the configuration's pin", () => {
  it("R-CARRY-14 the configuration pins R; a check stating S is check-binding; one stating R is admitted", async () => {
    const { r, doc, alice, ci } = await checkRoom(whole);
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r);
    const i = (await op(r, l.op.id)).integration!;
    const bad = expectRefusal(await ci.act("check", { lane, generation: 1 }, await bodyFor(r, whole, doc, i, { runner: S })), "check-binding");
    expect(bad.reason).toMatch(/pins/);
    expectOk(await ci.act("check", { lane, generation: 1 }, await bodyFor(r, whole, doc, i)));
  });

  it("R-CARRY-14 the pin changes from R to S by an approved change; a check made under R is judged against the current pin and does not carry", async () => {
    const pinS = { ...scoped, runner: S };
    const { r, ready, check } = await carriedAndReady([], async (r) => {
      await activate(r, (p) => ({ doc: p.doc, checkers: { unit: { config: pinS, digest: digestJson(pinS) } } }));
      await inDO(r, (room) => room.core.recompute());
    });
    expect(ready).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    const evs = await carriedEvents(r);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ integration: ready.integration, act: check.id, outcome: { carried: false, notCarried: { code: "config-changed" } }, decisions: [] });
    expect(evs[0]!.policy).toBe(await inDO(r, (room) => room.core.activePolicy().version));
    expect(await inDO(r, (room) => room.core.sql.all("SELECT 1 FROM check_carries"))).toEqual([]);
    // Readiness again on the same integration and policy: the judgment stands, and is not sealed twice.
    await inDO(r, (room) => room.core.landing.evaluate(ready.id as never));
    expect(await carriedEvents(r)).toHaveLength(1);
  });

  it("R-CARRY-14 no runner pinned: the check meets the obligation on its own integration, but never carries (runner-changed)", async () => {
    const { runner: _pin, ...unpinned } = scoped;
    void _pin;
    const { r, doc, ci, mine, after, check } = await carryCase(unpinned, [allowChecks("true")]);
    expect(after).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    const evs = await carriedEvents(r);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ act: check.id, outcome: { carried: false, notCarried: { act: check.id, code: "runner-changed", text: "No runner environment is pinned" } }, decisions: [] });
    // A check on I2 itself meets it, with any runner.
    await ci.ok("check", { lane: mine.lane, generation: 1 }, await bodyFor(r, unpinned, doc, after.integration!, { runner: S }));
    await tick(r, 3);
    expect(await op(r, after.id)).toMatchObject({ state: "landed" });
  });
});

// ------------------------------------------------------------------ 3. R-CARRY-15 step 4, and the R-CARRY-16 seam

describe("R-CARRY-15: a filtered job only for the recorded commit (R-CARRY-16 is in snapshot-repos.test.ts)", () => {
  it("R-CARRY-15 the publisher writes the snapshot with another identity: its ID differs and no job is issued; once it writes the recorded commit, the job is issued for it", async () => {
    const { r, alice, ci } = await checkRoom(scoped);
    const mode = { wrong: true };
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    // Bound once the preview is computed: this test follows the landing's job.
    await settled(r);
    const prepared = snapshotRepos(r, mode);
    const seen = checkerService(r, ci);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r, 2);
    const integration = (await op(r, l.op.id)).integration!;
    const rec = await inDO(r, (room) => room.core.sql.all("SELECT * FROM check_snapshots WHERE integration = ?", integration)[0]!);
    expect(prepared.length).toBeGreaterThan(0);
    expect(new Set(prepared)).toEqual(new Set([rec["commit_sha"]]));
    expect(seen).toEqual([]);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT state FROM check_jobs"))).toEqual([{ state: "owed" }]);
    mode.wrong = false;
    clock.now += 600_000;
    await tick(r, 3);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.job).toMatchObject({
      integration: rec["commit_sha"],
      input: { kind: "filtered", snapshot: rec["digest"], paths: JSON.parse(rec["paths"] as string) },
      readUrl: `https://artifacts.test/artroom-public/snap-${String(rec["commit_sha"])}.git`,
      landOp: l.op.id,
    });
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed", integration });
  });
});

// ------------------------------------------------------------------ 5. R-EXEC-8 to R-EXEC-10

describe("R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding", () => {
  it("R-EXEC-8, R-EXEC-9, R-EXEC-10 a whole-tree job carries base, volatile, advisory, runner and a GitAuthEnv with a read token for the canonical repository, revoked after the answer", async () => {
    const { r, alice, ci } = await checkRoom(whole);
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    await settled(r);
    const seen = checkerService(r, ci);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r, 3);
    const done = await op(r, l.op.id);
    expect(done).toMatchObject({ state: "landed" });
    // One job, for the landing's integration, before anything else was asked of the checker.
    const jobs = seen.filter((s) => s.job.landOp === l.op.id);
    expect(jobs).toHaveLength(1);
    const { job, tokenLive } = jobs[0]!;
    const canonical = r.world.artifacts.canonicalRepo();
    expect(job).toMatchObject({
      room: r.id,
      lane,
      generation: 1,
      head,
      obligation: "obl_unit-tests",
      check: "unit",
      integration: done.integration,
      base: done.expectedMain,
      input: { kind: "tree", tree: r.world.artifacts.treeOf(done.integration as never) },
      readUrl: canonical.remote,
      config: configDigest(digestJson(whole)),
      volatile: false,
      advisory: false,
      runner: R,
    });
    expect(Object.keys(job.gitAuthEnv).sort()).toEqual(["GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"]);
    expect(job.gitAuthEnv).toMatchObject({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader" });
    expect(tokenLive).toBe(true);
    const token = /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;
    const minted = [...canonical.tokens.values()].find((t) => t.plaintext === token)!;
    expect(minted.scope).toBe("read");
    // The token expires before the job's deadline, by Room's margin (review 90f30a3b).
    expect(minted.expiresAt).toBeLessThanOrEqual(Date.parse(job.deadline));
    expect(canonical.admits(token, "read")).toBe(false);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT state, outcome FROM check_jobs WHERE id || '_' || attempt = ?", job.id))).toEqual([{ state: "done", outcome: expect.stringMatching(/^act_/) }]);
  });

  it("R-EXEC-8 no service binding for the checker: no job is owed, and the landing waits for a check", async () => {
    const { r, alice } = await checkRoom(whole);
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r, 3);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT id FROM check_jobs"))).toEqual([]);
    expect(await op(r, l.op.id)).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
  });

  /** A landing prepared step by step, with its job owed but not yet issued: the landing and jobs steps are held. */
  async function owedJob() {
    const { r, doc, alice, ci } = await checkRoom(whole);
    await inDO(r, async (room) => {
      await room.core.idle();
      const run = room.core.run.bind(room.core);
      room.core.run = (step) => {
        if (step !== "landing" && step !== "jobs") run(step);
      };
    });
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    await settled(r);
    const seen = checkerService(r, ci);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await inDO(r, (room) => room.core.landing.prepare(l.op.id));
    const waiting = await op(r, l.op.id);
    expect(waiting).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    expect(await inDO(r, (room) => room.core.sql.all("SELECT state FROM check_jobs"))).toEqual([{ state: "owed" }]);
    const issue = () =>
      inDO(r, async (room) => {
        await room.core.steps.jobs();
        await room.core.idle();
        return room.core.sql.all("SELECT state, outcome FROM check_jobs");
      });
    return { r, doc, alice, ci, seen, lane, l, waiting, issue };
  }

  it("R-EXEC-8 a job is not issued once its landing has ended", async () => {
    const { alice, seen, lane, l, r, issue } = await owedJob();
    await alice.ok("release", { lane }, { lease: 1 });
    expect((await op(r, l.op.id)).state).not.toMatch(/^(accepted|preparing|ready)$/);
    expect(await issue()).toEqual([{ state: "done", outcome: "not-needed" }]);
    expect(seen).toEqual([]);
  });

  it("R-EXEC-8 a job is not issued once its obligation is met on the integration", async () => {
    const { r, doc, ci, seen, lane, l, waiting, issue } = await owedJob();
    await ci.ok("check", { lane, generation: 1 }, { ...(await bodyFor(r, whole, doc, waiting.integration!)), landOp: l.op.id });
    expect(await issue()).toEqual([{ state: "done", outcome: "not-needed" }]);
    expect(seen).toEqual([]);
  });

  for (const volatile of [true, false])
    it(`R-EXEC-10 the job's volatile is the configuration's (${volatile}); a check that says otherwise is check-binding, and one that agrees is admitted`, async () => {
      const cfg: CheckerConfig = { ...whole, volatile };
      const { r, alice, ci } = await checkRoom(cfg);
      let flip = true;
      const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
      await settled(r);
      const seen = checkerService(r, ci, (job) => (flip ? { volatile: !job.volatile } : {}));
      const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
      await tick(r, 2);
      const first = seen.find((s) => s.job.landOp === l.op.id)!.job;
      expect(first.volatile).toBe(volatile);
      expect(await inDO(r, (room) => room.core.sql.all("SELECT outcome FROM check_jobs WHERE id || '_' || attempt = ?", first.id))).toEqual([{ outcome: "refused: check-binding" }]);
      expect(await inDO(r, (room) => room.core.sql.all("SELECT act FROM evidence WHERE kind = 'check'"))).toEqual([]);
      flip = false;
      const integration = (await op(r, l.op.id)).integration!;
      expectOk(await ci.act("check", { lane, generation: 1 }, { ...(await bodyFor(r, cfg, policy(), integration)), landOp: l.op.id }));
      await tick(r, 3);
      expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
    });
});

// ------------------------------------------------------------------ 6. R-OBL-7

describe("R-OBL-7: advisory obligations never block a landing", () => {
  const advisory: CheckerConfig = { ...whole, advisory: true };
  const obligationOf = async (r: TestRoom, lane: string) => (await r.admin.read({ q: "proposal", ref: { lane: lane as never, generation: 1 } }))!.obligations.find((o) => o.id === "obl_unit-tests")!;

  it("R-OBL-7 the obligation is advisory by its configuration; the landing does not wait for it, and its job is still issued", async () => {
    const { r, alice, ci } = await checkRoom(advisory);
    const seen = checkerService(r, ci, () => "refuse");
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    expect(await obligationOf(r, lane)).toMatchObject({ kind: "check", advisory: true, state: "open" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r, 3);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
    expect(r.world.artifacts.main).toBe(head);
    expect(seen.map((s) => s.job)).toContainEqual(expect.objectContaining({ landOp: l.op.id, advisory: true }));
  });

  it("R-OBL-7 an advisory checker's check fails on the landing's integration: the landing proceeds, the failing check is recorded, and obligation-open is never raised for it", async () => {
    const { r, alice, ci } = await checkRoom(advisory);
    checkerService(r, ci, () => ({ ok: false, detail: "3 failed" }));
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r, 3);
    const done = await op(r, l.op.id);
    expect(done).toMatchObject({ state: "landed" });
    const log = await entries(r);
    const failing = log.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === "check" && (e.entry.act.envelope.body as CheckBody).ok === false);
    expect(failing.length).toBeGreaterThan(0);
    expect(failing.some((e) => (e.entry as { act: { envelope: { body: CheckBody } } }).act.envelope.body.integration === done.integration)).toBe(true);
    expect(JSON.stringify(log)).not.toMatch(/obligation-open|check-failed/);
  });

  it("R-OBL-7 an advisory check that arrives between readiness and reservation changes nothing reservation compares", async () => {
    const { r, doc, alice, ci } = await checkRoom(advisory);
    await inDO(r, async (room) => {
      await room.core.idle();
      const run = room.core.run.bind(room.core);
      room.core.run = (step) => {
        if (step !== "landing") run(step);
      };
    });
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await inDO(r, (room) => room.core.landing.prepare(l.op.id));
    const ready = await op(r, l.op.id);
    expect(ready.state).toBe("ready");
    await ci.ok("check", { lane, generation: 1 }, await bodyFor(r, advisory, doc, ready.integration!));
    expect(await inDO(r, (room) => room.core.sql.transaction(() => room.core.landing.reserve(l.op.id)))).toMatchObject({ kind: "reserved" });
  });

  it("R-OBL-7, R-REV-3 a landing does not rely on advisory evidence: the advisory checker's key compromised before reservation reopens the obligation but does not stop the landing", async () => {
    const { r, doc, alice, ci } = await checkRoom(advisory);
    await inDO(r, async (room) => {
      await room.core.idle();
      const run = room.core.run.bind(room.core);
      room.core.run = (step) => {
        if (step !== "landing") run(step);
      };
    });
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await inDO(r, (room) => room.core.landing.prepare(l.op.id));
    const ready = await op(r, l.op.id);
    expect(ready.state).toBe("ready");
    // The advisory check passes and readiness is evaluated again: it is shown as met, but the landing does not rely on it.
    await ci.ok("check", { lane, generation: 1 }, await bodyFor(r, advisory, doc, ready.integration!));
    await inDO(r, (room) => room.core.landing.evaluate(l.op.id));
    expect(await obligationOf(r, lane)).toMatchObject({ advisory: true, state: "met" });
    const revoked = await r.admin.ok<RosterRecord>("roster", null, { op: "revoke-key", key: ci.key, reason: "compromised" });
    expect(revoked.invalidated?.reopened).toEqual([{ lane, generation: 1, obligation: "obl_unit-tests" }]);
    expect(await op(r, l.op.id)).toMatchObject({ state: "ready" });
    expect(await inDO(r, (room) => room.core.sql.transaction(() => room.core.landing.reserve(l.op.id)))).toMatchObject({ kind: "reserved" });
  });

  it("R-OBL-7, R-POL-9 an activation that makes the checker advisory recomputes the obligation as advisory, and the waiting landing proceeds", async () => {
    const { r, alice } = await checkRoom(whole);
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r, 2);
    expect(await op(r, l.op.id)).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    expect(await obligationOf(r, lane)).not.toHaveProperty("advisory");
    await activate(r, (p) => ({ doc: p.doc, checkers: { unit: { config: advisory, digest: digestJson(advisory) } } }));
    await tick(r, 4);
    expect(await obligationOf(r, lane)).toMatchObject({ advisory: true });
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
  });
});

/**
 * Review 786e9606: two P2s in job dispatch. Each test is a control on the
 * real Room Durable Object and SQLite, with lane B's real SnapshotRepos over
 * the fake Artifacts and sandbox.
 *
 * 1. Two jobs steps at once must not let the one that loses the claim end
 *    the winner's token or retire its snapshot repository.
 * 2. Work prepared over an await (snapshot and tree reads, token minting) is
 *    judged again at the dispatch claim: if its owner, generation,
 *    configuration or obligation changed meanwhile, nothing is sent and the
 *    prepared credentials are retired.
 */

import { describe, expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import type { Check, CheckBody, CheckerConfig, CheckJob, Claim, Proposal, Refusal, Result } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import { checkerInputs, filterSnapshot, snapshotDigest, type SnapshotEntry } from "@generalbusiness/artroom-policy";
import type { Room } from "../../src/index.ts";
import { digestJson } from "../../src/crypto.ts";
import { addMember, Client, clock, iso, makeRoom, pushChange, until, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const R = `sha256:${"0".repeat(64)}` as const;
const whole: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R };
const scoped: CheckerConfig = { ...whole, inputs: ["src/**"] };
const refusal: Refusal = { refused: true, rule: "check-binding", reason: "refused by the test service", fix: "none" };
const settled = (r: TestRoom) => inDO(r, (room) => room.core.idle());
const pause = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const tokenOf = (job: CheckJob) => /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;
const snapshotRepos = (r: TestRoom) => [...r.world.artifacts.repos.values()].filter((x) => x.name.includes("--snap-"));
const jobsOf = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT generation, state, attempt, outcome FROM check_jobs ORDER BY rowid"));

async function checkRoom(cfg: CheckerConfig) {
  const doc = policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
  const r = await makeRoom({ policy: doc, files: { ".artroom/checkers/unit.json": JSON.stringify(cfg), "package.json": "{}" } });
  // The landing and jobs steps are the test's to run.
  await inDO(r, async (room) => {
    await room.core.idle();
    const run = room.core.run.bind(room.core);
    room.core.run = (step) => {
      if (step !== "jobs" && step !== "landing") run(step);
    };
  });
  return { r, doc, alice: await addMember(r, "@alice", "member"), ci: await addMember(r, "@ci", "checker") };
}

async function propose(r: TestRoom, who: Client, changes: Record<string, string>, lane?: string) {
  const id = lane ?? (await who.ok<Claim>("claim", null, { goal: "work", scope: ["src/**"] })).lane;
  const head = pushChange(r, id as never, changes);
  await who.ok<Proposal>("propose", { lane: id }, { lease: 1, expectedGeneration: lane ? 1 : 0, head, summary: "change" });
  return { lane: id, head };
}

/** The checker's service: records each job, then refuses it, or holds it until the test answers from inside the room. */
function service(r: TestRoom, hang = false) {
  const seen: { job: CheckJob; readsOwn: boolean }[] = [];
  const late: (() => void)[] = [];
  r.world.checkers["unit"] = {
    handle(job): Promise<Result<Check>> {
      const own = [...r.world.artifacts.repos.values()].find((x) => x.remote === job.readUrl)!;
      seen.push({ job, readsOwn: own.admits(tokenOf(job), "read") });
      return hang ? new Promise((resolve) => late.push(() => resolve(refusal))) : Promise.resolve(refusal);
    },
  };
  return { seen, late };
}

/** A lane of its own with one change, proposed: its preview owes a job. */
async function lane(r: TestRoom, who: Client, path: string) {
  const c = await who.ok<Claim>("claim", null, { goal: "work", scope: [path] });
  const head = pushChange(r, c.lane, { [path]: "changed\n" });
  await who.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
  return c.lane;
}

describe("review 786e9606 P2 1: the step that loses the claim never ends the winner's credentials", () => {
  for (const [kind, cfg] of [
    ["filtered", scoped],
    ["whole-tree", whole],
  ] as const)
    it(`${kind}: two jobs steps at once on two owed jobs send one attempt each, whose tokens and repositories stay usable until they answer`, async () => {
      const { r, alice } = await checkRoom(cfg);
      const { seen, late } = service(r, true);
      await lane(r, alice, "src/a.ts");
      await lane(r, alice, "src/b.ts");
      await settled(r);
      expect(await jobsOf(r)).toMatchObject([{ state: "owed" }, { state: "owed" }]);
      // The first step reads both rows and works on the first; meanwhile the second claims the second row, so
      // the first step reaches it holding a row that is no longer owed.
      const a = r.world.artifacts;
      const calls = a.remoteCalls.get("createToken") ?? 0;
      const before = a.canonicalRepo().tokens.size;
      await inDO(r, (room) => Promise.all([room.core.steps.jobs(), room.core.steps.jobs()]));
      await pause(20);
      expect(seen).toHaveLength(2);
      expect(new Set(seen.map((s) => s.job.lane)).size).toBe(2);
      // Each job was prepared once: the step that lost the claim on the second minted nothing for it. (A whole-tree
      // job mints one canonical token; a filtered one, the snapshot writer's and the job's own.)
      expect((a.remoteCalls.get("createToken") ?? 0) - calls).toBe(kind === "filtered" ? 4 : 2);
      expect(await jobsOf(r)).toMatchObject([
        { state: "sent", attempt: 1 },
        { state: "sent", attempt: 1 },
      ]);
      // Still in flight: each job's token reads its own repository, and no snapshot repository is retired.
      const own = (job: CheckJob) => [...r.world.artifacts.repos.values()].find((x) => x.remote === job.readUrl);
      for (const { job } of seen) expect(own(job)?.admits(tokenOf(job), "read")).toBe(true);
      if (kind === "filtered") {
        expect(snapshotRepos(r)).toHaveLength(2);
        expect(await inDO(r, (room) => room.core.snapshotRepos.duties().filter((d) => d.kind === "revoke"))).toEqual([]);
      }
      // The answers come: the jobs are done and their credentials end.
      await inDO(r, () => late.forEach((answer) => answer()));
      await settled(r);
      expect(await jobsOf(r)).toMatchObject([
        { state: "done", attempt: 1, outcome: "refused: check-binding" },
        { state: "done", attempt: 1, outcome: "refused: check-binding" },
      ]);
      for (const { job } of seen) expect(own(job)?.admits(tokenOf(job), "read") ?? false).toBe(false);
      expect([...a.canonicalRepo().tokens.values()].slice(before).filter((t) => !t.revoked)).toEqual([]);
      expect(snapshotRepos(r)).toEqual([]);
    });

  it("filtered: a job token that cannot be minted leaves the job due again later; the retry reuses the repository written for it", async () => {
    const { r, alice } = await checkRoom(scoped);
    const { seen } = service(r);
    await lane(r, alice, "src/a.ts");
    await settled(r);
    const a = r.world.artifacts;
    // The snapshot writer's canonical token is minted; the job's token on the snapshot repository is not.
    a.on("createToken", () => undefined);
    a.on("createToken", () => {
      throw new Error("Artifacts is unavailable (createToken)");
    });
    const step = () =>
      inDO(r, async (room) => {
        await room.core.steps.jobs();
        await room.core.idle();
      });
    await step();
    expect(seen).toEqual([]);
    expect(await jobsOf(r)).toMatchObject([{ state: "owed", attempt: 1 }]);
    const written = snapshotRepos(r).map((x) => x.name);
    expect(written).toHaveLength(1);
    const creates = a.remoteCalls.get("create") ?? 0;
    clock.now += 30_000;
    await step();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.job.id.endsWith("_2")).toBe(true);
    expect(a.remoteCalls.get("create") ?? 0).toBe(creates);
    expect(snapshotRepos(r)).toEqual([]);
  });
});

describe("review 786e9606 P2 1: a preparation that outlives its deadline sends nothing", () => {
  it("whole-tree: a step held past the attempt's deadline, while the next step issues attempt 2, ends its own token and sends nothing", async () => {
    const { r, alice } = await checkRoom(whole);
    const { seen } = service(r);
    await propose(r, alice, { "src/app.ts": "v2" });
    await settled(r);
    const a = r.world.artifacts;
    const calls = a.remoteCalls.get("createToken") ?? 0;
    a.holdToken = (repo, scope) => scope === "read" && repo === a.canonical;
    const first = inDO(r, (room) => room.core.steps.jobs());
    await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
    expect(await jobsOf(r)).toMatchObject([{ state: "sent", attempt: 1 }]);
    // The claimed attempt's deadline passes; the next step issues attempt 2, whose mint is held too.
    const deadline = (await inDO(r, (room) => room.core.sql.all("SELECT next_ms FROM check_jobs")[0]!["next_ms"])) as number;
    clock.now = deadline + 1;
    const second = inDO(r, (room) => room.core.steps.jobs());
    await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls + 1);
    expect(await jobsOf(r)).toMatchObject([{ state: "sent", attempt: 2 }]);
    const before = a.canonicalRepo().tokens.size;
    a.holdToken = null;
    await Promise.all([first, second]);
    await settled(r);
    // Attempt 1's token, minted late, would outlive its deadline: the mint ledger owes it, and its next pass revokes it.
    await inDO(r, async (room) => {
      await room.core.steps.mints();
      await room.core.mints.idle();
    });
    // Only attempt 2 was sent; attempt 1's token, minted late, was ended.
    expect(seen.map((s) => s.job.id.slice(-2))).toEqual(["_2"]);
    const late = [...a.canonicalRepo().tokens.values()].slice(before).filter((t) => t.plaintext !== tokenOf(seen[0]!.job));
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((t) => t.revoked)).toBe(true);
    expect(await jobsOf(r)).toMatchObject([{ state: "done", attempt: 2, outcome: "refused: check-binding" }]);
  });
});

type Change = "owner" | "generation" | "configuration" | "obligation";

describe("review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired", () => {
  // The dispatch claim judges the four facts in one place, for both kinds of preparation: each change has a
  // witness, and each kind of preparation has two.
  for (const [kind, cfg, change] of [
    ["whole-tree", whole, "owner"],
    ["filtered", scoped, "generation"],
    ["whole-tree", whole, "configuration"],
    ["filtered", scoped, "obligation"],
  ] as const satisfies readonly (readonly [string, CheckerConfig, Change])[])
      it(`${kind} preparation, ${change} changed while a read token was being minted`, async () => {
        const { r, doc, alice, ci } = await checkRoom(cfg);
        const { seen } = service(r);
        const { lane } = await propose(r, alice, { "src/app.ts": "v2" });
        await settled(r);
        expect(await jobsOf(r)).toMatchObject([{ generation: 1, state: "owed" }]);
        const a = r.world.artifacts;
        const before = a.canonicalRepo().tokens.size;
        const calls = a.remoteCalls.get("createToken") ?? 0;
        // Read tokens on the canonical repository and on snapshot repositories (the job's own, and the snapshot
        // writer's) are held: the step stops in the middle of its preparation. Pinning reads lane forks, and the
        // room's other canonical tokens are write tokens, so a proposal still goes through.
        a.holdToken = (repo, scope) => scope === "read" && (repo === a.canonical || repo.includes("--snap-"));
        const step = inDO(r, (room) => room.core.steps.jobs());
        await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
        const preview = (await r.admin.read({ q: "proposal", ref: { lane: lane as never, generation: 1 } }))!.preview as { integration: string };
        if (change === "owner") {
          await inDO(r, (room) => room.core.sql.all("UPDATE previews SET body = json_set(body, '$.integration', ?) WHERE lane = ?", "e".repeat(40), lane));
        } else if (change === "generation") {
          await propose(r, alice, { "src/app.ts": "v3" }, lane);
        } else if (change === "configuration") {
          const changed = { ...cfg, timeoutSeconds: 61 };
          await inDO(r, (room) => {
            const old = room.core.activePolicy();
            room.core.sql.transaction(() => room.core.activate(old.doc, { unit: { config: changed, digest: digestJson(changed) } }, null, iso(clock.now)));
          });
        } else {
          // The obligation is met on the preview's integration by a check signed some other way.
          const paths = checkerInputs(cfg.inputs, doc.carry);
          const entries: SnapshotEntry[] = [...a.blobs(preview.integration as never)].map(([p, b]) => [p, "100644", b] as const);
          const input = paths ? { kind: "filtered", snapshot: await snapshotDigest(filterSnapshot(entries, paths)), paths } : { kind: "tree", tree: a.treeOf(preview.integration as never) };
          const body: CheckBody = { obligation: "obl_unit-tests", check: "unit", integration: preview.integration as never, input: input as never, config: digestJson(cfg), runner: R, volatile: false, ok: true, detail: "signed elsewhere" };
          await ci.ok("check", { lane, generation: 1 }, body);
        }
        a.holdToken = null;
        await step;
        await settled(r);
        await inDO(r, (room) => room.core.snapshotRepos.reconcile());
        // Nothing was sent; the generation 1 job is retired, and every credential it prepared is ended.
        expect(seen).toEqual([]);
        expect((await jobsOf(r))[0]).toMatchObject({ generation: 1, state: "done", attempt: 1, outcome: "not-needed" });
        const minted = [...a.canonicalRepo().tokens.values()].slice(before).filter((t) => t.scope === "read");
        expect(minted.length).toBeGreaterThan(0);
        expect(minted.every((t) => t.revoked)).toBe(true);
        expect(snapshotRepos(r)).toEqual([]);
      });
});

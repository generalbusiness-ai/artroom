/**
 * Amendment 3, lane A item 4 (R-CARRY-16): each filtered job reads only its
 * own snapshot repository. The Room runs lane B's `SnapshotRepos` on its
 * SQLite: one new repository per snapshot commit, written by its publisher
 * sandbox at `refs/artroom/snapshot`, reused only for the same commit, one
 * read token per job attempt, and deletion and revocation as durable duties
 * that its alarm runs until Artifacts confirms them.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { Check, CheckBody, CheckerConfig, CheckJob, Claim, Landing, LandOp, Proposal, Refusal, Result, Sha } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import type { Room } from "../../src/index.ts";
import { artifactsErrors, type FakeRepo } from "../../src/memory/artifacts.ts";
import { addMember, Client, clock, makeRoom, pushChange, tick, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const op = async (r: TestRoom, id: string) => (await r.admin.read({ q: "op", op: id as never })) as LandOp & { integration?: string };
const R = `sha256:${"0".repeat(64)}` as const;
const scoped: CheckerConfig = { format: "artroom-checker-v1", inputs: ["src/**"], volatile: false, timeoutSeconds: 60, runner: R };
const refusal: Refusal = { refused: true, rule: "check-binding", reason: "refused by the test service", fix: "none" };
const settled = (r: TestRoom) => inDO(r, (room) => room.core.idle());
const pause = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const tokenOf = (job: CheckJob) => /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;
const snapshotRepos = (r: TestRoom) => [...r.world.artifacts.repos.values()].filter((x) => x.name.includes("--snap-"));

async function checkRoom(files: Record<string, string> = {}) {
  const r = await makeRoom({
    policy: policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" })),
    files: { ".artroom/checkers/unit.json": JSON.stringify(scoped), "package.json": "{}", ...files },
  });
  return { r, alice: await addMember(r, "@alice", "member"), ci: await addMember(r, "@ci", "checker") };
}

async function propose(r: TestRoom, who: Client, changes: Record<string, string | null>, lane?: string) {
  const id = lane ?? (await who.ok<Claim>("claim", null, { goal: "work", scope: ["src/**"] })).lane;
  const g = lane ? 1 : 0;
  const head = pushChange(r, id as never, changes);
  await who.ok<Proposal>("propose", { lane: id }, { lease: 1, expectedGeneration: g, head, summary: "change" });
  return { lane: id, head };
}

const hold = (r: TestRoom, steps: readonly string[]) =>
  inDO(r, async (room) => {
    await room.core.idle();
    const run = room.core.run.bind(room.core);
    room.core.run = (step) => {
      if (!steps.includes(step)) run(step);
    };
  });

/** What the job's repository held, and what its token reached, when the service received it. */
interface Seen {
  readonly job: CheckJob;
  readonly repo: string;
  readonly objects: ReadonlySet<string>;
  readonly refs: ReadonlyMap<string, string>;
  readonly readsOwn: boolean;
  readonly readsCanonical: boolean;
  readonly readsOther: boolean;
}

type Answer = "hang" | "refuse" | "sign";

function service(r: TestRoom, ci: Client, plan: Answer[] = []) {
  const seen: Seen[] = [];
  const late: ((a: "refuse" | "sign") => void)[] = [];
  const sign = (job: CheckJob): Promise<Result<Check>> => {
    const signer = new Client({ id: r.id, stub: env.ROOMS.get(env.ROOMS.idFromName(r.id)) as never }, ci.keys);
    const body: CheckBody = { obligation: job.obligation, check: job.check, integration: job.integration, input: job.input, config: job.config, runner: job.runner ?? R, volatile: job.volatile, ok: true, detail: "Machine-run check", ...(job.landOp ? { landOp: job.landOp } : {}) };
    return signer.act<Check>("check", { lane: job.lane, generation: job.generation }, body);
  };
  r.world.checkers["unit"] = {
    handle(job) {
      const a = r.world.artifacts;
      const own = [...a.repos.values()].find((x) => x.remote === job.readUrl) as FakeRepo;
      const token = tokenOf(job);
      seen.push({
        job,
        repo: own.name,
        objects: new Set(own.objects),
        refs: new Map(own.refs),
        readsOwn: own.admits(token, "read"),
        readsCanonical: a.canonicalRepo().admits(token, "read"),
        readsOther: [...a.repos.values()].some((x) => x !== own && x.admits(token, "read")),
      });
      const answer = plan[seen.length - 1] ?? "refuse";
      if (answer === "refuse") return Promise.resolve(refusal);
      if (answer === "sign") return sign(job);
      return new Promise((resolve) => late.push((x) => resolve(x === "refuse" ? refusal : sign(job))));
    },
  };
  return { seen, late };
}

const duties = (r: TestRoom) => inDO(r, (room) => room.core.snapshotRepos.duties());

describe("R-CARRY-16: one repository per snapshot commit", () => {
  it("older snapshot, omitted file: the newer job's repository has neither the older snapshot's commit nor the omitted file's blob, advertises only refs/artroom/snapshot at its own commit, and its token reaches nothing else", async () => {
    const { r, alice, ci } = await checkRoom({ "src/secret.txt": "the secret\n" });
    const secret = r.world.artifacts.blobs(r.world.artifacts.main!).get("src/secret.txt")!;
    const { seen } = service(r, ci);
    // Generation 1 keeps src/secret.txt: its snapshot S1 includes it. Generation 2 deletes it: S2 omits it.
    const g1 = await propose(r, alice, { "src/app.ts": "v2" });
    await tick(r);
    expect(seen).toHaveLength(1);
    await propose(r, alice, { "src/app.ts": "v3", "src/secret.txt": null }, g1.lane);
    await tick(r);
    expect(seen).toHaveLength(2);
    const [s1, s2] = seen as [Seen, Seen];
    // Both are preview jobs, filtered, each on its own snapshot commit and repository.
    expect(s1.job).toMatchObject({ generation: 1, input: { kind: "filtered" } });
    expect(s2.job).toMatchObject({ generation: 2, input: { kind: "filtered" } });
    expect(s1.job).not.toHaveProperty("landOp");
    expect(s2.job.integration).not.toBe(s1.job.integration);
    expect(s2.repo).not.toBe(s1.repo);
    expect(s1.objects.has(secret)).toBe(true);
    // R-CARRY-16: the S2 repository holds no object of S1, and not the omitted file.
    expect(s2.objects.has(s1.job.integration)).toBe(false);
    expect(s2.objects.has(secret)).toBe(false);
    expect([...s2.refs]).toEqual([["refs/artroom/snapshot", s2.job.integration]]);
    // Exact current commit: S2's commit and every file it names are there.
    expect(s2.objects.has(s2.job.integration)).toBe(true);
    for (const blob of r.world.artifacts.blobs(s2.job.integration as Sha).values()) expect(s2.objects.has(blob)).toBe(true);
    expect(r.world.artifacts.parents(s2.job.integration as Sha)).toEqual([]);
    // One token per job, for its own repository only.
    for (const s of seen) expect([s.readsOwn, s.readsCanonical, s.readsOther]).toEqual([true, false, false]);
    expect(tokenOf(s1.job)).not.toBe(tokenOf(s2.job));
    // Each repository was retired when its job ended.
    expect(snapshotRepos(r)).toEqual([]);
  });

  it("reuse only for the same snapshot commit: a landing's job on the preview's integration shares the in-flight preview job's repository, with its own token", async () => {
    const { r, alice, ci } = await checkRoom();
    await hold(r, ["jobs", "landing"]);
    const { seen, late } = service(r, ci, ["hang", "sign"]);
    const { lane, head } = await propose(r, alice, { "src/app.ts": "v2" });
    await settled(r);
    await inDO(r, (room) => room.core.steps.jobs());
    await pause();
    expect(seen).toHaveLength(1);
    const creates = r.world.artifacts.remoteCalls.get("create") ?? 0;
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await inDO(r, async (room) => {
      await room.core.landing.prepare(l.op.id);
      await room.core.steps.jobs();
    });
    await pause(20);
    expect(seen).toHaveLength(2);
    const [preview, landing] = seen as [Seen, Seen];
    expect(landing.job).toMatchObject({ landOp: l.op.id, integration: preview.job.integration });
    expect(landing.repo).toBe(preview.repo);
    expect(r.world.artifacts.remoteCalls.get("create") ?? 0).toBe(creates);
    expect(tokenOf(landing.job)).not.toBe(tokenOf(preview.job));
    expect([landing.readsOwn, landing.readsCanonical, landing.readsOther]).toEqual([true, false, false]);
    await inDO(r, () => late[0]!("refuse"));
    await settled(r);
    // Both jobs have ended: the repository is retired.
    expect(snapshotRepos(r)).toEqual([]);
    await tick(r, 3);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
  });

  it("retirement after the last job ends is a durable duty, retried until Artifacts confirms the deletion", async () => {
    const { r, alice, ci } = await checkRoom();
    for (let i = 0; i < 40; i++) r.world.artifacts.failRemote("delete", artifactsErrors.internal());
    const { seen } = service(r, ci);
    await propose(r, alice, { "src/app.ts": "v2" });
    await tick(r);
    expect(seen).toHaveLength(1);
    // The job ended; its deletion could not be confirmed, so the repository stays and the duty stays owed.
    expect(snapshotRepos(r).map((x) => x.name)).toEqual([seen[0]!.repo]);
    expect(await duties(r)).toContainEqual(expect.objectContaining({ name: seen[0]!.repo, kind: "delete", state: "owed" }));
    const due = await inDO(r, (room) => room.core.snapshotRepos.nextDue());
    expect(due).toBeGreaterThan(clock.now);
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBeLessThanOrEqual(due!);
    r.world.artifacts.recover();
    clock.now = due!;
    await tick(r);
    expect(snapshotRepos(r)).toEqual([]);
    expect((await duties(r)).filter((d) => d.state !== "done")).toEqual([]);
  });

  it("an unknown create: a repository created with no answer is found and deleted by the alarm, and the job is issued from a new repository", async () => {
    const { r, alice, ci } = await checkRoom();
    await hold(r, ["jobs"]);
    const { seen } = service(r, ci);
    await propose(r, alice, { "src/app.ts": "v2" });
    await settled(r);
    r.world.artifacts.loseReply("create");
    await inDO(r, (room) => room.core.steps.jobs());
    // The create applied, but its answer was lost: nothing is issued, and the create is recorded as unresolved.
    expect(seen).toEqual([]);
    const orphan = snapshotRepos(r).map((x) => x.name);
    expect(orphan).toHaveLength(1);
    expect(await duties(r)).toContainEqual(expect.objectContaining({ name: orphan[0], kind: "create", state: "in-flight" }));
    clock.now += 120_000;
    await tick(r);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.repo).not.toBe(orphan[0]);
    expect(r.world.artifacts.repos.has(orphan[0]!)).toBe(false);
    expect(snapshotRepos(r)).toEqual([]);
    expect((await duties(r)).filter((d) => d.state !== "done")).toEqual([]);
  });

  it("restart: a repository whose job was in flight when the room stopped is retired after the job's deadline, and the next attempt gets a new repository", async () => {
    const { r: before, alice, ci } = await checkRoom();
    await hold(before, ["jobs"]);
    const { seen } = service(before, ci, ["hang", "refuse"]);
    await propose(before, alice, { "src/app.ts": "v2" });
    await settled(before);
    await inDO(before, (room) => room.core.steps.jobs());
    await pause();
    expect(seen).toHaveLength(1);
    const first = seen[0]!;
    await runInDurableObject(before.stub as unknown as DurableObjectStub<Room>, (_room, state) => state.abort("restart")).catch(() => undefined);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
    const r: TestRoom = { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
    // Nothing in memory: the job's row and the repository's deletion duty are what remain, both due by the deadline.
    expect(r.world.artifacts.repos.has(first.repo)).toBe(true);
    const deadline = Date.parse(first.job.deadline);
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBeLessThanOrEqual(deadline);
    clock.now = deadline + 1;
    await tick(r);
    expect(seen).toHaveLength(2);
    expect(seen[1]!.repo).not.toBe(first.repo);
    expect(r.world.artifacts.repos.has(first.repo)).toBe(false);
    expect(snapshotRepos(r)).toEqual([]);
    expect((await duties(r)).filter((d) => d.state !== "done")).toEqual([]);
  });
});

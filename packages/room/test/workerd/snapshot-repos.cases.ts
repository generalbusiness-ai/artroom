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
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { Check, CheckBody, CheckerConfig, CheckJob, Claim, Landing, LandOp, Proposal, Refusal, Result, Sha } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import { encodeCommit, encodeTree, gitObject } from "@generalbusiness/artroom-log";
import { setFault, type Room } from "../../src/index.ts";
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

describe("R-CARRY-15: the filtered files", () => {
  it("a submodule entry is never part of a snapshot", async () => {
    const { r } = await checkRoom();
    const a = r.world.artifacts;
    const blob = a.put(gitObject("blob", new TextEncoder().encode("export const a = 1;\n")));
    const src = a.put(gitObject("tree", encodeTree([{ name: "a.ts", mode: "100644", sha: blob as Sha }, { name: "vendored", mode: "160000" as never, sha: "1".repeat(40) as Sha }])));
    const root = a.put(gitObject("tree", encodeTree([{ name: "src", mode: "40000", sha: src as Sha }])));
    const who = "Test <t@example.invalid> 0 +0000";
    const commit = a.put(gitObject("commit", encodeCommit({ tree: root as Sha, parents: [], author: who, committer: who, message: "with a submodule\n" })));
    const canonical = a.canonicalRepo();
    for (const o of [blob, src, root, commit]) canonical.objects.add(o);
    // Lane L's tree parser, under the fake, reads every non-tree mode as 100644; the live binding gives the real mode.
    const readTree = canonical.readTree.bind(canonical);
    (canonical as { readTree: (hash: string) => Promise<unknown> }).readTree = async (hash: string) =>
      hash === src
        ? [
            { name: "a.ts", mode: "100644", hash: blob, type: "blob" as const },
            { name: "vendored", mode: "160000", hash: "1".repeat(40), type: "blob" as const },
          ]
        : readTree(hash);
    const snap = await inDO(r, (room) => room.core.ports.artifacts.snapshot(commit as Sha, ["src/**"]));
    expect(snap!.entries.map(([p, mode]) => [p, mode])).toEqual([["src/a.ts", "100644"]]);
  });
});

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
    // The job and the unresolved create are both due later, not now.
    expect(await inDO(r, (room) => room.core.sql.all("SELECT state, next_ms FROM check_jobs"))).toEqual([{ state: "owed", next_ms: expect.any(Number) }]);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT next_ms FROM check_jobs")[0]!["next_ms"] as number)).toBeGreaterThan(clock.now);
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

describe("review 1701f73e: an imported room's jobs stay in its import namespace", () => {
  for (const [kind, cfg] of [
    ["whole-tree", { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R } as CheckerConfig],
    ["filtered", scoped],
  ] as const)
    it(`${kind}: the job reads the import namespace through the Room's binding for it, and the public namespace is untouched`, async () => {
      const r = await makeRoom({
        policy: policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" })),
        files: { ".artroom/checkers/unit.json": JSON.stringify(cfg), "package.json": "{}", "docs/private.md": "not for a scoped runner\n" },
        importNamespace: "acme-import",
      });
      const imports = r.world.imports!;
      const alice = await addMember(r, "@alice", "member");
      await addMember(r, "@ci", "checker");
      const seen: { job: CheckJob; own: string; ownObjects: ReadonlySet<string>; readsOwn: boolean; readsCanonical: boolean }[] = [];
      r.world.checkers["unit"] = {
        async handle(job): Promise<Result<Check>> {
          const own = [...imports.repos.values()].find((x) => x.remote === job.readUrl)!;
          seen.push({ job, own: own.name, ownObjects: new Set(own.objects), readsOwn: own.admits(tokenOf(job), "read"), readsCanonical: imports.canonicalRepo().admits(tokenOf(job), "read") });
          return refusal;
        },
      };
      const c = await alice.ok<Claim>("claim", null, { goal: "work", scope: ["src/**"] });
      const head = imports.commit(imports.main, { "src/app.ts": "v2" });
      imports.push(c.lane, head);
      await alice.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
      await tick(r, 2);
      expect(seen).toHaveLength(1);
      const s = seen[0]!;
      expect(s.readsOwn).toBe(true);
      if (kind === "whole-tree") {
        expect(s.own).toBe(imports.canonical);
        expect(s.job.input).toMatchObject({ kind: "tree" });
      } else {
        // A snapshot repository of its own, in the import namespace, without the file outside the checker's inputs.
        expect(s.own).toContain("--snap-");
        expect(s.readsCanonical).toBe(false);
        const privateBlob = imports.blobs(imports.main!).get("docs/private.md")!;
        expect(s.ownObjects.has(privateBlob)).toBe(false);
        expect(s.ownObjects.has(s.job.integration)).toBe(true);
      }
      // Its credentials end with the job; the public namespace has no repository and was never called.
      expect(imports.canonicalRepo().admits(tokenOf(s.job), "read")).toBe(false);
      expect([...imports.repos.keys()].filter((n) => n.includes("--snap-"))).toEqual([]);
      expect(r.world.artifacts.repos.size).toBe(0);
      expect(r.world.artifacts.remoteCalls.size).toBe(0);
    });
});

// ------------------------------------------------------------------ follow-up c9cd4cd8, 1: the snapshot wake-up is stored before the create

/** A new stub for the room's object: after an abort, the old stub stays broken. */
const freshStub = (r: TestRoom) => env.ROOMS.get(env.ROOMS.idFromName(r.id)) as unknown as DurableObjectStub<Room>;

describe("follow-up c9cd4cd8 (1): a snapshot create is sent only after its wake-up is in storage", () => {
  const storage = <T>(r: TestRoom, fn: (state: DurableObjectState) => Promise<T>) =>
    runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, (_room: Room, state: DurableObjectState) => fn(state));

  /** A room with one filtered job owed and not yet run, and no alarm in storage: only the snapshot's own wake-up can store one. */
  async function owedJob() {
    const { r, alice, ci } = await checkRoom();
    await hold(r, ["jobs"]);
    const { seen } = service(r, ci);
    await propose(r, alice, { "src/app.ts": "v2" });
    await settled(r);
    await storage(r, (s) => s.storage.deleteAlarm());
    return { r, seen };
  }

  it("the alarm is in storage while the snapshot create is outstanding; after the host stops, a fresh object's alarm deletes the late repository", async () => {
    const { r } = await owedJob();
    const a = r.world.artifacts;
    // The snapshot create is dispatched and never answers. (A plain flag: resolving a test promise from inside the
    // object keeps the test pool from aborting it.)
    const real = a.binding.create;
    let name: string | null = null;
    a.binding.create = async (n: string, o?: { readOnly?: boolean; description?: string; setDefaultBranch?: string }) => {
      if (!n.includes("--snap-")) return real(n, o);
      a.binding.create = real;
      name = n;
      return new Promise<never>(() => {});
    };
    await inDO(r, (room) => {
      void room.core.steps.jobs().catch(() => undefined);
    });
    while (name === null) await pause(2);
    const created: string = name;
    expect(await duties(r)).toContainEqual(expect.objectContaining({ name: created, kind: "create", state: "in-flight" }));
    expect(await storage(r, (s) => s.storage.getAlarm()), "an alarm is stored before the provider was asked").not.toBeNull();
    await storage(r, async (s) => s.abort("host stopped")).catch(() => undefined);
    await real(created); // the create applies late
    expect(a.repos.has(created)).toBe(true);
    clock.now += 2 * 60_000; // past the unresolved create's first check
    const stub = freshStub(r);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(a.repos.has(created)).toBe(false);
    expect((await runInDurableObject(stub, (room: Room) => room.core.snapshotRepos.duties())).filter((d) => d.name === created && d.state !== "done")).toEqual([]);
  });

  it("a snapshot wake-up that cannot be stored: no create is sent, the step is closed as never sent, and the job is tried again", async () => {
    const { r, seen } = await owedJob();
    const a = r.world.artifacts;
    const creates = () => a.remoteCalls.get("create") ?? 0;
    const before = creates();
    let left = 1;
    setFault((p) => {
      if (p === "room:set-alarm" && left-- > 0) throw new Error("the alarm could not be stored");
    });
    try {
      await inDO(r, (room) => room.core.steps.jobs());
      expect(left, "the wake-up asked storage").toBe(0);
    } finally {
      setFault(null);
    }
    expect(creates()).toBe(before);
    expect(await duties(r)).toEqual([expect.objectContaining({ kind: "create", state: "done", doneReason: "not-sent" })]);
    expect(snapshotRepos(r)).toEqual([]);
    clock.now = (await inDO(r, (room) => room.core.sql.all("SELECT next_ms FROM check_jobs")[0]!["next_ms"] as number));
    await inDO(r, (room) => room.core.steps.jobs());
    await settled(r);
    expect(creates()).toBe(before + 1);
    expect(seen).toHaveLength(1);
  });
});

describe("follow-up c9cd4cd8 (2): a fresh object schedules snapshot debt it finds", () => {
  it("a snapshot repository's owed deletion, with no alarm stored: the fresh object stores one, and its alarm deletes the repository", async () => {
    const { r } = await checkRoom();
    const a = r.world.artifacts;
    const commit = "a".repeat(40);
    const ready = await inDO(r, (room) => room.core.snapshotRepos.prepare(commit, async () => commit));
    expect(a.repos.has(ready.name)).toBe(true);
    const before = r.stub as unknown as DurableObjectStub<Room>;
    await runInDurableObject(before, (_room: Room, s: DurableObjectState) => s.storage.deleteAlarm());
    await runInDurableObject(before, (_room: Room, s: DurableObjectState) => s.abort("restart")).catch(() => undefined);
    const stub = freshStub(r);
    expect(await runInDurableObject(stub, (_room: Room, s: DurableObjectState) => s.storage.getAlarm()), "the fresh object stored an alarm").not.toBeNull();
    clock.now += 16 * 60_000; // the unused repository's deletion is due after the preparation window
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(a.repos.has(ready.name)).toBe(false);
    expect((await runInDurableObject(stub, (room: Room) => room.core.snapshotRepos.duties())).filter((d) => d.state !== "done")).toEqual([]);
  });
});

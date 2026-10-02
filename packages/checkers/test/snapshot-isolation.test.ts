// Review bdcc7cc9 P2 and R-CARRY-16: a filtered job reads only its own
// snapshot. Each snapshot commit has its own new repository holding only that
// commit's closure, and each job its own read token for that repository,
// bounded by its deadline.
//
// The publisher is the git package's real GitOps.writeSnapshot; the Room's
// side is SnapshotRepos; the runner is the real RunnerHost, provider, gateway
// and checkout over a container modelled on the host (fake-container.ts).
// Every fake Artifacts repository serves any object it holds by ID, the most a
// server could allow, so a fetch fails only because the object is not there.
// In the model, a runner's git reaches repositories by path, not through the
// gateway; which repository a runner can reach is tested at the gateway and
// at Artifacts' token check.
import { onTestFinished, test } from "vitest";
import assert from "node:assert/strict";
import { chmodSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import type { CheckJob, Sha } from "@generalbusiness/artroom-contract";
import { checkJob, isRefusal, tokenFromGitAuthEnv } from "../src/job.ts";
import { checkout, git, type Workspace } from "../src/runner.ts";
import { runnerProvider } from "../src/sandbox.ts";
import { snapshotCommitId, snapshotMessage } from "../src/snapshot-commit.ts";
import type { RunnerSession } from "../src/checker.ts";
import { Fixture, HOST, NS, PROJECT, ROOM, sh, type Snap } from "./support.ts";
import { Fleet, type FakeContainer } from "./fake-container.ts";

function world() {
  const f = new Fixture();
  const repos = (name: string) => (name === "canon" ? f.canonical : f.artifacts.has(name) ? f.artifacts.local(name) : null);
  const fleet = new Fleet(f.root, repos, { authorize: (path, auth) => f.artifacts.authorize(path, auth) });
  const provider = runnerProvider({ fresh: () => fleet.make().host, registry: [] });
  const sessions: RunnerSession[] = [];
  onTestFinished(async () => {
    for (const s of sessions) await s.close().catch(() => undefined);
    await fleet.dispose();
    f.dispose();
  });
  /** Issue a filtered job for `snap` and check it out in a new runner, as the service does. */
  const run = async (snap: Snap) => {
    const { job, tokenId } = await f.snapshotJob(snap);
    const bound = checkJob(job, { room: ROOM, checker: job.check, host: HOST, namespace: NS, now: Date.now });
    assert.ok(!isRefusal(bound), JSON.stringify(bound));
    const before = fleet.boxes.length;
    const s = await provider.open(bound);
    sessions.push(s);
    const box = fleet.boxes[before]!.c;
    const co = await checkout(s.runner, job, s);
    assert.ok(co.ok, co.ok ? "" : co.detail);
    const ws = (co as { ws: Workspace }).ws;
    const token = tokenFromGitAuthEnv(job.gitAuthEnv)!;
    return { job, tokenId, token, s, box, ws, git: (args: string[]) => git(s.runner, ws, args) };
  };
  return { f, fleet, run };
}

const repoPath = (snap: Snap) => `/git/${NS}/${snap.name}.git/info/refs`;
const fetchById = (r: { git: (a: string[]) => Promise<{ exitCode: number }> }, job: CheckJob, id: string) =>
  r.git(["fetch", "--no-tags", "--no-write-fetch-head", job.readUrl, id]).then((x) => x.exitCode);
/** What the runner's server advertises: `<sha> <ref>` lines. */
const advertised = async (r: { git: (a: string[]) => Promise<{ exitCode: number; stdout: string }> }, job: CheckJob) => {
  const out = await r.git(["ls-remote", job.readUrl]);
  assert.equal(out.exitCode, 0);
  return out.stdout.trim().split("\n").map((l) => l.replace("\t", " "));
};
const rev = (store: string, what: string) => sh(store, "--git-dir", store, "rev-parse", what) as Promise<Sha>;

test("older snapshot, omitted file: the current job cannot read the older snapshot's commit, trees or blob by known ID, nor see it advertised (P2, R-CARRY-16)", async () => {
  const { f, run } = world();
  const canonical = await f.init(PROJECT);
  // The checker's reproduction: an older src/** snapshot, then a current src/add.js snapshot, by the same checker.
  const older = await f.snapshot(canonical, ["src/**"]);
  const current = await f.snapshot(canonical, ["src/add.js"]);
  assert.notEqual(older.commit, current.commit);
  assert.notEqual(older.name, current.name, "each snapshot commit has its own repository");
  const secret = await rev(older.store, `${older.commit}:src/secret.txt`);
  const olderTree = await rev(older.store, `${older.commit}^{tree}`);
  const olderSrc = await rev(older.store, `${older.commit}:src`);
  // Control: the older snapshot's own job reads all of these by ID from its own repository, so the server serves objects by ID.
  const o = await run(older);
  for (const id of [older.commit, olderTree, olderSrc, secret]) assert.equal(await fetchById(o, o.job, id), 0, `the older job fetches ${id}`);
  // The current job, while the older repository still exists.
  const c = await run(current);
  assert.equal(c.ws.head, current.commit);
  assert.ok(!c.ws.files!.some(([p]) => p === "src/secret.txt"));
  for (const id of [older.commit, olderTree, olderSrc, secret]) assert.notEqual(await fetchById(c, c.job, id), 0, `the current job cannot fetch ${id}`);
  assert.notEqual((await c.git(["show", `${older.commit}:src/secret.txt`])).exitCode, 0);
  assert.notEqual((await c.git(["cat-file", "-e", secret])).exitCode, 0);
  assert.deepEqual(await advertised(c, c.job), [`${current.commit} refs/artroom/snapshot`]);
  // Its repository holds the current commit's closure and nothing else.
  const reachable = (await sh(current.store, "--git-dir", current.store, "rev-list", "--objects", "--all")).split("\n").map((l) => l.slice(0, 40)).sort();
  const stored = (await sh(current.store, "--git-dir", current.store, "cat-file", "--batch-all-objects", "--batch-check=%(objectname)")).split("\n").sort();
  assert.deepEqual(stored, reachable);
  // Its gateway reaches only its own repository, and Artifacts accepts its token only there.
  assert.equal(await Fleet.ask(c.box, repoPath(current)), 200);
  assert.equal(await Fleet.ask(c.box, repoPath(older)), 403);
  assert.equal(f.artifacts.authorize(repoPath(older), `Bearer ${c.token}`), false);
});

test("exact current commit: the job fetches its own snapshot commit by ID and HEAD is that commit (R-CARRY-16, R-EXEC-4)", async () => {
  const { f, run } = world();
  const canonical = await f.init(PROJECT);
  const snap = await f.snapshot(canonical, ["src/add.js"]);
  const r = await run(snap);
  assert.equal(await fetchById(r, r.job, snap.commit), 0);
  assert.equal((await r.git(["rev-parse", "HEAD"])).stdout.trim(), snap.commit);
  assert.equal(await Fleet.ask(r.box, repoPath(snap)), 200);
});

test("configuration change that narrows the inputs: the new snapshot gets a new repository, and neither job's token reads the other's (R-CARRY-16)", async () => {
  const { f, run } = world();
  const canonical = await f.init(PROJECT);
  const wide = await f.snapshot(canonical, ["src/**"]);
  const w = await run(wide);
  // An approved proposal narrows the checker's inputs; the next job's snapshot is a new commit.
  const narrow = await f.snapshot(canonical, ["src/add.js"]);
  assert.notEqual(narrow.name, wide.name);
  assert.deepEqual(f.artifacts.created, [wide.name, narrow.name], "a new, empty repository, not the wider one");
  const n = await run(narrow);
  assert.equal(f.artifacts.authorize(repoPath(wide), `Bearer ${n.token}`), false, "the new job's token cannot read the wider snapshot");
  assert.equal(f.artifacts.authorize(repoPath(narrow), `Bearer ${w.token}`), false, "the earlier job's token cannot read the new snapshot");
  assert.equal(f.artifacts.authorize(repoPath(narrow), `Bearer ${n.token}`), true);
  assert.notEqual(await fetchById(n, n.job, wide.commit), 0);
  assert.notEqual(await fetchById(n, n.job, await rev(wide.store, `${wide.commit}:src/secret.txt`)), 0);
  assert.deepEqual(await advertised(n, n.job), [`${narrow.commit} refs/artroom/snapshot`]);
  // A second job for the same narrowed snapshot shares its repository, with a token of its own.
  const n2 = await run(narrow);
  assert.notEqual(n2.tokenId, n.tokenId);
  assert.equal(n2.job.readUrl, n.job.readUrl);
  assert.equal(f.artifacts.created.length, 2);
});

test("concurrent jobs, different snapshots: each reads only its own repository, by ID or by ref (R-CARRY-16)", async () => {
  const { f, run } = world();
  const c1 = await f.init(PROJECT);
  const c2 = await f.commit({ "src/add.js": "export function add(a, b) { return b + a; }\n", "src/secret.txt": "another secret\n" }, "second");
  const s2 = await f.snapshot(c1, ["src/add.js"]);
  const s3 = await f.snapshot(c2, ["src/**"], "types");
  const a = await run(s2);
  const b = await run(s3);
  // Both are open at once.
  assert.ok(a.box.running && b.box.running);
  const blobsOf = async (snap: Snap) => (await sh(snap.store, "--git-dir", snap.store, "ls-tree", "-r", "--format=%(objectname)", snap.commit)).split("\n");
  for (const [mine, theirs] of [
    [a, s3],
    [b, s2],
  ] as const) {
    assert.notEqual(await fetchById(mine, mine.job, theirs.commit), 0);
    for (const blob of await blobsOf(theirs)) {
      const ours = await blobsOf(mine === a ? s2 : s3);
      if (!ours.includes(blob)) assert.notEqual(await fetchById(mine, mine.job, blob), 0, `blob ${blob} of the other snapshot`);
    }
    assert.equal(await Fleet.ask(mine.box as FakeContainer, repoPath(theirs)), 403);
    assert.equal(f.artifacts.authorize(repoPath(theirs), `Bearer ${mine.token}`), false);
  }
  assert.deepEqual(await advertised(a, a.job), [`${s2.commit} refs/artroom/snapshot`]);
  assert.deepEqual(await advertised(b, b.job), [`${s3.commit} refs/artroom/snapshot`]);
});

test("retirement: when the last job ends the repository and its tokens go; an Artifacts outage leaves both owed and retried (R-CARRY-16)", async () => {
  const { f, run } = world();
  const canonical = await f.init(PROJECT);
  const snap = await f.snapshot(canonical, ["src/add.js"]);
  const a = await run(snap);
  const b = await run(snap);
  await a.s.close();
  assert.equal(await f.snapshots.end(snap.commit, a.job.id), 1);
  assert.equal(f.artifacts.authorize(repoPath(snap), `Bearer ${a.token}`), false, "the ended job's token is revoked");
  assert.equal(f.artifacts.authorize(repoPath(snap), `Bearer ${b.token}`), true, "the other job's is not");
  // Artifacts is down when the last job ends.
  f.artifacts.down.delete = true;
  f.artifacts.down.revoke = true;
  await b.s.close();
  assert.equal(await f.snapshots.end(snap.commit, b.job.id), 2);
  assert.equal(f.artifacts.has(snap.name), true);
  assert.deepEqual(
    f.snapshots.duties().filter((d) => d.state === "owed").map((d) => d.kind).sort(),
    ["delete", "revoke"],
  );
  // Nothing new is issued against it meanwhile, and its retirement is retried.
  await assert.rejects(f.snapshotJob(snap), /not ready/);
  assert.equal(await f.snapshots.reconcile(), 2);
  f.artifacts.down.delete = false;
  f.artifacts.down.revoke = false;
  assert.equal(await f.snapshots.sweep(), 0);
  assert.equal(f.artifacts.has(snap.name), false);
  assert.deepEqual(f.artifacts.live(snap.name), []);
  assert.equal(f.snapshots.pending(), 0);
});

test("the Room's snapshot commit ID equals the commit the publisher writes, for awkward names and modes (R-CARRY-15)", async () => {
  const { f } = world();
  const canonical = await f.init({ ...PROJECT, "src/a.b": "1\n", "src/a/b.js": "2\n", "src/a-b": "3\n", "src/a0": "4\n", "src/\u00fc.js": "5\n" });
  chmodSync(join(f.work, "src/a-b"), 0o755);
  symlinkSync("a.b", join(f.work, "src/link"));
  const exec = await f.commit({}, "an executable and a symlink");
  assert.match(await sh(f.work, "ls-tree", "-r", exec), /100755 blob \w+\tsrc\/a-b/);
  assert.match(await sh(f.work, "ls-tree", "-r", exec), /120000 blob \w+\tsrc\/link/);
  for (const c of [canonical, exec]) {
    const files = await f.ops.listTree(f.canonical, c);
    const message = snapshotMessage("tests", `sha256:${"e".repeat(64)}`);
    const store = f.artifacts.local("check");
    await sh(f.root, "init", "-q", "--bare", store);
    const wrote = await f.ops.writeSnapshot({ canonical: f.canonical, store, files, message });
    assert.equal(await snapshotCommitId(files as never, message), wrote);
    rmSync(store, { recursive: true });
  }
});

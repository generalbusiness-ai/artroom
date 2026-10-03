// What only real git and real npm can show: that the checkout is the exact
// integration, that a scoped job cannot read a file left out of its snapshot
// by any route, that the snapshot commit the Room derives is the one the
// publisher writes, and that the real tools run in the workspace the checkout
// prepares.
//
// One canonical repository is built once for the file and only read. Each
// test writes to its own job directory or snapshot repository.
import { afterAll, beforeAll, test } from "vitest";
import assert from "node:assert/strict";
import { chmodSync, existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import type { Check, Note, Sha } from "@generalbusiness/artroom-contract";
import type { CheckerServices } from "../src/checker.ts";
import { TestsChecker } from "../src/checkers.ts";
import { LlmReviewer, type Model } from "../src/llm.ts";
import { checkJob, isRefusal } from "../src/job.ts";
import { checkout, git } from "../src/runner.ts";
import { runnerProvider } from "../src/sandbox.ts";
import { generateKey, importSigner } from "../src/signing.ts";
import { Ledger } from "./ledger.ts";
import { Fleet, ProcessContainer, modelImage } from "./containers.ts";
import { Fixture, LocalRunner, PROJECT, sh, type Commit, type Snap } from "./fixture.ts";
import { NS, expectations, job } from "./support.ts";

let f: Fixture;
/** The canonical history: main, two lane commits on top of it, and a commit with awkward names and modes. */
let main: Commit, second: Commit, awkward: Commit;

beforeAll(() => {
  f = new Fixture();
  main = f.commit("main", PROJECT);
  f.commit("first", { "src/first.js": "export const first = 1;\n" });
  second = f.commit("second", { "src/second.js": "export const second = 2;\n" });
  awkward = f.commit("awkward", { "src/a.b": "1\n", "src/a/b.js": "2\n", "src/a-b": "3\n", "src/a0": "4\n", "src/ü.js": "5\n" }, (dir) => {
    chmodSync(join(dir, "src/a-b"), 0o755);
    symlinkSync("a.b", join(dir, "src/link"));
  });
});
afterAll(() => f.dispose());

/** A wide snapshot of the awkward commit, made once: every file under src, the excluded one among them. */
let made: Promise<Snap> | undefined;
const wide = () => (made ??= f.snapshot(awkward.sha, ["src/**"]));

/** A runner that is a plain process, fetching from the canonical repository by path. */
const local = () => ({ remote: f.canonical, root: f.runners, gitConfig: ["protocol.file.allow=always"] });
const whole = (c: Commit, over: Parameters<typeof job>[2] = {}) => job(c.sha, { kind: "tree", tree: c.tree }, over);

// ------------------------------------------------------------------ checkout (R-EXEC-4)

test("checkout fetches the exact integration with no history, and confirms HEAD and the tree (R-EXEC-4)", async () => {
  const r = new LocalRunner();
  const co = await checkout(r, whole(second), local());
  assert.ok(co.ok, !co.ok ? co.detail : "");
  assert.deepEqual([co.ws.head, co.ws.tree], [second.sha, second.tree]);
  assert.equal(sh(co.ws.dir, "rev-list", "--count", "HEAD"), "1", "depth 1: no history");
  assert.equal(existsSync(join(co.ws.dir, "src/second.js")), true);
  // Every command was an argument array; none was a shell.
  assert.ok(r.calls.length > 5 && r.calls.every((c) => c[0] !== "sh" && c[0] !== "bash"));
});

// ------------------------------------------------------------------ filtered snapshots (R-CARRY-9, R-CARRY-15, R-CARRY-16, R-EXEC-7)

test("a scoped job reads only its own snapshot: a file left out cannot be read by any route, nor can an older, wider snapshot's commit or blob by known ID (review bdcc7cc9 P2; R-CARRY-9, R-CARRY-16, R-EXEC-7)", async () => {
  // The reviewer's reproduction: an older src/** snapshot, then a current src/add.js snapshot, for the same checker.
  const older = await wide();
  const current = await f.snapshot(main.sha, ["src/add.js"]);
  assert.notEqual(older.name, current.name, "each snapshot commit has its own repository");
  const blob = (path: string) => sh(f.canonical, "rev-parse", `${main.sha}:${path}`) as Sha;
  const secret = blob("src/secret.txt");
  assert.equal(sh(older.store, "cat-file", "-t", secret), "blob", "the older snapshot holds the file");

  // The current job in a new runner, as the service runs it: provider, RunnerHost, gateway and checkout.
  const image = modelImage(f.root);
  const fleet = new Fleet(() => new ProcessContainer({ dir: f.root, image, repos: (name) => (f.artifacts.has(name) ? f.artifacts.local(name) : null) }));
  const j = await f.snapshotJob(current);
  const bound = checkJob(j, expectations());
  assert.ok(!isRefusal(bound), JSON.stringify(bound));
  const session = await runnerProvider({ fresh: () => fleet.make().host, registry: [] }).open(bound);
  try {
    const co = await checkout(session.runner, j, session);
    assert.ok(co.ok, !co.ok ? co.detail : "");
    const ws = co.ws;
    const run = async (...args: string[]) => git(session.runner, ws, args);
    const fetch = async (id: string) => (await run("fetch", "--no-tags", "--no-write-fetch-head", j.readUrl, id)).exitCode;
    assert.equal(ws.head, current.commit);
    assert.deepEqual(ws.files!.map(([p]) => p), ["package-lock.json", "package.json", "src/add.js", "test/add.test.js"]);
    // 1. Not in the working tree.
    const box = fleet.boxes[0]!.c;
    assert.equal(existsSync(join(box.root!, "work", j.id, "src/src/add.js")), true);
    assert.equal(existsSync(join(box.root!, "work", j.id, "src/src/secret.txt")), false);
    // 2. Not in the object database, and there is no history to dig in: one root commit.
    assert.notEqual((await run("cat-file", "-e", secret)).exitCode, 0);
    assert.equal((await run("rev-list", "--all", "--count")).stdout.trim(), "1");
    // 3. No remote is configured, and the one repository the job can reach advertises only its snapshot.
    assert.equal((await run("remote")).stdout.trim(), "");
    assert.equal((await run("ls-remote", j.readUrl)).stdout.trim(), `${current.commit}\trefs/artroom/snapshot`);
    // 4. Not fetchable by ID. Control: the server does serve an object it holds by its ID.
    assert.equal(await fetch(blob("src/add.js")), 0, "the job's repository serves its own blob by ID");
    assert.notEqual(await fetch(secret), 0, "the file left out");
    assert.notEqual(await fetch(older.commit), 0, "the older snapshot's commit");
    // 5. Its gateway reaches its own repository only.
    assert.equal(await Fleet.ask(box, `/git/${NS}/${current.name}.git/info/refs`), 200);
    assert.equal(await Fleet.ask(box, `/git/${NS}/${older.name}.git/info/refs`), 403);
    assert.equal(await Fleet.ask(box, `/git/${NS}/canon.git/info/refs`), 403);
  } finally {
    await session.close();
  }
});

test("the Room's snapshot commit ID equals the commit the publisher writes, for awkward names and modes (R-CARRY-15)", async () => {
  // `snap.commit` is the ID derived without git (snapshot-commit.ts); the store holds what the publisher's git wrote.
  const snap = await wide();
  assert.equal(sh(snap.store, "rev-parse", "refs/artroom/snapshot"), snap.commit);
  const listed = sh(snap.store, "ls-tree", "-r", "--name-only", "-z", snap.commit).split("\0").filter(Boolean);
  for (const path of ["src/a-b", "src/a.b", "src/a/b.js", "src/a0", "src/link", "src/\u00fc.js", "src/secret.txt"]) assert.ok(listed.includes(path), path);
  const modes = sh(snap.store, "ls-tree", snap.commit, "src/a-b", "src/link");
  assert.match(modes, /^100755 blob \w+\tsrc\/a-b\n120000 blob \w+\tsrc\/link$/);
});

// ------------------------------------------------------------------ the checkers, with the real tools

async function service(checker: string): Promise<{ ledger: Ledger; s: CheckerServices }> {
  const signer = await importSigner(JSON.stringify(await generateKey()));
  const ledger = new Ledger({ key: signer.key, member: "@ci" });
  const runners = { open: async () => ({ runner: new LocalRunner(), ...local(), close: async () => {} }) };
  return { ledger, s: { signer, room: ledger, expectations: expectations(checker), runners } };
}

test("tests checker: real `npm ci` and `npm test` run the project's tests in the workspace the checkout prepares, and the check is recorded", async () => {
  class Tests extends TestsChecker<CheckerServices> {
    protected services() {
      return this.env;
    }
  }
  const { ledger, s } = await service("tests");
  const j = whole(main);
  ledger.issue(j);
  const pass = (await new Tests({ waitUntil: () => {} }, s).handle(j)) as Check;
  assert.ok(!isRefusal(pass), JSON.stringify(pass));
  assert.equal(pass.ok, true, pass.detail);
  assert.match(pass.detail, /npm test exited 0\.[\s\S]*\bpass 1\n/, "the project's one test ran and passed");
  assert.deepEqual([pass.integration, pass.input], [main.sha, j.input]);
  assert.deepEqual(ledger.records.map((r) => r.id), [pass.id]);
});

test("LLM reviewer: the change is the integration against the job's base, not its first parent, read with real git (R-EXEC-10)", async () => {
  class Llm extends LlmReviewer<CheckerServices & { m: Model }> {
    protected readonly modelName = "test-model";
    protected services() {
      return this.env;
    }
    protected model() {
      return this.env.m;
    }
  }
  const { ledger, s } = await service("llm-review");
  let seen = "";
  const model: Model = async (_system, user) => ((seen = user), '{"findings":[]}');
  // Two commits on the lane: the integration's first parent is the middle one, the job's base is main.
  const j = whole(second, { check: "llm-review", obligation: "obl_llm-review", base: main.sha, volatile: true, advisory: true });
  ledger.issue(j);
  const check = (await new Llm({ waitUntil: () => {} }, { ...s, m: model }).handle(j)) as Check;
  assert.equal(check.ok, true, JSON.stringify(check));
  assert.match(seen, /^<diff>\ndiff --git a\/src\/first\.js b\/src\/first\.js\n[\s\S]*\+export const first = 1;/, "the change from the base includes the first lane commit");
  assert.match(seen, /\+export const second = 2;/);
  assert.doesNotMatch(seen, /add\.js/, "and nothing main already had");
  assert.match(check.detail, new RegExp(`reviewed against the base ${main.sha.slice(0, 12)}:\nsrc/first.js`));
  assert.deepEqual((ledger.records.find((r) => r.kind === "note") as Note).anchor, { act: check.id });
});

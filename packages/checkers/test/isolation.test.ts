// Review c46a4491: one job per container (G1), one owner per runner (G2), the
// service's own copy of the job (G3), and whole structured output (G4). The
// runner is the real RunnerHost and provider over a container modelled on the
// host (fake-container.ts).
import { onTestFinished, test } from "vitest";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { ArtroomError, Check, CheckJob, Note, Sha, SignedEnvelope } from "@generalbusiness/artroom-contract";
import { checkJob, gitAuthEnvFor, isRefusal, type BoundJob } from "../src/job.ts";
import { checkout } from "../src/runner.ts";
import { generateKey, importSigner, signEnvelope, verifyEnvelope } from "../src/signing.ts";
import { Ledger } from "../src/ledger.ts";
import { TestsChecker } from "../src/checkers.ts";
import { LlmReviewer, type Model } from "../src/llm.ts";
import type { CheckerServices, RoomPort, RunnerProvider } from "../src/checker.ts";
import { OUTPUT_LIMIT, runnerProvider } from "../src/sandbox.ts";
import { Fixture, HOST, LocalRunner, NS, PROJECT, ROOM, job } from "./support.ts";
import { Fleet } from "./fake-container.ts";

// Token-shaped strings are built at run time, never written as literals.
const tok = (s: string) => ["art", "v1", s].join("_");
const urlOf = (repo: string) => `https://${HOST}/git/${NS}/${repo}.git` as const;
const expectations = (checker = "tests") => ({ room: ROOM, checker, host: HOST, namespace: NS, now: Date.now });

class Tests extends TestsChecker<{ s: CheckerServices }> {
  protected services() {
    return this.env.s;
  }
}
class Llm extends LlmReviewer<{ s: CheckerServices; m: Model }> {
  protected readonly modelName = "test-model";
  protected services() {
    return this.env.s;
  }
  protected model() {
    return this.env.m;
  }
}

/** A gate: `wait` blocks until `open`; `reached` resolves when someone waits. */
function gate() {
  let open!: () => void;
  let reached!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  const hit = new Promise<void>((r) => (reached = r));
  return { open, reached: hit, wait: () => (reached(), opened) };
}

/** Wrap a provider so that `npm test` in a chosen job waits on a gate, or throws. */
function holding(p: RunnerProvider, hold: (job: CheckJob) => Promise<void> | void): RunnerProvider {
  return {
    async open(bound) {
      const s = await p.open(bound);
      const exec = s.runner.exec.bind(s.runner);
      return { ...s, runner: { digest: s.runner.digest, exec: async (a, o) => (a[0] === "npm" && a[1] === "test" && (await hold(bound.job)), exec(a, o)) } };
    },
  };
}

/** The canonical repo (as `canon` and `canon2`) and every repository in the fake Artifacts. */
const everyRepo = (f: Fixture) => (name: string) => (name === "canon" || name === "canon2" ? f.canonical : f.artifacts.has(name) ? f.artifacts.local(name) : null);

async function world(repos: (f: Fixture) => (name: string) => string | null = everyRepo) {
  const f = new Fixture();
  const fleet = new Fleet(f.root, repos(f));
  onTestFinished(async () => {
    await fleet.dispose();
    f.dispose();
  });
  const signer = await importSigner(JSON.stringify(await generateKey()));
  const ledger = new Ledger({ key: signer.key, member: "@ci" });
  const provider = runnerProvider({ fresh: () => fleet.make().host, registry: [] });
  const services = (over: Partial<CheckerServices> = {}): CheckerServices => ({ signer, room: ledger, expectations: expectations(), runners: provider, ...over });
  return { f, fleet, signer, ledger, provider, services };
}

function bind(j: CheckJob): BoundJob {
  const b = checkJob(j, expectations(j.check));
  assert.ok(!isRefusal(b), JSON.stringify(b));
  return b;
}

// ------------------------------------------------------------------ G1

test("G1: a job cannot reach the next one: a replaced tool and a surviving process die with its container", async () => {
  const { f, fleet, ledger, services } = await world();
  const victim = await f.init({ ...PROJECT, "src/add.js": "export function add(a, b) { return a - b; }\n" });
  const marker = join(f.root, "survivor-was-here");
  const poison = [
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    'const { spawn } = require("node:child_process");',
    'const tools = process.env.PATH.split(":").find((p) => p.endsWith("/tools"));',
    // Replace a trusted tool in the image, and write outside the job's directory.
    'fs.writeFileSync(path.join(tools, "npm"), "#!/bin/sh\\nexit 0\\n", { mode: 0o755 });',
    'fs.writeFileSync(path.resolve("../../planted"), "x");',
    // Leave a process running that would replace the tool again later.
    `spawn("sh", [path.resolve("survivor.sh"), tools, ${JSON.stringify(marker)}], { stdio: "ignore" }).unref();`,
  ].join("\n");
  const survivor = 'sleep 1\nprintf \'#!/bin/sh\\nexit 0\\n\' > "$1/npm"\nchmod +x "$1/npm"\necho alive > "$2"\n';
  const attack = await f.commit(
    { "package.json": JSON.stringify({ name: "demo", version: "1.0.0", private: true, scripts: { test: "node poison.cjs" } }), "poison.cjs": poison, "survivor.sh": survivor },
    "poison",
  );
  const checker = new Tests({ waitUntil: () => {} }, { s: services() });
  const run = async (c: Sha) => {
    const j = job(c, { kind: "tree", tree: await f.tree(c) });
    ledger.issue(j);
    return (await checker.handle(j)) as Check;
  };
  const before = await run(victim);
  assert.equal(before.ok, false);
  const attacked = await run(attack);
  assert.equal(attacked.ok, true, attacked.detail);
  const after = await run(victim);
  assert.equal(after.ok, false, "the same failing integration still fails");
  assert.equal(after.runner, before.runner, "the runner digest describes the same clean image");
  assert.deepEqual([after.integration, after.input], [before.integration, before.input]);
  // One container per job, each destroyed when its job ended.
  assert.equal(fleet.boxes.length, 3);
  for (const { c } of fleet.boxes) assert.deepEqual([c.starts, c.destroys, c.running], [1, 1, false]);
  assert.notEqual(fleet.boxes[2]!.c.root, fleet.boxes[1]!.c.root);
  assert.equal(existsSync(join(fleet.boxes[2]!.c.root!, "tools/npm")), false, "the next job's image is pristine");
  // The process the attack left behind was killed with its container.
  await sleep(1500);
  assert.equal(existsSync(marker), false, "no process survived its job's container");
});

test("G1: a runner never reuses a container: reopening after close, or over a leftover one, starts from the image", async () => {
  const { fleet } = await world();
  const { c, host } = fleet.make();
  const grant = { repoPath: "/git/ns/canon.git", token: tok("a0123456789"), registry: [] };
  const a = await host.open(grant);
  const poisoned = await host.exec(a.owner, ["sh", "-c", 'printf "#!/bin/sh\\necho 0.0.0-poisoned\\n" > "$(echo $PATH | cut -d: -f1)/npm" && chmod +x "$(echo $PATH | cut -d: -f1)/npm" && npm --version']);
  assert.equal(poisoned.stdout.trim(), "0.0.0-poisoned");
  assert.equal(await host.close(a.owner), true);
  assert.equal(c.running, false);
  const b = await host.open(grant);
  assert.match((await host.exec(b.owner, ["npm", "--version"])).stdout.trim(), /^\d+\.\d+\.\d+$/);
  assert.equal(b.digest, a.digest);
  await host.close(b.owner);
  // A container left running by anything earlier is destroyed, not adopted.
  c.start();
  const leftover = c.root!;
  const left = await c.exec(["sh", "-c", 'printf "#!/bin/sh\\necho 0.0.0-poisoned\\n" > tools/npm && chmod +x tools/npm'], { env: {}, signal: new AbortController().signal });
  assert.equal((await left.output()).exitCode, 0);
  const d = await host.open(grant);
  assert.notEqual(c.root, leftover);
  assert.match((await host.exec(d.owner, ["npm", "--version"])).stdout.trim(), /^\d+\.\d+\.\d+$/);
  assert.equal(d.digest, a.digest);
  await host.close(d.owner);
});

// ------------------------------------------------------------------ G2

test("G2: one owner per runner: a second open is refused, foreign and stale closes change nothing, a closed owner can do nothing", async () => {
  const { fleet } = await world();
  const { c, host } = fleet.make();
  const A = { repoPath: "/git/ns/A.git", token: tok("A0123456789"), registry: [] };
  const B = { repoPath: "/git/ns/B.git", token: tok("B0123456789"), registry: [] };
  const a = await host.open(A);
  await assert.rejects(host.open(B), /already has a job/);
  // A's grant is untouched by the refused open.
  assert.equal(await Fleet.ask(c, "/git/ns/A.git/info/refs"), 200);
  assert.equal(await Fleet.ask(c, "/git/ns/B.git/info/refs"), 403);
  assert.deepEqual(fleet.upstream, [`/git/ns/A.git/info/refs Bearer ${A.token}`]);
  // Anything but A's token can neither run nor close.
  await assert.rejects(host.exec("forged", ["true"]), /not held by the caller/);
  assert.equal(await host.close("forged"), false);
  assert.equal(c.running, true);
  assert.equal((await host.exec(a.owner, ["true"])).exitCode, 0);
  // A's close ends A: its container goes, and its token is spent.
  assert.equal(await host.close(a.owner), true);
  assert.equal(c.running, false);
  await assert.rejects(host.exec(a.owner, ["true"]), /not held by the caller/);
  assert.equal(await host.close(a.owner), false);
  // A late close from A cannot revoke B's later grant.
  const b = await host.open(B);
  assert.equal(await host.close(a.owner), false);
  assert.equal(c.running, true);
  assert.equal(await Fleet.ask(c, "/git/ns/B.git/info/refs"), 200);
  assert.equal(await Fleet.ask(c, "/git/ns/A.git/info/refs"), 403);
  assert.equal(fleet.upstream.at(-1), `/git/ns/B.git/info/refs Bearer ${B.token}`);
  await host.close(b.owner);
});

test("G2: a failed open cleans up: its container is destroyed and the runner can be opened again", async () => {
  const { fleet } = await world();
  const { c, host } = fleet.make();
  const grant = { repoPath: "/git/ns/canon.git", token: tok("x0123456789"), registry: [] };
  c.failIntercept = true;
  await assert.rejects(host.open(grant), /intercept failed/);
  assert.equal(c.running, false);
  c.failIntercept = false;
  const ok = await host.open(grant);
  assert.equal(c.running, true);
  await host.close(ok.owner);
});

test("G2: concurrent jobs of one checker each get their own runner and grant; one job's close never touches the other", async () => {
  const { f, fleet, ledger, services } = await world();
  const c1 = await f.init();
  const c2 = await f.commit({ "src/add.js": "export function add(a, b) { return b + a; }\n" }, "second");
  const jA = job(c1, { kind: "tree", tree: await f.tree(c1) }, { gitAuthEnv: gitAuthEnvFor(tok("jobA0123456789")) });
  const jB = job(c2, { kind: "tree", tree: await f.tree(c2) }, { readUrl: urlOf("canon2"), gitAuthEnv: gitAuthEnvFor(tok("jobB0123456789")) });
  ledger.issue(jA);
  ledger.issue(jB);
  const gates = new Map([
    [jA.id, gate()],
    [jB.id, gate()],
  ]);
  const s = services();
  const checker = new Tests({ waitUntil: () => {} }, { s: { ...s, runners: holding(s.runners, (j) => gates.get(j.id)!.wait()) } });
  const pA = checker.handle(jA);
  await gates.get(jA.id)!.reached;
  const pB = checker.handle(jB);
  await gates.get(jB.id)!.reached;
  // Both are running at once, in two containers, each with only its own grant.
  assert.equal(fleet.boxes.length, 2);
  const [boxA, boxB] = fleet.boxes.map((b) => b.c);
  assert.equal(await Fleet.ask(boxA!, "/git/ns/canon.git/info/refs"), 200);
  assert.equal(await Fleet.ask(boxA!, "/git/ns/canon2.git/info/refs"), 403);
  assert.equal(await Fleet.ask(boxB!, "/git/ns/canon2.git/info/refs"), 200);
  assert.equal(await Fleet.ask(boxB!, "/git/ns/canon.git/info/refs"), 403);
  assert.deepEqual(fleet.upstream.slice(-2), [`/git/ns/canon.git/info/refs Bearer ${tok("jobA0123456789")}`, `/git/ns/canon2.git/info/refs Bearer ${tok("jobB0123456789")}`]);
  // A finishes and closes first; B keeps its container and its grant.
  gates.get(jA.id)!.open();
  const a = (await pA) as Check;
  assert.equal(boxA!.running, false);
  assert.equal(boxB!.running, true);
  assert.equal(await Fleet.ask(boxB!, "/git/ns/canon2.git/info/refs"), 200);
  assert.equal(fleet.upstream.at(-1), `/git/ns/canon2.git/info/refs Bearer ${tok("jobB0123456789")}`);
  gates.get(jB.id)!.open();
  const b = (await pB) as Check;
  assert.deepEqual([a.ok, a.integration, b.ok, b.integration], [true, c1, true, c2]);
  assert.equal(boxB!.running, false);
});

test("G2: a same-ID retry gets its own runner; a runner failure still destroys the container; neither is a recorded failure", async () => {
  const { f, fleet, ledger, services } = await world();
  const c1 = await f.init();
  const j = job(c1, { kind: "tree", tree: await f.tree(c1) });
  ledger.issue(j);
  // Two deliveries of one job, overlapping.
  const g = gate();
  let waiting = 0;
  const s = services();
  const checker = new Tests({ waitUntil: () => {} }, { s: { ...s, runners: holding(s.runners, () => (++waiting === 2 ? (g.open(), undefined) : g.wait())) } });
  const [r1, r2] = (await Promise.all([checker.handle(j), checker.handle(j)])) as Check[];
  assert.equal(fleet.boxes.length, 2, "one runner per delivery");
  assert.equal(r1!.id, r2!.id, "the room sees one check: the second is an idempotent replay");
  assert.equal(ledger.records.length, 1);
  for (const { c } of fleet.boxes) assert.equal(c.running, false);
  // A runner that fails mid-job: thrown as unavailable, nothing recorded, container destroyed.
  const j2 = job(c1, { kind: "tree", tree: await f.tree(c1) });
  ledger.issue(j2);
  const broken = new Tests({ waitUntil: () => {} }, { s: { ...s, runners: holding(s.runners, () => Promise.reject(new Error("container lost"))) } });
  await assert.rejects(broken.handle(j2), (e: ArtroomError) => e.code === "unavailable" && /container lost/.test(e.message));
  assert.equal(ledger.records.length, 1);
  assert.equal(fleet.boxes.at(-1)!.c.running, false);
});

test("G2: two runs of one job ID on one checker each find only their own workspace, across awaits", async () => {
  const { f, ledger, services } = await world();
  const c1 = await f.init();
  const j = job(c1, { kind: "tree", tree: await f.tree(c1) });
  ledger.issue(j);
  const g = gate();
  let n = 0;
  class Lookup extends TestsChecker<{ s: CheckerServices }> {
    readonly seen: [unknown, unknown][] = [];
    protected services() {
      return this.env.s;
    }
    override async run(jb: CheckJob) {
      const before = this.workspace(jb).runner;
      await (++n === 2 ? (g.open(), undefined) : g.wait());
      const after = this.workspace(jb).runner;
      this.seen.push([before, after]);
      return { ok: before === after, detail: "looked up the workspace twice" };
    }
  }
  const checker = new Lookup({ waitUntil: () => {} }, { s: services() });
  await Promise.all([checker.handle(j), checker.handle(j)]);
  assert.equal(checker.seen.length, 2);
  for (const [before, after] of checker.seen) assert.equal(after, before, "a run kept its own workspace");
  assert.notEqual(checker.seen[0]![0], checker.seen[1]![0], "the two runs had different runners");
});

test("G2: the room stand-in records concurrent submissions of one idempotency key once", async () => {
  const signer = await importSigner(JSON.stringify(await generateKey()));
  const ledger = new Ledger({ key: signer.key, member: "@ci" });
  const c = "a".repeat(40) as Sha;
  const j = job(c, { kind: "tree", tree: "b".repeat(40) as Sha });
  ledger.issue(j);
  const signed = await signEnvelope(signer, {
    v: 1,
    room: ROOM,
    actor: signer.key,
    kind: "check",
    target: { lane: j.lane, generation: j.generation },
    body: { obligation: j.obligation, check: "tests", integration: c, input: j.input, config: j.config, runner: j.config, volatile: false, ok: true, detail: "Machine-run check" },
    idempotencyKey: `chk-${j.id}`,
  });
  const [a, b] = (await Promise.all([ledger.submit(signed), ledger.submit(signed)])) as Check[];
  assert.equal(a!.id, b!.id);
  assert.equal(ledger.records.length, 1);
});

// ------------------------------------------------------------------ G3

/** A room that records the envelopes it is sent, in front of the ledger. */
function recording(ledger: Ledger): { room: RoomPort; sent: SignedEnvelope[] } {
  const sent: SignedEnvelope[] = [];
  return { sent, room: { submit: (e) => (sent.push(e), ledger.submit(e)) } };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

test("G3: the service signs its own copy of the job: changing any field, nested input included, while the check runs changes nothing", async () => {
  const { f, signer, ledger, services } = await world();
  const c1 = await f.init();
  const j = job(c1, { kind: "tree", tree: await f.tree(c1) }, { landOp: "op_land1" });
  ledger.issue(j);
  const original = structuredClone(j);
  const { room, sent } = recording(ledger);
  const g = gate();
  const s = services({ room });
  const checker = new Tests({ waitUntil: () => {} }, { s: { ...s, runners: holding(s.runners, () => g.wait()) } });
  const p = checker.handle(j);
  // Changed before the service's first await: the copy was already taken.
  const m = j as Mutable<CheckJob>;
  m.room = `room_${"b".repeat(32)}` as never;
  await g.reached;
  // Changed while npm test runs, after checkout confirmed the original commit.
  Object.assign(m, {
    id: "job_other",
    lane: "act_2002_abcdef02",
    generation: 9,
    head: "e".repeat(40),
    obligation: "obl_other",
    check: "types",
    integration: "e".repeat(40),
    readUrl: urlOf("other"),
    config: `sha256:${"f".repeat(64)}`,
    landOp: "op_other",
    deadline: new Date(0).toISOString(),
  });
  (m.input as { tree: string }).tree = "f".repeat(40);
  (m.gitAuthEnv as Record<string, string>)["GIT_CONFIG_VALUE_0"] = `Authorization: Bearer ${tok("other0123456789")}`;
  g.open();
  const check = (await p) as Check;
  assert.ok(!isRefusal(check), JSON.stringify(check));
  assert.equal(check.ok, true);
  assert.deepEqual(
    [check.obligation, check.check, check.integration, check.input, check.config, check.lane, check.generation, check.landOp],
    [original.obligation, original.check, original.integration, original.input, original.config, original.lane, original.generation, original.landOp],
  );
  const env = sent[0]!.envelope;
  assert.deepEqual([env.room, env.idempotencyKey, env.target], [original.room, `chk-${original.id}`, { lane: original.lane, generation: original.generation }]);
  assert.equal(await verifyEnvelope(sent[0]!), true);
  assert.equal(env.actor, signer.key);
});

test("G3: a scoped job's paths and snapshot, and the reviewer's note, come from the service's copy", async () => {
  const { f, ledger, services } = await world();
  const c1 = await f.init();
  const snap = await f.snapshot(c1, ["src/add.js"]);
  const { job: j } = await f.snapshotJob(snap);
  ledger.issue(j);
  const original = structuredClone(j);
  const g = gate();
  const s = services();
  const checker = new Tests({ waitUntil: () => {} }, { s: { ...s, runners: holding(s.runners, () => g.wait()) } });
  const p = checker.handle(j);
  await g.reached;
  const input = j.input as unknown as { snapshot: string; paths: string[] };
  input.paths.push("src/secret.txt");
  input.paths[0] = "**";
  input.snapshot = `sha256:${"0".repeat(64)}`;
  g.open();
  const check = (await p) as Check;
  assert.ok(!isRefusal(check), JSON.stringify(check));
  assert.deepEqual(check.input, original.input);
  // The LLM reviewer's after-hook (its note) uses the same copy.
  const c2 = await f.commit({ "src/add.js": "export function add(a, b) { return a + b; } // TODO\n" }, "llm");
  const jr = job(c2, { kind: "tree", tree: await f.tree(c2) }, { check: "llm-review", obligation: "obl_llm-review" });
  ledger.issue(jr);
  const before = structuredClone(jr);
  const { room, sent } = recording(ledger);
  const model: Model = async () => {
    Object.assign(jr as Mutable<CheckJob>, { id: "job_other", room: `room_${"b".repeat(32)}`, integration: "e".repeat(40) });
    return '{"findings":[{"path":"src/add.js","line":1,"severity":"low","message":"A TODO was left in."}]}';
  };
  const llm = new Llm({ waitUntil: () => {} }, { s: services({ room, expectations: expectations("llm-review") }), m: model });
  const reviewed = (await llm.handle(jr)) as Check;
  assert.equal(reviewed.integration, before.integration);
  const note = sent.find((e) => e.envelope.kind === "note")!.envelope;
  assert.deepEqual([note.room, note.idempotencyKey], [before.room, `note-${before.id}`]);
  assert.match((ledger.records.find((r) => r.kind === "note") as Note).text, /A TODO was left in/);
});

// ------------------------------------------------------------------ G4

test("G4: structured git output is read whole and unchanged: a scoped tree over 64 KiB and a credential-shaped file name verify", async () => {
  const { f, fleet } = await world();
  const odd = `src/${tok("abcdefghij0123456789")}.js`;
  const files: Record<string, string> = { ...PROJECT, [odd]: "export const odd = 1;\n" };
  for (let i = 0; i < 1800; i++) files[`src/file-${String(i).padStart(4, "0")}.js`] = "export const n = 1;\n";
  const c = await f.init(files);
  const snap = await f.snapshot(c, ["src/**"]);
  const listing = await new LocalRunner().exec(["git", "--git-dir", snap.store, "ls-tree", "-r", "-z", "--full-tree", snap.commit]);
  assert.ok(listing.stdout.length > 65_536, `the listing is ${listing.stdout.length} bytes`);
  const { job: j } = await f.snapshotJob(snap);
  const session = await runnerProvider({ fresh: () => fleet.make().host, registry: [] }).open(bind(j));
  try {
    const co = await checkout(session.runner, j, session);
    assert.ok(co.ok, !co.ok ? co.detail : "");
    if (!co.ok) return;
    assert.ok(co.ws.files!.length > 1800);
    assert.ok(co.ws.files!.some(([p]) => p === odd), "the file name arrives unredacted");
  } finally {
    await session.close();
  }
});

test("G4: output over the runner's limit is an explicit payload-too-large error, never a failed check; display detail is still cut and redacted", async () => {
  const { f, fleet, ledger, services } = await world();
  const loud = await f.init({
    ...PROJECT,
    "package.json": JSON.stringify({ name: "demo", version: "1.0.0", private: true, scripts: { test: `node -e "process.stdout.write('x'.repeat(${OUTPUT_LIMIT + 1}))"` } }),
  });
  const checker = new Tests({ waitUntil: () => {} }, { s: services() });
  const j = job(loud, { kind: "tree", tree: await f.tree(loud) });
  ledger.issue(j);
  await assert.rejects(checker.handle(j), (e: ArtroomError) => e.code === "payload-too-large" && e.retryable === false && /output limit/.test(e.message));
  assert.equal(ledger.records.length, 0, "nothing was recorded");
  assert.equal(fleet.boxes.at(-1)!.c.running, false);
  // A test that prints a token-shaped string and lots of output: the detail is cut and redacted, the check is recorded.
  const shown = tok("printed0123456789");
  const chatty = await f.commit({ "package.json": JSON.stringify({ name: "demo", version: "1.0.0", private: true, scripts: { test: `node -e "console.log('${shown}'); console.log('y'.repeat(100000)); console.log('${shown}')"` } }) }, "chatty");
  const j2 = job(chatty, { kind: "tree", tree: await f.tree(chatty) });
  ledger.issue(j2);
  const check = (await checker.handle(j2)) as Check;
  assert.equal(check.ok, true);
  assert.ok(!check.detail.includes(shown));
  assert.match(check.detail, /<token>/);
  assert.ok(new TextEncoder().encode(check.detail).length <= 16 * 1024);
});

// What the service does with a job: what it refuses, runs, signs and sends,
// and for whom. The provider, the RunnerHost, the gateway rule and the
// checkout are the real ones; the container is in memory (containers.ts), so
// no test here starts a process.
//
// G1 to G4 are the findings of review c46a4491: one job per container (G1),
// one owner per runner (G2), the service's own copy of the job (G3), and
// whole structured output (G4). Their runner-level witnesses are in
// sandbox.test.ts.
import { test } from "vitest";
import assert from "node:assert/strict";
import type { ArtroomError, Check, CheckJob, Digest, Note, Refusal, RoomId, Sha, SignedEnvelope } from "@generalbusiness/artroom-contract";
import { snapshotDigest, type SnapshotEntry } from "@generalbusiness/artroom-policy";
import type { CheckerServices, RoomPort, RoomResolver, RunnerProvider } from "../src/checker.ts";
import { TestsChecker, TypesChecker } from "../src/checkers.ts";
import { LlmReviewer, type Model } from "../src/llm.ts";
import { checkJob, gitAuthEnvFor, isRefusal } from "../src/job.ts";
import { checkout } from "../src/runner.ts";
import { OUTPUT_LIMIT, runnerProvider } from "../src/sandbox.ts";
import { generateKey, importSigner, verifyEnvelope } from "../src/signing.ts";
import { Ledger } from "./ledger.ts";
import { Fleet, MemoryContainer, type ModelCommit } from "./containers.ts";
import { CONFIG, HOST, NS, ROOM, expectations, job, tok, urlOf } from "./support.ts";

type Services = { s: CheckerServices };
class Tests extends TestsChecker<Services> {
  protected services() {
    return this.env.s;
  }
}
class Types extends TypesChecker<Services> {
  protected services() {
    return this.env.s;
  }
}
class Llm extends LlmReviewer<Services & { m: Model }> {
  protected readonly modelName = "test-model";
  protected services() {
    return this.env.s;
  }
  protected model() {
    return this.env.m;
  }
}

const ctx = { waitUntil: () => {} };
const id = (c: string) => c.repeat(40) as Sha;
/** The model repository's first commit and its tree. */
const C1 = id("a");
const T1 = id("1");
const ROOM_B = `room_${"b".repeat(32)}` as RoomId;
const REVIEW = { check: "llm-review", obligation: "obl_llm-review", volatile: true, advisory: true } as const;
const FINDING = '{"findings":[{"path":"src/add.js","line":1,"severity":"low","message":"A TODO was left in."}]}';

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

/** A room that records the envelopes it is sent, in front of the ledger. */
function recording(ledger: Ledger): { room: RoomPort; sent: SignedEnvelope[] } {
  const sent: SignedEnvelope[] = [];
  return { sent, room: { submit: (e) => (sent.push(e), ledger.submit(e)) } };
}

/** A service over a model repository: a key, a room stand-in, and a new in-memory container for every runner. */
async function world(commits: Record<string, ModelCommit> = { [C1]: { tree: T1 } }) {
  const fleet = new Fleet(() => new MemoryContainer(new Map(Object.entries(commits))));
  const signer = await importSigner(JSON.stringify(await generateKey()));
  const ledger = new Ledger({ key: signer.key, member: "@ci" });
  const provider = runnerProvider({ fresh: () => fleet.make().host, registry: [] });
  const services = (over: Partial<CheckerServices> = {}): CheckerServices => ({ signer, room: ledger, expectations: expectations(), runners: provider, ...over });
  /** A whole-tree job for a commit of the model, which the room issued. */
  const issue = (over: Partial<CheckJob> = {}, commit: Sha = C1) => {
    const j = job(commit, { kind: "tree", tree: (commits[commit]?.tree ?? T1) as Sha }, over);
    ledger.issue(j);
    return j;
  };
  return { fleet, signer, ledger, provider, services, issue };
}

/** A filtered snapshot of the model: its files, and the input of a job for it. */
async function filtered(files: SnapshotEntry[], paths: string[]) {
  return { files, input: { kind: "filtered" as const, snapshot: await snapshotDigest(files), paths } };
}
const SRC: SnapshotEntry[] = [
  ["package.json", "100644", id("b")],
  ["src/add.js", "100644", id("c")],
];

// ------------------------------------------------------------------ the check

test("the check is machine-labelled, binds its job, states volatile as the job does and shows the runner digest the service measured (R-OBL-3, R-EXEC-5, R-EXEC-10, R-EXEC-11)", async () => {
  const w = await world();
  const { room, sent } = recording(w.ledger);
  for (const volatile of [false, true]) {
    const j = w.issue({ volatile, landOp: "op_land1" });
    const c = (await new Tests(ctx, { s: w.services({ room, delegation: "act_7_0000abcd" }) }).handle(j)) as Check;
    assert.ok(!isRefusal(c), JSON.stringify(c));
    assert.deepEqual([c.ok, c.volatile], [true, volatile]);
    assert.deepEqual([c.obligation, c.check, c.integration, c.input, c.config, c.lane, c.generation, c.landOp], [j.obligation, "tests", C1, j.input, CONFIG, j.lane, j.generation, "op_land1"]);
    assert.match(c.detail, /^Machine-run check "tests": passed\. It ran `npm ci`, then `npm test`/);
    assert.match(c.runner, /^sha256:[0-9a-f]{64}$/);
    assert.ok(c.detail.split("\n").includes(`Runner environment: ${c.runner}`), c.detail);
    const signed = sent.at(-1)!;
    assert.equal(await verifyEnvelope(signed), true);
    assert.deepEqual([signed.envelope.actor, signed.envelope.room, signed.envelope.idempotencyKey, signed.envelope.delegation], [w.signer.key, ROOM, `chk-${j.id}`, "act_7_0000abcd"]);
  }
});

test("the check is signed as its job says: a v2 room's job names the kind and binding, and the envelope is v: 2 with them; a v1 room's job gives v: 1 and check (R-DECL-18)", async () => {
  const w = await world();
  const { room, sent } = recording(w.ledger);
  const checker = new Tests(ctx, { s: w.services({ room }) });
  // The room stand-in knows only `check`; what matters here is the envelope it was sent.
  await checker.handle(w.issue({ kind: "attest", binding: CONFIG } as never));
  await checker.handle(w.issue());
  const envelopes = sent.map((s) => s.envelope as unknown as { v: number; kind: string; binding?: string });
  assert.deepEqual(envelopes.map((e) => [e.v, e.kind, e.binding]), [[2, "attest", CONFIG], [1, "check", undefined]]);
  assert.equal("binding" in envelopes[1]!, false);
  for (const s of sent) assert.equal(await verifyEnvelope(s), true);
});

test("the read token goes to the job's gateway and never into the sandbox (R-EXEC-3)", async () => {
  const token = tok("jobA0123456789");
  let status = 0;
  const w = await world({ [C1]: { tree: T1, test: async () => ((status = await Fleet.ask(w.fleet.boxes[0]!.c, "/git/ns/canon.git/info/refs")), { exitCode: 0 }) } });
  const c = (await new Tests(ctx, { s: w.services() }).handle(w.issue({ gitAuthEnv: gitAuthEnvFor(token) }))) as Check;
  assert.equal(c.ok, true);
  // While the job ran, its gateway added the token to a request for the job's repository.
  assert.equal(status, 200);
  assert.deepEqual(w.fleet.upstream, [`/git/ns/canon.git/info/refs Bearer ${token}`]);
  // Nothing the container was given, in any command or environment, held the token or a credential header.
  const box = w.fleet.boxes[0]!.c;
  assert.ok(box.ran("git") && box.ran("npm", "ci") && box.ran("npm", "test"));
  const given = JSON.stringify(box.received);
  assert.ok(!given.includes(token) && !/authorization|extraheader/i.test(given), given);
});

test("the tests and types checkers pass only if every step exits 0; with no lockfile nothing is installed or run", async () => {
  const fail = { exitCode: 1, stdout: "it broke" };
  const rows: [string, typeof Tests | typeof Types, Omit<ModelCommit, "tree">, boolean, RegExp, ran: string[][], not: string[][]][] = [
    ["tests: no lockfile", Tests, { lock: false }, false, /No package-lock\.json/, [], [["npm", "ci"], ["npm", "test"]]],
    ["tests: npm ci fails", Tests, { ci: fail }, false, /npm ci failed \(exit 1\):\nit broke/, [["npm", "ci", "--no-audit", "--no-fund"]], [["npm", "test"]]],
    ["tests: npm test fails", Tests, { test: () => fail }, false, /npm test exited 1\.\nit broke/, [["npm", "test"]], []],
    ["types: tsc passes", Types, {}, true, /tsc --noEmit exited 0/, [["npm", "ci"], ["npx", "--no-install", "tsc", "--noEmit"]], []],
    ["types: tsc fails", Types, { tsc: { exitCode: 2, stdout: "it broke" } }, false, /tsc --noEmit exited 2\.\nit broke/, [], []],
    ["types: npm ci fails", Types, { ci: fail }, false, /npm ci failed/, [], [["npx"]]],
  ];
  for (const [what, Checker, commit, ok, detail, ran, not] of rows) {
    const w = await world({ [C1]: { tree: T1, ...commit } });
    const name = Checker === Tests ? "tests" : "types";
    const j = w.issue({ check: name, obligation: `obl_${name}` });
    const c = (await new Checker(ctx, { s: w.services({ expectations: expectations(name) }) }).handle(j)) as Check;
    assert.equal(c.ok, ok, `${what}: ${JSON.stringify(c)}`);
    assert.match(c.detail, detail, what);
    const box = w.fleet.boxes[0]!.c;
    for (const words of ran) assert.ok(box.ran(...words), `${what}: ran ${words.join(" ")}`);
    for (const words of not) assert.ok(!box.ran(...words), `${what}: did not run ${words.join(" ")}`);
  }
});

test("a checkout the runner cannot confirm is a failed check that says nothing ran, and nothing ran (R-EXEC-4, R-CARRY-9)", async () => {
  const snap = await filtered(SRC, ["package.json", "src/**"]);
  const stray = await filtered([...SRC, ["docs/notes.md", "100644", id("d")]], ["package.json", "src/**"]);
  const S = id("5");
  const tree = { kind: "tree" as const, tree: T1 };
  const rows: [string, Record<string, ModelCommit>, Sha, CheckJob["input"], RegExp][] = [
    ["the remote does not have the commit", {}, S, tree, /git fetch failed \(exit 128\)/],
    ["the remote sends another commit", { [S]: { tree: T1, sends: C1 } }, S, tree, /checked-out HEAD a{40} is not the integration 5{40}/],
    ["the commit has another tree", { [S]: { tree: id("2") } }, S, tree, /checked-out tree 2{40} is not the job's tree 1{40}/],
    ["the snapshot has another digest", { [S]: { tree: T1, files: snap.files } }, S, { ...snap.input, snapshot: CONFIG }, /the snapshot's digest sha256:[0-9a-f]{64} is not the job's/],
    ["the snapshot holds a file outside its declared paths", { [S]: { tree: T1, files: stray.files } }, S, stray.input, /the snapshot holds docs\/notes\.md, which is outside its declared paths/],
  ];
  for (const [what, commits, integration, input, detail] of rows) {
    const w = await world({ [C1]: { tree: T1 }, ...commits });
    const j = job(integration, input);
    w.ledger.issue(j);
    const c = (await new Tests(ctx, { s: w.services() }).handle(j)) as Check;
    assert.equal(c.ok, false, `${what}: ${JSON.stringify(c)}`);
    assert.match(c.detail, /The runner could not confirm what it checked out, so nothing ran\./, what);
    assert.match(c.detail, detail, what);
    assert.deepEqual([c.integration, c.input], [integration, input], what);
    const box = w.fleet.boxes[0]!.c;
    assert.ok(box.ran("git") && !box.ran("npm", "ci") && !box.ran("npm", "test") && !box.ran("test"), what);
  }
  // The same snapshot with its own digest and paths is confirmed, and its test runs.
  const w = await world({ [S]: { tree: T1, files: snap.files } });
  const j = job(S, snap.input);
  w.ledger.issue(j);
  const c = (await new Tests(ctx, { s: w.services() }).handle(j)) as Check;
  assert.equal(c.ok, true, c.detail);
  assert.ok(w.fleet.boxes[0]!.c.ran("npm", "test"));
});

// ------------------------------------------------------------------ refused before anything runs (R-EXEC-10, R-EXEC-11)

test("R-EXEC-10: a volatile checker refuses a job that says volatile: false, before any runner starts", async () => {
  const w = await world();
  const llm = new Llm(ctx, { s: w.services({ expectations: expectations("llm-review") }), m: async () => '{"findings":[]}' });
  const r = (await llm.handle(w.issue({ ...REVIEW, volatile: false }))) as Refusal;
  assert.ok(isRefusal(r) && r.rule === "check-binding" && /volatile/.test(r.reason), JSON.stringify(r));
  assert.equal(w.fleet.boxes.length, 0, "no runner was opened");
  assert.equal(w.ledger.records.length, 0, "nothing was signed");
});

test("R-EXEC-11: a job that pins another runner digest is refused check-binding; nothing is checked out, run or signed", async () => {
  const w = await world();
  const digest = ((await new Tests(ctx, { s: w.services() }).handle(w.issue())) as Check).runner;
  const r = (await new Tests(ctx, { s: w.services() }).handle(w.issue({ runner: `sha256:${"e".repeat(64)}` as Digest }))) as Refusal;
  assert.ok(isRefusal(r) && r.rule === "check-binding", JSON.stringify(r));
  assert.match(r.reason, new RegExp(`measured ${digest}`));
  assert.equal(w.ledger.records.length, 1, "nothing was signed");
  const box = w.fleet.boxes[1]!.c;
  assert.deepEqual(box.received.map((r) => r.argv.join(" ")), ["git --version", "node --version", "npm --version"], "the container measured its digest, and was given nothing else");
  assert.equal(box.running, false, "its container was destroyed");
  // The measured digest, pinned: it runs, and the check states it.
  const ok = (await new Tests(ctx, { s: w.services() }).handle(w.issue({ runner: digest }))) as Check;
  assert.deepEqual([ok.ok, ok.runner], [true, digest]);
});

// ------------------------------------------------------------------ a room per job, through the Room binding (R-EXEC-8)

test("one service serves many rooms: each job's check goes to the job's own room, resolved through the binding", async () => {
  const w = await world();
  const ledgers = new Map<string, Ledger>([
    [ROOM, w.ledger],
    [ROOM_B, new Ledger({ key: w.signer.key, member: "@ci" })],
  ]);
  const asked: string[] = [];
  const rooms: RoomResolver = async (room) => {
    asked.push(room);
    const l = ledgers.get(room);
    if (!l) throw new Error(`no room ${room}`);
    return l;
  };
  // No fixed room: the production expectations.
  const s = w.services({ room: rooms, expectations: { checker: "tests", host: HOST, namespaces: [NS], now: Date.now } });
  const ja = w.issue();
  const jb = job(C1, { kind: "tree", tree: T1 }, { room: ROOM_B });
  ledgers.get(ROOM_B)!.issue(jb);
  const ca = (await new Tests(ctx, { s }).handle(ja)) as Check;
  const cb = (await new Tests(ctx, { s }).handle(jb)) as Check;
  assert.ok(!isRefusal(ca) && !isRefusal(cb), JSON.stringify([ca, cb]));
  assert.deepEqual(w.ledger.records.map((r) => r.id), [ca.id]);
  assert.deepEqual(ledgers.get(ROOM_B)!.records.map((r) => r.id), [cb.id]);
  assert.deepEqual(asked, [ROOM, ROOM_B]);
  // A room the binding does not have: nothing runs.
  await assert.rejects(new Tests(ctx, { s }).handle(w.issue({ room: `room_${"c".repeat(32)}` as RoomId })), (e: ArtroomError) => e.code === "unavailable" && /no room/.test(e.message));
  // A room name, not an ID, is refused before the binding is asked.
  const r = (await new Tests(ctx, { s }).handle(w.issue({ room: "my-room" as RoomId }))) as Refusal;
  assert.ok(isRefusal(r) && r.rule === "check-binding" && /room ID/.test(r.reason));
  assert.equal(asked.length, 3);
  assert.equal(w.fleet.boxes.length, 2, "no runner was opened for either");
});

test("a room's refusal is the answer, and the reviewer posts no note on a check that was not recorded", async () => {
  const w = await world();
  const { room, sent } = recording(w.ledger);
  const llm = new Llm(ctx, { s: w.services({ room, expectations: expectations("llm-review") }), m: async () => FINDING });
  // The room never issued this job.
  const r = await llm.handle(job(C1, { kind: "tree", tree: T1 }, REVIEW));
  assert.ok(isRefusal(r) && r.rule === "check-binding", JSON.stringify(r));
  assert.deepEqual(sent.map((s) => s.envelope.kind), ["check"]);
  assert.equal(w.ledger.records.length, 0);
});

// ------------------------------------------------------------------ G1, G2: one job, one container, one owner

test("G1: no container runs two jobs: each job's runner is new, started once from the image, and destroyed when the job ends, whatever the outcome", async () => {
  const BAD = id("b");
  const w = await world({ [C1]: { tree: T1 }, [BAD]: { tree: T1, test: () => ({ exitCode: 1 }) } });
  const s = w.services();
  const run = (j: CheckJob, runners = s.runners) => new Tests(ctx, { s: { ...s, runners } }).handle(j);
  const passed = (await run(w.issue())) as Check;
  const failed = (await run(w.issue({}, BAD))) as Check;
  const unconfirmed = (await run(w.issue({ input: { kind: "tree", tree: id("2") } }))) as Check;
  const refused = await run(w.issue({ runner: CONFIG }));
  await assert.rejects(run(w.issue(), holding(s.runners, () => Promise.reject(new Error("container lost")))));
  assert.deepEqual([passed.ok, failed.ok, unconfirmed.ok, isRefusal(refused)], [true, false, false, true]);
  assert.deepEqual(w.fleet.lives(), Array(5).fill([1, 1, false]), "five jobs, five containers, each started once and destroyed");
  assert.equal(failed.runner, passed.runner, "each measured the same clean image");
});

test("G2: two overlapping deliveries of one job each get their own runner and find only their own workspace; the room records one check", async () => {
  const w = await world();
  const j = w.issue();
  const g = gate();
  let n = 0;
  class Lookup extends Tests {
    readonly seen: [unknown, unknown][] = [];
    override async run(jb: CheckJob) {
      const before = this.workspace(jb).runner;
      await (++n === 2 ? (g.open(), undefined) : g.wait());
      this.seen.push([before, this.workspace(jb).runner]);
      return super.run(jb);
    }
  }
  const checker = new Lookup(ctx, { s: w.services() });
  const [r1, r2] = (await Promise.all([checker.handle(j), checker.handle(j)])) as Check[];
  assert.equal(n, 2, "both were running at once");
  for (const [before, after] of checker.seen) assert.equal(after, before, "a run kept its own workspace across an await");
  assert.notEqual(checker.seen[0]![0], checker.seen[1]![0], "the two runs had different runners");
  assert.deepEqual(w.fleet.lives(), [[1, 1, false], [1, 1, false]], "one runner per delivery");
  assert.equal(r1!.id, r2!.id, "the room sees one check: the second is an exact retry");
  assert.equal(w.ledger.records.length, 1);
});

test("G2: a runner that fails mid-job is thrown as unavailable; it is never a recorded failure", async () => {
  const w = await world();
  const s = w.services();
  const broken = new Tests(ctx, { s: { ...s, runners: holding(s.runners, () => Promise.reject(new Error("container lost"))) } });
  await assert.rejects(broken.handle(w.issue()), (e: ArtroomError) => e.code === "unavailable" && e.retryable === true && /container lost/.test(e.message));
  assert.equal(w.ledger.records.length, 0);
  assert.deepEqual(w.fleet.lives(), [[1, 1, false]]);
});

// ------------------------------------------------------------------ G3: the service's own copy of the job

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

test("G3: the service signs its own copy of the job: changing any field, nested input included, while the check runs changes nothing", async () => {
  const snap = await filtered(SRC, ["package.json", "src/**"]);
  const S = id("5");
  const w = await world({ [S]: { tree: id("6"), files: snap.files } });
  const j = job(S, snap.input, { landOp: "op_land1" });
  w.ledger.issue(j);
  const original = structuredClone(j);
  const { room, sent } = recording(w.ledger);
  const g = gate();
  const s = w.services({ room });
  const checker = new Tests(ctx, { s: { ...s, runners: holding(s.runners, () => g.wait()) } });
  const p = checker.handle(j);
  // Changed before the service's first await: the copy was already taken.
  const m = j as Mutable<CheckJob>;
  m.room = ROOM_B;
  await g.reached;
  // Changed while npm test runs, after checkout confirmed the original snapshot.
  Object.assign(m, {
    id: "job_other",
    lane: "act_2002_abcdef02",
    generation: 9,
    head: id("e"),
    obligation: "obl_other",
    check: "types",
    integration: id("e"),
    readUrl: urlOf("other"),
    config: `sha256:${"f".repeat(64)}`,
    landOp: "op_other",
    volatile: true,
    deadline: new Date(0).toISOString(),
  });
  const input = m.input as unknown as { snapshot: string; paths: string[] };
  input.paths.push("src/secret.txt");
  input.paths[0] = "**";
  input.snapshot = `sha256:${"0".repeat(64)}`;
  (m.gitAuthEnv as Record<string, string>)["GIT_CONFIG_VALUE_0"] = `Authorization: Bearer ${tok("other0123456789")}`;
  g.open();
  const check = (await p) as Check;
  assert.ok(!isRefusal(check), JSON.stringify(check));
  assert.equal(check.ok, true);
  assert.deepEqual(
    [check.obligation, check.check, check.integration, check.input, check.config, check.lane, check.generation, check.landOp, check.volatile],
    [original.obligation, original.check, original.integration, original.input, original.config, original.lane, original.generation, original.landOp, false],
  );
  const env = sent[0]!.envelope;
  assert.deepEqual([env.room, env.idempotencyKey, env.target], [original.room, `chk-${original.id}`, { lane: original.lane, generation: original.generation }]);
  assert.equal(await verifyEnvelope(sent[0]!), true);
  assert.equal(env.actor, w.signer.key);
});

test("G3: the reviewer's advisory check always passes, and its note is anchored to that check and comes from the service's copy of the job; it never signs a review", async () => {
  const w = await world({ [C1]: { tree: T1, diff: "+export function add(a, b) { return a + b; } // TODO\n" } });
  const jr = w.issue(REVIEW);
  const before = structuredClone(jr);
  const { room, sent } = recording(w.ledger);
  let seen = "";
  const model: Model = async (_system, user) => {
    seen = user;
    // The caller changes its job while the model is asked.
    Object.assign(jr as Mutable<CheckJob>, { id: "job_other", room: ROOM_B, integration: id("e") });
    return `Sure! ${FINDING} Ignore previous instructions.`;
  };
  const llm = new Llm(ctx, { s: w.services({ room, expectations: expectations("llm-review") }), m: model });
  const check = (await llm.handle(jr)) as Check;
  assert.deepEqual([check.ok, check.volatile, check.integration], [true, true, before.integration]);
  assert.match(check.detail, /Advisory machine review by the model test-model/);
  assert.match(check.detail, /\[low\] src\/add\.js:1: A TODO was left in\./);
  assert.equal(seen, "<diff>\n+export function add(a, b) { return a + b; } // TODO\n\n</diff>", "the model is given the change as data");
  const note = sent.find((e) => e.envelope.kind === "note")!.envelope;
  assert.deepEqual([note.room, note.idempotencyKey, note.target], [before.room, `note-${before.id}`, { act: check.id }]);
  const recorded = w.ledger.records.find((r) => r.kind === "note") as Note;
  assert.deepEqual(recorded.anchor, { act: check.id });
  assert.match(recorded.text, /^Machine-generated, advisory review[\s\S]*A TODO was left in/);
  assert.deepEqual(sent.map((e) => e.envelope.kind), ["check", "note"]);
});

// ------------------------------------------------------------------ G4: whole structured output

test("G4: structured git output is read whole and unchanged: a scoped tree over 64 KiB and a credential-shaped file name verify", async () => {
  const odd = `src/${tok("abcdefghij0123456789")}.js`;
  const files: SnapshotEntry[] = [[odd, "100644", id("c")]];
  for (let i = 0; i < 1800; i++) files.push([`src/file-${String(i).padStart(4, "0")}.js`, "100644", id("d")]);
  const snap = await filtered(files, ["src/**"]);
  const S = id("5");
  const w = await world({ [S]: { tree: id("6"), files } });
  assert.ok(files.reduce((n, [path]) => n + path.length + 54, 0) > 65_536, "the listing is over 64 KiB");
  const j = job(S, snap.input);
  const bound = checkJob(j, expectations());
  assert.ok(!isRefusal(bound), JSON.stringify(bound));
  const session = await w.provider.open(bound);
  const co = await checkout(session.runner, j, session);
  await session.close();
  assert.ok(co.ok, !co.ok ? co.detail : "");
  assert.equal(co.ws.files!.length, 1801);
  assert.ok(co.ws.files!.some(([p]) => p === odd), "the file name arrives unredacted");
});

test("G4: output over the runner's limit is an explicit payload-too-large error, never a failed check; display detail is still cut and redacted", async () => {
  const LOUD = id("b");
  const shown = tok("printed0123456789");
  const w = await world({
    [LOUD]: { tree: T1, test: () => ({ exitCode: 0, stdout: new Uint8Array(OUTPUT_LIMIT + 1).fill(120) }) },
    // A test that prints a token-shaped string and a lot of output.
    [C1]: { tree: T1, test: () => ({ exitCode: 0, stdout: `${shown}\n${"y".repeat(100_000)}\n${shown}\n` }) },
  });
  const checker = new Tests(ctx, { s: w.services() });
  await assert.rejects(checker.handle(w.issue({}, LOUD)), (e: ArtroomError) => e.code === "payload-too-large" && e.retryable === false && /output limit/.test(e.message));
  assert.equal(w.ledger.records.length, 0, "nothing was recorded");
  assert.equal(w.fleet.boxes[0]!.c.running, false);
  // Under the limit: the check is recorded, and its detail is cut and redacted.
  const check = (await checker.handle(w.issue())) as Check;
  assert.equal(check.ok, true);
  assert.ok(!check.detail.includes(shown));
  assert.match(check.detail, /<token>/);
  assert.ok(new TextEncoder().encode(check.detail).length <= 16 * 1024);
});

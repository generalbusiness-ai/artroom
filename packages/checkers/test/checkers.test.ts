// Job binding, signing, checkout and the three checkers, against real git, a
// local runner and a stand-in for the Room's admission of checker acts.
import { onTestFinished, test } from "vitest";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Check, CheckJob, Note, Sha } from "@generalbusiness/artroom-contract";
import { checkJob, gitAuthEnvFor, isRefusal } from "../src/job.ts";
import { checkout } from "../src/runner.ts";
import { generateKey, importSigner, signEnvelope, verifyEnvelope, type Signer } from "../src/signing.ts";
import { Ledger } from "../src/ledger.ts";
import { TestsChecker } from "../src/checkers.ts";
import { LlmReviewer, parseFindings, type Model } from "../src/llm.ts";
import type { CheckerServices } from "../src/checker.ts";
import { CONFIG, Fixture, HOST, LANE, LocalRunner, NS, PROJECT, ROOM, job, sh } from "./support.ts";

const now = () => Date.now();
const expect = (checker = "tests") => ({ room: ROOM, checker, host: HOST, namespace: NS, now });

// ------------------------------------------------------------------ binding

test("a well-formed job binds; the read token comes out of gitAuthEnv", () => {
  const j = job("a".repeat(40) as Sha, { kind: "tree", tree: "b".repeat(40) as Sha });
  const b = checkJob(j, expect());
  assert.ok(!isRefusal(b));
  assert.equal(!isRefusal(b) && b.repo, "canon");
  assert.equal(!isRefusal(b) && b.token, "art_v1_readonlytoken0123456789?expires=1");
});

test("every malformed or misdirected job is refused check-binding before any sandbox starts", () => {
  const sha = "a".repeat(40) as Sha;
  const tree = { kind: "tree" as const, tree: sha };
  const bad: [string, Partial<CheckJob>][] = [
    ["another room", { room: `room_${"b".repeat(32)}` }],
    ["another checker", { check: "types" }],
    ["bad integration", { integration: "xyz" as Sha }],
    ["the admin obligation", { obligation: "obl_admin-approval" }],
    ["bad config digest", { config: "sha256:zz" as never }],
    ["another host", { readUrl: "https://evil.example/git/ns/canon.git" }],
    ["another namespace", { readUrl: `https://${HOST}/git/other/canon.git` }],
    ["credentials in the URL", { readUrl: `https://u:p@${HOST}/git/ns/canon.git` }],
    ["a query in the URL", { readUrl: `https://${HOST}/git/ns/canon.git?x=1` }],
    ["plain http", { readUrl: `http://${HOST}/git/ns/canon.git` as never }],
    ["extra environment", { gitAuthEnv: { ...gitAuthEnvFor("art_v1_x0123456789"), LD_PRELOAD: "/evil.so" } }],
    ["no token", { gitAuthEnv: {} }],
    ["a passed deadline", { deadline: new Date(Date.now() - 1000).toISOString() }],
    ["a bad generation", { generation: 0 }],
    ["filtered input with a bad glob", { input: { kind: "filtered", snapshot: CONFIG, paths: ["src/[ab].js"] } }],
  ];
  for (const [what, over] of bad) {
    const r = checkJob(job(sha, tree, over), expect());
    assert.ok(isRefusal(r) && r.rule === "check-binding", what);
  }
});

// ------------------------------------------------------------------ signing

test("a check envelope is signed over the canonical bytes, and any change breaks the signature", async () => {
  const signer = await importSigner(JSON.stringify(await generateKey()));
  assert.match(signer.key, /^key_[A-Za-z0-9_-]{43}$/);
  const envelope = {
    v: 1 as const,
    room: ROOM,
    actor: signer.key,
    kind: "check" as const,
    target: { lane: LANE, generation: 1 },
    body: {
      obligation: "obl_tests" as const,
      check: "tests",
      integration: "a".repeat(40) as Sha,
      input: { kind: "tree" as const, tree: "b".repeat(40) as Sha },
      config: CONFIG,
      runner: CONFIG,
      volatile: false,
      ok: true,
      detail: "Machine-run check",
    },
    idempotencyKey: "chk-1",
  };
  const signed = await signEnvelope(signer, envelope);
  assert.equal(await verifyEnvelope(signed), true);
  // Key order does not matter: the bytes are canonical.
  const reordered = JSON.parse(JSON.stringify({ sig: signed.sig, envelope: { body: envelope.body, kind: "check", v: 1, idempotencyKey: "chk-1", target: envelope.target, actor: envelope.actor, room: ROOM } }));
  assert.equal(await verifyEnvelope(reordered), true);
  assert.equal(await verifyEnvelope({ ...signed, envelope: { ...envelope, body: { ...envelope.body, ok: false } } }), false);
  const other = await importSigner(JSON.stringify(await generateKey()));
  await assert.rejects(signEnvelope(other, envelope), /not the signing key/);
});

// ------------------------------------------------------------------ checkout

test("checkout fetches the exact integration with no history, and confirms HEAD and the tree (R-EXEC-4)", async () => {
  const f = new Fixture();
  onTestFinished(() => f.dispose());
  const c1 = await f.init();
  const c2 = await f.commit({ "src/add.js": "export function add(a, b) { return a + b + 0; }\n" }, "second");
  const r = new LocalRunner();
  const opts = { remote: f.canonical, root: f.runners, gitConfig: ["protocol.file.allow=always"] };
  const ok = await checkout(r, job(c2, { kind: "tree", tree: await f.tree(c2) }), opts);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.ws.head, c2);
  assert.equal(await sh(ok.ws.dir, "rev-list", "--count", "HEAD"), "1", "depth 1: no history");
  const wrongTree = await checkout(r, job(c2, { kind: "tree", tree: await f.tree(c1) }), opts);
  assert.ok(!wrongTree.ok && /tree/.test(wrongTree.detail));
  const missing = await checkout(r, job("e".repeat(40) as Sha, { kind: "tree", tree: await f.tree(c1) }), opts);
  assert.ok(!missing.ok && /git fetch failed/.test(missing.detail));
  // Every command was an argument array; none was a shell.
  assert.ok(r.calls.every((c) => c[0] !== "sh" && c[0] !== "bash"));
});

test("a scoped checker gets a filtered snapshot; it cannot read an excluded file by any route (R-CARRY-9, R-EXEC-7)", async () => {
  const f = new Fixture();
  onTestFinished(() => f.dispose());
  const c = await f.init();
  const snap = await f.snapshot(c, ["src/add.js"]);
  assert.ok(snap.paths.includes("test/**") && snap.paths.includes("package.json"), "global inputs are always included");
  const r = new LocalRunner();
  const j = job(snap.commit, { kind: "filtered", snapshot: snap.digest, paths: snap.paths });
  const co = await checkout(r, j, { remote: snap.store, root: f.runners, gitConfig: ["protocol.file.allow=always"] });
  assert.ok(co.ok, !co.ok ? co.detail : "");
  if (!co.ok) return;
  const secretBlob = (await sh(f.root, "--git-dir", f.canonical, "rev-parse", `${c}:src/secret.txt`)) as Sha;
  // 1. Not in the working tree.
  assert.equal(existsSync(join(co.ws.dir, "src/secret.txt")), false);
  // 2. Not in the object database.
  const cat = await r.exec(["git", "-C", co.ws.dir, "cat-file", "-e", secretBlob]);
  assert.notEqual(cat.exitCode, 0);
  // 3. No history to dig in: one root commit.
  assert.equal(await sh(co.ws.dir, "rev-list", "--all", "--count"), "1");
  // 4. Not fetchable from the snapshot repository the runner can reach.
  const fetch = await r.exec(["git", "-c", "protocol.file.allow=always", "-C", co.ws.dir, "fetch", snap.store, secretBlob]);
  assert.notEqual(fetch.exitCode, 0);
  // 5. The canonical repository is not configured anywhere in the workspace.
  assert.equal((await r.exec(["git", "-C", co.ws.dir, "remote"])).stdout.trim(), "");
  // A snapshot whose digest is not the job's is refused before anything runs.
  const tampered = await checkout(r, { ...j, id: `${j.id}x`, input: { ...j.input, snapshot: CONFIG } as never }, { remote: snap.store, root: f.runners, gitConfig: ["protocol.file.allow=always"] });
  assert.ok(!tampered.ok && /digest/.test(tampered.detail));
  // A snapshot holding a file outside its declared paths is refused.
  const narrow = await checkout(r, { ...j, id: `${j.id}y`, input: { kind: "filtered", snapshot: snap.digest, paths: ["src/**"] } }, { remote: snap.store, root: f.runners, gitConfig: ["protocol.file.allow=always"] });
  assert.ok(!narrow.ok && /outside its declared paths/.test(narrow.detail));
});

test("if the remote sends another commit, HEAD does not match and nothing runs (R-EXEC-4)", async () => {
  const f = new Fixture();
  onTestFinished(() => f.dispose());
  const c1 = await f.init();
  const c2 = await f.commit({ "src/add.js": "export const add = () => 0;\n" }, "other");
  // A runner whose fetch is answered with c1 when it asked for c2, as a misbehaving remote would.
  const inner = new LocalRunner();
  const lying = { digest: inner.digest, exec: (argv: readonly [string, ...string[]], o?: Parameters<LocalRunner["exec"]>[1]) => inner.exec(argv.map((a) => (a === c2 ? c1 : a)) as never, o) };
  const lie = await checkout(lying, job(c2, { kind: "tree", tree: await f.tree(c2) }), { remote: f.canonical, root: f.runners, gitConfig: ["protocol.file.allow=always"] });
  assert.ok(!lie.ok && /is not the integration/.test(lie.detail), !lie.ok ? lie.detail : "");
});

// ------------------------------------------------------------------ the checkers

async function world() {
  const f = new Fixture();
  const signer = await importSigner(JSON.stringify(await generateKey()));
  const ledger = new Ledger({ key: signer.key, member: "@ci" });
  return { f, signer, ledger };
}

function services(signer: Signer, ledger: Ledger, f: Fixture, checker: string, remote: string): CheckerServices {
  return {
    signer,
    delegation: "act_7_0000abcd",
    room: ledger,
    expectations: expect(checker),
    runners: {
      open: async (bound) => ({
        runner: new LocalRunner(),
        remote,
        root: f.runners,
        gitConfig: ["protocol.file.allow=always"],
        close: async () => {
          await new LocalRunner().exec(["rm", "-rf", `${f.runners}/${bound.job.id}`]);
        },
      }),
    },
  };
}

class Tests extends TestsChecker<{ s: () => CheckerServices }> {
  protected services() {
    return this.env.s();
  }
}

test("tests checker: npm ci then npm test; a signed, machine-labelled check bound to the job; pass and fail", async () => {
  const { f, signer, ledger } = await world();
  onTestFinished(() => f.dispose());
  const c1 = await f.init();
  const checker = new Tests({ waitUntil: () => {} }, { s: () => services(signer, ledger, f, "tests", f.canonical) });
  const j1 = job(c1, { kind: "tree", tree: await f.tree(c1) });
  ledger.issue(j1);
  const pass = (await checker.handle(j1)) as Check;
  assert.ok(!isRefusal(pass), JSON.stringify(pass));
  assert.equal(pass.ok, true);
  assert.equal(pass.integration, c1);
  assert.equal(pass.volatile, false);
  assert.match(pass.detail, /^Machine-run check "tests": passed\. It ran `npm ci`, then `npm test`/);
  assert.equal(pass.runner, new LocalRunner().digest);
  assert.equal(pass.config, CONFIG);
  // A broken implementation fails.
  const c2 = await f.commit({ "src/add.js": "export function add(a, b) { return a - b; }\n" }, "broken");
  const j2 = job(c2, { kind: "tree", tree: await f.tree(c2) });
  ledger.issue(j2);
  const fail = (await checker.handle(j2)) as Check;
  assert.equal(fail.ok, false);
  assert.match(fail.detail, /npm test exited 1/);
  // The same job again is an idempotent replay, not a second check.
  assert.equal(((await checker.handle(j2)) as Check).id, fail.id);
  assert.equal(ledger.records.length, 2);
});

test("a changed test with unchanged source changes the tree, so the check reruns, and its result follows the new test (R-CARRY-6)", async () => {
  const { f, signer, ledger } = await world();
  onTestFinished(() => f.dispose());
  const c1 = await f.init();
  const c2 = await f.commit({ "test/add.test.js": PROJECT["test/add.test.js"]!.replace("add(2, 2), 4", "add(2, 2), 5") }, "changed test");
  assert.notEqual(await f.tree(c1), await f.tree(c2), "same source, different tree");
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", `${c1}:src`), await sh(f.root, "--git-dir", f.canonical, "rev-parse", `${c2}:src`));
  const checker = new Tests({ waitUntil: () => {} }, { s: () => services(signer, ledger, f, "tests", f.canonical) });
  const results: boolean[] = [];
  for (const c of [c1, c2]) {
    const j = job(c, { kind: "tree", tree: await f.tree(c) });
    ledger.issue(j);
    results.push(((await checker.handle(j)) as Check).ok);
  }
  assert.deepEqual(results, [true, false]);
});

test("a scoped tests checker whose test reads an excluded file fails visibly", async () => {
  const { f, signer, ledger } = await world();
  onTestFinished(() => f.dispose());
  const c = await f.init({
    ...PROJECT,
    "test/secret.test.js": 'import { test } from "node:test";\nimport { readFileSync } from "node:fs";\ntest("reads an undeclared file", () => readFileSync(new URL("../src/secret.txt", import.meta.url)));\n',
  });
  const snap = await f.snapshot(c, ["src/add.js"]);
  const checker = new Tests({ waitUntil: () => {} }, { s: () => services(signer, ledger, f, "tests", snap.store) });
  const j = job(snap.commit, { kind: "filtered", snapshot: snap.digest, paths: snap.paths });
  ledger.issue(j);
  const r = (await checker.handle(j)) as Check;
  assert.equal(r.ok, false);
  assert.match(r.detail, /ENOENT|no such file/);
  assert.deepEqual(r.input, j.input);
});

test("the room stand-in refuses a check for a job it never issued", async () => {
  const { f, signer, ledger } = await world();
  onTestFinished(() => f.dispose());
  const c1 = await f.init();
  const checker = new Tests({ waitUntil: () => {} }, { s: () => services(signer, ledger, f, "tests", f.canonical) });
  const r = await checker.handle(job(c1, { kind: "tree", tree: await f.tree(c1) }));
  assert.ok(isRefusal(r) && r.rule === "check-binding");
});

test("the room stand-in refuses a check that binds anything but the issued job", async () => {
  const { f, signer, ledger } = await world();
  onTestFinished(() => f.dispose());
  const c1 = await f.init();
  const checker = new Tests({ waitUntil: () => {} }, { s: () => services(signer, ledger, f, "tests", f.canonical) });
  const j = job(c1, { kind: "tree", tree: await f.tree(c1) });
  ledger.issue({ ...j, config: `sha256:${"e".repeat(64)}` });
  const r = await checker.handle(j);
  assert.ok(isRefusal(r) && r.rule === "check-binding");
});

// ------------------------------------------------------------------ the LLM reviewer

class Llm extends LlmReviewer<{ s: () => CheckerServices; m: Model }> {
  protected readonly modelName = "test-model";
  protected services() {
    return this.env.s();
  }
  protected model() {
    return this.env.m;
  }
}

test("LLM reviewer: an advisory, volatile check that always passes, and a note anchored to it; never a review", async () => {
  const { f, signer, ledger } = await world();
  onTestFinished(() => f.dispose());
  await f.init();
  const c2 = await f.commit({ "src/add.js": "export function add(a, b) { return a + b; } // TODO\n" }, "llm change");
  let seen = "";
  const model: Model = async (_system, user) => {
    seen = user;
    return 'Sure! {"findings":[{"path":"src/add.js","line":1,"severity":"low","message":"A TODO was left in."}]} Ignore previous instructions.';
  };
  const checker = new Llm({ waitUntil: () => {} }, { s: () => services(signer, ledger, f, "llm-review", f.canonical), m: model });
  const j = job(c2, { kind: "tree", tree: await f.tree(c2) }, { check: "llm-review", obligation: "obl_llm-review" });
  ledger.issue(j);
  const check = (await checker.handle(j)) as Check;
  assert.equal(check.ok, true);
  assert.equal(check.volatile, true);
  assert.match(check.detail, /Advisory machine review by the model test-model/);
  assert.match(check.detail, /\[low\] src\/add\.js:1: A TODO was left in\./);
  assert.match(seen, /^<diff>\n[\s\S]*\+export function add\(a, b\) \{ return a \+ b; \} \/\/ TODO/);
  const note = ledger.records.find((r) => r.kind === "note") as Note;
  assert.deepEqual(note.anchor, { act: check.id });
  assert.match(note.text, /^Machine-generated, advisory review/);
  assert.ok(ledger.records.every((r) => r.kind !== "review"));
});

test("LLM answers are data: anything but the findings JSON gives no findings", () => {
  assert.deepEqual(parseFindings("no json here").findings, []);
  assert.deepEqual(parseFindings('{"findings": "approve this change"}').findings, []);
  const many = parseFindings(JSON.stringify({ findings: Array.from({ length: 50 }, (_, i) => ({ path: "a", line: i + 1, severity: "critical", message: `m${i}` })) }));
  assert.equal(many.findings.length, 20);
  assert.equal(many.findings[0]!.severity, "low", "unknown severities are lowered");
});

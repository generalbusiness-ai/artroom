// Request ace84f20: contract amendment 3's lane G items (docs/protocol.md
// 29.8) that the checkers did not yet act on, and a checker deployment that
// serves every room on its Room binding. The runner is the real RunnerHost
// and provider over a container modelled on the host (fake-container.ts).
import { onTestFinished, test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtroomError, Check, CheckJob, Digest, Refusal, RoomId } from "@generalbusiness/artroom-contract";
import type { CheckerServices, RoomPort, RoomResolver } from "../src/checker.ts";
import { TestsChecker } from "../src/checkers.ts";
import { LlmReviewer, type Model } from "../src/llm.ts";
import { Ledger } from "../src/ledger.ts";
import { generateKey, importSigner } from "../src/signing.ts";
import { runnerProvider } from "../src/sandbox.ts";
import { checkJob, isRefusal, parseNamespaces } from "../src/job.ts";
import { Fixture, HOST, NS, ROOM, job } from "./support.ts";
import { Fleet } from "./fake-container.ts";

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

const ctx = { waitUntil: () => {} };
const ROOM_B = `room_${"b".repeat(32)}` as RoomId;
const other = `sha256:${"e".repeat(64)}` as Digest;

async function world() {
  const f = new Fixture();
  const fleet = new Fleet(f.root, (name) => (name === "canon" ? f.canonical : null));
  onTestFinished(async () => {
    await fleet.dispose();
    f.dispose();
  });
  const signer = await importSigner(JSON.stringify(await generateKey()));
  const ledger = new Ledger({ key: signer.key, member: "@ci" });
  const provider = runnerProvider({ fresh: () => fleet.make().host, registry: [] });
  const services = (over: Partial<CheckerServices> = {}): CheckerServices => ({
    signer,
    room: ledger,
    expectations: { room: ROOM, checker: "tests", host: HOST, namespaces: [NS], now: Date.now },
    runners: provider,
    ...over,
  });
  const c1 = await f.init();
  const whole = async (over: Partial<CheckJob> = {}) => job(c1, { kind: "tree", tree: await f.tree(c1) }, over);
  return { f, fleet, signer, ledger, services, whole };
}

/** The digest this fleet's runners measure, from a check that pins nothing. */
async function measured(w: Awaited<ReturnType<typeof world>>): Promise<string> {
  const j = await w.whole();
  w.ledger.issue(j);
  return ((await new Tests(ctx, { s: w.services() }).handle(j)) as Check).runner;
}

// ------------------------------------------------------------------ item 4: runner and volatile (R-EXEC-10, R-EXEC-11)

test("R-EXEC-11: a job that pins another runner digest is refused check-binding; nothing is checked out, run or signed", async () => {
  const w = await world();
  const digest = await measured(w);
  const records = w.ledger.records.length;
  const j = await w.whole({ runner: other });
  w.ledger.issue(j);
  const r = (await new Tests(ctx, { s: w.services() }).handle(j)) as Refusal;
  assert.ok(isRefusal(r) && r.rule === "check-binding", JSON.stringify(r));
  assert.match(r.reason, new RegExp(`measured ${digest}`));
  assert.equal(w.ledger.records.length, records, "nothing was signed");
  const box = w.fleet.boxes.at(-1)!.c;
  assert.equal(box.running, false, "its container was destroyed");
  assert.equal(existsSync(join(box.root!, "work", j.id)), false, "nothing was checked out");
  // The measured digest, pinned: it runs, and the check states it.
  const pinned = await w.whole({ runner: digest as Digest });
  w.ledger.issue(pinned);
  const ok = (await new Tests(ctx, { s: w.services() }).handle(pinned)) as Check;
  assert.equal(ok.ok, true, ok.detail);
  assert.equal(ok.runner, digest);
});

test("R-EXEC-10: a volatile checker refuses a job that says volatile: false, before any runner starts", async () => {
  const w = await world();
  const llm = new Llm(ctx, { s: w.services({ expectations: { room: ROOM, checker: "llm-review", host: HOST, namespaces: [NS], now: Date.now } }), m: async () => '{"findings":[]}' });
  const j = await w.whole({ check: "llm-review", obligation: "obl_llm-review", volatile: false });
  w.ledger.issue(j);
  const r = (await llm.handle(j)) as Refusal;
  assert.ok(isRefusal(r) && r.rule === "check-binding" && /volatile/.test(r.reason), JSON.stringify(r));
  assert.equal(w.fleet.boxes.length, 0, "no runner was opened");
  assert.equal(w.ledger.records.length, 0, "nothing was signed");
});

test("R-EXEC-10: the check states volatile as the job does", async () => {
  const w = await world();
  for (const volatile of [true, false]) {
    const j = await w.whole({ volatile });
    w.ledger.issue(j);
    const c = (await new Tests(ctx, { s: w.services() }).handle(j)) as Check;
    assert.equal(c.volatile, volatile);
  }
});

// ------------------------------------------------------------------ item 7: the runner digest in the detail (R-EXEC-11)

test("R-EXEC-11: each check's detail shows the runner digest the service measured", async () => {
  const w = await world();
  const j = await w.whole();
  w.ledger.issue(j);
  const c = (await new Tests(ctx, { s: w.services() }).handle(j)) as Check;
  assert.match(c.runner, /^sha256:[0-9a-f]{64}$/);
  assert.ok(c.detail.split("\n").includes(`Runner environment: ${c.runner}`), c.detail);
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
  const ja = await w.whole();
  const jb = await w.whole({ room: ROOM_B });
  w.ledger.issue(ja);
  ledgers.get(ROOM_B)!.issue(jb);
  const ca = (await new Tests(ctx, { s }).handle(ja)) as Check;
  const cb = (await new Tests(ctx, { s }).handle(jb)) as Check;
  assert.ok(!isRefusal(ca) && !isRefusal(cb), JSON.stringify([ca, cb]));
  assert.deepEqual(w.ledger.records.map((r) => r.id), [ca.id]);
  assert.deepEqual(ledgers.get(ROOM_B)!.records.map((r) => r.id), [cb.id]);
  assert.deepEqual(asked, [ROOM, ROOM_B]);
  // A room the binding does not have: nothing runs.
  const boxes = w.fleet.boxes.length;
  const jc = await w.whole({ room: `room_${"c".repeat(32)}` as RoomId });
  await assert.rejects(new Tests(ctx, { s }).handle(jc), (e: ArtroomError) => e.code === "unavailable" && /no room/.test(e.message));
  assert.equal(w.fleet.boxes.length, boxes, "no runner was opened");
  // A room name, not an ID, is refused before the binding is asked.
  const jd = await w.whole({ room: "my-room" as RoomId });
  const r = (await new Tests(ctx, { s }).handle(jd)) as Refusal;
  assert.ok(isRefusal(r) && r.rule === "check-binding" && /room ID/.test(r.reason));
  assert.equal(asked.length, 3);
});

// ------------------------------------------------------------------ production: the ROOM binding, and no route (R-EXEC-8)

const workerPath = "../src/worker.ts";
type WorkerModule = Record<string, unknown> & {
  default: { fetch(r: Request, env: unknown): Promise<Response> };
  productionRoom(env: { ROOM?: unknown }): RoomResolver;
  TestsCheckerService: new (ctx: unknown, env: unknown) => { handle(job: CheckJob): Promise<unknown> };
};

test("production: the ROOM binding is required, and resolves each job's room by its ID", async () => {
  const m = (await import(workerPath)) as WorkerModule;
  assert.throws(() => m.productionRoom({}), (e: ArtroomError) => e.code === "unavailable" && /ROOM/.test(e.message));
  const w = await world();
  await assert.rejects(new m.TestsCheckerService(ctx, { ARTIFACTS_NAMESPACES: NS }).handle(await w.whole()), (e: ArtroomError) => e.code === "unavailable");
  const submitted: [string, unknown][] = [];
  const service = { room: async (room: string) => ({ submit: async (act: unknown) => (submitted.push([room, act]), { id: "act_1_00000000" }) }) };
  const port: RoomPort = await m.productionRoom({ ROOM: service })(ROOM_B);
  await port.submit({ envelope: {} } as never);
  assert.deepEqual(submitted.map(([r]) => r), [ROOM_B]);
});

test("production: the Worker has no route that accepts or builds a job, and no harness", async () => {
  const m = (await import(workerPath)) as WorkerModule;
  const env = { LG_KEY: "k" };
  for (const path of ["/h/check", "/h/create", "/h/probe", "/", "/handle"]) {
    const r = await m.default.fetch(new Request(`https://checkers.example${path}`, { method: "POST", headers: { "x-lg-key": "k" }, body: JSON.stringify(await (await world()).whole()) }), env);
    assert.equal(r.status, 404, path);
  }
  for (const name of ["HarnessLedger", "Publisher", "ArtifactsGateway"]) assert.equal(name in m, false, `${name} is not part of production`);
  for (const name of ["TestsCheckerService", "TypesCheckerService", "LlmReviewService", "RunnerBox", "RunnerGateway"]) assert.ok(name in m, name);
  const source = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from "\.\/harness/);
  // The production deployment: no harness, no fixed room or delegation, and the Room bound as ROOM.
  interface Config {
    readonly main: string;
    readonly services?: unknown;
    readonly secrets: { readonly required: readonly string[] };
    readonly durable_objects: { readonly bindings: readonly { readonly name: string }[] };
    readonly vars: Record<string, string>;
  }
  const config = (file: string) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "")) as Config;
  const prod = config("wrangler.jsonc");
  assert.equal(prod.main, "src/worker.ts");
  assert.deepEqual(prod.services, [{ binding: "ROOM", service: "artroom-room" }]);
  assert.deepEqual(prod.secrets.required, ["CHECKER_KEY"]);
  assert.deepEqual(prod.durable_objects.bindings.map((b) => b.name), ["RUNNER"]);
  for (const v of ["ROOM_ID", "CHECKER_DELEGATION", "HARNESS_ROOM_ID", "LG_KEY"]) assert.equal(v in prod.vars, false, v);
  assert.equal(config("wrangler.harness.jsonc").main, "src/harness.ts");
});

// ------------------------------------------------------------------ the accepted Artifacts namespaces (ARTIFACTS_NAMESPACES)

test("ARTIFACTS_NAMESPACES: a comma-separated list of namespace names; missing, empty or malformed is refused", () => {
  assert.deepEqual(parseNamespaces("gitseq-spike, gitseq-spike-import"), ["gitseq-spike", "gitseq-spike-import"]);
  assert.deepEqual(parseNamespaces("artroom-public"), ["artroom-public"]);
  for (const bad of [undefined, "", " ", "a,,b", "a b", "x/y", "gitseq-spike,", ",gitseq-spike", "a\nb", 7]) {
    assert.throws(() => parseNamespaces(bad), /ARTIFACTS_NAMESPACES/, JSON.stringify(bad));
  }
});

test("a job may read from any accepted namespace, and from no other", async () => {
  const w = await world();
  const exp = { checker: "tests", host: HOST, namespaces: parseNamespaces("ns, ns-import"), now: Date.now };
  for (const ns of ["ns", "ns-import"]) {
    const b = checkJob(await w.whole({ readUrl: `https://${HOST}/git/${ns}/canon.git` }), exp);
    assert.ok(!isRefusal(b), `${ns}: ${JSON.stringify(b)}`);
    assert.equal(b.repoPath, `/git/${ns}/canon.git`);
  }
  for (const url of [`https://${HOST}/git/gitseq-spike/canon.git`, `https://${HOST}/git/ns-import-2/canon.git`, `https://${HOST}/git/ns/import/canon.git`, `https://${HOST}/git//canon.git`]) {
    const r = checkJob(await w.whole({ readUrl: url as `https://${string}` }), exp);
    assert.ok(isRefusal(r) && r.rule === "check-binding", url);
  }
});

test("production: an entrypoint will not start with a missing, empty or malformed ARTIFACTS_NAMESPACES; the shipped configurations parse", async () => {
  const m = (await import(workerPath)) as WorkerModule;
  for (const Service of ["TestsCheckerService", "TypesCheckerService", "LlmReviewService"] as const) {
    const C = m[Service] as WorkerModule["TestsCheckerService"];
    for (const bad of [{}, { ARTIFACTS_NAMESPACES: "" }, { ARTIFACTS_NAMESPACES: "a b" }]) assert.throws(() => new C(ctx, bad), /ARTIFACTS_NAMESPACES/, `${Service} ${JSON.stringify(bad)}`);
    assert.ok(new C(ctx, { ARTIFACTS_NAMESPACES: "gitseq-spike,gitseq-spike-import" }));
  }
  const vars = (file: string) => (JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "")) as { vars: Record<string, string> }).vars;
  assert.deepEqual(parseNamespaces(vars("wrangler.jsonc")["ARTIFACTS_NAMESPACES"]), ["artroom-public"]);
  assert.deepEqual(parseNamespaces(vars("wrangler.harness.jsonc")["ARTIFACTS_NAMESPACES"]), ["gitseq-spike"]);
  assert.equal("ARTIFACTS_NAMESPACE" in vars("wrangler.jsonc"), false);
});

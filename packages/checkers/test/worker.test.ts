// The production Worker (src/worker.ts) and what ships with it: how a job
// arrives, the bindings and settings it needs, and the checkers'
// configurations. Nothing here starts a runner or a process.
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ArtroomError, CheckJob, RoomId, Sha } from "@generalbusiness/artroom-contract";
import { validateCheckerConfig } from "@generalbusiness/artroom-policy";
import type { RoomPort, RoomResolver } from "../src/checker.ts";
import { parseNamespaces } from "../src/job.ts";
import { NS, job } from "./support.ts";

const ctx = { waitUntil: () => {} };
const sha = "a".repeat(40) as Sha;
const ROOM_B = `room_${"b".repeat(32)}` as RoomId;

const workerPath = "../src/worker.ts";
type Service = new (ctx: unknown, env: unknown) => { handle(job: CheckJob): Promise<unknown> };
type WorkerModule = Record<string, unknown> & {
  default: { fetch(r: Request, env: unknown): Promise<Response> };
  productionRoom(env: { ROOM?: unknown }): RoomResolver;
  CHECKERS: Record<string, new (ctx: unknown, env: unknown) => { readonly volatile: boolean }>;
};
const worker = async () => (await import(workerPath)) as WorkerModule;

/** A deploy configuration, without its comment lines. */
const config = <T>(file: string) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "")) as T;

test("production: the ROOM binding is required, and resolves each job's room by its ID (R-EXEC-8)", async () => {
  const m = await worker();
  assert.throws(() => m.productionRoom({}), (e: ArtroomError) => e.code === "unavailable" && /ROOM/.test(e.message));
  const unbound = new (m["TestsCheckerService"] as Service)(ctx, { ARTIFACTS_NAMESPACES: NS });
  await assert.rejects(unbound.handle(job(sha, { kind: "tree", tree: sha })), (e: ArtroomError) => e.code === "unavailable");
  const submitted: [string, unknown][] = [];
  const service = { room: async (room: string) => ({ submit: async (act: unknown) => (submitted.push([room, act]), { id: "act_1_00000000" }) }) };
  const port: RoomPort = await m.productionRoom({ ROOM: service })(ROOM_B);
  await port.submit({ envelope: {} } as never);
  assert.deepEqual(submitted.map(([r]) => r), [ROOM_B]);
});

test("production: the Worker has no route that accepts or builds a job, and no harness (R-EXEC-8)", async () => {
  const m = await worker();
  for (const path of ["/h/check", "/"]) {
    const r = await m.default.fetch(new Request(`https://checkers.example${path}`, { method: "POST", headers: { "x-lg-key": "k" }, body: JSON.stringify(job(sha, { kind: "tree", tree: sha })) }), { LG_KEY: "k" });
    assert.equal(r.status, 404, path);
  }
  for (const name of ["HarnessLedger", "Publisher", "ArtifactsGateway"]) assert.equal(name in m, false, `${name} is not part of production`);
  for (const name of ["TestsCheckerService", "TypesCheckerService", "LlmReviewService", "RunnerBox", "RunnerGateway"]) assert.ok(name in m, name);
  assert.doesNotMatch(readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8"), /from "[^"]*harness/);
  // The production deployment: no harness, no fixed room or delegation, and the Room bound as ROOM.
  const prod = config<{ main: string; services?: unknown; secrets: { required: string[] }; durable_objects: { bindings: { name: string }[] }; vars: Record<string, string> }>("wrangler.jsonc");
  assert.equal(prod.main, "src/worker.ts");
  assert.deepEqual(prod.services, [{ binding: "ROOM", service: "artroom-room" }]);
  assert.deepEqual(prod.secrets.required, ["CHECKER_KEY"]);
  assert.deepEqual(prod.durable_objects.bindings.map((b) => b.name), ["RUNNER"]);
  for (const v of ["ROOM_ID", "CHECKER_DELEGATION", "HARNESS_ROOM_ID", "LG_KEY"]) assert.equal(v in prod.vars, false, v);
});

test("production: an entrypoint will not start with a missing, empty or malformed ARTIFACTS_NAMESPACES; the shipped configurations parse", async () => {
  const m = await worker();
  for (const name of ["TestsCheckerService", "TypesCheckerService", "LlmReviewService"]) {
    const C = m[name] as Service;
    for (const bad of [{}, { ARTIFACTS_NAMESPACES: "" }, { ARTIFACTS_NAMESPACES: "a b" }]) assert.throws(() => new C(ctx, bad), /ARTIFACTS_NAMESPACES/, `${name} ${JSON.stringify(bad)}`);
    assert.ok(new C(ctx, { ARTIFACTS_NAMESPACES: "gitseq-spike,gitseq-spike-import" }));
  }
  const vars = (file: string) => config<{ vars: Record<string, string> }>(file).vars;
  assert.deepEqual(parseNamespaces(vars("wrangler.jsonc")["ARTIFACTS_NAMESPACES"]), ["artroom-public"]);
  assert.deepEqual(parseNamespaces(vars("wrangler.spike.jsonc")["ARTIFACTS_NAMESPACES"]), ["gitseq-spike", "gitseq-spike-import"]);
  assert.equal("ARTIFACTS_NAMESPACE" in vars("wrangler.jsonc"), false);
});

test("each shipped checker configuration is valid and states its checker's volatility, so its jobs are never refused; the LLM reviewer's is advisory (R-OBL-7, R-EXEC-10)", async () => {
  const m = await worker();
  for (const [name, Checker] of Object.entries(m.CHECKERS)) {
    const raw = config<{ volatile: boolean; advisory?: boolean }>(`config/${name}.json`);
    const v = validateCheckerConfig(raw);
    assert.ok(v.ok, `${name}: ${JSON.stringify(v)}`);
    assert.equal(raw.volatile, new Checker(ctx, {}).volatile, name);
  }
  assert.deepEqual(Object.keys(m.CHECKERS), ["tests", "types", "llm-review"]);
  assert.equal(config<{ advisory: boolean }>("config/llm-review.json").advisory, true);
});

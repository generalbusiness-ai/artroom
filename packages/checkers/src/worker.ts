/**
 * Worker `artroom-lg-checkers`: the checker service.
 *
 * - `TestsCheckerService`, `TypesCheckerService` and `LlmReviewService` are
 *   the RPC entrypoints the room calls over a service binding:
 *   `handle(job) → Result<Check>` (the contract's `CheckerService`). They
 *   hold the delegation key (secret `CHECKER_KEY`) and sign outside the
 *   runner sandbox. They submit only to the room bound as `ROOM` (lane A's
 *   `RoomWire`); with no room bound they refuse to run.
 * - `RunnerBox` and `RunnerGateway` are the runner sandbox (container.ts,
 *   sandbox.ts): a new container for every job.
 * - `Publisher` (from the git package) builds filtered snapshots, in its own
 *   container, which is never a runner's.
 * - `HarnessLedger` and the `/h/*` routes play the room for live runs: they
 *   build jobs, mint read tokens, record checks in the harness ledger, and
 *   probe the runner. Every route needs the `x-lg-key` header to equal the
 *   `LG_KEY` secret. The production entrypoints never submit to the harness
 *   ledger.
 */

import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import type { ActRecord, Check, CheckJob, Digest, Result, RoomId, Sha, SignedEnvelope } from "@generalbusiness/artroom-contract";
import { checkerInputs, filterSnapshot, snapshotDigest, type SnapshotEntry } from "@generalbusiness/artroom-policy";
import { withRetry } from "@generalbusiness/artroom-git";
import type { CheckerServices, RoomPort, RunnerProvider } from "./checker.ts";
import { TestsChecker, TypesChecker } from "./checkers.ts";
import { LlmReviewer, type Model } from "./llm.ts";
import { unavailable } from "./checker.ts";
import { checkJob, gitAuthEnvFor, isRefusal, ownJob } from "./job.ts";
import { checkout, git } from "./runner.ts";
import { importSigner } from "./signing.ts";
import { Ledger } from "./ledger.ts";
import { CA, type RunnerBox } from "./container.ts";
import { runnerProvider, type RunnerStub } from "./sandbox.ts";
import type { Publisher } from "@generalbusiness/artroom-git/worker";

export { RunnerBox, RunnerGateway } from "./container.ts";
export { Publisher, ArtifactsGateway } from "@generalbusiness/artroom-git/worker";

interface Env {
  readonly ARTIFACTS: Artifacts;
  readonly ARTIFACTS_HOST: string;
  readonly ARTIFACTS_NAMESPACE: string;
  readonly RUNNER_IMAGE: string;
  readonly LLM_MODEL: string;
  readonly ROOM_ID: string;
  readonly CHECKER_DELEGATION: string;
  readonly CHECKER_KEY: string;
  readonly LG_KEY: string;
  readonly AI: Ai;
  readonly RUNNER: DurableObjectNamespace<RunnerBox>;
  readonly PUBLISHER: DurableObjectNamespace<Publisher>;
  readonly LEDGER: DurableObjectNamespace<HarnessLedger>;
  /** The room (lane A's `RoomWire`), as a service binding. Not bound yet: the production entrypoints refuse to run without it. */
  readonly ROOM?: RoomPort;
}

const TOKEN = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const redact = (s: string) => s.replace(TOKEN, "<token>");

/** Runner sandboxes for jobs (R-EXEC-1, R-EXEC-7): a new `RunnerBox`, so a new container, for every job. */
function runners(env: Env): RunnerProvider {
  return runnerProvider({ fresh: () => env.RUNNER.get(env.RUNNER.newUniqueId()) as unknown as RunnerStub, registry: ["registry.npmjs.org"] });
}

async function services(env: Env, checker: string, room: RoomPort): Promise<CheckerServices> {
  return {
    signer: await importSigner(env.CHECKER_KEY),
    delegation: env.CHECKER_DELEGATION as `act_${number}_${string}`,
    room,
    runners: runners(env),
    expectations: { room: env.ROOM_ID as RoomId, checker, host: env.ARTIFACTS_HOST, namespace: env.ARTIFACTS_NAMESPACE, now: Date.now },
  };
}

/** Workers AI as a `Model`. The model is configurable; no external key exists. */
function workersAi(env: Env): Model {
  return async (system, user) => {
    const out = (await (env.AI as unknown as { run(m: string, i: unknown): Promise<unknown> }).run(env.LLM_MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1200,
      temperature: 0,
    })) as { response?: unknown } | string;
    const text = typeof out === "string" ? out : typeof out.response === "string" ? out.response : JSON.stringify(out.response ?? out);
    return text;
  };
}

type WithRoom = { env: Env; room: RoomPort };

class Tests extends TestsChecker<WithRoom> {
  protected services() {
    return services(this.env.env, this.name, this.env.room);
  }
}
class Types extends TypesChecker<WithRoom> {
  protected services() {
    return services(this.env.env, this.name, this.env.room);
  }
}
class Llm extends LlmReviewer<WithRoom> {
  protected get modelName() {
    return this.env.env.LLM_MODEL;
  }
  protected services() {
    return services(this.env.env, this.name, this.env.room);
  }
  protected model() {
    return workersAi(this.env.env);
  }
}

const CHECKERS = { tests: Tests, types: Types, "llm-review": Llm } as const;
type CheckerName = keyof typeof CHECKERS;

/** The production room: the `ROOM` binding. Never the harness ledger. */
function productionRoom(env: Env): RoomPort {
  if (!env.ROOM) throw unavailable("No room is bound to this checker service (the ROOM service binding), so it cannot record a check.");
  return env.ROOM;
}

/** The harness's room: its ledger. Used only by the `/h/*` routes. */
function harnessRoom(env: Env, room: string): RoomPort {
  const ledger = env.LEDGER.getByName(room);
  return { submit: (act) => ledger.submit(act) as Promise<Result<ActRecord>> };
}

export class TestsCheckerService extends WorkerEntrypoint<Env> {
  async handle(job: CheckJob): Promise<Result<Check>> {
    return new Tests(this.ctx, { env: this.env, room: productionRoom(this.env) }).handle(job);
  }
}
export class TypesCheckerService extends WorkerEntrypoint<Env> {
  async handle(job: CheckJob): Promise<Result<Check>> {
    return new Types(this.ctx, { env: this.env, room: productionRoom(this.env) }).handle(job);
  }
}
export class LlmReviewService extends WorkerEntrypoint<Env> {
  async handle(job: CheckJob): Promise<Result<Check>> {
    return new Llm(this.ctx, { env: this.env, room: productionRoom(this.env) }).handle(job);
  }
}

/** The harness's stand-in for the room's admission of checker acts. */
export class HarnessLedger extends DurableObject<Env> {
  private ledger: Ledger | null = null;
  private async get(): Promise<Ledger> {
    if (this.ledger) return this.ledger;
    const key = (await importSigner(this.env.CHECKER_KEY)).key;
    const l = new Ledger({ key, member: "@ci", persist: (r) => this.ctx.storage.put(`rec:${String(r.seq).padStart(8, "0")}`, r) });
    for (const job of (await this.ctx.storage.list<CheckJob>({ prefix: "job:" })).values()) l.issue(job);
    this.ledger = l;
    return l;
  }
  async issue(job: CheckJob): Promise<void> {
    await this.ctx.storage.put(`job:${job.id}`, job);
    (await this.get()).issue(job);
  }
  async submit(act: SignedEnvelope): Promise<Result<ActRecord>> {
    return (await this.get()).submit(act);
  }
  async records(): Promise<ActRecord[]> {
    return [...(await this.ctx.storage.list<ActRecord>({ prefix: "rec:" })).values()];
  }
}

// ------------------------------------------------------------------ harness

const json = (body: unknown, status = 200) =>
  new Response(redact(JSON.stringify(body)), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function mint(env: Env, repo: string, scope: "read" | "write", ttl: number) {
  const r = await withRetry(() => env.ARTIFACTS.get(repo));
  const t = await withRetry(() => r.createToken(scope, ttl));
  return { id: t.id, plaintext: t.plaintext, revoke: () => r.revokeToken(t.id).catch(() => false) };
}

/** Build a filtered snapshot of `commit` in the checker's snapshot repo, as the room's publisher would. */
async function buildSnapshot(env: Env, repo: string, commit: Sha, checker: string, declared: string[]) {
  const canonRemote = (await (await env.ARTIFACTS.get(repo)).info()).remote;
  const storeName = `${repo}--snap-${checker}`;
  const store = await withRetry(() => env.ARTIFACTS.get(storeName)).catch(async () => {
    await withRetry(() => env.ARTIFACTS.create(storeName, { setDefaultBranch: "main" }));
    const s = await env.ARTIFACTS.get(storeName);
    for (const t of (await s.listTokens()).tokens) if (t.state === "active") await s.revokeToken(t.id);
    return s;
  });
  const storeRemote = (await store.info()).remote;
  const paths = checkerInputs(declared, { verdicts: true, checks: true, globalInputs: [], dependsOn: {} }) ?? [];
  const pub = env.PUBLISHER.getByName(`snap-${repo}`);
  const cr = await mint(env, repo, "read", 300);
  const sw = await mint(env, storeName, "write", 300);
  try {
    const all = (await pub.listTree({ canonical: { remote: canonRemote, token: cr.plaintext }, commit })) as unknown as SnapshotEntry[];
    const files = filterSnapshot(all, paths);
    const digest = await snapshotDigest(files);
    const snap = await pub.writeSnapshot({
      canonical: { remote: canonRemote, token: cr.plaintext },
      store: { remote: storeRemote, token: sw.plaintext },
      storeRef: `refs/artroom/snapshots/${digest.slice(7)}`,
      files,
      message: `Artroom filtered snapshot for ${checker}\n\nDigest: ${digest}\n`,
    });
    return { store: storeName, storeRemote, commit: snap as Sha, digest, paths, files: files.map((f) => f[0]) };
  } finally {
    await cr.revoke();
    await sw.revoke();
  }
}

async function makeJob(env: Env, b: Record<string, unknown>): Promise<{ job: CheckJob; revoke: () => Promise<unknown>; snapshot?: unknown }> {
  const repo = String(b["repo"]);
  const checker = String(b["checker"]) as CheckerName;
  const commit = String(b["commit"]) as Sha;
  const canon = await env.ARTIFACTS.get(repo);
  const info = await canon.info();
  const meta = await canon.readCommit(commit);
  if (!meta) throw new Error(`commit ${commit} not found`);
  let input: CheckJob["input"] = { kind: "tree", tree: meta.treeHash as Sha };
  let integration = commit;
  let readRepo = repo;
  let readUrl = info.remote;
  let snapshot: unknown;
  if (Array.isArray(b["scoped"])) {
    const s = await buildSnapshot(env, repo, commit, checker, b["scoped"] as string[]);
    input = { kind: "filtered", snapshot: s.digest, paths: s.paths };
    integration = s.commit;
    readRepo = s.store;
    readUrl = s.storeRemote;
    snapshot = { store: s.store, files: s.files, digest: s.digest };
  }
  const tok = await mint(env, readRepo, "read", 900);
  const job: CheckJob = {
    id: `job_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    room: env.ROOM_ID as RoomId,
    lane: "act_1001_abcdef01",
    generation: Number(b["generation"] ?? 1),
    head: commit,
    obligation: `obl_${checker}`,
    check: checker,
    integration,
    // The harness has no landing: the commit stands in for its own base.
    base: (b["base"] as Sha | undefined) ?? commit,
    input,
    readUrl: readUrl as `https://${string}`,
    gitAuthEnv: gitAuthEnvFor(tok.plaintext),
    config: (b["config"] as Digest | undefined) ?? `sha256:${"0".repeat(63)}1`,
    volatile: checker === "llm-review",
    advisory: checker === "llm-review",
    runner: null,
    deadline: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  return { job, revoke: tok.revoke, snapshot };
}

/** Probes run inside a runner after checkout, as untrusted code would. */
async function probe(env: Env, b: Record<string, unknown>) {
  const made = await makeJob(env, b);
  const { revoke, snapshot } = made;
  const job = ownJob(made.job);
  if (isRefusal(job)) return { refused: job };
  const bound = checkJob(job, { room: job.room, checker: job.check, host: env.ARTIFACTS_HOST, namespace: env.ARTIFACTS_NAMESPACE, now: Date.now });
  if (isRefusal(bound)) return { refused: bound };
  const session = await runners(env).open(bound);
  try {
    const co = await checkout(session.runner, job, session);
    if (!co.ok) return { checkout: co.detail };
    const ws = co.ws;
    const run = async (argv: [string, ...string[]]) => {
      const r = await session.runner.exec(argv, { cwd: ws.dir, env: ws.env, timeoutMs: 60_000 });
      return { argv: argv.join(" "), exit: r.exitCode, out: redact(`${r.stdout}\n${r.stderr}`).trim().slice(-400) };
    };
    const results: unknown[] = [];
    // Pushing: to the job's repository through the gateway, and with git's own credentials (there are none).
    results.push(await run(["git", "-c", "credential.helper=", "push", job.readUrl, "HEAD:refs/heads/runner-was-here"]));
    // Another repository on the same host (for example the canonical repo of a scoped job).
    if (typeof b["other"] === "string") results.push(await run(["git", "ls-remote", String(b["other"])]));
    // The internet at large.
    results.push(await run(["node", "-e", "fetch('https://example.com').then(r=>console.log('reached',r.status)).catch(e=>{console.log('blocked:',e.cause?.code??e.message);process.exit(3)})"]));
    // Secrets in the environment.
    results.push(await run(["sh", "-c", "env | grep -ci 'art_v\\|bearer\\|token' || true"]));
    if (typeof b["excludedPath"] === "string") {
      results.push(await run(["cat", String(b["excludedPath"])]));
      if (typeof b["excludedBlob"] === "string") {
        results.push(await run(["git", "cat-file", "-e", String(b["excludedBlob"])]));
        results.push(await run(["git", "-c", `http.sslCAInfo=${CA}`, "fetch", job.readUrl, String(b["excludedBlob"])]));
      }
      results.push(await run(["git", "rev-list", "--all", "--count"]));
    }
    return { job: { id: job.id, input: job.input, integration: job.integration }, snapshot, head: ws.head, results, git: (await git(session.runner, ws, ["log", "--oneline", "-1"])).stdout.trim() };
  } finally {
    await session.close();
    await revoke();
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const m = /^\/h\/([a-z-]+)$/.exec(url.pathname);
    if (request.method !== "POST" || !m) return new Response("Not found\n", { status: 404 });
    if (!env.LG_KEY || request.headers.get("x-lg-key") !== env.LG_KEY) return new Response("Forbidden\n", { status: 403 });
    const b = (await request.json()) as Record<string, unknown>;
    const t0 = Date.now();
    try {
      switch (m[1]) {
        case "create": {
          const made = await withRetry(() => env.ARTIFACTS.create(String(b["repo"]), { setDefaultBranch: "main" }));
          return new Response(JSON.stringify({ remote: made.remote, seedToken: made.token }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
        }
        case "seal": {
          const r = await env.ARTIFACTS.get(String(b["repo"]));
          let n = 0;
          for (const t of (await r.listTokens()).tokens) if (t.state === "active" && (await r.revokeToken(t.id))) n++;
          return json({ revoked: n });
        }
        case "check": {
          const checker = String(b["checker"]) as CheckerName;
          const Cls = CHECKERS[checker];
          if (!Cls) return json({ error: "unknown checker" }, 400);
          const { job, revoke, snapshot } = await makeJob(env, b);
          const ledger = env.LEDGER.getByName(job.room);
          await ledger.issue(job);
          const prep = Date.now() - t0;
          try {
            const result = await new Cls(ctx, { env, room: harnessRoom(env, job.room) }).handle(job);
            const records = await ledger.records();
            const note = isRefusal(result) ? null : records.find((r) => r.kind === "note" && "act" in r.anchor && r.anchor.act === result.id) ?? null;
            return json({ result, note, snapshot, ms: { jobAndSnapshot: prep, check: Date.now() - t0 - prep, total: Date.now() - t0 } });
          } finally {
            await revoke();
          }
        }
        case "probe":
          return json({ ...(await probe(env, b)), ms: Date.now() - t0 });
        case "records":
          return json(await env.LEDGER.getByName(env.ROOM_ID).records());
        default:
          return json({ error: "unknown route" }, 404);
      }
    } catch (e) {
      return json({ error: redact(e instanceof Error ? e.message : String(e)) }, 500);
    }
  },
};

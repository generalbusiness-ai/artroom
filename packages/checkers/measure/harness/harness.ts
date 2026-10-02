/**
 * The harness Worker `artroom-lg-checkers` (measure/harness/wrangler.jsonc),
 * for live measurements only (measure/live.mjs). It is never part of a
 * production deployment: production is src/worker.ts (wrangler.jsonc), whose
 * `fetch` has no routes (R-EXEC-8). Retired from src/ by decision D5 (request
 * 73eccbec): not type-checked or tested by the package's gates, and not
 * deployed. Deploy it for a run and delete it after (README, "Live runs").
 *
 * - It exports the production entrypoints and runner sandbox unchanged.
 * - `Publisher` (from the git package) builds filtered snapshots, in its own
 *   container, which is never a runner's.
 * - `HarnessLedger` and the `/h/*` routes play the room for live runs: they
 *   build jobs for the one room `HARNESS_ROOM_ID`, prepare each filtered
 *   snapshot in its own repository and mint each job's read token (the git
 *   package's `SnapshotRepos`, R-CARRY-16), record checks in the harness
 *   ledger, and probe the runner. Every route needs the `x-lg-key` header to
 *   equal the `LG_KEY` secret. The entrypoints never submit to the ledger.
 */

import { DurableObject } from "cloudflare:workers";
import type { ActRecord, CheckJob, Digest, Result, RoomId, Sha, SignedEnvelope } from "@generalbusiness/artroom-contract";
import { checkerInputs, filterSnapshot, snapshotDigest, type SnapshotEntry } from "@generalbusiness/artroom-policy";
import { type ArtifactsNamespace, SnapshotRepos, durableSql, withRetry } from "@generalbusiness/artroom-git";
import type { RoomPort } from "../../src/checker.ts";
import { checkJob, gitAuthEnvFor, isRefusal, ownJob, parseNamespaces } from "../../src/job.ts";
import { checkout, git } from "../../src/runner.ts";
import { importSigner } from "../../src/signing.ts";
import { Ledger } from "../../test/ledger.ts";
import { CA } from "../../src/container.ts";
import { snapshotCommitId, snapshotMessage } from "../../src/snapshot-commit.ts";
import { CHECKERS, runners, type CheckerName, type Env as ProductionEnv } from "../../src/worker.ts";
import type { Publisher } from "@generalbusiness/artroom-git/publisher";

export { RunnerBox, RunnerGateway, TestsCheckerService, TypesCheckerService, LlmReviewService } from "../../src/worker.ts";
export { Publisher, ArtifactsGateway } from "@generalbusiness/artroom-git/publisher";

interface Env extends ProductionEnv {
  readonly ARTIFACTS: Artifacts;
  /** The one room the harness plays. */
  readonly HARNESS_ROOM_ID: string;
  readonly LG_KEY: string;
  readonly PUBLISHER: DurableObjectNamespace<Publisher>;
  readonly LEDGER: DurableObjectNamespace<HarnessLedger>;
}

const TOKEN = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const redact = (s: string) => s.replace(TOKEN, "<token>");

/** The harness's room: its ledger. Used only by the `/h/*` routes. */
function harnessRoom(env: Env, room: string): RoomPort {
  const ledger = env.LEDGER.getByName(room);
  return { submit: (act) => ledger.submit(act) as Promise<Result<ActRecord>> };
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

  // The room's snapshot repositories (R-CARRY-16): one per snapshot commit, one token per job, retired durably.
  // Their cleanup ledger wakes this object's alarm before every remote effect, and a restarted object arms
  // it from the debt it finds, so a host that stops at any await leaves its cleanup scheduled.
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(() => this.arm());
  }
  private snaps_: SnapshotRepos | null = null;
  private snaps(): SnapshotRepos {
    return (this.snaps_ ??= new SnapshotRepos({
      sql: durableSql(this.ctx.storage),
      artifacts: this.env.ARTIFACTS as unknown as ArtifactsNamespace,
      prefix: SNAPSHOT_PREFIX,
      wake: (at) => this.ctx.storage.setAlarm(Math.max(at, Date.now() + 1000)),
    }));
  }
  private async arm(): Promise<void> {
    const due = this.snaps().nextDue();
    if (due !== null) await this.ctx.storage.setAlarm(Math.max(due, Date.now() + 1000));
  }
  /** Prepare the snapshot repository for `commit`: the publisher writes the snapshot into a new, empty repository. */
  async prepareSnapshot(req: { readonly commit: Sha; readonly canonical: string; readonly files: SnapshotEntry[]; readonly message: string }): Promise<{ name: string; remote: string }> {
    const repo = await this.snaps().prepare(req.commit, async (store) => {
      const canon = await withRetry(() => this.env.ARTIFACTS.get(req.canonical));
      const remote = (await canon.info()).remote;
      const read = await withRetry(() => canon.createToken("read", 300));
      try {
        return await this.env.PUBLISHER.getByName(`snap-${req.canonical}`).writeSnapshot({
          canonical: { remote, token: read.plaintext },
          store: { remote: store.remote, token: store.token },
          files: req.files,
          message: req.message,
        });
      } finally {
        await canon.revokeToken(read.id).catch(() => false);
      }
    });
    return { name: repo.name, remote: repo.remote };
  }
  /** A job's read token for its snapshot's repository only, expiring by its deadline. */
  async mintSnapshotToken(commit: Sha, job: string, deadline: number): Promise<{ id: string; token: string; expiresAt: number }> {
    const t = await this.snaps().mint(commit, job, deadline);
    return { id: t.id, token: t.token, expiresAt: t.expiresAt };
  }
  /** The job has ended: revoke its token, and retire the repository if no job is left. Returns the duties still owed. */
  async endSnapshotJob(commit: Sha, job: string): Promise<number> {
    return this.snaps().end(commit, job);
  }
  async snapshotDuties() {
    return { pending: this.snaps().pending(), nextDue: this.snaps().nextDue(), duties: this.snaps().duties() };
  }
  override async alarm(): Promise<void> {
    await this.snaps().reconcile();
  }
}

/** Every harness snapshot repository is named `artroom-lg--snap-<commit>-<attempt>`. */
const SNAPSHOT_PREFIX = "artroom-lg";

// ------------------------------------------------------------------ harness

const json = (body: unknown, status = 200) =>
  new Response(redact(JSON.stringify(body)), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function mint(env: Env, repo: string, scope: "read" | "write", ttl: number) {
  const r = await withRetry(() => env.ARTIFACTS.get(repo));
  const t = await withRetry(() => r.createToken(scope, ttl));
  return { id: t.id, plaintext: t.plaintext, revoke: () => r.revokeToken(t.id).catch(() => false) };
}

/**
 * A filtered snapshot of `commit`, as the room makes it (R-CARRY-15,
 * R-CARRY-16): list the commit's files, keep the checker's inputs, derive the
 * snapshot commit, and have the publisher write it into that commit's own new
 * repository. A repository is reused only for the same snapshot commit.
 */
async function buildSnapshot(env: Env, repo: string, commit: Sha, checker: string, declared: string[]) {
  const canon = await withRetry(() => env.ARTIFACTS.get(repo));
  const canonRemote = (await canon.info()).remote;
  const paths = checkerInputs(declared, { verdicts: true, checks: true, globalInputs: [], dependsOn: {} }) ?? [];
  const cr = await mint(env, repo, "read", 300);
  let all: SnapshotEntry[];
  try {
    all = (await env.PUBLISHER.getByName(`snap-${repo}`).listTree({ canonical: { remote: canonRemote, token: cr.plaintext }, commit })) as unknown as SnapshotEntry[];
  } finally {
    await cr.revoke();
  }
  const files = filterSnapshot(all, paths);
  const digest = await snapshotDigest(files);
  const message = snapshotMessage(checker, digest);
  const snapshot = await snapshotCommitId(files, message);
  const store = await env.LEDGER.getByName(env.HARNESS_ROOM_ID).prepareSnapshot({ commit: snapshot, canonical: repo, files, message });
  return { name: store.name, remote: store.remote, commit: snapshot, digest, paths, files: files.map((f) => f[0]) };
}

async function makeJob(env: Env, b: Record<string, unknown>): Promise<{ job: CheckJob; revoke: () => Promise<unknown>; snapshot?: unknown }> {
  const repo = String(b["repo"]);
  const checker = String(b["checker"]) as CheckerName;
  const commit = String(b["commit"]) as Sha;
  const canon = await env.ARTIFACTS.get(repo);
  const info = await canon.info();
  const meta = await canon.readCommit(commit);
  if (!meta) throw new Error(`commit ${commit} not found`);
  const id = `job_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}` as const;
  const deadline = Date.now() + 15 * 60_000;
  let input: CheckJob["input"] = { kind: "tree", tree: meta.treeHash as Sha };
  let integration = commit;
  let readUrl = info.remote;
  let snapshot: unknown;
  let tok: { plaintext: string; revoke: () => Promise<unknown> };
  if (Array.isArray(b["scoped"])) {
    const s = await buildSnapshot(env, repo, commit, checker, b["scoped"] as string[]);
    input = { kind: "filtered", snapshot: s.digest, paths: s.paths };
    integration = s.commit;
    readUrl = s.remote;
    snapshot = { repo: s.name, commit: s.commit, files: s.files, digest: s.digest };
    const ledger = env.LEDGER.getByName(env.HARNESS_ROOM_ID);
    const t = await ledger.mintSnapshotToken(s.commit, id, deadline);
    tok = { plaintext: t.token, revoke: () => ledger.endSnapshotJob(s.commit, id) };
  } else {
    const t = await mint(env, repo, "read", 900);
    tok = { plaintext: t.plaintext, revoke: t.revoke };
  }
  const job: CheckJob = {
    id,
    room: env.HARNESS_ROOM_ID as RoomId,
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
    deadline: new Date(deadline).toISOString(),
  };
  return { job, revoke: tok.revoke, snapshot };
}

/** Probes run inside a runner after checkout, as untrusted code would. */
async function probe(env: Env, b: Record<string, unknown>) {
  // An older, wider snapshot of the same commit (for example `src/**`), built first and kept in use by a held
  // job while this job runs, so its repository exists throughout (review bdcc7cc9, R-CARRY-16).
  let older: { name: string; remote: string; commit: Sha; tree: string | null; files: string[]; end: () => Promise<unknown> } | null = null;
  if (Array.isArray(b["older"])) {
    const s = await buildSnapshot(env, String(b["repo"]), String(b["commit"]) as Sha, String(b["checker"]), b["older"] as string[]);
    const held = `job_held_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const ledger = env.LEDGER.getByName(env.HARNESS_ROOM_ID);
    await ledger.mintSnapshotToken(s.commit, held, Date.now() + 15 * 60_000);
    const tree = (await (await env.ARTIFACTS.get(s.name)).readCommit(s.commit))?.treeHash ?? null;
    older = { name: s.name, remote: s.remote, commit: s.commit, tree, files: s.files, end: () => ledger.endSnapshotJob(s.commit, held) };
  }
  let made: Awaited<ReturnType<typeof makeJob>>;
  try {
    made = await makeJob(env, b);
  } catch (e) {
    await older?.end();
    throw e;
  }
  const { revoke, snapshot } = made;
  const job = ownJob(made.job);
  if (isRefusal(job)) return { refused: job };
  const bound = checkJob(job, { room: job.room, checker: job.check, host: env.ARTIFACTS_HOST, namespaces: parseNamespaces(env.ARTIFACTS_NAMESPACES), now: Date.now });
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
    if (older) {
      // By known ID, from this job's own repository: the older snapshot's commit and root tree.
      results.push(await run(["git", "-c", `http.sslCAInfo=${CA}`, "fetch", "--no-write-fetch-head", job.readUrl, older.commit]));
      if (older.tree) results.push(await run(["git", "-c", `http.sslCAInfo=${CA}`, "fetch", "--no-write-fetch-head", job.readUrl, older.tree]));
      results.push(await run(["git", "show", `${older.commit}:src/secret.txt`]));
      // The older snapshot's own repository.
      results.push(await run(["git", "ls-remote", older.remote]));
    }
    // Control: objects this job's repository does hold, by ID, though no ref names them. If these fetch, the
    // server serves objects by ID, and the older snapshot's objects failed only because they are not there.
    if (ws.files?.length) {
      results.push(await run(["git", "-c", `http.sslCAInfo=${CA}`, "fetch", "--no-write-fetch-head", job.readUrl, ws.tree]));
      results.push(await run(["git", "-c", `http.sslCAInfo=${CA}`, "fetch", "--no-write-fetch-head", job.readUrl, ws.files[0]![2]]));
    }
    // Every ref this job's server advertises.
    results.push(await run(["git", "ls-remote", job.readUrl]));
    // The exact current commit, by ID.
    results.push(await run(["git", "-c", `http.sslCAInfo=${CA}`, "fetch", "--no-write-fetch-head", job.readUrl, job.integration]));
    return {
      job: { id: job.id, input: job.input, integration: job.integration },
      snapshot,
      older: older ? { repo: older.name, commit: older.commit, tree: older.tree, files: older.files.length, hasSecret: older.files.includes("src/secret.txt") } : null,
      head: ws.head,
      results,
      git: (await git(session.runner, ws, ["log", "--oneline", "-1"])).stdout.trim(),
    };
  } finally {
    await session.close();
    await revoke();
    await older?.end();
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
            const result = await new Cls(ctx, { env, room: harnessRoom(env, job.room), fixedRoom: env.HARNESS_ROOM_ID as RoomId }).handle(job);
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
          return json(await env.LEDGER.getByName(env.HARNESS_ROOM_ID).records());
        case "snapshots":
          return json(await env.LEDGER.getByName(env.HARNESS_ROOM_ID).snapshotDuties());
        default:
          return json({ error: "unknown route" }, 404);
      }
    } catch (e) {
      return json({ error: redact(e instanceof Error ? e.message : typeof e === "object" ? JSON.stringify(e) : String(e)) }, 500);
    }
  },
};

// Test support: a local runner (child_process, argument arrays), a small npm
// project in a canonical bare repo, filtered snapshots built with the
// publisher's own git code, and jobs.
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CheckJob, Digest, LaneId, RoomId, Runner, Sha } from "@generalbusiness/artroom-contract";
import { GitOps, SnapshotRepos, type ArtifactsNamespace, type RepoHandle, type Sql, type SqlRow, type SqlValue } from "@generalbusiness/artroom-git";
import { checkerInputs, snapshotDigest } from "@generalbusiness/artroom-policy";
import { gitAuthEnvFor } from "../src/job.ts";
import { snapshotCommitId, snapshotMessage } from "../src/snapshot-commit.ts";

export const ROOM = `room_${"a".repeat(32)}` as RoomId;
export const LANE = "act_1001_abcdef01" as LaneId;
export const HOST = "acct.artifacts.cloudflare.net";
export const NS = "ns";
export const CONFIG = `sha256:${"c".repeat(64)}` as Digest;
export const TOKEN = "art_v1_readonlytoken0123456789?expires=1";

/** Runs a process with exactly `env` plus PATH. */
export class LocalRunner implements Runner {
  readonly digest = `sha256:${"d".repeat(64)}` as Digest;
  readonly calls: string[][] = [];
  exec(argv: readonly [string, ...string[]], opts: { cwd?: string; env?: Readonly<Record<string, string>>; timeoutMs?: number } = {}) {
    this.calls.push([...argv]);
    return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
      execFile(argv[0], argv.slice(1), { cwd: opts.cwd, env: { ...opts.env, PATH: process.env["PATH"] ?? "/usr/bin:/bin" }, timeout: opts.timeoutMs, maxBuffer: 32 << 20 }, (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0;
        resolve({ exitCode: code, stdout: String(stdout), stderr: String(stderr) });
      });
    });
  }
}

export async function sh(cwd: string, ...args: string[]): Promise<string> {
  const r = await new LocalRunner().exec(["git", "-c", "init.defaultBranch=main", ...args], {
    cwd,
    env: { HOME: cwd, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@i", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@i", GIT_AUTHOR_DATE: "@1700000000 +0000", GIT_COMMITTER_DATE: "@1700000000 +0000" },
  });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

const LOCK = (name: string) =>
  JSON.stringify({ name, version: "1.0.0", lockfileVersion: 3, requires: true, packages: { "": { name, version: "1.0.0" } } }, null, 2) + "\n";

/** A dependency-free npm project: `npm ci` needs no network; `npm test` runs node:test. */
export const PROJECT: Record<string, string> = {
  "package.json": JSON.stringify({ name: "demo", version: "1.0.0", private: true, scripts: { test: "node --test" } }, null, 2) + "\n",
  "package-lock.json": LOCK("demo"),
  "src/add.js": "export function add(a, b) { return a + b; }\n",
  "src/secret.txt": "the excluded file\n",
  "test/add.test.js": 'import { test } from "node:test";\nimport assert from "node:assert";\nimport { add } from "../src/add.js";\ntest("adds", () => assert.equal(add(2, 2), 4));\n',
};

/** node:sqlite as the git package's `Sql`. */
export function nodeSql(): Sql {
  const db = new DatabaseSync(":memory:");
  let depth = 0;
  return {
    all: (query: string, ...bindings: SqlValue[]) => db.prepare(query).all(...bindings) as SqlRow[],
    transaction<T>(fn: () => T): T {
      const sp = `sp${depth++}`;
      db.exec(`SAVEPOINT ${sp}`);
      try {
        const out = fn();
        db.exec(`RELEASE ${sp}`);
        return out;
      } catch (e) {
        db.exec(`ROLLBACK TO ${sp}`);
        db.exec(`RELEASE ${sp}`);
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

class ArtifactsError extends Error {
  readonly code: string;
  readonly numericCode: number;
  constructor(code: string, numericCode: number) {
    super(`${code} (${numericCode})`);
    this.code = code;
    this.numericCode = numericCode;
  }
}

interface FakeToken {
  readonly id: string;
  readonly plaintext: string;
  readonly repo: string;
  readonly scope: "read" | "write";
  state: "active" | "revoked";
  readonly expiresAt: number;
}

/**
 * Artifacts, modelled on local bare repositories under `<root>/artifacts`:
 * create (empty, with a write token), get, delete (with its tokens), and
 * tokens scoped to one repository. Each repository serves any object it
 * holds by ID (`uploadpack.allowAnySHA1InWant`), the most a server could
 * allow, so isolation can rest only on what a repository holds.
 */
export class FakeArtifacts implements ArtifactsNamespace {
  readonly dir: string;
  readonly tokens: FakeToken[] = [];
  readonly created: string[] = [];
  readonly deleted: string[] = [];
  /** Switch parts of Artifacts off, as an outage would. */
  readonly down = { delete: false, revoke: false };
  private n = 0;
  constructor(root: string) {
    this.dir = join(root, "artifacts");
    mkdirSync(this.dir, { recursive: true });
  }
  local(name: string): string {
    return join(this.dir, `${name}.git`);
  }
  url(name: string): `https://${string}` {
    return `https://${HOST}/git/${NS}/${name}.git`;
  }
  has(name: string): boolean {
    return existsSync(this.local(name));
  }
  private mint(repo: string, scope: "read" | "write", ttl: number): FakeToken {
    const id = `tok${++this.n}`;
    const t: FakeToken = { id, plaintext: ["art", "v1", `${id}${"x".repeat(24)}`].join("_"), repo, scope, state: "active", expiresAt: Date.now() + ttl * 1000 };
    this.tokens.push(t);
    return t;
  }
  /** The server's check: a live token for exactly this repository. */
  authorize(repoPath: string, authorization: string | null): boolean {
    const m = new RegExp(`^/git/${NS}/([A-Za-z0-9._-]+)\\.git(/|$)`).exec(repoPath);
    const t = this.tokens.find((x) => `Bearer ${x.plaintext}` === authorization);
    return !!m && !!t && t.state === "active" && t.expiresAt > Date.now() && t.repo === m[1] && this.has(t.repo);
  }
  async create(name: string) {
    if (this.has(name)) throw new ArtifactsError("ALREADY_EXISTS", 10409);
    await sh(this.dir, "init", "-q", "--bare", this.local(name));
    await sh(this.dir, "--git-dir", this.local(name), "config", "uploadpack.allowAnySHA1InWant", "true");
    this.created.push(name);
    return { name, remote: this.url(name), token: this.mint(name, "write", 86400).plaintext };
  }
  async delete(name: string) {
    if (this.down.delete) throw new ArtifactsError("INTERNAL_ERROR", 10400);
    if (!this.has(name)) return false;
    rmSync(this.local(name), { recursive: true });
    for (const t of this.tokens) if (t.repo === name) t.state = "revoked";
    this.deleted.push(name);
    return true;
  }
  async get(name: string): Promise<RepoHandle> {
    if (!this.has(name)) throw new ArtifactsError("NOT_FOUND", 10404);
    const self = this;
    const view = (t: FakeToken) => ({ id: t.id, scope: t.scope, state: t.state === "active" && t.expiresAt <= Date.now() ? ("expired" as const) : t.state, expiresAt: new Date(t.expiresAt).toISOString() });
    return {
      async createToken(scope: "read" | "write" = "write", ttl = 86400) {
        const t = self.mint(name, scope, ttl);
        return { id: t.id, plaintext: t.plaintext, scope, expiresAt: new Date(t.expiresAt).toISOString() };
      },
      async revokeToken(tokenOrId: string) {
        if (self.down.revoke) throw new ArtifactsError("INTERNAL_ERROR", 10400);
        const t = self.tokens.find((x) => x.repo === name && (x.id === tokenOrId || x.plaintext === tokenOrId) && x.state === "active");
        if (!t) return false;
        t.state = "revoked";
        return true;
      },
      async listTokens() {
        const tokens = self.tokens.filter((t) => t.repo === name).map(view);
        return { tokens, total: tokens.length };
      },
      async info() {
        return { name, remote: self.url(name), source: null };
      },
      async fork(): Promise<never> {
        throw new Error("not used");
      },
      async log() {
        return [];
      },
      async readTree() {
        return null;
      },
      async readCommit() {
        return null;
      },
    };
  }
  /** Active, unexpired tokens of one repository. */
  live(name: string): FakeToken[] {
    return this.tokens.filter((t) => t.repo === name && t.state === "active" && t.expiresAt > Date.now());
  }
}

/** A filtered snapshot in its own repository, as the Room prepares it. */
export interface Snap {
  readonly name: string;
  /** The repository on disk: a runner's remote in tests that run git directly. */
  readonly store: string;
  readonly url: `https://${string}`;
  readonly commit: Sha;
  readonly digest: Digest;
  readonly paths: string[];
}

export class Fixture {
  readonly root = mkdtempSync(join(tmpdir(), "artroom-checkers-"));
  readonly canonical = join(this.root, "canonical.git");
  readonly work = join(this.root, "work");
  readonly runners = join(this.root, "runners");
  readonly ops: GitOps;
  readonly artifacts: FakeArtifacts;
  /** The Room's snapshot repositories (R-CARRY-16), over the fake Artifacts. */
  readonly snapshots: SnapshotRepos;
  constructor() {
    mkdirSync(join(this.root, "publisher"));
    mkdirSync(this.runners);
    this.ops = new GitOps({ exec: (a, o) => new LocalRunner().exec(a as [string, ...string[]], o).then((r) => ({ code: r.exitCode, stdout: r.stdout, stderr: r.stderr })), workdir: join(this.root, "publisher"), config: ["protocol.file.allow=always"] });
    this.artifacts = new FakeArtifacts(this.root);
    this.snapshots = new SnapshotRepos({ sql: nodeSql(), artifacts: this.artifacts, prefix: "canon", sleep: async () => {} });
  }
  async init(files: Record<string, string> = PROJECT): Promise<Sha> {
    await sh(this.root, "init", "-q", "--bare", this.canonical);
    await sh(this.root, "init", "-q", this.work);
    return this.commit(files, "base");
  }
  /** Commit `files` (null deletes) on the work tree and push it as an integration ref. */
  async commit(files: Record<string, string | null>, message: string): Promise<Sha> {
    for (const [p, body] of Object.entries(files)) {
      const full = join(this.work, p);
      if (body === null) rmSync(full, { force: true });
      else {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, body);
      }
    }
    await sh(this.work, "add", "-A");
    await sh(this.work, "commit", "-q", "--allow-empty", "-m", message);
    const sha = (await sh(this.work, "rev-parse", "HEAD")) as Sha;
    await sh(this.work, "push", "-q", this.canonical, `${sha}:refs/artroom/integration/op_${message.replace(/\W/g, "")}/1`);
    return sha;
  }
  async tree(commit: string): Promise<Sha> {
    return (await sh(this.root, "--git-dir", this.canonical, "rev-parse", `${commit}^{tree}`)) as Sha;
  }
  /**
   * The Room's side of a filtered snapshot (R-CARRY-15, R-CARRY-16): derive
   * the commit, prepare its own repository, and have the publisher's real
   * `writeSnapshot` write it there.
   */
  async snapshot(commit: string, declared: string[], checker = "tests"): Promise<Snap> {
    const paths = checkerInputs(declared, { verdicts: true, checks: true, globalInputs: [], dependsOn: {} })!;
    const files = (await this.ops.listTree(this.canonical, commit)).filter(([p]) => paths.some((g) => matchGlobLocal(p, g)));
    const digest = await snapshotDigest(files as never);
    const message = snapshotMessage(checker, digest);
    const expected = await snapshotCommitId(files as never, message);
    const repo = await this.snapshots.prepare(expected, (store) => this.ops.writeSnapshot({ canonical: this.canonical, store: this.artifacts.local(store.name), files, message }));
    return { name: repo.name, store: this.artifacts.local(repo.name), url: this.artifacts.url(repo.name), commit: expected, digest, paths };
  }
  /** A filtered job for `snap`, with its own read token for that repository only, bounded by the job's deadline. */
  async snapshotJob(snap: Snap, over: Partial<CheckJob> = {}): Promise<{ job: CheckJob; tokenId: string }> {
    const j = job(snap.commit, { kind: "filtered", snapshot: snap.digest, paths: [...snap.paths] }, { readUrl: snap.url, ...over });
    const t = await this.snapshots.mint(snap.commit, j.id, Date.parse(j.deadline));
    return { job: { ...j, gitAuthEnv: gitAuthEnvFor(t.token) }, tokenId: t.id };
  }
  dispose(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}

import { matchGlob } from "@generalbusiness/artroom-policy";
const matchGlobLocal = (p: string, g: string) => matchGlob(p, g);

let n = 0;
export function job(integration: Sha, input: CheckJob["input"], over: Partial<CheckJob> = {}): CheckJob {
  return {
    id: `job_t${++n}_${Date.now().toString(36)}`,
    room: ROOM,
    lane: LANE,
    generation: 1,
    head: integration,
    obligation: "obl_tests",
    check: "tests",
    integration,
    base: integration,
    input,
    readUrl: `https://${HOST}/git/${NS}/canon.git`,
    gitAuthEnv: gitAuthEnvFor(TOKEN),
    config: CONFIG,
    volatile: false,
    advisory: false,
    runner: null,
    deadline: new Date(Date.now() + 600_000).toISOString(),
    ...over,
  };
}

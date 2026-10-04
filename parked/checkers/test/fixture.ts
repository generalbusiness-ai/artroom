// Test support that costs real processes: a runner that is a plain child
// process, and one real git repository with an npm project in it.
//
// A test file builds the repository once (`Fixture`, in `beforeAll`) and its
// tests only read it. Whatever a test writes goes somewhere of its own: a job
// directory, or a snapshot repository made with the publisher's own git code.
import { execFile, execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CheckJob, Digest, Runner, Sha } from "@generalbusiness/artroom-contract";
import { GitOps, SnapshotRepos, type ArtifactsNamespace, type RepoHandle, type Sql, type SqlRow, type SqlValue } from "@generalbusiness/artroom-git";
import { checkerInputs, matchGlob, snapshotDigest, type SnapshotEntry } from "@generalbusiness/artroom-policy";
import { gitAuthEnvFor } from "../src/job.ts";
import { snapshotCommitId, snapshotMessage } from "../src/snapshot-commit.ts";
import { job, tok, urlOf } from "./support.ts";

/**
 * Runs a process with exactly `env` plus PATH. A command given no directory
 * runs in the system's temporary directory, never in this package: a real
 * `npm ci` that lost its directory must not reinstall the repository.
 */
export class LocalRunner implements Runner {
  readonly digest = `sha256:${"d".repeat(64)}` as Digest;
  readonly calls: string[][] = [];
  exec(argv: readonly [string, ...string[]], opts: { cwd?: string; env?: Readonly<Record<string, string>>; timeoutMs?: number } = {}) {
    this.calls.push([...argv]);
    return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
      execFile(argv[0], argv.slice(1), { cwd: opts.cwd ?? tmpdir(), env: { ...opts.env, PATH: process.env["PATH"] ?? "/usr/bin:/bin" }, timeout: opts.timeoutMs, maxBuffer: 32 << 20 }, (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0;
        resolve({ exitCode: code, stdout: String(stdout), stderr: String(stderr) });
      });
    });
  }
}

/** Git with a fixed identity and date, so the fixture's commit IDs are the same in every run. */
function gitEnv(home: string): Record<string, string> {
  return { PATH: process.env["PATH"] ?? "/usr/bin:/bin", HOME: home, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@i", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@i", GIT_AUTHOR_DATE: "@1700000000 +0000", GIT_COMMITTER_DATE: "@1700000000 +0000" };
}

/** Run git in `cwd` and return its output. Throws if it fails. */
export function sh(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "init.defaultBranch=main", ...args], { cwd, env: gitEnv(cwd), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const LOCK = (name: string) =>
  JSON.stringify({ name, version: "1.0.0", lockfileVersion: 3, requires: true, packages: { "": { name, version: "1.0.0" } } }, null, 2) + "\n";

/** A dependency-free npm project: `npm ci` needs no network; `npm test` runs one node:test file. */
export const PROJECT: Record<string, string> = {
  "package.json": JSON.stringify({ name: "demo", version: "1.0.0", private: true, type: "module", scripts: { test: "node test/add.test.js" } }, null, 2) + "\n",
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
 * tokens of one repository, each accepted for that repository only
 * (`authorize`). Each repository serves any object it holds by ID
 * (`uploadpack.allowAnySHA1InWant`), the most a server could allow, so what
 * a job can read rests only on what its repository holds.
 */
export class FakeArtifacts implements ArtifactsNamespace {
  readonly dir: string;
  readonly tokens: FakeToken[] = [];
  private n = 0;
  constructor(root: string) {
    this.dir = join(root, "artifacts");
    mkdirSync(this.dir, { recursive: true });
  }
  local(name: string): string {
    return join(this.dir, `${name}.git`);
  }
  has(name: string): boolean {
    return existsSync(this.local(name));
  }
  private mint(repo: string, scope: "read" | "write", ttl: number): FakeToken {
    const id = `tok${++this.n}`;
    const t: FakeToken = { id, plaintext: tok(`${id}${"x".repeat(24)}`), repo, scope, state: "active", expiresAt: Date.now() + ttl * 1000 };
    this.tokens.push(t);
    return t;
  }
  /** The server's check: a live token for exactly this repository. */
  authorize(repo: string, token: string): boolean {
    const t = this.tokens.find((x) => x.plaintext === token);
    return !!t && t.state === "active" && t.expiresAt > Date.now() && t.repo === repo && this.has(repo);
  }
  async create(name: string) {
    if (this.has(name)) throw new ArtifactsError("ALREADY_EXISTS", 10409);
    sh(this.dir, "init", "-q", "--bare", this.local(name));
    appendFileSync(join(this.local(name), "config"), "[uploadpack]\n\tallowAnySHA1InWant = true\n");
    return { name, remote: urlOf(name), token: this.mint(name, "write", 86400).plaintext };
  }
  async delete(name: string) {
    if (!this.has(name)) return false;
    rmSync(this.local(name), { recursive: true });
    for (const t of this.tokens) if (t.repo === name) t.state = "revoked";
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
        return { name, remote: urlOf(name), source: null };
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
}

/** A commit of the fixture repository. */
export interface Commit {
  readonly sha: Sha;
  readonly tree: Sha;
}

/** A filtered snapshot in its own repository, as the Room prepares it. */
export interface Snap {
  readonly name: string;
  /** The repository on disk. */
  readonly store: string;
  readonly url: `https://${string}`;
  readonly commit: Sha;
  readonly digest: Digest;
  readonly paths: string[];
}

export class Fixture {
  readonly root = mkdtempSync(join(tmpdir(), "artroom-checkers-"));
  /** The canonical repository. Tests fetch from it and never write to it. */
  readonly canonical = join(this.root, "canonical");
  /** Where runners that are plain processes put their job directories. */
  readonly runners = join(this.root, "runners");
  readonly ops: GitOps;
  readonly artifacts: FakeArtifacts;
  /** The Room's snapshot repositories (R-CARRY-16), over the fake Artifacts. */
  readonly snapshots: SnapshotRepos;
  private readonly listed = new Map<string, Promise<SnapshotEntry[]>>();
  constructor() {
    for (const d of ["publisher", "runners", "canonical"]) mkdirSync(join(this.root, d));
    sh(this.canonical, "init", "-q");
    // Like the fake Artifacts, it serves any commit it holds by its ID.
    appendFileSync(join(this.canonical, ".git", "config"), "[uploadpack]\n\tallowAnySHA1InWant = true\n");
    this.ops = new GitOps({ exec: (a, o) => new LocalRunner().exec(a as [string, ...string[]], o).then((r) => ({ code: r.exitCode, stdout: r.stdout, stderr: r.stderr })), workdir: join(this.root, "publisher"), config: ["protocol.file.allow=always"] });
    this.artifacts = new FakeArtifacts(this.root);
    this.snapshots = new SnapshotRepos({ sql: nodeSql(), artifacts: this.artifacts, prefix: "canon", sleep: async () => {} });
  }
  /** Add a commit on top of the last one: `files`, and whatever `more` does to the work tree. */
  commit(name: string, files: Record<string, string>, more?: (dir: string) => void): Commit {
    for (const [p, body] of Object.entries(files)) {
      mkdirSync(dirname(join(this.canonical, p)), { recursive: true });
      writeFileSync(join(this.canonical, p), body);
    }
    more?.(this.canonical);
    sh(this.canonical, "add", "-A");
    sh(this.canonical, "commit", "-q", "-m", name);
    const [sha, tree] = sh(this.canonical, "rev-parse", "HEAD", "HEAD^{tree}").split("\n") as [Sha, Sha];
    return { sha, tree };
  }
  /**
   * Every file of a commit, as the publisher lists it. The first listing also
   * fetches the commit into the publisher's own repository, which
   * `writeSnapshot` needs; later ones are remembered.
   */
  files(commit: string): Promise<SnapshotEntry[]> {
    let listed = this.listed.get(commit);
    if (!listed) this.listed.set(commit, (listed = this.ops.listTree(this.canonical, commit) as Promise<SnapshotEntry[]>));
    return listed;
  }
  /**
   * The Room's side of a filtered snapshot (R-CARRY-15, R-CARRY-16): derive
   * the commit, prepare its own repository, and have the publisher's real
   * `writeSnapshot` write it there. `prepare` refuses a publisher that wrote
   * any other commit.
   */
  async snapshot(commit: string, declared: string[], checker = "tests"): Promise<Snap> {
    const paths = checkerInputs(declared, { verdicts: true, checks: true, globalInputs: [], dependsOn: {} })!;
    const files = (await this.files(commit)).filter(([p]) => paths.some((g) => matchGlob(p, g)));
    const digest = await snapshotDigest(files);
    const message = snapshotMessage(checker, digest);
    const expected = await snapshotCommitId(files, message);
    const repo = await this.snapshots.prepare(expected, (store) => this.ops.writeSnapshot({ canonical: this.canonical, store: this.artifacts.local(store.name), files, message }));
    return { name: repo.name, store: this.artifacts.local(repo.name), url: urlOf(repo.name), commit: expected, digest, paths };
  }
  /** A filtered job for `snap`, with its own read token for that repository only, bounded by the job's deadline. */
  async snapshotJob(snap: Snap, over: Partial<CheckJob> = {}): Promise<CheckJob> {
    const j = job(snap.commit, { kind: "filtered", snapshot: snap.digest, paths: [...snap.paths] }, { readUrl: snap.url, ...over });
    const t = await this.snapshots.mint(snap.commit, j.id, Date.parse(j.deadline));
    return { ...j, gitAuthEnv: gitAuthEnvFor(t.token) };
  }
  dispose(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}

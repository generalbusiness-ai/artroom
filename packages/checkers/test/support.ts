// Test support: a local runner (child_process, argument arrays), a small npm
// project in a canonical bare repo, filtered snapshots built with the
// publisher's own git code, and jobs.
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CheckJob, Digest, LaneId, RoomId, Runner, Sha } from "@generalbusiness/artroom-contract";
import { GitOps } from "@generalbusiness/artroom-git";
import { checkerInputs, snapshotDigest } from "@generalbusiness/artroom-policy";
import { gitAuthEnvFor } from "../src/job.ts";

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

export class Fixture {
  readonly root = mkdtempSync(join(tmpdir(), "artroom-checkers-"));
  readonly canonical = join(this.root, "canonical.git");
  readonly work = join(this.root, "work");
  readonly runners = join(this.root, "runners");
  readonly ops: GitOps;
  constructor() {
    mkdirSync(join(this.root, "publisher"));
    mkdirSync(this.runners);
    this.ops = new GitOps({ exec: (a, o) => new LocalRunner().exec(a as [string, ...string[]], o).then((r) => ({ code: r.exitCode, stdout: r.stdout, stderr: r.stderr })), workdir: join(this.root, "publisher"), config: ["protocol.file.allow=always"] });
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
  /** Build a filtered snapshot of `commit` for `declared` inputs (plus global inputs) in a store repo. */
  async snapshot(commit: string, declared: string[]): Promise<{ store: string; commit: Sha; digest: Digest; paths: string[] }> {
    const store = join(this.root, "snapshots.git");
    await sh(this.root, "init", "-q", "--bare", store).catch(() => "");
    const paths = checkerInputs(declared, { verdicts: true, checks: true, globalInputs: [], dependsOn: {} })!;
    const files = (await this.ops.listTree(this.canonical, commit)).filter(([p]) => paths.some((g) => matchGlobLocal(p, g)));
    const digest = await snapshotDigest(files as never);
    const snap = await this.ops.writeSnapshot({ canonical: this.canonical, store, storeRef: `refs/artroom/snapshots/${digest.slice(7)}`, files, message: `snapshot ${digest}\n` });
    return { store, commit: snap as Sha, digest, paths };
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
    input,
    readUrl: `https://${HOST}/git/${NS}/canon.git`,
    gitAuthEnv: gitAuthEnvFor(TOKEN),
    config: CONFIG,
    deadline: new Date(Date.now() + 600_000).toISOString(),
    ...over,
  };
}

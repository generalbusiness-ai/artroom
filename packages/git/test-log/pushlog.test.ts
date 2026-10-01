// Lane L's real LogPublisher, publishing through the publisher sandbox's
// git code (GitOps.pushLog) to a real git repository, then lane L's
// verifier over what landed.
import { describe, expect, test } from "vitest";
import { spawnSync, execFile } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sha } from "@generalbusiness/artroom-contract";
import { GitCli } from "../../log/src/gitcli.ts";
import { LOG_REF } from "../../log/src/entries.ts";
import { LogPublisher } from "../../log/src/publisher.ts";
import { verifyLog } from "../../log/src/verify.ts";
import type { GitObject, GitRemote, PushOutcome } from "../../log/src/git.ts";
import { goldenLog } from "../../log/test/support/room-sim.ts";
import { GitOps, type Exec } from "../src/publisher/gitops.ts";
import { toLogOutcome } from "../src/publisher/log-push.ts";

const exec: Exec = (argv, opts) =>
  new Promise((resolve) => {
    const [cmd, ...args] = argv;
    const child = execFile(cmd!, args, { cwd: opts.cwd, env: { ...opts.env, PATH: process.env["PATH"] ?? "/usr/bin:/bin" }, maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
    child.stdin?.end(opts.stdin ? Buffer.from(opts.stdin) : undefined);
  });

function git(dir: string, ...args: string[]): string {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

/** Lane L's GitRemote, as lane A's log remote builds it: reads from the repository, pushes through the publisher's pushLog. */
class SandboxRemote implements GitRemote {
  readonly reader: GitCli;
  readonly ops: GitOps;
  readonly url: string;
  pushes = 0;
  constructor(url: string, ops: GitOps) {
    this.url = url;
    this.ops = ops;
    this.reader = GitCli.open(url);
  }
  readRef(ref: string) {
    return this.reader.readRef(ref);
  }
  readObject(sha: Sha) {
    return this.reader.readObject(sha);
  }
  async push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<PushOutcome> {
    this.pushes++;
    if (ref !== LOG_REF) throw new Error("only the log ref");
    return toLogOutcome(await this.ops.pushLog(this.url, objects.map((o) => ({ type: o.type, data: o.data })), next, lease));
  }
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "artroom-pushlog-"));
  const remote = join(root, "remote");
  mkdirSync(remote);
  git(remote, "init", "--quiet");
  const sandbox = (n: string) => {
    mkdirSync(join(root, n));
    return new GitOps({ exec, workdir: join(root, n), config: ["protocol.file.allow=always"] });
  };
  return { remote, sandbox };
}

describe("lane L's log through pushLog", () => {
  test("three publications land on refs/artroom/log exactly as lane L built them, git accepts them, and verify proves the prefix", async () => {
    const { remote, sandbox } = setup();
    const r = new SandboxRemote(remote, sandbox("publisher"));
    const { sim, c1, c2, c3 } = await goldenLog(r);
    expect(git(remote, "rev-parse", LOG_REF)).toBe(c3.commit);
    expect(git(remote, "rev-list", "--reverse", LOG_REF).split("\n")).toEqual([c1.commit, c2.commit, c3.commit]);
    expect(r.pushes).toBe(3);
    git(remote, "fsck", "--strict", "--no-dangling");
    expect(JSON.parse(git(remote, "show", `${LOG_REF}:artroom-log/v1/checkpoint.json`))).toMatchObject({ through: 10, hash: sim.entries[10]!.hash });
    const reader = GitCli.open(remote);
    await reader.fetch(LOG_REF);
    const report = await verifyLog(reader);
    expect(report.failures).toEqual([]);
  });

  test("the commit pushed is the one commitFor computes; a fresh sandbox after a restart continues on top", async () => {
    const { remote, sandbox } = setup();
    const { sim, publisher, c3 } = await goldenLog(new SandboxRemote(remote, sandbox("first")));
    // The Room computes the next commit before any remote write; the sandbox must push exactly it.
    sim.system({ type: "checkpoint", through: c3.through, hash: c3.hash, commit: c3.commit });
    const expected = publisher.commitFor(c3.commit, sim.entries, sim.checkpoint(), sim.retained);
    const reopened = await LogPublisher.open(new SandboxRemote(remote, sandbox("second")));
    const r = await reopened.publish(sim.entries, sim.checkpoint(), sim.retained);
    expect(r.commit).toBe(expected);
    expect(git(remote, "rev-parse", LOG_REF)).toBe(expected);
    expect(git(remote, "rev-parse", `${expected}^`)).toBe(c3.commit);
  });

  test("another writer moved the ref: lane L gets lease-mismatch and refuses to write over it", async () => {
    const { remote, sandbox } = setup();
    const r = new SandboxRemote(remote, sandbox("p"));
    const { sim, publisher, c3 } = await goldenLog(r);
    git(remote, "update-ref", LOG_REF, `${c3.commit}^`); // someone moves the ref
    sim.system({ type: "checkpoint", through: c3.through, hash: c3.hash, commit: c3.commit });
    await expect(publisher.publish(sim.entries, sim.checkpoint(), sim.retained)).rejects.toMatchObject({ code: "unexpected-writer" });
  });
});

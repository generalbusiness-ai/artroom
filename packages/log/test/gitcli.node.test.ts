/** Publish and verify against a real local git repository, through the git CLI (Node only). */

import { describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GitCli, redact } from "../src/gitcli.ts";
import { LOG_REF } from "../src/entries.ts";
import { LogPublisher } from "../src/publisher.ts";
import { verifyLog } from "../src/verify.ts";
import { goldenLog, keys, memberAuthority } from "./support/room-sim.ts";

function git(dir: string, ...args: string[]): string {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "artroom-remote-"));
  git(dir, "init", "--quiet");
  return dir;
}

const cli = resolve(import.meta.dirname, "../src/cli.ts");

describe("round trip through a local git repository", () => {
  test("three publications land on refs/artroom/log, git accepts them, and verify proves the prefix", async () => {
    const remote = repo();
    const { sim, c1, c2, c3 } = await goldenLog(GitCli.open(remote));
    expect(git(remote, "rev-parse", LOG_REF)).toBe(c3.commit);
    expect(git(remote, "rev-list", "--reverse", LOG_REF).split("\n")).toEqual([c1.commit, c2.commit, c3.commit]);
    git(remote, "fsck", "--strict", "--no-dangling");
    expect(JSON.parse(git(remote, "show", `${LOG_REF}:artroom-log/v1/checkpoint.json`))).toMatchObject({ through: 10, hash: sim.entries[10]!.hash });

    const reader = GitCli.open(remote);
    await reader.fetch(LOG_REF);
    const report = await verifyLog(reader);
    expect(report.failures).toEqual([]);
    expect(report).toMatchObject({ ok: true, verifiedThrough: 10, publishedThrough: 10, commits: 3 });
  });

  test("artroom verify exits 0 on an intact log and 1 on a rewritten one", async () => {
    const remote = repo();
    await goldenLog(GitCli.open(remote));
    const ok = spawnSync(process.execPath, [cli, "verify", remote], { encoding: "utf8" });
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/^Verified\./);
    expect(ok.stdout).toMatch(/verified through entry 10/);

    // Someone rewrites the ref to a commit with an altered segment line.
    const work = mkdtempSync(join(tmpdir(), "artroom-tamper-"));
    git(work, "init", "--quiet");
    git(work, "fetch", "--quiet", remote, `${LOG_REF}:refs/heads/log`);
    git(work, "checkout", "--quiet", "log");
    const seg = join(work, "artroom-log/v1/segments/000000000000.jsonl");
    const { readFileSync, writeFileSync } = await import("node:fs");
    writeFileSync(seg, readFileSync(seg, "utf8").replace('"Work on it"', '"Work on that"'));
    git(work, "-c", "user.name=x", "-c", "user.email=x@x", "commit", "--quiet", "-am", "tamper");
    git(work, "push", "--quiet", "--force", remote, `HEAD:${LOG_REF}`);
    const bad = spawnSync(process.execPath, [cli, "verify", remote, "--json"], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect((JSON.parse(bad.stdout) as { failures: { reason: string }[] }).failures.map((f) => f.reason)).toContain("history-rewritten");
  });

  test("review ea4a9bd0 finding 3: artroom verify exits 1, not 2, on a log whose first entry is malformed", async () => {
    const remote = repo();
    await goldenLog(GitCli.open(remote));
    const work = mkdtempSync(join(tmpdir(), "artroom-malformed-"));
    git(work, "init", "--quiet");
    git(work, "fetch", "--quiet", remote, `${LOG_REF}:refs/heads/log`);
    git(work, "checkout", "--quiet", "--orphan", "alone", "log"); // one root commit, so no history check intervenes
    const seg = join(work, "artroom-log/v1/segments/000000000000.jsonl");
    const { readFileSync, writeFileSync } = await import("node:fs");
    const lines = readFileSync(seg, "utf8").split("\n");
    writeFileSync(seg, ['{"seq":0}', ...lines.slice(1)].join("\n"));
    git(work, "-c", "user.name=x", "-c", "user.email=x@x", "commit", "--quiet", "-am", "malformed");
    git(work, "push", "--quiet", "--force", remote, `HEAD:${LOG_REF}`);
    const r = spawnSync(process.execPath, [cli, "verify", remote, "--json"], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(1);
    const report = JSON.parse(r.stdout) as { verifiedThrough: number; failures: { reason: string; seq?: number }[] };
    expect(report.failures).toContainEqual(expect.objectContaining({ reason: "malformed", seq: 0 }));
    expect(report.verifiedThrough).toBe(-1);
  });

  test("a publisher with a stale view meets the lease and stops; the ref does not move", async () => {
    const remote = repo();
    const { sim, c3 } = await goldenLog(GitCli.open(remote));
    const stale = new LogPublisher(GitCli.open(remote));
    await sim.claim(keys.alice, memberAuthority("@alice", keys.alice.key), ["tests/**"]);
    const err = await stale.publish(sim.entries, sim.checkpoint(), sim.retained).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "unexpected-writer" });
    expect(git(remote, "rev-parse", LOG_REF)).toBe(c3.commit);
    // A resumed publisher continues forward.
    const resumed = await LogPublisher.open(GitCli.open(remote));
    const r = await resumed.publish(sim.entries, sim.checkpoint(), sim.retained);
    expect(git(remote, "rev-parse", `${LOG_REF}^`)).toBe(c3.commit);
    expect(git(remote, "rev-parse", LOG_REF)).toBe(r.commit);
  });

  test("tokens and URL credentials are redacted", () => {
    expect(redact("https://x:art_v2_x_abc123DEF?expires=17000@artifacts.example/repo.git")).toBe("https://<credentials>@artifacts.example/repo.git");
    expect(redact("token art_v2_x_abc123DEF?expires=17000 leaked")).toBe("token <token> leaked");
  });
});

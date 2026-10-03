/**
 * Publication through the git CLI adapter to a real local repository (Node
 * only): git accepts the objects the publisher writes, the ref moves only
 * under its lease, and a publisher reopened from the ref continues it.
 * Reading through the adapter is the `artroom verify` command's path
 * (`cli.node.test.ts`).
 */

import { describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitCli, redact } from "../src/gitcli.ts";
import { LOG_REF } from "../src/entries.ts";
import { LogPublisher } from "../src/publisher.ts";
import { RoomSim, keys, memberAuthority } from "./support/room-sim.ts";

function git(dir: string, ...args: string[]): string {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

describe("publication through the git CLI to a local repository", () => {
  test("two publications land on refs/artroom/log and git accepts them; a publisher with a stale view meets the lease and stops, and the ref does not move; a publisher reopened from the ref continues it", async () => {
    const remote = mkdtempSync(join(tmpdir(), "artroom-remote-"));
    git(remote, "init", "--quiet");
    const sim = new RoomSim();
    const alice = memberAuthority("@alice", keys.alice.key);
    await sim.claim(keys.alice, alice, ["src/**"]);
    const publisher = new LogPublisher(GitCli.open(remote));
    const c1 = await sim.publish(publisher); // a root commit: the ref must not exist
    const c2 = await sim.publish(publisher); // its child: the lease is c1
    expect(git(remote, "rev-list", "--reverse", LOG_REF).split("\n")).toEqual([c1.commit, c2.commit]);
    git(remote, "fsck", "--strict", "--no-dangling");
    expect(JSON.parse(git(remote, "show", `${LOG_REF}:artroom-log/v1/checkpoint.json`))).toMatchObject({ through: 3, hash: sim.entries[3]!.hash });

    // A publisher that never saw the ref leases "no ref": git refuses, and nothing moves.
    const stale = new LogPublisher(GitCli.open(remote));
    await sim.claim(keys.alice, alice, ["tests/**"]);
    const err = await stale.publish(sim.entries, sim.checkpoint(), sim.retained).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "unexpected-writer", current: c2.commit });
    expect(git(remote, "rev-parse", LOG_REF)).toBe(c2.commit);
    // A publisher reopened from the ref reads its index through the adapter and continues forward.
    const resumed = await LogPublisher.open(GitCli.open(remote));
    expect(resumed.publishedThrough).toBe(3);
    const r = await resumed.publish(sim.entries, sim.checkpoint(), sim.retained);
    expect(git(remote, "rev-parse", `${LOG_REF}^`)).toBe(c2.commit);
    expect(git(remote, "rev-parse", LOG_REF)).toBe(r.commit);
    git(remote, "fsck", "--strict", "--no-dangling");
  });

  test("tokens and URL credentials are redacted", () => {
    expect(redact("https://x:art_v2_x_abc123DEF?expires=17000@artifacts.example/repo.git")).toBe("https://<credentials>@artifacts.example/repo.git");
    expect(redact("token art_v2_x_abc123DEF?expires=17000 leaked")).toBe("token <token> leaked");
  });
});

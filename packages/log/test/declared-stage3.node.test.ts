/**
 * Declared acts stage 3, through a real git repository (Node only): a fresh
 * clone of a log whose landed document activates a kind verifies with
 * `artroom verify`, its version witnessed by the pinned head the room
 * publishes; without the pinned head the version is `git-unwitnessed`.
 */

import { describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Sha } from "@generalbusiness/artroom-contract";
import { GitCli } from "../src/gitcli.ts";
import { LOG_REF } from "../src/entries.ts";
import type { GitObject } from "../src/git.ts";
import type { Fixture } from "./support/declared-room.ts";
import { open, publish } from "./support/fixtures.ts";
import activatesJson from "./fixtures/declared-activates-kind.json";

const cli = resolve(import.meta.dirname, "../src/cli.ts");

function remote(): string {
  const dir = mkdtempSync(join(tmpdir(), "artroom-declared-"));
  const r = spawnSync("git", ["-C", dir, "init", "--bare", "--quiet"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return dir;
}

/** Push the fixture's log, and with `pin` its version head under refs/artroom/heads/<lane>/1, to a new repository. */
async function room(pin: boolean): Promise<string> {
  const log = open(activatesJson as unknown as Fixture);
  const mem = await publish(log);
  const objects: GitObject[] = [...mem.objects].map(([sha, o]) => ({ sha: sha as Sha, type: o.type, data: o.data }));
  const dir = remote();
  const git = GitCli.open(dir);
  expect(await git.push(objects, LOG_REF, (await mem.readRef(LOG_REF))!, null)).toEqual({ ok: true });
  if (pin) {
    const propose = log.entries[6]!.entry as { act: { envelope: { target: { lane: string }; body: { head: Sha } } } };
    const { lane } = propose.act.envelope.target;
    expect(await git.push(objects, `refs/artroom/heads/${lane}/1`, propose.act.envelope.body.head, null)).toEqual({ ok: true });
  }
  return dir;
}

describe("a fresh clone, through artroom verify", () => {
  test("the log verifies; the version is witnessed by its pinned head", async () => {
    const r = spawnSync(process.execPath, [cli, "verify", await room(true), "--json"], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const report = JSON.parse(r.stdout) as { ok: boolean; verifiedThrough: number; failures: unknown[]; limits: unknown[] };
    expect(report).toMatchObject({ ok: true, verifiedThrough: 21, failures: [], limits: [] });
  });

  test("without the pinned head the log still verifies, and the version is reported git-unwitnessed", async () => {
    const r = spawnSync(process.execPath, [cli, "verify", await room(false)], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^Verified\./);
    expect(r.stdout).toMatch(/git-unwitnessed at entry 6/);
  });
});

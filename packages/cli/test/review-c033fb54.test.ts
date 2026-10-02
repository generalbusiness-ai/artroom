/**
 * Review c033fb54, P2: a release keeps the cleanup duty when the credential
 * file's installation mark cannot be read. An owned installation, pending or
 * installed, is settled only by one evidence rule, the same rule the Room's
 * mapping uses: its credential was removed now, the file is gone, or the
 * file provably names another installation. An unreadable mark proves
 * nothing, so the release prints the manual step and keeps the evidence;
 * its reservation is cancelled independently.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { readOwner } from "../src/git.ts";
import { EXIT } from "../src/main.ts";
import { useHarness } from "./harness.ts";

const { h, cli, login, repo } = useHarness();

const configPath = (home: string) => join(home, "config.json");
const config = (home: string) => JSON.parse(readFileSync(configPath(home), "utf8"));
const credentialIn = (dir: string) => join(dir, ".git", "artroom", "credentials");
const ownerIn = (dir: string) => readOwner(join(dir, ".git"));
const crashAt = (name: string) => ({
  step: (s: string) => {
    if (s === name) throw new Error(`interrupted after ${s}`);
  },
});

/** Workspace for the selected lane writes its credential, but its mapping is never saved: it is only in `pending`. */
async function writtenButUnmapped(home: string, dir: string): Promise<void> {
  const path = configPath(home);
  let saved = "";
  const res = await cli(home, ["workspace"], dir, {
    step(s) {
      if (s === "workspace-installing") {
        saved = readFileSync(path, "utf8");
        rmSync(path);
        mkdirSync(path);
      }
    },
  });
  expect(res.code).toBe(EXIT.failed);
  rmSync(path, { recursive: true });
  writeFileSync(path, saved);
}

/** Removes the credential's first line, its installation mark, keeping a working git credential. */
function unmark(dir: string): string {
  const bytes = readFileSync(credentialIn(dir), "utf8").split("\n").slice(1).join("\n");
  writeFileSync(credentialIn(dir), bytes);
  return bytes;
}

const MANUAL = /Manual local step: .*credentials has no installation mark artroom can read\. If it still holds lane act_\d+_[0-9a-f]{8}'s credential, remove it by hand\./;

describe("an unreadable mark keeps the cleanup duty", () => {
  test("unmapped pending: the release names the manual step and keeps the pending entry; the file is untouched", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = config(home).rooms[h.room.id].lane as string;
    await writtenButUnmapped(home, dir);
    expect(config(home).rooms[h.room.id].workspaces?.[y]).toBeUndefined();
    const bytes = unmark(dir);
    const res = await cli(home, ["release", "--lane", y], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toMatch(MANUAL);
    expect(readFileSync(credentialIn(dir), "utf8")).toBe(bytes);
    expect(ownerIn(dir).pending?.map((p) => p.lane)).toEqual([y]); // the only evidence of the duty is kept
  });

  test("installed and mapped: the release keeps both the installed record and the mapping", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = config(home).rooms[h.room.id].lane as string;
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    unmark(dir);
    const res = await cli(home, ["release"], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toMatch(MANUAL);
    expect(existsSync(credentialIn(dir))).toBe(true);
    expect(ownerIn(dir).installed?.lane).toBe(x);
    expect(config(home).rooms[h.room.id].workspaces[x]).toBeDefined();
  });

  test("interrupted and retried: the duty is kept until the user removes the file, and then settled", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = config(home).rooms[h.room.id].lane as string;
    await writtenButUnmapped(home, dir);
    unmark(dir);
    const release = ["release", "--lane", y, "--idempotency-key", "rel-unmarked"];
    expect((await cli(home, release, dir, crashAt("credential-removed"))).code).toBe(EXIT.failed);
    expect(ownerIn(dir).pending?.map((p) => p.lane)).toEqual([y]);
    // The user follows the manual step; the same command then finishes, and the duty is settled.
    rmSync(credentialIn(dir));
    expect((await cli(home, release, dir)).code).toBe(EXIT.ok);
    expect(ownerIn(dir).pending).toBeUndefined();
  });

  test("the reservation is cancelled independently, and a successor's completed installation settles the kept duty", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = config(home).rooms[h.room.id].lane as string;
    // Y's workspace stops after reserving, so its reservation is still there; the file's mark is then unreadable.
    await writtenButUnmapped(home, dir);
    expect((await cli(home, ["workspace"], dir, crashAt("workspace-reserved"))).code).toBe(EXIT.failed);
    expect(ownerIn(dir).reservation?.lane).toBe(y);
    unmark(dir);
    expect((await cli(home, ["release", "--lane", y], dir)).code).toBe(EXIT.ok);
    expect(ownerIn(dir).reservation).toBeUndefined();
    expect(ownerIn(dir).pending?.map((p) => p.lane)).toEqual([y]);
    // A later lane's completed installation replaces the file: every earlier duty is then provably settled.
    await cli(home, ["claim", "test/**", "--goal", "z"], dir);
    const z = config(home).rooms[h.room.id].lane as string;
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    expect(ownerIn(dir).pending).toBeUndefined();
    expect(ownerIn(dir).installed?.lane).toBe(z);
    expect(readFileSync(credentialIn(dir), "utf8")).toContain(`lane ${z},`);
  });
});

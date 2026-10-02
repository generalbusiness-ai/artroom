/**
 * Review 7040317d.
 *
 * - P2: unsettled installations are plural (`pending`). A later installer
 *   adds itself and never drops an earlier entry, so a credential written
 *   by an installation whose mapping was never saved stays removable after
 *   any number of further interruptions, across lanes and Rooms. A
 *   completed replacement of the file settles them, and the successor's
 *   file is protected.
 * - P2: every unsuccessful attempt to take or recover the destination lock
 *   counts against one deadline. An occupied recovery file (a live
 *   recoverer, another host's, an empty one) or an empty lock is waited
 *   on, then named for the user; neither age nor ambiguity removes a lock.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FakeRoom } from "../../client/test/support/fake-room.ts";
import { lockWait, readOwner, withDestination } from "../src/git.ts";
import { invitationLink } from "../src/link.ts";
import { EXIT } from "../src/main.ts";
import { useHarness } from "./harness.ts";

const { h, cli, login, repo } = useHarness();

const configPath = (home: string) => join(home, "config.json");
const config = (home: string) => JSON.parse(readFileSync(configPath(home), "utf8"));
const credentialIn = (dir: string) => join(dir, ".git", "artroom", "credentials");
const crashAt = (name: string) => ({
  step: (s: string) => {
    if (s === name) throw new Error(`interrupted after ${s}`);
  },
});

/**
 * Runs `workspace` so that its credential is written but its mapping is
 * never saved: the config file is in the way when the mapping is written.
 */
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

describe("P2: unsettled installations stay plural until the file proves them settled", () => {
  test("lanes: Y writes but is never mapped, then Z stops before writing; releasing Y removes Y's credential", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = config(home).rooms[h.room.id].lane as string;
    await writtenButUnmapped(home, dir);
    expect(config(home).rooms[h.room.id].workspaces[y]).toBeUndefined();
    const yInstall = readOwner(join(dir, ".git")).pending![0]!.install;
    expect(readFileSync(credentialIn(dir), "utf8")).toContain(`installation ${yInstall}.`);

    await cli(home, ["claim", "test/**", "--goal", "z"], dir);
    const z = config(home).rooms[h.room.id].lane as string;
    expect((await cli(home, ["workspace"], dir, crashAt("workspace-installing"))).code).toBe(EXIT.failed);
    expect(readOwner(join(dir, ".git")).pending!.map((p) => p.lane)).toEqual([y, z]); // Y's evidence was not dropped

    const res = await cli(home, ["release", "--lane", y], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toContain(`Removed the workspace credential for lane ${y}, lease 1, from ${credentialIn(dir)}.`);
    expect(existsSync(credentialIn(dir))).toBe(false);
    expect(readOwner(join(dir, ".git")).pending!.map((p) => p.lane)).toEqual([z]);
  });

  test("Rooms: Y in Room A writes but is never mapped, then Room B's Z stops before writing; Room A's release removes Y", async () => {
    const other = await FakeRoom.create({ name: "other/repo" });
    await other.start();
    try {
      const home = join(h.tmp, "alice");
      const dir = repo();
      await login(home, "@alice");
      await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
      const y = config(home).rooms[h.room.id].lane as string;
      await writtenButUnmapped(home, dir);
      const inv = await other.invite("@alice");
      await cli(home, ["login", invitationLink(other.url, other.id, inv.invitation, inv.secret)], dir);
      await cli(home, ["claim", "test/**", "--goal", "z"], dir);
      expect((await cli(home, ["workspace"], dir, crashAt("workspace-installing"))).code).toBe(EXIT.failed);
      expect(readOwner(join(dir, ".git")).pending!.map((p) => p.room)).toEqual([h.room.id, other.id]);
      const res = await cli(home, ["release", "--room", h.room.id, "--lane", y], dir);
      expect(res.code).toBe(EXIT.ok);
      expect(existsSync(credentialIn(dir))).toBe(false);
      expect(readOwner(join(dir, ".git")).pending!.map((p) => p.room)).toEqual([other.id]);
    } finally {
      await other.stop();
    }
  });

  test("an owner record written with the single installing slot of version 2 keeps that party as pending", () => {
    const dir = join(repo(), ".git");
    mkdirSync(join(dir, "artroom"), { recursive: true });
    const y = { install: "y-install", room: h.room.id, lane: "act_5_00000000", lease: 1 };
    writeFileSync(join(dir, "artroom", "owner.json"), JSON.stringify({ v: 2, rev: 4, installing: y }));
    expect(readOwner(dir)).toEqual({ v: 3, rev: 4, pending: [y] });
  });

  test("a completed later installation settles the earlier ones; the successor's file is then left by Y's release", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = config(home).rooms[h.room.id].lane as string;
    await writtenButUnmapped(home, dir);
    await cli(home, ["claim", "test/**", "--goal", "z"], dir);
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    const z = readFileSync(credentialIn(dir), "utf8");
    expect(readOwner(join(dir, ".git")).pending).toBeUndefined();
    expect((await cli(home, ["release", "--lane", y], dir)).code).toBe(EXIT.ok);
    expect(readFileSync(credentialIn(dir), "utf8")).toBe(z);
  });
});

describe("P2: waiting for the destination lock is bounded on every path", () => {
  const lockDir = () => {
    const dir = join(repo(), ".git");
    mkdirSync(join(dir, "artroom"), { recursive: true });
    return dir;
  };
  const deadLock = (dir: string) => writeFileSync(join(dir, "artroom", "owner.lock"), JSON.stringify({ pid: 999_996, host: hostname(), token: "dead" }));
  const breakFile = (dir: string) => join(dir, "artroom", "owner.lock.break");

  /** A live process on this host that exits on its own, optionally after running `then`. */
  function liveProcess(ms: number, then = "") {
    const p = spawn(process.execPath, ["-e", `setTimeout(() => { ${then} }, ${ms});`], { stdio: "ignore" });
    return { pid: p.pid!, exited: new Promise((r) => p.on("exit", r)) };
  }

  async function bounded(dir: string, waitMs = 200): Promise<string> {
    const saved = lockWait.ms;
    lockWait.ms = waitMs;
    const started = Date.now();
    try {
      withDestination(dir, (o) => ({ ...o, rev: o.rev + 1 }));
      return "ACQUIRED";
    } catch (e) {
      expect(Date.now() - started).toBeLessThan(5_000);
      return (e as Error).message;
    } finally {
      lockWait.ms = saved;
    }
  }

  test("a recovery file held by a live recoverer is waited on, then named, and nothing is removed", async () => {
    const dir = lockDir();
    deadLock(dir);
    const recoverer = liveProcess(3_000);
    writeFileSync(breakFile(dir), JSON.stringify({ pid: recoverer.pid, host: hostname(), token: "recoverer" }));
    expect(await bounded(dir)).toMatch(/the lock is being recovered by process \d+\.$/);
    expect(existsSync(join(dir, "artroom", "owner.lock"))).toBe(true);
    expect(existsSync(breakFile(dir))).toBe(true);
    await recoverer.exited;
  });

  test("a recovery file from another host is named for manual action, not removed", async () => {
    const dir = lockDir();
    deadLock(dir);
    writeFileSync(breakFile(dir), JSON.stringify({ pid: 1, host: "other-host", token: "elsewhere" }));
    expect(await bounded(dir)).toMatch(/owner\.lock\.break belongs to a process on other-host\. If that command has stopped, remove it by hand\.$/);
    expect(existsSync(breakFile(dir))).toBe(true);
    expect(existsSync(join(dir, "artroom", "owner.lock"))).toBe(true);
  });

  test("an empty recovery file (a crash between creating and writing it) is named, not removed", async () => {
    const dir = lockDir();
    deadLock(dir);
    writeFileSync(breakFile(dir), "");
    expect(await bounded(dir)).toMatch(/owner\.lock\.break is empty or unreadable\. If no artroom command is running, remove it by hand\.$/);
    expect(existsSync(breakFile(dir))).toBe(true);
  });

  test("an empty lock file is waited on, then named, not removed", async () => {
    const dir = lockDir();
    writeFileSync(join(dir, "artroom", "owner.lock"), "");
    expect(await bounded(dir)).toMatch(/owner\.lock is empty or unreadable\. If no artroom command is running, remove it by hand\.$/);
    expect(readFileSync(join(dir, "artroom", "owner.lock"), "utf8")).toBe("");
  });

  test("a recoverer that completes while this command waits lets it acquire the lock", async () => {
    const dir = lockDir();
    deadLock(dir);
    const files = [breakFile(dir), join(dir, "artroom", "owner.lock")];
    const finish = `for (const f of ${JSON.stringify(files)}) require("node:fs").rmSync(f);`;
    const recoverer = liveProcess(300, finish);
    writeFileSync(breakFile(dir), JSON.stringify({ pid: recoverer.pid, host: hostname(), token: "recoverer" }));
    expect(await bounded(dir, 5_000)).toBe("ACQUIRED");
    expect(readOwner(dir).rev).toBe(1);
    await recoverer.exited;
  });
});

/**
 * The destination lock (`withDestination` in src/git.ts), which serialises
 * every command that writes a repository's Artroom remote, credential and
 * owner record. Reviews 4758945b and 7040317d.
 *
 * - The lock names its holder: process, host and a token. Age is never
 *   evidence. Only a holder provably gone on this host is recovered, a lock
 *   is removed only by its own token, and the holder checks that it still
 *   holds the lock before it writes.
 * - Every unsuccessful attempt to take or recover the lock counts against
 *   one deadline. Whatever is in the way (a live holder, another host's
 *   lock, an empty file, a recovery file) is waited on, then named for the
 *   user, and never removed.
 *
 * One other process plays the second command, start to finish. It runs
 * the real `withDestination`, and is killed if it does not finish, so a wait
 * that never ends fails these tests and does not hang them. Its steps and
 * this file's are ordered by marker files, not by sleeping long enough.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { readOwner, withDestination } from "../src/git.ts";

const tmp = mkdtempSync(join(tmpdir(), "artroom-lock-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** A directory that stands for a repository's `.git`: the lock needs nothing else of it. */
function destination(name: string): string {
  const dir = join(tmp, name);
  mkdirSync(join(dir, "artroom"), { recursive: true });
  return dir;
}
const lockOf = (dir: string) => join(dir, "artroom", "owner.lock");
const breakOf = (dir: string) => join(dir, "artroom", "owner.lock.break");
const sleepSync = (ms: number) => void Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The ID of a process that has exited: provably gone on this host. */
const gone = spawnSync("true").pid;
const here = hostname();
const live = { pid: process.pid, host: here, token: "live" };
const dead = { pid: gone, host: here, token: "dead" };
const elsewhere = { pid: 1, host: "elsewhere.example", token: "elsewhere" };

/** What is in the way in each case, the files that say so, and the words the other command must end with. */
const BLOCKED: Record<string, { lock: string; recovery?: string; says: RegExp }> = {
  "a live holder on this host": { lock: JSON.stringify(live), says: new RegExp(`owner\\.lock is held by another artroom command \\(process ${process.pid}\\)\\. Wait for it to finish, then try again\\.$`) },
  "a holder on another host": { lock: JSON.stringify(elsewhere), says: /owner\.lock is held by a process on elsewhere\.example\. If that command has stopped, remove the file by hand\.$/ },
  "an empty lock file": { lock: "", says: /owner\.lock is empty or unreadable\. If no artroom command is running, remove it by hand\.$/ },
  "a recovery file held by a live recoverer": { lock: JSON.stringify(dead), recovery: JSON.stringify(live), says: new RegExp(`the lock is being recovered by process ${process.pid}\\.$`) },
  "a recovery file from another host": { lock: JSON.stringify(dead), recovery: JSON.stringify(elsewhere), says: /owner\.lock\.break belongs to a process on elsewhere\.example\. If that command has stopped, remove it by hand\.$/ },
  "an empty recovery file, left between creating and writing it": { lock: JSON.stringify(dead), recovery: "", says: /owner\.lock\.break is empty or unreadable\. If no artroom command is running, remove it by hand\.$/ },
  "a recovery file left by a recoverer that also stopped": { lock: JSON.stringify(dead), recovery: JSON.stringify({ ...dead, token: "dead-too" }), says: /stopped while recovering a lock\. Remove that file by hand\.$/ },
};

describe("two commands at one destination", () => {
  const blocked = Object.fromEntries(Object.keys(BLOCKED).map((name, i) => [name, destination(`blocked-${i}`)]));
  const recovering = destination("recovering");
  const contended = destination("contended");
  const crashing = destination("crashing");
  const reported = join(tmp, "reported.json");
  const recovered = join(tmp, "recovered.txt");

  let said: Record<string, string> = {};
  let acquired = "";
  let revWhileHeld = -1;
  let mine = -1;
  let exit: number | null = null;
  let otherPid = -1;

  beforeAll(async () => {
    for (const [name, b] of Object.entries(BLOCKED)) {
      writeFileSync(lockOf(blocked[name]!), b.lock);
      if (b.recovery !== undefined) writeFileSync(breakOf(blocked[name]!), b.recovery);
    }
    // An old lock is no weaker than a new one.
    const past = new Date(Date.now() - 31_000);
    utimesSync(lockOf(blocked["a live holder on this host"]!), past, past);
    // A stopped holder's lock, which a live recoverer (this process) is in the middle of recovering.
    writeFileSync(lockOf(recovering), JSON.stringify(dead));
    writeFileSync(breakOf(recovering), JSON.stringify(live));

    // The other command. It tries each blocked destination with a short wait and reports what it was told; waits
    // for the recovery in progress; then changes the contended destination; then stops while holding a lock.
    const code = `
      import { writeFileSync } from "node:fs";
      import { withDestination, lockWait } from ${JSON.stringify(new URL("../src/git.ts", import.meta.url).href)};
      const bump = (o) => ({ ...o, rev: o.rev + 1 });
      const attempt = (dir) => { try { withDestination(dir, bump); return "ACQUIRED"; } catch (e) { return e.message; } };
      lockWait.ms = 20;
      const said = {};
      for (const [name, dir] of Object.entries(${JSON.stringify(blocked)})) said[name] = attempt(dir);
      writeFileSync(${JSON.stringify(reported)}, JSON.stringify(said));
      lockWait.ms = 8000;
      writeFileSync(${JSON.stringify(recovered)}, attempt(${JSON.stringify(recovering)}));
      withDestination(${JSON.stringify(contended)}, (o) => ({ ...o, rev: o.rev + 1, installed: { install: "newer", room: "B", lane: "B" } }));
      withDestination(${JSON.stringify(crashing)}, () => process.exit(7));`;
    const other = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: "ignore" });
    const exited = new Promise<number | null>((resolve) => other.on("exit", resolve));
    otherPid = other.pid!;
    const killer = setTimeout(() => other.kill("SIGKILL"), 15_000);
    try {
      for (let i = 0; i < 800 && !existsSync(reported); i++) await new Promise((r) => setTimeout(r, 5));
      if (!existsSync(reported)) throw new Error("The other command did not stop waiting on a lock it could not take.");
      said = JSON.parse(readFileSync(reported, "utf8")) as Record<string, string>;
      // It is now waiting on the recovery in progress. This command takes the contended lock, and only then lets
      // that recovery complete, so the other command reaches the contended destination while it is held.
      await new Promise((r) => setTimeout(r, 30));
      mine = withDestination(contended, (o) => {
        utimesSync(lockOf(contended), past, past); // older than any expiry: age must not matter
        for (const f of [breakOf(recovering), lockOf(recovering)]) rmSync(f);
        for (let i = 0; i < 600 && !existsSync(recovered); i++) sleepSync(5);
        if (!existsSync(recovered)) throw new Error("The other command did not take the lock after its recovery completed.");
        acquired = readFileSync(recovered, "utf8");
        sleepSync(60); // the other command is running, and must be waiting for this lock
        revWhileHeld = readOwner(contended).rev;
        return { ...o, rev: o.rev + 1, installed: { install: "older", room: "A", lane: "A" } };
      }).rev;
      exit = await exited;
    } finally {
      clearTimeout(killer);
      other.kill("SIGKILL");
    }
  }, 20_000);

  test("whatever is in the way is waited on within the deadline, then named, and never removed", () => {
    for (const [name, b] of Object.entries(BLOCKED)) {
      const dir = blocked[name]!;
      expect(said[name], name).toMatch(b.says);
      expect(readFileSync(lockOf(dir), "utf8"), name).toBe(b.lock);
      expect(existsSync(breakOf(dir)) ? readFileSync(breakOf(dir), "utf8") : undefined, name).toBe(b.recovery);
      expect(readOwner(dir).rev, name).toBe(0);
    }
  });

  test("a recovery that completes while a command waits lets it take the lock", () => {
    expect(acquired).toBe("ACQUIRED");
    expect(readOwner(recovering).rev).toBe(1);
    expect(existsSync(lockOf(recovering))).toBe(false);
  });

  test("an old lock held by a live command is never taken: the other command waits, then writes after it", () => {
    expect(revWhileHeld).toBe(mine - 1); // nothing was written while this command held the lock
    const final = readOwner(contended);
    expect(final.installed?.install).toBe("newer");
    expect(final.rev).toBe(mine + 1); // it read this command's write
    expect(existsSync(lockOf(contended))).toBe(false);
  });

  test("a holder that stopped is recovered: its process is gone on this host", () => {
    expect(exit).toBe(7);
    expect(JSON.parse(readFileSync(lockOf(crashing), "utf8"))).toMatchObject({ pid: otherPid, host: here });
    const next = withDestination(crashing, (o) => ({ ...o, rev: o.rev + 1 }));
    expect(next.rev).toBe(1);
    expect(existsSync(lockOf(crashing))).toBe(false);
  });
});

test("a holder that lost its lock writes nothing, and never removes the lock that replaced it", () => {
  const dir = destination("lost");
  const successor = { pid: process.pid, host: here, token: "successor" };
  expect(() =>
    withDestination(dir, (o) => {
      writeFileSync(lockOf(dir), JSON.stringify(successor)); // as if another holder now held it
      return { ...o, rev: o.rev + 1 };
    }),
  ).toThrow(/Lost the lock/);
  expect(readOwner(dir).rev).toBe(0);
  expect(JSON.parse(readFileSync(lockOf(dir), "utf8")).token).toBe("successor");
});

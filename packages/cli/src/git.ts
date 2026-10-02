/**
 * Git setup for a workspace: a remote named `artroom`, and the write token
 * as an `http.<remote>.extraHeader` in a separate file that the repository
 * config includes. The token goes only into that file, which is readable
 * only by the user; it is never a command argument and never printed.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { hostname } from "node:os";
import { isAbsolute, join } from "node:path";
import { writePrivate } from "./config.ts";

export const REMOTE = "artroom";
const INCLUDE = "artroom/credentials";

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tryGit(cwd: string, args: readonly string[]): string | undefined {
  try {
    return git(cwd, args);
  } catch {
    return undefined;
  }
}

/** The repository's shared `.git` directory, or undefined outside a repository. */
export function gitDir(cwd: string): string | undefined {
  const dir = tryGit(cwd, ["rev-parse", "--git-common-dir"]);
  if (dir === undefined) return undefined;
  return isAbsolute(dir) ? dir : join(cwd, dir);
}

export function head(cwd: string): string | undefined {
  return tryGit(cwd, ["rev-parse", "HEAD"]);
}

/** Where `configureWorkspace` writes the credential for the repository at `cwd`. */
export function credentialPath(cwd: string): string | undefined {
  const dir = gitDir(cwd);
  return dir === undefined ? undefined : join(dir, INCLUDE);
}

/** The first line of a credential file: the lane, lease and installation it was written for. */
const marker = (lane: string, lease: number, install: string) => `# artroom workspace credential for lane ${lane}, lease ${lease}, installation ${install}.`;

/**
 * Points the `artroom` remote at the fork and writes its credential, marked
 * with its lane, lease and installation ID. Returns the credential file's path.
 */
export function configureWorkspace(cwd: string, remote: string, token: string, lane: string, lease: number, install: string): string {
  const dir = gitDir(cwd);
  if (dir === undefined) throw new Error("not a git repository");
  if (tryGit(cwd, ["remote", "get-url", REMOTE]) === undefined) git(cwd, ["remote", "add", REMOTE, remote]);
  else git(cwd, ["remote", "set-url", REMOTE, remote]);
  const file = join(dir, INCLUDE);
  mkdirSync(join(dir, "artroom"), { recursive: true, mode: 0o700 });
  writePrivate(file, `${marker(lane, lease, install)}\n# Holds a write token: do not share or commit.\n[http "${remote}"]\n\textraHeader = Authorization: Bearer ${token}\n`);
  const includes = (tryGit(cwd, ["config", "--local", "--get-all", "include.path"]) ?? "").split("\n");
  if (!includes.includes(INCLUDE)) git(cwd, ["config", "--local", "--add", "include.path", INCLUDE]);
  return file;
}

/** Who a credential file belongs to, from its marker; undefined when there is no such file. */
export function credentialOwner(file: string): { lane: string; lease: number; install: string } | null | undefined {
  if (!existsSync(file)) return undefined;
  const first = readFileSync(file, "utf8").split("\n", 1)[0] ?? "";
  const m = /^# artroom workspace credential for lane (\S+), lease (\d+), installation (\S+)\.$/.exec(first);
  return m ? { lane: m[1]!, lease: Number(m[2]), install: m[3]! } : null;
}

/**
 * Removes the credential at `file` only if it is still the installation
 * `install`. A newer workspace, for this lane's next lease or for another
 * lane, has its own installation ID, and is kept.
 */
export function removeCredential(file: string, install: string): "removed" | "absent" | "kept" {
  const owner = credentialOwner(file);
  if (owner === undefined) return "absent";
  if (owner === null || owner.install !== install) return "kept";
  rmSync(file);
  return "removed";
}

// --------------------------------------------------------- the destination

/** One party at a destination: an installation of a Room's lane, for a lease once known. */
export interface Party {
  readonly install: string;
  readonly room: string;
  readonly lane: string;
  readonly lease?: number;
}

/**
 * The owner record of a repository's Artroom workspace,
 * `.git/artroom/owner.json`, shared by every Room and command that writes
 * this repository's `artroom` remote and credential. Three separate parts:
 *
 * - `installed`: the installation whose credential is in the file. It
 *   changes only when an installation completes or a release removes it,
 *   never when a workspace merely reserves, so cleanup evidence survives a
 *   failed or superseded reservation.
 * - `installing`: an installation writing the file now. Set before the
 *   file is replaced and cleared after, so a crash in between leaves
 *   evidence of what may be in the file.
 * - `reservation`: the latest workspace command to reserve the
 *   destination. A newer reservation replaces it, and only the current
 *   reservation may install: the fence for overlapping commands.
 *
 * `rev` is bumped by every change. Unrelated repositories have unrelated
 * records.
 */
export interface Owner {
  readonly v: 2;
  readonly rev: number;
  readonly installed?: Party;
  readonly installing?: Party;
  readonly reservation?: Party;
}

const OWNER = "artroom/owner.json";
const LOCK = "artroom/owner.lock";
const BREAK = "artroom/owner.lock.break";
const FREE: Owner = { v: 2, rev: 0 };

export function credentialFileIn(dir: string): string {
  return join(dir, INCLUDE);
}

/** Reads the owner record; version 1 (one combined state) is decoded into the three parts. */
export function readOwner(dir: string): Owner {
  const path = join(dir, OWNER);
  if (!existsSync(path)) return FREE;
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  if (raw["v"] === 2) return raw as unknown as Owner;
  if (raw["v"] !== 1) throw new Error(`${path} was written by a newer artroom (owner record ${String(raw["v"])}). Update artroom.`);
  const party = raw["install"] !== undefined ? ({ install: raw["install"], room: raw["room"], lane: raw["lane"], ...(raw["lease"] !== undefined ? { lease: raw["lease"] } : {}) } as Party) : undefined;
  const rev = raw["rev"] as number;
  if (raw["state"] === "installed" && party) return { v: 2, rev, installed: party };
  if (raw["state"] === "reserved" && party) return { v: 2, rev, reservation: party };
  return { v: 2, rev };
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Who holds a lock file: this process's ID and host, and a token unique to this acquisition. */
interface Holder {
  readonly pid: number;
  readonly host: string;
  readonly token: string;
}

function readHolder(path: string): Holder | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Holder;
  } catch {
    return undefined; // absent, or being written by its creator this instant
  }
}

/** True only when the holder is provably gone: on this host, and no process has its ID. */
function provablyDead(h: Holder): boolean {
  if (h.host !== hostname()) return false;
  try {
    process.kill(h.pid, 0);
    return false;
  } catch (e) {
    return (e as { code?: string }).code === "ESRCH";
  }
}

/** Creates a lock file exclusively, holding `holder`; false if it exists. */
function create(path: string, holder: Holder): boolean {
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (e) {
    if ((e as { code?: string }).code === "EEXIST") return false;
    throw e;
  }
  try {
    writeSync(fd, JSON.stringify(holder));
  } finally {
    closeSync(fd);
  }
  return true;
}

/** Removes the lock at `path` only if it still holds `token`: never a successor's. */
function removeIfHeld(path: string, token: string): void {
  if (readHolder(path)?.token === token) rmSync(path);
}

/**
 * Recovers a lock whose holder is provably dead. Recoverers are serialised
 * by a second exclusive file, so between reading the dead holder's token and
 * removing its lock, nobody else can remove or replace it: a successor can
 * only create the lock after it is gone. Age is never evidence.
 *
 * A recovery file left by a recoverer that itself crashed is not removed
 * automatically: nothing would serialise two commands removing it. The
 * error names the file for the user to remove.
 */
function recover(dir: string, dead: Holder, me: Holder): void {
  const breakPath = join(dir, BREAK);
  if (!create(breakPath, me)) {
    const breaker = readHolder(breakPath);
    if (breaker !== undefined && provablyDead(breaker)) {
      throw new Error(`${breakPath} was left by an artroom command that stopped while recovering a lock. Remove that file by hand, then try again.`);
    }
    return; // another command is recovering now
  }
  try {
    if (readHolder(join(dir, LOCK))?.token === dead.token) rmSync(join(dir, LOCK));
  } finally {
    removeIfHeld(breakPath, me.token);
  }
}

/** Holds the destination's lock while `body` runs; waits for a live holder, recovers a dead one. */
function locked<T>(dir: string, body: (stillHeld: () => void) => T, waitMs: number): T {
  mkdirSync(join(dir, "artroom"), { recursive: true, mode: 0o700 });
  const path = join(dir, LOCK);
  const me: Holder = { pid: process.pid, host: hostname(), token: randomUUID() };
  const deadline = Date.now() + waitMs;
  while (!create(path, me)) {
    const holder = readHolder(path);
    if (holder !== undefined && provablyDead(holder)) {
      recover(dir, holder, me);
      continue;
    }
    if (Date.now() > deadline) {
      throw new Error(
        holder !== undefined && holder.host !== hostname()
          ? `${path} is held by a process on ${holder.host}. If that command has stopped, remove the file by hand.`
          : `${path} is held by another artroom command (process ${holder?.pid ?? "unknown"}). Wait for it to finish, then try again.`,
      );
    }
    sleep(10);
  }
  const stillHeld = () => {
    if (readHolder(path)?.token !== me.token) throw new Error(`Lost the lock on ${path}; nothing more was written. Run the command again.`);
  };
  try {
    return body(stillHeld);
  } finally {
    removeIfHeld(path, me.token);
  }
}

/** How long to wait for another command's lock. Tests shorten it. */
export const lockWait = { ms: 10_000 };

/**
 * Reads the owner, lets `change` act on the destination and return the new
 * owner (or undefined to change nothing), and writes it atomically, all
 * while holding the destination's lock. The lock is checked again just
 * before the owner is written. Returns the owner as it then is.
 */
export function withDestination(dir: string, change: (owner: Owner, save: (next: Owner) => void) => Owner | undefined): Owner {
  return locked(
    dir,
    (stillHeld) => {
      const save = (next: Owner) => {
        stillHeld();
        writePrivate(join(dir, OWNER), `${JSON.stringify(next, null, 2)}\n`);
      };
      const owner = readOwner(dir);
      const next = change(owner, save);
      if (next === undefined) return owner;
      save(next);
      return next;
    },
    lockWait.ms,
  );
}

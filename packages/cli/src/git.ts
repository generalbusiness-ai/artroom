/**
 * Git setup for a workspace: a remote named `artroom`, and the write token
 * as an `http.<remote>.extraHeader` in a separate file that the repository
 * config includes. The token goes only into that file, which is readable
 * only by the user; it is never a command argument and never printed.
 */

import { execFileSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync } from "node:fs";
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

/**
 * The owner of a repository's Artroom workspace: one record in
 * `.git/artroom/owner.json`, shared by every Room and every command that
 * writes this repository's `artroom` remote and credential. Each change
 * bumps `rev` and names who made it (`by`). A workspace reserves the
 * destination before its first await and installs only if `rev` is still
 * its reservation's; a release changes it only if `rev` is still the one it
 * saw before it was sent. Unrelated repositories have unrelated records.
 */
export interface Owner {
  readonly v: 1;
  readonly rev: number;
  readonly by: string;
  readonly state: "free" | "reserved" | "installed" | "released";
  readonly room?: string;
  readonly lane?: string;
  readonly lease?: number;
  readonly install?: string;
}

const OWNER = "artroom/owner.json";
const LOCK = "artroom/owner.lock";
const FREE: Owner = { v: 1, rev: 0, by: "", state: "free" };

export function credentialFileIn(dir: string): string {
  return join(dir, INCLUDE);
}

export function readOwner(dir: string): Owner {
  const path = join(dir, OWNER);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Owner) : FREE;
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** An exclusive lock on the destination, for one read-compare-write; a lock older than 30 s is a crashed command's. */
function lock(dir: string): () => void {
  mkdirSync(join(dir, "artroom"), { recursive: true, mode: 0o700 });
  const path = join(dir, LOCK);
  for (let i = 0; ; i++) {
    try {
      closeSync(openSync(path, "wx", 0o600));
      return () => rmSync(path, { force: true });
    } catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(path).mtimeMs > 30_000) {
          rmSync(path, { force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (i > 500) throw new Error(`${path} is held by another artroom command.`);
      sleep(10);
    }
  }
}

/**
 * Reads the owner, lets `change` act on the destination and return the new
 * owner (or undefined to change nothing), and writes it atomically, all
 * under the destination's lock. Returns the owner as it then is.
 */
export function withDestination(dir: string, change: (owner: Owner) => Owner | undefined): Owner {
  const unlock = lock(dir);
  try {
    const owner = readOwner(dir);
    const next = change(owner);
    if (next === undefined) return owner;
    writePrivate(join(dir, OWNER), `${JSON.stringify(next, null, 2)}\n`);
    return next;
  } finally {
    unlock();
  }
}

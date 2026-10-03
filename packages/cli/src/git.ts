/**
 * Git setup for a workspace: a remote named `artroom`, and the write token
 * as an `http.<remote>.extraHeader` in a separate file that the repository
 * config includes. The token goes only into that file, which is readable
 * only by the user; it is never a command argument and never printed.
 *
 * Every value in that file is checked before anything is written: the
 * room's remote and token (`checkGrant`), and the lane, lease and
 * installation ID in its first-line mark (`checkMarker`). The lane and lease
 * come from the room too. No pattern admits a character that git config
 * treats specially (quote, backslash, `#`, `;`, `]`, whitespace or newline),
 * so the file is always one comment mark and exactly one setting (request
 * 55be0661). The file is written directly, not
 * by `git config`, because that would put the token in a command argument.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { hostname } from "node:os";
import { isAbsolute, join } from "node:path";
import { isActId } from "@generalbusiness/artroom-contract";
import { writePrivate } from "./config.ts";

export const REMOTE = "artroom";
const INCLUDE = "artroom/credentials";

/**
 * How git is run: `git <args>` in `cwd`, giving its trimmed output and
 * throwing when git fails. Tests of what artroom decides, not of git itself,
 * put a stand-in here (test/harness.ts).
 */
export const gitCommand = {
  run: (cwd: string, args: readonly string[]): string => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(),
};

function git(cwd: string, args: readonly string[]): string {
  return gitCommand.run(cwd, args);
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
 * A grant's remote: an `https://` URL of a host, optional port and path,
 * already in normal form, with no credentials, query or fragment, and none
 * of the characters that are special to git config or a shell.
 */
const GRANT_REMOTE = /^https:\/\/[a-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~\/-]*)?$/;

/** A grant's token: the bearer token characters (RFC 6750 b64token), and `?` and `=` for an Artifacts token's expiry. */
const GRANT_TOKEN = /^[A-Za-z0-9._~+\/?=-]{1,4096}$/;

/** Normal form, and a string: `href` equals only a string the parser would not rewrite. */
function normal(u: unknown): boolean {
  try {
    return new URL(u as string).href === u;
  } catch {
    return false;
  }
}

/**
 * An MCP URL the CLI prints inside a shell command (`claude mcp add ...`):
 * `http` or `https`, in normal form, with only characters a shell takes
 * literally. A room that is not on https is the room's choice; what is
 * checked here is that the printed command is the command it appears to be.
 */
const MCP_URL = /^https?:\/\/[a-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~\/-]*)?$/;

/** Throws unless a redemption's MCP URL and bearer token are safe to save and print (request 55be0661). */
export function checkRedeemed(mcp: unknown, bearer: unknown): void {
  if (!MCP_URL.test(mcp as string) || !normal(mcp)) throw new Error("The room sent an MCP URL that is not a plain URL. Nothing was saved; tell the room's admin.");
  if (typeof bearer !== "string" || !GRANT_TOKEN.test(bearer)) throw new Error("The room sent a bearer token with characters a token cannot have. Nothing was saved; tell the room's admin.");
}

/** Throws, naming neither value, unless the room's remote and token are safe to write (request 55be0661). */
export function checkGrant(remote: string, token: string): void {
  if (!GRANT_REMOTE.test(remote) || !normal(remote)) throw new Error("The room sent a workspace remote that is not a plain https:// URL. Nothing was written; tell the room's admin.");
  if (typeof token !== "string" || !GRANT_TOKEN.test(token)) throw new Error("The room sent a workspace token with characters a token cannot have. Nothing was written; tell the room's admin.");
}

/**
 * Throws unless the credential file's mark will be one comment line: the
 * lane a canonical lane ID (`act_<seq>_<hash8>`), the lease a whole number,
 * and the installation ID an idempotency key. The lane and lease come from
 * the room (request 55be0661).
 */
export function checkMarker(lane: unknown, lease: unknown, install: unknown): void {
  if (!isActId(lane)) throw new Error("The lane is not a lane ID (act_<number>_<8 hex digits>). Nothing was written; if the room sent it, tell the room's admin.");
  if (!Number.isSafeInteger(lease) || (lease as number) < 0) throw new Error("The room sent a lease that is not a whole number. Nothing was written; tell the room's admin.");
  if (typeof install !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(install)) throw new Error("The installation ID is not an idempotency key. Nothing was written.");
}

/**
 * Points the `artroom` remote at the fork and writes its credential, marked
 * with its lane, lease and installation ID. Returns the credential file's path.
 * Every value written is checked first, before anything changes.
 */
export function configureWorkspace(cwd: string, remote: string, token: string, lane: string, lease: number, install: string): string {
  checkGrant(remote, token);
  checkMarker(lane, lease, install);
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
 * - `pending`: installations that recorded themselves before replacing
 *   the file and have not been settled. Plural: a later installer adds
 *   itself and never drops an earlier entry, so evidence of a credential
 *   that may still be in the file survives any number of interruptions.
 *   Only a completed replacement of the file settles them all (their
 *   credentials, if ever written, are then provably gone), and a release
 *   settles its own.
 * - `reservation`: the latest workspace command to reserve the
 *   destination. A newer reservation replaces it, and only the current
 *   reservation may install: the fence for overlapping commands.
 *
 * `rev` is bumped by every change. Unrelated repositories have unrelated
 * records.
 */
export interface Owner {
  readonly v: 3;
  readonly rev: number;
  readonly installed?: Party;
  readonly pending?: readonly Party[];
  readonly reservation?: Party;
}

const OWNER = "artroom/owner.json";
const LOCK = "artroom/owner.lock";
const BREAK = "artroom/owner.lock.break";
const FREE: Owner = { v: 3, rev: 0 };

export function credentialFileIn(dir: string): string {
  return join(dir, INCLUDE);
}

/** Reads the owner record. Version 1 (one combined state) and version 2 (one `installing` slot) are decoded. */
export function readOwner(dir: string): Owner {
  const path = join(dir, OWNER);
  if (!existsSync(path)) return FREE;
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  if (raw["v"] === 3) return raw as unknown as Owner;
  const rev = raw["rev"] as number;
  if (raw["v"] === 2) {
    const { installing, installed, reservation } = raw as { installing?: Party; installed?: Party; reservation?: Party };
    return { v: 3, rev, ...(installed ? { installed } : {}), ...(installing ? { pending: [installing] } : {}), ...(reservation ? { reservation } : {}) };
  }
  if (raw["v"] !== 1) throw new Error(`${path} was written by a newer artroom (owner record ${String(raw["v"])}). Update artroom.`);
  const party = raw["install"] !== undefined ? ({ install: raw["install"], room: raw["room"], lane: raw["lane"], ...(raw["lease"] !== undefined ? { lease: raw["lease"] } : {}) } as Party) : undefined;
  if (raw["state"] === "installed" && party) return { v: 3, rev, installed: party };
  if (raw["state"] === "reserved" && party) return { v: 3, rev, reservation: party };
  return { v: 3, rev };
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
 * Tries to recover a lock whose holder is provably dead. Recoverers are
 * serialised by a second exclusive file, so between reading the dead
 * holder's token and removing its lock, nobody else can remove or replace
 * it: a successor can only create the lock after it is gone. Age is never
 * evidence.
 *
 * Returns true when the lock was recovered (or vanished), or else what is
 * in the way, for the caller to wait on, within its deadline, and name.
 * A recovery file is never removed by anyone but its own creator: not when
 * it is another host's, not when it is empty (a recoverer may be between
 * creating it and writing it, or may have crashed there), and not when its
 * creator crashed, since nothing would serialise two commands removing it.
 */
function recover(dir: string, dead: Holder, me: Holder): true | string {
  const breakPath = join(dir, BREAK);
  if (!create(breakPath, me)) {
    const breaker = readHolder(breakPath);
    if (breaker === undefined) return `${breakPath} is empty or unreadable. If no artroom command is running, remove it by hand`;
    if (breaker.host !== hostname()) return `${breakPath} belongs to a process on ${breaker.host}. If that command has stopped, remove it by hand`;
    if (provablyDead(breaker)) return `${breakPath} was left by an artroom command that stopped while recovering a lock. Remove that file by hand`;
    return `the lock is being recovered by process ${breaker.pid}`;
  }
  try {
    if (readHolder(join(dir, LOCK))?.token === dead.token) rmSync(join(dir, LOCK));
  } finally {
    removeIfHeld(breakPath, me.token);
  }
  return true;
}

/**
 * Holds the destination's lock while `body` runs. Every unsuccessful
 * attempt, to acquire or to recover, waits briefly and counts against one
 * deadline; at the deadline the error names what is in the way.
 */
function locked<T>(dir: string, body: (stillHeld: () => void) => T, waitMs: number): T {
  mkdirSync(join(dir, "artroom"), { recursive: true, mode: 0o700 });
  const path = join(dir, LOCK);
  const me: Holder = { pid: process.pid, host: hostname(), token: randomUUID() };
  const deadline = Date.now() + waitMs;
  while (!create(path, me)) {
    const holder = readHolder(path);
    let blocked: string;
    if (holder === undefined) blocked = `${path} is empty or unreadable. If no artroom command is running, remove it by hand`;
    else if (holder.host !== hostname()) blocked = `${path} is held by a process on ${holder.host}. If that command has stopped, remove the file by hand`;
    else if (!provablyDead(holder)) blocked = `${path} is held by another artroom command (process ${holder.pid}). Wait for it to finish, then try again`;
    else {
      const recovered = recover(dir, holder, me);
      if (recovered === true) continue;
      blocked = `${path} was left by a stopped command, and ${recovered}`;
    }
    if (Date.now() > deadline) throw new Error(`${blocked}.`);
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

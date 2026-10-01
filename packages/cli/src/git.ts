/**
 * Git setup for a workspace: a remote named `artroom`, and the write token
 * as an `http.<remote>.extraHeader` in a separate file that the repository
 * config includes. The token goes only into that file, which is readable
 * only by the user; it is never a command argument and never printed.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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

/** The first line of a credential file, naming the lane and lease it was written for. */
const marker = (lane: string, lease: number) => `# artroom workspace credential for lane ${lane}, lease ${lease}.`;

/**
 * Points the `artroom` remote at the fork and writes its credential, marked
 * with the lane it belongs to. Returns the credential file's path.
 */
export function configureWorkspace(cwd: string, remote: string, token: string, lane: string, lease: number): string {
  const dir = gitDir(cwd);
  if (dir === undefined) throw new Error("not a git repository");
  if (tryGit(cwd, ["remote", "get-url", REMOTE]) === undefined) git(cwd, ["remote", "add", REMOTE, remote]);
  else git(cwd, ["remote", "set-url", REMOTE, remote]);
  const file = join(dir, INCLUDE);
  mkdirSync(join(dir, "artroom"), { recursive: true, mode: 0o700 });
  writePrivate(file, `${marker(lane, lease)}\n# Holds a write token: do not share or commit.\n[http "${remote}"]\n\textraHeader = Authorization: Bearer ${token}\n`);
  const includes = (tryGit(cwd, ["config", "--local", "--get-all", "include.path"]) ?? "").split("\n");
  if (!includes.includes(INCLUDE)) git(cwd, ["config", "--local", "--add", "include.path", INCLUDE]);
  return file;
}

/** The lane a credential file belongs to, from its marker; undefined when there is no such file. */
export function credentialLane(file: string): string | undefined {
  if (!existsSync(file)) return undefined;
  const first = readFileSync(file, "utf8").split("\n", 1)[0] ?? "";
  return /^# artroom workspace credential for lane (\S+), lease \d+\.$/.exec(first)?.[1] ?? "";
}

/**
 * Removes the credential at `file` only if it still belongs to `lane`. A
 * newer workspace for another lane may have replaced it; that one is kept.
 */
export function removeCredential(file: string, lane: string): "removed" | "absent" | "kept" {
  const owner = credentialLane(file);
  if (owner === undefined) return "absent";
  if (owner !== lane) return "kept";
  rmSync(file);
  return "removed";
}

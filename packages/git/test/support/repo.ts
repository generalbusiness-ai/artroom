/**
 * Test support: real local repositories, made with the `git` program in the
 * system's temporary directory and removed afterwards. A local repository is
 * not a host: it shows what Git's objects, refs and push command do, and
 * nothing about a host's server, its reads after a write, or its tokens.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitProgram, type Exec } from "../../src/program.ts";
import { nodeExec } from "../../src/node.ts";

const ENV = {
  PATH: process.env["PATH"] ?? "/usr/bin:/bin",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  HOME: "/nonexistent",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@artroom.invalid",
  GIT_AUTHOR_DATE: "@1700000000 +0000",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@artroom.invalid",
  GIT_COMMITTER_DATE: "@1700000000 +0000",
};

/** Run the real `git` in `dir`, with an argument array and no shell. Its output, trimmed. */
export const git = (dir: string, args: readonly string[], input?: string | Uint8Array): string =>
  execFileSync("git", ["-C", dir, ...args], { env: ENV, input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

const made: string[] = [];

/** A new directory under the system's temporary directory. `cleanup` removes every one. */
export function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "artroom-git-"));
  made.push(dir);
  return dir;
}

export function cleanup(): void {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** A new bare repository. Its objects stay loose, so a test can remove one. */
export function bare(): string {
  const dir = join(scratch(), "repo.git");
  execFileSync("git", ["init", "-q", "--bare", dir], { env: ENV });
  return dir;
}

export const blob = (dir: string, content: string): string => git(dir, ["hash-object", "-w", "--stdin"], content);
/** A tree from `mode type id<TAB>name` lines. `--missing`: an entry may name an object that is not here, as a gitlink does. */
export const tree = (dir: string, lines: readonly string[]): string => git(dir, ["mktree", "--missing"], lines.map((l) => `${l}\n`).join(""));
export const commit = (dir: string, treeId: string, parents: readonly string[], message = "work"): string =>
  git(dir, ["commit-tree", treeId, ...parents.flatMap((p) => ["-p", p]), "-m", message]);
/** A commit object from its exact text. Git checks the form of each line and not what a line names. */
export const rawCommit = (dir: string, text: string): string => git(dir, ["hash-object", "-t", "commit", "-w", "--stdin"], text);

const WHO = "Test <test@artroom.invalid> 1700000000 +0000";
export const commitText = (treeId: string, parents: readonly string[]): string =>
  `tree ${treeId}\n${parents.map((p) => `parent ${p}\n`).join("")}author ${WHO}\ncommitter ${WHO}\n\nwork\n`;

/** The package's own runner over the real `git`, for a repository on this machine. `seen` records every command line and environment. */
export function program(seen?: { argv: string[]; env: string[] }): GitProgram {
  const exec: Exec = (argv, opts) => {
    seen?.argv.push(argv.join(" "));
    seen?.env.push(JSON.stringify(opts.env));
    return nodeExec(argv, opts);
  };
  return new GitProgram({ exec, transport: "local", timeoutMs: 30_000 });
}

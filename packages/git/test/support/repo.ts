/**
 * Test support: real local repositories, made with the `git` program in the
 * system's temporary directory and removed afterwards. A local repository is
 * not a host: it shows what Git's objects, refs and push command do, and
 * nothing about a host's server, its reads after a write, or its tokens.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
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

/**
 * Fixture objects are written straight into the object directory, as Git writes a loose object: zlib of `<type> <size>\0<content>`
 * under its SHA-1. That costs no process. The ID comes from Node's own SHA-1, not from the package under test, so a fault in the
 * package's hash cannot hide in the fixture. `confirm` asks the real `git` once per repository whether it reads every object
 * written here with the type and size written.
 */
const written = new Map<string, Map<string, { type: string; size: number }>>();

/** Write one object into `dir` and return its ID. */
export function put(dir: string, type: "blob" | "tree" | "commit" | "tag", content: string | Uint8Array): string {
  const body = typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
  const whole = Buffer.concat([Buffer.from(`${type} ${body.length}\0`), body]);
  const id = createHash("sha1").update(whole).digest("hex");
  const path = join(dir, "objects", id.slice(0, 2), id.slice(2));
  if (!existsSync(path)) {
    mkdirSync(join(dir, "objects", id.slice(0, 2)), { recursive: true });
    writeFileSync(path, deflateSync(whole), { mode: 0o444 });
  }
  if (!written.has(dir)) written.set(dir, new Map());
  written.get(dir)!.set(id, { type, size: body.length });
  return id;
}

/** One `git cat-file --batch-check` over every object written to `dir` so far: Git reads each, with the type and size written. */
export function confirm(dir: string): string[] {
  const objects = written.get(dir) ?? new Map();
  const out = git(dir, ["cat-file", "--batch-check"], [...objects.keys()].map((id) => `${id}\n`).join("")).split("\n");
  return out.filter((line, i) => { const [id, o] = [[...objects.keys()][i]!, [...objects.values()][i]!]; return line !== `${id} ${o.type} ${o.size}`; });
}

/** A ref, written as Git does for a loose ref. */
export const setRef = (dir: string, ref: string, id: string): void => {
  mkdirSync(join(dir, ref, ".."), { recursive: true });
  writeFileSync(join(dir, ref), `${id}\n`);
};

/** What a ref holds in a repository on this machine, or null. A loose ref is read as a file. Anything else is asked of `git`. */
export function refAt(dir: string, ref: string): string | null {
  try {
    return readFileSync(join(dir, ref), "utf8").trim();
  } catch {
    try { return git(dir, ["rev-parse", "--verify", "-q", ref]); } catch { return null; }
  }
}

export const blob = (dir: string, content: string): string => put(dir, "blob", content);

/** A tree from `mode type id<TAB>name` lines, in Git's order. An entry may name an object that is not here, as a gitlink does. */
export function tree(dir: string, lines: readonly string[]): string {
  const entries = lines.map((l) => { const [head, name] = l.split("\t") as [string, string]; const [mode, , id] = head.split(" ") as [string, string, string]; return { mode: String(Number(mode)), name, id }; });
  // Git sorts names as bytes, and a directory as if its name ended in a slash.
  const key = (e: { mode: string; name: string }) => Buffer.from(e.mode === "40000" ? `${e.name}/` : e.name);
  entries.sort((a, b) => Buffer.compare(key(a), key(b)));
  return put(dir, "tree", Buffer.concat(entries.map((e) => Buffer.concat([Buffer.from(`${e.mode} ${e.name}\0`), Buffer.from(e.id, "hex")]))));
}

const WHO = "Test <test@artroom.invalid> 1700000000 +0000";
export const commitText = (treeId: string, parents: readonly string[], message = "work"): string =>
  `tree ${treeId}\n${parents.map((p) => `parent ${p}\n`).join("")}author ${WHO}\ncommitter ${WHO}\n\n${message}\n`;
export const commit = (dir: string, treeId: string, parents: readonly string[], message = "work"): string => put(dir, "commit", commitText(treeId, parents, message));
/** A commit object from its exact text. Git checks the form of each line and not what a line names. */
export const rawCommit = (dir: string, text: string): string => put(dir, "commit", text);
/** An annotated tag of a commit. */
export const tag = (dir: string, target: string, name: string): string => put(dir, "tag", `object ${target}\ntype commit\ntag ${name}\ntagger T <t@artroom.invalid> 1700000000 +0000\n\n${name}\n`);

/** The package's own runner over the real `git`, for a repository on this machine. `seen` records every command line and environment. */
export function program(seen?: { argv: string[]; env: string[] }): GitProgram {
  const exec: Exec = (argv, opts) => {
    seen?.argv.push(argv.join(" "));
    seen?.env.push(JSON.stringify(opts.env));
    return nodeExec(argv, opts);
  };
  return new GitProgram({ exec, transport: "local", timeoutMs: 30_000 });
}

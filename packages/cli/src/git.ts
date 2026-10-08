/**
 * The `git` program under Node, for `clone`: one run with the arguments
 * given, its own output to the person's terminal, and the environment of
 * this process with the configuration that the command adds. A secret goes
 * only in that added environment, which git reads as configuration
 * (`GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_n`, `GIT_CONFIG_VALUE_n`): it is in no
 * argument or a config file written by this runner. The child program
 * controls its own output; it inherits the terminal streams. The installed
 * program, ambient environment and Git configuration are trusted, including
 * URL rewrites, proxies, redirects and helpers. This is not a sandbox for
 * the global http.extraHeader supplied by clone. No git on the
 * `PATH`: the answer is null.
 */

import { spawn } from "node:child_process";
import { editPath } from "@generalbusiness/artroom-platform";
import type { Git } from "./commands.ts";

export type GitFiles = { ok: true; tip: string; files: readonly { path: string; bytes: Uint8Array }[] } | { ok: false; reason: string };

const FILE_BYTES = 65536;
const FILE_COUNT = 64;
const hash = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const strictText = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// Read only immutable committed objects. The working tree, index and remote
// refs are never read as sources or changed. Ambient Git configuration and
// the installed program remain trusted, as they are for run().
function capture(program: string, args: readonly string[], limit: number, cwd?: string): Promise<{ code: number; bytes: Buffer } | null> {
  return new Promise((resolve) => {
    const child = spawn(program, [...args], { ...(cwd === undefined ? {} : { cwd }), stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1", GIT_OPTIONAL_LOCKS: "0" } });
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) { over = true; child.kill(); }
      else chunks.push(chunk);
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve({ code: over ? -1 : code ?? 1, bytes: Buffer.concat(chunks) }));
  });
}

async function committedFiles(program: string, base: string, branch: string, cwd?: string): Promise<GitFiles> {
  const refuse = (reason: string): GitFiles => ({ ok: false, reason });
  const read = (args: readonly string[], limit: number) => capture(program, args, limit, cwd);
  if (!hash.test(base)) return refuse("invalid-base: expected a complete committed object ID");
  if (branch.length === 0 || branch.startsWith("-") || branch === "HEAD") return refuse("invalid-branch: expected a local branch name");
  const ref = `refs/heads/${branch}`;
  const valid = await read(["check-ref-format", ref], 1024);
  if (valid === null) return refuse("git-unavailable: cannot run git");
  if (valid.code !== 0) return refuse("invalid-branch: expected a local branch name");
  const baseRead = await read(["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`], 256);
  if (baseRead?.code !== 0 || baseRead.bytes.toString("ascii").trim() !== base) return refuse("invalid-base: the room head is not a local commit");
  const branchRead = await read(["show-ref", "--verify", "--hash", ref], 256);
  const tip = branchRead?.bytes.toString("ascii").trim() ?? "";
  if (branchRead?.code !== 0 || !hash.test(tip)) return refuse("branch-not-found: expected an existing local branch");
  const tipRead = await read(["cat-file", "-t", tip], 32);
  if (tipRead?.code !== 0 || tipRead.bytes.toString("ascii").trim() !== "commit") return refuse("invalid-branch: local branch does not name a commit");
  const ancestor = await read(["merge-base", "--is-ancestor", base, tip], 1024);
  if (ancestor?.code !== 0) return refuse("base-not-ancestor: the local branch does not descend from the room head");
  // -z retains names verbatim, including spaces and Unicode. Disable external
  // diff/text conversion; rename detection makes its unsupported status explicit.
  const delta = await read(["diff-tree", "--no-commit-id", "--raw", "-r", "-z", "--no-abbrev", "--no-ext-diff", "--no-textconv", "--find-renames", base, tip, "--"], (FILE_COUNT + 1) * (2 * 1024 + 256));
  if (delta === null || delta.code !== 0) return refuse(delta?.code === -1 ? "capture-too-large: committed change metadata exceeds capture bounds" : "git-read-failed: cannot read the committed change");
  const records = delta.bytes.toString("latin1").split("\0");
  const files: { path: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < records.length - 1; i += 2) {
    const header = records[i]!;
    const fields = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])\d*$/.exec(header);
    if (!fields) return refuse("git-read-failed: malformed committed change metadata");
    const [, oldMode, mode, , object, status] = fields;
    if (status === "D") return refuse("unsupported-deletion: a file proposal cannot delete a path");
    if (status === "R" || status === "C") return refuse("unsupported-rename: a file proposal cannot rename or copy a path");
    if (status !== "A" && status !== "M") return refuse("unsupported-change: a file proposal requires an added or modified file");
    if ((mode !== "100644" && mode !== "100755") || (status === "A" ? mode !== "100644" : mode !== oldMode)) return refuse("unsupported-mode: a file proposal cannot carry this file type or mode change");
    let path: string;
    try { path = strictText.decode(Buffer.from(records[i + 1]!, "latin1")); }
    catch { return refuse("invalid-path: a committed path is not UTF-8"); }
    if (editPath(path) === null) return refuse("invalid-path: a committed path is outside the published path bounds");
    if (files.length === FILE_COUNT) return refuse("too-many-files: a proposal carries at most 64 changed files");
    const blob = await read(["cat-file", "blob", object!], FILE_BYTES);
    if (blob === null || blob.code !== 0) return refuse(blob?.code === -1 ? "file-too-large: a changed file exceeds 65536 bytes" : "git-read-failed: cannot read a committed file");
    try { strictText.decode(blob.bytes); }
    catch { return refuse("non-utf8-file: a changed file is not UTF-8 text"); }
    files.push({ path, bytes: new Uint8Array(blob.bytes) });
  }
  if (files.length === 0) return refuse("no-changed-files: the branch has no changed files against the room head");
  return { ok: true, tip, files };
}

export function nodeGit(program = "git", cwd?: string): Git & { files(base: string, branch: string): Promise<GitFiles> } {
  return {
    files: (base, branch) => committedFiles(program, base, branch, cwd),
    run: (args, env) => new Promise((resolve) => {
      const child = spawn(program, [...args], { ...(cwd === undefined ? {} : { cwd }), env: { ...process.env, ...env }, stdio: ["ignore", "inherit", "inherit"] });
      child.on("error", (error: NodeJS.ErrnoException) => resolve(error.code === "ENOENT" ? null : 1));
      child.on("close", (code) => resolve(code ?? 1));
    }),
  };
}

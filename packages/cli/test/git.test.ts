import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { nodeGit } from "../src/git.ts";

// Invariant: the Node runner of `clone` gives git a secret only as configuration in git's environment, never as an argument; with
// no git on the PATH it answers null, so `clone` signs nothing.
//
// The `git` here is a STAND-IN: a shell script on the PATH that records its arguments and the three variables of git's environment
// configuration, and exits 0. No repository is cloned.
test("the Node runner passes the header only through git's environment configuration, never in the arguments; with no git on the PATH it answers null", async () => {
  const bin = mkdtempSync(join(tmpdir(), "artroom-clone-"));
  try {
    const record = join(bin, "record");
    writeFileSync(join(bin, "git"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${record}.args"\nprintf '%s|%s|%s\\n' "$GIT_CONFIG_COUNT" "$GIT_CONFIG_KEY_0" "$GIT_CONFIG_VALUE_0" > "${record}.env"\nexit 0\n`);
    chmodSync(join(bin, "git"), 0o755);
    const path = process.env["PATH"];
    process.env["PATH"] = `${bin}:${path}`;
    try {
      const env = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: "Authorization: Bearer read-plaintext-1" };
      expect(await nodeGit().run(["clone", "--", "https://service.invalid/git/artroom-demo/r.git", "here"], env)).toBe(0);
      const args = readFileSync(`${record}.args`, "utf8");
      expect(args).toBe("clone\n--\nhttps://service.invalid/git/artroom-demo/r.git\nhere\n");
      expect(args).not.toContain("read-plaintext-1");
      expect(readFileSync(`${record}.env`, "utf8")).toBe("1|http.extraHeader|Authorization: Bearer read-plaintext-1\n");
    } finally {
      if (path === undefined) delete process.env["PATH"];
      else process.env["PATH"] = path;
    }
    // No git: the program is not found, and the answer is null. Control: the same runner over the stand-in answers 0, above.
    expect(await nodeGit(join(bin, "no-such-git")).run(["--version"], {})).toBeNull();
  } finally { rmSync(bin, { recursive: true, force: true }); }
});

function repository(format: "sha1" | "sha256" = "sha1") {
  const dir = mkdtempSync(join(tmpdir(), "artroom-propose-git-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir }).toString("utf8").trim();
  git("init", "--quiet", `--object-format=${format}`, "--initial-branch=main");
  git("config", "user.name", "Git capture test");
  git("config", "user.email", "capture@artroom.invalid");
  git("config", "core.fileMode", "true");
  const write = (path: string, bytes: string | Uint8Array) => writeFileSync(join(dir, path), bytes);
  const commit = () => { git("add", "--all"); git("commit", "--quiet", "-m", "capture fixture"); return git("rev-parse", "HEAD"); };
  write("changed.txt", "base\n");
  write("executable", "base command\n");
  chmodSync(join(dir, "executable"), 0o755);
  const base = commit();
  git("checkout", "--quiet", "-b", "source");
  return { dir, git, write, commit, base, runner: nodeGit("git", dir) };
}

// Invariant: source capture reads every committed changed file from one fixed
// branch tip, preserving bytes and names, without touching dirty/index/private
// state. These are real local Git repositories, with no host or room stand-in.
test.each(["sha1", "sha256"] as const)("captures the committed %s tip and every file while leaving local state untouched", async (format) => {
  const r = repository(format);
  try {
    mkdirSync(join(r.dir, "nested"));
    r.write("changed.txt", "committed\n");
    r.write("nested/été file.txt", "\uFEFFé melody\n");
    r.write("nul-text", "text\u0000still UTF-8\n");
    r.write("executable", "changed command\n");
    const tip = r.commit();
    r.write("changed.txt", "staged local content\n");
    r.git("add", "changed.txt");
    r.write("changed.txt", "unstaged local content\n");
    r.write("private-untracked", "private untouched\n");
    const before = { status: r.git("status", "--porcelain=v1"), index: readFileSync(join(r.dir, ".git/index")), refs: r.git("show-ref"), private: readFileSync(join(r.dir, "private-untracked")) };
    expect(await r.runner.files(r.base, "source")).toEqual({ ok: true, tip, files: [
      { path: "changed.txt", bytes: new TextEncoder().encode("committed\n") },
      { path: "executable", bytes: new TextEncoder().encode("changed command\n") },
      { path: "nested/été file.txt", bytes: new TextEncoder().encode("\uFEFFé melody\n") },
      { path: "nul-text", bytes: new TextEncoder().encode("text\u0000still UTF-8\n") },
    ] });
    expect(r.git("status", "--porcelain=v1")).toBe(before.status);
    expect(readFileSync(join(r.dir, ".git/index"))).toEqual(before.index);
    expect(r.git("show-ref")).toBe(before.refs);
    expect(readFileSync(join(r.dir, "private-untracked"))).toEqual(before.private);
    expect(readFileSync(join(r.dir, "changed.txt"), "utf8")).toBe("unstaged local content\n");
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

test("reads the captured immutable tip when the local branch advances during capture", async () => {
  const r = repository();
  try {
    r.write("changed.txt", "first committed content\n");
    const capturedTip = r.commit();
    r.write("changed.txt", "later committed content\n");
    const laterTip = r.commit();
    r.git("update-ref", "refs/heads/source", capturedTip);
    const program = join(r.dir, "advance-after-read");
    const gitProgram = execFileSync("which", ["git"]).toString("utf8").trim();
    // The wrapper runs real Git, then advances the fixture's source ref just
    // after its lookup; this gives the race a deterministic ordering.
    writeFileSync(program, `#!/bin/sh\n"${gitProgram}" "$@"\ncode=$?\nif [ "$1" = show-ref ]; then "${gitProgram}" update-ref refs/heads/source ${laterTip}; fi\nexit "$code"\n`);
    chmodSync(program, 0o755);
    expect(await nodeGit(program, r.dir).files(r.base, "source")).toEqual({ ok: true, tip: capturedTip, files: [
      { path: "changed.txt", bytes: new TextEncoder().encode("first committed content\n") },
    ] });
    expect(r.git("rev-parse", "source")).toBe(laterTip);
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

// Invariant: local branch lookup is explicit and ancestry is checked; no
// revision expression, missing ref, abbreviated room head or divergent source
// may become a file proposal.
test("refuses invalid sources and branch expressions without reading them as revisions", async () => {
  const r = repository();
  try {
    for (const [base, branch, reason] of [
      [r.base.slice(0, 8), "source", "invalid-base"],
      ["f".repeat(40), "source", "invalid-base"],
      [r.base, "--help", "invalid-branch"],
      [r.base, "source~1", "invalid-branch"],
      [r.base, "main:changed.txt", "invalid-branch"],
      [r.base, "missing", "branch-not-found"],
      [r.base, "source", "no-changed-files"],
    ]) {
      const result = await r.runner.files(base!, branch!);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(new RegExp(`^${reason}:`));
    }
    r.write("changed.txt", "source change\n");
    const newerBase = r.commit();
    r.git("branch", "back", r.base);
    expect(await r.runner.files(newerBase, "back")).toEqual({ ok: false, reason: "base-not-ancestor: the local branch does not descend from the room head" });
    expect(await nodeGit(join(r.dir, "missing-git"), r.dir).files(r.base, "source")).toEqual({ ok: false, reason: "git-unavailable: cannot run git" });
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

// Invariant: no unsupported tree operation is silently dropped or converted
// into an ordinary text write. Each case is a committed change in real Git.
test.each([
  ["deletion", "unsupported-deletion"], ["rename", "unsupported-rename"], ["invalid UTF-8", "non-utf8-file"],
  ["symlink", "unsupported-mode"], ["mode change", "unsupported-mode"], ["new executable", "unsupported-mode"],
  ["large file", "file-too-large"], ["65 files", "too-many-files"], ["control path", "invalid-path"],
] as const)("refuses %s by name", async (kind, reason) => {
  const r = repository();
  try {
    if (kind === "deletion") r.git("rm", "--", "changed.txt");
    else if (kind === "rename") r.git("mv", "--", "changed.txt", "renamed.txt");
    else if (kind === "invalid UTF-8") r.write("changed.txt", new Uint8Array([0xff, 0x00]));
    else if (kind === "symlink") symlinkSync("changed.txt", join(r.dir, "link"));
    else if (kind === "mode change") chmodSync(join(r.dir, "changed.txt"), 0o755);
    else if (kind === "new executable") { r.write("new-executable", "command\n"); chmodSync(join(r.dir, "new-executable"), 0o755); }
    else if (kind === "large file") r.write("changed.txt", "a".repeat(65537));
    else if (kind === "65 files") for (let i = 0; i < 65; i++) r.write(`file-${i}`, "text\n");
    else r.write("control\npath", "text\n");
    r.commit();
    const result = await r.runner.files(r.base, "source");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(new RegExp(`^${reason}:`));
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

test("accepts the stated 64-file and 65536-byte boundaries without truncation", async () => {
  const r = repository();
  try {
    for (let i = 0; i < 64; i++) r.write(`file-${i}`, i === 0 ? "a".repeat(65536) : `content ${i}\n`);
    const tip = r.commit();
    const result = await r.runner.files(r.base, "source");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tip).toBe(tip);
      expect(result.files).toHaveLength(64);
      expect(result.files.find((f) => f.path === "file-0")?.bytes).toEqual(new TextEncoder().encode("a".repeat(65536)));
      expect(result.files.find((f) => f.path === "file-63")?.bytes).toEqual(new TextEncoder().encode("content 63\n"));
    }
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

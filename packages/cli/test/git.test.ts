import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  const bin = mkdtempSync(join(tmpdir(), "artroom-git-"));
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
    process.env["PATH"] = path;
  }
  // No git: the program is not found, and the answer is null. Control: the same runner over the stand-in answers 0, above.
  expect(await nodeGit(join(bin, "no-such-git")).run(["--version"], {})).toBeNull();
});

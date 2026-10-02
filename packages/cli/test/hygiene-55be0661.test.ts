/**
 * Request 55be0661, item 2 (finding SEC-05): the room's workspace remote
 * and token are written into a git config file the repository includes.
 * A quote, bracket or newline in either would add settings of the room's
 * choosing (such as `core.sshCommand`), which run code on the next git
 * command. The CLI refuses a grant whose remote is not a plain https URL or
 * whose token has characters a token cannot have, before it touches the
 * repository; `configureWorkspace` refuses the same at its own boundary.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { checkGrant, configureWorkspace } from "../src/git.ts";
import { EXIT } from "../src/main.ts";
import { useHarness } from "./harness.ts";

const { h, cli, login, git, repo } = useHarness();

const GOOD_REMOTE = "https://artifacts.example/acme/web-act_3_0a1b2c3d.git";
const GOOD_TOKEN = "art_v1_0123456789abcdef?expires=1790000000";
/** Closes the `[http "<remote>"]` header and opens `[core]`: on a6330262 this set `core.sshCommand`. */
const INJECT = '"]\n[core]\n\tsshCommand = touch pwned\n[x "y';

const BAD_REMOTES: readonly [string, unknown][] = [
  ["a quote and newline that open a [core] section", `https://artifacts.example/x.git${INJECT}`],
  ["a newline alone", "https://artifacts.example/x.git\n[core]"],
  ["the ext:: transport, which runs a command", "ext::sh -c touch% pwned"],
  ["plain http", "http://artifacts.example/x.git"],
  ["credentials", "https://user:pw@artifacts.example/x.git"],
  ["a query", "https://artifacts.example/x.git?x=1"],
  ["a fragment", "https://artifacts.example/x.git#x"],
  ["a space", "https://artifacts.example/x y.git"],
  ["a backslash", "https://artifacts.example/x\\y.git"],
  ["a dot segment, which the URL parser rewrites", "https://artifacts.example/a/../b.git"],
  ["a percent-encoded dot segment", "https://artifacts.example/a/%2e%2e/b.git"],
  ["an upper-case host, not in normal form", "https://Artifacts.example/x.git"],
  ["a leading dash, read as an option", "-https://artifacts.example/x.git"],
  ["an array, which a pattern test would coerce to its string", [GOOD_REMOTE]],
];

const BAD_TOKENS: readonly [string, unknown][] = [
  ["a newline that opens a [core] section", `${GOOD_TOKEN}\n[core]\n\tsshCommand = touch pwned`],
  ["a quote", 'art_v1_"x'],
  ["a backslash", "art_v1_\\x"],
  ["a space", "art_v1_ x"],
  ["a comment character #", "art_v1_#x"],
  ["a comment character ;", "art_v1_;x"],
  ["a carriage return", "art_v1_x\r"],
  ["nothing", ""],
  ["more than 4096 characters", "a".repeat(4097)],
  ["an array, which a pattern test would coerce to its string", [GOOD_TOKEN]],
];

describe("checkGrant", () => {
  test("accepts the room's remotes and Artifacts tokens, with or without the expiry", () => {
    expect(() => checkGrant(GOOD_REMOTE, GOOD_TOKEN)).not.toThrow();
    expect(() => checkGrant("https://6e953d231f1c9aadffbf59537a82e13a.artifacts.cloudflare.net:8443/git/ns/repo.git", "art_v2_x_AbC-09")).not.toThrow();
  });

  test.each(BAD_REMOTES)("refuses a remote with %s", (_why, remote) => {
    expect(() => checkGrant(remote as string, GOOD_TOKEN)).toThrow(/not a plain https:\/\/ URL/);
  });

  test.each(BAD_TOKENS)("refuses a token with %s", (_why, token) => {
    expect(() => checkGrant(GOOD_REMOTE, token as string)).toThrow(/characters a token cannot have/);
  });

  test("the refusal does not repeat the token", () => {
    expect(() => checkGrant(GOOD_REMOTE, `${GOOD_TOKEN} x`)).toThrow(expect.objectContaining({ message: expect.not.stringContaining(GOOD_TOKEN) }));
  });
});

describe("configureWorkspace refuses at its own boundary", () => {
  test.each([
    ["remote", `https://artifacts.example/x.git${INJECT}`, GOOD_TOKEN],
    ["token", GOOD_REMOTE, `${GOOD_TOKEN}\n[core]\n\tsshCommand = touch pwned`],
  ])("an injecting %s adds no git setting, remote or credential file", (_which, remote, token) => {
    const dir = repo();
    expect(() => configureWorkspace(dir, remote, token, "act_3_0a1b2c3d", 1, "install-1")).toThrow();
    expect(() => git(dir, "config", "--get", "core.sshCommand")).toThrow();
    expect(git(dir, "remote")).toBe("");
    expect(existsSync(join(dir, ".git", "artroom", "credentials"))).toBe(false);
  });

  test("every character the patterns admit reads back, through git, as exactly the one setting", () => {
    const dir = repo();
    const remote = "https://a-b.0.example:65535/AZaz09._~-/x.git";
    const token = "AZaz09._~+/?=-";
    const file = configureWorkspace(dir, remote, token, "act_3_0a1b2c3d", 1, "install-1");
    expect(git(dir, "config", "--file", file, "--null", "--list")).toBe(`http.${remote}.extraheader\nAuthorization: Bearer ${token}\0`);
    expect(git(dir, "config", "--get", `http.${remote}.extraheader`)).toBe(`Authorization: Bearer ${token}`);
  });
});

describe("artroom workspace refuses a malformed grant before touching the repository", () => {
  /** A fetch that rewrites the room's workspace-token answer. */
  const rewriting = (change: (grant: Record<string, unknown>) => void): typeof fetch => async (input, init) => {
    const res = await fetch(input, init);
    if (!String(input).endsWith("/requests") || typeof init?.body !== "string" || !init.body.includes('"workspace-token"')) return res;
    const grant = (await res.json()) as Record<string, unknown>;
    change(grant);
    return new Response(JSON.stringify(grant), { status: res.status, headers: res.headers });
  };

  test.each([
    ["remote", (g: Record<string, unknown>) => (g["remote"] = `${String(g["remote"])}${INJECT}`)],
    ["token", (g: Record<string, unknown>) => (g["token"] = `${String(g["token"])}\n[core]\n\tsshCommand = touch pwned`)],
  ])("an injecting %s: exit 1, no remote, no credential, no setting, nothing pending", async (which, change) => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    expect((await cli(home, ["claim", "src/**", "--goal", "g"], dir)).code).toBe(EXIT.ok);
    const res = await cli(home, ["workspace"], dir, { fetch: rewriting(change) });
    expect(res.code).toBe(EXIT.failed);
    expect(res.err).toContain(which === "remote" ? "not a plain https:// URL" : "characters a token cannot have");
    expect(() => git(dir, "config", "--get", "core.sshCommand")).toThrow();
    expect(git(dir, "remote")).toBe("");
    expect(existsSync(join(dir, ".git", "artroom", "credentials"))).toBe(false);
    const owner = JSON.parse(readFileSync(join(dir, ".git", "artroom", "owner.json"), "utf8"));
    expect(owner.pending ?? []).toEqual([]);
    expect(owner.installed).toBeUndefined();
  });
});

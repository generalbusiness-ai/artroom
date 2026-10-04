/**
 * Request 55be0661, item 2 (finding SEC-05): the room's workspace remote
 * and token are written into a git config file the repository includes.
 * A quote, bracket or newline in either would add settings of the room's
 * choosing (such as `core.sshCommand`), which run code on the next git
 * command. The CLI refuses a grant whose remote is not a plain https URL or
 * whose token has characters a token cannot have, before it touches the
 * repository; `configureWorkspace` refuses the same at its own boundary.
 *
 * The file's first line, a comment, marks whose credential it is: the lane,
 * lease and installation ID. The lane and lease come from the room too
 * (`Claim.lane`, the lane's and grant's lease), so a newline in either would
 * end the comment and add settings (checker report f593d8f7). Each must have
 * its canonical form: checked when a claim's lane is selected, when a lane
 * is chosen, before the destination is touched, and at the boundary.
 *
 * Git here is real: these tests are about what git reads from the files.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { checkGrant, checkMarker, checkRedeemed, configureWorkspace, credentialOwner } from "../src/git.ts";
import { EXIT } from "../src/main.ts";
import { useHarness } from "./harness.ts";

const { h, cli, login, link, git, repo } = useHarness();

const GOOD_REMOTE = "https://artifacts.example/acme/web-act_3_0a1b2c3d.git";
const GOOD_TOKEN = "art_v1_0123456789abcdef?expires=1790000000";
/** Closes the `[http "<remote>"]` header and opens `[core]`: on a6330262 this set `core.sshCommand`. */
const INJECT = '"]\n[core]\n\tsshCommand = touch pwned\n[x "y';
/** Ends the mark's comment line and opens `[core]`: on e90cc7c0 a lane or lease like this set `core.sshCommand`. */
const MARK_INJECT = "\n[core]\n\tsshCommand = touch pwned\n#";
const LANE = "act_3_0a1b2c3d";

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

  test("refuses every remote that is not a plain https URL in normal form", () => {
    for (const [why, remote] of BAD_REMOTES) expect(() => checkGrant(remote as string, GOOD_TOKEN), `a remote with ${why}`).toThrow(/not a plain https:\/\/ URL/);
  });

  test("refuses every token with a character a token cannot have", () => {
    for (const [why, token] of BAD_TOKENS) expect(() => checkGrant(GOOD_REMOTE, token as string), `a token with ${why}`).toThrow(/characters a token cannot have/);
  });

  test("the refusal does not repeat the token", () => {
    expect(() => checkGrant(GOOD_REMOTE, `${GOOD_TOKEN} x`)).toThrow(expect.objectContaining({ message: expect.not.stringContaining(GOOD_TOKEN) }));
  });
});

const BAD_LANES: readonly [string, unknown][] = [
  ["a newline that opens a [core] section", `${"act_3_0a1b2c3d"}${MARK_INJECT}`],
  ["a space", "act_3_0a1b2c3d x"],
  ["upper-case hex", "act_3_0A1B2C3D"],
  ["a leading zero in its number", "act_03_0a1b2c3d"],
  ["another ID's form", "op_land_1"],
  ["nothing", ""],
  ["an array, which a pattern test would coerce to its string", ["act_3_0a1b2c3d"]],
];

const BAD_LEASES: readonly [string, unknown][] = [
  ["a newline that opens a [core] section", `1${MARK_INJECT}`],
  ["a number as a string", "1"],
  ["a negative number", -1],
  ["a fraction", 1.5],
  ["NaN", Number.NaN],
  ["more than a safe integer", 2 ** 53],
];

const BAD_INSTALLS: readonly [string, unknown][] = [
  ["a newline that opens a [core] section", `i1${MARK_INJECT}`],
  ["a dot", "i.1"],
  ["nothing", ""],
  ["more than 64 characters", "a".repeat(65)],
  ["an array", ["i1"]],
];

describe("checkMarker", () => {
  test("accepts a canonical lane, a whole-number lease and an idempotency key", () => {
    expect(() => checkMarker(LANE, 1, "AZaz09_-")).not.toThrow();
    expect(() => checkMarker("act_9007199254740991_ffffffff", 0, "a".repeat(64))).not.toThrow();
  });
  test("refuses a lane, a lease or an installation ID that is not in its canonical form", () => {
    for (const [why, lane] of BAD_LANES) expect(() => checkMarker(lane, 1, "i1"), `a lane with ${why}`).toThrow(/not a lane ID/);
    for (const [why, lease] of BAD_LEASES) expect(() => checkMarker(LANE, lease, "i1"), `a lease that is ${why}`).toThrow(/lease that is not a whole number/);
    for (const [why, install] of BAD_INSTALLS) expect(() => checkMarker(LANE, 1, install), `an installation ID with ${why}`).toThrow(/not an idempotency key/);
  });
});

describe("configureWorkspace refuses at its own boundary", () => {
  test("an injecting remote, token, lane, lease or installation ID adds no git setting, remote or credential file", () => {
    const dir = repo();
    const injecting: readonly [string, string, string, unknown, unknown, unknown][] = [
      ["remote", `https://artifacts.example/x.git${INJECT}`, GOOD_TOKEN, LANE, 1, "i1"],
      ["token", GOOD_REMOTE, `${GOOD_TOKEN}\n[core]\n\tsshCommand = touch pwned`, LANE, 1, "i1"],
      ["lane", GOOD_REMOTE, GOOD_TOKEN, `${LANE}${MARK_INJECT}`, 1, "i1"],
      ["lease", GOOD_REMOTE, GOOD_TOKEN, LANE, `1${MARK_INJECT}`, "i1"],
      ["installation ID", GOOD_REMOTE, GOOD_TOKEN, LANE, 1, `i1${MARK_INJECT}`],
    ];
    for (const [which, remote, token, lane, lease, install] of injecting) {
      expect(() => configureWorkspace(dir, remote, token, lane as string, lease as number, install as string), which).toThrow();
      expect(existsSync(join(dir, ".git", "artroom", "credentials")), which).toBe(false);
    }
    // Nothing a refused call wrote could be undone by a later one, so the repository is read once, after all five.
    expect(() => git(dir, "config", "--get", "core.sshCommand")).toThrow();
    expect(git(dir, "remote")).toBe("");
  });

  test("every character the patterns admit, in every field, reads back through git as the whole file: one mark and exactly one setting", () => {
    const dir = repo();
    const remote = "https://a-b.0.example:65535/AZaz09._~-/x.git";
    const token = "AZaz09._~+/?=-";
    const [lane, lease, install] = ["act_9007199254740991_0123abcd", Number.MAX_SAFE_INTEGER, "AZaz09_-"];
    const file = configureWorkspace(dir, remote, token, lane, lease, install);
    expect(git(dir, "config", "--file", file, "--null", "--list")).toBe(`http.${remote}.extraheader\nAuthorization: Bearer ${token}\0`);
    expect(git(dir, "config", "--get", `http.${remote}.extraheader`)).toBe(`Authorization: Bearer ${token}`);
    // Every line but the setting's two is a comment, and the ownership reader reads the mark back exactly.
    const lines = readFileSync(file, "utf8").split("\n").filter((l) => l !== "");
    expect(lines.filter((l) => !l.startsWith("#"))).toEqual([`[http "${remote}"]`, `\textraHeader = Authorization: Bearer ${token}`]);
    expect(credentialOwner(file)).toEqual({ lane, lease, install });
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

describe("a malicious room's mark metadata never reaches the repository", () => {
  const nothingInstalled = (dir: string) => {
    expect(() => git(dir, "config", "--get", "core.sshCommand")).toThrow();
    expect(git(dir, "remote")).toBe("");
    expect(existsSync(join(dir, ".git", "artroom", "credentials"))).toBe(false);
    const ownerFile = join(dir, ".git", "artroom", "owner.json");
    const owner = existsSync(ownerFile) ? JSON.parse(readFileSync(ownerFile, "utf8")) : {};
    expect(owner.pending ?? []).toEqual([]);
    expect(owner.installed).toBeUndefined();
  };
  const config = (home: string) => JSON.parse(readFileSync(join(home, "config.json"), "utf8")).rooms[h.room.id];

  test("a claim answered with an injecting lane: exit 1, the lane is not selected, and workspace has no lane to install", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    const evil: typeof fetch = async (input, init) => {
      const res = await fetch(input, init);
      if (!String(input).endsWith("/acts") || typeof init?.body !== "string" || !init.body.includes('"claim"')) return res;
      const out = (await res.json()) as Record<string, unknown>;
      out["lane"] = `${String(out["lane"])}${MARK_INJECT}`;
      return new Response(JSON.stringify(out), { status: res.status, headers: res.headers });
    };
    const claimed = await cli(home, ["claim", "src/**", "--goal", "g"], dir, { fetch: evil });
    const ws = await cli(home, ["workspace"], dir);
    nothingInstalled(dir);
    expect(config(home).lane).toBeUndefined();
    expect(ws.code).toBe(EXIT.usage);
    expect(claimed.code).toBe(EXIT.failed);
    expect(claimed.err).toContain("a lane ID that is not one, so it was not selected");
  });

  test("an injecting --lane is a usage error before the destination is reserved", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    const res = await cli(home, ["workspace", "--lane", `${LANE}${MARK_INJECT}`], dir);
    expect(res.code).toBe(EXIT.usage);
    expect(res.err).toContain("That is not a lane ID");
    nothingInstalled(dir);
    expect(existsSync(join(dir, ".git", "artroom", "owner.json"))).toBe(false);
  });

  test("an injecting lease, in both the lane and the grant: exit 1 before anything is pending, and a valid workspace still installs and releases", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    expect((await cli(home, ["claim", "src/**", "--goal", "g"], dir)).code).toBe(EXIT.ok);
    const lane = config(home).lane as string;
    const lease = `1${MARK_INJECT}`;
    const remote = "https://artifacts.example/acme/evil.git";
    const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    // The room controls both leases, so they agree; it answers the workspace requests itself.
    const evil: typeof fetch = async (input, init) => {
      const body = typeof init?.body === "string" ? init.body : "";
      if (String(input).endsWith("/requests") && body.includes('"workspace-token"')) {
        return reply({ op: "op_ws_evil", lane, leaseGeneration: lease, remote, token: "art_v1_evil0123456789", expiresAt: "2099-01-01T00:00:00.000Z" });
      }
      if (String(input).endsWith("/requests") && /"kind":"workspace"/.test(body)) {
        return reply({ id: "op_ws_evil", kind: "workspace", updatedAt: "2026-10-02T00:00:00.000Z", lane, state: "ready", detail: { remote, leaseGeneration: lease } });
      }
      const res = await fetch(input, init);
      if (!String(input).includes(`/lanes/${lane}`)) return res;
      const l = (await res.json()) as { lease: { generation: unknown } };
      l.lease.generation = lease;
      return reply(l);
    };
    const res = await cli(home, ["workspace"], dir, { fetch: evil });
    nothingInstalled(dir);
    expect(res.code).toBe(EXIT.failed);
    expect(res.err).toContain("lease that is not a whole number");

    // Valid ownership and release are unchanged.
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    expect(credentialOwner(join(dir, ".git", "artroom", "credentials"))).toMatchObject({ lane, lease: 1 });
    expect((await cli(home, ["release", "-m", "done"], dir)).code).toBe(EXIT.ok);
    expect(existsSync(join(dir, ".git", "artroom", "credentials"))).toBe(false);
  });
});

describe("a redemption's MCP URL and bearer token are checked before they are saved or printed", () => {
  test("checkRedeemed accepts an http or https URL in normal form and a token, and refuses the rest", () => {
    expect(() => checkRedeemed("https://room.example.com/v1/rooms/room_0123456789abcdef0123456789abcdef/mcp", "arb_AZaz09-_")).not.toThrow();
    expect(() => checkRedeemed("http://127.0.0.1:8787/v1/rooms/r/mcp", "arb_x")).not.toThrow();
    for (const mcp of ["https://room.example.com/mcp $(touch pwned)", "https://room.example.com/mcp\nx", 'https://room.example.com/"', "https://room.example.com/a/../mcp", "ftp://room.example.com/mcp", ["https://room.example.com/mcp"]]) {
      expect(() => checkRedeemed(mcp, "arb_x")).toThrow(/MCP URL that is not a plain URL/);
    }
    for (const bearer of ["arb_x\nmore", "arb_x y", "", ["arb_x"]]) expect(() => checkRedeemed("https://room.example.com/mcp", bearer)).toThrow(/bearer token with characters/);
  });

  test.each([
    ["MCP URL", (r: Record<string, unknown>) => (r["mcp"] = `${String(r["mcp"])} $(touch pwned)`), "MCP URL that is not a plain URL"],
    ["bearer token", (r: Record<string, unknown>) => (r["bearer"] = `${String(r["bearer"])}\n$(touch pwned)`), "bearer token with characters"],
  ])("an injecting %s: exit 1, nothing saved, and no command printed", async (_which, change, message) => {
    const home = join(h.tmp, "agent");
    const evil: typeof fetch = async (input, init) => {
      const res = await fetch(input, init);
      if (!String(input).endsWith("/redeem")) return res;
      const out = (await res.json()) as Record<string, unknown>;
      change(out);
      return new Response(JSON.stringify(out), { status: res.status, headers: res.headers });
    };
    const res = await cli(home, ["redeem", await link("@agent", { role: "agent", custody: "room" })], h.tmp, { fetch: evil });
    expect(res.out).not.toContain("touch pwned");
    expect(res.out).not.toContain("claude mcp add");
    expect(existsSync(join(home, "bearers", h.room.id))).toBe(false);
    expect(existsSync(join(home, "config.json")) ? JSON.parse(readFileSync(join(home, "config.json"), "utf8")).rooms[h.room.id] : undefined).toBeUndefined();
    expect(res.code).toBe(EXIT.failed);
    expect(res.err).toContain(message);
  });
});

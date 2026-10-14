/**
 * The `artroom` command against the fake room: snapshot tests of its plain
 * output, exit codes (0 done, 1 failed, 2 usage, 3 refused), --json, key
 * and token files written 0600, git set up without the token appearing in
 * any output (R-WS-4), joining, and `artroom mcp`.
 *
 * Git here is real. What a run does after a lost answer or an interruption
 * is in journal.test.ts; which installation owns a repository's credential
 * is in workspace.test.ts.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, test } from "vitest";
import { invitationLink, parseInvitation } from "../src/link.ts";
import { EXIT } from "../src/main.ts";
import { config, useHarness } from "./harness.ts";

const { h, cli, norm, git, repo, link, login, mode, calls } = useHarness();

describe("the loop, as a person types it", () => {
  test("login, claim, workspace, propose, land refused, review, land --wait, attention, explain, log, release", async () => {
    const alice = join(h.tmp, "alice");
    const bob = join(h.tmp, "bob");
    const dir = repo();
    // Here the workspace is still pending at the first read, so the command waits for it.
    h.room.workspaceDelay = 1;

    const joined = await login(alice, "@alice");
    expect(joined.code).toBe(EXIT.ok);
    expect(norm(joined.out)).toMatchSnapshot("login");
    expect(mode(join(alice, "keys", `${h.room.id}.json`))).toBe("600");
    expect(mode(join(alice, "keys"))).toBe("700");
    expect(mode(join(alice, "config.json"))).toBe("600");
    expect(existsSync(join(alice, "keys", `${h.room.id}.pending.json`))).toBe(false);

    const claim = await cli(alice, ["claim", "src/**", "--goal", "Rate-limit login"], dir);
    expect(claim.code).toBe(EXIT.ok);
    expect(norm(claim.out)).toMatchSnapshot("claim");

    const ws = await cli(alice, ["workspace"], dir);
    expect(ws.code).toBe(EXIT.ok);
    expect(norm(ws.out)).toMatchSnapshot("workspace");
    const [token] = h.room.exposure.grants;
    const remote = git(dir, "remote", "get-url", "artroom");
    // Git itself reads the header through the include; the token is in the 0600 file only.
    expect(git(dir, "config", "--get", `http.${remote}.extraheader`)).toBe(`Authorization: Bearer ${token}`);
    expect(readFileSync(join(dir, ".git", "config"), "utf8")).not.toContain(token!);
    expect(mode(join(dir, ".git", "artroom", "credentials"))).toBe("600");

    expect((await login(bob, "@bob")).code).toBe(EXIT.ok);
    writeFileSync(join(dir, "README.md"), "hello, world\n");
    git(dir, "commit", "-q", "-am", "second");
    const propose = await cli(alice, ["propose", "-m", "Adds a token bucket to /api/login."], dir);
    expect(propose.code).toBe(EXIT.ok);
    expect(norm(propose.out)).toMatchSnapshot("propose");

    const early = await cli(alice, ["land"], dir);
    expect(early.code).toBe(EXIT.refused);
    expect(early.out).toBe("");
    expect(norm(early.err)).toMatchSnapshot("land refused");

    const todo = await cli(bob, ["attention"]);
    expect(norm(todo.out)).toMatchSnapshot("bob attention");
    const lane = /act_\d+_[0-9a-f]{8}/.exec(claim.out)![0];
    const review = await cli(bob, ["review", `${lane}#1`, "--approve", "--scope", "src/**", "-m", "Limits look right."]);
    expect(review.code).toBe(EXIT.ok);
    expect(norm(review.out)).toMatchSnapshot("review");

    const landed = await cli(alice, ["land", "--wait"], dir);
    expect(landed.code).toBe(EXIT.ok);
    expect(norm(landed.out)).toMatchSnapshot("land --wait");

    expect(norm((await cli(alice, ["attention"])).out)).toMatchSnapshot("alice attention");
    const refusalAct = /Recorded as (act_\d+_[0-9a-f]{8})/.exec(early.err)![1]!;
    expect(norm((await cli(alice, ["explain", refusalAct])).out)).toMatchSnapshot("explain");
    expect(norm((await cli(alice, ["log", "--after", "8", "--limit", "4"])).out)).toMatchSnapshot("log");

    const released = await cli(alice, ["release", "-m", "Landed; nothing left."], dir);
    expect(released.code).toBe(EXIT.ok);
    expect(norm(released.out)).toMatchSnapshot("release");
    expect(existsSync(join(dir, ".git", "artroom", "credentials"))).toBe(false);
  });

  test("--json prints the record, and a refusal as JSON with exit code 3", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    const claim = await cli(alice, ["claim", "src/**", "--goal", "g", "--json"]);
    expect(JSON.parse(claim.out)).toMatchObject({ kind: "claim", scope: ["src/**"], lease: { generation: 1 } });
    const stale = await cli(alice, ["propose", "-m", "s", "--head", "a".repeat(40), "--expect", "4", "--json"]);
    expect(stale.code).toBe(EXIT.refused);
    expect(JSON.parse(stale.out)).toMatchObject({ refused: true, rule: "generation-moved", current: { generation: 0 } });
    expect(stale.err).toBe("");
  });

  test("a refusal prints rule, reason and fix on stderr with exit code 3", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    await cli(alice, ["claim", "src/**", "--goal", "g"]);
    const stale = await cli(alice, ["propose", "-m", "s", "--head", "a".repeat(40), "--expect", "4"]);
    expect(stale.code).toBe(EXIT.refused);
    expect(norm(stale.err)).toMatchSnapshot("generation-moved");
  });
});

describe("joining", () => {
  test("a refused login leaves no key behind", async () => {
    const alice = join(h.tmp, "alice");
    const { invitation, secret } = await h.room.invite("@alice");
    const res = await cli(alice, ["login", invitationLink(h.room.url, h.room.id, invitation, `${secret}x`)]);
    expect(res.code).toBe(EXIT.refused);
    expect(norm(res.err)).toMatchSnapshot("login refused");
    expect(existsSync(join(alice, "keys", `${h.room.id}.json`))).toBe(false);
    expect(existsSync(join(alice, "keys", `${h.room.id}.pending.json`))).toBe(false);
  });

  test("a lost login response is finished by running the same command again, joining once", async () => {
    const alice = join(h.tmp, "alice");
    const { invitation, secret } = await h.room.invite("@alice");
    const invite = invitationLink(h.room.url, h.room.id, invitation, secret);
    h.room.faults.push({ route: "POST /redeem", kind: "drop" });
    const first = await cli(alice, ["login", invite]);
    expect(first.code).toBe(EXIT.failed);
    expect(norm(first.err)).toMatchSnapshot("login lost");
    const second = await cli(alice, ["login", invite]);
    expect(second.code).toBe(EXIT.ok);
    const joins = h.room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.body as { op?: string }).op === "join");
    expect(joins).toHaveLength(1);
    expect((await cli(alice, ["attention"])).code).toBe(EXIT.ok);
  });

  test("a link with no secret, or with its secret in the query, is a usage error and nothing is sent; a path prefix is part of the endpoint (R-CRED-11)", async () => {
    const res = await cli(join(h.tmp, "x"), ["login", `${h.room.url}/rooms/${h.room.id}/join#i=act_1_00000000`]);
    expect(res.code).toBe(EXIT.usage);
    expect(res.err).toMatch(/Copy the whole link/);
    const { invitation, secret } = await h.room.invite("@alice");
    const query = await cli(join(h.tmp, "x"), ["login", `${h.room.url}/rooms/${h.room.id}/join?i=${invitation}&s=${secret}`]);
    expect(query.code).toBe(EXIT.usage);
    expect(calls("/redeem")).toBe(0);
    const prefixed = parseInvitation(`https://example.com/artroom/rooms/${h.room.id}/join#i=act_3_0c1d2e3f&s=${"A".repeat(43)}`);
    expect(prefixed).toMatchObject({ url: "https://example.com/artroom", room: h.room.id, invitation: "act_3_0c1d2e3f" });
  });

  test("redeem saves the bearer 0600, never prints it, and the agent can then act through MCP", async () => {
    const agent = join(h.tmp, "agent");
    const { invitation, secret } = await h.room.invite("@builder", { role: "agent", custody: "room" });
    const res = await cli(agent, ["redeem", invitationLink(h.room.url, h.room.id, invitation, secret)]);
    expect(res.code).toBe(EXIT.ok);
    expect(norm(res.out)).toMatchSnapshot("redeem");
    const [bearer] = h.room.exposure.bearers;
    expect(readFileSync(join(agent, "bearers", h.room.id), "utf8").trim()).toBe(bearer);
    expect(mode(join(agent, "bearers", h.room.id))).toBe("600");
    expect(res.out + res.err).not.toContain(bearer!);
    const claim = await cli(agent, ["claim", "docs/**", "--goal", "Fix typos"]);
    expect(claim.code).toBe(EXIT.ok);
    expect(claim.out).toMatch(/^Claimed lane act_/);
  });

  test("a lost redemption says what to do, and saves no token", async () => {
    const agent = join(h.tmp, "agent");
    const { invitation, secret } = await h.room.invite("@builder", { role: "agent", custody: "room" });
    h.room.faults.push({ route: "POST /redeem", kind: "drop" });
    const res = await cli(agent, ["redeem", invitationLink(h.room.url, h.room.id, invitation, secret)]);
    expect(res.code).toBe(EXIT.failed);
    expect(norm(res.err)).toMatchSnapshot("redeem lost");
    expect(existsSync(join(agent, "bearers", h.room.id))).toBe(false);
  });
});

describe("usage and agents", () => {
  test("usage errors exit 2 and say what to do", async () => {
    const home = join(h.tmp, "h");
    expect((await cli(home, ["frobnicate"])).code).toBe(EXIT.usage);
    const noRoom = await cli(home, ["claim", "src/**", "--goal", "g"]);
    expect(noRoom.code).toBe(EXIT.usage);
    expect(noRoom.err).toMatch(/artroom login/);
    const bad = await cli(home, ["land", "--bogus"]);
    expect(bad.code).toBe(EXIT.usage);
    expect(bad.err).toMatch(/Unknown option '--bogus'/);
  });

  test("agents-md prints a block under 30 lines that teaches the loop", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    const res = await cli(alice, ["agents-md"]);
    expect(res.code).toBe(EXIT.ok);
    const lines = res.out.split("\n");
    expect(lines.length).toBeLessThan(30);
    expect(res.out).toMatchSnapshot("agents-md");
    for (const step of ["claim", "workspace", "propose", "attention", "land", "release", "idempotency-key", "fix"]) expect(res.out).toContain(step);
  });
});

describe("credentials never reach the output (review f47a509c, P1; R-WS-4)", () => {
  test("a bearer echoed in an error, at connection or later, is redacted", async () => {
    const agent = join(h.tmp, "agent");
    expect((await cli(agent, ["redeem", await link("@builder", { role: "agent", custody: "room" })])).code).toBe(EXIT.ok);
    const [bearer] = h.room.exposure.bearers;
    const echo = { name: "ArtroomError", code: "forbidden", message: `token ${bearer} refused`, retryable: false };
    h.room.faults.push({ route: "GET /log", kind: "status", status: 403, body: echo });
    const first = await cli(agent, ["attention"]);
    expect(first.code).toBe(EXIT.failed);
    expect(first.err).toContain("[redacted]");
    h.room.faults.push({ route: "GET /attention", kind: "status", status: 403, body: echo });
    const later = await cli(agent, ["attention", "--json"]);
    expect(later.out).toContain("[redacted]");
    expect(first.out + first.err + later.out + later.err).not.toContain(bearer!);
  });

  test("a room that echoes the bearer inside an ordinary answer is scrubbed by the CLI itself", async () => {
    const agent = join(h.tmp, "agent");
    await cli(agent, ["redeem", await link("@builder", { role: "agent", custody: "room" })]);
    const [bearer] = h.room.exposure.bearers;
    h.room.attentionItems.push({ to: "@builder", item: { why: "policy", rule: "r", act: "act_1_00000000", text: `your token is ${bearer}`, id: "x", seq: 1, open: true } });
    const res = await cli(agent, ["attention"]);
    expect(res.out).toContain("your token is [redacted]");
    expect(res.out).not.toContain(bearer!);
  });
});

describe("artroom mcp: the tools over stdio, for the caller's own authorization (R-API-14)", () => {
  type Call = { name: string; arguments: unknown };
  const BUILDER = ["claim", "workspace", "propose", "note", "land", "renew", "release", "attention", "explain", "lane", "proposal", "operation", "acts"];

  /** One MCP conversation over a pair of streams: initialize, `tools/list`, then each call in turn. */
  async function converse(stdin: NodeJS.WritableStream, stdout: NodeJS.ReadableStream, toCall: Call[]): Promise<{ init: any; list: any; called: any[] }> {
    let buffer = "";
    const waiting = new Map<number, (msg: unknown) => void>();
    stdout.on("data", (c: Buffer) => {
      buffer += c.toString();
      for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
        const msg = JSON.parse(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (msg.id !== undefined) waiting.get(msg.id)?.(msg);
      }
    });
    let ids = 0;
    const send = (method: string, params: unknown = {}) => {
      const id = ++ids;
      const reply = new Promise<any>((resolve) => waiting.set(id, resolve));
      stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return reply;
    };
    const init = await send("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const list = await send("tools/list");
    const called: any[] = [];
    for (const call of toCall) called.push(await send("tools/call", call));
    return { init, list, called };
  }

  /** `artroom mcp` run in process on its own pair of streams, as the command serves them. */
  async function served(home: string, args: string[], toCall: Call[] = []): Promise<{ list: any; listed: string[] | undefined; called: any[]; code: number }> {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const running = cli(home, ["mcp", ...args], h.tmp, { stdio: { stdin, stdout } });
    const { list, called } = await converse(stdin, stdout, toCall);
    stdin.end();
    return { list, listed: list.result?.tools.map((t: { name: string }) => t.name), called, code: (await running).code };
  }

  test("the real bin serves a member's key the builder list; a tool the list omits still runs; a claim is signed by the member", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    const child = spawn(process.execPath, [join(import.meta.dirname, "..", "bin", "artroom.js"), "mcp"], { env: { ...process.env, ARTROOM_HOME: alice }, stdio: ["pipe", "pipe", "pipe"] });
    const { init, list, called } = await converse(child.stdin, child.stdout, [
      { name: "lanes", arguments: {} },
      { name: "claim", arguments: { goal: "g", scope: ["src/**"], idempotencyKey: "stdio-claim-1" } },
    ]);
    child.stdin.end();
    expect(await new Promise<number | null>((resolve) => child.on("exit", resolve))).toBe(0);
    // A member's own key gets the builder toolset: its twelve named tools, each once, and `acts`. The room's document
    // is `v1`, so the generic `act` is not listed. `review` and `lanes` are the reviewer's.
    expect(init.result.serverInfo.name).toBe("artroom");
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(BUILDER);
    // `lanes` is not in the list, and the room still judges and answers it: a read any member may make.
    expect(called[0].result.isError).toBe(false);
    expect(called[0].result.structuredContent).toMatchObject({ items: [], more: false });
    expect(called[1].result.structuredContent.by).toMatchObject({ via: "member", member: "@alice" });
  });

  test("an unknown toolset is bad-request, before the room is asked for anything", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    const before = h.room.requests.length;
    const res = await cli(alice, ["mcp", "--toolset", "nope"]);
    expect(res.code).toBe(EXIT.failed);
    expect(res.err).toContain('There is no toolset named "nope". The toolsets are builder, reviewer, observer, all.');
    expect(h.room.requests.length).toBe(before);
    const json = await cli(alice, ["mcp", "--toolset", "nope", "--json"]);
    expect(JSON.parse(json.out)).toMatchObject({ name: "ArtroomError", code: "bad-request" });
  });

  test("--toolset reviewer gives a member's key the reviewer list, and a tool that list omits still runs", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    const reviewer = await served(alice, ["--toolset", "reviewer"], [{ name: "claim", arguments: { goal: "g", scope: ["src/**"], idempotencyKey: "reviewer-claims" } }]);
    expect(reviewer.listed).toEqual(["note", "review", "attention", "explain", "lanes", "lane", "proposal", "acts"]);
    // `claim` is not in the reviewer list, and the room still judges and records it.
    expect(reviewer.called[0].result.structuredContent).toMatchObject({ kind: "claim", by: { via: "member", member: "@alice" } });
    expect(reviewer.code).toBe(0);
  });

  test("a redeemed bearer: the list follows the session's own delegation, as it does at the MCP URL", async () => {
    const agent = join(h.tmp, "agent");
    const { invitation, secret } = await h.room.invite("@agent", { role: "agent", custody: "room", kinds: ["claim", "note"] });
    expect((await cli(agent, ["redeem", invitationLink(h.room.url, h.room.id, invitation, secret)])).code).toBe(EXIT.ok);
    const out = await served(agent, []);
    expect(out.listed).toEqual(["claim", "workspace", "note", "attention", "explain", "lane", "proposal", "operation", "acts"]);
    // The redemption's own delegation is kept with the credential, and the list is read under exactly that one.
    const file = join(agent, "config.json");
    const saved = config(agent);
    const mine = [...h.room.delegations.values()].at(-1)!;
    expect(saved.rooms[h.room.id]).toMatchObject({ custody: "room", delegation: mine.id });
    // Naming another current delegation there, one this session's key did not grant, shows nothing: the credential
    // is not that delegation's.
    const other = join(h.tmp, "other");
    const second = await h.room.invite("@other", { role: "agent", custody: "room", kinds: "*" as never });
    expect((await cli(other, ["redeem", invitationLink(h.room.url, h.room.id, second.invitation, second.secret)])).code).toBe(EXIT.ok);
    const theirs = [...h.room.delegations.values()].at(-1)!;
    expect(theirs.id).not.toBe(mine.id);
    writeFileSync(file, JSON.stringify({ ...saved, rooms: { ...saved.rooms, [h.room.id]: { ...saved.rooms[h.room.id], delegation: theirs.id } } }));
    const wrong = await served(agent, []);
    expect(wrong.list.error ?? wrong.list.result).toMatchObject({ message: expect.stringContaining("belongs to no active member") });
    // A credential saved before the ID was kept names none: the session key's own latest delegation is used.
    const { delegation: _dropped, ...legacy } = saved.rooms[h.room.id];
    void _dropped;
    writeFileSync(file, JSON.stringify({ ...saved, rooms: { ...saved.rooms, [h.room.id]: legacy } }));
    expect((await served(agent, [])).listed).toEqual(out.listed);
  });
});

/**
 * `artroom mcp` and toolsets (request 9ca1d290; R-API-14): the stdio server
 * shows a caller the tools its authorization allows, as the MCP URL does,
 * and `--toolset` is the stdio form of `?toolset=`.
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { EXIT } from "../src/main.ts";
import { invitationLink } from "../src/link.ts";
import { useHarness } from "./harness.ts";

const { h, cli, login } = useHarness();

/** `tools/list`, and optionally one call, from the real bin over stdio. */
async function stdio(home: string, args: string[], call?: { name: string; arguments: unknown }): Promise<{ listed: string[]; called?: any; code: number | null }> {
  const child = spawn(process.execPath, [join(import.meta.dirname, "..", "bin", "artroom.js"), "mcp", ...args], { env: { ...process.env, ARTROOM_HOME: home }, stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "";
  const replies = new Map<number, any>();
  child.stdout.on("data", (c: Buffer) => {
    buffer += c.toString();
    for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
      const msg = JSON.parse(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      if (msg.id !== undefined) replies.set(msg.id, msg);
    }
  });
  const send = async (id: number, method: string, params: unknown = {}) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    for (let i = 0; i < 1000 && !replies.has(id); i++) await new Promise((r) => setTimeout(r, 10));
    return replies.get(id);
  };
  await send(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const list = await send(2, "tools/list");
  const called = call ? await send(3, "tools/call", call) : undefined;
  child.stdin.end();
  const code = await new Promise<number | null>((resolve) => child.on("exit", resolve));
  return { listed: list.result.tools.map((t: { name: string }) => t.name), called, code };
}

describe("artroom mcp --toolset (R-API-14)", () => {
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

  test("a member's key: the builder list by default, the reviewer list with --toolset reviewer, and a tool the list omits still runs", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    const dflt = await stdio(alice, []);
    expect(dflt.listed).toEqual(["claim", "workspace", "propose", "note", "land", "renew", "release", "attention", "explain", "lane", "proposal", "operation", "acts"]);
    const reviewer = await stdio(alice, ["--toolset", "reviewer"], { name: "claim", arguments: { goal: "g", scope: ["src/**"], idempotencyKey: "reviewer-claims" } });
    expect(reviewer.listed).toEqual(["note", "review", "attention", "explain", "lanes", "lane", "proposal", "acts"]);
    // `claim` is not in the reviewer list, and the room still judges and records it.
    expect(reviewer.called.result.structuredContent).toMatchObject({ kind: "claim", by: { via: "member", member: "@alice" } });
    expect(reviewer.code).toBe(0);
    const observer = await stdio(alice, ["--toolset", "observer"]);
    expect(observer.listed).toEqual(["attention", "explain", "lanes", "lane", "proposal", "operation", "acts"]);
  });

  test("a redeemed bearer: the list follows the session's delegation, as it does at the MCP URL", async () => {
    const agent = join(h.tmp, "agent");
    const { invitation, secret } = await h.room.invite("@agent", { role: "agent", custody: "room", kinds: ["claim", "note"] });
    expect((await cli(agent, ["redeem", invitationLink(h.room.url, h.room.id, invitation, secret)])).code).toBe(EXIT.ok);
    const out = await stdio(agent, []);
    expect(out.listed).toEqual(["claim", "workspace", "note", "attention", "explain", "lane", "proposal", "operation", "acts"]);
  });
});

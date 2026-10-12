import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { DeclaredDefinition } from "@generalbusiness/artroom-contract";
import { b64url } from "@generalbusiness/artroom-bytes";
import { secretSigner } from "@generalbusiness/artroom-client";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { McpService, MODERN, LEGACY, memoryStore, type McpConfig } from "../src/index.ts";
import { serveHttp, type HttpServing } from "../src/node.ts";
import { StandIn } from "./support/standin.ts";

// The scope service here is the STAND-IN of test/support/standin.ts, served over HTTP on loopback. The clients are real: the MCP
// client 2.3.1, pinned in this package's development dependencies, once in each wire revision. They show the transports, the
// handshakes, the sessions, the streams and the notifications; what a scope decides is the stories' (`*.scope.test.ts`).
const secret = new Uint8Array(32).fill(5);
const signer = secretSigner(secret);
const later = (name: string): DeclaredDefinition => ({ format: "artroom-definition-1", name, profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "g", items: {}, acts: {}, receives: {}, timed: {}, rules: {} } as unknown as DeclaredDefinition);
const CLI = fileURLToPath(new URL("../../cli/bin/artroom.js", import.meta.url));

let standIn: StandIn;
let scopes: Server;
let service: string;

beforeAll(async () => {
  standIn = new StandIn(signer.key);
  // The stand-in's routes over a real loopback HTTP server, for a child process to reach.
  scopes = createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    const answer = await standIn.fetch(`http://scopes${req.url}`, { method: req.method ?? "GET", ...(body ? { body } : {}) });
    res.writeHead(answer.status, { "content-type": "application/json" });
    const reader = (answer.body as unknown as ReadableStream<Uint8Array>).getReader();
    for (let r = await reader.read(); !r.done; r = await reader.read()) res.write(r.value);
    res.end();
  });
  await new Promise<void>((resolve) => scopes.listen(0, "127.0.0.1", resolve));
  const at = scopes.address() as { port: number };
  service = `http://127.0.0.1:${at.port}`;
});
afterAll(() => { scopes.close(); });

const configOf = (): McpConfig => ({ ...standIn.config(), service });
const client = (pin: "legacy" | "modern") => new Client({ name: "wire-test", version: "1" }, pin === "modern" ? { versionNegotiation: { mode: { pin: MODERN } } } : {});

/** An in-process server over loopback HTTP, with the watch's timer in the test's hands. */
async function http(mode: "default" | "generic" = "default"): Promise<HttpServing & { tick: () => Promise<void>; mcp: McpService }> {
  let tick: () => void = () => {};
  const mcp = new McpService({ service, signer, config: { read: async () => configOf(), addRoot: async () => {} }, custody: memoryStore(), mode, every: (_ms, run) => { tick = run; return () => { tick = () => {}; }; } });
  const serving = await serveHttp(mcp, "127.0.0.1", 0, () => {});
  return { ...serving, mcp, tick: async () => { tick(); await new Promise((r) => setTimeout(r, 200)); } };
}
const bearer = (s: HttpServing) => ({ requestInit: { headers: { authorization: `Bearer ${s.bearer}` } } });
const until = async (check: () => boolean, ms = 3000) => { for (let t = 0; t < ms && !check(); t += 25) await new Promise((r) => setTimeout(r, 25)); return check(); };

describe("both MCP wire revisions, each by its own rules", () => {
  // Invariant: a 2025-11-25 client initializes, gets a session, opens the GET stream, is told of a list change there, and after
  // DELETE or with an unknown session is answered 404 and initializes again; its results are the server's structured content.
  test("2025-11-25 over loopback HTTP: session, stream, list change, DELETE and 404", async () => {
    const s = await http();
    try {
      const c = client("legacy");
      const transport = new StreamableHTTPClientTransport(new URL(s.url), bearer(s));
      let changed = 0;
      c.setNotificationHandler("notifications/tools/list_changed", () => { changed++; });
      await c.connect(transport);
      expect(transport.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      const tools = await c.listTools();
      expect(tools.tools.map((t) => t.name)).toContain("room");
      expect(tools.tools.map((t) => t.name)).not.toContain("actions");
      const room = await c.callTool({ name: "room", arguments: {} });
      expect(room.structuredContent).toMatchObject({ key: signer.key, mode: "default" });
      const act = await c.callTool({ name: "repository.read-token", arguments: { on: 0, fields: { hours: 1 }, idempotencyKey: "legacy-1" } });
      expect(act.structuredContent).toMatchObject({ answer: "accepted", tool: "repository.read-token" });
      // The GET stream is open once the client has initialized; an activation changes the list; the watch tells the session once.
      await until(() => s.mcp.watching);
      standIn.activate(later("legacy-change"));
      await s.tick(); await s.tick();
      expect(await until(() => changed === 1)).toBe(true);
      await s.tick();
      expect(changed).toBe(1);
      const old = transport.sessionId!;
      await transport.terminateSession();
      const after = await fetch(s.url, { method: "POST", headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": old, "mcp-protocol-version": LEGACY }, body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }) });
      expect(after.status).toBe(404);
      await c.close();
      const again = client("legacy");
      await again.connect(new StreamableHTTPClientTransport(new URL(s.url), bearer(s)));
      expect((await again.listTools()).tools.length).toBe(tools.tools.length);
      await again.close();
    } finally { await s.close(); }
  });

  // Invariant: a 2026-07-28 client makes no handshake, discovers the server, is refused a version the server does not serve with
  // the defined error, and is told of a list change on its subscriptions/listen stream after opting in; every result is complete.
  test("2026-07-28 over loopback HTTP: no handshake, discover, unsupported version, listen, tagged notification", async () => {
    const s = await http();
    try {
      const post = (body: unknown) => fetch(s.url, { method: "POST", headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify(body) });
      const meta = (version: string) => ({ "io.modelcontextprotocol/protocolVersion": version, "io.modelcontextprotocol/clientCapabilities": {} });
      // The first request carries its version in _meta; there is no initialize.
      const listed = await (await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta(MODERN) } })).json() as { result: Record<string, unknown> };
      expect([listed.result["resultType"], listed.result["ttlMs"], listed.result["cacheScope"]]).toEqual(["complete", 30000, "private"]);
      const refused = await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: meta("2099-01-01") } })).json() as { error: { code: number; data: { supported: string[] } } };
      expect([refused.error.code, refused.error.data.supported]).toEqual([-32022, [MODERN, LEGACY]]);
      expect((await fetch(s.url, { method: "GET", headers: { authorization: `Bearer ${s.bearer}` } })).status).toBe(405);
      const c = client("modern");
      let changed = 0;
      c.setNotificationHandler("notifications/tools/list_changed", () => { changed++; });
      await c.connect(new StreamableHTTPClientTransport(new URL(s.url), bearer(s)));
      const room = await c.callTool({ name: "room", arguments: {} });
      expect(room.structuredContent).toMatchObject({ key: signer.key });
      const act = await c.callTool({ name: "repository.read-token", arguments: { on: 0, fields: { hours: 1 }, idempotencyKey: "modern-1" } });
      expect(act.structuredContent).toMatchObject({ answer: "accepted", tool: "repository.read-token" });
      const subscription = await c.listen({ toolsListChanged: true });
      standIn.activate(later("modern-change"));
      await s.tick();
      expect(await until(() => changed === 1)).toBe(true);
      await s.tick();
      expect(changed).toBe(1);
      await subscription.close?.();
      await c.close();
    } finally { await s.close(); }
  });

  // Invariant: the loopback HTTP server refuses a request with an Origin header, a request without the per-launch bearer, and a
  // bind address that is not loopback; each refusal carries no body detail.
  test("the loopback guards: origin, bearer, bind", async () => {
    const s = await http();
    try {
      const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "x", version: "1" } } });
      const withOrigin = await fetch(s.url, { method: "POST", headers: { authorization: `Bearer ${s.bearer}`, origin: "https://evil.example", "content-type": "application/json" }, body });
      const noBearer = await fetch(s.url, { method: "POST", headers: { "content-type": "application/json" }, body });
      const wrong = await fetch(s.url, { method: "POST", headers: { authorization: "Bearer not-it", "content-type": "application/json" }, body });
      const right = await fetch(s.url, { method: "POST", headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json" }, body });
      expect([withOrigin.status, await withOrigin.text(), noBearer.status, await noBearer.text(), wrong.status, right.status]).toEqual([403, "", 401, "", 401, 200]);
    } finally { await s.close(); }
    const mcp = new McpService({ service, signer, config: { read: async () => configOf(), addRoot: async () => {} }, custody: memoryStore() });
    await expect(serveHttp(mcp, "0.0.0.0", 0, () => {})).rejects.toThrow(/not a loopback address/);
    await expect(serveHttp(mcp, "localhost", 0, () => {})).rejects.toThrow(/not a loopback address/);
  });

  // Invariant: over stdio, `artroom mcp` serves a client of either revision with the same structured content and the same native
  // outcome under the one key; `--generic` lists actions and act, and the default does not.
  test("stdio, through artroom mcp: both revisions, and --generic", async () => {
    const home = mkdtempSync(join(tmpdir(), "mcp-home-"));
    mkdirSync(join(home, "keys"), { recursive: true });
    writeFileSync(join(home, "keys", "device.key"), `${b64url(secret)}\n`, { mode: 0o600 });
    writeFileSync(join(home, "config.json"), JSON.stringify({ v: 1, key: "device", ...configOf() }));
    const spawn = (pin: "legacy" | "modern", ...flags: string[]) => {
      const c = client(pin);
      return { c, transport: new StdioClientTransport({ command: process.execPath, args: [CLI, "mcp", ...flags], env: { ...process.env, ARTROOM_HOME: home } as Record<string, string>, stderr: "pipe" }) };
    };
    const results: Record<string, unknown>[] = [];
    for (const pin of ["legacy", "modern"] as const) {
      const { c, transport } = spawn(pin);
      await c.connect(transport);
      const names = (await c.listTools()).tools.map((t) => t.name);
      expect(names).toContain("member.role");
      expect(names).not.toContain("act");
      const room = await c.callTool({ name: "room", arguments: {} });
      const act = await c.callTool({ name: "member.role", arguments: { on: 1, fields: { role: "member" }, idempotencyKey: `stdio-${pin}` } });
      results.push(room.structuredContent as Record<string, unknown>, act.structuredContent as Record<string, unknown>);
      await c.close();
    }
    // The same structured content for room, and the same native outcome for the act, under the one key.
    expect(results[0]).toEqual(results[2]);
    expect([(results[1] as { answer: string }).answer, (results[3] as { answer: string }).answer]).toEqual(["accepted", "accepted"]);
    const signedBy = [...standIn.scopes.values()].flatMap((s) => s.entries).flatMap((e) => (e.entry.input.type === "act" && e.entry.input.signed.intent.kind === "set-role" ? [e.entry.input.signed.intent.actor] : []));
    expect(new Set(signedBy)).toEqual(new Set([signer.key]));
    const generic = spawn("modern", "--generic");
    await generic.c.connect(generic.transport);
    const names = (await generic.c.listTools()).tools.map((t) => t.name);
    expect([names.includes("actions"), names.includes("act"), names.includes("member.role")]).toEqual([true, true, false]);
    const signed = await generic.c.callTool({ name: "act", arguments: { target: "membership", kind: "set-role", digest: "platform:membership@2", on: 1, fields: { role: "member" }, idempotencyKey: "stdio-generic" } });
    expect(signed.structuredContent).toMatchObject({ answer: "accepted", tool: "act" });
    await generic.c.close();
  }, 120_000);
});

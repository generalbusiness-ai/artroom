import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { DeclaredDefinition } from "@generalbusiness/dap-contract";
import { b64url } from "@generalbusiness/artroom-bytes";
import { secretSigner } from "@generalbusiness/artroom-client";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { McpService, MODERN, MODERN_RESULT_EXTRA, LEGACY, Wire, memoryStore, newSession, type McpConfig } from "../src/index.ts";
import { serveHttp, serveStdio, type HttpServing } from "../src/node.ts";
import { StandIn } from "./support/standin.ts";

// The scope service here is the STAND-IN of test/support/standin.ts, served over HTTP on loopback. The clients are real: the MCP
// client 2.3.1, pinned in this package's development dependencies, once in each wire revision. They show the transports, the
// handshakes, the sessions, the streams and the notifications; what a scope decides is the stories' (`*.scope.test.ts`).
const secret = new Uint8Array(32).fill(5);
const signer = secretSigner(secret);
const later = (name: string): DeclaredDefinition => ({ format: "artroom-definition-1", name, profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "g", items: {}, acts: {}, receives: {}, timed: {}, rules: {} } as unknown as DeclaredDefinition);
const CLI = fileURLToPath(new URL("../../cli/bin/dap.js", import.meta.url));

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
/** The headers the 2026-07-28 transport requires beside a request, derived from the body as a conforming client sends them. */
function modernHeaders(body: unknown): Record<string, string> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return {};
  const m = body as { method?: unknown; params?: { name?: unknown; _meta?: Record<string, unknown> } };
  const version = m.params?._meta?.["io.modelcontextprotocol/protocolVersion"];
  if (typeof version !== "string") return {};
  const h: Record<string, string> = { "mcp-protocol-version": version.length > 256 ? MODERN : version };
  if (typeof m.method === "string" && m.method.length <= 256) h["mcp-method"] = m.method;
  const name = m.params?.name;
  if (m.method === "tools/call" && typeof name === "string" && name.length <= 256) h["mcp-name"] = /^[\x20-\x7e]*$/.test(name) ? name : `=?base64?${Buffer.from(name, "utf8").toString("base64")}?=`;
  return h;
}

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
      const post = (body: unknown) => fetch(s.url, { method: "POST", headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", accept: "application/json, text/event-stream", ...modernHeaders(body) }, body: JSON.stringify(body) });
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

  // Invariant: over stdio, `dap mcp` serves a client of either revision with the same structured content and the same native
  // outcome under the one key; `--generic` lists actions and act, and the default does not.
  test("stdio, through dap mcp: both revisions, and --generic", async () => {
    const home = mkdtempSync(join(tmpdir(), "mcp-home-"));
    mkdirSync(join(home, "keys"), { recursive: true });
    writeFileSync(join(home, "keys", "device.key"), `${b64url(secret)}\n`, { mode: 0o600 });
    writeFileSync(join(home, "config.json"), JSON.stringify({ v: 1, key: "device", ...configOf() }));
    const spawn = (pin: "legacy" | "modern", ...flags: string[]) => {
      const c = client(pin);
      const transport = new StdioClientTransport({ command: process.execPath, args: [CLI, "mcp", ...flags], env: { ...process.env, ARTROOM_HOME: home } as Record<string, string>, stderr: "pipe" });
      const errors: unknown[] = [], diagnostics: string[] = [];
      c.onerror = error => { errors.push(error); };
      transport.stderr?.on("data", (chunk: Buffer) => { diagnostics.push(chunk.toString("utf8")); });
      const observed = () => {
        const points = diagnostics.join("").split("\n").filter(line => line.startsWith("dap.metric ")).map(line => JSON.parse(line.slice("dap.metric ".length)) as { schema: string; blobs: string[] });
        expect(points.some(p => p.blobs[0] === "tools-list")).toBe(true);
        expect(points.some(p => p.blobs[0] === "tool-call")).toBe(true);
        expect(points.every(p => p.schema === "mcp-metrics-v1")).toBe(true);
        expect(JSON.stringify(points)).not.toContain(b64url(secret));
        expect(errors).toEqual([]);
      };
      return { c, transport, observed };
    };
    const results: Record<string, unknown>[] = [];
    for (const pin of ["legacy", "modern"] as const) {
      const { c, transport, observed } = spawn(pin);
      await c.connect(transport);
      const names = (await c.listTools()).tools.map((t) => t.name);
      expect(names).toContain("member.role");
      expect(names).not.toContain("act");
      const room = await c.callTool({ name: "room", arguments: {} });
      const act = await c.callTool({ name: "member.role", arguments: { on: 1, fields: { role: "member" }, idempotencyKey: `stdio-${pin}` } });
      results.push(room.structuredContent as Record<string, unknown>, act.structuredContent as Record<string, unknown>);
      await c.close();
      observed();
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
    generic.observed();
  }, 120_000);

  // Invariant: the HTTP transport decodes a body once, as UTF-8, so a character split across chunks arrives whole; answers null,
  // scalars, arrays, objects without jsonrpc and unparsable bodies with a bounded JSON-RPC error; survives an aborted upload; and
  // after each of these a real client's call is served.
  test("HTTP bytes and invalid frames, each followed by a healthy call", async () => {
    const s = await http();
    try {
      const c = client("modern");
      await c.connect(new StreamableHTTPClientTransport(new URL(s.url), bearer(s)));
      const healthy = async () => expect((await c.callTool({ name: "room", arguments: {} })).structuredContent).toMatchObject({ key: signer.key });
      const raw = (body: string) => fetch(s.url, { method: "POST", headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body });
      for (const [body, code] of [["null", -32600], ["3", -32600], ['"x"', -32600], ["[]", -32600], ['{"id":1,"method":"tools/list"}', -32600], ["{", -32700]] as const) {
        const answer = await raw(body);
        const parsed = await answer.json() as { jsonrpc: string; id: null; error: { code: number; message: string } };
        expect([answer.status, parsed.jsonrpc, parsed.id, parsed.error.code], body).toEqual([400, "2.0", null, code]);
        expect(JSON.stringify(parsed).length).toBeLessThan(256);
        await healthy();
      }
      // A two-byte character split across two chunks of the body.
      const name = "café-tool";
      const bytes = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: {}, _meta: { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientCapabilities": {} } } }), "utf8");
      const split = bytes.indexOf(Buffer.from("é", "utf8")) + 1;
      const reply = await new Promise<string>((resolve, reject) => {
        const req = request(s.url, { method: "POST", headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", "content-length": bytes.length, "mcp-protocol-version": MODERN, "mcp-method": "tools/call", "mcp-name": `=?base64?${Buffer.from(name, "utf8").toString("base64")}?=` } }, (res) => { let out = ""; res.setEncoding("utf8"); res.on("data", (d: string) => { out += d; }); res.on("end", () => resolve(out)); });
        req.on("error", reject);
        req.write(bytes.subarray(0, split));
        setTimeout(() => { req.end(bytes.subarray(split)); }, 30);
      });
      expect((JSON.parse(reply) as { result: { structuredContent: { message: string } } }).result.structuredContent.message).toBe(`No tool is named ${name} in this list.`);
      await healthy();
      // An upload aborted halfway: nothing hangs or rejects, and the next call is served.
      await new Promise<void>((resolve) => {
        const req = request(s.url, { method: "POST", headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", "content-length": 1000 } });
        req.on("error", () => resolve());
        req.write("{\"jsonrpc\":\"2.0\",");
        setTimeout(() => { req.destroy(); resolve(); }, 30);
      });
      await healthy();
      await c.close();
    } finally { await s.close(); }
  });

  // Invariant: a listen subscription belongs to its client stream: two clients that both use request ID 0 each keep their own;
  // an abrupt disconnect removes that stream's subscription and its watcher, and only that one; a reconnect subscribes again; and
  // when the last stream closes no watcher is left.
  test("listen subscriptions by client stream: equal IDs, abrupt disconnect, reconnect, cleanup", async () => {
    const s = await http();
    try {
      const listen = () => {
        const abort = new AbortController();
        const seen: string[] = [];
        const body = { jsonrpc: "2.0", id: 0, method: "subscriptions/listen", params: { notifications: { toolsListChanged: true }, _meta: { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientCapabilities": {} } } };
        const opened = fetch(s.url, { method: "POST", signal: abort.signal, headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", accept: "application/json, text/event-stream", ...modernHeaders(body) },
          body: JSON.stringify(body) })
          .then(async (res) => { const reader = res.body!.getReader(); for (;;) { const r = await reader.read(); if (r.done) break; seen.push(Buffer.from(r.value).toString("utf8")); } }).catch(() => {});
        return { seen, abort, opened, text: () => seen.join("") };
      };
      const a = listen(), b = listen();
      expect(await until(() => a.text().includes("acknowledged") && b.text().includes("acknowledged"))).toBe(true);
      expect(s.wire.listening).toBe(2);
      a.abort.abort();
      expect(await until(() => s.wire.listening === 1)).toBe(true);
      standIn.activate(later("equal-ids"));
      await s.tick();
      expect(await until(() => b.text().includes("notifications/tools/list_changed"))).toBe(true);
      expect(a.text()).not.toContain("notifications/tools/list_changed");
      const again = listen();
      expect(await until(() => again.text().includes("acknowledged") && s.wire.listening === 2)).toBe(true);
      b.abort.abort(); again.abort.abort();
      expect(await until(() => s.wire.listening === 0 && !s.mcp.watching)).toBe(true);
    } finally { await s.close(); }
  });

  // Invariant: stdio serves sustained traffic, one answer per request; a frame split across chunks inside a character arrives
  // whole; a line over the bound is answered once and skipped to its end without swallowing the next frame.
  test("stdio: sustained traffic, split characters, an oversized line", async () => {
    const mcp = new McpService({ service, signer, config: { read: async () => configOf(), addRoot: async () => {} }, custody: memoryStore() });
    const input = new PassThrough(), output = new PassThrough();
    const lines: Record<string, unknown>[] = [];
    let rest = "";
    output.on("data", (d: Buffer) => { rest += d.toString("utf8"); for (let i = rest.indexOf("\n"); i >= 0; i = rest.indexOf("\n")) { lines.push(JSON.parse(rest.slice(0, i)) as Record<string, unknown>); rest = rest.slice(i + 1); } });
    const done = serveStdio(mcp, input, output);
    const meta = { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientCapabilities": {} };
    for (let i = 0; i < 300; i++) input.write(`${JSON.stringify({ jsonrpc: "2.0", id: i, method: "server/discover", params: { _meta: meta } })}\n`);
    const call = Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id: "split", method: "tools/call", params: { name: "naïve", arguments: {}, _meta: meta } })}\n`, "utf8");
    const at = call.indexOf(Buffer.from("ï", "utf8")) + 1;
    input.write(call.subarray(0, at)); input.write(call.subarray(at));
    input.write(`${"x".repeat(5 * 1024 * 1024)}\n`);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: "after", method: "server/discover", params: { _meta: meta } })}\n`);
    expect(await until(() => lines.some((l) => l["id"] === "after") && lines.some((l) => l["id"] === "split"), 10_000)).toBe(true);
    expect(lines.filter((l) => typeof l["id"] === "number" && l["result"] !== undefined)).toHaveLength(300);
    expect((lines.find((l) => l["id"] === "split")!["result"] as { structuredContent: { message: string } }).structuredContent.message).toBe("No tool is named naïve in this list.");
    expect(lines.filter((l) => (l["error"] as { code?: number } | undefined)?.code === -32600)).toHaveLength(1);
    input.end();
    await done;
  });

  // Invariant: a notification never gets a reply. Over HTTP it is answered 202 with no body; on stdio nothing is written. A method
  // that is only a request (tools/call, initialize, tools/list), sent as a notification, runs nothing, issues no session and is
  // counted; a real client is served after each.
  test("notifications get no reply, and request-only methods sent as notifications run nothing", async () => {
    const meta = { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientCapabilities": {} };
    const s = await http();
    try {
      const c = client("modern");
      await c.connect(new StreamableHTTPClientTransport(new URL(s.url), bearer(s)));
      const healthy = async () => expect((await c.callTool({ name: "room", arguments: {} })).structuredContent).toMatchObject({ key: signer.key });
      const raw = (body: unknown, session?: string) => fetch(s.url, { method: "POST", headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", accept: "application/json, text/event-stream", ...(session ? { "mcp-session-id": session } : {}), ...modernHeaders(body) }, body: JSON.stringify(body) });
      const opened = await raw({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "raw", version: "0" } } });
      const legacy = opened.headers.get("mcp-session-id")!;
      expect(legacy).toBeTruthy();
      const before = s.wire.ignored;
      const sent: [unknown, string | undefined, boolean][] = [
        [{ jsonrpc: "2.0", method: "tools/call", params: { name: "room", arguments: {}, _meta: meta } }, undefined, true],
        [{ jsonrpc: "2.0", method: "initialize", params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "raw", version: "0" } } }, undefined, true],
        [{ jsonrpc: "2.0", method: "tools/list", params: {} }, legacy, true],
        [{ jsonrpc: "2.0", method: "notifications/initialized" }, legacy, false],
        [{ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 9, _meta: meta } }, undefined, false],
      ];
      for (const [body, session] of sent) {
        const quiet = standIn.requests.length;
        const answer = await raw(body, session);
        // No body, no session, and no read or act on the scope service.
        expect([answer.status, await answer.text(), answer.headers.get("mcp-session-id"), standIn.requests.length - quiet], JSON.stringify(body).slice(0, 60)).toEqual([202, "", null, 0]);
        await healthy();
      }
      expect(s.wire.ignored - before).toBe(3);
      await c.close();
    } finally { await s.close(); }

    const mcp = new McpService({ service, signer, config: { read: async () => configOf(), addRoot: async () => {} }, custody: memoryStore() });
    const input = new PassThrough(), output = new PassThrough();
    const lines: Record<string, unknown>[] = [];
    let rest = "";
    output.on("data", (d: Buffer) => { rest += d.toString("utf8"); for (let i = rest.indexOf("\n"); i >= 0; i = rest.indexOf("\n")) { lines.push(JSON.parse(rest.slice(0, i)) as Record<string, unknown>); rest = rest.slice(i + 1); } });
    const done = serveStdio(mcp, input, output);
    const quiet = standIn.requests.length;
    for (const body of [
      { jsonrpc: "2.0", method: "tools/call", params: { name: "room", arguments: {}, _meta: meta } },
      { jsonrpc: "2.0", method: "initialize", params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "raw", version: "0" } } },
      { jsonrpc: "2.0", method: "tools/list", params: { _meta: meta } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 9, _meta: meta } },
    ]) input.write(`${JSON.stringify(body)}\n`);
    expect(standIn.requests.length).toBe(quiet);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: "after", method: "server/discover", params: { _meta: meta } })}\n`);
    expect(await until(() => lines.some((l) => l["id"] === "after"), 10_000)).toBe(true);
    expect(lines.map((l) => l["id"])).toEqual(["after"]);
    input.end();
    await done;
  });

  // Invariant: the response bounds hold for the service's CallResult; a 2026-07-28 tool result carries exactly
  // MODERN_RESULT_EXTRA bytes more (resultType and the server's information), and nothing else is added.
  test("a 2026-07-28 tool result: the CallResult and a stated overhead", async () => {
    const s = await http();
    try {
      const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "room", arguments: {}, _meta: { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientCapabilities": {} } } };
      const answer = await fetch(s.url, { method: "POST", headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", accept: "application/json, text/event-stream", ...modernHeaders(body) }, body: JSON.stringify(body) });
      const result = (await answer.json() as { result: Record<string, unknown> }).result;
      const { resultType, _meta, ...callResult } = result;
      expect([resultType, Object.keys(_meta as object)]).toEqual(["complete", ["io.modelcontextprotocol/serverInfo"]]);
      expect(Object.keys(callResult).sort()).toEqual(["content", "isError", "structuredContent"]);
      const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
      expect(bytes(result) - bytes(callResult)).toBe(MODERN_RESULT_EXTRA);
      expect(MODERN_RESULT_EXTRA).toBeLessThan(128);
    } finally { await s.close(); }
  });

  // Invariant: a listen whose stream closes while its first snapshot is being read leaves nothing behind: no watcher, no listen
  // and no timer, and it is never acknowledged.
  test("a listen that disconnects before its snapshot leaves no watcher", async () => {
    let release!: () => void;
    let subscribed = 0;
    const deferred = new Promise<void>((resolve) => { release = resolve; });
    const fake = { snapshot: async () => { await deferred; return { generation: "sha256:x" }; }, subscribe: () => { subscribed++; return () => {}; } } as unknown as McpService;
    const wire = new Wire(fake);
    const sent: unknown[] = [];
    const owner = {};
    const pending = wire.handle({ jsonrpc: "2.0", id: 0, method: "subscriptions/listen", params: { notifications: { toolsListChanged: true }, _meta: { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientCapabilities": {} } } }, null, (m) => { sent.push(m); }, owner);
    expect(wire.listening).toBe(1);
    wire.dropStream(owner);
    release();
    expect(await pending).toBeNull();
    expect([subscribed, wire.listening, sent]).toEqual([0, 0, []]);
  });

  // Invariant: a stdio server dispatches every line of one read in the same turn; with no persistence hook the live
  // initialized marker moves at once, so a tools/list dispatched right after notifications/initialized is served, not refused.
  test("notifications/initialized and tools/list dispatched in one turn, with no hook: the list is served", async () => {
    const fake = { snapshot: async () => ({ generation: "sha256:x" }), page: async () => ({ generation: "sha256:x", tools: [] }), subscribe: () => () => {} } as unknown as McpService;
    const wire = new Wire(fake);
    const session = newSession(null);
    const send = () => {};
    const owner = {};
    expect((await wire.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "t", version: "0" } } }, session, send, owner))?.error).toBeUndefined();
    // Dispatched in the same turn, as one read of two lines is.
    const initialized = wire.handle({ jsonrpc: "2.0", method: "notifications/initialized" }, session, send, owner);
    const listed = wire.handle({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, session, send, owner);
    expect(await initialized).toBeNull();
    const reply = await listed;
    expect(reply?.error, JSON.stringify(reply)).toBeUndefined();
    expect(Array.isArray((reply?.result as { tools?: unknown[] })?.tools)).toBe(true);
  });

  // Invariant: frames are told apart by JSON-RPC's rules, an invalid ID is never echoed, and nothing a client sends is repeated
  // past 256 characters: large IDs, versions and methods get bounded errors, and a healthy call is served after each.
  test("IDs, methods and versions: invalid frames rejected, reflections bounded", async () => {
    const s = await http();
    try {
      const c = client("modern");
      await c.connect(new StreamableHTTPClientTransport(new URL(s.url), bearer(s)));
      const healthy = async () => expect((await c.callTool({ name: "room", arguments: {} })).structuredContent).toMatchObject({ key: signer.key });
      const raw = (body: unknown) => fetch(s.url, { method: "POST", headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", accept: "application/json, text/event-stream", ...modernHeaders(body) }, body: JSON.stringify(body) });
      const meta = (version: string) => ({ "io.modelcontextprotocol/protocolVersion": version, "io.modelcontextprotocol/clientCapabilities": {} });
      const big = "x".repeat(20_000);
      for (const id of [{ a: 1 }, [1], true, null, big]) {
        const answer = await (await raw({ jsonrpc: "2.0", id, method: "tools/list", params: { _meta: meta(MODERN) } })).json() as { id: unknown; error: { code: number } };
        expect([answer.id, answer.error.code], JSON.stringify(id).slice(0, 20)).toEqual([null, -32600]);
        await healthy();
      }
      // A malformed request is not taken for a response: a method that is not a string, beside a result.
      const malformed = await (await raw({ jsonrpc: "2.0", id: 3, method: 5, result: {} })).json() as { id: unknown; error: { code: number } };
      expect([malformed.id, malformed.error.code]).toEqual([null, -32600]);
      for (const body of [{ jsonrpc: "2.0", id: 4, method: "tools/list", params: { _meta: meta(big) } }, { jsonrpc: "2.0", id: 5, method: big, params: { _meta: meta(MODERN) } }, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: big, arguments: {}, _meta: meta(MODERN) } }]) {
        const text = await (await raw(body)).text();
        expect(text.length, text.slice(0, 80)).toBeLessThan(1024);
        await healthy();
      }
      await c.close();
    } finally { await s.close(); }
  });
});

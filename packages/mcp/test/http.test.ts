/**
 * H8 of the hosted endpoint design (notes/2026-10-13-hosted-mcp-endpoint.md, section 6), against the loopback server, which
 * serves through the same HTTP layer as the hosted endpoint (`src/http.ts`): the method and version matrix, the modern
 * headers, the legacy session rules, the cases both revisions share, and the methods across eras. The scope service is the
 * STAND-IN of test/support/standin.ts.
 */
import { createServer, request, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { secretSigner } from "@generalbusiness/artroom-client";
import { McpService, MODERN, LEGACY, memoryStore, type McpConfig } from "../src/index.ts";
import { HEADER_MISMATCH, SESSIONS_MOST, STREAMS_MOST } from "../src/http.ts";
import { serveHttp, type HttpServing } from "../src/node.ts";
import { StandIn } from "./support/standin.ts";

const signer = secretSigner(new Uint8Array(32).fill(7));
const META = { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientCapabilities": {} };
let standIn: StandIn;
let scopes: Server;
let service: string;
let s: HttpServing;
/** A test holds the service's configuration read, and with it every snapshot, while it opens streams concurrently. */
let hold: Promise<void> | null = null;

beforeAll(async () => {
  standIn = new StandIn(signer.key);
  scopes = createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    const answer = await standIn.fetch(`http://scopes${req.url}`, { method: req.method ?? "GET", ...(body ? { body } : {}) });
    res.writeHead(answer.status, { "content-type": "application/json" });
    const reader = (answer.body as unknown as ReadableStream<Uint8Array>).getReader();
    for (let r = await reader.read(); !r.done; r = await reader.read()) res.write(r.value);
    res.end();
  });
  await new Promise<void>((resolve) => scopes.listen(0, "127.0.0.1", resolve));
  service = `http://127.0.0.1:${(scopes.address() as { port: number }).port}`;
  const config: McpConfig = { ...standIn.config(), service };
  const mcp = new McpService({ service, signer, config: { read: async () => { if (hold) await hold; return config; }, addRoot: async () => {} }, custody: memoryStore(), every: () => () => {} });
  s = await serveHttp(mcp, "127.0.0.1", 0, () => {});
});
afterAll(async () => { await s.close(); scopes.close(); });

type Reply = { status: number; type: string | null; session: string | null; allow: string | null; text: string; json: () => { id: unknown; error?: { code: number; message: string; data?: { supported?: string[] } }; result?: Record<string, unknown> } };
async function send(method: string, headers: Record<string, string>, body?: unknown, raw?: string): Promise<Reply> {
  const res = await fetch(s.url, { method, headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", ...headers }, ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const text = res.headers.get("content-type")?.startsWith("text/event-stream") ? "" : await res.text();
  if (res.headers.get("content-type")?.startsWith("text/event-stream")) await res.body?.cancel();
  return { status: res.status, type: res.headers.get("content-type"), session: res.headers.get("mcp-session-id"), allow: res.headers.get("allow"), text, json: () => JSON.parse(text) };
}
const modern = (method: string, params: Record<string, unknown> = {}, id: number = 1) => ({ jsonrpc: "2.0", id, method, params: { ...params, _meta: META } });
const modernHeaders = (method: string, name?: string) => ({ "mcp-protocol-version": MODERN, "mcp-method": method, ...(name !== undefined ? { "mcp-name": name } : {}) });
const sentinel = (name: string) => `=?base64?${Buffer.from(name, "utf8").toString("base64")}?=`;
/** A live 2025-11-25 session: initialized, with its ID. */
async function legacySession(): Promise<string> {
  const opened = await send("POST", { "mcp-protocol-version": LEGACY }, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "h8", version: "0" } } });
  expect([opened.status, opened.type]).toEqual([200, "application/json"]);
  const id = opened.session!;
  expect(id).toBeTruthy();
  expect((await send("POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": id }, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
  return id;
}
/** Open a session's GET stream and keep it open; returns the opener. */
function openStream(headers: Record<string, string>) {
  const abort = new AbortController();
  const seen: string[] = [];
  const opened = fetch(s.url, { method: "GET", signal: abort.signal, headers: { authorization: `Bearer ${s.bearer}`, ...headers } })
    .then(async (res) => { if (!res.body || res.status !== 200) return res.status; const reader = res.body.getReader(); for (;;) { const r = await reader.read(); if (r.done) break; seen.push(Buffer.from(r.value).toString("utf8")); } return res.status; })
    .catch(() => -1);
  return { abort, opened, text: () => seen.join("") };
}
const until = async (check: () => boolean, ms = 3000) => { for (let t = 0; t < ms && !check(); t += 25) await new Promise((r) => setTimeout(r, 25)); return check(); };

describe("H8, the HTTP layer, through the loopback server", () => {
  test("modern: the version header, Mcp-Method and Mcp-Name, each refusal naming no value", async () => {
    const mismatch = async (headers: Record<string, string>, body: unknown, why: string) => {
      const r = await send("POST", headers, body);
      expect([r.status, r.type, r.json().error?.code], why).toEqual([400, "application/json", HEADER_MISMATCH]);
      expect(r.text, why).not.toContain("room");
    };
    await mismatch({ "mcp-method": "tools/list" }, modern("tools/list"), "missing MCP-Protocol-Version");
    await mismatch({ "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { ...META, "io.modelcontextprotocol/protocolVersion": LEGACY } } }, "header and _meta differ");
    await mismatch({ "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, "a July header on a body with no _meta version");
    await mismatch({ "mcp-protocol-version": LEGACY }, modern("tools/list"), "a November header on July body metadata");
    await mismatch({ "mcp-protocol-version": MODERN }, modern("tools/list"), "missing Mcp-Method");
    await mismatch({ "mcp-protocol-version": MODERN, "mcp-method": "tools/call" }, modern("tools/list"), "Mcp-Method differs");
    await mismatch(modernHeaders("tools/call"), modern("tools/call", { name: "room", arguments: {} }), "missing Mcp-Name");
    await mismatch(modernHeaders("tools/call", "inspect"), modern("tools/call", { name: "room", arguments: {} }), "Mcp-Name differs");
    await mismatch(modernHeaders("tools/call", "=?base64?###?="), modern("tools/call", { name: "room", arguments: {} }), "a sentinel that is not base64");
    await mismatch(modernHeaders("tools/call", `=?base64?${Buffer.from([0xff, 0xfe]).toString("base64")}?=`), modern("tools/call", { name: "��", arguments: {} }), "a sentinel of invalid UTF-8");
    const unsupported = await send("POST", { "mcp-protocol-version": "2025-03-26", "mcp-method": "tools/list" }, modern("tools/list"));
    expect([unsupported.status, unsupported.json().error?.code, unsupported.json().error?.data?.supported]).toEqual([400, -32022, [MODERN, LEGACY]]);
    for (const [name, header] of [["room", "room"], ["room", sentinel("room")], ["café", sentinel("café")], [" room", sentinel(" room")]] as const) {
      const r = await send("POST", modernHeaders("tools/call", header), modern("tools/call", { name, arguments: {} }));
      expect([r.status, r.type, r.json().error, typeof r.json().result], `${name} as ${header}`).toEqual([200, "application/json", undefined, "object"]);
    }
    const unknown = await send("POST", modernHeaders("no/such"), modern("no/such"));
    expect([unknown.status, unknown.json().error?.code]).toEqual([404, -32601]);
    const notified = await send("POST", modernHeaders("notifications/cancelled"), { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1, _meta: META } });
    expect([notified.status, notified.text, notified.session]).toEqual([202, "", null]);
    for (const [raw, code] of [["{", -32700], ['{"id":1}', -32600], ["null", -32600]] as const) {
      const r = await send("POST", modernHeaders("tools/list"), undefined, raw);
      expect([r.status, r.json().id, r.json().error?.code], raw).toEqual([400, null, code]);
    }
  });

  test("legacy: the version header on each method, sessions, 400 and 404, modern headers ignored", async () => {
    const id = await legacySession();
    const listed = await send("POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": id, "mcp-method": "tools/call", "mcp-name": "ignored" }, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect([listed.status, listed.type, typeof listed.json().result]).toEqual([200, "application/json", "object"]);
    const absent = await send("POST", { "mcp-session-id": id }, { jsonrpc: "2.0", id: 3, method: "tools/list" });
    expect([absent.status, typeof absent.json().result], "header absent, known session: served at its recorded version").toEqual([200, "object"]);
    for (const method of ["POST", "GET", "DELETE"]) {
      for (const bad of ["2025-03-26", "x"]) {
        const r = await send(method, { "mcp-protocol-version": bad, "mcp-session-id": id }, method === "POST" ? { jsonrpc: "2.0", id: 4, method: "tools/list" } : undefined);
        expect([r.status, r.json().id, r.json().error?.code], `${method} ${bad}`).toEqual([400, method === "POST" ? 4 : null, method === "POST" ? -32022 : -32600]);
      }
    }
    expect((await send("POST", { "mcp-protocol-version": LEGACY }, { jsonrpc: "2.0", id: 5, method: "tools/list" })).status, "a request without a session").toBe(400);
    expect((await send("POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": "no-such" }, { jsonrpc: "2.0", id: 6, method: "tools/list" })).status).toBe(404);
    const other = await send("POST", { "mcp-protocol-version": LEGACY }, { jsonrpc: "2.0", id: 7, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "h8", version: "0" } } });
    expect(other.json().result?.["protocolVersion"], "initialize naming another revision is answered with the server's").toBe(LEGACY);
    // A second GET replaces the first stream, which closes; the replacement keeps receiving.
    const first = openStream({ "mcp-protocol-version": LEGACY, "mcp-session-id": id });
    await until(() => first.text().includes(": stream"));
    const second = openStream({ "mcp-protocol-version": LEGACY, "mcp-session-id": id });
    expect(await until(() => second.text().includes(": stream"))).toBe(true);
    expect(await first.opened).toBe(200);
    expect(s.http.streams).toBe(1);
    second.abort.abort();
    expect(await until(() => s.http.streams === 0)).toBe(true);
    expect((await send("DELETE", { "mcp-protocol-version": LEGACY, "mcp-session-id": id })).status).toBe(200);
    expect((await send("DELETE", { "mcp-protocol-version": LEGACY, "mcp-session-id": id })).status, "ended").toBe(404);
  });

  test("both: origin, the body bound, batches, non-frames, a 5th stream, a 17th session", async () => {
    expect((await send("POST", { origin: "https://evil.example", ...modernHeaders("tools/list") }, modern("tools/list"))).status).toBe(403);
    // A body over the bound: the server answers 413 while the upload is still being sent, so the request is made with node:http, which
    // reports the response even when the socket then closes on its write.
    const big = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "x".repeat(4 * 1024 * 1024 + 16), _meta: META } });
    const status = await new Promise<number>((resolve) => {
      const req = request(s.url, { method: "POST", headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", "content-length": Buffer.byteLength(big), ...modernHeaders("tools/list") } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
      req.on("error", () => resolve(-1));
      req.end(big);
    });
    expect(status).toBe(413);
    for (const headers of [modernHeaders("tools/list"), { "mcp-protocol-version": LEGACY }, { "mcp-protocol-version": "2025-03-26" }]) {
      const r = await send("POST", headers, [modern("tools/list"), modern("tools/list", {}, 2)]);
      // A batch is no frame, so it is refused as an invalid request whatever version its header claims.
      expect([r.status, r.json().id, r.json().error?.code], JSON.stringify(headers)).toEqual([400, null, -32600]);
    }
    expect((await send("POST", modernHeaders("tools/list"), 3)).json().error?.code).toBe(-32600);
    // Streams: two listens and two legacy streams fill the four; a fifth of either kind is refused 409.
    const listens = [1, 2].map(() => {
      const abort = new AbortController();
      const seen: string[] = [];
      const body = { jsonrpc: "2.0", id: 0, method: "subscriptions/listen", params: { notifications: { toolsListChanged: true }, _meta: META } };
      const opened = fetch(s.url, { method: "POST", signal: abort.signal, headers: { authorization: `Bearer ${s.bearer}`, "content-type": "application/json", ...modernHeaders("subscriptions/listen") }, body: JSON.stringify(body) })
        .then(async (res) => { const reader = res.body!.getReader(); for (;;) { const r = await reader.read(); if (r.done) break; seen.push(Buffer.from(r.value).toString("utf8")); } return res.status; }).catch(() => -1);
      return { abort, opened, text: () => seen.join("") };
    });
    for (const l of listens) expect(await until(() => l.text().includes("acknowledged"))).toBe(true);
    const sessions = [await legacySession(), await legacySession(), await legacySession()];
    const streams = sessions.slice(0, 2).map((id) => openStream({ "mcp-protocol-version": LEGACY, "mcp-session-id": id }));
    for (const st of streams) expect(await until(() => st.text().includes(": stream"))).toBe(true);
    expect(s.http.streams).toBe(STREAMS_MOST);
    const fifth = await send("GET", { "mcp-protocol-version": LEGACY, "mcp-session-id": sessions[2]! });
    expect([fifth.status, fifth.type]).toEqual([409, "application/json"]);
    const fifthListen = await send("POST", modernHeaders("subscriptions/listen"), { jsonrpc: "2.0", id: 9, method: "subscriptions/listen", params: { notifications: {}, _meta: META } });
    expect(fifthListen.status).toBe(409);
    for (const l of listens) l.abort.abort();
    for (const st of streams) st.abort.abort();
    expect(await until(() => s.http.streams === 0)).toBe(true);
    // Sessions: the oldest of 17 is ended when the 17th initializes.
    const oldest = [...s.http.sessions.keys()][0]!;
    for (let n = s.http.sessions.size; n < SESSIONS_MOST + 1; n++) await legacySession();
    expect(s.http.sessions.size).toBe(SESSIONS_MOST);
    expect((await send("POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": oldest }, { jsonrpc: "2.0", id: 2, method: "tools/list" })).status).toBe(404);
    for (const id of [...s.http.sessions.keys()]) await send("DELETE", { "mcp-protocol-version": LEGACY, "mcp-session-id": id });
  });

  test("mixed eras, and the methods across eras with a live November session", async () => {
    const S = await legacySession();
    // A modern request carrying a legacy session ID: the session is ignored and the request served modern.
    const mixed = await send("POST", { ...modernHeaders("tools/list"), "mcp-session-id": S }, modern("tools/list"));
    expect([mixed.status, mixed.json().result?.["resultType"]]).toEqual([200, "complete"]);
    // Explicit July GET and DELETE naming S: 405 with Allow: POST, nothing consulted, S untouched.
    for (const method of ["GET", "DELETE"]) {
      for (const id of [S, "no-such-session"]) {
        const r = await send(method, { "mcp-protocol-version": MODERN, "mcp-session-id": id });
        expect([r.status, r.allow, r.text], `${method} July naming ${id === S ? "S" : "an unknown ID"}`).toEqual([405, "POST", ""]);
      }
    }
    const still = await send("POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": S }, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect([still.status, typeof still.json().result], "S serves a POST after the July attempts").toEqual([200, "object"]);
    const stream = openStream({ "mcp-protocol-version": LEGACY, "mcp-session-id": S });
    expect(await until(() => stream.text().includes(": stream")), "S opens its stream after the July attempts").toBe(true);
    stream.abort.abort();
    await until(() => s.http.streams === 0);
    // Explicit November without a session: 400; header-less without a session: 405; header-less with S: served; unknown: 404.
    for (const method of ["GET", "DELETE"]) {
      expect((await send(method, { "mcp-protocol-version": LEGACY })).status, `${method} November, no session`).toBe(400);
      const bare = await send(method, {});
      expect([bare.status, bare.allow], `${method} no header, no session`).toEqual([405, "POST"]);
      expect((await send(method, { "mcp-session-id": "no-such-session" })).status, `${method} no header, unknown session`).toBe(404);
    }
    const headerless = openStream({ "mcp-session-id": S });
    expect(await until(() => headerless.text().includes(": stream")), "a header-less GET follows the named live session").toBe(true);
    headerless.abort.abort();
    await until(() => s.http.streams === 0);
    const posted = await send("POST", { "mcp-session-id": S }, { jsonrpc: "2.0", id: 3, method: "tools/list" });
    expect([posted.status, typeof posted.json().result], "a POST with no header and no _meta version is served at S's recorded version").toEqual([200, "object"]);
    expect((await send("DELETE", { "mcp-session-id": S })).status, "a header-less DELETE ends the named live session").toBe(200);
    expect((await send("POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": S }, { jsonrpc: "2.0", id: 4, method: "tools/list" })).status).toBe(404);
  });
});

describe("H8, streams opened concurrently", () => {
  test("two GETs that enter while the snapshot is held cannot both pass the limit", async () => {
    const sessions = [await legacySession(), await legacySession(), await legacySession(), await legacySession(), await legacySession()];
    const held = sessions.slice(0, 3).map((id) => openStream({ "mcp-protocol-version": LEGACY, "mcp-session-id": id }));
    for (const st of held) expect(await until(() => st.text().includes(": stream"))).toBe(true);
    expect(s.http.streams).toBe(3);
    // The snapshot every stream open takes is held; two more GETs, on two more sessions, arrive while it is.
    let release!: () => void;
    hold = new Promise<void>((r) => { release = r; });
    const a = openStream({ "mcp-protocol-version": LEGACY, "mcp-session-id": sessions[3]! });
    const b = openStream({ "mcp-protocol-version": LEGACY, "mcp-session-id": sessions[4]! });
    await new Promise((r) => setTimeout(r, 100));
    release();
    hold = null;
    // The refused one answers at once with JSON; the admitted one is a stream, which ends only when aborted.
    const refused = await Promise.race([a.opened, b.opened]);
    expect(refused, "one was refused").toBe(409);
    expect(await until(() => a.text().includes(": stream") || b.text().includes(": stream")), "the other opened").toBe(true);
    expect(s.http.streams).toBe(STREAMS_MOST);
    for (const st of [...held, a, b]) st.abort.abort();
    expect(await until(() => s.http.streams === 0)).toBe(true);
    for (const id of sessions) await send("DELETE", { "mcp-protocol-version": LEGACY, "mcp-session-id": id });
  });
});

describe("a legacy client that goes away while its stream is opening", () => {
  test("the held opening releases its slot and attaches no stream; four healthy opens follow", async () => {
    const sessions = [await legacySession(), await legacySession(), await legacySession(), await legacySession(), await legacySession()];
    // The snapshot every stream open takes is held; a GET enters, takes its slot, and its socket closes while it waits.
    let release!: () => void;
    hold = new Promise<void>((r) => { release = r; });
    const gone = openStream({ "mcp-protocol-version": LEGACY, "mcp-session-id": sessions[0]! });
    await new Promise((r) => setTimeout(r, 100));
    expect(s.http.streams, "the slot is held while the snapshot is read").toBe(1);
    gone.abort.abort();
    await new Promise((r) => setTimeout(r, 100));
    release();
    hold = null;
    await gone.opened;
    // Nothing of it is retained: no slot, and the session has no stream.
    expect(await until(() => s.http.streams === 0), "the slot is released").toBe(true);
    expect(s.http.sessions.get(sessions[0]!)?.stream, "no dead stream is attached to the session").toBeNull();
    // Four healthy opens take the four slots.
    const healthy = sessions.slice(1).map((id) => openStream({ "mcp-protocol-version": LEGACY, "mcp-session-id": id }));
    for (const st of healthy) expect(await until(() => st.text().includes(": stream"))).toBe(true);
    expect(s.http.streams).toBe(STREAMS_MOST);
    for (const st of healthy) st.abort.abort();
    expect(await until(() => s.http.streams === 0)).toBe(true);
    for (const id of sessions) await send("DELETE", { "mcp-protocol-version": LEGACY, "mcp-session-id": id });
  });
});

describe("H8, a replacement while the snapshot is held", () => {
  test("the incumbent's slot passes to the replacement: its cancellation frees nothing for another session", async () => {
    const sessions = [await legacySession(), await legacySession(), await legacySession(), await legacySession(), await legacySession()];
    const held = sessions.slice(0, 4).map((id) => openStream({ "mcp-protocol-version": LEGACY, "mcp-session-id": id }));
    for (const st of held) expect(await until(() => st.text().includes(": stream"))).toBe(true);
    expect(s.http.streams).toBe(STREAMS_MOST);
    // A replacement of the first session's stream enters and blocks on the held snapshot; its incumbent is then cancelled by the client.
    let release!: () => void;
    hold = new Promise<void>((r) => { release = r; });
    const replacement = openStream({ "mcp-protocol-version": LEGACY, "mcp-session-id": sessions[0]! });
    await new Promise((r) => setTimeout(r, 100));
    held[0]!.abort.abort();
    await new Promise((r) => setTimeout(r, 100));
    // Another session's GET competes for what the cancellation seemed to free: refused, the slot belongs to the replacement.
    const competitor = openStream({ "mcp-protocol-version": LEGACY, "mcp-session-id": sessions[4]! });
    expect(await competitor.opened, "no fifth stream").toBe(409);
    release();
    hold = null;
    expect(await until(() => replacement.text().includes(": stream")), "the replacement opened").toBe(true);
    expect(s.http.streams).toBe(STREAMS_MOST);
    for (const st of [...held, replacement]) st.abort.abort();
    expect(await until(() => s.http.streams === 0)).toBe(true);
    for (const id of sessions) await send("DELETE", { "mcp-protocol-version": LEGACY, "mcp-session-id": id });
  });
});

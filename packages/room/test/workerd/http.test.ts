/**
 * The Room as callers reach it: the HTTPS routes (R-API-1, R-API-3,
 * `HttpRoutes`) and their body cap (request 55be0661, SEC-11), the Worker's
 * RPC entrypoint (`ArtroomService`, `RoomWire`), reads, cursors and waits
 * (R-API-5 to R-API-7), live updates (R-API-8, R-API-12), a join whose reply
 * was lost (R-IDEM-2, R-CRED-5), bearer acts (R-CRED-10), and the MCP
 * endpoint (`POST /v1/rooms/:room/mcp`, R-API-9 and R-API-13 to R-API-15).
 *
 * The MCP package's own tests show what its server lists and how it waits,
 * over a fake room. The MCP tests here show what the Room adds: the
 * authorization it gives its endpoint, admission of calls the list does not
 * show, retries that give one effect, and waits that hold nothing in the room.
 */

import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { Client as McpClient, StreamableHTTPClientTransport, type VersionNegotiationMode } from "@modelcontextprotocol/client";
import type { ActDeclaration, ActRecord, AttentionPage, Claim, Explanation, Joined, Lane, Landing, LogEntry, LogPage, PolicyDocument, PolicyDocumentV2, Proposal, Redeemed, Refusal, Role, Roster, RosterRecord, SignedEnvelope, Update, WorkspaceOp } from "@generalbusiness/artroom-contract";
import { isArtroomError } from "@generalbusiness/artroom-contract";
import { callerFromRoster, validate } from "@generalbusiness/artroom-mcp";
import { CODE_REVIEW_ACTS, codeReviewPolicy, policy } from "@generalbusiness/artroom-policy";
import { rule } from "@generalbusiness/artroom-policy/helpers";
import type { Room } from "../../src/index.ts";
import { route } from "../../src/http.ts";
import type { RoomEnv } from "../../src/config.ts";
import type { CallerView } from "../../src/requests.ts";
import { artifactsErrors } from "../../src/memory/artifacts.ts";
import { entries, headSeq, inDO, once, opOf, roomBearer } from "./core-support.ts";
import { addMember, b64url, call, Client, clock, day, DECLARED, digestBytes, expectOk, failure, iso, makeRoom, newKeyPair, pushChange, randomBytes, sign, tick, type TestRoom } from "./support.ts";

const base = "https://artroom.test/v1/rooms";
const MiB = 1024 * 1024;

type Wire = {
  submit(a: unknown): Promise<ActRecord | Refusal>;
  read(t: string, q: unknown): Promise<unknown>;
  subscribe(s: string): Promise<ReadableStream<Uint8Array>>;
  bearerAct(bearer: string, act: unknown): Promise<ActRecord | Refusal>;
  bearerRequest(bearer: string, req: unknown): Promise<unknown>;
} & Disposable;
/** The Worker's RPC entrypoint, as another Worker's service binding reaches it. */
const wireFor = (r: TestRoom) => (exports.default as unknown as { room(id: string): Promise<Wire> }).room(r.id);
const post = (room: TestRoom, path: string, body: unknown, raw?: string) =>
  exports.default.fetch(`${base}/${room.id}/${path}`, { method: "POST", body: raw ?? JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const get = (room: TestRoom, path: string, token?: string) => exports.default.fetch(`${base}/${room.id}/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
/** The error a thrown RPC failure carries. */
async function thrown(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  return null;
}

/** `p`, or a failure after two seconds: a message that never comes fails its test at once, not at the test's timeout. */
const soon = <T>(p: Promise<T>, what: string): Promise<T> => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} did not arrive`)), 2_000))]);

/** One room for the routes, reads and updates below, with one member. */
const routes = once(async () => {
  const room = await makeRoom();
  return { room, bob: await addMember(room, "@bob", "member") };
});
let areas = 0;
const own = () => `part${++areas}`;

describe("HTTPS routes and the RPC entrypoint", () => {
  it("POST /acts, /requests and /redeem: 200 with the record, 409 with a refusal, 401 for a bad signature, 400 for duplicate keys; answers are never cacheable; an unknown room is 404", async () => {
    const { room } = await routes();
    const ok = await post(room, "acts", room.admin.signed("claim", null, { goal: "g", scope: [`${own()}/**`] }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe("no-store");
    const claim = (await ok.json()) as Claim;
    expect(claim.kind).toBe("claim");
    const refused = await post(room, "acts", room.admin.signed("renew", { lane: claim.lane }, { lease: 9 }));
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as Refusal).rule).toBe("lease-fenced");
    const s = room.admin.signed("note", { act: claim.id }, { text: "x" });
    const bad = await post(room, "acts", { ...s, sig: sign(newKeyPair().seed, "artroom-envelope-v1", s.envelope) });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toMatchObject({ name: "ArtroomError", code: "unauthenticated", retryable: false });
    expect((await post(room, "acts", null, '{"envelope":{},"envelope":{}}')).status).toBe(400);
    const res = await post(room, "requests", room.admin.signedRequest({ kind: "session", ttlSeconds: 60 }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(((await res.json()) as { token: string }).token).toMatch(/^ses_/);
    expect((await post(room, "redeem", { custody: "room", invitation: "act_9_00000000", secret: "AAAA" })).status).toBe(409);
    expect((await exports.default.fetch(`${base}/no-such-room/members`, { headers: { Authorization: "Bearer x" } })).status).toBe(404);
  });

  it("reads need a session or bearer token; GET lanes, lane, proposal, ops, log, explain, members and attention answer from the room, and an unknown item is 404", async () => {
    const { room, bob } = await routes();
    const area = own();
    const claim = expectOk(await bob.act<Claim>("claim", null, { goal: "g", scope: [`${area}/**`] }));
    const head = pushChange(room, claim.lane, { [`${area}/app.ts`]: "v2" });
    const p = expectOk(await bob.act<Proposal>("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }));
    expect((await get(room, "log")).status).toBe(401);
    const token = await bob.session();
    const json = async <T>(path: string) => (await (await get(room, path, token)).json()) as T;
    expect((await json<{ items: Lane[] }>("lanes?state=held")).items.map((l) => l.lane)).toContain(claim.lane);
    expect((await json<Lane>(`lanes/${claim.lane}`)).lane).toBe(claim.lane);
    expect((await json<Proposal>(`lanes/${claim.lane}/1`)).head).toBe(head);
    expect((await get(room, `lanes/${claim.lane}/7`, token)).status).toBe(404);
    expect((await json<{ kind: string }>(`ops/${p.preview.id}`)).kind).toBe("preview");
    expect((await get(room, "ops/op_land_999", token)).status).toBe(404);
    const log = await json<LogPage>("log?after=1&limit=2");
    expect(log.acts.map((e) => e.seq)).toEqual([2, 3]);
    expect(log.head).toBeGreaterThan(3);
    expect((await json<{ act: string }>(`explain/${claim.id}`)).act).toBe(claim.id);
    expect((await json<Roster>("members")).members.map((m) => m.handle)).toEqual(expect.arrayContaining(["@admin", "@bob"]));
    expect((await get(room, "attention", token)).status).toBe(200);
  });

  it("the RPC entrypoint (R-API-1, R-API-8): room(id) returns a RoomWire whose refusals are values and whose failures are thrown as ArtroomError; its subscription is UTF-8 bytes, one JSON Update a line", async () => {
    const { room } = await routes();
    using wire = await wireFor(room);
    const stream = await wire.subscribe(await room.admin.session());
    const claim = (await wire.submit(room.admin.signed("claim", null, { goal: "a", scope: [`${own()}/**`] }))) as Claim;
    expect(claim.kind).toBe("claim");
    expect(((await wire.submit(room.admin.signed("renew", { lane: claim.lane }, { lease: 9 }))) as Refusal).refused).toBe(true);
    const failed = await thrown(wire.read("ses_bad", { q: "members" }));
    expect(isArtroomError(failed)).toBe(true);
    expect(failed).toMatchObject({ name: "ArtroomError", code: "unauthenticated", retryable: false });
    await room.admin.ok("claim", null, { goal: "b", scope: [`${own()}/**`] });
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
    let text = "";
    const seen: string[] = [];
    while (seen.length < 3) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      const lines = text.split("\n");
      text = lines.pop()!;
      for (const line of lines) seen.push(...(JSON.parse(line) as Update).entries.map((e) => e.kind));
    }
    // The claim, the recorded refusal of its renewal, and the second claim, in order.
    expect(seen).toEqual(["claim", "renew", "claim"]);
    await reader.cancel();
  });
});

describe("request 55be0661 (SEC-11): the HTTPS routes read at most 1 MiB of a body, counting bytes as they stream in", () => {
  /** A body of `total` bytes in 64 KiB chunks, with no length, counting the bytes the reader pulled. */
  function streamed(total: number, fill: Uint8Array = new Uint8Array([0x20])): { body: ReadableStream<Uint8Array>; pulled: () => number } {
    let sent = 0;
    const chunk = new Uint8Array(64 * 1024);
    for (let i = 0; i < chunk.length; i++) chunk[i] = fill[i % fill.length]!;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          if (sent >= total) return c.close();
          sent += chunk.byteLength;
          c.enqueue(chunk.slice());
        },
      },
      { highWaterMark: 0 },
    );
    return { body, pulled: () => sent };
  }
  const draft = (body: BodyInit, headers: Record<string, string> = {}) => route(new Request(base, { method: "POST", body, headers }), env as unknown as RoomEnv);

  it("a body streamed without Content-Length is cut off at 1 MiB: 413 payload-too-large, and the rest is never read; the cap counts bytes, not characters", async () => {
    const s = streamed(16 * MiB);
    const res = await draft(s.body);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "payload-too-large" });
    expect(s.pulled()).toBeLessThanOrEqual(MiB + 128 * 1024);
    // 1.5 MiB of bytes that are 0.75 MiB of two-byte characters.
    expect((await draft(streamed(1.5 * MiB, new TextEncoder().encode("é")).body)).status).toBe(413);
  });

  it("a declared Content-Length over 1 MiB is refused before any byte is read; a body of exactly 1 MiB is read and judged on its content", async () => {
    const s = streamed(2 * MiB);
    expect((await draft(s.body, { "Content-Length": String(2 * MiB) })).status).toBe(413);
    expect(s.pulled()).toBe(0);
    const res = await draft("{}".padEnd(MiB, " "));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "bad-request" });
  });
});

describe("R-API reads, cursors and waits", () => {
  it("R-API-6, R-API-7, R-API-9: log, lane and attention pages ascend, always carry a cursor, and resume exactly after the last item; an attention page states publishedThrough from the same read", async () => {
    const room = await makeRoom({ policy: policy(rule({ id: "new-lanes", kind: "notify", on: ["claim"], to: ["role:admin"], why: "A new lane was opened." })) });
    for (let i = 0; i < 7; i++) await room.admin.ok("claim", null, { goal: `g${i}`, scope: [`src/m${i}/**`] });
    const token = await room.admin.session();
    type Page<T> = { acts: T[]; items: T[]; cursor: string; more: boolean };
    const page = <T>(q: unknown) => call<Page<T>>(room.stub.read(token, q as never));
    const first = await page<LogEntry>({ q: "log", req: { limit: 4 } });
    expect(first.acts.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(first.more).toBe(true);
    const second = await page<LogEntry>({ q: "log", req: { cursor: first.cursor, limit: 100 } });
    expect(second.acts[0]!.seq).toBe(4);
    expect(second.more).toBe(false);
    expect((await page<LogEntry>({ q: "log", req: { cursor: second.cursor } })).acts).toEqual([]);
    expect((await page<LogEntry>({ q: "log", req: { after: 7 } })).acts.map((e) => e.seq)).toEqual([8]);
    const lanes = await page<Lane>({ q: "lanes", filter: { limit: 5 } });
    expect([lanes.items.length, lanes.more]).toEqual([5, true]);
    expect((await page<Lane>({ q: "lanes", filter: { cursor: lanes.cursor } })).items.length).toBe(2);
    // Each claim notified the admin (R-POL-5): seven attention items, in two pages.
    await tick(room);
    const a1 = await page<{ seq: number; why: string; rule: string; text: string }>({ q: "attention", page: { limit: 5 } });
    expect([a1.items.length, a1.more]).toEqual([5, true]);
    expect(a1.items[0]).toMatchObject({ why: "policy", rule: "new-lanes", text: "A new lane was opened." });
    const a2 = await page<{ seq: number }>({ q: "attention", page: { cursor: a1.cursor } });
    expect(a2.items.length).toBe(2);
    expect(a2.items[0]!.seq).toBeGreaterThan(a1.items[4]!.seq);
    expect((a2 as unknown as AttentionPage).publishedThrough).toBe(-1);
    const published = (await call<{ through: number }>(room.stub.publishLog()))!;
    expect(((await room.admin.read({ q: "attention" })) as AttentionPage).publishedThrough).toBe(published.through);
  });

  it("explain shows the entry, its decisions, the platform invariants and whether it is published", async () => {
    const { room, bob } = await routes();
    const claim = expectOk(await bob.act<Claim>("claim", null, { goal: "g", scope: [`${own()}/**`] }));
    const ex = (await room.admin.read({ q: "explain", act: claim.id })) as Explanation;
    expect(ex).toMatchObject({ act: claim.id, kind: "claim", outcome: "accepted", published: false });
    expect(ex.invariants).toContainEqual({ rule: "R-ADM-3", held: true, detail: "authority by case member" });
    const refused = await bob.act("renew", { lane: claim.lane }, { lease: 9 });
    const ex2 = (await room.admin.read({ q: "explain", act: (refused as { act: string }).act as never })) as Explanation;
    expect(ex2.outcome).toBe("refused");
    expect(ex2.invariants.some((i) => i.held === false)).toBe(true);
  });

  it("R-API-5: a wait for a state the operation does not reach ends with timeout; one for a state it is in returns at once", async () => {
    const { room } = await routes();
    const c = expectOk(await room.admin.act<Claim>("claim", null, { goal: "g", scope: [`${own()}/**`] }));
    room.world.artifacts.failRemote("fork", artifactsErrors.notFound());
    const ws = expectOk(await room.admin.request<{ id: string }>({ kind: "workspace", lane: c.lane, lease: 1 }));
    await tick(room);
    const token = await room.admin.session();
    expect(await call<WorkspaceOp>(room.stub.read(token, { q: "op", op: ws.id as never, until: ["failed"], timeoutMs: 60_000 }))).toMatchObject({ state: "failed" });
    expect((await failure(room.stub.read(token, { q: "op", op: ws.id as never, until: ["never-a-state"], timeoutMs: 20 }))).code).toBe("timeout");
  });
});

describe("R-API-8, R-API-12: live updates", () => {
  it("HTTPS long poll: an empty update after waitMs; a new entry wakes it; the update states publishedThrough (R-LOG-11)", async () => {
    const { room } = await routes();
    const token = await room.admin.session();
    const start = await call<Update>(room.stub.poll(token, undefined, 0));
    const empty = await call<Update>(room.stub.poll(token, start.cursor, 10));
    expect(empty.entries).toEqual([]);
    expect(empty.publishedThrough).toBe(-1);
    const waiting = call<Update>(room.stub.poll(token, empty.cursor, 5_000));
    await room.admin.ok("claim", null, { goal: "g", scope: [`${own()}/**`] });
    const u = await waiting;
    expect(u.entries.map((e) => e.kind)).toEqual(["claim"]);
    expect(u.entries[0]!.lane).toBe(u.entries[0]!.id);
    const res = await exports.default.fetch(`${base}/${room.id}/subscribe?cursor=${encodeURIComponent(u.cursor)}&waitMs=0`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Update).entries).toEqual([]);
  });

  it("section 23, WebSocket (R-API-12): the token travels as a subprotocol and is judged before the upgrade; 101 answers artroom.v1 only; ?cursor= resumes from that cursor; the socket keeps only the token's hash; 1008 after revocation", async () => {
    const { room } = await routes();
    const member = await addMember(room, "@socket", "member");
    const token = await member.session();
    const url = `${base}/${room.id}/ws`;
    const upgrade = (protocols: string, query = "") => exports.default.fetch(`${url}${query}`, { headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": protocols } });
    const none = await upgrade("artroom.v1");
    expect(none.status).toBe(401);
    expect(none.webSocket).toBeNull();
    const badToken = await upgrade("artroom.v1, artroom.token.ses_nope");
    expect(badToken.status).toBe(401);
    expect(JSON.stringify(await badToken.json())).not.toContain("ses_nope");
    // An entry sealed before the socket opens, after the cursor it resumes from.
    const start = await call<Update>(room.stub.poll(token, undefined, 0));
    const before = await room.admin.ok("claim", null, { goal: "before", scope: [`${own()}/**`] });
    const res = await upgrade(`artroom.v1, artroom.token.${token}`, `?cursor=${encodeURIComponent(start.cursor)}`);
    expect(res.status).toBe(101);
    expect(res.headers.get("Sec-WebSocket-Protocol")).toBe("artroom.v1");
    const ws = res.webSocket!;
    const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e: CloseEvent) => resolve(e.code)));
    const next = () => new Promise<Update>((resolve) => ws.addEventListener("message", (m: MessageEvent) => resolve(JSON.parse(m.data as string) as Update), { once: true }));
    const resumed = next();
    ws.accept();
    expect((await soon(resumed, "the entry after the cursor")).entries.map((e) => e.id)).toEqual([before.id]);
    const live = next();
    ws.send("ignored by the room");
    const after = await room.admin.ok("claim", null, { goal: "after", scope: [`${own()}/**`] });
    expect((await soon(live, "the new entry")).entries.map((e) => e.id)).toContain(after.id);
    const kept = await runInDurableObject(room.stub as unknown as DurableObjectStub<Room>, (_r: Room, state: DurableObjectState) => JSON.stringify(state.getWebSockets().map((w) => w.deserializeAttachment())));
    expect(kept).not.toContain(token);
    await room.admin.ok("roster", null, { op: "revoke-key", key: member.key, reason: "retired" });
    expect(await soon(closed, "the close")).toBe(1008);
  });
});

describe("a join whose reply was lost (R-IDEM-2, R-CRED-5)", () => {
  it("after the room admitted a client's join and its object was evicted: the same redemption again is refused invitation-invalid and says what to do; the same signed join, submitted, returns the original record; and the joining key signs for a session that reads the room", async () => {
    // A room of its own: an object is evicted only once nothing else holds it, and the shared room has streams open.
    const room = await makeRoom();
    const secret = randomBytes(32);
    const inv = await room.admin.ok<RosterRecord>("roster", null, { op: "invite", member: "@late", role: "member", custody: "client", expiresAt: iso(clock.now + day), secretHash: digestBytes(secret) });
    const joiner = new Client(room, newKeyPair());
    const join = joiner.signed("roster", null, { op: "join", invitation: inv.id, secret: b64url(secret) });
    const redeem = () => call<Joined | Refusal>(room.stub.redeem({ custody: "client", join }, null));
    const first = (await redeem()) as Joined;
    expect(first).toMatchObject({ custody: "client", member: "@late", key: joiner.key, record: { by: { via: "join" } } });
    await evictDurableObject(room.stub);
    const before = await headSeq(room);
    expect(await redeem()).toMatchObject({ refused: true, rule: "invitation-invalid", reason: expect.stringContaining(first.record.id), fix: "Sign a session request with the key that joined." });
    expect(await call<ActRecord>(room.stub.submit(join))).toEqual(first.record);
    expect(await headSeq(room)).toBe(before);
    expect((await joiner.read({ q: "members" })).members.map((m) => m.handle)).toContain("@late");
  });
});

// ------------------------------------------------------------------ bearers and the MCP endpoint

const KINDS = ["claim", "propose", "note", "land", "release", "renew"];
/** The fixed order of `tools/list` (R-API-13). */
const ORDER = ["claim", "workspace", "propose", "note", "review", "land", "renew", "release", "attention", "explain", "lanes", "lane", "proposal", "operation", "acts", "act"];
const BUILDER = ["claim", "workspace", "propose", "note", "land", "renew", "release", "attention", "explain", "lane", "proposal", "operation", "acts", "act"];
const OBSERVER = ["attention", "explain", "lanes", "lane", "proposal", "operation", "acts"];
const ACT_TOOLS = ["claim", "propose", "note", "review", "land", "renew", "release", "act"];
const without = (names: readonly string[], ...drop: string[]) => names.filter((n) => !drop.includes(n));

let rpcId = 0;
/** One raw JSON-RPC request to a room's MCP route, as a 2025-era client sends it. */
async function rpc(path: string, token: string | undefined, method: string, params: unknown = {}, init: RequestInit = {}): Promise<{ status: number; headers: Headers; text: string; body: any }> {
  const res = await exports.default.fetch(`${base}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    ...init,
  });
  const text = await res.text();
  const data = text.trim().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("");
  let body: any = null;
  try {
    body = data ? JSON.parse(data) : null;
  } catch {
    body = null;
  }
  return { status: res.status, headers: res.headers, text, body };
}

type ToolResult = { isError?: boolean; structuredContent?: any; content: { text: string }[] };
let keys = 0;
/** One tool call. Every act tool requires an idempotency key (R-API-9): a fresh one where the test names none. */
async function tool(r: TestRoom, token: string, name: string, args: Record<string, unknown>, query = ""): Promise<ToolResult> {
  const keyed = ACT_TOOLS.includes(name) && !("idempotencyKey" in args) ? { ...args, idempotencyKey: `test-key-${++keys}` } : args;
  const res = await rpc(`${r.id}/mcp${query}`, token, "tools/call", { name, arguments: keyed });
  expect(res.status).toBe(200);
  return res.body.result;
}
const tools = async (r: TestRoom, token: string, query = "") => {
  const res = await rpc(`${r.id}/mcp${query}`, token, "tools/list");
  expect(res.status).toBe(200);
  return res.body.result.tools as { name: string; outputSchema: any }[];
};
const listed = async (r: TestRoom, token: string, query = "") => (await tools(r, token, query)).map((t) => t.name);
const laneRow = (r: TestRoom, lane: string) => inDO(r, (room) => JSON.stringify(room.core.sql.all("SELECT * FROM lanes WHERE id = ?", lane)));

/** One room for the MCP tests below, with an agent's bearer and one member. */
const mcp = once(async () => {
  const room = await makeRoom();
  return { room, agent: await roomBearer(room, KINDS), bob: await addMember(room, "@bob", "member") };
});

describe("bearer acts and the MCP route (R-CRED-3, R-CRED-10)", () => {
  it("the route guards: no bearer, or one this room does not know: 401 with WWW-Authenticate, before any tool runs; an unknown room is 404, a bad room segment 400; the room's name works like its ID; other paths are the router's 404; GET has no session stream", async () => {
    const { room, agent } = await mcp();
    const other = (await routes()).room;
    expect(agent.mcp).toBe(`${base}/${room.id}/mcp`);
    const none = await rpc(`${room.id}/mcp`, undefined, "tools/list");
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toBe('Bearer realm="artroom"');
    expect(none.body.error.message).toMatch(/Authorization: Bearer/);
    const unknown = await rpc(`${room.id}/mcp`, "art_unknown_token", "tools/list");
    expect(unknown.status).toBe(401);
    expect(unknown.headers.get("www-authenticate")).toMatch(/error="invalid_token"/);
    // A bearer is one room's: another room judges it unknown.
    const elsewhere = await rpc(`${other.id}/mcp`, agent.bearer, "tools/list");
    expect(elsewhere.status).toBe(401);
    expect(elsewhere.text).not.toContain(agent.bearer);
    const missing = await rpc("no-such-room/mcp", agent.bearer, "tools/list");
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ name: "ArtroomError", code: "not-found" });
    expect((await rpc("%E0%A4%A/mcp", agent.bearer, "tools/list")).status).toBe(400);
    const byName = await rpc(`${encodeURIComponent(room.genesis.name)}/mcp`, agent.bearer, "tools/list");
    expect(byName.status).toBe(200);
    // The generic `act` is listed only under a `v2` document: this test runs under both.
    expect(byName.body.result.tools.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(without(BUILDER, "act")));
    for (const path of [`${room.id}/mcp/x`, `${room.id}/mcpx`]) {
      const res = await rpc(path, agent.bearer, "tools/list");
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ name: "ArtroomError", code: "not-found", message: "No such route." });
    }
    const stream = await exports.default.fetch(`${base}/${room.id}/mcp`, { headers: { authorization: `Bearer ${agent.bearer}`, accept: "text/event-stream", "mcp-protocol-version": "2025-06-18" } });
    expect(stream.status).toBe(405);
  });

  it("section 23, Bearer receipt after revocation: a bearer's act is the room's, signed under its delegation; it has no session request and no roster act; a retry returns the original; once its key is revoked every route is unauthenticated and records nothing; a signed envelope a client kept still returns its original after its key is revoked (R-IDEM-2)", async () => {
    const { room } = await mcp();
    const b = await roomBearer(room, ["claim", "propose", "note"], "@short-lived");
    using wire = await wireFor(room);
    const act = { kind: "claim", target: null, body: { goal: "agent", scope: [`${own()}/**`] }, idempotencyKey: "lost-receipt" };
    const first = (await wire.bearerAct(b.bearer, act)) as Claim;
    expect(first.by).toMatchObject({ via: "delegation", member: "@short-lived", delegation: b.delegation });
    expect(await wire.bearerAct(b.bearer, act)).toEqual(first);
    expect(await wire.bearerRequest(b.bearer, { kind: "workspace-token", lane: first.lane, lease: 7 })).toMatchObject({ refused: true, rule: "lease-fenced" });
    // Even with a lane and lease, a bearer has no `session` request: its token already is a read credential.
    expect(await thrown(wire.bearerRequest(b.bearer, { kind: "session", lane: first.lane, lease: 1 }))).toMatchObject({ name: "ArtroomError", code: "bad-request" });
    expect(await wire.bearerAct(b.bearer, { kind: "roster", target: null, body: { op: "remove", member: "@admin" }, idempotencyKey: "r1" })).toMatchObject({ refused: true, rule: "delegation-invalid" });
    expect((await rpc(`${room.id}/mcp`, b.bearer, "tools/list")).status).toBe(200);
    // The session's key, which the room holds and signs with: the grantee of the bearer's delegation.
    const sessionKey = (await room.admin.read({ q: "members" })).delegations.find((d) => d.id === b.delegation)!.grantee;
    await room.admin.ok("roster", null, { op: "revoke-key", key: sessionKey, reason: "retired" });
    const before = await headSeq(room);
    expect((await failure(room.stub.bearerAct(b.bearer, act))).code).toBe("unauthenticated");
    expect((await failure(room.stub.bearerRequest(b.bearer, { kind: "workspace", lane: first.lane, lease: 1 }))).code).toBe("unauthenticated");
    expect((await rpc(`${room.id}/mcp`, b.bearer, "tools/list")).status).toBe(401);
    expect(await headSeq(room)).toBe(before);
    const carol = await addMember(room, "@carol", "member");
    const kept = carol.signed("claim", null, { goal: "g", scope: [`${own()}/**`] });
    const original = await call<Claim>(room.stub.submit(kept));
    await room.admin.ok("roster", null, { op: "revoke-key", key: carol.key, reason: "retired" });
    expect(await call<Claim>(room.stub.submit(kept))).toEqual(original);
  });

  it("a bearer claims, opens its workspace, proposes and lands through the MCP tools; a call with no idempotency key records nothing, and a retry with the same key gives the original record and one effect (R-API-9)", async () => {
    const { room, agent } = await mcp();
    const area = own();
    const lanes = (await room.admin.read({ q: "lanes" })).items.length;
    const seq = await headSeq(room);
    const keyless = (await rpc(`${room.id}/mcp`, agent.bearer, "tools/call", { name: "claim", arguments: { goal: "Agent work", scope: [`${area}/**`] } })).body.result;
    expect(keyless).toMatchObject({ isError: true, structuredContent: { name: "ArtroomError", code: "bad-request" } });
    expect(keyless.structuredContent.message).toContain("Add any unique string as idempotencyKey, and reuse the same one to retry this call.");
    expect(await headSeq(room)).toBe(seq);

    const claimArgs = { goal: "Agent work", scope: [`${area}/**`], idempotencyKey: "c1" };
    const claimed = await tool(room, agent.bearer, "claim", claimArgs);
    expect(claimed.isError).toBe(false);
    const claim = claimed.structuredContent as Claim;
    expect(claim.by).toMatchObject({ via: "delegation", member: "@agent", delegation: agent.delegation });
    expect((await tool(room, agent.bearer, "claim", claimArgs)).structuredContent.id).toBe(claim.id);
    expect((await room.admin.read({ q: "lanes" })).items.length).toBe(lanes + 1);

    const held = { lane: claim.lane, lease: claim.lease.generation };
    let ws = await tool(room, agent.bearer, "workspace", { ...held, waitMs: 0 });
    for (let i = 0; i < 5 && ws.structuredContent.grant === null; i++) {
      await tick(room);
      ws = await tool(room, agent.bearer, "workspace", { ...held, waitMs: 0 });
    }
    expect(ws.structuredContent.op).toMatchObject({ kind: "workspace", state: "ready" });
    expect(ws.structuredContent.grant).toMatchObject({ token: expect.any(String), remote: expect.stringMatching(/^https:/) });

    const head = pushChange(room, claim.lane, { [`${area}/app.ts`]: "export const app = 2;\n" });
    const proposed = await tool(room, agent.bearer, "propose", { ...held, head, expectedGeneration: 0, summary: "app is 2" });
    expect(proposed.structuredContent).toMatchObject({ kind: "propose", generation: 1, head, by: { via: "delegation", delegation: agent.delegation } });

    const landArgs = { ...held, generation: 1, head, idempotencyKey: "l1" };
    const landing = (await tool(room, agent.bearer, "land", landArgs)).structuredContent as Landing;
    expect(landing.op.state).not.toBe("failed");
    const landed = await headSeq(room);
    const again = (await tool(room, agent.bearer, "land", landArgs)).structuredContent as Landing;
    expect([again.id, again.op.id]).toEqual([landing.id, landing.op.id]);
    expect(await headSeq(room)).toBe(landed);
    await tick(room, 3);
    expect((await opOf(room, landing.op.id)).state).toBe("landed");

    expect((await tool(room, agent.bearer, "attention", {})).structuredContent).toMatchObject({ items: expect.any(Array), publishedThrough: expect.any(Number) });
    expect((await tool(room, agent.bearer, "release", { ...held, note: "done" })).structuredContent).toMatchObject({ kind: "release" });
  });

  it("listing is not permission (R-API-14): a kind the delegation does not grant is refused by the room, as a value; a tool the caller's list does not show is still judged and recorded as usual", async () => {
    const { room, agent } = await mcp();
    const limited = await roomBearer(room, ["claim"], "@limited");
    const claim = (await tool(room, limited.bearer, "claim", { goal: "g", scope: [`${own()}/**`] })).structuredContent as Claim;
    const res = await tool(room, limited.bearer, "propose", { lane: claim.lane, lease: 1, head: "a".repeat(40), expectedGeneration: 0, summary: "s" });
    expect(res.isError).toBe(false);
    expect(res.structuredContent).toMatchObject({ refused: true, rule: "delegation-invalid" });
    expect(await listed(room, agent.bearer, "?toolset=observer")).not.toContain("claim");
    const seq = await headSeq(room);
    const unlisted = await tool(room, agent.bearer, "claim", { goal: "g", scope: [`${own()}/**`] }, "?toolset=observer");
    expect(unlisted.isError).toBe(false);
    expect(unlisted.structuredContent).toMatchObject({ kind: "claim", by: { via: "delegation", member: "@agent", delegation: agent.delegation }, lease: { generation: 1 } });
    expect(await headSeq(room)).toBe(seq + 1);
  });

  it("R-API-9, R-API-13: lanes, lane, proposal and operation answer from the room; unknown IDs are structured not-found results; the room's records and refusals fit the schemas the list advertises", async () => {
    const { room, agent } = await mcp();
    const area = own();
    const call = (name: string, args: Record<string, unknown>) => tool(room, agent.bearer, name, args);
    const src = (await call("claim", { goal: "api", scope: [`${area}/src/api/**`] })).structuredContent as Claim;
    const docs = (await call("claim", { goal: "docs", scope: [`${area}/docs/**`] })).structuredContent as Claim;
    const schemas = Object.fromEntries((await tools(room, agent.bearer, "?toolset=all")).map((t) => [t.name, t.outputSchema]));
    for (const schema of Object.values(schemas)) expect(schema.type).toBe("object");

    expect((await call("lanes", {})).structuredContent.items.map((l: Lane) => l.lane)).toEqual(expect.arrayContaining([src.lane, docs.lane]));
    const touching = await call("lanes", { touches: `${area}/src/api/login.ts` });
    expect(touching.structuredContent.items.map((l: Lane) => l.lane)).toEqual([src.lane]);
    expect(validate(schemas["lanes"], touching.structuredContent)).toEqual([]);
    const lane = await call("lane", { lane: src.lane });
    expect(lane.structuredContent).toMatchObject({ lane: src.lane, state: "held", lease: { holder: "@agent", generation: 1 } });
    expect(validate(schemas["lane"], lane.structuredContent)).toEqual([]);
    const noLane = await call("lane", { lane: "act_999_00000000" });
    expect(noLane).toMatchObject({ isError: false, structuredContent: { outcome: "not-found", what: "lane" } });
    expect(validate(schemas["lane"], noLane.structuredContent)).toEqual([]);

    // A change outside the claimed paths: refused, and the refusal is structured content the schema accepts.
    const outside = pushChange(room, src.lane, { [`${area}/lib/other.ts`]: "export const x = 1;\n" });
    const refused = await call("propose", { lane: src.lane, lease: 1, head: outside, expectedGeneration: 0, summary: "s" });
    expect(refused).toMatchObject({ isError: false, structuredContent: { refused: true, rule: "outside-claim" } });
    expect(validate(schemas["propose"], refused.structuredContent)).toEqual([]);
    expect(refused.content[0]!.text.split("\n")[0]).toMatch(/^Refused \(outside-claim\): .+ Fix: .+/);

    const head = pushChange(room, src.lane, { [`${area}/src/api/login.ts`]: "export const login = 2;\n" });
    const p = (await call("propose", { lane: src.lane, lease: 1, head, expectedGeneration: 0, summary: "s" })).structuredContent as Proposal;
    expect(validate(schemas["propose"], p)).toEqual([]);
    const proposal = await call("proposal", { lane: src.lane, generation: 1 });
    expect(proposal.structuredContent).toMatchObject({ id: p.id, head, generation: 1 });
    expect(validate(schemas["proposal"], proposal.structuredContent)).toEqual([]);
    expect((await call("proposal", { lane: src.lane, generation: 7 })).structuredContent).toEqual({ outcome: "not-found", what: "proposal" });
    const op = await call("operation", { id: p.preview.id, kind: "preview" });
    expect(op.structuredContent).toMatchObject({ id: p.preview.id, kind: "preview" });
    expect(validate(schemas["operation"], op.structuredContent)).toEqual([]);
    const noOp = await call("operation", { id: "op_land_999999", kind: "land" });
    expect(noOp).toMatchObject({ isError: false, structuredContent: { outcome: "not-found", what: "operation" } });
    expect(validate(schemas["operation"], noOp.structuredContent)).toEqual([]);
  });

  it("R-API-15: a wait is a bounded read that holds nothing in the room. operation on a landing in progress returns its current state at waitMs, with no error; attention with an empty page returns it at waitMs, and at once when a note for the caller arrives; the log and the lease are as they were", async () => {
    const { room, agent, bob } = await mcp();
    const area = own();
    const call = (name: string, args: Record<string, unknown>) => tool(room, agent.bearer, name, args);
    const claim = (await call("claim", { goal: "g", scope: [`${area}/**`] })).structuredContent as Claim;
    const head = pushChange(room, claim.lane, { [`${area}/app.ts`]: "export const app = 2;\n" });
    const p = (await call("propose", { lane: claim.lane, lease: 1, head, expectedGeneration: 0, summary: "s" })).structuredContent as Proposal;
    const landing = (await call("land", { lane: claim.lane, lease: 1, generation: p.generation, head })).structuredContent as Landing;
    // Read attention to the end of what is there now, so the next page is empty.
    let cursor = (await call("attention", {})).structuredContent.cursor;
    for (;;) {
      const page = (await call("attention", { cursor })).structuredContent;
      cursor = page.cursor;
      if (page.items.length === 0) break;
    }
    const seq = await headSeq(room);
    const row = await laneRow(room, claim.lane);
    let started = Date.now();
    const op = await call("operation", { id: landing.op.id, kind: "land", waitMs: 40 });
    expect(op.isError).toBe(false);
    expect(op.structuredContent).toMatchObject({ id: landing.op.id, kind: "land" });
    expect(["accepted", "preparing", "ready", "publishing"]).toContain(op.structuredContent.state);
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
    // A state it is already in ends the wait at once.
    expect((await call("operation", { id: landing.op.id, kind: "land", until: [op.structuredContent.state], waitMs: 45_000 })).structuredContent.state).toBe(op.structuredContent.state);
    started = Date.now();
    const empty = await call("attention", { cursor, waitMs: 40 });
    expect(empty).toMatchObject({ isError: false, structuredContent: { items: [], cursor: expect.any(String) } });
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
    expect(await headSeq(room)).toBe(seq);
    expect(await laneRow(room, claim.lane)).toBe(row);

    const waiting = call("attention", { cursor, waitMs: 30_000 });
    const note = await bob.ok("note", { act: claim.id }, { text: "A question about your lane." });
    const page = (await waiting).structuredContent;
    expect(page.items.map((i: { why: string }) => i.why)).toContain("note");
    expect(JSON.stringify(page.items)).toContain(note.id);
    // Only Bob's note was recorded while the agent waited.
    expect(await headSeq(room)).toBe(seq + 1);
    // The landing then finishes, and a wait for a finished state returns it.
    await tick(room, 3);
    expect((await call("operation", { id: landing.op.id, kind: "land", waitMs: 1000 })).structuredContent.state).toBe("landed");
  });

  it("the official MCP client against the Worker, pinned to 2026-07-28 and in legacy stateless mode: it lists the tools with object-rooted output schemas, and a refusal conforms to its schema", async () => {
    const { room, agent } = await mcp();
    for (const [i, mode] of ([{ pin: "2026-07-28" }, "legacy"] as VersionNegotiationMode[]).entries()) {
      const c = new McpClient({ name: "room-mcp-test", version: "0.0.0" }, { versionNegotiation: { mode } });
      await c.connect(
        new StreamableHTTPClientTransport(new URL(agent.mcp), {
          requestInit: { headers: { authorization: `Bearer ${agent.bearer}` } },
          fetch: (input, init) => exports.default.fetch(new Request(input, init)),
        }),
      );
      try {
        expect(c.getInstructions()?.length).toBeLessThanOrEqual(512);
        const { tools: all } = await c.listTools();
        expect(all.map((t) => t.name)).toEqual(expect.arrayContaining(without(BUILDER, "act")));
        for (const t of all) expect(t.outputSchema?.["type"]).toBe("object");
        const claim = (await c.callTool({ name: "claim", arguments: { goal: "g", scope: [`${own()}/**`], idempotencyKey: `client-claim-${i}` } })).structuredContent as unknown as Claim;
        const refused = await c.callTool({ name: "renew", arguments: { lane: claim.lane, lease: 9, idempotencyKey: `client-renew-${i}` } });
        expect(refused.isError).toBe(false);
        expect(refused.structuredContent).toMatchObject({ refused: true, rule: "lease-fenced" });
      } finally {
        await c.close();
      }
    }
  });
});

// These found their own `v1` and `v2` rooms and choose their own bindings, so they run in the legacy run only.
describe.skipIf(DECLARED)("the Room gives its MCP endpoint the caller's authorization and the document in force (R-API-14)", () => {
  /** A kind no client binary has a method for: a question on an entry. */
  const ASK: ActDeclaration = {
    label: "Ask",
    targets: { entry: ["comment"] },
    body: { text: { type: "text", max: 200 }, urgency: { type: "enum", values: ["low", "high"], optional: true } },
    who: { roles: ["member", "agent"] },
    help: "Ask a question about an entry.",
  };
  /** A `v2` document: the default fields, the code-review declarations and `ask`, with `change` applied. */
  function doc(change: (acts: Record<string, ActDeclaration>) => void = () => {}): PolicyDocumentV2 {
    const acts = structuredClone(CODE_REVIEW_ACTS) as Record<string, ActDeclaration>;
    acts["ask"] = ASK;
    change(acts);
    return { ...codeReviewPolicy(policy()), acts };
  }
  const declaredRoom = () => makeRoom({ policy: doc() as unknown as PolicyDocument });
  const bindingIn = (r: TestRoom, kind: string) => inDO(r, (room) => room.core.declaredBinding(kind));
  const bindings = async (r: TestRoom, ...kindNames: string[]) => Object.fromEntries(await Promise.all(kindNames.map(async (k) => [k, (await bindingIn(r, k))!] as const)));
  /** Activate a document directly, as a landing's `policy-activated` would (R-POL-9). */
  const activate = (r: TestRoom, next: PolicyDocument | PolicyDocumentV2) => inDO(r, (room) => room.core.sql.transaction(() => room.core.activate(next, room.core.activePolicy().checkers, null, iso(clock.now))));
  /** A room-custody invitation with a `v2` session, redeemed (R-CRED-3 as amended). */
  async function bearer(r: TestRoom, handle: `@${string}`, role: Role, session: { kinds: readonly string[]; acts: Readonly<Record<string, string>> }): Promise<Redeemed> {
    const bytes = randomBytes(32);
    const inv = await r.admin.ok<RosterRecord>("roster", null, { op: "invite", member: handle, role, custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes), session: { ...session, lanes: "*", ttlSeconds: 3600 } });
    return call<Redeemed>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x"));
  }
  /** The admin's claim under a `v2` document: an entry for `ask` to target. */
  async function adminClaim(r: TestRoom): Promise<Claim> {
    const envelope = { v: 2, room: r.id, actor: r.admin.key, kind: "claim", binding: await bindingIn(r, "claim"), target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: b64url(randomBytes(12)) };
    return expectOk(await call<Claim | Refusal>(r.stub.submit({ envelope, sig: sign(r.admin.keys.seed, "artroom-envelope-v1", envelope) } as unknown as SignedEnvelope)));
  }
  const roster = (r: TestRoom) => r.admin.read({ q: "members" }) as Promise<Roster>;
  const callerOf = (r: TestRoom, token: string) => call<CallerView>(r.stub.caller(token));
  const refusedAs = async (r: TestRoom, token: string) => ((await r.stub.caller(token)) as { error?: { code: string } }).error?.code;
  const noCaller = expect.objectContaining({ code: "unauthenticated" });
  const narrower = (a: Record<string, ActDeclaration>) => void (a["ask"] = { ...ASK, body: { text: { type: "text", max: 50 } } });

  it("a bearer's caller is its member's role now and its delegation's grant as signed, stale bindings included; a member's own key has no delegation; the command line's reading of the roster agrees, for v2 and v1 bearers and own keys", async () => {
    const r = await declaredRoom();
    const map = await bindings(r, "claim", "ask");
    const b = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: map });
    const fromRoster = async () => callerFromRoster(await roster(r), { key: b.key, session: true, delegation: b.delegation });
    expect(await callerOf(r, b.bearer)).toEqual({ role: "agent", delegation: { kinds: ["renew"], acts: map } });
    expect(await fromRoster()).toEqual(await callerOf(r, b.bearer));
    // A credential saved before the delegation's ID was kept: the room-held key granted one delegation, the same one.
    expect(callerFromRoster(await roster(r), { key: b.key, session: true })).toEqual(await callerOf(r, b.bearer));
    expect(await callerOf(r, await r.admin.session())).toEqual({ role: "admin" });
    const bob = await addMember(r, "@bob", "maintainer");
    expect(await callerOf(r, await bob.session())).toEqual({ role: "maintainer" });
    expect(callerFromRoster(await roster(r), { key: bob.key })).toEqual({ role: "maintainer" });
    // The role is read at each call.
    await r.admin.ok("roster", null, { op: "set-role", member: "@agent", role: "member" });
    expect((await callerOf(r, b.bearer)).role).toBe("member");
    expect(await fromRoster()).toEqual(await callerOf(r, b.bearer));
    // The signed map is given as it was signed, after its bindings went stale too. Nothing is rebound.
    await activate(r, doc(narrower));
    expect((await callerOf(r, b.bearer)).delegation).toEqual({ kinds: ["renew"], acts: map });
    expect(map["ask"]).not.toBe(await bindingIn(r, "ask"));
    // A session cannot be read under a delegation another key granted, and the grantor's key is not its grantee.
    const other = await bearer(r, "@other", "agent", { kinds: [], acts: await bindings(r, "note") });
    const now = await roster(r);
    expect(() => callerFromRoster(now, { key: b.key, session: true, delegation: other.delegation })).toThrowError(noCaller);
    expect(() => callerFromRoster(now, { key: b.key, delegation: b.delegation })).toThrowError(noCaller);
    // The legacy session of a v1 room: kinds as signed, and no map, on both sides.
    const v1 = (await mcp()).room;
    const legacy = await roomBearer(v1, ["claim", "note"], "@legacy");
    const legacyCaller = callerFromRoster(await roster(v1), { key: legacy.key, session: true, delegation: legacy.delegation });
    expect(legacyCaller).toEqual(await callerOf(v1, legacy.bearer));
    expect(legacyCaller).toEqual({ role: "agent", delegation: { kinds: ["claim", "note"] } });
  });

  it("an unknown token, a delegation its grantor revoked, a session whose key an admin revoked, and one whose member was removed: neither the Room nor the roster gives a caller, and tools/list answers 401", async () => {
    const r = await declaredRoom();
    expect(await refusedAs(r, "brr_not_a_token")).toBe("unauthenticated");
    // A client-held key acting under a member's delegation, with a read session of its own.
    const bob = await addMember(r, "@bob", "member");
    const k = newKeyPair();
    const map = await bindings(r, "claim", "note");
    const g = await bob.ok<RosterRecord>("roster", null, { op: "delegate", to: k.key, kinds: ["renew"], acts: map, lanes: "*", expiresAt: iso(clock.now + day) });
    const token = await new Client(r, k, g.id).session();
    const who = { key: k.key, delegation: g.id } as const;
    expect(callerFromRoster(await roster(r), who)).toEqual(await callerOf(r, token));
    expect(await callerOf(r, token)).toEqual({ role: "member", delegation: { kinds: ["renew"], acts: map } });
    expect(await listed(r, token)).toEqual(["claim", "workspace", "note", "renew", "attention", "explain", "lane", "proposal", "operation", "acts", "act"]);
    const revoked = await bearer(r, "@second", "agent", { kinds: ["renew"], acts: {} });
    const removed = await bearer(r, "@third", "agent", { kinds: ["renew"], acts: {} });
    await bob.ok("roster", null, { op: "undelegate", delegation: g.id });
    await r.admin.ok("roster", null, { op: "revoke-key", key: revoked.key, reason: "retired" });
    await r.admin.ok("roster", null, { op: "remove", member: "@third" });
    const after = await roster(r);
    for (const [why, t, as] of [
      ["undelegated", token, who],
      ["key revoked", revoked.bearer, { key: revoked.key, session: true, delegation: revoked.delegation }],
      ["member removed", removed.bearer, { key: removed.key, session: true, delegation: removed.delegation }],
    ] as const) {
      expect([why, await refusedAs(r, t)]).toEqual([why, "unauthenticated"]);
      expect(() => callerFromRoster(after, as), why).toThrowError(noCaller);
      expect([why, (await rpc(`${r.id}/mcp`, t, "tools/list")).status]).toEqual([why, 401]);
    }
  });

  it("tools/list follows the document in force and what the caller may newly sign: no generic act under v1; observer for a delegation that may sign nothing, whose call the room refuses; a map gone stale hides its tools, and the signed grants stay as signed", async () => {
    const v1 = (await mcp()).room;
    expect(await listed(v1, await v1.admin.session())).toEqual(without(ORDER, "act"));
    const r = await declaredRoom();
    const admin = await r.admin.session();
    expect(await listed(r, admin)).toEqual(ORDER);
    const idle = await bearer(r, "@idle", "agent", { kinds: [], acts: {} });
    const platform = await bearer(r, "@p", "agent", { kinds: ["renew"], acts: {} });
    const onlyAsk = await bearer(r, "@a", "agent", { kinds: [], acts: await bindings(r, "ask") });
    const mixed = await bearer(r, "@m", "agent", { kinds: [], acts: await bindings(r, "ask", "note") });
    const full = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: await bindings(r, "claim", "propose", "note", "review", "land", "release", "ask") });
    expect(await listed(r, idle.bearer)).toEqual(OBSERVER);
    expect(await listed(r, idle.bearer, "?toolset=all")).toEqual(without(ORDER, ...ACT_TOOLS));
    const seq = await headSeq(r);
    expect((await tool(r, idle.bearer, "claim", { goal: "g", scope: ["src/**"] }, "?toolset=all")).structuredContent).toMatchObject({ refused: true, rule: "delegation-invalid" });
    expect(await headSeq(r)).toBe(seq);
    expect(await listed(r, platform.bearer)).toEqual(["workspace", "renew", "attention", "explain", "lane", "proposal", "operation", "acts"]);
    expect(await listed(r, onlyAsk.bearer)).toEqual(["workspace", "attention", "explain", "lane", "proposal", "operation", "acts", "act"]);
    expect(await listed(r, full.bearer)).toEqual(BUILDER);
    expect(await listed(r, full.bearer, "?toolset=all")).toEqual(ORDER);
    const before = JSON.stringify((await roster(r)).delegations);
    // `ask` changes its meaning: the one map is all stale, the other still has a current `note`.
    await activate(r, doc(narrower));
    expect(await listed(r, onlyAsk.bearer)).toEqual(OBSERVER);
    expect(await listed(r, mixed.bearer)).toEqual(["workspace", "note", "attention", "explain", "lane", "proposal", "operation", "acts", "act"]);
    // Discovery expanded no map and rebound no entry.
    expect(JSON.stringify((await roster(r)).delegations)).toBe(before);
    // The same room once it returns to a v1 document: the generic act is gone again, and nothing else moves.
    await activate(r, policy());
    expect(await listed(r, admin)).toEqual(without(ORDER, "act"));
  });

  it("discovery follows the role, the declaration's who and whether it may be delegated, as admission does; an exact retry of an accepted act still returns its receipt, and a new call gets no substituted binding", async () => {
    const r = await declaredRoom();
    const binding = (await bindingIn(r, "ask"))!;
    const b = await bearer(r, "@agent", "agent", { kinds: [], acts: { ask: binding } });
    const c = await adminClaim(r);
    const args = { kind: "ask", target: { act: c.id }, body: { text: "why?" }, binding, idempotencyKey: "ask-1" };
    expect(await listed(r, b.bearer)).toContain("act");
    const accepted = await tool(r, b.bearer, "act", args);
    expect(accepted.structuredContent).toMatchObject({ kind: "ask", by: { via: "delegation", delegation: b.delegation } });
    // The declaration's `who` stops admitting agents. Its binding is unchanged, so the signed entry is still current.
    await activate(r, doc((a) => void (a["ask"] = { ...ASK, who: { roles: ["member"] } })));
    expect(await bindingIn(r, "ask")).toBe(binding);
    expect(await listed(r, b.bearer)).toEqual(OBSERVER);
    // The member's role changes to one the declaration lists: the kind is eligible again.
    await r.admin.ok("roster", null, { op: "set-role", member: "@agent", role: "member" });
    expect(await listed(r, b.bearer)).toContain("act");
    // The declaration stops allowing delegation: a delegated caller loses it, and admission agrees.
    await activate(r, doc((a) => void (a["ask"] = { ...ASK, who: { roles: ["member"], delegable: false } })));
    expect(await bindingIn(r, "ask")).toBe(binding);
    expect(await listed(r, b.bearer)).toEqual(OBSERVER);
    expect((await tool(r, b.bearer, "act", { ...args, idempotencyKey: "ask-2" })).structuredContent).toMatchObject({ refused: true, rule: "delegation-invalid" });
    // The kind changes its meaning: it is in no list, the exact retry returns the first receipt, and a new call is stale.
    await activate(r, doc(narrower));
    expect(await listed(r, b.bearer, "?toolset=all")).not.toContain("act");
    const seq = await headSeq(r);
    const retried = await tool(r, b.bearer, "act", args);
    expect(retried.isError).toBe(false);
    expect(retried.structuredContent).toEqual(accepted.structuredContent);
    const fresh = await tool(r, b.bearer, "act", { ...args, idempotencyKey: "ask-3" });
    expect(fresh.structuredContent).toMatchObject({ refused: true, rule: "binding-stale", current: { binding: await bindingIn(r, "ask") } });
    expect(await headSeq(r)).toBe(seq);
  });
});

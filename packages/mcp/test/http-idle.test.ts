import { expect, test } from "vitest";
import { secretSigner } from "@generalbusiness/artroom-client";
import { McpService, memoryStore } from "../src/index.ts";
import { McpHttp, SESSION_IDLE_MS, type SessionRow } from "../src/http.ts";
import { LEGACY, MODERN, PROTOCOL_META, Wire } from "../src/wire.ts";
import { SERVICE, StandIn } from "./support/standin.ts";

// The shared HTTP layer and Wire are real; scope reads and durable session storage are labelled STAND-INs.
function setup() {
  let now = Date.parse("2099-01-01T00:00:00Z"), serial = 0;
  const signer = secretSigner(new Uint8Array(32).fill(22));
  const scopes = new StandIn(signer.key);
  scopes.sessionEnds = "2100-01-01T00:00:00Z";
  const config = scopes.config();
  const service = new McpService({ service: SERVICE, signer, fetch: scopes.fetch,
    config: { read: async () => config, addRoot: async () => {} }, custody: memoryStore(), now: () => now, every: () => () => {} });
  const rows = new Map<string, SessionRow>();
  let beforePersist: ((row: SessionRow) => Promise<void>) | undefined;
  const layer = () => new McpHttp({ wire: new Wire(service), bodyBytes: 1024 * 1024, now: () => now,
    authorized: authorization => authorization === "Bearer SCRIPTED", mintSession: () => `SCRIPTED-${++serial}`,
    persist: async row => { await beforePersist?.(row); rows.set(row.id, structuredClone(row)); }, remove: id => { rows.delete(id); } });
  const request = (http: McpHttp, method: string, id?: string, rpc = "ping", extra: Record<string, string> = {}) => http.handle(new Request(SERVICE + "/mcp", {
    method, headers: { authorization: "Bearer SCRIPTED", "mcp-protocol-version": LEGACY, ...(id ? { "mcp-session-id": id } : {}), ...extra },
    ...(method === "POST" ? { body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: rpc,
      ...(rpc === "initialize" ? { params: { protocolVersion: LEGACY, capabilities: {} } } : {}) }) } : {}),
  }));
  const open = async (http: McpHttp) => { const reply = await request(http, "POST", undefined, "initialize"); expect(reply.status).toBe(200); return reply.headers.get("mcp-session-id")!; };
  return { layer, rows, request, open, now: () => now, at: (value: number) => { now = value; }, hold: (work: (row: SessionRow) => Promise<void>) => { beforePersist = work; } };
}

// Invariant: exact idle expiry removes the stored session and closes its stream; activity renews it,
// while origin/bearer refusals and the stateless revision neither renew nor expire legacy state.
test("legacy activity renews durable idle time; exact expiry closes streams after authorization and revision checks", async () => {
  const s = setup(), http = s.layer(), start = s.now();
  const idle = await s.open(http), active = await s.open(http);
  const stream = await s.request(http, "GET", idle);
  expect([stream.status, http.streams]).toEqual([200, 1]);
  s.at(start + SESSION_IDLE_MS - 1);
  expect((await s.request(http, "POST", active)).status).toBe(200);
  expect(s.rows.get(active)?.lastActive).toBe(s.now());
  s.at(start + SESSION_IDLE_MS);
  expect((await s.request(http, "GET", idle)).status).toBe(404);
  expect(s.rows.has(idle)).toBe(false);
  expect(http.streams).toBe(0);
  expect(await stream.text()).toContain("event: end");
  expect(http.sessions.has(active)).toBe(true);
  s.at(start + 2 * SESSION_IDLE_MS - 1);
  expect((await s.request(http, "POST", active, "ping", { origin: SERVICE })).status).toBe(403);
  expect((await s.request(http, "POST", active, "ping", { authorization: "Bearer wrong" })).status).toBe(401);
  expect((await s.request(http, "GET", active, "ping", { "mcp-protocol-version": MODERN })).status).toBe(405);
  const modern = await http.handle(new Request(SERVICE + "/mcp", { method: "POST", headers: { authorization: "Bearer SCRIPTED", "mcp-protocol-version": MODERN, "mcp-session-id": active, "mcp-method": "ping" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { _meta: { [PROTOCOL_META]: MODERN } } }) }));
  expect(modern.status).toBe(200);
  expect(s.rows.get(active)?.lastActive).toBe(start + SESSION_IDLE_MS - 1);
  expect(http.sessions.has(active)).toBe(true);
  expect((await s.request(http, "POST", active)).status).toBe(404);
  expect((await s.request(http, "DELETE", active)).status).toBe(404);
  expect(s.rows.size).toBe(0);
  await http.closeAll();
});

// Invariant: eviction preserves activity, legacy rows fall back to creation, and a late activity
// write cannot recreate a row after concurrent expiry ends the session.
test("restored idle deadlines survive eviction and expiry orders removal after a pending activity write", async () => {
  const s = setup(), first = s.layer(), start = s.now();
  const active = await s.open(first), legacy = await s.open(first);
  s.at(start + 10 * 60_000);
  await s.request(first, "POST", active);
  first.abrupt();
  const restored = s.layer();
  const old = { ...s.rows.get(legacy)! }; delete old.lastActive;
  restored.restore([s.rows.get(active)!, old]);
  s.at(start + SESSION_IDLE_MS);
  expect((await s.request(restored, "POST", active)).status).toBe(200);
  expect(s.rows.has(legacy)).toBe(false);
  expect(s.rows.get(active)?.lastActive).toBe(s.now());
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  s.hold(async () => { entered(); await gate; });
  const ending = new Promise<void>(resolve => {
    const end = restored.port.wire.endLegacy.bind(restored.port.wire);
    restored.port.wire.endLegacy = session => { end(session); if (session.id === active) resolve(); };
  });
  s.at(s.now() + 1);
  const touch = s.request(restored, "POST", active, "tools/list");
  await waiting;
  s.at(start + 2 * SESSION_IDLE_MS);
  const expiry = s.request(restored, "DELETE", active);
  // #end marks and removes the live session before waiting for its queued durable removal.
  await ending;
  expect(restored.sessions.has(active)).toBe(false);
  release();
  expect((await touch).status).toBe(404);
  expect((await expiry).status).toBe(404);
  expect(s.rows.has(active)).toBe(false);
  await restored.closeAll();
});

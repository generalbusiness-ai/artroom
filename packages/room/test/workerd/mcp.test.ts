/**
 * The MCP endpoint served by this Worker (request 8ae3b2dc, MCP plan stage
 * 0): `POST /v1/rooms/:room/mcp` routes to lane E's MCP server over the
 * `RoomApi`-per-bearer adapter (src/mcp.ts, R-CRED-10, R-API-9).
 */

import { describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";
import { Client as McpClient, StreamableHTTPClientTransport, type VersionNegotiationMode } from "@modelcontextprotocol/client";
import type { Claim, Lane, Landing, LandOp, Proposal, Redeemed, RoomWire, RosterRecord, WorkspaceOp } from "@generalbusiness/artroom-contract";
import { RoomWireTarget, type Room } from "../../src/index.ts";
import { bearerRoom } from "../../src/mcp.ts";
import { b64url, call, clock, day, digestBytes, iso, makeRoom, pushChange, randomBytes, tick, type TestRoom } from "./support.ts";

const base = "https://artroom.test/v1/rooms";
const KINDS = ["claim", "propose", "note", "land", "release", "renew"];

/** A room-custody invitation, redeemed: the bearer an MCP agent gets (R-CRED-3). */
async function bearer(r: TestRoom, kinds: string[] = KINDS, handle = "@agent"): Promise<Redeemed> {
  const bytes = randomBytes(32);
  const inv = await r.admin.ok<RosterRecord>("roster", null, {
    op: "invite",
    member: handle,
    role: "agent",
    custody: "room",
    expiresAt: iso(clock.now + day),
    secretHash: digestBytes(bytes),
    session: { kinds, lanes: "*", ttlSeconds: 3600 },
  });
  return call<Redeemed>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x"));
}

let rpcId = 0;
/** One raw JSON-RPC request, as a 2025-era client sends it. */
async function rpc(path: string, token: string | undefined, method: string, params: unknown = {}, init: RequestInit = {}): Promise<Response> {
  return exports.default.fetch(`${base}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    ...init,
  });
}

async function body(res: Response): Promise<any> {
  const text = await res.text();
  return JSON.parse(text.trim().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join(""));
}

async function tool(r: TestRoom, b: Redeemed, name: string, args: unknown): Promise<any> {
  const res = await rpc(`${r.id}/mcp`, b.bearer, "tools/call", { name, arguments: args });
  expect(res.status).toBe(200);
  return (await body(res)).result;
}

/** This Worker's own `RoomWire` for a test room, in process, as src/worker.ts gives it to the adapter. */
const wireFor = (r: TestRoom) => async (): Promise<RoomWire> => new RoomWireTarget(r.stub as unknown as DurableObjectStub<Room>);

describe("the route guards", () => {
  it("no bearer, or a bearer this room does not know: 401 with WWW-Authenticate, before any tool runs", async () => {
    const r = await makeRoom();
    const other = await makeRoom();
    const b = await bearer(r);
    expect(b.mcp).toBe(`${base}/${r.id}/mcp`);

    const none = await rpc(`${r.id}/mcp`, undefined, "tools/list");
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toBe('Bearer realm="artroom"');
    expect((await body(none)).error.message).toMatch(/Authorization: Bearer/);

    const unknown = await rpc(`${r.id}/mcp`, "art_unknown_token", "tools/list");
    expect(unknown.status).toBe(401);
    expect(unknown.headers.get("www-authenticate")).toMatch(/error="invalid_token"/);

    // A bearer is one room's: another room judges it unknown.
    const elsewhere = await rpc(`${other.id}/mcp`, b.bearer, "tools/list");
    expect(elsewhere.status).toBe(401);
    expect(await elsewhere.text()).not.toContain(b.bearer);
  });

  it("a revoked delegation ends the session at the next request (R-CRED-3, R-CRED-10)", async () => {
    const r = await makeRoom();
    const b = await bearer(r);
    expect((await rpc(`${r.id}/mcp`, b.bearer, "tools/list")).status).toBe(200);
    await r.admin.ok("roster", null, { op: "revoke-key", key: b.key, reason: "retired" });
    const res = await rpc(`${r.id}/mcp`, b.bearer, "tools/list");
    expect(res.status).toBe(401);
  });

  it("an unknown room is a 404 ArtroomError; a bad room segment is 400; the room's name works like its ID", async () => {
    const r = await makeRoom();
    const b = await bearer(r);
    const missing = await rpc("no-such-room/mcp", b.bearer, "tools/list");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ name: "ArtroomError", code: "not-found" });
    const bad = await rpc("%E0%A4%A/mcp", b.bearer, "tools/list");
    expect(bad.status).toBe(400);
    const byName = await rpc(`${encodeURIComponent(r.genesis.name)}/mcp`, b.bearer, "tools/list");
    expect(byName.status).toBe(200);
    expect((await body(byName)).result.tools).toHaveLength(10);
  });

  it("other paths are untouched: /mcp/x and /mcpx are the router's 404, not the MCP handler's", async () => {
    const r = await makeRoom();
    const b = await bearer(r);
    for (const path of [`${r.id}/mcp/x`, `${r.id}/mcpx`]) {
      const res = await rpc(path, b.bearer, "tools/list");
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ name: "ArtroomError", code: "not-found", message: "No such route." });
    }
  });

  it("legacy stateless mode: GET has no session stream, 405", async () => {
    const r = await makeRoom();
    const b = await bearer(r);
    const res = await exports.default.fetch(`${base}/${r.id}/mcp`, { headers: { authorization: `Bearer ${b.bearer}`, accept: "text/event-stream", "mcp-protocol-version": "2025-06-18" } });
    expect(res.status).toBe(405);
  });
});

describe("the RoomApi-per-bearer adapter (amendment 2, section 27)", () => {
  it("a bearer claims, opens its workspace, proposes and lands through the MCP tools; acts are signed under its delegation", async () => {
    const r = await makeRoom();
    const b = await bearer(r);

    const claimed = await tool(r, b, "claim", { goal: "Agent work", scope: ["src/**"], idempotencyKey: "c1" });
    expect(claimed.isError).toBe(false);
    const claim = claimed.structuredContent as Claim;
    expect(claim.by).toMatchObject({ via: "delegation", member: "@agent", delegation: b.delegation });
    // A retry with the same key returns the original record (R-IDEM-2, R-CRED-10).
    expect((await tool(r, b, "claim", { goal: "Agent work", scope: ["src/**"], idempotencyKey: "c1" })).structuredContent.id).toBe(claim.id);

    const held = { lane: claim.lane, lease: claim.lease.generation };
    let ws = await tool(r, b, "workspace", { ...held, waitMs: 0 });
    for (let i = 0; i < 5 && ws.structuredContent.grant === null; i++) {
      await tick(r);
      ws = await tool(r, b, "workspace", { ...held, waitMs: 0 });
    }
    expect(ws.structuredContent.op).toMatchObject({ kind: "workspace", state: "ready" });
    expect(ws.structuredContent.grant).toMatchObject({ token: expect.any(String), remote: expect.stringMatching(/^https:/) });

    const head = pushChange(r, claim.lane, { "src/app.ts": "export const app = 2;\n" });
    const proposed = await tool(r, b, "propose", { ...held, head, expectedGeneration: 0, summary: "app is 2" });
    expect(proposed.structuredContent).toMatchObject({ kind: "propose", generation: 1, head });
    expect(proposed.structuredContent.by).toMatchObject({ via: "delegation", delegation: b.delegation });

    const landed = await tool(r, b, "land", { ...held, generation: 1, head, idempotencyKey: "l1" });
    const landing = landed.structuredContent as Landing;
    expect(landing.op.state).not.toBe("failed");
    await tick(r, 3);
    const op = (await r.admin.read({ q: "op", op: landing.op.id })) as LandOp;
    expect(op.state).toBe("landed");

    const page = await tool(r, b, "attention", {});
    expect(page.structuredContent).toMatchObject({ items: expect.any(Array), publishedThrough: expect.any(Number) });
    const released = await tool(r, b, "release", { ...held, note: "done" });
    expect(released.structuredContent).toMatchObject({ kind: "release" });
  });

  it("a kind the delegation does not grant is refused by the room, as a value", async () => {
    const r = await makeRoom();
    const b = await bearer(r, ["claim"]);
    const claim = (await tool(r, b, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    const res = await tool(r, b, "propose", { lane: claim.lane, lease: 1, head: "a".repeat(40), expectedGeneration: 0, summary: "s" });
    expect(res.isError).toBe(false);
    expect(res.structuredContent).toMatchObject({ refused: true, rule: "delegation-invalid" });
  });

  it("serves the reads stage 1 needs over RoomWire.read and subscribe with the bearer token: lanes, lane, proposal, op, wait, subscribe", async () => {
    const r = await makeRoom();
    const b = await bearer(r);
    expect(await bearerRoom(wireFor(r), r.id, "art_not_a_token")).toBeNull();
    const api = (await bearerRoom(wireFor(r), r.id, b.bearer))!;
    const claim = (await api.claim({ goal: "g", scope: ["src/**"] })) as Claim;
    const head = pushChange(r, claim.lane, { "src/app.ts": "v2" });
    const p = (await api.propose(claim, { head, expectedGeneration: 0, summary: "s" })) as Proposal;
    expect((await api.lanes({ state: "held" })).items.map((l: Lane) => l.lane)).toEqual([claim.lane]);
    expect((await api.lane(claim.lane))?.lane).toBe(claim.lane);
    expect((await api.proposal({ lane: claim.lane, generation: 1 }))?.head).toBe(head);
    expect((await api.op(p.preview))?.kind).toBe("preview");
    const ws = (await api.workspace(claim)) as WorkspaceOp;
    await tick(r);
    expect((await api.wait(ws, { until: ["ready", "failed"], timeoutMs: 1_000 })).state).toBe("ready");
    // The subscription starts at the head; a note after it is the next update.
    const stream = await api.subscribe();
    const note = await api.note({ act: claim.id }, { text: "watching" });
    const reader = stream.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(first.value?.entries.map((e: { id: string }) => e.id)).toContain((note as { id: string }).id);
    reader.releaseLock();
    await stream.cancel();
  });
});

describe.each([
  ["2026-07-28", { pin: "2026-07-28" } as VersionNegotiationMode],
  ["legacy stateless (2025)", "legacy" as VersionNegotiationMode],
])("the official MCP client against the Worker, %s", (_label, mode) => {
  it("lists the tools with object-rooted output schemas, and a refusal conforms to its schema", async () => {
    const r = await makeRoom();
    const b = await bearer(r);
    const c = new McpClient({ name: "room-mcp-test", version: "0.0.0" }, { versionNegotiation: { mode } });
    await c.connect(
      new StreamableHTTPClientTransport(new URL(b.mcp), {
        requestInit: { headers: { authorization: `Bearer ${b.bearer}` } },
        fetch: (input, init) => exports.default.fetch(new Request(input, init)),
      }),
    );
    try {
      expect(c.getInstructions()?.length).toBeLessThanOrEqual(512);
      const { tools } = await c.listTools();
      expect(tools).toHaveLength(10);
      for (const t of tools) expect(t.outputSchema?.["type"]).toBe("object");
      const claim = (await c.callTool({ name: "claim", arguments: { goal: "g", scope: ["src/**"] } })).structuredContent as unknown as Claim;
      const refused = await c.callTool({ name: "renew", arguments: { lane: claim.lane, lease: 9 } });
      expect(refused.isError).toBe(false);
      expect(refused.structuredContent).toMatchObject({ refused: true, rule: "lease-fenced" });
    } finally {
      await c.close();
    }
  });
});

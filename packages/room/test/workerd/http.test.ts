/**
 * The HTTPS routes (R-API-1, R-API-3, `HttpRoutes`) and the Worker's RPC
 * entrypoint (`ArtroomService`, `RoomWire`).
 */

import { describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";
import type { ActRecord, Claim, Lane, LogPage, Proposal, Refusal, Roster } from "@generalbusiness/artroom-contract";
import { isArtroomError } from "@generalbusiness/artroom-contract";
import { addMember, expectOk, makeRoom, newKeyPair, pushChange, sign, type TestRoom } from "./support.ts";

const base = "https://artroom.test/v1/rooms";

async function post(room: TestRoom, path: string, body: unknown, raw?: string): Promise<Response> {
  return exports.default.fetch(`${base}/${room.id}/${path}`, { method: "POST", body: raw ?? JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

async function get(room: TestRoom, path: string, token?: string): Promise<Response> {
  return exports.default.fetch(`${base}/${room.id}/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

describe("HTTPS routes", () => {
  it("POST /acts: 200 with the record, 409 with a refusal, 401 for a bad signature, 400 for duplicate keys", async () => {
    const room = await makeRoom();
    const ok = await post(room, "acts", room.admin.signed("claim", null, { goal: "g", scope: ["src/**"] }));
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
    const dup = await post(room, "acts", null, '{"envelope":{},"envelope":{}}');
    expect(dup.status).toBe(400);
  });

  it("reads need a session or bearer token; GET lanes, lane, proposal, ops, attention, log, explain and members", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const claim = expectOk(await bob.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
    const head = pushChange(room, claim.lane, { "src/app.ts": "v2" });
    const p = expectOk(await bob.act<Proposal>("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }));
    expect((await get(room, "log")).status).toBe(401);
    const token = await bob.session();
    const lanes = await get(room, "lanes?state=held", token);
    expect(((await lanes.json()) as { items: Lane[] }).items.map((l) => l.lane)).toEqual([claim.lane]);
    expect(((await (await get(room, `lanes/${claim.lane}`, token)).json()) as Lane).lane).toBe(claim.lane);
    expect(((await (await get(room, `lanes/${claim.lane}/1`, token)).json()) as Proposal).head).toBe(head);
    expect((await get(room, `lanes/${claim.lane}/7`, token)).status).toBe(404);
    expect(((await (await get(room, `ops/${p.preview.id}`, token)).json()) as { kind: string }).kind).toBe("preview");
    expect((await get(room, "ops/op_land_999", token)).status).toBe(404);
    const log = (await (await get(room, "log?after=1&limit=2", token)).json()) as LogPage;
    expect(log.acts.map((e) => e.seq)).toEqual([2, 3]);
    expect(log.head).toBeGreaterThan(3);
    expect(((await (await get(room, `explain/${claim.id}`, token)).json()) as { act: string }).act).toBe(claim.id);
    expect(((await (await get(room, "members", token)).json()) as Roster).members.map((m) => m.handle)).toEqual(["@admin", "@bob"]);
    expect((await get(room, "attention", token)).status).toBe(200);
  });

  it("POST /requests and /redeem; an unknown room is 404; the MCP route is not served here", async () => {
    const room = await makeRoom();
    const res = await post(room, "requests", room.admin.signedRequest({ kind: "session", ttlSeconds: 60 }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(((await res.json()) as { token: string }).token).toMatch(/^ses_/);
    const r = await post(room, "redeem", { custody: "room", invitation: "act_9_00000000", secret: "AAAA" });
    expect(r.status).toBe(409);
    const unknown = await exports.default.fetch(`${base}/no-such-room/members`, { headers: { Authorization: "Bearer x" } });
    expect(unknown.status).toBe(404);
    expect((await post(room, "mcp", {})).status).toBe(404);
  });

  it("the RPC entrypoint: room(id) returns a RoomWire whose refusals are values and failures are thrown", async () => {
    const room = await makeRoom();
    using wire = await (exports.default as unknown as { room(id: string): Promise<{ submit(a: unknown): Promise<ActRecord | Refusal>; read(t: string, q: unknown): Promise<unknown> } & Disposable> }).room(room.id);
    const claim = (await wire.submit(room.admin.signed("claim", null, { goal: "g", scope: ["src/**"] }))) as Claim;
    expect(claim.kind).toBe("claim");
    const refused = (await wire.submit(room.admin.signed("renew", { lane: claim.lane }, { lease: 9 }))) as Refusal;
    expect(refused.refused).toBe(true);
    let thrown: unknown = null;
    try {
      await wire.read("ses_bad", { q: "members" });
    } catch (e) {
      thrown = e;
    }
    // R-API-1: the thrown failure keeps its ArtroomError shape across RPC.
    expect(isArtroomError(thrown)).toBe(true);
    expect(thrown).toMatchObject({ name: "ArtroomError", code: "unauthenticated", retryable: false });
  });
});

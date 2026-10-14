/**
 * Contract amendment 2, lane E's MCP edits (protocol section 27, R-API-9,
 * R-CRED-10): `propose` and both `claim` forms keep `because`; `attention`
 * returns the room's page as it is, with no extra log read; the endpoint
 * acts through `bearerAct` and `bearerRequest`, and a revoked bearer is
 * refused.
 */

import { afterEach, beforeEach, expect, test } from "vitest";
import type { Claim, Proposal, Redeemed } from "@generalbusiness/artroom-contract";
import { agent, roomWithMcp, rpc, type FakeRoom, type Url, keyed } from "./support.ts";

let room: FakeRoom;
let url: Url;
let reads: Record<string, number>;
beforeEach(async () => {
  ({ room, url, reads } = await roomWithMcp());
});
afterEach(() => room.stop());

// Every act tool requires an idempotency key (R-API-9, amendment 7): `keyed` gives a fresh one where a test names none.
const call = async (a: Redeemed, name: string, args: unknown) => (await rpc(a.mcp, a.bearer, "tools/call", { name, arguments: keyed(name, args) })).body.result;
const bodyOf = (id: string) => {
  const e = room.entryById(id)!;
  return e.entry.type === "act" ? (e.entry.act.envelope.body as { because?: unknown }) : {};
};

test("propose and both claim forms pass because through unchanged", async () => {
  const a = await agent(room, url);
  const because = [{ url: "https://example.com/issue/7" }, { act: "act_1_00000000" }];
  const claim = (await call(a, "claim", { goal: "g", scope: ["src/**"], because })).structuredContent as Claim;
  expect(bodyOf(claim.id).because).toEqual(because);
  const held = { lane: claim.lane, lease: claim.lease.generation };
  const re = (await call(a, "claim", { ...held, expectedGeneration: 0, scope: ["src/**", "lib/**"], because })).structuredContent as Claim;
  expect(re.effect.type).toBe("rescoped");
  expect(bodyOf(re.id).because).toEqual(because);
  const p = (await call(a, "propose", { ...held, head: "c".repeat(40), expectedGeneration: 0, summary: "s", because })).structuredContent as Proposal;
  expect(bodyOf(p.id).because).toEqual(because);
});

test("attention returns the room's page, with publishedThrough, and reads the log no more", async () => {
  const a = await agent(room, url);
  const before = reads["log"] ?? 0;
  const page = (await call(a, "attention", {})).structuredContent;
  expect(page).toMatchObject({ items: [], more: false, publishedThrough: room.publishedThrough });
  expect(reads["attention"]).toBeGreaterThan(0);
  // connect reads entry 0 once per request; the attention tool itself adds no log read.
  expect((reads["log"] ?? 0) - before).toBe(1);
});

test("acts are signed by the room under the bearer's delegation; a revoked bearer gets 401 and records nothing", async () => {
  const a = await agent(room, url);
  const claim = (await call(a, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
  expect(claim.by).toMatchObject({ via: "delegation", member: "@builder", delegation: a.delegation });
  const ws = (await call(a, "workspace", { lane: claim.lane, lease: 1, waitMs: 2000 })).structuredContent;
  expect(ws.op.state).toBe("ready");
  expect(ws.grant).not.toBeNull();
  room.revokeDelegation(a.delegation);
  const entries = room.entries.length;
  const res = await rpc(a.mcp, a.bearer, "tools/call", { name: "renew", arguments: { lane: claim.lane, lease: 1, idempotencyKey: "renew-after-revocation" } });
  expect(res.status).toBe(401);
  expect(room.entries.length).toBe(entries);
});

test("the client's HTTPS bearer handle keeps because for propose and an existing-lane claim", async () => {
  const { connect } = await import("@generalbusiness/artroom-client");
  const a = await agent(room, url);
  const api = await connect({ url }, room.id, { kind: "bearer", token: a.bearer });
  const because = [{ url: "https://example.com/issue/9" as const }];
  const claim = (await api.claim({ goal: "g", scope: ["src/**"] })) as Claim;
  const re = (await api.claim({ lane: claim, scope: ["src/**", "lib/**"], expectedGeneration: 0, because })) as Claim;
  const p = (await api.propose(claim, { head: "d".repeat(40) as never, expectedGeneration: 0, summary: "s", because })) as Proposal;
  expect(bodyOf(re.id).because).toEqual(because);
  expect(bodyOf(p.id).because).toEqual(because);
});

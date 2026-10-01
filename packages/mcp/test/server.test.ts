/**
 * The MCP endpoint end to end: the Worker handler (Agents SDK, stateless)
 * mounted on the fake room's `POST /v1/rooms/:room/mcp`, reached with raw
 * JSON-RPC and through the client's bearer handle (R-API-1, R-API-9,
 * R-CRED-3, R-WS-5).
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { connect, generateSigner, isArtroomError, isRefusal, join } from "@generalbusiness/artroom-client";
import type { Claim, HttpRoom, Proposal, Redeemed } from "@generalbusiness/artroom-contract";
import { listedTools } from "../src/index.ts";
import { agent, roomWithMcp, rpc, type FakeRoom, type Url } from "./support.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  ({ room, url } = await roomWithMcp());
});
afterEach(() => room.stop());

const call = (a: Redeemed, name: string, args: unknown) => rpc(a.mcp, a.bearer, "tools/call", { name, arguments: args });
const head = (c: string) => c.repeat(40);

async function human(handle: `@${string}`): Promise<HttpRoom> {
  const { invitation, secret } = await room.invite(handle, { role: "member" });
  const { signer } = await generateSigner();
  const joined = await join({ url }, room.id, { invitation, secret, signer });
  if (isRefusal(joined)) throw new Error(joined.rule);
  return connect({ url }, room.id, { kind: "key", signer });
}

describe("the endpoint", () => {
  test("needs a bearer token, and says how to get one", async () => {
    const a = await agent(room, url);
    const none = await rpc(a.mcp, undefined, "tools/list");
    expect(none.status).toBe(401);
    expect(none.body.error.message).toMatch(/Authorization: Bearer/);
    const wrong = await rpc(a.mcp, "brr_not-a-token", "tools/list");
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toMatch(/new MCP invitation/);
  });

  test("lists exactly the ten tools with the descriptors' schemas", async () => {
    const a = await agent(room, url);
    const list = await rpc(a.mcp, a.bearer, "tools/list");
    expect(list.status).toBe(200);
    expect(list.body.result.tools).toEqual(listedTools());
  });
});

describe("results: refusals are values, failures are tool errors (R-API-1)", () => {
  test("an accepted act is structured content with a one-line headline", async () => {
    const a = await agent(room, url);
    const res = await call(a, "claim", { goal: "Fix login copy", scope: ["src/ui/**"] });
    const result = res.body.result;
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ kind: "claim", lane: expect.stringMatching(/^act_/), lease: { generation: 1, holder: "@builder" } });
    expect(result.structuredContent.by).toMatchObject({ via: "delegation", member: "@builder", delegation: a.delegation });
    expect(result.content[0].text.split("\n")[0]).toMatch(/^Claimed lane act_\d+_[0-9a-f]{8} with lease 1\.$/);
  });

  test("a refusal is not an error: isError false, the Refusal as structured content, and the fix in the text", async () => {
    const a = await agent(room, url);
    const claim = (await call(a, "claim", { goal: "g", scope: ["src/**"] })).body.result.structuredContent as Claim;
    const held = { lane: claim.lane, lease: claim.lease.generation };
    await call(a, "propose", { ...held, head: head("a"), expectedGeneration: 0, summary: "one" });
    const res = await call(a, "propose", { ...held, head: head("b"), expectedGeneration: 0, summary: "two" });
    expect(res.body.result.isError).toBe(false);
    expect(res.body.result.structuredContent).toMatchObject({ refused: true, rule: "generation-moved", current: { generation: 1 } });
    expect(res.body.result.content[0].text).toMatch(/^Refused \(generation-moved\): .+ Fix: /);
  });

  test("bad input is a tool error with an ArtroomError that names each problem", async () => {
    const a = await agent(room, url);
    const res = await call(a, "propose", { lane: "act_1_00000000", head: "nope", summary: "s", expectedGeneration: 0 });
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.structuredContent).toMatchObject({ name: "ArtroomError", code: "bad-request", retryable: false });
    expect(res.body.result.structuredContent.message).toMatch(/lease: is required.*head: does not match/);
    const unknown = await call(a, "merge", {});
    expect(unknown.body.result.structuredContent.message).toMatch(/There is no tool named merge/);
  });

  test("explain of an unknown act returns null as text, with no structured content", async () => {
    const a = await agent(room, url);
    const res = await call(a, "explain", { act: "act_999_00000000" });
    expect(res.body.result.isError).toBeFalsy();
    expect(res.body.result.structuredContent).toBeUndefined();
    expect(res.body.result.content[0].text).toBe("Nothing found.\nnull");
  });
});

describe("the loop over MCP", () => {
  test("claim, workspace with a grant, propose, review by a person, land with wait, attention, explain", async () => {
    const a = await agent(room, url);
    const bob = await human("@bob");
    const claim = (await call(a, "claim", { goal: "Fix login copy", scope: ["src/ui/**"] })).body.result.structuredContent as Claim;
    const held = { lane: claim.lane, lease: claim.lease.generation };

    const ws = (await call(a, "workspace", { ...held, waitMs: 5000 })).body.result;
    expect(ws.structuredContent.op.state).toBe("ready");
    expect(ws.structuredContent.grant).toMatchObject({ lane: claim.lane, leaseGeneration: 1, remote: expect.stringMatching(/^https:/) });
    expect(room.grantValid(ws.structuredContent.grant.token)).toBe(true);

    const p = (await call(a, "propose", { ...held, head: head("c"), expectedGeneration: 0, summary: "Copy fix." })).body.result.structuredContent as Proposal;
    expect(p.obligations[0]?.state).toBe("open");

    const early = (await call(a, "land", { ...held, generation: p.generation, head: p.head })).body.result.structuredContent;
    expect(early).toMatchObject({ refused: true, rule: "obligation-open" });

    const review = await bob.review(p, { verdict: "approve", scope: ["src/ui/**"], text: "Reads well." });
    expect(isRefusal(review)).toBe(false);

    const landed = (await call(a, "land", { ...held, generation: p.generation, head: p.head, waitMs: 10_000 })).body.result;
    expect(landed.structuredContent.op.state).toBe("landed");
    expect(landed.content[0].text).toMatch(/^Landing op_land_\d+ is landed\./);

    const att = (await call(a, "attention", {})).body.result.structuredContent;
    expect(att.items.map((i: { why: string }) => i.why)).toContain("land-outcome");
    expect(typeof att.publishedThrough).toBe("number");
    const again = (await call(a, "attention", { cursor: att.cursor })).body.result.structuredContent;
    expect(again.items).toEqual([]);

    const why = (await call(a, "explain", { act: p.id })).body.result.structuredContent;
    expect(why).toMatchObject({ act: p.id, outcome: "accepted" });

    const released = (await call(a, "release", { ...held, note: "Done; nothing left." })).body.result.structuredContent;
    expect(released).toMatchObject({ kind: "release", note: "Done; nothing left." });
    expect(room.grantValid(ws.structuredContent.grant.token)).toBe(false);
  });

  test("workspace gives no grant to a non-holder, and grant null while pending (R-WS-5)", async () => {
    const a = await agent(room, url);
    const b = await agent(room, url, "@helper");
    const claim = (await call(a, "claim", { goal: "g", scope: ["src/**"] })).body.result.structuredContent as Claim;
    const theirs = (await call(b, "workspace", { lane: claim.lane, lease: claim.lease.generation, waitMs: 0 })).body.result.structuredContent;
    expect(theirs).toMatchObject({ refused: true, rule: "not-holder" });
    room.workspaceDelay = 1_000_000;
    const c = (await call(a, "claim", { goal: "g2", scope: ["lib/**"] })).body.result.structuredContent as Claim;
    const pending = (await call(a, "workspace", { lane: c.lane, lease: 1, waitMs: 50 })).body.result.structuredContent;
    expect(pending.op.state).toBe("pending");
    expect(pending.grant).toBeNull();
  });

  test("the bearer never appears in the log, attention or explain", async () => {
    const a = await agent(room, url);
    const claim = (await call(a, "claim", { goal: "g", scope: ["src/**"] })).body.result.structuredContent as Claim;
    const outputs = [
      (await call(a, "attention", {})).body,
      (await call(a, "explain", { act: claim.id })).body,
      room.entries,
      room.attentionItems,
    ];
    expect(JSON.stringify(outputs)).not.toContain(a.bearer);
  });
});

describe("the client's bearer handle acts through the MCP route (R-CRED-3)", () => {
  test("the same RoomApi code runs with a bearer token as with a key", async () => {
    const a = await agent(room, url);
    const bob = await human("@bob");
    const api = await connect({ url }, room.id, { kind: "bearer", token: a.bearer });
    const claim = await api.claim({ goal: "Fix login copy", scope: ["src/ui/**"] });
    if (isRefusal(claim)) throw new Error(claim.rule);
    const op = await api.workspace(claim);
    if (isRefusal(op)) throw new Error(op.rule);
    await api.wait(op, { until: ["ready"] });
    const grant = await api.workspaceToken(claim);
    expect(isRefusal(grant)).toBe(false);
    const p = await api.propose(claim, { head: head("d") as never, expectedGeneration: 0, summary: "s" });
    if (isRefusal(p)) throw new Error(p.rule);
    const stale = await api.propose(claim, { head: head("e") as never, expectedGeneration: 0, summary: "s" });
    expect(isRefusal(stale) && stale.rule).toBe("generation-moved");
    await bob.review(p, { verdict: "approve", scope: ["src/**"], text: "ok" });
    const landing = await api.land(claim, p);
    if (isRefusal(landing)) throw new Error(landing.rule);
    expect((await api.wait(landing.op, { until: ["landed", "failed"] })).state).toBe("landed");
    let thrown: unknown;
    try {
      await api.roster({ op: "remove", member: "@bob" });
    } catch (e) {
      thrown = e;
    }
    expect(isArtroomError(thrown) && thrown.code).toBe("forbidden");
  });

  test("a retried bearer act with the same idempotency key happens once (R-IDEM-6)", async () => {
    const a = await agent(room, url);
    const api = await connect({ url }, room.id, { kind: "bearer", token: a.bearer });
    room.faults.push({ route: "POST /mcp", kind: "drop" });
    const claim = await api.claim({ goal: "g", scope: ["src/**"] }, { idempotencyKey: "agent-claim-1" });
    expect(isRefusal(claim)).toBe(false);
    const claims = room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === "claim");
    expect(claims).toHaveLength(1);
    expect(room.requests.filter((r) => r.route === "/mcp")).toHaveLength(2); // the dropped call and its retry
  });
});

/**
 * The MCP core runtime against this Worker (request 9ca1d290;
 * docs/protocol.md section 34, R-API-9 and R-API-13 to R-API-15): the real
 * MCP endpoint, the real client package and the Durable Object. Nothing
 * here is a double.
 *
 * What this adds to the MCP package's own tests is the Room: the
 * authorization it gives its endpoint for `tools/list`, admission of calls
 * the list does not show, retries, and waits that hold nothing in the room.
 *
 * These tests found their own `v1` and `v2` rooms and choose their own
 * bindings, so they run in the legacy run only, like stage 2's and stage
 * 5's own tests.
 */

import { describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";
import type { ActDeclaration, Claim, DeclaredRecord, Landing, Proposal, Redeemed, Roster, RosterRecord } from "@generalbusiness/artroom-contract";
import { callerFromRoster, validate } from "@generalbusiness/artroom-mcp";
import { CODE_REVIEW_ACTS, policy } from "@generalbusiness/artroom-policy";
import type { CallerView } from "../../src/requests.ts";
import { activate, bindingIn, declaredRoom, headSeq, laneRowOf, ok, v2 } from "./declared-support.ts";
import { ASK, ORIGIN, bearer } from "./declared-stage5-support.ts";
import { addMember, b64url, call, Client, clock, day, DECLARED, digestBytes, iso, makeRoom, newKeyPair, pushChange, randomBytes, tick, type TestRoom } from "./support.ts";

/** The fixed order of `tools/list` (R-API-13). */
const ORDER = ["claim", "workspace", "propose", "note", "review", "land", "renew", "release", "attention", "explain", "lanes", "lane", "proposal", "operation", "acts", "act"];
const BUILDER = ["claim", "workspace", "propose", "note", "land", "renew", "release", "attention", "explain", "lane", "proposal", "operation", "acts", "act"];
const REVIEWER = ["note", "review", "attention", "explain", "lanes", "lane", "proposal", "acts", "act"];
const OBSERVER = ["attention", "explain", "lanes", "lane", "proposal", "operation", "acts"];
const without = (names: readonly string[], ...drop: string[]) => names.filter((n) => !drop.includes(n));

/** A check step under another name: only a checker may sign it. */
const VERIFY: ActDeclaration = { ...CODE_REVIEW_ACTS["check"]!, label: "Verify" };
const doc = (change: (acts: Record<string, ActDeclaration>) => void = () => {}) =>
  v2((a) => {
    a["ask"] = ASK;
    a["verify"] = VERIFY;
    change(a);
  });
const bindings = async (r: TestRoom, ...kinds: string[]) => Object.fromEntries(await Promise.all(kinds.map(async (k) => [k, (await bindingIn(r, k))!] as const)));

/** A room-custody invitation with a legacy session, redeemed, in a `v1` room. */
async function legacyBearer(r: TestRoom, handle: `@${string}`, kinds: string[] | "*"): Promise<Redeemed> {
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
async function rpc(r: TestRoom, token: string, method: string, params: unknown = {}, query = ""): Promise<{ status: number; body: any }> {
  const res = await exports.default.fetch(`${ORIGIN}/v1/rooms/${r.id}/mcp${query}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await res.text();
  const data = text.trim().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("");
  return { status: res.status, body: data ? JSON.parse(data) : null };
}
const tools = async (r: TestRoom, token: string, query = "") => {
  const res = await rpc(r, token, "tools/list", {}, query);
  expect(res.status).toBe(200);
  return res.body.result.tools as { name: string; outputSchema: any; annotations: unknown; title: string }[];
};
const listed = async (r: TestRoom, token: string, query = "") => (await tools(r, token, query)).map((t) => t.name);
let keys = 0;
/** One tool call. `key` false sends the arguments as they are. */
async function tool(r: TestRoom, token: string, name: string, args: Record<string, unknown>, query = ""): Promise<{ isError?: boolean; structuredContent?: any; content: { text: string }[] }> {
  const act = ["claim", "propose", "note", "review", "land", "renew", "release", "act"].includes(name);
  const res = await rpc(r, token, "tools/call", { name, arguments: act && !("idempotencyKey" in args) ? { ...args, idempotencyKey: `k-${++keys}` } : args }, query);
  expect(res.status).toBe(200);
  return res.body.result;
}
const roster = (r: TestRoom) => r.admin.read({ q: "members" }) as Promise<Roster>;
const callerOf = (r: TestRoom, token: string) => call<CallerView>(r.stub.caller(token));

describe.skipIf(DECLARED)("the Room gives its MCP endpoint the caller's authorization (R-API-14)", () => {
  it("a bearer: its member's role now, and its delegation's signed grant unchanged; a session of a member's own key has no delegation", async () => {
    const r = await declaredRoom(doc());
    const map = await bindings(r, "claim", "ask");
    const b = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: map });
    expect(await callerOf(r, b.bearer)).toEqual({ role: "agent", delegation: { kinds: ["renew"], acts: map } });
    expect(await callerOf(r, await r.admin.session())).toEqual({ role: "admin" });
    const bob = await addMember(r, "@bob", "maintainer");
    expect(await callerOf(r, await bob.session())).toEqual({ role: "maintainer" });
    // The role is read at each call.
    await r.admin.ok("roster", null, { op: "set-role", member: "@agent", role: "member" });
    expect((await callerOf(r, b.bearer)).role).toBe("member");
    // The signed map is given as it was signed, after its bindings went stale too. Nothing is rebound.
    await activate(r, doc((a) => void (a["ask"] = { ...ASK, body: { text: { type: "text", max: 50 } } })));
    expect((await callerOf(r, b.bearer)).delegation).toEqual({ kinds: ["renew"], acts: map });
    expect(map["ask"]).not.toBe(await bindingIn(r, "ask"));
  });

  it("an unknown token, and a bearer whose key was revoked, are unauthenticated; tools/list answers 401", async () => {
    const r = await declaredRoom(doc());
    const b = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: {} });
    const refusedAs = async (token: string) => ((await r.stub.caller(token)) as { error?: { code: string } }).error?.code;
    expect(await refusedAs("brr_not_a_token")).toBe("unauthenticated");
    expect((await rpc(r, b.bearer, "tools/list")).status).toBe(200);
    await r.admin.ok("roster", null, { op: "revoke-key", key: b.key, reason: "retired" });
    expect(await refusedAs(b.bearer)).toBe("unauthenticated");
    expect((await rpc(r, b.bearer, "tools/list")).status).toBe(401);
  });
});

describe.skipIf(DECLARED)("the Room's reading of a credential and the command line's reading of the roster agree (R-API-14)", () => {
  it("a v2 bearer, a v1 bearer and a member's own key: the same caller from the Room's token adapter and from the current roster, before and after a role change", async () => {
    const r = await declaredRoom(doc());
    const map = await bindings(r, "claim", "ask");
    const b = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: map });
    const fromRoster = async () => callerFromRoster(await roster(r), { key: b.key, session: true, delegation: b.delegation });
    expect(await fromRoster()).toEqual(await callerOf(r, b.bearer));
    expect(await fromRoster()).toEqual({ role: "agent", delegation: { kinds: ["renew"], acts: map } });
    // A credential saved before the delegation's ID was kept: the room-held key granted one delegation, the same one.
    expect(callerFromRoster(await roster(r), { key: b.key, session: true })).toEqual(await callerOf(r, b.bearer));
    await r.admin.ok("roster", null, { op: "set-role", member: "@agent", role: "member" });
    expect(await fromRoster()).toEqual(await callerOf(r, b.bearer));
    expect((await fromRoster()).role).toBe("member");
    // A member's own key (custody client) has no delegation on either side.
    const bob = await addMember(r, "@bob", "maintainer");
    expect(callerFromRoster(await roster(r), { key: bob.key })).toEqual(await callerOf(r, await bob.session()));
    expect(callerFromRoster(await roster(r), { key: bob.key })).toEqual({ role: "maintainer" });
    // A session cannot be read under a delegation another key granted, and the grantor's key is not its grantee.
    const other = await bearer(r, "@other", "agent", { kinds: [], acts: await bindings(r, "note") });
    const now = await roster(r);
    expect(() => callerFromRoster(now, { key: b.key, session: true, delegation: other.delegation })).toThrowError(expect.objectContaining({ code: "unauthenticated" }));
    expect(() => callerFromRoster(now, { key: b.key, delegation: b.delegation })).toThrowError(expect.objectContaining({ code: "unauthenticated" }));
    // The legacy session of a v1 room: kinds as signed, and no map, on both sides.
    const v1 = await makeRoom();
    const legacy = await legacyBearer(v1, "@agent", ["claim", "note"]);
    const legacyCaller = callerFromRoster(await roster(v1), { key: legacy.key, session: true, delegation: legacy.delegation });
    expect(legacyCaller).toEqual(await callerOf(v1, legacy.bearer));
    expect(legacyCaller).toEqual({ role: "agent", delegation: { kinds: ["claim", "note"] } });
  });

  it("revocation: after a delegation is revoked by its grantor, or a session's key by an admin, neither adapter gives a caller", async () => {
    const r = await declaredRoom(doc());
    const refusedAs = async (token: string) => ((await r.stub.caller(token)) as { error?: { code: string } }).error?.code;
    // A client-held key acting under a member's delegation, with a read session of its own.
    const bob = await addMember(r, "@bob", "member");
    const k = newKeyPair();
    const map = await bindings(r, "claim", "note");
    const g = await ok<RosterRecord>(r, bob, "roster", null, { op: "delegate", to: k.key, kinds: ["renew"], acts: map, lanes: "*", expiresAt: iso(clock.now + day) }, { binding: null });
    const delegate = new Client(r, k, g.id);
    const token = await delegate.session();
    const who = { key: k.key, delegation: g.id } as const;
    expect(callerFromRoster(await roster(r), who)).toEqual(await callerOf(r, token));
    expect(await callerOf(r, token)).toEqual({ role: "member", delegation: { kinds: ["renew"], acts: map } });
    expect(await listed(r, token)).toEqual(["claim", "workspace", "note", "renew", "attention", "explain", "lane", "proposal", "operation", "acts", "act"]);
    // Its grantor revokes the delegation: the Room refuses the token, and the roster no longer gives a caller.
    await ok(r, bob, "roster", null, { op: "undelegate", delegation: g.id }, { binding: null });
    expect(await refusedAs(token)).toBe("unauthenticated");
    const afterUndelegate = await roster(r);
    expect(() => callerFromRoster(afterUndelegate, who)).toThrowError(expect.objectContaining({ code: "unauthenticated" }));
    expect((await rpc(r, token, "tools/list")).status).toBe(401);
    // Another session: its key is revoked. The Room refuses the token, and the roster no longer holds the key as current.
    const c = await bearer(r, "@second", "agent", { kinds: ["renew"], acts: {} });
    await r.admin.ok("roster", null, { op: "revoke-key", key: c.key, reason: "retired" });
    expect(await refusedAs(c.bearer)).toBe("unauthenticated");
    const afterRevoke = await roster(r);
    expect(() => callerFromRoster(afterRevoke, { key: c.key, session: true, delegation: c.delegation })).toThrowError(expect.objectContaining({ code: "unauthenticated" }));
  });
});

describe.skipIf(DECLARED)("tools/list at the Worker's MCP endpoint (R-API-13, R-API-14)", () => {
  it("an admin's list: under a v1 document the fourteen named tools and acts, with no generic act; under a v2 document all sixteen", async () => {
    const v1 = await makeRoom();
    const legacy = await listed(v1, await v1.admin.session());
    expect(legacy).toEqual(without(ORDER, "act"));
    expect(legacy).toHaveLength(15);
    expect(await listed(v1, await v1.admin.session(), "?toolset=all")).toEqual(without(ORDER, "act"));
    const r = await declaredRoom(doc());
    expect(await listed(r, await r.admin.session())).toEqual(ORDER);
    // The same room once it returns to a v1 document: the generic act is gone again, and nothing else moves.
    await activate(r, policy());
    expect(await listed(r, await r.admin.session())).toEqual(without(ORDER, "act"));
  });

  it("a caller may select any named toolset: a delegation that may newly sign nothing gets observer by default, and no act tool in any set it names; the room refuses its call", async () => {
    const r = await declaredRoom(doc());
    const idle = await bearer(r, "@idle", "agent", { kinds: [], acts: {} });
    const ACTS = ["claim", "propose", "note", "review", "land", "renew", "release", "act"];
    expect(await listed(r, idle.bearer)).toEqual(OBSERVER);
    expect(await listed(r, idle.bearer, "?toolset=all")).toEqual(without(ORDER, ...ACTS));
    expect(await listed(r, idle.bearer, "?toolset=builder")).toEqual(without(BUILDER, ...ACTS));
    expect(await listed(r, idle.bearer, "?toolset=reviewer")).toEqual(without(REVIEWER, ...ACTS));
    const seq = await headSeq(r);
    const before = await callerOf(r, idle.bearer);
    const claim = await tool(r, idle.bearer, "claim", { goal: "g", scope: ["src/**"] }, "?toolset=all");
    expect(claim.structuredContent).toMatchObject({ refused: true, rule: "delegation-invalid" });
    expect(await headSeq(r)).toBe(seq);
    expect(await callerOf(r, idle.bearer)).toEqual(before);
    // A member's bearer with a full map: builder by default, and all sixteen when it names `all`.
    const agent = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: await bindings(r, "claim", "propose", "note", "review", "land", "release", "ask") });
    expect(await listed(r, agent.bearer)).toEqual(BUILDER);
    expect(await listed(r, agent.bearer, "?toolset=all")).toEqual(ORDER);
  });


  it("a v1 room: an agent's builder list; ?toolset=reviewer; ?toolset=nope is bad-request; a delegation without land", async () => {
    const r = await makeRoom();
    const b = await legacyBearer(r, "@agent", ["claim", "propose", "note", "review", "land", "release", "renew"]);
    // No generic act under a `v1` document.
    expect(await listed(r, b.bearer)).toEqual(without(BUILDER, "act"));
    expect(await listed(r, b.bearer, "?toolset=reviewer")).toEqual(without(REVIEWER, "act"));
    expect(await listed(r, b.bearer, "?toolset=observer")).toEqual(OBSERVER);
    expect(await listed(r, b.bearer, "?toolset=all")).toEqual(without(ORDER, "act"));
    const seq = await headSeq(r);
    for (const query of ["?toolset=nope", "?toolset=", "?toolset=builder&toolset=all"]) {
      const bad = await rpc(r, b.bearer, "tools/list", {}, query);
      expect([query, bad.status]).toEqual([query, 400]);
      expect(bad.body.error.data).toMatchObject({ name: "ArtroomError", code: "bad-request" });
      const call = await rpc(r, b.bearer, "tools/call", { name: "claim", arguments: { goal: "g", scope: ["src/**"], idempotencyKey: "k" } }, query);
      expect(call.status).toBe(400);
    }
    expect(await headSeq(r)).toBe(seq);
    const noLand = await legacyBearer(r, "@careful", ["claim", "propose", "note", "release", "renew"]);
    expect(await listed(r, noLand.bearer)).toEqual(without(BUILDER, "act", "land"));
    // Every tool carries a title, an object-rooted output schema and annotations.
    for (const t of await tools(r, b.bearer, "?toolset=all")) {
      expect([t.name, typeof t.title, t.outputSchema.type, typeof t.annotations]).toEqual([t.name, "string", "object", "object"]);
    }
  });

  it("a v2 room: the builder and reviewer lists with the generic tools; an admin's own key reads the same descriptors over a session's caller", async () => {
    const r = await declaredRoom(doc());
    const agent = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: await bindings(r, "claim", "propose", "note", "review", "land", "release", "ask") });
    expect(await listed(r, agent.bearer)).toEqual(BUILDER);
    expect(await listed(r, agent.bearer, "?toolset=reviewer")).toEqual(REVIEWER);
    expect(await listed(r, agent.bearer, "?toolset=observer")).toEqual(OBSERVER);
    expect(await listed(r, agent.bearer, "?toolset=all")).toEqual(ORDER);
    const noLand = await bearer(r, "@careful", "agent", { kinds: ["renew"], acts: await bindings(r, "claim", "propose", "note", "release") });
    expect(await listed(r, noLand.bearer)).toEqual(without(BUILDER, "land"));
  });

  it("a checker's bearer: with one eligible declared check kind, the reviewer presentation; with none, observer; never review or claim", async () => {
    const r = await declaredRoom(doc());
    const withVerify = await bearer(r, "@ci", "checker", { kinds: [], acts: await bindings(r, "verify") });
    expect(await callerOf(r, withVerify.bearer)).toMatchObject({ role: "checker" });
    expect(await listed(r, withVerify.bearer)).toEqual(["attention", "explain", "lanes", "lane", "proposal", "acts", "act"]);
    const idle = await bearer(r, "@idle-ci", "checker", { kinds: [], acts: {} });
    expect(await listed(r, idle.bearer)).toEqual(OBSERVER);
    for (const query of ["", "?toolset=all", "?toolset=builder", "?toolset=reviewer"]) {
      const names = await listed(r, withVerify.bearer, query);
      expect(names).not.toContain("review");
      expect(names).not.toContain("claim");
    }
    // The presentation is not authority: the room refuses a checker's claim and review, and no lane opens.
    const seq = await headSeq(r);
    const claim = await tool(r, withVerify.bearer, "claim", { goal: "g", scope: ["src/**"] });
    expect(claim.structuredContent).toMatchObject({ refused: true });
    expect(["delegation-invalid", "role-forbids"]).toContain(claim.structuredContent.rule);
    const review = await tool(r, withVerify.bearer, "review", { lane: "act_1_00000000", generation: 1, head: "a".repeat(40), verdict: "approve", scope: ["src/**"], text: "x" });
    expect(review.structuredContent).toMatchObject({ refused: true });
    expect((await r.admin.read({ q: "lanes" })).items).toEqual([]);
    expect(await headSeq(r)).toBeGreaterThanOrEqual(seq);
  });

  it("the generic act: absent with only platform grants and with an all-stale map; present with a mixed map; the signed grants stay as signed", async () => {
    const r = await declaredRoom(doc());
    const platform = await bearer(r, "@p", "agent", { kinds: ["renew"], acts: {} });
    expect(await listed(r, platform.bearer)).toEqual(["workspace", "renew", "attention", "explain", "lane", "proposal", "operation", "acts"]);
    const onlyAsk = await bearer(r, "@a", "agent", { kinds: [], acts: await bindings(r, "ask") });
    const mixed = await bearer(r, "@m", "agent", { kinds: [], acts: await bindings(r, "ask", "note") });
    expect(await listed(r, onlyAsk.bearer)).toEqual(["workspace", "attention", "explain", "lane", "proposal", "operation", "acts", "act"]);
    const before = JSON.stringify((await roster(r)).delegations);
    // `ask` changes its meaning: the one map is all stale, the other still has a current `note`.
    await activate(r, doc((a) => void (a["ask"] = { ...ASK, body: { text: { type: "text", max: 50 } } })));
    expect(await listed(r, onlyAsk.bearer)).toEqual(OBSERVER);
    expect(await listed(r, onlyAsk.bearer, "?toolset=builder")).toEqual(["workspace", "attention", "explain", "lane", "proposal", "operation", "acts"]);
    expect(await listed(r, mixed.bearer)).toEqual(["workspace", "note", "attention", "explain", "lane", "proposal", "operation", "acts", "act"]);
    for (const b of [platform, onlyAsk, mixed]) for (const query of ["", "?toolset=all"]) await listed(r, b.bearer, query);
    // Discovery expanded no map and rebound no entry.
    expect(JSON.stringify((await roster(r)).delegations)).toBe(before);
  });

  it("discovery follows the role, the declaration's who and whether it may be delegated, as admission does", async () => {
    const r = await declaredRoom(doc());
    const b = await bearer(r, "@agent", "agent", { kinds: [], acts: await bindings(r, "ask") });
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expect(await listed(r, b.bearer)).toContain("act");
    // The declaration's `who` stops admitting agents. Its binding is unchanged, so the signed entry is still current.
    const binding = await bindingIn(r, "ask");
    await activate(r, doc((a) => void (a["ask"] = { ...ASK, who: { roles: ["member"] } })));
    expect(await bindingIn(r, "ask")).toBe(binding);
    expect(await listed(r, b.bearer)).toEqual(OBSERVER);
    // The member's role changes to one the declaration lists: the kind is eligible again.
    await r.admin.ok("roster", null, { op: "set-role", member: "@agent", role: "member" });
    expect(await listed(r, b.bearer)).toContain("act");
    // The declaration stops allowing delegation: a delegated caller loses it.
    await activate(r, doc((a) => void (a["ask"] = { ...ASK, who: { roles: ["member"], delegable: false } })));
    expect(await bindingIn(r, "ask")).toBe(binding);
    expect(await listed(r, b.bearer)).toEqual(OBSERVER);
    // And admission agrees with what discovery said: a new call of the kind is refused.
    const refused = await tool(r, b.bearer, "act", { kind: "ask", target: { act: c.id }, body: { text: "x" }, binding: binding! });
    expect(refused.structuredContent).toMatchObject({ refused: true, rule: "delegation-invalid" });
  });

  it("the list is the same before and after calls, in the same order each time", async () => {
    const r = await declaredRoom(doc());
    const b = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: await bindings(r, "claim", "note", "ask") });
    const before = await tools(r, b.bearer);
    const claim = (await tool(r, b.bearer, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    await tool(r, b.bearer, "note", { anchor: { act: claim.id }, text: "started" });
    await tool(r, b.bearer, "act", { kind: "ask", target: { act: claim.id }, body: { text: "why?" }, binding: (await bindingIn(r, "ask"))! });
    await tool(r, b.bearer, "attention", {});
    expect(await tools(r, b.bearer)).toEqual(before);
    expect(await tools(r, b.bearer)).toEqual(before);
    expect(before.find((t) => t.name === "act")!.annotations).toEqual({ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false });
    expect(before.find((t) => t.name === "acts")!.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  });
});

describe.skipIf(DECLARED)("a call the list does not show is still the room's to judge (R-API-14)", () => {
  it("an agent on ?toolset=observer calls claim: the claim is judged and recorded as usual", async () => {
    const r = await makeRoom();
    const b = await legacyBearer(r, "@agent", ["claim", "propose", "note", "land", "release", "renew"]);
    expect(await listed(r, b.bearer, "?toolset=observer")).not.toContain("claim");
    const seq = await headSeq(r);
    const claim = await tool(r, b.bearer, "claim", { goal: "g", scope: ["src/**"] }, "?toolset=observer");
    expect(claim.isError).toBe(false);
    expect(claim.structuredContent).toMatchObject({ kind: "claim", by: { via: "delegation", member: "@agent", delegation: b.delegation }, lease: { generation: 1 } });
    expect(await headSeq(r)).toBeGreaterThan(seq);
    expect((await r.admin.read({ q: "lanes" })).items.map((l) => l.lane)).toEqual([claim.structuredContent.lane]);
  });

  it("an exact retry of an accepted act returns its receipt after its kind stops being listed; a new call is refused and no binding is substituted", async () => {
    const r = await declaredRoom(doc());
    const binding = (await bindingIn(r, "ask"))!;
    const b = await bearer(r, "@agent", "agent", { kinds: [], acts: { ask: binding } });
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const args = { kind: "ask", target: { act: c.id }, body: { text: "why?" }, binding, idempotencyKey: "ask-1" };
    const accepted = await tool(r, b.bearer, "act", args);
    expect(accepted.structuredContent).toMatchObject({ kind: "ask", by: { via: "delegation", delegation: b.delegation } });
    await activate(r, doc((a) => void (a["ask"] = { ...ASK, body: { text: { type: "text", max: 50 } } })));
    expect(await listed(r, b.bearer)).toEqual(OBSERVER);
    expect(await listed(r, b.bearer, "?toolset=all")).not.toContain("act");
    const seq = await headSeq(r);
    const retried = await tool(r, b.bearer, "act", args);
    expect(retried.isError).toBe(false);
    expect(retried.structuredContent).toEqual(accepted.structuredContent);
    expect(await headSeq(r)).toBe(seq);
    // A new call is refused: with the binding the agent read it is stale, and the room does not put the active one in its place.
    const fresh = await tool(r, b.bearer, "act", { ...args, idempotencyKey: "ask-2" });
    expect(fresh.structuredContent).toMatchObject({ refused: true, rule: "binding-stale", current: { binding: await bindingIn(r, "ask") } });
    expect(await headSeq(r)).toBe(seq);
  });
});

describe.skipIf(DECLARED)("every act tool requires idempotencyKey; a retry gives one effect and the original result (R-API-9, R-CRED-10)", () => {
  it("claim with no key is bad-request and nothing is recorded; with a key, the same call again returns the first record", async () => {
    const r = await makeRoom();
    const b = await legacyBearer(r, "@agent", ["claim", "propose", "note", "land", "release", "renew"]);
    const seq = await headSeq(r);
    const keyless = (await rpc(r, b.bearer, "tools/call", { name: "claim", arguments: { goal: "g", scope: ["src/**"] } })).body.result;
    expect(keyless.isError).toBe(true);
    expect(keyless.structuredContent).toMatchObject({ name: "ArtroomError", code: "bad-request" });
    expect(keyless.structuredContent.message).toContain("Add any unique string as idempotencyKey, and reuse the same one to retry this call.");
    expect(await headSeq(r)).toBe(seq);
    expect((await r.admin.read({ q: "lanes" })).items).toEqual([]);

    // The first reply is lost: the caller never reads it. The same call again is the same claim.
    const args = { goal: "g", scope: ["src/**"], idempotencyKey: "claim-once" };
    await rpc(r, b.bearer, "tools/call", { name: "claim", arguments: args });
    const after = await headSeq(r);
    const retried = await tool(r, b.bearer, "claim", args);
    expect(retried.structuredContent).toMatchObject({ kind: "claim", seq: after });
    expect(await headSeq(r)).toBe(after);
    expect((await r.admin.read({ q: "lanes" })).items).toHaveLength(1);
    // Every other act tool refuses a missing key the same way, before the room records anything.
    const lane = retried.structuredContent.lane;
    for (const [name, input] of [
      ["propose", { lane, lease: 1, head: "a".repeat(40), expectedGeneration: 0, summary: "s" }],
      ["note", { anchor: { act: lane }, text: "x" }],
      ["review", { lane, generation: 1, head: "a".repeat(40), verdict: "approve", scope: ["src/**"], text: "x" }],
      ["land", { lane, lease: 1, generation: 1, head: "a".repeat(40) }],
      ["renew", { lane, lease: 1 }],
      ["release", { lane, lease: 1 }],
      ["act", { kind: "ask", target: null, body: {}, binding: `sha256:${"0".repeat(64)}` }],
    ] as const) {
      const out = (await rpc(r, b.bearer, "tools/call", { name, arguments: input })).body.result;
      expect([name, out.isError, out.structuredContent.code]).toEqual([name, true, "bad-request"]);
    }
    expect(await headSeq(r)).toBe(after);
  });

  it("the generic act and a landing: the same key again gives the original record and no second effect; after revocation the retry is unauthenticated", async () => {
    const r = await declaredRoom(doc());
    const b = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: await bindings(r, "claim", "propose", "land", "ask") });
    const claim = (await tool(r, b.bearer, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    const ask = { kind: "ask", target: { act: claim.id }, body: { text: "why?" }, binding: (await bindingIn(r, "ask"))!, idempotencyKey: "ask-once" };
    const first = (await tool(r, b.bearer, "act", ask)).structuredContent as DeclaredRecord;
    const seq = await headSeq(r);
    expect((await tool(r, b.bearer, "act", ask)).structuredContent).toEqual(first);
    expect(await headSeq(r)).toBe(seq);

    const head = pushChange(r, claim.lane, { "src/app.ts": "export const app = 2;\n" });
    const p = (await tool(r, b.bearer, "propose", { lane: claim.lane, lease: 1, head, expectedGeneration: 0, summary: "s" })).structuredContent as Proposal;
    const land = { lane: claim.lane, lease: 1, generation: p.generation, head, idempotencyKey: "land-once" };
    const landing = (await tool(r, b.bearer, "land", land)).structuredContent as Landing;
    expect(landing).toMatchObject({ kind: "land" });
    const landed = await headSeq(r);
    const again = (await tool(r, b.bearer, "land", land)).structuredContent as Landing;
    expect(again.id).toBe(landing.id);
    expect(again.op.id).toBe(landing.op.id);
    expect(await headSeq(r)).toBe(landed);

    // R-CRED-10 stands: once the session's key is revoked there is no envelope to replay.
    await r.admin.ok("roster", null, { op: "revoke-key", key: b.key, reason: "retired" });
    const revoked = await rpc(r, b.bearer, "tools/call", { name: "act", arguments: ask });
    expect(revoked.status).toBe(401);
  });
});

describe.skipIf(DECLARED)("lanes, lane, proposal and operation over the endpoint (R-API-9), and a refusal that conforms (R-API-13)", () => {
  it("the four reads answer from the room; unknown IDs are structured not-found results; a propose refused outside-claim fits the advertised schema", async () => {
    const r = await makeRoom();
    const b = await legacyBearer(r, "@agent", ["claim", "propose", "note", "land", "release", "renew"]);
    const api = await claimTwo(r, b);
    const schemas = Object.fromEntries((await tools(r, b.bearer, "?toolset=all")).map((t) => [t.name, t.outputSchema]));

    const all = await tool(r, b.bearer, "lanes", {});
    expect(all.structuredContent.items.map((l: { lane: string }) => l.lane).sort()).toEqual([api.src.lane, api.docs.lane].sort());
    const touching = await tool(r, b.bearer, "lanes", { touches: "src/api/login.ts" });
    expect(touching.structuredContent.items.map((l: { lane: string }) => l.lane)).toEqual([api.src.lane]);
    expect(validate(schemas["lanes"], touching.structuredContent)).toEqual([]);

    const lane = await tool(r, b.bearer, "lane", { lane: api.src.lane });
    expect(lane.structuredContent).toMatchObject({ lane: api.src.lane, state: "held", lease: { holder: "@agent", generation: 1 } });
    expect(validate(schemas["lane"], lane.structuredContent)).toEqual([]);
    const noLane = await tool(r, b.bearer, "lane", { lane: "act_999_00000000" });
    expect(noLane.isError).toBe(false);
    expect(noLane.structuredContent).toEqual({ outcome: "not-found", what: "lane" });
    expect(validate(schemas["lane"], noLane.structuredContent)).toEqual([]);

    // A change outside the claimed paths: refused, and the refusal is structured content the schema accepts.
    const outside = pushChange(r, api.src.lane, { "lib/other.ts": "export const x = 1;\n" });
    const refused = await tool(r, b.bearer, "propose", { lane: api.src.lane, lease: 1, head: outside, expectedGeneration: 0, summary: "s" });
    expect(refused.isError).toBe(false);
    expect(refused.structuredContent).toMatchObject({ refused: true, rule: "outside-claim" });
    expect(validate(schemas["propose"], refused.structuredContent)).toEqual([]);
    expect(refused.content[0]!.text.split("\n")[0]).toMatch(/^Refused \(outside-claim\): .+ Fix: .+/);

    const head = pushChange(r, api.src.lane, { "src/api/login.ts": "export const login = 2;\n" });
    const p = (await tool(r, b.bearer, "propose", { lane: api.src.lane, lease: 1, head, expectedGeneration: 0, summary: "s" })).structuredContent as Proposal;
    expect(validate(schemas["propose"], p)).toEqual([]);
    const proposal = await tool(r, b.bearer, "proposal", { lane: api.src.lane, generation: 1 });
    expect(proposal.structuredContent).toMatchObject({ id: p.id, head, generation: 1 });
    expect(validate(schemas["proposal"], proposal.structuredContent)).toEqual([]);
    const noProposal = await tool(r, b.bearer, "proposal", { lane: api.src.lane, generation: 7 });
    expect(noProposal.structuredContent).toEqual({ outcome: "not-found", what: "proposal" });

    const op = await tool(r, b.bearer, "operation", { id: p.preview.id, kind: "preview" });
    expect(op.structuredContent).toMatchObject({ id: p.preview.id, kind: "preview" });
    expect(validate(schemas["operation"], op.structuredContent)).toEqual([]);
    const noOp = await tool(r, b.bearer, "operation", { id: "op_land_999999", kind: "land" });
    expect(noOp.isError).toBe(false);
    expect(noOp.structuredContent).toEqual({ outcome: "not-found", what: "operation" });
    expect(validate(schemas["operation"], noOp.structuredContent)).toEqual([]);
  });
});

async function claimTwo(r: TestRoom, b: Redeemed): Promise<{ src: Claim; docs: Claim }> {
  const src = (await tool(r, b.bearer, "claim", { goal: "api", scope: ["src/api/**"] })).structuredContent as Claim;
  const docs = (await tool(r, b.bearer, "claim", { goal: "docs", scope: ["docs/**"] })).structuredContent as Claim;
  return { src, docs };
}

describe.skipIf(DECLARED)("waiting is a bounded read that holds nothing in the room (R-API-15)", () => {
  it("a waitMs over 45,000 is bad-request on attention, workspace, land and operation, and nothing is recorded", async () => {
    const r = await makeRoom();
    const b = await legacyBearer(r, "@agent", ["claim", "propose", "note", "land", "release", "renew"]);
    const claim = (await tool(r, b.bearer, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    const seq = await headSeq(r);
    for (const [name, input] of [
      ["attention", {}],
      ["workspace", { lane: claim.lane, lease: 1 }],
      ["land", { lane: claim.lane, lease: 1, generation: 1, head: "a".repeat(40), idempotencyKey: "l1" }],
      ["operation", { id: "op_land_1", kind: "land" }],
    ] as const) {
      for (const waitMs of [60_000, 45_001, -1, 2.5]) {
        const out = await tool(r, b.bearer, name, { ...input, waitMs });
        expect([name, waitMs, out.isError, out.structuredContent.code]).toEqual([name, waitMs, true, "bad-request"]);
      }
    }
    expect(await headSeq(r)).toBe(seq);
  });

  it("operation on a landing in progress with a short wait returns its current state and no error; the wait leaves the log and the lease as they were", async () => {
    const r = await makeRoom();
    const b = await legacyBearer(r, "@agent", ["claim", "propose", "note", "land", "release", "renew"]);
    const claim = (await tool(r, b.bearer, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    const head = pushChange(r, claim.lane, { "src/app.ts": "export const app = 2;\n" });
    const p = (await tool(r, b.bearer, "propose", { lane: claim.lane, lease: 1, head, expectedGeneration: 0, summary: "s" })).structuredContent as Proposal;
    const landing = (await tool(r, b.bearer, "land", { lane: claim.lane, lease: 1, generation: p.generation, head })).structuredContent as Landing;
    const seq = await headSeq(r);
    const row = JSON.stringify(await laneRowOf(r, claim.lane));
    const started = Date.now();
    const out = await tool(r, b.bearer, "operation", { id: landing.op.id, kind: "land", waitMs: 300 });
    expect(out.isError).toBe(false);
    expect(out.structuredContent).toMatchObject({ id: landing.op.id, kind: "land" });
    expect(["accepted", "preparing", "ready", "publishing"]).toContain(out.structuredContent.state);
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(await headSeq(r)).toBe(seq);
    expect(JSON.stringify(await laneRowOf(r, claim.lane))).toBe(row);
    // A state it is already in ends the wait at once.
    const at = await tool(r, b.bearer, "operation", { id: landing.op.id, kind: "land", until: [out.structuredContent.state], waitMs: 45_000 });
    expect(at.structuredContent.state).toBe(out.structuredContent.state);
    // The landing then finishes, and a wait for a finished state returns it.
    await tick(r, 3);
    const done = await tool(r, b.bearer, "operation", { id: landing.op.id, kind: "land", waitMs: 1000 });
    expect(done.structuredContent.state).toBe("landed");
  });

  it("attention with waitMs and an empty page: a note for the caller ends the wait with the note's item; with none, the empty page at waitMs", async () => {
    const r = await makeRoom();
    const b = await legacyBearer(r, "@agent", ["claim", "propose", "note", "land", "release", "renew"]);
    const bob = await addMember(r, "@bob", "member");
    const claim = (await tool(r, b.bearer, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    let cursor = (await tool(r, b.bearer, "attention", {})).structuredContent.cursor;
    // Read to the end of what is there now, so the next page is empty.
    for (;;) {
      const page = (await tool(r, b.bearer, "attention", { cursor })).structuredContent;
      cursor = page.cursor;
      if (page.items.length === 0) break;
    }
    const seq = await headSeq(r);
    const row = JSON.stringify(await laneRowOf(r, claim.lane));
    const started = Date.now();
    const empty = await tool(r, b.bearer, "attention", { cursor, waitMs: 300 });
    expect(empty.isError).toBe(false);
    expect(empty.structuredContent).toMatchObject({ items: [], cursor: expect.any(String) });
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(await headSeq(r)).toBe(seq);
    expect(JSON.stringify(await laneRowOf(r, claim.lane))).toBe(row);

    const waiting = tool(r, b.bearer, "attention", { cursor, waitMs: 30_000 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const note = await bob.ok("note", { act: claim.id }, { text: "A question about your lane." });
    const page = (await waiting).structuredContent;
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(page.items.map((i: { why: string }) => i.why)).toContain("note");
    expect(JSON.stringify(page.items)).toContain(note.id);
    // Only Bob's note was recorded while the agent waited.
    expect(await headSeq(r)).toBe(seq + 1);
  });
});

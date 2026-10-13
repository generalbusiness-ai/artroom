/**
 * The hosted MCP endpoint on real scopes (notes/2026-10-13-hosted-mcp-endpoint.md, section 6): the registry and the agent
 * objects of the test Worker (`packages/scope/test/worker.ts`, over the namespace PLATFORM), reached through the Worker's own
 * routes (`mcpRoute`), with the pinned MCP client where a client is named. rita founds the room through her own MCP service
 * and performs the admin's acts; the agent is created by a control request she signs.
 */
import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import type { ControlRequest, FactRef, KeyId, MemberId, ScopeRef } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, digestBytes, keyIdOfSecret, newIncarnation, signControl, textDigest, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { encodeAgentKeyInvitation, type AgentKeyInvitation } from "@generalbusiness/artroom-client";
import { firstExtents } from "@generalbusiness/dap-platform";
import { DEMO_DIGESTS, changeDemo, issueDemo } from "@generalbusiness/dap-lanes";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { mcpRoute } from "../../scope/src/worker.ts";
import { hostedTest } from "../../scope/test/worker.ts";
import { MODERN, MODERN_RESULT_EXTRA } from "../src/index.ts";
import { INVITATION_LINK } from "@generalbusiness/artroom-client";
import { mcpRoom, SERVICE, type Agent, type Room } from "./support/room.ts";
import { founded } from "./support/story.ts";

/** The Worker's routes, as a client's fetch: every request of the story goes through `mcpRoute`, in this isolate. */
const routed = (url: string | URL, init?: RequestInit): Promise<Response> => mcpRoute(new Request(url, init), env).then((r) => r ?? new Response(null, { status: 404 }));
const fetchLike = ((url: string | URL | Request, init?: RequestInit) => routed(url instanceof Request ? url.url : url, init)) as unknown as typeof fetch;

/** Every item of a scope, across inspect's pages. */
async function allItems(agent: Agent, scope: string): Promise<{ id: number; type: string; state: string; revision: number; values: Record<string, unknown> }[]> {
  const out: { id: number; type: string; state: string; revision: number; values: Record<string, unknown> }[] = [];
  for (let cursor: unknown = undefined, n = 0; n < 64; n++) {
    const page = await agent.ok("inspect", { scope, ...(cursor !== undefined ? { cursor } : {}) });
    out.push(...(page["items"] as typeof out));
    if (page["cursor"] === undefined) break;
    cursor = page["cursor"];
  }
  return out;
}

/** An admin's two acts, and the agent-key invitation they make, as `dap invite --kind agent-key` would encode it. */
async function invite(room: Room, rita: Agent, handle: string): Promise<{ link: string; invitation: AgentKeyInvitation; secret: string }> {
  const M = rita.config.repository!.membership;
  const added = await rita.ok("member.add", { fields: { handle, kind: "agent", controller: "@rita" }, idempotencyKey: `add-${handle}` });
  expect(added["answer"], JSON.stringify(added)).toBe("accepted");
  const member = added["fact"] as FactRef;
  const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const invited = await rita.ok("key.invite", { fields: { member: member.seq, kind: "agent", inviteHash: textDigest(secret), inviteEnds: timeOf(room.now() + 3_600_000) }, idempotencyKey: `invite-${handle}` });
  expect(invited["answer"], JSON.stringify(invited)).toBe("accepted");
  const items = await allItems(rita, "membership");
  const roster = items.find((i) => i.type === "roster")!;
  const memberItem = items.find((i) => i.type === "member" && i.values["handle"] === handle)!;
  const { inbox: _inbox, ...repository } = rita.config.repository!;
  const invitation: AgentKeyInvitation = {
    v: 1, kind: "agent-key", service: SERVICE, repository, definition: "platform:membership@2", handle, controller: { membership: M, member: "@rita" as MemberId },
    member, invitation: invited["fact"] as FactRef, secret, expected: { on: roster.revision, member: memberItem.revision },
  };
  return { link: encodeAgentKeyInvitation(invitation), invitation, secret };
}

/** A control request signed by `signer`'s secret, as the `Authorization` header carries it, over `body`. */
function control(room: Room, secret: Uint8Array, action: ControlRequest["action"], membership: ScopeRef, agent: string | null, body: string, op: string, overrides: Partial<ControlRequest> = {}): string {
  const request: ControlRequest = { v: 1, action, service: SERVICE, membership, agent, actor: keyIdOfSecret(secret), body: digestBytes(utf8(body)), op, notAfter: timeOf(room.now() + 60_000), ...overrides };
  const signed = signControl(request, secret);
  return `Control ${b64url(utf8(canonicalize(request)))}.${signed.sig}`;
}
const post = (path: string, authorization: string, body: string, method = "POST") => routed(`${SERVICE}${path}`, { method, headers: { authorization, "content-type": "application/json" }, body });

test("H1, the whole recipe: add-member, invite-key, create, enrol, then the pinned client in both revisions acts as the agent", async () => {
  const room = mcpRoom();
  hostedTest.now = () => room.now();
  hostedTest.pause = (waiting) => room.pause(waiting);
  try {
    const rita = room.agent("rita");
    await founded(room, rita, "default");
    const M = rita.config.repository!.membership;
    // The rules published and the issue definition activated, as the room story does, so an agent may open issues.
    expect((await rita.ok("rules.publish", { on: 0, fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }) }, idempotencyKey: "publish" }))["answer"]).toBe("accepted");
    expect((await rita.ok("rules.activate", { fields: { digest: DEMO_DIGESTS.issue, name: "issue" }, values: [canonicalize(issueDemo)], idempotencyKey: "activate-issue" }))["answer"]).toBe("accepted");
    const { link, invitation } = await invite(room, rita, "@bot");
    const body = JSON.stringify({ link });
    // The controller's create: the registry reserves, the agent object enrols its own key, and the bearer is shown once.
    const created = await room.wait(() => post("/mcp/agents", control(room, rita.secret, "create", M, null, body, "create-1"), body));
    const answer = await created.json() as { agent: string; key: KeyId; handle: string; bearer: string; member: FactRef };
    expect([created.status, answer.handle], JSON.stringify(answer)).toEqual([201, "@bot"]);
    expect(answer.bearer.startsWith(`${answer.agent}.`)).toBe(true);
    // The same op answers the same, including the bearer; another body under the same op is refused.
    const again = await room.wait(() => post("/mcp/agents", control(room, rita.secret, "create", M, null, body, "create-1"), body));
    expect([again.status, (await again.json() as { bearer: string }).bearer]).toEqual([201, answer.bearer]);
    const other = JSON.stringify({ link: (await invite(room, rita, "@bot2")).link });
    expect((await room.wait(() => post("/mcp/agents", control(room, rita.secret, "create", M, null, other, "create-1"), other))).status, "another request under the same op").toBe(409);
    // The key reads back active for @bot, enrolled by the entry the answer names.
    const keys = await allItems(rita, "membership");
    expect(keys.some((i) => i.type === "key" && i.state === "active" && i.values["id"] === answer.key), "the agent's key is active").toBe(true);
    // The pinned client, 2025-11-25: lists the tools of an agent, acts, and the entry names the agent's key as its actor.
    for (const pin of ["legacy", "modern"] as const) {
      const c = new Client({ name: "hosted-test", version: "1" }, pin === "modern" ? { versionNegotiation: { mode: { pin: MODERN } } } : {});
      const transport = new StreamableHTTPClientTransport(new URL(`${SERVICE}/mcp`), { requestInit: { headers: { authorization: `Bearer ${answer.bearer}` } }, fetch: fetchLike } as never);
      await room.wait(() => c.connect(transport));
      const tools = await room.wait(() => c.listTools());
      const names = tools.tools.map((t) => t.name);
      expect(names, pin).toContain("room");
      expect(names, pin).toContain("issue.create");
      const opened = await room.wait(() => c.callTool({ name: "issue.create", arguments: { fields: { definition: DEMO_DIGESTS.issue, title: `Opened by @bot over ${pin}`, conditions: ["done"] }, ...(pin === "legacy" ? { values: [canonicalize(issueDemo)] } : {}), idempotencyKey: `issue-${pin}` } }));
      const content = opened.structuredContent as { answer: string; fact: FactRef };
      expect(content.answer, JSON.stringify(opened.structuredContent)).toBe("accepted");
      const seen = await room.wait(() => c.callTool({ name: "wait", arguments: { scope: "directory", entry: content.fact.seq } }));
      expect((seen.structuredContent as { timedOut: boolean }).timedOut).toBe(false);
      await c.close();
    }
    // The agent's own entries name its key: rita reads the directory's history for the opened issues.
    const steps = (await rita.ok("steps", { scope: "directory" }))["steps"] as { kind: string | null; signer: string | null }[];
    expect(steps.filter((e) => e.kind === "open-issue" && e.signer === answer.key).length, "two issues signed by the agent's key").toBe(2);
    // The secret of the invitation appears in no hosted row but the retained envelope: the agent object's tables hold no copy.
    const registry = env.REGISTRIES.get(env.REGISTRIES.idFromName(M.scope)) as unknown as { agents(): Promise<{ agent: string; handle: string; state: string }[]> };
    expect(await registry.agents()).toEqual([{ agent: answer.agent, handle: "@bot", key: answer.key, state: "enrolled" }]);
    void invitation;
  } finally { hostedTest.now = null; hostedTest.pause = null; room.done(); }
});

/** A room founded by rita with the issue definition active, and one agent created under `op`; the agent's answer. */
async function hosted(room: Room, rita: Agent, handle: string, op: string, signer: Uint8Array = rita.secret): Promise<{ agent: string; key: KeyId; bearer: string; link: string }> {
  const M = rita.config.repository!.membership;
  const { link } = await invite(room, rita, handle);
  const body = JSON.stringify({ link });
  const created = await room.wait(() => post("/mcp/agents", control(room, signer, "create", M, null, body, op), body));
  const answer = await created.json() as { agent: string; key: KeyId; bearer: string };
  expect(created.status, JSON.stringify(answer)).toBe(201);
  return { ...answer, link };
}
async function roomWithIssues(): Promise<{ room: Room; rita: Agent }> {
  const room = mcpRoom();
  hostedTest.now = () => room.now();
  hostedTest.pause = (waiting) => room.pause(waiting);
  const rita = room.agent("rita");
  await founded(room, rita, "default");
  expect((await rita.ok("rules.publish", { on: 0, fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }) }, idempotencyKey: "publish" }))["answer"]).toBe("accepted");
  expect((await rita.ok("rules.activate", { fields: { digest: DEMO_DIGESTS.issue, name: "issue" }, values: [canonicalize(issueDemo)], idempotencyKey: "activate-issue" }))["answer"]).toBe("accepted");
  return { room, rita };
}
const done = (room: Room) => { hostedTest.now = null; hostedTest.pause = null; hostedTest.lose = null; room.done(); };
/** A raw request to the agent's endpoint with a bearer. */
const mcp = async (bearer: string, method: string, headers: Record<string, string>, body?: unknown): Promise<Response> => {
  const response = await routed(`${SERVICE}/mcp`, { method, headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  // A stream a case opens only to see its status is cancelled here, so no body outlives its test.
  if (method === "GET" && response.status === 200 && response.headers.get("content-type")?.startsWith("text/event-stream") && !headers["x-keep-open"]) await response.body?.cancel();
  return response;
};
const META = { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientCapabilities": {} };
const modernCall = (bearer: string, name: string, args: Record<string, unknown>, id = 1) =>
  mcp(bearer, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/call", "mcp-name": name }, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args, _meta: META } });
const LEGACY = "2025-11-25";
/** A legacy session: initialized, listed once; its ID and the listed generation. */
async function legacySession(bearer: string): Promise<string> {
  const opened = await mcp(bearer, "POST", { "mcp-protocol-version": LEGACY }, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "h", version: "0" } } });
  expect(opened.status).toBe(200);
  const id = opened.headers.get("mcp-session-id")!;
  expect((await mcp(bearer, "POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": id }, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
  return id;
}
/** A session's GET stream, read in the background: its events so far, and a way to stop reading. */
function stream(bearer: string, session: string): { text: () => string; stop: () => void; ended: Promise<number> } {
  const abort = new AbortController();
  const seen: string[] = [];
  const ended = routed(`${SERVICE}/mcp`, { method: "GET", signal: abort.signal, headers: { authorization: `Bearer ${bearer}`, "mcp-protocol-version": LEGACY, "mcp-session-id": session } })
    .then(async (res) => { if (res.status !== 200 || !res.body) return res.status; const reader = res.body.getReader(); try { for (;;) { const r = await reader.read(); if (r.done) break; seen.push(new TextDecoder().decode(r.value)); } } catch { /* aborted */ } return res.status; }).catch(() => -1);
  return { text: () => seen.join(""), stop: () => abort.abort(), ended };
}
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const agentStub = (id: string) => env.AGENTS.get(env.AGENTS.idFromString(id)) as unknown as { reset(): Promise<void>; tick(): Promise<boolean>; counts(): Promise<{ streams: number; sessions: number }> };

test("H2, H3 and H4: agents kept apart, control authority, the bearer and revocation", async () => {
  const { room, rita } = await roomWithIssues();
  try {
    const M = rita.config.repository!.membership;
    const bot = await hosted(room, rita, "@bot", "create-bot");
    // paul joins as a plain member through his own server, with an invitation from rita.
    const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const invited = await rita.ok("member.invite", { fields: { handle: "@paul", role: "member", inviteHash: textDigest(secret), inviteEnds: timeOf(room.now() + 3_600_000) }, idempotencyKey: "invite-paul" });
    const link = `${INVITATION_LINK}${b64url(utf8(JSON.stringify({ v: 1, service: SERVICE, repository: (({ inbox: _inbox, ...shared }) => shared)(rita.config.repository!), invitation: (invited["fact"] as FactRef).seq, secret, handle: "@paul", definition: "platform:membership@2" })))}`;
    const paul = room.agent("paul", { config: { service: "" } });
    expect((await paul.ok("join", { link, idempotencyKey: "join" }))["answer"]).toBe("accepted");
    await rita.ok("wait", { scope: "membership", entry: ((await paul.ok("wait", { scope: "inbox", entry: 0 })) ["timedOut"] === false ? 0 : 0) });
    // H3: a member who is neither admin nor controller is refused create, bearer and retire; the controller and an admin succeed.
    const { link: link2 } = await invite(room, rita, "@bot2");
    const body2 = JSON.stringify({ link: link2 });
    expect((await room.wait(() => post("/mcp/agents", control(room, paul.secret, "create", M, null, body2, "paul-create"), body2))).status, "paul creates").toBe(403);
    expect((await room.wait(() => post(`/mcp/agents/${bot.agent}/bearer`, control(room, paul.secret, "bearer", M, bot.agent, "", "paul-bearer"), ""))).status, "paul re-issues").toBe(403);
    expect((await room.wait(() => post(`/mcp/agents/${bot.agent}`, control(room, paul.secret, "retire", M, bot.agent, "", "paul-retire"), "", "DELETE"))).status, "paul retires").toBe(403);
    // @bot3 is controlled by paul: paul's create and bearer succeed as the controller, his retire of @bot (not his) does not.
    const added = await rita.ok("member.add", { fields: { handle: "@bot3", kind: "agent", controller: "@paul" }, idempotencyKey: "add-bot3" });
    const s3 = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const inv3 = await rita.ok("key.invite", { fields: { member: (added["fact"] as FactRef).seq, kind: "agent", inviteHash: textDigest(s3), inviteEnds: timeOf(room.now() + 3_600_000) }, idempotencyKey: "invite-bot3" });
    const items = await allItems(rita, "membership");
    const { inbox: _i, ...repository } = rita.config.repository!;
    const link3 = encodeAgentKeyInvitation({ v: 1, kind: "agent-key", service: SERVICE, repository, definition: "platform:membership@2", handle: "@bot3", controller: { membership: M, member: "@paul" as MemberId }, member: added["fact"] as FactRef, invitation: inv3["fact"] as FactRef, secret: s3, expected: { on: items.find((i) => i.type === "roster")!.revision, member: items.find((i) => i.type === "member" && i.values["handle"] === "@bot3")!.revision } });
    const body3 = JSON.stringify({ link: link3 });
    const bot3 = await (await room.wait(() => post("/mcp/agents", control(room, paul.secret, "create", M, null, body3, "paul-create-3"), body3))).json() as { agent: string; bearer: string; key: KeyId };
    expect(bot3.agent, JSON.stringify(bot3)).toMatch(/^[0-9a-f]{64}$/);
    const rotated = await room.wait(() => post(`/mcp/agents/${bot3.agent}/bearer`, control(room, paul.secret, "bearer", M, bot3.agent, "", "paul-bearer-3"), ""));
    expect([rotated.status, (await rotated.json() as { by: string }).by], "the controller re-issues").toEqual([200, "controller"]);
    const byAdmin = await room.wait(() => post(`/mcp/agents/${bot3.agent}/bearer`, control(room, rita.secret, "bearer", M, bot3.agent, "", "rita-bearer-3"), ""));
    const adminAnswer = await byAdmin.json() as { by: string; bearer: string };
    expect([byAdmin.status, adminAnswer.by], "an admin re-issues").toEqual([200, "admin"]);
    // Binding refusals: another incarnation, another action than the route, another agent than the path, a differing body, an expired deadline.
    const otherInc = { ...M, inc: newIncarnation(new Uint8Array(16).fill(7)) };
    expect((await room.wait(() => post(`/mcp/agents/${bot3.agent}/bearer`, control(room, rita.secret, "bearer", otherInc, bot3.agent, "", "inc"), ""))).status, "another incarnation").toBe(403);
    expect((await room.wait(() => post(`/mcp/agents/${bot3.agent}/bearer`, control(room, rita.secret, "retire", M, bot3.agent, "", "action"), ""))).status, "another action").toBe(400);
    expect((await room.wait(() => post(`/mcp/agents/${bot3.agent}/bearer`, control(room, rita.secret, "bearer", M, bot.agent, "", "agent"), ""))).status, "another agent").toBe(400);
    expect((await room.wait(() => post(`/mcp/agents/${bot3.agent}/bearer`, control(room, rita.secret, "bearer", M, bot3.agent, "x", "body"), ""))).status, "a differing body").toBe(400);
    expect((await room.wait(() => post(`/mcp/agents/${bot3.agent}/bearer`, control(room, rita.secret, "bearer", M, bot3.agent, "", "late", { notAfter: timeOf(room.now() - 1000) }), ""))).status, "an expired deadline").toBe(400);
    // A repeated op with the same digest answers the same; with a different digest it is refused.
    const same = await room.wait(() => post(`/mcp/agents/${bot3.agent}/bearer`, control(room, rita.secret, "bearer", M, bot3.agent, "", "rita-bearer-3"), ""));
    expect([same.status, (await same.json() as { bearer: string }).bearer], "the same op answers the same, bearer included").toEqual([200, adminAnswer.bearer]);
    expect((await room.wait(() => post(`/mcp/agents/${bot3.agent}/bearer`, control(room, rita.secret, "bearer", M, bot3.agent, "{}", "rita-bearer-3"), "{}"))).status, "the same op, another digest").toBe(409);
    // H2: two agents in one repository: the same idempotency key in both makes two records; one's session is unknown to the other.
    const first = await room.wait(() => modernCall(bot.bearer, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "by bot", conditions: ["done"] }, values: [canonicalize(issueDemo)], idempotencyKey: "same" }));
    const bot3Rotated = adminAnswer.bearer;
    const second = await room.wait(() => modernCall(bot3Rotated, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "by bot3", conditions: ["done"] }, idempotencyKey: "same" }));
    const factOf = async (r: Response) => ((await r.json() as { result: { structuredContent: { answer: string; fact: FactRef } } }).result.structuredContent);
    const [f1, f2] = [await factOf(first), await factOf(second)];
    expect([f1.answer, f2.answer]).toEqual(["accepted", "accepted"]);
    expect(f1.fact.seq).not.toBe(f2.fact.seq);
    const botSession = await legacySession(bot.bearer);
    expect((await mcp(bot3Rotated, "POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": botSession }, { jsonrpc: "2.0", id: 2, method: "tools/list" })).status, "another agent's session").toBe(404);
    // H4: the bearer. Missing, malformed, wrong and retired each answer 401 with no body; eleven failures from one address, 429.
    for (const [why, authorization] of [["missing", ""], ["malformed", "Bearer nonsense"], ["wrong id", `Bearer ${"0".repeat(64)}.x`], ["wrong secret", `Bearer ${bot.agent}.nope`]] as const) {
      const r = await routed(`${SERVICE}/mcp`, { method: "POST", headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json", "cf-connecting-ip": "10.0.0.1" }, body: "{}" });
      expect([r.status, await r.text()], why).toEqual([401, ""]);
    }
    // The failures an agent counts are those that name it: eleven wrong secrets from one address, then that address is refused.
    for (let n = 0; n < 9; n++) expect((await routed(`${SERVICE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${bot.agent}.nope${n}`, "cf-connecting-ip": "10.0.0.1" }, body: "{}" })).status, "the tenth failure is still 401").toBe(401);
    expect((await routed(`${SERVICE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${bot.bearer}`, "cf-connecting-ip": "10.0.0.1", "content-type": "application/json", "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } }) })).status, "the limiter, even with the right bearer").toBe(429);
    expect((await mcp(bot.bearer, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } })).status, "another address is served").toBe(200);
    // After bearer: the old bearer answers 401, the new one serves, and the sessions and streams open under the old one are gone.
    const open = stream(bot.bearer, botSession);
    await settle();
    expect((await agentStub(bot.agent).counts()).streams).toBe(1);
    const reissued = await room.wait(() => post(`/mcp/agents/${bot.agent}/bearer`, control(room, rita.secret, "bearer", M, bot.agent, "", "rita-bearer-bot"), ""));
    const botNew = (await reissued.json() as { bearer: string }).bearer;
    expect(await open.ended, "the stream closed").toBe(200);
    expect(open.text(), "with a final event").toContain("event: end");
    expect((await mcp(bot.bearer, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } })).status).toBe(401);
    expect((await mcp(botNew, "POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": botSession }, { jsonrpc: "2.0", id: 2, method: "tools/list" })).status, "the old session is gone").toBe(404);
    expect((await mcp(botNew, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } })).status).toBe(200);
    // After retire: 401 for the bearer, and the control answers 409 for a further bearer.
    expect((await room.wait(() => post(`/mcp/agents/${bot.agent}`, control(room, rita.secret, "retire", M, bot.agent, "", "rita-retire-bot"), "", "DELETE"))).status).toBe(200);
    expect((await mcp(botNew, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } })).status).toBe(401);
    expect((await room.wait(() => post(`/mcp/agents/${bot.agent}/bearer`, control(room, rita.secret, "bearer", M, bot.agent, "", "after-retire"), ""))).status).toBe(409);
    // After revoke-key of bot3's key by the admin: its act is refused by the scope with membership's reason, and custody records it.
    const keyItem = (await allItems(rita, "membership")).find((i) => i.type === "key" && i.values["id"] === bot3.key)!;
    expect((await rita.ok("key.revoke", { on: keyItem.id, fields: { as: "retired" }, idempotencyKey: "revoke-bot3" }))["answer"]).toBe("accepted");
    const refused = await factOf(await room.wait(() => modernCall(bot3Rotated, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "after revocation", conditions: ["done"] }, idempotencyKey: "after-revoke" })));
    expect(refused.answer, JSON.stringify(refused)).toBe("refused");
    // A revoked key cannot sign control: paul's key is revoked, then his bearer for @bot3 is refused.
    const paulKey = (await allItems(rita, "membership")).find((i) => i.type === "key" && i.values["id"] === paul.key)!;
    expect((await rita.ok("key.revoke", { on: paulKey.id, fields: { as: "retired" }, idempotencyKey: "revoke-paul" }))["answer"]).toBe("accepted");
    expect((await room.wait(() => post(`/mcp/agents/${bot3.agent}/bearer`, control(room, paul.secret, "bearer", M, bot3.agent, "", "paul-after-revoke"), ""))).status, "a revoked key").toBe(403);
  } finally { done(room); }
});

test("H5, H6 and H7: eviction and reconciliation, custody across a lost reply and a reset, the framing overhead", async () => {
  const { room, rita } = await roomWithIssues();
  try {
    const bot = await hosted(room, rita, "@bot", "create-bot");
    const stub = agentStub(bot.agent);
    const list = (session: string) => mcp(bot.bearer, "POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": session }, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const told = (s: { text: () => string }) => s.text().split("notifications/tools/list_changed").length - 1;
    // H5. A legacy session lists at generation A; the inventory changes to B with the stream open; the stream is told once.
    const S = await legacySession(bot.bearer);
    expect((await list(S)).status).toBe(200);
    const open1 = stream(bot.bearer, S);
    await settle();
    expect(open1.text()).toContain(": stream");
    expect(told(open1), "nothing told before a change").toBe(0);
    expect((await rita.ok("rules.activate", { fields: { digest: DEMO_DIGESTS.change, name: "change" }, values: [canonicalize(changeDemo)], idempotencyKey: "activate-change" }))["answer"]).toBe("accepted");
    expect(await stub.tick()).toBe(true);
    await settle();
    expect(told(open1), "told once with the stream open").toBe(1);
    expect(await stub.tick()).toBe(true);
    await settle();
    expect(told(open1), "not told again").toBe(1);
    // The object is reset without the client listing: on reconnect the client is told once more, because listed is still A.
    open1.stop();
    await stub.reset();
    const open2 = stream(bot.bearer, S);
    await settle();
    expect(open2.text(), "the session survived the reset").toContain(": stream");
    expect(told(open2), "reconciliation tells the unlisted change once").toBe(1);
    // It lists (listed = B); a further reconnect without a change receives nothing.
    expect((await list(S)).status).toBe(200);
    open2.stop();
    await stub.reset();
    const open3 = stream(bot.bearer, S);
    await settle();
    expect(open3.text()).toContain(": stream");
    expect(told(open3), "nothing to reconcile after listing").toBe(0);
    // A change while no stream is open is told once at the next stream; a second GET closes the first stream, the second keeps receiving.
    open3.stop();
    await settle();
    await rita.ok("rules.activate", { fields: { digest: DEMO_DIGESTS.issue, name: "issue2" }, values: [canonicalize(issueDemo)], idempotencyKey: "activate-issue2" }).catch(() => undefined);
    expect((await rita.ok("member.add", { fields: { handle: "@seen", kind: "checker" }, idempotencyKey: "add-seen" }))["answer"]).toBe("accepted");
    await stub.tick();
    const open4 = stream(bot.bearer, S);
    await settle();
    const toldAtOpen = told(open4);
    const open5 = stream(bot.bearer, S);
    await settle();
    expect(await open4.ended, "the first stream closed on replacement").toBe(200);
    expect(open5.text()).toContain(": stream");
    expect((await stub.counts()).streams).toBe(1);
    void toldAtOpen;
    open5.stop();
    await settle();
    // H6. A reply lost on the way back leaves the record unknown; settle after a reset resolves it from the scope; a repeat under the
    // same key signs nothing and returns the retained answer.
    hostedTest.lose = `/${rita.config.repository!.directory.scope}/acts`;
    const lost = await room.wait(() => modernCall(bot.bearer, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "lost on the way back", conditions: ["done"] }, idempotencyKey: "lost-1" }));
    const lostBody = (await lost.json() as { result: { structuredContent: Record<string, unknown> } }).result.structuredContent;
    expect(lostBody["error"], JSON.stringify(lostBody)).toBe("transport");
    await stub.reset();
    const settled = await room.wait(() => modernCall(bot.bearer, "settle", { idempotencyKey: "lost-1", target: "directory" }));
    const settledBody = (await settled.json() as { result: { structuredContent: Record<string, unknown> } }).result.structuredContent;
    expect(settledBody["answer"], JSON.stringify(settledBody)).toBe("accepted");
    const repeat = await room.wait(() => modernCall(bot.bearer, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "lost on the way back", conditions: ["done"] }, idempotencyKey: "lost-1" }));
    const repeatBody = (await repeat.json() as { result: { structuredContent: Record<string, unknown> } }).result.structuredContent;
    expect([repeatBody["answer"], repeatBody["retained"]], JSON.stringify(repeatBody)).toEqual(["accepted", true]);
    expect((repeatBody["fact"] as FactRef).seq).toBe((settledBody["fact"] as FactRef).seq);
    // H7. The HTTP framing overhead of a 2026-07-28 tools/call: the response's bytes beyond the CallResult, measured once.
    const framed = await room.wait(() => modernCall(bot.bearer, "room", {}));
    const text = await framed.text();
    const result = (JSON.parse(text) as { result: Record<string, unknown> }).result;
    const { resultType: _r, _meta: _m, ...callResult } = result;
    const overhead = utf8(text).length - utf8(JSON.stringify(callResult)).length;
    // The JSON-RPC envelope with a one-digit id, plus what 2026-07-28 adds to every result; docs/mcp.md states both (observed here).
    const envelope = utf8(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })).length - 2;
    expect(overhead, "the JSON-RPC envelope and the modern result's added members").toBe(envelope + MODERN_RESULT_EXTRA);
    expect(framed.headers.get("content-type")).toBe("application/json");
  } finally { done(room); }
});

test("H8 through the route: the matrix, the modern headers, the legacy rules, and the methods across eras", async () => {
  const { room, rita } = await roomWithIssues();
  try {
    const bot = await hosted(room, rita, "@bot", "create-bot");
    const B = bot.bearer;
    const listBody = { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } };
    const code = async (r: Response) => (await r.json() as { error?: { code: number } }).error?.code;
    // Modern: the header is required and must agree with _meta in both directions; Mcp-Method and Mcp-Name are checked on the raw value.
    expect([(await mcp(B, "POST", { "mcp-method": "tools/list" }, listBody)).status, await code(await mcp(B, "POST", { "mcp-method": "tools/list" }, listBody))]).toEqual([400, -32020]);
    expect(await code(await mcp(B, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })), "a July header without July metadata").toBe(-32020);
    expect(await code(await mcp(B, "POST", { "mcp-protocol-version": LEGACY }, listBody)), "a November header on July metadata").toBe(-32020);
    expect(await code(await mcp(B, "POST", { "mcp-protocol-version": MODERN }, listBody)), "missing Mcp-Method").toBe(-32020);
    expect(await code(await mcp(B, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/call" }, listBody)), "Mcp-Method differs").toBe(-32020);
    const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "room", arguments: {}, _meta: META } };
    expect(await code(await mcp(B, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/call" }, call)), "missing Mcp-Name").toBe(-32020);
    expect(await code(await mcp(B, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/call", "mcp-name": "inspect" }, call)), "Mcp-Name differs").toBe(-32020);
    expect(await code(await mcp(B, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/call", "mcp-name": "=?base64?###?=" }, call)), "a sentinel that is not base64").toBe(-32020);
    const sentinel = `=?base64?${btoa("room")}?=`;
    expect((await mcp(B, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/call", "mcp-name": sentinel }, call)).status, "a sentinel that decodes equal").toBe(200);
    const unsupported = await mcp(B, "POST", { "mcp-protocol-version": "2025-03-26", "mcp-method": "tools/list" }, listBody);
    expect([unsupported.status, (await unsupported.json() as { error: { code: number; data: { supported: string[] } } }).error.data.supported]).toEqual([400, [MODERN, LEGACY]]);
    const unknown = await mcp(B, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "no/such" }, { jsonrpc: "2.0", id: 1, method: "no/such", params: { _meta: META } });
    expect([unknown.status, await code(unknown)]).toEqual([404, -32601]);
    const notified = await mcp(B, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "notifications/cancelled" }, { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1, _meta: META } });
    expect([notified.status, await notified.text(), notified.headers.get("mcp-session-id")]).toEqual([202, "", null]);
    for (const [raw, expected] of [["{", -32700], ['{"id":1}', -32600], ["[]", -32600]] as const) {
      const r = await routed(`${SERVICE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${B}`, "content-type": "application/json", "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, body: raw });
      const parsed = await r.json() as { id: unknown; error: { code: number } };
      expect([r.status, parsed.id, parsed.error.code], raw).toEqual([400, null, expected]);
    }
    // Both: Origin, the body bound, a batch under every header.
    expect((await routed(`${SERVICE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${B}`, origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify(listBody) })).status).toBe(403);
    expect((await routed(`${SERVICE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${B}`, "content-type": "application/json", "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, body: JSON.stringify({ ...listBody, pad: "x".repeat(1024 * 1024 + 16) }) })).status).toBe(413);
    for (const headers of [{ "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, { "mcp-protocol-version": LEGACY }, {}]) expect(await code(await mcp(B, "POST", headers, [listBody])), JSON.stringify(headers)).toBe(-32600);
    // Legacy, and the methods across eras with a live session S.
    const S = await legacySession(B);
    const list = (headers: Record<string, string>) => mcp(B, "POST", headers, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect((await list({ "mcp-protocol-version": LEGACY, "mcp-session-id": S, "mcp-method": "tools/call", "mcp-name": "ignored" })).status, "modern headers ignored on a legacy request").toBe(200);
    expect((await list({ "mcp-session-id": S })).status, "header absent, live session").toBe(200);
    expect((await list({ "mcp-protocol-version": LEGACY })).status, "no session").toBe(400);
    expect((await list({ "mcp-protocol-version": LEGACY, "mcp-session-id": "no-such" })).status).toBe(404);
    expect((await mcp(B, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/list", "mcp-session-id": S }, listBody)).status, "a modern request ignores the session").toBe(200);
    for (const method of ["GET", "DELETE"]) {
      for (const id of [S, "no-such"]) {
        const r = await mcp(B, method, { "mcp-protocol-version": MODERN, "mcp-session-id": id });
        expect([r.status, r.headers.get("allow")], `${method} July naming ${id === S ? "S" : "an unknown ID"}`).toEqual([405, "POST"]);
      }
      expect((await mcp(B, method, { "mcp-protocol-version": LEGACY })).status, `${method} November without a session`).toBe(400);
      expect((await mcp(B, method, {})).status, `${method} no header, no session`).toBe(405);
      expect((await mcp(B, method, { "mcp-session-id": "no-such" })).status, `${method} no header, unknown session`).toBe(404);
      expect((await mcp(B, method, { "mcp-protocol-version": "x", "mcp-session-id": S })).status, `${method} an unsupported version`).toBe(400);
    }
    expect((await list({ "mcp-protocol-version": LEGACY, "mcp-session-id": S })).status, "S serves after the July attempts").toBe(200);
    const open = stream(B, S);
    await settle();
    expect(open.text(), "S opens its stream after the July attempts").toContain(": stream");
    const second = await mcp(B, "GET", { "mcp-protocol-version": LEGACY, "mcp-session-id": S });
    expect(second.status, "a 2nd stream replaces the 1st").toBe(200);
    expect(await open.ended).toBe(200);
    await settle();
    // A 17th session ends the oldest.
    for (let n = 1; n < 17; n++) await legacySession(B);
    expect((await agentStub(bot.agent).counts()).sessions).toBe(16);
    expect((await list({ "mcp-protocol-version": LEGACY, "mcp-session-id": S })).status, "the oldest session ended").toBe(404);
    expect((await mcp(B, "DELETE", { "mcp-session-id": S })).status).toBe(404);
  } finally { done(room); }
});

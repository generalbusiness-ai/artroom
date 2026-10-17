/**
 * The hosted MCP endpoint on real scopes (notes/2026-10-13-hosted-mcp-endpoint.md, section 6): the registry and the agent
 * objects of the test Worker (`packages/scope/test/worker.ts`, over the namespace PLATFORM), reached through the production app
 * Worker's default fetch, with the pinned MCP client where a client is named. rita creates the room through her own MCP service
 * and performs the admin's acts; the agent is created by a control request she signs.
 */
import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import type { ControlRequest, Digest, FactRef, KeyId, MemberId, ScopeRef } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, digestBytes, keyIdOfSecret, newIncarnation, signControl, textDigest, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { invitationIssueFields, encodeAgentKeyInvitation, type AgentKeyInvitation } from "@generalbusiness/artroom-client";
import { FIRST_ACTIONS_OF, firstExtents } from "@generalbusiness/dap-platform";
import { DEMO_DIGESTS, changeDemo, issueDemo } from "@generalbusiness/dap-lanes";
import { counting } from "../../../apps/counter/definition.ts";
import { COUNTING_DEFINITION } from "../../../apps/counter/pin.ts";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import worker from "../../../apps/room/worker.ts";
import { hostedTest } from "../../scope/test/worker.ts";
import { BOUNDS, COMPLETION_BYTES, MODERN, MODERN_RESULT_EXTRA } from "../src/index.ts";
import { INVITATION_LINK } from "@generalbusiness/artroom-client";
import { mcpRoom, SERVICE, type Agent, type Room } from "./support/room.ts";
import { created as createRoom } from "./support/story.ts";
import { MCP_METRIC_SCHEMA, type McpMetricPoint } from "../src/metrics.ts";

/** Production default dispatch, in this isolate. The actual native PLATFORM namespace is this fixture's Scope binding;
 * REGISTRIES and AGENTS keep their existing native subclasses, clocks, custody and control fences. */
const routed = (url: string | URL, init?: RequestInit): Promise<Response> => worker.fetch(new Request(url, init), { ...env, SCOPES: env.PLATFORM });
const fetchLike = ((url: string | URL | Request, init?: RequestInit) => routed(url instanceof Request ? url.url : url, init)) as unknown as typeof fetch;

/** Every step of a scope, across the steps tool's pages. */
async function allSteps(agent: Agent, scope: string): Promise<{ seq: number; kind: string | null; signer: string | null }[]> {
  const out: { seq: number; kind: string | null; signer: string | null }[] = [];
  for (let cursor: unknown = undefined, n = 0; n < 64; n++) {
    const page = await agent.ok("steps", { scope, ...(cursor !== undefined ? { cursor } : {}) });
    out.push(...(page["steps"] as typeof out));
    if (page["cursor"] === undefined) break;
    cursor = page["cursor"];
  }
  return out;
}

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
async function invite(room: Room, rita: Agent, handle: string, definition: AgentKeyInvitation["definition"] = "platform:membership@2"): Promise<{ link: string; invitation: AgentKeyInvitation; secret: string }> {
  const M = rita.config.repository!.membership;
  const added = await rita.ok("member.add", { fields: { handle, kind: "agent", controller: "@rita" }, idempotencyKey: `add-${handle}` });
  expect(added["answer"], JSON.stringify(added)).toBe("accepted");
  const member = added["fact"] as FactRef;
  const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const invited = await rita.ok("key.invite", { fields: { member: member.seq, kind: "agent", ...invitationIssueFields(definition, secret), inviteEnds: timeOf(room.now() + 3_600_000) }, idempotencyKey: `invite-${handle}` });
  expect(invited["answer"], JSON.stringify(invited)).toBe("accepted");
  const items = await allItems(rita, "membership");
  const roster = items.find((i) => i.type === "roster")!;
  const memberItem = items.find((i) => i.type === "member" && i.values["handle"] === handle)!;
  const { inbox: _inbox, ...repository } = rita.config.repository!;
  const invitation: AgentKeyInvitation = {
    v: 1, kind: "agent-key", service: SERVICE, repository, definition, handle, controller: { membership: M, member: "@rita" as MemberId },
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

test.each(["platform:register@3", "platform:register@10"] as const)("H1, the whole recipe: add-member, invite-key, create, enrol, then the pinned client in both revisions acts as the agent (%s)", async registerDefinition => {
  const room = mcpRoom();
  const metrics: McpMetricPoint[] = [];
  hostedTest.metrics = { report: point => { metrics.push(structuredClone(point)); } };
  hostedTest.now = () => room.now();
  hostedTest.pause = (waiting) => room.pause(waiting);
  try {
    const rita = room.agent("rita");
    await createRoom(room, rita, "default", registerDefinition);
    const definition = registerDefinition === "platform:register@10" ? "platform:membership@6" : "platform:membership@2";
    const inviteAgent = (handle: string) => invite(room, rita, handle, definition);
    const M = rita.config.repository!.membership;
    // The rules published and the issue definition activated, as the room story does, so an agent may open issues.
    expect((await rita.ok("rules.publish", { on: 0, fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }) }, idempotencyKey: "publish" }))["answer"]).toBe("accepted");
    expect((await rita.ok("rules.activate", { fields: { digest: DEMO_DIGESTS.issue, name: "issue" }, values: [canonicalize(issueDemo)], idempotencyKey: "activate-issue" }))["answer"]).toBe("accepted");
    const { link, invitation } = await inviteAgent("@bot");
    const body = JSON.stringify({ link });
    // The controller's create: the registry reserves, the agent object enrols its own key, and the bearer is shown once.
    const created = await room.wait(() => post("/mcp/agents", control(room, rita.secret, "create", M, null, body, "create-1"), body));
    const answer = await created.json() as { agent: string; key: KeyId; handle: string; bearer: string; member: FactRef };
    expect([created.status, answer.handle], JSON.stringify(answer)).toEqual([201, "@bot"]);
    expect(answer.bearer.startsWith(`${answer.agent}.`)).toBe(true);
    // The same op answers the same, including the bearer; another body under the same op is refused.
    const again = await room.wait(() => post("/mcp/agents", control(room, rita.secret, "create", M, null, body, "create-1"), body));
    expect([again.status, (await again.json() as { bearer: string }).bearer]).toEqual([201, answer.bearer]);
    // Two concurrent creates under one op, from the reservation through the enrolment: one agent, one key, one bearer.
    const { link: link3 } = await inviteAgent("@bot3");
    const body3 = JSON.stringify({ link: link3 });
    const pair = await room.wait(() => Promise.all([1, 2].map(() => post("/mcp/agents", control(room, rita.secret, "create", M, null, body3, "create-3"), body3))));
    const answers = await Promise.all(pair.map((r) => r.json() as Promise<{ agent: string; key: string; bearer: string }>));
    expect(pair.map((r) => r.status), JSON.stringify(answers)).toEqual([201, 201]);
    expect([answers[0]!.agent, answers[0]!.key, answers[0]!.bearer]).toEqual([answers[1]!.agent, answers[1]!.key, answers[1]!.bearer]);
    expect((await registryStub(M.scope).agents()).filter((a) => a.handle === "@bot3")).toHaveLength(1);
    const other = JSON.stringify({ link: (await inviteAgent("@bot2")).link });
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
    expect(metrics.some(p => p.blobs[0] === "tools-list")).toBe(true);
    expect(metrics.some(p => p.blobs[0] === "tool-call" && p.blobs[3] === "wait" && p.doubles[2]! > 0)).toBe(true);
    for (const phase of ["prepared", "sent", "accepted"]) expect(metrics.filter(p => p.blobs[0] === "custody" && p.blobs[3] === "enrol" && p.blobs[5] === phase)).toHaveLength(2);
    expect(metrics.every(p => p.blobs[8] === MCP_METRIC_SCHEMA)).toBe(true);
    const observation = JSON.stringify(metrics);
    expect(observation).not.toContain(invitation.secret);
    expect(observation).not.toContain(answer.bearer);
    expect(observation).not.toContain(b64url(rita.secret));
    // The secret of the invitation appears in no hosted row but the retained envelope: the agent object's tables hold no copy.
    const registry = env.REGISTRIES.get(env.REGISTRIES.idFromName(M.scope)) as unknown as { agents(): Promise<{ agent: string; handle: string; state: string }[]> };
    expect(await registry.agents()).toEqual(expect.arrayContaining([{ agent: answer.agent, handle: "@bot", key: answer.key, state: "enrolled" }]));
    if (definition === "platform:membership@6") {
      const privateSeed = b64url(new Uint8Array(32).fill(81));
      const invited = await rita.ok("member.invite", { fields: { handle: "@visitor", role: "member", ...invitationIssueFields(definition, privateSeed), inviteEnds: timeOf(room.now() + 3_600_000) }, idempotencyKey: "person-invitation" });
      expect(invited["answer"]).toBe("accepted");
      const { inbox: _inbox, ...repository } = rita.config.repository!;
      const link = INVITATION_LINK + b64url(utf8(JSON.stringify({ v: 1, service: SERVICE, repository, invitation: (invited["fact"] as FactRef).seq, secret: privateSeed, handle: "@visitor", definition })));
      const visitor = room.agent("visitor");
      expect((await visitor.ok("join", { link, idempotencyKey: "person-join" }))["answer"]).toBe("accepted");
      const history = JSON.stringify(await room.platform(M.scope).entries());
      expect(history).not.toContain(privateSeed);
      expect(history).not.toContain(invitation.secret);
      expect(history).not.toContain('"secret"');
    }
  } finally { hostedTest.metrics = null; hostedTest.now = null; hostedTest.pause = null; room.done(); }
});

/** A room created by rita with the issue definition active, and one agent created under `op`; the agent's answer. */
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
  await createRoom(room, rita, "default");
  expect((await rita.ok("rules.publish", { on: 0, fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }) }, idempotencyKey: "publish" }))["answer"]).toBe("accepted");
  expect((await rita.ok("rules.activate", { fields: { digest: DEMO_DIGESTS.issue, name: "issue" }, values: [canonicalize(issueDemo)], idempotencyKey: "activate-issue" }))["answer"]).toBe("accepted");
  return { room, rita };
}
const done = (room: Room) => { hostedTest.now = null; hostedTest.pause = null; hostedTest.lose = null; hostedTest.controlBudget = null; hostedTest.custodyBounds = null; hostedTest.failWrite = null; hostedTest.faultAt = null; hostedTest.failSession = false; room.done(); };
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
const until = async (check: () => boolean, ms = 3000) => { for (let t = 0; t < ms && !check(); t += 25) await new Promise((r) => setTimeout(r, 25)); return check(); };
const agentStub = (id: string) => env.AGENTS.get(env.AGENTS.idFromString(id)) as unknown as { reset(): Promise<void>; tick(): Promise<boolean>; counts(): Promise<{ streams: number; sessions: number }>; heldAnswers(): Promise<{ control: { op: string; answer: boolean }[]; agent: boolean }>; used(): Promise<number>; durableFacts(): Promise<{ key: string | null; state: string | null; enrol: string | null; bearer: boolean }>; custodyRecord(key: string): Promise<{ intent: string; attempt: number; outcomes: number; phase: string; steps: string[]; reserved: number } | null> };
const intentDigestOf = (intent: unknown) => digestBytes(utf8(canonicalize(intent as never)));
const registryStub = (membership: string) => env.REGISTRIES.get(env.REGISTRIES.idFromName(membership)) as unknown as { agents(): Promise<{ agent: string; handle: string; state: string }[]>; heldAnswers(): Promise<{ op: string; answer: boolean }[]> };
/** A 2026-07-28 listen, read in the background: its events so far. */
function listen(bearer: string): { text: () => string; stop: () => void; ended: Promise<number> } {
  const abort = new AbortController();
  const seen: string[] = [];
  const body = { jsonrpc: "2.0", id: 0, method: "subscriptions/listen", params: { notifications: { toolsListChanged: true }, _meta: META } };
  const ended = routed(`${SERVICE}/mcp`, { method: "POST", signal: abort.signal, headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", "mcp-protocol-version": MODERN, "mcp-method": "subscriptions/listen" }, body: JSON.stringify(body) })
    .then(async (res) => { if (res.status !== 200 || !res.body) return res.status; const reader = res.body.getReader(); try { for (;;) { const r = await reader.read(); if (r.done) break; seen.push(new TextDecoder().decode(r.value)); } } catch { /* aborted */ } return res.status; }).catch(() => -1);
  return { text: () => seen.join(""), stop: () => abort.abort(), ended };
}

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
    // A completed control replay has no effect: a stream and a listen opened under the new bearer stay open through the replay.
    const afterSession = await legacySession(botNew);
    const afterStream = stream(botNew, afterSession);
    const afterListen = listen(botNew);
    await settle();
    expect(await until(() => afterListen.text().includes("acknowledged"))).toBe(true);
    expect((await agentStub(bot.agent).counts()).streams).toBe(2);
    const replayed = await room.wait(() => post(`/mcp/agents/${bot.agent}/bearer`, control(room, rita.secret, "bearer", M, bot.agent, "", "rita-bearer-bot"), ""));
    expect([replayed.status, (await replayed.json() as { bearer: string }).bearer]).toEqual([200, botNew]);
    await settle();
    expect((await agentStub(bot.agent).counts()).streams, "the replay disturbed nothing").toBe(2);
    expect(afterStream.text()).not.toContain("event: end");
    // After retire: 401 for the bearer, and the control answers 409 for a further bearer. The stream gets its final event; the
    // listen its result and the end of its body.
    expect((await room.wait(() => post(`/mcp/agents/${bot.agent}`, control(room, rita.secret, "retire", M, bot.agent, "", "rita-retire-bot"), "", "DELETE"))).status).toBe(200);
    expect(await afterStream.ended).toBe(200);
    expect(afterStream.text()).toContain("event: end");
    expect(await afterListen.ended, "the listen's body ended").toBe(200);
    expect(afterListen.text(), "with its result").toContain('"resultType":"complete"');
    expect((await mcp(botNew, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } })).status).toBe(401);
    expect((await room.wait(() => post(`/mcp/agents/${bot.agent}/bearer`, control(room, rita.secret, "bearer", M, bot.agent, "", "after-retire"), ""))).status).toBe(409);
    // After revoke-key of bot3's key by the admin: its act is refused by the scope with membership's reason, and custody records it.
    const keyItem = (await allItems(rita, "membership")).find((i) => i.type === "key" && i.values["id"] === bot3.key)!;
    expect((await rita.ok("key.revoke", { on: keyItem.id, fields: { as: "retired" }, idempotencyKey: "revoke-bot3" }))["answer"]).toBe("accepted");
    const refused = await factOf(await room.wait(() => modernCall(bot3Rotated, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "after revocation", conditions: ["done"] }, idempotencyKey: "after-revoke" })));
    expect(refused.answer, JSON.stringify(refused)).toBe("refused");
    // Expiry: seven days past the original request's deadline, the op is stale and no answer body remains in either object.
    room.advance(8 * 86_400_000);
    expect((await room.wait(() => post(`/mcp/agents/${bot3.agent}/bearer`, control(room, rita.secret, "bearer", M, bot3.agent, "", "rita-bearer-3"), ""))).status, "stale").toBe(409);
    const heldByAgent = await agentStub(bot3.agent).heldAnswers();
    expect(heldByAgent.control.every((r) => !r.answer), JSON.stringify(heldByAgent)).toBe(true);
    expect(heldByAgent.agent, "the creation's answer, with the bearer shown once, is gone").toBe(false);
    // The registry removes its copies at its next control operation: a stale replay of the creation finds the op stale and no body kept.
    expect((await room.wait(() => post("/mcp/agents", control(room, paul.secret, "create", M, null, body3, "paul-create-3"), body3))).status, "a stale creation replay").toBe(409);
    expect((await registryStub(M.scope).heldAnswers()).every((r) => !r.answer)).toBe(true);
    // An oversized streaming control body is refused while it streams, before any object is reached: no row appears.
    const before = (await registryStub(M.scope).agents()).length;
    const chunk = new TextEncoder().encode("x".repeat(16 * 1024));
    const big = new ReadableStream<Uint8Array>({ pull: (c) => { c.enqueue(chunk); } });
    const over = await routed(`${SERVICE}/mcp/agents`, { method: "POST", headers: { authorization: control(room, rita.secret, "create", M, null, "", "big"), "content-type": "application/json" }, body: big, duplex: "half" } as RequestInit);
    expect(over.status).toBe(413);
    expect((await registryStub(M.scope).agents()).length).toBe(before);
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
    // A change of the agent's list while no stream is open: a third definition activated changes the choices of a field.
    expect((await rita.ok("rules.activate", { fields: { digest: COUNTING_DEFINITION, name: "counting" }, values: [canonicalize(counting)], idempotencyKey: "activate-counting" }))["answer"]).toBe("accepted");
    await stub.tick();
    const open4 = stream(bot.bearer, S);
    await settle();
    expect(told(open4), "a change while no stream was open is told once at the next stream").toBe(1);
    const open5 = stream(bot.bearer, S);
    await settle();
    expect(await open4.ended, "the first stream closed on replacement").toBe(200);
    expect(open5.text()).toContain(": stream");
    expect((await stub.counts()).streams).toBe(1);
    expect(told(open5), "the replacement is told once more, because the session has still not listed").toBe(1);
    // A later change reaches the replacement, not the closed stream: the session lists (listed = current), then a definition is
    // activated under another name, which changes the choices again.
    expect((await list(S)).status).toBe(200);
    // A new lane is a new held scope of the agent's inventory.
    const opened = await rita.ok("issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "a later lane", conditions: ["done"] }, values: [canonicalize(issueDemo)], idempotencyKey: "later-lane" });
    expect(opened["answer"], JSON.stringify(opened)).toBe("accepted");
    expect((await rita.ok("wait", { scope: "directory", entry: (opened["fact"] as FactRef).seq }))["timedOut"]).toBe(false);
    await stub.tick();
    await settle();
    expect(told(open5), "the replacement receives the later change").toBe(2);
    expect(told(open4), "the closed stream receives nothing").toBe(1);
    open5.stop();
    await settle();
    // A modern listen across a reset: the reset ends it abruptly with no event; a reopened listen is acknowledged with its ID
    // and honored types and replays nothing.
    const first = listen(bot.bearer);
    expect(await until(() => first.text().includes("acknowledged"))).toBe(true);
    await stub.reset();
    expect(await first.ended, "the reset ended the old body").toBe(200);
    expect(first.text(), "with no event").not.toContain("resultType");
    expect(first.text()).not.toContain("event: end");
    const reopened = listen(bot.bearer);
    expect(await until(() => reopened.text().includes("acknowledged"))).toBe(true);
    expect(reopened.text()).toContain('"io.modelcontextprotocol/subscriptionId":0');
    expect(reopened.text()).toContain('"toolsListChanged":true');
    expect(reopened.text(), "nothing from before the reopen is replayed").not.toContain("notifications/tools/list_changed");
    first.stop(); reopened.stop();
    await settle();
    // A listing whose session-row write fails moves nothing: the live marker stays with the durable one, the client gets a
    // correlated error and no list, a reconnect without a reset is told the change once, and a listing that succeeds suppresses it.
    const S2 = await legacySession(bot.bearer);
    expect((await list(S2)).status).toBe(200);
    // The agent role's actions change: the agent's standing, and so its list, changes with them.
    const agentActions = (FIRST_ACTIONS_OF as Record<string, Record<string, readonly string[]>>)["platform:membership@2"]!["agent"] ?? [];
    const widened = await rita.ok("member.actions", { on: 0, fields: { role: "agent", actions: [...agentActions, "membership.invite"] }, idempotencyKey: "agent-actions" });
    expect(widened["answer"], `the agent role's actions change: ${JSON.stringify(widened)}`).toBe("accepted");
    await stub.tick();
    hostedTest.failSession = true;
    const failedList = await list(S2);
    const failedBody = await failedList.json() as { error?: { code: number } };
    expect([failedList.status, failedBody.error?.code], "a correlated internal error, no list").toEqual([200, -32603]);
    const reconnect = stream(bot.bearer, S2);
    expect(await until(() => told(reconnect) === 1), "the change is told once on reconnect, because the durable listed did not move").toBe(true);
    reconnect.stop();
    await settle();
    expect((await list(S2)).status).toBe(200);
    const reconnect2 = stream(bot.bearer, S2);
    expect(await until(() => reconnect2.text().includes(": stream"))).toBe(true);
    await settle(200);
    expect(told(reconnect2), "a successful listing suppresses further reconciliation").toBe(0);
    reconnect2.stop();
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
    // An enrolment whose reply is lost stays unfinished; an admin retires it; the create's retry does not revive it.
    const { link: lostLink } = await invite(room, rita, "@bot4");
    const lostLinkBody = JSON.stringify({ link: lostLink });
    hostedTest.lose = `/${rita.config.repository!.membership.scope}/acts`;
    const unresolved = await room.wait(() => post("/mcp/agents", control(room, rita.secret, "create", rita.config.repository!.membership, null, lostLinkBody, "create-4"), lostLinkBody));
    const unresolvedBody = await unresolved.json() as { error: string };
    expect([unresolved.status, unresolvedBody.error]).toEqual([503, "unresolved"]);
    const agents = await registryStub(rita.config.repository!.membership.scope).agents();
    expect(agents.some((a) => a.handle === "@bot4"), "no agent row until the enrolment resolves").toBe(false);
    const retireUrl = (id: string) => `/mcp/agents/${id}`;
    // The reserved agent ID is the registry's: find it by retiring through the control route with the reserved ID from the op's row.
    const reservedId = (await (env.REGISTRIES.get(env.REGISTRIES.idFromName(rita.config.repository!.membership.scope)) as unknown as { reservedAgent(op: string): Promise<string | null> }).reservedAgent("create-4"))!;
    expect(reservedId).toMatch(/^[0-9a-f]{64}$/);
    expect((await room.wait(() => post(retireUrl(reservedId), control(room, rita.secret, "retire", rita.config.repository!.membership, reservedId, "", "retire-4"), "", "DELETE"))).status, "an admin retires the unfinished agent").toBe(200);
    const retried = await room.wait(() => post("/mcp/agents", control(room, rita.secret, "create", rita.config.repository!.membership, null, lostLinkBody, "create-4"), lostLinkBody));
    expect([retried.status, (await retried.json() as { error: string }).error], "the retry does not revive it").toEqual([409, "retired"]);
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
    // The plan 031 bounds hold through the endpoint: each response is its CallResult's bound plus the framing, observed.
    const within = async (name: string, args: Record<string, unknown>, bound: number): Promise<Record<string, unknown>> => {
      const r = await room.wait(() => modernCall(bot.bearer, name, args));
      const body = await r.text();
      expect(r.status, name).toBe(200);
      const parsed = JSON.parse(body) as { result: { isError: boolean; structuredContent: Record<string, unknown> } };
      expect(parsed.result.isError, `${name} succeeds: ${body.slice(0, 200)}`).toBe(false);
      expect(utf8(body).length - overhead, `${name} within its bound through the endpoint`).toBeLessThanOrEqual(bound);
      return parsed.result.structuredContent;
    };
    await within("room", {}, BOUNDS.room);
    await within("inspect", { scope: "directory" }, BOUNDS.inspect);
    const bounded = await within("issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "bounded", conditions: ["done"] }, idempotencyKey: "bounded" }, BOUNDS.act);
    expect(bounded["answer"]).toBe("accepted");
    await within("settle", { idempotencyKey: "bounded", target: "directory" }, BOUNDS.act);
    // The large responses, paged: the declaration of the issue definition, the membership's items, and the directory's steps
    // with a continuation.
    const declaration = await within("inspect", { scope: "directory", declaration: true }, BOUNDS.large);
    expect(declaration["declaration"] ?? declaration["definition"], "the declaration is in the result").toBeDefined();
    await within("items", { scope: "membership", type: "member" }, BOUNDS.large);
    for (let n = 0; n < 12; n++) expect((await rita.ok("issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: `page filler ${n}`, conditions: ["done"] }, idempotencyKey: `filler-${n}` }))["answer"]).toBe("accepted");
    // The continuation is followed to exhaustion: more than one page, the last without a cursor, and the steps in all are the
    // directory's whole history as an independent reader pages it, each sequence number once and in order.
    // The whole history as an independent reader pages it first, by sequence number. The room is live, so the hosted pages
    // read after it may end with entries that landed since: they must begin with this whole and stay contiguous from 0.
    const whole = (await allSteps(rita, "directory")).map((step) => step.seq);
    expect(whole.length).toBeGreaterThanOrEqual(14);
    const wholeThenContiguous = (seqs: number[]) => seqs.length >= whole.length && whole.every((seq, i) => seqs[i] === seq) && seqs.every((seq, i) => seq === i);
    // The steps, followed to exhaustion: the last page has no cursor, and the pages together are the whole history, each step
    // once and in order.
    const stepPages: { seq: number }[][] = [];
    let stepsCursor: unknown = undefined, stepsHead: { seq: number } | null = null;
    for (let n = 0; n < 64; n++) {
      const next = await within("steps", { scope: "directory", ...(stepsCursor !== undefined ? { cursor: stepsCursor } : {}) }, BOUNDS.large);
      stepPages.push(next["steps"] as { seq: number }[]);
      stepsHead = next["head"] as { seq: number };
      stepsCursor = next["cursor"];
      if (stepsCursor === undefined) break;
    }
    expect(stepsCursor, "the steps continuation is exhausted").toBeUndefined();
    const stepSeqs = stepPages.flat().map((step) => step.seq);
    expect(wholeThenContiguous(stepSeqs), "the steps paged through are the whole history, each once, in order").toBe(true);
    // Against the scope's own head, as the last read reported it: every position through the head, and nothing past it.
    expect(stepSeqs.length, "the steps reach the scope's head").toBeGreaterThanOrEqual(stepsHead!.seq + 1);
    // And against the native fixture's own reading of the directory, taken apart from any MCP implementation: the native head
    // at the time of the first read is within what was paged, and the pages end at or before the native head now.
    const nativeNow = (await room.platform(rita.config.repository!.directory.scope).summary()).at.seq;
    expect(stepSeqs.length - 1, "the pages end at or before the directory's native head").toBeLessThanOrEqual(nativeNow);
    expect(stepSeqs.length - 1, "and at or past the head the first page reported").toBeGreaterThanOrEqual(stepsHead!.seq);
    // The record, whose entries are larger than steps, actually continues: more than one page within the bound, the last
    // without a cursor, and the pages together are the whole history, each entry once and in order.
    const recordPages: { seq: number }[][] = [];
    let recordCursor: unknown = undefined, recordHead: { seq: number } | null = null;
    for (let n = 0; n < 64; n++) {
      const next = await within("record", { scope: "directory", ...(recordCursor !== undefined ? { cursor: recordCursor } : {}) }, BOUNDS.large);
      recordPages.push(next["entries"] as { seq: number }[]);
      recordHead = next["head"] as { seq: number };
      recordCursor = next["cursor"];
      if (recordCursor === undefined) break;
    }
    expect(recordCursor, "the record continuation is exhausted").toBeUndefined();
    expect(recordPages.length, "an actual continuation: more than one page").toBeGreaterThan(1);
    for (const page of recordPages) expect(page.length, "no page is empty").toBeGreaterThan(0);
    const recorded = recordPages.flat().map((entry) => entry.seq ?? (entry as { entry?: { seq: number } }).entry?.seq ?? -1);
    expect(wholeThenContiguous(recorded), `the record's pages together are the whole history, each entry once, in order: ${JSON.stringify(recorded)} for ${JSON.stringify(whole)}`).toBe(true);
    expect(recorded.length, "the record reaches the scope's head as the last read reported it").toBeGreaterThanOrEqual(recordHead!.seq + 1);
    expect(recorded.length - 1, "the record's pages end at or before the directory's native head").toBeLessThanOrEqual((await room.platform(rita.config.repository!.directory.scope).summary()).at.seq);
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

test("the control budget is one aggregate: operations, sessions and configuration are charged as stored, and retire keeps its reserve", async () => {
  const { room, rita } = await roomWithIssues();
  // A small budget for the agent objects made in this test: 64 KiB, of which the last 8 KiB admit retire alone.
  hostedTest.controlBudget = { budget: 64 * 1024, reserve: 8 * 1024 };
  try {
    const M = rita.config.repository!.membership;
    const bot = await hosted(room, rita, "@bot", "create-bot");
    const stub = agentStub(bot.agent);
    const afterCreate = await stub.used();
    expect(afterCreate, "the creation's reservation and the agent row's configuration are charged").toBeGreaterThan(4 * 1024);
    // A session's declared capabilities are bounded; within the bound, the session row's bytes are charged and credited on DELETE.
    const big = { experimental: { pad: "x".repeat(20 * 1024) } };
    const tooLarge = await mcp(bot.bearer, "POST", { "mcp-protocol-version": LEGACY }, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LEGACY, capabilities: big, clientInfo: { name: "h", version: "0" } } });
    expect([tooLarge.status, (await tooLarge.json() as { error: { code: number } }).error.code, tooLarge.headers.get("mcp-session-id")]).toEqual([200, -32602, null]);
    const within = { experimental: { pad: "y".repeat(8 * 1024) } };
    const opened = await mcp(bot.bearer, "POST", { "mcp-protocol-version": LEGACY }, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LEGACY, capabilities: within, clientInfo: { name: "h", version: "0" } } });
    const S = opened.headers.get("mcp-session-id")!;
    expect(opened.status).toBe(200);
    const withSession = await stub.used();
    expect(withSession - afterCreate, "the session row's bytes are charged").toBeGreaterThan(8 * 1024);
    expect((await mcp(bot.bearer, "DELETE", { "mcp-protocol-version": LEGACY, "mcp-session-id": S })).status).toBe(200);
    expect(await stub.used(), "and credited when the session ends").toBe(afterCreate);
    // A session's capabilities are bounded in UTF-8 bytes: 6,000 three-byte characters are refused though they are 6,000 units.
    const multibyte = await mcp(bot.bearer, "POST", { "mcp-protocol-version": LEGACY }, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LEGACY, capabilities: { experimental: { pad: "\u20ac".repeat(6000) } }, clientInfo: { name: "h", version: "0" } } });
    expect([(await multibyte.json() as { error?: { code: number } }).error?.code, multibyte.headers.get("mcp-session-id")]).toEqual([-32602, null]);
    // Sixteen sessions, then a refused seventeenth: every one of the sixteen is still served; a valid seventeenth ends exactly the oldest.
    const sixteen: string[] = [];
    for (let n = 0; n < 16; n++) sixteen.push(await legacySession(bot.bearer));
    const afterSixteen = await stub.used();
    const list = (session: string) => mcp(bot.bearer, "POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": session }, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const refusedSeventeenth = await mcp(bot.bearer, "POST", { "mcp-protocol-version": LEGACY }, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LEGACY, capabilities: big, clientInfo: { name: "h", version: "0" } } });
    expect([(await refusedSeventeenth.json() as { error?: { code: number } }).error?.code, refusedSeventeenth.headers.get("mcp-session-id")]).toEqual([-32602, null]);
    for (const id of sixteen) expect((await list(id)).status, "every earlier session is still served after a refused seventeenth").toBe(200);
    expect((await stub.counts()).sessions).toBe(16);
    const afterLists = await stub.used();
    const seventeenth = await legacySession(bot.bearer);
    const afterSeventeenth = await stub.used();
    expect((await list(sixteen[0]!)).status, "the oldest ended").toBe(404);
    for (const id of [...sixteen.slice(1), seventeenth]) expect((await list(id)).status).toBe(200);
    expect((await stub.counts()).sessions).toBe(16);
    for (const id of [...sixteen.slice(1), seventeenth]) expect((await mcp(bot.bearer, "DELETE", { "mcp-protocol-version": LEGACY, "mcp-session-id": id })).status, id).toBe(200);
    expect(await stub.used(), `the sessions' bytes are credited (create ${afterCreate}, sixteen ${afterSixteen}, lists ${afterLists}, seventeenth ${afterSeventeenth})`).toBe(afterCreate);
    // Rotations with distinct 128-byte ops fill the budget to its ceiling for create and bearer; the next is refused 507.
    let rotations = 0;
    let bearer = bot.bearer;
    for (let n = 0; n < 40; n++) {
      const op = `rotate-${String(n).padStart(3, "0")}-${"p".repeat(117)}`;
      expect(utf8(op).length).toBe(128);
      const r = await room.wait(() => post(`/mcp/agents/${bot.agent}/bearer`, control(room, rita.secret, "bearer", M, bot.agent, "", op), ""));
      if (r.status === 507) { expect((await r.json() as { error: string }).error).toBe("full"); break; }
      expect(r.status, `rotation ${n}`).toBe(200);
      bearer = (await r.json() as { bearer: string }).bearer;
      rotations++;
    }
    expect(rotations, "the ceiling was reached by the operations' stored state").toBeGreaterThan(5);
    expect(rotations).toBeLessThan(40);
    const full = await stub.used();
    expect(full).toBeLessThanOrEqual(64 * 1024 - 8 * 1024);
    // At the ceiling, a small session still fits below it, and is kept as the incumbent; a session with 8 KiB of capabilities
    // cannot be kept: initialize answers the session-full error and issues no session, and the incumbent is untouched.
    const kept = await legacySession(bearer);
    const noRoom = await mcp(bearer, "POST", { "mcp-protocol-version": LEGACY }, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LEGACY, capabilities: within, clientInfo: { name: "h", version: "0" } } });
    expect([noRoom.status, noRoom.headers.get("mcp-session-id")]).toEqual([507, null]);
    expect((await mcp(bearer, "POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": kept }, { jsonrpc: "2.0", id: 2, method: "tools/list" })).status, "the earlier session is still served").toBe(200);
    expect((await stub.counts()).sessions).toBe(1);
    // The counters are durable: after a reset the object sees the same used bytes, and the next rotation is still refused.
    const beforeReset = await stub.used();
    await stub.reset();
    expect(await stub.used()).toBe(beforeReset);
    expect((await room.wait(() => post(`/mcp/agents/${bot.agent}/bearer`, control(room, rita.secret, "bearer", M, bot.agent, "", "rotate-after-reset"), ""))).status).toBe(507);
    // Retire draws on the reserve: it succeeds where create and bearer were refused.
    expect((await room.wait(() => post(`/mcp/agents/${bot.agent}`, control(room, rita.secret, "retire", M, bot.agent, "", "retire-at-full"), "", "DELETE"))).status).toBe(200);
    expect((await mcp(bearer, "POST", { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" }, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } })).status).toBe(401);
  } finally { done(room); }
});

test("a listing pending while its session is deleted persists nothing: the old ID stays 404 across a reset, the accounting is as before the session, and a fresh session is issued", async () => {
  const { room, rita } = await roomWithIssues();
  try {
    const bot = await hosted(room, rita, "@bot", "create-bot");
    const stub = agentStub(bot.agent);
    const list = (session: string, id: number) => mcp(bot.bearer, "POST", { "mcp-protocol-version": LEGACY, "mcp-session-id": session }, { jsonrpc: "2.0", id, method: "tools/list" });
    const before = await stub.used();
    const S = await legacySession(bot.bearer);
    expect(await stub.used(), "the session row is charged").toBeGreaterThan(before);
    // A listing's configuration read is held; the session is deleted while the listing waits; then the read is released.
    let release!: () => void;
    hostedTest.configHold = new Promise<void>((r) => { release = r; });
    const pending = list(S, 2);
    await settle(100);
    expect((await mcp(bot.bearer, "DELETE", { "mcp-protocol-version": LEGACY, "mcp-session-id": S })).status).toBe(200);
    expect(await stub.used(), "the row's bytes are credited at the delete").toBe(before);
    release();
    hostedTest.configHold = null;
    // The request that was in flight still answers; the ended session is not written again.
    expect((await pending).status).toBe(200);
    expect(await stub.used(), "no row is recreated by the pending listing").toBe(before);
    expect((await stub.counts()).sessions).toBe(0);
    expect((await list(S, 3)).status, "the old ID is gone").toBe(404);
    // A reset restores the rows as they are: none of the old session; the accounting is unchanged; a fresh session is issued.
    await stub.reset();
    expect((await list(S, 4)).status, "the old ID stays 404 after the reset").toBe(404);
    expect(await stream(bot.bearer, S).ended, "and opens no stream").toBe(404);
    expect(await stub.used()).toBe(before);
    expect((await stub.counts()).sessions).toBe(0);
    const fresh = await legacySession(bot.bearer);
    expect(fresh).not.toBe(S);
    expect((await list(fresh, 5)).status, "a fresh session is served").toBe(200);
    expect((await stub.counts()).sessions).toBe(1);
  } finally { hostedTest.configHold = null; done(room); }
});

test("H1 fences: a reset at each adopted fence of a creation resumes with the same agent, key, envelope and bearer", async () => {
  const { room, rita } = await roomWithIssues();
  try {
    const M = rita.config.repository!.membership;
    const registry = registryStub(M.scope) as unknown as { reset(): Promise<void>; agents(): Promise<{ agent: string; handle: string; key: string | null; state: string }[]>; reservedAgent(op: string): Promise<string | null> };
    const fences = ["reservation", "seed", "kept", "accepted", "complete"] as const;
    for (const [i, fence] of fences.entries()) {
      const handle = `@fence${i}`;
      const op = `create-fence-${fence}`;
      const { link } = await invite(room, rita, handle);
      const body = JSON.stringify({ link });
      hostedTest.faultAt = fence;
      // The reset: the object throws at the fence and drops its memory; the request fails with no answer.
      const failed = await room.wait(() => post("/mcp/agents", control(room, rita.secret, "create", M, null, body, op), body)).then((r) => r.status, () => -1);
      expect(failed, `${fence}: no answer`).not.toBe(201);
      expect(hostedTest.faultAt, `${fence}: the fault fired`).toBeNull();
      await registry.reset();
      const reserved = await registry.reservedAgent(op);
      expect(reserved, `${fence}: the reservation survived`).toMatch(/^[0-9a-f]{64}$/);
      await agentStub(reserved!).reset();
      // The durable facts at the fence: the key once the seed was written, the kept enrol intent once the envelope was kept.
      const before = await agentStub(reserved!).durableFacts();
      if (["seed", "kept", "accepted", "complete"].includes(fence)) expect(before.key, `${fence}: the key is durable`).toMatch(/^key_/);
      if (["kept", "accepted", "complete"].includes(fence)) expect(before.enrol, `${fence}: the envelope is kept`).toMatch(/^sha256:/);
      if (fence === "complete") expect(before.bearer, `${fence}: the bearer was minted before the reply was lost`).toBe(true);
      else expect(before.bearer, `${fence}: no bearer yet`).toBe(false);
      // The retry with the same op resumes from the durable state and answers; a further retry answers the same.
      const resumed = await room.wait(() => post("/mcp/agents", control(room, rita.secret, "create", M, null, body, op), body));
      const answer = await resumed.json() as { agent: string; key: string; bearer: string; member: FactRef };
      expect([resumed.status, answer.agent], `${fence}: resumed ${JSON.stringify(answer)}`).toEqual([201, reserved]);
      const again = await room.wait(() => post("/mcp/agents", control(room, rita.secret, "create", M, null, body, op), body));
      expect(await again.json(), `${fence}: the same answer`).toEqual(answer);
      // One key, one enrol entry signed by it: the envelope kept before the reset is the one admitted, never a second one.
      const after = await agentStub(reserved!).durableFacts();
      if (before.key) expect(after.key, `${fence}: the same key`).toBe(before.key);
      if (before.enrol) expect(after.enrol, `${fence}: the same kept envelope`).toBe(before.enrol);
      expect(after.key).toBe(answer.key);
      const enrols = (await allSteps(rita, "membership")).filter((e) => e.kind === "enrol" && e.signer === answer.key);
      expect(enrols.length, `${fence}: exactly one enrol by the agent's key`).toBe(1);
      // The admitted entry holds the intent the object kept: the envelope was never replaced.
      const entry = (await rita.ok("step", { scope: "membership", seq: enrols[0]!.seq }))["entry"] as { input: { signed: { intent: unknown } } };
      expect(intentDigestOf(entry.input.signed.intent), `${fence}: the admitted intent is the kept one`).toBe(after.enrol);
      expect((await registry.agents()).filter((a) => a.handle === handle).map((a) => [a.key, a.state])).toEqual([[answer.key, "enrolled"]]);
      // The agent acts with that bearer.
      const r = await room.wait(() => modernCall(answer.bearer, "room", {}));
      expect(r.status, `${fence}: the bearer serves`).toBe(200);
    }
  } finally { done(room); }
});

test("H6 through the endpoint: a custody budget refuses full before signing, a storage failure settles nothing and the receipt follows", async () => {
  const { room, rita } = await roomWithIssues();
  // Room for two identities' completion needs and little more.
  // Room for one identity's completion need beside the settled enrolment's record, and little more.
  hostedTest.custodyBounds = { budget: COMPLETION_BYTES + 64 * 1024, identityMost: 64 * 1024 * 1024, terminalMost: 1024, ageDays: 30 };
  try {
    const bot = await hosted(room, rita, "@bot", "create-bot");
    const result = async (r: Response) => (await r.json() as { result: { structuredContent: Record<string, unknown> } }).result.structuredContent;
    // The enrolment's record is terminal and holds no reservation. The first act's reply is lost, so it stays unresolved and
    // holds its completion need; the next act is refused full before anything is signed, and the refusal names custody.
    hostedTest.lose = `/${rita.config.repository!.directory.scope}/acts`;
    const first = await result(await room.wait(() => modernCall(bot.bearer, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "one", conditions: ["done"] }, values: [canonicalize(issueDemo)], idempotencyKey: "one" })));
    expect(first["error"], JSON.stringify(first)).toBe("transport");
    const refused = await result(await room.wait(() => modernCall(bot.bearer, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "two", conditions: ["done"] }, idempotencyKey: "two" })));
    expect(refused["error"], JSON.stringify(refused)).toBe("custody");
    expect(String(refused["message"]), "the refusal names the budget, not the envelope's size").toContain("at its budget");
    expect(((await rita.ok("steps", { scope: "directory" }))["steps"] as { kind: string | null }[]).filter((e) => e.kind === "open-issue").length, "nothing was sent for the refused act").toBe(1);
    const noRecord = await result(await room.wait(() => modernCall(bot.bearer, "settle", { idempotencyKey: "two", target: "directory" })));
    expect(noRecord["answer"], `nothing was signed or kept for the refused act: ${JSON.stringify(noRecord)}`).toBe("not-found");
    // settle resolves the first from the scope and consumes what it held; the second is admitted now; a repeat of the first
    // signs nothing and returns the retained answer.
    const settled = await result(await room.wait(() => modernCall(bot.bearer, "settle", { idempotencyKey: "one", target: "directory" })));
    expect(settled["answer"], JSON.stringify(settled)).toBe("accepted");
    const second = await result(await room.wait(() => modernCall(bot.bearer, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "two", conditions: ["done"] }, idempotencyKey: "two" })));
    expect(second["answer"], JSON.stringify(second)).toBe("accepted");
    const repeat = await result(await room.wait(() => modernCall(bot.bearer, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "one", conditions: ["done"] }, values: [canonicalize(issueDemo)], idempotencyKey: "one" })));
    expect([repeat["answer"], repeat["retained"]], JSON.stringify(repeat)).toEqual(["accepted", true]);
  } finally { done(room); }
});

test("H6 through the endpoint: a write that fails while a result is written is reported as an outcome not kept, never as nothing sent; the record stays sent, and settle under the same key writes the receipt", async () => {
  const { room, rita } = await roomWithIssues();
  hostedTest.custodyBounds = { budget: 1024 * 1024 * 1024, identityMost: 64 * 1024 * 1024, terminalMost: 1024, ageDays: 30 };
  try {
    const bot = await hosted(room, rita, "@bot", "create-bot");
    const result = async (r: Response) => (await r.json() as { result: { structuredContent: Record<string, unknown> } }).result.structuredContent;
    // The scope accepts the act; the store fails as the result is written: the tool reports that the scope answered and the
    // outcome was not kept, with what the scope said, that the act may have taken effect, and that settle under the same key is
    // the next step. It never says that nothing was sent.
    hostedTest.failWrite = "result";
    const failed = await result(await room.wait(() => modernCall(bot.bearer, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "written late", conditions: ["done"] }, values: [canonicalize(issueDemo)], idempotencyKey: "late" })));
    expect(failed["error"], JSON.stringify(failed)).toBe("custody");
    expect(String(failed["message"]), JSON.stringify(failed)).toMatch(/was sent and the scope answered accepted, and the server could not keep that outcome\. The act may have taken effect/);
    expect(String(failed["message"])).not.toMatch(/nothing was sent[.;]/);
    expect(String(failed["next"])).toMatch(/settle with the same idempotencyKey/);
    expect((await agentStub(bot.agent).custodyRecord("late"))?.phase, "the record stays sent").toBe("sent");
    const sent = ((await rita.ok("steps", { scope: "directory" }))["steps"] as { kind: string | null; signer: string | null }[]).filter((e) => e.kind === "open-issue" && e.signer === bot.key);
    expect(sent.length, "the act was admitted by the scope").toBe(1);
    // settle reads the scope's receipt and writes it now that writes succeed; the record is accepted with the same entry.
    const settled = await result(await room.wait(() => modernCall(bot.bearer, "settle", { idempotencyKey: "late", target: "directory" })));
    expect([settled["answer"], (settled["fact"] as FactRef | undefined)?.seq], JSON.stringify(settled)).toEqual(["accepted", expect.any(Number)]);
    const repeat = await result(await room.wait(() => modernCall(bot.bearer, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "written late", conditions: ["done"] }, values: [canonicalize(issueDemo)], idempotencyKey: "late" })));
    expect([repeat["answer"], repeat["retained"]], JSON.stringify(repeat)).toEqual(["accepted", true]);
    expect(((await rita.ok("steps", { scope: "directory" }))["steps"] as { kind: string | null; signer: string | null }[]).filter((e) => e.kind === "open-issue" && e.signer === bot.key).length, "never signed twice").toBe(1);
  } finally { done(room); }
});

test("H6 through the endpoint: a preparation step whose answer the store could not keep is reported as such, with the step's identity and its own recovery; the step stays sent, the same step under the same key is sent again and kept, one preparation entry", async () => {
  const { room, rita } = await roomWithIssues();
  hostedTest.custodyBounds = { budget: 1024 * 1024 * 1024, identityMost: 64 * 1024 * 1024, terminalMost: 1024, ageDays: 30 };
  try {
    const bot = await hosted(room, rita, "@bot", "create-bot");
    const stub = agentStub(bot.agent);
    const result = async (r: Response) => (await r.json() as { result: { structuredContent: Record<string, unknown> } }).result.structuredContent;
    // A lane with a commitment the agent holds: rita opens an issue and offers it to the agent, who takes it and takes a hold.
    const opened = await rita.ok("issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "a held issue", conditions: ["done"] }, values: [canonicalize(issueDemo)], idempotencyKey: "held-issue" });
    expect(opened["answer"], JSON.stringify(opened)).toBe("accepted");
    const created = await rita.ok("wait", { scope: "directory", entry: (opened["fact"] as FactRef).seq });
    const lane = (created["created"] as { scope: string; kind: string }[]).find((c) => c.kind === "lane")!.scope;
    const offer = await rita.ok("issue.offer", { target: lane, fields: { offeree: "@bot" }, idempotencyKey: "offer-bot" });
    expect(offer["answer"], JSON.stringify(offer)).toBe("accepted");
    const commitment = (offer["fact"] as FactRef).seq;
    const filed = await rita.ok("step", { scope: lane, seq: 0 });
    const terms: FactRef = { at: (offer["fact"] as FactRef).at, seq: 0, hash: filed["hash"] as Digest };
    const taken = await result(await room.wait(() => modernCall(bot.bearer, "issue.take", { target: lane, on: commitment, fields: { terms }, idempotencyKey: "take-bot" })));
    expect(taken["answer"], JSON.stringify(taken)).toBe("accepted");
    const worked = await result(await room.wait(() => modernCall(bot.bearer, "issue.work", { target: lane, fields: { commitment }, idempotencyKey: "work-bot" })));
    expect(worked["answer"], JSON.stringify(worked)).toBe("accepted");
    const hold = (worked["fact"] as FactRef).seq;
    const laneRef = (await rita.ok("inspect", { scope: lane }))["ref"] as { scope: string; inc: string; kind: string };
    const entriesBy = async () => (await allSteps(rita, lane)).filter((e) => e.signer === bot.key && e.kind !== null && e.kind.includes("instance")).length;
    // Standalone: a hold instance step, a step with no act. The lane accepts it; the store fails as the answer is written.
    const standalone = { resource: lane, capability: "hold@1", step: "instance", fields: { hold, task: { ...laneRef, kind: "task" }, instance: "i-1" }, idempotencyKey: "instance-bot" };
    hostedTest.failWrite = "result";
    const unkept = await result(await room.wait(() => modernCall(bot.bearer, "prepare", standalone)));
    expect(unkept["error"], JSON.stringify(unkept)).toBe("custody");
    expect(String(unkept["message"]), JSON.stringify(unkept)).toMatch(new RegExp(`^Step instance of hold@1 for key instance-bot was sent to ${lane} and ${lane} answered accepted, and the server could not keep that answer\\. The step may have changed the resource`));
    expect(String(unkept["message"])).not.toMatch(/nothing was sent/);
    expect(String(unkept["next"])).toMatch(/Call prepare again with the same idempotencyKey, resource, capability and step/);
    expect(String(unkept["next"])).toMatch(/Do not use a new key or settle/);
    const kept = (await stub.custodyRecord("instance-bot"))!;
    expect([kept.phase, kept.steps], "the step is kept as sent, under a record that is still unresolved").toEqual(["sent", ["sent"]]);
    expect(await entriesBy(), "the lane admitted the step once").toBe(1);
    // The same step under the same key and arguments: the same signed step is sent again, the lane repeats its answer, the
    // answer is kept, the record settles and its capacity is released; the lane holds one preparation entry.
    const again = await result(await room.wait(() => modernCall(bot.bearer, "prepare", standalone)));
    expect((again["step"] as { phase: string; answer: { answer: string } }), JSON.stringify(again)).toMatchObject({ phase: "answered", answer: { answer: "accepted" } });
    const settled = (await stub.custodyRecord("instance-bot"))!;
    expect([settled.intent, settled.phase, settled.steps, settled.reserved], "the same intent, settled, nothing reserved").toEqual([kept.intent, "settled", ["answered"], 0]);
    expect(await entriesBy(), "one preparation entry").toBe(1);
    // Ordinary: an act prepared at a resource, the report staged at the lane, then its check step. The lane answers the check;
    // the store fails as that answer is written (the write of a prepared act's record, which the store's fault names `keep`);
    // the act's record stays prepared with the check step sent, and the same prepare is the recovery.
    const report = { target: lane, kind: "report", fields: { commitment, terms, commit: "c".repeat(40), tree: "d".repeat(40) }, idempotencyKey: "report-bot", resource: lane, capability: "hold@1" };
    const staged = await result(await room.wait(() => modernCall(bot.bearer, "prepare", { ...report, step: "stage" })));
    expect((staged["step"] as { phase: string; answer: { answer: string } }), JSON.stringify(staged)).toMatchObject({ phase: "answered", answer: { answer: "accepted" } });
    const held = (await stub.custodyRecord("report-bot"))!;
    hostedTest.failWrite = "keep";
    const checked = await result(await room.wait(() => modernCall(bot.bearer, "prepare", { ...report, step: "check" })));
    expect(checked["error"], JSON.stringify(checked)).toBe("custody");
    expect(String(checked["message"]), JSON.stringify(checked)).toMatch(new RegExp(`^Step check of hold@1 for key report-bot was sent to ${lane} and ${lane} answered (accepted|refused), and the server could not keep that answer\\. The step may have changed the resource; the step is kept as sent, and the act is not submitted by this`));
    expect(String(checked["message"])).not.toMatch(/nothing was sent/);
    const unkeptCheck = (await stub.custodyRecord("report-bot"))!;
    expect([unkeptCheck.intent, unkeptCheck.phase, unkeptCheck.steps.sort()], "the act is not submitted; its check step is kept as sent beside the answered stage").toEqual([held.intent, "prepared", ["answered", "sent"]]);
    const checkedAgain = await result(await room.wait(() => modernCall(bot.bearer, "prepare", { ...report, step: "check" })));
    expect((checkedAgain["step"] as { phase: string }).phase, JSON.stringify(checkedAgain)).toBe("answered");
    expect((checkedAgain["act"] as { phase: string }).phase).toBe("prepared");
    const heldAgain = (await stub.custodyRecord("report-bot"))!;
    expect([heldAgain.intent, heldAgain.phase, heldAgain.steps.sort()], "the same act envelope, both steps answered").toEqual([held.intent, "prepared", ["answered", "answered"]]);
  } finally { done(room); }
});

test("H6 matrix through the endpoint: prepared reset, concurrent send and settle, 255 unresolved, archived refusal and replay, repeated uncertain attempts, a full create", async () => {
  const { room, rita } = await roomWithIssues();
  hostedTest.custodyBounds = { budget: 1024 * 1024 * 1024, identityMost: 64 * 1024 * 1024, terminalMost: 0, ageDays: 30 };
  try {
    const M = rita.config.repository!.membership;
    const bot = await hosted(room, rita, "@bot", "create-bot");
    const stub = agentStub(bot.agent);
    const result = async (r: Response) => (await r.json() as { result: { structuredContent: Record<string, unknown> } }).result.structuredContent;
    const open = (key: string, title = key) => modernCall(bot.bearer, "issue.create", { fields: { definition: DEMO_DIGESTS.issue, title, conditions: ["done"] }, values: [canonicalize(issueDemo)], idempotencyKey: key });
    const opened = async (signer: string) => (await allSteps(rita, "directory")).filter((e) => e.kind === "open-issue" && e.signer === signer);
    // Prepared, then reset: the dispatch write fails after the envelope was kept; the retry sends the exact bytes once.
    hostedTest.failWrite = "dispatch";
    const prepared = await result(await room.wait(() => open("prepared")));
    expect(prepared["error"], JSON.stringify(prepared)).toBe("custody");
    expect((await opened(bot.key)).length, "nothing was sent").toBe(0);
    await stub.reset();
    const resent = await result(await room.wait(() => open("prepared")));
    expect([resent["answer"], resent["retained"]], JSON.stringify(resent)).toEqual(["accepted", false]);
    expect((await opened(bot.key)).length, "sent once").toBe(1);
    // Archived terminal replay: with every terminal record archived at once, the same key returns the retained answer and sends nothing.
    const replay = await result(await room.wait(() => open("prepared")));
    expect([replay["answer"], replay["retained"]]).toEqual(["accepted", true]);
    expect((await opened(bot.key)).length).toBe(1);
    // Concurrent send and settle on one key serialize and leave one decisive outcome.
    const [sentC, settledC] = await room.wait(() => Promise.all([open("concurrent"), modernCall(bot.bearer, "settle", { idempotencyKey: "concurrent", target: "directory" })]));
    const [sentBody, settledBody] = [await result(sentC), await result(settledC)];
    expect(sentBody["answer"], JSON.stringify(sentBody)).toBe("accepted");
    expect(settledBody["answer"] ?? settledBody["error"], JSON.stringify(settledBody)).toBeDefined();
    expect((await opened(bot.key)).length, "one entry for the concurrent pair").toBe(2);
    const settledAgain = await result(await room.wait(() => modernCall(bot.bearer, "settle", { idempotencyKey: "concurrent", target: "directory" })));
    expect(settledAgain["answer"]).toBe("accepted");
    // Repeated uncertain attempts with a reset between: two lost replies, then settle: one decisive result, one entry.
    hostedTest.lose = `/${rita.config.repository!.directory.scope}/acts`;
    expect((await result(await room.wait(() => open("uncertain"))))["error"]).toBe("transport");
    await stub.reset();
    hostedTest.lose = `/${rita.config.repository!.directory.scope}/acts`;
    expect((await result(await room.wait(() => open("uncertain"))))["error"]).toBe("transport");
    const decisive = await result(await room.wait(() => modernCall(bot.bearer, "settle", { idempotencyKey: "uncertain", target: "directory" })));
    expect(decisive["answer"], JSON.stringify(decisive)).toBe("accepted");
    expect((await opened(bot.key)).length, "the resend is the same request: one entry").toBe(3);
    // An archived refusal resubmitted: the scope refuses a comment on an item that does not exist; the refusal is archived at once;
    // a plain repeat returns it; an explicit resubmit sends the same envelope again and is refused again, attempt 2.
    const lane = (resent["fact"] as FactRef);
    const created = await rita.ok("wait", { scope: "directory", entry: lane.seq });
    const laneScope = (created["created"] as { scope: string; kind: string }[]).find((c) => c.kind === "lane")!.scope;
    // The agent closes its own issue; a second close is refused by the scope, since the issue is no longer open.
    const intent = ((await rita.ok("inspect", { scope: laneScope }))["items"] as { id: number; type: string }[]).find((i) => i.type === "intent")!;
    const close = (key: string, extra: Record<string, unknown> = {}) => modernCall(bot.bearer, "issue.close-own", { target: laneScope, on: intent.id, fields: { reason: "completed" }, idempotencyKey: key, ...extra });
    const closed = await result(await room.wait(() => close("close-1")));
    expect(closed["answer"], JSON.stringify(closed)).toBe("accepted");
    const refused = await result(await room.wait(() => close("close-2")));
    expect(refused["answer"], JSON.stringify(refused)).toBe("refused");
    const repeated = await result(await room.wait(() => close("close-2")));
    expect([repeated["answer"], repeated["retained"]]).toEqual(["refused", true]);
    // The record under the key, read in the agent object: the plain repeat sent nothing (attempt 1, one outcome, archived at
    // once as refused); the explicit resubmit sent the same envelope again (the same intent digest, attempt 2, two outcomes).
    const original = (await agentStub(bot.agent).custodyRecord("close-2"))!;
    expect([original.attempt, original.outcomes, original.phase]).toEqual([1, 1, "refused"]);
    const resubmitted = await result(await room.wait(() => close("close-2", { resubmit: true })));
    expect([resubmitted["answer"], resubmitted["retained"]], JSON.stringify(resubmitted)).toEqual(["refused", false]);
    const again = (await agentStub(bot.agent).custodyRecord("close-2"))!;
    expect([again.intent, again.attempt, again.outcomes, again.phase], "the same envelope, a second attempt, a second outcome").toEqual([original.intent, 2, 2, "refused"]);
    // 256 unresolved records (the most), then the next admission is refused by count before anything is signed.
    for (let n = 0; n < 256; n++) {
      hostedTest.lose = `/${rita.config.repository!.directory.scope}/acts`;
      const lost = await result(await room.wait(() => open(`lost-${n}`)));
      expect(lost["error"], `lost-${n}: ${JSON.stringify(lost)}`).toBe("transport");
    }
    const beforeCount = (await opened(bot.key)).length;
    const overCount = await result(await room.wait(() => open("one-too-many")));
    expect(String(overCount["message"]), JSON.stringify(overCount)).toMatch(/full|unresolved/);
    expect(overCount["answer"]).toBeUndefined();
    expect((await opened(bot.key)).length, "nothing was sent past the count").toBe(beforeCount);
    // Settling one frees a slot; the next is admitted.
    expect((await result(await room.wait(() => modernCall(bot.bearer, "settle", { idempotencyKey: "lost-0", target: "directory" }))))["answer"]).toBe("accepted");
    expect((await result(await room.wait(() => open("one-too-many"))))["answer"]).toBe("accepted");
    // A full control budget refuses create before any allocation or enrolment: the registry has no row for it.
    hostedTest.controlBudget = { budget: 2048, reserve: 1024 };
    const { link } = await invite(room, rita, "@nobody");
    const body = JSON.stringify({ link });
    const registry2 = env.REGISTRIES.get(env.REGISTRIES.idFromName(`${M.scope}`)) as unknown as { reset(): Promise<void>; agents(): Promise<{ handle: string }[]>; reservedAgent(op: string): Promise<string | null> };
    await registry2.reset();
    const refusedCreate = await room.wait(() => post("/mcp/agents", control(room, rita.secret, "create", M, null, body, "create-nobody"), body));
    expect([refusedCreate.status, (await refusedCreate.json() as { error: string }).error]).toEqual([507, "full"]);
    expect(await registry2.reservedAgent("create-nobody"), "no reservation, no agent").toBeNull();
    expect((await registry2.agents()).some((a) => a.handle === "@nobody")).toBe(false);
  } finally { done(room); }
}, 180_000);

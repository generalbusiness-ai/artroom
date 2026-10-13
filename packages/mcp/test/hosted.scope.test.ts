/**
 * The hosted MCP endpoint on real scopes (notes/2026-10-13-hosted-mcp-endpoint.md, section 6): the registry and the agent
 * objects of the test Worker (`packages/scope/test/worker.ts`, over the namespace PLATFORM), reached through the Worker's own
 * routes (`mcpRoute`), with the pinned MCP client where a client is named. rita founds the room through her own MCP service
 * and performs the admin's acts; the agent is created by a control request she signs.
 */
import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import type { ControlRequest, FactRef, KeyId, MemberId, ScopeRef } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, digestBytes, keyIdOfSecret, signControl, textDigest, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { encodeAgentKeyInvitation, type AgentKeyInvitation } from "@generalbusiness/artroom-client";
import { firstExtents } from "@generalbusiness/dap-platform";
import { DEMO_DIGESTS, issueDemo } from "@generalbusiness/dap-lanes";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { mcpRoute } from "../../scope/src/worker.ts";
import { hostedTest } from "../../scope/test/worker.ts";
import { MODERN } from "../src/index.ts";
import { mcpRoom, SERVICE, type Agent, type Room } from "./support/room.ts";
import { founded } from "./support/story.ts";

/** The Worker's routes, as a client's fetch: every request of the story goes through `mcpRoute`, in this isolate. */
const routed = (url: string | URL, init?: RequestInit): Promise<Response> => mcpRoute(new Request(url, init), env).then((r) => r ?? new Response(null, { status: 404 }));
const fetchLike = ((url: string | URL | Request, init?: RequestInit) => routed(url instanceof Request ? url.url : url, init)) as unknown as typeof fetch;

/** An admin's two acts, and the agent-key invitation they make, as `dap invite --kind agent-key` would encode it. */
async function invite(room: Room, rita: Agent, handle: string): Promise<{ link: string; invitation: AgentKeyInvitation; secret: string }> {
  const M = rita.config.repository!.membership;
  const added = await rita.ok("member.add", { fields: { handle, kind: "agent", controller: "@rita" }, idempotencyKey: `add-${handle}` });
  expect(added["answer"], JSON.stringify(added)).toBe("accepted");
  const member = added["fact"] as FactRef;
  const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const invited = await rita.ok("key.invite", { fields: { member: member.seq, kind: "agent", inviteHash: textDigest(secret), inviteEnds: timeOf(room.now() + 3_600_000) }, idempotencyKey: `invite-${handle}` });
  expect(invited["answer"], JSON.stringify(invited)).toBe("accepted");
  const items = (await rita.ok("inspect", { scope: "membership" }))["items"] as { id: number; type: string; revision: number; values: Record<string, unknown> }[];
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
    const keys = (await rita.ok("inspect", { scope: "membership" }))["items"] as { type: string; state: string; values: Record<string, unknown> }[];
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

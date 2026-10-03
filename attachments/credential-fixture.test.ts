/** Private real Room credential and stdio/HTTPS controls at immutable b359. */
import { PassThrough } from "node:stream";
import { describe, expect, test } from "vitest";
import { exports } from "cloudflare:workers";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { callerFromRoster, createArtroomServer } from "@generalbusiness/artroom-mcp";
import type { ActDeclaration, McpToolset, RoomApi, RosterRecord } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy";
import { activate, bindingIn, declaredRoom, headSeq, ok, v2 } from "./declared-support.ts";
import { ASK, ORIGIN, bearer, bearerClient, httpClient } from "./declared-stage5-support.ts";
import { Client, DECLARED, addMember, clock, day, iso, makeRoom, newKeyPair, type TestRoom } from "./support.ts";

const VERIFY: ActDeclaration = { ...CODE_REVIEW_ACTS["check"]!, label: "Verify" };
const doc = (change: (acts: Record<string, ActDeclaration>) => void = () => {}) => v2((a) => { a["ask"] = ASK; a["verify"] = VERIFY; change(a); });
let rpcId = 0;
async function https(r: TestRoom, token: string, method: string, params: unknown = {}, set?: McpToolset) {
  const res = await exports.default.fetch(`${ORIGIN}/v1/rooms/${r.id}/mcp${set === undefined ? "" : `?toolset=${set}`}`, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await res.text();
  const json = text.trim().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("");
  return { status: res.status, body: JSON.parse(json) };
}

async function stdio(api: RoomApi, who: Parameters<typeof callerFromRoster>[1], set?: McpToolset) {
  const stdin = new PassThrough(); const stdout = new PassThrough();
  const server = createArtroomServer(api, { caller: async () => callerFromRoster(await api.members(), who), ...(set === undefined ? {} : { toolset: set }) });
  const replies = new Map<number, any>(); let buffer = ""; let id = 0;
  stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8"); let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1);
      const message = JSON.parse(line); if (message.id !== undefined) replies.set(message.id, message);
    }
  });
  await server.connect(new StdioServerTransport(stdin, stdout));
  const send = async (method: string, params: unknown = {}) => {
    const next = ++id; stdin.write(JSON.stringify({ jsonrpc: "2.0", id: next, method, params }) + "\n");
    for (let i = 0; i < 200 && !replies.has(next); i++) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(replies.has(next), "actual stdio transport replies to this request").toBe(true);
    return replies.get(next);
  };
  const init = await send("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "private-checker", version: "1" } });
  expect(init.result.serverInfo.name).toBe("artroom");
  stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  return { send, close: async () => { await server.close(); stdin.end(); stdout.end(); } };
}

const names = (result: any): string[] => result.tools.map((t: { name: string }) => t.name);
const parity = async (s: Awaited<ReturnType<typeof stdio>>, r: TestRoom, token: string, set?: McpToolset) => {
  const local = await s.send("tools/list"); const remote = await https(r, token, "tools/list", {}, set);
  expect(remote.status, "real credential is authenticated over HTTPS").toBe(200);
  expect(local.error, "real credential is authenticated over stdio").toBeUndefined();
  expect(local.result.tools, "actual stdio and HTTPS descriptors agree for the same credential").toEqual(remote.body.result.tools);
  return names(local.result);
};

describe.skipIf(DECLARED)("checker real credential transport controls at b359", () => {
  for (const vocabulary of ["v1", "v2"] as const) test(`admin own key ${vocabulary}: actual stdio and HTTPS all descriptors`, async () => {
    const r = vocabulary === "v1" ? await makeRoom() : await declaredRoom(doc());
    const api = await httpClient(r, r.admin.keys); const s = await stdio(api, { key: r.admin.key });
    try {
      const shown = await parity(s, r, await r.admin.session());
      expect(shown.length, "admin lists fourteen named tools plus acts and v2 generic act").toBe(vocabulary === "v1" ? 15 : 16);
      expect(shown.includes("act")).toBe(vocabulary === "v2");
    } finally { await s.close(); api[Symbol.dispose](); }
  });

  test("direct checker own key: renamed check is eligible; a later role change refreshes both transports", async () => {
    const r = await declaredRoom(doc()); const checker = await addMember(r, "@checker", "checker");
    const api = await httpClient(r, checker.keys); const token = await checker.session(); const s = await stdio(api, { key: checker.key });
    try {
      const before = await parity(s, r, token);
      expect(before, "direct checker may note and generically check but cannot review or claim").toEqual(["note", "attention", "explain", "lanes", "lane", "proposal", "acts", "act"]);
      await r.admin.ok("roster", null, { op: "set-role", member: "@checker", role: "member" });
      const after = await parity(s, r, token);
      expect(after, "next list sees the current member role").toContain("claim");
      expect(after).toContain("workspace");
    } finally { await s.close(); api[Symbol.dispose](); }
  });

  test("client-held delegated checker: exact verify grant, current delegability, and revocation refresh both transports", async () => {
    const r = await declaredRoom(doc()); const checker = await addMember(r, "@checker", "checker"); const keys = newKeyPair();
    const binding = (await bindingIn(r, "verify"))!;
    const granted = await ok<RosterRecord>(r, checker, "roster", null, { op: "delegate", to: keys.key, kinds: [], acts: { verify: binding }, lanes: "*", expiresAt: iso(clock.now + day) }, { binding: null });
    const delegate = new Client(r, keys, granted.id); const token = await delegate.session();
    const api = await httpClient(r, keys, { delegation: granted.id }); const s = await stdio(api, { key: keys.key, delegation: granted.id });
    try {
      expect(await parity(s, r, token)).toEqual(["attention", "explain", "lanes", "lane", "proposal", "acts", "act"]);
      await activate(r, doc((a) => { a["verify"] = { ...VERIFY, who: { roles: ["checker"], delegable: false } }; }));
      expect(await bindingIn(r, "verify"), "who changes leave the signed binding unchanged").toBe(binding);
      expect(await parity(s, r, token), "current who.delegable loses generic check discovery").toEqual(["attention", "explain", "lanes", "lane", "proposal", "operation", "acts"]);
      await checker.ok("roster", null, { op: "undelegate", delegation: granted.id });
      expect((await https(r, token, "tools/list")).status, "HTTPS rejects the revoked actual credential").toBe(401);
      const local = await s.send("tools/list");
      expect(local.error, "stdio refuses discovery for the revoked actual credential").toBeDefined();
    } finally { await s.close(); api[Symbol.dispose](); }
  });

  test("room-custody bearer: mixed to all-stale exact map and explicit builder override agree without rebinding", async () => {
    const r = await declaredRoom(doc()); const map = { ask: (await bindingIn(r, "ask"))!, note: (await bindingIn(r, "note"))! };
    const b = await bearer(r, "@agent", "agent", { kinds: [], acts: map }); const api = await bearerClient(r, b);
    const s = await stdio(api, { key: b.key, session: true }); const explicit = await stdio(api, { key: b.key, session: true }, "builder");
    try {
      const before = await parity(s, r, b.bearer); expect(before).toContain("note"); expect(before).toContain("act");
      await activate(r, doc((a) => { a["ask"] = { ...ASK, body: { text: { type: "text", max: 50 } } }; }));
      const mixed = await parity(s, r, b.bearer); expect(mixed).toContain("note"); expect(mixed).toContain("act");
      await activate(r, doc((a) => {
        a["ask"] = { ...ASK, body: { text: { type: "text", max: 50 } } };
        a["note"] = { ...a["note"]!, label: "Changed note", body: { ...a["note"]!.body, optional: { type: "text", max: 10, optional: true } } };
      }));
      expect(await parity(s, r, b.bearer), "all-stale delegated default is observer").toEqual(["attention", "explain", "lanes", "lane", "proposal", "operation", "acts"]);
      const selected = await parity(explicit, r, b.bearer, "builder");
      expect(selected, "explicit builder keeps its core reads despite observer default").toContain("workspace");
      expect(selected).not.toContain("act"); expect(selected).not.toContain("note");
      const roster = await api.members(); const d = roster.delegations.find((d) => d.id === b.delegation)!;
      expect(d.acts, "tools/list keeps the signed grant map byte-for-byte").toEqual(map);
    } finally { await s.close(); await explicit.close(); api[Symbol.dispose](); }
  });

  test("own-key stdio accepted exact retry survives later key revocation although discovery is unauthenticated", async () => {
    const r = await declaredRoom(doc()); const member = await addMember(r, "@member", "member"); const api = await httpClient(r, member.keys); const s = await stdio(api, { key: member.key }, "observer");
    const args = { goal: "Own key retry", scope: ["src/**"], idempotencyKey: "checker-own-once" };
    try {
      const shown = await s.send("tools/list"); expect(names(shown.result)).not.toContain("claim");
      const first = await s.send("tools/call", { name: "claim", arguments: args });
      expect(first.result.structuredContent, "unlisted tool is judged by actual Room admission").toMatchObject({ kind: "claim", by: { via: "member", member: "@member" } });
      await r.admin.ok("roster", null, { op: "revoke-key", key: member.key, reason: "retired" });
      const seq = await headSeq(r); const list = await s.send("tools/list"); expect(list.error).toBeDefined();
      const retry = await s.send("tools/call", { name: "claim", arguments: args });
      expect(retry.result.structuredContent, "saved signed exact envelope returns the original receipt after revocation").toEqual(first.result.structuredContent);
      expect(await headSeq(r), "same-key exact retry produces no new effect").toBe(seq);
    } finally { await s.close(); api[Symbol.dispose](); }
  });
});

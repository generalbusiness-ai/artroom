/**
 * The MCP core runtime (request 9ca1d290; docs/protocol.md section 34,
 * R-API-9 and R-API-13 to R-API-15), at the interface: `tools/list` and
 * `tools/call` over the Worker handler and the stdio server, against the
 * fake room, and the runner against a recording `RoomApi`.
 *
 * - descriptors: sixteen tools in a fixed order, with titles, output
 *   schemas that every result fits, fixed annotations and bounded text;
 * - toolsets: what a caller is shown follows its authorization and the
 *   toolset it asked for, and never what it may call;
 * - keys: every act tool requires `idempotencyKey`;
 * - waits: a whole number from 0 to 45,000, and a read that holds nothing.
 */

import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { connect, generateSigner, isRefusal, join, redeem } from "@generalbusiness/artroom-client";
import type { ActDeclaration, Catalogue, Claim, HttpRoom, McpToolset, Proposal, Redeemed, Role, RoomApi, Update } from "@generalbusiness/artroom-contract";
import { decodeUpdates } from "../../client/src/room.ts";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy";
import {
  ACT_TOOLS,
  INSTRUCTIONS,
  MAX_WAIT_MS,
  TOOLS,
  TOOL_LIST,
  callTool,
  callerFromRoster,
  defaultToolset,
  eligible,
  listedTools,
  toolsFor,
  toolsetOf,
  validate,
  type McpCaller,
} from "../src/index.ts";
import { serveArtroomStdio } from "../src/stdio.ts";
import { keyed, roomWithMcp, rpc, type FakeRoom, type Url } from "./support.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  ({ room, url } = await roomWithMcp());
});
afterEach(() => room.stop());

// ------------------------------------------------------------ fixtures

/** The fixed order of `tools/list` (R-API-13): the fourteen named tools, then `acts` and `act`. */
const ORDER = ["claim", "workspace", "propose", "note", "review", "land", "renew", "release", "attention", "explain", "lanes", "lane", "proposal", "operation", "acts", "act"];
/** R-API-14's table, with the generic tools composed in: `acts` in every set, `act` in builder, reviewer and all. */
const SETS: Record<McpToolset, readonly string[]> = {
  builder: ["attention", "claim", "workspace", "propose", "note", "land", "release", "renew", "lane", "proposal", "explain", "operation", "act", "acts"],
  reviewer: ["attention", "lanes", "lane", "proposal", "note", "review", "explain", "act", "acts"],
  observer: ["attention", "lanes", "lane", "proposal", "explain", "operation", "acts"],
  all: ORDER,
};
const inOrder = (names: readonly string[]) => ORDER.filter((n) => names.includes(n));
const without = (names: readonly string[], ...drop: string[]) => inOrder(names).filter((n) => !drop.includes(n));

/** A kind no client has a method for. */
const ASK: ActDeclaration = { label: "Ask", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 200 } }, who: { roles: ["member", "agent"] } };
/** A check step under another name: only a checker may sign it. */
const VERIFY: ActDeclaration = { ...CODE_REVIEW_ACTS["check"]!, label: "Verify" };
const DECLARED = { ...CODE_REVIEW_ACTS, ask: ASK, verify: VERIFY };

const names = (tools: readonly { name: string }[]) => tools.map((t) => t.name);
const shown = async (caller: McpCaller, catalogue: Catalogue, set?: McpToolset) => names(await toolsFor(caller, catalogue, set));
const active = async (): Promise<Catalogue> => (await room.catalogue({}))!;
const bindings = async (...kinds: string[]) => Object.fromEntries(await Promise.all(kinds.map(async (k) => [k, (await room.bindingOf(k))!] as const)));
const STALE = `sha256:${"0".repeat(64)}`;

async function bearer(handle: `@${string}`, role: Role, session: { kinds?: string[] | "*"; acts?: Record<string, string> } = {}): Promise<Redeemed> {
  const { invitation, secret } = await room.invite(handle, { role, custody: "room", ...(session.kinds !== undefined ? { kinds: session.kinds as never } : {}), ...(session.acts !== undefined ? { acts: session.acts } : {}) });
  const out = await redeem({ url }, room.id, { invitation, secret });
  if (isRefusal(out)) throw new Error(out.rule);
  return out;
}

async function member(handle: `@${string}`, role: Role = "member"): Promise<{ api: HttpRoom; key: string }> {
  const { invitation, secret } = await room.invite(handle, { role });
  const { signer } = await generateSigner();
  const joined = await join({ url }, room.id, { invitation, secret, signer });
  if (isRefusal(joined)) throw new Error(joined.rule);
  return { api: await connect({ url }, room.id, { kind: "key", signer }), key: signer.key };
}

const list = async (b: Redeemed, query = "") => rpc(`${b.mcp}${query}`, b.bearer, "tools/list");
const listed = async (b: Redeemed, query = ""): Promise<string[]> => names((await list(b, query)).body.result.tools);
const call = async (b: Redeemed, name: string, args: unknown, query = "") => (await rpc(`${b.mcp}${query}`, b.bearer, "tools/call", { name, arguments: keyed(name, args) })).body.result;
const head = (c: string) => c.repeat(40);

/** `tools/list` from a stdio server, as a local agent's host asks for it. */
async function stdioList(api: RoomApi, caller: () => Promise<McpCaller>, toolset?: McpToolset): Promise<any[]> {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const handle = serveArtroomStdio(api, { caller, ...(toolset !== undefined ? { toolset } : {}) }, { transport: new StdioServerTransport(stdin, stdout) });
  const replies = new Map<number, any>();
  let buffer = "";
  stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
      const msg = JSON.parse(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      if (msg.id !== undefined) replies.set(msg.id, msg);
    }
  });
  const send = async (id: number | undefined, method: string, params: unknown = {}) => {
    stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params })}\n`);
    if (id === undefined) return undefined;
    for (let i = 0; i < 5_000 && !replies.has(id); i++) await new Promise((r) => setTimeout(r, 1));
    return replies.get(id);
  };
  await send(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  await send(undefined, "notifications/initialized");
  const out = await send(2, "tools/list");
  await handle.close();
  return out.result.tools;
}

/** One long-lived stdio server, as a local agent's host keeps it: `list()` gives each whole reply to `tools/list`, error or result. */
async function stdioServer(api: RoomApi, caller: () => Promise<McpCaller>): Promise<{ list(): Promise<any>; close(): Promise<void> }> {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const handle = serveArtroomStdio(api, { caller }, { transport: new StdioServerTransport(stdin, stdout) });
  const replies = new Map<number, any>();
  let buffer = "";
  stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
      const msg = JSON.parse(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      if (msg.id !== undefined) replies.set(msg.id, msg);
    }
  });
  let id = 0;
  const send = async (method: string, params: unknown = {}) => {
    const mine = ++id;
    stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: mine, method, params })}\n`);
    for (let i = 0; i < 5_000 && !replies.has(mine); i++) await new Promise((r) => setTimeout(r, 1));
    return replies.get(mine);
  };
  await send("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  return { list: () => send("tools/list"), close: () => handle.close() };
}

/** A `RoomApi` that records every call and answers from `answers`; a method with no answer throws. */
function recording(answers: Record<string, (...args: any[]) => unknown>): { room: RoomApi; calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  const room = new Proxy(
    {},
    {
      get: (_t, method: string) => {
        if (method === "then") return undefined;
        if (!Object.hasOwn(answers, method)) return undefined;
        return async (...args: unknown[]) => {
          calls.push({ method, args });
          return answers[method]!(...args);
        };
      },
    },
  ) as RoomApi;
  return { room, calls };
}
const artroomError = (code: string, message = code) => ({ name: "ArtroomError", code, message, retryable: false });
const LANE = "act_7_0c1d2e3f";

// ------------------------------------------------------------ descriptors (R-API-13)

describe("descriptors: sixteen tools, each with a title, an output schema and fixed annotations (R-API-13)", () => {
  test("tools/list as an admin shows the fourteen named tools, then acts and act, in a fixed order, with exactly the advertised fields", async () => {
    await room.activate(DECLARED);
    const tools = await stdioList(await connect({ url }, room.id, { kind: "key", signer: room.admin.signer }), async () => ({ role: "admin" }));
    expect(names(tools)).toEqual(ORDER);
    expect(tools).toHaveLength(16);
    for (const t of tools) {
      // `method` and `toolsets` stay on the server.
      expect(Object.keys(t).sort(), t.name).toEqual(["annotations", "description", "inputSchema", "name", "outputSchema", "title"]);
      expect(typeof t.title === "string" && t.title.length > 0, t.name).toBe(true);
      expect(t.outputSchema.type, t.name).toBe("object");
    }
    expect(tools).toEqual(JSON.parse(JSON.stringify(listedTools())));
    expect(new Set(tools.map((t) => t.title)).size).toBe(16);
  });

  test("under an active v1 document an admin's list is the fourteen named tools and acts: the generic act is absent, and the rest is as under v2", async () => {
    // No document was activated: the room is under the legacy vocabulary.
    expect((await active()).vocabulary).not.toBe("declared");
    const api = await connect({ url }, room.id, { kind: "key", signer: room.admin.signer });
    const legacy = await stdioList(api, async () => ({ role: "admin" }));
    expect(names(legacy)).toEqual(without(ORDER, "act"));
    expect(legacy).toHaveLength(15);
    // Asking for `all` by name shows no generic act either: a v: 2 envelope is bad-request under a v1 document.
    expect(names(await stdioList(api, async () => ({ role: "admin" }), "all"))).toEqual(without(ORDER, "act"));
    for (const t of legacy) expect(Object.keys(t).sort(), t.name).toEqual(["annotations", "description", "inputSchema", "name", "outputSchema", "title"]);
    expect(legacy).toEqual(JSON.parse(JSON.stringify(listedTools())).filter((t: { name: string }) => t.name !== "act"));
    // The same admin, once a v2 document is active, sees all sixteen.
    await room.activate(DECLARED);
    expect(names(await stdioList(api, async () => ({ role: "admin" })))).toEqual(ORDER);
  });

  test("the annotations are the rule's table, and act's are conservative whatever an earlier call did", async () => {
    const hints = (readOnlyHint: boolean, destructiveHint: boolean) => ({ readOnlyHint, destructiveHint, idempotentHint: true, openWorldHint: false });
    const table: Record<string, ReturnType<typeof hints>> = {};
    for (const n of ["attention", "explain", "lanes", "lane", "proposal", "operation", "acts"]) table[n] = hints(true, false);
    for (const n of ["claim", "propose", "note", "review", "renew", "workspace"]) table[n] = hints(false, false);
    for (const n of ["land", "release", "act"]) table[n] = hints(false, true);
    expect(Object.fromEntries(TOOL_LIST.map((t) => [t.name, t.annotations]))).toEqual(table);

    // After `act` performs a comment, the list still shows `act` as it was: not read-only, possibly destructive.
    await room.activate(DECLARED);
    const b = await bearer("@agent", "agent", { kinds: [], acts: await bindings("ask", "claim") });
    const before = (await list(b)).body.result.tools;
    const claim = (await call(b, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    const asked = await call(b, "act", { kind: "ask", target: { act: claim.id }, body: { text: "why?" }, binding: (await room.bindingOf("ask"))! });
    expect(asked.structuredContent).toMatchObject({ kind: "ask" });
    const after = (await list(b)).body.result.tools;
    expect(after).toEqual(before);
    expect(after.find((t: { name: string }) => t.name === "act").annotations).toEqual(hints(false, true));
    expect(after.find((t: { name: string }) => t.name === "acts").annotations).toEqual(hints(true, false));
  });

  test("each descriptor's toolsets are the rule's table: acts in every set, act in builder, reviewer and all, no act tool in observer", () => {
    for (const set of ["builder", "reviewer", "observer", "all"] as const) {
      expect(TOOL_LIST.filter((t) => (t.toolsets as readonly string[]).includes(set)).map((t) => t.name), set).toEqual(inOrder(SETS[set]));
    }
    expect(SETS.builder.filter((n) => n !== "act" && n !== "acts")).toHaveLength(12);
    expect(SETS.reviewer.filter((n) => n !== "act" && n !== "acts")).toHaveLength(7);
    for (const n of SETS.observer) expect((ACT_TOOLS as readonly string[]).includes(n), n).toBe(false);
    expect(SETS.observer).not.toContain("workspace");
  });

  test("descriptions are at most 1,000 characters and instructions at most 512, and the instructions stand alone", () => {
    for (const t of TOOL_LIST) {
      expect(t.description.length, t.name).toBeLessThanOrEqual(1000);
      expect(t.description.length, t.name).toBeGreaterThan(40);
    }
    expect(INSTRUCTIONS.length).toBeLessThanOrEqual(512);
    expect(INSTRUCTIONS).toMatch(/coordinates changes to one git repository/);
    expect(INSTRUCTIONS).toMatch(/Call attention first/);
    expect(INSTRUCTIONS).toMatch(/read rule, reason and fix, and do the fix/);
    expect(INSTRUCTIONS).toMatch(/Every act needs an idempotencyKey/);
  });

  test("a success and a refusal of every act tool and of workspace fit the advertised output schema; so does every read", async () => {
    const b = await bearer("@agent", "agent");
    const other = await bearer("@other", "agent");
    const narrow = await bearer("@narrow", "agent", { kinds: ["claim"] });
    const bob = await member("@bob");
    const seen: Record<string, { ok: number; refused: number }> = {};
    /** One call whose structured content must fit the tool's own advertised schema, and no error. */
    const fits = async (who: Redeemed, name: keyof typeof TOOLS, args: unknown) => {
      const res = await call(who, name, args);
      expect(res.isError, `${name}: ${res.content[0].text}`).toBe(false);
      expect(validate(TOOLS[name].outputSchema, res.structuredContent, name), `${name}: ${res.content[0].text}`).toEqual([]);
      const tally = (seen[name] ??= { ok: 0, refused: 0 });
      if (res.structuredContent.refused === true) {
        tally.refused++;
        // The text gives rule, reason and fix (R-API-13).
        expect(res.content[0].text.split("\n")[0]).toMatch(new RegExp(`^Refused \\(${res.structuredContent.rule}\\): .+`));
      } else tally.ok++;
      return res.structuredContent;
    };
    const claim = (await fits(b, "claim", { goal: "Fix login copy", scope: ["src/ui/**"] })) as Claim;
    const held = { lane: claim.lane, lease: claim.lease.generation };
    await fits(other, "claim", { lane: claim.lane, expectedGeneration: 0, scope: ["src/ui/**"] }); // lane-held
    const ws = (await fits(b, "workspace", { ...held, waitMs: 2000 })) as { op: { id: string } };
    await fits(other, "workspace", { ...held, waitMs: 0 }); // not-holder
    const p = (await fits(b, "propose", { ...held, head: head("a"), expectedGeneration: 0, summary: "one" })) as Proposal;
    const moved = await fits(b, "propose", { ...held, head: head("b"), expectedGeneration: 0, summary: "two" });
    expect(moved).toMatchObject({ refused: true, rule: "generation-moved" });
    await fits(b, "note", { anchor: { act: claim.id }, text: "started" });
    await fits(narrow, "note", { anchor: { act: claim.id }, text: "not granted" }); // delegation-invalid
    await fits(b, "renew", held);
    await fits(other, "renew", held);
    await fits(b, "land", { ...held, generation: p.generation, head: p.head }); // obligation-open
    await fits(b, "review", { lane: claim.lane, generation: p.generation, head: p.head, verdict: "approve", scope: ["src/ui/**"], text: "mine" }); // self-review
    expect(isRefusal(await bob.api.review(p, { verdict: "approve", scope: ["src/ui/**"], text: "ok" }))).toBe(false);
    await fits(b, "land", { ...held, generation: p.generation, head: p.head, waitMs: 5000 });
    await fits(other, "release", held);
    await fits(b, "release", { ...held, note: "done" });
    // A second lane, so `review` has a success: `@other` proposes and `@agent` reviews.
    const theirs = (await fits(other, "claim", { goal: "Docs", scope: ["docs/**"] })) as Claim;
    const q = (await fits(other, "propose", { lane: theirs.lane, lease: 1, head: head("c"), expectedGeneration: 0, summary: "docs" })) as Proposal;
    await fits(b, "review", { lane: theirs.lane, generation: q.generation, head: q.head, verdict: "approve", scope: ["docs/**"], text: "ok" });

    // The reads: a found and a not-found form each fit, and a refusal fits none of them.
    const refusal = { refused: true, rule: "lease-fenced", reason: "The lease ended." };
    for (const [name, args] of [
      ["attention", {}],
      ["explain", { act: claim.id }],
      ["explain", { act: "act_999_00000000" }],
      ["lanes", {}],
      ["lane", { lane: claim.lane }],
      ["lane", { lane: "act_999_00000000" }],
      ["proposal", { lane: claim.lane, generation: 1 }],
      ["proposal", { lane: claim.lane, generation: 9 }],
      ["operation", { id: ws.op.id, kind: "workspace" }],
      ["operation", { id: "op_land_999", kind: "land" }],
      ["acts", {}],
      ["acts", { policy: "act_999_00000000" }],
    ] as const) {
      await fits(b, name, args);
      expect(validate(TOOLS[name].outputSchema, refusal).length, name).toBeGreaterThan(0);
    }
    expect((await call(b, "operation", { id: ws.op.id, kind: "workspace" })).structuredContent).toMatchObject({ id: ws.op.id, state: "ready" });

    // The generic act, in a room that declares its acts: its record, and a `binding-stale` refusal.
    await room.activate(DECLARED);
    const generic = await bearer("@generic", "agent", { kinds: [], acts: await bindings("ask") });
    await fits(generic, "act", { kind: "ask", target: { act: claim.id }, body: { text: "why?" }, binding: (await room.bindingOf("ask"))! });
    await fits(generic, "act", { kind: "ask", target: { act: claim.id }, body: { text: "why?" }, binding: STALE });
    await fits(generic, "acts", {});
    for (const name of [...ACT_TOOLS, "workspace"]) expect([name, seen[name]!.ok > 0, seen[name]!.refused > 0], JSON.stringify(seen)).toEqual([name, true, true]);
  });
});

// ------------------------------------------------------------ the four reads (R-API-9)

describe("lanes, lane, proposal and operation read through RoomApi (R-API-9)", () => {
  test("lane and proposal of unknown IDs, and an unknown operation, are structured not-found results; lanes with touches gives the overlapping lanes", async () => {
    const b = await bearer("@agent", "agent");
    const src = (await call(b, "claim", { goal: "api", scope: ["src/api/**"] })).structuredContent as Claim;
    const docs = (await call(b, "claim", { goal: "docs", scope: ["docs/**"] })).structuredContent as Claim;

    const lane = await call(b, "lane", { lane: src.lane });
    expect(lane.structuredContent).toMatchObject({ lane: src.lane, state: "held", generation: 0, scope: ["src/api/**"] });
    expect(lane.content[0].text.split("\n")[0]).toBe(`Lane ${src.lane} is held at generation 0.`);
    const noLane = await call(b, "lane", { lane: "act_999_00000000" });
    expect(noLane.isError).toBe(false);
    expect(noLane.structuredContent).toEqual({ outcome: "not-found", what: "lane" });
    expect(noLane.content[0].text.split("\n")[0]).toBe("The room has no such lane. Check the ID.");

    const p = (await call(b, "propose", { lane: src.lane, lease: 1, head: head("a"), expectedGeneration: 0, summary: "s" })).structuredContent as Proposal;
    const proposal = await call(b, "proposal", { lane: src.lane, generation: 1 });
    expect(proposal.structuredContent).toMatchObject({ id: p.id, head: p.head, generation: 1, obligations: expect.any(Array) });
    expect((await call(b, "proposal", { lane: src.lane, generation: 2 })).structuredContent).toEqual({ outcome: "not-found", what: "proposal" });

    const all = await call(b, "lanes", {});
    expect(all.structuredContent.items.map((l: { lane: string }) => l.lane).sort()).toEqual([src.lane, docs.lane].sort());
    expect(all.content[0].text.split("\n")[0]).toBe("2 lanes.");
    const touching = await call(b, "lanes", { touches: "src/api/login.ts" });
    expect(touching.structuredContent.items.map((l: { lane: string }) => l.lane)).toEqual([src.lane]);
    expect((await call(b, "lanes", { state: "unheld" })).structuredContent.items).toEqual([]);

    const ws = (await call(b, "workspace", { lane: src.lane, lease: 1, waitMs: 2000 })).structuredContent;
    const op = await call(b, "operation", { id: ws.op.id, kind: "workspace" });
    expect(op.structuredContent).toMatchObject({ id: ws.op.id, kind: "workspace", state: "ready", lane: src.lane });
    expect(op.content[0].text.split("\n")[0]).toBe(`Operation ${ws.op.id} is ready.`);
    const noOp = await call(b, "operation", { id: "op_land_999", kind: "land" });
    expect(noOp.isError).toBe(false);
    expect(noOp.structuredContent).toEqual({ outcome: "not-found", what: "operation" });
  });

  test("each read calls its RoomApi method with the caller's input, and nothing else", async () => {
    const page = { items: [], cursor: "c1", more: false };
    const r = recording({ lanes: () => page, lane: () => null, proposal: () => null });
    expect((await callTool(r.room, "lanes", { state: "held", holder: "@ada", touches: "src/**", cursor: "c0", limit: 5 })).structuredContent).toEqual(page);
    expect((await callTool(r.room, "lane", { lane: LANE })).structuredContent).toEqual({ outcome: "not-found", what: "lane" });
    expect((await callTool(r.room, "proposal", { lane: LANE, generation: 3 })).structuredContent).toEqual({ outcome: "not-found", what: "proposal" });
    expect(r.calls).toEqual([
      { method: "lanes", args: [{ state: "held", holder: "@ada", touches: "src/**", cursor: "c0", limit: 5 }] },
      { method: "lane", args: [LANE] },
      { method: "proposal", args: [{ lane: LANE, generation: 3 }] },
    ]);
  });

  test("operation: only the lookup's not-found becomes a result; unauthenticated, forbidden and unavailable stay errors", async () => {
    const missing = recording({
      op: () => {
        throw artroomError("not-found", "There is no such operation.");
      },
    });
    const none = await callTool(missing.room, "operation", { id: "op_land_1", kind: "land", waitMs: 100 });
    expect(none.isError).toBe(false);
    expect(none.structuredContent).toEqual({ outcome: "not-found", what: "operation" });
    expect(missing.calls.map((c) => c.method)).toEqual(["op"]);
    for (const code of ["unauthenticated", "forbidden", "unavailable"]) {
      const failing = recording({
        op: () => {
          throw artroomError(code);
        },
      });
      const out = await callTool(failing.room, "operation", { id: "op_land_1", kind: "land" });
      expect([code, out.isError]).toEqual([code, true]);
      expect(out.structuredContent).toMatchObject({ name: "ArtroomError", code });
    }
  });
});

// ------------------------------------------------------------ keys (R-API-9)

describe("every act tool requires idempotencyKey (R-API-9)", () => {
  test("the schema requires it for the eight act tools, act included, and for no other tool", () => {
    expect([...ACT_TOOLS].sort()).toEqual(["act", "claim", "land", "note", "propose", "release", "renew", "review"]);
    for (const t of TOOL_LIST) {
      const requires = (t.inputSchema.required ?? []).includes("idempotencyKey");
      expect([t.name, requires]).toEqual([t.name, (ACT_TOOLS as readonly string[]).includes(t.name)]);
      expect([t.name, Object.hasOwn(t.inputSchema.properties ?? {}, "idempotencyKey")]).toEqual([t.name, requires]);
    }
  });

  const VALID: Record<(typeof ACT_TOOLS)[number], Record<string, unknown>> = {
    claim: { goal: "g", scope: ["src/**"] },
    propose: { lane: LANE, lease: 1, head: head("a"), expectedGeneration: 0, summary: "s" },
    note: { anchor: { act: LANE }, text: "hi" },
    review: { lane: LANE, generation: 1, head: head("a"), verdict: "approve", scope: ["src/**"], text: "ok" },
    land: { lane: LANE, lease: 1, generation: 1, head: head("a") },
    renew: { lane: LANE, lease: 1 },
    release: { lane: LANE, lease: 1 },
    act: { kind: "ask", target: { act: LANE }, body: { text: "x" }, binding: STALE },
  };

  test("each of the eight act tools without a key is bad-request, says how to add one, and the room is never asked", async () => {
    const record = { id: "act_9_00000000", lane: LANE, lease: { generation: 1 }, generation: 1, op: { id: "op_land_9", state: "accepted" } };
    for (const name of ACT_TOOLS) {
      const r = recording({ lane: () => null, claim: () => record, propose: () => record, note: () => record, review: () => record, land: () => record, renew: () => record, release: () => record, act: () => record });
      const out = await callTool(r.room, name, VALID[name]);
      expect(out.isError, name).toBe(true);
      expect(out.structuredContent, name).toMatchObject({ name: "ArtroomError", code: "bad-request", retryable: false });
      const message = (out.structuredContent as { message: string }).message;
      expect(message, name).toContain("input.idempotencyKey: is required");
      expect(message, name).toContain("Add any unique string as idempotencyKey, and reuse the same one to retry this call.");
      expect(r.calls, name).toEqual([]);
      // With a key the same input reaches the room.
      const ok = await callTool(r.room, name, { ...VALID[name], idempotencyKey: "k1" });
      expect(ok.isError, name).toBe(false);
      expect(r.calls.at(-1)!.method).toBe(name);
    }
  });

  test("a key of the wrong form is bad-request without the advice for a missing one; workspace takes no key", async () => {
    const r = recording({ claim: () => ({}) });
    const out = await callTool(r.room, "claim", { ...VALID.claim, idempotencyKey: "has spaces" });
    expect(out.structuredContent).toMatchObject({ code: "bad-request" });
    expect((out.structuredContent as { message: string }).message).toContain("input.idempotencyKey: does not match");
    expect((out.structuredContent as { message: string }).message).not.toContain("Add any unique string");
    const ws = await callTool(r.room, "workspace", { lane: LANE, lease: 1, idempotencyKey: "k1" });
    expect((ws.structuredContent as { message: string }).message).toContain("input.idempotencyKey: is not allowed");
    expect(r.calls).toEqual([]);
  });

  test("claim with no key records nothing; with a key and a lost reply, the same call again gives one claim and its receipt", async () => {
    const b = await bearer("@agent", "agent");
    const entries = room.entries.length;
    const keyless = (await rpc(b.mcp, b.bearer, "tools/call", { name: "claim", arguments: { goal: "g", scope: ["src/**"] } })).body.result;
    expect(keyless.isError).toBe(true);
    expect(keyless.structuredContent).toMatchObject({ code: "bad-request" });
    expect(room.entries.length).toBe(entries);
    expect(room.lanes.size).toBe(0);

    const args = { goal: "g", scope: ["src/**"], idempotencyKey: "claim-once" };
    room.faults.push({ route: "POST /mcp", kind: "drop" });
    await expect(rpc(b.mcp, b.bearer, "tools/call", { name: "claim", arguments: args })).rejects.toThrow();
    const claims = () => room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === "claim");
    expect(claims()).toHaveLength(1);
    const original = room.constructor as unknown as { idOf(e: unknown): string };
    const retried = (await rpc(b.mcp, b.bearer, "tools/call", { name: "claim", arguments: args })).body.result;
    expect(retried.isError).toBe(false);
    expect(retried.structuredContent).toMatchObject({ kind: "claim", id: original.idOf(claims()[0]) });
    expect(claims()).toHaveLength(1);
    expect(room.lanes.size).toBe(1);
  });

  test("the generic act with a lost reply: the same key and binding again give one act and its original record", async () => {
    await room.activate(DECLARED);
    const b = await bearer("@agent", "agent", { kinds: [], acts: await bindings("ask", "claim") });
    const claim = (await call(b, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    const args = { kind: "ask", target: { act: claim.id }, body: { text: "why?" }, binding: (await room.bindingOf("ask"))!, idempotencyKey: "ask-once" };
    room.faults.push({ route: "POST /mcp", kind: "drop" });
    await expect(rpc(b.mcp, b.bearer, "tools/call", { name: "act", arguments: args })).rejects.toThrow();
    const asks = () => room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === "ask");
    expect(asks()).toHaveLength(1);
    const retried = (await rpc(b.mcp, b.bearer, "tools/call", { name: "act", arguments: args })).body.result;
    expect(retried.structuredContent).toMatchObject({ kind: "ask", seq: asks()[0]!.seq });
    expect(asks()).toHaveLength(1);
  });

  test("with a member's own key over stdio's handle, a repeated call with the same key gives one act and the same record", async () => {
    const alice = await member("@alice");
    const args = { goal: "Local work", scope: ["docs/**"], idempotencyKey: "local-claim-1" };
    const first = await callTool(alice.api, "claim", args);
    const again = await callTool(alice.api, "claim", args);
    expect(first.isError).toBe(false);
    expect((again.structuredContent as { id: string }).id).toBe((first.structuredContent as { id: string }).id);
    expect(room.lanes.size).toBe(1);
  });
});

// ------------------------------------------------------------ waits (R-API-15)

describe("waitMs is a whole number from 0 to 45,000 (R-API-15)", () => {
  const WAITING: Record<string, Record<string, unknown>> = {
    attention: {},
    workspace: { lane: LANE, lease: 1 },
    land: { lane: LANE, lease: 1, generation: 1, head: head("a"), idempotencyKey: "l1" },
    operation: { id: "op_land_1", kind: "land" },
  };

  test("exactly four tools take waitMs, each with the same bounds", () => {
    expect(MAX_WAIT_MS).toBe(45_000);
    const taking = TOOL_LIST.filter((t) => Object.hasOwn(t.inputSchema.properties ?? {}, "waitMs"));
    expect(names(taking)).toEqual(["workspace", "land", "attention", "operation"]);
    for (const t of taking) expect(t.inputSchema.properties!["waitMs"]).toMatchObject({ type: "integer", minimum: 0, maximum: 45_000 });
  });

  test("each of the four refuses a waitMs that is too large, negative, fractional, not a number or not finite, before the room is asked", async () => {
    for (const name of Object.keys(WAITING)) {
      const r = recording({ lane: () => null, attention: () => ({}), workspace: () => ({}), land: () => ({}), op: () => ({}), wait: () => ({}) });
      for (const bad of [45_001, 60_000, -1, 1.5, "100", null, Number.POSITIVE_INFINITY, Number.NaN]) {
        const out = await callTool(r.room, name, { ...WAITING[name], waitMs: bad });
        expect([name, bad, out.isError]).toEqual([name, bad, true]);
        expect(out.structuredContent, name).toMatchObject({ name: "ArtroomError", code: "bad-request" });
        expect((out.structuredContent as { message: string }).message, name).toContain("input.waitMs:");
      }
      expect(r.calls, name).toEqual([]);
      for (const good of [0, 1, 45_000]) expect(validate(TOOLS[name as keyof typeof TOOLS].inputSchema, { ...WAITING[name], waitMs: good }), name).toEqual([]);
    }
  });

  test("workspace waits 20,000 ms by default and the given time otherwise; on timeout it returns the operation's current state", async () => {
    const pending = { id: "op_ws_1", kind: "workspace", state: "pending", lane: LANE, updatedAt: "t" };
    const waits: unknown[] = [];
    const r = recording({
      lane: () => null,
      workspace: () => pending,
      wait: (_op: unknown, opts: unknown) => {
        waits.push(opts);
        throw artroomError("timeout");
      },
      op: () => ({ ...pending, updatedAt: "later" }),
    });
    const dflt = await callTool(r.room, "workspace", { lane: LANE, lease: 1 });
    expect(dflt.structuredContent).toEqual({ op: { ...pending, updatedAt: "later" }, grant: null });
    await callTool(r.room, "workspace", { lane: LANE, lease: 1, waitMs: 7 });
    await callTool(r.room, "workspace", { lane: LANE, lease: 1, waitMs: 45_000 });
    expect(waits).toEqual([
      { until: ["ready", "failed"], timeoutMs: 20_000 },
      { until: ["ready", "failed"], timeoutMs: 7 },
      { until: ["ready", "failed"], timeoutMs: 45_000 },
    ]);
  });

  test("land does not wait by default; with waitMs it waits for a terminal or slot-holding state, and on timeout returns the fresh operation", async () => {
    const op = { id: "op_land_3", kind: "land", state: "preparing" };
    const landing = { id: "act_9_00000000", seq: 9, kind: "land", by: {}, at: "t", lane: LANE, generation: 1, op };
    const waits: unknown[] = [];
    const r = recording({
      lane: () => null,
      land: () => landing,
      wait: (_op: unknown, opts: unknown) => {
        waits.push(opts);
        throw artroomError("timeout");
      },
      op: () => ({ ...op, state: "publishing" }),
    });
    const args = { lane: LANE, lease: 1, generation: 1, head: head("a"), idempotencyKey: "l1" };
    const now = await callTool(r.room, "land", args);
    expect(now.structuredContent).toEqual(landing);
    expect(r.calls.map((c) => c.method)).toEqual(["lane", "land"]);
    const waited = await callTool(r.room, "land", { ...args, waitMs: 250 });
    expect(waited.isError).toBe(false);
    expect((waited.structuredContent as { op: { state: string } }).op.state).toBe("publishing");
    expect(waits).toEqual([{ until: ["landed", "aborted", "retryable", "failed", "unresolved"], timeoutMs: 250 }]);
  });

  test("operation reads once with no waitMs; with one it waits for until, by default the kind's finished states", async () => {
    const waits: { ref: unknown; opts: unknown }[] = [];
    const state = { now: "preparing" };
    const r = recording({
      op: (ref: { id: string; kind: string }) => ({ ...ref, state: state.now, updatedAt: "t" }),
      wait: (ref: { id: string; kind: string }, opts: { until: string[] }) => {
        waits.push({ ref, opts });
        return { ...ref, state: opts.until[0], updatedAt: "t2" };
      },
    });
    const read = await callTool(r.room, "operation", { id: "op_land_1", kind: "land" });
    expect(read.structuredContent).toMatchObject({ state: "preparing" });
    expect(read.content[0]!.text.split("\n")[0]).toBe("Operation op_land_1 is preparing.");
    expect(r.calls.map((c) => c.method)).toEqual(["op"]);
    expect((await callTool(r.room, "operation", { id: "op_land_1", kind: "land", waitMs: 0 })).structuredContent).toMatchObject({ state: "preparing" });
    expect(waits).toEqual([]);

    expect((await callTool(r.room, "operation", { id: "op_land_1", kind: "land", waitMs: 500 })).structuredContent).toMatchObject({ state: "landed" });
    await callTool(r.room, "operation", { id: "op_ws_1", kind: "workspace", waitMs: 500 });
    await callTool(r.room, "operation", { id: "op_preview_1", kind: "preview", waitMs: 500 });
    await callTool(r.room, "operation", { id: "op_land_1", kind: "land", until: ["publishing", "landed"], waitMs: 45_000 });
    await callTool(r.room, "operation", { id: "op_land_1", kind: "land", until: [], waitMs: 9 });
    expect(waits).toEqual([
      { ref: { id: "op_land_1", kind: "land" }, opts: { until: ["landed", "aborted", "retryable", "failed"], timeoutMs: 500 } },
      { ref: { id: "op_ws_1", kind: "workspace" }, opts: { until: ["ready", "failed"], timeoutMs: 500 } },
      { ref: { id: "op_preview_1", kind: "preview" }, opts: { until: ["clean", "conflict", "failed"], timeoutMs: 500 } },
      { ref: { id: "op_land_1", kind: "land" }, opts: { until: ["publishing", "landed"], timeoutMs: 45_000 } },
      { ref: { id: "op_land_1", kind: "land" }, opts: { until: ["landed", "aborted", "retryable", "failed"], timeoutMs: 9 } },
    ]);

    // Already at a state it would wait for: the first read answers, and nothing waits.
    state.now = "landed";
    const before = waits.length;
    expect((await callTool(r.room, "operation", { id: "op_land_1", kind: "land", waitMs: 500 })).structuredContent).toMatchObject({ state: "landed" });
    expect(waits).toHaveLength(before);
  });

  test("operation at waitMs returns the operation's current state, read afresh, and not an error; another failure of the wait stays an error", async () => {
    let reads = 0;
    const r = recording({
      op: (ref: object) => ({ ...ref, state: reads++ === 0 ? "accepted" : "preparing", updatedAt: `t${reads}` }),
      wait: () => {
        throw artroomError("timeout", "did not reach landed");
      },
    });
    const out = await callTool(r.room, "operation", { id: "op_land_1", kind: "land", waitMs: 1000 });
    expect(out.isError).toBe(false);
    expect(out.structuredContent).toEqual({ id: "op_land_1", kind: "land", state: "preparing", updatedAt: "t2" });
    expect(r.calls.map((c) => c.method)).toEqual(["op", "wait", "op"]);
    const broken = recording({
      op: (ref: object) => ({ ...ref, state: "accepted" }),
      wait: () => {
        throw artroomError("unavailable");
      },
    });
    const failed = await callTool(broken.room, "operation", { id: "op_land_1", kind: "land", waitMs: 1000 });
    expect(failed.isError).toBe(true);
    expect(failed.structuredContent).toMatchObject({ code: "unavailable" });
    expect(broken.calls.map((c) => c.method)).toEqual(["op", "wait"]);
  });

  test("operation on the fake room: a pending workspace with a short wait returns pending, and the wait changes nothing in the room", async () => {
    const b = await bearer("@agent", "agent");
    const claim = (await call(b, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    room.workspaceDelay = 1_000_000;
    const ws = (await call(b, "workspace", { lane: claim.lane, lease: 1, waitMs: 0 })).structuredContent;
    expect(ws.op.state).toBe("pending");
    const entries = room.entries.length;
    const lease = JSON.stringify(room.lanes.get(claim.lane));
    const started = Date.now();
    const out = await call(b, "operation", { id: ws.op.id, kind: "workspace", waitMs: 50 });
    expect(out.isError).toBe(false);
    expect(out.structuredContent).toMatchObject({ id: ws.op.id, kind: "workspace", state: "pending" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(40);
    // A read: no entry, and the lane and its lease are as they were.
    expect(room.entries.length).toBe(entries);
    expect(JSON.stringify(room.lanes.get(claim.lane))).toBe(lease);
  });
});

describe("attention with waitMs waits for an item for the caller (R-API-15)", () => {
  test("with no waitMs, or 0, it is one read and no subscription", async () => {
    const page = { items: [], cursor: "c1", more: false, publishedThrough: 3 };
    const r = recording({ attention: () => page, subscribe: () => ({ cursor: "u1", entries: [], attention: [], publishedThrough: 3 }) });
    expect((await callTool(r.room, "attention", { cursor: "c0", limit: 5 })).structuredContent).toEqual(page);
    expect((await callTool(r.room, "attention", { waitMs: 0 })).structuredContent).toEqual(page);
    expect(r.calls).toEqual([
      { method: "attention", args: [{ cursor: "c0", limit: 5 }] },
      { method: "attention", args: [{}] },
    ]);
  });

  test("a page that already has items returns at once, without waiting", async () => {
    const page = { items: [{ id: "att_1" }], cursor: "c1", more: false, publishedThrough: 3 };
    let polls = 0;
    const r = recording({
      attention: () => page,
      subscribe: (_c: unknown, opts: { waitMs: number }) => {
        if (opts.waitMs === 0) return { cursor: "u1", entries: [], attention: [], publishedThrough: 3 };
        // A waiting poll: it would end a wait at once, so a wait that should not happen shows as a poll.
        polls++;
        return { cursor: "u2", entries: [], attention: [{ id: "att_2" }], publishedThrough: 3 };
      },
    });
    const started = Date.now();
    expect((await callTool(r.room, "attention", { waitMs: 30_000 })).structuredContent).toEqual(page);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(polls).toBe(0);
    expect(r.calls.filter((c) => c.method === "attention")).toHaveLength(1);
  });

  test("over the long poll: updates without attention items do not end the wait; the one that carries an item does, and the page is read again", async () => {
    const empty = { items: [], cursor: "c1", more: false, publishedThrough: 3 };
    const full = { items: [{ id: "att_1" }], cursor: "c2", more: false, publishedThrough: 4 };
    const polled: unknown[] = [];
    let reads = 0;
    const r = recording({
      attention: () => (reads++ === 0 ? empty : full),
      subscribe: (cursor: unknown, opts: { waitMs: number }) => {
        polled.push(cursor);
        if (cursor === undefined) return { cursor: "u1", entries: [], attention: [], publishedThrough: 3 };
        // Another member's entries arrive first; the caller's item only with the third update.
        if (cursor === "u1") return { cursor: "u2", entries: [{ id: "act_8_00000000" }], attention: [], publishedThrough: 3 };
        if (cursor === "u2") return { cursor: "u3", entries: [{ id: "act_9_00000000" }], attention: [{ id: "att_1" }], publishedThrough: 4 };
        throw new Error(`unexpected poll after ${String(cursor)} for ${opts.waitMs}`);
      },
    });
    const out = await callTool(r.room, "attention", { cursor: "c0", waitMs: 30_000 });
    expect(out.structuredContent).toEqual(full);
    expect(polled).toEqual([undefined, "u1", "u2"]);
    expect(r.calls.filter((c) => c.method === "attention").map((c) => c.args)).toEqual([[{ cursor: "c0" }], [{ cursor: "c0" }]]);
    // The first poll only takes the live cursor; the waiting polls ask for no more than the time left.
    const waitsAsked = r.calls.filter((c) => c.method === "subscribe").map((c) => (c.args[1] as { waitMs: number }).waitMs);
    expect(waitsAsked[0]).toBe(0);
    for (const w of waitsAsked.slice(1)) expect(w > 0 && w <= 30_000).toBe(true);
  });

  test("at waitMs it returns the empty page with its cursor, not an error", async () => {
    const empty = { items: [], cursor: "c1", more: false, publishedThrough: 3 };
    const r = recording({
      attention: () => empty,
      subscribe: async (cursor: unknown, opts: { waitMs: number }) => {
        await new Promise((resolve) => setTimeout(resolve, opts.waitMs));
        return { cursor: cursor ?? "u1", entries: [], attention: [], publishedThrough: 3 };
      },
    });
    const started = Date.now();
    const out = await callTool(r.room, "attention", { waitMs: 40 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(30);
    expect(out.isError).toBe(false);
    expect(out.structuredContent).toEqual(empty);
    expect(r.calls.filter((c) => c.method === "attention")).toHaveLength(2);
  });

  test("a handle with no subscription waits out the time and reads again", async () => {
    let reads = 0;
    const r = recording({ attention: () => ({ items: reads++ === 0 ? [] : [{ id: "att_1" }], cursor: "c1", more: false, publishedThrough: 3 }) });
    const out = await callTool(r.room, "attention", { waitMs: 20 });
    expect((out.structuredContent as { items: unknown[] }).items).toHaveLength(1);
  });

  test("through the endpoint: an empty page, then a note notifies the caller: the page with the note's item, long before waitMs; another member's activity does not end the wait", async () => {
    const b = await bearer("@agent", "agent");
    const bob = await member("@bob");
    const claim = (await call(b, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    const p = (await call(b, "propose", { lane: claim.lane, lease: 1, head: head("a"), expectedGeneration: 0, summary: "s" })).structuredContent as Proposal;
    const cursor = (await call(b, "attention", {})).structuredContent.cursor;
    expect((await call(b, "attention", { cursor })).structuredContent.items).toEqual([]);
    const entries = room.entries.length;
    const lease = JSON.stringify(room.lanes.get(claim.lane));
    const started = Date.now();
    const waiting = call(b, "attention", { cursor, waitMs: 30_000 });
    let settled = false;
    void waiting.then(() => (settled = true));
    // Bob's own claim is activity in the room, but nothing for the agent.
    await new Promise((r) => setTimeout(r, 20));
    expect(isRefusal(await bob.api.claim({ goal: "docs", scope: ["docs/**"] }))).toBe(false);
    // Had the wait ended on Bob's claim, it would have ended by now, and its page, checked below, would be empty.
    await new Promise((r) => setTimeout(r, 60));
    expect(settled).toBe(false);
    // While it waits, the lane and its lease are as they were: waiting holds nothing.
    expect(JSON.stringify(room.lanes.get(claim.lane))).toBe(lease);
    const note = await bob.api.note({ lane: claim.lane, generation: 1, head: p.head, path: "src/a.ts", line: 3 }, { text: "A question about this line." });
    if (isRefusal(note)) throw new Error(note.rule);
    const page = (await waiting).structuredContent;
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ why: "note", note: note.id });
    // Waiting recorded nothing: only Bob's two acts were added.
    expect(room.entries.length).toBe(entries + 2);
  });

  test("with a member's own key, over the long poll: the same wait ends when the note arrives", async () => {
    const alice = await member("@alice");
    const bob = await member("@bob");
    const claim = (await alice.api.claim({ goal: "g", scope: ["src/**"] })) as Claim;
    const p = (await alice.api.propose(claim, { head: head("a") as never, expectedGeneration: 0, summary: "s" })) as Proposal;
    const cursor = ((await callTool(alice.api, "attention", {})).structuredContent as { cursor: string }).cursor;
    const waiting = callTool(alice.api, "attention", { cursor, waitMs: 30_000 });
    await new Promise((r) => setTimeout(r, 20));
    const note = await bob.api.note({ lane: claim.lane, generation: 1, head: p.head, path: "src/a.ts", line: 3 }, { text: "hello" });
    if (isRefusal(note)) throw new Error(note.rule);
    const page = (await waiting).structuredContent as { items: { why: string }[] };
    expect(page.items.map((i) => i.why)).toEqual(["note"]);
  });
});

// ------------------------------------------------------------ toolsets (R-API-14)

describe("an attention wait ends the subscription it opened (R-API-15; checker finding 48765af0)", () => {
  const upd = (attention: unknown[] = []): Update => ({ cursor: "u", entries: [], attention, publishedThrough: 3 }) as never;
  const EMPTY = { items: [], cursor: "c1", more: false, publishedThrough: 3 };
  const FULL = { items: [{ id: "att_1" }], cursor: "c2", more: false, publishedThrough: 4 };

  /** A native stream of updates, as a host may give one: its source counts cancellations, and every read is kept. */
  function native(onCancel: () => void = () => {}) {
    let controller!: ReadableStreamDefaultController<Update>;
    const seen = { cancels: 0, reads: [] as Promise<{ done: boolean }>[] };
    const stream = new ReadableStream<Update>({
      start: (c) => void (controller = c),
      cancel: () => {
        seen.cancels++;
        onCancel();
      },
    });
    const getReader = stream.getReader.bind(stream);
    (stream as { getReader: unknown }).getReader = () => {
      const reader = getReader();
      const read = reader.read.bind(reader);
      reader.read = () => {
        const p = read();
        seen.reads.push(p);
        return p;
      };
      return reader;
    };
    return { stream, seen, push: (u: Update) => controller.enqueue(u), locked: () => stream.locked };
  }

  /** The same updates as bytes through the client's own decoder: what an HTTPS or RPC handle's subscription is. */
  function decoded(onCancel: () => void = () => {}) {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const seen = { cancels: 0 };
    const bytes = new ReadableStream<Uint8Array>({
      start: (c) => void (controller = c),
      cancel: () => {
        seen.cancels++;
        onCancel();
      },
    });
    return { stream: decodeUpdates(bytes as never), seen, push: (u: Update) => controller.enqueue(new TextEncoder().encode(`${JSON.stringify(u)}\n`)) };
  }

  /** One `attention` call over a handle whose subscription is `stream`; the pages are answered in order. */
  async function wait(stream: unknown, pages: unknown[], waitMs: number, during: () => void = () => {}) {
    let read = 0;
    let opened = 0;
    const r = recording({
      attention: () => pages[Math.min(read++, pages.length - 1)],
      subscribe: () => {
        opened++;
        setTimeout(during, 5);
        return stream;
      },
    });
    const out = await callTool(r.room, "attention", { waitMs });
    return { out, opened, pageReads: read };
  }
  const settled = (reads: Promise<unknown>[]) => Promise.race([Promise.allSettled(reads), new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 1_000))]);

  test("a native stream, a page that already has items: the page returns, its source is cancelled once and its reader released", async () => {
    const n = native();
    const { out, opened } = await wait(n.stream, [FULL], 30_000);
    expect(out.structuredContent).toEqual(FULL);
    expect([opened, n.seen.cancels, n.locked()]).toEqual([1, 1, false]);
    expect(await n.stream.getReader().read()).toEqual({ done: true, value: undefined });
  });

  test("a native stream, the wait runs out: the empty page returns, the source is cancelled once, the reader released, and the read left pending ends as done", async () => {
    const n = native();
    const { out, pageReads } = await wait(n.stream, [EMPTY], 30);
    expect(out.isError).toBe(false);
    expect(out.structuredContent).toEqual(EMPTY);
    expect(pageReads).toBe(2);
    expect([n.seen.cancels, n.locked()]).toEqual([1, false]);
    expect(n.seen.reads.length).toBeGreaterThan(0);
    const ended = await settled(n.seen.reads);
    expect(ended).not.toBe("pending");
    expect((ended as PromiseSettledResult<{ done: boolean }>[]).at(-1)).toEqual({ status: "fulfilled", value: { done: true, value: undefined } });
  });

  test("a native stream, an item arrives: the page with the item returns, the source is cancelled once and the reader released", async () => {
    const n = native();
    // Another member's update first, which does not end the wait; then one with an item for the caller.
    const { out } = await wait(n.stream, [EMPTY, FULL], 30_000, () => {
      n.push(upd());
      n.push(upd([{ id: "att_1" }]));
    });
    expect(out.structuredContent).toEqual(FULL);
    expect([n.seen.cancels, n.locked()]).toEqual([1, false]);
    expect(n.seen.reads.length).toBe(2);
  });

  test("the client's decoded stream, in the same three cases: its byte source is cancelled once each time", async () => {
    const now = decoded();
    expect((await wait(now.stream, [FULL], 30_000)).out.structuredContent).toEqual(FULL);
    expect(now.seen.cancels).toBe(1);
    const late = decoded();
    expect((await wait(late.stream, [EMPTY], 30)).out.structuredContent).toEqual(EMPTY);
    expect(late.seen.cancels).toBe(1);
    const item = decoded();
    const got = await wait(item.stream, [EMPTY, FULL], 30_000, () => {
      item.push(upd());
      item.push(upd([{ id: "att_1" }]));
    });
    expect(got.out.structuredContent).toEqual(FULL);
    expect(item.seen.cancels).toBe(1);
    // After the wait the decoded stream is ended: a new reader reads done.
    expect(await item.stream.getReader().read()).toEqual({ done: true });
  });

  test("with waitMs 0, or none, no subscription is opened and nothing is cancelled", async () => {
    const n = native();
    for (const waitMs of [0, undefined]) {
      let opened = 0;
      const r = recording({ attention: () => EMPTY, subscribe: () => (opened++, n.stream) });
      expect((await callTool(r.room, "attention", waitMs === undefined ? {} : { waitMs })).structuredContent).toEqual(EMPTY);
      expect([opened, n.seen.cancels, n.locked()]).toEqual([0, 0, false]);
    }
  });

  test("a source whose cancel fails does not fail the tool: the page still returns, and a native reader is still released", async () => {
    const boom = () => {
      throw new Error("the source could not be cancelled");
    };
    const n = native(boom);
    const first = await wait(n.stream, [FULL], 30_000);
    expect(first.out.isError).toBe(false);
    expect(first.out.structuredContent).toEqual(FULL);
    expect([n.seen.cancels, n.locked()]).toEqual([1, false]);
    const d = decoded(boom);
    const second = await wait(d.stream, [FULL], 30_000);
    expect(second.out.isError).toBe(false);
    expect(second.out.structuredContent).toEqual(FULL);
    expect(d.seen.cancels).toBe(1);
    // A stream of the contract's own shape, whose reader has no cancel and whose own cancel rejects.
    const seen = { cancels: 0, released: 0 };
    const structural = {
      getReader: () => ({ read: () => new Promise<never>(() => {}), releaseLock: () => void seen.released++ }),
      cancel: async () => {
        seen.cancels++;
        throw new Error("the subscription could not be cancelled");
      },
    };
    const third = await wait(structural, [FULL], 30_000);
    expect(third.out.isError).toBe(false);
    expect(third.out.structuredContent).toEqual(FULL);
    expect(seen).toEqual({ cancels: 1, released: 1 });
  });
});

describe("toolsets: what tools/list shows follows the caller's authorization (R-API-14)", () => {
  test("the default comes from the roster role: all for admin and maintainer, builder for member and agent, reviewer for checker", async () => {
    await room.activate(DECLARED);
    const c = await active();
    for (const role of ["admin", "maintainer"] as const) expect(await shown({ role }, c), role).toEqual(ORDER);
    for (const role of ["member", "agent"] as const) expect(await shown({ role }, c), role).toEqual(inOrder(SETS.builder));
    // A checker's own key: the reviewer presentation, without `review`. `note` and the generic act are what its role may sign.
    expect(await shown({ role: "checker" }, c)).toEqual(without(SETS.reviewer, "review"));
    expect(defaultToolset({ role: "checker" }, await eligible({ role: "checker" }, c))).toBe("reviewer");
    // The observer override is for a delegation only. A checker's own key that may sign nothing here keeps the
    // reviewer presentation: its reads, and no act tool.
    await room.activate({ ask: ASK });
    const onlyAsk = await active();
    expect(await eligible({ role: "checker" }, onlyAsk)).toEqual({ named: [], generic: [] });
    expect(defaultToolset({ role: "checker" }, await eligible({ role: "checker" }, onlyAsk))).toBe("reviewer");
    expect(await shown({ role: "checker" }, onlyAsk)).toEqual(["attention", "explain", "lanes", "lane", "proposal", "acts"]);
  });

  test("a caller may ask for another toolset; the list is that set, filtered by the same authority", async () => {
    await room.activate(DECLARED);
    const c = await active();
    expect(await shown({ role: "agent" }, c, "reviewer")).toEqual(inOrder(SETS.reviewer));
    expect(await shown({ role: "agent" }, c, "observer")).toEqual(inOrder(SETS.observer));
    expect(await shown({ role: "admin" }, c, "observer")).toEqual(inOrder(SETS.observer));
    expect(await shown({ role: "admin" }, c, "builder")).toEqual(inOrder(SETS.builder));
    // Asking for `all` shows no act tool the caller could not use: a checker still sees no claim or review.
    expect(await shown({ role: "checker" }, c, "all")).toEqual(["workspace", "note", "attention", "explain", "lanes", "lane", "proposal", "operation", "acts", "act"]);
    expect(toolsetOf(undefined)).toBeUndefined();
    expect(toolsetOf(null)).toBeUndefined();
    for (const name of ["builder", "reviewer", "observer", "all"]) expect(toolsetOf(name)).toBe(name);
  });

  test("a caller may select any named toolset: the read-only-delegation override decides the default only, and every selected list has the same filter", async () => {
    await room.activate(DECLARED);
    const c = await active();
    // A member's default is builder. It may select a larger set by name, and gets no act tool beyond its authority.
    expect(await shown({ role: "member" }, c)).toEqual(inOrder(SETS.builder));
    expect(await shown({ role: "member" }, c, "all")).toEqual(ORDER);
    // A delegation that may newly sign nothing: observer by default, and by name any set, each without act tools.
    const idle: McpCaller = { role: "agent", delegation: { kinds: [], acts: {} } };
    expect(defaultToolset(idle, await eligible(idle, c))).toBe("observer");
    expect(await shown(idle, c)).toEqual(inOrder(SETS.observer));
    const acts = (set: McpToolset) => SETS[set].filter((n) => (ACT_TOOLS as readonly string[]).includes(n));
    for (const set of ["builder", "reviewer", "observer", "all"] as const) expect(await shown(idle, c, set), set).toEqual(without(SETS[set], ...acts(set)));
    // Selecting `all` grants nothing: over the endpoint the list has no act tool, and the room refuses the call itself.
    const b = await bearer("@idle", "agent", { kinds: [], acts: {} });
    expect(await listed(b)).toEqual(inOrder(SETS.observer));
    expect(await listed(b, "?toolset=all")).toEqual(without(ORDER, ...acts("all")));
    expect(await listed(b, "?toolset=builder")).toEqual(without(SETS.builder, ...acts("builder")));
    const signed = JSON.stringify(room.delegations.get(b.delegation));
    const claim = await call(b, "claim", { goal: "g", scope: ["src/**"] }, "?toolset=all");
    expect(claim.isError).toBe(false);
    expect(claim.structuredContent).toMatchObject({ refused: true, rule: "delegation-invalid" });
    expect(room.lanes.size).toBe(0);
    expect(JSON.stringify(room.delegations.get(b.delegation))).toBe(signed);
    // A delegation with one current kind keeps that kind in every set that has its tool, and gains none by asking.
    const one = await bearer("@one", "agent", { kinds: [], acts: await bindings("note") });
    expect(await listed(one)).toEqual(without(SETS.builder, "claim", "propose", "land", "release", "renew"));
    expect(await listed(one, "?toolset=all")).toEqual(without(ORDER, "claim", "propose", "review", "land", "release", "renew"));
    expect(await listed(one, "?toolset=observer")).toEqual(inOrder(SETS.observer));
  });

  test("an unknown toolset name is bad-request, over HTTPS and for stdio, and nothing runs", async () => {
    const b = await bearer("@agent", "agent");
    for (const query of ["?toolset=nope", "?toolset=", "?toolset=Builder", "?toolset=builder&toolset=all", "?toolset=__proto__"]) {
      const res = await list(b, query);
      expect([query, res.status]).toEqual([query, 400]);
      expect(res.body.error.data).toMatchObject({ name: "ArtroomError", code: "bad-request" });
      const claim = await rpc(`${b.mcp}${query}`, b.bearer, "tools/call", { name: "claim", arguments: { goal: "g", scope: ["src/**"], idempotencyKey: "k1" } });
      expect(claim.status).toBe(400);
    }
    expect(room.lanes.size).toBe(0);
    expect((await list(b, "?toolset=nope")).body.error.message).toBe('There is no toolset named "nope". The toolsets are builder, reviewer, observer, all.');
    for (const name of ["nope", "", "toString", "constructor"]) {
      expect(() => toolsetOf(name), name).toThrowError(expect.objectContaining({ name: "ArtroomError", code: "bad-request" }));
    }
  });

  test("tools/list as an agent; with ?toolset=reviewer; as a bearer whose delegation lacks land", async () => {
    // A `v1` room: the frozen legacy role and delegation rules, and no generic act.
    const agent = await bearer("@agent", "agent");
    expect(await listed(agent)).toEqual(without(SETS.builder, "act"));
    expect(await listed(agent, "?toolset=reviewer")).toEqual(without(SETS.reviewer, "act"));
    expect(await listed(agent, "?toolset=observer")).toEqual(inOrder(SETS.observer));
    expect(await listed(agent, "?toolset=all")).toEqual(without(ORDER, "act"));
    const noLand = await bearer("@careful", "agent", { kinds: ["claim", "propose", "note", "review", "release", "renew"] });
    expect(await listed(noLand)).toEqual(without(SETS.builder, "act", "land"));
    // The same in a `v2` room, where the generic act is listed too.
    await room.activate(DECLARED);
    const declared = await bearer("@declared", "agent", { kinds: ["renew"], acts: await bindings("claim", "propose", "note", "review", "land", "release") });
    expect(await listed(declared)).toEqual(inOrder(SETS.builder));
    expect(await listed(declared, "?toolset=reviewer")).toEqual(inOrder(SETS.reviewer));
    const declaredNoLand = await bearer("@declared-careful", "agent", { kinds: ["renew"], acts: await bindings("claim", "propose", "note", "review", "release") });
    expect(await listed(declaredNoLand)).toEqual(without(SETS.builder, "land"));
  });

  test("a checker: its own key; delegated with one eligible declared check kind; delegated with no eligible act kind. Never review or claim", async () => {
    await room.activate(DECLARED);
    const c = await active();
    const own = await shown({ role: "checker" }, c);
    expect(own).toEqual(["note", "attention", "explain", "lanes", "lane", "proposal", "acts", "act"]);
    // Delegated, with the renamed check kind in its signed map: the reviewer presentation with the generic act only.
    const withVerify = await bearer("@ci", "checker", { kinds: [], acts: await bindings("verify") });
    expect(await listed(withVerify)).toEqual(["attention", "explain", "lanes", "lane", "proposal", "acts", "act"]);
    // Delegated, with nothing it may newly sign: observer.
    const nothing = await bearer("@idle-ci", "checker", { kinds: [], acts: {} });
    expect(await listed(nothing)).toEqual(inOrder(SETS.observer));
    // A map that names kinds a checker's role may not sign gives a checker nothing either.
    const overreach = await bearer("@eager-ci", "checker", { kinds: ["renew"], acts: await bindings("claim", "review") });
    expect(await listed(overreach)).toEqual(inOrder(SETS.observer));
    for (const tools of [own, await listed(withVerify), await listed(nothing), await listed(overreach), await listed(withVerify, "?toolset=all")]) {
      expect(tools).not.toContain("review");
      expect(tools).not.toContain("claim");
    }
    // The presentation grants nothing: the room still refuses a checker's review and claim.
    const claim = await call(withVerify, "claim", { goal: "g", scope: ["src/**"] });
    expect(claim.structuredContent).toMatchObject({ refused: true, rule: "delegation-invalid" });
    expect(room.lanes.size).toBe(0);
  });

  test("the generic act is listed by existence: platform-only grants and an all-stale map hide it; a mixed map and a renamed check kind show it", async () => {
    await room.activate(DECLARED);
    const c = await active();
    const current = await bindings("ask", "claim", "verify");
    const agent = (acts: Record<string, string> | undefined, kinds: string[] | "*" = []): McpCaller => ({ role: "agent", delegation: { kinds, ...(acts !== undefined ? { acts: acts as never } : {}) } });
    // Only platform grants: the named `renew`, never the generic act.
    expect(await shown(agent({}, ["renew"]), c)).toEqual(["workspace", "renew", "attention", "explain", "lane", "proposal", "operation", "acts"]);
    expect(await eligible(agent({}, ["renew"]), c)).toEqual({ named: ["renew"], generic: [] });
    // A grant made under a `v1` document carries no map at all: no declared kind, whatever its kinds say.
    expect(await eligible(agent(undefined, "*"), c)).toEqual({ named: ["renew"], generic: [] });
    // Every signed binding is stale: no kind qualifies, so the delegation is read-only and gets observer.
    const stale = agent({ ask: STALE, claim: STALE });
    expect(await eligible(stale, c)).toEqual({ named: [], generic: [] });
    expect(await shown(stale, c)).toEqual(inOrder(SETS.observer));
    expect(await shown(stale, c, "builder")).toEqual(["workspace", "attention", "explain", "lane", "proposal", "operation", "acts"]);
    // One current entry beside a stale one: the current kind qualifies, and the stale one does not.
    const mixed = agent({ ask: current["ask"]!, claim: STALE });
    expect(await eligible(mixed, c)).toEqual({ named: [], generic: ["ask"] });
    expect(await shown(mixed, c)).toEqual(["workspace", "attention", "explain", "lane", "proposal", "operation", "acts", "act"]);
    // A check step under another name, by its declaration, role and signed binding.
    expect(await eligible({ role: "checker", delegation: { kinds: [], acts: { verify: current["verify"]! } as never } }, c)).toEqual({ named: [], generic: ["verify"] });
    // A map entry for a kind the room does not declare, even one named `act`, qualifies nothing.
    expect(await eligible(agent({ act: current["ask"]!, tell: current["ask"]! }), c)).toEqual({ named: [], generic: [] });
    // Under a `v1` document the generic act is never listed, for anyone.
    await room.activate(null);
    const legacy = await active();
    expect(await shown({ role: "admin" }, legacy)).toEqual(without(ORDER, "act"));
    // A checker's own key there: the legacy table lets it sign `note`, and nothing else an MCP tool names.
    expect(await shown({ role: "checker" }, legacy)).toEqual(["note", "attention", "explain", "lanes", "lane", "proposal", "acts"]);
    expect(await eligible({ role: "checker" }, legacy)).toEqual({ named: ["note"], generic: [] });
    expect(await shown(agent({ ask: current["ask"]! }, "*"), legacy)).toEqual(without(SETS.builder, "act"));
  });

  test("a named act tool is shown only while the room's declaration of its kind is the one the tool was built for", async () => {
    // This room's `claim` takes another field, so its binding is not the code-review one.
    const claim: ActDeclaration = { ...CODE_REVIEW_ACTS["claim"]!, body: { ...CODE_REVIEW_ACTS["claim"]!.body, ticket: { type: "text", max: 40, optional: true } } };
    await room.activate({ ...DECLARED, claim });
    const c = await active();
    const e = await eligible({ role: "member" }, c);
    expect(e.generic).toContain("claim");
    expect(e.named).not.toContain("claim");
    expect(e.named).toEqual(["propose", "note", "review", "land", "release", "renew"]);
    expect(await shown({ role: "member" }, c)).toEqual(without(SETS.builder, "claim"));
  });

  test("discovery follows a changed role, a changed who and a declaration that stops allowing delegation; an own-key caller needs no map", async () => {
    await room.activate(DECLARED);
    const c = await active();
    const map = await bindings("ask", "claim");
    const delegated = (role: Role): McpCaller => ({ role, delegation: { kinds: [], acts: map as never } });
    expect(await eligible(delegated("agent"), c)).toEqual({ named: ["claim"], generic: ["claim", "ask"] });
    // The member's role becomes one the declarations do not list.
    expect(await eligible(delegated("checker"), c)).toEqual({ named: [], generic: [] });
    expect(await shown(delegated("checker"), c)).toEqual(inOrder(SETS.observer));
    // `who` stops admitting agents. The binding does not change with `who`, so the signed map entry is still current.
    await room.activate({ ...DECLARED, ask: { ...ASK, who: { roles: ["member"] } } });
    const narrowed = await active();
    expect(await room.bindingOf("ask")).toBe(map["ask"]);
    expect(await eligible(delegated("agent"), narrowed)).toEqual({ named: ["claim"], generic: ["claim"] });
    expect((await eligible(delegated("member"), narrowed)).generic).toEqual(["claim", "ask"]);
    // The declaration stops allowing delegation: a delegated caller loses the kind, a member's own key keeps it.
    await room.activate({ ...DECLARED, ask: { ...ASK, who: { roles: ["member", "agent"], delegable: false } } });
    const own = await active();
    expect(await room.bindingOf("ask")).toBe(map["ask"]);
    expect(await eligible(delegated("agent"), own)).toEqual({ named: ["claim"], generic: ["claim"] });
    expect((await eligible({ role: "agent" }, own)).generic).toContain("ask");
    // A member's own key has no grant map and needs none: its role and the declarations decide.
    expect(await eligible({ role: "agent" }, c)).toEqual({ named: ["claim", "propose", "note", "review", "land", "release", "renew"], generic: ["claim", "propose", "note", "review", "land", "release", "ask"] });
  });

  test("through the endpoint: the list follows the member's role as the roster has it now", async () => {
    await room.activate(DECLARED);
    const b = await bearer("@agent", "agent", { kinds: ["renew"], acts: await bindings("claim", "note", "ask") });
    expect(await listed(b)).toEqual(["claim", "workspace", "note", "renew", "attention", "explain", "lane", "proposal", "operation", "acts", "act"]);
    room.members.get("@agent")!.role = "checker";
    // A checker: `note` is all its role may sign from this map. `renew` is not a checker's.
    expect(await listed(b)).toEqual(["note", "attention", "explain", "lanes", "lane", "proposal", "acts", "act"]);
    room.members.get("@agent")!.role = "agent";
    expect(await listed(b)).toEqual(["claim", "workspace", "note", "renew", "attention", "explain", "lane", "proposal", "operation", "acts", "act"]);
  });

  test("HTTPS and stdio give the same list for the same authorization", async () => {
    await room.activate(DECLARED);
    const b = await bearer("@agent", "agent", { kinds: ["renew"], acts: await bindings("claim", "propose", "ask") });
    const api = await connect({ url }, room.id, { kind: "bearer", token: b.bearer });
    for (const set of [undefined, "reviewer", "observer", "all"] as const) {
      const https = (await list(b, set === undefined ? "" : `?toolset=${set}`)).body.result.tools;
      expect(await stdioList(api, () => room.bearerCaller(b.bearer), set), String(set)).toEqual(https);
    }
    // What the command line builds from the roster is what the room gives its own endpoint.
    const roster = await api.members();
    expect(callerFromRoster(roster, { key: b.key, session: true })).toEqual(await room.bearerCaller(b.bearer));
    expect(callerFromRoster(roster, { key: b.key, session: true, delegation: b.delegation })).toEqual(await room.bearerCaller(b.bearer));
    const alice = await member("@alice", "maintainer");
    expect(callerFromRoster(await alice.api.members(), { key: alice.key as never })).toEqual({ role: "maintainer" });
    expect(await stdioList(alice.api, async () => callerFromRoster(await alice.api.members(), { key: alice.key as never }))).toEqual(JSON.parse(JSON.stringify(listedTools())));
    // A key the roster does not hold as current, or a revoked delegation, is no caller at all.
    expect(() => callerFromRoster(roster, { key: "key_unknown" as never })).toThrowError(expect.objectContaining({ code: "unauthenticated" }));
    room.revokeDelegation(b.delegation);
    const after = await alice.api.members();
    expect(() => callerFromRoster(after, { key: b.key, session: true, delegation: b.delegation })).toThrowError(expect.objectContaining({ code: "unauthenticated" }));
    expect(() => callerFromRoster(after, { key: b.key, session: true })).toThrowError(expect.objectContaining({ code: "unauthenticated" }));
  });

  test("the command line's adapter gives a session exactly the delegation its redemption recorded: not a later one of the same key, and never another key's", async () => {
    await room.activate(DECLARED);
    const b = await bearer("@agent", "agent", { kinds: ["renew"], acts: await bindings("claim") });
    const other = await bearer("@other", "agent", { kinds: [], acts: await bindings("note") });
    const api = await connect({ url }, room.id, { kind: "bearer", token: b.bearer });
    const roster = await api.members();
    // What the adapter answers: the caller, or the code it refuses with. So a wrong refusal fails as an assertion.
    const read = (r: typeof roster, who: Parameters<typeof callerFromRoster>[1]) => {
      try {
        return callerFromRoster(r, who);
      } catch (e) {
        return { refused: (e as { code?: string }).code };
      }
    };
    const exact = read(roster, { key: b.key, session: true, delegation: b.delegation });
    expect(exact).toEqual(await room.bearerCaller(b.bearer));
    expect(exact).toEqual({ role: "agent", delegation: { kinds: ["renew"], acts: await bindings("claim") } });
    // The same room-held key with a later delegation in the roster: the session's own recorded one is still used.
    const mine = roster.delegations.find((d) => d.id === b.delegation)!;
    const later = { ...mine, id: "act_999_00000000" as never, kinds: "*" as const, acts: await bindings("claim", "propose", "land") };
    const grown = { ...roster, delegations: [...roster.delegations, later] };
    expect(read(grown, { key: b.key, session: true, delegation: b.delegation })).toEqual(exact);
    // With no recorded ID (a credential saved before it was kept), the latest unrevoked one the key granted is used.
    expect(read(grown, { key: b.key, session: true })).toEqual({ role: "agent", delegation: { kinds: "*", acts: later.acts } });
    // A session cannot name a delegation another key granted, though that delegation is current.
    expect(roster.delegations.some((d) => d.id === other.delegation && d.revoked === undefined)).toBe(true);
    expect(read(roster, { key: b.key, session: true, delegation: other.delegation })).toEqual({ refused: "unauthenticated" });
    // A client-held key that names a delegation must be the key it was granted to: the grantee is accepted, and the
    // grantor's key or any other key in that form is not.
    const granted = roster.delegations.find((d) => d.id === other.delegation)!;
    expect(read(roster, { key: granted.grantee, delegation: other.delegation })).toEqual(await room.bearerCaller(other.bearer));
    expect(read(roster, { key: other.key, delegation: other.delegation })).toEqual({ refused: "unauthenticated" });
    expect(read(roster, { key: b.key, delegation: other.delegation })).toEqual({ refused: "unauthenticated" });
    // The session form of the same delegation, by its own room-held key, is accepted: the two forms do not mix.
    expect(read(roster, { key: other.key, session: true, delegation: other.delegation })).toEqual(await room.bearerCaller(other.bearer));
  });

  test("over stdio the caller is read again for each list: after the delegation is revoked, the next list on the same server is an error and shows no tool", async () => {
    await room.activate(DECLARED);
    const b = await bearer("@agent", "agent", { kinds: ["renew"], acts: await bindings("claim") });
    const api = await connect({ url }, room.id, { kind: "bearer", token: b.bearer });
    // The callback is the command line's: a fresh roster read with the credential, whose failure is not caught.
    const reads: string[] = [];
    const caller = async () => {
      const roster = await api.members().then(
        (r) => (reads.push("read"), r),
        (e) => {
          reads.push(`failed: ${(e as { code?: string }).code}`);
          throw e;
        },
      );
      return callerFromRoster(roster, { key: b.key, session: true, delegation: b.delegation });
    };
    const server = await stdioServer(api, caller);
    const first = await server.list();
    expect(names(first.result.tools)).toEqual(await listed(b));
    expect(names(first.result.tools)).toContain("claim");
    room.revokeDelegation(b.delegation);
    // The same server, asked again: the roster read itself is refused for the revoked session, and nothing is listed.
    const second = await server.list();
    expect(second.result).toBeUndefined();
    expect(second.error).toBeDefined();
    expect(reads).toEqual(["read", "failed: unauthenticated"]);
    await server.close();
    // The other two views of the same fact: HTTPS answers 401, and a roster that shows the revocation gives no caller.
    expect((await list(b)).status).toBe(401);
    const admin = await connect({ url }, room.id, { kind: "key", signer: room.admin.signer });
    const after = await admin.members();
    expect(after.delegations.find((d) => d.id === b.delegation)?.revoked).toBeDefined();
    expect(() => callerFromRoster(after, { key: b.key, session: true, delegation: b.delegation })).toThrowError(expect.objectContaining({ code: "unauthenticated" }));
  });

  test("the list is the same before and after other calls, and it is read afresh for each request", async () => {
    await room.activate(DECLARED);
    const b = await bearer("@agent", "agent", { kinds: ["renew"], acts: await bindings("claim", "propose", "note", "ask") });
    const before = (await list(b)).body.result.tools;
    const claim = (await call(b, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    await call(b, "note", { anchor: { act: claim.id }, text: "started" });
    await call(b, "act", { kind: "ask", target: { act: claim.id }, body: { text: "why?" }, binding: (await room.bindingOf("ask"))! });
    await call(b, "review", { lane: claim.lane, generation: 1, head: head("a"), verdict: "approve", scope: ["src/**"], text: "x" }); // refused: not granted
    await call(b, "attention", {});
    expect((await list(b)).body.result.tools).toEqual(before);
    expect((await list(b)).body.result.tools).toEqual(before);
    // One long-lived server: its list changes when the declarations change, with no call in between.
    const api = await connect({ url }, room.id, { kind: "bearer", token: b.bearer });
    const callers: number[] = [];
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const handle = serveArtroomStdio(
      api,
      {
        caller: async () => {
          callers.push(room.entries.length);
          return room.bearerCaller(b.bearer);
        },
      },
      { transport: new StdioServerTransport(stdin, stdout) },
    );
    const replies = new Map<number, any>();
    let buffer = "";
    stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
        const msg = JSON.parse(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (msg.id !== undefined) replies.set(msg.id, msg);
      }
    });
    const send = async (id: number, method: string, params: unknown = {}) => {
      stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      for (let i = 0; i < 5_000 && !replies.has(id); i++) await new Promise((r) => setTimeout(r, 1));
      return replies.get(id);
    };
    await send(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    expect(names((await send(2, "tools/list")).result.tools)).toEqual(names(before));
    // `ask` changes its meaning: the signed binding for it is stale, and the other kinds are untouched.
    await room.activate({ ...DECLARED, ask: { ...ASK, body: { text: { type: "text", max: 100 } } } });
    const then = names((await send(3, "tools/list")).result.tools);
    expect(then).toEqual(names(before));
    await room.activate({ ask: { ...ASK, body: { text: { type: "text", max: 100 } } } });
    // Now no kind of its map is current: only `renew` is left, and the generic act is gone.
    expect(names((await send(4, "tools/list")).result.tools)).toEqual(["workspace", "renew", "attention", "explain", "lane", "proposal", "operation", "acts"]);
    expect(callers).toHaveLength(3);
    await handle.close();
  });

  test("listing changes no grant: the signed map is as it was, stale entries included, and a frozen caller is only read", async () => {
    await room.activate(DECLARED);
    const b = await bearer("@agent", "agent", { kinds: ["renew"], acts: await bindings("claim", "ask") });
    const signed = JSON.stringify(room.delegations.get(b.delegation));
    await room.activate({ ...DECLARED, ask: { ...ASK, body: { text: { type: "text", max: 100 } } }, tell: ASK });
    for (const query of ["", "?toolset=all", "?toolset=reviewer", "?toolset=observer"]) await list(b, query);
    // No map was expanded to the new kind `tell`, and the stale `ask` binding was not replaced by the active one.
    expect(JSON.stringify(room.delegations.get(b.delegation))).toBe(signed);
    const map = (room.delegations.get(b.delegation) as { acts: Record<string, string> }).acts;
    expect(Object.keys(map).sort()).toEqual(["ask", "claim"]);
    expect(map["ask"]).not.toBe(await room.bindingOf("ask"));
    const caller: McpCaller = Object.freeze({ role: "agent", delegation: Object.freeze({ kinds: Object.freeze(["renew"]) as readonly string[], acts: Object.freeze({ ...map }) as never }) });
    const c = await active();
    const snapshot = JSON.stringify(c);
    expect(await eligible(caller, c)).toEqual({ named: ["claim", "renew"], generic: ["claim"] });
    expect(JSON.stringify(c)).toBe(snapshot);
  });
});

describe("listing is not permission (R-API-14)", () => {
  test("an agent on ?toolset=observer calls claim: the claim is judged and recorded as usual", async () => {
    const b = await bearer("@agent", "agent");
    expect(await listed(b, "?toolset=observer")).not.toContain("claim");
    const claim = await call(b, "claim", { goal: "g", scope: ["src/**"] }, "?toolset=observer");
    expect(claim.isError).toBe(false);
    expect(claim.structuredContent).toMatchObject({ kind: "claim", lease: { generation: 1, holder: "@agent" } });
    expect(room.lanes.size).toBe(1);
    // And a tool no toolset would show this caller is still the room's to refuse, by its own rule.
    const noLand = await bearer("@careful", "agent", { kinds: ["claim"] });
    expect(await listed(noLand)).not.toContain("propose");
    const mine = (await call(noLand, "claim", { goal: "h", scope: ["docs/**"] })).structuredContent as Claim;
    const refused = await call(noLand, "propose", { lane: mine.lane, lease: 1, head: head("a"), expectedGeneration: 0, summary: "s" });
    expect(refused.isError).toBe(false);
    expect(refused.structuredContent).toMatchObject({ refused: true, rule: "delegation-invalid" });
  });

  test("an exact retry of an accepted act returns its receipt after the kind stops being listed; a new call is refused, with no substituted binding", async () => {
    await room.activate(DECLARED);
    const binding = (await room.bindingOf("ask"))!;
    const b = await bearer("@agent", "agent", { kinds: [], acts: { ask: binding, claim: (await room.bindingOf("claim"))! } });
    const claim = (await call(b, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    const args = { kind: "ask", target: { act: claim.id }, body: { text: "why?" }, binding, idempotencyKey: "ask-1" };
    const accepted = (await call(b, "act", args)).structuredContent;
    expect(accepted).toMatchObject({ kind: "ask" });
    // The room changes what `ask` and `claim` mean: nothing in the signed map is current, so no act tool is listed.
    await room.activate({ ask: { ...ASK, body: { text: { type: "text", max: 100 } } }, verify: VERIFY });
    expect(await listed(b)).toEqual(inOrder(SETS.observer));
    expect(await listed(b, "?toolset=builder")).not.toContain("act");
    const entries = room.entries.length;
    const retried = await call(b, "act", args);
    expect(retried.isError).toBe(false);
    expect(retried.structuredContent).toEqual(accepted);
    expect(room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === ("ask" as never))).toHaveLength(1);
    // A new call with the same binding is refused by the room; the tool does not swap in the active binding.
    const fresh = await call(b, "act", { ...args, idempotencyKey: "ask-2" });
    expect(fresh.structuredContent).toMatchObject({ refused: true });
    expect(["binding-stale", "delegation-invalid"]).toContain(fresh.structuredContent.rule);
    expect(room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === ("ask" as never))).toHaveLength(1);
    expect(room.entries.length).toBeGreaterThanOrEqual(entries);
  });
});

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { encode } from "gpt-tokenizer/encoding/o200k_base";
import type { DeclaredDefinition, Item, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, textDigest } from "@generalbusiness/artroom-bytes";
import { secretSigner } from "@generalbusiness/artroom-client";
import { FIRST_ACTIONS_OF } from "@generalbusiness/artroom-platform";
import { change, change3, changeDemo, issue, issueDemo } from "@generalbusiness/artroom-lanes";
import { McpService, memoryStore, type CallResult, type CustodyStore, type McpConfig, type Mode } from "../src/index.ts";
import { fileStore } from "../src/node.ts";
import { SERVICE, StandIn } from "./support/standin.ts";

/**
 * W5: what each tool costs, counted on the stand-in's transport, which records every request the server makes: summaries,
 * retained reads, session requests, signed-read fallbacks and posts. The stand-in judges nothing (see its header); what is
 * counted here is what the server asks for. Figures are observed runs of this file, reported by annotation.
 */

const START = Date.parse("2099-01-01T00:00:00Z");
const secret = () => crypto.getRandomValues(new Uint8Array(32));

interface Served { stand: StandIn; service: McpService; config: McpConfig; clock: { now: number }; key: Uint8Array }

/** A room on the stand-in: the six platform scopes and the given lanes, for a caller of `role` with that role's first actions. */
function roomOf(role: "admin" | "maintainer" | "member" | "agent", lanes: readonly DeclaredDefinition[], options: { mode?: Mode; listPageBytes?: number; custody?: CustodyStore } = {}): Served {
  const key = secret();
  const signer = secretSigner(key);
  const stand = new StandIn(signer.key, role, FIRST_ACTIONS_OF["platform:membership@2"]![role]!);
  const register = stand.add("register", "platform:register@3");
  const inbox = stand.add("inbox", "platform:inbox@1");
  const directory = stand.scopes.get(stand.directory.scope)!;
  (directory.items[0]!.refs as Record<string, unknown>)["register"] = register;
  for (const lane of lanes) stand.lane(lane);
  const config: McpConfig = { ...stand.config(), repository: { ...stand.config().repository!, inbox: inbox.scope } };
  const clock = { now: START };
  const service = new McpService({ service: SERVICE, fetch: stand.fetch, signer, custody: options.custody ?? memoryStore(), mode: options.mode ?? "default", now: () => clock.now,
    ...(options.listPageBytes ? { listPageBytes: options.listPageBytes } : {}),
    config: { read: async () => structuredClone(config), addRoot: async (root) => { config.roots = [...(config.roots ?? []), root]; } } });
  return { stand, service, config, clock, key };
}

/** The stand-in's scope of lane `number`. */
const laneOf = (s: Served, number: number) => s.stand.scopes.get((s.stand.scopes.get(s.stand.directory.scope)!.items.find((i) => i.type === "lane" && i.values["number"] === number)!.refs["scope"] as ScopeRef).scope)!;

/** The requests one call made, and the bytes of its whole response: structured content and text together. */
async function counted(s: Served, run: () => Promise<CallResult>): Promise<{ requests: string[]; bytes: number; result: CallResult }> {
  const before = s.stand.requests.length;
  const result = await run();
  return { requests: s.stand.requests.slice(before), bytes: new TextEncoder().encode(JSON.stringify(result)).length, result };
}
const sessions = (requests: readonly string[]) => requests.filter((r) => r.endsWith("/sessions")).length;
const reads = (requests: readonly string[]) => requests.filter((r) => r.startsWith("GET ")).length;
const posts = (requests: readonly string[]) => requests.filter((r) => r.startsWith("POST ") && !r.endsWith("/sessions")).length;

/** `tools/list` as the server sends it: each page's result, in canonical JSON, with its byte and token counts. */
async function listOf(service: McpService): Promise<{ tools: number; pages: number; bytes: number; tokens: number; largestTool: number }> {
  let cursor: string | undefined;
  let tools = 0, pages = 0, bytes = 0, tokens = 0, largestTool = 0;
  do {
    const page = await service.page(cursor);
    const sent = canonicalize({ tools: page.tools, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) } as never);
    tools += page.tools.length; pages++;
    bytes += new TextEncoder().encode(sent).length;
    tokens += encode(sent).length;
    for (const t of page.tools) largestTool = Math.max(largestTool, new TextEncoder().encode(canonicalize(t as never)).length);
    cursor = page.nextCursor;
  } while (cursor);
  return { tools, pages, bytes, tokens, largestTool };
}

describe("what a call costs, end to end", () => {
  // Invariant: each tool's reads, warm and cold, are within section 8's table, and its whole response within its bound: a cold
  // call adds one session request, an expired session one more, a refused session one signed read per read, and a session the
  // scope refuses on a read one signed-read fallback for that read.
  test("reads per tool, warm and cold, with expired, refused and forbidden sessions", async ({ annotate }) => {
    // --generic=add lists every tool, so one room measures them all.
    const s = roomOf("admin", [issueDemo, changeDemo], { mode: "add" });
    await s.service.page();
    const M = s.config.repository!.membership.scope;
    const comment = await s.service.call("issue.comment", { target: 1, fields: { body: "First." }, idempotencyKey: "c-0" });
    expect(comment.isError, JSON.stringify(comment.structuredContent)).toBe(false);
    const commentSeq = (comment.structuredContent["fact"] as { seq: number }).seq;
    // The stand-in keeps no detached text of its own accord; the comment's is retained as a scope retains it.
    laneOf(s, 1).retained.set(`text ${textDigest("First.")}`, JSON.stringify("First."));
    const token = await s.service.call("repository.read-token", { on: 0, fields: { hours: 1 }, idempotencyKey: "rt-0" });
    expect(token.isError, JSON.stringify(token.structuredContent)).toBe(false);
    const tokenSeq = (token.structuredContent["fact"] as { seq: number }).seq;
    let n = 0;
    // Each tool: [name, arguments, reads bound (warm), response bound in bytes]. Bounds are section 8's.
    const tools: [string, () => Record<string, unknown>, number, number][] = [
      ["room", () => ({}), 3, 8 * 1024 * 2],
      ["inspect", () => ({ scope: 1 }), 1, 8 * 1024 * 2],
      ["inspect describe", () => ({ scope: 1, describe: "comment" }), 2, 64 * 1024 * 2],
      ["inspect declaration", () => ({ scope: 1, declaration: true }), 2, 64 * 1024 * 2],
      ["items", () => ({ scope: 1, type: "comment" }), 1, 64 * 1024 * 2],
      ["steps", () => ({ scope: 1 }), 1, 64 * 1024 * 2],
      ["step", () => ({ scope: 1, seq: commentSeq }), 1, 64 * 1024 * 2],
      ["record", () => ({ scope: 1 }), 1, 64 * 1024 * 2],
      ["sends", () => ({ scope: 1 }), 1, 64 * 1024 * 2],
      ["text", () => ({ scope: 1, kind: "text", digest: textDigest("First.") }), 1, 64 * 1024 * 2],
      ["wait", () => ({ scope: 1, seq: commentSeq }), 1, 4 * 1024 * 2],
      ["settle", () => ({ target: 1, idempotencyKey: "c-0" }), 1, 4 * 1024 * 2],
      ["actions", () => ({ scope: 1 }), 3, 64 * 1024 * 2],
      ["issue.comment", () => ({ target: 1, fields: { body: `Comment ${++n}.` }, idempotencyKey: `c-${n}` }), 2, 4 * 1024 * 2],
      ["issue.create", () => ({ fields: { definition: definitionDigest(issueDemo), title: `Issue ${++n}`, conditions: ["c"] }, idempotencyKey: `i-${n}` }), 2, 4 * 1024 * 2],
      ["credential", () => ({ entry: tokenSeq }), 1, 2 * 1024 * 2],
    ];
    // The response bounds above are doubled: the whole response carries the structured content and its text, which is the same JSON.
    const figures: string[] = [];
    for (const [label, args, bound, bytes] of tools) {
      const name = label.split(" ")[0]!;
      // Cold: the session forgotten, as a process starting would hold none.
      s.service.reads.forget(M);
      const cold = await counted(s, () => s.service.call(name, args()));
      const warm = await counted(s, () => s.service.call(name, args()));
      if (name === "credential") {
        // A read credential is minted once: the warm call finds it read already, which is the scope's answer, not a cost.
        expect(cold.result.isError, JSON.stringify(cold.result.structuredContent)).toBe(false);
      } else {
        expect([cold.result.isError, warm.result.isError], `${label}: ${JSON.stringify(warm.result.structuredContent)}`).toEqual([false, false]);
      }
      expect(sessions(cold.requests), label).toBe(1);
      expect(sessions(warm.requests), label).toBe(0);
      expect(warm.bytes, label).toBeLessThanOrEqual(bytes);
      figures.push(`${label}: warm ${reads(warm.requests)} reads, ${posts(warm.requests)} posts; cold +${sessions(cold.requests)} session; ${warm.bytes} bytes (bound ${bound} reads)`);
      if (name !== "credential" && name !== "actions") expect(reads(warm.requests), `${label} reads ${warm.requests.join(", ")}`).toBeLessThanOrEqual(bound);
    }
    // tools/list: the generation inputs, warm.
    const list = await counted(s, async () => { await s.service.page(); return { content: [], structuredContent: {}, isError: false }; });
    expect([reads(list.requests), sessions(list.requests)]).toEqual([3, 0]);
    figures.push(`tools/list: warm ${reads(list.requests)} reads`);
    // create: no read, one post.
    const created = await counted(s, () => s.service.call("create", { definition: issueDemo, kind: "file", fields: { opener: "@agent", title: "Standalone", conditions: ["c"] }, membership: s.config.repository!.membership, idempotencyKey: "create-1" }));
    expect([reads(created.requests), posts(created.requests)], JSON.stringify(created.result.structuredContent)).toEqual([0, 1]);
    figures.push(`create: ${reads(created.requests)} reads, ${posts(created.requests)} post`);

    // An expired session: the next read asks for a new one, once.
    s.clock.now += 11 * 60_000;
    const expired = await counted(s, () => s.service.call("inspect", { scope: 1 }));
    expect([sessions(expired.requests), reads(expired.requests)]).toEqual([1, 1]);
    figures.push(`inspect after the session ended: +${sessions(expired.requests)} session, ${reads(expired.requests)} read`);

    // A refused session: one session request, then signed reads; the refusal is remembered for a minute.
    s.stand.sessions = "refuse";
    s.service.reads.forget(M);
    const refused = await counted(s, () => s.service.call("inspect", { scope: 1 }));
    const again = await counted(s, () => s.service.call("inspect", { scope: 1 }));
    expect([sessions(refused.requests), reads(refused.requests), sessions(again.requests), reads(again.requests)]).toEqual([1, 1, 0, 1]);
    figures.push(`inspect with a refused session: +${sessions(refused.requests)} session, then ${reads(again.requests)} signed read`);

    // A session the scope refuses on a read: one signed-read fallback for that read.
    s.stand.sessions = "forbid";
    s.service.reads.forget(M);
    const forbidden = await counted(s, () => s.service.call("inspect", { scope: 1 }));
    expect([sessions(forbidden.requests), reads(forbidden.requests)]).toEqual([1, 2]);
    figures.push(`inspect with a session refused on the read: +${sessions(forbidden.requests)} session, ${reads(forbidden.requests)} reads (one fallback)`);
    for (const line of figures) await annotate(line);
  });

  // Invariant: room and tools/list read one summary more per configured standalone root, and one more per distinct membership
  // beyond the repository's; cold, one session request per distinct membership.
  test("a room with standalone roots and a second membership", async ({ annotate }) => {
    const s = roomOf("admin", [issueDemo]);
    const key = s.stand.key;
    const other = s.stand.add("membership", "platform:membership@2", [
      { id: 0, type: "roster", state: "active", revision: 0, opened: null, parties: {}, refs: {}, values: { adminActions: [], maintainerActions: [], memberActions: ["issue.comment"], agentActions: [], checkerActions: [] }, attributed: [] } as unknown as Item,
      { id: 1, type: "member", state: "active", revision: 0, opened: null, parties: {}, refs: {}, values: { handle: "@agent", role: "member", kind: "person" }, attributed: [] } as unknown as Item,
      { id: 2, type: "key", state: "active", revision: 0, opened: null, parties: {}, refs: { member: 1 }, values: { id: key }, attributed: [] } as unknown as Item,
    ]);
    const first = s.stand.add("lane", issueDemo);
    const second = s.stand.add("lane", issueDemo);
    s.config.roots = [{ scope: first.scope, membership: s.config.repository!.membership }, { scope: second.scope, membership: other }];
    const cold = await counted(s, () => s.service.call("room", {}));
    const warm = await counted(s, () => s.service.call("room", {}));
    expect(cold.result.structuredContent["standing"]).toEqual(expect.arrayContaining([expect.objectContaining({ membership: other.scope, role: "member" })]));
    // Warm: 3 room summaries, 2 roots, 1 for standing on the second membership.
    expect([reads(warm.requests), sessions(warm.requests)]).toEqual([6, 0]);
    expect(sessions(cold.requests)).toBe(2);
    await annotate(`room with 2 roots and a second membership: warm ${reads(warm.requests)} reads; cold ${reads(cold.requests)} reads and ${sessions(cold.requests)} sessions`);
  });

  // Invariant: nothing valid is dropped to fit a bound: a live item larger than a page is served alone and whole, a continuation
  // across a head move restarts at the new head and says so, a retained input larger than a page is read whole by offset, and a
  // descriptor larger than a list page is served alone on its page with every tool reachable.
  test("paging: an oversized item, a moved head, a large retained input, a descriptor alone", async ({ annotate }) => {
    const s = roomOf("admin", [issueDemo]);
    await s.service.page();
    const lane = laneOf(s, 1);
    const big = "x".repeat(64 * 1024);
    const row = (id: number, body: string) => ({ id, type: "comment", state: "posted", revision: 0, opened: null, parties: {}, refs: {}, values: { body }, attributed: [] }) as unknown as Item;
    lane.items.push(row(1, "small"), row(2, big), row(3, "small"));
    const first = await s.service.call("inspect", { scope: 1 });
    const page1 = first.structuredContent;
    const ids = (p: Record<string, unknown>) => (p["items"] as { id: number }[]).map((i) => i.id);
    const page2 = (await s.service.call("inspect", { scope: 1, cursor: page1["cursor"] })).structuredContent;
    expect(ids(page2)).toEqual([2]);
    expect(((page2["items"] as { values: { body: string } }[])[0]!.values.body)).toBe(big);
    // The head moves before the third page: the continuation restarts at the new head.
    s.stand.append(lane, { type: "timed", item: 0, rule: "stand-in", due: "2099-01-01T00:00:00Z" } as never);
    const page3 = (await s.service.call("inspect", { scope: 1, cursor: page2["cursor"] })).structuredContent;
    expect(page3["restarted"]).toMatch(/head moved/);
    expect(ids(page3)[0]).toBe(ids(page1)[0]);

    // A retained input of 200 KiB, read whole by offset.
    const long = "y".repeat(200 * 1024);
    lane.retained.set(`text ${textDigest(long)}`, JSON.stringify(long));
    let read = "", offset: number | undefined = 0, calls = 0;
    while (offset !== undefined) {
      const part = (await s.service.call("text", { scope: 1, kind: "text", digest: textDigest(long), offset })).structuredContent;
      read += part["text"] as string; offset = part["offset"] as number | undefined; calls++;
    }
    expect([read === long, calls]).toEqual([true, 4]);

    // A list page smaller than the largest descriptor: each such descriptor is alone on its page, and every tool is reachable.
    const small = roomOf("admin", [issueDemo, changeDemo], { listPageBytes: 2048 });
    const whole = (await small.service.snapshot()).tools.length;
    let cursor: string | undefined, seen = 0, alone = 0;
    do {
      const page = await small.service.page(cursor);
      seen += page.tools.length;
      if (page.tools.length === 1 && new TextEncoder().encode(JSON.stringify(page.tools[0])).length > 2048) alone++;
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toBe(whole);
    expect(alone).toBeGreaterThan(0);
    await annotate(`paging: a 64 KiB item alone on its inspect page; a 200 KiB text in ${calls} text calls; ${alone} descriptors alone on a 2 KiB list page of ${whole} tools`);
  });

  // Invariant: terminal resubmissions past 64 outcomes keep every outcome readable, and each resubmission costs one read and one
  // post, with the custody record on disk.
  test("resubmissions past 64 outcomes", async ({ annotate }) => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-budget-"));
    const s = roomOf("admin", [issueDemo], { custody: fileStore(dir) });
    s.stand.answers.set("comment", () => ({ answer: "refused", reason: "guard-failed", name: "nope", judgedAt: { seq: 1, hash: `sha256:${"b".repeat(64)}` } }));
    await s.service.page();
    let last: string[] = [];
    for (let i = 0; i < 70; i++) {
      const sent = await counted(s, () => s.service.call("issue.comment", { target: 1, fields: { body: "Again." }, idempotencyKey: "again", ...(i > 0 ? { resubmit: true } : {}) }));
      expect(sent.result.structuredContent["answer"], JSON.stringify(sent.result.structuredContent)).toBe("refused");
      last = sent.requests;
    }
    expect([reads(last), posts(last)]).toEqual([1, 1]);
    const settled = (await s.service.call("settle", { target: 1, idempotencyKey: "again" })).structuredContent;
    expect([settled["answer"], settled["outcomes"]]).toEqual(["refused", 70]);
    await annotate(`resubmissions: 70 outcomes kept and readable; each resubmission ${reads(last)} read and ${posts(last)} post`);
  });

  // Invariant: a subscribed client is told once per real change of the generation (an activation, a role change) and never for
  // an ordinary head advance; the watch reads only the generation inputs, and nothing when no client is subscribed.
  test("notifications: activation and standing refresh, and none for a head advance", async ({ annotate }) => {
    let fire: () => void = () => {};
    const key = secret();
    const signer = secretSigner(key);
    const stand = new StandIn(signer.key, "agent", FIRST_ACTIONS_OF["platform:membership@2"]!["agent"]!);
    stand.lane(issueDemo);
    const config = stand.config();
    const service = new McpService({ service: SERVICE, fetch: stand.fetch, signer, custody: memoryStore(), now: () => START,
      every: (_ms, run) => { fire = run; return () => { fire = () => {}; }; }, config: { read: async () => structuredClone(config), addRoot: async () => {} } });
    await service.page();
    const idle = stand.requests.length;
    fire();
    expect(stand.requests.length, "no watch runs while nobody is subscribed").toBe(idle);
    let told = 0;
    service.subscribe(() => { told++; });
    // One run of the watch, as its timer runs it, awaited.
    const tick = () => service.check();
    expect(service.watching).toBe(true);
    const before = stand.requests.length;
    await tick();
    const watchReads = stand.requests.length - before;
    expect(told).toBe(0);
    // An ordinary head advance: nothing is told.
    stand.append(laneOf({ stand } as Served, 1), { type: "timed", item: 0, rule: "stand-in", due: "2099-01-01T00:00:00Z" } as never);
    await tick();
    expect(told).toBe(0);
    // An activation: told once.
    stand.activate(change3);
    await tick(); await tick();
    expect(told).toBe(1);
    // A role change on the roster: the standing is refreshed at the next run, and told once.
    const member = stand.scopes.get(stand.membership.scope)!.items.find((i) => i.type === "member")!;
    (member.values as Record<string, unknown>)["role"] = "admin";
    (stand.scopes.get(stand.membership.scope)!.items[0]!.values as Record<string, unknown>)["adminActions"] = FIRST_ACTIONS_OF["platform:membership@2"]!["admin"];
    stand.append(stand.scopes.get(stand.membership.scope)!, { type: "timed", item: 0, rule: "stand-in", due: "2099-01-01T00:00:00Z" } as never);
    await tick(); await tick();
    expect(told).toBe(2);
    expect((await service.call("room", {})).structuredContent["standing"]).toEqual([expect.objectContaining({ role: "admin" })]);
    await annotate(`notifications: 2 told for an activation and a role change, 0 for a head advance; each watch run ${watchReads} reads`);
  });

  // Invariant: tools/list is measured as sent, per role: one page at most 256 KiB, and the totals are reported, with no gate on
  // the whole. Token counts are by gpt-tokenizer 3.4.0 with the o200k_base encoding, a proxy: an agent host's own count differs.
  test("the list per role, in bytes and tokens", async ({ annotate }) => {
    const rows: string[] = [];
    const measure = async (label: string, role: "admin" | "maintainer" | "member" | "agent", lanes: readonly DeclaredDefinition[]) => {
      const s = roomOf(role, lanes);
      const list = await listOf(s.service);
      expect(list.bytes / list.pages).toBeLessThanOrEqual(256 * 1024);
      expect(list.largestTool).toBeLessThanOrEqual(256 * 1024);
      rows.push(`${label}, ${role}: ${list.tools} tools, ${list.pages} page(s), ${list.bytes} bytes, ${list.tokens} tokens`);
      return list;
    };
    const admin = await measure("demo room", "admin", [issueDemo, changeDemo]);
    const maintainer = await measure("demo room", "maintainer", [issueDemo, changeDemo]);
    const member = await measure("demo room", "member", [issueDemo, changeDemo]);
    const agent = await measure("demo room", "agent", [issueDemo, changeDemo]);
    const full = await measure("full lane definitions and both change declarations", "admin", [issue, change, change3]);
    expect(admin.tools).toBeGreaterThan(agent.tools);
    expect(maintainer.tools).toBeGreaterThanOrEqual(member.tools);
    expect(full.tools).toBeGreaterThan(0);
    // The generic list alone, for comparison.
    const generic = await listOf(roomOf("admin", [issueDemo, changeDemo], { mode: "generic" }).service);
    rows.push(`demo room, --generic: ${generic.tools} tools, ${generic.bytes} bytes, ${generic.tokens} tokens`);
    for (const line of rows) await annotate(line);
  });
});

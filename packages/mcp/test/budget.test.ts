import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { encode } from "gpt-tokenizer/encoding/o200k_base";
import type { DeclaredDefinition, Item, ScopeRef, Seed, SignedIntent } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest, intentDigest, textDigest } from "@generalbusiness/artroom-bytes";
import { secretSigner } from "@generalbusiness/artroom-client";
import { FIRST_ACTIONS_OF } from "@generalbusiness/dap-platform";
import { change, change3, changeDemo, issue, issueDemo } from "@generalbusiness/dap-lanes";
import { BOUNDS, McpService, memoryStore, type CallResult, type CustodyStore, type McpConfig, type Mode } from "../src/index.ts";
import { ERROR_BYTES, failed } from "../src/service.ts";
import { finding } from "../src/errors.ts";
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
function roomOf(role: "admin" | "maintainer" | "member" | "agent", lanes: readonly DeclaredDefinition[], options: { mode?: Mode; listPageBytes?: number; custody?: CustodyStore; observe?: (url: string) => void } = {}): Served {
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
  const service = new McpService({ service: SERVICE, fetch: options.observe ? (url, init) => { options.observe!(url); return stand.fetch(url, init); } : stand.fetch, signer, custody: options.custody ?? memoryStore(), mode: options.mode ?? "default", now: () => clock.now, pause: async () => {},
    ...(options.listPageBytes ? { listPageBytes: options.listPageBytes } : {}),
    config: { read: async () => structuredClone(config), addRoot: async (root) => { config.roots = [...(config.roots ?? []), root]; } } });
  return { stand, service, config, clock, key };
}

/** The stand-in's scope of lane `number`. */
const laneOf = (s: Served, number: number) => s.stand.scopes.get((s.stand.scopes.get(s.stand.directory.scope)!.items.find((i) => i.type === "lane" && i.values["number"] === number)!.refs["scope"] as ScopeRef).scope)!;

/** The requests one call made, and the bytes of its whole result as the service makes it: structured content, text and isError. */
async function counted(s: Served, run: () => Promise<CallResult>): Promise<{ requests: string[]; bytes: number; result: CallResult }> {
  const before = s.stand.requests.length;
  const result = await run();
  return { requests: s.stand.requests.slice(before), bytes: new TextEncoder().encode(JSON.stringify(result)).length, result };
}
const sessions = (requests: readonly string[]) => requests.filter((r) => r.endsWith("/sessions")).length;
const reads = (requests: readonly string[]) => requests.filter((r) => r.startsWith("GET ")).length;
const posts = (requests: readonly string[]) => requests.filter((r) => r.startsWith("POST ") && !r.endsWith("/sessions")).length;

/** `tools/list` as the server sends it: each page's result, in canonical JSON, with its byte and token counts. */
async function listOf(service: McpService): Promise<{ tools: number; pages: number; bytes: number; tokens: number; largestTool: number; sizes: number[] }> {
  let cursor: string | undefined;
  let tools = 0, pages = 0, bytes = 0, tokens = 0, largestTool = 0;
  const sizes: number[] = [];
  do {
    const page = await service.page(cursor);
    const sent = canonicalize({ tools: page.tools, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) } as never);
    tools += page.tools.length; pages++;
    bytes += new TextEncoder().encode(sent).length;
    sizes.push(new TextEncoder().encode(sent).length);
    tokens += encode(sent).length;
    for (const t of page.tools) largestTool = Math.max(largestTool, new TextEncoder().encode(canonicalize(t as never)).length);
    cursor = page.nextCursor;
  } while (cursor);
  return { tools, pages, bytes, tokens, largestTool, sizes };
}

describe("what a call costs, end to end", () => {
  // Invariant: each tool's reads, warm and cold, are within section 8's table, and its whole result within its bound: a cold
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
    // A second read token: the cold call consumes the first credential, the warm call reads the second.
    const token2 = await s.service.call("repository.read-token", { on: 0, fields: { hours: 1 }, idempotencyKey: "rt-1" });
    const tokens = [tokenSeq, (token2.structuredContent["fact"] as { seq: number }).seq];
    let n = 0;
    // Each tool: [name, arguments, reads bound (warm), response bound in bytes]. Bounds are section 8's, for the whole CallResult as
    // the service makes it: the structured content, the text and isError together. Over 2026-07-28 the wire adds
    // MODERN_RESULT_EXTRA bytes, which wire.test.ts measures and the bounds do not count.
    const tools: [string, () => Record<string, unknown>, number, number][] = [
      ["room", () => ({}), 3, BOUNDS.room],
      ["inspect", () => ({ scope: 1 }), 1, BOUNDS.inspect],
      ["inspect describe", () => ({ scope: 1, describe: "comment" }), 2, BOUNDS.large],
      ["inspect declaration", () => ({ scope: 1, declaration: true }), 2, BOUNDS.large],
      ["items", () => ({ scope: 1, type: "comment" }), 1, BOUNDS.large],
      ["steps", () => ({ scope: 1 }), 1, BOUNDS.large],
      ["step", () => ({ scope: 1, seq: commentSeq }), 1, BOUNDS.large],
      ["record", () => ({ scope: 1 }), 1, BOUNDS.large],
      ["sends", () => ({ scope: 1 }), 1, BOUNDS.large],
      ["text", () => ({ scope: 1, kind: "text", digest: textDigest("First.") }), 1, BOUNDS.large],
      ["wait", () => ({ scope: 1, seq: commentSeq }), 1, BOUNDS.act],
      ["settle", () => ({ target: 1, idempotencyKey: "c-0" }), 1, BOUNDS.act],
      ["actions", () => ({ scope: 1 }), 3, BOUNDS.large],
      ["issue.comment", () => ({ target: 1, fields: { body: `Comment ${++n}.` }, idempotencyKey: `c-${n}` }), 2, BOUNDS.act],
      ["issue.create", () => ({ fields: { definition: definitionDigest(issueDemo), title: `Issue ${++n}`, conditions: ["c"] }, idempotencyKey: `i-${n}` }), 2, BOUNDS.act],
      ["credential", () => ({ entry: tokens.shift() }), 1, BOUNDS.credential],
    ];
    const figures: string[] = [];
    for (const [label, args, bound, bytes] of tools) {
      const name = label.split(" ")[0]!;
      // Cold: the session forgotten, as a process starting would hold none.
      s.service.reads.forget(M);
      const cold = await counted(s, () => s.service.call(name, args()));
      const warm = await counted(s, () => s.service.call(name, args()));
      expect([cold.result.isError, warm.result.isError], `${label}: ${JSON.stringify(warm.result.structuredContent)}`).toEqual([false, false]);
      expect(sessions(cold.requests), label).toBe(1);
      expect(sessions(warm.requests), label).toBe(0);
      expect([cold.bytes, warm.bytes].every((b) => b <= bytes), `${label}: ${cold.bytes} and ${warm.bytes} bytes, bound ${bytes}`).toBe(true);
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

  // Invariant: room pages every collection it returns (lanes, applications, roots, standing, active definitions, act tools not
  // held) by bytes, within its 8 KiB bound, with a continuation; every entry is reached once.
  test("room pages its collections within its bound", async ({ annotate }) => {
    const lanes = Array.from({ length: 60 }, () => issueDemo);
    const s = roomOf("member", lanes);
    for (let i = 0; i < 40; i++) s.config.roots = [...(s.config.roots ?? []), { scope: s.stand.add("lane", issueDemo).scope, membership: s.config.repository!.membership }];
    // 30 applications the directory's factory created, as directory items of type application.
    const directory = s.stand.scopes.get(s.stand.directory.scope)!;
    for (let i = 0; i < 30; i++) directory.items.push({ id: 10_000 + i, type: "application", state: "created", revision: 0, opened: null, parties: {}, refs: { scope: s.stand.add("lane", issueDemo) }, values: { definition: definitionDigest(issueDemo) }, attributed: [] } as unknown as Item);
    const seen: Record<string, number> = {};
    let cursor: string | undefined, pages = 0;
    do {
      const got = await counted(s, () => s.service.call("room", cursor ? { cursor } : {}));
      expect(got.bytes, `room page ${pages + 1}`).toBeLessThanOrEqual(BOUNDS.room);
      for (const k of ["lanes", "applications", "roots", "standing", "active", "notHeld"]) seen[k] = (seen[k] ?? 0) + (got.result.structuredContent[k] as unknown[]).length;
      cursor = got.result.structuredContent["cursor"] as string | undefined;
      pages++;
    } while (cursor);
    expect([seen["lanes"], seen["applications"], seen["roots"], seen["standing"], seen["active"]]).toEqual([60, 30, 40, 1, 1]);
    expect(seen["notHeld"]).toBeGreaterThan(0);
    expect(pages).toBeGreaterThan(1);
    await annotate(`room: 60 lanes, 30 applications, 40 roots and the rest in ${pages} pages, each within 8 KiB`);
  });

  // Invariant: room's continuation is bound to its own layout, not to the tool list's generation. A row the list does not count
  // (an application still being created, or one whose creation then fails and leaves the directory's live items) moves the
  // entries after it without changing the generation; a continuation made before the move restarts at the first entry and says
  // so, and the walk from there returns every root once, within the bound. The totals-and-bounds case above proves no more than
  // totals and bounds; this one proves the pages agree with each other.
  test("room's continuation across a creating, a created and a refused application: restart, no repeat, no skip", async ({ annotate }) => {
    const s = roomOf("member", Array.from({ length: 30 }, () => issueDemo));
    const roots = Array.from({ length: 40 }, () => s.stand.add("lane", issueDemo).scope);
    s.config.roots = roots.map((scope) => ({ scope, membership: s.config.repository!.membership }));
    const directory = s.stand.scopes.get(s.stand.directory.scope)!;
    type Page = { roots: { scope: string }[]; applications: { scope: string | null; state: string }[]; cursor?: string; restarted?: string };
    const room = async (cursor?: string): Promise<Page> => {
      const got = await counted(s, () => s.service.call("room", cursor ? { cursor } : {}));
      expect(got.bytes).toBeLessThanOrEqual(BOUNDS.room);
      return got.result.structuredContent as unknown as Page;
    };
    // A cursor whose next page starts inside the roots.
    const insideRoots = async (): Promise<string> => {
      let seen = 0;
      for (let page = await room(); page.cursor; page = await room(page.cursor)) {
        seen += page.roots.length;
        if (seen > 0 && seen < roots.length) return page.cursor;
      }
      throw new Error("no continuation inside the roots");
    };
    // The walk from a page on: every root once, and the applications as listed.
    const walk = async (first: Page) => {
      const seen: string[] = [];
      const applications: Page["applications"] = [];
      for (let page: Page | null = first; page; page = page.cursor ? await room(page.cursor) : null) { seen.push(...page.roots.map((r) => r.scope)); applications.push(...page.applications); }
      expect([seen.length, new Set(seen).size, roots.every((r) => seen.includes(r))]).toEqual([roots.length, roots.length, true]);
      return applications;
    };
    const application = (id: number, state: string, scope: ScopeRef | null) => ({ id, type: "application", state, revision: 0, opened: null, parties: {}, refs: scope ? { scope } : {}, values: { definition: definitionDigest(issueDemo) }, attributed: [] }) as unknown as Item;
    const generation = (await s.service.page()).generation;
    const restarts: string[] = [];
    const resume = async (cursor: string, what: string) => {
      const page = await room(cursor);
      expect(page.restarted, what).toBe("The room's collections changed since the cursor was made; this page restarts at the first entry.");
      restarts.push(what);
      return page;
    };

    // A creating application: the generation does not change; the continuation restarts.
    let cursor = await insideRoots();
    directory.items.push(application(9_001, "creating", null));
    expect((await s.service.page()).generation).toBe(generation);
    expect(await walk(await resume(cursor, "creating"))).toEqual([{ definition: "issue", digest: definitionDigest(issueDemo), scope: null, state: "creating" }]);
    // The same application created: listed with its scope; a continuation made while it was creating restarts.
    cursor = await insideRoots();
    const created = s.stand.add("lane", issueDemo);
    directory.items.splice(directory.items.findIndex((i) => i.id === 9_001), 1, application(9_001, "created", created));
    expect((await walk(await resume(cursor, "created"))).map((a) => [a.scope, a.state])).toEqual([[created.scope, "created"]]);
    // A second application, creating and then refused: a final row leaves the directory's live items, and the room's list.
    directory.items.push(application(9_002, "creating", null));
    cursor = await insideRoots();
    directory.items.splice(directory.items.findIndex((i) => i.id === 9_002), 1);
    expect((await walk(await resume(cursor, "refused"))).map((a) => [a.scope, a.state])).toEqual([[created.scope, "created"]]);
    // With nothing moved, a continuation goes on with no restart.
    cursor = await insideRoots();
    expect((await room(cursor)).restarted).toBeUndefined();
    await annotate(`room continuations: restarted after ${restarts.join(", ")}; each walk from the restart returned all ${roots.length} roots once, every page within 8 KiB`);
  });

  // Invariant: a history search goes on from where it stopped, with bounded work per poll or call and no fixed cutoff: a mint's
  // outcome 100 entries after its act, a creation completed 100 entries after its act, and a final item on the fifth page of
  // final items are each found, and no entry is read twice.
  test("history searches go on from where they stopped, past any window", async ({ annotate }) => {
    const s = roomOf("admin", [issueDemo]);
    await s.service.page();
    const entryReads = (requests: readonly string[]) => requests.filter((r) => /\/entries\/\d+$/.test(r));

    // The credential: 100 entries between the act and its mint's outcome.
    s.stand.fillerBeforeOutcome = 100;
    const token = await s.service.call("repository.read-token", { on: 0, fields: { hours: 1 }, idempotencyKey: "far-token" });
    const seq = (token.structuredContent["fact"] as { seq: number }).seq;
    const calls: string[][] = [];
    let got: CallResult;
    do {
      const c = await counted(s, () => s.service.call("credential", { entry: seq })); got = c.result; calls.push(c.requests);
      // Later native heads must not reset an immutable opening entry's search.
      if (got.isError) s.stand.append(s.stand.scopes.get(s.stand.destination.scope)!, { type: "timed", item: 0, rule: "stand-in", due: "2099-01-01T00:00:00Z" } as never);
    } while (got.isError && calls.length < 20);
    expect(got.isError, JSON.stringify(got.structuredContent)).toBe(false);
    for (const c of calls) expect(entryReads(c).length).toBeLessThanOrEqual(17);
    const searched = calls.flatMap(entryReads).filter((r) => !r.endsWith(`/entries/${seq}`));
    expect(new Set(searched).size, "no entry of the search is read twice").toBe(searched.length);

    // A creation completed by a later entry, 100 entries after the act, as an outside answer completes the register's found.
    const lane = laneOf(s, 1);
    const act = await s.service.call("issue.comment", { target: 1, fields: { body: "Make a scope." }, idempotencyKey: "far-create" });
    const actSeq = (act.structuredContent["fact"] as { seq: number }).seq;
    for (let i = 0; i < 100; i++) s.stand.append(lane, { type: "timed", item: 0, rule: "stand-in", due: "2099-01-01T00:00:00Z" } as never);
    const intent = (lane.entries[actSeq]!.entry.input as { signed: SignedIntent }).signed.intent;
    const seed: Seed = { v: 1, kind: "lane", definition: definitionDigest(issueDemo), creator: lane.ref, cause: intentDigest(intent), ordinal: 0 };
    const child = s.stand.seeded(seed);
    s.stand.append(lane, { type: "timed", item: 0, rule: "stand-in", due: "2099-01-01T00:00:00Z" } as never, [], [{ n: 1, to: seed, message: { class: "request", type: "create", body: null } } as never]);
    const waited = await counted(s, () => s.service.call("wait", { scope: 1, entry: actSeq }));
    expect([waited.result.structuredContent["timedOut"], (waited.result.structuredContent["created"] as { scope: string }[]).map((c) => c.scope)], JSON.stringify(waited.result.structuredContent)).toEqual([false, [child.scope]]);
    const polls = waited.result.structuredContent["polls"] as number;
    expect(polls).toBeGreaterThan(1);
    const scanned = entryReads(waited.requests).filter((r) => !r.endsWith(`/entries/${actSeq}`) && !r.includes(child.scope));
    expect(new Set(scanned).size).toBe(scanned.length);

    // A final item on the fifth page of the retained final items: found by following the pages across polls.
    for (let i = 0; i < 9; i++) lane.final.push({ id: 100 + i, type: "merge", state: "published", revision: 0, opened: null, parties: {}, refs: {}, values: {}, attributed: [] } as unknown as Item);
    const final = await s.service.call("wait", { scope: 1, item: 108, type: "merge" });
    expect([final.structuredContent["final"], (final.structuredContent["item"] as { id: number }).id, final.structuredContent["polls"]]).toEqual([true, 108, 2]);
    await annotate(`searches: a mint outcome 100 entries on, in ${calls.length} credential calls; a creation 100 entries on, in ${polls} polls of one wait; a final item on page 5, in 2 polls`);
  });

  // Invariant: progress for a final-item query belongs to that query at its
  // observed native head; another query or head starts at the first page.
  // This is the actual MCP service over the labelled HTTP stand-in, not Native.
  test.each(["query", "head"] as const)("final-page continuation does not cross a different %s", async (change) => {
    const urls: string[] = [];
    const s = roomOf("admin", [issueDemo], { observe: url => urls.push(url) });
    await s.service.page();
    const lane = laneOf(s, 1);
    for (let i = 0; i < 9; i++) lane.final.push({ id: 100 + i, type: "merge", state: "published", revision: 0, opened: null, parties: {}, refs: {}, values: {}, attributed: [] } as unknown as Item);
    const missed = await s.service.call("wait", { scope: 1, item: 999, type: "merge", seconds: 1 });
    expect(missed.structuredContent["timedOut"]).toBe(true);
    urls.length = 0;
    if (change === "query") {
      const found = await s.service.call("wait", { scope: 1, item: 100, type: "merge", seconds: 1 });
      expect([found.structuredContent["timedOut"], (found.structuredContent["item"] as Item | undefined)?.id]).toEqual([false, 100]);
    } else {
      s.stand.append(lane, { type: "timed", item: 0, rule: "stand-in", due: "2099-01-01T00:00:00Z" } as never);
      const stillMissing = await s.service.call("wait", { scope: 1, item: 999, type: "merge", seconds: 1 });
      expect(stillMissing.structuredContent["timedOut"]).toBe(true);
    }
    const cursors = urls.map(url => new URL(url)).filter(url => url.pathname.endsWith("/items/merge")).map(url => url.searchParams.get("cursor"));
    expect(cursors.length).toBeGreaterThan(0);
    expect(cursors[0], "the new query/head must not send an older continuation").toBeNull();
    expect(cursors.length).toBeLessThanOrEqual(4);
  });

  test("a final-item read cannot be labelled with an earlier summary head", async () => {
    let beforeItems = () => {};
    const s = roomOf("admin", [issueDemo], { observe: url => { if (new URL(url).pathname.endsWith("/items/merge")) beforeItems(); } });
    await s.service.page();
    const lane = laneOf(s, 1);
    lane.final.push({ id: 100, type: "merge", state: "published", revision: 0, opened: null, parties: {}, refs: {}, values: {}, attributed: [] } as unknown as Item);
    beforeItems = () => {
      beforeItems = () => {};
      s.stand.append(lane, { type: "timed", item: 0, rule: "stand-in", due: "2099-01-01T00:00:00Z" } as never);
    };
    const moved = await s.service.call("wait", { scope: 1, item: 100, type: "merge", seconds: 1 });
    expect([moved.structuredContent["timedOut"], moved.structuredContent["item"]]).toEqual([true, undefined]);
    const current = await s.service.call("wait", { scope: 1, item: 100, type: "merge", seconds: 1 });
    expect([current.structuredContent["timedOut"], (current.structuredContent["item"] as Item).id, current.structuredContent["head"]]).toEqual([false, 100, s.stand.head(lane)]);
  });

  // Invariant: settle and prepare stay within their bound: each step is a projection of its latest answer, the steps are paged
  // with a cursor, and every step of a record is reachable.
  test("settlement and preparation results within their bound", async ({ annotate }) => {
    const s = roomOf("admin", [issueDemo]);
    await s.service.page();
    const sizes: number[] = [];
    for (let i = 0; i < 20; i++) {
      const prepared = await counted(s, () => s.service.call("prepare", { target: 1, kind: "comment", fields: { body: "Steps." }, idempotencyKey: "many-steps", resource: 1, capability: "hold@1", step: `step-${i}` }));
      expect(prepared.result.isError, JSON.stringify(prepared.result.structuredContent)).toBe(false);
      sizes.push(prepared.bytes);
    }
    expect(Math.max(...sizes)).toBeLessThanOrEqual(BOUNDS.act);
    const seen: string[] = [];
    let cursor: string | undefined, pages = 0;
    do {
      const got = await counted(s, () => s.service.call("settle", { target: 1, idempotencyKey: "many-steps", ...(cursor ? { cursor } : {}) }));
      expect(got.bytes, `settle page ${pages + 1}`).toBeLessThanOrEqual(BOUNDS.act);
      seen.push(...(got.result.structuredContent["steps"] as { step: string }[]).map((x) => x.step));
      cursor = got.result.structuredContent["cursor"] as string | undefined;
      pages++;
    } while (cursor);
    expect(seen.sort()).toEqual(Array.from({ length: 20 }, (_, i) => `step-${i}`).sort());
    await annotate(`settle: 20 steps of one key in ${pages} pages, each within 4 KiB; each prepare result at most ${Math.max(...sizes)} bytes`);
  });

  // Invariant: a call by a tool name already known, at a root that another process added to the configuration under a second
  // membership, is served under that membership, with no list or room call first.
  test("a known name at a root added under a second membership", async ({ annotate }) => {
    const s = roomOf("admin", [issueDemo]);
    const item = (id: number, type: string, values: Record<string, unknown>, refs: Record<string, unknown> = {}) => ({ id, type, state: "active", revision: 0, opened: null, parties: {}, refs, values, attributed: [] }) as unknown as Item;
    const other = s.stand.add("membership", "platform:membership@2", [item(0, "roster", { adminActions: [], maintainerActions: [], memberActions: ["issue.comment"], agentActions: [], checkerActions: [] }), item(1, "member", { handle: "@agent", role: "member", kind: "person" }), item(2, "key", { id: s.stand.key }, { member: 1 })]);
    const first = s.stand.add("lane", issueDemo);
    s.config.roots = [{ scope: first.scope, membership: s.config.repository!.membership }];
    expect(await s.service.call("issue.comment", { target: first.scope, fields: { body: "First root." }, idempotencyKey: "root-1" })).toMatchObject({ isError: false });
    // Another process records a second root, under the second membership.
    const second = s.stand.add("lane", issueDemo);
    s.config.roots = [...s.config.roots, { scope: second.scope, membership: other }];
    const called = await counted(s, () => s.service.call("issue.comment", { target: second.scope, fields: { body: "Second root." }, idempotencyKey: "root-2" }));
    expect(called.result.isError, JSON.stringify(called.result.structuredContent)).toBe(false);
    expect(called.requests).toContain(`POST /v1/scopes/${other.scope}/sessions`);
    expect(called.requests.some((r) => r.startsWith("GET /") && r.includes(second.scope))).toBe(true);
    await annotate(`a known name at a new root: ${called.requests.length} requests, the session of the second membership among them`);
  });

  // Invariant: a capability or step name longer than 128 bytes is refused before anything is signed, kept or sent, and the
  // refusal stays within its bound; it does not repeat the name.
  test("an over-long capability or step name is refused whole, within the bound", async ({ annotate }) => {
    const s = roomOf("admin", [issueDemo], { custody: memoryStore() });
    await s.service.page();
    const huge = "c".repeat(100 * 1024);
    const sizes: number[] = [];
    for (const args of [{ capability: huge, step: "instance" }, { capability: "hold@1", step: huge }]) {
      for (const kind of [{}, { kind: "comment", target: 1 }]) {
        const got = await counted(s, () => s.service.call("prepare", { resource: 1, fields: {}, idempotencyKey: "long-name", ...kind, ...args }));
        expect([got.result.isError, got.result.structuredContent["error"]]).toEqual([true, "shape"]);
        expect(got.bytes).toBeLessThanOrEqual(BOUNDS.act);
        expect(JSON.stringify(got.result)).not.toContain("c".repeat(200));
        expect(got.requests, "nothing read or sent").toEqual([]);
        sizes.push(got.bytes);
      }
    }
    expect(await s.service.custody.store.unresolved()).toEqual([]);
    await annotate(`over-long names: refused with nothing kept or sent, results of at most ${Math.max(...sizes)} bytes`);
  });

  // Invariant: a caller's fragment in an error is clipped to 128 characters with its length, and the whole serialized error
  // fits the bound of the tool that gave it: an oversized target to inspect, to an act tool and to act, and a 100 KiB unknown
  // field name to create. Nothing is kept or sent for any of them.
  test("oversized targets and field names: errors within the tool's bound", async ({ annotate }) => {
    const s = roomOf("admin", [issueDemo], { custody: memoryStore(), mode: "add" });
    await s.service.page();
    const huge = "t".repeat(100 * 1024);
    const sizes: string[] = [];
    const cases: [string, string, Record<string, unknown>, number][] = [
      ["inspect", "inspect", { scope: huge }, BOUNDS.inspect],
      ["an act tool", "issue.comment", { target: huge, fields: { body: "x" }, idempotencyKey: "huge-target" }, BOUNDS.act],
      ["act", "act", { target: huge, kind: "comment", fields: { body: "x" }, idempotencyKey: "huge-act" }, BOUNDS.act],
      ["create", "create", { definition: issueDemo, kind: "file", fields: { opener: "@agent", title: "T", conditions: ["c"], [huge]: 1 }, membership: s.config.repository!.membership, idempotencyKey: "huge-field" }, BOUNDS.act],
    ];
    for (const [label, tool, args, bound] of cases) {
      const got = await counted(s, () => s.service.call(tool, args));
      expect(got.result.isError, label).toBe(true);
      expect(got.bytes, `${label}: ${got.bytes} bytes`).toBeLessThanOrEqual(bound);
      const message = got.result.structuredContent["message"] as string;
      // A target that names no scope is quoted as its JSON, so its length counts the two quotes.
      expect(message, label).toMatch(/… \(10240[02] characters\)/);
      expect(JSON.stringify(got.result), label).not.toContain("t".repeat(200));
      expect(got.result.structuredContent["next"], label).toEqual(expect.any(String));
      expect(got.requests.filter((r) => r.startsWith("POST")), `${label}: nothing sent`).toEqual([]);
      sizes.push(`${label} ${got.bytes}`);
    }
    expect(await s.service.custody.store.unresolved()).toEqual([]);
    await annotate(`oversized fragments: whole errors of ${sizes.join(", ")} bytes`);
  });

  // Invariant: an error whose sentence would pass the error bound is cut in its sentence only, says so, and keeps its kind and
  // its next step whole.
  test("an error past its bound is cut in its sentence only", () => {
    const got = failed({ error: "target", what: `${"w".repeat(10_000)}` });
    const structured = got.structuredContent as { error: string; message: string; next: string };
    expect(new TextEncoder().encode(JSON.stringify(got)).length).toBeLessThanOrEqual(ERROR_BYTES);
    expect(structured.error).toBe("target");
    expect(structured.next).toBe("Call room for the scopes and lanes of the room; give target as a scope ID or a number.");
    expect(structured.message).toMatch(/^Before signing, the server could not resolve the target: w+… \(the sentence is cut here; it had \d+ characters\)$/);
    expect(JSON.parse(got.content[0]!.text)).toEqual(structured);
  });

  // Invariant: a dead reclaimer under a long ARTROOM_HOME is reported within the error bound: the reclaim file is named once, in
  // the next step, whole and relative to ARTROOM_HOME, and the absolute path is not in the result. Removing that file recovers.
  // The home is longer than macOS's PATH_MAX of 1024 bytes and cannot be made there (ENAMETOOLONG), so the witness runs where a
  // path may be that long, as on Linux; it is skipped, not passed, elsewhere.
  test.skipIf(process.platform === "darwin")("a dead reclaimer under a long ARTROOM_HOME: the file named whole, relative, within the bound", async ({ annotate }) => {
    const deadPid = () => new Promise<number>((resolve) => { const p = spawn(process.execPath, ["-e", ""]); p.on("exit", () => resolve(p.pid!)); });
    // 24 components of 90 characters: a home of more than 2 KiB, lawful on Linux.
    const home = join(mkdtempSync(join(tmpdir(), "mcp-home-")), ...Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}${"h".repeat(88)}`));
    const custodyDir = join(home, "private", "mcp-custody");
    mkdirSync(custodyDir, { recursive: true });
    const lease = join(custodyDir, "capacity.lease");
    writeFileSync(lease, JSON.stringify({ pid: await deadPid(), token: "dead-owner" }));
    writeFileSync(`${lease}.reclaim`, JSON.stringify({ pid: await deadPid(), token: "dead-reclaimer" }));
    const s = roomOf("admin", [issueDemo], { custody: fileStore(custodyDir) });
    await s.service.page();
    const got = await counted(s, () => s.service.call("issue.comment", { target: 1, fields: { body: "Blocked." }, idempotencyKey: "long-home" }));
    const structured = got.result.structuredContent as { error: string; message: string; next: string };
    expect([got.result.isError, structured.error]).toEqual([true, "custody"]);
    expect(got.bytes).toBeLessThanOrEqual(Math.min(ERROR_BYTES, BOUNDS.act));
    expect(structured.next).toBe("Once no process of this ARTROOM_HOME runs, remove the file private/mcp-custody/capacity.lease.reclaim, relative to ARTROOM_HOME, then call again with the same idempotencyKey.");
    expect(structured.message).not.toContain("capacity.lease.reclaim");
    expect(JSON.stringify(got.result)).not.toContain("h".repeat(88));
    expect(got.requests.filter((r) => r.startsWith("POST"))).toEqual([]);
    // The operator removes the file the next step names, under the home: the call goes on.
    unlinkSync(join(home, "private", "mcp-custody", "capacity.lease.reclaim"));
    const after = await s.service.call("issue.comment", { target: 1, fields: { body: "Recovered." }, idempotencyKey: "long-home" });
    expect(after.structuredContent["answer"], JSON.stringify(after.structuredContent)).toBe("accepted");
    await annotate(`a dead reclaimer under a home of ${home.length} characters: an error of ${got.bytes} bytes`);
  });

  // Invariant: no error result passes the bound near its edge, where the result with an empty sentence fits but the sentence's
  // mark alone does not: every length of a long next step across that edge gives a result within ERROR_BYTES, measured whole.
  test("an error at the edge of its bound: the marked minimum is measured, not the empty sentence", () => {
    const sizes: number[] = [];
    let edge = 0;
    for (let n = 700; n <= 1100; n++) {
      const f = { error: "custody", state: "locked", key: "k", scope: "s", stale: "x".repeat(n) } as const;
      const got = failed(f);
      const size = new TextEncoder().encode(JSON.stringify(got)).length;
      sizes.push(size);
      const said = finding(f);
      const empty = new TextEncoder().encode(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ error: said.error, message: "", next: said.next }) }], structuredContent: { error: said.error, message: "", next: said.next }, isError: true })).length;
      if (empty <= ERROR_BYTES && empty + 2 * 60 > ERROR_BYTES) edge++;
    }
    expect(edge, "lengths whose empty-sentence result fits but whose marked sentence would not").toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(ERROR_BYTES);
  });

  // Invariant: were a finding's next step itself past the bound, the result still fits: the sentence is cut away, and the next
  // step is cut to fit, with its length.
  test("a next step past the bound is cut, and the result still fits", () => {
    const got = failed({ error: "custody", state: "locked", key: "k", scope: "s", stale: "x".repeat(5000) });
    const structured = got.structuredContent as { error: string; message: string; next: string };
    expect(new TextEncoder().encode(JSON.stringify(got)).length).toBeLessThanOrEqual(ERROR_BYTES);
    expect(structured.error).toBe("custody");
    expect(structured.message).toMatch(/^… \(the sentence is cut here; it had \d+ characters\)$/);
    expect(structured.next).toMatch(/^Once no process of this ARTROOM_HOME runs, remove the file private\/mcp-custody\/x+… \(the next step is cut here; it had \d+ characters\)$/);
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
      // Every one of the 70: one read of the lane and one post, and nothing else (the session was taken by the list before).
      expect([reads(sent.requests), posts(sent.requests), sessions(sent.requests)], `refusal ${i + 1}: ${sent.requests.join(", ")}`).toEqual([1, 1, 0]);
      last = sent.requests;
    }
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
      for (const [i, size] of list.sizes.entries()) expect(size, `${label}, ${role}: page ${i + 1}`).toBeLessThanOrEqual(256 * 1024);
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

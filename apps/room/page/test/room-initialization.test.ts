import { expect, test } from "vitest";
import type { Head, Item, ScopeRef, Summary } from "@generalbusiness/dap-contract";
import { canonicalize, readItemQueryParameter, itemQueryDigest, itemQueryArgument, digestBytes, keyIdOfSecret, newIncarnation, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { Session as ReadSession } from "@generalbusiness/artroom-client";
import { roomInitialization, initializationStillCurrent, type Room } from "../src/data.ts";
import { initializationMessage } from "../src/shell.ts";

// Scripted authenticated read answers, not native creation or permission evidence.
// Real client HTTP reads and bounded current/final selection replies are exercised.
test("initialization guidance needs complete initial rules and no live or retired definitions; read failures and changed context stay unknown", async () => {
  const digest = digestBytes(new Uint8Array([1]));
  const scope = (kind: ScopeRef["kind"], n: number): ScopeRef => ({ scope: scopeIdOf({ v: 1, kind, definition: digest, creator: null, cause: digest, ordinal: n }), inc: newIncarnation(new Uint8Array(16).fill(n)), kind });
  const D = scope("directory", 1), M = scope("membership", 2), Q = scope("rules", 3), G = scope("destination", 4);
  const head: Head = { seq: 1, hash: digest };
  const item = (over: Partial<Item>): Item => ({ id: 0, type: "rules", state: "current", revision: 1, opened: digest, parties: {}, refs: {}, values: {}, attributed: [], ...over });
  const rule = item({ refs: { directory: { ...D } }, values: { branch: "main", membership: M.scope, approvals: 1, ownerMayReview: false, singleControllerException: false } });
  const repository = item({ type: "repository", refs: { membership: { ...M }, rules: { ...Q }, destination: { ...G } } });
  let rulesDefinition: Summary["definition"] = "platform:rules@3", ownerMayReview: boolean | undefined = false;
  const summary = (at: ScopeRef, items: Item[]): Summary => ({ scope: at, status: "active", definition: at.kind === "rules" ? rulesDefinition : "platform:directory@3", time: "2026-10-12T00:00:00Z", items, counts: [] });
  let mode: "empty" | "live" | "published" | "revised" | "retired" | "forbidden" | "incomplete" | "missing" | "moved" | "context" = "empty", reads = 0, mutations = 0, definitionReads = 0, denyDefinitionReads = false;
  let pageEntered!: () => void, resumePage!: () => void;
  const fetch = async (url: string, init?: { method?: string }): Promise<Response> => {
    reads++;
    if ((init?.method ?? "GET") !== "GET") { mutations++; throw new Error("No mutation is permitted by this fixture"); }
    const path = new URL(url).pathname;
    const frontier: Head = mode === "live" ? { seq: 2, hash: digestBytes(new Uint8Array([2])) } : mode === "retired" ? { seq: 3, hash: digestBytes(new Uint8Array([3])) } : head;
    if (path === `/v1/scopes/${D.scope}`) return Response.json({ ok: true, complete: true, at: head, value: summary(D, [repository]) });
    if (path === `/v1/scopes/${Q.scope}`) {
      if (mode === "forbidden") return Response.json({ ok: false, reason: "forbidden" }, { status: 403 });
      const definitions = mode === "live" ? [item({ id: 2, type: "definition", state: "active", values: { name: "issue", digest } })] : [];
      const initialRule = { ...rule, values: { ...rule.values } };
      if (ownerMayReview === undefined) delete initialRule.values["ownerMayReview"];
      else initialRule.values["ownerMayReview"] = ownerMayReview;
      const current = mode === "published" ? { ...initialRule, refs: { ...initialRule.refs, published: 1 } } : mode === "revised" ? { ...initialRule, revision: 2 } : initialRule;
      return Response.json({ ok: true, complete: mode !== "incomplete", at: frontier, value: summary(Q, mode === "missing" ? [] : [current, ...definitions]) });
    }
    if (path === `/v1/scopes/${Q.scope}/query-items`) {
      definitionReads++;
      if (denyDefinitionReads) return Response.json({ ok: false, reason: "forbidden" }, { status: 403 });
      const query = readItemQueryParameter(new URL(url).searchParams.get("q"))!;
      if (mode === "context") { pageEntered(); await new Promise<void>(resolve => { resumePage = resolve; }); }
      const values = mode === "retired" ? [item({ id: 2, type: "definition", state: "retired", values: { name: "issue", digest } })] : [];
      return new Response(canonicalize({ ok: true, complete: true, at: mode === "moved" ? { ...head, seq: 2 } : frontier, value: { v: 1, scope: query.scope, query: itemQueryDigest(query), argument: itemQueryArgument(query), items: values } }));
    }
    throw new Error("Unexpected scripted read");
  };
  const secret = new Uint8Array(32), key = keyIdOfSecret(secret);
  const room: Room = { session: { service: "https://room.test", secret, fetch, now: () => Date.parse("2026-10-12T00:00:00Z") }, directory: D.scope, membership: M, rules: Q.scope, destination: G.scope, key, me: null, reader: new ReadSession("SCRIPTED-private-session", { v: 1, deployment: "SCRIPTED", membership: M, member: "@reader", key, reads: ["summary", "items"], ends: "2026-10-12T00:10:00Z" }), unsessioned: null, directoryIndex: null, definitions: new Map() };
  let initial: Awaited<ReturnType<typeof roomInitialization>> | null = null;
  for (const [definition, flag] of [["platform:rules@1", false], ["platform:rules@2", false], ["platform:rules@3", false], ["platform:rules@4", true]] as const) {
    rulesDefinition = definition; ownerMayReview = flag;
    initial = await roomInitialization(room);
    expect(initial).toMatchObject({ state: "not-initialized", scope: Q, head, definition, rulesItem: 0 });
    if (initial.state !== "not-initialized") throw new Error("Expected positive scripted initial state");
    expect(await initializationStillCurrent(room, initial)).toBe(true);
  }
  if (!initial || initial.state !== "not-initialized") throw new Error("Expected retained rules4 initial proof");
  expect(initializationMessage(initial.state)).toBe("This room is not initialized yet. Its creator initializes it before issues, changes and rules can be used.");
  for (const [definition, flag] of [["platform:rules@4", false], ["platform:rules@3", true], ["platform:rules@4", undefined], ["platform:rules@99", false]] as const) {
    rulesDefinition = definition; ownerMayReview = flag;
    const unknown = await roomInitialization(room);
    expect(unknown.state).toBe("unknown"); expect(initializationMessage(unknown.state)).toBeNull();
  }
  rulesDefinition = "platform:rules@4"; ownerMayReview = true;
  mode = "live";
  expect(await initializationStillCurrent(room, initial)).toBe(false); // Initialization observed after H0 and before display.
  // These complete summaries prove configured even when history is denied.
  // The actual HTTP boundary must receive no definition-page request.
  denyDefinitionReads = true; const beforeConfigured = definitionReads;
  expect((await roomInitialization(room)).state).toBe("configured");
  mode = "published"; expect((await roomInitialization(room)).state).toBe("configured");
  mode = "revised"; expect((await roomInitialization(room)).state).toBe("configured");
  expect(definitionReads).toBe(beforeConfigured);
  denyDefinitionReads = false;
  mode = "retired"; expect((await roomInitialization(room)).state).toBe("configured");
  for (const failure of ["forbidden", "incomplete", "missing", "moved"] as const) {
    mode = failure; const unknown = await roomInitialization(room);
    expect(unknown.state).toBe("unknown"); expect(initializationMessage(unknown.state)).toBeNull();
  }
  mode = "context"; const entered = new Promise<void>(resolve => { pageEntered = resolve; });
  const old = roomInitialization(room); await entered;
  room.membership = { ...M, inc: newIncarnation(new Uint8Array(16).fill(5)) }; resumePage();
  expect((await old).state).toBe("unknown");
  expect(reads).toBeGreaterThan(0); expect(mutations).toBe(0);
});

import { expect, test, vi } from "vitest";
import type { ItemQuery, ItemQueryRead, ScopeRef } from "@generalbusiness/dap-contract";
import { ITEM_QUERY_BOUNDS as B, ITEM_QUERY_ORDER } from "@generalbusiness/dap-contract";
import { canonicalize, encodeItemQueryParameter, itemQueryArgument, itemQueryDigest, readItemQueryParameter, encodeItemQueryCursor } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, TransportError, collectItemQuery, httpTransport, signedReads, secretSigner, bindingTransport, type ServiceBinding, type Fetch } from "../src/index.ts";
const scope: ScopeRef = { scope: `sc_${"a".repeat(52)}`, inc: `in_${"a".repeat(26)}`, kind: "lane" as const };
const query: ItemQuery = { v: 1, scope, type: "task", states: ["open"], ids: null, limit: 100, cursor: null };
const good: Extract<ItemQueryRead, { ok: true }> = { ok: true, at: { seq: 0, hash: `sha256:${"a".repeat(64)}` }, value: { v: 1, scope, query: itemQueryDigest(query)!, argument: itemQueryArgument(query)!, items: [] }, complete: true };

test("query HTTP and binding consumers reject another page context and retain explicit refusals", async () => {
  const sent: { url: string; reader: string | undefined }[] = [];
  const reply = (value: unknown): Fetch => async (url, init) => { sent.push({ url, reader: init?.headers?.["authorization"] }); return { status: 200, body: new Response(canonicalize(value)).body }; };
  const read = (fetch: Fetch) => new ScopeHandle(signedReads(httpTransport("https://scopes.test", { fetch }), secretSigner(new Uint8Array(32).fill(7))), scope.scope).queryItems(query);
  expect(await read(reply(good))).toEqual(good);
  expect(sent[0]!.url).toBe(`https://scopes.test/v1/scopes/${scope.scope}/query-items?q=${encodeItemQueryParameter(query)}`);
  expect(sent[0]!.reader).toMatch(/^Signed /);
  const wrong = { ...good, value: { ...good.value, argument: itemQueryArgument({ ...query, ids: [] }) } };
  await expect(read(reply(wrong))).rejects.toThrow(TransportError);
  const binding = bindingTransport({ queryItems: async () => wrong } as unknown as ServiceBinding);
  await expect(binding.queryItems(scope.scope, "Session fixture", encodeItemQueryParameter(query)!)).rejects.toThrow(TransportError);
  expect(await read(reply({ ok: false, reason: "row-too-large" }))).toEqual({ ok: false, reason: "row-too-large" });
});

test("query transport limits bytes before decode and keeps its original finite deadline through a stalled body", async () => {
  let cancelled = 0;
  const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(B.payloadBytes + 1)); }, cancel() { cancelled++; } });
  const huge = httpTransport("https://scopes.test", { bytes: 4 * B.payloadBytes, fetch: async () => ({ status: 200, body: oversized }) });
  await expect(huge.queryItems(scope.scope, null, encodeItemQueryParameter(query)!)).rejects.toThrow(/longer than 262144 bytes/);
  expect(cancelled).toBe(1);
  vi.useFakeTimers();
  try {
    let signal: { aborted: boolean } | undefined, readStarted!: () => void;
    const started = new Promise<void>(resolve => { readStarted = resolve; });
    const stalled = new ReadableStream<Uint8Array>({ pull() { readStarted(); return new Promise(() => {}); } });
    const transport = httpTransport("https://scopes.test", { seconds: 100, fetch: async (_url, init) => { signal = init?.signal; return { status: 200, body: stalled }; } });
    const pending = transport.queryItems(scope.scope, null, encodeItemQueryParameter(query)!);
    const refused = expect(pending).rejects.toThrow(/within 10 seconds/);
    await started;
    await vi.advanceTimersByTimeAsync(10_000);
    await refused;
    expect(signal?.aborted).toBe(true);
  } finally { vi.useRealTimers(); }
});


test("explicit collection defaults to one page and retains a refused suffix under shared page, byte and restart budgets", async () => {
  const make = (answers: ("prefix" | "complete" | "stale" | "large")[]) => {
    const requests: ItemQuery[] = [];
    const handle = new ScopeHandle(httpTransport("https://scopes.test", { fetch: async url => {
      const selected = readItemQueryParameter(new URL(url).searchParams.get("q"))!; requests.push(selected);
      const mode = answers.shift();
      if (mode === "stale" || mode === "large") return { status: 409, body: new Response(canonicalize({ ok: false, reason: mode === "stale" ? "stale-cursor" : "row-too-large" })).body };
      const id = selected.cursor === null ? 2 : 3;
      const item = { id, type: selected.type, state: "open", revision: 1, opened: null, parties: {}, refs: {}, values: {}, attributed: [] };
      const at = { seq: mode === "complete" && requests.length === 3 ? 1 : 0, hash: `sha256:${"a".repeat(64)}` as const };
      const page = { ok: true, at, value: { v: 1, scope, query: itemQueryDigest(selected), argument: itemQueryArgument(selected), items: [item] }, complete: mode === "complete", ...(mode === "prefix" ? { next: encodeItemQueryCursor({ v: 1, scope, head: at, query: itemQueryDigest(selected)!, order: ITEM_QUERY_ORDER, bounds: B, limit: selected.limit, last: id }) } : {}) };
      return { status: 200, body: new Response(canonicalize(page)).body };
    } }), scope.scope);
    return { handle, requests };
  };
  const one = make(["prefix", "complete"]), partial = await collectItemQuery(one.handle, query);
  expect(partial).toMatchObject({ complete: false, reason: "page-budget", pages: 1, items: [{ id: 2 }], next: expect.any(String) });
  expect(one.requests).toHaveLength(1);
  const limited = make(["prefix", "complete"]);
  expect(await collectItemQuery(limited.handle, query, { pages: 2 })).toMatchObject({ complete: false, reason: "byte-budget", pages: 1 });
  expect(limited.requests).toHaveLength(1);
  const refusal = make(["prefix", "large"]);
  expect(await collectItemQuery(refusal.handle, query, { pages: 2, bytes: 2 * B.payloadBytes })).toMatchObject({ complete: false, reason: "row-too-large", pages: 2, items: [{ id: 2 }], next: partial.next });
  const two = make(["prefix", "complete"]);
  expect(await collectItemQuery(two.handle, query, { pages: 2, bytes: 2 * B.payloadBytes })).toMatchObject({ complete: true, reason: null, pages: 2, items: [{ id: 2 }, { id: 3 }], next: null });
  const changed = make(["prefix", "stale", "complete"]);
  expect(await collectItemQuery(changed.handle, query, { pages: 3, bytes: 3 * B.payloadBytes, restarts: 1 })).toMatchObject({ complete: true, pages: 3, at: { seq: 1 }, items: [{ id: 2 }] });
  expect(changed.requests.map(value => value.cursor === null)).toEqual([true, false, true]);
});

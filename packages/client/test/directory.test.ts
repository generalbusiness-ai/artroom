/** Scripted navigation reads, not Native origin/authority or browser proof. */
import { expect, test, vi } from "vitest";
import type { Head, Item, ItemQuery, ItemQueryRead, ScopeRef, Summary } from "@generalbusiness/dap-contract";
import { itemQueryArgument, itemQueryDigest, newIncarnation, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import { activeDirectory, partitionIndexes, type DirectoryReader } from "../src/index.ts";

const ref = (c: string, kind: ScopeRef["kind"] = "directory"): ScopeRef => ({ scope: scopeIdOf({ v: 1, kind, definition: textDigest(c), creator: null, cause: textDigest(c), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(c.charCodeAt(0))), kind });
const root = ref("a"), membership = ref("b", "membership"), p = ref("c"), q = ref("d");
const head = (seq: number): Head => ({ seq, hash: `sha256:${"a".repeat(64)}` });
const item = (id: number, type: string, state: string, refs: Item["refs"] = {}, values: Item["values"] = {}): Item => ({ id, type, state, revision: 0, opened: null, parties: {}, refs, values, attributed: [] });
function fixture(parts = [p, q]) {
  const summaries = new Map<string, { summary: Summary; at: Head }>();
  summaries.set(root.scope, { summary: { scope: root, definition: "platform:directory@10", status: "active", time: "2099-01-01T00:00:00Z", items: [item(0, "repository", "open", { membership })], counts: [] }, at: head(10) });
  parts.forEach((part, n) => summaries.set(part.scope, { summary: { scope: part, definition: "platform:directory-partition@1", status: "active", time: "2099-01-01T00:00:00Z", items: [item(0, "repository", "open", { root, membership }, { sealed: n !== parts.length - 1 })], counts: [] }, at: head(20 + n) }));
  const queries: ItemQuery[] = [];
  let queriesMode: ((query: ItemQuery, result: Extract<ItemQueryRead, { ok: true }>) => ItemQueryRead) | null = null;
  const reader: DirectoryReader = {
    summary: async scope => { const held = summaries.get(scope)!; return { ok: true, at: held.at, value: held.summary, complete: false, next: "summary-prefix" }; },
    query: async (_scope, query) => {
      queries.push(query);
      const rows = query.type === "partition" ? parts.map((part, n) => item(n + 1, "partition", n === parts.length - 1 ? "active" : "sealed", { scope: part }, { generation: n + 1 })).filter(row => query.states.includes(row.state))
        : query.type === "lane" ? [item(1, "lane", "listed", { scope: ref("e", "lane") }, { number: query.scope.scope === p.scope ? 1 : 100001 })] : [];
      const result: Extract<ItemQueryRead, { ok: true }> = { ok: true, at: summaries.get(query.scope.scope)!.at, complete: true, value: { v: 1, scope: query.scope, query: itemQueryDigest(query)!, argument: itemQueryArgument(query)!, items: rows } };
      return queriesMode ? queriesMode(query, result) : result;
    },
  };
  return { reader, summaries, queries, mode: (change: NonNullable<typeof queriesMode>) => { queriesMode = change; } };
}

test("partition navigation selects the exact active pin and retains distinct heads for old and new indexes", async () => {
  const f = fixture();
  expect(await activeDirectory(f.reader, root, membership)).toEqual({ ref: q, at: head(21), reason: null });
  expect(f.queries[0]).toMatchObject({ scope: root, type: "partition", states: ["active", "creating"], limit: 2 });
  const listed = await partitionIndexes(f.reader, root, membership);
  expect(listed).toMatchObject({ complete: true, reason: null, rootAt: head(10), calls: 8, indexes: [{ ref: p, at: head(20), lanes: [{ values: { number: 1 } }] }, { ref: q, at: head(21), lanes: [{ values: { number: 100001 } }] }] });
});

test("directory kind alone, another root or membership, and future partition pins cannot select an opening target", async () => {
  for (const fault of ["root-pin", "partition-pin", "root", "membership", "sealed"] as const) {
    const f = fixture(), held = f.summaries.get(q.scope)!;
    if (fault === "root-pin") f.summaries.get(root.scope)!.summary.definition = "platform:directory-partition@1";
    if (fault === "partition-pin") held.summary.definition = "platform:directory-partition@2";
    if (fault === "root") held.summary.items = [{ ...held.summary.items[0]!, refs: { ...held.summary.items[0]!.refs, root: ref("f") } }];
    if (fault === "membership") held.summary.items = [{ ...held.summary.items[0]!, refs: { ...held.summary.items[0]!.refs, membership: ref("f", "membership") } }];
    if (fault === "sealed") held.summary.items = [{ ...held.summary.items[0]!, values: { ...held.summary.items[0]!.values, sealed: true } }];
    expect(await activeDirectory(f.reader, root, membership), fault).toMatchObject({ reason: expect.any(String) });
  }
  const pending = fixture();
  pending.mode((_query, result) => ({ ...result, value: { ...result.value, items: [item(2, "partition", "creating")] } }));
  expect(await activeDirectory(pending.reader, root, membership)).toEqual({ reason: "partition-pending" });
});

test("head movement and incomplete selections cannot become an empty complete directory", async () => {
  const moved = fixture();
  moved.mode((query, result) => query.scope.scope === q.scope ? { ...result, at: head(99) } : result);
  expect(await partitionIndexes(moved.reader, root, membership)).toMatchObject({ complete: false, reason: "head-changed", indexes: [{ ref: p }] });
  const stuck = fixture();
  stuck.mode((_query, result) => ({ ...result, complete: false }));
  expect(await partitionIndexes(stuck.reader, root, membership)).toMatchObject({ complete: false, reason: "invalid-index", indexes: [] });
});

test("directory navigation shares one finite call budget and starts no later read after logical expiry", async () => {
  const many = fixture("cdefghijklmnop".split("").map(c => ref(c)));
  const result = await partitionIndexes(many.reader, root, membership);
  expect(result).toMatchObject({ complete: false, reason: "read-budget", calls: 32 });
  vi.useFakeTimers();
  try {
    const f = fixture(); let queries = 0, finish!: () => void;
    f.reader.summary = () => new Promise(resolve => { finish = () => resolve({ ok: true, complete: true, at: head(10), value: f.summaries.get(root.scope)!.summary }); });
    f.reader.query = async () => { queries++; throw new Error("must not read after expiry"); };
    const pending = activeDirectory(f.reader, root, membership);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ reason: "deadline" });
    finish(); await vi.runAllTimersAsync();
    expect(queries).toBe(0);
    const costly = fixture(), actual = costly.reader.summary;
    costly.reader.summary = async scope => { const result = await actual(scope); vi.setSystemTime(Date.now() + 10_000); return result; };
    expect(await activeDirectory(costly.reader, root, membership)).toEqual({ reason: "deadline" });
    expect(costly.queries).toHaveLength(0);
  } finally { vi.useRealTimers(); }
});

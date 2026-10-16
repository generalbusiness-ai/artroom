import { expect, test } from "vitest";
import { ITEM_QUERY_BOUNDS as B } from "@generalbusiness/dap-contract";
import type { Item, ItemQuery } from "@generalbusiness/dap-contract";
import { canonicalize, encodeItemQueryParameter, itemQueryArgument, itemQueryDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { secretSigner, signedReader } from "@generalbusiness/artroom-client";
import type { NativeItemQuery } from "../src/item-queries.ts";
import { Scope } from "../src/core.ts";
import { itemQueryPage } from "../src/item-query-page.ts";
import { ItemQueryBudget } from "../src/item-query-budget.ts";
import { production } from "../src/ports.ts";
import { ReadPreparation } from "../src/read-preparation.ts";
import { SqliteStore, type Sql } from "../src/sqlite.ts";
import { testPorts } from "../src/testing.ts";
import { at, found, rita, type Lane } from "./support.ts";

const sqlOf = (state: DurableObjectState): Sql => ({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
function frameOf(lane: Lane, state: DurableObjectState) {
  const sql = sqlOf(state), core = new Scope(lane.name, new SqliteStore(sql), { ...production(), ...testPorts(lane.c) }, lane.c.bounds);
  const frame = new ReadPreparation(sql, { policy: () => "native-item-query-test-v1", declared: raw => core.validate(raw), platform: named => core.platform(named) }).capture();
  if (!frame) throw new Error("native supported preparation failed");
  return frame;
}
const queryOf = (lane: Lane, over: Partial<ItemQuery> = {}): ItemQuery => ({ v: 1, scope: lane.at, type: "commitment", states: ["accepted", "done", "offered"], ids: null, limit: 100, cursor: null, ...over });
// Synthetic retained records exercise the native storage boundary. These
// large row populations/values are not claimed as judged opening histories.
const item = (id: number, state = "offered", text = "雪🙂"): Item => ({ id, type: "commitment", state, revision: 1, opened: null, parties: {}, refs: {}, values: { text }, attributed: [] });
function write(state: DurableObjectState, value: Item, raw = canonicalize(value)) {
  state.storage.sql.exec("INSERT INTO item (id,type,state,record) VALUES (?,?,?,?)", value.id, value.type, value.state, raw).toArray();
}
function watched(state: DurableObjectState) {
  let rowsRead = 0, rowsWritten = 0, candidates = 0, metadata = 0;
  const bodies: number[] = [], plans: string[] = [], queries: string[] = [];
  const sql: Pick<Sql, "exec"> = { exec(query, ...args) {
    queries.push(query);
    plans.push(...state.storage.sql.exec("EXPLAIN QUERY PLAN " + query, ...args).toArray().map(row => String(row["detail"])));
    const cursor = state.storage.sql.exec(query, ...args), rows = cursor.toArray();
    rowsRead += cursor.rowsRead; rowsWritten += cursor.rowsWritten;
    if (query.startsWith("SELECT record")) bodies.push(args[0] as number);
    else { candidates += rows.length; metadata += utf8(canonicalize(rows)).length; }
    return { toArray: () => rows };
  } };
  return { sql, result: () => ({ rowsRead, rowsWritten, candidates, metadata, bodies, plans, queries }) };
}
function page(result: ReturnType<typeof itemQueryPage>) {
  if (!result.ok) throw new Error("query refused: " + result.reason);
  return JSON.parse(result.serialized) as { ok: true; at: { seq: number; hash: string }; value: { v: 1; scope: ItemQuery["scope"]; query: string; argument: string; items: Item[] }; complete: boolean; next?: string };
}

test("native synchronous pages merge selected states without omissions or duplicate IDs and ignore large unrelated populations", async () => {
  const lane = await found();
  const got = await lane.inside(state => {
    state.storage.transactionSync(() => {
      for (let n = 0; n < 203; n++) write(state, item(1000 + n, ["accepted", "done", "offered"][n % 3]!));
      for (let n = 0; n < 3000; n++) write(state, { ...item(10_000 + n), type: "unrelated", state: "final" });
    });
    const frame = frameOf(lane, state), pages = [], measurements = [];
    let query = queryOf(lane);
    for (let n = 0; n < 3; n++) {
      const watch = watched(state), budget = new ItemQueryBudget("session", () => true);
      const result = itemQueryPage(budget.sql("page", watch.sql), frame, query, () => budget.available, {
        candidates: (count, bytes) => budget.spend("page", { candidates: count, metadata: bytes }),
        bodies: (count, bytes) => budget.spend("page", { bodies: count, payloadBytes: bytes }),
      }), read = page(result);
      pages.push(read); measurements.push({ ...watch.result(), admitted: budget.admitted().total });
      if (read.complete) break;
      query = { ...query, cursor: read.next! };
    }
    return { pages, measurements, head: frame.scope.head };
  });
  expect(got.pages.map(read => read.value.items.length)).toEqual([100, 100, 3]);
  expect(got.pages.flatMap(read => read.value.items.map(value => value.id))).toEqual(Array.from({ length: 203 }, (_, n) => 1000 + n));
  expect(got.pages.map(read => read.complete)).toEqual([false, false, true]);
  let expected = queryOf(lane);
  for (const read of got.pages) {
    expect(read.value.argument).toBe(itemQueryArgument(expected));
    expect(read.value.query).toBe(itemQueryDigest(expected));
    expected = { ...expected, cursor: read.next ?? null };
  }
  expect(got.pages.every(read => canonicalize(read.at) === canonicalize(got.head) && canonicalize(read.value.scope) === canonicalize(lane.at))).toBe(true);
  expect(got.pages.at(-1)!.next).toBeUndefined();
  for (const [n, measured] of got.measurements.entries()) {
    expect(measured.bodies).toEqual(got.pages[n]!.value.items.map(value => value.id));
    expect(measured.candidates).toBeLessThanOrEqual(B.candidates); expect(measured.metadata).toBeLessThanOrEqual(B.metadataBytes);
    expect(measured.rowsRead).toBeLessThanOrEqual(2 * measured.candidates + measured.bodies.length + 16);
    expect(measured.rowsWritten).toBe(0);
    expect(measured.admitted.calls).toBe(measured.queries.length);
    expect(measured.admitted.calls).toBeLessThanOrEqual(200);
    expect(measured.candidates).toBeLessThanOrEqual(measured.admitted.candidates);
    expect(measured.metadata).toBeLessThanOrEqual(measured.admitted.metadata);
    expect(measured.admitted.bodies).toBe(measured.bodies.length);
    expect(measured.admitted.payloadBytes).toBe(utf8(canonicalize(got.pages[n]!)).length);
    expect(measured.plans.every(plan => /SEARCH item USING (INDEX item_by_state|INTEGER PRIMARY KEY)/.test(plan) && !/SCAN|TEMP/i.test(plan))).toBe(true);
  }
  console.log("item-query-native-pages", JSON.stringify(got.measurements.map(({ rowsRead, candidates, metadata, bodies, rowsWritten }) => ({ rowsRead, candidates, metadata, bodies: bodies.length, rowsWritten }))));
});

test("native byte admission loads only a fitting nonempty prefix and resumes at the first unreturned row", async () => {
  const lane = await found();
  const got = await lane.inside(state => {
    write(state, item(1000, "offered", "雪".repeat(60_000)));
    write(state, item(1001, "offered", "🙂".repeat(30_000)));
    write(state, item(1002, "offered", "x".repeat(B.payloadBytes + 1)));
    const frame = frameOf(lane, state), query = queryOf(lane), a = watched(state);
    const first = itemQueryPage(a.sql, frame, query, () => true), read = page(first), b = watched(state);
    const second = itemQueryPage(b.sql, frame, { ...query, cursor: read.next! }, () => true);
    const c = watched(state), third = itemQueryPage(c.sql, frame, { ...query, cursor: page(second).next! }, () => true);
    return { first, second, third, a: a.result(), b: b.result(), c: c.result() };
  });
  expect(page(got.first).value.items.map(value => value.id)).toEqual([1000]); expect(page(got.first).complete).toBe(false);
  expect(page(got.second).value.items.map(value => value.id)).toEqual([1001]); expect(page(got.second).complete).toBe(false);
  expect(got.third).toEqual({ ok: false, reason: "row-too-large" }); expect(got.c.bodies).toEqual([]);
  expect(got.a.bodies).toEqual([1000]); expect(got.b.bodies).toEqual([1001]);
  for (const result of [got.first, got.second]) if (result.ok) expect(utf8(result.serialized).length).toBeLessThanOrEqual(B.payloadBytes);
});

test("exact full envelope bytes include framing and reclaim the cursor on a complete final prefix", async () => {
  const lane = await found();
  const got = await lane.inside(async (state, instance) => {
    const frame = frameOf(lane, state), query = queryOf(lane, { states: ["offered"] }), second = item(1001, "offered", "");
    // Independent fixed full-envelope byte target, not the executor's
    // prefix calculation. Small final row costs less than a cursor.
    const first = item(1000, "offered", "");
    const shell = { ok: true, at: frame.scope.head, value: { v: 1, scope: lane.at, query: itemQueryDigest(query), argument: itemQueryArgument(query), items: [first, second] }, complete: true };
    const padding = B.payloadBytes - utf8(JSON.stringify(shell)).length;
    const padded = { ...first, values: { text: "x".repeat(padding) } };
    write(state, padded); write(state, second);
    const watch = watched(state), final = itemQueryPage(watch.sql, frame, query, () => true);
    const owned = instance as { queryItems(encoded: unknown, reader: unknown): Promise<NativeItemQuery> };
    const header = (selected: ItemQuery) => signedReader(secretSigner(rita.secret), lane.name, "query-items", itemQueryArgument(selected)!, { now: () => Date.parse(at(0)) });
    const publicFinal = await owned.queryItems(encodeItemQueryParameter(query), await header(query));
    // Make a singleton whose full final response exceeds the cap by one.
    const single = queryOf(lane, { states: ["offered"], ids: [1000] }), singleShell = { ...shell, value: { ...shell.value, query: itemQueryDigest(single), argument: itemQueryArgument(single), items: [first] } };
    const tooLarge = item(1000, "offered", "x".repeat(B.payloadBytes + 1 - utf8(JSON.stringify(singleShell)).length));
    state.storage.sql.exec("UPDATE item SET record=? WHERE id=?", canonicalize(tooLarge), 1000).toArray();
    const refusedWatch = watched(state), refused = itemQueryPage(refusedWatch.sql, frame, single, () => true);
    const publicRefused = await owned.queryItems(encodeItemQueryParameter(single), await header(single));
    return { publicFinal, publicRefused, final, measured: watch.result(), refused, refusedMeasured: refusedWatch.result() };
  });
  expect(got.publicFinal).toEqual(got.final);
  expect(got.publicRefused).toEqual(got.refused);
  expect(got.refusedMeasured.bodies).toEqual([]);
  expect(got.refused).toEqual({ ok: false, reason: "row-too-large" });
  expect(got.final.ok).toBe(true);
  expect(page(got.final).value.items.map(value => value.id)).toEqual([1000, 1001]);
  expect(page(got.final).complete).toBe(true); expect(page(got.final).next).toBeUndefined();
  expect(got.final.ok && utf8(got.final.serialized).length).toBe(B.payloadBytes);
  expect(got.measured.bodies).toEqual([1000, 1001]);
});

test("native sparse IDs use PK metadata and empty selections or semantic refusals read no item SQL", async () => {
  const lane = await found();
  const got = await lane.inside(state => {
    for (let n = 0; n < 1000; n++) write(state, item(1000 + n));
    const frame = frameOf(lane, state), query = queryOf(lane), watch = watched(state);
    const sparse = itemQueryPage(watch.sql, frame, { ...query, ids: [1001, 1500, 1999, 2001] }, () => true);
    const emptyWatch = watched(state);
    const empty = [itemQueryPage(emptyWatch.sql, frame, { ...query, ids: [] }, () => true), itemQueryPage(emptyWatch.sql, frame, { ...query, states: [] }, () => true)];
    const invalid = [itemQueryPage(emptyWatch.sql, frame, { ...query, type: "missing" }, () => true), itemQueryPage(emptyWatch.sql, frame, { ...query, states: ["missing"] }, () => true), itemQueryPage(emptyWatch.sql, frame, { ...query, cursor: "" }, () => true)];
    return { sparse, measured: watch.result(), empty, invalid, emptyMeasured: emptyWatch.result() };
  });
  expect(page(got.sparse).value.items.map(value => value.id)).toEqual([1001, 1500, 1999]); expect(page(got.sparse).complete).toBe(true);
  expect(got.measured.queries).toHaveLength(7); expect(got.measured.rowsRead).toBeLessThanOrEqual(7);
  expect(got.measured.plans.every(plan => /SEARCH item USING INTEGER PRIMARY KEY/.test(plan) && !/SCAN|TEMP/i.test(plan))).toBe(true);
  expect(got.empty.map(result => page(result).value.items)).toEqual([[], []]);
  expect(got.invalid).toEqual([{ ok: false, reason: "unknown-type" }, { ok: false, reason: "unknown-state" }, { ok: false, reason: "invalid-cursor" }]);
  expect(got.emptyMeasured.queries).toEqual([]);
});

test("genuine native checkpoint makes an old continuation stale at a new prepared head", async () => {
  const lane = await found();
  // This row is genuinely opened/assigned, under the fixture's labelled
  // test authority. No public signed/session eligibility is claimed.
  const id = await lane.commitment();
  const first = await lane.inside(state => {
    write(state, item(1000));
    return itemQueryPage(sqlOf(state), frameOf(lane, state), queryOf(lane, { limit: 1 }), () => true);
  });
  expect(page(first).value.items.map(value => value.id)).toEqual([id]);
  await lane.stub.checkpoint(); // Explicit competing whole-state activity.
  const changed = await lane.inside(state => {
    const watch = watched(state);
    return { result: itemQueryPage(watch.sql, frameOf(lane, state), queryOf(lane, { limit: 1, cursor: page(first).next! }), () => true), measured: watch.result() };
  });
  expect(changed.result).toEqual({ ok: false, reason: "stale-cursor" }); expect(changed.measured.queries).toEqual([]);
});

test("unsupported metadata, malformed native records and caller deadline expiry have no body fallback or partial response", async () => {
  const lane = await found();
  const got = await lane.inside(state => {
    const frame = frameOf(lane, state), query = queryOf(lane, { states: ["offered"] });
    write(state, item(1000), canonicalize(item(1000)) + " ");
    const bad = watched(state), malformed = itemQueryPage(bad.sql, frame, query, () => true);
    state.storage.sql.exec("UPDATE item SET record=? WHERE id=?", canonicalize(item(1000, "done")), 1000).toArray();
    const mismatch = itemQueryPage(sqlOf(state), frame, query, () => true);
    const unsupportedQueries: string[] = [];
    const unsupported = itemQueryPage({ exec(q) { unsupportedQueries.push(q); throw new Error("no such function: octet_length"); } }, frame, query, () => true);
    const closed = watched(state), expired = itemQueryPage(closed.sql, frame, query, () => false);
    let active = true, bodies = 0;
    const elapsed = itemQueryPage({ exec(q, ...args) { if (q.startsWith("SELECT record")) bodies++; const rows = state.storage.sql.exec(q, ...args).toArray(); active = false; return { toArray: () => rows }; } }, frame, query, () => active);
    return { malformed, mismatch, bad: bad.result(), unsupported, unsupportedQueries, expired, closed: closed.result(), elapsed, bodies };
  });
  expect(got.malformed).toEqual({ ok: false, reason: "invalid-item" }); expect(got.bad.bodies).toEqual([1000]);
  expect(got.mismatch).toEqual({ ok: false, reason: "invalid-item" });
  expect(got.unsupported).toEqual({ ok: false, reason: "query-not-ready" }); expect(got.unsupportedQueries).toHaveLength(1); expect(got.unsupportedQueries[0]).toContain("octet_length(record)");
  expect(got.expired).toEqual({ ok: false, reason: "unavailable" }); expect(got.closed.queries).toEqual([]);
  expect(got.elapsed).toEqual({ ok: false, reason: "unavailable" }); expect(got.bodies).toBe(0);
});

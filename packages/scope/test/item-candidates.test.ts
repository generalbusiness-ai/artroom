import { expect, test } from "vitest";
import { canonicalize, utf8 } from "@generalbusiness/artroom-bytes";
import { itemCandidates, ITEM_CANDIDATE_BOUNDS as B } from "../src/item-candidates.ts";
import type { Sql } from "../src/sqlite.ts";
import { found } from "./support.ts";

const allowance = { rows: B.rows, candidates: B.candidates, metadataBytes: B.metadataBytes };

// Real pinned workerd Durable Object SQLite. Rows below are explicitly
// synthetic item records inserted only into this isolated test scope.
test("native item metadata seeks bound state candidates and UTF8 sizes without transferring record bodies", async () => {
  const scope = await found();
  const got = await scope.inside(state => {
    const sql = state.storage.sql;
    const write = (id: number, type: string, status: string, record: string) => sql.exec("INSERT INTO item (id,type,state,record) VALUES (?,?,?,?)", id, type, status, record).toArray();
    state.storage.transactionSync(() => {
      for (let i = 0; i < 203; i++) write(1000 + i, "candidate", i % 2 ? "open" : "ready", canonicalize({ id: 1000 + i, text: "雪🙂" }));
      // Far more unrelated final rows than a page, plus a large same-type
      // body whose size is read from column metadata, never returned here.
      for (let i = 0; i < 3000; i++) write(10_000 + i, "unrelated", "final", "{}");
      write(50_000, "candidate", "large", canonicalize({ text: "x".repeat(1024 * 1024) }));
    });
    const plans: string[] = [], queries: string[] = [];
    let rowsRead = 0, rowsWritten = 0;
    const wrapped: Pick<Sql, "exec"> = { exec(query, ...args) {
      queries.push(query);
      plans.push(...sql.exec("EXPLAIN QUERY PLAN " + query, ...args).toArray().map(row => String(row["detail"])));
      const cursor = sql.exec(query, ...args), result = cursor.toArray();
      rowsRead += cursor.rowsRead; rowsWritten += cursor.rowsWritten;
      if (result.some(row => Object.keys(row).sort().join() !== "bytes,id")) throw new Error("unexpected body column");
      return { toArray: () => result };
    } };
    const first = itemCandidates(wrapped, { type: "candidate", states: ["open", "ready"], after: null }, allowance);
    const next = itemCandidates(wrapped, { type: "candidate", states: ["open", "ready"], after: 1099 }, allowance);
    const last = itemCandidates(wrapped, { type: "candidate", states: ["open", "ready"], after: 1199 }, allowance);
    const large = itemCandidates(wrapped, { type: "candidate", states: ["large"], after: null }, allowance);
    return { first, next, last, large, plans, queries, rowsRead, rowsWritten };
  });
  expect(got.first).toMatchObject({ ok: true, exhausted: false, candidatesRead: 202 });
  expect(got.next).toMatchObject({ ok: true, exhausted: false, candidatesRead: 103 });
  expect(got.last).toMatchObject({ ok: true, exhausted: true, candidatesRead: 3 });
  if (!got.first.ok || !got.next.ok || !got.last.ok || !got.large.ok) return expect.fail("native metadata query refused");
  expect(got.first.rows.map(row => row.id)).toEqual(Array.from({ length: 101 }, (_, i) => 1000 + i));
  expect(got.next.rows.map(row => row.id)).toEqual(Array.from({ length: 101 }, (_, i) => 1100 + i));
  expect(got.last.rows.map(row => row.id)).toEqual([1200, 1201, 1202]);
  expect(got.first.rows[0]?.bytes).toBe(utf8(canonicalize({ id: 1000, text: "雪🙂" })).length);
  expect(got.large.rows).toEqual([{ id: 50_000, bytes: 1024 * 1024 + 11 }]);
  expect(got.rowsWritten).toBe(0);
  expect(got.rowsRead).toBeLessThanOrEqual(2 * (202 + 103 + 3 + 1) + 16);
  expect(got.plans.every(plan => /SEARCH item USING INDEX item_by_state/.test(plan) && !/SCAN|TEMP/i.test(plan))).toBe(true);
  expect(got.queries.every(query => query.startsWith("SELECT id, octet_length(record) AS bytes"))).toBe(true);
  console.log("item-metadata-native-state", JSON.stringify({ rowsRead: got.rowsRead, rowsWritten: got.rowsWritten, plans: [...new Set(got.plans)] }));
});

test("native sparse item IDs use primary-key seeks and empty IDs never broaden into state scans", async () => {
  const scope = await found();
  const got = await scope.inside(state => {
    const sql = state.storage.sql;
    state.storage.transactionSync(() => {
      for (let i = 0; i < 1000; i++) sql.exec("INSERT INTO item (id,type,state,record) VALUES (?,?,?,?)", 1000 + i, "candidate", "open", canonicalize({ id: 1000 + i })).toArray();
    });
    let calls = 0, rowsRead = 0;
    const plans: string[] = [];
    const wrapped: Pick<Sql, "exec"> = { exec(query, ...args) {
      calls++;
      plans.push(...sql.exec("EXPLAIN QUERY PLAN " + query, ...args).toArray().map(row => String(row["detail"])));
      const cursor = sql.exec(query, ...args), rows = cursor.toArray(); rowsRead += cursor.rowsRead;
      return { toArray: () => rows };
    } };
    const empty = itemCandidates(wrapped, { type: "candidate", states: ["open"], ids: [], after: null }, allowance);
    const before = calls;
    const sparse = itemCandidates(wrapped, { type: "candidate", states: ["open"], ids: [1001, 1500, 1999, 2001], after: 1200 }, allowance);
    return { empty, before, sparse, calls, rowsRead, plans };
  });
  expect(got.empty).toEqual({ ok: true, rows: [], exhausted: true, candidatesRead: 0, metadataBytes: 2 });
  expect(got.before).toBe(0);
  expect(got.sparse).toMatchObject({ ok: true, exhausted: true, candidatesRead: 2, rows: [{ id: 1500 }, { id: 1999 }] });
  expect(got.calls).toBe(3);
  expect(got.rowsRead).toBeLessThanOrEqual(3);
  expect(got.plans.every(plan => /SEARCH item USING INTEGER PRIMARY KEY/.test(plan) && !/SCAN|TEMP/i.test(plan))).toBe(true);
  console.log("item-metadata-native-ids", JSON.stringify({ rowsRead: got.rowsRead, calls: got.calls, plans: [...new Set(got.plans)] }));
});

test("item metadata preflight admits finite query and lookahead budgets before any SQL", () => {
  let calls = 0;
  const sql: Pick<Sql, "exec"> = { exec: () => { calls++; throw new Error("must not query"); } };
  const q = { type: "candidate", states: ["open"], after: null };
  for (const query of [{ ...q, states: ["open", "open"] }, { ...q, states: ["z", "a"] }, { ...q, ids: [2, 1] }, { ...q, ids: [-1] }, { ...q, type: "x".repeat(65) }, { ...q, states: ["\uD800"] }]) expect(itemCandidates(sql, query, allowance)).toEqual({ ok: false, reason: "invalid-query" });
  for (const change of [{ candidates: 100 }, { metadataBytes: 2 + 64 * 101 - 1 }, { rows: 101 }, { metadataBytes: 0 }]) {
    const outcome = itemCandidates(sql, q, { ...allowance, ...change });
    expect(calls).toBe(0);
    expect(outcome).toEqual({ ok: false, reason: "too-large" });
  }
  expect(itemCandidates(sql, { ...q, ids: [] }, { ...allowance, metadataBytes: 1 })).toEqual({ ok: false, reason: "too-large" });
  expect(calls).toBe(0);
});

test("unsupported size primitive and invalid metadata refuse without a record-body fallback", () => {
  const queries: string[] = [];
  const q = { type: "candidate", states: ["open"], after: null };
  expect(itemCandidates({ exec(query) { queries.push(query); throw new Error("no such function: octet_length"); } }, q, allowance)).toEqual({ ok: false, reason: "query-not-ready" });
  expect(queries).toHaveLength(1);
  expect(queries[0]).toContain("octet_length(record)");
  for (const rows of [[{ id: 1, bytes: null }], [{ id: 1, bytes: -1 }], [{ id: 1, bytes: 3 }, { id: 1, bytes: 3 }], [{ id: 2, bytes: 3 }, { id: 1, bytes: 3 }]]) {
    expect(itemCandidates({ exec: () => ({ toArray: () => rows }) }, q, allowance)).toEqual({ ok: false, reason: "invalid-metadata" });
  }
});

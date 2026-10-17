import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { timeOf } from "@generalbusiness/dap-derive";
import { REQUEST_AGE_MS, REQUEST_ROWS, RequestIndex, requestQuery } from "../src/request-index.ts";
import { create } from "./support.ts";

// Actual SQLite, with directly seeded operational rows. This is a sidecar
// boundary witness; it does not yet prove the production instrumentation.
test("the sidecar completely expires a backlog, evicts only at capacity, pages newest first and never changes a native entry", async () => {
  const lane = await create();
  const result = await runInDurableObject(lane.object, (_instance, state) => {
    const sql = { exec: (query: string, ...args: (number | string | null)[]) => state.storage.sql.exec(query, ...args) };
    const before = sql.exec("SELECT seq, hash, bytes FROM entry ORDER BY seq").toArray();
    const index = new RequestIndex(sql), now = 2_000_000_000_000, id = "abcdef0123456789", trace = "abcdef0123456789abcdef0123456789";
    // More than 256 expired rows must all disappear on the one next write.
    sql.exec("WITH RECURSIVE i(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM i WHERE n<500) INSERT INTO request_index(request,trace,time,seq,duty) SELECT ?,?,?,n,NULL FROM i", id, trace, now - REQUEST_AGE_MS - 1).toArray();
    const wrote = index.record(id, trace, now, 0, null);
    const expired = sql.exec("SELECT COUNT(*) AS n FROM request_index WHERE time < ?", now - REQUEST_AGE_MS).toArray()[0]!["n"];
    sql.exec("DELETE FROM request_index").toArray();
    sql.exec("WITH RECURSIVE i(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM i WHERE n<?) INSERT INTO request_index(request,trace,time,seq,duty) SELECT ?,?,?+n,n,NULL FROM i", REQUEST_ROWS, id, trace, now).toArray();
    const oldest = sql.exec("SELECT n FROM request_index ORDER BY time,n LIMIT 1").toArray()[0]!["n"];
    if (typeof oldest !== "number") throw Error("Seeded operational row has no position");
    // An insertion with an older time still evicts the oldest retained row;
    // paging orders by time rather than pretending insertion order is time.
    const dutyWrote = index.record(id, trace, now + 100, null, "0.0");
    const count = sql.exec("SELECT COUNT(*) AS n FROM request_index").toArray()[0]!["n"];
    const evicted = sql.exec("SELECT n FROM request_index WHERE n=?", oldest).toArray().length;
    let query = requestQuery(undefined, trace)!, rows: { n: number; time: string }[] = [], pages = 0;
    for (;;) {
      const page = index.page(query, now + 100)!;
      rows.push(...page.rows); pages++;
      if (page.rows.length > 100 || !page.complete && !page.next) throw Error("Unbounded/incomplete operational page");
      if (page.complete) break;
      query = requestQuery(undefined, trace, page.next)!;
      if (pages > 42) throw Error("Unbounded operational pagination");
    }
    // Read exclusion does not rely on another write to delete old bytes.
    sql.exec("UPDATE request_index SET time=?", now - REQUEST_AGE_MS - 1).toArray();
    const empty = index.page(requestQuery(id, undefined)!, now);
    const retainedBytes = sql.exec("SELECT COUNT(*) AS n FROM request_index").toArray()[0]!["n"];
    return { before, after: sql.exec("SELECT seq,hash,bytes FROM entry ORDER BY seq").toArray(), wrote, expired, dutyWrote, count, evicted, rows, pages, empty, retainedBytes };
  });
  expect(result.after).toEqual(result.before);
  expect([result.wrote, result.expired, result.dutyWrote, result.count, result.evicted]).toEqual([true, 0, true, REQUEST_ROWS, 0]);
  expect(result.pages).toBe(41); expect(result.rows).toHaveLength(REQUEST_ROWS);
  expect(new Set(result.rows.map(row => row.n)).size).toBe(REQUEST_ROWS);
  expect(result.rows.every((row, i) => i === 0 || Date.parse(row.time) <= Date.parse(result.rows[i - 1]!.time))).toBe(true);
  expect(result.rows[0]!.time).toBe(timeOf(2_000_000_000_000 + REQUEST_ROWS));
  expect(result.empty).toEqual({ rows: [], window: null, complete: true });
  expect(result.retainedBytes).toBe(REQUEST_ROWS);
});

test("invalid correlation queries do no SQL and a sidecar insert fault cannot alter the committed native history", async () => {
  const lane = await create();
  const result = await runInDurableObject(lane.object, (_instance, state) => {
    let calls = 0, fault = false;
    const index = new RequestIndex({ exec: (query, ...args) => {
      calls++;
      if (fault && query.startsWith("INSERT INTO request_index")) throw Error("scripted sidecar SQL fault");
      return state.storage.sql.exec(query, ...args);
    } });
    calls = 0;
    const invalid = index.page({ by: "request", id: "https://user:password@host/", before: null }, 2_000_000_000_000);
    const invalidCalls = calls;
    const before = state.storage.sql.exec("SELECT seq,hash,bytes FROM entry ORDER BY seq").toArray();
    fault = true;
    const recorded = index.record("abcdef0123456789", null, 2_000_000_000_000, 0, null);
    return { invalid, invalidCalls, recorded, before, after: state.storage.sql.exec("SELECT seq,hash,bytes FROM entry ORDER BY seq").toArray() };
  });
  expect(result.invalid).toBeNull(); expect(result.invalidCalls).toBe(0);
  expect(result.recorded).toBe(false); expect(result.after).toEqual(result.before);
  for (const [request, trace, cursor] of [[undefined, undefined, undefined], ["abcdef0123456789", "abcdef0123456789abcdef0123456789", undefined], ["ABCDEF0123456789", undefined, undefined], [undefined, "0".repeat(32), undefined], ["abcdef0123456789", undefined, "0.0"], ["abcdef0123456789", undefined, "9999999999999999.1"]]) expect(requestQuery(request, trace, cursor)).toBeNull();
});

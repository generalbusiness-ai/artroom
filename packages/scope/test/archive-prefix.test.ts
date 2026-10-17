/** Native SQLite scalar admission, not complete privacy or integrity proof.
 * The lane certificate and additional/corrupt history rows are stand-ins.
 * Creation, pin writes, SQL sizes, row limits and budget execution are real. */
import { expect, test } from "vitest";
import type { Head, ScopeRef } from "@generalbusiness/dap-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { canonicalize, newIncarnation, textDigest } from "@generalbusiness/artroom-bytes";
import { ArchiveBudget } from "../src/archive-budget.ts";
import { archivePrefixMetadata } from "../src/archive-prefix.ts";
import { definition, create, rita } from "./support.ts";

const syntheticHash = textDigest("synthetic prefix row, not a verified entry");
const certified = new Set([definition.digest]);
test("native prefix admission binds the original cutoff and full pin before entry JSON/body reads", async () => {
  const lane = await create(), through = await lane.head();
  await lane.did(rita, "remark", { on: 0, fields: { text: "later unrelated input" } });
  const result = await lane.inside(state => {
    const queries: string[] = [], budget = new ArchiveBudget();
    const prefix = archivePrefixMetadata({ exec(query, ...args) { queries.push(query); return state.storage.sql.exec(query, ...args); } }, lane.at, through, PROPOSED_BOUNDS, budget, certified);
    return { prefix, queries, cost: budget.admitted() };
  });
  expect(result.prefix.through).toEqual(through);
  expect(result.prefix.positions.map(row => row.seq)).toEqual([0]);
  expect(result.prefix.pin.at).toEqual(lane.at);
  expect(result.cost.entries).toBe(1);
  expect(result.cost.calls).toBe(7);
  expect(result.queries.filter(query => /FROM entry/.test(query)).every(query => !/json_|SELECT bytes|SELECT \*/.test(query))).toBe(true);
  expect(result.queries.some(query => query.includes("octet_length(bytes)"))).toBe(true);
  expect(result.cost.inputWork).toBeGreaterThan(result.prefix.bytes * 16);
});

test("native incarnation, cutoff, gap and size damage cannot yield prefix admission; an unadmitted pin fails before positions", async () => {
  const lane = await create();
  await lane.did(rita, "remark", { on: 0, fields: { text: "bounded second entry" } });
  const through = await lane.head();
  const result = await lane.inside(state => {
    const read = (at: ScopeRef, head: Head) => {
      const queries: string[] = [];
      try { archivePrefixMetadata({ exec(query, ...args) { queries.push(query); return state.storage.sql.exec(query, ...args); } }, at, head, PROPOSED_BOUNDS, new ArchiveBudget(), certified); return { reason: "admitted", queries }; }
      catch (error) { return { reason: (error as { reason: string }).reason, queries }; }
    };
    const wrongInc = read({ ...lane.at, inc: newIncarnation(new Uint8Array(16).fill(39)) }, through);
    const future = read(lane.at, { ...through, seq: through.seq + 1 });
    const wrongHash = read(lane.at, { ...through, hash: syntheticHash });
    const original = state.storage.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'scope'").one().v;
    const changed = JSON.parse(original); changed.head.extra = true;
    state.storage.sql.exec("UPDATE meta SET v = ? WHERE k = 'scope'", canonicalize(changed));
    const unknownFrame = read(lane.at, through);
    state.storage.sql.exec("UPDATE meta SET v = ? WHERE k = 'scope'", original);
    state.storage.sql.exec("UPDATE entry SET size = size + 1 WHERE seq = 1");
    const size = read(lane.at, through);
    state.storage.sql.exec("UPDATE entry SET size = size - 1 WHERE seq = 1");
    state.storage.sql.exec("DELETE FROM entry WHERE seq = 1");
    const gap = read(lane.at, through);
    return { wrongInc, future, wrongHash, unknownFrame, size, gap };
  });
  expect(result.wrongInc.reason).toBe("unavailable");
  expect(result.wrongInc.queries.some(query => /FROM entry/.test(query))).toBe(false);
  expect(result.future.reason).toBe("incomplete");
  expect(result.wrongHash.reason).toBe("mismatch");
  expect(result.unknownFrame.reason).toBe("unavailable");
  expect(result.size.reason).toBe("mismatch");
  expect(result.gap.reason).toBe("incomplete");
  // The declaration is a genuine native pin, not an asserted flag.
  // No certificate is granted to it. It fails before any prefix projection.
  const legacy = await create();
  const refusal = await legacy.inside(state => {
    const queries: string[] = [];
    try { archivePrefixMetadata({ exec(query, ...args) { queries.push(query); return state.storage.sql.exec(query, ...args); } }, legacy.at, legacy.genesis.fact, PROPOSED_BOUNDS, new ArchiveBudget(), new Set()); return { reason: "admitted", queries }; }
    catch (error) { return { reason: (error as { reason: string }).reason, queries }; }
  });
  expect(refusal.reason).toBe("unsupported-archive-cohort");
  expect(refusal.queries.some(query => query.includes("octet_length(bytes)"))).toBe(false);
});

test("real scalar rows admit exactly 4096 positions and refuse 4097 without JSON inspection", async () => {
  const lane = await create();
  const result = await lane.inside(state => {
    const sql = state.storage.sql;
    sql.exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 4096) INSERT INTO entry (seq, hash, time, bytes, size) SELECT x, ?, 'synthetic', '{}', 2 FROM n", syntheticHash);
    const metadata = JSON.parse(sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'scope'").one().v);
    metadata.head = { seq: 4096, hash: syntheticHash };
    sql.exec("UPDATE meta SET v = ? WHERE k = 'scope'", canonicalize(metadata));
    const budget = new ArchiveBudget();
    const prefix = archivePrefixMetadata(sql, lane.at, { seq: 4095, hash: syntheticHash }, PROPOSED_BOUNDS, budget, certified);
    const overflowBudget = new ArchiveBudget();
    let overflow = "admitted";
    try { archivePrefixMetadata(sql, lane.at, metadata.head, PROPOSED_BOUNDS, overflowBudget, certified); }
    catch (error) { overflow = (error as { reason: string }).reason; }
    return { rows: prefix.positions.length, cost: budget.admitted(), overflow, overflowCost: overflowBudget.admitted() };
  });
  expect(result.rows).toBe(4096);
  expect(result.cost.entries).toBe(4096);
  expect(result.cost.metadata).toBeLessThan(4 * 1024 * 1024);
  expect(result.overflow).toBe("limit");
  expect(result.overflowCost.entries).toBe(0);
});

test("stored bytes over the cumulative JSON-work allowance refuse before entry JSON or body projection", async () => {
  const lane = await create();
  const result = await lane.inside(state => {
    const sql = state.storage.sql, bytes = '"' + "x".repeat(128 * 1024 - 2) + '"';
    sql.exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 33) INSERT INTO entry (seq, hash, time, bytes, size) SELECT x, ?, 'synthetic', ?, ? FROM n", syntheticHash, bytes, bytes.length);
    const metadata = JSON.parse(sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'scope'").one().v);
    metadata.head = { seq: 33, hash: syntheticHash };
    sql.exec("UPDATE meta SET v = ? WHERE k = 'scope'", canonicalize(metadata));
    const queries: string[] = [], budget = new ArchiveBudget();
    let reason = "admitted";
    try { archivePrefixMetadata({ exec(query, ...args) { queries.push(query); return sql.exec(query, ...args); } }, lane.at, metadata.head, PROPOSED_BOUNDS, budget, certified); }
    catch (error) { reason = (error as { reason: string }).reason; }
    return { reason, queries, cost: budget.admitted() };
  });
  expect(result.reason).toBe("limit");
  expect(result.cost.entries).toBe(0); // atomic aggregate reservation failed
  expect(result.queries.filter(query => /FROM entry/.test(query)).every(query => !/json_|SELECT bytes|SELECT \*/.test(query))).toBe(true);
  expect(result.cost.inputWork).toBeLessThan(1024 * 1024); // sizing, not the large JSON bodies
});

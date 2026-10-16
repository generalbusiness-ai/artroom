import { expect, test } from "vitest";
import { canonicalize, newIncarnation, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { incarnationEvidence } from "../src/incarnation-evidence.ts";
import { PREPARATION_BOUNDS as B, PreparationBudget } from "../src/preparation-budget.ts";
import { SqliteStore, type Sql } from "../src/sqlite.ts";
import { found } from "./support.ts";

const sqlOf = (state: DurableObjectState): Sql => ({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
const inc = (n: number) => newIncarnation(new Uint8Array(16).fill(n));

test("native incarnation proof skips all same-incarnation subjects and unrelated scopes with two PK seeks", async () => {
  const scope = await found();
  const got = await scope.inside(state => {
    const store = new SqliteStore(sqlOf(state)), current = store.scope()!;
    const sample = JSON.parse(store.stored(0)!.bytes);
    // Synthetic observed heads written through the real store; these are
    // storage/seek witnesses, not judged observations or read authority.
    store.transaction(() => {
      for (let n = 0; n < 2500; n++) store.putObserved({ of: { scope: current.at.scope, inc: inc(1) }, subject: `member-${n.toString().padStart(5, "0")}`, seq: n });
      for (let n = 0; n < 3000; n++) store.putObserved({ of: { scope: scopeIdOf({ ...sample.input.seed, ordinal: n + 1 }), inc: inc(3) }, subject: "member", seq: n });
    });
    const queries: string[] = [], plans: string[] = []; let rowsRead = 0, bodies = 0;
    const sql: Pick<Sql, "exec"> = { exec(query, ...args) {
      queries.push(query);
      const cursor = state.storage.sql.exec(query, ...args), rows = cursor.toArray(); rowsRead += cursor.rowsRead;
      if (query.startsWith("SELECT value FROM")) bodies++;
      else plans.push(...state.storage.sql.exec("EXPLAIN QUERY PLAN " + query, ...args).toArray().map(row => row["detail"] as string));
      return { toArray: () => rows };
    } };
    const one = incarnationEvidence(sql, current.at.scope, new PreparationBudget()), oneCost = { rowsRead, bodies, queries: queries.length };
    store.putObserved({ of: { scope: current.at.scope, inc: inc(2) }, subject: "member", seq: 0 });
    rowsRead = 0; bodies = 0; queries.length = 0;
    const many = incarnationEvidence(sql, current.at.scope, new PreparationBudget()), manyCost = { rowsRead, bodies, queries: queries.length };
    const missing = scopeIdOf({ ...sample.input.seed, ordinal: 99999 });
    const none = incarnationEvidence(sql, missing, new PreparationBudget());
    return { one, oneCost, many, manyCost, none, plans };
  });
  expect(got.one).toEqual({ kind: "one", incarnation: inc(1) });
  expect(got.oneCost).toMatchObject({ bodies: 1, queries: 3 });
  expect(got.oneCost.rowsRead).toBeGreaterThanOrEqual(2);
  expect(got.oneCost.rowsRead).toBeLessThanOrEqual(3); // native cursor may touch one out-of-range boundary row
  expect(got.many).toEqual({ kind: "many", witnesses: [inc(1), inc(2)] });
  expect(got.manyCost).toEqual({ rowsRead: 4, bodies: 2, queries: 4 });
  expect(got.none).toEqual({ kind: "none" });
  expect(got.plans.every(plan => plan.includes("SEARCH f USING PRIMARY KEY") && !/SCAN|TEMP/i.test(plan))).toBe(true);
});

test("incarnation proof reserves shared calls and body bytes before transfer and latches unavailable", async () => {
  const scope = await found();
  const got = await scope.inside(state => {
    const store = new SqliteStore(sqlOf(state)), at = store.scope()!.at;
    store.putObserved({ of: { scope: at.scope, inc: inc(1) }, subject: "member", seq: 0 });
    store.putObserved({ of: { scope: at.scope, inc: inc(2) }, subject: "member", seq: 0 });
    let bodies = 0;
    const sql: Pick<Sql, "exec"> = { exec(query, ...args) { if (query.startsWith("SELECT value FROM")) bodies++; return state.storage.sql.exec(query, ...args); } };
    const budget = new PreparationBudget({ ...B, calls: 3 }); let failed = false, later = false;
    try { incarnationEvidence(sql, at.scope, budget); } catch { failed = true; }
    try { budget.spend({}); } catch { later = true; }
    const bodyBefore = bodies;
    state.storage.sql.exec("UPDATE folded SET value=? WHERE kind='observed'", canonicalize({ padding: "x".repeat(B.bytes + 1) }));
    let oversized = false;
    try { incarnationEvidence(sql, at.scope, new PreparationBudget()); } catch { oversized = true; }
    return { failed, later, available: budget.available, bodyBefore, bodies, oversized };
  });
  expect(got).toEqual({ failed: true, later: true, available: false, bodyBefore: 1, bodies: 1, oversized: true });
});

test("incarnation metadata keys are capped before transfer and malformed or mismatched native rows refuse", async () => {
  for (const fault of ["key", "mismatch", "malformed"] as const) {
    const scope = await found();
    const got = await scope.inside(state => {
      const store = new SqliteStore(sqlOf(state)), at = store.scope()!.at;
      store.putObserved({ of: { scope: at.scope, inc: inc(1) }, subject: fault === "key" ? "x".repeat(B.keyBytes + 1) : "member", seq: 0 });
      if (fault === "mismatch") state.storage.sql.exec("UPDATE folded SET value=? WHERE kind='observed'", canonicalize({ of: { scope: at.scope, inc: inc(2) }, subject: "member", seq: 0 }));
      if (fault === "malformed") state.storage.sql.exec("UPDATE folded SET value='{' WHERE kind='observed'");
      let bodyQueries = 0, transferred: unknown;
      const sql: Pick<Sql, "exec"> = { exec(query, ...args) {
        if (query.startsWith("SELECT value FROM")) bodyQueries++;
        const rows = state.storage.sql.exec(query, ...args).toArray();
        if (query.startsWith("SELECT CASE")) transferred = rows[0]?.["key"];
        return { toArray: () => rows };
      } };
      let unavailable = false;
      try { incarnationEvidence(sql, at.scope, new PreparationBudget()); } catch { unavailable = true; }
      return { unavailable, bodyQueries, noKeyTransfer: transferred === null };
    });
    expect(got.unavailable).toBe(true);
    expect(got.bodyQueries).toBe(fault === "key" ? 0 : 1);
    if (fault === "key") expect(got.noKeyTransfer).toBe(true);
  }
});

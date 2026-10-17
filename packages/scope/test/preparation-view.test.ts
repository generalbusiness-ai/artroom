import { expect, test } from "vitest";
import type { Item, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, newIncarnation, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { VERSIONS } from "@generalbusiness/dap-platform";
import { PREPARATION_BOUNDS as B, PreparationBudget } from "../src/preparation-budget.ts";
import { preparationScope } from "../src/preparation-scope.ts";
import { preparationView } from "../src/preparation-view.ts";
import { SqliteStore, type Sql } from "../src/sqlite.ts";
import { create } from "./support.ts";

const sqlOf = (state: DurableObjectState): Sql => ({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });

test("metadata-first state pages preserve first-ID and lookahead without loading large unreturned bodies", async () => {
  const scope = await create();
  const got = await scope.inside(state => {
    const actual = sqlOf(state), store = new SqliteStore(actual), sample = store.item(0)!;
    // Synthetic item rows exercise storage selection only, not judgments.
    store.transaction(() => {
      for (let n = 0; n < 3000; n++) store.putItem({ ...sample, id: n + 100, type: "unrelated", state: "final" });
      store.putItem({ ...sample, id: 10, type: "repository", state: "open" });
      store.putItem({ ...sample, id: 11, type: "repository", state: "open", values: { text: "x".repeat(1024 * 1024) } });
    });
    const budget = new PreparationBudget(), snapshot = preparationScope(actual, budget);
    if (snapshot.kind !== "scope") return expect.fail("native scope unavailable");
    const selected: number[] = [], plans: string[] = []; let rowsRead = 0;
    const sql: Pick<Sql, "exec"> = { exec(query, ...args) {
      const cursor = state.storage.sql.exec(query, ...args), rows = cursor.toArray(); rowsRead += cursor.rowsRead;
      if (query.startsWith("SELECT record FROM")) selected.push(args[0] as number);
      else plans.push(...state.storage.sql.exec("EXPLAIN QUERY PLAN " + query, ...args).toArray().map(row => row["detail"] as string));
      return { toArray: () => rows };
    } };
    const page = preparationView(sql, snapshot.scope, budget).page("repository", ["open"], null, 1);
    return { ids: page.items.map(item => item.id), more: page.more, selected, rowsRead, plans };
  });
  expect(got.ids).toEqual([10]); expect(got.more).toBe(true); expect(got.selected).toEqual([10]);
  expect(got.rowsRead).toBeLessThanOrEqual(6);
  expect(got.plans).toHaveLength(1); expect(got.plans[0]).toContain("SEARCH item USING INDEX item_by_state");
  expect(got.plans[0]).not.toMatch(/SCAN|TEMP/i);
});

test("current exact native membership and rules callbacks agree with the complete store on bounded fixtures", async () => {
  const scope = await create();
  const got = await scope.inside(state => {
    const sql = sqlOf(state), store = new SqliteStore(sql), sample = store.item(0)!, genesis = JSON.parse(store.stored(0)!.bytes);
    const membership: ScopeRef = { scope: scopeIdOf({ ...genesis.input.seed, kind: "membership", ordinal: 100 }), inc: newIncarnation(new Uint8Array(16).fill(1)), kind: "membership" };
    const rules: ScopeRef = { scope: scopeIdOf({ ...genesis.input.seed, kind: "rules", ordinal: 101 }), inc: newIncarnation(new Uint8Array(16).fill(2)), kind: "rules" };
    const item = (id: number, type: string, state: string): Item => ({ ...sample, id, type, state, refs: { membership, rules }, values: { membership: membership.scope, rules: rules.scope } });
    store.putItem(item(10, "repository", "open")); store.putItem(item(20, "rules", "current")); store.putItem(item(30, "branch", "ready"));
    store.putObserved({ of: membership, subject: "member", seq: 0 }); store.putObserved({ of: rules, subject: "rules", seq: 0 });
    const results: { named: string; equal: boolean; available: boolean }[] = [];
    for (const [named, code] of Object.entries(VERSIONS)) {
      if (!code.membership && !code.rulesScope) continue;
      const budget = new PreparationBudget(), snapshot = preparationScope(sql, budget);
      if (snapshot.kind !== "scope") return expect.fail("native snapshot unavailable");
      const view = preparationView(sql, snapshot.scope, budget);
      results.push({ named, equal: canonicalize([code.membership?.(view) ?? null, code.rulesScope?.(view) ?? null]) === canonicalize([code.membership?.(store) ?? null, code.rulesScope?.(store) ?? null]), available: budget.available });
    }
    return results;
  });
  expect(got.length).toBeGreaterThan(10);
  expect(got.every(result => result.equal && result.available)).toBe(true);
});

test("state facade refuses an oversized first body, unsupported method and ambiguous incarnation without permission", async () => {
  for (const fault of ["body", "method", "ambiguous", "candidates"] as const) {
    const scope = await create();
    const got = await scope.inside(state => {
      const actual = sqlOf(state), store = new SqliteStore(actual), sample = store.item(0)!, at = store.scope()!.at;
      store.putItem({ ...sample, id: 10, type: "repository", state: "open", values: { text: "x".repeat(B.bytes + 1) } });
      store.putObserved({ of: { ...at, inc: newIncarnation(new Uint8Array(16).fill(1)) }, subject: "member", seq: 0 });
      store.putObserved({ of: { ...at, inc: newIncarnation(new Uint8Array(16).fill(2)) }, subject: "member", seq: 0 });
      let itemBodies = 0, metadata = 0;
      const sql: Pick<Sql, "exec"> = { exec(query, ...args) { if (query.startsWith("SELECT record FROM")) itemBodies++; if (query.startsWith("SELECT id,")) metadata++; return actual.exec(query, ...args); } };
      const budget = new PreparationBudget({ ...B, candidates: fault === "candidates" ? 2 : B.candidates }), snapshot = preparationScope(sql, budget);
      if (snapshot.kind !== "scope") return expect.fail("native snapshot unavailable");
      const view = preparationView(sql, snapshot.scope, budget); let refused = false;
      try {
        if (fault === "body" || fault === "candidates") view.page("repository", ["open"], null, 1);
        if (fault === "method") view.item(0);
        if (fault === "ambiguous") view.incarnations(at.scope);
      } catch { refused = true; }
      return { refused, available: budget.available, itemBodies, metadata };
    });
    expect(got).toMatchObject({ refused: true, available: false, itemBodies: 0 });
    if (fault === "candidates") expect(got.metadata).toBe(0);
  }
});

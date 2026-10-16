import { expect, test } from "vitest";
import { ItemQueryBudget, ItemQueryUnavailable } from "../src/item-query-budget.ts";

// Invariant: operation admission stops the next native call before execution, fences the whole
// operation on exhaustion, and disallows a phase from another credential mode. SQL is a STAND-IN.
test("causal query SQL admits its 128th call and refuses the 129th before execution or another phase", () => {
  let calls = 0;
  const raw = { exec: () => { calls++; return { toArray: () => [] }; } };
  const budget = new ItemQueryBudget("signed", () => true), sql = budget.sql("causal", raw, 4096);
  for (let n = 0; n < 128; n++) sql.exec("SELECT 1");
  expect(calls).toBe(128);
  expect(() => sql.exec("SELECT 1")).toThrow(ItemQueryUnavailable);
  expect(() => budget.sql("page", raw).exec("SELECT 1")).toThrow(ItemQueryUnavailable);
  expect(calls).toBe(128);
  const session = new ItemQueryBudget("session", () => true);
  expect(() => session.sql("causal", raw).exec("SELECT 1")).toThrow(ItemQueryUnavailable);
  expect(calls).toBe(128);
});

// Invariant: composing G2p retains its unchanged local cap and also spends the parent allowance;
// stopping the owning operation prevents the next preparation cost before storage or validation.
test("query preparation preserves phase limits, accounts genesis reservation once, and inherits owner lifetime", () => {
  let active = true;
  const budget = new ItemQueryBudget("session", () => active), local = budget.preparation("preparation");
  local.spend({ calls: 16, genesis: 1024 * 1024 });
  budget.reservePeerPreparation();
  expect(budget.admitted().total).toMatchObject({ calls: 32, historyBodies: 2, historyBytes: 2 * 1024 * 1024, genesisBytes: 2 * 1024 * 1024 });
  expect(() => local.spend({ calls: 1 })).toThrow();
  active = false;
  expect(() => budget.preparation("preparation").spend({ metadata: 1 })).toThrow();
  expect(budget.admitted().total.metadata).toBe(64 * 1024);
});

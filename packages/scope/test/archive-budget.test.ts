import { expect, test } from "vitest";
import { ArchiveBudget, ArchiveStopped, ARCHIVE_BOUNDS } from "../src/archive-budget.ts";

test("one pass admits exact cumulative limits, refuses the next unit atomically and never resets after failure", () => {
  const budget = new ArchiveBudget({}, () => 0);
  budget.spend(ARCHIVE_BOUNDS);
  expect(budget.admitted()).toEqual(ARCHIVE_BOUNDS);
  expect(() => budget.spend({ attempts: 1 })).toThrow(ArchiveStopped);
  expect(() => budget.spend({})).toThrow(ArchiveStopped);
  expect(budget.admitted()).toEqual(ARCHIVE_BOUNDS);
  for (const key of Object.keys(ARCHIVE_BOUNDS) as (keyof typeof ARCHIVE_BOUNDS)[]) {
    const one = new ArchiveBudget({}, () => 0);
    expect(() => one.spend({ [key]: ARCHIVE_BOUNDS[key] + 1 })).toThrow(ArchiveStopped);
    expect(one.admitted()[key]).toBe(0);
  }
});

test("bad costs, unknown fields, unsafe arithmetic and raised limits fail closed before native work", () => {
  for (const inputWork of [-1, -0, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER]) {
    const budget = new ArchiveBudget({}, () => 0); let calls = 0;
    const sql = budget.native({ exec() { calls++; return { toArray: () => [] }; } }, () => ({ inputWork, metadata: 2 }));
    expect(() => sql.exec("SELECT 1")).toThrow(ArchiveStopped); expect(calls).toBe(0);
  }
  expect(() => new ArchiveBudget({ calls: ARCHIVE_BOUNDS.calls + 1 })).toThrow(ArchiveStopped);
  expect(() => new ArchiveBudget({ extra: 1 } as never)).toThrow(ArchiveStopped);
  expect(() => new ArchiveBudget({}, () => 0).spend({ extra: 1 } as never)).toThrow(ArchiveStopped);
});

test("native reservations include returned metadata and input work before SQL, and a terminal failure makes no further calls", () => {
  const budget = new ArchiveBudget({ calls: 1, metadata: 3, inputWork: 5 }, () => 0); let calls = 0;
  const sql = budget.native({ exec() { calls++; return { toArray: () => [{ n: 1 }] }; } }, () => ({ metadata: 3, inputWork: 2 }));
  expect(sql.exec("SELECT 1").toArray()).toEqual([{ n: 1 }]);
  expect(budget.admitted()).toMatchObject({ calls: 1, metadata: 3, inputWork: 5 });
  expect(() => sql.exec("SELECT 1")).toThrow(ArchiveStopped); expect(calls).toBe(1);
  const failing = new ArchiveBudget({}, () => 0), native = failing.native({ exec() { throw new Error("native unavailable"); } }, () => ({ metadata: 0, inputWork: 0 }));
  expect(() => native.exec("SELECT 1")).toThrow("archive-unavailable");
  expect(() => failing.spend({})).toThrow("archive-unavailable");
});

test("original deadline and monotone clock fence later work and reject a delayed value before cache or SQL continuation", async () => {
  let now = 0, resolve!: (value: number) => void, calls = 0, cached = false;
  const budget = new ArchiveBudget({}, () => now, 10);
  const sql = budget.native({ exec() { calls++; return { toArray: () => [] }; } }, () => ({ metadata: 0, inputWork: 0 }));
  const pending = budget.wait(() => new Promise<number>(done => { resolve = done; })).then(() => { sql.exec("SELECT 1"); cached = true; });
  now = 10;
  await expect(pending).rejects.toThrow("archive-timeout");
  resolve(1); await Promise.resolve(); await Promise.resolve();
  expect(cached).toBe(false); expect(calls).toBe(0);
  expect(() => budget.spend({})).toThrow("archive-timeout");
  let clock = 2; const backwards = new ArchiveBudget({}, () => clock); clock = 1;
  expect(() => backwards.check()).toThrow("archive-unavailable");
});

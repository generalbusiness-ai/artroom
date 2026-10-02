import { describe, expect, it } from "vitest";
import { ALARM, ATTENTION_FANOUT_PER_ITEM, ATTENTION_FIFO_PER_ROOM, ATTENTION_ROW_WRITES, IDEM_FIFO_PER_ROOM, MEASURED_ROWS_WRITTEN } from "../../src/budgets.ts";
import { HOURLY_BUDGET } from "../../measure/rows.mjs";

/** Request 8bd623cc, part 3: each budget follows from the measured table as its comment says. */
describe("row budgets", () => {
  it("an item's attention fan-out writes no more than a landing", () => {
    expect(ATTENTION_FANOUT_PER_ITEM * ATTENTION_ROW_WRITES).toBeLessThanOrEqual(MEASURED_ROWS_WRITTEN.land);
    expect((ATTENTION_FANOUT_PER_ITEM + 1) * ATTENTION_ROW_WRITES).toBeGreaterThan(MEASURED_ROWS_WRITTEN.land);
  });

  it("the attention quota holds at least 136 items at the full fan-out", () => {
    expect(Math.floor(ATTENTION_FIFO_PER_ROOM / ATTENTION_FANOUT_PER_ITEM)).toBeGreaterThanOrEqual(136);
  });

  it("the idempotency quota keeps a day of the cheapest act at the hourly per-object ceiling", () => {
    const perHour = Math.floor(HOURLY_BUDGET.maxRowsWrittenPerObject / MEASURED_ROWS_WRITTEN.claim);
    expect(perHour).toBe(233);
    expect(IDEM_FIFO_PER_ROOM).toBeGreaterThanOrEqual(24 * perHour);
  });

  it("an idle room writes nothing; a failing step retries at most 12 times an hour", () => {
    expect(ALARM.idleRowsPerHour).toBe(0);
    expect(3_600_000 / ALARM.retryBackoffMaxMs).toBe(12);
    expect(ALARM.pendingIntervalMs).toBe(5_000);
  });
});

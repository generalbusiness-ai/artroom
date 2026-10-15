import { expect, test } from "vitest";
import type { ProofTimer } from "../src/genesis-proof.ts";
import { PreparationFlights, PREPARATION_MILLISECONDS as B } from "../src/preparation-flight.ts";

class Timer implements ProofTimer {
  value = 0;
  readonly tasks = new Set<{ at: number; work(): void }>();
  now = () => this.value;
  after(ms: number, work: () => void) { const task = { at: this.value + ms, work }; this.tasks.add(task); return () => { this.tasks.delete(task); }; }
  advance(ms: number) { this.value += ms; for (const task of [...this.tasks]) if (task.at <= this.value) { this.tasks.delete(task); task.work(); } }
}
const microtasks = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

test("one preparation completion deadline retains pending ownership until the original late task settles", async () => {
  const clock = new Timer(), flights = new PreparationFlights(clock), gate = deferred<string>(), reached = deferred<void>();
  let started = 0, accepted = 0;
  const first = flights.run(async run => { started++; reached.resolve(); const value = await gate.promise; if (!run.active()) return null; accepted++; return value; });
  await reached.promise; clock.advance(B);
  expect(await first).toBeNull();
  const pending = await Promise.all(Array.from({ length: 16 }, () => flights.run(async () => { started++; return "unwanted new work"; })));
  expect(pending).toEqual(Array(16).fill(null)); expect(started).toBe(1);
  gate.resolve("late witness"); await microtasks(); expect(accepted).toBe(0);
  expect(await flights.run(async run => { started++; return run.active() && run.remaining() === B ? "new operation" : null; })).toBe("new operation");
  await microtasks(); expect(started).toBe(2); expect(clock.tasks.size).toBe(0);
});

test("initial synchronous validation and final synchronous preparation consume the original completion window", async () => {
  for (const phase of ["initial", "final"] as const) {
    const clock = new Timer(), flights = new PreparationFlights(clock); let peer = 0;
    const value = await flights.run(async run => {
      if (phase === "initial") clock.value = B;
      if (!run.active()) return null;
      peer++; await Promise.resolve();
      clock.value = B; return "overdue result"; // no timer callback needs to run for refusal
    });
    expect(value).toBeNull(); expect(peer).toBe(phase === "initial" ? 0 : 1);
    await microtasks(); expect(clock.tasks.size).toBe(0);
  }
});

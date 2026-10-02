/**
 * Checker review 6d392973: the act tool's retry wait must not leave an abort
 * listener on the conversation's signal after each wait, or a long run of
 * lost replies piles them up. (The review's type-check finding is tested by
 * scripts/check-test.sh.)
 */

import { describe, expect, it } from "vitest";
import { sleep } from "../src/agent.ts";

/** An AbortSignal that counts its abort listeners. */
function countingSignal() {
  const controller = new AbortController();
  const signal = controller.signal;
  const live = new Set<unknown>();
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = ((type: string, fn: never, opts?: never) => (type === "abort" && live.add(fn), add(type, fn, opts))) as typeof signal.addEventListener;
  signal.removeEventListener = ((type: string, fn: never, opts?: never) => (type === "abort" && live.delete(fn), remove(type, fn, opts))) as typeof signal.removeEventListener;
  return { controller, signal, live };
}

describe("review 6d392973: the retry wait", () => {
  it("removes its abort listener when the wait ends", async () => {
    const { signal, live } = countingSignal();
    for (let i = 0; i < 5; i++) await sleep(0, signal);
    expect(live.size).toBe(0);
  });

  it("still rejects with the signal's reason when aborted during the wait", async () => {
    const { controller, signal } = countingSignal();
    const waiting = sleep(60_000, signal);
    controller.abort(new Error("aborted by the test"));
    await expect(waiting).rejects.toThrow("aborted by the test");
  });

  it("rejects at once if the signal is already aborted", async () => {
    const { controller, signal, live } = countingSignal();
    controller.abort(new Error("already aborted"));
    await expect(sleep(0, signal)).rejects.toThrow("already aborted");
    expect(live.size).toBe(0);
  });
});

import { expect, test, vi } from "vitest";
import type { Entry, Input, OperationId, Read } from "@generalbusiness/artroom-contract";
import { httpTransport, type Fetch } from "@generalbusiness/artroom-client";
import { CLONE_ENTRIES_PER_POLL, outcomeFetch, pauseOutcome, waitOutcome } from "../src/clone-outcome.ts";

const operation: OperationId = "1:0";
const outcome = (id: OperationId = operation): Input => ({ type: "outcome", owner: "platform:destination@99", kind: "mint-read", operation: id, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body: { token: "nonsecret-handle", ends: "2026-10-08T12:00:00Z" } } });
// STAND-IN entry reader: only the input reaches this scan boundary. No scope
// judged these entries; the client's HTTP validation and full fact validation
// are not exercised by these scripts.
const scripted = (input: Input): Read<{ entry: Entry }> => ({ ok: true, at: { seq: 1, hash: `sha256:${"a".repeat(64)}` }, complete: true, value: { entry: { input } as Entry } });

// Invariant: every poll returns within its entry budget, preserving the next
// entry across batches, even while readable unrelated entries keep arriving.
test("outcome scan bounds each poll and total reads, and carries its cursor to the next poll", async () => {
  const reads: number[] = [];
  const pauses: number[] = [];
  const target = 10 + CLONE_ENTRIES_PER_POLL;
  const complete = await waitOutcome(operation, 10, async (seq) => { reads.push(seq); return scripted(outcome(seq === target ? operation : "9:0")); }, async () => { pauses.push(reads.length); }, 2);
  expect(complete).toMatchObject({ ok: true, next: target + 1, scanned: CLONE_ENTRIES_PER_POLL + 1, polls: 2 });
  expect(pauses).toEqual([CLONE_ENTRIES_PER_POLL]);
  expect(reads).toEqual(Array.from({ length: CLONE_ENTRIES_PER_POLL + 1 }, (_unused, n) => 10 + n));

  const boundedReads: number[] = [];
  const boundedPauses: number[] = [];
  const bounded = await waitOutcome(operation, 10, async (seq) => { boundedReads.push(seq); return scripted(outcome(seq === 14 ? operation : "9:0")); }, async () => { boundedPauses.push(boundedReads.length); }, 2, { entriesPerPoll: 2 });
  expect(bounded).toEqual({ ok: false, reason: "poll-limit", next: 14, scanned: 4, polls: 2 });
  expect(boundedReads).toEqual([10, 11, 12, 13]);
  expect(boundedPauses).toEqual([2]);
});

// Invariant: not-found is retried at its exact cursor; a refusal stops at
// that same position and is retained as actionable evidence.
test("outcome scan retries an absent cursor and records a refused read without skipping it", async () => {
  const reads: number[] = [];
  const completed = await waitOutcome(operation, 10, async (seq) => { reads.push(seq); return reads.length === 2 ? { ok: false, reason: "not-found" } : scripted(outcome(seq === 11 ? operation : "9:0")); }, async () => {}, 2);
  expect(reads).toEqual([10, 11, 11]);
  expect(completed).toMatchObject({ ok: true, next: 12, scanned: 2, polls: 2 });
  expect(await waitOutcome(operation, 10, async () => ({ ok: false, reason: "forbidden" }), async () => {})).toEqual({ ok: false, reason: "read-refused", refusal: "forbidden", next: 10, scanned: 0, polls: 1 });
});

// Invariant: the aggregate deadline aborts an in-flight transport read, and
// caller cancellation releases a pause; neither can start another poll.
// Fetch is a labelled STAND-IN that honors abort. Timers advance by test control.
test("outcome deadline aborts the active read and caller cancellation releases the pause without another read", async () => {
  vi.useFakeTimers();
  try {
    let sent = 0;
    let active: AbortSignal | undefined;
    let reached!: () => void;
    const entered = new Promise<void>((resolve) => { reached = resolve; });
    const fetch: Fetch = async (_url, init) => {
      sent++; active = init?.signal as AbortSignal | undefined; reached();
      return new Promise<never>((_resolve, reject) => { active!.addEventListener("abort", () => reject(new Error("scripted cancellation")), { once: true }); });
    };
    const pending = waitOutcome(operation, 2, (seq, signal) => httpTransport("https://service.test", { fetch: outcomeFetch(fetch, signal) }).entry(`sc_${"a".repeat(52)}`, "Session boundary", seq), async () => {}, 2, { seconds: 1 });
    await entered;
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toEqual({ ok: false, reason: "deadline", next: 2, scanned: 0, polls: 1 });
    expect([sent, active?.aborted, vi.getTimerCount()]).toEqual([1, true, 0]);

    const caller = new AbortController();
    let pauses = 0;
    let paused!: () => void;
    const inPause = new Promise<void>((resolve) => { paused = resolve; });
    const cancelled = waitOutcome(operation, 2, async () => { sent++; return { ok: false, reason: "not-found" }; }, (signal) => { pauses++; paused(); return pauseOutcome(signal); }, 2, { signal: caller.signal });
    await inPause;
    caller.abort();
    expect(await cancelled).toEqual({ ok: false, reason: "cancelled", next: 2, scanned: 0, polls: 1 });
    expect([sent, pauses, vi.getTimerCount()]).toEqual([2, 1, 0]);

    const request = new AbortController();
    let combined: AbortSignal | undefined;
    const send: Fetch = async (_url, init) => { combined = init?.signal as AbortSignal | undefined; return { status: 404, body: null }; };
    await outcomeFetch(send, new AbortController().signal)("https://service.test", { signal: request.signal as never });
    request.abort();
    expect(combined?.aborted).toBe(true); // Per-request deadlines remain effective too.
  } finally { vi.useRealTimers(); }
});

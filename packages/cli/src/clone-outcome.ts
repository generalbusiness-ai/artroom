/** Bounded reads for one already accepted mint-read operation. This waiter
 * never submits an act or retrieves a plaintext, including after cancellation. */
import type { Entry, Input, OperationId, Read } from "@generalbusiness/artroom-contract";
import { TransportError, type Fetch } from "@generalbusiness/artroom-client";

export const CLONE_ENTRIES_PER_POLL = 64;
export const CLONE_WAIT_SECONDS = 120;
type Outcome = Extract<Input, { type: "outcome" }>;
export interface CloneWait {
  entriesPerPoll?: number;
  seconds?: number;
  signal?: AbortSignal;
}
interface Progress { next: number; scanned: number; polls: number }
export type OutcomeWait = Progress & (
  | { ok: true; outcome: Outcome }
  | { ok: false; reason: "poll-limit" | "deadline" | "cancelled" }
  | { ok: false; reason: "read-refused"; refusal: string }
);

/** Preserve the transport's per-request abort along with the whole wait's. */
export const outcomeFetch = (send: Fetch, signal: AbortSignal): Fetch => (url, init) => {
  if (signal.aborted) throw new TransportError("read-token outcome wait stopped before sending the read");
  const request = init?.signal as AbortSignal | undefined;
  return send(url, { ...init, signal: AbortSignal.any(request ? [signal, request] : [signal]) as never });
};

/** The normal pause releases its timer when the whole wait is cancelled. */
export function pauseOutcome(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, 1000);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

export async function waitOutcome(operation: OperationId, first: number, readEntry: (seq: number, signal: AbortSignal) => Promise<Read<{ entry: Entry }>>, pause: (signal: AbortSignal) => Promise<void>, tries = 120, options: CloneWait = {}): Promise<OutcomeWait> {
  const batch = options.entriesPerPoll ?? CLONE_ENTRIES_PER_POLL;
  const seconds = options.seconds ?? CLONE_WAIT_SECONDS;
  if (!Number.isSafeInteger(batch) || batch < 1 || !Number.isSafeInteger(tries) || tries < 1 || !Number.isFinite(seconds) || seconds <= 0) throw new RangeError("clone wait limits must be positive");
  const progress: Progress = { next: first, scanned: 0, polls: 0 };
  const controller = new AbortController();
  const STOP = Symbol("wait stopped");
  let ended: "cancelled" | "deadline" | null = null;
  let stop!: (reason: "cancelled" | "deadline") => void;
  const stopped = new Promise<typeof STOP>((resolve) => { stop = (reason) => { if (ended !== null) return; ended = reason; controller.abort(); resolve(STOP); }; });
  const cancel = () => stop("cancelled");
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => stop("deadline"), seconds * 1000);
  const interrupted = (): OutcomeWait => ({ ...progress, ok: false, reason: ended ?? "cancelled" });
  try {
    if (options.signal?.aborted) cancel();
    for (let poll = 0; poll < tries; poll++) {
      if (ended !== null) return interrupted();
      progress.polls++;
      for (let count = 0; count < batch; count++) {
        if (ended !== null) return interrupted();
        const read = await Promise.race([readEntry(progress.next, controller.signal), stopped]);
        if (read === STOP || ended !== null) return interrupted();
        if (!read.ok) {
          if (read.reason === "not-found") break;
          return { ...progress, ok: false, reason: "read-refused", refusal: read.reason };
        }
        progress.next++;
        progress.scanned++;
        const input = read.value.entry.input;
        if (input.type === "outcome" && input.operation === operation) return { ...progress, ok: true, outcome: input };
      }
      // Every batch yields, including a continuously advancing history. Keep
      // its cursor; an absent entry is retried at the same position next poll.
      if (poll + 1 < tries) {
        const paused = await Promise.race([pause(controller.signal), stopped]);
        if (paused === STOP || ended !== null) return interrupted();
      }
    }
    return { ...progress, ok: false, reason: "poll-limit" };
  } catch (error) {
    if (ended !== null) return interrupted();
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
}

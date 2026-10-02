/**
 * Contract amendment 4 (1c785ed8), through the types only. Compiled, never run.
 *
 * Where each segment of a log commit starts (R-LOG-17), from the entries'
 * canonical lines and the checkpoint alone, so `commitFor` stays a pure
 * function of its arguments. And the two admin attention items of R-LOG-18
 * and R-LOG-20.
 */

import type { AttentionWhy, Checkpoint, LogLayout, Seq, Timestamp } from "@generalbusiness/artroom-contract";

/** Artifacts refuses a larger git object (measured 2026-10-02). */
export const ARTIFACTS_OBJECT_LIMIT = 33_554_432;
/** R-LOG-19: every new log object, and every layout 2 segment, is at most this. A quarter of the limit. */
export const OBJECT_BOUND = 8_388_608;
/** R-LOG-18: the canonical line of an entry sealed from `from` on. */
export const ENTRY_BOUND = 1_048_576;
export const SEGMENT_ENTRIES = 1_000;

/**
 * The `first` of every segment, given the UTF-8 byte length of each
 * entry's canonical line, in seq order from 0. A segment's bytes are its
 * lines joined by newlines (0x0A), with no newline after the last.
 */
export function segmentStarts(lineBytes: readonly number[], checkpoint: Checkpoint): Seq[] {
  const layout: LogLayout | undefined = checkpoint.layout;
  const starts: Seq[] = [];
  let count = 0;
  let bytes = 0;
  for (const [seq, n] of lineBytes.entries()) {
    const byBytes = layout !== undefined && seq >= layout.from && bytes + 1 + n > OBJECT_BOUND;
    if (seq === 0 || count === SEGMENT_ENTRIES || (count > 0 && byBytes)) {
      starts.push(seq);
      count = 0;
      bytes = 0;
    }
    bytes += (count === 0 ? 0 : 1) + n;
    count += 1;
  }
  return starts;
}

export function publicationFailed(detail: string, since: Timestamp): AttentionWhy {
  return { why: "log-publication-failed", reason: "refused", detail, since };
}

export const entryTooLarge: AttentionWhy = { why: "log-entry-too-large", event: "revert-lane", bytes: ENTRY_BOUND + 1 };

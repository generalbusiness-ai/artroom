/**
 * Contract amendment 4 (1c785ed8, revision 2), through the types. Compiled,
 * never run.
 *
 * The reference computations of layout 2, each a function of the log's
 * content and the checkpoint alone, so `commitFor` stays pure:
 * - where each segment starts (R-LOG-17), counting an entry over the bound
 *   by its `ChunkedLine` (R-LOG-18);
 * - how a file over the bound is cut into chunks (R-LOG-18);
 * - which shard directory holds a name (R-LOG-19).
 */

import type { AttentionWhy, Checkpoint, ChunkedLine, Digest, LogLayout, Seq, Timestamp } from "@generalbusiness/artroom-contract";

/** Artifacts refuses a larger git object (measured 2026-10-02). */
export const ARTIFACTS_OBJECT_LIMIT = 33_554_432;
/** R-LOG-19: B. Every blob a layout 2 commit writes is at most this. A quarter of the limit. */
export const OBJECT_BOUND = 8_388_608;
/** R-LOG-19: a directory lists at most this many entries. */
export const DIRECTORY_ENTRIES = 4_096;
export const SEGMENT_ENTRIES = 1_000;

/** The segment line for an entry whose canonical line is over B (R-LOG-18). Keys in JCS order. */
export function chunkedLine(seq: Seq, bytes: number, digest: Digest): string {
  const line: ChunkedLine = { chunked: { bytes, digest }, seq };
  return JSON.stringify(line);
}

/** The bytes an entry takes in its segment: its line, or its `ChunkedLine` when the line is over B. */
export function placedBytes(seq: Seq, lineBytes: number): number {
  if (lineBytes <= OBJECT_BOUND) return lineBytes;
  // A digest is always `sha256:` and 64 hex characters, so the length does not depend on it.
  return chunkedLine(seq, lineBytes, `sha256:${"0".repeat(64)}`).length;
}

/**
 * The `first` of every segment, from the UTF-8 length of each entry's
 * canonical line in seq order from 0. A segment's bytes are its placed
 * lines joined by newlines (0x0A), with no newline after the last.
 */
export function segmentStarts(lineBytes: readonly number[], checkpoint: Checkpoint): Seq[] {
  const layout: LogLayout | undefined = checkpoint.layout;
  const starts: Seq[] = [];
  let count = 0;
  let bytes = 0;
  for (const [seq, n] of lineBytes.entries()) {
    const placed = layout !== undefined && seq >= layout.from ? placedBytes(seq, n) : n;
    const byBytes = layout !== undefined && seq >= layout.from && bytes + 1 + placed > OBJECT_BOUND;
    if (seq === 0 || count === SEGMENT_ENTRIES || (count > 0 && byBytes)) {
      starts.push(seq);
      count = 0;
      bytes = 0;
    }
    bytes += (count === 0 ? 0 : 1) + placed;
    count += 1;
  }
  return starts;
}

/** The chunks of a file over B: names (12 digits from 0) and lengths. Every chunk is B bytes except the last. */
export function chunks(fileBytes: number): { readonly name: string; readonly bytes: number }[] {
  const out: { name: string; bytes: number }[] = [];
  for (let at = 0, k = 0; at < fileBytes; at += OBJECT_BOUND, k++) out.push({ name: String(k).padStart(12, "0"), bytes: Math.min(OBJECT_BOUND, fileBytes - at) });
  return out;
}

/**
 * The shard directories that hold `name` among all the names of one
 * directory set (R-LOG-19). `key` is the name's 12 decimal digits or 64 hex
 * characters; `group` is 3 for decimal keys and 2 for hex keys. A directory
 * lists its names while it would hold at most `DIRECTORY_ENTRIES` of them;
 * otherwise it holds one subdirectory per distinct next group.
 */
export function shardsOf(names: readonly string[], name: string, key: (n: string) => string, group: 2 | 3): string[] {
  const k = key(name);
  const dirs: string[] = [];
  let members = names;
  while (members.length > DIRECTORY_ENTRIES) {
    const prefix = k.slice(0, (dirs.length + 1) * group);
    dirs.push(prefix.slice(-group));
    members = members.filter((m) => key(m).startsWith(prefix));
  }
  return dirs;
}

export function publicationStalled(detail: string, since: Timestamp): AttentionWhy {
  return { why: "log-publication-stalled", reason: "refused", detail, since };
}

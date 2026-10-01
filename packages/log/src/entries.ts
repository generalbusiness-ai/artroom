/**
 * Entries, checkpoints and the published layout (R-LOG-2, R-LOG-8, R-LOG-9).
 * Sealing is here so tests and tools build entries exactly in the
 * contract's order; the Room seals its own entries the same way.
 */

import type { ActId, Checkpoint, Digest, EntryContent, Genesis, KeyId, LogEntry, RoomId, Seq } from "@generalbusiness/artroom-contract";
import { canonicalize, parseStrict } from "./canonical.ts";
import { digestJson, sha256Hex, sign } from "./crypto.ts";
import { utf8 } from "./canonical.ts";

export const LOG_REF = "refs/artroom/log";
export const ROOT = "artroom-log/v1";
export const SEGMENT_SIZE = 1000;

/** `act_<seq>_<first 8 hex of hash>` (R-ID-1). */
export function entryId(seq: Seq, hash: Digest): ActId {
  return `act_${seq}_${hash.slice(7, 15)}`;
}

/** `room_` + the first 32 hex of the genesis object's digest (R-ID-3). */
export function roomIdOf(genesis: Genesis): RoomId {
  return `room_${digestJson(genesis).slice(7, 39)}`;
}

/** Seal content: hash its canonical bytes, then sign the hash with the room key (R-LOG-2, R-LOG-4). */
export function seal(content: EntryContent, roomSeed: Uint8Array): LogEntry {
  const hash = digestJson(content);
  return { ...content, hash, roomSig: sign(roomSeed, "artroom-entry-v1", hash) };
}

/** The content of a sealed entry: everything except `hash` and `roomSig`. */
export function contentOf(entry: LogEntry): EntryContent {
  const { hash: _hash, roomSig: _sig, ...content } = entry;
  return content;
}

/** A checkpoint for entries through `through` (R-LOG-8 step 2). It names no commit. */
export function makeCheckpoint(room: RoomId, roomKey: KeyId, roomSeed: Uint8Array, through: LogEntry, at: string): Checkpoint {
  const unsigned = { format: "artroom-log-v1" as const, room, through: through.seq, hash: through.hash, at, roomKey };
  return { ...unsigned, sig: sign(roomSeed, "artroom-checkpoint-v1", unsigned) };
}

/** `first` is 12 decimal digits, zero-padded (R-LOG-9). */
export function segmentPath(first: Seq): string {
  return `${ROOT}/segments/${String(first).padStart(12, "0")}.jsonl`;
}

/** A retained replay context or policy document, as canonical JSON (R-LOG-7). */
export interface Retained {
  readonly kind: "input" | "policy";
  /** Canonical JSON text. Its digest names the file. */
  readonly body: string;
}

export function retain(kind: Retained["kind"], value: unknown): Retained {
  return { kind, body: canonicalize(value) };
}

export function retainedPath(r: Retained): string {
  return `${ROOT}/${r.kind === "input" ? "inputs" : "policies"}/${sha256Hex(utf8(r.body))}.json`;
}

/** The files of one log commit (R-LOG-9). Full segments are identical in every later commit. */
export function logFiles(entries: readonly LogEntry[], retained: readonly Retained[], checkpoint: Checkpoint): Record<string, string> {
  return layout(
    entries.map((e) => canonicalize(e)),
    new Map(retained.map((r) => [retainedPath(r), r.body])),
    canonicalize(checkpoint),
  );
}

/**
 * The files of one log commit from canonical text: one line per entry from
 * seq 0, retained files by path, and the checkpoint.
 */
export function layout(lines: readonly string[], retained: ReadonlyMap<string, string>, checkpoint: string): Record<string, string> {
  const first = lines[0] === undefined ? undefined : (parseStrict(lines[0]) as LogEntry);
  if (!first || first.entry?.type !== "system" || first.entry.event?.type !== "genesis") throw new Error("entry 0 must be genesis");
  const files: Record<string, string> = {};
  files[`${ROOT}/genesis.json`] = canonicalize(first.entry.event.genesis);
  for (let at = 0; at < lines.length; at += SEGMENT_SIZE) files[segmentPath(at)] = lines.slice(at, at + SEGMENT_SIZE).join("\n");
  for (const [path, body] of retained) files[path] = body;
  files[`${ROOT}/checkpoint.json`] = checkpoint;
  return files;
}

/** True for the path of a retained replay context or policy document. */
export function isRetainedPath(path: string): boolean {
  return /^artroom-log\/v1\/(inputs|policies)\/[0-9a-f]{64}\.json$/.test(path);
}

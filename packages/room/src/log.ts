/**
 * Sealing and publishing the log (R-LOG-1 to R-LOG-13).
 *
 * Sealing follows R-LOG-2 exactly: seq and prev first, then the content with
 * its complete receipt, then the hash of the content's canonical bytes, then
 * the ID, then the room's signature over the hash, then the SQLite write. No
 * step reads a later one, and nothing sealed is rewritten.
 */

import type {
  ActId,
  Checkpoint,
  Digest,
  EntryContent,
  Genesis,
  KeyId,
  LaneId,
  LogEntry,
  MemberId,
  RoomId,
  Seq,
  Sha,
} from "@generalbusiness/artroom-contract";
import { canonicalize } from "./canonical.ts";
import { digestJson, sign } from "./crypto.ts";
import { entryId } from "./ids.ts";
import type { Sql } from "./ports.ts";
import { head, num, one, str } from "./store.ts";

/** Index columns for an entry: what reads filter on without parsing it. */
export interface EntryIndex {
  readonly kind: string;
  readonly lane: LaneId | null;
  readonly by: MemberId | null;
}

function indexOf(content: EntryContent): EntryIndex {
  const e = content.entry;
  if (e.type === "system") {
    const ev = e.event;
    const lane = "lane" in ev && typeof ev.lane === "string" ? (ev.lane as LaneId) : null;
    return { kind: ev.type, lane, by: null };
  }
  const env = e.act.envelope;
  const t = env.target as { lane?: LaneId } | null;
  return { kind: env.kind, lane: t && typeof t.lane === "string" ? t.lane : null, by: e.receipt.authority.member };
}

/**
 * Seal one entry and write it. Must run inside the caller's transaction.
 * `lane: "self"` indexes the entry under its own ID, for an entry that
 * creates a lane (R-LOG-12: the content itself never names it).
 */
export function seal(sql: Sql, seed: Uint8Array, at: string, entry: EntryContent["entry"], lane?: "self"): LogEntry {
  const h = head(sql);
  const seq = h ? h.seq + 1 : 0;
  const content: EntryContent = { format: "artroom-log-v1", seq, prev: h ? h.hash : null, at, entry };
  const hash = digestJson(content);
  const id = entryId(seq, hash);
  const roomSig = sign(seed, "artroom-entry-v1", hash);
  const sealed: LogEntry = { ...content, hash, roomSig };
  const ix = indexOf(content);
  sql.all(
    "INSERT INTO entries (seq, id, hash, type, kind, lane, by_member, at, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    seq,
    id,
    hash,
    entry.type,
    ix.kind,
    lane === "self" ? id : ix.lane,
    ix.by,
    at,
    canonicalize(sealed),
  );
  return sealed;
}

export function idOf(e: LogEntry): ActId {
  return entryId(e.seq, e.hash);
}

export function entryAt(sql: Sql, seq: Seq): LogEntry | null {
  const r = one(sql, "SELECT body FROM entries WHERE seq = ?", seq);
  return r ? (JSON.parse(str(r, "body")!) as LogEntry) : null;
}

/** Resolve an entry ID by seq, then compare the hash prefix (R-ID-1). */
export function entryById(sql: Sql, id: string): LogEntry | null {
  const m = /^act_(0|[1-9][0-9]{0,15})_([0-9a-f]{8})$/.exec(id);
  if (!m) return null;
  const r = one(sql, "SELECT id, body FROM entries WHERE seq = ?", Number(m[1]));
  if (!r || str(r, "id") !== id) return null;
  return JSON.parse(str(r, "body")!) as LogEntry;
}

export function entriesAfter(sql: Sql, after: Seq, limit: number): LogEntry[] {
  return sql
    .all("SELECT body FROM entries WHERE seq > ? ORDER BY seq ASC LIMIT ?", after, limit)
    .map((r) => JSON.parse(str(r, "body")!) as LogEntry);
}

export function entryCount(sql: Sql): number {
  return num(one(sql, "SELECT COUNT(*) AS n FROM entries"), "n") ?? 0;
}

// ------------------------------------------------------------ publication

/** `first` is 12 decimal digits, zero-padded (R-LOG-9). */
export function segmentName(first: Seq): string {
  return `artroom-log/v1/segments/${String(first).padStart(12, "0")}.jsonl`;
}

/** The checkpoint for entries through `through` (R-LOG-8 step 2). It names no commit. */
export function checkpoint(room: RoomId, roomKey: KeyId, seed: Uint8Array, through: LogEntry, at: string): Checkpoint {
  const unsigned = { format: "artroom-log-v1" as const, room, through: through.seq, hash: through.hash, at, roomKey };
  return { ...unsigned, sig: sign(seed, "artroom-checkpoint-v1", unsigned) };
}

/**
 * The files of one log commit (R-LOG-9): genesis, segments of 1,000 canonical
 * entries, retained inputs and policies, and the checkpoint. A full segment
 * is identical in every later commit.
 */
export function publicationFiles(
  genesis: Genesis,
  entries: readonly LogEntry[],
  retained: readonly { readonly digest: Digest; readonly kind: string; readonly body: string }[],
  cp: Checkpoint,
): Record<string, string> {
  const files: Record<string, string> = {};
  files["artroom-log/v1/genesis.json"] = canonicalize(genesis);
  for (let first = 0; first < entries.length; first += 1000) {
    files[segmentName(first)] = entries
      .slice(first, first + 1000)
      .map((e) => canonicalize(e))
      .join("\n");
  }
  for (const r of retained) {
    const dir = r.kind === "input" ? "inputs" : "policies";
    files[`artroom-log/v1/${dir}/${r.digest.slice(7)}.json`] = r.body;
  }
  files["artroom-log/v1/checkpoint.json"] = canonicalize(cp);
  return files;
}

export interface PublishState {
  readonly lastCommit: Sha | null;
  readonly publishedThrough: Seq;
}

/**
 * Identifier formats and derivations (R-ID-1 to R-ID-10).
 */

import type {
  ActId,
  Digest,
  Generation,
  Genesis,
  LaneId,
  OpId,
  PinnedRef,
  RoomId,
  Seq,
} from "@generalbusiness/artroom-contract";
import { digestJson } from "./crypto.ts";

export const RE = {
  sha: /^[0-9a-f]{40}$/,
  digest: /^sha256:[0-9a-f]{64}$/,
  actId: /^act_(0|[1-9][0-9]{0,15})_[0-9a-f]{8}$/,
  roomId: /^room_[0-9a-f]{32}$/,
  keyId: /^key_[A-Za-z0-9_-]{43}$/,
  handle: /^@[a-z0-9][a-z0-9-]{0,38}$/,
  opId: /^op_[A-Za-z0-9_-]{1,64}$/,
  obligationId: /^obl_[a-z][a-z0-9-]{0,63}$/,
  ruleId: /^[a-z][a-z0-9-]{0,63}$/,
  idempotencyKey: /^[A-Za-z0-9_-]{1,64}$/,
  nonce: /^[A-Za-z0-9_-]{16,64}$/,
  b64url: /^[A-Za-z0-9_-]*$/,
  sig: /^[A-Za-z0-9_-]{86}$/,
  timestamp: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,
  https: /^https:\/\/[^\s]+$/,
} as const;

/** `act_<seq>_<hash8>` (R-ID-1). */
export function entryId(seq: Seq, hash: Digest): ActId {
  return `act_${seq}_${hash.slice(7, 15)}`;
}

/** The seq and hash prefix of an entry ID, or null when it is not one. */
export function parseEntryId(id: string): { readonly seq: Seq; readonly hash8: string } | null {
  if (!RE.actId.test(id)) return null;
  const [, seq, hash8] = id.split("_");
  const n = Number(seq);
  if (!Number.isSafeInteger(n)) return null;
  return { seq: n, hash8: hash8! };
}

/** `room_` + the first 32 hex characters of the genesis digest (R-ID-3). */
export function roomIdOf(genesis: Genesis): RoomId {
  return `room_${digestJson(genesis).slice(7, 39)}`;
}

/** Operation IDs come from sequence numbers, never hashes (R-ID-8). */
export const opIds = {
  land: (seq: Seq): OpId => `op_land_${seq}`,
  preview: (seq: Seq): OpId => `op_preview_${seq}`,
};

/** The pinned ref for one generation (R-PROP-1, R-PROP-2). */
export function pinnedRef(lane: LaneId, generation: Generation): PinnedRef {
  return `refs/artroom/heads/${lane}/${generation}`;
}

/** Room clock as RFC 3339 UTC. */
export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function parseTime(t: string): number | null {
  if (!RE.timestamp.test(t)) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

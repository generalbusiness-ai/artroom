/**
 * Type guards: the only runtime code in this package. Each checks a format
 * from docs/protocol.md section 2 or narrows a union.
 */

import type { ActId, Cursor, Digest, KeyId, MemberId, RoomId, Sha } from "./ids.ts";
import type { ArtroomError, Refusal } from "./errors.ts";
import type { LandOp, LandTerminal, SlotHolding } from "./landing.ts";
import type { Lane } from "./lanes.ts";
import type { Evidence, Carried } from "./evidence.ts";

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ACT_ID = /^act_(0|[1-9][0-9]{0,15})_[0-9a-f]{8}$/;
const ROOM_ID = /^room_[0-9a-f]{32}$/;
const KEY_ID = /^key_[A-Za-z0-9_-]{43}$/;
const MEMBER_ID = /^@[a-z0-9][a-z0-9-]{0,38}$/;

/** True for a value returned as a refusal rather than a record. */
export function isRefusal(value: unknown): value is Refusal {
  return typeof value === "object" && value !== null && (value as { refused?: unknown }).refused === true;
}

/** True for a thrown Artroom failure, on any transport. */
export function isArtroomError(value: unknown): value is ArtroomError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { name?: unknown; code?: unknown; retryable?: unknown };
  return v.name === "ArtroomError" && typeof v.code === "string" && typeof v.retryable === "boolean";
}

export function isSha(value: unknown): value is Sha {
  return typeof value === "string" && SHA.test(value);
}

export function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && DIGEST.test(value);
}

export function isActId(value: unknown): value is ActId {
  return typeof value === "string" && ACT_ID.test(value) && Number.isSafeInteger(Number(value.split("_")[1]));
}

export function isRoomId(value: unknown): value is RoomId {
  return typeof value === "string" && ROOM_ID.test(value);
}

export function isKeyId(value: unknown): value is KeyId {
  return typeof value === "string" && KEY_ID.test(value);
}

export function isMemberId(value: unknown): value is MemberId {
  return typeof value === "string" && MEMBER_ID.test(value);
}

/** Cursors are opaque; this only checks that a value could be one. */
export function isCursor(value: unknown): value is Cursor {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

/** True once a landing operation can no longer change. */
export function isTerminal(op: LandOp): op is Extract<LandOp, { readonly state: LandTerminal }> {
  return op.state === "landed" || op.state === "aborted" || op.state === "retryable" || op.state === "failed";
}

/** True while the operation holds the room's publication slot (R-PUB-2). */
export function holdsSlot(op: LandOp): op is Extract<LandOp, { readonly state: SlotHolding }> {
  return op.state === "publishing" || op.state === "unresolved";
}

/** True when the lane has a holder; the lane then satisfies `Held`. */
export function isHeld(lane: Lane): lane is Extract<Lane, { readonly state: "held" }> {
  return lane.state === "held";
}

export function isCarried(evidence: Evidence): evidence is Carried {
  return evidence.basis === "carried";
}

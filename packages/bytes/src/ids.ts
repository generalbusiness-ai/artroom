/**
 * Guards for the identifiers the contract names (scope contract, sections
 * 2.1, 3, 4.1, 4.3 and 6.1), beside `isDigest`, `isScopeId` and
 * `isIncarnation`. Each is a pure function, and each identifier has its one
 * guard here: no other package tests these forms with a pattern of its own.
 * A timestamp's one guard is `timeMs`, below; the clock rules are derive's.
 */

import type { DutyId, KeyId, MemberId, OperationId, PlatformDefinition, ScopeKind, Timestamp } from "@generalbusiness/artroom-contract";
import { wellFormed } from "./canonical.ts";
import { publicKeyOf } from "./sign.ts";

export const SCOPE_KINDS: readonly ScopeKind[] = ["directory", "membership", "rules", "destination", "inbox", "task", "lane"];

export function isScopeKind(value: unknown): value is ScopeKind {
  return SCOPE_KINDS.includes(value as ScopeKind);
}

/** `key_` + the unpadded base64url of 32 bytes. Whether the bytes are a point is the signature check's question. */
export function isKeyId(value: unknown): value is KeyId {
  return publicKeyOf(value)?.length === 32;
}

/** `@` and at least one more character, well formed. How long a handle may be is a bound of the scope (`memberBytes`), not of the form. */
export function isMemberId(value: unknown): value is MemberId {
  return typeof value === "string" && /^@./.test(value) && wellFormed(value);
}

/** `op_` and at least one more character, well formed. The contract states no further form; the authority note may. */
export function isOperationId(value: unknown): value is OperationId {
  return typeof value === "string" && /^op_./.test(value) && wellFormed(value);
}

/** A position in one scope's history, or an ordinal, from its one decimal text: no sign, no leading zero, at most 16 digits. Null for any other text. */
export function positionOf(text: unknown): number | null {
  return typeof text === "string" && /^(0|[1-9][0-9]{0,15})$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
}

/** One send of one entry: `seq.n`, each a position in its one decimal form. */
export function isDutyId(value: unknown): value is DutyId {
  const parts = typeof value === "string" ? value.split(".") : [];
  return parts.length === 2 && parts.every((part) => positionOf(part) !== null);
}

/** A definition the platform supplies in code: `platform:<name>@<version>`. */
export function isPlatformDefinition(value: unknown): value is PlatformDefinition {
  return typeof value === "string" && /^platform:(directory|membership|rules|destination|inbox|task)@(0|[1-9][0-9]*)$/.test(value);
}

const TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;

/** The text of an instant: whole seconds with no fraction, otherwise three digits. One instant has one text. */
export function timeOf(ms: number): Timestamp {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

/** Milliseconds of a timestamp in that one form, or null. A date that does not exist is null. */
export function timeMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = TIME.exec(value);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), Number(m[7] ?? 0));
  return Number.isFinite(ms) && timeOf(ms) === value ? ms : null;
}

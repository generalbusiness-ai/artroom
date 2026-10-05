/**
 * Guards for the identifiers the contract names (scope contract, sections
 * 2.1, 3, 4.1, 4.3 and 6.1), beside `isDigest`, `isScopeId` and
 * `isIncarnation`. Each is a pure function, and each identifier has its one
 * guard here: no other package tests these forms with a pattern of its own.
 * A timestamp's one guard is derive's `timeMs`, with the clock rules.
 */

import type { DutyId, KeyId, MemberId, OperationId, PlatformDefinition, ScopeKind } from "@generalbusiness/artroom-contract";
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

/** One send of one entry: `seq.n`, each a whole number in its one decimal form. */
export function isDutyId(value: unknown): value is DutyId {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,15})\.(0|[1-9][0-9]{0,15})$/.test(value);
}

/** A definition the platform supplies in code: `platform:<name>@<version>`. */
export function isPlatformDefinition(value: unknown): value is PlatformDefinition {
  return typeof value === "string" && /^platform:(directory|membership|rules|destination|inbox|task)@(0|[1-9][0-9]*)$/.test(value);
}

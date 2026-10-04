/**
 * The four answers to a submitted act (scope contract, section 4.2) and every
 * reason the contract names.
 */

import type { Digest } from "./scope.ts";
import type { Receipt } from "./entry.ts";

/**
 * Why a judged input was refused. These are the reasons the contract names
 * (sections 6.3, 6.4 and 9.2). It names none for a failed guard or for
 * missing authority; the derivation step adds those.
 */
export type RefusalReason = "revision-moved" | "alias" | "duplicate-relation" | "required-unset" | "scope-full";

/** Why an input was not judged. A retry is judged again (sections 4.2, 5.2, 5.3 and 6.5). */
export type UnavailableReason = "dependency-unavailable" | "busy" | "clock-behind" | "scope-provisional" | "guard-incomplete" | "unavailable";

/** The same key and actor are on a sealed entry with another intent digest. */
export type MismatchReason = "idempotency-mismatch";

/** Why a read gave no value (section 9.1). */
export type ReadRefusal = "not-found" | "wrong-incarnation" | "forbidden" | "scope-provisional" | "unsupported-definition" | "history-unavailable" | "too-large" | "unavailable";

/** A delivery that failed a source check. Nothing is recorded (sections 7.2 and 7.4). */
export type DeliveryRefusal = "source-unverified";

/** How the resolver of a name refuses to route to it (section 7.4). */
export type RoutingRefusal = "wrong-incarnation" | "not-found";

/** Why the validator refuses a definition, as far as the contract names it (section 6.4). */
export type DefinitionRefusal = "genesis-timed";

/** A creator already holds a creation result with another incarnation (section 2.2). */
export type CreationConflict = "incarnation-conflict";

/** The head an answer was judged at. A refusal is a statement about that head only. */
export interface Head { seq: number; hash: Digest }

export type Answer =
  | { answer: "accepted"; receipt: Receipt }
  | { answer: "refused"; reason: RefusalReason; judgedAt: Head }
  | { answer: "unavailable"; reason: UnavailableReason }
  | { answer: "mismatch"; reason: MismatchReason };

/**
 * The four answers to a submitted act (scope contract, section 4.2) and every
 * reason the contract names.
 */

import type { Digest } from "./scope.ts";
import type { Receipt } from "./entry.ts";

/**
 * Why a judged input was refused. The first line holds the reasons the
 * contract names (sections 6.3, 6.4 and 9.2). It names none for a failed
 * guard, for missing authority or for an input that names nothing the scope
 * has; the rest are the derivation step's names for those.
 */
export type RefusalReason =
  | "revision-moved" | "alias" | "duplicate-relation" | "required-unset" | "scope-full"
  | "bad-intent"        // the signature, the shape, `expected` or `notAfter` is not what an intent must be
  | "misaddressed"      // `to` is not this scope and incarnation
  | "expired"           // the commit clock is at or past `notAfter`
  | "scope-refused"     // the scope's genesis was refused; it admits nothing
  | "unknown-act"       // the kind is not an act of the definition, or is its genesis act
  | "bad-field"         // a field is unknown, missing or not a value of its type
  | "no-item"           // `on`, an `also` field or an item field names no item of that type
  | "final"             // a transition of an item in a final state
  | "fact-mismatch"     // a fact field names this scope, and the hash it gives is not the hash of this scope's entry at that position
  | "unauthorized"      // no presented grant is current and covers the action, the key and the scope
  | "guard-failed"      // a guard does not hold on a completed evaluation. When the guard declares a `reason`, the refusal carries it as its name
  | "capability-refused" // a capability guard does not hold. The name is the refusal that the capability declares for it (section 6.11)
  | "slot-full"         // a party list would pass its `max`
  | "type-full"         // an opening would pass the type's `max` of live items, or a first relationship update the `copies` of its handler
  | "entry-too-large"   // the entry would pass a bound of section 7.5. The name is the bound's. Nothing is truncated (section 4.2). The source answers it for the bound on derived effects only
  | "send-unresolved"   // a send's target or item resolves to nothing
  | "unknown-message"   // a delivered request names no handler of the definition for a scope of that kind
  | "unsupported-definition" // a guard that is a mark of a platform definition refuses bytes that are no definition this runtime can pin, where its specification states it (sections 4.2 and 6.1)
  | "bad-input";        // a diagnosis, outcome or checkpoint that does not follow from the scope's state

/**
 * Why an input was not judged. A retry is judged again (sections 4.2, 5.2, 5.3 and 6.5). `authority-unavailable`: an act needs
 * a grant, and nothing about its signer was read that the commit can judge on (sections 4.2, check 9, and 16.1).
 */
export type UnavailableReason = "dependency-unavailable" | "busy" | "clock-behind" | "scope-provisional" | "guard-incomplete" | "authority-unavailable" | "unavailable";

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
  | { answer: "refused"; reason: RefusalReason; name?: string; judgedAt: Head }   // `name`: the `reason` that the failed guard declares, if it declares one
  | { answer: "unavailable"; reason: UnavailableReason }
  | { answer: "mismatch"; reason: MismatchReason };

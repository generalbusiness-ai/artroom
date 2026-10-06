/**
 * The intent an actor signs, and the byte domains (scope contract, section
 * 2.1).
 */

import type { Base64Url, FactRef, KeyId, MemberRef, ScopeRef, Timestamp } from "./scope.ts";

/**
 * Every digest and signature is over one of these tags, a newline, and the
 * RFC 8785 canonical JSON of one value. No value contains its own digest.
 */
export const DOMAINS = {
  intent: "artroom-intent-1",
  seed: "artroom-seed-1",
  entry: "artroom-entry-1",
  message: "artroom-message-1",
  delivery: "artroom-delivery-1",
  definition: "artroom-definition-1",
  text: "artroom-text-1",            // a text, as one JSON string: the digest that names a detached text (section 6.2)
  snapshot: "artroom-snapshot-1",    // a list of `{ ref, target }` pairs, in byte order of `ref`: the digest of a snapshot of staged refs that an ancestry record names (section 16.4)
} as const;

export type DomainTag = (typeof DOMAINS)[keyof typeof DOMAINS];

/**
 * A value of one field type of section 6.2. Text, enum, time, digest, commit
 * and tree values are strings; an `int` and a local `item` are numbers; a
 * record is its named values. The value of a detached text is its digest.
 */
export type FieldValue = string | number | boolean | MemberRef | FactRef | ScopeRef | readonly FieldValue[] | FieldRecord;
/** A value of a `record` type: each member that is present, by its name. A member that is absent has no key. */
export interface FieldRecord { readonly [member: string]: FieldValue }

export interface Intent {
  v: 1;
  to: ScopeRef | null;          // null only when founding a repository
  actor: KeyId;
  kind: string;
  on: number | null;            // the item the act is on, by its local ID
  expected: Record<string, number>;   // revision of each item the act names
  fields: Record<string, FieldValue>;
  idempotencyKey: string;
  notAfter: Timestamp;          // proposed: at most 15 minutes after signing
}

/** The signature is over the intent in the `artroom-intent-1` domain, by `intent.actor`. */
export interface SignedIntent { intent: Intent; sig: Base64Url }

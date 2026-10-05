/**
 * What a scope records: one entry for each input, with what the fold derives
 * from it, and the views built after an entry is sealed (scope contract,
 * section 4.1). The `Entry` type has no field for its own hash.
 */

import type { Digest, FactRef, Incarnation, MemberRef, OperationId, PlatformDefinition, ScopeId, ScopeRef, Seed, Grant, Timestamp } from "./scope.ts";
import type { FieldValue, SignedIntent } from "./intent.ts";
import type { RefusalReason } from "./result.ts";
import type { CapabilityName } from "./capability.ts";
import type { Evidence } from "./evidence.ts";

export interface Entry {
  v: 1;
  at: ScopeRef;
  seq: number;                 // 0 for genesis, then +1
  prev: Digest | null;
  time: Timestamp;             // section 5.3
  clamped: boolean;            // section 5.3
  epoch: 0;
  input: Input;                // exactly one
  uses: readonly FactUse[];    // foreign entries read while judging
  prepared: readonly Prepared[];   // each rule evaluated: name, input digest, result
  effects: readonly Effect[];  // derived
  sends: readonly Send[];      // derived; each has an ordinal n
}

/**
 * Why a refused delivery was refused (section 4.2): a code and, where one
 * exists, a name. The name is the `reason` that the failed guard declares.
 * The deciding entry records it, and its result carries the same value to
 * the sender.
 */
export interface Reason { code: RefusalReason; name?: string }

export type Input =
  | { type: "genesis"; seed: Seed; inc: Incarnation;
      kind: string;                             // the genesis act of the pinned definition (section 4.1)
      founding: SignedIntent | null;            // a repository's directory only
      source: FactRef | null; n: number | null; // the creator's entry and send, for a child
      message: Request | null;                  // the creation request, for a child
      decision: "applied" | "refused" }
  | { type: "act"; signed: SignedIntent; authority: readonly Grant[];   // the one grant judged
      presented: Record<string, FactRef> }      // the facts presented beside the intent, by the names the act declares (section 6.4)
  | { type: "delivery"; from: FactRef; n: number; message: Request;
      decision: "applied" | "refused" | "superseded"; reason?: Reason }
  | { type: "delivery"; from: FactRef; n: number; message: Result;
      clause: "applied" | "refused" | "superseded" | "conflict" }
  | { type: "delivery"; from: FactRef; n: number; message: Control }
  | { type: "delivery"; from: FactRef; n: number; message: Advisory }
  | { type: "diagnosis"; of: { seq: number; n: number };
      finding: "undelivered" | "delivery-unavailable";
      attempts: readonly Attempt[] }            // section 7.4
  | { type: "timed"; item: number; rule: string; due: Timestamp }
  | { type: "outcome"; operation: OperationId; attempt: number;
      result: "confirmed" | "refused" | "unknown"; evidence: Evidence }   // section 4.3
  | { type: "checkpoint"; through: number; state: Digest };

/**
 * A preparation entry (section 4.1; 5.5): the signed intent that asks for a
 * capability's step, the one grant judged, the capability and the step. It is
 * not yet a member of `Input`: a replay's switch over the input's type
 * (`replay/src/verify.ts`) has no case for it, and the step that adds one
 * joins this type to `Input` (I3 deltas, entry E5).
 */
export interface PreparationInput {
  type: "preparation";
  signed: SignedIntent;
  authority: readonly Grant[];   // the one grant judged
  capability: CapabilityName;
  step: string;
}

/** The four classes of message (section 7.4). Only a request has a result. */
export type Message = Request | Result | Control | Advisory;
export interface Request  { class: "request";  type: "create" | "tell" | "relate"; body: unknown }
export interface Result   { class: "result";   of: { from: FactRef; n: number };
                            outcome: "applied" | "refused" | "superseded"; reason?: Reason }
export interface Control  { class: "control";  type: "confirm"; genesis: FactRef }
export interface Advisory { class: "advisory"; type: "index" | "notify"; body: unknown }

/** One dispatch of a send and how it was answered. "none": no answer, or no recorded completion. */
export interface Attempt  { at: Timestamp; answer: "none" | "wrong-incarnation" | "not-found" | "retry" }

export interface FactUse { fact: FactRef; content: Digest }

/** One rule expression evaluated in preparation (section 5.2, step 5). */
export interface Prepared { rule: string; input: Digest; result: boolean }

/**
 * In a message, `self` is not expanded by the sender: the receiver reads it as
 * the envelope's `from` (section 6.4). This is its form on the wire.
 */
export interface SelfMark { self: true }

/** A creation is addressed by a seed and names no incarnation (section 7.2). */
export interface Send { n: number; to: ScopeRef | Seed; message: Message }

/**
 * One derived change. The contract does not spell this union out; it is the
 * smallest set the effect forms of section 6.6 and the platform's own entries
 * can produce, with the record that an attempt of an outside operation was
 * opened, which an outcome needs (section 4.3). `item` is always a local ID: the `seq` of the entry that
 * opened the item.
 */
export type Effect =
  | { effect: "open"; item: number; type: string; state: string }
  | { effect: "state"; item: number; state: string }
  | { effect: "party"; item: number; slot: string; member: MemberRef | null }
  | { effect: "ref"; item: number; slot: string; to: FieldValue | null }
  | { effect: "value"; item: number; slot: string; value: FieldValue | null }
  | { effect: "list"; item: number; slot: string; change: "add" | "remove"; member: MemberRef }
  | { effect: "hold"; item: number; change: "open" | "renew" | "end"; epoch: number }   // section 6.8
  | { effect: "redact"; item: number; slot: string; texts: readonly Digest[] }          // the entry is the tombstone of those texts; section 6.6
  | { effect: "relation"; owner: ScopeRef; item: number; name: string; state: string; revision: number }   // the owner's item; section 7.3
  | { effect: "record"; capability: CapabilityName; kind: string; key: readonly FieldValue[];
      state: string; values: Record<string, unknown> }                                  // one change of a capability's record; section 6.11
  | { effect: "activate" }                                                              // section 7.2
  | { effect: "operation"; operation: OperationId; attempt: number }                    // opens an operation's next numbered attempt; section 4.3
  | { effect: "index"; from: FactRef; fields: Record<string, FieldValue> }              // a projection row in the directory
  | { effect: "attention"; item: number; members: readonly MemberRef[]; reason: string };

// Views of an entry, built after sealing. None is part of the entry's bytes (section 3, point 5).

/** One send of one entry: `seq.n`. */
export type DutyId = `${number}.${number}`;
export interface Envelope { to: ScopeId; from: FactRef; n: number; message: Message }
export interface Receipt { fact: FactRef; definition: Digest | PlatformDefinition;
                           intent: Digest | null; effects: readonly Effect[];
                           sends: readonly DutyId[]; epoch: 0 }

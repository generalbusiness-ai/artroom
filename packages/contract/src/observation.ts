/**
 * An observation of membership, and the freshness proof that an entry
 * retains (scope contract, section 16.1; authority note, section 3.3). Types
 * only. The shape is the authority note's proposal, adopted by the contract
 * as the type of the member `fresh` of a grant. The windows, the guards and
 * what a replay derives from these are not stated here: they are sections
 * 3.3 and 3.12 of the authority note and section 9.3 of the contract.
 */

import type { Head } from "./result.ts";
import type { KeyId, MemberId, PlatformDefinition, ScopeFilter, ScopeRef, Timestamp } from "./scope.ts";

/** The scope's run: random, chosen when its process starts and held in memory (section 16.1). */
export type RunId = string;

/** One key's whole standing in the membership scope, at one head of it (section 16.1). */
export interface Observation {
  of: ScopeRef;                    // the membership scope, with its incarnation
  head: Head;                      // the membership head that was read
  key: KeyId;
  keyState: "active" | "retired" | "compromised" | "unknown";
  member: MemberId;
  memberState: "active" | "removed";
  role: string;
  actions: readonly string[];      // what the role holds, by the role table at that head
  within: ScopeFilter;             // where: every scope of this repository. Its `membership` equals `of`
  controller: MemberId | null;     // for an agent
  controllerActive: boolean | null;
  notAfter: Timestamp | null;      // an end time on the grant, if it has one
  definition: PlatformDefinition;  // the membership definition's version
  at: Timestamp;                   // the observer's clock when the read began
}

/** An observation with the read it came from and how the entry used it (section 16.1). It is `Grant.fresh`. */
export interface ObservationUse {
  observation: Observation;
  read: { run: RunId; n: number };         // the scope's run, and the read's number in that run
  use: "fresh" | "reused";
  prior: Head | null;                      // for "reused": the latest earlier entry of this scope that retains this read
}

/**
 * What a scope asks its membership scope, before its turn: the standing of
 * one key (authority note, section 3.3, step 2). `of` is the membership
 * scope as the asking scope records it, with its incarnation. It states
 * no other member, and names no asker: membership could not check who
 * asks, and answers the same for every scope of its repository (section
 * 16.1, "The form of `within`, and of the read"; I3 deltas, entry ED1).
 */
export interface ObservationRequest { of: ScopeRef; key: KeyId }

/**
 * What membership answers, from its head (authority note, section 3.3, step
 * 3): the observation without `at`. That member is the asking scope's own
 * clock when its read began, which membership does not know.
 */
export type ObservationAnswer = Omit<Observation, "at">;

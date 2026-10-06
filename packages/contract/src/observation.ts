/**
 * An observation of membership, and the freshness proof that an entry
 * retains (scope contract, section 16.1; authority note, section 3.3). Types
 * only. The shape is the authority note's proposal, adopted by the contract
 * as the type of the member `fresh` of a grant. The windows, the guards and
 * what a replay derives from these are not stated here: they are sections
 * 3.3 and 3.12 of the authority note and section 9.3 of the contract.
 */

import type { Head } from "./result.ts";
import type { Digest, KeyId, MemberId, PlatformDefinition, ScopeFilter, ScopeRef, Timestamp } from "./scope.ts";

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

/**
 * The standing of one member, with no key (section 16.1, "An observation
 * outside a grant"; authority note, section 3.3, "The three kinds of
 * observation"). A fixed record, with exactly its members. It stands only in
 * the member `observed` of an input.
 */
export interface MemberObservation {
  subject: "member";
  of: ScopeRef;                    // the membership scope, with its incarnation
  head: Head;                      // the membership head that was read
  member: MemberId;
  memberState: "active" | "removed" | "unknown";   // "unknown": membership holds no such member at that head
  role: string | null;             // null when the state is "unknown"
  activeKey: boolean | null;       // whether the member has at least one active key at that head
  controller: MemberId | null;     // for an agent
  controllerActive: boolean | null;
  definition: PlatformDefinition;
  at: Timestamp;                   // the observer's clock when the read began
}

/**
 * What the rules scope holds at one head: one of two fixed records, by what
 * the reader asked for (section 16.1).
 *
 * `singleControllerException` (revision 19, "The declaration of the
 * single-controller exception"; source row I3-36): under a rules
 * definition whose item `rules` states a value of that name, the record
 * that was asked as "rules" holds the member, always, and it is false when
 * the repository never set it. Under a rules definition whose data does
 * not state the value the record has no such member. The observation
 * states its `definition`, so a reader knows which to expect. A reader
 * takes anything but `true` as no declaration.
 *
 * `extents` (revision 20, "The extents, in an observation of the rules";
 * source row I3-43): under a rules definition whose item `rules` states a
 * slot of that name, the record that was asked as "rules" holds the digest
 * of the list as that slot holds it, in a byte domain that the rules
 * definition declares. The list itself is a retained input of the kind
 * `value`, which the rules scope gives beside its answer. Under a rules
 * definition whose data states no such slot the record has no such member.
 *
 * The two members are optional in this one type, which writes two fixed
 * records. The check of the record is exact: each is present exactly when
 * the data of the observation's `definition` states it (derive's
 * `contentStates`).
 */
export type RulesContent =
  | { asked: "rules"; approvals: number; ownerMayReview: boolean;
      checks: readonly { name: string; configuration: Digest; required: boolean; checker: MemberId }[];
      labels: readonly string[];
      singleControllerException?: boolean;
      extents?: Digest }
  | { asked: "definitions"; active: readonly { digest: Digest; name: string }[] };

/** An observation of the rules scope (section 16.1). It stands only in the member `observed` of an input. */
export interface RulesObservation {
  subject: "rules";
  of: ScopeRef;                    // the rules scope, with its incarnation
  head: Head;                      // the head of the rules scope that was read
  revision: number;                // the position of the latest `publish` at that head; 0 when there is none
  content: RulesContent;
  definition: PlatformDefinition;
  at: Timestamp;
}

/**
 * The members who hold one action, at one head of membership (revision 20,
 * section 16.1, "An observation of the holders of one action"; source row
 * I3-42). A fixed record, with exactly its members. A member holds an
 * action when it is active, has an active key, and an `Observation` of that
 * key at that head would list the action. `count` is how many hold it.
 * `holders` is the first of them, in byte order of member ID: all of them,
 * or as many as the request's `most` when `count` is higher. Its subject,
 * for the order of heads, is the action, of the observed scope. The count
 * permits nothing. It stands only in the member `observed` of an input.
 */
export interface HoldersObservation {
  subject: "holders";
  of: ScopeRef;                    // the membership scope, with its incarnation
  head: Head;                      // the membership head that was read
  action: string;
  count: number;
  holders: readonly MemberId[];
  definition: PlatformDefinition;
  at: Timestamp;
}

/**
 * An observation with the read it came from and how the entry used it
 * (section 16.1). It is `Grant.fresh`, where its observation is an
 * `Observation`, of the signing key. It is also a record of the member
 * `observed` of an act, of an outcome and of a delivery of a result
 * (section 4.1), where its observation is of another key, of a member or of
 * the rules, or of the holders of an action.
 */
export interface ObservationUse {
  observation: Observation | MemberObservation | RulesObservation | HoldersObservation;
  read: { run: RunId; n: number };         // the scope's run, and the read's number in that run
  use: "fresh" | "reused";
  prior: Head | null;                      // for "reused": the latest earlier entry of this scope that retains this read
}

/**
 * What a scope asks of the scope that it observes, before its turn (section
 * 16.1, "The form of `within`, and of the read"; authority note, section
 * 3.3, step 2): the standing of one key, the standing of one member, or
 * what the rules scope holds. `of` is the observed scope as the asking
 * scope records it, with its incarnation. A request states no other member,
 * and names no asker: the observed scope could not check who asks, and
 * answers the same for every scope of its repository (I3 deltas, entry ED1).
 *
 * A rules scope and a destination record the ID of the scope that they
 * observe and, before their first retained observation, no incarnation.
 * Their first read asks by the scope ID alone (authority note, revision 25,
 * section 12.1, "The first read"): `of` then has no member `inc`, and the
 * answer's `of` holds the incarnation of the scope that answered (I3
 * deltas, entry EY7).
 */
export type ObservedScope = ScopeRef | Pick<ScopeRef, "scope" | "kind">;
export type ObservationRequest =
  | { of: ObservedScope; key: KeyId }
  | { of: ObservedScope; member: MemberId }
  | { of: ObservedScope; asked: "rules" | "definitions" }
  | { of: ObservedScope; holders: string; most: number };   // revision 20: the holders of one action, and how many IDs the answer may list

/**
 * What the observed scope answers, from its head (authority note, section
 * 3.3, step 3): the observation without `at`. That member is the asking
 * scope's own clock when its read began, which the observed scope does not
 * know.
 */
export type ObservationAnswer = Omit<Observation, "at"> | Omit<MemberObservation, "at"> | Omit<RulesObservation, "at"> | Omit<HoldersObservation, "at">;

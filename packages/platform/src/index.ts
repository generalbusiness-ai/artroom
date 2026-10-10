/**
 * Artroom's platform definitions (authority note, section 12.1): the data of
 * each, as a `PlatformData` whose name is the platform name without its
 * version, and the table of the rules that no form can say. The data holds
 * a mark at each place where a rule is run. This package reads no clock, no
 * storage and no network. It holds no lane.
 *
 * Only the data of this package is validated with the platform option of
 * the validator. A definition that came from an input is validated without
 * it.
 */

import { APPLICATION_COHORT, directory5, directoryRules5 } from "./application.ts";
export { APPLICATION_COHORT, APPLICATION_VALUES_BYTES, applicationValues, directory5, directoryRules5 } from "./application.ts";
import { COUNTING_COHORT, directory6, directoryRules6 } from "./counting-cohort.ts";
export { COUNTING_COHORT, directory6, directoryRules6 } from "./counting-cohort.ts";

import type { ObservationRequest, PlatformData, PlatformDefinition } from "@generalbusiness/artroom-contract";
import { destination, destination2, destination3, destinationMembership, destinationRules, destinationRules2, destinationRules3, destinationRulesScope } from "./destination.ts";
import { inbox, inboxRules } from "./inbox.ts";
import { MEMBERSHIP, MEMBERSHIP_1, membership, membership5, membershipRules, standingOf } from "./membership.ts";
import { register, registerRules } from "./register.ts";
import { directory, directory2, directory3, directoryMembership, directoryRules, directoryRulesScope } from "./directory.ts";
import type { RecordedRef, Rules, StateView } from "@generalbusiness/artroom-derive";
import { RULES } from "./rules.ts";
import { PUBLISH, RULES_SCOPE, RULES_SCOPE_1, rulesAnswer, rulesMembership, rulesObservedValues, rulesScope, rulesScope2, rulesScope3, rulesScopeRules, rulesScopeRules3 } from "./rules-scope.ts";

export { inbox, membership, membership5, register, directory, directory2, destination, destination2 };
export { isOf, pinnedBy, pinnedOf, versionOf } from "./versions.ts";
export { ACTIONS_MOST, FIRST_ACTIONS, FIRST_ACTIONS_OF, MEMBERSHIP, MEMBERSHIP_1, NO_MEMBER, ROLE_LISTS, ROLE_TABLE, ROLE_TABLE_OF, actionsIn, isActions, isHandle, standingOf, type Role } from "./membership.ts";
export { CREATION_ATTEMPTS, DIRECTORY_OF, REGISTER, REPOSITORY, directoryIdOf, directorySeed, registerRules, repositoryName } from "./register.ts";
export { DEFINITION_DOMAIN, DIRECTORY, IMPORT_ATTEMPTS, SEEN, SIBLINGS_OF, directoryMembership, directoryRules, directoryRulesScope } from "./directory.ts";
export { COLLECT_MOST, DESTINATION, DESTINATION_1, DESTINATION_ATTEMPTS, DESTINATION_KINDS, READ_TOKEN_HOURS, destinationMembership, destinationRulesScope, destinationReceipt, firstHeadCommit, foundingOf, revokedToken } from "./destination.ts";
export { foundingObjects, readmeText, receiptObjects, receiptRef, importRef, type Readme, type DestinationObject, type DestinationCommit, type ObjectFormat } from "./destination-objects.ts";
export { EDIT_PATH_BYTES, editCommit, editObjects, editPath, editTree, manifestCommit } from "./destination-objects.ts";
export { PROPOSE_FILE, fileOf, sourcesOf, manifestFiles } from "./destination-reading.ts";
export type { LaneRead } from "./destination.ts";
// The host port reads the same recorded operation context as the rules.
export { branchOf as destinationBranch, mintOf as destinationMint, servedBy as destinationWrite, statementOf as destinationStatement, targetOf as destinationTarget, writeSends as destinationSends, readFor as destinationRead } from "./destination.ts";
export { mintRevoked as destinationRevokedMint } from "./destination.ts";
export { DESTINATION_CHANGED_SET, NOT_RESERVED, fileSound, isJudgeChanges, isJudgeEvidence, isRecordedJudgeEvidence, judgeReservation, type EditFile } from "./reservation.ts";
export type { JudgeChanges, JudgeEvidence, RecordedJudgeEvidence, Reservation, ReservationAsked, ReservationRead, Statement } from "./reservation.ts";
export { RULES };
export { rulesScope };
export { CONFIGURATION_BYTES, CONFIGURATION_DOMAIN, PUBLISH, RULES_EXTENTS_VALUE, RULES_SCOPE, RULES_SCOPE_1, extentsOf, membershipId, referenceOf, revisionOf, rulesAnswer, rulesMembership, rulesObservedValues } from "./rules-scope.ts";
export type { PlatformName, RuleTable } from "./rules.ts";
export { CONTROLLER, EXTENTS_MOST, EXTENT_CLASSES, LANDING, RULES_EXTENT, RULES_PATTERNS, classify, firstExtents, holdsRulesExtent, isExtents, judgeExtents, matches } from "./extents.ts";
export type { Extent, ExtentClass, ExtentJudged, ExtentsAsked, ExtentsJudged, Holder, Lack, Review, Touched, TreeLink } from "./extents.ts";

/**
 * One version of a platform definition, as a runtime or a verifier is
 * supplied it: its data, and its rules by the name that a mark states (the
 * contract's revision 15, section 6.1). Both parts belong to the one name
 * and version.
 */
export interface Platform {
  readonly data: PlatformData;
  readonly rules: Rules;
  /**
   * What a scope under this version answers to an observation read, from
   * its folded state at one head (authority note, section 3.3): a pure
   * function of the state and the request. It is code of the version, as
   * its rules are, so a replay derives the value of a retained observation
   * with it, from the observed scope's history at the recorded head (the
   * contract's section 16.1, "Replay"). Absent: a scope under this version
   * answers no observation.
   */
  readonly observed?: (state: StateView, asked: ObservationRequest) => unknown;
  /** Bounded values named by the observation, derived at the same head. The observation itself stays the replay's pure value. */
  readonly observedValues?: (state: StateView, asked: ObservationRequest) => readonly { domain: string; bytes: string }[];
  /**
   * The kind of the act whose position is the `revision` that an answer of
   * this version states (authority note, revision 28, section 12.1.4, "What
   * a replay derives"): for a rules scope, `publish`. A replay checks that
   * the revision of an answer at a head is the position of the last entry
   * of that kind at or before the head, or 0 where there is none. Absent:
   * an answer of this version states no revision.
   */
  readonly revised?: string;
  /**
   * Where a scope under this version records its membership reference,
   * when that is not its genesis entry (authority note, section 3.3, "Where
   * it records its membership reference"): a pure function of its folded
   * state. A replay reads the reference with it, as the production
   * authority does. Absent: the genesis entry holds it. A directory holds
   * it in a slot, with its incarnation. A rules scope and a destination
   * hold the scope ID, and no incarnation before their first retained
   * observation (section 12.1, decided in revision 25).
   */
  readonly membership?: (state: StateView) => RecordedRef | null;
  /**
   * Where a scope under this version records its rules reference: the
   * rules scope that it observes (the contract's section 16.1, guard 1). A
   * destination holds the scope ID in the value `branch.rules`, and no
   * incarnation before its first retained observation of the rules
   * (authority note, section 12.1, the same table). Absent: no text states
   * where a scope under this version records one.
   */
  readonly rulesScope?: (state: StateView) => RecordedRef | null;
}

/**
 * Every version of every platform definition that this package has
 * shipped, by its pinned name (the planner's decision of 2026-10-07: a
 * changed definition carries a new version, and a scope is judged and
 * replayed by the version that its genesis pinned, for as long as it
 * exists). Version 1 here preserves actual main1eed91aa's supported data,
 * including the definition-byte places gate1 shipped. This table does not
 * establish original historical admission/source chronology. Version 2 of
 * the register, directory, membership, rules and destination keeps the I5
 * child cohort, version-named observations, the destination's read-token
 * and its role row, and a founding commit with a README. The inbox has
 * one version. A version that is not listed here is one that this package
 * cannot run.
 */
export const VERSIONS: Readonly<Record<string, Platform>> = {
  "platform:inbox@1": { data: inbox, rules: inboxRules },
  [APPLICATION_COHORT.register]: { data: register, rules: registerRules },
  [APPLICATION_COHORT.directory]: { data: directory5, rules: directoryRules5, membership: directoryMembership, rulesScope: directoryRulesScope },
  [APPLICATION_COHORT.membership]: { data: membership, rules: membershipRules, observed: (state, asked) => standingOf(state, asked, APPLICATION_COHORT.membership) },
  [APPLICATION_COHORT.rules]: { data: rulesScope3, rules: rulesScopeRules3, observed: (state, asked) => rulesAnswer(state, asked, APPLICATION_COHORT.rules), observedValues: rulesObservedValues, revised: PUBLISH, membership: rulesMembership },
  [COUNTING_COHORT.register]: { data: register, rules: registerRules },
  [COUNTING_COHORT.directory]: { data: directory6, rules: directoryRules6, membership: directoryMembership, rulesScope: directoryRulesScope },
  [COUNTING_COHORT.membership]: { data: membership5, rules: membershipRules, observed: (state, asked) => standingOf(state, asked, COUNTING_COHORT.membership) },
  "platform:register@1": { data: register, rules: registerRules },
  "platform:register@2": { data: register, rules: registerRules },
  "platform:register@3": { data: register, rules: registerRules },
  "platform:directory@1": { data: directory, rules: directoryRules, membership: directoryMembership, rulesScope: directoryRulesScope },
  "platform:directory@2": { data: directory2, rules: directoryRules, membership: directoryMembership, rulesScope: directoryRulesScope },
  "platform:directory@3": { data: directory3, rules: directoryRules, membership: directoryMembership, rulesScope: directoryRulesScope },
  "platform:membership@1": { data: membership, rules: membershipRules, observed: (state, asked) => standingOf(state, asked, MEMBERSHIP_1) },
  "platform:membership@2": { data: membership, rules: membershipRules, observed: (state, asked) => standingOf(state, asked, MEMBERSHIP) },
  "platform:rules@1": { data: rulesScope, rules: rulesScopeRules, observed: (state, asked) => rulesAnswer(state, asked, RULES_SCOPE_1), observedValues: rulesObservedValues, revised: PUBLISH, membership: rulesMembership },
  "platform:rules@2": { data: rulesScope2, rules: rulesScopeRules, observed: (state, asked) => rulesAnswer(state, asked, RULES_SCOPE), observedValues: rulesObservedValues, revised: PUBLISH, membership: rulesMembership },
  "platform:destination@1": { data: destination, rules: destinationRules, membership: destinationMembership, rulesScope: destinationRulesScope },
  "platform:destination@2": { data: destination2, rules: destinationRules2, membership: destinationMembership, rulesScope: destinationRulesScope },
  "platform:destination@3": { data: destination3, rules: destinationRules3, membership: destinationMembership, rulesScope: destinationRulesScope },
};

/** Existing default founding cohort. Supporting application scopes require explicit APPLICATION_COHORT pins. */
export const NEWEST: Readonly<Record<string, PlatformDefinition>> = {
  "platform:inbox": "platform:inbox@1", "platform:membership": MEMBERSHIP, "platform:register": "platform:register@3", "platform:directory": "platform:directory@3", "platform:rules": RULES_SCOPE, "platform:destination": "platform:destination@3",
};

/** The data of the newest version of each platform definition, by name without the version. */
export const definitions: Readonly<Record<string, PlatformData>> = Object.fromEntries(Object.entries(NEWEST).map(([name, named]) => [name, VERSIONS[named]!.data]));

/**
 * The definition that a platform name and version pin (the contract's
 * section 6.1), such as `platform:inbox@1` or `platform:destination@2`.
 * Null: this package holds no definition of that name and version.
 */
export function platform(named: string): Platform | null {
  return Object.hasOwn(VERSIONS, named) ? VERSIONS[named]! : null;
}

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

import type { ObservationRequest, PlatformData, PlatformDefinition } from "@generalbusiness/artroom-contract";
import { destination, destinationMembership, destinationRulesScope } from "./destination.ts";
import { inbox } from "./inbox.ts";
import { membership, standingOf } from "./membership.ts";
import { register } from "./register.ts";
import { directory, directoryMembership, directoryRulesScope } from "./directory.ts";
import type { RecordedRef, Rules, StateView } from "@generalbusiness/artroom-derive";
import { RULES } from "./rules.ts";
import { PUBLISH, rulesAnswer, rulesMembership, rulesObservedValues, rulesScope } from "./rules-scope.ts";
import { destination2, destinationRules2 } from "./future-2/destination.ts";
import { directory2, directoryRules as directoryRules2 } from "./future-2/directory.ts";
import { membership as membership2, membershipRules as membershipRules2, standingOf as standingOf2 } from "./future-2/membership.ts";
import { register as register2, registerRules as registerRules2 } from "./future-2/register.ts";
import { rulesScope2, rulesScopeRules as rulesScopeRules2, rulesAnswer as rulesAnswer2, rulesObservedValues as rulesObservedValues2 } from "./future-2/rules-scope.ts";

export { inbox, membership, register, directory, destination };
export { destination2, directory2, membership2, register2, rulesScope2 };
export { isOf, pinnedBy, pinnedOf, versionOf } from "./versions.ts";
export { DIRECTORY_OF } from "./future-2/register.ts";
export { SIBLINGS_OF } from "./future-2/directory.ts";
export { FIRST_ACTIONS_OF, ROLE_TABLE_OF } from "./future-2/membership.ts";
export { READ_TOKEN_HOURS, foundingOf } from "./future-2/destination.ts";
export { readmeText, type Readme } from "./future-2/destination-objects.ts";

export { ACTIONS_MOST, FIRST_ACTIONS, MEMBERSHIP, NO_MEMBER, ROLE_LISTS, ROLE_TABLE, actionsIn, isActions, isHandle, standingOf, type Role } from "./membership.ts";
export { CREATION_ATTEMPTS, REGISTER, REPOSITORY, directoryIdOf, directorySeed, registerRules, repositoryName } from "./register.ts";
export { DEFINITION_DOMAIN, DIRECTORY, IMPORT_ATTEMPTS, SEEN, directoryMembership, directoryRules, directoryRulesScope } from "./directory.ts";
export { COLLECT_MOST, DESTINATION, DESTINATION_ATTEMPTS, DESTINATION_KINDS, destinationMembership, destinationRulesScope, destinationReceipt, firstHeadCommit, revokedToken } from "./destination.ts";
export { foundingObjects, receiptObjects, receiptRef, importRef, type DestinationObject, type DestinationCommit, type ObjectFormat } from "./destination-objects.ts";
export type { LaneRead } from "./destination.ts";
// The host port reads the same recorded operation context as the rules.
export { branchOf as destinationBranch, mintOf as destinationMint, servedBy as destinationWrite, statementOf as destinationStatement, targetOf as destinationTarget, writeSends as destinationSends, readFor as destinationRead } from "./destination.ts";
export { mintRevoked as destinationRevokedMint } from "./destination.ts";
export { DESTINATION_CHANGED_SET, NOT_RESERVED, isJudgeChanges, isJudgeEvidence, isRecordedJudgeEvidence, judgeReservation } from "./reservation.ts";
export type { JudgeChanges, JudgeEvidence, RecordedJudgeEvidence, Reservation, ReservationAsked, ReservationRead, Statement } from "./reservation.ts";
export { RULES };
export { rulesScope };
export { CONFIGURATION_BYTES, CONFIGURATION_DOMAIN, PUBLISH, RULES_EXTENTS_VALUE, RULES_SCOPE, extentsOf, membershipId, referenceOf, revisionOf, rulesAnswer, rulesMembership, rulesObservedValues } from "./rules-scope.ts";
export type { PlatformName, RuleTable } from "./rules.ts";
export { CONTROLLER, EXTENTS_MOST, EXTENT_CLASSES, LANDING, RULES_EXTENT, RULES_PATTERNS, classify, firstExtents, holdsRulesExtent, isExtents, judgeExtents, matches } from "./extents.ts";
export type { Extent, ExtentClass, ExtentJudged, ExtentsAsked, ExtentsJudged, Holder, Lack, Review, Touched, TreeLink } from "./extents.ts";

/** The platform definitions delivered so far, by name without the version. */
export const definitions: Readonly<Record<string, PlatformData>> = { "platform:inbox": inbox, "platform:membership": membership, "platform:register": register, "platform:directory": directory, "platform:rules": rulesScope, "platform:destination": destination };

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

/** Explicit future install selection. Legacy public constants and name-only
 * data/rule facades above retain the native @1 behavior of source0938010b5. */
export const NEWEST: Readonly<Record<string, PlatformDefinition>> = Object.freeze({
  "platform:inbox": "platform:inbox@1", "platform:register": "platform:register@2", "platform:directory": "platform:directory@2", "platform:membership": "platform:membership@2", "platform:rules": "platform:rules@2", "platform:destination": "platform:destination@2",
});

/** Native @1 is one exact source profile, not a historical resolver for every
 * colliding @1 room. Before activation the adopted bundle/provenance and
 * evaluator/port/build correspondence must identify the actual source. */
const CATALOG: Readonly<Record<string, Platform>> = {
  "platform:inbox@1": { data: inbox, rules: RULES["platform:inbox"]! },
  "platform:register@1": { data: register, rules: RULES["platform:register"]! },
  "platform:directory@1": { data: directory, rules: RULES["platform:directory"]!, membership: directoryMembership, rulesScope: directoryRulesScope },
  "platform:membership@1": { data: membership, rules: RULES["platform:membership"]!, observed: standingOf },
  "platform:rules@1": { data: rulesScope, rules: RULES["platform:rules"]!, observed: rulesAnswer, observedValues: rulesObservedValues, revised: PUBLISH, membership: rulesMembership },
  "platform:destination@1": { data: destination, rules: RULES["platform:destination"]!, membership: destinationMembership, rulesScope: destinationRulesScope },
  "platform:register@2": { data: register2, rules: registerRules2 },
  "platform:directory@2": { data: directory2, rules: directoryRules2, membership: directoryMembership, rulesScope: directoryRulesScope },
  "platform:membership@2": { data: membership2, rules: membershipRules2, observed: (state, asked) => standingOf2(state, asked, "platform:membership@2") },
  "platform:rules@2": { data: rulesScope2, rules: rulesScopeRules2, observed: (state, asked) => rulesAnswer2(state, asked, "platform:rules@2"), observedValues: rulesObservedValues2, revised: PUBLISH, membership: rulesMembership },
  "platform:destination@2": { data: destination2, rules: destinationRules2, membership: destinationMembership, rulesScope: destinationRulesScope },
};
/** Freeze only catalog wrappers. Shared native data/rule identities keep their
 * existing behavior; a caller's lookup wrapper must never poison later reads. */
export const VERSIONS: Readonly<Record<string, Platform>> = Object.freeze(Object.fromEntries(Object.entries(CATALOG).map(([named, entry]) => [named, Object.freeze(entry)])));

/** Exact named lookup only. Classification helpers and NEWEST are not fallback
 * execution or authority: an unlisted name/version has no supplied code. */
export function platform(named: string): Platform | null {
  return Object.hasOwn(VERSIONS, named) ? { ...VERSIONS[named]! } : null;
}

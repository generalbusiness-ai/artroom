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

import type { ObservationRequest, PlatformData } from "@generalbusiness/artroom-contract";
import { destination, destinationMembership, destinationRulesScope } from "./destination.ts";
import { inbox } from "./inbox.ts";
import { membership, standingOf } from "./membership.ts";
import { register } from "./register.ts";
import { directory, directoryMembership, directoryRulesScope } from "./directory.ts";
import type { RecordedRef, Rules, StateView } from "@generalbusiness/artroom-derive";
import { RULES } from "./rules.ts";
import { PUBLISH, rulesAnswer, rulesMembership, rulesObservedValues, rulesScope } from "./rules-scope.ts";

export { inbox, membership, register, directory, destination };
export { ACTIONS_MOST, FIRST_ACTIONS, MEMBERSHIP, NO_MEMBER, ROLE_LISTS, ROLE_TABLE, actionsIn, isActions, isHandle, standingOf, type Role } from "./membership.ts";
export { CREATION_ATTEMPTS, REGISTER, REPOSITORY, directoryIdOf, directorySeed, registerRules, repositoryName } from "./register.ts";
export { DEFINITION_DOMAIN, DIRECTORY, IMPORT_ATTEMPTS, SEEN, directoryMembership, directoryRules, directoryRulesScope } from "./directory.ts";
export { COLLECT_MOST, DESTINATION, DESTINATION_ATTEMPTS, DESTINATION_KINDS, destinationMembership, destinationRulesScope, destinationReceipt, firstHeadCommit, revokedToken } from "./destination.ts";
export { foundingObjects, receiptObjects, receiptRef, importRef, type DestinationObject, type DestinationCommit, type ObjectFormat } from "./destination-objects.ts";
export type { LaneRead } from "./destination.ts";
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

/**
 * The definition that a platform name and version pin (the contract's
 * section 6.1), such as `platform:inbox@1`. Every definition here is version
 * 1. Null: this package holds no definition of that name and version.
 */
export function platform(named: string): Platform | null {
  const cut = named.lastIndexOf("@");
  const name = named.slice(0, cut);
  const data = cut > 0 && named.slice(cut) === "@1" && Object.hasOwn(definitions, name) ? definitions[name] : undefined;
  if (!data) return null;
  return { data, rules: Object.hasOwn(RULES, name) ? (RULES as Record<string, Rules>)[name]! : {}, ...(data === membership ? { observed: standingOf } : data === rulesScope ? { observed: rulesAnswer, observedValues: rulesObservedValues, revised: PUBLISH } : {}), ...(data === directory ? { membership: directoryMembership, rulesScope: directoryRulesScope } : data === rulesScope ? { membership: rulesMembership } : data === destination ? { membership: destinationMembership, rulesScope: destinationRulesScope } : {}) };
}

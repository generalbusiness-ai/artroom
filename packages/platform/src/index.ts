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
import { inbox } from "./inbox.ts";
import { membership, standingOf } from "./membership.ts";
import type { Rules, StateView } from "@generalbusiness/artroom-derive";
import { RULES } from "./rules.ts";

export { inbox, membership };
export { MEMBERSHIP, NO_MEMBER, ROLE_LISTS, ROLE_TABLE, actionsIn, standingOf, type Role } from "./membership.ts";
export { RULES };
export type { PlatformName, RuleTable } from "./rules.ts";

/** The platform definitions delivered so far, by name without the version. */
export const definitions: Readonly<Record<string, PlatformData>> = { "platform:inbox": inbox, "platform:membership": membership };

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
  return { data, rules: Object.hasOwn(RULES, name) ? (RULES as Record<string, Rules>)[name]! : {}, ...(data === membership ? { observed: standingOf } : {}) };
}

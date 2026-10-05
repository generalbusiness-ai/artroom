/**
 * Artroom's platform definitions (authority note, section 12.1): the data of
 * each, as a `DeclaredDefinition` whose name is the platform name without its
 * version, and the table of the rules that no form can say. This package
 * reads no clock, no storage and no network. It holds no lane.
 *
 * Only this package validates with the platform option of the validator. A
 * definition that came from an input is validated without it.
 */

import type { DeclaredDefinition } from "@generalbusiness/artroom-contract";
import { inbox } from "./inbox.ts";

export { inbox };
export { RULES } from "./rules.ts";
export type { EntryRules, PlatformName, PlatformRow, PlatformRule, RuleGiven, RuleResult, RuleTable } from "./rules.ts";

/** The platform definitions delivered so far, by name without the version. */
export const definitions: Readonly<Record<string, DeclaredDefinition>> = { "platform:inbox": inbox };

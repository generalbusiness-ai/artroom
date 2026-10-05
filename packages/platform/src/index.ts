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
import { CODE, RULES, type EntryRules, type PlatformRow } from "./rules.ts";

export { inbox };
export { CODE, RULES };
export type { CodeTable, EntryRules, PlatformName, PlatformRow, PlatformRule, RuleGiven, RuleResult, RuleTable } from "./rules.ts";

/** The platform definitions delivered so far, by name without the version. */
export const definitions: Readonly<Record<string, DeclaredDefinition>> = { "platform:inbox": inbox };

/**
 * One platform definition as a runtime or a verifier is supplied it: its
 * data, the rows of each entry that are code, and the rules written for
 * them, both by the entry's kind.
 */
export interface Platform {
  readonly declared: DeclaredDefinition;
  readonly code: Readonly<Record<string, readonly PlatformRow[]>>;
  readonly rules: Readonly<Record<string, EntryRules>>;
}

/**
 * The definition that a platform name and version pin (the contract's
 * section 6.1), such as `platform:inbox@1`. Every definition here is version
 * 1. Null: this package holds no definition of that name and version.
 */
export function platform(named: string): Platform | null {
  const cut = named.lastIndexOf("@");
  const name = named.slice(0, cut);
  const declared = cut > 0 && named.slice(cut) === "@1" && Object.hasOwn(definitions, name) ? definitions[name] : undefined;
  if (!declared) return null;
  const of = <T>(table: object): Readonly<Record<string, T>> => (Object.hasOwn(table, name) ? (table as Record<string, Record<string, T>>)[name]! : {});
  return { declared, code: of(CODE), rules: of(RULES) };
}

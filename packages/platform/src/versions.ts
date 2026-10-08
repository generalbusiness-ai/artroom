/**
 * The versions of a platform definition (the planner's decision of
 * 2026-10-07, "definition versions"). A changed definition carries a new
 * version. A scope pins the version at its genesis, `platform:<name>@<n>`,
 * and is judged and replayed by that version for as long as it exists. This
 * package serves every version that it has shipped, and new scopes are
 * founded on the newest.
 *
 * A rule that must state its own version, such as the owner of an operation
 * that it opens or the definition of a scope that it creates, reads it from
 * the scope's genesis entry (`pinnedBy`). A comparison that only asks
 * whether an operation or a scope is of a definition compares the name
 * without the version (`isOf`).
 */

import type { PlatformDefinition } from "@generalbusiness/artroom-contract";
import { isPlatformDefinition, platformName } from "@generalbusiness/artroom-bytes";
import type { Own, RuleGiven } from "@generalbusiness/artroom-derive";

/** True when the value is a version of the platform definition of that name, such as `platform:destination@2` of `platform:destination`. */
export const isOf = (named: unknown, name: string): named is PlatformDefinition => isPlatformDefinition(named) && platformName(named) === name;

/** The version of a platform definition: the number after its `@`. */
export const versionOf = (named: PlatformDefinition): number => Number(named.slice(named.lastIndexOf("@") + 1));

/**
 * The definition that this scope's genesis pinned: the seed of its genesis
 * entry. In the genesis entry itself it is the input's seed; in any later
 * entry, the seed of the scope's own entry 0.
 */
export function pinnedBy(given: { readonly input: RuleGiven["input"]; readonly own: Own }): PlatformDefinition {
  if (given.input.type === "genesis") return given.input.seed.definition as PlatformDefinition;
  return pinnedOf(given.own);
}

/** The same, from the scope's own entries alone: the seed of its entry 0. */
export function pinnedOf(own: Own): PlatformDefinition {
  const input = own(0)?.entry.input;
  if (input?.type !== "genesis" || !isPlatformDefinition(input.seed.definition)) throw new Error("this scope's genesis entry is not at hand");
  return input.seed.definition;
}

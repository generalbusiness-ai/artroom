/**
 * Rule-input helpers. Ownership is a list of path/owners pairs
 * (`PathOwners` in the contract), never a map keyed by path, so legal paths
 * such as `constructor` or `__proto__` work without widening the profile.
 */

import type { PathOwners, PolicyDocument, Principal, RepoPath, RuleInput, RuleKind } from "@generalbusiness/artroom-contract";
import { matchGlob } from "./glob.ts";

/** The contract's `RuleInput` for one kind. */
export type InputOf<K extends RuleKind> = Extract<RuleInput, { readonly kind: K }>;

/** The owners policy assigns to each path, in the order of `paths` (R-PROP-5). */
export function ownersFor(doc: PolicyDocument, paths: readonly RepoPath[]): PathOwners[] {
  return paths.map((path) => {
    const who = new Set<Principal>();
    for (const [pattern, principals] of Object.entries(doc.owners)) if (matchGlob(path, pattern)) for (const p of principals) who.add(p);
    return { path, owners: [...who] };
  });
}

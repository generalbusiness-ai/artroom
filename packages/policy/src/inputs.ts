/**
 * Rule inputs with a path-safe ownership shape (review dd2a995b P2.1).
 *
 * The contract's `PolicyProposal.owners` is a map keyed by repository path.
 * Legal paths such as `constructor`, `prototype`, `__proto__` and
 * `_jsonata_cache` are reserved keys in the evaluator profile, and
 * `__proto__` changes an ordinary object's prototype. So this package
 * carries ownership as path/owners pairs. Paths appear only as string
 * values, never as object keys, and the profile is unchanged. The README
 * lists the matching contract change.
 */

import type { PolicyDocument, PolicyProposal, Principal, RepoPath, RuleInput, RuleKind } from "@generalbusiness/artroom-contract";
import { matchGlob } from "./glob.ts";

/** The owners policy assigns to one changed path. */
export interface PathOwners {
  readonly path: RepoPath;
  readonly owners: readonly Principal[];
}

/** `PolicyProposal`, with `owners` as path/owners pairs in the order of `paths`. */
export type ProposalInput = Omit<PolicyProposal, "owners"> & { readonly owners: readonly PathOwners[] };

type Swap<T> = T extends { readonly proposal: PolicyProposal }
  ? Omit<T, "proposal"> & { readonly proposal: ProposalInput }
  : T extends { readonly proposal: PolicyProposal | null }
    ? Omit<T, "proposal"> & { readonly proposal: ProposalInput | null }
    : T;

/** The contract's `RuleInput`, with `ProposalInput` in place of `PolicyProposal`. */
export type PolicyRuleInput = Swap<RuleInput>;

export type InputOf<K extends RuleKind> = Extract<PolicyRuleInput, { readonly kind: K }>;

/** The owners policy assigns to each path: every owners pattern that matches it (R-PROP-5). */
export function ownersFor(doc: PolicyDocument, paths: readonly RepoPath[]): PathOwners[] {
  return paths.map((path) => {
    const who = new Set<Principal>();
    for (const [pattern, principals] of Object.entries(doc.owners)) if (matchGlob(path, pattern)) for (const p of principals) who.add(p);
    return { path, owners: [...who] };
  });
}

/** Attribution: whose work is in an item (scope contract, section 6.7). */

import type { MemberRef } from "@generalbusiness/artroom-contract";
import type { Item } from "./state.ts";
import { same } from "./values.ts";

/** The member a signing key acts as, and the member it acts for, as the judged grant states them. */
export interface Signer { member: MemberRef; principal: MemberRef | null }

/** `list` and then each of `members` that it does not hold, in order. */
export function withMembers(list: readonly MemberRef[], members: readonly (MemberRef | null)[]): readonly MemberRef[] {
  const out = [...list];
  for (const m of members) if (m && !out.some((x) => same(x, m))) out.push(m);
  return out;
}

/** `member`, and the signer's principal when the member is the signer: that member acts under another's authority. */
export function withPrincipal(member: MemberRef, signer: Signer | null): readonly MemberRef[] {
  return signer?.principal && same(member, signer.member) ? [member, signer.principal] : [member];
}

/**
 * The attribution of an item as an act being judged sees it: the item's
 * recorded history, which the fold keeps (every member ever in an `author`
 * slot, every holder of a hold under it, and their principals), then the
 * signer and the signer's principal. The order is the order of first
 * appearance, so a verifier derives the same list.
 */
export function attribution(item: Item, signer: Signer | null): readonly MemberRef[] {
  return withMembers(item.attributed, signer ? [signer.member, signer.principal] : []);
}

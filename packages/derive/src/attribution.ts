/** Attribution: whose work is in an item (scope contract, section 6.7). */

import type { MemberRef } from "@generalbusiness/artroom-contract";
import type { Item } from "./state.ts";
import type { ValidDefinition } from "./validate.ts";
import { own, same } from "./values.ts";

/** The reference slot of a hold type that names the item the hold is under. */
export const UNDER = "under";

/** The member a signing key acts as, and the member it acts for, as the judged grant states them. */
export interface Signer { member: MemberRef; principal: MemberRef | null }

/** `list` and then each of `members` that it does not hold, in order. The same list when it holds them all. */
export function withMembers(list: readonly MemberRef[], members: readonly (MemberRef | null)[]): readonly MemberRef[] {
  const out = [...list];
  for (const m of members) if (m && !out.some((x) => same(x, m))) out.push(m);
  return out.length === list.length ? list : out;
}

/** `member`, and the signer's principal when the member is the signer: that member acts under another's authority. */
export function withPrincipal(member: MemberRef, signer: Signer | null): readonly MemberRef[] {
  return signer?.principal && same(member, signer.member) ? [member, signer.principal] : [member];
}

/**
 * `attributed`, and the signer's principal when the signer is in it: a member
 * of an item's attribution who changes the item, or a hold under it, under a
 * grant that names a principal, acted under that principal's authority.
 */
export function withActing(attributed: readonly MemberRef[], signer: Signer | null): readonly MemberRef[] {
  return signer?.principal && attributed.some((m) => same(m, signer.member)) ? withMembers(attributed, [signer.principal]) : attributed;
}

/**
 * The history of `item` with what one entry adds through the holds it
 * changes: the history of each of `changed` that is a hold under `item`, and
 * then the signer's principal as `withActing` gives it. The judges use it on
 * their working copies and the fold on the state, so an `attribute` effect
 * reads, inside the entry, the history the fold will record after it.
 */
export function historyOf(item: Item, changed: Iterable<Item>, definition: ValidDefinition, signer: Signer | null): readonly MemberRef[] {
  let history = item.attributed;
  for (const hold of changed) {
    if (hold.id === item.id || !definition.holdTypes.includes(hold.type) || own(hold.refs, UNDER) !== item.id) continue;
    history = withActing(withMembers(history, hold.attributed), signer);
  }
  return history;
}

/**
 * The attribution of an item as an input being judged sees it (section 6.7):
 * its recorded history, as `historyOf` brings it up to date with the entry's
 * effects so far, then the signer and the signer's principal. The order is
 * the order of first appearance, so a verifier derives the same list.
 */
export function attribution(history: readonly MemberRef[], signer: Signer | null): readonly MemberRef[] {
  return withMembers(history, signer ? [signer.member, signer.principal] : []);
}

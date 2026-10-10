/** Presentation over one complete authenticated membership summary. These
 * choices neither issue a grant nor certify the destination's admission. */
import type { Item, KeyId, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, isKeyId, isMemberRef } from "@generalbusiness/artroom-bytes";
import { CONTROLLER, ROLE_LISTS, RULES_EXTENT, isActions, isExtents, type Role } from "@generalbusiness/artroom-platform";
import type { Standing } from "@generalbusiness/artroom-cli";

type Choice = { label: string; value: string };
type Member = { item: Item; actions: readonly string[]; controller: string | null | undefined; live: boolean };

function rosterOf(items: readonly Item[], membership: ScopeRef): Map<string, Member> | null {
  const roster = items.find((item) => item.type === "roster" && item.state === "open");
  if (!roster) return null;
  const keyed = new Set(items.filter((item) => item.type === "key" && item.state === "active" && isKeyId(item.values["id"]))
    .map((item) => item.refs["member"]));
  const members = new Map<string, Member>();
  for (const item of items) {
    if (item.type !== "member" || (item.state !== "active" && item.state !== "removed")) continue;
    const handle = item.values["handle"], role = item.values["role"], party = item.parties["member"];
    if (typeof handle !== "string" || typeof role !== "string" || !Object.hasOwn(ROLE_LISTS, role) || !isMemberRef(party) || party.member !== handle || canonicalize(party.membership) !== canonicalize(membership)) continue;
    const actions = typeof role === "string" && Object.hasOwn(ROLE_LISTS, role) ? roster.values[ROLE_LISTS[role as Role]] : null;
    const controllerParty = item.parties["controller"], kind = item.values["kind"];
    const controller = kind === "agent"
      ? isMemberRef(controllerParty) && canonicalize(controllerParty.membership) === canonicalize(membership) ? controllerParty.member : undefined
      : (kind === "person" || kind === "checker") && (controllerParty === null || controllerParty === undefined) ? null : undefined;
    members.set(handle, { item, actions: isActions(actions) ? actions : [], controller, live: item.state === "active" && keyed.has(item.id) });
  }
  return members;
}

function controlled(member: Member, members: Map<string, Member>): boolean {
  return member.controller === null || typeof member.controller === "string" && members.get(member.controller)?.live === true;
}

/** Current offered standing follows the actual key-to-member link. Native
 * grants permit comments while an agent's controller is inactive; other
 * standing actions need that controller's active member and active key. */
export function currentStanding(items: readonly Item[], membership: ScopeRef, key: KeyId): Standing | null {
  const members = rosterOf(items, membership);
  const own = items.find((item) => item.type === "key" && item.state === "active" && item.values["id"] === key);
  const member = members && [...members.values()].find((member) => member.live && member.item.id === own?.refs["member"]);
  if (!member || !members) return null;
  const actions = controlled(member, members) ? member.actions : member.actions.filter((action) => action === "issue.comment" || action === "change.comment");
  return { role: member.item.values["role"] as Role, handle: String(member.item.values["handle"]), actions };
}

/** Each extent uses its recorded approver action. An absent author-controller
 * relation is unavailable for independent review; ownerMayReview allows it
 * only outside the rules extent, as the native extent judgment does. */
export function reviewCandidates(items: readonly Item[], membership: ScopeRef, authors: unknown, ownerMayReview: unknown, extents: unknown): {
  members: Choice[] | null; byExtent: Record<string, Choice[] | null>;
} | null {
  const roster = rosterOf(items, membership);
  if (!roster || typeof ownerMayReview !== "boolean" || !isExtents(extents) || !Array.isArray(authors) || authors.length === 0
    || authors.some((author) => !isMemberRef(author) || canonicalize(author.membership) !== canonicalize(membership))) return null;
  const names = new Set<string>(authors.map((author) => author.member));
  const owners = new Set<string>();
  let ownersKnown = true;
  for (const name of names) {
    const controller = roster.get(name)?.controller;
    if (controller === undefined) ownersKnown = false;
    else if (controller !== null) owners.add(controller);
  }
  const candidates = [...roster.entries()].filter(([name, member]) => member.live && controlled(member, roster)
    && member.actions.includes("change.review") && !names.has(name));
  const byExtent: Record<string, Choice[] | null> = Object.create(null);
  const union = new Set<string>();
  for (const extent of extents) {
    const independent = !ownerMayReview || extent.name === RULES_EXTENT;
    if (independent && !ownersKnown) { byExtent[extent.name] = null; continue; }
    byExtent[extent.name] = candidates.filter(([name, member]) => member.actions.includes(extent.approver)
      && (extent.name !== RULES_EXTENT || member.actions.includes(CONTROLLER)) && (!independent || !owners.has(name)))
      .map(([name]) => { union.add(name); return { label: name, value: name }; });
  }
  return { members: Object.values(byExtent).some((choices) => choices !== null) ? [...union].map((name) => ({ label: name, value: name })) : null, byExtent };
}

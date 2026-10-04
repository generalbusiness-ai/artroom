/**
 * Grants in a room that declares its acts (docs/protocol.md R-DECL-17,
 * R-ADM-5 as amended; declared acts stage 5).
 *
 * In a `v2` room a `delegate` op and a room-custody invitation's `session`
 * name platform kinds plainly and declared kinds in a signed map from kind
 * to binding. `*` is not accepted there: the grantor's client expands it
 * before signing, so the signed map is the boundary of what was granted. A
 * kind a later document adds is not covered, and a kind whose meaning
 * changes is no longer covered for the new meaning.
 *
 * The functions here read the room's active catalogue once and build the op
 * the grantor signs. In a `v1` room they return the legacy shape, with the
 * kinds as given. A kind the grantor's role may not grant, or that the room
 * does not declare, is thrown as `bad-request` naming it: the grantor never
 * signs a smaller grant than they asked for without being told.
 */

import type { Catalogue, DelegableKind, Invitation, KeyId, LaneId, Role, RoomApi, RosterOp, Timestamp } from "@generalbusiness/artroom-contract";
import { expandGrant, type ExpandedGrant } from "@generalbusiness/artroom-policy/declared";
import { artroomError } from "./errors.ts";

/** What to grant: every kind the grantor's role may sign and delegate, or these kinds. */
export type GrantKinds = "*" | readonly string[];

/** The catalogue to expand under: one the caller already read, or a handle to read it from. */
type Source = Catalogue | Pick<RoomApi, "acts">;

async function catalogueOf(source: Source): Promise<Catalogue> {
  return "vocabulary" in source ? source : source.acts();
}

function expanded(c: Extract<Catalogue, { vocabulary: "declared" }>, role: Role, kinds: GrantKinds): ExpandedGrant {
  const out = expandGrant(c, role, kinds);
  if (!out.ok) throw artroomError("bad-request", `This grant cannot be signed: ${out.problems.join(" ")} Nothing was sent.`); // G5:grant-problems
  return out.grant;
}

/**
 * The `delegate` op a grantor with `role` signs, for the room's active
 * vocabulary. Pass it to `room.roster()`. In a `v2` room `kinds` is expanded
 * into platform kinds and a signed map of the active bindings.
 */
export async function delegateOp(
  source: Source,
  role: Role,
  grant: { readonly to: KeyId; readonly kinds: GrantKinds; readonly lanes: readonly LaneId[] | "*"; readonly expiresAt: Timestamp },
): Promise<RosterOp> {
  const c = await catalogueOf(source);
  const base = { op: "delegate" as const, to: grant.to, lanes: grant.lanes, expiresAt: grant.expiresAt };
  if (c.vocabulary !== "declared") return { ...base, kinds: grant.kinds as readonly DelegableKind[] | "*" }; // G5:grant-legacy-shape
  const g = expanded(c, role, grant.kinds);
  return { ...base, kinds: g.kinds, acts: g.acts } as unknown as RosterOp;
}

/**
 * The `session` of a room-custody invitation for a member who will have
 * `role`, for the room's active vocabulary (R-CRED-3 as amended). In a `v2`
 * room an invitation with no session grants no declared kind, so an agent
 * that should act needs one.
 */
export async function invitationSession(source: Source, role: Role, session: { readonly kinds: GrantKinds; readonly ttlSeconds: number }): Promise<NonNullable<Invitation["session"]>> {
  const c = await catalogueOf(source);
  const base = { lanes: "*" as const, ttlSeconds: session.ttlSeconds };
  if (c.vocabulary !== "declared") return { ...base, kinds: session.kinds as readonly DelegableKind[] | "*" };
  const g = expanded(c, role, session.kinds);
  return { ...base, kinds: g.kinds, acts: g.acts } as unknown as NonNullable<Invitation["session"]>;
}

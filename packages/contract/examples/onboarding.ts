/**
 * Onboarding, through the types only (review 45431cd9, P1.3). Compiled, never
 * run. Three ways in, each with a different authority case (R-ADM-3):
 *
 * 1. A browser makes a key and redeems an invitation with `join` (case c).
 * 2. An MCP agent redeems a room-custody invitation for a bearer token (case c,
 *    then case b for every act).
 * 3. A Worker holds a key that never joins; a member delegates to it (case b).
 */

import { isRefusal, type ArtroomService, type DelegationId, type InvitationId, type RoomId, type Signer } from "@generalbusiness/artroom-contract";
import { connect, join, redeem } from "@generalbusiness/artroom-contract/client";

declare function webCryptoSigner(): Promise<Signer>;
declare function signerFromSecret(secret: string): Signer;
declare function show(message: string): void;
declare const roomId: RoomId;
const url = "https://artroom.example.workers.dev" as const;

/** 1. Browser: the key is made here and never leaves; the invitation binds it at redemption. */
export async function browserJoin(invitation: InvitationId, secret: string): Promise<void> {
  const signer = await webCryptoSigner();
  const joined = await join({ url }, roomId, { invitation, secret, signer });
  if (isRefusal(joined)) {
    show(`${joined.rule}: ${joined.reason}`); // e.g. "invitation-invalid", "key-in-use"
    return;
  }
  show(`joined as ${joined.member} (${joined.role}) with ${joined.key}`);
  using room = await connect({ url }, roomId, { kind: "key", signer });
  const queue = await room.attention();
  show(`${queue.items.length} items need you`);
}

/** 2. MCP agent: no key on the client; the room holds it and returns a bearer token once. */
export async function mcpRedemption(invitation: InvitationId, secret: string): Promise<{ url: string; bearer: string } | null> {
  const redeemed = await redeem({ url }, roomId, { invitation, secret });
  if (isRefusal(redeemed)) {
    show(`${redeemed.rule}: ${redeemed.reason}`);
    return null;
  }
  show(`${redeemed.member} acts under delegation ${redeemed.delegation} until ${redeemed.expiresAt}`);
  // The agent's MCP configuration: one URL and one header.
  return { url: redeemed.mcp, bearer: redeemed.bearer };
}

/** 3a. A member grants a delegation to a Worker's key, which is not a member and never joins. */
export async function delegateToWorker(memberSigner: Signer, workerKey: Signer["key"]): Promise<DelegationId | null> {
  using member = await connect({ url }, roomId, { kind: "key", signer: memberSigner });
  const grant = await member.roster({
    op: "delegate",
    to: workerKey,
    kinds: ["check", "note"],
    lanes: "*",
    expiresAt: "2026-12-31T00:00:00.000Z",
  });
  if (isRefusal(grant)) {
    show(`${grant.rule}: ${grant.reason}`); // e.g. "delegation-invalid" if the member's role cannot check
    return null;
  }
  return grant.id; // the delegation's ID is the delegate act's ID (R-ID-2)
}

/** 3b. The Worker signs with its own key, under the chosen delegation. */
export async function workerActs(env: { ARTROOM: ArtroomService; ARTROOM_KEY: string; ARTROOM_DELEGATION: DelegationId }): Promise<void> {
  using room = await connect(env.ARTROOM, roomId, {
    kind: "delegation",
    signer: signerFromSecret(env.ARTROOM_KEY),
    as: env.ARTROOM_DELEGATION,
  });
  const note = await room.note({ act: env.ARTROOM_DELEGATION }, { text: "checker online" });
  if (isRefusal(note)) {
    show(`${note.rule}: ${note.reason}`); // e.g. "delegation-invalid" after expiry
    return;
  }
  if (note.by.via === "delegation") show(`acting for ${note.by.member} under ${note.by.delegation}`);
}

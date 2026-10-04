/**
 * Amendment 2, through the types only. Compiled, never run.
 *
 * 1. Found a room in two steps, on a fresh repository or on an imported one
 *    with an operator's grant, and find a room's ID from its name
 *    (R-GEN-10 to R-GEN-13, R-API-11).
 * 2. Build an invitation link with the secret in the fragment (R-CRED-11).
 * 3. An MCP Worker acts for a bearer over `RoomWire` (R-CRED-10).
 * 4. Decode the RPC subscription's newline-delimited JSON (R-API-8).
 */

import {
  isRefusal,
  type ArtroomFounder,
  type ArtroomService,
  type BearerAct,
  type ByteStream,
  type Genesis,
  type InvitationId,
  type InvitationLink,
  type KeyId,
  type LaneId,
  type RoomId,
  type RoomRef,
  type SessionToken,
  type SignedOnboardingGrant,
  type Signer,
  type Update,
} from "@generalbusiness/artroom-contract";

declare function signGenesis(signer: Signer, genesis: Genesis): Promise<string>;
/** A streaming UTF-8 decoder, such as `new TextDecoder()`: a character may span two chunks. */
declare const utf8: { decode(bytes: Uint8Array, options: { readonly stream: true }): string };
declare function show(message: string): void;

/** 1. Public founding: the deployment allocates a fresh, empty repository (R-GEN-12). */
export async function foundRoom(worker: ArtroomFounder, admin: Signer, recovery: KeyId): Promise<RoomId> {
  const { genesis, draft } = await worker.draft({ name: "acme-web", repo: { kind: "new" }, admin: { handle: "@alice", key: admin.key }, recovery });
  // The first admin signs exactly the genesis it was given; the room ID is its digest (R-ID-3).
  return worker.found(genesis, await signGenesis(admin, genesis), draft);
}

/** 1a. Importing an existing repository needs an operator's grant for it and for this admin key. */
export async function importRoom(worker: ArtroomFounder, admin: Signer, recovery: KeyId, grant: SignedOnboardingGrant): Promise<RoomId | null> {
  if (grant.grant.admin !== admin.key) return null; // the grant names the first admin key (R-GEN-12)
  const { genesis, draft } = await worker.draft({ name: "acme-api", repo: { kind: "import", grant }, admin: { handle: "@alice", key: admin.key }, recovery });
  // The grant is inside the genesis, so the admin's signature covers it, and `found` checks it again.
  if (genesis.repo !== grant.grant.repo || genesis.onboarding === undefined) return null;
  return worker.found(genesis, await signGenesis(admin, genesis), draft);
}

/** 1b. A name is a convenience; the ID is what envelopes sign. `GET /v1/rooms/:room` returns this. */
export function idOf(ref: RoomRef): RoomId {
  return ref.room;
}

/** 2. The inviting admin's client builds the link. The room never sees the secret before redemption. */
export function invitationLink(origin: `https://${string}`, room: RoomId, invitation: InvitationId, secret: string): InvitationLink {
  return `${origin}/rooms/${room}/join#i=${invitation}&s=${secret}`;
}

/** 3. The MCP Worker turns a tool call into a bearer act. The room signs it under the bearer's delegation. */
export async function bearerNote(service: ArtroomService, room: RoomId, bearer: string, lane: LaneId, text: string): Promise<void> {
  using wire = await service.room(room);
  const act: BearerAct = { kind: "note", target: { act: lane }, body: { text }, idempotencyKey: "note-1" };
  const out = await wire.bearerAct(bearer, act);
  if (isRefusal(out)) show(`${out.rule}: ${out.reason}`);
  // A bearer opens its workspace through `bearerRequest`; it has no key to sign a request with.
  const ws = await wire.bearerRequest(bearer, { kind: "workspace", lane, lease: 1 });
  if (!isRefusal(ws) && "state" in ws) show(`workspace ${ws.state}`);
}

/** 4. One `Update` per line of UTF-8 JSON, each ending in a newline. */
export async function follow(service: ArtroomService, room: RoomId, session: SessionToken, onUpdate: (u: Update) => void): Promise<void> {
  using wire = await service.room(room);
  const stream: ByteStream = await wire.subscribe(session);
  const reader = stream.getReader();
  let pending = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    pending += utf8.decode(chunk.value, { stream: true });
    for (let nl = pending.indexOf("\n"); nl >= 0; nl = pending.indexOf("\n")) {
      onUpdate(JSON.parse(pending.slice(0, nl)) as Update);
      pending = pending.slice(nl + 1);
    }
  }
  reader.releaseLock();
}

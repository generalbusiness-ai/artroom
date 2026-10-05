/**
 * The entry points the contract declares: `connect`, `join` and `redeem`
 * (transports.ts; section 22, point 23).
 */

import {
  isArtroomError,
  isRefusal,
  isRoomId,
  type ArtroomService,
  type Base64Url,
  type Credentials,
  type Genesis,
  type HttpRoom,
  type InvitationId,
  type ActRecord,
  type AnySignedEnvelope,
  type Joined,
  type LogPage,
  type JoinEnvelope,
  type Redeemed,
  type Result,
  type Room,
  type RoomId,
  type RoomName,
  type SignedEnvelope,
  type Signer,
} from "@generalbusiness/artroom-contract";
import { digestOf } from "./canonical.ts";
import { buildEnvelope, signEnvelope, signRequest } from "./envelope.ts";
import { artroomError, Redactor } from "./errors.ts";
import { newIdempotencyKey } from "./keys.ts";
import { McpBearer, RpcBearer } from "./bearer.ts";
import { HttpRoomClient, RpcRoomClient, withRetries } from "./room.ts";
import { endpointUrl, HttpWire, RpcWire, type ClientOptions } from "./wire.ts";

type Endpoint = { readonly url: `https://${string}` };

function isService(value: unknown): value is ArtroomService {
  return typeof value === "object" && value !== null && typeof (value as { room?: unknown }).room === "function";
}

/** The room ID from a genesis object: `room_` + the first 32 hex of its digest (R-ID-3). */
export async function roomIdOf(genesis: Genesis): Promise<RoomId> {
  return `room_${(await digestOf(genesis)).slice("sha256:".length, "sha256:".length + 32)}`;
}

function genesisOf(page: LogPage): Genesis {
  const first = page.acts[0];
  if (first?.entry.type !== "system" || first.entry.event.type !== "genesis") {
    throw artroomError("internal", "The room's log does not start with its genesis entry.");
  }
  return first.entry.event.genesis;
}

/** Connect to a room over a service binding (RPC). */
export function connect(
  service: ArtroomService,
  room: RoomName | RoomId,
  credentials: Extract<Credentials, { kind: "key" | "delegation" }>,
  options?: ClientOptions,
): Promise<Room>;
/**
 * Connect over a service binding as a bearer session: the adapter the MCP
 * endpoint's Worker needs (R-CRED-10). Not in the contract's declaration.
 */
export function connect(service: ArtroomService, room: RoomName | RoomId, credentials: Extract<Credentials, { kind: "bearer" }>, options?: ClientOptions): Promise<Room>;
/** Connect to a room over HTTPS. */
export function connect(endpoint: Endpoint, room: RoomName | RoomId, credentials: Credentials, options?: ClientOptions): Promise<HttpRoom>;
export async function connect(
  endpoint: ArtroomService | Endpoint,
  room: RoomName | RoomId,
  credentials: Credentials,
  options: ClientOptions = {},
): Promise<Room | HttpRoom> {
  const redactor = new Redactor();
  // Register every credential the caller already holds before the first request, so no error
  // from any request, including the first, can carry it out (R-WS-4).
  if (credentials.kind === "bearer") redactor.add(credentials.token);
  if (isService(endpoint)) {
    if (credentials.kind === "bearer") {
      // The MCP endpoint's adapter: acts to `bearerAct`, workspace requests to `bearerRequest`,
      // reads with the token (R-CRED-10). The room signs, so a name is enough; genesis gives the ID.
      const target = await endpoint.room(room);
      const wire = new RpcWire(target, redactor);
      const page = await wire.read(credentials.token, { q: "log", req: { limit: 1 } });
      const genesis = genesisOf(page);
      const id = await roomIdOf(genesis);
      if (isRoomId(room) && room !== id) throw artroomError("unauthenticated", `The service's genesis is for ${id}, not ${room}.`);
      return new RpcRoomClient(wire, credentials, id, genesis.name, options, new RpcBearer(target, credentials.token, (f) => wire.guard(f).then((r) => (isRefusal(r) ? (redactor.refusal(r) as typeof r) : r))));
    }
    if (!isRoomId(room)) throw artroomError("bad-request", "Connect by room ID: envelopes are signed with it, and a name can be reused (R-ID-3).");
    const wire = new RpcWire(await endpoint.room(room), redactor);
    return withName(new RpcRoomClient(wire, credentials, room, room, options), room);
  }

  const base = endpointUrl(endpoint.url);
  if (credentials.kind === "bearer") {
    // The room signs for a bearer session, so the client does not need the room ID; it learns it from genesis.
    const wire = new HttpWire(base, room, options, redactor);
    const page = await wire.read(credentials.token, { q: "log", req: { limit: 1 } });
    const genesis = genesisOf(page);
    const id = await roomIdOf(genesis);
    if (isRoomId(room) && room !== id) throw artroomError("unauthenticated", `The server's genesis is for ${id}, not ${room}.`);
    const bound = new HttpWire(base, id, options, redactor);
    return new HttpRoomClient(bound, credentials, id, genesis.name, options, new McpBearer(bound, credentials.token, options.fetch));
  }

  if (!isRoomId(room)) throw artroomError("bad-request", "Connect by room ID: envelopes are signed with it, and a name can be reused (R-ID-3).");
  const wire = new HttpWire(base, room, options, redactor);
  return withName(new HttpRoomClient(wire, credentials, room, room, options), room);
}

/**
 * Reads genesis once, checks it is this room's (R-ID-3), and returns a
 * handle that knows the room's name. A wrong URL fails here, not at the
 * first act.
 */
async function withName<T extends HttpRoomClient | RpcRoomClient>(handle: T, id: RoomId): Promise<T> {
  const page = await handle.log({ limit: 1 });
  const first = page.acts[0];
  if (first?.entry.type !== "system" || first.entry.event.type !== "genesis") return handle;
  const genesis = first.entry.event.genesis;
  if ((await roomIdOf(genesis)) !== id) throw artroomError("unauthenticated", `The server's genesis does not match ${id}.`);
  handle.learnName(genesis.name);
  return handle;
}

/**
 * Redeem a client-custody invitation with a key the caller made (R-CRED-1,
 * R-CRED-2, R-CRED-9). The `join` is an ordinary signed act, so a lost
 * response is retried with the same bytes. The room issues a session only
 * for a join that call admitted, so it refuses the retry `invitation-invalid`;
 * the client then recovers the original record by resubmitting the same
 * bytes (R-IDEM-2), and a session by signing for one with the key (R-CRED-5).
 */
export async function join(
  endpoint: ArtroomService | Endpoint,
  room: RoomId,
  invitation: { readonly invitation: InvitationId; readonly secret: Base64Url; readonly signer: Signer },
  options: ClientOptions & { readonly idempotencyKey?: string } = {},
): Promise<Result<Joined>> {
  const redactor = new Redactor();
  redactor.add(invitation.secret);
  // A caller that saved its key and this key can repeat the join later with identical bytes (R-IDEM-2).
  const key = options.idempotencyKey ?? newIdempotencyKey();
  const envelope = buildEnvelope(room, { signer: invitation.signer }, "roster", null, { op: "join", invitation: invitation.invitation, secret: invitation.secret }, key) as JoinEnvelope;
  const signed = await signEnvelope(envelope, invitation.signer);
  const wire = isService(endpoint) ? new RpcWire(await endpoint.room(room), redactor) : new HttpWire(endpointUrl(endpoint.url), room, options, redactor);
  try {
    const retries = options.retries ?? 3;
    let out = await withRetries(() => wire.redeem({ custody: "client", join: signed }), retries, key, options.backoff);
    if (isRefusal(out) && out.rule === "invitation-invalid") out = (await recoverJoin(wire, room, signed, invitation.signer, retries, options.now ?? Date.now, options.backoff)) ?? out;
    if (!isRefusal(out) && out.custody !== "client") throw artroomError("internal", "The room answered a client-custody join with a room-custody result.");
    if (!isRefusal(out)) redactor.add(out.session.token);
    return out as Result<Joined>;
  } finally {
    wire.dispose();
  }
}

/**
 * The `Joined` of a join the room admitted earlier with this key, or null
 * when it admitted none. `now` is the caller's clock (`ClientOptions.now`):
 * the session request's `notAfter` must fall in the room's window (R-CRED-6).
 */
async function recoverJoin(wire: HttpWire | RpcWire, room: RoomId, signed: SignedEnvelope, signer: Signer, retries: number, now: () => number, backoff: ClientOptions["backoff"]): Promise<Joined | null> {
  const record = await withRetries(() => wire.submit(signed), retries, signed.envelope.idempotencyKey, backoff);
  if (isRefusal(record) || record.kind !== "roster" || record.by.via !== "join") return null;
  const session = await withRetries(async () => wire.request(await signRequest(room, { signer }, { kind: "session", ttlSeconds: 3600 }, now())), retries, undefined, backoff);
  if (isRefusal(session) || !("member" in session)) return null;
  return { custody: "client", member: record.by.member, role: record.by.role, key: signer.key, record, session };
}

/**
 * Sends a retained signed act straight to the room, unchanged: no new
 * signature, no read session and no read of current state. The room returns
 * the original result if it recorded the act, even after the signing key
 * was retired or revoked (R-IDEM-2). Only the act's own room is accepted.
 */
export async function resubmit(endpoint: Endpoint, room: RoomId, signed: AnySignedEnvelope, options: ClientOptions = {}): Promise<Result<ActRecord>> {
  if (signed.envelope.room !== room) throw artroomError("bad-request", "This act was signed for another room.");
  const wire = new HttpWire(endpointUrl(endpoint.url), room, options, new Redactor());
  return withRetries(() => wire.submit(signed), options.retries ?? 3, signed.envelope.idempotencyKey, options.backoff);
}

/** What a lost room-custody redemption means, and what to do (section 22, point 29). */
export const LOST_REDEMPTION =
  "The redemption may have succeeded, but its response was lost, and the bearer token cannot be shown again. " +
  "Do not retry this invitation. Ask an admin for a new MCP (room-custody) invitation for the same member, " +
  "and ask them to revoke the key the room made for the lost token, with the roster act `revoke-key`.";

/**
 * Redeem a room-custody invitation for an MCP bearer token (R-CRED-3,
 * R-CRED-9). The token is in the result once and nowhere else.
 *
 * This call is not repeatable: if the room consumed the invitation and the
 * response was lost, a retry could only be refused. So the client retries
 * only when the room answered that nothing was recorded, and otherwise
 * throws an error with `maybeRecorded: true` and says what to do.
 */
export async function redeem(
  endpoint: Endpoint,
  room: RoomId,
  invitation: { readonly invitation: InvitationId; readonly secret: Base64Url },
  options: ClientOptions = {},
): Promise<Result<Redeemed>> {
  const redactor = new Redactor();
  redactor.add(invitation.secret);
  const wire = new HttpWire(endpointUrl(endpoint.url), room, options, redactor);
  const retries = options.retries ?? 3;
  for (let n = 0; ; n++) {
    try {
      const out = await wire.redeem({ custody: "room", invitation: invitation.invitation, secret: invitation.secret });
      if (!isRefusal(out) && out.custody !== "room") throw artroomError("internal", "The room answered a room-custody redemption with a client-custody result.");
      return out as Result<Redeemed>;
    } catch (e) {
      if (!isArtroomError(e)) throw e;
      if (e.maybeRecorded === true) throw { ...e, message: `${e.message} ${LOST_REDEMPTION}` };
      // The room answered with an error and recorded nothing (R-CRED-9), so the invitation is still unused.
      if (!e.retryable || n >= retries) throw e;
      const wait = Math.min(e.retryAfterMs ?? 500 * 2 ** n, 5_000);
      await new Promise((r) => setTimeout(r, options.backoff ? options.backoff(wait) : wait));
    }
  }
}

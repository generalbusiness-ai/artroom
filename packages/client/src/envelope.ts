/**
 * Building and signing envelopes (R-SIG-1) and request envelopes (R-CRED-5,
 * R-CRED-6).
 */

import type {
  DelegationId,
  Envelope,
  EnvelopeKind,
  IdempotencyKey,
  RequestBody,
  RoomId,
  SignedEnvelope,
  SignedRequest,
  Signer,
} from "@generalbusiness/artroom-contract";
import { artroomError } from "./errors.ts";
import { randomToken, signValue } from "./keys.ts";

/** Who signs: a key, and the delegation it signs under, if any (R-ADM-3 a, b). */
export interface Identity {
  readonly signer: Signer;
  readonly delegation?: DelegationId;
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{1,64}$/;

export function checkIdempotencyKey(key: string): IdempotencyKey {
  if (!IDEMPOTENCY_KEY.test(key)) throw artroomError("bad-request", "An idempotency key is 1 to 64 characters from A-Z, a-z, 0-9, '_' and '-' (R-ID-10).");
  return key;
}

/** The unsigned envelope. `target` and `body` are copied field by field by the caller, so they are closed (R-SIG-4). */
export function buildEnvelope(
  room: RoomId,
  who: Identity,
  kind: EnvelopeKind,
  target: unknown,
  body: unknown,
  idempotencyKey: IdempotencyKey,
): Envelope {
  return {
    v: 1,
    room,
    actor: who.signer.key,
    kind,
    target,
    body,
    idempotencyKey: checkIdempotencyKey(idempotencyKey),
    ...(who.delegation !== undefined ? { delegation: who.delegation } : {}),
  } as Envelope;
}

export async function signEnvelope<E extends Envelope>(envelope: E, signer: Signer): Promise<SignedEnvelope<E>> {
  if (envelope.actor !== signer.key) throw artroomError("bad-request", "The envelope's actor must be the signing key (R-ADM-2).");
  return { envelope, sig: await signValue("artroom-envelope-v1", envelope, signer) };
}

/** How long a request envelope stays valid. The room allows at most 300 seconds (R-CRED-6). */
const REQUEST_LIFETIME_MS = 120_000;

export async function signRequest(room: RoomId, who: Identity, request: RequestBody, now: number = Date.now()): Promise<SignedRequest> {
  const envelope = {
    v: 1 as const,
    room,
    actor: who.signer.key,
    ...(who.delegation !== undefined ? { delegation: who.delegation } : {}),
    request,
    nonce: randomToken(24),
    notAfter: new Date(now + REQUEST_LIFETIME_MS).toISOString(),
  };
  return { request: envelope, sig: await signValue("artroom-request-v1", envelope, who.signer) };
}

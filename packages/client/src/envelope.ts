/**
 * Building and signing envelopes (R-SIG-1) and request envelopes (R-CRED-5,
 * R-CRED-6).
 */

import type {
  AnyEnvelope,
  AnySignedEnvelope,
  Binding,
  DeclaredEnvelope,
  DeclaredTarget,
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

const BINDING = /^sha256:[0-9a-f]{64}$/;

/** A binding is `sha256:` and 64 lowercase hex digits (R-DECL-15). */
export function checkBinding(binding: unknown): Binding {
  if (typeof binding !== "string" || !BINDING.test(binding))
    throw artroomError("bad-request", "A declared act needs the binding of its kind, sha256: and 64 lowercase hex digits. Read it from acts() (R-DECL-16)."); // G5:binding-required
  return binding as Binding;
}

/**
 * The unsigned envelope of a declared act (R-DECL-16): `v: 2`, with the
 * binding the caller read. `binding` sits after `kind`, where the room's own
 * bearer envelope puts it; the signed bytes are canonical JSON, so the order
 * here is for readers only.
 */
export function buildDeclaredEnvelope(
  room: RoomId,
  who: Identity,
  kind: string,
  binding: Binding,
  target: DeclaredTarget,
  body: unknown,
  idempotencyKey: IdempotencyKey,
): DeclaredEnvelope {
  return {
    v: 2,
    room,
    actor: who.signer.key,
    kind,
    binding: checkBinding(binding),
    target,
    body,
    idempotencyKey: checkIdempotencyKey(idempotencyKey),
    ...(who.delegation !== undefined ? { delegation: who.delegation } : {}),
  } as DeclaredEnvelope;
}

export async function signEnvelope<E extends Envelope>(envelope: E, signer: Signer): Promise<SignedEnvelope<E>>;
export async function signEnvelope<E extends AnyEnvelope>(envelope: E, signer: Signer): Promise<AnySignedEnvelope<E>>;
export async function signEnvelope(envelope: AnyEnvelope, signer: Signer): Promise<AnySignedEnvelope> {
  if (envelope.actor !== signer.key) throw artroomError("bad-request", "The envelope's actor must be the signing key (R-ADM-2).");
  // Both versions are signed under the same domain tag; `v` is inside the signed bytes (R-SIG-1 as amended).
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

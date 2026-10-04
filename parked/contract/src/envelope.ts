/**
 * The signed envelope (plan section 9) and the signed request used for
 * unrecorded calls. Rules R-SIG, R-ADM and R-IDEM in docs/protocol.md.
 *
 *   { v: 1, room, actor: keyId, kind, target, body, idempotencyKey, delegation? }
 *
 * The bytes signed are the domain tag `artroom-envelope-v1` and a newline,
 * followed by the RFC 8785 canonical JSON of the envelope (R-SIG-1).
 */

import type {
  Base64Url,
  DelegationId,
  IdempotencyKey,
  KeyId,
  LaneId,
  LeaseGeneration,
  RoomId,
  Timestamp,
} from "./ids.ts";
import type {
  CheckBody,
  ClaimBody,
  EnvelopeKind,
  LandBody,
  NoteAnchor,
  NoteBody,
  ProposalRef,
  ProposeBody,
  ReclaimBody,
  ReleaseBody,
  RenewBody,
  ReviewBody,
} from "./acts.ts";
import type { RosterOp } from "./roster.ts";

/** The lane an act changes. */
export interface LaneTarget {
  readonly lane: LaneId;
}

interface EnvelopeOf<K extends EnvelopeKind, T, B> {
  readonly v: 1;
  readonly room: RoomId;
  /** The signing key. The room takes identity from the verified signature, never from a field (R-ADM-2). */
  readonly actor: KeyId;
  readonly kind: K;
  readonly target: T;
  readonly body: B;
  readonly idempotencyKey: IdempotencyKey;
  /** Present when `actor` signs under another key's delegation (R-ADM-5). */
  readonly delegation?: DelegationId;
}

/** Every envelope a member may sign. `kind` and `target` together select the body. */
export type Envelope =
  | EnvelopeOf<"claim", null, ClaimBody>
  | EnvelopeOf<"claim", LaneTarget, ReclaimBody>
  | EnvelopeOf<"propose", LaneTarget, ProposeBody>
  | EnvelopeOf<"note", NoteAnchor, NoteBody>
  | EnvelopeOf<"review", ProposalRef, ReviewBody>
  | EnvelopeOf<"check", ProposalRef, CheckBody>
  | EnvelopeOf<"land", ProposalRef, LandBody>
  | EnvelopeOf<"release", LaneTarget, ReleaseBody>
  | EnvelopeOf<"renew", LaneTarget, RenewBody>
  | EnvelopeOf<"roster", null, RosterOp>;

export type EnvelopeFor<K extends EnvelopeKind> = Extract<Envelope, { readonly kind: K }>;

/** The envelope that redeems a client-custody invitation; signed by the new key (R-ADM-3c). */
export type JoinEnvelope = EnvelopeOf<"roster", null, Extract<RosterOp, { readonly op: "join" }>>;

/** An envelope and its Ed25519 signature over the signing bytes (R-SIG-1). */
export interface SignedEnvelope<E extends Envelope = Envelope> {
  readonly envelope: E;
  readonly sig: Base64Url;
}

// --------------------------------------------------------- unrecorded requests

/**
 * Calls that are authenticated but not recorded as acts: opening a workspace
 * and starting a read session (R-CRED-5). Signed under the domain tag
 * `artroom-request-v1`. Replay is bounded by `nonce` and `notAfter`.
 */
export type RequestBody =
  /** Start, or return, the lane's workspace operation. Holder only. Returns the public view. */
  | { readonly kind: "workspace"; readonly lane: LaneId; readonly lease: LeaseGeneration }
  /** Retrieve the workspace write token. Holder only, judged at each retrieval (R-WS-2). */
  | { readonly kind: "workspace-token"; readonly lane: LaneId; readonly lease: LeaseGeneration }
  | { readonly kind: "session"; readonly ttlSeconds: number };

export interface RequestEnvelope {
  readonly v: 1;
  readonly room: RoomId;
  readonly actor: KeyId;
  readonly delegation?: DelegationId;
  readonly request: RequestBody;
  /** 16–64 characters from `[A-Za-z0-9_-]`; the room refuses a nonce it has seen (R-CRED-6). */
  readonly nonce: string;
  /** At most 300 seconds after the room's clock at receipt. */
  readonly notAfter: Timestamp;
}

export interface SignedRequest {
  readonly request: RequestEnvelope;
  readonly sig: Base64Url;
}

/** Signing domain tags (R-SIG-1). */
export type SigningDomain =
  | "artroom-genesis-v1"
  | "artroom-envelope-v1"
  | "artroom-request-v1"
  | "artroom-entry-v1"
  | "artroom-checkpoint-v1"
  | "artroom-onboarding-v1";

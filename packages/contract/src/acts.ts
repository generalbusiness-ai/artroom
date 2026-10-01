/**
 * The seven acts, the two lease and roster operations, their bodies and the
 * records the room returns (plan sections 4 and 5). Rules R-LANE, R-PROP and
 * R-OBL in docs/protocol.md.
 */

import type {
  ActId,
  CheckerName,
  DelegationId,
  Digest,
  Generation,
  Glob,
  InvitationId,
  KeyId,
  LaneId,
  LeaseGeneration,
  MemberId,
  ObligationId,
  OpId,
  PinnedRef,
  Reason,
  RepoPath,
  Seq,
  Sha,
  Timestamp,
} from "./ids.ts";
import type { Held, Lease, LaneEffect, Overlap } from "./lanes.ts";
import type { CheckInput, Evidence, NotCarried, Obligation } from "./evidence.ts";
import type { LandOp, PreviewOp } from "./landing.ts";
import type { KeyCustody, Role, RosterOp } from "./roster.ts";

/** The seven acts. */
export type ActKind = "claim" | "propose" | "note" | "review" | "check" | "land" | "release";

/**
 * How an envelope reached admission. Internal to the room: it is set by the
 * code path that calls the shared admission, and never read from the wire,
 * the envelope, the route or the body (R-ADM-12).
 * - `submitted`: `submit` over RPC, `POST /acts`, or a client-custody `redeem`.
 * - `room-redemption`: the room's own room-custody redemption, signing a
 *   `join` with a key it has just generated and holds.
 */
export type AdmissionPath = "submitted" | "room-redemption";

/** Every kind a member may sign: the seven acts plus `renew` and `roster`. */
export type EnvelopeKind = ActKind | "renew" | "roster";

export type Verdict = "approve" | "object";

/** Flags the room sets on a record. Each is shown in the UI. */
export type Flag =
  | "sole-admin-self-approval" // R-ADMIN-2
  | "recovery-key" //            R-GEN-3
  | "config-recovery" //         R-ADMIN-5: an act on a configuration-recovery lane
  | "after-reservation"; //      R-LAND-8: admitted while a reservation was held

/**
 * What a lane is for. `config-recovery` lanes change only `.artroom/**`, are
 * held by admins, and bypass policy rules (R-ADMIN-5). Absent means ordinary.
 */
export type LanePurpose = "ordinary" | "config-recovery";

// ------------------------------------------------------------------ targets

/** A proposal generation. Reviews and checks bind to one. */
export interface ProposalRef {
  readonly lane: LaneId;
  readonly generation: Generation;
}

/** A proposal generation and the head the signer saw. A `Proposal` record satisfies it. */
export interface ProposalAt extends ProposalRef {
  readonly head: Sha;
}

/** Where a note is anchored. */
export type NoteAnchor =
  | { readonly act: ActId }
  | {
      readonly lane: LaneId;
      readonly generation: Generation;
      readonly head: Sha;
      readonly path: RepoPath;
      readonly line: number;
      readonly endLine?: number;
    };

// ------------------------------------------------------------------- bodies

/** A new lane. */
export interface ClaimBody {
  readonly goal: string;
  readonly scope: readonly Glob[];
  /** Present only to open a configuration-recovery lane (R-ADMIN-5). */
  readonly purpose?: "config-recovery";
  readonly plan?: string;
  readonly because?: readonly Reason[];
}

/**
 * A claim on an existing lane. With `lease`, the holder changes its scope
 * (R-LANE-2). Without `lease`, a member takes over an unheld lane (R-LANE-7).
 */
export interface ReclaimBody {
  readonly scope: readonly Glob[];
  readonly goal?: string;
  readonly plan?: string;
  readonly because?: readonly Reason[];
  readonly expectedGeneration: Generation;
  readonly lease?: LeaseGeneration;
}

export interface ProposeBody {
  readonly lease: LeaseGeneration;
  readonly expectedGeneration: Generation;
  readonly head: Sha;
  /** The author's summary of the session that produced this head. */
  readonly summary: string;
  readonly because?: readonly Reason[];
}

export interface NoteBody {
  readonly text: string;
  readonly replyTo?: ActId;
}

export interface ReviewBody {
  /** Must equal the generation's head (R-OBL-1). */
  readonly head: Sha;
  readonly verdict: Verdict;
  /** The scope the reviewer read. Carrying tests changed paths against it (R-CARRY-1). */
  readonly scope: readonly Glob[];
  /** Paths the reviewed code depends on (R-CARRY-2). */
  readonly dependsOn?: readonly Glob[];
  readonly text: string;
}

export interface CheckBody {
  readonly obligation: ObligationId;
  readonly check: CheckerName;
  /** The exact integration commit the runner checked out and confirmed (R-EXEC-4). */
  readonly integration: Sha;
  readonly input: CheckInput;
  /** sha256 of the checker's configuration from the active policy version (R-CARRY-7). */
  readonly config: Digest;
  /** Digest of the runner environment: container image and toolchain. */
  readonly runner: Digest;
  /** True when the checker uses undeclared volatile inputs; such checks never carry (R-CARRY-10). */
  readonly volatile: boolean;
  readonly ok: boolean;
  /** At most 16 KiB. Scanned for secrets like any other text (R-SEC-1). */
  readonly detail: string;
  /** The landing operation whose integration this check ran on, if any. */
  readonly landOp?: OpId;
}

export interface LandBody {
  readonly lease: LeaseGeneration;
  /** Must equal the generation's head. */
  readonly head: Sha;
}

export interface ReleaseBody {
  readonly lease: LeaseGeneration;
  /** The handover note. */
  readonly note?: string;
}

export interface RenewBody {
  readonly lease: LeaseGeneration;
}

// ------------------------------------------------------------------ records

/**
 * The authority under which an act was admitted, by case (R-ADM-3). Evidence
 * is judged by it (R-REV-1). `member`, `role` and `key` exist in every case.
 */
export type Authority =
  /** A member's own active key (R-ADM-3a). */
  | { readonly via: "member"; readonly member: MemberId; readonly role: Role; readonly key: KeyId }
  /**
   * A key acting under a delegation (R-ADM-3b). `member` and `role` are the
   * grantor's; `key` is the signing (grantee) key, which need not belong to a member.
   */
  | {
      readonly via: "delegation";
      readonly member: MemberId;
      readonly role: Role;
      readonly key: KeyId;
      readonly delegation: DelegationId;
      readonly grantor: KeyId;
    }
  /**
   * A `join` that redeems an invitation; `key` becomes the member's key
   * (R-ADM-3c). `custody` is the invitation's, which the admission path
   * matched; the room writes it, never the caller.
   */
  | {
      readonly via: "join";
      readonly member: MemberId;
      readonly role: Role;
      readonly key: KeyId;
      readonly invitation: InvitationId;
      readonly custody: KeyCustody;
    }
  /** The room's current recovery key, for roster acts only (R-ADM-3d). */
  | { readonly via: "recovery"; readonly member: null; readonly role: null; readonly key: KeyId };

interface RecordBase<K extends EnvelopeKind> {
  readonly id: ActId;
  readonly seq: Seq;
  readonly kind: K;
  readonly by: Authority;
  /** Room clock at admission. Informational (R-ADM-1). */
  readonly at: Timestamp;
  /** The reservation this act was admitted after, if a slot was held (R-LAND-8). */
  readonly after?: OpId;
  readonly flags: readonly Flag[];
  readonly because?: readonly Reason[];
}

export interface Claim extends RecordBase<"claim"> {
  /** For a new lane, this record's own ID; it is never written inside the entry (R-LOG-12). */
  readonly lane: LaneId;
  readonly purpose: LanePurpose;
  readonly goal: string;
  readonly plan?: string;
  readonly scope: readonly Glob[];
  readonly lease: Lease;
  /** Computed at admission (R-PATH-3). */
  readonly overlaps: readonly Overlap[];
  readonly effect: Extract<LaneEffect, { type: "opened" | "rescoped" | "taken-over" }>;
}

/** One actual change between the proposal's base and head. */
export type PathChange =
  | { readonly status: "added" | "modified" | "deleted"; readonly path: RepoPath }
  | { readonly status: "renamed"; readonly path: RepoPath; readonly from: RepoPath };

export interface Proposal extends RecordBase<"propose"> {
  readonly lane: LaneId;
  readonly generation: Generation;
  /** Immutable. */
  readonly head: Sha;
  /** The merge base of main and `head` at propose time; changed paths are computed from it (R-PROP-3). */
  readonly base: Sha;
  readonly pinnedRef: PinnedRef;
  readonly summary: string;
  readonly changed: readonly PathChange[];
  readonly obligations: readonly Obligation[];
  /** Earlier evidence that did not carry, with the reason (R-CARRY-5). */
  readonly notCarried: readonly NotCarried[];
  readonly preview: PreviewOp;
}

export interface Note extends RecordBase<"note"> {
  readonly anchor: NoteAnchor;
  readonly text: string;
  readonly replyTo?: ActId;
}

export interface Review extends RecordBase<"review"> {
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly head: Sha;
  readonly verdict: Verdict;
  readonly scope: readonly Glob[];
  readonly dependsOn: readonly Glob[];
  readonly text: string;
  /** Obligations this verdict met on admission, with how. */
  readonly fulfils: readonly { readonly obligation: ObligationId; readonly evidence: Evidence }[];
}

export interface Check extends RecordBase<"check"> {
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly obligation: ObligationId;
  readonly check: CheckerName;
  readonly integration: Sha;
  readonly input: CheckInput;
  readonly config: Digest;
  readonly runner: Digest;
  readonly volatile: boolean;
  readonly ok: boolean;
  readonly detail: string;
  readonly landOp?: OpId;
}

/** The record of a `land` act: the operation the room now carries out. */
export interface Landing extends RecordBase<"land"> {
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly op: LandOp;
}

export interface Release extends RecordBase<"release"> {
  readonly lane: LaneId;
  readonly note?: string;
}

export interface Renewal extends RecordBase<"renew"> {
  readonly lane: LaneId;
  readonly lease: Lease;
}

export interface RosterRecord extends RecordBase<"roster"> {
  readonly op: RosterOp;
  /** For `invite`: the ID to share with the invitee, with the secret, out of band. */
  readonly invitation?: ActId;
  /** For `revoke-key` with `compromised`: what stopped counting (R-REV-3). */
  readonly invalidated?: {
    readonly evidence: readonly ActId[];
    readonly reopened: readonly { readonly lane: LaneId; readonly generation: Generation; readonly obligation: ObligationId }[];
    readonly abortAttempt?: OpId;
  };
}

/** Every act record, by kind. */
export interface RecordByKind {
  readonly claim: Claim;
  readonly propose: Proposal;
  readonly note: Note;
  readonly review: Review;
  readonly check: Check;
  readonly land: Landing;
  readonly release: Release;
  readonly renew: Renewal;
  readonly roster: RosterRecord;
}

export type ActRecord = RecordByKind[EnvelopeKind];

// ------------------------------------------------- method inputs (all transports)

/** Input to `room.claim()`. Discriminated by `lane`. */
export type ClaimInput =
  | (ClaimBody & { readonly lane?: never })
  | (Omit<ReclaimBody, "lease"> & { readonly lane: Held })
  | (Omit<ReclaimBody, "lease"> & { readonly lane: LaneId });

export type ProposeInput = Omit<ProposeBody, "lease">;
export type NoteInput = NoteBody;
export type ReviewInput = Omit<ReviewBody, "head">;
export type CheckActInput = CheckBody;
export interface ReleaseInput {
  readonly note?: string;
}

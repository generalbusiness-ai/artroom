/**
 * Operations with visible states (plan section 5, principle 6), and the
 * landing operation (plan section 8). Rules R-LAND, R-PUB and R-REV in
 * docs/protocol.md.
 */

import type {
  ActId,
  Digest,
  Generation,
  KeyId,
  LaneId,
  LeaseGeneration,
  ObligationId,
  OpId,
  PolicyVersion,
  PublicationNo,
  RepoPath,
  Seq,
  Sha,
  Timestamp,
} from "./ids.ts";
import type { ArtroomError, Refusal } from "./errors.ts";

export type OpKind = "workspace" | "preview" | "land";

interface OpBase<K extends OpKind> {
  readonly id: OpId;
  readonly kind: K;
  readonly updatedAt: Timestamp;
}

/** A reference to an operation; every operation record satisfies it. */
export interface OpRef<K extends OpKind = OpKind> {
  readonly id: OpId;
  readonly kind: K;
}

// ---------------------------------------------------------------- workspace

/**
 * The public view of a ready workspace. Any member may read it. It never
 * holds a credential (R-WS-1).
 */
export interface WorkspaceDetail {
  /** The lane's Artifacts fork remote. Not a secret. */
  readonly remote: `https://${string}`;
  readonly leaseGeneration: LeaseGeneration;
}

/** A workspace operation, as every read, wait, update and log shows it. Never holds a token (R-WS-1). */
export type WorkspaceOp = OpBase<"workspace"> & { readonly lane: LaneId } & (
    | { readonly state: "pending" }
    | { readonly state: "ready"; readonly detail: WorkspaceDetail }
    | { readonly state: "failed"; readonly error: ArtroomError }
  );

/**
 * The write credential for a lane's fork. Returned only to the current holder,
 * judged afresh at each retrieval (R-WS-2). Never recorded, published,
 * cached or shown anywhere else (R-WS-4, R-SEC-5).
 */
export interface WorkspaceGrant {
  readonly op: OpId;
  readonly lane: LaneId;
  readonly leaseGeneration: LeaseGeneration;
  readonly remote: `https://${string}`;
  /** Write token scoped to this fork and this lease generation. */
  readonly token: string;
  /** No later than the lease's expiry. */
  readonly expiresAt: Timestamp;
}

// ------------------------------------------------------------------ preview

/** A merge preview of one generation against main. Recomputed when main moves. */
export type PreviewOp = OpBase<"preview"> & { readonly lane: LaneId; readonly generation: Generation } & (
    | { readonly state: "pending" }
    | { readonly state: "clean"; readonly base: Sha; readonly integration: Sha }
    | { readonly state: "conflict"; readonly base: Sha; readonly paths: readonly RepoPath[] }
    | { readonly state: "failed"; readonly error: ArtroomError }
  );

// ------------------------------------------------------------------ landing

/** Why a landing operation stopped and needs a new `land` (R-LAND-6). */
export type RetryReason =
  | "generation-moved"
  | "lease-changed"
  | "released"
  | "authority-lost" //      the land initiator's membership, role, key or delegation is no longer current
  | "evidence-invalid" //    evidence no longer counts, e.g. a compromised key (R-REV-3)
  | "obligation-open";

/** Why a landing operation failed. A failure needs a recut or a policy fix. */
export type FailReason =
  | { readonly code: "conflict"; readonly paths: readonly RepoPath[] }
  | { readonly code: "check-failed"; readonly check: ActId }
  | { readonly code: "refused"; readonly refusal: Refusal };

/** What the room saw when it read main back during publication (R-PUB-5). */
export type ReadBack =
  | { readonly main: "expected-main" } //  the forward push has not landed yet
  | { readonly main: "unexpected"; readonly observed: Sha }; // another writer: should be impossible

/** A recorded, best-effort abort attempt after a `compromised` revocation (R-REV-5). */
export interface AbortAttempt {
  readonly trigger: ActId;
  readonly key: KeyId;
  readonly at: Seq;
  readonly tokenRevoked: boolean;
}

/** Fields fixed when the operation is accepted, before any external I/O (R-LAND-1). */
interface LandOpFields extends OpBase<"land"> {
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly head: Sha;
  /** The land act that started it. */
  readonly act: ActId;
  readonly leaseGeneration: LeaseGeneration;
  /** Main as of the current preparation. Changes when the operation re-prepares. */
  readonly expectedMain: Sha;
  readonly policyVersion: PolicyVersion;
  /** Preparations started so far. */
  readonly attempts: number;
}

/** Fields fixed at reservation, the linearization point (R-LAND-7). */
interface Reserved {
  readonly integration: Sha;
  readonly evidence: readonly ActId[];
  readonly publication: PublicationNo;
  /** The log entry of the reservation. Shown as "landing reserved at seq N". */
  readonly reservedAt: Seq;
}

export type LandOp = LandOpFields &
  (
    | { readonly state: "accepted" }
    | {
        readonly state: "preparing";
        readonly integration?: Sha;
        /** Check obligations still waiting for a result on this integration. */
        readonly waiting: readonly ObligationId[];
      }
    | {
        readonly state: "ready";
        readonly integration: Sha;
        readonly evidence: readonly ActId[];
        /**
         * The `digest` of the prospective reservation input that passed the land
         * rules during preparation (`RetainedLandInput`, R-LAND-4). The room keeps
         * its canonical bytes; reservation compares bytes, not this digest
         * (R-LAND-7). Null on a configuration-recovery lane, where land rules are
         * not evaluated (R-ADMIN-5).
         */
        readonly landInput: Digest | null;
      }
    | (Reserved & { readonly state: "publishing"; readonly pushes: number })
    | (Reserved & {
        readonly state: "unresolved";
        readonly since: Timestamp;
        readonly readBack: ReadBack;
        readonly abort?: AbortAttempt;
      })
    | (Reserved & {
        readonly state: "landed";
        readonly receipt: ActId;
        readonly abort?: AbortAttempt;
        /** Opened when the landing completed despite an abort attempt (R-REV-6). */
        readonly revertLane?: LaneId;
      })
    | (Reserved & { readonly state: "aborted"; readonly receipt: ActId; readonly abort: AbortAttempt })
    | { readonly state: "retryable"; readonly reason: RetryReason; readonly receipt: ActId; readonly fix: string }
    | { readonly state: "failed"; readonly reason: FailReason; readonly receipt: ActId }
  );

export type LandState = LandOp["state"];

/** States after which a landing operation never changes again. */
export type LandTerminal = "landed" | "aborted" | "retryable" | "failed";

/** States in which the room's publication slot is held by this operation (R-PUB-2). */
export type SlotHolding = "publishing" | "unresolved";

/** The room's single publication slot (R-PUB-1). */
export type PublicationSlot =
  | { readonly state: "free"; readonly last: PublicationNo }
  | {
      readonly state: "held";
      readonly op: OpId;
      readonly publication: PublicationNo;
      readonly reservedAt: Seq;
      readonly unresolvedSince?: Timestamp;
    };

/** Every operation, by kind. */
export interface OpByKind {
  readonly workspace: WorkspaceOp;
  readonly preview: PreviewOp;
  readonly land: LandOp;
}

export type Op = OpByKind[OpKind];

/** The states of an operation kind. */
export type OpState<K extends OpKind> = OpByKind[K]["state"];

/** Options for `room.wait()`. */
export interface WaitOptions<S extends string> {
  readonly until: readonly S[];
  /** Default 30 000; at most 300 000. On expiry `wait` throws `ArtroomError` code `timeout`. */
  readonly timeoutMs?: number;
}

/** Narrow an operation to the states a caller waited for. */
export type Reached<K extends OpKind, S extends OpState<K>> = Extract<OpByKind[K], { readonly state: S }>;

/** The digest pair a check binds besides its tree (plan section 7). */
export interface CheckBinding {
  readonly integration: Sha;
  readonly config: Digest;
  readonly runner: Digest;
}

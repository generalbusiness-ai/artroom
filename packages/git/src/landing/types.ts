/**
 * Types for the landing operation (plan section 8; protocol sections 12–14).
 * The public view of an operation is the contract's `LandOp`. Everything else
 * here is what the Room supplies, and what the engine records internally.
 */

import type {
  ActId,
  FailReason,
  Generation,
  KeyId,
  LaneId,
  LeaseGeneration,
  ObligationId,
  OpId,
  PolicyVersion,
  PublicationNo,
  RepoPath,
  RetainedLandInput,
  RetryReason,
  Seq,
  Sha,
  SystemEvent,
} from "@generalbusiness/artroom-contract";
import type { PushOutcome } from "../publisher/push-outcome.ts";

// ------------------------------------------------------------ from the Room

/** The lane as the Room sees it now. */
export interface LaneFacts {
  readonly generation: Generation;
  /** The head of the latest generation. */
  readonly head: Sha | null;
  readonly leaseGeneration: LeaseGeneration;
  /** `held`, or how the last lease ended. */
  readonly holder: "held" | "released" | "expired";
}

/**
 * What the Room says about an operation on a built integration (R-LAND-4
 * steps 2 and 3): its obligations, then its land rules evaluated on the
 * prospective reservation input (`stage: "reservation"`). On `ready`,
 * `retained` is that input's canonical bytes and digest; null on a
 * configuration-recovery lane, where land rules are not evaluated.
 */
export type Readiness =
  | { readonly kind: "ready"; readonly evidence: readonly ActId[]; readonly retained: RetainedLandInput | null }
  | { readonly kind: "waiting"; readonly obligations: readonly ObligationId[] }
  | { readonly kind: "failed"; readonly reason: FailReason }
  | { readonly kind: "retry"; readonly reason: RetryReason; readonly fix: string };

/**
 * The Room's side of the landing operation. Every method is synchronous and is
 * called inside the engine's SQLite transaction, so `record` lands in the same
 * transaction as the state change it describes.
 */
export interface LandingRoom {
  lane(lane: LaneId): LaneFacts | null;
  /** The active policy version. */
  policyVersion(): PolicyVersion;
  /**
   * Re-validation judged now, inside the reservation transaction, for the
   * parts only the Room knows (R-LAND-7): the initiator's authority
   * (R-ADM-3), each piece of evidence (R-REV-1, R-ADMIN-2), and the land
   * input. The Room rebuilds the land `RuleInput` with `stage:
   * "reservation"` and compares its canonical bytes with `retained`
   * (`matchesRetainedLandInput`). It must not hash, evaluate or await.
   * Null when everything still holds.
   */
  revalidate(op: LandRecord, retained: RetainedLandInput | null): { readonly reason: RetryReason; readonly fix: string } | null;
  /**
   * Obligations and land rules on a built integration (R-LAND-4). Called
   * outside any engine transaction, so it may await (policy evaluation and
   * SHA-256 are asynchronous). Its answer is applied only if the operation
   * has not moved on meanwhile.
   */
  readiness(op: LandRecord, integration: Sha): Promise<Readiness>;
  /** The changed paths of a landing, for a revert lane's scope (R-REV-6). */
  revertScope(op: LandRecord): readonly RepoPath[];
  /** Append a system event to the log, in the caller's transaction. */
  record(event: SystemEvent): { readonly seq: Seq; readonly act: ActId };
}

// ------------------------------------------------------------ internal record

/** One push attempt of a reserved publication (R-PUB-3, R-PUB-5). */
export interface PushAttempt {
  readonly n: number;
  readonly startedAt: number;
  /** The 60 s canonical write token's ID once minted. Never the token itself. */
  tokenId: string | null;
  tokenRevoked: boolean;
  /** Null while the push is in flight, or if the room stopped before learning the result. */
  outcome: PushOutcome["outcome"] | null;
  detail?: string;
}

export type LandRecordState =
  | "accepted"
  | "preparing"
  | "ready"
  | "publishing"
  | "unresolved"
  | "landed"
  | "aborted"
  | "retryable"
  | "failed";

/** The stored form of a landing operation. Its public view is `LandOp`. */
export interface LandRecord {
  readonly id: OpId;
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly head: Sha;
  readonly act: ActId;
  readonly leaseGeneration: LeaseGeneration;
  /** Order of acceptance; ready operations reserve in this order. */
  readonly order: number;
  readonly createdAt: number;
  state: LandRecordState;
  expectedMain: Sha;
  policyVersion: PolicyVersion;
  attempts: number;
  updatedAt: number;
  // preparation
  integration?: Sha;
  /** Where the integration commit is stored in the canonical repo. */
  integrationRef?: string;
  waiting?: ObligationId[];
  evidence?: ActId[];
  /** The retained prospective reservation input (R-LAND-4). Its digest is `ready.landInput`. */
  retained?: RetainedLandInput | null;
  /** The integration is built and the Room's readiness answer is due. */
  readinessPending?: boolean;
  /** When a failed preparation step may run again. */
  retryAt?: number;
  prepareBackoffMs?: number;
  lastError?: string;
  // reservation and publication
  publication?: PublicationNo;
  reservedAt?: Seq;
  pushes?: PushAttempt[];
  since?: number;
  readBack?: { main: "expected-main" } | { main: "unexpected"; observed: Sha };
  /** When the next forward step is due. */
  nextAt?: number;
  backoffMs?: number;
  /** An abort attempt (R-REV-5). `recorded` once its `abort-attempt` event is in the log. */
  abort?: { trigger: ActId; key: KeyId; at: Seq; tokenRevoked: boolean; recorded: boolean };
  // outcome
  receipt?: ActId;
  reason?: RetryReason | FailReason;
  fix?: string;
  revertLane?: LaneId;
}

/** What `accept` needs; the Room has already admitted the `land` act (R-LAND-1). */
export interface AcceptInput {
  readonly id: OpId;
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly head: Sha;
  readonly act: ActId;
  readonly leaseGeneration: LeaseGeneration;
  readonly policyVersion: PolicyVersion;
}

/** What a reservation attempt did. */
export type ReserveResult =
  | { readonly kind: "reserved"; readonly publication: PublicationNo; readonly reservedAt: Seq }
  | { readonly kind: "slot-held"; readonly by: OpId }
  | { readonly kind: "not-ready"; readonly state: LandRecordState | null }
  | { readonly kind: "re-prepare" }
  | { readonly kind: "retryable"; readonly reason: RetryReason };

/** Shown to admins for a held slot (plan section 8: "publication unresolved since …"). */
export interface PublicationStatus {
  readonly op: OpId;
  readonly lane: LaneId;
  readonly state: "publishing" | "unresolved";
  readonly publication: PublicationNo;
  readonly reservedAt: Seq;
  readonly integration: Sha;
  readonly expectedMain: Sha;
  readonly since: string | null;
  readonly readBack: LandRecord["readBack"] | null;
  readonly unexpectedWriter: boolean;
  readonly aborting: boolean;
  readonly pushes: readonly {
    readonly n: number;
    readonly outcome: PushOutcome["outcome"] | "in-flight-or-lost";
    readonly tokenRevoked: boolean;
  }[];
  readonly nextAttemptAt: string | null;
  readonly lastError: string | null;
}

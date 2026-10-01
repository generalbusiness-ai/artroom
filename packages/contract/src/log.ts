/**
 * The versioned log format `artroom-log-v1` (plan sections 8 and 14.3):
 * sequence and hash chain, system receipts, retained policy inputs,
 * checkpoints and `publishedThrough`. Rules R-LOG in docs/protocol.md.
 */

import type {
  ActId,
  Base64Url,
  Digest,
  Generation,
  KeyId,
  LaneId,
  LeaseGeneration,
  MemberId,
  ObligationId,
  OpId,
  PolicyVersion,
  PublicationNo,
  RoomId,
  Seq,
  Sha,
  Timestamp,
} from "./ids.ts";
import type { Authority, EnvelopeKind, Flag } from "./acts.ts";
import type { SignedEnvelope } from "./envelope.ts";
import type { LaneEffect } from "./lanes.ts";
import type { AbortAttempt, FailReason, ReadBack, RetryReason } from "./landing.ts";
import type { Decision } from "./policy.ts";
import type { Genesis } from "./roster.ts";
import type { Refusal } from "./errors.ts";

export type LogFormat = "artroom-log-v1";

/** What an accepted act changed, besides its own record. */
export type Effect =
  | LaneEffect
  | { readonly type: "obligations"; readonly lane: LaneId; readonly generation: Generation; readonly opened: readonly ObligationId[]; readonly met: readonly ObligationId[] }
  | { readonly type: "land-op"; readonly op: OpId; readonly state: "accepted" | "retryable" }
  | { readonly type: "attention"; readonly to: readonly MemberId[] };

/** The room's receipt for an accepted act. */
export interface Receipt {
  readonly outcome: "accepted";
  readonly authority: Authority;
  readonly decisions: readonly Decision[];
  readonly effects: readonly Effect[];
  readonly flags: readonly Flag[];
  /** The reservation held when this act was admitted (R-LAND-8). */
  readonly after?: OpId;
}

/** The room's receipt for a recorded refusal (R-ADM-8). */
export interface RefusalReceipt {
  readonly outcome: "refused";
  readonly authority: Authority;
  readonly decisions: readonly Decision[];
  readonly refusal: Omit<Refusal, "act">;
}

/** Events the room itself records, signed by the room key (plan section 4). */
export type SystemEvent =
  | { readonly type: "genesis"; readonly genesis: Genesis; readonly sig: Base64Url }
  | { readonly type: "lease-expired"; readonly lane: LaneId; readonly holder: MemberId; readonly leaseGeneration: LeaseGeneration }
  | {
      readonly type: "policy-activated";
      readonly policy: Digest;
      /** The landed commit that carried the policy change; null for the initial policy. */
      readonly commit: Sha | null;
      readonly previous: PolicyVersion | null;
      /** Recomputed obligations, re-evaluated carried evidence, fenced landing operations (R-POL-9). */
      readonly recomputed: { readonly proposals: number; readonly reopened: number; readonly fenced: readonly OpId[] };
    }
  | {
      readonly type: "land-reserved";
      readonly op: OpId;
      readonly lane: LaneId;
      readonly generation: Generation;
      readonly integration: Sha;
      readonly expectedMain: Sha;
      readonly evidence: readonly ActId[];
      readonly publication: PublicationNo;
    }
  | { readonly type: "abort-attempt"; readonly op: OpId; readonly attempt: AbortAttempt }
  | { readonly type: "publication-unresolved"; readonly op: OpId; readonly readBack: ReadBack }
  | {
      readonly type: "land-outcome";
      readonly op: OpId;
      readonly outcome:
        | { readonly state: "landed"; readonly commit: Sha; readonly publication: PublicationNo; readonly revertLane?: LaneId }
        | { readonly state: "aborted"; readonly publication: PublicationNo }
        | { readonly state: "retryable"; readonly reason: RetryReason }
        | { readonly state: "failed"; readonly reason: FailReason };
    }
  | { readonly type: "revert-lane"; readonly lane: LaneId; readonly of: OpId; readonly reason: "abort-after-landing" | "objection-after-reservation" | "compromised-evidence" }
  | { readonly type: "checkpoint"; readonly checkpoint: Checkpoint };

/** One log entry. Hash and room signature are defined in R-LOG-2 and R-LOG-4. */
export interface LogEntry {
  readonly format: LogFormat;
  readonly seq: Seq;
  /** The previous entry's hash; null only for genesis (seq 0). */
  readonly prev: Digest | null;
  /** Room clock at admission. Informational. */
  readonly at: Timestamp;
  readonly entry:
    | { readonly type: "act"; readonly act: SignedEnvelope; readonly receipt: Receipt }
    | { readonly type: "refusal"; readonly act: SignedEnvelope; readonly receipt: RefusalReceipt }
    | { readonly type: "system"; readonly event: SystemEvent };
  /** sha256 of the canonical bytes of every field above. */
  readonly hash: Digest;
  /** Ed25519 by the room key over `artroom-entry-v1\n` + `hash`. */
  readonly roomSig: Base64Url;
}

/** The ID of an entry: `act_<seq>_<first 8 hex of hash>`. */
export type EntryId = ActId;

/**
 * A publication of the log prefix to `refs/artroom/log` (R-LOG-8). The
 * checkpoint names the last entry included; `publishedThrough` becomes its seq.
 */
export interface Checkpoint {
  readonly format: LogFormat;
  readonly room: RoomId;
  readonly through: Seq;
  readonly hash: Digest;
  /** The git commit on `refs/artroom/log` that holds the prefix. */
  readonly commit: Sha;
  readonly at: Timestamp;
  readonly roomKey: KeyId;
  /** Ed25519 by the room key over `artroom-checkpoint-v1\n` + JCS of the fields above. */
  readonly sig: Base64Url;
}

/** The tree layout of each commit on `refs/artroom/log` (R-LOG-9). */
export interface PublishedLayout {
  readonly "artroom-log/v1/genesis.json": Genesis;
  /** Entries `first`..`last` as JCS lines; a segment holds at most 1 000 entries. */
  readonly [segment: `artroom-log/v1/segments/${string}.jsonl`]: string;
  /** Retained policy inputs, by digest. */
  readonly [input: `artroom-log/v1/inputs/${string}.json`]: unknown;
  /** Every activated policy document and checker configuration, by digest. */
  readonly [policy: `artroom-log/v1/policies/${string}.json`]: unknown;
  readonly "artroom-log/v1/checkpoint.json": Checkpoint;
}

/** A summary used by subscriptions and attention: enough to decide whether to fetch the entry. */
export interface EntrySummary {
  readonly id: ActId;
  readonly seq: Seq;
  readonly type: "act" | "refusal" | "system";
  readonly kind: EnvelopeKind | SystemEvent["type"];
  readonly lane?: LaneId;
  readonly by?: MemberId | null;
  readonly at: Timestamp;
}

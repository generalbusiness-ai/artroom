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
  RepoPath,
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

/**
 * What an accepted act changed, besides its own record. Effects never name
 * the entry that holds them (R-LOG-12). Attention is not an effect: it comes
 * from later `notified` entries and from projections (R-LOG-13).
 */
export type Effect =
  | LaneEffect
  | {
      readonly type: "obligations";
      readonly lane: LaneId;
      readonly generation: Generation;
      readonly opened: readonly ObligationId[];
      readonly met: readonly ObligationId[];
    }
  /** `op` is `op_land_<seq>`, from this entry's seq, never its hash (R-ID-8). */
  | { readonly type: "land-op"; readonly op: OpId; readonly state: "accepted" | "retryable" };

/** The room's receipt for an accepted act. Sealed with the entry; never changed (R-LOG-13). */
export interface Receipt {
  readonly outcome: "accepted";
  readonly authority: Authority;
  /** Decisions made before the entry was sealed: `refuse`, `require`, `carry`, `land`. Never `notify`. */
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
        | { readonly state: "landed"; readonly commit: Sha; readonly publication: PublicationNo }
        | { readonly state: "aborted"; readonly publication: PublicationNo }
        | { readonly state: "retryable"; readonly reason: RetryReason }
        | { readonly state: "failed"; readonly reason: FailReason };
    }
  /** Opens an unheld revert lane. The lane is this entry, so its ID is not written here (R-LOG-12). */
  | {
      readonly type: "revert-lane";
      readonly of: OpId;
      readonly scope: readonly RepoPath[];
      readonly reason: "abort-after-landing" | "objection-after-reservation" | "compromised-evidence";
    }
  /**
   * The outcome of `notify` rules for an earlier, already sealed entry
   * (R-LOG-13). Recorded once per notified entry, after it.
   */
  | {
      readonly type: "notified";
      readonly entry: ActId;
      readonly decisions: readonly Decision[];
      readonly to: readonly MemberId[];
    }
  /** A confirmed publication: names the log commit, which never contains this event (R-LOG-8). */
  | { readonly type: "checkpoint"; readonly through: Seq; readonly hash: Digest; readonly commit: Sha };

/**
 * The hashed content of an entry, before it is sealed. Built in this order
 * (R-LOG-2): seq and prev are known first; the receipt is complete before
 * hashing and never contains the entry's own hash or ID.
 */
export interface EntryContent {
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
}

/** One sealed log entry: its content, then the hash of the content and the room's signature over that hash. */
export interface LogEntry extends EntryContent {
  /** sha256 of the canonical bytes of `EntryContent`. */
  readonly hash: Digest;
  /** Ed25519 by the room key over `artroom-entry-v1\n` + `hash`. */
  readonly roomSig: Base64Url;
}

/** The ID of an entry: `act_<seq>_<first 8 hex of hash>`, derived after sealing (R-ID-1). */
export type EntryId = ActId;

/**
 * The signed statement inside a log commit (R-LOG-8). It covers the prefix
 * through `through` by that entry's hash. It never names a git commit, so
 * it can be written into the commit it describes.
 */
export interface Checkpoint {
  readonly format: LogFormat;
  readonly room: RoomId;
  readonly through: Seq;
  /** The hash of entry `through`. */
  readonly hash: Digest;
  readonly at: Timestamp;
  readonly roomKey: KeyId;
  /** Ed25519 by the room key over `artroom-checkpoint-v1\n` + JCS of the fields above. */
  readonly sig: Base64Url;
}

/** The tree layout of each commit on `refs/artroom/log` (R-LOG-9). */
export interface PublishedLayout {
  readonly "artroom-log/v1/genesis.json": Genesis;
  /** Entries `first`..`first + 999` as JCS lines. */
  readonly [segment: `artroom-log/v1/segments/${string}.jsonl`]: string;
  /** Retained replay contexts (R-EVAL-8), by digest. */
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

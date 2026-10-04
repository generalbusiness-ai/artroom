/**
 * The versioned log format `artroom-log-v1` (plan sections 8 and 14.3):
 * sequence and hash chain, system receipts, retained policy inputs,
 * checkpoints and `publishedThrough`. Rules R-LOG in docs/protocol.md.
 */

import type {
  ActId,
  Base64Url,
  CheckerName,
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
import type { CarryReason, NotCarried } from "./evidence.ts";
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
      /**
       * Every checker configuration active from this version, as name and
       * digest pairs sorted by name; empty when there are none. Each digest
       * names a file under `artroom-log/v1/policies/` (R-LOG-9). A check's
       * `config` must equal its checker's digest here (R-OBL-3).
       */
      readonly checkers: readonly CheckerDigest[];
      /** The landed commit that carried the policy change; null for the initial policy. */
      readonly commit: Sha | null;
      readonly previous: PolicyVersion | null;
      /**
       * Known when the event is sealed (R-POL-9): `proposals` is the number of
       * open proposals to recompute, `fenced` the landing operations sent back
       * to `preparing`. `reopened` is always 0: recomputation needs policy
       * evaluation, which runs after this entry, so each proposal's result is a
       * later `obligations-recomputed` event.
       */
      readonly recomputed: { readonly proposals: number; readonly reopened: 0; readonly fenced: readonly OpId[] };
    }
  /**
   * One open proposal's obligations, recomputed under a newly active policy
   * (R-POL-9). Sealed after the `policy-activated` event it names.
   */
  | {
      readonly type: "obligations-recomputed";
      /** The `policy-activated` entry that caused the recomputation. */
      readonly policy: PolicyVersion;
      readonly lane: LaneId;
      readonly generation: Generation;
      /** The `require` and `carry` decisions made while recomputing. */
      readonly decisions: readonly Decision[];
      /** The proposal's obligations under the new policy. */
      readonly obligations: readonly ObligationId[];
      /** Obligations that were met before and are open now. */
      readonly reopened: readonly ObligationId[];
      /** Present when a `require` rule failed deterministically; `land` is refused with it (R-POL-9). */
      readonly blocked?: Omit<Refusal, "act">;
    }
  /**
   * Whether an earlier check carries onto a new integration, judged during
   * preparation (R-CARRY-13). One event per judgment, carried or not. A
   * check counts as carried only on `integration`, under `policy`, and only
   * after this event is sealed.
   */
  | {
      readonly type: "check-carried";
      readonly op: OpId;
      readonly lane: LaneId;
      readonly generation: Generation;
      /** The new integration the check would count for. */
      readonly integration: Sha;
      readonly obligation: ObligationId;
      /** The earlier `check` act. */
      readonly act: ActId;
      /** The policy version that judged it: the operation's. */
      readonly policy: PolicyVersion;
      readonly outcome: { readonly carried: true; readonly reason: CarryReason } | { readonly carried: false; readonly notCarried: NotCarried };
      /** The `carry` rule decisions; empty when no rule applied or a platform condition failed first. */
      readonly decisions: readonly Decision[];
    }
  /**
   * The land rules evaluated during preparation on the prospective
   * reservation input (R-LAND-4 step 3). One event per evaluation. When a
   * rule blocks, the operation's `failed` outcome follows.
   */
  | {
      readonly type: "land-evaluated";
      readonly op: OpId;
      readonly integration: Sha;
      /** `RetainedLandInput.digest`: the digest of the `stage: "reservation"` input evaluated. */
      readonly landInput: Digest;
      readonly decisions: readonly Decision[];
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

/** A checker configuration named by `policy-activated`: the checker's name and the digest of its configuration. */
export interface CheckerDigest {
  readonly name: CheckerName;
  readonly config: Digest;
}

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
  /**
   * The commit's layout (R-LOG-16). Absent: layout 1, as R-LOG-9 was first
   * written. Once a log commit has a layout, every later one has the same.
   */
  readonly layout?: LogLayout;
  /** Ed25519 by the room key over `artroom-checkpoint-v1\n` + JCS of the fields above. */
  readonly sig: Base64Url;
}

/**
 * Layout 2 of a log commit (R-LOG-16 to R-LOG-19): segments close at a byte
 * bound as well as at 1,000 entries, any file over the bound is chunked,
 * and every directory is fanned out. Named in the signed checkpoint.
 */
export interface LogLayout {
  readonly version: 2;
  /**
   * The first seq placed by the byte rule (R-LOG-17): 0 for a log that
   * began in layout 2, otherwise the `through` of the first layout 2
   * commit's parent plus one. Fixed by the first layout 2 commit; it never
   * changes after that.
   */
  readonly from: Seq;
}

/**
 * The segment line that stands for an entry whose canonical line is over
 * the object bound (R-LOG-18). The entry itself is the chunked file
 * `artroom-log/v1/entries/<seq>.jsonl`; `bytes` and `digest` (SHA-256 of
 * the line) let a reader check the reassembled bytes before it checks the
 * entry's own hash and signature.
 */
export interface ChunkedLine {
  readonly chunked: { readonly bytes: number; readonly digest: Digest };
  readonly seq: Seq;
}

/**
 * The tree layout of each commit on `refs/artroom/log` (R-LOG-9, R-LOG-16).
 * In layout 2 every directory below is fanned out (R-LOG-19), so a path may
 * have shard directories before the file name, and a file over the object
 * bound is a directory of chunks at the same path (R-LOG-18).
 */
export interface PublishedLayout {
  readonly "artroom-log/v1/genesis.json": Genesis;
  /** Entries from `first`, as JCS lines joined by newlines. Layout 1: `first`..`first + 999`. Layout 2: closed by R-LOG-17; a line over the bound is a `ChunkedLine`. */
  readonly [segment: `artroom-log/v1/segments/${string}.jsonl`]: string;
  /** Layout 2 only: the canonical line of each entry over the object bound, by seq (R-LOG-18). */
  readonly [entry: `artroom-log/v1/entries/${string}.jsonl`]: string;
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
  /** A legacy, platform or declared kind (R-DECL-2), or a system event's type. */
  readonly kind: EnvelopeKind | import("./declarations.ts").KindName | SystemEvent["type"];
  readonly lane?: LaneId;
  readonly by?: MemberId | null;
  readonly at: Timestamp;
}

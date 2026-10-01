/**
 * The Room's ports: small interfaces for the work it does not do itself.
 *
 * - `PolicyPort`: evaluates policy rules (lane C's package).
 * - `LandingPort` and `LandingHost`: the landing engine (lane B's package)
 *   and the Room's side of it. They match lane B's `Landing` class and its
 *   `LandingRoom` interface, so the adapter is a constructor call.
 * - `ArtifactsPort`: forks, tokens, heads, diffs, previews and the log ref
 *   (Cloudflare Artifacts, through lane B's helpers).
 *
 * The Room keeps every platform rule itself: authority, roles, lanes and
 * leases, obligations from `.artroom/**`, custody, idempotency, secrets and
 * the log. A port never decides one of those.
 */

import type { CarryFacts, InputOf, ObligationSpec } from "@generalbusiness/artroom-policy";
import type {
  ActId,
  Carried,
  Checkpoint,
  CheckerConfig,
  Decision,
  Digest,
  FailReason,
  Generation,
  KeyId,
  LandOp,
  LaneId,
  LogEntry,
  LanePurpose,
  LeaseGeneration,
  NotifyDirectory,
  MemberId,
  NotCarried,
  ObligationId,
  OpId,
  PathChange,
  PinnedRef,
  PolicyDocument,
  PolicyVersion,
  ProfileStamp,
  PublicationSlot,
  Refusal,
  RepoPath,
  ReplayContext,
  RetainedLandInput,
  RetryReason,
  Seq,
  Sha,
  SystemEvent,
  TeamId,
} from "@generalbusiness/artroom-contract";

// ------------------------------------------------------------------- policy

/** The active policy: the pinned, immutable document and the ID of the event that activated it. */
export interface ActivePolicy {
  readonly doc: PolicyDocument;
  readonly version: PolicyVersion;
}

/** One rule's recorded decision and its retained replay context (R-POL-11, R-LOG-7). */
export interface Evaluation {
  readonly decision: Decision;
  /** The owned replay context; `decision.input` is its digest. */
  readonly context: ReplayContext;
}

export type { CarryFacts, InputOf, NotifyDirectory, ObligationSpec, ReplayContext, RetainedLandInput };

/** Options for one evaluate call. `budget` is the act's one meter, shared in order by its calls (R-EVAL-9). */
export interface EvalOptions {
  readonly budget: unknown;
}

/**
 * Policy evaluation (lane C's package; `policy.ts` is the adapter). Every
 * method may throw an `ArtroomError` with code `policy-runtime` for a
 * runtime failure; the Room then records nothing (R-EVAL-5, R-ADM-9). A
 * deterministic failure is an outcome: a refusal for `refuse`, `require`
 * and `land`, no carry for `carry` (R-EVAL-5).
 *
 * The lane purpose travels in `input.lane.purpose` (and in `purpose` for
 * carry), so it is recorded in the replay context (R-EVAL-8). The Room also
 * skips `refuse`, `require`, `carry` and `land` itself on a
 * configuration-recovery lane, and `refuse` for a roster act by an admin or
 * the recovery key (R-ADMIN-3, R-ADMIN-5): those are platform rules.
 */
export interface PolicyPort {
  /** Recorded with every decision (R-EVAL-4). */
  readonly stamp: ProfileStamp;
  /** The policy used when main has no `.artroom/policy.json` (R-POL-7). */
  defaultPolicy(): PolicyDocument;
  /** Schema and profile checks for a proposed or activated policy (R-POL-1). */
  validatePolicy(doc: unknown): { readonly ok: true; readonly doc: PolicyDocument } | { readonly ok: false; readonly problems: readonly string[] };
  validateChecker(doc: unknown): { readonly ok: true; readonly config: CheckerConfig } | { readonly ok: false; readonly problems: readonly string[] };
  /** A fresh per-act budget. One act passes the same one to each of its calls, in order. */
  actBudget(): unknown;
  refuse(
    policy: ActivePolicy,
    input: InputOf<"refuse">,
    opts: EvalOptions & { readonly recoveryKey: boolean },
  ): Promise<{ readonly refusal: Refusal | null; readonly evaluations: readonly Evaluation[] }>;
  require(
    policy: ActivePolicy,
    input: InputOf<"require">,
    opts: EvalOptions,
  ): Promise<{ readonly refusal: Refusal | null; readonly obligations: readonly ObligationSpec[]; readonly evaluations: readonly Evaluation[] }>;
  carry(
    policy: ActivePolicy,
    input: InputOf<"carry">,
    facts: CarryFacts,
    opts: EvalOptions & { readonly purpose: LanePurpose },
  ): Promise<{ readonly carried: Carried | null; readonly notCarried: NotCarried | null; readonly evaluations: readonly Evaluation[] }>;
  /**
   * `land` rules. At stage `reservation`, a pass returns the retained input
   * whose canonical bytes reservation compares (R-LAND-4, R-LAND-7).
   */
  land(
    policy: ActivePolicy,
    input: InputOf<"land">,
    opts: EvalOptions,
  ): Promise<{ readonly refusal: Refusal | null; readonly retained: RetainedLandInput | null; readonly evaluations: readonly Evaluation[] }>;
  /** Synchronous, no hashing: the rebuilt reservation input equals the retained bytes (R-LAND-7). */
  matchesRetained(retained: RetainedLandInput, rebuilt: InputOf<"land">): boolean;
  /** Build the notify replay context once; the durable queue keeps it for retries (R-LOG-13). */
  notifyContext(input: InputOf<"notify">, directory: NotifyDirectory): Extract<ReplayContext, { readonly kind: "notify" }>;
  notify(
    policy: ActivePolicy,
    context: Extract<ReplayContext, { readonly kind: "notify" }>,
  ): Promise<{ readonly notify: readonly { readonly to: MemberId | TeamId; readonly rule: string; readonly why: string }[]; readonly evaluations: readonly Evaluation[] }>;
}

// ------------------------------------------------------------------ landing

/** The synchronous SQLite surface (lane B's `Sql`). */
export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;
export interface Sql {
  all(query: string, ...bindings: SqlValue[]): SqlRow[];
  /** Run `fn` atomically; a throw rolls back. Nesting is allowed. */
  transaction<T>(fn: () => T): T;
}

/** The lane as the Room sees it now (lane B's `LaneFacts`). */
export interface LaneFacts {
  readonly generation: Generation;
  readonly head: Sha | null;
  readonly leaseGeneration: LeaseGeneration;
  readonly holder: "held" | "released" | "expired";
}

/** The landing operation fields the Room reads (a subset of lane B's `LandRecord`). */
export interface LandRecordLike {
  readonly id: OpId;
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly head: Sha;
  readonly act: ActId;
  readonly leaseGeneration: LeaseGeneration;
  readonly policyVersion: PolicyVersion;
  readonly integration?: Sha;
  readonly evidence?: readonly ActId[];
  readonly landInput?: Digest | null;
}

/** Lane B's `Readiness`. */
export type Readiness =
  | { readonly kind: "ready"; readonly evidence: readonly ActId[]; readonly landInput: Digest | null }
  | { readonly kind: "waiting"; readonly obligations: readonly ObligationId[] }
  | { readonly kind: "failed"; readonly reason: FailReason }
  | { readonly kind: "retry"; readonly reason: RetryReason; readonly fix: string };

/**
 * The Room's side of the landing operation (lane B's `LandingRoom`). Every
 * method is synchronous and runs inside the engine's SQLite transaction.
 */
export interface LandingHost {
  lane(lane: LaneId): LaneFacts | null;
  policyVersion(): PolicyVersion;
  revalidate(op: LandRecordLike): { readonly reason: RetryReason; readonly fix: string } | null;
  readiness(op: LandRecordLike, integration: Sha): Readiness;
  revertScope(op: LandRecordLike): readonly RepoPath[];
  /** Seal a system event in the caller's transaction. */
  record(event: SystemEvent): { readonly seq: Seq; readonly act: ActId };
}

/** What `accept` needs (lane B's `AcceptInput`). */
export interface AcceptInput {
  readonly id: OpId;
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly head: Sha;
  readonly act: ActId;
  readonly leaseGeneration: LeaseGeneration;
  readonly policyVersion: PolicyVersion;
}

/**
 * The landing engine (lane B's `Landing`). `accept`, `laneChanged`,
 * `policyActivated`, `abort`, `evaluate` and `after` are synchronous and are
 * called inside the Room's transactions. `reconcile` is the alarm's work.
 */
export interface LandingPort {
  accept(input: AcceptInput): LandRecordLike | Refusal;
  laneChanged(lane: LaneId, reason: RetryReason, fix?: string): readonly LandRecordLike[];
  policyActivated(version: PolicyVersion): readonly OpId[];
  abort(trigger: ActId, key: KeyId, at: Seq): LandRecordLike | null;
  evaluate(id: OpId): LandRecordLike | null;
  after(): { readonly op: OpId; readonly reservedAt: Seq } | null;
  view(id: OpId): LandOp | null;
  slot(): PublicationSlot;
  activeViews(): readonly LandOp[];
  nextDue(): number | null;
  /** Main as last recorded, or null before the first read. */
  main(): Sha | null;
  refreshMain(): Promise<Sha>;
  reconcile(): Promise<void>;
}

export type LandingFactory = (sql: Sql, host: LandingHost) => LandingPort;

// ---------------------------------------------------------------- artifacts

/** The raw `.artroom/` configuration files at one commit. */
export interface ArtroomConfig {
  readonly policy: string | null;
  /** By checker name: the raw text of `.artroom/checkers/<name>.json`. */
  readonly checkers: Readonly<Record<string, string>>;
}

export type DiffResult =
  | { readonly kind: "ok"; readonly base: Sha; readonly changed: readonly PathChange[] }
  | { readonly kind: "too-large"; readonly base: Sha };

export type PreviewResult =
  | { readonly kind: "clean"; readonly base: Sha; readonly integration: Sha }
  | { readonly kind: "conflict"; readonly base: Sha; readonly paths: readonly RepoPath[] };

/**
 * Artifacts and git. Every method may throw; the Room turns a failure into
 * `ArtroomError` `unavailable` and records nothing (R-PROP-1).
 */
export interface ArtifactsPort {
  /** Create the room's repository for a public founding (R-GEN-12). Idempotent: an existing one can only be this founding's own. */
  createRepo(identity: string): Promise<void>;
  readMain(): Promise<Sha | null>;
  readConfig(commit: Sha): Promise<ArtroomConfig>;
  treeOf(commit: Sha): Promise<Sha | null>;
  /** Create the lane's fork if needed. Idempotent. */
  ensureFork(lane: LaneId): Promise<{ readonly remote: `https://${string}` }>;
  /** A write token for the lane's fork, expiring no later than `expiresAt` (R-CRED-8). */
  mintForkToken(lane: LaneId, lease: LeaseGeneration, expiresAt: number): Promise<{ readonly id: string; readonly token: string; readonly expiresAt: number }>;
  revokeForkToken(lane: LaneId, id: string): Promise<void>;
  /** Is `head` reachable in the lane's fork (R-PROP-1)? */
  headInFork(lane: LaneId, head: Sha): Promise<boolean>;
  /** Copy the head's objects to `refs/artroom/objects/<head>` (R-PROP-1 step 1). Idempotent. */
  pinObjects(lane: LaneId, head: Sha): Promise<void>;
  /** Create the pinned ref (R-PROP-1 step 2). Idempotent; never moves an existing ref. */
  pinRef(ref: PinnedRef, head: Sha): Promise<void>;
  /** Changed paths from the merge base of main and head, to head, bounded (R-PROP-3, R-PROP-6). */
  diff(main: Sha | null, head: Sha): Promise<DiffResult>;
  /** Paths changed between two heads, old and new, for carrying; null when too large. */
  changedBetween(from: Sha, to: Sha): Promise<readonly RepoPath[] | null>;
  /** A merge preview of head onto main (R-PROP-7). */
  preview(head: Sha, main: Sha | null): Promise<PreviewResult>;
}

// ---------------------------------------------------------------- log publication

/** A retained file for a log commit: a replay context (`input`) or a policy or checker document (`policy`). */
export interface RetainedFile {
  readonly kind: "input" | "policy";
  /** Canonical JSON text; its digest names the file. */
  readonly body: string;
}

/**
 * Publication of the log (R-LOG-8), shaped like lane L's `LogPublisher`, so
 * `LogPublisher.open(remote)` is the adapter. `publish` is deterministic: the
 * same entries, checkpoint and retained files always give the same commit.
 * It pushes with a lease on the previous log commit, reads the ref back after
 * an unclear answer, completes forward, never forces, and returns only once
 * the ref is confirmed at the new commit. Failures are thrown with a `code`:
 * `would-rewrite`, `invalid-input`, `unexpected-writer` or `unresolved`; any
 * other throw is a transport failure. The Room keeps the pending cohort
 * durable, so a retry, even after a restart, passes the same input.
 */
export interface PublisherPort {
  /** The last entry the ref is known to publish, or -1. */
  readonly publishedThrough: Seq;
  readonly head: Sha | null;
  publish(
    entries: readonly LogEntry[],
    checkpoint: Checkpoint,
    retained: readonly RetainedFile[],
  ): Promise<{ readonly commit: Sha; readonly through: Seq; readonly hash: Digest; readonly publishedThrough: Seq }>;
}

// ---------------------------------------------------------------- all ports

export interface Ports {
  readonly policy: PolicyPort;
  readonly artifacts: ArtifactsPort;
  readonly landing: LandingFactory;
  /** Open (or resume from the ref) the log publisher. */
  readonly log: () => Promise<PublisherPort>;
}

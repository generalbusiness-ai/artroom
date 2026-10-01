/**
 * The Room's ports: small interfaces for the work it does not do itself.
 *
 * - `PolicyPort`: evaluates policy rules (lane C's package).
 * - `LandingPort` and `LandingHost`: lane B's `Landing` engine and its
 *   `LandingRoom` interface, hosted on the Room's SQLite.
 * - `ArtifactsPort`: the canonical repository, heads, diffs, previews and
 *   snapshots (Cloudflare Artifacts, through lane B's helpers).
 * - `PublisherPort`: lane L's `LogPublisher`.
 *
 * The Room keeps every platform rule itself: authority, roles, lanes and
 * leases, obligations from `.artroom/**`, custody, idempotency, secrets and
 * the log. A port never decides one of those.
 */

import type { CarryFacts, InputOf, ObligationSpec } from "@generalbusiness/artroom-policy";
import type {
  Carried,
  Checkpoint,
  CheckerConfig,
  Decision,
  Digest,
  Glob,
  LaneId,
  LogEntry,
  LanePurpose,
  NotifyDirectory,
  MemberId,
  NotCarried,
  OpId,
  PathChange,
  PolicyDocument,
  PolicyVersion,
  ProfileStamp,
  Refusal,
  RepoPath,
  ReplayContext,
  RetainedLandInput,
  Seq,
  Sha,
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
export type { Sql, SqlRow, SqlValue } from "@generalbusiness/artroom-git";

/**
 * The landing engine is lane B's `Landing`, hosted on the Room's SQLite.
 * The Room's side of it is lane B's `LandingRoom`: `lane`, `policyVersion`,
 * `revalidate` and `record` are synchronous and run inside the engine's
 * transactions; `readiness` may await (policy evaluation, hashing).
 */
export type { AcceptInput, LaneFacts, LandRecord, LandingRoom as LandingHost, Readiness } from "@generalbusiness/artroom-git";
export type { Landing as LandingPort } from "@generalbusiness/artroom-git";

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

/** A merge preview: the head itself for a fast-forward, otherwise the merge commit lane B's sandbox built. */
export type PreviewResult =
  | { readonly kind: "clean"; readonly base: Sha; readonly integration: Sha }
  | { readonly kind: "conflict"; readonly base: Sha; readonly paths: readonly RepoPath[] };

/**
 * The canonical repository and lane forks, through the Artifacts binding
 * and lane B's helpers (`artifacts.ts`). Every method may throw; the Room
 * turns a failure into `ArtroomError` `unavailable` and records nothing
 * (R-PROP-1). Workspaces (forks and their tokens) are lane B's
 * `Workspaces`, hosted by the Room directly.
 */
export interface ArtifactsPort {
  /** Create the room's repository for a public founding (R-GEN-12). An existing one can only be this founding's own. */
  createRepo(): Promise<void>;
  /** The canonical repository's git remote. */
  canonicalRemote(): Promise<string>;
  readMain(): Promise<Sha | null>;
  readConfig(commit: Sha): Promise<ArtroomConfig>;
  treeOf(commit: Sha): Promise<Sha | null>;
  /** Is `head` in the lane's fork (R-PROP-1)? */
  headInFork(lane: LaneId, head: Sha): Promise<boolean>;
  /** Copy the head's objects to `refs/artroom/objects/<head>` (R-PROP-1 step 1). Idempotent. */
  pinObjects(lane: LaneId, head: Sha): Promise<void>;
  /** Create the pinned ref `refs/artroom/heads/<lane>/<generation>` (R-PROP-1 step 2). Never moves an existing ref. */
  pinRef(lane: LaneId, generation: number, head: Sha): Promise<void>;
  /** Changed paths from the merge base of main and head, to head, bounded (R-PROP-3, R-PROP-6). */
  diff(main: Sha | null, head: Sha): Promise<DiffResult>;
  /** Paths changed between two heads, old and new, for carrying; null when too large. */
  changedBetween(from: Sha, to: Sha): Promise<readonly RepoPath[] | null>;
  /** A merge preview of a pinned generation onto main (R-PROP-7). */
  preview(lane: LaneId, generation: number, head: Sha, main: Sha | null): Promise<PreviewResult>;
  /**
   * The filtered snapshot of a commit for a scoped checker: the digest of the
   * `[path, mode, blob]` triples matching `inputs` (R-CARRY-9); null when the
   * tree is over the diff bounds.
   */
  snapshot(commit: Sha, inputs: readonly Glob[]): Promise<{ readonly digest: Digest; readonly files: number; readonly entries: readonly import("@generalbusiness/artroom-policy").SnapshotEntry[] } | null>;
}

// ---------------------------------------------------------------- log publication

/** A retained file for a log commit (lane L's `Retained`). */
export type { Retained as RetainedFile } from "@generalbusiness/artroom-log";
import type { Retained as RetainedFile } from "@generalbusiness/artroom-log";

/**
 * Publication of the log (R-LOG-8): lane L's `LogPublisher`, opened over a
 * git remote for the canonical repository. The Room keeps the pending cohort
 * durable, stores the exact commit (`commitFor`) before any remote write,
 * and accepts a read-back only at the confirmed parent or at that commit.
 */
export interface PublisherPort {
  readonly publishedThrough: Seq;
  readonly head: Sha | null;
  commitFor(parent: Sha | null, entries: readonly LogEntry[], checkpoint: Checkpoint, retained: readonly RetainedFile[]): Sha;
  publish(
    entries: readonly LogEntry[],
    checkpoint: Checkpoint,
    retained: readonly RetainedFile[],
  ): Promise<{ readonly commit: Sha; readonly through: Seq; readonly hash: Digest; readonly publishedThrough: Seq }>;
}

// ---------------------------------------------------------------- remotes

/**
 * What a deployment gives a Room: the Artifacts binding for its namespace,
 * the publisher sandbox, and the git remote for the log ref. The Room
 * builds the real adapters over them: its `ArtifactsAdapter`, lane B's
 * `Landing`, `Workspaces` and `ContainerPublisher`, and lane L's
 * `LogPublisher`. Tests give fake remotes (`memory/artifacts.ts`).
 */
export interface Remotes {
  readonly artifacts: import("./artifacts.ts").ArtifactsBinding;
  /** The Artifacts namespace the binding reaches. A repository identity in any other namespace is unavailable here. */
  readonly namespace: string;
  /** The room's publisher sandbox (lane B's Publisher Durable Object). */
  readonly publisher: import("@generalbusiness/artroom-git").PublisherStub;
  /** Lane L's git remote for `refs/artroom/log` on the room's repository. */
  readonly logRemote: (repo: import("./artifacts.ts").RepoLocation) => Promise<import("@generalbusiness/artroom-log").GitRemote>;
  /** The most one log push may carry (lane L's `maxTransfer`); default lane L's `LOG_TRANSFER_LIMITS`. */
  readonly logTransfer?: { readonly objects: number; readonly bytes: number } | undefined;
  /** Waits between remote retries. Tests make them instant. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Diff bounds (R-PROP-6), when not lane B's defaults. */
  readonly bounds?: Partial<import("@generalbusiness/artroom-git").DiffBounds>;
  /** Tests only: wrap the Artifacts adapter, to count calls or fail one at the port. */
  readonly wrapArtifacts?: (a: ArtifactsPort) => ArtifactsPort;
  /** Tests only: lane B's landing fault points. */
  readonly landingFault?: (point: import("@generalbusiness/artroom-git").FaultPoint, op: OpId) => void;
}

/** What the Room is given: the policy runtime and the remotes. */
export interface RoomServices {
  readonly policy: PolicyPort;
  readonly remotes: Remotes;
  /**
   * The runner environment digest attested now for a checker, or null. A
   * check carries onto a new integration only if the runner that would run
   * it now is attested to be the earlier check's (R-CARRY-6). No deployment
   * attests one yet, so checks do not carry (review a711f7b6; amendment 3).
   */
  readonly runnerDigest?: (checker: string) => Digest | null;
}

/** The ports the Room's code uses, built by the Room over its services. */
export interface Ports {
  readonly policy: PolicyPort;
  readonly artifacts: ArtifactsPort;
  /** Open (or resume from the ref) the log publisher. */
  readonly log: () => Promise<PublisherPort>;
}

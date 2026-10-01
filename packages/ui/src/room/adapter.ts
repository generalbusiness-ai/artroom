/**
 * The UI's one data adapter. Screens read a `RoomSnapshot` and call the
 * adapter's methods; they never talk to a transport. Two implementations:
 *
 * - `MockRoom` (src/room/mock): a deterministic replay of a scripted
 *   multi-agent scenario, with a timeline for demos and tests.
 * - `LiveRoom` (src/room/live): a stub over the contract's `HttpRoom` and its
 *   WebSocket `watch`.
 *
 * Contract records (Lane, Proposal, LandOp, AttentionItem, Refusal, …) pass
 * through unchanged. The few things the contract has no read for yet are
 * UI-defined here and listed in README.md under "Contract gaps".
 */

import type {
  ActId,
  AttentionItem,
  Check,
  Decision,
  Flag,
  Generation,
  Glob,
  Lane,
  LandOp,
  MemberId,
  Note,
  NoteAnchor,
  OpId,
  PolicyDocument,
  PolicyVersion,
  Proposal,
  ProposalAt,
  ProposalRef,
  PublicationSlot,
  Reason,
  Refusal,
  RepoPath,
  Result,
  Review,
  Role,
  RoomId,
  Rule,
  Seq,
  Sha,
  Timestamp,
  Verdict,
} from "./contract.ts";

export type ActorKind = "person" | "agent" | "service";

/** A roster member as the UI shows it. */
export interface Person {
  readonly handle: MemberId;
  readonly name: string;
  readonly role: Role;
  readonly kind: ActorKind;
  readonly teams: readonly MemberId[];
}

/** One log entry, as the activity feed shows it. */
export interface FeedEntry {
  readonly id: ActId;
  readonly seq: Seq;
  readonly at: Timestamp;
  readonly type: "act" | "refusal" | "system";
  /** The act kind, or the system event type. */
  readonly kind: string;
  readonly by: MemberId | null;
  readonly lane?: ActId;
  /** One plain sentence. */
  readonly text: string;
  readonly refusal?: Refusal;
  /** Admitted while this landing held the publication slot (R-LAND-8). */
  readonly after?: OpId;
  readonly flags: readonly Flag[];
}

/** One rule outcome on one act, for the Policy screen. */
export interface PolicyOutcome {
  readonly seq: Seq;
  readonly at: Timestamp;
  readonly act: ActId;
  readonly actKind: string;
  readonly by: MemberId | null;
  readonly lane?: ActId;
  readonly decision: Decision;
  /** One plain sentence describing the outcome. */
  readonly text: string;
}

export interface PolicyView {
  readonly version: PolicyVersion | null;
  readonly activatedAt: Seq | null;
  /** Null when the transport cannot read the active policy document. */
  readonly document: PolicyDocument | null;
  readonly outcomes: readonly PolicyOutcome[];
}

export interface RoomSnapshot {
  readonly room: { readonly id: RoomId; readonly name: string };
  /** The room clock. In the mock it is the scenario clock, so screens are deterministic. */
  readonly now: Timestamp;
  readonly viewer: MemberId;
  readonly people: readonly Person[];
  /** Main as the room last published it. Null when the transport cannot say. */
  readonly main: { readonly head: Sha | null; readonly movedAt: Timestamp | null };
  readonly lanes: readonly Lane[];
  /** Every generation of every lane, oldest first. */
  readonly proposals: readonly Proposal[];
  readonly reviews: readonly Review[];
  readonly checks: readonly Check[];
  readonly notes: readonly Note[];
  readonly landOps: readonly LandOp[];
  readonly slot: PublicationSlot;
  /** The viewer's attention queue, open and resolved. */
  readonly attention: readonly AttentionItem[];
  /** The log, oldest first, as plain sentences. */
  readonly feed: readonly FeedEntry[];
  readonly log: { readonly head: Seq; readonly publishedThrough: Seq };
  readonly policy: PolicyView;
  readonly source: { readonly kind: "mock" | "live"; readonly status: "live" | "connecting" | "offline"; readonly note?: string };
}

// ------------------------------------------------------------------ diffs

export interface DiffLine {
  readonly kind: "context" | "add" | "del";
  readonly oldLine?: number;
  readonly newLine?: number;
  readonly text: string;
}

export interface DiffHunk {
  readonly header: string;
  readonly lines: readonly DiffLine[];
}

export interface FileDiff {
  readonly path: RepoPath;
  readonly from?: RepoPath;
  readonly status: "added" | "modified" | "deleted" | "renamed";
  readonly hunks: readonly DiffHunk[];
}

// ------------------------------------------------------------------- why

/** What `explain` says about one act, in the UI's terms. */
export interface Why {
  readonly act: ActId;
  readonly title: string;
  readonly by: MemberId | null;
  readonly seq: Seq;
  readonly outcome: "accepted" | "refused" | "system";
  readonly decisions: readonly Decision[];
  readonly invariants: readonly { readonly rule: string; readonly held: boolean; readonly detail?: string }[];
  readonly reasons: readonly Reason[];
  /** True when the entry is at or below `publishedThrough`. */
  readonly published: boolean;
}

// --------------------------------------------------------------- dry run

/** A draft rule the Policy screen can test against history. Compiles to a contract `Rule` or carry setting. */
export type DraftRule =
  | { readonly kind: "require-review"; readonly id: string; readonly paths: readonly Glob[]; readonly from: MemberId; readonly count: number }
  | { readonly kind: "refuse-claim"; readonly id: string; readonly paths: readonly Glob[]; readonly roles: readonly Role[] }
  | { readonly kind: "carry-depends-on"; readonly area: Glob; readonly dependsOn: readonly Glob[] }
  | { readonly kind: "global-input"; readonly paths: readonly Glob[] };

export interface DryRunChange {
  readonly seq: Seq;
  readonly act: ActId;
  readonly lane?: ActId;
  readonly generation?: Generation;
  readonly by: MemberId | null;
  readonly what: string;
  readonly before: string;
  readonly after: string;
}

export interface DryRunResult {
  readonly compiled: Rule | { readonly carry: Record<string, unknown> };
  readonly examined: { readonly claims: number; readonly proposals: number; readonly carried: number };
  readonly changes: readonly DryRunChange[];
}

// ---------------------------------------------------------------- timeline

/** Mock only: the scripted scenario's timeline. Shown behind the dev toggle. */
export interface Timeline {
  readonly step: number;
  readonly steps: number;
  readonly playing: boolean;
  label(step: number): string;
  go(step: number): void;
  play(intervalMs?: number): void;
  pause(): void;
}

// ----------------------------------------------------------------- adapter

export interface ReviewDraft {
  readonly verdict: Verdict;
  readonly scope: readonly Glob[];
  readonly dependsOn: readonly Glob[];
  readonly text: string;
}

export interface RoomAdapter {
  readonly kind: "mock" | "live";
  /** The current view, or null while connecting. */
  snapshot(): RoomSnapshot | null;
  /** Called after every change to the snapshot. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;

  /** The proposal's diff from its base to its head. Null when the transport cannot provide it. */
  diff(ref: ProposalRef): Promise<readonly FileDiff[] | null>;
  /** Paths that changed between the previous generation's head and this one's. */
  changedSince(ref: ProposalRef): readonly RepoPath[] | null;
  explain(act: ActId): Promise<Why | null>;

  review(at: ProposalAt, draft: ReviewDraft): Promise<Result<Review>>;
  note(anchor: NoteAnchor, text: string, replyTo?: ActId): Promise<Result<Note>>;
  dryRun(draft: DraftRule): Promise<Result<DryRunResult>>;

  /** Members the viewer may switch to. The mock lets a demo view any queue; live has one identity. */
  readonly viewers: readonly MemberId[];
  setViewer(member: MemberId): void;

  readonly timeline?: Timeline;
}

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

import type { ChangeHistory } from "./changes.ts";
import type {
  ActDeclaration,
  ActId,
  AttentionItem,
  Binding,
  Catalogue,
  Check,
  Decision,
  DeclaredRecord,
  DeclaredTarget,
  Flag,
  Generation,
  Glob,
  Json,
  KindName,
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
  RecordMeaning,
  Refusal,
  RepoPath,
  Result,
  Review,
  Role,
  RoomId,
  Rule,
  Seq,
  Sha,
  SystemEvent,
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

/**
 * What a record's kind meant at its own seq, as a reader sees it (R-DECL-23):
 * the label and fields of the declarations in force there, never the active
 * ones. Built by `entryMeaning` (acts.ts) from the contract's `RecordMeaning`.
 */
export interface EntryMeaning {
  readonly vocabulary: RecordMeaning["vocabulary"];
  readonly kind: string;
  /** The label in force at the record's seq. */
  readonly label: string;
  /** The policy version that governed the record. */
  readonly policy: PolicyVersion;
  /** For a declared kind: the binding of that meaning. Two meanings of one name differ here. */
  readonly binding?: Binding;
  /** For a declared kind: its declaration at the record's seq. A thread's name is read with its field types. */
  readonly declaration?: ActDeclaration;
  readonly help?: string;
  /** The seq at which a later document dropped the kind, or replaced the legacy vocabulary. */
  readonly retired?: Seq;
  /** The target in plain words; null for an act with none. */
  readonly target: string | null;
  /** The body's fields by name, as recorded. */
  readonly fields: readonly { readonly name: string; readonly value: string }[];
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
  /** For a system event about a landing operation: that operation. */
  readonly op?: OpId;
  readonly flags: readonly Flag[];
  /**
   * For an act or a recorded refusal whose governing declarations could be
   * read: what its kind meant at its own seq. Absent for a system event, and
   * when the transport could not read the declarations.
   */
  readonly meaning?: EntryMeaning;
}

/** A `check-carried` system event (R-CARRY-13). */
export type CheckCarriedEvent = Extract<SystemEvent, { readonly type: "check-carried" }>;

/**
 * One sealed judgment of whether an earlier check counts on a new
 * integration, with the entry that holds it. A check carries only by such an
 * event; one that did not carry has its event too.
 */
export interface CheckCarry {
  readonly id: ActId;
  readonly seq: Seq;
  readonly at: Timestamp;
  readonly event: CheckCarriedEvent;
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

/** What the transport could read completely. */
export interface Coverage {
  /** False when the lane list ended before the room's last lane. */
  readonly lanes: boolean;
  /** False when the viewer's attention queue ended before its last item. */
  readonly attention: boolean;
  /** The log entries loaded: from `from` (earlier ones are not shown); `complete` when every entry from there to the head was read. */
  readonly feed: { readonly from: Seq; readonly complete: boolean };
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
  /** The `check-carried` events loaded, oldest first. Covered by `coverage.feed`. */
  readonly checkCarries: readonly CheckCarry[];
  readonly landOps: readonly LandOp[];
  /** The publication slot, or null when the transport cannot read it. Never guessed as free. */
  readonly slot: PublicationSlot | null;
  /** How much of the room the transport could read. Screens never claim "none" or "all" beyond it. */
  readonly coverage: Coverage;
  /** The viewer's attention queue, open and resolved. */
  readonly attention: readonly AttentionItem[];
  /** The log, oldest first, as plain sentences. */
  readonly feed: readonly FeedEntry[];
  /** The room's own log counters (LogPage.head and publishedThrough): the publication lag is head − publishedThrough. */
  readonly log: { readonly head: Seq; readonly publishedThrough: Seq };
  readonly policy: PolicyView;
  /**
   * The active policy version's declarations and bindings, for preparing a
   * new act. Null when the transport cannot read them. Old records are never
   * read through this: each carries its own `meaning`.
   */
  readonly catalogue: Catalogue | null;
  readonly source: { readonly kind: "mock" | "live"; readonly status: "live" | "connecting" | "offline"; readonly note?: string };
}

export type { ChangeEntry, ChangeHistory, FileInterdiff, FileMeta, Hunk, Interdiff } from "./changes.ts";

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
  /** For an act or a recorded refusal: what its kind meant at its own seq (R-DECL-23). */
  readonly meaning?: EntryMeaning;
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

/** Where the compiled rule and the platform's path overlap (R-PATH-3) disagree about a claim. */
export interface DryRunMismatch {
  readonly seq: Seq;
  readonly act: ActId;
  readonly by: MemberId | null;
  readonly scope: readonly Glob[];
  /** `missed`: the scope may cover the draft's paths, but the rule does not refuse it. `extra`: the reverse. */
  readonly kind: "missed" | "extra";
}

export type DryRunResult =
  | {
      /** Every outcome below came from the policy runtime itself, under the active policy and under the draft. */
      readonly status: "replayed";
      readonly compiled: Rule | { readonly carry: Record<string, unknown> };
      /** The evaluator that produced the outcomes. */
      readonly stamp: string;
      readonly examined: { readonly claims: number; readonly proposals: number; readonly carried: number };
      readonly changes: readonly DryRunChange[];
      readonly mismatches: readonly DryRunMismatch[];
    }
  | {
      /** The draft cannot be expressed faithfully as a rule; nothing was replayed. */
      readonly status: "not-compiled";
      readonly reason: string;
      readonly fix: string;
      /** The policy runtime's validation problems, when the whole compiled policy was invalid. */
      readonly problems: readonly string[];
    };

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
  /**
   * Author-supplied: how this generation's jj changes (commits with a
   * `change-id` header) relate to the previous generation's. Null when no
   * commit in either carries a header. Absent when the transport cannot read
   * a generation's commits (the live room: contract gap 10, open point 39).
   * It never affects obligations, evidence or carrying.
   */
  changeHistory?(ref: ProposalRef): Promise<ChangeHistory | null>;
  /** Paths that changed between the previous generation's head and this one's. */
  changedSince(ref: ProposalRef): readonly RepoPath[] | null;
  explain(act: ActId): Promise<Why | null>;

  review(at: ProposalAt, draft: ReviewDraft): Promise<Result<Review>>;
  note(anchor: NoteAnchor, text: string, replyTo?: ActId): Promise<Result<Note>>;
  dryRun(draft: DraftRule): Promise<Result<DryRunResult>>;

  /**
   * Read the active declarations again, and put them in the snapshot. Null
   * when the transport cannot read them. The act form calls this after a
   * `binding-stale` or `kind-undeclared` refusal; nothing else rereads on
   * the user's behalf.
   */
  readCatalogue(): Promise<Catalogue | null>;
  /** The declarations that governed the entry at `seq`, `D(s)`. Null when the room retains none, or cannot say. */
  catalogueAt(seq: Seq): Promise<Catalogue | null>;
  /**
   * Submit one act of a declared kind with the binding the user was looking
   * at (R-DECL-16). The adapter sends exactly this kind, target, body and
   * binding, once. It never reads the catalogue, replaces the binding or
   * sends again by itself.
   *
   * With `idempotencyKey`, the same call made again is the same act: if the
   * room recorded it the first time, it returns that result and records
   * nothing new (R-IDEM-2). A caller whose answer was lost uses it to ask
   * again. An error that says `maybeRecorded` is such a lost answer.
   */
  act(kind: KindName, target: DeclaredTarget, body: { readonly [field: string]: Json }, binding: Binding, idempotencyKey?: string): Promise<Result<DeclaredRecord>>;

  /** Members the viewer may switch to. The mock lets a demo view any queue; live has one identity. */
  readonly viewers: readonly MemberId[];
  setViewer(member: MemberId): void;

  readonly timeline?: Timeline;
}

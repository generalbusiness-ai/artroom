/**
 * Declared acts (docs/protocol.md section 33, R-DECL; design in
 * notes/2026-10-02-declared-acts.md). A room's acts are declared by its
 * application in an `artroom-policy-v2` document, over a fixed set of
 * platform steps. A `v1` document means the legacy vocabulary (legacy.ts).
 *
 * Stage 1 adds these types and nothing that uses them at runtime. The
 * existing unions (`EnvelopeKind`, `Envelope`, `RosterOp`, `SystemEvent`,
 * `LaneEffect`, `FailReason`, `AttentionWhy`, `CheckJob`, `PolicyDocument`)
 * are unchanged; each type here that a later stage adds to one of them says
 * which stage does so.
 */

import type {
  ActId,
  CheckerName,
  DelegationId,
  Digest,
  Generation,
  Glob,
  IdempotencyKey,
  Json,
  KeyId,
  LaneId,
  LeaseGeneration,
  MemberId,
  ObligationId,
  OpId,
  PolicyVersion,
  Reason,
  RoomId,
  Seq,
  Sha,
  Timestamp,
} from "./ids.ts";
import type { Authority, Flag, NoteAnchor, ProposalRef, ReviewBody } from "./acts.ts";
import type { Envelope, LaneTarget } from "./envelope.ts";
import type { Base64Url } from "./ids.ts";
import type { CheckJob } from "./checker.ts";
import type { PlatformRule } from "./errors.ts";
import type {
  CarryRule,
  CarrySettings,
  CheckerConfig,
  LandRule,
  LaneMode,
  NotifyRule,
  PolicyLane,
  RefuseRule,
  RequireRule,
} from "./policy.ts";
import type { Principal, Role } from "./roster.ts";

// ------------------------------------------------------------------- names

/**
 * A declared kind's name: `[a-z][a-z0-9-]{0,31}`, not reserved (R-DECL-2).
 * A plain string, because the set is whatever the active document declares.
 */
export type KindName = string;

/** Kinds that platform code judges, whatever the declarations say (R-DECL-2, R-DECL-21). */
export type PlatformKind = "renew" | "roster" | "recover";

/** A thread's kind: the kind of the act that opened it, or `room` for a revert thread (R-DECL-6). */
export type ThreadKind = KindName | "room";

/** The step semantics versions this platform carries (R-DECL-14). */
export type StepsVersion = "artroom-steps-v1";

/** The evaluator profiles this platform carries (R-DECL-22). */
export type ProfileVersion = "artroom-jsonata-v1";

// ------------------------------------------------------------ declarations

/** The target shapes an act may accept (R-DECL-4). */
export type TargetShape = "none" | "thread" | "version" | "entry" | "line";

/** The platform's primitive operations; the meaning of each is the steps version's (R-DECL-5). */
export type Step = "open" | "take" | "version" | "review" | "check" | "land" | "release" | "hand-over" | "comment";

/** The steps a target shape may run: one step, or `version` then `land` on `thread` (R-DECL-4). */
export type StepList = readonly [Step] | readonly ["version", "land"];

/** One of the application's own body fields. A closed set of types (R-DECL-12). */
export type DeclaredField = (
  | { readonly type: "text"; readonly max: number }
  | { readonly type: "int"; readonly min: number; readonly max: number }
  | { readonly type: "bool" }
  | { readonly type: "enum"; readonly values: readonly string[] }
  | { readonly type: "globs"; readonly max: number }
  | { readonly type: "member" }
  | { readonly type: "act" }
  | { readonly type: "segment" }
) & {
  /** Not required on any target. At most one of `optional` and `requiredFor`. */
  readonly optional?: boolean;
  /** Required only on these targets, a subset of the act's own. */
  readonly requiredFor?: readonly TargetShape[];
};

/** The hold an opening act takes (R-DECL-7, R-DECL-9, R-DECL-10). Fixed for the thread's life. */
export interface HoldDeclaration {
  /** The scope source: the body's `scope`, or a template of globs with `{field}` slots. */
  readonly scope: "body.scope" | readonly Glob[];
  /** Absent: the policy's `lanes` when the thread opens. */
  readonly conflict?: LaneMode;
  /**
   * 10 to 86,400. Absent: the room's lease, which the deployment configures.
   * The room resolves it to a number when the thread opens and records that
   * value on the thread for its life (R-DECL-6, R-DECL-9); the binding stays
   * `"room"` and never includes the number (R-DECL-15).
   */
  readonly leaseSeconds?: number;
  /** 1 to 600. Absent: the thread cannot be handed over. */
  readonly reserveSeconds?: number;
  /** Whether the thread has a workspace: a fork and a token (R-WS). Absent: false. */
  readonly workspace?: boolean;
}

/** The slots a refusal template may use (R-DECL-13). Nothing else is interpolated. */
export type RefusalSlot = "holder" | "lane" | "generation" | "obligation" | "path" | "reservedFor" | "until" | "kind";

/** The act's own wording for one refusal code. The room still decides the refusal (R-DECL-13). */
export interface RefusalWording {
  readonly reason: string;
  readonly fix: string;
}

/** One declared act. The key in `PolicyDocumentV2.acts` is its kind (R-DECL-3). */
export interface ActDeclaration {
  /** Shown to people and agents. Never read by admission; not in the binding. */
  readonly label: string;
  /** For each target shape the act accepts, the steps it runs (R-DECL-4). */
  readonly targets: { readonly [T in TargetShape]?: StepList };
  /**
   * The thread kinds this act may act on, for targets `thread`, `version` and
   * `line`; present exactly when the act has one of those (R-DECL-8).
   */
  readonly threads?: readonly ThreadKind[];
  /** The application's own body fields, beyond those its steps require (R-DECL-12). */
  readonly body?: Readonly<Record<string, DeclaredField>>;
  readonly who: {
    /** Roles that may sign it besides `admin`, which always may and is never listed (R-DECL-11). */
    readonly roles: readonly Exclude<Role, "admin">[];
    /** Whether a delegation may cover it (R-ADM-5). Absent: true. Not in the binding. */
    readonly delegable?: boolean;
  };
  /** For an act with step `open`, and only for one: the hold on the thread it opens. */
  readonly hold?: HoldDeclaration;
  /** Refusal wording in the act's own terms, by platform refusal code. Not in the binding. */
  readonly refusals?: Readonly<Partial<Record<PlatformRule, RefusalWording>>>;
  /** Guidance for agents. Never read by admission; not in the binding. */
  readonly help?: string;
}

// ------------------------------------------------------------ the document

/** A `refuse` rule whose `on` names declared or platform kinds (R-POL-2 as amended). */
export type DeclaredRefuseRule = Omit<RefuseRule, "on"> & { readonly on: readonly (KindName | PlatformKind)[] };

/** A `notify` rule whose `on` names declared or platform kinds (R-POL-5 as amended). */
export type DeclaredNotifyRule = Omit<NotifyRule, "on"> & { readonly on: readonly (KindName | PlatformKind)[] };

/** A rule in a `v2` document. */
export type DeclaredRule = DeclaredRefuseRule | RequireRule | CarryRule | LandRule | DeclaredNotifyRule;

/**
 * The compiled `.artroom/policy.json` with declared acts (R-DECL-1). The
 * existing `PolicyDocument` stays the `v1` format, which means the legacy
 * vocabulary.
 */
export interface PolicyDocumentV2 {
  readonly format: "artroom-policy-v2";
  /** The evaluator profile; changed only by activation (R-DECL-22). */
  readonly profile: ProfileVersion;
  /** The step semantics version; changed only by activation (R-DECL-14). */
  readonly steps: StepsVersion;
  readonly owners: Readonly<Record<Glob, readonly Principal[]>>;
  readonly carry: CarrySettings;
  /** The default conflict mode for holds that do not set one (R-DECL-9). */
  readonly lanes: LaneMode;
  readonly retiredEvidence: "counts" | "reopens";
  readonly rules: readonly DeclaredRule[];
  readonly acts: Readonly<Record<KindName, ActDeclaration>>;
}

/** Either format of `.artroom/policy.json`. */
export type AnyPolicyDocument = import("./policy.ts").PolicyDocument | PolicyDocumentV2;

/** `.artroom/checkers/<name>.json` in a `v2` room: it names the act its checks are signed as (R-DECL-18). */
export type CheckerConfigV2 = Omit<CheckerConfig, "format"> & {
  readonly format: "artroom-checker-v2";
  readonly act: KindName;
};

// ---------------------------------------------------------------- bindings

/** A kind's binding: `sha256:` and the hex SHA-256 of its `BindingSubject`'s canonical JSON (R-DECL-15). */
export type Binding = Digest;

/** A declared field, as the binding sees it: its type and parameters, and the targets it is required on. */
export type BindingField = (
  | { readonly type: "text"; readonly max: number }
  | { readonly type: "int"; readonly min: number; readonly max: number }
  | { readonly type: "bool" }
  | { readonly type: "enum"; readonly values: readonly string[] }
  | { readonly type: "globs"; readonly max: number }
  | { readonly type: "member" }
  | { readonly type: "act" }
  | { readonly type: "segment" }
) & {
  /** Of the act's own targets, in the order `none`, `thread`, `version`, `entry`, `line`. */
  readonly required: readonly TargetShape[];
};

/** A hold with every default resolved (R-DECL-15). */
export interface BindingHold {
  readonly scope: "body.scope" | readonly Glob[];
  readonly conflict: LaneMode;
  /**
   * `room` when the declaration leaves it to the deployment's lease. The
   * numeric value is recorded on each thread at open, never in the binding.
   */
  readonly leaseSeconds: number | "room";
  readonly reserveSeconds: number | null;
  readonly workspace: boolean;
}

/**
 * Everything that decides one kind's meaning, defaults resolved. It covers
 * the steps version, the name, targets, threads, body fields and hold. It
 * excludes `label`, `help`, `refusals` and `who` (R-DECL-15).
 */
export interface BindingSubject {
  readonly steps: StepsVersion;
  readonly kind: KindName;
  readonly targets: { readonly [T in TargetShape]?: StepList };
  readonly threads: readonly ThreadKind[];
  readonly body: Readonly<Record<string, BindingField>>;
  readonly hold: BindingHold | null;
}

// ------------------------------------------------------------------ grants

/** A signed map from declared kind to the binding the grantor signed for (R-DECL-17). */
export type GrantMap = Readonly<Record<KindName, Binding>>;

/** Platform kinds a grant names plainly. `roster` and `recover` are never delegable. */
export type DelegablePlatformKind = "renew";

/**
 * A `delegate` op in a `v2` room (R-DECL-17). Joins `RosterOp` in stage 2.
 * No `*`: the grantor's client expands a wildcard before signing.
 */
export interface DelegateOpV2 {
  readonly op: "delegate";
  readonly to: KeyId;
  readonly kinds: readonly DelegablePlatformKind[];
  readonly acts: GrantMap;
  readonly lanes: readonly LaneId[] | "*";
  readonly expiresAt: Timestamp;
}

/** A room-custody invitation's `session` in a `v2` room (R-DECL-17, R-CRED-3). */
export interface InvitationSessionV2 {
  readonly kinds: readonly DelegablePlatformKind[];
  readonly acts: GrantMap;
  readonly lanes: "*";
  readonly ttlSeconds: number;
}

/**
 * A delegation admitted in a `v2` room carries the map it was signed with
 * (R-DECL-17). A delegation without `acts` was admitted under a `v1` document
 * and covers only the platform kinds of the intersection rule.
 */
export interface DelegationV2 {
  readonly id: DelegationId;
  readonly grantor: KeyId;
  readonly grantee: KeyId;
  readonly kinds: readonly DelegablePlatformKind[];
  readonly acts: GrantMap;
  readonly lanes: readonly LaneId[] | "*";
  readonly expiresAt: Timestamp;
  readonly revoked?: Seq;
}

// --------------------------------------------------------------- envelopes

/** The target of a declared act, by its shape (R-DECL-4). `none` is `null`. */
export type DeclaredTarget = null | LaneTarget | ProposalRef | NoteAnchor;

/**
 * An act of a declared kind (R-DECL-16): `v: 2`, signed under
 * `artroom-envelope-v1`, with the binding it was prepared under. Platform
 * kinds keep `v: 1` and carry no binding.
 */
export interface DeclaredEnvelope {
  readonly v: 2;
  readonly room: RoomId;
  readonly actor: KeyId;
  readonly kind: KindName;
  readonly binding: Binding;
  readonly target: DeclaredTarget;
  readonly body: { readonly [field: string]: Json };
  readonly idempotencyKey: IdempotencyKey;
  readonly delegation?: DelegationId;
}

/** A bearer act of a declared kind: the agent supplies the binding (R-CRED-10 as amended). */
export type DeclaredBearerAct = Pick<DeclaredEnvelope, "kind" | "binding" | "target" | "body" | "idempotencyKey">;

/**
 * Every envelope a room may be sent (R-API-3 as amended, stage 5): the
 * legacy and platform envelopes (`v: 1`), a declared act (`v: 2`), and
 * `recover`. Which of them a room admits is its active document's
 * vocabulary (R-DECL-1).
 */
export type AnyEnvelope = Envelope | DeclaredEnvelope | RecoverEnvelope;

/** An envelope of either version and its signature (R-SIG-1). */
export interface AnySignedEnvelope<E extends AnyEnvelope = AnyEnvelope> {
  readonly envelope: E;
  readonly sig: Base64Url;
}

/**
 * The record of a declared act (R-DECL-16; stage 2 produces it, stage 5
 * types it). Its `kind` is the act's own kind. Its other fields are those
 * of the record its step produces: an `open` or `take` gives a claim's
 * fields, a `version` a proposal's, and so on.
 */
export interface DeclaredRecord {
  readonly id: ActId;
  readonly seq: Seq;
  readonly kind: KindName;
  readonly by: Authority;
  readonly at: Timestamp;
  readonly after?: OpId;
  readonly flags: readonly Flag[];
  readonly because?: readonly Reason[];
  /** The step's own fields. */
  readonly [field: string]: unknown;
}

/**
 * The platform kind `recover` (R-DECL-21): configuration recovery in a `v2`
 * room, judged by platform code under R-ADMIN-5 to R-ADMIN-8.
 */
export type RecoverOp =
  | { readonly op: "open"; readonly goal: string; readonly scope: readonly Glob[]; readonly plan?: string; readonly because?: readonly Reason[] }
  | {
      readonly op: "take";
      readonly scope: readonly Glob[];
      readonly expectedGeneration: Generation;
      readonly lease?: LeaseGeneration;
      readonly goal?: string;
      readonly plan?: string;
      readonly because?: readonly Reason[];
    }
  | {
      readonly op: "version";
      readonly lease: LeaseGeneration;
      readonly expectedGeneration: Generation;
      readonly head: Sha;
      readonly summary: string;
      readonly because?: readonly Reason[];
    }
  | ({ readonly op: "approve" } & ReviewBody)
  | { readonly op: "land"; readonly lease: LeaseGeneration; readonly head: Sha }
  | { readonly op: "release"; readonly lease: LeaseGeneration; readonly note?: string }
  | { readonly op: "note"; readonly text: string; readonly replyTo?: ActId };

/** The target each `recover` op takes. */
export interface RecoverTargets {
  readonly open: null;
  readonly take: LaneTarget;
  readonly version: LaneTarget;
  readonly approve: ProposalRef;
  readonly land: ProposalRef;
  readonly release: LaneTarget;
  readonly note: NoteAnchor;
}

/** A `recover` envelope: `v: 1`, no binding, an admin's own key (R-DECL-21). Joins `Envelope` in stage 2. */
export type RecoverEnvelope = {
  readonly [O in RecoverOp["op"]]: {
    readonly v: 1;
    readonly room: RoomId;
    readonly actor: KeyId;
    readonly kind: "recover";
    readonly target: RecoverTargets[O];
    readonly body: Extract<RecoverOp, { readonly op: O }>;
    readonly idempotencyKey: IdempotencyKey;
  };
}[RecoverOp["op"]];

// ------------------------------------------------------------------ checks

/** A check job in a `v2` room: the kind and binding the checker signs (R-DECL-18). Replaces `CheckJob` in stage 4. */
export interface CheckJobV2 extends CheckJob {
  readonly kind: KindName;
  readonly binding: Binding;
}

/** A landing failure: no job can be issued for a check (R-DECL-19). Joins `FailReason` in stage 4. */
export interface CheckUnroutable {
  readonly code: "check-unroutable";
  readonly obligation: ObligationId;
  readonly check: CheckerName;
  /** The obligation's thread kind, which the check act does not name. */
  readonly thread: ThreadKind;
  /** The check act the checker's configuration names. */
  readonly act: KindName;
}

/** An admin's attention item for the same (R-DECL-19). Joins `AttentionWhy` in stage 4. */
export interface CheckUnroutableAttention {
  readonly why: "check-unroutable";
  readonly proposal: ProposalRef;
  readonly obligation: ObligationId;
  readonly check: CheckerName;
  readonly thread: ThreadKind;
  readonly act: KindName;
}

/** The lane, as policy sees it, in a `v2` room: with the thread's kind (R-EVAL-3 as amended). */
export type DeclaredPolicyLane = PolicyLane & { readonly kind: ThreadKind | null };

// ---------------------------------------------------------- events, effects

/**
 * The room prepared an integration, before it issues any job for it
 * (R-DECL-20). Joins `SystemEvent` in stage 4.
 */
export interface PreparedEvent {
  readonly type: "prepared";
  readonly owner:
    | { readonly preview: ProposalRef }
    | { readonly op: OpId; readonly lane: LaneId; readonly generation: Generation };
  readonly integration: Sha;
  readonly base: Sha;
  readonly tree: Sha;
  /** For each scoped checker: the filtered snapshot commit and its digest (R-CARRY-15). */
  readonly snapshots: readonly { readonly check: CheckerName; readonly commit: Sha; readonly digest: Digest }[];
}

/** A reservation's deadline passed with no `take` by the named member (R-DECL-10). Joins `SystemEvent` in stage 4. */
export interface ReservationEndedEvent {
  readonly type: "reservation-ended";
  readonly lane: LaneId;
  readonly reservedFor: MemberId;
  readonly leaseGeneration: LeaseGeneration;
}

/** The effect of a `hand-over` step (R-DECL-10). Joins `LaneEffect` in stage 4. */
export interface HandedOverEffect {
  readonly type: "handed-over";
  readonly lane: LaneId;
  readonly to: MemberId;
  readonly until: Timestamp;
  /** The new lease generation, one more than the holder's. */
  readonly leaseGeneration: LeaseGeneration;
}

// ------------------------------------------------------------------- reads

/** One declared kind in a catalogue: its declaration, its binding, and when a later document dropped it. */
export interface CatalogueAct {
  readonly declaration: ActDeclaration;
  /** The kind's binding under this document (R-DECL-15). An act of this kind carries it. */
  readonly binding: Binding;
  /**
   * The seq of the first later `policy-activated` entry whose document does
   * not declare this kind (R-DECL-23). Absent while every later document
   * declares it. A later document that declares the name again does not
   * remove it: records made under this document keep this meaning.
   */
  readonly retired?: Seq;
}

/** The entries one policy version governs: from its `policy-activated` entry up to the next one. */
interface CatalogueInterval {
  /** The policy version: the ID of its `policy-activated` entry (R-POL-12). */
  readonly policy: PolicyVersion;
  /** That entry's seq. Entries from `since` are judged under this document. */
  readonly since: Seq;
  /** The seq of the next `policy-activated` entry, or null while this version is active. */
  readonly until: Seq | null;
}

/**
 * The declarations of one `v2` policy version and their bindings, as the
 * `acts` read and MCP tool give them (R-API-9 as amended; stage 5). The
 * active version is for preparing new acts. A retained earlier version is
 * `D(s)` for every entry in its interval: readers show those records with
 * its labels and fields (R-DECL-23).
 */
export interface ActsCatalogue extends CatalogueInterval {
  readonly vocabulary: "declared";
  readonly steps: StepsVersion;
  /** The document's `lanes`, the conflict mode of a hold that names none. A binding depends on it (R-DECL-15). */
  readonly lanes: LaneMode;
  readonly acts: Readonly<Record<KindName, CatalogueAct>>;
}

/** A `v1` policy version: its entries are the legacy vocabulary's, with no declarations and no bindings (R-DECL-1). */
export interface LegacyCatalogue extends CatalogueInterval {
  readonly vocabulary: "artroom-legacy-v1";
}

/** What the `acts` read returns for one policy version. */
export type Catalogue = ActsCatalogue | LegacyCatalogue;

/**
 * What a record's kind meant at its own seq, `D(s)` (R-DECL-23). A reader
 * shows the record with this label and these fields, never with the active
 * vocabulary's. `artroom-policy`'s `meaningOf` derives it from the catalogue
 * that governs the record's seq.
 */
export type RecordMeaning =
  | {
      /** A kind the document in force declared. */
      readonly vocabulary: "declared";
      readonly policy: PolicyVersion;
      readonly kind: KindName;
      readonly label: string;
      readonly declaration: ActDeclaration;
      readonly binding: Binding;
      /** The seq at which a later document dropped the kind; absent while every later document declares it. */
      readonly retired?: Seq;
    }
  | {
      /** `renew`, `roster` or `recover`: judged by platform code in every room (R-DECL-2). */
      readonly vocabulary: "platform";
      readonly policy: PolicyVersion;
      readonly kind: string;
      readonly label: string;
    }
  | {
      /** A kind of the legacy vocabulary, under a `v1` document (R-DECL-1). */
      readonly vocabulary: "artroom-legacy-v1";
      readonly policy: PolicyVersion;
      readonly kind: string;
      readonly label: string;
      /** The seq at which another policy version replaced this `v1` one; absent while it is active. */
      readonly retired?: Seq;
    }
  | {
      /** The document in force did not know the kind: a recorded refusal of it, or a record of another interval. */
      readonly vocabulary: "unknown";
      readonly policy: PolicyVersion;
      readonly kind: string;
      readonly label: string;
    };

// ------------------------------------------------------------------ verify

/** Verification failures added by declared acts, each naming a seq (R-DECL-25). */
export type DeclaredVerifyFailure =
  | "kind-undeclared"
  | "binding-stale"
  | "body-invalid"
  | "guard-failed"
  | "effect-mismatch"
  | "refusal-mismatch"
  | "decision-missing"
  | "decision-extra"
  | "context-mismatch"
  | "witness-missing"
  | "git-mismatch";

/** Reported, not failures (R-DECL-25). */
export type VerifyProofLimit = "git-unwitnessed";

/** A verifier that lacks a version stops there; a limit of the verifier, not a finding (R-DECL-14, R-DECL-22). */
export type VerifyUnsupported = "steps-unsupported" | "profile-unsupported";

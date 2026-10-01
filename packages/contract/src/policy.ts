/**
 * Repository policy: `.artroom/policy.json`, data in a pinned, restricted
 * JSONata profile (plan sections 5 and 10). Rules R-POL and R-EVAL in
 * docs/protocol.md.
 *
 * Policy cannot override the platform invariants of plan sections 7–11. A
 * rule can refuse, require, narrow carrying, block a landing or notify. It
 * cannot authorize anything the platform forbids.
 *
 * The authoring helpers at the end are declared here and implemented by the
 * policy package. They compile to `PolicyDocument`.
 */

import type {
  ActId,
  CheckerName,
  Digest,
  Generation,
  Glob,
  Json,
  LaneId,
  MemberId,
  ObligationId,
  PolicyVersion,
  RepoPath,
  RuleId,
  Sha,
  TeamId,
} from "./ids.ts";
import type { EnvelopeKind, PathChange, Verdict } from "./acts.ts";
import type { Principal, Role } from "./roster.ts";
import type { ReviewerSpec } from "./evidence.ts";

/** A JSONata expression in the `artroom-jsonata-v1` profile (R-EVAL-1). */
export type Expr = string;

export type RuleKind = "refuse" | "require" | "carry" | "land" | "notify";

/**
 * How claims relate. `by-scope`: overlapping claims are admitted and shown.
 * `exclusive`: a claim that may overlap a held lane is refused (`scope-overlap`).
 */
export type LaneMode = "by-scope" | "exclusive";

interface RuleBase<K extends RuleKind> {
  readonly id: RuleId;
  readonly kind: K;
  readonly description?: string;
}

/** Evaluated when an act arrives, before it is recorded. True refuses it (R-POL-2). */
export interface RefuseRule extends RuleBase<"refuse"> {
  readonly on: readonly EnvelopeKind[];
  readonly refuse: Expr;
  readonly reason: string;
  readonly fix: string;
}

/** Evaluated on `propose` and at policy activation. Creates an obligation (R-POL-3). */
export interface RequireRule extends RuleBase<"require"> {
  /** Applies when any actual changed path matches. */
  readonly paths: readonly Glob[];
  /** An extra condition; absent means always. */
  readonly when?: Expr;
  readonly obligation:
    | { readonly type: "review"; readonly from: readonly ReviewerSpec[]; readonly count: number; readonly allowSelf: boolean }
    | { readonly type: "check"; readonly check: CheckerName; readonly by: readonly Principal[] };
}

/**
 * Evaluated on a new generation, for each earlier verdict or check that meets
 * the platform's carry conditions. `allow` must be true for it to carry. A
 * carry rule can only narrow carrying, never widen it (R-CARRY-4).
 */
export interface CarryRule extends RuleBase<"carry"> {
  readonly evidence: "review" | "check" | "any";
  readonly allow: Expr;
}

/** Evaluated on `land` and at `ready`; reservation re-checks its input. True blocks the landing (R-POL-6, R-LAND-7). */
export interface LandRule extends RuleBase<"land"> {
  readonly block: Expr;
  readonly reason: string;
  readonly fix: string;
}

export type NotifyTarget = Principal | "owners" | "holder" | "reviewers";

/** Evaluated after recording. Puts the act in the targets' attention queues (R-POL-5). */
export interface NotifyRule extends RuleBase<"notify"> {
  readonly on: readonly EnvelopeKind[];
  readonly when?: Expr;
  readonly to: readonly NotifyTarget[];
  /** Shown as the reason the item is theirs. */
  readonly why: string;
}

export type Rule = RefuseRule | RequireRule | CarryRule | LandRule | NotifyRule;

/** Carry settings. The platform's global inputs are always added (R-CARRY-3). */
export interface CarrySettings {
  /** Default true. False turns verdict carrying off. */
  readonly verdicts: boolean;
  /** Default true. False turns check carrying off. */
  readonly checks: boolean;
  /** Added to the platform's global inputs. Policy cannot remove a platform entry. */
  readonly globalInputs: readonly Glob[];
  /** Default `dependsOn` per area: a changed path matching a key's pattern adds these. */
  readonly dependsOn: Readonly<Record<Glob, readonly Glob[]>>;
}

/** The compiled `.artroom/policy.json`. */
export interface PolicyDocument {
  readonly format: "artroom-policy-v1";
  readonly profile: "artroom-jsonata-v1";
  readonly owners: Readonly<Record<Glob, readonly Principal[]>>;
  readonly carry: CarrySettings;
  readonly lanes: LaneMode;
  /**
   * What a `retired` revocation does to that key's earlier evidence. Default
   * `counts`. A `compromised` revocation always reopens (R-REV-3); policy can
   * be stricter than the platform, never looser.
   */
  readonly retiredEvidence: "counts" | "reopens";
  readonly rules: readonly Rule[];
}

/** `.artroom/checkers/<name>.json`. Changed only by an admin-approved proposal (R-CARRY-7). */
export interface CheckerConfig {
  readonly format: "artroom-checker-v1";
  /** Absent: the whole tree (the default). Present: scoped inputs; global inputs are always added. */
  readonly inputs?: readonly Glob[];
  /** True if the checker uses network, time or unpinned tools. Such checks never carry. */
  readonly volatile: boolean;
  /** Wall-clock budget for one run, in seconds. */
  readonly timeoutSeconds: number;
}

// ------------------------------------------------------------- rule inputs

/** The acting member, as policy sees it. */
export interface PolicyActor {
  readonly member: MemberId | null;
  readonly role: Role | null;
  readonly teams: readonly TeamId[];
  readonly delegated: boolean;
}

/** The lane, as policy sees it. */
export interface PolicyLane {
  readonly id: LaneId | null;
  readonly claimed: boolean;
  readonly holder: MemberId | null;
  readonly scope: readonly Glob[];
  readonly generation: Generation;
}

/** The proposal, as policy sees it. `paths` lists old and new paths. */
export interface PolicyProposal {
  readonly generation: Generation;
  readonly head: Sha;
  readonly base: Sha;
  readonly changed: readonly PathChange[];
  readonly paths: readonly RepoPath[];
  /** The owners policy assigns to each changed path. */
  readonly owners: Readonly<Record<RepoPath, readonly Principal[]>>;
}

export interface PolicyRoom {
  readonly admins: number;
  readonly members: number;
}

/**
 * What each rule kind's expression receives (R-EVAL-3). It is plain JSON and
 * has no clock, randomness or I/O. Fields may be added in a later profile
 * version; none is removed within one.
 */
export type RuleInput =
  | {
      readonly kind: "refuse";
      readonly act: { readonly kind: EnvelopeKind; readonly target: Json; readonly body: Json };
      readonly actor: PolicyActor;
      readonly lane: PolicyLane;
      readonly proposal: PolicyProposal | null;
      readonly room: PolicyRoom;
    }
  | {
      readonly kind: "require";
      readonly actor: PolicyActor;
      readonly lane: PolicyLane;
      readonly proposal: PolicyProposal;
      readonly room: PolicyRoom;
    }
  | {
      readonly kind: "carry";
      readonly evidence: {
        readonly act: ActId;
        readonly kind: "review" | "check";
        readonly verdict: Verdict | null;
        readonly by: PolicyActor;
        readonly from: { readonly generation: Generation; readonly head: Sha };
        readonly scope: readonly Glob[];
        readonly dependsOn: readonly Glob[];
      };
      /** Paths changed between the evidence's head and the new head. */
      readonly changedSince: readonly RepoPath[];
      readonly proposal: PolicyProposal;
      readonly policy: { readonly same: boolean };
    }
  | {
      readonly kind: "land";
      readonly actor: PolicyActor;
      readonly lane: PolicyLane;
      readonly proposal: PolicyProposal;
      readonly obligations: readonly { readonly id: ObligationId; readonly met: boolean }[];
      readonly reviews: readonly { readonly act: ActId; readonly verdict: Verdict; readonly by: PolicyActor; readonly basis: "here" | "carried" }[];
      readonly stage: "land" | "reservation";
    }
  | {
      readonly kind: "notify";
      readonly act: { readonly id: ActId; readonly kind: EnvelopeKind; readonly target: Json; readonly body: Json };
      readonly actor: PolicyActor;
      readonly lane: PolicyLane | null;
      readonly proposal: PolicyProposal | null;
    };

// ---------------------------------------------------------- the profile

/** The evaluator's budgets, ported from atseq with values intact (R-EVAL-2). */
export interface PolicyProfile {
  readonly id: "artroom-jsonata-v1";
  readonly programBytes: 65_536;
  readonly inputBytes: 262_144;
  readonly outputBytes: 262_144;
  readonly inputDepth: 32;
  readonly astNodes: 4_096;
  readonly astDepth: 64;
  readonly evaluationDepth: 64;
  readonly evaluationSteps: 100_000;
  readonly sequenceLength: 16_384;
  readonly intermediateBytes: 1_048_576;
  readonly inspectionBytes: 16_777_216;
  readonly functions: readonly [
    "abs", "ceil", "floor", "round", "count", "sum", "min", "max", "length",
    "exists", "not", "lookup", "append", "merge", "contains", "substring",
  ];
}

/** Recorded with every decision (R-EVAL-4). */
export interface ProfileStamp {
  readonly profile: "artroom-jsonata-v1";
  /** The pinned `jsonata` package version, for example `2.2.2`. */
  readonly jsonata: string;
}

/** One rule's outcome on one act. Recorded in the receipt (R-LOG-6). */
export interface Decision {
  readonly rule: RuleId;
  readonly kind: RuleKind;
  readonly policy: PolicyVersion;
  readonly stamp: ProfileStamp;
  /** Digest of the canonical rule input; the input itself is retained with the log (R-LOG-7). */
  readonly input: Digest;
  readonly outcome:
    | { readonly result: "pass" }
    | { readonly result: "refuse" | "block"; readonly reason: string; readonly fix: string }
    | { readonly result: "obligation"; readonly obligation: ObligationId }
    | { readonly result: "carry" | "no-carry"; readonly evidence: ActId }
    | { readonly result: "notify"; readonly to: readonly (MemberId | TeamId)[] }
    | { readonly result: "error"; readonly code: "policy-budget-exceeded" | "policy-type-error"; readonly detail: string };
  readonly usage: { readonly steps: number; readonly inspectedBytes: number };
}

// ------------------------------------------------- authoring helpers (declared)

/** One piece of a policy. `policy()` merges pieces in order; a later setting replaces an earlier one. */
export type PolicyPart =
  | { readonly part: "owners"; readonly owners: Readonly<Record<Glob, readonly Principal[]>> }
  | { readonly part: "carry"; readonly carry: Partial<CarrySettings>; readonly rules: readonly CarryRule[] }
  | { readonly part: "lanes"; readonly lanes: LaneMode }
  | { readonly part: "evidence"; readonly retiredEvidence: "counts" | "reopens" }
  | { readonly part: "rules"; readonly rules: readonly Rule[] };

type OneOrMore<T> = T | readonly T[];

export declare function policy(...parts: readonly PolicyPart[]): PolicyDocument;

export declare function owners(map: Readonly<Record<Glob, OneOrMore<Principal>>>): PolicyPart;

export declare function requireCheck(
  check: CheckerName,
  opts: { readonly paths: OneOrMore<Glob>; readonly by: OneOrMore<Principal>; readonly id?: RuleId; readonly when?: Expr },
): PolicyPart;

export declare function requireReview(opts: {
  readonly paths: OneOrMore<Glob>;
  readonly from: OneOrMore<ReviewerSpec>;
  readonly count?: number;
  readonly allowSelf?: boolean;
  readonly id?: RuleId;
  readonly when?: Expr;
}): PolicyPart;

export declare function carry(opts: {
  readonly verdicts?: boolean;
  readonly checks?: boolean;
  readonly globalInputs?: readonly Glob[];
  readonly dependsOn?: Readonly<Record<Glob, readonly Glob[]>>;
  /** Extra carry rules; each can only narrow carrying. */
  readonly allow?: readonly { readonly id: RuleId; readonly evidence: CarryRule["evidence"]; readonly allow: Expr }[];
}): PolicyPart;

export declare function lanes(mode: LaneMode): PolicyPart;

/** Sugar for a refuse rule, as in the plan's example; or any compiled rule. */
export declare function rule(
  spec:
    | {
        readonly id: RuleId;
        readonly on: OneOrMore<EnvelopeKind>;
        readonly refuse: Expr;
        readonly fix: string;
        readonly reason?: string;
      }
    | Rule,
): PolicyPart;

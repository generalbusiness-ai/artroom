/**
 * Obligations and the evidence that meets them (plan section 7).
 * Rules R-OBL and R-CARRY in docs/protocol.md.
 *
 * Evidence is always one of two things, and the UI shows which:
 * - "reviewed here": the verdict or check was made on this generation;
 * - "carried from generation n, head h, because …": an earlier verdict or
 *   check that policy lets count, with the platform's stated reason.
 */

import type {
  ActId,
  CheckerName,
  Digest,
  Generation,
  Glob,
  KeyId,
  ObligationId,
  PolicyVersion,
  RepoPath,
  RuleId,
  Sha,
} from "./ids.ts";
import type { Principal } from "./roster.ts";

/** Who may fulfil a review obligation. `owners` means the owners policy assigns to the changed paths. */
export type ReviewerSpec = Principal | "owners";

interface ObligationBase {
  readonly id: ObligationId;
  /** The require rule that created it, or the platform's own `admin-approval` (R-ADMIN-1). */
  readonly rule: RuleId | "admin-approval";
  readonly policy: PolicyVersion;
  /** The proposal's actual changed paths that triggered it, old and new for renames (R-PROP-3). */
  readonly paths: readonly RepoPath[];
}

export interface ReviewObligation extends ObligationBase {
  readonly kind: "review";
  readonly from: readonly ReviewerSpec[];
  /** Distinct qualifying approvals needed. At least 1. */
  readonly count: number;
  /** False by default; a room may allow it only for documentation scopes (R-OBL-2). */
  readonly allowSelf: boolean;
}

export interface CheckObligation extends ObligationBase {
  readonly kind: "check";
  readonly check: CheckerName;
  readonly by: readonly Principal[];
}

/** Why an obligation is open again after it was met. */
export type Reopened =
  | { readonly because: "not-carried"; readonly detail: NotCarried }
  | { readonly because: "key-compromised"; readonly key: KeyId; readonly revocation: ActId }
  | { readonly because: "policy-activated"; readonly policy: PolicyVersion }
  | { readonly because: "integration-changed"; readonly integration: Sha };

export type ObligationStatus =
  | { readonly state: "open"; readonly evidence: readonly Evidence[]; readonly reopened?: Reopened }
  | { readonly state: "met"; readonly evidence: readonly Evidence[] };

export type Obligation = (ReviewObligation | CheckObligation) & ObligationStatus;

/** A verdict or check made on this very generation (and, for checks, this integration). */
export interface ReviewedHere {
  readonly basis: "here";
  readonly act: ActId;
  readonly kind: "review" | "check";
  readonly generation: Generation;
  readonly head: Sha;
}

/** An earlier verdict or check that counts for this generation under the carry rule (R-CARRY). */
export interface Carried {
  readonly basis: "carried";
  readonly act: ActId;
  readonly kind: "review" | "check";
  readonly from: { readonly generation: Generation; readonly head: Sha };
  readonly reason: CarryReason;
  /** The carry rule decisions, by rule ID; empty when only platform conditions applied. */
  readonly rules: readonly RuleId[];
}

export type Evidence = ReviewedHere | Carried;

/** The platform's reason for carrying. `text` is what the UI shows after "because". */
export type CarryReason =
  | {
      readonly code: "paths-unchanged";
      /** Every path that changed between the two heads, old and new. */
      readonly changed: readonly RepoPath[];
      /** The patterns those paths were tested against, none of which matched (R-CARRY-1..3). */
      readonly tested: { readonly scope: readonly Glob[]; readonly dependsOn: readonly Glob[]; readonly globalInputs: readonly Glob[] };
      /** `same` policy version, or a newer one that still accepts the verdict (R-CARRY-4). */
      readonly policy: "same" | "re-evaluated";
      readonly text: string;
    }
  | {
      readonly code: "tree-identical";
      readonly tree: Sha;
      readonly config: Digest;
      readonly runner: Digest;
      readonly text: string;
    }
  | {
      readonly code: "snapshot-identical";
      readonly snapshot: Digest;
      readonly config: Digest;
      readonly runner: Digest;
      readonly text: string;
    };

/** Why an earlier verdict or check did not carry. Shown as history, never hidden. */
export interface NotCarried {
  readonly act: ActId;
  readonly code:
    | "scope-changed"
    | "dependency-changed"
    | "global-input-changed"
    | "policy-rejected"
    | "carry-disabled"
    | "integration-changed"
    | "config-changed"
    | "runner-changed"
    | "volatile-inputs"
    | "key-compromised";
  /** The changed paths that caused it, when paths caused it. */
  readonly paths?: readonly RepoPath[];
  readonly rule?: RuleId;
  readonly text: string;
}

/** The input a check ran on. The default is the whole tree (R-CARRY-6). */
export type CheckInput =
  | { readonly kind: "tree"; readonly tree: Sha }
  | {
      readonly kind: "filtered";
      /** Digest of the filtered snapshot the runner received (R-CARRY-9). */
      readonly snapshot: Digest;
      /** The checker's declared inputs plus the global inputs, from the active configuration. */
      readonly paths: readonly Glob[];
    };

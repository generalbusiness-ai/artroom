/**
 * The fixed admin boundary (R-ADMIN-1 to 3, plan section 9). Platform code:
 * no policy can remove or weaken it (R-POL-10).
 */

import type {
  MemberId,
  ObligationId,
  PolicyVersion,
  RepoPath,
  ReviewObligation,
  Role,
  RuleInput,
  Verdict,
} from "@generalbusiness/artroom-contract";
import { matchGlob } from "./glob.ts";

export const ADMIN_SCOPE = ".artroom/**";
export const ADMIN_APPROVAL: ObligationId = "obl_admin-approval";
export const SOLE_ADMIN_FLAG = "sole-admin-self-approval";

/** `obl_admin-approval`, when any changed path matches `.artroom/**` (R-ADMIN-1, R-OBL-5). */
export function adminObligation(policy: PolicyVersion, paths: readonly RepoPath[]): ReviewObligation | null {
  const hit = paths.filter((p) => matchGlob(p, ADMIN_SCOPE));
  if (!hit.length) return null;
  return { id: ADMIN_APPROVAL, rule: "admin-approval", policy, paths: hit, kind: "review", from: ["role:admin"], count: 1, allowSelf: false };
}

/** A proposal whose changed paths all match `.artroom/**` and whose admin approval is met (R-ADMIN-3). */
export function isBoundaryProposal(paths: readonly RepoPath[], adminApprovalMet: boolean): boolean {
  return adminApprovalMet && paths.length > 0 && paths.every((p) => matchGlob(p, ADMIN_SCOPE));
}

/** A `roster` act signed by an admin or the recovery key: refuse rules are not evaluated (R-ADMIN-3). */
export function isRecoveryBoundaryAct(input: Extract<RuleInput, { readonly kind: "refuse" }>, recoveryKey: boolean): boolean {
  return input.act.kind === "roster" && (recoveryKey || input.actor.role === "admin");
}

/** The facts that decide whether an approval meets `obl_admin-approval`. */
export interface AdminApprovalFacts {
  readonly reviewer: MemberId;
  /** The reviewer's role now: at admission, or at reservation. */
  readonly role: Role | null;
  readonly verdict: Verdict;
  /** The proposer of the generation and the lane's holder (open point 20). */
  readonly authors: readonly MemberId[];
  /** Active admins now (R-GEN-9). */
  readonly activeAdmins: number;
  /** At reservation: whether the approval was recorded with the sole-admin flag. */
  readonly flagged?: boolean;
}

export type AdminApproval =
  | { readonly counts: true; readonly flag: typeof SOLE_ADMIN_FLAG | null; readonly text: string }
  | { readonly counts: false; readonly rule: "admin-required" | "self-review"; readonly reopens: boolean; readonly text: string };

/**
 * Whether an approval meets `obl_admin-approval` (R-ADMIN-1, R-ADMIN-2).
 * `admission`: when the review arrives. `reservation`: re-checked before
 * publication, where a flagged approval counts only while the room still
 * has exactly one active admin (open point 14).
 */
export function judgeAdminApproval(facts: AdminApprovalFacts, stage: "admission" | "reservation"): AdminApproval {
  if (facts.verdict !== "approve")
    return { counts: false, rule: "admin-required", reopens: false, text: "an objection is not an approval" };
  if (facts.role !== "admin")
    return { counts: false, rule: "admin-required", reopens: stage === "reservation", text: `${facts.reviewer} is not an admin` };
  const self = facts.authors.includes(facts.reviewer);
  if (stage === "reservation" && facts.flagged) {
    if (facts.activeAdmins === 1)
      return { counts: true, flag: SOLE_ADMIN_FLAG, text: `${facts.reviewer} is still the only active admin, so the flagged self-approval counts` };
    return {
      counts: false,
      rule: "self-review",
      reopens: true,
      text: `the room now has ${facts.activeAdmins} active admins, so ${facts.reviewer}'s flagged self-approval no longer counts and the obligation reopens`,
    };
  }
  if (!self) return { counts: true, flag: null, text: `${facts.reviewer} is an admin and not an author` };
  if (facts.activeAdmins === 1)
    return { counts: true, flag: SOLE_ADMIN_FLAG, text: `${facts.reviewer} is the only active admin, so the self-approval counts and is flagged ${SOLE_ADMIN_FLAG}` };
  return {
    counts: false,
    rule: "self-review",
    reopens: stage === "reservation",
    text: `${facts.reviewer} is an author and the room has ${facts.activeAdmins} active admins, so another admin must approve`,
  };
}

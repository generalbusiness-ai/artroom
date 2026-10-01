/**
 * The fixed admin boundary (R-ADMIN-1 to 9, plan section 9). Platform code:
 * no policy can remove or weaken it (R-POL-10).
 */

import type {
  LanePurpose,
  MemberId,
  ObligationId,
  PolicyVersion,
  RepoPath,
  PolicyDocument,
  ReviewObligation,
  RevocationReason,
  Role,
  Verdict,
} from "@generalbusiness/artroom-contract";
import { matchGlob } from "./glob.ts";
import type { InputOf } from "./inputs.ts";

export const ADMIN_SCOPE = ".artroom/**";
export const ADMIN_APPROVAL: ObligationId = "obl_admin-approval";
export const SOLE_ADMIN_FLAG = "sole-admin-self-approval";

/** `obl_admin-approval`, when any changed path matches `.artroom/**` (R-ADMIN-1, R-OBL-5). */
export function adminObligation(policy: PolicyVersion, paths: readonly RepoPath[]): ReviewObligation | null {
  const hit = paths.filter((p) => matchGlob(p, ADMIN_SCOPE));
  if (!hit.length) return null;
  return { id: ADMIN_APPROVAL, rule: "admin-approval", policy, paths: hit, kind: "review", from: ["role:admin"], count: 1, allowSelf: false };
}

/**
 * On a configuration-recovery lane, policy `refuse`, `require`, `carry` and
 * `land` rules are not evaluated (R-ADMIN-5). Platform rules still apply,
 * and the room enforces the lane's admin-only signing and `.artroom/**`
 * scope (R-ADMIN-5, R-ADMIN-6). On an ordinary lane, policy applies as
 * usual, including to proposals that change `.artroom/**` (R-ADMIN-3).
 */
export function skipsPolicy(purpose: LanePurpose | undefined): boolean {
  return purpose === "config-recovery";
}

/** A `roster` act signed by an admin or the recovery key: refuse rules are not evaluated (R-ADMIN-3). */
export function isRecoveryBoundaryAct(input: InputOf<"refuse">, recoveryKey: boolean): boolean {
  return input.act.kind === "roster" && (recoveryKey || input.actor.role === "admin");
}

/**
 * The facts that decide whether an approval meets `obl_admin-approval`.
 * Authority is the reviewer's recorded authority at the review's admission
 * (R-REV-1); validity is the current state of the keys behind it.
 */
export interface AdminApprovalFacts {
  readonly verdict: Verdict;
  /** The review's recorded authority (`Authority` in the contract): its member and role at admission. */
  readonly admission: { readonly member: MemberId | null; readonly role: Role | null };
  /** The proposer of the generation and the lane's holder (open point 20). */
  readonly authors: readonly MemberId[];
  /**
   * Current revocations of the signing key and, for a delegated review, the
   * grantor key (R-REV-1 to 3). Absent means not revoked.
   */
  readonly revoked: { readonly signer?: RevocationReason; readonly grantor?: RevocationReason };
  readonly retiredEvidence: PolicyDocument["retiredEvidence"];
  /** Active admins now (R-GEN-9). Used only for a self-approval and its flag. */
  readonly activeAdmins: number;
  /** At reservation: whether the approval was recorded with the sole-admin flag. */
  readonly flagged?: boolean;
}

export type AdminApproval =
  | { readonly counts: true; readonly flag: typeof SOLE_ADMIN_FLAG | null; readonly text: string }
  | {
      readonly counts: false;
      readonly rule: "admin-required" | "self-review" | "evidence-invalid";
      /** True when an approval that counted before stops counting: the obligation reopens. */
      readonly reopens: boolean;
      readonly text: string;
    };

/**
 * Whether an approval meets `obl_admin-approval` (R-ADMIN-1, R-ADMIN-2,
 * R-REV-1). `admission`: when the review arrives. `reservation`: re-checked
 * before publication.
 *
 * - Whether the review qualified is judged by its recorded admission
 *   authority. A later demotion, removal, or retirement under the default
 *   policy does not reopen it; a later promotion cannot upgrade it.
 * - It stops counting if the signer or grantor key is now compromised, or
 *   retired under `retiredEvidence: "reopens"`.
 * - A sole-admin self-approval is flagged; at reservation it counts only
 *   while the room still has exactly one active admin (open point 14).
 *
 * The land initiator's current authority is a separate check
 * (`judgeInitiator`).
 */
export function judgeAdminApproval(facts: AdminApprovalFacts, stage: "admission" | "reservation"): AdminApproval {
  const reviewer = facts.admission.member;
  if (facts.verdict !== "approve")
    return { counts: false, rule: "admin-required", reopens: false, text: "an objection is not an approval" };
  if (facts.admission.role !== "admin" || reviewer === null)
    return { counts: false, rule: "admin-required", reopens: false, text: `${reviewer ?? "the signer"} was not an admin when the review was admitted` };
  const { signer, grantor } = facts.revoked;
  if (signer === "compromised" || grantor === "compromised")
    return { counts: false, rule: "evidence-invalid", reopens: stage === "reservation", text: `a key behind ${reviewer}'s approval is revoked as compromised` };
  if (facts.retiredEvidence === "reopens" && (signer === "retired" || grantor === "retired"))
    return { counts: false, rule: "evidence-invalid", reopens: stage === "reservation", text: `a key behind ${reviewer}'s approval is retired, and this policy reopens such evidence` };
  const self = facts.authors.includes(reviewer);
  if (!self) return { counts: true, flag: null, text: `${reviewer} was an admin and not an author when the review was admitted` };
  if (stage === "reservation" && !facts.flagged)
    return { counts: false, rule: "self-review", reopens: true, text: `${reviewer} is an author, and the approval was not admitted as a sole-admin self-approval` };
  if (facts.activeAdmins === 1)
    return { counts: true, flag: SOLE_ADMIN_FLAG, text: `${reviewer} is the only active admin, so the self-approval counts and is flagged ${SOLE_ADMIN_FLAG}` };
  return {
    counts: false,
    rule: "self-review",
    reopens: stage === "reservation",
    text: `${reviewer} is an author and the room has ${facts.activeAdmins} active admins, so another admin must approve`,
  };
}

/** The current state of the member who starts a landing or holds a recovery lane. */
export interface InitiatorFacts {
  readonly member: MemberId | null;
  /** The member's role now, or null if removed or not a member. */
  readonly role: Role | null;
  readonly active: boolean;
}

/**
 * The land initiator's or recovery-lane holder's current admin authority
 * (R-ADMIN-5, R-ADMIN-8). Judged now, at every act and at reservation,
 * separately from the evidence.
 */
export function judgeInitiator(facts: InitiatorFacts): { readonly ok: true } | { readonly ok: false; readonly rule: "admin-required"; readonly text: string } {
  if (facts.active && facts.role === "admin" && facts.member !== null) return { ok: true };
  return { ok: false, rule: "admin-required", text: `${facts.member ?? "the signer"} is not an active admin now` };
}

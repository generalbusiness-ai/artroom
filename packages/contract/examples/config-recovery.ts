/**
 * The configuration-recovery path (review 45431cd9, P1.2; R-ADMIN-5 to
 * R-ADMIN-9). Compiled, never run.
 *
 * The active policy refuses every ordinary workflow act and blocks every
 * landing. No lane is held. The sole admin repairs `.artroom/policy.json`
 * through a configuration-recovery lane: claim, workspace, propose, review,
 * land. Policy rules are not evaluated on that lane; platform rules are.
 * The proposed policy never judges its own authorization: it applies only
 * after it lands and activates.
 */

import { isRefusal, type LandOp, type RoomApi, type Sha } from "@generalbusiness/artroom-contract";
import { policy, rule } from "@generalbusiness/artroom-contract/policy";

declare function gitPush(remote: string, token: string): Promise<Sha>;
declare function show(message: string): void;

/** The bad policy that is active: every ordinary act refused, every landing blocked. */
export const lockout = policy(
  rule({
    id: "freeze",
    on: ["claim", "propose", "note", "review", "land", "release", "renew"],
    refuse: "true",
    fix: "Nothing can be done.",
  }),
  rule({ id: "never-land", kind: "land", block: "true", reason: "Frozen.", fix: "None." }),
);

export async function restorePolicy(admin: RoomApi): Promise<LandOp | null> {
  // 1. claim: admin only, scope inside .artroom/** only (R-ADMIN-5).
  const claim = await admin.claim({
    goal: "Restore a working policy",
    scope: [".artroom/policy.json"],
    purpose: "config-recovery",
  });
  if (isRefusal(claim)) {
    show(`${claim.rule}: ${claim.reason}`); // "admin-required", "recovery-scope"; never "freeze"
    return null;
  }
  if (!claim.flags.includes("config-recovery")) return null;

  // 2. workspace and push.
  const op = await admin.workspace(claim);
  if (isRefusal(op)) return null;
  const ready = await admin.wait(op, { until: ["ready", "failed"] });
  if (ready.state === "failed") return null;
  const grant = await admin.workspaceToken(claim);
  if (isRefusal(grant)) return null;
  const head = await gitPush(grant.remote, grant.token);

  // 3. propose: changed paths must all be under .artroom/**; only obl_admin-approval (R-ADMIN-6).
  const proposal = await admin.propose(claim, { head, expectedGeneration: 0, summary: "Replace the frozen policy." });
  if (isRefusal(proposal)) {
    show(`${proposal.rule}: ${proposal.reason}`); // "recovery-scope", "policy-invalid", "generation-moved"
    return null;
  }

  // 4. review: an admin's approval; a sole admin's own approval is flagged (R-ADMIN-2, R-ADMIN-7).
  const review = await admin.review(proposal, { verdict: "approve", scope: [".artroom/**"], text: "Restores the default rules." });
  if (isRefusal(review)) {
    show(`${review.rule}: ${review.reason}`); // "self-review" when a second admin exists
    return null;
  }
  if (review.flags.includes("sole-admin-self-approval")) show("sole-admin self-approval recorded");

  // 5. land: fenced by lease and generation as usual; no land rules (R-ADMIN-8).
  const landing = await admin.land(claim, proposal);
  if (isRefusal(landing)) {
    show(`${landing.rule}: ${landing.reason}`); // "obligation-open" until the admin approval exists
    return null;
  }
  const done = await admin.wait(landing.op, { until: ["landed", "retryable", "failed", "unresolved", "aborted"] });
  if (done.state === "landed") show("landed; the new policy activates at the next seq (R-POL-9)");
  return done;
}

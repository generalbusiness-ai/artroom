/**
 * The scenario room's `.artroom/policy.json`, as the contract's
 * `PolicyDocument`. The mock admits acts synchronously, so each expression
 * has a TypeScript twin below; tests check each twin against the policy
 * runtime's evaluator (test/policy-runtime.test.ts).
 */

import type { Glob, PolicyDocument, Role } from "../contract.ts";
import { compileTargets, refuseClaimExpr, refusesClaimTwin } from "../refuse-claim.ts";

const MIGRATIONS = (() => {
  const c = compileTargets(["migrations/**"]);
  if ("problem" in c) throw new Error(c.problem);
  return c.targets;
})();
const AGENTS: readonly Role[] = ["agent"];

export const POLICY: PolicyDocument = {
  format: "artroom-policy-v1",
  profile: "artroom-jsonata-v1",
  owners: {
    "src/api/**": ["@security"],
    "src/lib/authz/**": ["@security"],
    "src/lib/ratelimit/**": ["@platform"],
    "src/lib/log/**": ["@platform"],
    "migrations/**": ["@sam"],
  },
  carry: { verdicts: true, checks: true, globalInputs: [], dependsOn: {} },
  lanes: "by-scope",
  retiredEvidence: "counts",
  rules: [
    {
      id: "agents-stay-out-of-migrations",
      kind: "refuse",
      description: "Database migrations are claimed by people, not agents.",
      on: ["claim"],
      refuse: refuseClaimExpr(AGENTS, MIGRATIONS),
      reason: "Agents may not claim database migrations.",
      fix: "Leave migrations/** out of the claim, or ask @sam to claim the migration.",
    },
    {
      id: "security-review",
      kind: "require",
      description: "API and authorization changes need a review from @security.",
      paths: ["src/api/**", "src/lib/authz/**"],
      obligation: { type: "review", from: ["@security"], count: 1, allowSelf: false },
    },
    {
      id: "platform-review",
      kind: "require",
      description: "Shared library changes need a review from @platform.",
      paths: ["src/lib/ratelimit/**", "src/lib/log/**"],
      obligation: { type: "review", from: ["@platform"], count: 1, allowSelf: false },
    },
    {
      id: "tests",
      kind: "require",
      description: "Every source change needs the tests check from @ci.",
      paths: ["src/**"],
      obligation: { type: "check", check: "tests", by: ["@ci"] },
    },
    {
      id: "authz-changes",
      kind: "notify",
      description: "Tell @platform whenever authorization code changes.",
      on: ["propose"],
      when: '$count(proposal.paths[$substring($, 0, 14) = "src/lib/authz/"]) > 0',
      to: ["@platform"],
      why: "Authorization code changed, and rule authz-changes tells @platform.",
    },
  ],
};

/** The TypeScript twin of `agents-stay-out-of-migrations`. */
export function refusesClaim(role: Role, scope: readonly Glob[]): boolean {
  return refusesClaimTwin(AGENTS, MIGRATIONS, role, scope);
}

/** The TypeScript twin of `authz-changes`'s `when`. */
export function notifiesAuthz(paths: readonly string[]): boolean {
  return paths.some((p) => Array.from(p).slice(0, 14).join("") === "src/lib/authz/");
}

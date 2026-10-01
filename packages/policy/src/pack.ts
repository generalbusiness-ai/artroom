/**
 * The default policy pack (lane D). Eleven named rules, each built with the
 * authoring helpers, plus carry settings. `starterPolicy()` assembles them
 * for a repository; `PACK` documents each rule for the guide
 * (docs/policy-pack.md).
 *
 * Some things a team expects from "policy" are platform invariants, not
 * rules, and are deliberately not duplicated here: changes outside a claim
 * (`outside-claim`), secrets in acts (`secret-detected`), admin approval of
 * `.artroom/**` (`obl_admin-approval`), every review obligation met before
 * `land` (`obligation-open`), and a clean merge (preparation `failed` with
 * `conflict`). `PLATFORM` lists them.
 */

import type { Glob, PolicyDocument, PolicyPart, Principal, RuleId } from "@generalbusiness/artroom-contract";
import { OBJECTION_OPEN, carry, owners, policy, requireCheck, requireReview, rule } from "./helpers.ts";
import { globCovers } from "./glob.ts";

// ------------------------------------------------------------------ refuse

/** Refuse a proposal on a lane nobody has claimed. */
export const claimBeforePropose = (): PolicyPart =>
  rule({
    id: "claim-before-propose",
    kind: "refuse",
    description: "Work is proposed only on a claimed lane, so everyone can see who is changing what.",
    on: ["propose"],
    refuse: "$not(lane.claimed)",
    reason: "This lane has no claim, so nobody can see who is changing these paths.",
    fix: "Claim the paths you are changing, then propose again.",
  });

/** Refuse a claim on the whole repository, except by an admin. */
export const narrowClaims = (): PolicyPart =>
  rule({
    id: "narrow-claims",
    kind: "refuse",
    description: "Claims name the paths a lane will change; only an admin may claim the whole repository.",
    on: ["claim"],
    refuse: '"**" in act.body.scope and actor.role != "admin"',
    reason: "A claim on ** covers the whole repository and would overlap every other lane.",
    fix: "Claim only the directories or files you will change, for example src/api/**.",
  });

// ----------------------------------------------------------------- require

/**
 * CODEOWNERS: changed paths need a review from their owners. The owners map
 * must cover every path the rule applies to (see `ownerCoverage`): by
 * default that is every path, so the map needs a fallback owner for `**`.
 */
export const ownerReview = (paths: readonly Glob[] = ["**"]): PolicyPart =>
  requireReview({ id: "owner-review", paths, from: "owners" });

/** Required check: tests, for code and tests. */
export const checkTests = (by: Principal = "@ci", paths: readonly Glob[] = ["src/**", "tests/**", "test/**"]): PolicyPart =>
  requireCheck("tests", { id: "check-tests", paths, by });

/** Required check: types, for TypeScript and its configuration. */
export const checkTypes = (by: Principal = "@ci", paths: readonly Glob[] = ["**/*.ts", "**/*.tsx", "**/tsconfig*.json"]): PolicyPart =>
  requireCheck("types", { id: "check-types", paths, by });

/**
 * Deployment and CI configuration needs an admin's review. `.artroom/**`
 * already needs one by platform rule (R-ADMIN-1); this extends the same
 * protection to the files that decide what runs and ships.
 */
export const deployConfigReview = (
  paths: readonly Glob[] = [".github/**", "wrangler.*", "**/wrangler.*", "Dockerfile", "**/Dockerfile"],
): PolicyPart => requireReview({ id: "deploy-config-review", paths, from: "role:admin" });

// ------------------------------------------------------------------- carry

/**
 * Carry settings: extra global inputs, and default `dependsOn` per area
 * (R-CARRY-2, R-CARRY-3), plus the `stale-approval` carry rule: a large
 * rework does not keep earlier approvals, however far it is from the
 * reviewed scope.
 */
export const carryDefaults = (
  dependsOn: Readonly<Record<Glob, readonly Glob[]>> = { "src/api/**": ["src/lib/**", "src/db/**"] },
  globalInputs: readonly Glob[] = ["config/**"],
  maxChanged = 25,
): PolicyPart =>
  carry({
    globalInputs,
    dependsOn,
    allow: [{ id: "stale-approval", evidence: "review", allow: `$count(changedSince) <= ${maxChanged}` }],
  });

// -------------------------------------------------------------------- land

/**
 * A change to a sensitive area needs at least one approval made on this very
 * generation; carried approvals alone cannot land it.
 */
export const freshApproval = (prefix = "src/api/"): PolicyPart =>
  rule({
    id: "fresh-approval",
    kind: "land",
    description: `A change under ${prefix} lands only with an approval made on this generation.`,
    block: `$count(proposal.paths[$substring($, 0, ${[...prefix].length}) = ${JSON.stringify(prefix)}]) > 0 and $count(reviews[verdict = "approve" and basis = "here"]) = 0`,
    reason: `This proposal changes ${prefix} and its approvals were all carried from earlier generations.`,
    fix: "Ask an owner to review this generation.",
  });

// ------------------------------------------------------------------ notify

/** Owners see every proposal that touches their paths. */
export const notifyOwners = (): PolicyPart =>
  rule({ id: "notify-owners", kind: "notify", on: ["propose"], to: ["owners"], why: "You own a path this proposal changes." });

/** The lane's holder sees objections and failed checks. */
export const notifyHolder = (): PolicyPart =>
  rule({
    id: "notify-holder",
    kind: "notify",
    on: ["review", "check"],
    when: '(act.kind = "review" and act.body.verdict = "object") or (act.kind = "check" and act.body.ok = false)',
    to: ["holder"],
    why: "Someone objected to your proposal, or a required check failed.",
  });

// ---------------------------------------------------------------- assembly

export interface StarterOptions {
  /**
   * CODEOWNERS-style map: pattern to owners. Every matching pattern adds its
   * owners. It must give every path an owner, so it needs a fallback entry
   * such as `"**": "@maintainers"`; `starterPolicy` throws otherwise.
   */
  readonly owners: Readonly<Record<Glob, Principal | readonly Principal[]>>;
  /** The checker principal for tests and types. Default `@ci`. */
  readonly ci?: Principal;
  /** Default `dependsOn` per area. */
  readonly dependsOn?: Readonly<Record<Glob, readonly Glob[]>>;
  /** The sensitive area for `fresh-approval`, as a path prefix. Default `src/api/`. */
  readonly sensitive?: string;
}

/** The starter policy: every pack rule, for one repository. Throws if a path could have no owner. */
export function starterPolicy(opts: StarterOptions): PolicyDocument {
  const ci = opts.ci ?? "@ci";
  const doc = policy(
    owners(opts.owners),
    claimBeforePropose(),
    narrowClaims(),
    ownerReview(),
    checkTests(ci),
    checkTypes(ci),
    deployConfigReview(),
    carryDefaults(opts.dependsOn),
    freshApproval(opts.sensitive),
    notifyOwners(),
    notifyHolder(),
  );
  const problems = ownerCoverage(doc);
  if (problems.length) throw new TypeError(`Invalid starter policy: ${problems.join("; ")}`);
  return doc;
}

/**
 * Owner coverage. A review obligation whose only `from` is `owners` can be
 * met only by the owners of its paths (R-OBL-2). If a changed path matches
 * the rule but no owners pattern, a proposal that changes only such paths
 * gets an obligation nobody can meet, and it can never land. So each glob
 * of such a rule must be covered by one owners pattern (validation already
 * requires each pattern to name at least one owner). Returns one problem per
 * uncovered glob; empty when covered.
 *
 * The check is conservative (`globCovers`): several patterns that only
 * together cover a glob are not enough. It ignores `when`, since a `when`
 * may be true for an unowned path. The room's own validation (R-POL-1)
 * does not run it; the compiler and `starterPolicy` do.
 */
export function ownerCoverage(doc: PolicyDocument): string[] {
  const owned = Object.keys(doc.owners);
  const problems: string[] = [];
  for (const r of doc.rules) {
    if (r.kind !== "require" || r.obligation.type !== "review") continue;
    if (!r.obligation.from.every((f) => f === "owners")) continue;
    for (const glob of r.paths)
      if (!owned.some((pattern) => globCovers(pattern, glob)))
        problems.push(
          `rule ${r.id} needs a review from the owners of ${glob}, but no owners pattern covers all of ${glob}, ` +
            `so a change to an unowned path would need a review nobody can give. ` +
            `Add a fallback owner, for example owners({ "**": "@maintainers" }), or limit the rule to owned paths`,
        );
  }
  return problems;
}

/** What each pack rule replaces, for the guide. */
export interface PackEntry {
  readonly id: RuleId;
  readonly kind: "refuse" | "require" | "carry" | "land" | "notify";
  readonly replaces: string;
}

export const PACK: readonly PackEntry[] = [
  { id: "claim-before-propose", kind: "refuse", replaces: "a pre-push hook that requires a ticket or branch name" },
  { id: "narrow-claims", kind: "refuse", replaces: "a pre-push hook that rejects repository-wide changes" },
  { id: "owner-review", kind: "require", replaces: "CODEOWNERS with 'require review from code owners'" },
  { id: "check-tests", kind: "require", replaces: "a required CI status check for tests" },
  { id: "check-types", kind: "require", replaces: "a required CI status check for the type checker" },
  { id: "deploy-config-review", kind: "require", replaces: "CODEOWNERS for .github/ and deploy files, owned by admins" },
  { id: "stale-approval", kind: "carry", replaces: "branch protection's 'dismiss stale approvals when new commits are pushed'" },
  { id: OBJECTION_OPEN.id, kind: "land", replaces: "branch protection's 'require conversation resolution' and blocking 'request changes' reviews" },
  { id: "fresh-approval", kind: "land", replaces: "branch protection's 'require approval of the most recent push', for one area" },
  { id: "notify-owners", kind: "notify", replaces: "CODEOWNERS auto-requested reviewers, and a review-assistant path instruction" },
  { id: "notify-holder", kind: "notify", replaces: "pull-request email notifications for 'changes requested' and failed checks" },
];

/** Things the platform enforces without any policy rule. */
export const PLATFORM: readonly { readonly refusal: string; readonly rule: string; readonly what: string }[] = [
  { refusal: "outside-claim", rule: "R-PROP-4", what: "a proposal that changes paths outside its claim" },
  { refusal: "secret-detected", rule: "R-SEC-1 to 3", what: "a secret in any act body, including notes" },
  { refusal: "obl_admin-approval", rule: "R-ADMIN-1", what: "an admin approval for any change to .artroom/**" },
  { refusal: "obligation-open", rule: "R-LAND-1", what: "landing while a review obligation is open" },
  { refusal: "conflict", rule: "R-LAND-4", what: "landing a proposal that does not merge cleanly" },
];

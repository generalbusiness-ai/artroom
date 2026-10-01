/**
 * The demo repository's policy. Each line is one rule from the default
 * policy pack; docs/policy-pack.md explains what each one replaces.
 * Compile it to policy.json with:
 *   npm run compile-policy --workspace @generalbusiness/artroom-policy -- examples/demo-repo/.artroom
 */

import { owners, policy } from "@generalbusiness/artroom-policy/helpers";
import {
  carryDefaults,
  checkTests,
  checkTypes,
  claimBeforePropose,
  deployConfigReview,
  freshApproval,
  narrowClaims,
  notifyHolder,
  notifyOwners,
  ownerReview,
} from "@generalbusiness/artroom-policy/pack";

export default policy(
  // CODEOWNERS
  owners({
    "src/api/**": "@security",
    "src/**": "@app",
    "docs/**": "@docs",
  }),
  // Before an act is recorded
  claimBeforePropose(),
  narrowClaims(),
  // What a proposal needs
  ownerReview(),
  checkTests("@ci"),
  checkTypes("@ci"),
  deployConfigReview(),
  // Which earlier reviews still count
  carryDefaults({ "src/api/**": ["src/lib/**", "src/db/**"] }),
  // Before it lands (objection-open is added by policy())
  freshApproval("src/api/"),
  // Who hears about it
  notifyOwners(),
  notifyHolder(),
);

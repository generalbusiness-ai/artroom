/**
 * `@generalbusiness/artroom-derive/rule`: evaluation of `rule` guards, in
 * preparation (scope contract, section 5.2, step 5). It is a separate entry
 * point because it is asynchronous and loads the engine. The package's main
 * entry stays synchronous: its judges take the results as `Prepared` records.
 */

import type { Prepared } from "@generalbusiness/artroom-contract";
import { canonicalBytes, digestBytes } from "@generalbusiness/artroom-bytes";
import type { Profile, RuleInput } from "../index.ts";
import { RuleEvalError } from "./errors.ts";
import { admit, evaluate } from "./evaluator.ts";

export { BUDGET_CODES, TYPE_CODES, RuleEvalError, RuleRuntimeFailure, type EvalCode } from "./errors.ts";
export { ENGINE_FINGERPRINT, admit, assertEngine, evaluate, probeResults, type Evaluation, type Meter } from "./evaluator.ts";
export { JSONATA_VERSION, PROFILE } from "./profile.ts";

/** The profile table for `validateDefinition` that also checks each rule's text against the profile. */
export const RULE_PROFILES: Readonly<Record<string, Profile>> = {
  "restricted@1": {
    admit(source) {
      try {
        admit(source);
        return null;
      } catch (error) {
        if (error instanceof RuleEvalError) return `${error.code}: ${error.message}`;
        throw error;
      }
    },
  },
};

/**
 * Evaluate each rule over the input `prepareRules` built for it. A rule
 * holds only when its expression gives `true`. Any other value, and any
 * deterministic refusal of the profile, is `false`: the same expression and
 * input always end the same way. A fault of the engine is thrown, and
 * nothing is prepared. Each record's digest is computed here from the input
 * that was evaluated.
 */
export async function evaluateRules(asked: readonly RuleInput[]): Promise<Prepared[]> {
  const prepared: Prepared[] = [];
  for (const { rule, source, input } of asked) {
    let result = false;
    try {
      result = (await evaluate(source, input)).value === true;
    } catch (error) {
      if (!(error instanceof RuleEvalError)) throw error;
    }
    prepared.push({ rule, input: digestBytes(canonicalBytes(input)), result });
  }
  return prepared;
}

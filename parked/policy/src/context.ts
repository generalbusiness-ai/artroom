/**
 * The replay context (`ReplayContext` in the contract, R-EVAL-8). Everything besides the
 * active policy and the profile that decides an evaluate call's outcome is
 * in one value:
 * - the rule input;
 * - the act budget: its accounting version, limits and the usage already
 *   spent by earlier calls for the same act;
 * - the lane purpose, and for refuse whether the recovery key signed;
 * - for carry, the platform facts (revocation, check binding);
 * - for notify, the directory that expands roles and reviewers.
 *
 * The context is copied and frozen synchronously when an evaluate function
 * is called, before any asynchronous work. The digest, the evaluated input
 * and the retained copy are all that one owned value, so a caller who
 * changes its objects later changes nothing. `Decision.input` is the digest
 * of the canonical context. `replay(policy, context)` reconstructs the call.
 */

import type { BudgetState, Json } from "@generalbusiness/artroom-contract";
import { PolicyEvalError, PolicyRuntimeFailure } from "./errors.ts";
import { canonicalize } from "./integrity.ts";
import { deepFreeze } from "./values.ts";
import { ACCOUNTING } from "./profile.ts";
import type { ActMeter } from "./evaluator.ts";

export type { BudgetState, CarryFactsRecord, NotifyDirectory, ReplayContext, Usage } from "@generalbusiness/artroom-contract";
import type { ReplayContext } from "@generalbusiness/artroom-contract";

export function budgetState(meter: ActMeter): BudgetState {
  return {
    accounting: ACCOUNTING,
    limits: { steps: meter.limits.steps, inspectedBytes: meter.limits.inspectedBytes },
    start: { steps: meter.steps, inspectedBytes: meter.inspectedBytes },
  };
}

/** A fresh meter that starts where the context says. */
export function meterFrom(budget: BudgetState): ActMeter {
  return { steps: budget.start.steps, inspectedBytes: budget.start.inspectedBytes, limits: budget.limits };
}

/**
 * An owned, frozen copy of a context. Synchronous, so call it before any
 * await. A context that is not profile JSON is the room's bug: it is a
 * runtime failure and nothing is recorded.
 */
export function own<C extends ReplayContext>(context: C): C {
  if ((context.budget as { accounting?: unknown }).accounting !== ACCOUNTING)
    throw new PolicyRuntimeFailure("engine_error", `Unknown budget accounting ${String(context.budget.accounting)}`);
  try {
    return deepFreeze(JSON.parse(canonicalize(context as unknown as Json))) as C;
  } catch (error) {
    if (error instanceof PolicyEvalError)
      throw new PolicyRuntimeFailure("engine_error", `The room built a rule context that is not profile JSON: ${error.message}`);
    throw error;
  }
}

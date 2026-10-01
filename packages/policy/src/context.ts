/**
 * The replay context (review dd2a995b P1.1, P1.2). Everything besides the
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

import type { Json, LanePurpose, MemberId, RevocationReason, Role } from "@generalbusiness/artroom-contract";
import type { CheckCarryFacts } from "./carry.ts";
import type { InputOf } from "./inputs.ts";
import { PolicyEvalError, PolicyRuntimeFailure } from "./errors.ts";
import { canonicalize } from "./integrity.ts";
import { deepFreeze } from "./values.ts";
import { ACCOUNTING } from "./profile.ts";
import type { ActMeter } from "./evaluator.ts";

export interface Usage {
  readonly steps: number;
  readonly inspectedBytes: number;
}

/** The act budget as one call saw it. */
export interface BudgetState {
  readonly accounting: typeof ACCOUNTING;
  readonly limits: Usage;
  /** Spent by earlier calls for the same act before this call began. */
  readonly start: Usage;
}

/** What the room supplies to turn notify targets into members and teams. */
export interface NotifyDirectory {
  /** Active members by role, to expand `role:<role>` principals. */
  readonly roles: Readonly<Partial<Record<Role, readonly MemberId[]>>>;
  /** The qualifying reviewers of the proposal, for the `reviewers` target. */
  readonly reviewers: readonly MemberId[];
}

/** Carry facts as JSON: absent values are null. */
export interface CarryFactsRecord {
  readonly revoked: RevocationReason | null;
  readonly check: CheckCarryFacts | null;
}

export type ReplayContext =
  | { readonly kind: "refuse"; readonly input: InputOf<"refuse">; readonly budget: BudgetState; readonly purpose: LanePurpose; readonly recoveryKey: boolean }
  | { readonly kind: "require"; readonly input: InputOf<"require">; readonly budget: BudgetState; readonly purpose: LanePurpose }
  | { readonly kind: "carry"; readonly input: InputOf<"carry">; readonly budget: BudgetState; readonly purpose: LanePurpose; readonly facts: CarryFactsRecord }
  | { readonly kind: "land"; readonly input: InputOf<"land">; readonly budget: BudgetState; readonly purpose: LanePurpose }
  | { readonly kind: "notify"; readonly input: InputOf<"notify">; readonly budget: BudgetState; readonly directory: NotifyDirectory };

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

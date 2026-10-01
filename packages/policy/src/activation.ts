/**
 * Policy activation (R-POL-9, plan section 9 invariant 6). From the
 * `policy-activated` event, for each open proposal:
 * - obligations are recomputed under the new policy;
 * - carried evidence is re-evaluated, with `policy.same` false (R-CARRY-4).
 * Re-preparing landing operations is the landing lane's work (R-LAND-5).
 */

import type {
  Carried,
  Generation,
  LaneId,
  LanePurpose,
  NotCarried,
  ObligationId,
  Refusal,
  Reopened,
  RuleInput,
} from "@generalbusiness/artroom-contract";
import type { CarryFacts, CarryInput, Invariant } from "./carry.ts";
import { actMeter } from "./evaluator.ts";
import { evaluateCarry, evaluateRequire, type ActivePolicy, type ObligationSpec, type RuleEvaluation } from "./rules.ts";
import { validatePolicy } from "./validate.ts";

export interface OpenProposal {
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly require: Extract<RuleInput, { readonly kind: "require" }>;
  readonly purpose: LanePurpose;
  /** Obligation IDs before activation. */
  readonly obligations: readonly ObligationId[];
  /** Evidence currently counted as carried. Evidence reviewed here is bound to this generation and is not re-evaluated. */
  readonly carried: readonly { readonly obligation: ObligationId; readonly input: CarryInput; readonly facts?: CarryFacts }[];
}

export interface ActivationResult {
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly obligations: readonly ObligationSpec[];
  readonly added: readonly ObligationId[];
  readonly removed: readonly ObligationId[];
  /** Set when a `require` rule's condition failed to evaluate: the proposal cannot land under this policy. */
  readonly refusal: Refusal | null;
  readonly carried: readonly { readonly obligation: ObligationId; readonly evidence: Carried }[];
  readonly reopened: readonly { readonly obligation: ObligationId; readonly reopened: Reopened; readonly notCarried: NotCarried }[];
  readonly evaluations: readonly RuleEvaluation[];
  readonly invariants: readonly Invariant[];
}

export type Activation =
  | { readonly ok: true; readonly results: readonly ActivationResult[] }
  | { readonly ok: false; readonly refusal: Refusal; readonly problems: readonly string[] };

/** Each open proposal gets its own act budget (ACT_BUDGET) for its recomputation. */
export async function activate(policy: ActivePolicy, proposals: readonly OpenProposal[]): Promise<Activation> {
  const valid = validatePolicy(policy.doc);
  if (!valid.ok) return { ok: false, refusal: valid.refusal, problems: valid.problems };
  const results: ActivationResult[] = [];
  for (const p of proposals) {
    const budget = actMeter();
    const req = await evaluateRequire(policy, p.require, { purpose: p.purpose, budget });
    const ids = req.obligations.map((o) => o.id);
    const evaluations: RuleEvaluation[] = [...req.evaluations];
    const invariants: Invariant[] = [{ rule: "R-POL-9", held: true, detail: `obligations recomputed under ${policy.version}` }, ...req.invariants];
    const carried: { obligation: ObligationId; evidence: Carried }[] = [];
    const reopened: { obligation: ObligationId; reopened: Reopened; notCarried: NotCarried }[] = [];
    for (const c of p.carried) {
      if (!ids.includes(c.obligation)) continue;
      const result = await evaluateCarry(policy, { ...c.input, policy: { same: false } }, c.facts, { purpose: p.purpose, budget });
      evaluations.push(...result.evaluations);
      invariants.push(...result.invariants);
      if (result.carried) carried.push({ obligation: c.obligation, evidence: result.carried });
      else reopened.push({ obligation: c.obligation, reopened: { because: "policy-activated", policy: policy.version }, notCarried: result.notCarried! });
    }
    results.push({
      lane: p.lane,
      generation: p.generation,
      obligations: req.obligations,
      // A refusal leaves the obligations undecided, so none is reported added or removed.
      added: req.refusal ? [] : ids.filter((id) => !p.obligations.includes(id)),
      removed: req.refusal ? [] : p.obligations.filter((id) => !ids.includes(id)),
      refusal: req.refusal,
      carried,
      reopened,
      evaluations,
      invariants,
    });
  }
  return { ok: true, results };
}

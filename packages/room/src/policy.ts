/**
 * The adapter from `PolicyPort` to lane C's policy runtime
 * (@generalbusiness/artroom-policy). It passes every replay side input the
 * runtime records: the lane purpose, the recovery-key flag, carry facts and
 * the notify directory. One act's calls share one meter, in order.
 */

import {
  STAMP,
  actMeter,
  defaultPolicy,
  evaluateCarry,
  evaluateLand,
  evaluateRefuse,
  evaluateRequire,
  matchesRetainedLandInput,
  notifyContext,
  replay,
  validateCheckerConfig,
  validatePolicy,
  type ActMeter,
  type RuleEvaluation,
} from "@generalbusiness/artroom-policy";
import type { CheckerConfig, PolicyDocument } from "@generalbusiness/artroom-contract";
import type { Evaluation, PolicyPort } from "./ports.ts";

const evals = (list: readonly RuleEvaluation[]): Evaluation[] => list.map((e) => ({ decision: e.decision, context: e.context }));

export function lanePolicy(): PolicyPort {
  return {
    stamp: STAMP,
    defaultPolicy: () => defaultPolicy(),
    validatePolicy(doc) {
      const v = validatePolicy(doc);
      return v.ok ? { ok: true, doc: v.value as PolicyDocument } : { ok: false, problems: v.problems };
    },
    validateChecker(doc) {
      const v = validateCheckerConfig(doc);
      return v.ok ? { ok: true, config: v.value as CheckerConfig } : { ok: false, problems: v.problems };
    },
    actBudget: () => actMeter(),
    async refuse(policy, input, opts) {
      const r = await evaluateRefuse(policy, input, { budget: opts.budget as ActMeter, recoveryKey: opts.recoveryKey });
      return { refusal: r.refusal, evaluations: evals(r.evaluations) };
    },
    async require(policy, input, opts) {
      const r = await evaluateRequire(policy, input, { budget: opts.budget as ActMeter });
      return { refusal: r.refusal, obligations: r.obligations, evaluations: evals(r.evaluations) };
    },
    async carry(policy, input, facts, opts) {
      const r = await evaluateCarry(policy, input, facts, { budget: opts.budget as ActMeter, purpose: opts.purpose });
      return { carried: r.carried, notCarried: r.notCarried, evaluations: evals(r.evaluations) };
    },
    async land(policy, input, opts) {
      const r = await evaluateLand(policy, input, { budget: opts.budget as ActMeter });
      return { refusal: r.refusal, retained: r.retained, evaluations: evals(r.evaluations) };
    },
    matchesRetained: (retained, rebuilt) => matchesRetainedLandInput(retained, rebuilt),
    notifyContext: (input, directory) => notifyContext(input, directory),
    async notify(policy, context) {
      const r = await replay(policy, context);
      return { notify: r.notify, evaluations: evals(r.evaluations) };
    },
  };
}

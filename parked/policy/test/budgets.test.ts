/**
 * The evaluator's budgets as the rules use them (R-EVAL-5, R-EVAL-9), with
 * the measured usage pinned. This file runs in Node and in workerd: a
 * decision and its usage are recorded and replayed, so both runtimes must
 * give exactly the same numbers (docs/policy-pack.md).
 */

import { describe, expect, test } from "vitest";
import type { PolicyDocument } from "@generalbusiness/artroom-contract";
import demo from "../../../examples/demo-repo/.artroom/policy.ts";
import { policy, requireReview, rule } from "../src/helpers.ts";
import { evaluateCarry, evaluateLand, evaluateRefuse, evaluateRequire, type RuleEvaluation } from "../src/rules.ts";
import { actMeter } from "../src/evaluator.ts";
import { ACT_BUDGET } from "../src/profile.ts";
import { act, active, actor, carryInput, landInput, refuseInput, requireInput } from "./support/fixtures.ts";

const P: PolicyDocument = demo;
const A = active(P);
const approve = (n: number, basis: "here" | "carried" = "here", who: `@${string}` = "@security") => ({ act: act(n), verdict: "approve" as const, by: actor(who), basis });

describe("the per-act and per-evaluation budgets refuse deterministically (R-EVAL-9)", () => {
  // The spike's pathological rule: admitted by the profile, cubic in the input.
  const cubic = "$count(proposal.paths[$count($$.proposal.paths[$count($$.proposal.paths[$ = $$.proposal.paths[0]]) > 0]) > 0]) > 0";
  const p = policy(rule({ id: "cubic", on: "propose", refuse: cubic, fix: "Simplify the rule." }));
  const paths = Array.from({ length: 150 }, (_, i) => `src/file${i}.ts`);

  test("the cubic rule over 150 paths is refused with policy-budget-exceeded, with the same code and usage on every host", async () => {
    const input = refuseInput(p, "propose", { proposal: requireInput(p, paths).proposal });
    const r = await evaluateRefuse(active(p), input);
    expect(r.refusal?.rule).toBe("policy-budget-exceeded");
    const outcome = r.evaluations[0]!.decision.outcome;
    expect(outcome).toMatchObject({ result: "error", code: "policy-budget-exceeded" });
    expect(outcome.result === "error" && outcome.detail.split(":")[0]).toBe("act_inspection_budget");
    // Pinned: the Node and workerd runs must both give exactly this usage.
    expect(r.evaluations[0]!.decision.usage).toEqual({ steps: 775, inspectedBytes: 4202795 });
  });

  test("without the act budget, the per-evaluation atseq budget still refuses the cubic rule", async () => {
    const input = refuseInput(p, "propose", { proposal: requireInput(p, paths).proposal });
    const unlimited = actMeter({ steps: Number.MAX_SAFE_INTEGER, inspectedBytes: Number.MAX_SAFE_INTEGER });
    const r = await evaluateRefuse(active(p), input, { budget: unlimited });
    const outcome = r.evaluations[0]!.decision.outcome;
    expect(outcome.result === "error" && outcome.detail.split(":")[0]).toBe("inspection_budget");
  });

  test("the act budget is shared across rules and kinds of one act", async () => {
    const q = policy(
      rule({ id: "cheap", on: "propose", refuse: "$count(proposal.paths) > 1000", fix: "x" }),
      requireReview({ id: "also-cheap", paths: "**", from: "@lead", when: "$count(proposal.paths) > 0" }),
    );
    const budget = actMeter();
    const input = requireInput(q, paths);
    await evaluateRefuse(active(q), { ...refuseInput(q, "propose"), proposal: input.proposal }, { budget });
    const afterRefuse = budget.steps;
    await evaluateRequire(active(q), input, { budget });
    expect(afterRefuse).toBeGreaterThan(0);
    expect(budget.steps).toBeGreaterThan(afterRefuse);
    const tight = actMeter({ steps: afterRefuse, inspectedBytes: ACT_BUDGET.inspectedBytes });
    await evaluateRefuse(active(q), { ...refuseInput(q, "propose"), proposal: input.proposal }, { budget: tight });
    const req = await evaluateRequire(active(q), input, { budget: tight });
    expect(req.refusal?.rule).toBe("policy-budget-exceeded");
  });

  test("the act's inspected-byte budget refuses deterministically", async () => {
    const q = policy(rule({ id: "bytes", on: "propose", refuse: '($a := act.body.s & act.body.s; $length($a & $a) = 0)', fix: "x" }));
    const input = { ...refuseInput(q, "propose"), act: { kind: "propose" as const, target: null, body: { s: "x".repeat(100_000) } } };
    const r = await evaluateRefuse(active(q), input, { budget: actMeter({ steps: ACT_BUDGET.steps, inspectedBytes: 300_000 }) });
    const outcome = r.evaluations[0]!.decision.outcome;
    expect(outcome.result === "error" && outcome.detail.split(":")[0]).toBe("act_inspection_budget");
  });
});

describe("the default policy pack on a 500-path proposal", () => {
  const paths = Array.from({ length: 500 }, (_, i) => `src/api/module${String(i).padStart(3, "0")}/handler.ts`);
  const used = (evaluations: readonly RuleEvaluation[]) =>
    evaluations.reduce((u, e) => ({ steps: u.steps + e.decision.usage.steps, inspectedBytes: u.inspectedBytes + e.decision.usage.inspectedBytes }), { steps: 0, inspectedBytes: 0 });

  test("each act stays within the per-act budget, with the measured usage pinned", async () => {
    const proposal = requireInput(P, paths).proposal;
    // propose: refuse then require, one meter (R-EVAL-9).
    const meter = actMeter();
    const refuse = await evaluateRefuse(A, refuseInput(P, "propose", { proposal }), { budget: meter });
    const require = await evaluateRequire(A, requireInput(P, paths), { budget: meter });
    expect(refuse.refusal).toBeNull();
    expect(require.refusal).toBeNull();
    const propose = { steps: meter.steps, inspectedBytes: meter.inspectedBytes };
    // land and reservation: the largest rule, fresh-approval, scans every path.
    const reviews = [approve(40, "carried"), approve(41)];
    const landed = await evaluateLand(A, landInput(P, paths, reviews));
    const reserved = await evaluateLand(A, { ...landInput(P, paths, reviews), stage: "reservation" });
    expect(landed.refusal).toBeNull();
    expect(reserved.refusal).toBeNull();
    const fresh = landed.evaluations.find((e) => e.decision.rule === "fresh-approval")!.decision.usage;
    const jj = refuse.evaluations.find((e) => e.decision.rule === "jj-conflicts")!.decision.usage;
    // carry: stale-approval on 500 changed paths outside the reviewed scope.
    const carried = await evaluateCarry(A, carryInput(P, { scope: ["docs/x.md"], changedSince: paths.map((p) => p.replace("src/api/", "src/ui/")) }));
    expect(carried.notCarried?.rule).toBe("stale-approval");
    const measured = { propose, jjConflicts: jj, land: used(landed.evaluations), reservation: used(reserved.evaluations), freshApproval: fresh, carry: used(carried.evaluations) };
    expect(measured).toEqual(MEASURED);
    for (const u of Object.values(measured)) {
      expect(u.steps).toBeLessThan(ACT_BUDGET.steps);
      expect(u.inspectedBytes).toBeLessThan(ACT_BUDGET.inspectedBytes);
    }
  });

  test("jj-conflicts does not lower the path limit: at the largest proposal input the profile accepts, propose fits the act budget", async () => {
    // 1,461 such paths is the most a propose input can hold under the per-value byte limit, with or without this rule.
    const big = (n: number) => Array.from({ length: n }, (_, i) => `src/api/module${String(i).padStart(4, "0")}/handler.ts`);
    const meter = actMeter();
    const ok = await evaluateRefuse(A, refuseInput(P, "propose", { proposal: requireInput(P, big(1461)).proposal }), { budget: meter });
    expect(ok.refusal).toBeNull();
    expect({ steps: meter.steps, inspectedBytes: meter.inspectedBytes }).toEqual(LARGEST_PROPOSE);
    const over = await evaluateRefuse(A, refuseInput(P, "propose", { proposal: requireInput(P, big(1462)).proposal }));
    expect(over.refusal?.reason).toContain("value_bytes");
  });

  test("when the act budget runs out, the largest rule gives a deterministic policy-budget-exceeded", async () => {
    const reviews = [approve(40, "carried"), approve(41)];
    const tight = () => actMeter({ steps: 3000, inspectedBytes: ACT_BUDGET.inspectedBytes });
    const runs = [await evaluateLand(A, landInput(P, paths, reviews), { budget: tight() }), await evaluateLand(A, landInput(P, paths, reviews), { budget: tight() })];
    for (const r of runs) expect(r.refusal?.rule).toBe("policy-budget-exceeded");
    expect(runs[0]!.evaluations.map((e) => e.decision)).toEqual(runs[1]!.evaluations.map((e) => e.decision));
    const outcome = runs[0]!.evaluations.at(-1)!.decision.outcome;
    expect(outcome.result === "error" && outcome.detail.split(":")[0]).toBe("act_step_budget");
  });
});

/** Measured on Node and workerd; both runs must give exactly these (docs/policy-pack.md). */
/** Propose at 1,461 paths: jj-conflicts and claim-before-propose. */
const LARGEST_PROPOSE = { steps: 14622, inspectedBytes: 511636 };

const MEASURED = {
  propose: { steps: 5012, inspectedBytes: 172286 },
  jjConflicts: { steps: 5007, inspectedBytes: 172159 },
  land: { steps: 3546, inspectedBytes: 148055 },
  reservation: { steps: 3546, inspectedBytes: 148055 },
  freshApproval: { steps: 3532, inspectedBytes: 147708 },
  carry: { steps: 6, inspectedBytes: 30012 },
};

/** The five rule kinds over recorded inputs (R-POL-2 to R-POL-6, R-EVAL-3 to R-EVAL-6). */

import { describe, expect, test } from "vitest";
import { carry, lanes, owners, policy, requireCheck, requireReview, rule } from "../src/helpers.ts";
import { evaluateLand, evaluateNotify, evaluateRefuse, evaluateRequire, replay } from "../src/rules.ts";
import { actMeter } from "../src/evaluator.ts";
import { explain } from "../src/explain.ts";
import { digestJson } from "../src/integrity.ts";
import { ACT_BUDGET, STAMP } from "../src/profile.ts";
import { PolicyRuntimeFailure } from "../src/errors.ts";
import { act, active, actor, landInput, lane, notifyInput, refuseInput, requireInput, V1 } from "./support/fixtures.ts";

// The plan's section 5 example, verbatim.
const plan = policy(
  owners({ "migrations/**": "@db", "src/api/**": "@security" }),
  requireCheck("tests", { paths: "src/**", by: "@ci" }),
  requireReview({ paths: "src/api/**", from: "@security" }),
  carry({ globalInputs: ["package.json", "package-lock.json", "tsconfig*.json", "wrangler.*", ".artroom/**"] }),
  lanes("by-scope"),
  rule({ id: "claim-before-propose", on: "propose", refuse: "$not(lane.claimed)", fix: "Claim the paths first." }),
);

describe("refuse (R-POL-2)", () => {
  test("refuses with the rule's ID, reason and fix, and records the decision with the stamp", async () => {
    const input = refuseInput(plan, "propose", { lane: lane(null, false) });
    const r = await evaluateRefuse(active(plan), input);
    expect(r.refusal).toEqual({ refused: true, rule: "claim-before-propose", reason: "Policy rule claim-before-propose refused this act.", fix: "Claim the paths first." });
    const d = r.evaluations[0]!.decision;
    expect(d).toMatchObject({ rule: "claim-before-propose", kind: "refuse", policy: V1, stamp: STAMP, outcome: { result: "refuse" } });
    expect(d.input).toBe(await digestJson(r.evaluations[0]!.context as never));
    expect(d.usage.steps).toBeGreaterThan(0);
  });

  test("passes when the expression is false, and ignores acts of other kinds", async () => {
    expect((await evaluateRefuse(active(plan), refuseInput(plan, "propose"))).refusal).toBeNull();
    const other = await evaluateRefuse(active(plan), refuseInput(plan, "note", { lane: lane(null, false) }));
    expect(other.refusal).toBeNull();
    expect(other.evaluations).toEqual([]);
  });

  test("a non-boolean result is policy-type-error, a recorded domain outcome", async () => {
    const p = policy(rule({ id: "returns-number", on: "claim", refuse: "1", fix: "x" }));
    const r = await evaluateRefuse(active(p), refuseInput(p, "claim"));
    expect(r.refusal).toMatchObject({ refused: true, rule: "policy-type-error" });
    expect(r.evaluations[0]!.decision.outcome).toMatchObject({ result: "error", code: "policy-type-error" });
  });

  test("an absent result is policy-type-error", async () => {
    const p = policy(rule({ id: "absent", on: "claim", refuse: "nothing.here", fix: "x" }));
    expect((await evaluateRefuse(active(p), refuseInput(p, "claim"))).refusal?.rule).toBe("policy-type-error");
  });

  test("R-ADMIN-3: refuse rules are not evaluated for roster acts by an admin or the recovery key", async () => {
    const p = policy(rule({ id: "no-roster", on: "roster", refuse: "true", fix: "x" }));
    const admin = await evaluateRefuse(active(p), refuseInput(p, "roster", { actor: actor("@root", "admin") }));
    expect(admin.refusal).toBeNull();
    const recovery = await evaluateRefuse(active(p), refuseInput(p, "roster", { actor: actor(null, null) }), { recoveryKey: true });
    expect(recovery.refusal).toBeNull();
    const member = await evaluateRefuse(active(p), refuseInput(p, "roster", { actor: actor("@bob", "member") }));
    expect(member.refusal?.rule).toBe("no-roster");
  });
});

describe("require (R-POL-3, R-OBL-5)", () => {
  test("creates obligations from actual changed paths, with who may fulfil them", async () => {
    const r = await evaluateRequire(active(plan), requireInput(plan, ["src/api/login.ts", "README.md"]));
    expect(r.refusal).toBeNull();
    expect(r.obligations).toEqual([
      { id: "obl_check-tests", rule: "check-tests", policy: V1, paths: ["src/api/login.ts"], kind: "check", check: "tests", by: ["@ci"] },
      { id: "obl_review-src-api", rule: "review-src-api", policy: V1, paths: ["src/api/login.ts"], kind: "review", from: ["@security"], count: 1, allowSelf: false },
    ]);
    expect(r.evaluations.map((e) => e.decision.outcome.result)).toEqual(["obligation", "obligation", ]);
  });

  test("a rule whose paths do not match records a pass", async () => {
    const r = await evaluateRequire(active(plan), requireInput(plan, ["docs/intro.md"]));
    expect(r.obligations).toEqual([]);
    expect(r.evaluations.map((e) => e.decision.outcome.result)).toEqual(["pass", "pass"]);
  });

  test("a require rule over its budget refuses the act: never admitted with fewer obligations", async () => {
    const cubic = "$count(proposal.paths[$count($$.proposal.paths[$count($$.proposal.paths[$ = $$.proposal.paths[0]]) > 0]) > 0]) > 0";
    const p = policy(
      requireReview({ id: "first", paths: "**", from: "@lead" }),
      requireReview({ id: "costly", paths: "**", from: "@lead", when: cubic }),
    );
    const r = await evaluateRequire(active(p), requireInput(p, Array.from({ length: 150 }, (_, i) => `src/f${i}.ts`)));
    expect(r.refusal).toMatchObject({ refused: true, rule: "policy-budget-exceeded" });
    expect(r.obligations).toEqual([]);
    expect(explain(r).decisions.map((d) => [d.rule, d.outcome.result])).toEqual([["first", "obligation"], ["costly", "error"]]);
  });

  test("when: false skips the obligation; an error refuses the propose", async () => {
    const p = policy(
      requireReview({ id: "big-change", paths: "**", from: "@lead", when: "$count(proposal.paths) > 2" }),
      requireReview({ id: "broken", paths: "src/**", from: "@lead", when: '"yes"' }),
    );
    const small = await evaluateRequire(active(p), requireInput(p, ["docs/a.md"]));
    expect(small.obligations).toEqual([]);
    const broken = await evaluateRequire(active(p), requireInput(p, ["src/a.ts"]));
    expect(broken.refusal).toMatchObject({ rule: "policy-type-error" });
    expect(broken.obligations).toEqual([]);
  });

  test("R-OBL-2: allowSelf takes effect only when every path is a documentation path", async () => {
    const p = policy(requireReview({ id: "docs", paths: "**", from: "@writers", allowSelf: true }));
    const docs = await evaluateRequire(active(p), requireInput(p, ["docs/a.md", "src/README.md"]));
    expect(docs.obligations[0]).toMatchObject({ allowSelf: true });
    const code = await evaluateRequire(active(p), requireInput(p, ["docs/a.md", "src/a.ts"]));
    expect(code.obligations[0]).toMatchObject({ allowSelf: false });
  });

  test("R-ADMIN-1: .artroom/** always adds obl_admin-approval, whatever the policy says", async () => {
    const r = await evaluateRequire(active(plan), requireInput(plan, [".artroom/policy.json", "src/x.ts"]));
    expect(r.obligations.map((o) => o.id)).toEqual(["obl_admin-approval", "obl_check-tests"]);
    expect(r.obligations[0]).toMatchObject({ from: ["role:admin"], count: 1, allowSelf: false, paths: [".artroom/policy.json"] });
  });
});

describe("land (R-POL-6, R-POL-7)", () => {
  test("objection-open blocks while a qualifying reviewer's latest verdict is an objection", async () => {
    const reviews = [
      { act: act(40), verdict: "approve" as const, by: actor("@bob"), basis: "here" as const },
      { act: act(41), verdict: "object" as const, by: actor("@carol"), basis: "carried" as const },
    ];
    const blocked = await evaluateLand(active(plan), landInput(plan, ["src/a.ts"], reviews));
    expect(blocked.refusal).toMatchObject({ refused: true, rule: "objection-open" });
    const clear = await evaluateLand(active(plan), landInput(plan, ["src/a.ts"], reviews.slice(0, 1)));
    expect(clear.refusal).toBeNull();
    expect(clear.evaluations[0]!.decision.outcome).toEqual({ result: "pass" });
  });

  test("R-ADMIN-3, R-ADMIN-8: land rules apply on an ordinary lane, even for .artroom/**, and not on a recovery lane", async () => {
    const p = policy(rule({ id: "never", kind: "land", block: "true", reason: "Never.", fix: "None." }));
    expect((await evaluateLand(active(p), landInput(p, [".artroom/policy.json"]))).refusal?.rule).toBe("never");
    expect((await evaluateLand(active(p), landInput(p, [".artroom/policy.json"]), { purpose: "ordinary" })).refusal?.rule).toBe("never");
    const recovery = await evaluateLand(active(p), landInput(p, [".artroom/policy.json"]), { purpose: "config-recovery" });
    expect(recovery.refusal).toBeNull();
    expect(recovery.evaluations).toEqual([]);
  });
});

describe("notify (R-POL-5)", () => {
  const p = policy(
    owners({ "src/api/**": ["@security", "role:admin"] }),
    rule({ id: "owners-see-proposals", kind: "notify", on: ["propose"], to: ["owners", "holder"], why: "You own a changed path." }),
    rule({ id: "broken", kind: "notify", on: ["propose"], when: '"text"', to: ["@ops"], why: "Never." }),
  );

  test("resolves owners, roles and the holder, and an error notifies nobody without refusing", async () => {
    const doc = p;
    const r = await evaluateNotify(active(doc), notifyInput(doc, "propose", ["src/api/login.ts"]), { roles: { admin: ["@root"] }, reviewers: [] });
    expect(r.notify.map((n) => n.to)).toEqual(["@alice", "@root", "@security"]);
    expect(r.evaluations.map((e) => e.decision.outcome.result)).toEqual(["notify", "error"]);
  });
});

describe("determinism and replay (R-EVAL-5, R-EVAL-6)", () => {
  test("replaying the retained context gives identical decisions", async () => {
    const input = requireInput(plan, ["src/api/login.ts", "migrations/001.sql"]);
    const first = await evaluateRequire(active(plan), input);
    const replayed = await replay(active(plan), JSON.parse(JSON.stringify(first.evaluations[0]!.context)));
    expect(replayed.evaluations.map((e) => e.decision)).toEqual(first.evaluations.map((e) => e.decision));
  });

  test("a malformed input built by the room is a runtime failure: retryable, nothing to record", async () => {
    const input = { ...refuseInput(plan, "propose"), room: { admins: 1.5, members: 2 } };
    const error = await evaluateRefuse(active(plan), input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PolicyRuntimeFailure);
    expect(error).toMatchObject({ name: "ArtroomError", code: "policy-runtime", retryable: true });
  });

  test("an input over 256 KiB is a deterministic budget refusal, not a runtime failure", async () => {
    const big = { ...refuseInput(plan, "propose"), act: { kind: "propose" as const, target: null, body: { s: "x".repeat(262_144) } } };
    const r = await evaluateRefuse(active(plan), big);
    expect(r.refusal?.rule).toBe("policy-budget-exceeded");
  });
});

describe("budgets on Workers (room-core spike 2026-10-01)", () => {
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
    expect(r.evaluations[0]!.decision.usage).toEqual({ steps: 775, inspectedBytes: 4200107 });
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

describe("explain() data", () => {
  test("lists the rules applied, the inputs by digest and the outcomes", async () => {
    const refuse = await evaluateRefuse(active(plan), refuseInput(plan, "propose"));
    const req = await evaluateRequire(active(plan), requireInput(plan, ["src/api/login.ts"]));
    const e = explain(refuse, req);
    expect(e.stamp).toEqual(STAMP);
    expect(e.decisions.map((d) => [d.rule, d.outcome.result])).toEqual([
      ["claim-before-propose", "pass"],
      ["check-tests", "obligation"],
      ["review-src-api", "obligation"],
    ]);
    for (const d of e.decisions) expect(e.contexts[d.input]).toBeDefined();
    expect(e.lines).toContain("claim-before-propose did not refuse the act");
    expect(e.invariants).toContainEqual(expect.objectContaining({ rule: "R-PROP-5" }));
  });
});

describe("no shared mutable engine state (checker, room-core spike review)", () => {
  test("interleaved evaluations of the same rule keep their own inputs, outcomes and budgets", async () => {
    const q = policy(rule({ id: "many", on: "propose", refuse: "$count(proposal.paths[$ = $$.proposal.paths[0]]) > 0 and $count(proposal.paths) > 3", fix: "x" }));
    const small = { ...refuseInput(q, "propose"), proposal: requireInput(q, ["a.ts", "b.ts"]).proposal };
    const large = { ...refuseInput(q, "propose"), proposal: requireInput(q, Array.from({ length: 40 }, (_, i) => `f${i}.ts`)).proposal };
    const alone = [await evaluateRefuse(active(q), small), await evaluateRefuse(active(q), large)];
    const together = await Promise.all([evaluateRefuse(active(q), small), evaluateRefuse(active(q), large), evaluateRefuse(active(q), small)]);
    expect(together[0]!.evaluations[0]!.decision).toEqual(alone[0]!.evaluations[0]!.decision);
    expect(together[1]!.evaluations[0]!.decision).toEqual(alone[1]!.evaluations[0]!.decision);
    expect(together[2]!.evaluations[0]!.decision).toEqual(alone[0]!.evaluations[0]!.decision);
    expect(alone[0]!.refusal).toBeNull();
    expect(alone[1]!.refusal?.rule).toBe("many");
  });
});

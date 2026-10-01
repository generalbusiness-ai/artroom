/**
 * The default policy pack (lane D), run through the real runtime. Each rule
 * has a pass case and a refuse (or apply) case. Then the plan section 7
 * carry cases, the policy-level cases of protocol section 23, the
 * reservation-stage case, and the budget on a 500-path proposal.
 */

import { describe, expect, test } from "vitest";
import type { Digest, PolicyDocument } from "@generalbusiness/artroom-contract";
import demo from "../../../examples/demo-repo/.artroom/policy.ts";
import demoJson from "../../../examples/demo-repo/.artroom/policy.json" with { type: "json" };
import { PACK, starterPolicy } from "../src/pack.ts";
import { OBJECTION_OPEN } from "../src/helpers.ts";
import { validatePolicy } from "../src/validate.ts";
import { evaluateCarry, evaluateLand, evaluateNotify, evaluateRefuse, evaluateRequire, matchesRetainedLandInput, type RuleEvaluation } from "../src/rules.ts";
import { actMeter } from "../src/evaluator.ts";
import { checkerInputs, filterSnapshot } from "../src/carry.ts";
import { snapshotDigest, type SnapshotEntry } from "../src/integrity.ts";
import { ACT_BUDGET } from "../src/profile.ts";
import { act, active, actor, carryInput, lane, landInput, notifyInput, recoveryLane, refuseInput, requireInput, sha } from "./support/fixtures.ts";

const P: PolicyDocument = demo;
const A = active(P);
const approve = (n: number, basis: "here" | "carried" = "here", who: `@${string}` = "@security") => ({ act: act(n), verdict: "approve" as const, by: actor(who), basis });
const objection = (n: number, who: `@${string}` = "@security") => ({ act: act(n), verdict: "object" as const, by: actor(who), basis: "here" as const });

describe("the pack compiles to the committed demo policy", () => {
  test("policy.ts, policy.json and starterPolicy() agree, and the document is valid", () => {
    expect(JSON.parse(JSON.stringify(demo))).toEqual(demoJson);
    expect(validatePolicy(demoJson).ok).toBe(true);
    const starter = starterPolicy({ owners: { "src/api/**": "@security", "src/**": "@app", "docs/**": "@docs" } });
    expect(JSON.parse(JSON.stringify(starter))).toEqual(demoJson);
  });

  test("the pack has 11 named rules, each documented with what it replaces", () => {
    const ids = P.rules.map((r) => r.id).sort();
    expect(ids).toEqual(PACK.map((e) => e.id).sort());
    expect(ids).toHaveLength(11);
    expect(ids).toContain(OBJECTION_OPEN.id);
  });
});

describe("refuse rules", () => {
  test("claim-before-propose: refuses an unclaimed lane, passes a claimed one", async () => {
    const proposal = requireInput(P, ["src/app.ts"]).proposal;
    const refused = await evaluateRefuse(A, refuseInput(P, "propose", { proposal, lane: lane(null, false) }));
    expect(refused.refusal).toEqual({
      refused: true,
      rule: "claim-before-propose",
      reason: "This lane has no claim, so nobody can see who is changing these paths.",
      fix: "Claim the paths you are changing, then propose again.",
    });
    expect((await evaluateRefuse(A, refuseInput(P, "propose", { proposal }))).refusal).toBeNull();
  });

  test("narrow-claims: refuses a member's claim on **, passes a narrow claim and an admin's", async () => {
    const claim = (scope: string[], role: "member" | "admin" = "member") =>
      refuseInput(P, "claim", { act: { kind: "claim", target: null, body: { goal: "x", scope } }, actor: actor("@alice", role) });
    expect((await evaluateRefuse(A, claim(["**"]))).refusal?.rule).toBe("narrow-claims");
    expect((await evaluateRefuse(A, claim(["src/api/**"]))).refusal).toBeNull();
    expect((await evaluateRefuse(A, claim(["**"], "admin"))).refusal).toBeNull();
  });
});

describe("require rules", () => {
  const ids = async (paths: string[]) => (await evaluateRequire(A, requireInput(P, paths))).obligations.map((o) => o.id);

  test("owner-review: CODEOWNERS-style review from the paths' owners", async () => {
    const r = await evaluateRequire(A, requireInput(P, ["src/api/login.ts"]));
    expect(r.obligations.find((o) => o.id === "obl_owner-review")).toMatchObject({ kind: "review", from: ["owners"] });
    expect(r.evaluations[0]!.context.input.kind === "require" && r.evaluations[0]!.context.input.proposal.owners).toEqual([
      { path: "src/api/login.ts", owners: ["@security", "@app"] },
    ]);
  });

  test("check-tests and check-types: required by path; a docs-only change needs neither", async () => {
    expect(await ids(["src/app.ts"])).toEqual(["obl_owner-review", "obl_check-tests", "obl_check-types"]);
    expect(await ids(["tests/app.test.js"])).toEqual(["obl_owner-review", "obl_check-tests"]);
    expect(await ids(["docs/intro.md"])).toEqual(["obl_owner-review"]);
  });

  test("deploy-config-review: an admin reviews CI and deploy files; .artroom/** is the platform's own admin approval", async () => {
    expect(await ids([".github/workflows/ci.yml"])).toEqual(["obl_owner-review", "obl_deploy-config-review"]);
    expect(await ids(["wrangler.jsonc"])).toEqual(["obl_owner-review", "obl_deploy-config-review"]);
    expect(await ids([".artroom/policy.json"])).toEqual(["obl_admin-approval", "obl_owner-review"]);
  });
});

describe("land rules", () => {
  const land = (paths: string[], reviews: Parameters<typeof landInput>[2]) => evaluateLand(A, landInput(P, paths, reviews));

  test("objection-open: an owner's open objection blocks; approvals pass", async () => {
    expect((await land(["src/app.ts"], [approve(40, "here", "@app"), objection(41, "@app")])).refusal?.rule).toBe("objection-open");
    expect((await land(["src/app.ts"], [approve(40, "here", "@app")])).refusal).toBeNull();
  });

  test("fresh-approval: src/api/ with only carried approvals blocks; a fresh approval or another area passes", async () => {
    const blocked = await land(["src/api/login.ts"], [approve(40, "carried")]);
    expect(blocked.refusal).toEqual({
      refused: true,
      rule: "fresh-approval",
      reason: "This proposal changes src/api/ and its approvals were all carried from earlier generations.",
      fix: "Ask an owner to review this generation.",
    });
    expect((await land(["src/api/login.ts"], [approve(40, "carried"), approve(41)])).refusal).toBeNull();
    expect((await land(["src/app.ts"], [approve(40, "carried", "@app")])).refusal).toBeNull();
  });

  test("reservation stage: preparation evaluates stage reservation, retains bytes, and the guard compares them", async () => {
    const reviews = [approve(40, "carried")];
    const prospective = { ...landInput(P, ["src/api/login.ts"], reviews), stage: "reservation" as const };
    expect((await evaluateLand(A, prospective)).refusal?.rule).toBe("fresh-approval");
    const ok = { ...prospective, reviews: [...reviews, approve(41)] };
    const prepared = await evaluateLand(A, ok);
    expect(prepared.refusal).toBeNull();
    expect(matchesRetainedLandInput(prepared.retained!, JSON.parse(JSON.stringify(ok)))).toBe(true);
    expect(matchesRetainedLandInput(prepared.retained!, { ...ok, reviews: [...ok.reviews, objection(42)] })).toBe(false);
  });
});

describe("notify rules", () => {
  const dir = { roles: {}, reviewers: [] };

  test("notify-owners: the owners of changed paths hear about a proposal", async () => {
    const r = await evaluateNotify(A, notifyInput(P, "propose", ["src/api/login.ts", "docs/intro.md"]), dir);
    expect(r.notify.map((n) => n.to)).toEqual(["@app", "@docs", "@security"]);
  });

  test("notify-holder: the holder hears about an objection or a failed check, not an approval", async () => {
    const on = (kind: "review" | "check", body: object) => evaluateNotify(A, { ...notifyInput(P, kind, ["src/app.ts"]), act: { id: act(50), kind, target: null, body: body as never } }, dir);
    expect((await on("review", { verdict: "object" })).notify.map((n) => n.to)).toEqual(["@alice"]);
    expect((await on("check", { ok: false })).notify.map((n) => n.to)).toEqual(["@alice"]);
    expect((await on("review", { verdict: "approve" })).notify).toEqual([]);
  });
});

describe("carry: the pack's defaults and the plan section 7 cases", () => {
  const login = { scope: ["src/api/login.ts"] };

  test("plan 7 case 1: declared dependsOn and the dependency changes: not carried", async () => {
    const r = await evaluateCarry(A, carryInput(P, { ...login, dependsOn: ["src/lib/authz/**"], changedSince: ["src/lib/authz/check.ts"] }));
    expect(r.notCarried?.code).toBe("dependency-changed");
  });

  test("plan 7 case 2: no declaration, the pack's default for src/api/** lists src/lib/**: not carried", async () => {
    const r = await evaluateCarry(A, carryInput(P, { ...login, changedSince: ["src/lib/authz/check.ts"] }));
    expect(r.notCarried?.code).toBe("dependency-changed");
  });

  test("plan 7 case 3: no declaration and no default: carried and highlighted", async () => {
    const r = await evaluateCarry(A, carryInput(P, { scope: ["src/ui/button.ts"], changedSince: ["src/lib/authz/check.ts"] }));
    expect(r.carried?.reason.text).toBe("carried: reviewed and declared paths unchanged");
    expect(r.highlight).toBe(true);
  });

  test("plan 7 cases 4 and 5: package-lock.json or .artroom/policy.json: nothing carried; the pack adds config/**", async () => {
    for (const path of ["package-lock.json", ".artroom/policy.json", "config/flags.yaml"]) {
      const r = await evaluateCarry(A, carryInput(P, { ...login, changedSince: [path] }));
      expect(r.notCarried?.code, path).toBe("global-input-changed");
    }
  });

  test("stale-approval: a rework of more than 25 paths does not keep earlier approvals", async () => {
    const many = Array.from({ length: 26 }, (_, i) => `src/ui/c${i}.ts`);
    const r = await evaluateCarry(A, carryInput(P, { ...login, changedSince: many }));
    expect(r.notCarried).toMatchObject({ code: "policy-rejected", rule: "stale-approval" });
    expect((await evaluateCarry(A, carryInput(P, { ...login, changedSince: many.slice(0, 25) }))).carried).not.toBeNull();
  });

  const digest = (c: string): Digest => `sha256:${c.repeat(64).slice(0, 64)}`;
  const facts = (before: Parameters<typeof checkFacts>[0], now: Parameters<typeof checkFacts>[1]) => checkFacts(before, now);
  function checkFacts(input: { kind: "tree"; tree: ReturnType<typeof sha> } | { kind: "filtered"; snapshot: Digest; paths: string[] }, now: { tree: ReturnType<typeof sha>; snapshot: Digest | null }) {
    return {
      check: {
        before: { integration: sha("5"), input, config: digest("c"), runner: digest("e") },
        now: { integration: sha("6"), tree: now.tree, snapshot: now.snapshot, config: digest("c"), runner: digest("e") },
        volatile: false,
      },
    };
  }

  test("plan 7 case 6: a new failing test, src unchanged: the whole-tree tests check reruns", async () => {
    const r = await evaluateCarry(A, carryInput(P, { kind: "check", changedSince: ["tests/new.test.ts"] }), facts({ kind: "tree", tree: sha("7") }, { tree: sha("8"), snapshot: null }));
    expect(r.notCarried?.code).toBe("integration-changed");
  });

  test("section 23 'scoped checker, new test': inputs src/**, a new tests/ file changes the snapshot: not carried", async () => {
    const inputs = checkerInputs(["src/**"], P.carry)!;
    const files: SnapshotEntry[] = [["src/app.ts", "100644", sha("1")]];
    const was = await snapshotDigest(filterSnapshot(files, inputs));
    const now = await snapshotDigest(filterSnapshot([...files, ["tests/login.test.ts", "100644", sha("2")]], inputs));
    const r = await evaluateCarry(A, carryInput(P, { kind: "check", changedSince: ["tests/login.test.ts"] }), facts({ kind: "filtered", snapshot: was, paths: inputs }, { tree: sha("8"), snapshot: now }));
    expect(r.notCarried?.code).toBe("integration-changed");
  });

  test("plan 7 case 7: a file read by tests but outside a scoped checker's inputs is not in the runner's snapshot", () => {
    const inputs = checkerInputs(["src/**"], P.carry)!;
    expect(filterSnapshot([["data/users.json", "100644", sha("3")]] as SnapshotEntry[], inputs)).toEqual([]);
  });
});

describe("section 23: policy lockout", () => {
  test("on a configuration-recovery lane the pack's refuse, require and land rules are not evaluated", async () => {
    const proposal = requireInput(P, [".artroom/policy.json"]).proposal;
    const r = await evaluateRefuse(A, refuseInput(P, "propose", { proposal, lane: { ...recoveryLane(), claimed: false }, actor: actor("@root", "admin") }));
    expect(r.refusal).toBeNull();
    expect(r.evaluations).toEqual([]);
    const req = await evaluateRequire(A, { ...requireInput(P, [".artroom/policy.json"]), lane: recoveryLane() });
    expect(req.obligations.map((o) => o.id)).toEqual(["obl_admin-approval"]);
  });
});

describe("budget: the pack on a 500-path proposal", () => {
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
    // carry: stale-approval on 500 changed paths outside the reviewed scope.
    const carried = await evaluateCarry(A, carryInput(P, { scope: ["docs/x.md"], changedSince: paths.map((p) => p.replace("src/api/", "src/ui/")) }));
    expect(carried.notCarried?.rule).toBe("stale-approval");
    const measured = { propose, land: used(landed.evaluations), reservation: used(reserved.evaluations), freshApproval: fresh, carry: used(carried.evaluations) };
    expect(measured).toEqual(MEASURED);
    for (const u of Object.values(measured)) {
      expect(u.steps).toBeLessThan(ACT_BUDGET.steps);
      expect(u.inspectedBytes).toBeLessThan(ACT_BUDGET.inspectedBytes);
    }
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
const MEASURED = {
  propose: { steps: 5, inspectedBytes: 127 },
  land: { steps: 3546, inspectedBytes: 140555 },
  reservation: { steps: 3546, inspectedBytes: 140555 },
  freshApproval: { steps: 3532, inspectedBytes: 140208 },
  carry: { steps: 6, inspectedBytes: 30012 },
};

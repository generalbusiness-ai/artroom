/**
 * Policy-level cases from plan section 9 and protocol section 23:
 * sole-admin bootstrap (R-ADMIN-2), the fixed admin boundary and
 * configuration-recovery lanes (R-ADMIN-1 to 9), and policy activation
 * (R-POL-9). Roster, signature and lane-claim cases belong to the room lane.
 */

import { describe, expect, test } from "vitest";
import { judgeAdminApproval } from "../src/admin.ts";
import { activate } from "../src/activation.ts";
import { carry, policy, requireReview, rule } from "../src/helpers.ts";
import { evaluateCarry, evaluateLand, evaluateRefuse, evaluateRequire } from "../src/rules.ts";
import { validatePolicy } from "../src/validate.ts";
import { act, active, actor, carryInput, landInput, lane, refuseInput, requireInput, V1, V2 } from "./support/fixtures.ts";

const approve = { reviewer: "@root" as const, role: "admin" as const, verdict: "approve" as const, authors: ["@root" as const] };

describe("admin boundary and sole-admin bootstrap (R-ADMIN-1 to 9)", () => {
  test("sole admin changes policy: the self-approval counts and is flagged", () => {
    expect(judgeAdminApproval({ ...approve, activeAdmins: 1 }, "admission")).toMatchObject({ counts: true, flag: "sole-admin-self-approval" });
  });

  test("with a second admin, the author's own approval does not count", () => {
    expect(judgeAdminApproval({ ...approve, activeAdmins: 2 }, "admission")).toMatchObject({ counts: false, rule: "self-review" });
  });

  test("another admin's approval counts without the flag", () => {
    expect(judgeAdminApproval({ ...approve, reviewer: "@other", activeAdmins: 2 }, "admission")).toMatchObject({ counts: true, flag: null });
  });

  test("a non-admin cannot meet obl_admin-approval, and an objection is not an approval", () => {
    expect(judgeAdminApproval({ ...approve, reviewer: "@bob", role: "maintainer", activeAdmins: 1 }, "admission")).toMatchObject({ counts: false, rule: "admin-required" });
    expect(judgeAdminApproval({ ...approve, verdict: "object", activeAdmins: 1 }, "admission")).toMatchObject({ counts: false });
  });

  test("at reservation a flagged approval counts only while there is still exactly one admin", () => {
    expect(judgeAdminApproval({ ...approve, activeAdmins: 1, flagged: true }, "reservation")).toMatchObject({ counts: true, flag: "sole-admin-self-approval" });
    expect(judgeAdminApproval({ ...approve, activeAdmins: 2, flagged: true }, "reservation")).toMatchObject({ counts: false, reopens: true });
  });

  test("policy cannot remove the admin obligation: an empty policy still requires it", async () => {
    const empty = policy();
    const r = await evaluateRequire(active(empty), requireInput(empty, [".artroom/policy.json"]));
    expect(r.obligations.map((o) => o.id)).toEqual(["obl_admin-approval"]);
  });

  test("a policy rule cannot use the platform's admin-approval ID", () => {
    const doc = policy();
    const bad = { ...doc, rules: [...doc.rules, { id: "admin-approval", kind: "land", block: "false", reason: "x", fix: "y" }] };
    expect(validatePolicy(bad)).toMatchObject({ ok: false, refusal: { rule: "policy-invalid" } });
  });

  test("R-ADMIN-3: on an ordinary lane, policy rules apply to .artroom/** changes as usual", async () => {
    const lockout = policy(rule({ id: "freeze", on: "propose", refuse: "true", fix: "Nothing may change." }));
    const proposal = requireInput(lockout, [".artroom/policy.json"]).proposal;
    const r = await evaluateRefuse(active(lockout), refuseInput(lockout, "propose", { proposal }), { purpose: "ordinary" });
    expect(r.refusal?.rule).toBe("freeze");
  });

  test("policy lockout (section 23): a configuration-recovery lane skips refuse, require, carry and land rules", async () => {
    const lockout = policy(
      rule({ id: "freeze", on: ["claim", "propose", "note", "review", "land", "release", "renew"], refuse: "true", fix: "Nothing may change." }),
      requireReview({ id: "everything", paths: "**", from: "@nobody" }),
      rule({ id: "never-land", kind: "land", block: "true", reason: "Never.", fix: "None." }),
      carry({ allow: [{ id: "never-carry", evidence: "any", allow: "false" }] }),
    );
    const paths = [".artroom/policy.json"];
    const proposal = requireInput(lockout, paths).proposal;
    const opts = { purpose: "config-recovery" as const };
    for (const kind of ["claim", "propose", "review", "land"] as const) {
      const r = await evaluateRefuse(active(lockout), refuseInput(lockout, kind, { proposal, actor: actor("@root", "admin") }), opts);
      expect(r.refusal, kind).toBeNull();
      expect(r.evaluations).toEqual([]);
      expect(r.invariants).toContainEqual(expect.objectContaining({ rule: "R-ADMIN-5" }));
    }
    const req = await evaluateRequire(active(lockout), requireInput(lockout, paths), opts);
    expect(req.obligations.map((o) => o.id)).toEqual(["obl_admin-approval"]);
    expect(req.evaluations).toEqual([]);
    const land = await evaluateLand(active(lockout), landInput(lockout, paths), opts);
    expect(land.refusal).toBeNull();
    const carried = await evaluateCarry(active(lockout), carryInput(lockout, { scope: [".artroom/checkers/**"], changedSince: ["README.md"] }), {}, opts);
    expect(carried.carried).not.toBeNull();
    expect(judgeAdminApproval({ ...approve, activeAdmins: 1 }, "admission")).toMatchObject({ counts: true, flag: "sole-admin-self-approval" });
  });

  test("R-ADMIN-6: a recovery proposal that also changes src/x.ts is refused recovery-scope", async () => {
    const doc = policy();
    const r = await evaluateRequire(active(doc), requireInput(doc, [".artroom/policy.json", "src/x.ts"]), { purpose: "config-recovery" });
    expect(r.refusal).toMatchObject({ rule: "recovery-scope" });
    expect(r.obligations).toEqual([]);
  });

  test("a recovery lane does not skip platform carry conditions", async () => {
    const doc = policy();
    const r = await evaluateCarry(active(doc), carryInput(doc, { scope: [".artroom/**"], changedSince: [".artroom/policy.json"] }), {}, { purpose: "config-recovery" });
    expect(r.notCarried?.code).toBe("scope-changed");
  });
});

describe("policy activation (R-POL-9)", () => {
  const old = policy(requireReview({ id: "api", paths: "src/api/**", from: "@security" }));
  const next = policy(
    requireReview({ id: "api", paths: "src/api/**", from: "@security" }),
    requireReview({ id: "lib", paths: "src/lib/**", from: "@platform" }),
    carry({ allow: [{ id: "same-policy-only", evidence: "review", allow: "policy.same" }] }),
  );
  const paths = ["src/api/login.ts", "src/lib/util.ts"];

  test("recomputes obligations and re-evaluates carried evidence under the new version", async () => {
    const carried = carryInput(old, { scope: ["src/api/**"], changedSince: ["src/lib/util.ts"] });
    const r = await activate(active(next, V2), [
      { lane: act(10), generation: 2, require: requireInput(next, paths), purpose: "ordinary", obligations: ["obl_api"], carried: [{ obligation: "obl_api", input: carried }] },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [p] = r.results;
    expect(p!.added).toEqual(["obl_lib"]);
    expect(p!.removed).toEqual([]);
    expect(p!.obligations.every((o) => o.policy === V2)).toBe(true);
    expect(p!.reopened).toEqual([
      expect.objectContaining({ obligation: "obl_api", reopened: { because: "policy-activated", policy: V2 }, notCarried: expect.objectContaining({ code: "policy-rejected", rule: "same-policy-only" }) }),
    ]);
    expect(p!.evaluations.every((e) => e.decision.policy === V2)).toBe(true);
  });

  test("evidence the new policy still accepts stays carried, marked re-evaluated", async () => {
    const carried = carryInput(old, { scope: ["src/api/**"], changedSince: ["src/lib/util.ts"] });
    const r = await activate(active(old, V2), [
      { lane: act(10), generation: 2, require: requireInput(old, paths), purpose: "ordinary", obligations: ["obl_api"], carried: [{ obligation: "obl_api", input: carried }] },
    ]);
    expect(r.ok && r.results[0]!.carried[0]!.evidence.reason).toMatchObject({ policy: "re-evaluated" });
  });

  test("an obligation the new policy drops is reported as removed", async () => {
    const none = policy();
    const r = await activate(active(none, V2), [
      { lane: act(10), generation: 2, require: requireInput(none, paths), purpose: "ordinary", obligations: ["obl_api"], carried: [] },
    ]);
    expect(r.ok && r.results[0]!.removed).toEqual(["obl_api"]);
  });

  test("an invalid policy can never activate (R-POL-1)", async () => {
    const bad = { ...old, rules: [{ id: "Bad ID", kind: "land", block: "$now()", reason: "", fix: "" }] } as unknown as typeof old;
    const r = await activate(active(bad, V2), []);
    expect(r).toMatchObject({ ok: false, refusal: { rule: "policy-invalid" } });
    if (!r.ok) expect(r.problems.length).toBeGreaterThanOrEqual(3);
  });

  test("a require rule that errors at activation is a recorded refusal, not a runtime failure", async () => {
    const erring = policy(requireReview({ id: "err", paths: "**", from: "@x", when: "$sum([9007199254740991, 1]) > 0" }));
    const r = await activate(active(erring, V2), [
      { lane: act(10), generation: 2, require: { ...requireInput(erring, paths), lane: lane() }, purpose: "ordinary", obligations: [], carried: [] },
    ]);
    expect(r.ok && r.results[0]!.refusal?.rule).toBe("policy-type-error");
  });

  test("decisions record the version that activated, not the earlier one", async () => {
    const r = await activate(active(old, V2), [
      { lane: act(10), generation: 2, require: requireInput(old, paths), purpose: "ordinary", obligations: [], carried: [] },
    ]);
    expect(r.ok && r.results[0]!.evaluations.map((e) => e.decision.policy)).toEqual([V2]);
    expect(V1).not.toBe(V2);
  });
});

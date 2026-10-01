/**
 * Policy-level cases from plan section 9: sole-admin bootstrap (R-ADMIN-2),
 * the fixed admin boundary (R-ADMIN-1, R-ADMIN-3) and policy activation
 * (R-POL-9). Roster and signature cases belong to the room lane.
 */

import { describe, expect, test } from "vitest";
import { judgeAdminApproval } from "../src/admin.ts";
import { activate } from "../src/activation.ts";
import { carry, policy, requireReview, rule } from "../src/helpers.ts";
import { evaluateRefuse, evaluateRequire } from "../src/rules.ts";
import { validatePolicy } from "../src/validate.ts";
import { act, active, carryInput, lane, refuseInput, requireInput, V1, V2 } from "./support/fixtures.ts";

const approve = { reviewer: "@root" as const, role: "admin" as const, verdict: "approve" as const, authors: ["@root" as const] };

describe("sole-admin bootstrap (R-ADMIN-2)", () => {
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

  test("R-ADMIN-3: an admin-approved .artroom/** change skips refuse and require rules that would block it", async () => {
    const lockout = policy(
      rule({ id: "freeze", on: "propose", refuse: "true", fix: "Nothing may change." }),
      requireReview({ id: "everything", paths: "**", from: "@nobody" }),
    );
    const paths = [".artroom/policy.json"];
    const proposal = requireInput(lockout, paths).proposal;
    const refused = await evaluateRefuse(active(lockout), refuseInput(lockout, "propose", { proposal }));
    expect(refused.refusal?.rule).toBe("freeze");
    const recovered = await evaluateRefuse(active(lockout), refuseInput(lockout, "propose", { proposal }), { adminApprovalMet: true });
    expect(recovered.refusal).toBeNull();
    const req = await evaluateRequire(active(lockout), requireInput(lockout, paths), { adminApprovalMet: true });
    expect(req.obligations.map((o) => o.id)).toEqual(["obl_admin-approval"]);
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
      { lane: act(10), generation: 2, require: requireInput(next, paths), adminApprovalMet: false, obligations: ["obl_api"], carried: [{ obligation: "obl_api", input: carried }] },
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
      { lane: act(10), generation: 2, require: requireInput(old, paths), adminApprovalMet: false, obligations: ["obl_api"], carried: [{ obligation: "obl_api", input: carried }] },
    ]);
    expect(r.ok && r.results[0]!.carried[0]!.evidence.reason).toMatchObject({ policy: "re-evaluated" });
  });

  test("an obligation the new policy drops is reported as removed", async () => {
    const none = policy();
    const r = await activate(active(none, V2), [
      { lane: act(10), generation: 2, require: requireInput(none, paths), adminApprovalMet: false, obligations: ["obl_api"], carried: [] },
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
      { lane: act(10), generation: 2, require: { ...requireInput(erring, paths), lane: lane() }, adminApprovalMet: false, obligations: [], carried: [] },
    ]);
    expect(r.ok && r.results[0]!.refusal?.rule).toBe("policy-type-error");
  });

  test("decisions record the version that activated, not the earlier one", async () => {
    const r = await activate(active(old, V2), [
      { lane: act(10), generation: 2, require: requireInput(old, paths), adminApprovalMet: false, obligations: [], carried: [] },
    ]);
    expect(r.ok && r.results[0]!.evaluations.map((e) => e.decision.policy)).toEqual([V2]);
    expect(V1).not.toBe(V2);
  });
});

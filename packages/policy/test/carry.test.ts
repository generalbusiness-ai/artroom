/**
 * Plan section 7: carrying verdicts and checks. The acceptance cases are
 * named "plan 7 case n". Each platform condition (R-CARRY-1 to 12) also has
 * its own named case, so a mutation of any one condition fails a test.
 */

import { describe, expect, test } from "vitest";
import type { Digest } from "@generalbusiness/artroom-contract";
import { carry, owners, policy, requireCheck, requireReview, retiredEvidence } from "../src/helpers.ts";
import { evaluateCarry, evaluateRequire } from "../src/rules.ts";
import { PLATFORM_CHECK_INPUTS, checkerInputs, filterSnapshot, type CheckCarryFacts } from "../src/carry.ts";
import { snapshotDigest, type SnapshotEntry } from "../src/integrity.ts";
import { explain } from "../src/explain.ts";
import { active, carryInput, requireInput, sha } from "./support/fixtures.ts";

const base = policy(
  owners({ "src/api/**": "@security" }),
  requireReview({ paths: "src/api/**", from: "@security" }),
  requireCheck("tests", { paths: "src/**", by: "@ci" }),
);
const withDefault = policy(
  owners({ "src/api/**": "@security" }),
  requireReview({ paths: "src/api/**", from: "@security" }),
  carry({ dependsOn: { "src/api/**": ["src/lib/**"] } }),
);
const login = { scope: ["src/api/login.ts"] };
const helper = ["src/lib/authz/check.ts"];

describe("plan 7: carrying a verdict forward", () => {
  test("plan 7 case 1: declared dependsOn src/lib/authz/** and the helper changes: not carried, obligation reopens", async () => {
    const r = await evaluateCarry(active(base), carryInput(base, { ...login, dependsOn: ["src/lib/authz/**"], changedSince: helper }));
    expect(r.carried).toBeNull();
    expect(r.notCarried).toMatchObject({ code: "dependency-changed", paths: helper });
    expect(r.invariants).toContainEqual(expect.objectContaining({ rule: "R-CARRY-2", held: false }));
  });

  test("plan 7 case 2: no dependsOn, but the room's default lists src/lib/** for src/api/**: not carried", async () => {
    const r = await evaluateCarry(active(withDefault), carryInput(withDefault, { ...login, changedSince: helper }));
    expect(r.notCarried).toMatchObject({ code: "dependency-changed", paths: helper });
  });

  test("plan 7 case 2b: a default for an unrelated area does not apply", async () => {
    const other = policy(carry({ dependsOn: { "docs/**": ["src/lib/**"] } }));
    const r = await evaluateCarry(active(other), carryInput(other, { ...login, changedSince: helper }));
    expect(r.carried).not.toBeNull();
  });

  test("plan 7 case 3: no declaration and no default: carried, shown as carried, and highlighted for the dry run", async () => {
    const r = await evaluateCarry(active(base), carryInput(base, { ...login, changedSince: helper }));
    expect(r.notCarried).toBeNull();
    expect(r.carried).toMatchObject({
      basis: "carried",
      kind: "review",
      from: { generation: 1, head: sha("1") },
      reason: { code: "paths-unchanged", policy: "same", text: "carried: reviewed and declared paths unchanged", changed: helper },
    });
    expect(r.highlight).toBe(true);
    expect(r.invariants).toContainEqual(expect.objectContaining({ rule: "R-CARRY-11", held: true }));
  });

  test("plan 7 case 4: a change to package-lock.json: nothing carried (global input)", async () => {
    const r = await evaluateCarry(active(base), carryInput(base, { ...login, changedSince: ["package-lock.json"] }));
    expect(r.notCarried).toMatchObject({ code: "global-input-changed", paths: ["package-lock.json"] });
  });

  test("plan 7 case 5: a change to .artroom/policy.json: nothing carried, and admin approval is required", async () => {
    const r = await evaluateCarry(active(base), carryInput(base, { ...login, changedSince: [".artroom/policy.json"] }));
    expect(r.notCarried).toMatchObject({ code: "global-input-changed", paths: [".artroom/policy.json"] });
    const req = await evaluateRequire(active(base), requireInput(base, [".artroom/policy.json"]));
    expect(req.obligations.map((o) => o.id)).toEqual(["obl_admin-approval"]);
  });

  test("R-CARRY-1: a change inside the reviewed scope: not carried", async () => {
    const r = await evaluateCarry(active(base), carryInput(base, { ...login, changedSince: ["src/api/login.ts"] }));
    expect(r.notCarried).toMatchObject({ code: "scope-changed", paths: ["src/api/login.ts"] });
  });

  test("R-CARRY-1: a rename lists old and new paths, and either one in scope stops carrying", async () => {
    const r = await evaluateCarry(active(base), carryInput(base, { ...login, changedSince: ["src/api/login.ts", "src/api/signin.ts"] }));
    expect(r.notCarried?.code).toBe("scope-changed");
  });

  test("R-CARRY-3: policy can add a global input", async () => {
    const extra = policy(carry({ globalInputs: ["config/**"] }));
    const r = await evaluateCarry(active(extra), carryInput(extra, { ...login, changedSince: ["config/app.yaml"] }));
    expect(r.notCarried?.code).toBe("global-input-changed");
  });

  test("R-CARRY-3: policy cannot remove a platform global input", async () => {
    const none = policy(carry({ globalInputs: [] }));
    const r = await evaluateCarry(active(none), carryInput(none, { ...login, changedSince: ["wrangler.jsonc"] }));
    expect(r.notCarried?.code).toBe("global-input-changed");
  });

  test("R-CARRY-4: carry({ verdicts: false }) turns verdict carrying off", async () => {
    const off = policy(carry({ verdicts: false }));
    const r = await evaluateCarry(active(off), carryInput(off, { ...login, changedSince: helper }));
    expect(r.notCarried?.code).toBe("carry-disabled");
  });

  test("R-CARRY-4: a carry rule that returns false stops carrying, and its decision is recorded", async () => {
    const strict = policy(carry({ allow: [{ id: "no-carry-into-api", evidence: "review", allow: '$count(changedSince[$substring($, 0, 4) = "src/"]) = 0' }] }));
    const r = await evaluateCarry(active(strict), carryInput(strict, { ...login, changedSince: helper }));
    expect(r.notCarried).toMatchObject({ code: "policy-rejected", rule: "no-carry-into-api" });
    expect(r.evaluations.map((e) => e.decision.outcome)).toEqual([{ result: "no-carry", evidence: r.notCarried!.act }]);
  });

  test("R-CARRY-4: a carry rule that errors stops carrying, recorded as policy-type-error", async () => {
    const bad = policy(carry({ allow: [{ id: "not-boolean", evidence: "any", allow: "1" }] }));
    const r = await evaluateCarry(active(bad), carryInput(bad, { ...login, changedSince: helper }));
    expect(r.notCarried?.code).toBe("policy-rejected");
    expect(r.evaluations[0]!.decision.outcome).toMatchObject({ result: "error", code: "policy-type-error" });
  });

  test("R-CARRY-4, R-POL-10: a carry rule can only narrow: true cannot carry evidence the platform refuses", async () => {
    const lax = policy(carry({ allow: [{ id: "always", evidence: "any", allow: "true" }] }));
    for (const changedSince of [["src/api/login.ts"], ["package-lock.json"]]) {
      const r = await evaluateCarry(active(lax), carryInput(lax, { ...login, changedSince }));
      expect(r.carried).toBeNull();
      expect(r.evaluations).toEqual([]);
    }
  });

  test("R-CARRY-4: carry rules see policy.same; at activation a newer policy re-evaluates", async () => {
    const sameOnly = policy(carry({ allow: [{ id: "same-policy-only", evidence: "review", allow: "policy.same" }] }));
    const same = await evaluateCarry(active(sameOnly), carryInput(sameOnly, { ...login, changedSince: helper, same: true }));
    expect(same.carried?.reason).toMatchObject({ policy: "same" });
    const newer = await evaluateCarry(active(sameOnly), carryInput(sameOnly, { ...login, changedSince: helper, same: false }));
    expect(newer.notCarried).toMatchObject({ code: "policy-rejected", rule: "same-policy-only" });
    const accepts = await evaluateCarry(active(base), carryInput(base, { ...login, changedSince: helper, same: false }));
    expect(accepts.carried?.reason).toMatchObject({ policy: "re-evaluated" });
  });

  test("R-CARRY-12: evidence from a compromised key never carries", async () => {
    const r = await evaluateCarry(active(base), carryInput(base, { ...login, changedSince: helper }), { revoked: "compromised" });
    expect(r.notCarried?.code).toBe("key-compromised");
  });

  test("R-REV-2: evidence from a retired key carries by default, and not when policy says reopens", async () => {
    const counts = await evaluateCarry(active(base), carryInput(base, { ...login, changedSince: helper }), { revoked: "retired" });
    expect(counts.carried).not.toBeNull();
    const reopens = policy(retiredEvidence("reopens"));
    const r = await evaluateCarry(active(reopens), carryInput(reopens, { ...login, changedSince: helper }), { revoked: "retired" });
    expect(r.notCarried?.code).toBe("policy-rejected");
  });

  test("explain() shows the carried basis and the conditions tested", async () => {
    const r = await evaluateCarry(active(base), carryInput(base, { ...login, changedSince: helper }));
    const e = explain(r);
    expect(e.invariants.map((i) => i.rule)).toEqual(["R-CARRY-12", "R-CARRY-1", "R-CARRY-2", "R-CARRY-3", "R-CARRY-4", "R-CARRY-11"]);
    expect(e.lines.at(-1)).toMatch(/carried from generation 1/);
  });
});

// ------------------------------------------------------------------ checks

const digest = (c: string): Digest => `sha256:${c.repeat(64).slice(0, 64)}`;
const blob = (c: string) => sha(c);

function checkFacts(over: Partial<CheckCarryFacts["now"]> & { volatile?: boolean; input?: CheckCarryFacts["before"]["input"] } = {}): CheckCarryFacts {
  const input = over.input ?? { kind: "tree", tree: sha("7") };
  return {
    before: { integration: sha("5"), input, config: digest("c"), runner: digest("e") },
    now: {
      integration: sha("6"),
      tree: over.tree ?? sha("7"),
      snapshot: over.snapshot ?? (input.kind === "filtered" ? input.snapshot : null),
      config: over.config ?? digest("c"),
      runner: over.runner ?? digest("e"),
    },
    volatile: over.volatile ?? false,
  };
}

describe("plan 7: carrying a check forward", () => {
  const checkInput = carryInput(base, { kind: "check", changedSince: ["src/app.ts"] });

  test("R-CARRY-6: whole tree (the default): an identical tree carries", async () => {
    const r = await evaluateCarry(active(base), checkInput, { check: checkFacts() });
    expect(r.carried?.reason).toMatchObject({ code: "tree-identical", tree: sha("7") });
  });

  test("plan 7 case 6: a new failing test under tests/ with src/** unchanged: the whole-tree check reruns", async () => {
    const r = await evaluateCarry(active(base), carryInput(base, { kind: "check", changedSince: ["tests/new.test.ts"] }), {
      check: checkFacts({ tree: sha("8") }),
    });
    expect(r.notCarried?.code).toBe("integration-changed");
  });

  test("plan 7 case 6, scoped (review 45431cd9 P2.1): inputs src/**, src unchanged, a new file under tests/: not carried", async () => {
    const inputs = checkerInputs(["src/**"], base.carry)!;
    expect(inputs).toEqual(expect.arrayContaining(["src/**", "**/tests/**", "**/*.test.*"]));
    const before: SnapshotEntry[] = [
      ["src/app.ts", "100644", blob("1")],
      ["tests/app.test.ts", "100644", blob("2")],
      ["README.md", "100644", blob("3")],
    ];
    const after: SnapshotEntry[] = [...before, ["tests/new.test.ts", "100644", blob("4")]];
    const was = await snapshotDigest(filterSnapshot(before, inputs));
    const now = await snapshotDigest(filterSnapshot(after, inputs));
    expect(filterSnapshot(after, inputs).map((e) => e[0])).toContain("tests/new.test.ts");
    expect(now).not.toBe(was);
    const r = await evaluateCarry(active(base), carryInput(base, { kind: "check", changedSince: ["tests/new.test.ts"] }), {
      check: checkFacts({ input: { kind: "filtered", snapshot: was, paths: inputs }, snapshot: now, tree: sha("8") }),
    });
    expect(r.notCarried?.code).toBe("integration-changed");
  });

  test("R-CARRY-9: a scoped check carries while its filtered snapshot is identical", async () => {
    const inputs = checkerInputs(["src/**"], base.carry)!;
    const files: SnapshotEntry[] = [["src/app.ts", "100644", blob("1")], ["README.md", "100644", blob("3")]];
    const snap = await snapshotDigest(filterSnapshot(files, inputs));
    const r = await evaluateCarry(active(base), carryInput(base, { kind: "check", changedSince: ["README.md"] }), {
      check: checkFacts({ input: { kind: "filtered", snapshot: snap, paths: inputs }, tree: sha("8") }),
    });
    expect(r.carried?.reason).toMatchObject({ code: "snapshot-identical", snapshot: snap });
  });

  test("plan 7 case 7: a file read by tests but missing from a scoped checker's inputs is not in the runner's snapshot", () => {
    const inputs = checkerInputs(["src/**"], base.carry)!;
    const files: SnapshotEntry[] = [["src/app.ts", "100644", blob("1")], ["fixtures/data.json", "100644", blob("2")]];
    expect(filterSnapshot(files, inputs).map((e) => e[0])).toEqual(["src/app.ts"]);
  });

  test("R-CARRY-8: every platform check input is in a scoped checker's inputs, whatever the policy", () => {
    const inputs = checkerInputs(["src/**"], policy(carry({ globalInputs: [] })).carry)!;
    for (const g of PLATFORM_CHECK_INPUTS) expect(inputs).toContain(g);
    expect(checkerInputs(undefined, base.carry)).toBeNull();
  });

  test("R-CARRY-10: a volatile checker never carries", async () => {
    const r = await evaluateCarry(active(base), checkInput, { check: checkFacts({ volatile: true }) });
    expect(r.notCarried?.code).toBe("volatile-inputs");
  });

  test("R-CARRY-6: a changed checker configuration reruns the check", async () => {
    const r = await evaluateCarry(active(base), checkInput, { check: checkFacts({ config: digest("d") }) });
    expect(r.notCarried?.code).toBe("config-changed");
  });

  test("R-CARRY-6: a changed runner environment reruns the check", async () => {
    const r = await evaluateCarry(active(base), checkInput, { check: checkFacts({ runner: digest("f") }) });
    expect(r.notCarried?.code).toBe("runner-changed");
  });

  test("R-CARRY-4: carry({ checks: false }) turns check carrying off", async () => {
    const off = policy(carry({ checks: false }));
    const r = await evaluateCarry(active(off), carryInput(off, { kind: "check", changedSince: ["src/app.ts"] }), { check: checkFacts() });
    expect(r.notCarried?.code).toBe("carry-disabled");
  });

  test("R-CARRY-12: a check signed by a compromised key never carries", async () => {
    const r = await evaluateCarry(active(base), checkInput, { check: checkFacts(), revoked: "compromised" });
    expect(r.notCarried?.code).toBe("key-compromised");
  });
});

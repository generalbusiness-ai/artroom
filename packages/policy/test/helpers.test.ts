import { describe, expect, test } from "vitest";
import { OBJECTION_OPEN, carry, defaultPolicy, lanes, owners, policy, requireCheck, requireReview, retiredEvidence, rule } from "../src/helpers.ts";
import { validateCheckerConfig, validatePolicy } from "../src/validate.ts";
import { globProblem, globsOverlap, matchGlob } from "../src/glob.ts";

describe("authoring helpers compile to PolicyDocument", () => {
  test("the plan's section 5 example compiles, validates and gains objection-open", () => {
    const doc = policy(
      owners({ "migrations/**": "@db", "src/api/**": "@security" }),
      requireCheck("tests", { paths: "src/**", by: "@ci" }),
      requireReview({ paths: "src/api/**", from: "@security" }),
      carry({ globalInputs: ["package.json", "package-lock.json", "tsconfig*.json", "wrangler.*", ".artroom/**"] }),
      lanes("by-scope"),
      rule({ id: "claim-before-propose", on: "propose", refuse: "$not(lane.claimed)", fix: "Claim the paths first." }),
    );
    expect(doc).toEqual({
      format: "artroom-policy-v1",
      profile: "artroom-jsonata-v1",
      owners: { "migrations/**": ["@db"], "src/api/**": ["@security"] },
      carry: { verdicts: true, checks: true, globalInputs: ["package.json", "package-lock.json", "tsconfig*.json", "wrangler.*", ".artroom/**"], dependsOn: {} },
      lanes: "by-scope",
      retiredEvidence: "counts",
      rules: [
        { id: "check-tests", kind: "require", paths: ["src/**"], obligation: { type: "check", check: "tests", by: ["@ci"] } },
        { id: "review-src-api", kind: "require", paths: ["src/api/**"], obligation: { type: "review", from: ["@security"], count: 1, allowSelf: false } },
        { id: "claim-before-propose", kind: "refuse", on: ["propose"], refuse: "$not(lane.claimed)", reason: "Policy rule claim-before-propose refused this act.", fix: "Claim the paths first." },
        OBJECTION_OPEN,
      ],
    });
    expect(validatePolicy(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
  });

  test("R-POL-7: the default policy", () => {
    const d = defaultPolicy();
    expect(d.rules).toEqual([OBJECTION_OPEN]);
    expect(d.carry).toEqual({ verdicts: true, checks: true, globalInputs: [], dependsOn: {} });
    expect(d.lanes).toBe("by-scope");
    expect(d.retiredEvidence).toBe("counts");
  });

  test("a policy's own objection-open replaces the default; later settings replace earlier ones", () => {
    const own = rule({ id: "objection-open", kind: "land", block: "false", reason: "Never blocks.", fix: "None." });
    const d = policy(own, lanes("by-scope"), lanes("exclusive"), retiredEvidence("reopens"));
    expect(d.rules.filter((r) => r.id === "objection-open")).toHaveLength(1);
    expect(d.lanes).toBe("exclusive");
    expect(d.retiredEvidence).toBe("reopens");
  });

  test("helpers refuse an expression outside the profile, and duplicate IDs", () => {
    expect(() => policy(rule({ id: "clock", on: "claim", refuse: "$now() > 0", fix: "x" }))).toThrow(/unsupported_function/);
    expect(() => policy(requireCheck("tests", { paths: "src/**", by: "@ci" }), requireCheck("tests", { paths: "lib/**", by: "@ci" }))).toThrow(/duplicate rule id/);
    expect(() => policy(requireCheck("tests", { paths: "src/[a]/**", by: "@ci" }))).toThrow(/not allowed/);
  });
});

describe("validation (R-POL-1)", () => {
  test("refuses unknown fields, bad principals and bad globs with policy-invalid", () => {
    const doc = { ...defaultPolicy(), owners: { "/abs/**": ["security"] }, extra: true };
    const v = validatePolicy(doc);
    expect(v).toMatchObject({ ok: false, refusal: { refused: true, rule: "policy-invalid" } });
    if (!v.ok) expect(v.problems).toHaveLength(3);
  });

  test("checker configuration", () => {
    expect(validateCheckerConfig({ format: "artroom-checker-v1", volatile: false, timeoutSeconds: 600 }).ok).toBe(true);
    expect(validateCheckerConfig({ format: "artroom-checker-v1", inputs: [], volatile: "no", timeoutSeconds: 0 })).toMatchObject({ ok: false });
  });
});

describe("globs (R-PATH-1 to 3)", () => {
  test("syntax", () => {
    for (const ok of ["src/**", "**", "*.md", "src/*/x.ts", "a**b"]) expect(globProblem(ok)).toBeNull();
    for (const bad of ["", "/src", "src//x", "src/./x", "src/../x", "src/?.ts", "src/{a,b}", "src/", "!src"]) expect(globProblem(bad)).not.toBeNull();
  });

  test("matching", () => {
    expect(matchGlob("src/api/login.ts", "src/**")).toBe(true);
    expect(matchGlob("src", "src/**")).toBe(true);
    expect(matchGlob("README.md", "**/*.md")).toBe(true);
    expect(matchGlob("docs/a/b.md", "docs/*.md")).toBe(false);
    expect(matchGlob("tsconfig.base.json", "tsconfig*.json")).toBe(true);
    expect(matchGlob("Src/a.ts", "src/**")).toBe(false);
  });

  test("overlap is conservative: it never misses a real overlap", () => {
    expect(globsOverlap("src/api/**", "src/**")).toBe(true);
    expect(globsOverlap("src/*.ts", "src/a*")).toBe(true);
    expect(globsOverlap("**/*.md", "docs/**")).toBe(true);
    expect(globsOverlap("src/**", "docs/**")).toBe(false);
    expect(globsOverlap("src/*.ts", "src/*.md")).toBe(false);
  });
});

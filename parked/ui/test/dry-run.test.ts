/**
 * The Policy screen's dry run of a draft rule. The preview and the exported
 * rule must give the same answers (review 82f2743b, P1.1): these tests
 * compare the compiled expression, its TypeScript twin and the dry run with
 * the policy runtime's own evaluator. And a dry run validates the whole
 * compiled policy before it predicts anything (review 88a20f74, P2).
 */
import { evaluate, globsOverlap, validatePolicy } from "@generalbusiness/artroom-policy";
import { describe, expect, test } from "vitest";
import type { DraftRule } from "../src/room/adapter.ts";
import type { MemberId, Role, RuleInput } from "../src/room/contract.ts";
import { compileDraft, dryRun } from "../src/room/dryrun.ts";
import { overlap } from "../src/room/glob.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import { POLICY } from "../src/room/mock/policy.ts";
import type { History } from "../src/room/mock/world.ts";
import { compileTargets, refuseClaimExpr, refusesClaimTwin } from "../src/room/refuse-claim.ts";

type RefuseInput = Extract<RuleInput, { kind: "refuse" }>;
const VERSION = "act_1_00000000" as const;
/** The scenario's policy without its own refuse rule, so a draft's effect shows alone. */
const BASE = { ...POLICY, rules: POLICY.rules.filter((r) => r.kind !== "refuse") };

function claimInput(role: Role, scope: string[], member: MemberId = "@ash"): RefuseInput {
  return {
    kind: "refuse",
    act: { kind: "claim", target: null, body: { goal: "g", scope } },
    actor: { member, role, teams: [], delegated: false },
    lane: { id: null, claimed: false, holder: null, scope: [], generation: 0, purpose: "ordinary" },
    proposal: null,
    room: { admins: 1, members: 3 },
  };
}

const history = (claims: RefuseInput[]): History => ({
  claims: claims.map((input, i) => ({ seq: i + 1, act: `act_${i + 1}_0000000${i}` as const, by: input.actor.member!, lane: null, input })),
  proposals: [],
  carries: [],
});

const targets = (paths: string[]) => {
  const c = compileTargets(paths);
  if ("problem" in c) throw new Error(c.problem);
  return c.targets;
};

const CASES: { name: string; paths: string[]; scope: string[]; refused: boolean }[] = [
  { name: "broad **", paths: ["migrations/**"], scope: ["**"], refused: true },
  { name: "broad *", paths: ["migrations/**"], scope: ["*"], refused: true },
  { name: "wildcard prefix", paths: ["migrations/**"], scope: ["mig*/x.sql"], refused: true },
  { name: "intersecting file", paths: ["migrations/**"], scope: ["src/a.ts", "migrations/2026.sql"], refused: true },
  { name: "the directory itself", paths: ["migrations/**"], scope: ["migrations"], refused: true },
  { name: "the same pattern", paths: ["migrations/**"], scope: ["migrations/**"], refused: true },
  { name: "disjoint", paths: ["migrations/**"], scope: ["src/**", "docs/migrations/x.md"], refused: false },
  { name: "sibling prefix", paths: ["migrations/**"], scope: ["migrations-old/x.sql"], refused: false },
  { name: "literal target", paths: ["src/lib/authz/check.ts"], scope: ["src/lib/authz/**"], refused: true },
  { name: "literal target, disjoint", paths: ["src/lib/authz/check.ts"], scope: ["src/lib/authz/roles.ts"], refused: false },
  { name: "quoted path", paths: ['docs/"q"/**'], scope: ['docs/"q"/a.md'], refused: true },
  { name: "quoted path, disjoint", paths: ['docs/"q"/**'], scope: ["docs/q/a.md"], refused: false },
  { name: "non-ASCII path", paths: ["données/**"], scope: ["donn*"], refused: true },
  { name: "non-ASCII, disjoint", paths: ["données/**"], scope: ["donnees/x"], refused: false },
];

describe("refuse-claim drafts agree with the policy runtime (review 82f2743b, P1.1)", () => {
  test("each case: the compiled expression, its TypeScript twin and the dry run give the answer the runtime's own overlap gives", async () => {
    for (const c of CASES) {
      const t = targets(c.paths);
      const expr = refuseClaimExpr(["agent"], t);
      const input = claimInput("agent", c.scope);
      expect((await evaluate(expr, input)).value, c.name).toBe(c.refused);
      expect(refusesClaimTwin(["agent"], t, "agent", c.scope), c.name).toBe(c.refused);
      // The role test is part of the rule too.
      expect((await evaluate(expr, claimInput("maintainer", c.scope))).value, c.name).toBe(false);
      // And the dry run reports exactly what the compiled rule does.
      const r = await dryRun(history([input]), { kind: "refuse-claim", id: "draft", paths: c.paths, roles: ["agent"] }, BASE, VERSION);
      expect(r.status, c.name).toBe("replayed");
      if (r.status === "replayed") expect(r.changes.length, c.name).toBe(c.refused ? 1 : 0);
    }
  });

  test("the reviewer's reproduction: an agent's ** claim is refused by the emitted rule and by the preview", async () => {
    const draft = { kind: "refuse-claim" as const, id: "no-migrations", paths: ["migrations/**"], roles: ["agent" as const] };
    const r = await dryRun(history([claimInput("agent", ["**"])]), draft, BASE, VERSION);
    if (r.status !== "replayed" || !("kind" in r.compiled) || r.compiled.kind !== "refuse") throw new Error("not replayed");
    expect(r.changes).toHaveLength(1);
    expect((await evaluate(r.compiled.refuse, { actor: { role: "agent" }, act: { body: { scope: ["**"] } } })).value).toBe(true);
    expect(r.mismatches).toEqual([]);
  });

  test("where literal text and path overlap differ, the dry run says so", async () => {
    const r = await dryRun(history([claimInput("agent", ["*.md"])]), { kind: "refuse-claim", id: "d", paths: ["migrations/**"], roles: ["agent"] }, BASE, VERSION);
    expect(globsOverlap("*.md", "migrations/**")).toBe(false);
    expect(r.status === "replayed" && r.mismatches.map((m) => m.kind)).toEqual(["extra"]);
  });

  test("a pattern the language cannot express is not compiled, and nothing is replayed", async () => {
    const r = await dryRun(history([claimInput("agent", ["**"])]), { kind: "refuse-claim", id: "d", paths: ["src/*.sql"], roles: ["agent"] }, BASE, VERSION);
    expect(r.status).toBe("not-compiled");
    expect(r.status === "not-compiled" && r.reason).toContain("neither a literal path nor a directory");
    expect("problem" in compileDraft({ kind: "refuse-claim", id: "d", paths: ["a/../b"], roles: ["agent"] }, BASE)).toBe(true);
  });
});

describe("a dry run validates the whole compiled policy first (review 88a20f74, P2)", () => {
  const invalid: [string, DraftRule][] = [
    ["require-review with an existing rule ID", { kind: "require-review", id: "security-review", paths: ["src/**"], from: "@platform", count: 1 }],
    ["require-review with an invalid path", { kind: "require-review", id: "valid-id", paths: ["src/[ab].ts"], from: "@platform", count: 1 }],
    ["default dependency with an invalid area", { kind: "carry-depends-on", area: "src/[ab]/**", dependsOn: ["src/**"] }],
    ["global input with an invalid path", { kind: "global-input", paths: ["src/[ab].ts"] }],
    ["refuse-claim with an existing rule ID", { kind: "refuse-claim", id: "security-review", paths: ["migrations/**"], roles: ["agent"] }],
  ];
  test("an invalid draft: no prediction, the validation problem and a fix", async () => {
    for (const [name, draft] of invalid) {
      const r = await new MockRoom().dryRun(draft);
      expect(r, name).toMatchObject({ status: "not-compiled" });
      if (!("status" in r) || r.status !== "not-compiled") throw new Error("not refused");
      expect(r.reason, name).toContain("would be refused (policy-invalid)");
      expect(r.problems.length, name).toBeGreaterThan(0);
      expect(r.fix, name).toBeTruthy();
    }
  });

  const valid: DraftRule[] = [
    { kind: "require-review", id: "platform-reviews-authz", paths: ["src/lib/authz/**"], from: "@platform", count: 1 },
    { kind: "refuse-claim", id: "agents-stay-out-of-authz", paths: ["src/lib/authz/**"], roles: ["agent"] },
    { kind: "carry-depends-on", area: "src/lib/**", dependsOn: ["src/lib/**"] },
    { kind: "global-input", paths: ["src/lib/authz/**"] },
  ];
  test("a valid draft of each kind compiles to a valid policy and replays", async () => {
    for (const draft of valid) {
      const c = compileDraft(draft, POLICY);
      if (!("doc" in c)) throw new Error(c.problem);
      expect(validatePolicy(c.doc).ok, draft.kind).toBe(true);
      expect((await new MockRoom().dryRun(draft)) as { status: string }, draft.kind).toMatchObject({ status: "replayed" });
    }
  });
});

describe("overlap between a claim and a path (R-PATH-3)", () => {
  test("overlap is conservative, and certain only with a literal path", () => {
    expect(overlap("src/lib/authz/check.ts", "src/lib/authz/**")).toEqual({ certain: true });
    expect(overlap("src/lib/**", "src/lib/authz/**")).toEqual({ certain: false });
    expect(overlap("src/lib/log/**", "src/api/middleware.ts")).toBeNull();
    expect(overlap("src/*.ts", "src/*.js")).toBeNull();
  });
});

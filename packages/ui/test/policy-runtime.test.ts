/**
 * Review 82f2743b, P1.1: the policy preview and the exported rule must give
 * the same answers. These tests compare the compiled expression, its
 * TypeScript twin and the dry run with the policy runtime's own evaluator.
 */
import { evaluate, evaluateNotify, evaluateRefuse, globsOverlap } from "@generalbusiness/artroom-policy";
import { describe, expect, test } from "vitest";
import type { MemberId, Role, RuleInput } from "../src/room/contract.ts";
import { compileDraft, dryRun } from "../src/room/dryrun.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import { notifiesAuthz, POLICY } from "../src/room/mock/policy.ts";
import { World, type History } from "../src/room/mock/world.ts";
import { STEPS } from "../src/room/mock/scenario.ts";
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

describe("refuse-claim drafts agree with the policy runtime", () => {
  for (const c of CASES) {
    test(c.name, async () => {
      const t = targets(c.paths);
      const expr = refuseClaimExpr(["agent"], t);
      const input = claimInput("agent", c.scope);
      expect((await evaluate(expr, input)).value).toBe(c.refused);
      expect(refusesClaimTwin(["agent"], t, "agent", c.scope)).toBe(c.refused);
      // The role test is part of the rule too.
      expect((await evaluate(expr, claimInput("maintainer", c.scope))).value).toBe(false);
      // And the dry run reports exactly what the compiled rule does.
      const r = await dryRun(history([input]), { kind: "refuse-claim", id: "draft", paths: c.paths, roles: ["agent"] }, BASE, VERSION);
      expect(r.status).toBe("replayed");
      if (r.status === "replayed") expect(r.changes.length).toBe(c.refused ? 1 : 0);
    });
  }

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

describe("the mock room's rule twins agree with the policy runtime", () => {
  test("every claim in the scenario gets the same refuse answer", async () => {
    const w = new World();
    for (const s of STEPS) {
      w.t = s.minute;
      s.run(w);
    }
    const active = { doc: POLICY, version: w.policyVersion };
    const recorded = new MockRoom().snapshot().feed.filter((f) => f.kind === "claim");
    expect(w.history.claims.length).toBe(recorded.length);
    for (const c of w.history.claims) {
      const real = await evaluateRefuse(active, c.input);
      const wasRefused = recorded.find((f) => f.id === c.act)!.type === "refusal";
      expect(real.refusal !== null).toBe(wasRefused);
    }
    expect(w.history.claims.some((c) => recorded.find((f) => f.id === c.act)!.type === "refusal")).toBe(true);
  });

  test("the notify rule's twin matches its expression", async () => {
    const w = new World();
    for (const s of STEPS) {
      w.t = s.minute;
      s.run(w);
    }
    for (const p of w.history.proposals) {
      const input = { kind: "notify" as const, act: { id: p.act, kind: "propose" as const, target: { lane: p.lane }, body: {} }, actor: p.input.actor, lane: p.input.lane, proposal: p.input.proposal };
      const r = await evaluateNotify({ doc: POLICY, version: w.policyVersion }, input, { roles: {}, teams: { "@platform": ["@sam"] } } as never);
      const told = r.evaluations.some((e) => e.decision.outcome.result === "notify");
      expect(told).toBe(notifiesAuthz(p.input.proposal.paths));
    }
  });
});

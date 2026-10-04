/** The five rule kinds over recorded inputs (R-POL-2 to R-POL-6, R-EVAL-3 to R-EVAL-6). */

import { describe, expect, test } from "vitest";
import { carry, lanes, owners, policy, requireCheck, requireReview, rule } from "../src/helpers.ts";
import { evaluateLand, evaluateNotify, evaluateRefuse, evaluateRequire, matchesRetainedLandInput, notifyContext, ownersFor, replay } from "../src/rules.ts";
import { actMeter } from "../src/evaluator.ts";
import { explain } from "../src/explain.ts";
import { digestJson } from "../src/integrity.ts";
import { ACCOUNTING, ACT_BUDGET, STAMP } from "../src/profile.ts";
import { PolicyRuntimeFailure } from "../src/errors.ts";
import { act, active, actor, landInput, lane, notifyInput, refuseInput, requireInput, V1 } from "./support/fixtures.ts";
import { recoveryLane } from "./support/fixtures.ts";

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
    const recovery = await evaluateLand(active(p), { ...landInput(p, [".artroom/policy.json"]), lane: recoveryLane() });
    expect(recovery.refusal).toBeNull();
    expect(recovery.evaluations).toEqual([]);
  });

  // The prospective reservation input and the synchronous byte comparison (R-LAND-4, R-LAND-7; review 09c01bf9).
  test("stage is policy-visible: it changes the outcome and the bare digest; the reservation evaluation replays", async () => {
    const p = policy(rule({ id: "reservation-only", kind: "land", block: 'stage = "reservation"', reason: "reservation refused", fix: "x" }));
    const before = landInput(p, ["src/a.ts"]);
    const reservation = { ...before, stage: "reservation" as const };
    const a = await evaluateLand(active(p), before);
    const b = await evaluateLand(active(p), reservation);
    expect(a.refusal).toBeNull();
    expect(b.refusal?.rule).toBe("reservation-only");
    expect(await digestJson(before as never)).not.toBe(await digestJson(reservation as never));
    expect(await replay(active(p), JSON.parse(JSON.stringify(b.evaluations[0]!.context)))).toEqual(b);
  });

  test("a stage-specific rule cannot be bypassed: the land act passes, preparation fails, nothing is retained", async () => {
    const p = policy(rule({ id: "reservation-only", kind: "land", block: 'stage = "reservation"', reason: "reservation refused", fix: "x" }));
    const admitted = await evaluateLand(active(p), landInput(p, ["src/a.ts"]));
    expect(admitted.refusal).toBeNull();
    expect(admitted.retained).toBeNull();
    const prepared = await evaluateLand(active(p), { ...landInput(p, ["src/a.ts"]), stage: "reservation" });
    expect(prepared.refusal?.rule).toBe("reservation-only");
    expect(prepared.retained).toBeNull();
  });

  test("preparation retains canonical bytes and digest; unchanged state matches; changed state or stage land does not", async () => {
    const p = policy();
    const approve = { act: act(40), verdict: "approve" as const, by: actor("@bob"), basis: "here" as const };
    const prospective = { ...landInput(p, ["src/a.ts"], [approve]), stage: "reservation" as const };
    const prepared = await evaluateLand(active(p), prospective);
    expect(prepared.refusal).toBeNull();
    const retained = prepared.retained!;
    expect(retained.stage).toBe("reservation");
    expect(retained.digest).toBe(await digestJson(prospective as never));
    expect(retained.digest).not.toBe(prepared.evaluations[0]!.decision.input);
    // Reservation rebuilds from unchanged state: equal bytes, with no await.
    expect(matchesRetainedLandInput(retained, JSON.parse(JSON.stringify(prospective)))).toBe(true);
    // A new objection changes the state: the guard fails.
    const objection = { act: act(41), verdict: "object" as const, by: actor("@carol"), basis: "here" as const };
    expect(matchesRetainedLandInput(retained, { ...prospective, reviews: [approve, objection] })).toBe(false);
    // Substituting stage land never matches.
    expect(matchesRetainedLandInput(retained, { ...prospective, stage: "land" })).toBe(false);
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
    for (const d of e.decisions) expect(await digestJson(e.contexts[d.input] as never)).toBe(d.input);
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

describe("every input that decides is in one digested replay context (R-EVAL-6; review dd2a995b)", () => {
  test("default act budget, refuse then require: the require replays to the same budget refusal", async () => {
    const scan = "($a := proposal.paths; $count($a.($$)); ";
    const p = policy(
      rule({ id: "scan-refuse", on: "propose", refuse: scan + "false)", fix: "x" }),
      requireReview({ id: "scan-require", paths: "**", from: "@lead", when: scan + "true)" }),
    );
    const paths = Array.from({ length: 60 }, (_, i) => `src/${"a".repeat(60)}/${i}.ts`);
    const input = requireInput(p, paths);
    const budget = actMeter();
    const before = await evaluateRefuse(active(p), refuseInput(p, "propose", { proposal: input.proposal }), { budget });
    expect(before.refusal).toBeNull();
    const recorded = await evaluateRequire(active(p), input, { budget });
    expect(recorded.refusal?.rule).toBe("policy-budget-exceeded");
    const context = recorded.evaluations[0]!.context;
    expect(context.budget).toEqual({ accounting: ACCOUNTING, limits: ACT_BUDGET, start: before.evaluations[0]!.decision.usage });
    const replayed = await replay(active(p), JSON.parse(JSON.stringify(context)));
    expect(replayed.evaluations.map((e) => e.decision)).toEqual(recorded.evaluations.map((e) => e.decision));
    // The same rule input with a fresh budget is a different context, with a different digest.
    const fresh = await evaluateRequire(active(p), input);
    expect(fresh.refusal).toBeNull();
    expect(fresh.evaluations[0]!.decision.input).not.toBe(recorded.evaluations[0]!.decision.input);
  });

  test("the notify directory is part of the context: different directories, different digests, each replays", async () => {
    const p = policy(rule({ id: "admin-sees", kind: "notify", on: ["claim"], to: ["role:admin"], why: "Review this." }));
    const input = notifyInput(p, "claim", null);
    const a = await evaluateNotify(active(p), input, { roles: { admin: ["@alice"] }, reviewers: [] });
    const b = await evaluateNotify(active(p), input, { roles: { admin: ["@bob"] }, reviewers: [] });
    const da = a.evaluations[0]!.decision;
    const db = b.evaluations[0]!.decision;
    expect(da.outcome).toEqual({ result: "notify", to: ["@alice"] });
    expect(db.outcome).toEqual({ result: "notify", to: ["@bob"] });
    expect(da.input).not.toBe(db.input);
    for (const r of [a, b]) {
      const again = await replay(active(p), JSON.parse(JSON.stringify(r.evaluations[0]!.context)));
      expect(again.evaluations.map((e) => e.decision)).toEqual(r.evaluations.map((e) => e.decision));
    }
  });

  test("a notify queue retry reuses the stored context and never inherits an act meter", async () => {
    const p = policy(rule({ id: "costly", kind: "notify", on: ["claim"], when: "$count(proposal.paths) > 0", to: ["holder"], why: "x" }));
    const context = notifyContext(notifyInput(p, "claim", ["a.ts"]), { roles: {}, reviewers: [] });
    expect(context.budget.start).toEqual({ steps: 0, inspectedBytes: 0 });
    const first = await replay(active(p), context);
    const retry = await replay(active(p), JSON.parse(JSON.stringify(context)));
    expect(retry.evaluations.map((e) => e.decision)).toEqual(first.evaluations.map((e) => e.decision));
    expect(first.evaluations[0]!.decision.input).toBe(await digestJson(context as never));
  });
});

describe("the retained context is an owned, frozen snapshot (review dd2a995b)", () => {
  test("changing the caller's input after return changes nothing retained", async () => {
    const p = policy(rule({ id: "never", on: "claim", refuse: "false", fix: "x" }));
    const input = refuseInput(p, "claim");
    const r = await evaluateRefuse(active(p), input);
    const e = r.evaluations[0]!;
    expect(e.context.input).not.toBe(input);
    expect(Object.isFrozen(e.context.input)).toBe(true);
    (input as { room: unknown }).room = { admins: 50, members: 99 };
    expect(await digestJson(e.context as never)).toBe(e.decision.input);
    expect(e.context.kind === "refuse" && e.context.input.room).toEqual({ admins: 1, members: 3 });
  });

  test("changing the caller's input while hashing and evaluation are pending changes nothing", async () => {
    const p = policy(rule({ id: "unclaimed", on: "propose", refuse: "$not(lane.claimed)", fix: "x" }));
    const input = refuseInput(p, "propose");
    const pending = evaluateRefuse(active(p), input);
    (input.lane as { claimed: boolean }).claimed = false;
    (input as { room: unknown }).room = { admins: 9, members: 9 };
    const r = await pending;
    expect(r.refusal).toBeNull();
    const e = r.evaluations[0]!;
    expect(e.context.kind === "refuse" && e.context.input.lane.claimed).toBe(true);
    expect(await digestJson(e.context as never)).toBe(e.decision.input);
  });

  test("an input over 256 KiB is a deterministic budget refusal, not a runtime failure, and replays", async () => {
    const p = policy(rule({ id: "never", on: "propose", refuse: "false", fix: "x" }));
    const big = { ...refuseInput(p, "propose"), act: { kind: "propose" as const, target: null, body: { s: "x".repeat(262_144) } } };
    const r = await evaluateRefuse(active(p), big);
    expect(r.refusal?.rule).toBe("policy-budget-exceeded");
    const again = await replay(active(p), r.evaluations[0]!.context);
    expect(again.evaluations.map((e) => e.decision)).toEqual(r.evaluations.map((e) => e.decision));
  });
});

describe("any legal repository path works in rule inputs (review dd2a995b)", () => {
  const special = ["constructor", "prototype", "_jsonata_cache", "__proto__"];
  const p = policy(
    // Parsed from JSON so that "__proto__" is an own key, as it is in a parsed .artroom/policy.json.
    owners(JSON.parse('{"constructor":"@c","prototype":"@p","_jsonata_cache":"@j","__proto__":"@x"}')),
    requireReview({ id: "review-all", paths: "**", from: "owners", when: '$count(proposal.owners[path = "__proto__"].owners) > 0' }),
    rule({ id: "owners-see", kind: "notify", on: ["propose"], to: ["owners"], why: "You own a changed path." }),
  );

  test("ownership is a list of path/owners pairs, with no prototype or reserved-key hazard", () => {
    const pairs = ownersFor(p, special);
    expect(pairs).toEqual([
      { path: "constructor", owners: ["@c"] },
      { path: "prototype", owners: ["@p"] },
      { path: "_jsonata_cache", owners: ["@j"] },
      { path: "__proto__", owners: ["@x"] },
    ]);
  });

  test("require evaluates and creates the obligation for each such path, and replays", async () => {
    for (const path of special) {
      const r = await evaluateRequire(active(p), requireInput(p, [path, "__proto__"]));
      expect(r.refusal, path).toBeNull();
      expect(r.obligations.map((o) => o.id)).toEqual(["obl_review-all"]);
      const again = await replay(active(p), JSON.parse(JSON.stringify(r.evaluations[0]!.context)));
      expect(again.evaluations.map((e) => e.decision)).toEqual(r.evaluations.map((e) => e.decision));
    }
  });

  test("notify resolves the owners of such paths, and a refuse rule reads them as values", async () => {
    const r = await evaluateNotify(active(p), notifyInput(p, "propose", special), { roles: {}, reviewers: [] });
    expect(r.notify.map((n) => n.to)).toEqual(["@c", "@j", "@p", "@x"]);
    const q = policy(rule({ id: "no-proto", on: "propose", refuse: '"__proto__" in proposal.paths', fix: "x" }));
    const refused = await evaluateRefuse(active(q), refuseInput(q, "propose", { proposal: requireInput(q, ["constructor", "__proto__"]).proposal }));
    expect(refused.refusal?.rule).toBe("no-proto");
  });
});

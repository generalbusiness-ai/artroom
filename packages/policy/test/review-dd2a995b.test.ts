/**
 * Checker review dd2a995b. Each case is a checker reproduction from
 * /tmp/artroom-checker-policy/packages/policy/test/checker-review.test.ts,
 * now asserting the repaired behaviour.
 */

import { describe, expect, test } from "vitest";
import { owners, policy, requireReview, rule } from "../src/helpers.ts";
import { evaluateNotify, evaluateRefuse, evaluateRequire, notifyContext, ownersFor, replay } from "../src/rules.ts";
import { actMeter } from "../src/evaluator.ts";
import { digestJson } from "../src/integrity.ts";
import { ACCOUNTING, ACT_BUDGET } from "../src/profile.ts";
import { explain } from "../src/explain.ts";
import { active, notifyInput, refuseInput, requireInput } from "./support/fixtures.ts";

describe("P1.1: every decision-determining input is in one digested replay context", () => {
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

  test("explain() returns each context by digest", async () => {
    const p = policy(rule({ id: "never", on: "claim", refuse: "false", fix: "x" }));
    const r = await evaluateRefuse(active(p), refuseInput(p, "claim"));
    const e = explain(r);
    const d = e.decisions[0]!;
    expect(await digestJson(e.contexts[d.input] as never)).toBe(d.input);
  });
});

describe("P1.2: the retained context is an owned, frozen snapshot", () => {
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

  test("an input over 256 KiB is still a deterministic budget refusal", async () => {
    const p = policy(rule({ id: "never", on: "propose", refuse: "false", fix: "x" }));
    const big = { ...refuseInput(p, "propose"), act: { kind: "propose" as const, target: null, body: { s: "x".repeat(262_144) } } };
    const r = await evaluateRefuse(active(p), big);
    expect(r.refusal?.rule).toBe("policy-budget-exceeded");
    const again = await replay(active(p), r.evaluations[0]!.context);
    expect(again.evaluations.map((e) => e.decision)).toEqual(r.evaluations.map((e) => e.decision));
  });
});

describe("P2.1: any legal repository path works in rule inputs", () => {
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

  test("notify resolves owners of such paths", async () => {
    const r = await evaluateNotify(active(p), notifyInput(p, "propose", special), { roles: {}, reviewers: [] });
    expect(r.notify.map((n) => n.to)).toEqual(["@c", "@j", "@p", "@x"]);
  });

  test("a refuse rule can read such paths as values", async () => {
    const q = policy(rule({ id: "no-proto", on: "propose", refuse: '"__proto__" in proposal.paths', fix: "x" }));
    const r = await evaluateRefuse(active(q), refuseInput(q, "propose", { proposal: requireInput(q, ["constructor", "__proto__"]).proposal }));
    expect(r.refusal?.rule).toBe("no-proto");
  });
});

/**
 * Contract amendment 2, lane L edits (docs/protocol.md section 27). One
 * describe block per edit; edit 6 is covered by the finding 5 tests in
 * review-ea4a9bd0.test.ts, and edit 8 needs no change.
 */

import { describe, expect, test } from "vitest";
import type { CheckerConfig, LogEntry } from "@generalbusiness/artroom-contract";
import { policy, requireReview, rule } from "@generalbusiness/artroom-policy";
import { contentOf, entryId, retainedPath, retain } from "../src/entries.ts";
import { canonicalize } from "../src/canonical.ts";
import { digestJson, keyPairFromSeed } from "../src/crypto.ts";
import { verifyLog } from "../src/verify.ts";
import { DEMO_CHECKERS, DEMO_POLICY, RoomSim, checkBody, keys, seed } from "./support/room-sim.ts";
import { alice, base, bobAuth, expectReason, lines, publishAs, publishLines, reseal } from "./support/logs.ts";

/** A policy with a `require` rule and a `land` rule, so recomputation and preparation record decisions. */
const PLAN = (reason = "Not on a freeze.") =>
  policy(
    requireReview({ paths: "src/**", from: "@alice" }),
    rule({ id: "freeze", kind: "land", block: "false", reason, fix: "Wait for the freeze to end." }),
  );

/** Change the first decision of entry `seq` (a system event with decisions) to a refusal, and reseal. */
function wrongDecision(entries: LogEntry[], seq: number): LogEntry[] {
  const e = [...entries];
  const c = contentOf(e[seq]!);
  if (c.entry.type !== "system" || !("decisions" in c.entry.event)) throw new Error("expected an event with decisions");
  const [d, ...rest] = c.entry.event.decisions;
  const wrong = { ...d!, outcome: { result: "block" as const, reason: "x", fix: "y" } };
  e[seq] = { ...e[seq]!, entry: { type: "system", event: { ...c.entry.event, decisions: [wrong, ...rest] } as never } };
  return reseal(e, seq);
}

describe("edit 1: decisions in obligations-recomputed and land-evaluated replay", () => {
  async function room() {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]); // 2
    sim.activate(PLAN(), DEMO_CHECKERS); // 3
    await sim.recomputed(claim.lane!, ["src/a.ts"]); // 4
    await sim.landEvaluated(claim.lane!, ["src/a.ts"]); // 5
    return { sim };
  }

  test("both events' decisions replay under the active policy", async () => {
    const { sim } = await room();
    const recorded = [4, 5].map((n) => {
      const ev = sim.entries[n]!.entry;
      return ev.type === "system" && "decisions" in ev.event ? ev.event.decisions.length : 0;
    });
    expect(recorded.every((n) => n > 0)).toBe(true);
    const r = await verifyLog(await publishAs(sim, sim.entries));
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, verifiedThrough: 5 });
    expect(r.decisionsReplayed).toBeGreaterThanOrEqual(1 + recorded[0]! + recorded[1]!);
  });

  test("a wrong decision in obligations-recomputed: policy-decision-mismatch", async () => {
    const { sim } = await room();
    await expectReason(await publishAs(sim, wrongDecision(sim.entries, 4)), "policy-decision-mismatch", 4);
  });

  test("a wrong decision in land-evaluated: policy-decision-mismatch", async () => {
    const { sim } = await room();
    await expectReason(await publishAs(sim, wrongDecision(sim.entries, 5)), "policy-decision-mismatch", 5);
  });

  test("obligations-recomputed must name the active policy version", async () => {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]); // 2
    const v3 = sim.activate(PLAN(), DEMO_CHECKERS); // 3
    sim.activate(PLAN("A newer freeze."), DEMO_CHECKERS); // 4
    await sim.recomputed(claim.lane!, ["src/a.ts"], v3); // 5: names the superseded version
    const r = await expectReason(await publishAs(sim, sim.entries), "policy-version-mismatch", 5);
    expect(r.failures[0]!.detail).toMatch(/obligations-recomputed names policy/);
  });

  test("land-evaluated decisions must name the active policy version", async () => {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]); // 2
    sim.activate(PLAN(), DEMO_CHECKERS); // 3
    const old = sim.policy;
    sim.activate(PLAN("A newer freeze."), DEMO_CHECKERS); // 4
    await sim.landEvaluated(claim.lane!, ["src/a.ts"], old); // 5: evaluated under the superseded version
    await expectReason(await publishAs(sim, sim.entries), "policy-version-mismatch", 5);
  });
});

describe("edit 2: checker configurations are published, and each check names its checker's digest", () => {
  test("the fixture's policy-activated names its checker configuration, sorted by name", () => {
    const sim = new RoomSim();
    const ev = sim.entries[1]!.entry;
    expect(ev.type === "system" && ev.event.type === "policy-activated" && ev.event.checkers).toEqual([{ name: "test", config: digestJson(DEMO_CHECKERS["test"]) }]);
  });

  test("a checker configuration that is not published: checker-missing", async () => {
    const sim = await base();
    const without = sim.retained.filter((r) => retainedPath(r) !== retainedPath(retain("policy", DEMO_CHECKERS["test"])));
    await expectReason(await publishAs(sim, sim.entries, without), "checker-missing", 1);
  });

  test("a published checker configuration that is not one: malformed", async () => {
    const sim = new RoomSim();
    sim.activate(DEMO_POLICY, { broken: { format: "artroom-checker-v0" } as unknown as CheckerConfig }); // 2
    const r = await expectReason(await publishAs(sim, sim.entries), "malformed", 2);
    expect(r.failures[0]!.detail).toMatch(/checker broken: .*not one/);
  });

  test("checkers not sorted by name: malformed", async () => {
    const sim = new RoomSim();
    const a = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 5 } as const;
    sim.retained.push(retain("policy", a), retain("policy", DEMO_POLICY));
    sim.system({ type: "policy-activated", policy: digestJson(DEMO_POLICY), checkers: [{ name: "zeta", config: digestJson(a) }, { name: "alpha", config: digestJson(a) }], commit: null, previous: sim.policy.version, recomputed: { proposals: 0, reopened: 0, fenced: [] } }); // 2
    await expectReason(await publishLines(sim, lines(sim.entries)), "malformed", 2);
  });

  test("an accepted check names its checker's digest in the active version; another digest or checker: check-config-mismatch", async () => {
    const good = await base();
    const target = { lane: entryId(2, good.entries[2]!.hash), generation: 1 };
    good.accept(good.envelope(keys.alice, "check", target, checkBody()), alice); // 6
    expect(await verifyLog(await publishAs(good, good.entries))).toMatchObject({ ok: true, verifiedThrough: 6 });

    const wrong = await base();
    wrong.accept(wrong.envelope(keys.alice, "check", target, checkBody(`sha256:${"d".repeat(64)}`)), alice); // 6
    await expectReason(await publishAs(wrong, wrong.entries), "check-config-mismatch", 6);

    const unknown = await base();
    unknown.accept(unknown.envelope(keys.alice, "check", target, checkBody(digestJson(DEMO_CHECKERS["test"]), "lint")), alice); // 6
    await expectReason(await publishAs(unknown, unknown.entries), "check-config-mismatch", 6);
  });

  test("after an activation changes the configuration, a check naming the old digest: check-config-mismatch", async () => {
    const sim = await base();
    const old = digestJson(DEMO_CHECKERS["test"]);
    sim.activate(DEMO_POLICY, { test: { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60 } }); // 6
    const target = { lane: entryId(2, sim.entries[2]!.hash), generation: 1 };
    sim.accept(sim.envelope(keys.alice, "check", target, checkBody(old)), alice); // 7
    await expectReason(await publishAs(sim, sim.entries), "check-config-mismatch", 7);
  });

  test("a recorded refusal of a check is not held to the active digest", async () => {
    const sim = await base();
    const target = { lane: entryId(2, sim.entries[2]!.hash), generation: 1 };
    const act = sim.envelope(keys.alice, "check", target, checkBody(`sha256:${"d".repeat(64)}`));
    sim.refuse(act, alice, [], { refused: true, rule: "check-binding", reason: "The config is not the active one.", fix: "Run the active checker." } as never); // 6
    expect(await verifyLog(await publishAs(sim, sim.entries))).toMatchObject({ ok: true, verifiedThrough: 6 });
  });
});

describe("edit 3: each delegate is checked against the grantor's role (R-ADM-5)", () => {
  const carol = keyPairFromSeed(seed(5));

  test("a delegate that grants roster: delegation-invalid", async () => {
    const sim = await base();
    sim.accept(sim.envelope(keys.alice, "roster", null, { op: "delegate", to: carol.key, kinds: ["note", "roster"], lanes: "*", expiresAt: sim.at(5000) }), alice); // 6
    const r = await expectReason(await publishAs(sim, sim.entries), "delegation-invalid", 6);
    expect(r.failures[0]!.detail).toMatch(/may not grant roster/);
  });

  test("a delegate signed under a delegation: delegation-invalid", async () => {
    const sim = await base();
    const e = sim.accept(sim.envelope(keys.bob, "roster", null, { op: "delegate", to: carol.key, kinds: "*", lanes: "*", expiresAt: sim.at(5000) }), bobAuth); // 6
    const d = entryId(e.seq, e.hash);
    const redelegate = sim.envelope(carol, "roster", null, { op: "delegate", to: keys.carol.key, kinds: ["note"], lanes: "*", expiresAt: sim.at(5000) }, d);
    sim.accept(redelegate, { via: "delegation", member: "@bob", role: "member", key: carol.key, delegation: d, grantor: keys.bob.key } as never); // 7
    const r = await expectReason(await publishAs(sim, sim.entries), "delegation-invalid", 7);
    // Named as re-delegation, before the kinds are looked at.
    expect(r.failures[0]!.detail).toMatch(/never covers roster acts/);
  });
});

describe("edit 5: the report lists lanes, leases, obligations and landings as not proven (R-LOG-15)", () => {
  test("cannotProve names each", async () => {
    const sim = await base();
    const r = await verifyLog(await publishAs(sim, sim.entries));
    const text = r.cannotProve.join("\n");
    for (const word of ["Lanes", "leases", "obligations", "landings", "unpublished acts", "room clock"]) expect(text).toContain(word);
  });
});

describe("edit 7: an imported genesis's onboarding grant (R-GEN-12)", () => {
  const operator = keyPairFromSeed(seed(40));

  test("a grant signed by its operator key, naming the genesis's repository and admin, verifies and the report names the operator", async () => {
    const sim = new RoomSim(keys.alice, "@alice", { onboarding: { operator } });
    const r = await verifyLog(await publishAs(sim, sim.entries));
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, operator: operator.key });
  });

  test("a public founding reports no operator", async () => {
    const sim = new RoomSim();
    expect(await verifyLog(await publishAs(sim, sim.entries))).toMatchObject({ ok: true, operator: null });
  });

  test("a grant signed by another key: onboarding-invalid", async () => {
    const sim = new RoomSim(keys.alice, "@alice", { onboarding: { operator, signer: keyPairFromSeed(seed(41)) } });
    const r = await expectReason(await publishAs(sim, sim.entries), "onboarding-invalid", 0);
    expect(r.operator).toBeNull();
  });

  test("a grant for another repository, or another first admin: onboarding-invalid", async () => {
    const repo = new RoomSim(keys.alice, "@alice", { onboarding: { operator, repo: "other-repo" } });
    await expectReason(await publishAs(repo, repo.entries), "onboarding-invalid", 0);
    const admin = new RoomSim(keys.alice, "@alice", { onboarding: { operator, admin: keys.bob.key } });
    await expectReason(await publishAs(admin, admin.entries), "onboarding-invalid", 0);
  });

  test("a grant without its operator field: malformed", async () => {
    const sim = new RoomSim(keys.alice, "@alice", { onboarding: { operator } });
    const g = sim.entries[0]!;
    if (g.entry.type !== "system" || g.entry.event.type !== "genesis") throw new Error("expected genesis");
    const { operator: _o, ...grant } = g.entry.event.genesis.onboarding!.grant;
    const genesis = { ...g.entry.event.genesis, onboarding: { ...g.entry.event.genesis.onboarding!, grant } };
    const l = lines(sim.entries);
    l[0] = canonicalize({ ...g, entry: { type: "system", event: { ...g.entry.event, genesis } } });
    await expectReason(await publishLines(sim, l), "malformed", 0);
  });
});

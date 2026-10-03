/**
 * Declared acts stage 3 (request 1e8fee4b, as clarified by the planner's
 * assert 869d9aad, point 3): what a recorded context may not be the
 * authority for. Verify rebuilds, from the fold, a land input's obligations
 * and reviews, a notify directory's reviewers, and each carry call: which
 * verdicts and checks one is owed for, its evidence, its policy comparison
 * and its facts (src/obligations.ts, src/calls.ts).
 *
 * The fixtures are room-signed logs in test/fixtures/, written by
 * scripts/declared-fixtures.ts with the simulator in
 * support/declared-room.ts, which follows the Room's obligation rules
 * (support/room-obligations.ts). Each forged variant differs from its
 * fixture in the one way its test names. A forged call is made consistent:
 * the evaluator is run on the false context and its decisions recorded
 * (support/fixtures.ts `forgeCall`), so replaying the record finds nothing,
 * and only the context rebuilt from the log shows it false.
 */

import { describe, expect, test } from "vitest";
import type { Decision, LogEntry, ReplayContext, SystemEvent } from "@generalbusiness/artroom-contract";
import { replay } from "@generalbusiness/artroom-policy";
import { type VerifyReason } from "../src/verify.ts";
import type { Fixture } from "./support/declared-room.ts";
import { keys } from "./support/room-sim.ts";
import { contextOf, decisionsAt, forgeCall, insert, keep, open, policyOf, reseal, setDecisions, verify, withEnvelope, type Log } from "./support/fixtures.ts";
import activatesJson from "./fixtures/declared-activates-kind.json";
import carryJson from "./fixtures/declared-carry.json";
import plainJson from "./fixtures/declared-carry-plain.json";
import snapshotJson from "./fixtures/declared-snapshot.json";

const ACTIVATES = activatesJson as unknown as Fixture;
const CARRY = carryJson as unknown as Fixture;
const PLAIN = plainJson as unknown as Fixture;
const SNAPSHOT = snapshotJson as unknown as Fixture;

type Ctx<K extends ReplayContext["kind"]> = Extract<ReplayContext, { readonly kind: K }>;

/** Verify `log` and expect `reason` at `seq`, with the verified prefix ending just before it. */
async function expectFailure(log: Log, reason: VerifyReason, seq: number, opts: Parameters<typeof verify>[1] = {}) {
  const r = await verify(log, opts);
  expect(r.ok).toBe(false);
  const f = r.failures.find((x) => x.reason === reason);
  expect(f, `failures: ${r.failures.map((x) => `${x.reason}@${x.seq}: ${x.detail}`).join("; ")}`).toBeDefined();
  expect(f!.seq).toBe(seq);
  expect(r.verifiedThrough).toBe(seq - 1);
  return f!;
}

const idOf = (log: Log, seq: number) => `act_${seq}_${log.entries[seq]!.hash.slice(7, 15)}`;
const eventAt = <T extends SystemEvent["type"]>(log: Log, seq: number, type: T) => {
  const e = log.entries[seq]!.entry;
  if (e.type !== "system" || e.event.type !== type) throw new Error(`entry ${seq} is not a ${type} event`);
  return e.event as Extract<SystemEvent, { readonly type: T }>;
};
const kindAt = (log: Log, seq: number) => {
  const e = log.entries[seq]!.entry;
  return e.type === "system" ? e.event.type : `${e.type}:${e.act.envelope.kind}`;
};
/** Replace a system event at `seq` and reseal from there. */
function withEvent(log: Log, seq: number, change: (ev: Record<string, unknown>) => Record<string, unknown>): void {
  const e = log.entries[seq]!.entry;
  if (e.type !== "system") throw new Error(`entry ${seq} is not a system event`);
  log.entries[seq] = { ...log.entries[seq]!, entry: { type: "system", event: change({ ...(e.event as unknown as Record<string, unknown>) }) as never } };
  reseal(log, seq);
}
const landContext = (log: Log, seq: number) => contextOf(log, decisionsAt(log, seq).find((d) => d.kind === "land")!) as Ctx<"land">;
const obligation = (c: Ctx<"land">, id: string) => c.input.obligations.find((o) => o.id === id);

// The entries of declared-carry.json the tests name (scripts/declared-fixtures.ts).
const S = {
  /** Thread 1. */
  review1: 13,
  notified1: 14,
  propose2: 17,
  recompute2: 20,
  land: 23,
  carried: 25,
  notCarried: 26,
  evaluated: 28,
  evaluatedAll: 30,
  /** Thread 2. */
  t2propose2: 36,
  t2notified2: 37,
  t2propose3: 41,
  t2land: 45,
  /** Thread 3. */
  t3notifiedFirst: 55,
  t3notified: 56,
  t3propose2: 57,
  /** Thread 4. */
  t4land: 73,
  activated3: 76,
  t1recompute3: 77,
  t1evaluated3: 79,
  t1carried3: 80,
  t4evaluated3: 84,
  t4notified3: 86,
  t1blocked: 89,
  /** Thread 5. */
  t5land: 96,
  t5evaluated: 98,
  t5evaluatedRevoked: 100,
  /** Thread 6. */
  t6land: 106,
  t6evaluated: 108,
  t6evaluatedTwoAdmins: 110,
  /** The policy whose require fails. */
  t1blockedRecompute: 112,
} as const;

describe("the fixtures are what the tests take them to be", () => {
  test("declared-carry: each named entry is the kind the tests forge", () => {
    const log = open(CARRY);
    expect(Object.fromEntries(Object.entries(S).map(([k, seq]) => [k, kindAt(log, seq)]))).toEqual({
      review1: "act:review",
      notified1: "notified",
      propose2: "act:propose",
      recompute2: "obligations-recomputed",
      land: "act:land",
      carried: "check-carried",
      notCarried: "check-carried",
      evaluated: "land-evaluated",
      evaluatedAll: "land-evaluated",
      t2propose2: "act:propose",
      t2notified2: "notified",
      t2propose3: "act:propose",
      t2land: "act:land",
      t3notifiedFirst: "notified",
      t3notified: "notified",
      t3propose2: "act:propose",
      t4land: "act:land",
      activated3: "policy-activated",
      t1recompute3: "obligations-recomputed",
      t1evaluated3: "land-evaluated",
      t1carried3: "check-carried",
      t4evaluated3: "land-evaluated",
      t4notified3: "notified",
      t1blocked: "land-evaluated",
      t5land: "act:land",
      t5evaluated: "land-evaluated",
      t5evaluatedRevoked: "land-evaluated",
      t6land: "act:land",
      t6evaluated: "land-evaluated",
      t6evaluatedTwoAdmins: "land-evaluated",
      t1blockedRecompute: "obligations-recomputed",
    });
  });
});

// ============================================================ honest logs

describe("honest logs verify, with every input rebuilt from the fold", () => {
  test("declared-carry verifies on a fresh replay with the Git objects, with no proof limit", async () => {
    const r = await verify(open(CARRY));
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.verifiedThrough).toBe(115);
    expect(r.limits).toEqual([]);
    expect(r.decisionsReplayed).toBe(open(CARRY).entries.reduce((n, _e, i) => n + decisionsAt(open(CARRY), i).length, 0));
  });

  test("the land inputs it rebuilds are the ones the room recorded: blocking obligations only, met as the evidence says", () => {
    const log = open(CARRY);
    // The land act on thread 1's second version: the verdict is carried; both checks were made on this version.
    expect(landContext(log, S.land).input.obligations).toEqual([
      { id: "obl_src-review", met: true },
      { id: "obl_tests", met: true },
      { id: "obl_build", met: true },
    ]);
    expect(landContext(log, S.land).input.reviews).toEqual([expect.objectContaining({ act: idOf(log, S.review1), basis: "carried", verdict: "approve" })]);
    // On the landing's integration: tests by the carried check, build not yet; then build by a check on it.
    expect(obligation(landContext(log, S.evaluated), "obl_tests")!.met).toBe(true);
    expect(obligation(landContext(log, S.evaluated), "obl_build")!.met).toBe(false);
    expect(obligation(landContext(log, S.evaluatedAll), "obl_build")!.met).toBe(true);
    // The advisory obligation is never listed (R-OBL-7).
    expect(obligation(landContext(log, S.land), "obl_lint")).toBeUndefined();
    // After the new policy: the carry was judged under the old one, and the build check names the old configuration.
    expect(landContext(log, S.t1evaluated3).input.obligations).toEqual([
      { id: "obl_src-review", met: true },
      { id: "obl_tests", met: false },
      { id: "obl_build", met: false },
    ]);
    // Dave no longer qualifies for lib-review: the obligation is open and his verdict is not listed.
    expect(obligation(landContext(log, S.t4evaluated3), "obl_lib-review")!.met).toBe(false);
    expect(landContext(log, S.t4evaluated3).input.reviews.map((r) => r.by.member)).toEqual(["@alice"]);
    // Alice's objection here replaces her carried approval, and the land rule blocks.
    expect(obligation(landContext(log, S.t1blocked), "obl_src-review")!.met).toBe(false);
    expect(landContext(log, S.t1blocked).input.reviews).toEqual([expect.objectContaining({ basis: "here", verdict: "object" })]);
    // A failing check meets nothing; a revoked key's check stops counting; a second admin ends the sole-admin approval.
    expect(obligation(landContext(log, S.t4land), "obl_build")!.met).toBe(false);
    expect(obligation(landContext(log, S.t5evaluated), "obl_tests")!.met).toBe(true);
    expect(obligation(landContext(log, S.t5evaluatedRevoked), "obl_tests")!.met).toBe(false);
    expect(obligation(landContext(log, S.t6evaluated), "obl_admin-approval")!.met).toBe(true);
    expect(obligation(landContext(log, S.t6evaluatedTwoAdmins), "obl_admin-approval")!.met).toBe(false);
  });

  test("declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed", async () => {
    const r = await verify(open(CARRY), { repo: false });
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.limits.every((l) => l.reason === "git-unwitnessed")).toBe(true);
    const at = (seq: number) => r.limits.filter((l) => l.seq === seq).map((l) => l.detail);
    // The paths changed since the carried verdict's head are the retained carry context's.
    expect(at(S.propose2).some((d) => /paths changed since/.test(d))).toBe(true);
    expect(at(S.recompute2).some((d) => /paths changed since/.test(d))).toBe(true);
    // Where no carry call is recorded, whether the verdict carried is undecided.
    expect(at(S.t2propose2).some((d) => /whether it carried is undecided/.test(d))).toBe(true);
    // The new integration's tree is the retained context's.
    expect(at(S.carried).some((d) => /new integration .* tree/.test(d))).toBe(true);
  });

  test("declared-carry-plain: a verdict carried by the platform's conditions alone is derived, with no recorded decision", async () => {
    const log = open(PLAIN);
    expect(decisionsAt(log, 7).some((d) => d.kind === "carry")).toBe(false);
    expect(landContext(log, 8).input.reviews).toEqual([expect.objectContaining({ act: idOf(log, 6), basis: "carried" })]);
    const r = await verify(log);
    expect(r.failures).toEqual([]);
    expect(r.limits).toEqual([]);
  });

  test("declared-carry-plain without the Git objects: the carry is undecided, so that part of each land input is the retained context's, and reported", async () => {
    const r = await verify(open(PLAIN), { repo: false });
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.limits.filter((l) => l.seq === 7).some((l) => /whether it carried is undecided/.test(l.detail))).toBe(true);
    expect(r.limits.some((l) => l.seq === 8 && /land input/.test(l.detail))).toBe(true);
    expect(r.limits.some((l) => l.seq === 9 && /land input/.test(l.detail))).toBe(true);
  });

  test("declared-snapshot: a check on a snapshot commit counts for the integration a prepared event records it for; with no prepared event that is reported", async () => {
    const log = open(SNAPSHOT);
    expect(kindAt(log, 9)).toBe("prepared");
    expect(obligation(landContext(log, 11), "obl_tests")!.met).toBe(true);
    const r = await verify(log);
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    // The first landing is decided by the log alone; the second has no prepared event.
    expect(r.limits.map((l) => l.seq)).toEqual([16]);
    expect(r.limits[0]!.detail).toMatch(/filtered snapshot with no prepared event/);
  });
});

// ============================================================ land inputs

describe("a land input's obligations are rebuilt (R-POL-6, R-OBL-1 to R-OBL-7)", () => {
  const withObligations = (seq: number, change: (o: Ctx<"land">["input"]["obligations"]) => unknown) => async () => {
    const log = open(CARRY);
    await forgeCall(log, seq, "land", (c) => ({ ...c, input: { ...c.input, obligations: change(c.input.obligations) } }));
    const f = await expectFailure(log, "context-mismatch", seq);
    expect(f.detail).toMatch(/input\.obligations/);
  };
  const setMet = (id: string, met: boolean) => (o: Ctx<"land">["input"]["obligations"]) => o.map((x) => (x.id === id ? { ...x, met } : x));

  test("context-mismatch: a land act whose context says a check obligation is met, when no check on that integration meets it", withObligations(S.evaluated, setMet("obl_build", true)));
  test("context-mismatch: a land act whose context leaves an open obligation out", withObligations(S.t4land, (o) => o.filter((x) => x.id !== "obl_build")));
  test("context-mismatch: a land act whose context lists the advisory obligation", withObligations(S.land, (o) => [...o, { id: "obl_lint", met: false }]));
  test("context-mismatch: a failing check recorded as meeting its obligation", withObligations(S.t4land, setMet("obl_build", true)));
  test("context-mismatch: a land-evaluated context that hides the carried check: tests said to be open", withObligations(S.evaluated, setMet("obl_tests", false)));
  test("context-mismatch: a check carry judged under the earlier policy, counted after the new one activates", withObligations(S.t1evaluated3, setMet("obl_tests", true)));
  test("context-mismatch: a check naming the earlier configuration, counted after the configuration changes", withObligations(S.t1evaluated3, setMet("obl_build", true)));
  test("context-mismatch: a verdict whose reviewer no longer qualifies under the new policy, still counted", withObligations(S.t4evaluated3, setMet("obl_lib-review", true)));
  test("context-mismatch: a check whose key was revoked as compromised, still counted", withObligations(S.t5evaluatedRevoked, setMet("obl_tests", true)));
  test("context-mismatch: a sole admin's self-approval, still counted when the room has two active admins", withObligations(S.t6evaluatedTwoAdmins, setMet("obl_admin-approval", true)));
  test("context-mismatch: a carried approval still counted after its reviewer objects on this version", withObligations(S.t1blocked, setMet("obl_src-review", true)));
  test("context-mismatch: the platform's obl_admin-approval left out of a land context", withObligations(S.t6land, (o) => o.filter((x) => x.id !== "obl_admin-approval")));
});

describe("a land input's reviews are rebuilt (R-POL-7)", () => {
  const withReviews = (seq: number, change: (r: Ctx<"land">["input"]["reviews"]) => unknown) => async () => {
    const log = open(CARRY);
    await forgeCall(log, seq, "land", (c) => ({ ...c, input: { ...c.input, reviews: change(c.input.reviews) } }));
    const f = await expectFailure(log, "context-mismatch", seq);
    expect(f.detail).toMatch(/input\.reviews/);
  };

  test("context-mismatch: the carried verdict left out", withReviews(S.land, () => []));
  test("context-mismatch: the carried verdict listed as reviewed here", withReviews(S.land, (r) => r.map((x) => ({ ...x, basis: "here" }))));
  test("context-mismatch: a reviewer's role changed in the listing", withReviews(S.land, (r) => r.map((x) => ({ ...x, by: { ...x.by, role: "member" } }))));
  test("context-mismatch: an objection hidden, so that objection-open does not block", withReviews(S.t1blocked, (r) => r.map((x) => ({ ...x, verdict: "approve" }))));
  test("context-mismatch: a verdict listed whose reviewer no longer qualifies for any obligation", async () => {
    const log = open(CARRY);
    const dave = landContext(log, S.t4land).input.reviews.find((r) => r.by.member === "@dave")!;
    await forgeCall(log, S.t4evaluated3, "land", (c) => ({ ...c, input: { ...c.input, reviews: [...c.input.reviews, dave].sort((a, b) => (a.act < b.act ? -1 : 1)) } }));
    await expectFailure(log, "context-mismatch", S.t4evaluated3);
  });
  test("context-mismatch: a reviewer's earlier objection listed in place of the later approval", async () => {
    const log = open(CARRY);
    // Thread 2's third version has one verdict; its second had an objection. List the objection's act instead.
    await forgeCall(log, S.t2land, "land", (c) => ({ ...c, input: { ...c.input, reviews: c.input.reviews.map((x) => ({ ...x, act: idOf(log, 38) as typeof x.act })) } }));
    await expectFailure(log, "context-mismatch", S.t2land);
  });
});

// ================================================================= notify

describe("a notify directory's reviewers are rebuilt (R-POL-5)", () => {
  const withReviewers = (seq: number, reviewers: string[]) => async () => {
    const log = open(CARRY);
    await forgeCall(log, seq, "notify", (c) => ({ ...c, directory: { ...c.directory, reviewers } }));
    const f = await expectFailure(log, "context-mismatch", seq);
    expect(f.detail).toMatch(/directory\.reviewers/);
  };

  test("context-mismatch: the reviewer who just approved left out", withReviewers(S.notified1, []));
  test("context-mismatch: a member who reviewed nothing listed", withReviewers(S.notified1, ["@alice", "@bob"]));
  test("context-mismatch: the previous version's reviewer listed for a new version nobody has reviewed", withReviewers(S.t2notified2, ["@dave"]));
  test("context-mismatch: a reviewer who no longer qualifies under the policy in force listed", withReviewers(S.t4notified3, ["@alice", "@dave", "@erin"]));
  test("context-mismatch: one of two reviewers left out", withReviewers(S.t3notified, ["@erin"]));
  test("context-mismatch: a notification sealed after a later review lists that later reviewer; the reviewers are those when its own act was sealed", withReviewers(S.t3notifiedFirst, ["@dave", "@erin"]));
});

// ================================================================== carry

describe("carry calls for verdicts are derived, and their inputs rebuilt (R-CARRY-1 to R-CARRY-5)", () => {
  const withoutCarry = (log: Log, seq: number) => setDecisions(log, seq, decisionsAt(log, seq).filter((d) => d.kind !== "carry"));

  test("decision-missing: a propose whose carry call is deleted, where the earlier verdict is owed one", async () => {
    const log = open(CARRY);
    withoutCarry(log, S.propose2);
    const f = await expectFailure(log, "decision-missing", S.propose2);
    expect(f.detail).toMatch(/carry call decides verdicts-carry/);
  });

  test("decision-missing: a propose that records one of the two carry calls it owes", async () => {
    const log = open(CARRY);
    const carries = [...new Set(decisionsAt(log, S.t3propose2).filter((d) => d.kind === "carry").map((d) => d.input))];
    expect(carries).toHaveLength(2);
    setDecisions(log, S.t3propose2, decisionsAt(log, S.t3propose2).filter((d) => d.input !== carries[1]));
    await expectFailure(log, "decision-missing", S.t3propose2);
  });

  test("the two carry calls are owed in the room's order: the same two calls recorded the other way round do not match", async () => {
    const log = open(CARRY);
    const all = decisionsAt(log, S.t3propose2);
    const carries = all.filter((d) => d.kind === "carry");
    expect((contextOf(log, carries[0]!) as Ctx<"carry">).input.evidence.by.member).toBe("@erin");
    expect((contextOf(log, carries[1]!) as Ctx<"carry">).input.evidence.by.member).toBe("@dave");
    setDecisions(log, S.t3propose2, [...all.filter((d) => d.kind !== "carry"), carries[1]!, carries[0]!]);
    await expectFailure(log, "context-mismatch", S.t3propose2);
  });

  test("decision-missing: a recomputation whose carry call is deleted", async () => {
    const log = open(CARRY);
    withoutCarry(log, S.recompute2);
    await expectFailure(log, "decision-missing", S.recompute2);
  });

  test("decision-missing: a blocked recomputation still owes its carry call", async () => {
    const log = open(CARRY);
    expect(eventAt(log, S.t1blockedRecompute, "obligations-recomputed").blocked).toBeDefined();
    withoutCarry(log, S.t1blockedRecompute);
    await expectFailure(log, "decision-missing", S.t1blockedRecompute);
  });

  /** A carry call a forger adds: the context of the honest call at `from`, changed, evaluated, and appended at `seq`. */
  async function addCarry(log: Log, seq: number, from: number, change: (c: Ctx<"carry">) => Ctx<"carry">): Promise<void> {
    const honest = decisionsAt(log, from).find((d) => d.kind === "carry")!;
    const last = decisionsAt(log, seq).at(-1)!;
    const context = change(structuredClone(contextOf(log, honest)) as Ctx<"carry">);
    const r = await replay({ doc: policyOf(log, last.policy), version: last.policy }, context);
    expect(r.evaluations.length).toBeGreaterThan(0);
    for (const e of r.evaluations) keep(log, e.context);
    setDecisions(log, seq, [...decisionsAt(log, seq), ...r.evaluations.map((e) => e.decision)]);
  }

  test("decision-extra: a carry call recorded for a verdict whose reviewed scope changed, where the evaluator decides nothing", async () => {
    const log = open(CARRY);
    const require = contextOf(log, decisionsAt(log, S.t2propose2).find((d) => d.kind === "require")!) as Ctx<"require">;
    const review = log.entries[34]!.entry as Extract<LogEntry["entry"], { type: "act" }>;
    // The forger claims nothing changed since dave's verdict, so the rule carries it.
    await addCarry(log, S.t2propose2, S.propose2, (c) => ({
      ...c,
      input: {
        ...c.input,
        evidence: { ...c.input.evidence, act: idOf(log, 34) as never, by: { member: "@dave", role: "maintainer", teams: [], delegated: false }, from: { generation: 1, head: (review.act.envelope.body as unknown as { head: never }).head }, scope: ["lib/**"] },
        changedSince: [],
        proposal: require.input.proposal,
      },
      budget: { ...c.budget, start: { steps: 0, inspectedBytes: 0 } },
    }));
    const f = await expectFailure(log, "decision-extra", S.t2propose2);
    expect(f.detail).toMatch(/recorded where the evaluator decides nothing/);
  });

  test("decision-extra: a carry call recorded for an objection, which is owed none", async () => {
    const log = open(CARRY);
    const require = contextOf(log, decisionsAt(log, S.t2propose3).find((d) => d.kind === "require")!) as Ctx<"require">;
    const objection = log.entries[38]!.entry as Extract<LogEntry["entry"], { type: "act" }>;
    await addCarry(log, S.t2propose3, S.propose2, (c) => ({
      ...c,
      input: {
        ...c.input,
        evidence: { ...c.input.evidence, act: idOf(log, 38) as never, verdict: "object", by: { member: "@dave", role: "maintainer", teams: [], delegated: false }, from: { generation: 2, head: (objection.act.envelope.body as unknown as { head: never }).head }, scope: ["lib/**"] },
        changedSince: [],
        proposal: require.input.proposal,
      },
      budget: { ...c.budget, start: { steps: 0, inspectedBytes: 0 } },
    }));
    const f = await expectFailure(log, "decision-extra", S.t2propose3);
    expect(f.detail).toMatch(/answer no call the room had to make/);
  });

  test("decision-extra: the owed carry call recorded twice", async () => {
    const log = open(CARRY);
    const carry = decisionsAt(log, S.propose2).filter((d) => d.kind === "carry");
    const ctx = contextOf(log, carry[0]!) as Ctx<"carry">;
    const again = keep(log, { ...ctx, budget: { ...ctx.budget, start: { steps: ctx.budget.start.steps + 1, inspectedBytes: ctx.budget.start.inspectedBytes } } });
    setDecisions(log, S.propose2, [...decisionsAt(log, S.propose2), ...carry.map((d) => ({ ...d, input: again }) as Decision)]);
    await expectFailure(log, "decision-extra", S.propose2);
  });

  const withCarry = (seq: number, change: (c: Ctx<"carry">) => unknown, where: RegExp) => async () => {
    const log = open(CARRY);
    await forgeCall(log, seq, "carry", change);
    const f = await expectFailure(log, "context-mismatch", seq);
    expect(f.detail).toMatch(where);
  };

  test("context-mismatch: carry evidence with a narrower reviewed scope than the verdict signed", withCarry(S.propose2, (c) => ({ ...c, input: { ...c.input, evidence: { ...c.input.evidence, scope: ["src/app.ts"] } } }), /input\.evidence\.scope/));
  test("context-mismatch: carry evidence with dependencies the verdict did not declare", withCarry(S.propose2, (c) => ({ ...c, input: { ...c.input, evidence: { ...c.input.evidence, dependsOn: ["docs/**"] } } }), /input\.evidence\.dependsOn/));
  test("context-mismatch: carry evidence naming another reviewer", withCarry(S.propose2, (c) => ({ ...c, input: { ...c.input, evidence: { ...c.input.evidence, by: { ...c.input.evidence.by, member: "@dave", role: "maintainer" } } } }), /input\.evidence\.by/));
  test("context-mismatch: carry evidence from another version", withCarry(S.propose2, (c) => ({ ...c, input: { ...c.input, evidence: { ...c.input.evidence, from: { ...c.input.evidence.from, generation: 2 } } } }), /input\.evidence\.from/));
  test("context-mismatch: a carry context that hides a changed path", withCarry(S.propose2, (c) => ({ ...c, input: { ...c.input, changedSince: ["docs/guide.md"] } }), /input\.changedSince/));
  test("context-mismatch: a carry context that says the policy is the one the verdict was given under, at a recomputation", withCarry(S.recompute2, (c) => ({ ...c, input: { ...c.input, policy: { same: true } } }), /input\.policy/));
  test("context-mismatch: a carry context that says the policy changed, at a propose under the same policy", withCarry(S.propose2, (c) => ({ ...c, input: { ...c.input, policy: { same: false } } }), /input\.policy/));
  test("context-mismatch: a carry fact that says the reviewer's key was retired", withCarry(S.propose2, (c) => ({ ...c, facts: { ...c.facts, revoked: "retired" } }), /facts\.revoked/));

  test("without the Git objects the paths changed since a verdict are the retained context's: the same falsified paths are accepted, and reported", async () => {
    const log = open(CARRY);
    await forgeCall(log, S.propose2, "carry", (c) => ({ ...c, input: { ...c.input, changedSince: ["docs/guide.md"] } }));
    const r = await verify(log, { repo: false });
    expect(r.failures.filter((f) => f.seq === S.propose2)).toEqual([]);
    expect(r.limits.some((l) => l.seq === S.propose2 && /paths changed since/.test(l.detail))).toBe(true);
  });
});

describe("a verdict carried on the platform's conditions alone (declared-carry-plain)", () => {
  test("context-mismatch: with the Git objects, a land context that leaves the carried verdict out", async () => {
    const log = open(PLAIN);
    await forgeCall(log, 8, "land", (c) => ({ ...c, input: { ...c.input, reviews: [] } }));
    await expectFailure(log, "context-mismatch", 8);
  });

  test("context-mismatch: with the Git objects, a land context that says the carried obligation is open", async () => {
    const log = open(PLAIN);
    await forgeCall(log, 8, "land", (c) => ({ ...c, input: { ...c.input, obligations: c.input.obligations.map((o) => ({ ...o, met: false })) } }));
    await expectFailure(log, "context-mismatch", 8);
  });

  test("without the Git objects only the undecided part is the retained context's: a falsified actor still fails", async () => {
    const log = open(PLAIN);
    await forgeCall(log, 8, "land", (c) => ({ ...c, input: { ...c.input, actor: { ...c.input.actor, role: "admin" } } }));
    const f = await expectFailure(log, "context-mismatch", 8, { repo: false });
    expect(f.detail).toMatch(/input\.actor/);
  });

  test("without the Git objects a listed verdict's content is still the fold's: a falsified verdict fails", async () => {
    const log = open(PLAIN);
    await forgeCall(log, 8, "land", (c) => ({ ...c, input: { ...c.input, reviews: c.input.reviews.map((r) => ({ ...r, by: { ...r.by, role: "member" } })) } }));
    await expectFailure(log, "context-mismatch", 8, { repo: false });
  });
});

// ========================================================== check-carried

describe("check-carried events are rebuilt (R-CARRY-6 to R-CARRY-14)", () => {
  test("context-mismatch: a check carry context that says the policy is the one the check was made under, after an activation", async () => {
    const log = open(CARRY);
    await forgeCall(log, S.t1carried3, "carry", (c) => ({ ...c, input: { ...c.input, policy: { same: true } } }));
    const f = await expectFailure(log, "context-mismatch", S.t1carried3);
    expect(f.detail).toMatch(/input\.policy/);
  });

  test("decision-missing: a check recorded as not carried, with no decision, where the tree is identical and a carry rule decides", async () => {
    const log = open(CARRY);
    const act = eventAt(log, S.carried, "check-carried").act;
    withEvent(log, S.carried, (ev) => ({ ...ev, decisions: [], outcome: { carried: false, notCarried: { act, code: "integration-changed", text: "not carried: the integration tree changed, so the check reruns" } } }));
    await expectFailure(log, "decision-missing", S.carried);
  });

  test("context-mismatch: the facts of a check carry falsified: the earlier check's configuration", async () => {
    const log = open(CARRY);
    await forgeCall(log, S.carried, "carry", (c) => ({ ...c, facts: { ...c.facts, check: { ...c.facts.check!, volatile: false, before: { ...c.facts.check!.before, runner: c.facts.check!.now.runner, integration: c.facts.check!.now.integration } } } }));
    const f = await expectFailure(log, "context-mismatch", S.carried);
    expect(f.detail).toMatch(/facts\.check/);
  });

  test("carried-outcome-mismatch: the recorded outcome is not the one the evaluator gives: a volatile check recorded as carried", async () => {
    const log = open(CARRY);
    const reason = (eventAt(log, S.carried, "check-carried").outcome as { reason: unknown }).reason;
    withEvent(log, S.notCarried, (ev) => ({ ...ev, outcome: { carried: true, reason } }));
    await expectFailure(log, "carried-outcome-mismatch", S.notCarried);
  });

  test("decision-extra: the same judgement recorded twice for one check, integration and policy", async () => {
    const log = open(CARRY);
    insert(log, S.carried + 1, log.entries[S.carried]!.entry);
    const f = await expectFailure(log, "decision-extra", S.carried + 1);
    expect(f.detail).toMatch(/already judged/);
  });

  test("decision-extra: a judgement for a check that already counts for the integration", async () => {
    const log = open(CARRY);
    // Thread 1's build check at seq 29 was made on the landing's integration itself.
    const template = eventAt(log, S.notCarried, "check-carried");
    insert(log, S.evaluatedAll + 1, { type: "system", event: { ...template, act: idOf(log, 29), decisions: [] } as never });
    const f = await expectFailure(log, "decision-extra", S.evaluatedAll + 1);
    expect(f.detail).toMatch(/already counts for this integration/);
  });

  test("decision-extra: a judgement naming a landing of another version", async () => {
    const log = open(CARRY);
    withEvent(log, S.carried, (ev) => ({ ...ev, generation: 1 }));
    const f = await expectFailure(log, "decision-extra", S.carried);
    expect(f.detail).toMatch(/is not a landing of/);
  });

  test("decision-extra: a judgement for a failing check", async () => {
    const log = open(CARRY);
    // Thread 4's failing build check, judged for thread 4's landing on another integration.
    const failing = idOf(log, 72);
    const t4 = eventAt(log, S.t4evaluated3, "land-evaluated");
    const lane = (log.entries[S.t4land]!.entry as Extract<LogEntry["entry"], { type: "act" }>).act.envelope.target as { lane: string; generation: number };
    const template = eventAt(log, S.notCarried, "check-carried");
    insert(log, S.t4evaluated3 + 1, {
      type: "system",
      event: { ...template, op: t4.op, lane: lane.lane, generation: lane.generation, integration: template.integration, act: failing, policy: idOf(log, S.activated3), outcome: { carried: false, notCarried: { act: failing, code: "volatile-inputs", text: "x" } }, decisions: [] } as never,
    });
    const f = await expectFailure(log, "decision-extra", S.t4evaluated3 + 1);
    expect(f.detail).toMatch(/not a passing check/);
  });

  test("without the Git objects the new integration's tree is the retained context's, and reported; a falsified evidence field still fails", async () => {
    const log = open(CARRY);
    await forgeCall(log, S.carried, "carry", (c) => ({ ...c, input: { ...c.input, evidence: { ...c.input.evidence, by: { ...c.input.evidence.by, role: "member" } } } }));
    const f = await expectFailure(log, "context-mismatch", S.carried, { repo: false });
    expect(f.detail).toMatch(/input\.evidence\.by/);
  });
});

// ============================================================ unknown threads

describe("an act that names a thread or entry the log never had", () => {
  test("guard-failed: a note on an entry the log never had, which the room refuses as lane-unknown", async () => {
    const log = open(ACTIVATES);
    expect(kindAt(log, 18)).toBe("act:note");
    withEnvelope(log, 18, keys.bob, (env) => ({ ...env, target: { act: "act_3_deadbeef" } }));
    await expectFailure(log, "guard-failed", 18);
  });
});

// ================================================================ snapshots

describe("a check on a filtered snapshot (R-CARRY-15, R-DECL-20)", () => {
  test("context-mismatch: with the prepared event, a land context that says the check does not count", async () => {
    const log = open(SNAPSHOT);
    await forgeCall(log, 11, "land", (c) => ({ ...c, input: { ...c.input, obligations: c.input.obligations.map((o) => ({ ...o, met: false })) } }));
    await expectFailure(log, "context-mismatch", 11);
  });

  test("guard-failed: a check naming a snapshot the prepared event does not record for its checker", async () => {
    const log = open(SNAPSHOT);
    withEvent(log, 9, (ev) => ({ ...ev, snapshots: (ev["snapshots"] as { digest: string }[]).map((x) => ({ ...x, digest: `sha256:${"f".repeat(64)}` })) }));
    await expectFailure(log, "guard-failed", 10);
  });

  test("with no prepared event the same falsified obligation is accepted: the log does not name the check's integration, and the report says so", async () => {
    const log = open(SNAPSHOT);
    await forgeCall(log, 16, "land", (c) => ({ ...c, input: { ...c.input, obligations: c.input.obligations.map((o) => ({ ...o, met: false })) } }));
    const r = await verify(log);
    expect(r.failures).toEqual([]);
    expect(r.limits.map((l) => l.seq)).toEqual([16]);
  });
});

// ==================================================== what a carry is kept for

describe("a verdict is carried only to obligations the new version has (declared-carry-plain, second thread)", () => {
  test("the honest log: the second version has no obligation, a later policy requires the review again, and the land input lists only the new approval", async () => {
    const log = open(PLAIN);
    expect(kindAt(log, 18)).toBe("act:propose");
    expect(kindAt(log, 20)).toBe("obligations-recomputed");
    expect(landContext(log, 22).input.obligations).toEqual([{ id: "obl_src-review", met: true }]);
    expect(landContext(log, 22).input.reviews).toEqual([expect.objectContaining({ act: idOf(log, 21), basis: "here" })]);
    const r = await verify(log);
    expect(r.failures).toEqual([]);
  });

  test("context-mismatch: a land context that lists the earlier verdict as carried, though nothing was carried", async () => {
    const log = open(PLAIN);
    const alice = landContext(log, 8).input.reviews[0]!;
    await forgeCall(log, 22, "land", (c) => ({ ...c, input: { ...c.input, reviews: [...c.input.reviews, { ...alice, act: idOf(log, 17) as typeof alice.act }].sort((a, b) => (a.act < b.act ? -1 : 1)) } }));
    await expectFailure(log, "context-mismatch", 22);
  });
});

// ================================================= a version with no such obligation

describe("a check-carried judgement for an obligation the version does not have (declared-snapshot, third thread)", () => {
  test("the honest log: the second version changes only notes, has no check obligation, and its land input lists none", async () => {
    const log = open(SNAPSHOT);
    expect(kindAt(log, 19)).toBe("act:check");
    expect(kindAt(log, 22)).toBe("land-evaluated");
    expect(landContext(log, 22).input.obligations).toEqual([]);
  });

  test("decision-extra: a judgement that carries the first version's check to the second, which has no such obligation", async () => {
    const log = open(SNAPSHOT);
    const evaluated = eventAt(log, 22, "land-evaluated");
    const target = (log.entries[21]!.entry as Extract<LogEntry["entry"], { type: "act" }>).act.envelope.target as { lane: string; generation: number };
    const act = idOf(log, 19);
    insert(log, 23, {
      type: "system",
      event: {
        type: "check-carried",
        op: evaluated.op,
        lane: target.lane,
        generation: target.generation,
        integration: evaluated.integration,
        obligation: "obl_tests",
        act,
        policy: idOf(log, 1),
        outcome: { carried: false, notCarried: { act, code: "integration-changed", text: "not carried: the integration tree changed, so the check reruns" } },
        decisions: [],
      } as never,
    });
    const f = await expectFailure(log, "decision-extra", 23);
    expect(f.detail).toMatch(/is not a check obligation of the version/);
  });
});

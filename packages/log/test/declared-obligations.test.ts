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
 * support/declared-room.ts. The simulator follows the Room's obligation
 * rules by its own port of them (support/room-obligations.ts), kept apart
 * from verify's implementation. So the honest fixtures are the witness of
 * each rule: verify compares every context it rebuilds with the one the
 * simulator recorded, and a rule that verify gets wrong makes an honest log
 * fail with context-mismatch, decision-missing or decision-extra. The first
 * describe block says which rule each part of the carry fixture shows.
 *
 * The forged logs then show what the honest ones cannot: that a recorded
 * context which differs from the rebuilt one is refused, for each kind of
 * call; which calls a log may not add; and exactly which part of a context
 * verify takes from the record when the Git objects or a prepared event are
 * absent. A forged call is made consistent (support/fixtures.ts
 * `forgeCall`): replaying the record finds nothing, and only the context
 * rebuilt from the log shows it false. A forged log is cut after the entry
 * it changes, so verify replays no more than it needs.
 */

import { describe, expect, test } from "vitest";
import type { LogEntry, ReplayContext, SystemEvent } from "@generalbusiness/artroom-contract";
import { replay } from "@generalbusiness/artroom-policy";
import { type VerifyReason } from "../src/verify.ts";
import type { Fixture } from "./support/declared-room.ts";
import { contextOf, decisionsAt, forgeCall, insert, keep, open, policyOf, reseal, setDecisions, verify, type Log } from "./support/fixtures.ts";
import carryJson from "./fixtures/declared-carry.json";
import plainJson from "./fixtures/declared-carry-plain.json";
import snapshotJson from "./fixtures/declared-snapshot.json";

const CARRY = carryJson as unknown as Fixture;
const PLAIN = plainJson as unknown as Fixture;
const SNAPSHOT = snapshotJson as unknown as Fixture;

type Ctx<K extends ReplayContext["kind"]> = Extract<ReplayContext, { readonly kind: K }>;

/** The fixture's log through entry `through`: all a forgery at that entry needs. */
function prefix(f: Fixture, through: number): Log {
  const log = open(f);
  log.entries.length = through + 1;
  return log;
}

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
  land: 23,
  carried: 25,
  notCarried: 26,
  evaluated: 28,
  evaluatedAll: 30,
  /** Thread 2. */
  t2propose2: 36,
  /** Thread 3. */
  t3notifiedFirst: 55,
  /** Thread 4. */
  t4land: 73,
  activated3: 76,
  t1evaluated3: 79,
  t4evaluated3: 84,
  t1blocked: 89,
  /** Thread 5. */
  t5land: 96,
  t5evaluated: 98,
  t5evaluatedRevoked: 100,
  /** Thread 6. */
  t6evaluated: 108,
  t6evaluatedTwoAdmins: 110,
} as const;

// ============================================================ honest logs

describe("honest logs verify, with every input rebuilt from the fold", () => {
  test("declared-carry verifies on a fresh replay with the Git objects, with no proof limit and every decision replayed", async () => {
    const log = open(CARRY);
    const r = await verify(log);
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.verifiedThrough).toBe(115);
    expect(r.limits).toEqual([]);
    expect(r.decisionsReplayed).toBe(log.entries.reduce((n, _e, i) => n + decisionsAt(log, i).length, 0));
  });

  test("what makes that log the witness of each obligation rule: the contexts the simulator recorded in it (R-OBL-1 to R-OBL-7, R-POL-5 to R-POL-7, R-CARRY-1 to R-CARRY-13)", () => {
    const log = open(CARRY);
    expect(Object.fromEntries(Object.entries(S).map(([k, seq]) => [k, kindAt(log, seq)]))).toMatchObject({
      land: "act:land",
      evaluated: "land-evaluated",
      evaluatedAll: "land-evaluated",
      t3notifiedFirst: "notified",
      t4land: "act:land",
      t1evaluated3: "land-evaluated",
      t4evaluated3: "land-evaluated",
      t1blocked: "land-evaluated",
      t5land: "act:land",
      t5evaluated: "land-evaluated",
      t5evaluatedRevoked: "land-evaluated",
      t6evaluated: "land-evaluated",
      t6evaluatedTwoAdmins: "land-evaluated",
    });
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
    // The new policy also adds an audit checker, whose configuration is the test checker's: nobody has run it.
    expect(landContext(log, S.t1evaluated3).input.obligations).toEqual([
      { id: "obl_src-review", met: true },
      { id: "obl_tests", met: false },
      { id: "obl_build", met: false },
      { id: "obl_audit", met: false },
    ]);
    expect(obligation(landContext(log, S.t5land), "obl_tests")!.met).toBe(true);
    expect(obligation(landContext(log, S.t5land), "obl_audit")!.met).toBe(false);
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
    // A notification sealed after a later review lists the reviewers when its own act was sealed.
    const first = contextOf(log, decisionsAt(log, S.t3notifiedFirst)[0]!) as Ctx<"notify">;
    expect(first.directory.reviewers).toEqual(["@dave"]);
  });

  test("declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed", async () => {
    const r = await verify(open(CARRY), { repo: false });
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.limits.every((l) => l.reason === "git-unwitnessed")).toBe(true);
    const at = (seq: number) => r.limits.filter((l) => l.seq === seq).map((l) => l.detail);
    // The paths changed since the carried verdict's head are the retained carry context's.
    expect(at(S.propose2).some((d) => /paths changed since/.test(d))).toBe(true);
    // Where no carry call is recorded, whether the verdict carried is undecided.
    expect(at(S.t2propose2).some((d) => /whether it carried is undecided/.test(d))).toBe(true);
    // The new integration's tree is the retained context's.
    expect(at(S.carried).some((d) => /new integration .* tree/.test(d))).toBe(true);
  });

  test("declared-carry-plain: a verdict carried by the platform's conditions alone is derived, with no recorded decision, and only to obligations the new version has; without the Git objects the carry is undecided and reported", async () => {
    const log = open(PLAIN);
    expect(decisionsAt(log, 7).some((d) => d.kind === "carry")).toBe(false);
    expect(landContext(log, 8).input.reviews).toEqual([expect.objectContaining({ act: idOf(log, 6), basis: "carried" })]);
    // The second thread: its second version has no obligation, a later policy requires the review again, and the land input lists only the new approval.
    expect(landContext(log, 22).input.obligations).toEqual([{ id: "obl_src-review", met: true }]);
    expect(landContext(log, 22).input.reviews).toEqual([expect.objectContaining({ act: idOf(log, 21), basis: "here" })]);
    const r = await verify(log);
    expect(r.failures).toEqual([]);
    expect(r.limits).toEqual([]);

    const bare = await verify(log, { repo: false });
    expect(bare.failures).toEqual([]);
    expect(bare.ok).toBe(true);
    expect(bare.limits.filter((l) => l.seq === 7).some((l) => /whether it carried is undecided/.test(l.detail))).toBe(true);
    for (const seq of [8, 9]) expect(bare.limits.some((l) => l.seq === seq && /land input/.test(l.detail)), `entry ${seq}`).toBe(true);
  });

  test("declared-snapshot: a check on a snapshot commit counts for the integration a prepared event records it for; with no prepared event that is reported; a version with no check obligation lists none", async () => {
    const log = open(SNAPSHOT);
    expect(kindAt(log, 9)).toBe("prepared");
    expect(obligation(landContext(log, 11), "obl_tests")!.met).toBe(true);
    expect(landContext(log, 22).input.obligations).toEqual([]);
    const r = await verify(log);
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    // The first landing is decided by the log alone; the second has no prepared event.
    expect(r.limits.map((l) => l.seq)).toEqual([16]);
    expect(r.limits[0]!.detail).toMatch(/filtered snapshot with no prepared event/);
  });
});

// ============================================ a recorded context that differs

describe("a recorded context that differs from the one rebuilt from the log is context-mismatch, and names where they differ", () => {
  test("a land input's obligations (R-POL-6): one said to be met when no check on that integration meets it, and one left out", async () => {
    const met = prefix(CARRY, S.evaluated);
    await forgeCall(met, S.evaluated, "land", (c) => ({ ...c, input: { ...c.input, obligations: c.input.obligations.map((o) => (o.id === "obl_build" ? { ...o, met: true } : o)) } }));
    expect((await expectFailure(met, "context-mismatch", S.evaluated)).detail).toMatch(/input\.obligations/);
    const left = prefix(CARRY, S.land);
    await forgeCall(left, S.land, "land", (c) => ({ ...c, input: { ...c.input, obligations: c.input.obligations.filter((o) => o.id !== "obl_build") } }));
    expect((await expectFailure(left, "context-mismatch", S.land)).detail).toMatch(/input\.obligations/);
  });

  test("a land input's reviews (R-POL-7): the carried verdict listed as reviewed here", async () => {
    const log = prefix(CARRY, S.land);
    await forgeCall(log, S.land, "land", (c) => ({ ...c, input: { ...c.input, reviews: c.input.reviews.map((x) => ({ ...x, basis: "here" })) } }));
    expect((await expectFailure(log, "context-mismatch", S.land)).detail).toMatch(/input\.reviews/);
  });

  test("a notify directory's reviewers (R-POL-5): the reviewer who just approved left out", async () => {
    const log = prefix(CARRY, S.notified1);
    await forgeCall(log, S.notified1, "notify", (c) => ({ ...c, directory: { ...c.directory, reviewers: [] } }));
    expect((await expectFailure(log, "context-mismatch", S.notified1)).detail).toMatch(/directory\.reviewers/);
  });

  test("a carry call's input (R-CARRY-1 to R-CARRY-5): a changed path hidden. Without the Git objects those paths are the retained context's: the same falsified paths are accepted, and reported", async () => {
    const log = prefix(CARRY, S.propose2);
    await forgeCall(log, S.propose2, "carry", (c) => ({ ...c, input: { ...c.input, changedSince: ["docs/guide.md"] } }));
    expect((await expectFailure(log, "context-mismatch", S.propose2)).detail).toMatch(/input\.changedSince/);
    const r = await verify(log, { repo: false });
    expect(r.failures.filter((f) => f.seq === S.propose2)).toEqual([]);
    expect(r.limits.some((l) => l.seq === S.propose2 && /paths changed since/.test(l.detail))).toBe(true);
  });

  test("without the Git objects only the undecided part of a land input is the retained context's: a falsified actor still fails, and so does a listed verdict's content", async () => {
    const actor = prefix(PLAIN, 8);
    await forgeCall(actor, 8, "land", (c) => ({ ...c, input: { ...c.input, actor: { ...c.input.actor, role: "admin" } } }));
    expect((await expectFailure(actor, "context-mismatch", 8, { repo: false })).detail).toMatch(/input\.actor/);
    const verdict = prefix(PLAIN, 8);
    await forgeCall(verdict, 8, "land", (c) => ({ ...c, input: { ...c.input, reviews: c.input.reviews.map((r) => ({ ...r, by: { ...r.by, role: "member" } })) } }));
    await expectFailure(verdict, "context-mismatch", 8, { repo: false });
  });

  test("without the Git objects a check carry's new tree is the retained context's, and reported; a falsified evidence field still fails", async () => {
    const log = prefix(CARRY, S.carried);
    await forgeCall(log, S.carried, "carry", (c) => ({ ...c, input: { ...c.input, evidence: { ...c.input.evidence, by: { ...c.input.evidence.by, role: "member" } } } }));
    expect((await expectFailure(log, "context-mismatch", S.carried, { repo: false })).detail).toMatch(/input\.evidence\.by/);
  });

  test("a check on a filtered snapshot with no prepared event: the log does not name the integration it counts for, so a falsified obligation is accepted, and the report says so", async () => {
    const log = prefix(SNAPSHOT, 16);
    await forgeCall(log, 16, "land", (c) => ({ ...c, input: { ...c.input, obligations: c.input.obligations.map((o) => ({ ...o, met: false })) } }));
    const r = await verify(log);
    expect(r.failures).toEqual([]);
    expect(r.limits.map((l) => l.seq)).toEqual([16]);
  });
});

// ============================================= calls a log may not leave out or add

describe("carry calls are derived: one left out is decision-missing, one added is decision-extra", () => {
  test("decision-missing: a propose whose carry call is deleted, where the earlier verdict is owed one", async () => {
    const log = prefix(CARRY, S.propose2);
    setDecisions(log, S.propose2, decisionsAt(log, S.propose2).filter((d) => d.kind !== "carry"));
    expect((await expectFailure(log, "decision-missing", S.propose2)).detail).toMatch(/carry call decides verdicts-carry/);
  });

  test("decision-extra: a carry call recorded for a verdict whose reviewed scope changed, where the evaluator decides nothing", async () => {
    const log = prefix(CARRY, S.t2propose2);
    const require = contextOf(log, decisionsAt(log, S.t2propose2).find((d) => d.kind === "require")!) as Ctx<"require">;
    const review = log.entries[34]!.entry as Extract<LogEntry["entry"], { type: "act" }>;
    // The forger takes thread 1's honest carry call, and claims nothing changed since dave's verdict, so the rule carries it.
    const honest = decisionsAt(log, S.propose2).find((d) => d.kind === "carry")!;
    const last = decisionsAt(log, S.t2propose2).at(-1)!;
    const c = structuredClone(contextOf(log, honest)) as Ctx<"carry">;
    const forged: Ctx<"carry"> = {
      ...c,
      input: {
        ...c.input,
        evidence: { ...c.input.evidence, act: idOf(log, 34) as never, by: { member: "@dave", role: "maintainer", teams: [], delegated: false }, from: { generation: 1, head: (review.act.envelope.body as unknown as { head: never }).head }, scope: ["lib/**"] },
        changedSince: [],
        proposal: require.input.proposal,
      },
      budget: { ...c.budget, start: { steps: 0, inspectedBytes: 0 } },
    };
    const r = await replay({ doc: policyOf(log, last.policy), version: last.policy }, forged);
    expect(r.evaluations.length).toBeGreaterThan(0);
    for (const e of r.evaluations) keep(log, e.context);
    setDecisions(log, S.t2propose2, [...decisionsAt(log, S.t2propose2), ...r.evaluations.map((e) => e.decision)]);
    expect((await expectFailure(log, "decision-extra", S.t2propose2)).detail).toMatch(/recorded where the evaluator decides nothing/);
  });
});

// ========================================================== check-carried

describe("check-carried events are judged (R-CARRY-6 to R-CARRY-14)", () => {
  test("decision-missing: a check recorded as not carried, with no decision, where the tree is identical and a carry rule decides", async () => {
    const log = prefix(CARRY, S.carried);
    const act = eventAt(log, S.carried, "check-carried").act;
    withEvent(log, S.carried, (ev) => ({ ...ev, decisions: [], outcome: { carried: false, notCarried: { act, code: "integration-changed", text: "not carried: the integration tree changed, so the check reruns" } } }));
    await expectFailure(log, "decision-missing", S.carried);
  });

  test("carried-outcome-mismatch: the recorded outcome is not the one the evaluator gives: a volatile check recorded as carried", async () => {
    const log = prefix(CARRY, S.notCarried);
    const reason = (eventAt(log, S.carried, "check-carried").outcome as { reason: unknown }).reason;
    withEvent(log, S.notCarried, (ev) => ({ ...ev, outcome: { carried: true, reason } }));
    await expectFailure(log, "carried-outcome-mismatch", S.notCarried);
  });

  test("decision-extra: a judgement no landing of that version owes: one naming another version's landing, one for a failing check, and one for an obligation the version does not have", async () => {
    const other = prefix(CARRY, S.carried);
    withEvent(other, S.carried, (ev) => ({ ...ev, generation: 1 }));
    expect((await expectFailure(other, "decision-extra", S.carried)).detail).toMatch(/is not a landing of/);

    // Thread 4's failing build check, judged for thread 4's landing on another integration.
    const failing = prefix(CARRY, S.t4evaluated3);
    const check = idOf(failing, 72);
    const t4 = eventAt(failing, S.t4evaluated3, "land-evaluated");
    const lane = (failing.entries[S.t4land]!.entry as Extract<LogEntry["entry"], { type: "act" }>).act.envelope.target as { lane: string; generation: number };
    const template = eventAt(failing, S.notCarried, "check-carried");
    insert(failing, S.t4evaluated3 + 1, {
      type: "system",
      event: { ...template, op: t4.op, lane: lane.lane, generation: lane.generation, integration: template.integration, act: check, policy: idOf(failing, S.activated3), outcome: { carried: false, notCarried: { act: check, code: "volatile-inputs", text: "x" } }, decisions: [] } as never,
    });
    expect((await expectFailure(failing, "decision-extra", S.t4evaluated3 + 1)).detail).toMatch(/not a passing check/);

    // declared-snapshot, third thread: the second version changes only notes and has no check obligation.
    const none = prefix(SNAPSHOT, 22);
    const evaluated = eventAt(none, 22, "land-evaluated");
    const target = (none.entries[21]!.entry as Extract<LogEntry["entry"], { type: "act" }>).act.envelope.target as { lane: string; generation: number };
    const act = idOf(none, 19);
    expect(kindAt(none, 19)).toBe("act:check");
    insert(none, 23, {
      type: "system",
      event: {
        type: "check-carried",
        op: evaluated.op,
        lane: target.lane,
        generation: target.generation,
        integration: evaluated.integration,
        obligation: "obl_tests",
        act,
        policy: idOf(none, 1),
        outcome: { carried: false, notCarried: { act, code: "integration-changed", text: "not carried: the integration tree changed, so the check reruns" } },
        decisions: [],
      } as never,
    });
    expect((await expectFailure(none, "decision-extra", 23)).detail).toMatch(/is not a check obligation of the version/);
  });

  test("guard-failed: a check naming a snapshot the prepared event does not record for its checker (R-CARRY-15, R-DECL-20)", async () => {
    const log = prefix(SNAPSHOT, 10);
    withEvent(log, 9, (ev) => ({ ...ev, snapshots: (ev["snapshots"] as { digest: string }[]).map((x) => ({ ...x, digest: `sha256:${"f".repeat(64)}` })) }));
    await expectFailure(log, "guard-failed", 10);
  });
});

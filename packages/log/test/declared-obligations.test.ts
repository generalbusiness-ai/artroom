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
 *
 * The simulator, as the Room does, seals a `land-evaluated` event only once
 * no blocking obligation is open on the landing's integration. So an honest
 * log has no reservation input that lists an open obligation. What the fold
 * holds open at such a point is shown by a `land-evaluated` event forged
 * there (`evaluatedAt`): verify refuses it and names the obligation
 * (notes/2026-10-03-carry-accounting.md, Rule 1). The last describe block
 * is the witness of that note's rules.
 */

import { describe, expect, test } from "vitest";
import type { LogEntry, PolicyDocumentV2, PolicyVersion, ReplayContext, Sha, SystemEvent } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, carry, policy, replay, requireCheck, requireReview } from "@generalbusiness/artroom-policy";
import { digestJson } from "../src/crypto.ts";
import { type VerifyReason } from "../src/verify.ts";
import { DeclaredRoom, pair, type Fixture } from "./support/declared-room.ts";
import { actAt, contextOf, decisionsAt, forgeCall, insert, keep, open, policyOf, reseal, setDecisions, verify, type Log } from "./support/fixtures.ts";
import { keys } from "./support/room-sim.ts";
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
/** The landing operation the land act at `seq` started. */
const opOf = (log: Log, seq: number) => (actAt(log, seq).receipt as unknown as { effects: { type: string; op?: string }[] }).effects.find((x) => x.type === "land-op")!.op!;
type Obligations = Ctx<"land">["input"]["obligations"];
/** A land input's obligations with `id` said to be met, or not. */
const say =
  (id: string, met: boolean) =>
  (obligations: Obligations): Obligations =>
    obligations.map((o) => (o.id === id ? { ...o, met } : o));

/**
 * Insert at `seq` a `land-evaluated` event for the landing the land act at
 * `landSeq` started, as a room that evaluated the land rules there would
 * seal it: the land act's own input at stage `reservation`, with the
 * obligations `obligations` gives, evaluated under `policy` (the land act's,
 * unless given), on `integration` (the version's head, unless given). The
 * call replays consistently; only the fold shows what it says to be false.
 */
async function evaluatedAt(log: Log, seq: number, landSeq: number, opts: { readonly obligations?: (o: Obligations) => Obligations; readonly policy?: string; readonly integration?: string } = {}): Promise<void> {
  const d = decisionsAt(log, landSeq).find((x) => x.kind === "land")!;
  const c = contextOf(log, d) as Ctx<"land">;
  const version = (opts.policy ?? d.policy) as PolicyVersion;
  const input = { ...c.input, stage: "reservation" as const, obligations: (opts.obligations ?? ((o) => o))(c.input.obligations) };
  const r = await replay({ doc: policyOf(log, version), version }, { ...c, input } as ReplayContext);
  for (const e of r.evaluations) keep(log, e.context);
  insert(log, seq, { type: "system", event: { type: "land-evaluated", op: opOf(log, landSeq), integration: opts.integration ?? input.proposal.head, landInput: digestJson(input), decisions: r.evaluations.map((e) => e.decision) } } as unknown as LogEntry["entry"]);
}

/** Make the land call of the `land-evaluated` event at `seq` say `id` is met, or not, and the event name that input. */
async function forgeEvaluated(log: Log, seq: number, id: string, met: boolean): Promise<void> {
  await forgeCall(log, seq, "land", (c) => ({ ...c, input: { ...c.input, obligations: say(id, met)(c.input.obligations) } }));
  withEvent(log, seq, (ev) => ({ ...ev, landInput: digestJson(landContext(log, seq).input) }));
}

// The entries of declared-carry.json the tests name (scripts/declared-fixtures.ts).
const S = {
  /** Thread 1. */
  review1: 13,
  notified1: 14,
  check1tests: 15,
  recomputed2: 20,
  propose2: 17,
  check2tests: 21,
  land: 23,
  carried: 25,
  notCarried: 26,
  checkBuild: 28,
  evaluatedAll: 29,
  /** Thread 2. */
  t2review1: 33,
  t2propose2: 35,
  /** Thread 3. */
  t3notifiedFirst: 54,
  /** Thread 4. */
  t4checkBuild: 71,
  t4land: 72,
  activated3: 74,
  t4recomputed3: 76,
  t1carried3: 77,
  t1notCarried3: 79,
  t1objection: 82,
  t1objectionNotified: 83,
  /** Thread 5. */
  t5land: 90,
  t5revoked: 92,
  /** Thread 6. */
  t6land: 98,
  t6evaluated: 100,
  t6twoAdmins: 101,
} as const;

// ============================================================ honest logs

describe("honest logs verify, with every input rebuilt from the fold", () => {
  test("declared-carry verifies on a fresh replay with the Git objects, with no proof limit and every decision replayed", async () => {
    const log = open(CARRY);
    const r = await verify(log);
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.verifiedThrough).toBe(106);
    expect(r.limits).toEqual([]);
    expect(r.decisionsReplayed).toBe(log.entries.reduce((n, _e, i) => n + decisionsAt(log, i).length, 0));
  });

  test("what makes that log the witness of each obligation rule: the contexts the simulator recorded in it (R-OBL-1 to R-OBL-7, R-POL-5 to R-POL-7, R-CARRY-1 to R-CARRY-13)", () => {
    const log = open(CARRY);
    expect(Object.fromEntries(Object.entries(S).map(([k, seq]) => [k, kindAt(log, seq)]))).toEqual({
      review1: "act:review",
      notified1: "notified",
      check1tests: "act:check",
      recomputed2: "obligations-recomputed",
      propose2: "act:propose",
      check2tests: "act:check",
      land: "act:land",
      carried: "check-carried",
      notCarried: "check-carried",
      checkBuild: "act:check",
      evaluatedAll: "land-evaluated",
      t2review1: "act:review",
      t2propose2: "act:propose",
      t3notifiedFirst: "notified",
      t4checkBuild: "act:check",
      t4land: "act:land",
      activated3: "policy-activated",
      t4recomputed3: "obligations-recomputed",
      t1carried3: "check-carried",
      t1notCarried3: "check-carried",
      t1objection: "act:review",
      t1objectionNotified: "notified",
      t5land: "act:land",
      t5revoked: "act:roster",
      t6land: "act:land",
      t6evaluated: "land-evaluated",
      t6twoAdmins: "act:roster",
    });
    // The land act on thread 1's second version: the verdict is carried; both checks were made on this version.
    expect(landContext(log, S.land).input.obligations).toEqual([
      { id: "obl_src-review", met: true },
      { id: "obl_tests", met: true },
      { id: "obl_build", met: true },
    ]);
    expect(landContext(log, S.land).input.reviews).toEqual([expect.objectContaining({ act: idOf(log, S.review1), basis: "carried", verdict: "approve" })]);
    // On the landing's integration, another commit: tests is met by the carried check, and build by a check on it.
    // The land rules are evaluated only then, and the only judgement that carried is the tests check's.
    expect(eventAt(log, S.carried, "check-carried")).toMatchObject({ obligation: "obl_tests", act: idOf(log, S.check2tests), outcome: { carried: true } });
    expect(eventAt(log, S.notCarried, "check-carried")).toMatchObject({ obligation: "obl_build", outcome: { carried: false } });
    expect(eventAt(log, S.evaluatedAll, "land-evaluated").integration).toBe(eventAt(log, S.carried, "check-carried").integration);
    expect(landContext(log, S.evaluatedAll).input.obligations).toEqual(landContext(log, S.land).input.obligations);
    // The advisory obligation is the version's, nobody ran its check, and it is never listed (R-OBL-7): the
    // reservation above is evaluated with it open.
    expect(eventAt(log, S.recomputed2, "obligations-recomputed").obligations).toContain("obl_lint");
    expect(log.entries.some((e) => e.entry.type === "act" && (e.entry.act.envelope.body as { check?: string }).check === "lint")).toBe(false);
    expect(obligation(landContext(log, S.land), "obl_lint")).toBeUndefined();
    expect(obligation(landContext(log, S.evaluatedAll), "obl_lint")).toBeUndefined();
    // After the new policy the carry is judged again under it, newest first, as it was under the old one.
    expect(eventAt(log, S.t1carried3, "check-carried")).toMatchObject({ obligation: "obl_tests", policy: idOf(log, S.activated3), outcome: { carried: true } });
    // The new policy also adds an audit checker, whose configuration is the test checker's: nobody has run it.
    expect(obligation(landContext(log, S.t5land), "obl_tests")!.met).toBe(true);
    expect(obligation(landContext(log, S.t5land), "obl_audit")!.met).toBe(false);
    // A failing check meets nothing; a sole admin's own approval meets the admin obligation.
    expect(obligation(landContext(log, S.t4land), "obl_build")!.met).toBe(false);
    expect(obligation(landContext(log, S.t6evaluated), "obl_admin-approval")!.met).toBe(true);
    // A notification sealed after a later review lists the reviewers when its own act was sealed.
    const first = contextOf(log, decisionsAt(log, S.t3notifiedFirst)[0]!) as Ctx<"notify">;
    expect(first.directory.reviewers).toEqual(["@dave"]);
  });

  // The simulator seals no land-evaluated event while an obligation is open, as the Room seals none. What the fold
  // holds open after each of these changes is shown by an event forged there: verify refuses it, naming the obligation.
  test.each([
    {
      name: "after a policy activation a carry judged under the earlier policy no longer counts (R-CARRY-13): a judgement of the check is owed again",
      through: S.t4recomputed3,
      land: S.land,
      onIntegration: true,
      reason: "decision-missing" as const,
      detail: (log: Log) => new RegExp(`obl_tests is open on .* the earlier passing check ${idOf(log, S.check2tests)} has no carry judgement`),
    },
    {
      name: "after it is judged again, the build check on the integration still names the old configuration (R-OBL-3)",
      through: S.t1notCarried3,
      land: S.land,
      onIntegration: true,
      reason: "guard-failed" as const,
      detail: () => /the obligation obl_build is not met/,
    },
    {
      name: "a reviewer the new policy no longer names for lib/** does not meet lib-review",
      through: S.t4recomputed3,
      land: S.t4land,
      onIntegration: false,
      reason: "guard-failed" as const,
      detail: () => /the obligation obl_lib-review is not met/,
    },
    {
      name: "a reviewer's objection here replaces her carried approval",
      through: S.t1objectionNotified,
      land: S.land,
      onIntegration: true,
      reason: "guard-failed" as const,
      detail: () => /the obligation obl_src-review is not met/,
    },
    {
      name: "a check whose key is revoked as compromised stops counting",
      through: S.t5revoked,
      land: S.t5land,
      onIntegration: false,
      reason: "guard-failed" as const,
      detail: () => /the obligation obl_tests is not met/,
    },
    {
      name: "a second active admin ends the sole admin's self-approval (R-ADMIN-2)",
      through: S.t6twoAdmins,
      land: S.t6land,
      onIntegration: false,
      reason: "guard-failed" as const,
      detail: () => /the obligation obl_admin-approval is not met/,
    },
  ])("a land-evaluated event forged where the fold has an obligation open is refused, naming it: $name", async ({ through, land, onIntegration, reason, detail }) => {
    const log = prefix(CARRY, through);
    const active = idOf(log, through >= S.activated3 ? S.activated3 : 19);
    const integration = onIntegration ? eventAt(log, S.carried, "check-carried").integration : undefined;
    await evaluatedAt(log, through + 1, land, { obligations: (o) => o.map((x) => ({ ...x, met: true })), policy: active, ...(integration ? { integration } : {}) });
    expect((await expectFailure(log, reason, through + 1)).detail).toMatch(detail(log));
  });

  test("a land input lists a verdict only while its reviewer qualifies for an obligation of the version (R-POL-7): after a policy names another reviewer for the paths, the first reviewer's approval is not listed", async () => {
    // declared-carry no longer holds such an input: thread 4's landing waits with an obligation open, so no land
    // input is recorded after its policy change. This is the same change on one thread, with a land act after it.
    const dave = pair(7);
    const erin = pair(8);
    const doc = (from: "role:maintainer" | "@erin") => ({ ...policy(requireReview({ paths: "lib/**", from, id: "lib-review" })), format: "artroom-policy-v2", steps: "artroom-steps-v1", acts: CODE_REVIEW_ACTS }) as unknown as PolicyDocumentV2;
    const room = new DeclaredRoom();
    await room.activate(doc("role:maintainer"));
    await room.join("@bob", "member", keys.bob);
    await room.join("@dave", "maintainer", dave);
    await room.join("@erin", "maintainer", erin);
    const claim = await room.act({ signer: keys.bob, kind: "claim", target: null, body: { goal: "The library", scope: ["lib/**"] } });
    const head = room.change({ "lib/util.ts": "export const u = 5;\n" });
    await room.act({ signer: keys.bob, kind: "propose", target: { lane: claim.id }, body: { lease: 1, expectedGeneration: 0, head, summary: "Five" } });
    const review = (signer: typeof dave) => room.act({ signer, kind: "review", target: { lane: claim.id, generation: 1 }, body: { head, verdict: "approve", scope: ["lib/**"], text: "Approved." } });
    await review(dave);
    await room.activate(doc("@erin"));
    await room.recompute();
    await review(erin);
    const land = await room.act({ signer: keys.bob, kind: "land", target: { lane: claim.id, generation: 1 }, body: { lease: 1, head } });
    expect(land.refused).toBe(false);
    const log = open(room.fixture("a reviewer who no longer qualifies"));
    expect(landContext(log, land.entry.seq).input.reviews.map((r) => r.by.member)).toEqual(["@erin"]);
    const r = await verify(log);
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, verifiedThrough: land.entry.seq, limits: [] });
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

  test("declared-snapshot: a check on a snapshot commit counts for the integration a prepared event records it for; a version with no check obligation lists none", async () => {
    const log = open(SNAPSHOT);
    expect(kindAt(log, 9)).toBe("prepared");
    expect(obligation(landContext(log, 11), "obl_tests")!.met).toBe(true);
    expect(landContext(log, 21).input.obligations).toEqual([]);
    // The second thread has no prepared event. The simulator cannot say its check counts for the landing's
    // integration, so it seals no land-evaluated event there: the log ends that thread at the check.
    expect([14, 15, 16].map((seq) => kindAt(log, seq))).toEqual(["act:land", "act:check", "act:claim"]);
    const r = await verify(log);
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.verifiedThrough).toBe(21);
    expect(r.limits).toEqual([]);
  });
});

// ============================================ a recorded context that differs

describe("a recorded context that differs from the one rebuilt from the log is context-mismatch, and names where they differ", () => {
  test("a land act's input lists its obligations (R-POL-6): one said to be met when no check of it was made on the version, and one left out", async () => {
    // Thread 5's land act: nobody ran the build check. (That a check on another integration does not count for a
    // landing's integration is shown at the reservation, in the last describe block: Rule 1 decides there first.)
    const met = prefix(CARRY, S.t5land);
    await forgeCall(met, S.t5land, "land", (c) => ({ ...c, input: { ...c.input, obligations: say("obl_build", true)(c.input.obligations) } }));
    expect((await expectFailure(met, "context-mismatch", S.t5land)).detail).toMatch(/input\.obligations/);
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

  test.each([true, false])(
    "a check on a filtered snapshot with no prepared event: the log does not name the integration it counts for, so a reservation whose land input says the obligation is met (%s) is accepted either way, and the report says so",
    async (met) => {
      // A room before stage 4 seals no prepared event, and knows itself which integration it made the snapshot for:
      // its reservation says the obligation is met. The simulator cannot, so the event is made here. Verify cannot
      // decide the obligation, so it requires nothing of it (Rule 1 leaves it out) and takes `met` from the record.
      const log = prefix(SNAPSHOT, 15);
      await evaluatedAt(log, 16, 14, { obligations: say("obl_tests", met) });
      expect(obligation(landContext(log, 16), "obl_tests")).toEqual({ id: "obl_tests", met });
      const r = await verify(log);
      expect(r.failures).toEqual([]);
      expect(r).toMatchObject({ ok: true, verifiedThrough: 16 });
      expect(r.limits.map((l) => l.seq)).toEqual([16]);
      expect(r.limits[0]).toMatchObject({ reason: "git-unwitnessed" });
      expect(r.limits[0]!.detail).toMatch(/obl_tests counts for .*filtered snapshot with no prepared event/);
    },
  );
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
    const review = log.entries[S.t2review1]!.entry as Extract<LogEntry["entry"], { type: "act" }>;
    // The forger takes thread 1's honest carry call, and claims nothing changed since dave's verdict, so the rule carries it.
    const honest = decisionsAt(log, S.propose2).find((d) => d.kind === "carry")!;
    const last = decisionsAt(log, S.t2propose2).at(-1)!;
    const c = structuredClone(contextOf(log, honest)) as Ctx<"carry">;
    const forged: Ctx<"carry"> = {
      ...c,
      input: {
        ...c.input,
        evidence: { ...c.input.evidence, act: idOf(log, S.t2review1) as never, by: { member: "@dave", role: "maintainer", teams: [], delegated: false }, from: { generation: 1, head: (review.act.envelope.body as unknown as { head: never }).head }, scope: ["lib/**"] },
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
    const failing = prefix(CARRY, S.t4recomputed3);
    const check = idOf(failing, S.t4checkBuild);
    const lane = (failing.entries[S.t4land]!.entry as Extract<LogEntry["entry"], { type: "act" }>).act.envelope.target as { lane: string; generation: number };
    const template = eventAt(failing, S.notCarried, "check-carried");
    insert(failing, S.t4recomputed3 + 1, {
      type: "system",
      event: { ...template, op: opOf(failing, S.t4land), lane: lane.lane, generation: lane.generation, integration: template.integration, act: check, policy: idOf(failing, S.activated3), outcome: { carried: false, notCarried: { act: check, code: "volatile-inputs", text: "x" } }, decisions: [] } as never,
    });
    expect((await expectFailure(failing, "decision-extra", S.t4recomputed3 + 1)).detail).toMatch(/not a passing check/);

    // declared-snapshot, third thread: the second version changes only notes and has no check obligation.
    const none = prefix(SNAPSHOT, 21);
    const evaluated = eventAt(none, 21, "land-evaluated");
    const target = (none.entries[20]!.entry as Extract<LogEntry["entry"], { type: "act" }>).act.envelope.target as { lane: string; generation: number };
    const act = idOf(none, 18);
    expect(kindAt(none, 18)).toBe("act:check");
    insert(none, 22, {
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
    expect((await expectFailure(none, "decision-extra", 22)).detail).toMatch(/is not a check obligation of the version/);
  });

  test("guard-failed: a check naming a snapshot the prepared event does not record for its checker (R-CARRY-15, R-DECL-20)", async () => {
    const log = prefix(SNAPSHOT, 10);
    withEvent(log, 9, (ev) => ({ ...ev, snapshots: (ev["snapshots"] as { digest: string }[]).map((x) => ({ ...x, digest: `sha256:${"f".repeat(64)}` })) }));
    await expectFailure(log, "guard-failed", 10);
  });
});

// ====================================================== carry accounting

describe("a reservation rests only on what the log shows (notes/2026-10-03-carry-accounting.md): no open obligation at land-evaluated, and no check skipped on the way to a carry", () => {
  const bob = keys.bob;
  const carol = pair(6);

  /** Thread 1 of declared-carry through its reservation: tests met by the carry at `S.carried`, build by the check at `S.checkBuild`. */
  const reservation = () => prefix(CARRY, S.evaluatedAll);

  test.each([
    { name: "with no prepared event", prepare: false },
    { name: "with a prepared event for the landing", prepare: true },
  ])("Rule 1, a carry owed: the whole check-carried event that carried removed, and the reservation's land input changed to say the obligation is not met, $name, is decision-missing at the land-evaluated event, naming the check", async ({ prepare }) => {
    const log = reservation();
    let carried: number = S.carried;
    if (prepare) {
      const ev = eventAt(log, S.carried, "check-carried");
      const c = contextOf(log, decisionsAt(log, S.carried)[0]!) as Ctx<"carry">;
      insert(log, S.carried, { type: "system", event: { type: "prepared", owner: { op: ev.op, lane: ev.lane, generation: ev.generation }, integration: ev.integration, base: c.input.proposal.base, tree: c.facts.check!.now.tree, snapshots: [] } } as unknown as LogEntry["entry"]);
      carried++;
    }
    expect(eventAt(log, carried, "check-carried")).toMatchObject({ obligation: "obl_tests", outcome: { carried: true } });
    log.entries.splice(carried, 1);
    reseal(log, carried);
    const at = log.entries.length - 1;
    await forgeEvaluated(log, at, "obl_tests", false);
    expect(landContext(log, at).input.obligations).toEqual([
      { id: "obl_src-review", met: true },
      { id: "obl_tests", met: false },
      { id: "obl_build", met: true },
    ]);
    const f = await expectFailure(log, "decision-missing", at);
    expect(f.detail).toMatch(new RegExp(`obl_tests is open on .* the earlier passing check ${idOf(log, S.check2tests)} has no carry judgement`));
  });

  test("Rule 1, nothing to carry: the check on the integration that met build removed, where each earlier build check is already judged not carried, is guard-failed at the land-evaluated event, naming the obligation; a check on another integration does not count (R-OBL-3)", async () => {
    const log = reservation();
    log.entries.splice(S.checkBuild, 1);
    reseal(log, S.checkBuild);
    const at = log.entries.length - 1;
    await forgeEvaluated(log, at, "obl_build", false);
    expect((await expectFailure(log, "guard-failed", at)).detail).toMatch(/the obligation obl_build is not met on/);
  });

  test("Rule 2: of two earlier passing checks, the newer judged not carried and then the older carried, verifies; with the newer's judgement removed it is decision-missing at the older's, naming the newer check", async () => {
    const RUNNER = `sha256:${"c".repeat(64)}`;
    const config = { format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 600, runner: RUNNER } as const;
    const doc = { ...policy(requireCheck("test", { paths: "src/**", by: "@carol", id: "tests" }), carry({ allow: [{ id: "checks-carry", evidence: "check", allow: "true" }] })), format: "artroom-policy-v2", steps: "artroom-steps-v1", acts: CODE_REVIEW_ACTS } as unknown as PolicyDocumentV2;
    const room = new DeclaredRoom();
    await room.activate(doc, { test: config as never });
    await room.join("@bob", "member", bob);
    await room.join("@carol", "checker", carol);
    const claim = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "The app", scope: ["src/**"] } });
    const propose = (expectedGeneration: number, head: Sha) => room.act({ signer: bob, kind: "propose", target: { lane: claim.id }, body: { lease: 1, expectedGeneration, head, summary: "A version" } });
    const check = async (generation: number, head: Sha) => {
      const r = await room.act({
        signer: carol,
        kind: "check",
        target: { lane: claim.id, generation },
        body: { obligation: "obl_tests", check: "test", integration: head, input: { kind: "tree", tree: room.treeOf(head) }, config: digestJson(config), runner: RUNNER, volatile: false, ok: true, detail: "Passed." },
      });
      expect(r.refused, JSON.stringify((r.entry.entry as { receipt?: unknown }).receipt)).toBe(false);
      return r.id;
    };
    // Three versions: a tree, another tree, and the first tree again. The first two are checked.
    const one = room.change({ "src/app.ts": "export const x = 6;\n" });
    await propose(0, one);
    const older = await check(1, one);
    const two = room.change({ "src/app.ts": "export const x = 7;\n" });
    await propose(1, two);
    const newer = await check(2, two);
    const three = room.recommit(one);
    await propose(2, three);
    const land = await room.act({ signer: bob, kind: "land", target: { lane: claim.id, generation: 3 }, body: { lease: 1, head: three } });
    const op = (land.entry.entry as unknown as { receipt: { effects: { type: string; op?: string }[] } }).receipt.effects.find((x) => x.type === "land-op")!.op!;
    const integration = room.recommit(three);
    await room.carryChecks(op as never, integration, { tree: room.treeOf(integration) });
    await room.land(op as never, true);

    const log = open(room.fixture("two earlier checks: the newer does not carry, the older does"));
    const last = log.entries.length - 1;
    expect(eventAt(log, last - 2, "check-carried")).toMatchObject({ act: newer, outcome: { carried: false, notCarried: { code: "integration-changed" } } });
    expect(eventAt(log, last - 1, "check-carried")).toMatchObject({ act: older, outcome: { carried: true } });
    expect(kindAt(log, last)).toBe("land-evaluated");
    const r = await verify(log);
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, verifiedThrough: last, limits: [] });

    log.entries.splice(last - 2, 1);
    reseal(log, last - 2);
    const f = await expectFailure(log, "decision-missing", last - 2);
    expect(f.detail).toMatch(new RegExp(`the newer passing check ${newer} of obl_tests has no carry judgement`));
  });
});

/**
 * Contract amendment 3, lane L edits (docs/protocol.md section 29.8): the
 * decoder reads `check-carried` events, and verify replays their decisions
 * under the version they name and checks that `act` is an earlier accepted
 * check of the same lane and obligation (R-CARRY-13, R-LOG-10).
 */

import { describe, expect, test } from "vitest";
import type { ActId, LogEntry, Sha } from "@generalbusiness/artroom-contract";
import { carry, policy, rule } from "@generalbusiness/artroom-policy";
import { canonicalize } from "../src/canonical.ts";
import { entryId } from "../src/entries.ts";
import { digestJson } from "../src/crypto.ts";
import { verifyLog } from "../src/verify.ts";
import { DEMO_CHECKERS, DEMO_POLICY, RoomSim, checkBody, keys } from "./support/room-sim.ts";
import { alice, base, expectReason, lines, publishAs, publishLines, reseal } from "./support/logs.ts";

/** The demo policy with one `carry` rule for checks. */
const CARRY = (allow: string) => policy(...DEMO_POLICY.rules.map((r) => rule(r)), carry({ allow: [{ id: "checks-carry", evidence: "check", allow }] }));

/**
 * Entries 0..5 from `base`, then: 6 a policy with a check carry rule, 7 a
 * check on lane 2 (or `checkLane`), for `checkObligation`.
 */
async function room(opts: { allow?: string; checkLane?: 2 | 5; checkObligation?: string } = {}) {
  const sim = await base();
  sim.activate(CARRY(opts.allow ?? "true"), DEMO_CHECKERS); // 6
  const lane = (n: number) => entryId(n, sim.entries[n]!.hash);
  const body = { ...checkBody(), obligation: opts.checkObligation ?? "obl_test" };
  const c = sim.accept(sim.envelope(keys.alice, "check", { lane: lane(opts.checkLane ?? 2), generation: 1 }, body), alice); // 7
  return { sim, lane2: lane(2), check: entryId(c.seq, c.hash) };
}

function eventOf(e: LogEntry) {
  if (e.entry.type !== "system" || e.entry.event.type !== "check-carried") throw new Error("expected a check-carried event");
  return e.entry.event;
}

type CheckCarried = ReturnType<typeof eventOf>;

/** Change the check-carried event at `seq`, and reseal from there. */
function tamper(sim: RoomSim, seq: number, change: (ev: CheckCarried) => CheckCarried): LogEntry[] {
  const entries = [...sim.entries];
  entries[seq] = { ...entries[seq]!, entry: { type: "system", event: change(eventOf(entries[seq]!)) } };
  return reseal(entries, seq);
}

describe("edit 1: the decoder reads check-carried events", () => {
  test("a signed check with no input, or no integration, is malformed at its entry: a named failure with the verified prefix, with replay on and off, never a throw", async () => {
    for (const drop of ["input", "integration"] as const) {
      const sim = await base();
      sim.activate(CARRY("true"), DEMO_CHECKERS); // 6
      const lane = entryId(2, sim.entries[2]!.hash);
      const body: Record<string, unknown> = { ...checkBody(), obligation: "obl_test" };
      delete body[drop];
      sim.accept(sim.envelope(keys.alice, "check", { lane, generation: 1 }, body as never), alice); // 7
      for (const replayDecisions of [true, false]) {
        const r = await verifyLog(await publishAs(sim, sim.entries), { replayDecisions });
        expect(r.failures[0], `${drop}, replay ${replayDecisions}`).toMatchObject({ reason: "malformed", seq: 7 });
        expect(r.failures[0]!.detail).toContain(`body.${drop}`);
        expect(r.verifiedThrough).toBe(6);
      }
    }
  });

  test("a check-carried event with decisions verifies, and its decisions are replayed", async () => {
    const { sim, lane2, check } = await room();
    await sim.checkCarried(check, lane2); // 8
    const ev = eventOf(sim.entries[8]!);
    expect(ev.outcome).toMatchObject({ carried: true, reason: { code: "tree-identical" } });
    expect(ev.decisions.map((d) => [d.rule, d.outcome])).toEqual([["checks-carry", { result: "carry", evidence: check }]]);
    const r = await verifyLog(await publishAs(sim, sim.entries));
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, verifiedThrough: 8 });
    expect(r.decisionsReplayed).toBeGreaterThanOrEqual(ev.decisions.length);
  });

  test("a check-carried event without its decisions: malformed", async () => {
    const { sim, lane2, check } = await room();
    await sim.checkCarried(check, lane2); // 8
    const l = lines(sim.entries);
    const { decisions: _d, ...rest } = eventOf(sim.entries[8]!);
    l[8] = canonicalize({ ...sim.entries[8]!, entry: { type: "system", event: rest } });
    const r = await expectReason(await publishLines(sim, l), "malformed", 8);
    expect(r.failures[0]!.detail).toMatch(/decisions is not an array/);
  });

  test("a check-carried outcome whose carried is not a boolean: malformed", async () => {
    const { sim, lane2, check } = await room();
    await sim.checkCarried(check, lane2); // 8
    const l = lines(sim.entries);
    const ev = eventOf(sim.entries[8]!);
    l[8] = canonicalize({ ...sim.entries[8]!, entry: { type: "system", event: { ...ev, outcome: { ...ev.outcome, carried: "yes" } } } });
    const r = await expectReason(await publishLines(sim, l), "malformed", 8);
    expect(r.failures[0]!.detail).toMatch(/outcome.carried is not a boolean/);
  });
});

describe("edit 2: verify replays each check-carried event and checks the check it names (R-CARRY-13, R-LOG-10)", () => {
  test("a carry rule that refuses: notCarried policy-rejected, and the no-carry decision replays", async () => {
    const { sim, lane2, check } = await room({ allow: "false" });
    await sim.checkCarried(check, lane2); // 8
    const ev = eventOf(sim.entries[8]!);
    expect(ev.outcome).toMatchObject({ carried: false, notCarried: { code: "policy-rejected", act: check } });
    expect(ev.decisions.map((d) => d.outcome)).toEqual([{ result: "no-carry", evidence: check }]);
    expect(await verifyLog(await publishAs(sim, sim.entries))).toMatchObject({ ok: true, verifiedThrough: 8 });
  });

  test("a carry naming a later check: carried-unknown", async () => {
    // Entry 8 names entry 9, a check of the same lane and obligation. A
    // forward reference can match the 8 hex digits of a later hash only by
    // grinding, so the test forges entry 9's hash field to match; verify
    // must stop at entry 8 on the order, before it reaches entry 9's hash.
    const { sim, lane2 } = await room();
    const later = "act_9_0123abcd" as ActId;
    await sim.checkCarried(later, lane2); // 8
    sim.accept(sim.envelope(keys.alice, "check", { lane: lane2, generation: 1 }, checkBody()), alice); // 9
    sim.entries[9] = { ...sim.entries[9]!, hash: `sha256:0123abcd${"0".repeat(56)}` };
    const r = await expectReason(await publishAs(sim, sim.entries), "carried-unknown", 8);
    expect(r.failures[0]!.detail).toContain(later);
  });

  test("a carry naming a check of another lane: carried-mismatch", async () => {
    const { sim, lane2, check } = await room({ checkLane: 5 });
    await sim.checkCarried(check, lane2); // 8
    const r = await expectReason(await publishAs(sim, sim.entries), "carried-mismatch", 8);
    expect(r.failures[0]!.detail).toContain(`check-carried names lane ${lane2}`);
  });

  test("a carry naming a check for another obligation: carried-mismatch", async () => {
    const { sim, lane2, check } = await room({ checkObligation: "obl_other" });
    await sim.checkCarried(check, lane2); // 8
    const r = await expectReason(await publishAs(sim, sim.entries), "carried-mismatch", 8);
    expect(r.failures[0]!.detail).toContain("for obl_other");
  });

  test("a carry naming an act that is not an accepted check: carried-unknown", async () => {
    const { sim, lane2 } = await room();
    await sim.checkCarried(lane2, lane2); // 8: names the claim
    await expectReason(await publishAs(sim, sim.entries), "carried-unknown", 8);
  });

  test("a decision that differs on replay: policy-decision-mismatch", async () => {
    const { sim, lane2, check } = await room();
    await sim.checkCarried(check, lane2); // 8
    const ev = eventOf(sim.entries[8]!);
    const [d] = ev.decisions;
    const wrong = { ...d!, outcome: { result: "no-carry" as const, evidence: check } };
    const entries = [...sim.entries];
    entries[8] = { ...entries[8]!, entry: { type: "system", event: { ...ev, decisions: [wrong] } } };
    const r = await expectReason(await publishAs(sim, reseal(entries, 8)), "policy-decision-mismatch", 8);
    expect(r.failures[0]!.detail).toMatch(/recorded .*no-carry.*replayed .*"carry"/);
  });

  test("a carry naming a version no policy-activated event activated: policy-version-mismatch", async () => {
    const { sim, lane2, check } = await room({ allow: "false" });
    await sim.checkCarried(check, lane2, "obl_test", check); // 8: names the check as the version
    const r = await expectReason(await publishAs(sim, sim.entries), "policy-version-mismatch", 8);
    expect(r.failures[0]!.detail).toMatch(/no earlier policy-activated event/);
  });

  test("the decisions are replayed under the version the event names, not the active one", async () => {
    const { sim, lane2, check } = await room();
    const v6 = sim.policy;
    sim.activate(CARRY("false"), DEMO_CHECKERS); // 8: a newer version that refuses
    const now = sim.policy;
    sim.policy = v6;
    await sim.checkCarried(check, lane2); // 9: judged and named under v6
    sim.policy = now;
    expect(eventOf(sim.entries[9]!).outcome.carried).toBe(true);
    const r = await verifyLog(await publishAs(sim, sim.entries));
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, verifiedThrough: 9 });
  });
});

describe("the outcome agrees with the replayed decisions (R-CARRY-13)", () => {
  const notCarried = (act: ActId) => ({ carried: false as const, notCarried: { act, code: "policy-rejected" as const, text: "not carried" } });

  test("carried with no decisions, when only platform conditions applied, verifies", async () => {
    // The demo policy has no carry rule, so the honest event records none (R-CARRY-13).
    const sim = await base();
    const lane2 = entryId(2, sim.entries[2]!.hash);
    const c = sim.accept(sim.envelope(keys.alice, "check", { lane: lane2, generation: 1 }, checkBody()), alice); // 6
    await sim.checkCarried(entryId(c.seq, c.hash), lane2); // 7
    const ev = eventOf(sim.entries[7]!);
    expect(ev.outcome.carried).toBe(true);
    expect(ev.decisions).toEqual([]);
    const r = await verifyLog(await publishAs(sim, sim.entries));
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, verifiedThrough: 7 });
  });

  test("carried while the decisions refuse: carried-outcome-mismatch", async () => {
    const { sim, lane2, check } = await room({ allow: "false" });
    await sim.checkCarried(check, lane2); // 8
    const reason = { code: "tree-identical" as const, tree: "b".repeat(40) as Sha, config: digestJson(DEMO_CHECKERS["test"]), runner: `sha256:${"c".repeat(64)}` as const, text: "carried" };
    const r = await expectReason(await publishAs(sim, tamper(sim, 8, (ev) => ({ ...ev, outcome: { carried: true, reason } }))), "carried-outcome-mismatch", 8);
    expect(r.failures[0]!.detail).toMatch(/checks-carry decided no-carry/);
  });

  test("not carried while every decision allows the carry: carried-outcome-mismatch", async () => {
    const { sim, lane2, check } = await room();
    await sim.checkCarried(check, lane2); // 8
    const r = await expectReason(await publishAs(sim, tamper(sim, 8, (ev) => ({ ...ev, outcome: notCarried(check) }))), "carried-outcome-mismatch", 8);
    expect(r.failures[0]!.detail).toMatch(/every carry rule decision allows it/);
  });

  test("notCarried.act differing from act: carried-outcome-mismatch", async () => {
    const { sim, lane2, check } = await room({ allow: "false" });
    await sim.checkCarried(check, lane2); // 8
    const r = await expectReason(await publishAs(sim, tamper(sim, 8, (ev) => ({ ...ev, outcome: notCarried(lane2) }))), "carried-outcome-mismatch", 8);
    expect(r.failures[0]!.detail).toContain(`notCarried names ${lane2}`);
  });

  test("a decision whose evidence is another check: carried-outcome-mismatch", async () => {
    const { sim, lane2, check } = await room();
    const other = sim.accept(sim.envelope(keys.alice, "check", { lane: lane2, generation: 1 }, checkBody()), alice); // 8: the same lane and obligation
    await sim.checkCarried(check, lane2); // 9: judged for the check at 7
    const r = await expectReason(await publishAs(sim, tamper(sim, 9, (ev) => ({ ...ev, act: entryId(other.seq, other.hash) }))), "carried-outcome-mismatch", 9);
    expect(r.failures[0]!.detail).toContain(`names evidence ${check}`);
  });
});

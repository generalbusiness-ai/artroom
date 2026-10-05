import { describe, expect, test } from "vitest";
import type { Observation, ObservationUse } from "@generalbusiness/artroom-contract";
import { MISMATCHES, MemoryState, WINDOWS, actionsOf, agrees, covers, headsOf, highestHead, judgeGrant, observationOf, prefer, windowOf, type GrantAsked, type GrantJudgment, type RoleTable } from "../src/index.ts";
import { d, keys, laneDefinition, membership, otherLane, t } from "./fixtures.ts";

const { rita, una } = keys;

/** A made-up role table, as data: the membership scope's value at one head. */
const ROLES: RoleTable = { member: ["issue.comment", "issue.open"], checker: ["change.check"] };

/** One fixture: rita's key, active, read at membership's head 40 when the lane's clock read T0, as read 7 of run r1, and used by no entry yet. */
const standing: Observation = {
  of: membership, head: { seq: 40, hash: d("4") }, key: rita.key, keyState: "active", member: "@rita", memberState: "active", role: "member", actions: actionsOf(ROLES, "member"),
  within: { membership }, controller: null, controllerActive: null, notAfter: null, definition: "platform:membership@1", at: t(0),
};
/** The membership scope of another repository, and the same membership scope in another incarnation. */
const elsewhere = { ...membership, scope: otherLane.scope };
const reborn = { ...membership, inc: otherLane.inc };
const fresh: ObservationUse = { observation: standing, read: { run: "r1", n: 7 }, use: "fresh", prior: null };
const at = (seconds: number) => ({ reading: t(seconds), behind: false, asOf: t(seconds) });
const asked: GrantAsked = { scope: otherLane, membership, key: rita.key, action: "issue.comment", window: WINDOWS.ordinary, clock: at(299), last: null, highest: null };

/** Entry 5 of the lane, written at T0 + 10 s, retains read 7. */
const prior = { seq: 5, hash: d("5") };
const reused: ObservationUse = { ...fresh, use: "reused", prior };
const last = { entry: prior, time: t(10), observation: standing };
const of = (change: Partial<Observation>, use: ObservationUse = fresh): ObservationUse & { observation: Observation } => ({ ...use, observation: { ...standing, ...change } });
const said = (judged: GrantJudgment) => (judged.result === "current" ? "current" : `${judged.result}: ${judged.failed}`);

describe("the grant guard and the commit guards of an observation (authority note, section 3.3; section 16.1; T45)", () => {
  test("one table: the window and its edge, whose answer it is, a revocation, the role's actions, a reuse, and the order of heads", () => {
    const cases: readonly (readonly [name: string, use: ObservationUse, asked: Partial<GrantAsked>, expected: string])[] = [
      ["inside the window, one second before its end", fresh, {}, "current"],
      ["at the edge: an age equal to the window is outside it", fresh, { clock: at(300) }, "authority-unavailable: age"],
      ["outside the window", fresh, { clock: at(301) }, "authority-unavailable: age"],
      ["a reading earlier than the read began proves nothing", fresh, { clock: at(-1) }, "authority-unavailable: age"],
      ["a ten-second kind, at its edge", fresh, { window: WINDOWS.once, clock: at(10) }, "authority-unavailable: age"],
      ["the wrong key: an observation of rita's key is no grant to una's", fresh, { key: una.key }, "unauthorized: key"],
      ["the wrong incarnation of membership", of({ of: { ...membership, inc: otherLane.inc } }), {}, "authority-unavailable: of"],
      // Section 16.1, "How a scope is covered"; witness 18.40. A filter covers a scope exactly when its `membership` is the reference
      // that the scope itself records, with that incarnation. The lane records `membership`, and the answer above names it.
      ["`within` names the membership scope of another repository", of({ within: { membership: elsewhere } }), {}, "unauthorized: within"],
      ["`within` names this membership scope in another incarnation", of({ within: { membership: reborn } }), {}, "unauthorized: within"],
      ["the same answer, in a scope that records another membership scope: it is no observation of that scope's own", fresh, { membership: elsewhere }, "authority-unavailable: of"],
      ["`within` is this scope's own reference, which covers the one scope it names", of({ within: otherLane as never }), {}, "current"],
      ["`within` is the reference of another scope", of({ within: membership as never }), {}, "unauthorized: within"],
      ["`within` is a filter with a member added: no filter, so it covers nothing", of({ within: { membership, task: 4 } as never }), {}, "unauthorized: within"],
      ["revoked as retired: refused, also long past the window", of({ keyState: "retired" }), { clock: at(9000) }, "unauthorized: revoked"],
      ["the member removed", of({ memberState: "removed" }), {}, "unauthorized: revoked"],
      ["a key that membership does not hold", of({ keyState: "unknown" }), {}, "unauthorized: key-state"],
      ["a role without the grant", of({ role: "checker", actions: actionsOf(ROLES, "checker") }), {}, "unauthorized: action"],
      ["a grant's end time, at its bound", of({ notAfter: t(299) }), {}, "unauthorized: not-after"],
      ["an agent whose controller is not active signs a comment", of({ controller: "@paul", controllerActive: false }), {}, "current"],
      ["and is refused another action", of({ controller: "@paul", controllerActive: false }), { action: "issue.open" }, "unauthorized: controller"],
      ["reused at a later reading, with the entry that retains the read as `prior`", reused, { last }, "current"],
      ["reused at an equal reading: the clock has not moved", reused, { last, clock: at(10) }, "authority-unavailable: moved"],
      ["marked `fresh`, though an earlier entry retains the read", fresh, { last }, "authority-unavailable: use"],
      ["marked `reused`, though no earlier entry retains the read", reused, {}, "authority-unavailable: use"],
      ["a ten-second kind that is reused", reused, { last, window: WINDOWS.once, clock: at(11) }, "authority-unavailable: once"],
      ["an older head after a newer one is retained", fresh, { highest: 41 }, "authority-unavailable: older"],
      ["the same head as the one retained", fresh, { highest: 40 }, "current"],
      // Section 5.3: no act is written on a clock that is behind, so the reading judges no age. The judge answers `clock-behind`.
      ["the clock behind the history", fresh, { clock: { reading: t(-5), behind: true, asOf: t(20) } }, "current"],
    ];
    expect(cases.map(([name, use, change]) => [name, said(judgeGrant(use, { ...asked, ...change }))])).toEqual(cases.map(([name, , , expected]) => [name, expected]));

    // The grant is built from the observation, and retains it as its proof. A grant that says more than its observation does not agree.
    const judged = judgeGrant(fresh, asked);
    const grant = { issued: { at: membership, seq: 40, hash: d("4") }, subject: rita.member, key: rita.key, principal: null, actions: ["issue.comment", "issue.open"], within: { membership }, notAfter: null, fresh };
    expect(judged).toEqual({ result: "current", grant });
    expect([agrees(grant), agrees({ ...grant, actions: [...grant.actions, "change.merge"] })]).toEqual([true, false]);
    // What a replay calls a history that holds an entry with each failed guard.
    expect(MISMATCHES).toEqual({ once: "observation-reused", moved: "observation-not-moved", older: "observation-older" });
  });

  test("the window is the definition's: an act that opens a hold is a ten-second kind; a revoked answer stays; and an answer that is not a whole standing is none", () => {
    const window = (kind: Parameters<typeof windowOf>[1], act: string) => windowOf(laneDefinition, kind, act);
    expect([window("lane", "take-hold"), window("lane", "remark"), window("directory", "remark"), window("destination", "remark"), window("lane", "no-such-act")])
      .toEqual([WINDOWS.once, WINDOWS.ordinary, WINDOWS.ordinary, null, null]);

    const held = { observation: standing };
    const retired = of({ keyState: "retired", head: { seq: 44, hash: d("6") } });
    const older = of({ head: { seq: 39, hash: d("3") } });
    const newer = of({ head: { seq: 41, hash: d("7") } });
    // A revoked answer discards what was held, and nothing that arrives later replaces it. Otherwise the higher head stays.
    expect([prefer(held, retired), prefer(retired, newer), prefer(held, older), prefer(held, newer), prefer(null, older)]).toEqual([retired, retired, held, newer, older]);

    const { at: began, ...answer } = standing;
    expect([observationOf(answer, began), observationOf({ ...answer, extra: 1 }, began), observationOf({ ...answer, keyState: "fine" }, began), observationOf({ ...answer, of: otherLane }, began)]).toEqual([standing, null, null, null]);
    // Section 16.1: in an answer `within` is a filter whose `membership` equals `of`. A scope reference, another membership scope
    // and a filter with a member added are each no answer. The answer names no asker: one answer serves every scope of the repository.
    expect([otherLane, { membership: elsewhere }, { membership, task: 4 }].map((within) => observationOf({ ...answer, within }, began))).toEqual([null, null, null]);
    // Section 16.1, "The fold holds the highest head": a retained observation of a key counts under its key and under its member,
    // of its observed scope. Another key of that member meets the same head, and a key of another member meets none. A grant with
    // no proof retains nothing, and a state that holds no head has no member for them.
    const state = new MemoryState();
    for (const head of headsOf(fresh)) state.putObserved(head);
    expect([highestHead(state, standing), highestHead(state, { ...standing, key: una.key }), highestHead(state, { ...standing, key: una.key, member: "@una" }), highestHead(state, { ...standing, of: reborn })]).toEqual([40, 40, null, null]);
    expect([Object.keys(state.all()).at(-1), "observed" in new MemoryState().all(), headsOf(null)]).toEqual(["observed", false, []]);
    // A scope with no recorded membership reference is covered by no filter, and by its own reference.
    expect([covers({ membership }, otherLane, null), covers(otherLane, otherLane, null), covers({ membership }, otherLane, membership), covers({ membership }, membership, membership)]).toEqual([false, true, true, true]);
  });
});

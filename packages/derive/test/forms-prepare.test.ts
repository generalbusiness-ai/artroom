import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { SignedIntent } from "@generalbusiness/artroom-contract";
import { intentDigest, isSealed } from "@generalbusiness/artroom-bytes";
import { clockOf, judgePreparation, preparationStatus } from "../src/index.ts";
import type { GrantDecision, PreparationWindow, Steps } from "../src/index.ts";
import { Scope, grantOf, keys, laneDefinition, otherLane, t } from "./fixtures.ts";

const { una, vic } = keys;

/**
 * Made-up step rules, for this test only: a stand-in for the rules of
 * `hold@1`, which `forms-records.test.ts` tests. `instance` makes one record
 * and opens one operation. `stage` is refused by a named guard. `token`
 * names no action. `retry` has no code. It shows the judge of a preparation
 * and nothing about a real step.
 */
const steps: Steps = {
  implements: (_capability, step) => step !== "retry",
  grant: (_capability, step) => (step === "token" ? null : { action: "hold", window: step === "check" ? "ordinary" : "ten-seconds" }),
  derive: (_capability, step, given) => (step === "stage"
    ? { refused: { reason: "capability-refused", name: "not-staged" } }
    : { records: [{ kind: "instance", key: [0, "i1"], state: "current", values: { by: given.signer.member } }], opens: [{ owner: "hold@1", kind: "mint", attempts: 1 }] }),
};

describe("a preparation (scope contract, section 5.5), with stand-in step rules", () => {
  const s = new Scope(laneDefinition);                            // entries 0 and 1
  const grant = grantOf(una, s.at, ["hold"]);
  const windows: PreparationWindow[] = [];
  const granted: GrantDecision = ({ window }) => { windows.push(window); return { result: "granted", grant }; };
  const ask = (signed: SignedIntent, step = "instance", over: { capability?: string; steps?: Steps | null; granted?: GrantDecision; reading?: string } = {}) =>
    judgePreparation(s.state, laneDefinition, { signed, capability: over.capability ?? "hold@1", step }, { clock: clockOf(s.state, over.reading ?? s.now), bounds: PROPOSED_BOUNDS, steps: over.steps === undefined ? steps : over.steps, granted: over.granted ?? granted });
  const said = (j: ReturnType<typeof ask>) => [j.result, "reason" in j ? j.reason : "", "name" in j ? j.name : ""].filter((part) => part !== "").join(" ");
  const signed = s.intent(una, "take-hold");

  test("a step is sealed as one entry with the signed intent, the one grant judged, the capability and the step; it derives records and operations and nothing else; the same three again write nothing; the act's key is not consumed", () => {
    const first = ask(signed);
    if (first.result !== "write") throw new Error(`not written: ${JSON.stringify(first)}`);
    const entry = s.seal(first.draft);
    expect([entry.input, entry.effects, entry.sends, entry.uses, isSealed(s.entries.at(-1))]).toEqual([
      { type: "preparation", signed, authority: [grant], capability: "hold@1", step: "instance" },
      [
        { effect: "record", capability: "hold@1", kind: "instance", key: [0, "i1"], state: "current", values: { by: una.member } },
        { effect: "operation", k: 0, owner: "hold@1", kind: "mint", attempts: 1 },
        { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null },
      ],
      [], [], true,
    ]);
    // Section 5.5, "A repeat": the index answers the same intent, capability and step with the first entry, also after `notAfter`.
    // Another step of the same intent is another entry's to prepare, and the intent's own turn is still to come.
    expect([ask(signed), ask(signed, "instance", { reading: t(3600) }), said(ask(signed, "stage")), s.state.accepted(una.key, signed.intent.idempotencyKey)])
      .toEqual([{ result: "repeat", seq: 2 }, { result: "repeat", seq: 2 }, "refused capability-refused not-staged", null]);
    // Section 9.1: what a settlement, a later act and a later outcome find of the intent's preparation, from the index and the state.
    expect(preparationStatus(s.state, s.own, intentDigest(signed.intent))).toEqual([{
      entry: s.fact(2), capability: "hold@1", step: "instance",
      operations: [{ operation: "2:0", kind: "mint", state: "pending" }], records: [{ kind: "instance", key: [0, "i1"], state: "current" }],
    }]);
    // The index and the record are members of the folded state. A state that holds neither has the members it had before they
    // existed, and no other, so its canonical bytes and its digest are what they were.
    expect([preparationStatus(s.state, s.own, intentDigest(s.intent(una, "take-hold").intent)), s.replay().snapshot() === s.state.snapshot(), Object.keys(s.state.all()).slice(-2), Object.keys(s.replay(2).all())])
      .toEqual([[], true, ["prepared", "records"], ["v", "scope", "items", "counts", "relations", "accepted", "requests", "decided", "creations", "operations", "texts"]]);
  });

  test("a refusal is an answer and no entry: each check, in the order of an act's, with the window that the step asks of its grant", () => {
    const elsewhere = s.intent(una, "take-hold", { to: otherLane });
    const fresh = () => s.intent(una, "take-hold");
    windows.length = 0;
    const head = s.head;
    expect([
      said(ask(fresh(), "job-read", { capability: "git-read@1" })),                 // a capability that the definition does not list
      said(ask(fresh(), "walk")),                                                    // a step that the version does not declare
      said(ask(elsewhere)),                                                          // `instance` is not `foreign`
      said(ask(elsewhere, "stage")),                                                 // `stage` is: the scope that owns the hold judges it
      said(ask(fresh(), "instance", { reading: t(60) })),                            // at `notAfter`
      said(ask(fresh(), "retry")), said(ask(fresh(), "instance", { steps: null })),  // no code for the step: nothing is judged
      said(ask(fresh(), "token")),                                                   // the rules name no action
      said(ask(fresh(), "instance", { granted: () => ({ result: "refused" }) })),
      said(ask(fresh(), "instance", { granted: () => ({ result: "unavailable" }) })),
      said(ask(fresh(), "instance", { granted: () => ({ result: "granted", grant: grantOf(vic, s.at, ["hold"]) }) })),   // a grant to another key
      said(ask(fresh(), "instance", { reading: t(-5) })),                            // a reading before the previous entry's time
    ]).toEqual([
      "refused bad-field", "refused bad-field", "refused misaddressed", "refused capability-refused not-staged", "refused expired",
      "unavailable unavailable", "unavailable unavailable", "refused unauthorized", "refused unauthorized", "unavailable authority-unavailable", "refused unauthorized",
      "unavailable clock-behind",
    ]);
    expect([windows.slice(0, 1), (ask(fresh(), "check"), windows.at(-1)), s.head]).toEqual([["ten-seconds"], "ordinary", head]);
  });
});

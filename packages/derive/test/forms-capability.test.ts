import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { isSealed } from "@generalbusiness/artroom-bytes";
import { derivable, validateDefinition, type Capabilities, type ProblemCode } from "../src/index.ts";
import { Scope, keys, laneDefinition, on, small, smallDefinition, variant } from "./fixtures.ts";

const { rita } = keys;
/* eslint-disable @typescript-eslint/no-explicit-any */
type Change = (d: any) => void;
const [C1, C2] = ["a".repeat(40), "b".repeat(40)];
const act = (a: object) => ({ step: "transition", on: "note", grant: "edit", also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [], ...a });

/**
 * The small definition, with the two capabilities listed and each
 * capability form once: a guard of each, with an operand, a value for each
 * element of a list and a slot of each item of a range as arguments; an
 * effect; and a part that reads a record another entry carries.
 */
const staging = variant(small, (def) => {
  def.capabilities = [{ name: "hold", version: 1 }, { name: "git-read", version: 1 }];
  def.acts.stage = act({
    fields: { commit: { type: "commit", required: true }, earlier: { type: "list", of: { type: "commit" }, max: 4, required: false } },
    guards: [
      { state: ["draft"] },
      { capability: { name: "hold", guard: "staged", with: { commit: { field: "commit" }, under: { item: "on" } } } },
      { capability: { name: "git-read", guard: "ancestry", with: {
        commit: { field: "commit" }, row: { const: "report" },
        selected: { each: { field: "earlier" }, as: "c", value: { element: "c" } }, earlier: { items: { type: "note", states: ["draft"] }, slot: "text" },
      } } },
    ],
    effects: [{ capability: { name: "hold", do: "pin-hold", with: { commit: { field: "commit" } } } }, { value: { slot: "text", from: { const: "staged" } } }],
  });
  def.acts.check = act({
    fields: { pin: { type: "fact", kind: ["stage"], under: "small", required: true } },
    guards: [{ equals: { a: { field: "pin", part: { carried: "pin.commit" } }, b: { const: C1 } }, reason: "pin-mismatch" }],
  });
  def.acts.ask = act({ guards: [{ capability: { name: "hold", guard: "staged", with: {} } }] });
});

/**
 * A stand-in for a capability's code, for this test only: it answers each
 * guard from a table, records one pin for every effect, and keeps what it
 * was asked. It proves nothing about a real hold or a real Git read.
 */
function standIn(answers: Record<string, string> = {}): Capabilities & { asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    asked,
    implements: () => true,
    guard: (capability, guard, args) => { asked.push([capability, guard, args]); return answers[guard] ?? true; },
    effect: (_capability, _effect, args) => [{ kind: "pin", key: [args["commit"] as string], state: "held", values: { commit: args["commit"] } }],
  };
}

describe("capability forms (section 6.11), with a stand-in for the capability's code", () => {
  test("a capability guard is asked with the arguments the definition writes, its refusal carries the capability's name, an effect's records follow the written effects, and a part reads a record that an entry carries", () => {
    const s = new Scope(staging);                              // entries 0 and 1; note 0 is rita's, a draft
    const stage = { ...on(s, 0), fields: { commit: C1, earlier: [C2] } };
    const said = (capabilities?: Capabilities) => {
      const judgment = s.judge(s.intent(rita, "stage", stage), { capabilities });
      return [judgment.result, "reason" in judgment ? judgment.reason : "", "name" in judgment ? judgment.name : ""];
    };
    // With no code for the capability the input is not judged: neither for an effect, nor for a guard alone. A guard that does
    // not hold is `capability-refused`, by the name its capability declares.
    expect([said(), s.judge(s.intent(rita, "ask", on(s, 0))), said(standIn({ ancestry: "unnamed-work" })), said(standIn({ staged: "not-staged" }))])
      .toEqual([["unavailable", "unavailable", ""], { result: "unavailable", reason: "unavailable" }, ["refused", "capability-refused", "unnamed-work"], ["refused", "capability-refused", "not-staged"]]);

    const rules = standIn();
    expect(s.act(rita, "stage", stage, { capabilities: rules }).result).toBe("write");
    // An operand, one value for each element of a list, and one slot of each item the range covers: note 0, whose text was empty.
    expect(rules.asked).toEqual([
      ["hold@1", "staged", { commit: C1, under: 0 }],
      ["git-read@1", "ancestry", { commit: C1, row: "report", selected: [C2], earlier: [null] }],
    ]);
    // The capability's own effect is recorded after the written ones, and the fold keeps the record as that entry states it.
    expect(s.last.effects).toEqual([
      { effect: "value", item: 0, slot: "text", value: "staged" },
      { effect: "record", capability: "hold@1", kind: "pin", key: [C1], state: "held", values: { commit: C1 } },
    ]);
    expect([isSealed(s.entries.at(-1)), s.replay().snapshot() === s.state.snapshot(), s.state.record("hold@1", "pin", [C1])]).toEqual([true, true, { capability: "hold@1", kind: "pin", key: [C1], state: "held", values: { commit: C1 }, seq: s.last.seq }]);

    // `carried` reads a member of the one record of that kind that the named entry's effects hold. An entry with no such record has none.
    const reads = (seq: number) => {
      const judgment = s.judge(s.intent(rita, "check", { ...on(s, 0), fields: { pin: s.fact(seq) } }));
      return [judgment.result, "name" in judgment ? judgment.name : ""];
    };
    expect([reads(s.last.seq), reads(1)]).toEqual([["write", ""], ["refused", "pin-mismatch"]]);
  });

  test("the validator checks each form against what the listed version declares, and a valid definition lists the forms that need a capability's own code", () => {
    // What this package reads and does not derive by itself, in the order read. A runtime with no code for them cannot run the definition.
    expect(staging.underived).toEqual([
      { path: "capabilities.1", capability: "git-read@1", form: "listed", name: "git-read@1" },
      { path: "acts.stage.guards.1.capability", capability: "hold@1", form: "guard", name: "staged" },
      { path: "acts.stage.guards.2.capability", capability: "git-read@1", form: "guard", name: "ancestry" },
      { path: "acts.stage.effects.0.capability", capability: "hold@1", form: "effect", name: "pin-hold" },
      { path: "acts.check.guards.0.equals.a.part.carried", capability: "hold@1", form: "carried", name: "pin.commit" },
      { path: "acts.ask.guards.0.capability", capability: "hold@1", form: "guard", name: "staged" },
    ]);
    // A definition that lists `hold@1` for its item form alone needs none, and neither does one that lists no capability.
    expect([derivable(staging, null), derivable(staging, standIn()), derivable(laneDefinition, null), derivable(smallDefinition, null)]).toEqual([false, true, true, true]);

    const stage = (def: any) => def.acts.stage;
    const step = (kind: string) => ({ type: "fact", kind: [kind], under: "lane", required: false });
    const rows: readonly (readonly [string, Change, ProblemCode | null])[] = [
      ["a fact type whose kind is a step of a listed version passes", (def) => { def.acts.check.fields.other = step("hold@1:check"); }, null],
      ["a kind that names no step of that version", (def) => { def.acts.check.fields.other = step("hold@1:walk"); }, "capability"],
      ["a kind that names a version the definition does not list", (def) => { def.acts.check.fields.other = step("hold@2:check"); }, "capability"],
      ["a guard of a capability that the definition does not list", (def) => { def.capabilities.pop(); }, "capability"],
      ["a guard that the version does not declare", (def) => { stage(def).guards[1].capability.guard = "held"; }, "capability"],
      ["an argument that the guard does not name", (def) => { stage(def).guards[1].capability.with.tree = { const: "x" }; }, "capability"],
      ["an argument that names no field", (def) => { stage(def).guards[1].capability.with.commit = { field: "none" }; }, "name"],
      ["an argument for each element of a value that is no list", (def) => { stage(def).guards[2].capability.with.selected.each = { field: "commit" }; }, "name"],
      ["an argument from a slot that the range's type does not have", (def) => { stage(def).guards[2].capability.with.earlier.slot = "none"; }, "name"],
      ["an effect that the version does not declare", (def) => { stage(def).effects[0].capability.do = "pin"; }, "capability"],
      ["arguments from two of the sets that the effect takes", (def) => { stage(def).effects[0].capability.with.consumer = { scope: true }; }, "capability"],
      ["a carried part that names no record kind of a listed capability", (def) => { def.acts.check.guards[0].equals.a.part.carried = "ledger.commit"; }, "capability"],
      ["a carried part with no member", (def) => { def.acts.check.guards[0].equals.a.part.carried = "pin"; }, "shape"],
      // Section 6.2: an act kind and a message name are the kind of no entry that only code writes. Revision 16 adds the prefix
      // `platform:`, of the outcome entries of a platform definition's operations.
      ["an act kind that begins with platform:", (def) => { def.acts["platform:register@1:create-repository"] = def.acts.ask; }, "shape"],
      ["an act kind that has the form of a step kind", (def) => { def.acts["hold@1:check"] = def.acts.ask; }, "shape"],
      ["a capability listed twice", (def) => { def.capabilities = [{ name: "hold", version: 1 }, { name: "hold", version: 1 }]; stage(def).guards.pop(); }, "capability"],
    ];
    const found = rows.map(([name, change, code]) => {
      const changed = structuredClone(staging.declared);
      change(changed);
      const checked = validateDefinition(changed, PROPOSED_BOUNDS);
      return [name, checked.ok ? null : [...new Set(checked.problems.map((p) => p.code))], code] as const;
    });
    expect(found.filter(([, codes, code]) => (code === null ? codes !== null : codes?.length !== 1 || codes[0] !== code)).map(([name, codes]) => [name, codes])).toEqual([]);
  });
});

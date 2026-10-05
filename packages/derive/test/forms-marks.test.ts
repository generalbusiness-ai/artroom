import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { PROFILES, validateDefinition } from "../src/index.ts";
import { small } from "./fixtures.ts";
import { gate } from "./fixtures-marks.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Change = (d: any) => void;
const MARK = { code: "fresh", row: "P14" };

/** The problems of a value with one change, as the code and the path of each: with the platform option, or without it. */
function problems(base: unknown, change: Change, platform: boolean): (readonly [string, string])[] | null {
  const definition = structuredClone(base) as any;
  change(definition);
  const result = validateDefinition(definition, PROPOSED_BOUNDS, PROFILES, platform ? { platform: true } : {});
  return result.ok ? null : result.problems.map((p) => [p.code, p.path] as const);
}

// Scope contract, revision 15, section 6.1, "What the validator does at a mark" and "A declared definition holds no mark"; witness 18.39.
describe("a mark in a definition (section 6.1)", () => {
  test("with the platform option a mark is accepted at each of the seven places and listed with its place; nothing is derived from it", () => {
    const checked = validateDefinition(gate, PROPOSED_BOUNDS, PROFILES, { platform: true });
    if (!checked.ok) throw new Error(`the made-up platform data is refused: ${JSON.stringify(checked.problems)}`);
    expect(checked.definition.marks.map((m) => [m.place, m.kind, m.path, m.code, m.row])).toEqual([
      [3, "type", "items.ticket.values.note.of", "even", "P22"],
      [1, "grant", "acts.enter.grant", "by-ticket", "P13"],
      [3, "type", "acts.enter.fields.note", "even", "P22"],
      [2, "also", "acts.enter.also.ticket", "find", "P18"],
      [4, "guard", "acts.enter.guards.1", "fresh", "P14"],
      [5, "effect", "acts.enter.effects.2", "key-id", "P14"],
      [6, "send", "acts.enter.sends.0", "refer", "P21"],
      [7, "outcome", "outcomes.probe", "probe", "P16"],
    ]);
    // A declared definition has no mark, and its list is empty.
    const declared = validateDefinition(small, PROPOSED_BOUNDS);
    expect(declared.ok && declared.definition.marks).toEqual([]);
  });

  /** Each row: a value, one change, whether the platform option is set, and every problem that the validator reports, or null when it passes. */
  const rows: readonly (readonly [string, unknown, Change, boolean, readonly (readonly [string, string])[] | null])[] = [
    // Without the option a mark is a form that the contract does not define, at every place.
    ["a declared definition with a mark among its guards is refused", small, (d) => d.acts.edit.guards.push(MARK), false, [["shape", "acts.edit.guards.4"]]],
    ["the platform data without the option: the member `outcomes` is no member of a declared definition", gate, () => {}, false, [["shape", "outcomes"]]],
    ["the same rows under a declared name, without the option: each of the six forms is refused where it stands", gate, (d) => { delete d.outcomes; d.name = "gate"; }, false, [["shape", "items.ticket.values.note.of"]]],
    ["and with the slot's type written as data: the grant, the field's type, the name of `also`, the guard, the effect and the send", gate, (d) => { delete d.outcomes; d.name = "gate"; d.items.ticket.values.note.of = { type: "int", min: 0, max: 9 }; }, false, [
      ["shape", "acts.enter.grant"], ["shape", "acts.enter.fields.note"], ["shape", "acts.enter.also.ticket"], ["name", "acts.enter.guards.0.of"], ["shape", "acts.enter.guards.1"],
      ["name", "acts.enter.effects.0.of"], ["name", "acts.enter.effects.1.of"], ["shape", "acts.enter.effects.2"], ["shape", "acts.enter.sends.0"],
    ]],
    // With the option a mark stands at one of the seven places, and nowhere else.
    ["with the option, the data without `outcomes` is not platform data", gate, (d) => { delete d.outcomes; }, true, [["shape", "outcomes"]]],
    ["a mark among the effects of a timed rule", gate, (d) => {
      d.items.ticket.values.due = { fixed: false, required: false, of: { type: "time" } };
      d.timed.lapse = { on: "ticket", states: ["open"], deadline: "due", effects: [{ state: "used" }, MARK], attention: [] };
    }, true, [["timed-partial", "timed.lapse.effects.1"]]],
    ["a mark inside a list form", gate, (d) => d.acts.enter.guards.push({ anyOf: [[MARK]] }), true, [["shape", "acts.enter.guards.2.anyOf.0.0"]]],
    ["a mark in the condition of an effect", gate, (d) => { d.acts.enter.effects[1].if = [MARK]; }, true, [["shape", "acts.enter.effects.1.if.0"]]],
    ["a mark as the type of an element of a list", gate, (d) => { d.acts.enter.fields.notes = { type: "list", max: 2, of: { code: "even", row: "P22", type: "code" }, required: false }; }, true, [["shape", "acts.enter.fields.notes.of"]]],
    ["a mark with a condition of its own", gate, (d) => { d.acts.enter.effects[2].if = []; }, true, [["shape", "acts.enter.effects.2.if"]]],
    ["a mark that names no row", gate, (d) => { d.acts.enter.guards[1].row = ""; }, true, [["shape", "acts.enter.guards.1.row"]]],
    // The field is then no field, so the effect that copies it names nothing.
    ["a default on a field whose type is a mark", gate, (d) => { d.acts.enter.fields.note.default = 2; }, true, [["shape", "acts.enter.fields.note.default"], ["name", "acts.enter.effects.1.value.from"]]],
    ["a value of another type copied into a slot whose type is a mark", gate, (d) => { d.acts.enter.effects[1].value.from = { field: "secret" }; }, true, [["name", "acts.enter.effects.1.value.from"]]],
    ["a second send that is a mark", gate, (d) => d.acts.enter.sends.push({ code: "again", row: "P21", result: {} }), true, [["shape", "acts.enter.sends.1"]]],
    // A written effect on a name that a mark selects, a required slot that only an effect mark could set, and a clause of the mark's own request all pass.
    ["a required slot that no written effect sets, in a row with an effect mark, passes", gate, (d) => { d.acts.issue.effects = [{ code: "hash-of", row: "P18" }]; }, true, null],
    ["an effect mark in a clause of the send mark passes", gate, (d) => { d.acts.enter.sends[0].result.applied = [{ code: "noted", row: "P16" }]; }, true, null],
  ];
  for (const [name, base, change, platform, expected] of rows) test(name, () => expect(problems(base, change, platform)).toEqual(expected));
});

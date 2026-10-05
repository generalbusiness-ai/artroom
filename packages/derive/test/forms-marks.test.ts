import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { textDigest } from "@generalbusiness/artroom-bytes";
import { PROFILES, validateDefinition, type ActJudgment, type PlatformRule } from "../src/index.ts";
import { Scope, keys, small, type Actor } from "./fixtures.ts";
import { gate, gateRules, gateWith } from "./fixtures-marks.ts";

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

// Scope contract, revision 15, sections 4.2, "Marks in the order of checks", and 6.1; witness 18.38. The rules are STAND-INS of test
// support (`gateRules`): this shows where a rule is run and what joins the entry, and nothing about a rule of a platform definition.
describe("a rule is run at the check of its mark's place (sections 4.2 and 6.1)", () => {
  const { rita, una, vic } = keys;
  /** What a judgment answered: the result, with the reason, the refusal's name and the path of the guard, where it has them. */
  const said = (j: ActJudgment) => [j.result, "reason" in j ? j.reason : null, "name" in j ? (j.name ?? null) : null, "detail" in j ? j.detail : null];
  /** A gate with two open tickets, issued for the secrets `one` and `two`: items 2 and 3. `enter` is judged on a written grant here. */
  const gated = () => {
    const s = new Scope(gateWith((d) => { d.acts.enter.grant = "gate.enter"; }));
    for (const secret of ["one", "two"]) s.did(rita, "issue", { fields: { hash: textDigest(secret) } });
    return s;
  };
  const enter = (s: Scope, who: Actor, secret: string, platform = gateRules(), note?: number) =>
    s.act(who, "enter", { on: 0, expected: { on: 1 }, fields: { secret, ...(note === undefined ? {} : { note }) } }, { platform });

  test("a name of `also` at check 8, a field's type at check 7, a guard at its position among the written guards, and an effect at its position among the written effects, with a slot's type checked by its rule", () => {
    const s = gated();
    const rules = gateRules();
    // Check 8: `find` gives ticket 2, and `expected` has no key for it. Check 10: the written guard, then `fresh`. Check 11: the two
    // written effects, then the effect of `key-id`, in that order. The slot `note` has the type `even`, and its rule is asked again.
    expect(said(enter(s, una, "one", rules, 4))).toEqual(["write", null, null, null]);
    expect(s.last.effects).toEqual([{ effect: "state", item: 2, state: "used" }, { effect: "value", item: 2, slot: "note", value: 4 }, { effect: "value", item: 2, slot: "key", value: una.key }]);
    expect([s.last.sends, rules.ran]).toEqual([[], { even: 2, find: 1, fresh: 1, "key-id": 1, refer: 1 }]);
    // Check 7: a value that the rule of the field's type does not accept is `bad-field`, before any item is selected.
    const odd = gateRules();
    expect([said(enter(s, vic, "two", odd, 3)), odd.ran]).toEqual([["refused", "bad-field", null, "note is not a value of its type"], { even: 1 }]);

    // The same secret again. The ticket is used: the written guard, which stands first, refuses with its own name and path, and the
    // rule of the mark after it is not run.
    const again = gateRules();
    expect([said(enter(s, vic, "one", again)), again.ran["fresh"]]).toEqual([["refused", "guard-failed", "used", "guards.0"], undefined]);
    // An open ticket, and a key that a ticket holds: the written guard holds, and the mark refuses with the name that its rule
    // states and the path of its position.
    expect(said(enter(s, una, "two"))).toEqual(["refused", "guard-failed", "seated", "guards.1"]);
    expect(s.entries.length).toBe(5);
  });

  test("a mark at `grant` stands in place of the grant check: a pass records an empty authority, a refusal is unauthorized with the rule's name, and a mark that states an action is judged on a held grant first", () => {
    const authority = (s: Scope) => (s.last.input.type === "act" ? s.last.input.authority : null);
    const issued = (s: Scope) => { for (const secret of ["one", "two"]) s.did(rita, "issue", { fields: { hash: textDigest(secret) } }); return s; };
    const fields = (secret: string) => ({ on: 0, expected: { on: 1 }, fields: { secret } });
    // The row as the data has it: the mark states no action. Nothing is read about the signer, so `grants` is null, and the act
    // is never answered `authority-unavailable`. The rule passes the key of a ticket, with no member, and the entry records no grant.
    const s = issued(new Scope(gateWith()));
    const rules = gateRules();
    expect([said(s.act(una, "enter", fields("one"), { platform: rules, grants: null })), authority(s), rules.ran["by-ticket"]]).toEqual([["write", null, null, null], [], 1]);
    expect(s.last.effects).toEqual([{ effect: "state", item: 2, state: "used" }, { effect: "value", item: 2, slot: "key", value: una.key }]);
    // A wrong secret selects no ticket: the rule does not pass, and the refusal has the name that it states. A grant of any action
    // changes nothing, because no grant is judged.
    expect(said(s.act(vic, "enter", fields("none"), { platform: gateRules() }))).toEqual(["refused", "unauthorized", "no-ticket", "the rule by-ticket does not pass this key"]);
    expect(s.entries.length).toBe(5);

    // The same row with a mark that states an action. With a current grant of it the check holds as written: the entry records
    // that grant, and the rule is not run. With none, the rule is run. And with nothing read about the signer, an act that the
    // rule does not pass is not judged.
    const t = issued(new Scope(gateWith((d) => { d.acts.enter.grant.grant = "gate.enter"; })));
    const held = gateRules();
    expect([said(t.act(una, "enter", fields("one"), { platform: held })), authority(t)?.map((grant) => [grant.key, grant.actions.includes("gate.enter")]), held.ran["by-ticket"]]).toEqual([["write", null, null, null], [[una.key, true]], undefined]);
    expect([said(t.act(vic, "enter", fields("two"), { platform: gateRules(), grants: [] })), authority(t)]).toEqual([["write", null, null, null], []]);
    expect([said(t.act(rita, "enter", fields("none"), { platform: gateRules(), grants: null })), said(t.act(rita, "enter", fields("none"), { platform: gateRules(), grants: [] }))])
      .toEqual([["unavailable", "authority-unavailable", null, null], ["refused", "unauthorized", "no-ticket", "the rule by-ticket does not pass this key"]]);
  });

  test("a fault of a rule leaves the act not judged, and nothing is written: an effect outside the eight forms, an effect that conflicts with a written one, a refusal that is not stated, a rule that throws, and a mark with no rule", () => {
    const s = gated();
    const effect = (run: () => unknown): PlatformRule => ({ place: "effect", most: 2, run: run as never });
    const faults: Record<string, Partial<Record<string, PlatformRule>>> = {
      // A member of `Effect` that no rule returns: a capability's record, and a redaction of the ticket's key.
      record: { "key-id": effect(() => [{ effect: "record", capability: "hold@1", kind: "pin", key: [], state: "held", values: {} }]) },
      redact: { "key-id": effect(() => [{ effect: "redact", item: 2, slot: "key", texts: [] }]) },
      // The written effect sets the ticket's state, so a second `state` effect on it conflicts.
      conflict: { "key-id": effect(() => [{ effect: "state", item: 2, state: "used" }]) },
      "more than it states": { "key-id": { place: "effect", most: 0, run: () => [{ effect: "value", item: 2, slot: "key", value: "k" }] } },
      "a refusal that is not stated": { fresh: { place: "guard", refusals: ["seated"], run: () => ({ holds: false, name: "tired" }) } },
      throws: { find: { place: "also", run: () => { throw new Error("no"); } } },
      "an item of another type": { find: { place: "also", run: () => 0 } },
      "no rule": { fresh: undefined },
      "a rule of another place": { fresh: { place: "send", run: () => null } },
    };
    for (const [name, over] of Object.entries(faults)) expect([name, said(enter(s, una, "one", gateRules(over)))]).toEqual([name, ["unavailable", "unavailable", null, null]]);
    // The control: with the stand-in rules as they are, the same act is written.
    expect([s.entries.length, said(enter(s, una, "one"))]).toEqual([4, ["write", null, null, null]]);
    // A check on effects refuses, as for a written effect: a value outside its slot's type is `bad-field`, and is no fault.
    expect(said(enter(s, vic, "two", gateRules({ "key-id": effect(() => [{ effect: "value", item: 3, slot: "key", value: 7 }]) })))).toEqual(["refused", "bad-field", null, "effects.2: the rule key-id gives key a value outside the slot's type"]);
  });
});

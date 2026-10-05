import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { DeclaredDefinition } from "@generalbusiness/artroom-contract";
import { canonicalBytes, definitionDigest } from "@generalbusiness/artroom-bytes";
import { validateDefinition, type ProblemCode } from "../src/index.ts";
import { Scope, desk, fields, keys, lane, laneDefinition, member, on, small, smallDefinition, t, ticket, valid } from "./fixtures.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Change = (d: any) => void;
const overdue = { on: "note", states: ["draft"], deadline: "due", effects: [{ state: "kept" }], attention: [] };
const clone = <T>(v: T): T => structuredClone(v);
/** The ticket, with a request that a timed rule pauses: `asked` to `paused` at its `until`. */
const pausing = (change: Change): Change => (d) => {
  d.items.request.states.paused = { final: false };
  d.items.request.values.until = { fixed: false, required: false, of: { type: "time" } };
  d.timed.pause = { on: "request", states: ["asked"], deadline: "until", effects: [{ state: "paused" }], attention: [] };
  change(d);
};

/**
 * Each row is one definition: a fixture with one change. `null` passes; a
 * code is the only kind of problem the validator reports for it.
 */
const rows: readonly (readonly [string, DeclaredDefinition, Change, ProblemCode | null])[] = [
  ["the lane passes", lane, () => {}, null],
  ["the small definition passes", small, () => {}, null],
  ["the desk passes", desk, () => {}, null],
  ["the ticket passes, with a rule guard that names a rule it declares", ticket, () => {}, null],
  ["a rule guard that names no declared rule", ticket, (d) => { d.rules = {}; }, "rule"],
  ["two handlers for one message from one kind of scope", desk, (d) => { d.receives.again = clone(d.receives.spawn); }, "handler"],
  ["a tell under a name the platform keeps for a relate", ticket, (d) => { d.acts.ask.sends[0].tell.message = "relate:closes"; }, "handler"],
  ["a time value set by a genesis, with no timed rule on its type, passes", small, (d) => d.acts.start.effects.push({ value: { slot: "due", from: { time: { plusSeconds: 60 } } } }), null],

  // Section 6.4, the table of X1 and X2.
  ["X1: the genesis act opens the hold type", lane, (d) => { d.genesis = "take-hold"; }, "genesis-timed"],
  ["X2: the genesis act opens a type with a deadline under a timed rule", small, (d) => { d.timed.overdue = overdue; }, "genesis-timed"],
  ["the genesis names no act", small, (d) => { d.genesis = "found"; }, "genesis"],
  ["the genesis act is a transition", small, (d) => { d.genesis = "keep"; }, "genesis"],

  // Sections 4.1 and 6.3.
  ["two opens: an open act that also opens a hold on another item", lane, (d) => d.acts.offer.effects.push({ of: "also.intent", hold: { do: "open" } }), "one-item"],
  ["two effects set one slot of one subject", small, (d) => d.acts.edit.effects.push({ value: { slot: "text", from: { const: "x" } } }), "conflict"],
  ["two effects set the state of one subject", small, (d) => d.acts.keep.effects.push({ state: "draft" }), "conflict"],
  ["an opening sets no value in a required slot", small, (d) => d.acts.write.effects.shift(), "required-unset"],
  ["a guard reads the state of the item its act opens", small, (d) => d.acts.write.guards.push({ state: ["draft"] }), "nascent-guard"],
  ["a guard reads a slot of the item its act opens", small, (d) => d.acts.write.guards.push({ equals: { a: { slot: "owner" }, b: { signer: true } } }), "nascent-guard"],
  ["an equality whose second operand is not an operand, after a first that is valid", small, (d) => d.acts.write.guards.push({ equals: { a: { field: "owner" }, b: null } }), "shape"],
  ["a later act sets a fixed slot", small, (d) => d.acts.edit.effects.push({ party: { slot: "owner", from: { signer: true } } }), "fixed"],
  ["a state effect with no guard that its subject is live", small, (d) => { d.acts.keep.guards = []; }, "final"],
  ["a state effect whose guard admits a final state", small, (d) => d.acts.keep.guards[0].state.push("kept"), "final"],
  ["two relate sends written with one to, item and name", lane, (d) => d.acts.link.sends.push(clone(d.acts.link.sends[0])), "duplicate-relation"],

  // Names and bounds.
  ["an effect names no state", small, (d) => { d.acts.keep.effects[0].state = "gone"; }, "name"],
  ["an also entry is named by a field that is not an item", small, (d) => { d.acts.edit.also.other.by = "text"; }, "name"],
  ["an also entry is named by an item field of another type", lane, (d) => { d.acts.offer.also.intent.item = "commitment"; }, "name"],
  ["more guards than one act may have", small, (d) => { d.acts.edit.guards = Array.from({ length: PROPOSED_BOUNDS.guards + 1 }, () => ({ state: ["draft"] })); }, "bound"],
  ["a text field larger than a text may be", small, (d) => { d.items.note.values.text.of.max = PROPOSED_BOUNDS.textBytes + 1; }, "bound"],
  ["a field copied into a slot that holds less: a text of 200 bytes into a slot of 4", small, (d) => { d.items.note.values.text.of.max = 4; }, "bound"],
  ["more states than a type may have", small, (d) => { for (let i = 0; i < PROPOSED_BOUNDS.states; i++) d.items.note.states[`s${i}`] = { final: false }; }, "bound"],

  // Timed rules and the hold capability, as the deltas note records them.
  ["a hold with no timed rule that ends it", lane, (d) => { d.timed = {}; }, "hold"],
  ["a hold effect in a definition that does not list hold@1", lane, (d) => { d.capabilities = []; }, "capability"],
  ["a timed rule that leaves its item due", lane, (d) => { d.timed["hold-end"].effects = [{ hold: { do: "end" } }]; }, "timed"],
  ["a timed rule with an effect its commit could refuse: an add to a party list that may be full", lane, (d) => {
    d.items.hold.parties.past = { fixed: false, required: false, list: true, max: 1, author: false };
    d.timed["hold-end"].effects.push({ party: { slot: "past", from: { slot: "holder" }, list: "add" } });
  }, "timed-partial"],
  ["a timed rule that sets a time from the commit clock, which a commit could refuse", lane, (d) => d.timed["hold-end"].effects.push({ value: { slot: "until", from: { time: { plusSeconds: 60 } } } }), "timed-partial"],
  ["a timed rule whose entry, with its attention reason, could pass the entry size bound: its due item could never be written", lane, (d) => { d.timed["hold-end"].attention[0].notify.reason = "r".repeat(PROPOSED_BOUNDS.entryBytes); }, "bound"],
  // Section 17.2: a reservation covers what its duty can start, so that must be finite.
  ["timed rules of one type that lead to one another in a cycle", ticket, pausing((d) => { d.timed.resume = { ...d.timed.pause, states: ["paused"], effects: [{ state: "asked" }] }; }), "reserve-unbounded"],
  ["a time offset longer than the span a timestamp can name", lane, (d) => { d.acts["take-hold"].effects[2].value.from.time.plusSeconds = Number.MAX_SAFE_INTEGER; }, "bound"],
  ["a timed rule over a final state", lane, (d) => d.timed["hold-end"].states.push("ended"), "timed"],
  ["a profile this runtime does not implement", small, (d) => { d.profile.version = 2; }, "profile"],
  ["a capability this runtime does not implement", small, (d) => d.capabilities.push({ name: "git-read", version: 1 }), "capability"],

  // Section 6.10: forms that are not part of the grammar. No implementer invents them.
  ["G1: an operand path into a fact", small, (d) => d.acts.edit.guards.push({ equals: { a: { field: "text", path: "on" }, b: { const: 1 } } }), "shape"],
  ["G3: a `when` on an effect", small, (d) => { d.acts.edit.effects[0].when = [{ state: ["draft"] }]; }, "shape"],
  ["G5: a count bound from a slot", small, (d) => { d.acts.few.guards[0].count.max = { slot: "limit" }; }, "shape"],
  ["G6: a `covers` guard", small, (d) => d.acts.edit.guards.push({ covers: { list: "notes", states: ["kept"] } }), "shape"],
  ["G7: `follow` on a fact guard", small, (d) => { d.acts.edit.fields.proof = { type: "fact", kind: "report", under: "lane", required: false }; d.acts.edit.guards.push({ fact: { field: "proof", follow: "report" } }); }, "shape"],
  ["G11: an operand `sender`", small, (d) => d.acts.edit.guards.push({ equals: { a: { sender: true }, b: { const: 1 } } }), "shape"],
  ["a member the contract does not define", small, (d) => { d.imports = []; }, "shape"],
];

describe("the definition validator", () => {
  for (const [name, base, change, code] of rows) test(name, () => {
    const definition = clone(base);
    change(definition);
    const result = validateDefinition(definition, PROPOSED_BOUNDS);
    expect(result.ok ? null : [...new Set(result.problems.map((p) => p.code))]).toEqual(code === null ? null : [code]);
    // A problem says where it is.
    if (!result.ok) for (const p of result.problems) expect(p.path + p.message).not.toBe("");
  });

  test("a definition that passes carries its digest, its timed and hold types, and the slots each `where` reads", () => {
    expect(laneDefinition.digest).toBe(definitionDigest(lane));
    expect(laneDefinition.timedTypes).toEqual(["hold"]);
    expect(laneDefinition.holdTypes).toEqual(["hold"]);
    expect(laneDefinition.indexes).toEqual([{ path: "acts.take-hold.guards.2.none", type: "hold", slots: ["under"] }]);
    expect(smallDefinition.timedTypes).toEqual([]);
    expect(smallDefinition.indexes.map((i) => [i.type, i.slots])).toEqual(Array(4).fill(["note", ["text"]]));
  });

  test("a timed rule that copies a party list is counted at every member the list can hold, so the entry of an admitted rule fits the entry size bound", () => {
    // A hold with a list of four watchers, which its end copies into a reference slot.
    const watched = clone(lane) as any;
    watched.items.hold.parties.watchers = { fixed: false, required: false, list: true, max: 4, author: false };
    watched.items.hold.refs.saved = { fixed: false, required: false, to: { type: "list", of: { type: "member" }, max: 4 } };
    watched.acts.watch = { ...clone(lane.acts["renew"]), fields: { who: { type: "member", required: true } }, effects: [{ party: { slot: "watchers", from: { field: "who" }, list: "add" } }] };
    watched.timed["hold-end"].effects.push({ ref: { slot: "saved", from: { slot: "watchers" } } });
    // With the list counted as one member the bound came to under 6,000 bytes, and this definition passed there.
    const tight = validateDefinition(watched, { ...PROPOSED_BOUNDS, entryBytes: 6000 });
    expect(tight.ok ? null : tight.problems.map((p) => [p.code, p.path])).toEqual([["bound", "timed.hold-end"]]);
    const most = Number(/could take (\d+) bytes/.exec(tight.ok ? "" : tight.problems[0]!.message)![1]);

    // The entry itself, with the list full of the longest handles, each byte of which is written as a six-byte escape.
    const s = new Scope(valid(validateDefinition(watched, PROPOSED_BOUNDS)));
    const commitment = s.did(keys.rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } }).seq;
    s.did(keys.rita, "assign", { ...on(s, commitment), ...fields({ performer: keys.una.member }) });
    const hold = s.did(keys.una, "take-hold", { fields: { commitment }, expected: { commitment: 2 } }).seq;
    for (let i = 0; i < 4; i++) s.did(keys.una, "watch", { ...on(s, hold), ...fields({ who: member(String(i) + "\u0001".repeat(PROPOSED_BOUNDS.memberBytes - 2)) }) });
    s.now = t(600);
    expect(s.drain().map((j) => j.result)).toEqual(["write"]);
    const size = canonicalBytes(s.last).length;
    expect(size).toBeGreaterThan(6000);
    expect(size).toBeLessThanOrEqual(most);
  });
});

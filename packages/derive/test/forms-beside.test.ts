import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { isSealed } from "@generalbusiness/artroom-bytes";
import { isValue, validateDefinition, type Fetched, type ProblemCode } from "../src/index.ts";
import { Scope, d, keys, laneDefinition, notes, on, small, variant } from "./fixtures.ts";

const { rita, una, vic } = keys;
/* eslint-disable @typescript-eslint/no-explicit-any */
type Change = (d: any) => void;
const act = (a: object) => ({ on: "note", also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [], ...a });

describe("facts presented beside an intent (section 6.4)", () => {
  /** The small definition, with an act that is presented one fact: an `assign` entry of a lane, whose performer must be the signer. */
  const vouching = variant(small, (def) => {
    def.acts.vouch = act({
      step: "transition", grant: "edit", presents: { proof: { kind: ["assign"], under: "lane", required: false } },
      guards: [
        { state: ["draft"] }, { fact: { presented: "proof" }, ifPresent: true },
        { equals: { a: { presented: "proof", part: { field: "performer" } }, b: { signer: true } }, ifPresent: true, reason: "not-yours" },
      ],
      effects: [{ party: { slot: "readers", from: { presented: "proof", part: { field: "performer" } }, list: "add" } }],
    });
  });

  test("a presented fact is fetched and checked like a fact field, a guard ties it to the signer, and the entry records it and uses it; one that is absent skips its guards", () => {
    const L = new Scope(laneDefinition);
    const offered = L.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } }).seq;
    const assigned = L.did(rita, "assign", { ...on(L, offered), fields: { performer: una.member } }).seq;
    const fetched = (seq: number): Fetched => ({ fact: L.fact(seq), entry: L.entries[seq]!.entry, under: "lane" });
    const S = new Scope(vouching);                             // entries 0 and 1; note 0 is rita's
    const beside = (seq: number) => ({ presented: { proof: L.fact(seq) }, facts: [fetched(seq)] });
    const said = (who: typeof una, context: object) => {
      const judgment = S.judge(S.intent(who, "vouch", on(S, 0)), context);
      return [judgment.result, "reason" in judgment ? judgment.reason : "", "name" in judgment ? judgment.name : ""];
    };

    // With nothing presented, the two guards that name the fact are skipped, and the effect, whose source is none, is not applied.
    expect(S.act(una, "vouch", on(S, 0)).result).toBe("write");
    expect([S.last.input, S.last.uses, S.last.effects]).toMatchObject([{ type: "act", presented: {} }, [], []]);

    // Not signed, so not in the intent: the entry records which fact was presented, and retains it in `uses` like a fact field.
    expect(S.act(una, "vouch", on(S, 0), beside(assigned)).result).toBe("write");
    expect(S.last.input).toMatchObject({ type: "act", signed: { intent: { fields: {} } }, presented: { proof: L.fact(assigned) } });
    expect([S.last.uses.map((use) => use.fact), S.last.effects]).toEqual([[L.fact(assigned)], [{ effect: "list", item: 0, slot: "readers", change: "add", member: una.member }]]);
    expect([isSealed(S.entries.at(-1)), S.replay().snapshot() === S.state.snapshot()]).toEqual([true, true]);

    expect([
      said(vic, beside(assigned)),                                               // the guard that the definition writes ties the fact to the signer
      said(una, beside(offered)),                                                // an entry of another kind than the act declares
      said(una, { presented: { proof: L.fact(assigned) } }),                     // not fetched before the turn
      said(una, { presented: { other: L.fact(assigned) }, facts: [fetched(assigned)] }),   // a name the act does not declare
      said(una, { presented: { proof: assigned } }),                             // not a fact reference
      said(una, { presented: { proof: { ...S.fact(1), hash: d("f") } } }),       // this scope's own entry, with another hash
    ]).toEqual([
      ["refused", "guard-failed", "not-yours"], ["refused", "guard-failed", ""], ["unavailable", "dependency-unavailable", ""],
      ["refused", "bad-field", ""], ["refused", "bad-field", ""], ["refused", "fact-mismatch", ""],
    ]);
  });
});

describe("what the validator takes beside an intent (sections 6.2, 6.4 and 6.6)", () => {
  const body = { type: "text", max: 40, detached: true } as const;
  /** Each row is that definition with one change. `null` passes; a code is the only kind of problem the validator reports for it. */
  const rows: readonly (readonly [string, Change, ProblemCode | null])[] = [
    ["a detached field into a detached slot, a redaction, a send of the text to a lane, and a presented fact pass", () => {}, null],
    // Section 6.2: where a detached text may be, and what may be put in a slot for one.
    ["a detached text as an element of a list", (def) => { def.acts.write.fields.all = { type: "list", of: body, max: 2, required: false }; }, "shape"],
    ["a detached text in a reference slot", (def) => { def.items.note.refs.text = { fixed: false, required: false, to: body }; }, "shape"],
    ["a detached text with a default", (def) => { def.items.note.values.body.default = d("a"); }, "shape"],
    ["a plain text put in a slot for a detached one", (def) => { def.acts.write.effects[0].value.from = { field: "title" }; }, "shape"],
    ["a constant put in a slot for a detached text", (def) => { def.acts.write.effects[0].value.from = { const: d("a") }; }, "shape"],
    ["a detached text put in a slot for a plain one", (def) => { def.acts.write.effects[0].value.slot = "title"; }, "bound"],
    // Section 6.2, `redactable-read`.
    ["a guard reads a detached field", (def) => def.acts.write.guards.push({ differs: { a: { field: "body" }, b: { none: true } } }), "redactable-read"],
    ["a rule guard in an act with a detached field", (def) => { def.rules.any = "true"; def.acts.write.guards.push({ rule: "any" }); }, "redactable-read"],
    ["an index send reads a detached slot", (def) => def.acts.tell.sends.push({ index: { fields: { body: { slot: "body" } } } }), "redactable-read"],
    ["a send to a scope that is no lane reads a detached slot", (def) => { def.items.note.refs.peer.to.kind = "directory"; }, "redactable-read"],
    // Section 6.6, `redact`.
    ["a redaction of a slot that holds no detached text", (def) => { def.acts.strike.effects[1].redact.slot = "title"; }, "name"],
    ["a redaction in a result clause, whose entry has no signer", (def) => { def.acts.tell.sends[0].tell.result = { applied: [{ redact: { slot: "body" } }] }; }, "shape"],
    // Section 6.4, `presents`.
    ["the genesis act is presented a fact", (def) => { def.acts.start.presents = { proof: { kind: ["write"], under: "notes", required: false } }; }, "shape"],
    ["more presented facts than an act may have", (def) => { for (let i = 0; i < PROPOSED_BOUNDS.presents; i++) def.acts.vouch.presents[`p${i}`] = { kind: ["write"], under: "notes", required: false }; }, "bound"],
    ["a guard names a fact that the act is not presented", (def) => { def.acts.vouch.guards[1].fact.presented = "other"; }, "name"],
  ];

  test("a detached text is held where its bytes can be kept and redacted, and is read by nothing that judges; a presented fact is one the act declares", () => {
    const found = rows.map(([name, change, code]) => {
      const changed = structuredClone(notes);
      change(changed);
      const checked = validateDefinition(changed, PROPOSED_BOUNDS);
      return [name, checked.ok ? null : [...new Set(checked.problems.map((p) => p.code))], code] as const;
    });
    expect(found.filter(([, codes, code]) => (code === null ? codes !== null : codes?.length !== 1 || codes[0] !== code)).map(([name, codes]) => [name, codes])).toEqual([]);
    // The value of a detached text is its digest, whatever the text: the text itself is no value of the field.
    expect([isValue(body, d("a"), PROPOSED_BOUNDS), isValue(body, "a text", PROPOSED_BOUNDS), isValue({ type: "text", max: 40 }, "a text", PROPOSED_BOUNDS)]).toEqual([true, false, true]);
  });
});

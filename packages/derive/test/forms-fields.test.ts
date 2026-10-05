import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { DeclaredDefinition, FieldType } from "@generalbusiness/artroom-contract";
import { isSealed } from "@generalbusiness/artroom-bytes";
import { operand, validateDefinition, type Judging, type ProblemCode } from "../src/index.ts";
import { equal } from "../src/operand.ts";
import { naming, type Defining } from "../src/validate/context.ts";
import { operand as operandType } from "../src/validate/operands.ts";
import { shapes } from "../src/validate/shape.ts";
import { Scope, arrive, d, decided, fields, keys, on, otherLane, t, ticket } from "./fixtures.ts";
import { board, boardDefinition } from "./fixtures-f.ts";

const { sam } = keys;
/* eslint-disable @typescript-eslint/no-explicit-any */
type Change = (d: any) => void;
/** A copy in which no two places share one object, as a definition is when it is parsed. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("the record type (section 6.2)", () => {
  test("a record is a list's element, a field's default and a slot's value; an unknown member is refused; an item and a fact inside one are read as in any field", () => {
    const s = new Scope(boardDefinition);                      // entries 0 and 1: the genesis and its confirmation
    const job = s.did(sam, "ask", fields({ deadline: t(600) })).seq;
    const planned = s.did(sam, "plan", fields({ rows: [{ job, why: "first", by: s.fact(job) }, { job }] }));
    // The fact names this scope's own entry, so it is in normal form: the `seq`. The mark took its default.
    expect(planned.effects.slice(1)).toEqual([
      { effect: "value", item: planned.seq, slot: "rows", value: [{ job, why: "first", by: job }, { job }] },
      { effect: "value", item: planned.seq, slot: "mark", value: { label: "plain" } },
    ]);
    expect(s.did(sam, "stamp", on(s, planned.seq)).effects).toEqual([{ effect: "value", item: planned.seq, slot: "mark", value: { label: "stamped", weight: 2 } }]);
    // Equality puts a local fact in normal form at any depth: the rows as the intent holds them equal the rows as the slot holds them.
    const j = { scope: { at: s.at }, own: s.own } as unknown as Judging;
    const given = planned.input.type === "act" ? planned.input.signed.intent.fields["rows"] : null;
    expect([given, equal(j, given, s.item(planned.seq).values["rows"]), equal(j, [{ job, by: { ...s.fact(job), hash: d("f") } }], [{ job, by: job }])]).toEqual([[{ job, why: "first", by: s.fact(job) }, { job }], true, false]);
    expect(s.entries.slice(-2).every(isSealed)).toBe(true);
    expect(s.replay().snapshot()).toBe(s.state.snapshot());

    const refused = (row: unknown) => {
      const judgment = s.act(sam, "plan", fields({ rows: [row as never] }));
      return judgment.result === "refused" || judgment.result === "unavailable" ? judgment.reason : judgment.result;
    };
    expect([
      refused({ job, extra: 1 }), refused({ why: "no job" }), refused({ job: "2" }), refused([job]),
      refused({ job: planned.seq }), refused({ job, by: { ...s.fact(job), hash: d("f") } }), refused({ job, by: { at: otherLane, seq: 4, hash: d("4") } }),
    ]).toEqual(["bad-field", "bad-field", "bad-field", "bad-field", "no-item", "fact-mismatch", "dependency-unavailable"]);
  });

  test("a member of a record element is named after the element with a dot, in the validator and in the commit", () => {
    // No form of this step binds an element, so the element is given here as a list form will give it.
    const row = board.acts["plan"]!.fields["rows"]!;
    const element = row.type === "list" ? row.of : (null as never);
    const read = (name: string, bound: FieldType | null = element) => {
      const defining = { ...shapes(PROPOSED_BOUNDS), bounds: PROPOSED_BOUNDS } as unknown as Defining;
      const type = operandType(defining, { element: name }, "x", { ...naming(), elements: new Map([["k", bound]]) }, () => null)?.type;
      return defining.problems.length > 0 ? defining.problems.map((p) => p.code) : type;
    };
    expect([read("k"), read("k.job"), read("k.by")]).toEqual([element, { type: "item", of: "job", required: true }, { type: "fact", kind: ["ask"], under: "board", required: false }]);
    // A member the record does not have, a member of a member that is no record, and a name that nothing binds.
    expect([read("k.none"), read("k.job.of"), read("j.job")]).toEqual([["name"], ["name"], ["name"]]);
    // An element whose type only the commit knows may hold any member, and the member's type is the commit's to know too.
    expect(read("k.job", null)).toBeNull();

    const j = { elements: new Map<string, unknown>([["k", { job: 2, by: 7 }], ["k.why", "a name with a dot is read whole"]]) } as unknown as Judging;
    expect(["k", "k.job", "k.why", "k.none", "k.job.of", "j.job"].map((name) => operand(j, { element: name }, null))).toEqual([{ job: 2, by: 7 }, 2, "a name with a dot is read whole", null, null, null]);
  });
});

describe("the kind of a timed entry (sections 6.2 and 6.4)", () => {
  test("a timed rule sets a slot from self, and the entry it writes is a fact of the kind timed: and the rule's key", () => {
    const s = new Scope(boardDefinition);
    const job = s.did(sam, "ask", fields({ deadline: t(600) })).seq;
    s.now = t(600);
    expect(s.drain().map((j) => j.result)).toEqual(["write"]);
    const timed = s.last;
    expect(timed.effects).toEqual([{ effect: "state", item: job, state: "timed-out" }, { effect: "ref", item: job, slot: "decidedBy", to: timed.seq }]);
    // The entry that opened the job is no timed entry: its kind is `ask`. The timed entry is what decided the job.
    const cite = (seq: number) => s.act(sam, "cite", { ...on(s, job), ...fields({ by: s.fact(seq) }) });
    expect(cite(job)).toMatchObject({ result: "refused", reason: "guard-failed", detail: "guards.1" });
    // Another lane tells this scope a message with that name. No handler receives it, whatever its fields hold, so its entry has no
    // kind, and is no such fact.
    arrive(s, new Scope(boardDefinition, sam.member, true, 1), { class: "request", type: "tell", body: { message: "timed:job-deadline", fields: 7 } });
    expect([decided(s), cite(s.last.seq)]).toMatchObject([["refused", "unknown-message"], { result: "refused", reason: "guard-failed", detail: "guards.1" }]);
    expect(cite(timed.seq).result).toBe("write");
    expect(s.replay().snapshot()).toBe(s.state.snapshot());
  });
});

describe("what the validator refuses of these forms", () => {
  const handler = (message: string, form: object = { class: "tell" }) => ({ message, ...form, from: { kind: "lane" }, fields: {}, opens: null, also: {}, guards: [], effects: [], sends: [], attention: [] });
  const large = { type: "record", of: { a: { type: "text", max: PROPOSED_BOUNDS.textBytes, required: true } } };
  const rows: readonly (readonly [string, DeclaredDefinition, Change, ProblemCode | null])[] = [
    ["the board passes", board, () => {}, null],
    ["a record with no member", board, (b) => { b.items.plan.values.mark.of.of = {}; }, "shape"],
    ["a member whose name has a dot", board, (b) => { b.items.plan.values.mark.of.of["a.b"] = { type: "bool", required: false }; }, "shape"],
    ["a member that does not say whether it is required", board, (b) => { delete b.items.plan.values.mark.of.of.weight.required; }, "shape"],
    ["a default that lacks a required member", board, (b) => { b.acts.plan.fields.mark.default = { weight: 1 }; }, "shape"],
    ["a constant with a member its slot's record does not have", board, (b) => { b.acts.stamp.effects[0].value.from.const.other = 1; }, "shape"],
    ["a record field copied into a slot whose record has no such member", board, (b) => { b.acts.plan.fields.mark.of.extra = { type: "bool", required: false }; }, "bound"],
    ["a record field copied into a slot that requires a member the field may lack", board, (b) => { b.items.plan.values.mark.of.of.weight.required = true; }, "bound"],
    ["a timed rule that copies a record its entry could not hold", board, (b) => {
      b.items.job.values.pick = { fixed: false, required: false, of: large };
      b.items.job.refs.kept = { fixed: false, required: false, to: large };
      b.timed["job-deadline"].effects.push({ ref: { slot: "kept", from: { slot: "pick" } } });
    }, "bound"],
    ["a timed rule that sets from self a slot whose kinds do not include its own", board, (b) => { b.items.job.refs.decidedBy.to.kind = ["cite"]; }, "name"],
    ["an act kind that begins timed:", board, (b) => { b.acts["timed:job-deadline"] = clone(b.acts.stamp); }, "shape"],
    ["a handler of a message whose name begins timed:", board, (b) => { b.receives.late = handler("timed:job-deadline"); }, "handler"],
    ["a handler of a relationship whose name begins timed:", board, (b) => { b.receives.late = handler("timed:job-deadline", { class: "relate", copies: 1 }); }, "handler"],
    ["a tell of a message whose name begins timed:", ticket, (b) => { b.acts.ask.sends[0].tell.message = "timed:spawn"; }, "handler"],
    ["a relate under a name that begins timed:", ticket, (b) => { b.acts.link.sends[0].relate.name = "timed:closes"; }, "handler"],
  ];
  test("each row is one definition with one change, and the validator reports that one kind of problem", () => {
    for (const [name, base, change, code] of rows) {
      const definition = clone(base);
      change(definition);
      const result = validateDefinition(definition, PROPOSED_BOUNDS);
      expect([name, result.ok ? null : [...new Set(result.problems.map((p) => p.code))]]).toEqual([name, code === null ? null : [code]]);
    }
  });
});

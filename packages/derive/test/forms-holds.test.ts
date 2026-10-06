import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { entryHash } from "@generalbusiness/artroom-bytes";
import { FoldError, MemoryState, NOTHING, applyEntry, closure, drawsOf, heldEntries, itemOf, one, outcomes, owed, pendingOf, requestOf, retainedBytes, starts, stateDigest, validateDefinition } from "../src/index.ts";
import type { Amount, Counting, KindStated, Starts } from "../src/index.ts";
import { on, valid } from "./fixtures.ts";
import { OWNER, TELL, Works, chain, chainDefinition, changed, opened, works, worksDefinition } from "./fixtures-holds.ts";

const EB = PROPOSED_BOUNDS.entryBytes;
const codes = (v: ReturnType<typeof changed>) => (v.ok ? "valid" : v.problems.map((problem) => `${problem.code} ${problem.path}`));
/** An amount of entries alone, with each entry at the stand-in for its static size. */
const entries = (n: number, more: Partial<Amount> = {}): Amount => ({ ...NOTHING, entries: n, bytes: n * EB, ...more });
const kind = (attempts: number, most: Partial<Starts> = {}, send: KindStated["send"] = null, retains = 0): KindStated => ({ attempts, most: { effects: 0, operations: [], opens: null, ...most }, send, retains });
const counting = (kinds: Record<string, KindStated>, held: string[] = [], over: Partial<Counting> = {}): Counting => ({ kinds, held: new Set(held), initial: () => NOTHING, change: NOTHING, entry: EB, written: NOTHING, ...over });

// Scope contract, revision 23, section 17.2, "The closure of an operation", "What a mark may start" and "A request that an outcome
// sends"; section 17.2a, "What a holder reserves, in full". Rows I3-45, I3-51 and I3-52. Each function, on a counting made by hand.
describe("the amounts of a reservation, as pure functions (section 17.2 and 17.2a)", () => {
  test("the closure of an operation is counted by outcome entry, 2 for each attempt, with the closure of each kind that its mark lists: the verdict's kinds give 6 and 14, and a kind that reaches itself has none", () => {
    // "U has 3 attempts and opens nothing: C(U) is 6 entries. K has 1 attempt and lists U: one operation of K counts 2 times (1 + 6), which is 14 entries."
    const c = counting({ u: kind(3), k: kind(1, { operations: ["u"] }), loop: kind(1, { operations: ["loop"] }), far: kind(1, { operations: ["missing"] }) });
    expect([outcomes(kind(3)), closure(c, "u"), closure(c, "k")]).toEqual([6, entries(6), entries(14)]);
    // Not finite: a kind that reaches itself, and one that lists a kind whose attempts the data does not state.
    expect([closure(c, "loop"), closure(c, "far"), closure(c, "none")]).toEqual([null, null, null]);
  });

  test("a mark is counted at the worst case of its `most`: one operation of each listed kind, one item with what it reserves in its initial state, and one change of state for each effect; a held kind counts nothing there", () => {
    const [change, initial] = [entries(3), entries(2)];
    const c = counting({ u: kind(1), h: kind(1) }, ["h"], { change, initial: (type) => (type === "note" ? initial : NOTHING) });
    const most: Starts = { effects: 2, operations: ["u", "h"], opens: "note" };
    // Two changes of state at 3 entries; C(u), 2 entries; and the item with its 2. The held kind `h` draws on its holder.
    expect(starts(c, most, { item: true })).toEqual(entries(2 * 3 + 2 + 2, { items: 1 }));
    // Where the item draws on a count of a holder, it is not counted: `one(k)` does not count it.
    expect(starts(c, most, { item: false })).toEqual(entries(2 * 3 + 2));
    expect(itemOf(c, ["note", "other"])).toEqual(entries(2, { items: 1 }));
  });

  test("`one(k)` counts the outcome entries of a held kind, the closure of each kind that its mark lists and that no item holds, and its changes of state, in the five dimensions; nothing for a held kind, for its item or for its request", () => {
    const send = { once: false, clauses: [] };
    const c = counting({ k: kind(1, { effects: 1, operations: ["u", "h"], opens: "note" }, send, 100), u: kind(3, {}, send), h: kind(1) }, ["k", "h"], { change: entries(1), initial: () => entries(5) });
    // C(u): 6 outcome entries, and its request once for each: 2 entries, 1 pending request, and in bytes a diagnosis, a result and the result's source entry.
    const u = closure(c, "u")!;
    expect(u).toEqual({ entries: 6 + 6 * 2, items: 0, records: 0, bytes: 6 * EB + 6 * 3 * EB, requests: 6 });
    // `one(k)`: 2 outcome entries, each with its 100 bytes of retained values, the change of state and C(u). No item, no request, nothing for `h`.
    expect(one(c, "k")).toEqual({ entries: 2 * (1 + 1 + u.entries), items: 0, records: 0, bytes: 2 * (EB + 100 + EB + u.bytes), requests: 2 * 6 });
    expect([one(c, "h"), one(c, "none")]).toEqual([entries(2), null]);
  });

  test("a request that an outcome sends is counted with its operation: once where the send states `once`, and otherwise once for each outcome entry; a request reserves the largest of its clauses", () => {
    const clauses = [{ marks: [{ effects: 0, operations: ["u"], opens: null }], retains: 10 }, { marks: [], retains: 50 }];
    const c = counting({ u: kind(1), w: kind(2, {}, { once: false, clauses: [] }), o: kind(2, {}, { once: true, clauses: [] }) });
    // Row 1: 2 entries and 1 pending request. In bytes: the diagnosis, the result, and the source entry that the result newly retains.
    const bare = requestOf(c, [], { item: true })!;
    expect(bare).toEqual({ entries: 2, items: 0, records: 0, bytes: 3 * EB, requests: 1 });
    // The largest over the clauses, by dimension: C(u), 2 entries, of the first clause, and the 50 bytes of the second beside 2 entries' own.
    expect(requestOf(c, clauses, { item: true })).toEqual({ entries: 2 + 2, items: 0, records: 0, bytes: 3 * EB + 2 * EB + 10, requests: 1 });
    // 4 outcome entries. Without `once`, 4 requests; with it, 1.
    expect([closure(c, "w"), closure(c, "o")]).toEqual([{ ...entries(4), entries: 4 + 8, bytes: 4 * EB + 12 * EB, requests: 4 }, { ...entries(4), entries: 4 + 2, bytes: 4 * EB + 3 * EB, requests: 1 }]);
  });

  test("the bytes of the values that an observation names are counted from the rows: one value for each record of `retains`, at its `max`", () => {
    // Section 17.2, "A value that an observation names". The rows are in the contract's form; no validator of this source reads them yet.
    expect([retainedBytes([{ of: "rules", retains: [{ domain: "x-1", max: 300 }, { domain: "y-1", max: 20 }] }, { of: "key" }, { of: "rules", retains: [{ domain: "z-1", max: 1 }] }]), retainedBytes(undefined), retainedBytes([{ retains: [{ max: -1 }] }])]).toEqual([321, 0, 0]);
  });
});

// Witness 18.47, cases 1 to 3, and witness 18.49, cases 1, 2 and 9 to 11, with the control of revision 22: the validator (B1).
describe("the validator's checks of `holds`, `adds` and what a mark may start (section 17.2a, \"What the validator checks\")", () => {
  test("18.47 case 1: kinds that open each other in a circle validate when each is held, and a job reserves 8 entries and 1 pending request", () => {
    const r = worksDefinition.reserving!;
    // 6 entries for three operations and 2 for the request. In bytes: each of the 8 entries, and the source entry of the result.
    expect(r.holders["job"]).toEqual({ holds: { operations: { step: 2, tidy: 1 }, requests: 1 }, amount: { entries: 8, items: 0, records: 0, bytes: 9 * EB, requests: 1 } });
    expect([r.kinds["step"]!.whole, r.kinds["tidy"]!.whole, r.req, r.itm]).toEqual([entries(2), entries(2), { ...entries(2), bytes: 3 * EB, requests: 1 }, { ...NOTHING, items: 1 }]);
    // The act `again` adds the 2 entries of one more `step`.
    expect(r.adds["again"]).toEqual({ on: "job", adds: { operations: { step: 1 } }, amount: entries(2) });
    // What an outcome of each kind can reach, for the rule of release: the mark of `step` lists `step` and `tidy`.
    expect([r.kinds["step"]!.reach, r.kinds["tidy"]!.reach, r.kinds["step"]!.held]).toEqual([["step", "tidy"], [], true]);
  });

  test("18.47 case 2: without `holds` and `adds` the closure of `step` holds `step`, and the data is refused `reserve-unbounded`", () => {
    expect(codes(changed(works, (d) => { delete d.items.job.holds; delete d.acts.again.adds; }))).toEqual(["reserve-unbounded outcomes.step"]);
  });

  test("18.47 case 3, and check 1 by its parts: a kind that `outcomes` does not have, a count that is no whole number from 1, `adds` on an act whose item holds nothing, and a member that is no count", () => {
    expect([
      codes(changed(works, (d) => { d.items.job.holds.operations.polish = 1; })),
      codes(changed(works, (d) => { d.items.job.holds.requests = 0; })),
      codes(changed(works, (d) => { d.items.job.holds.operations.step = PROPOSED_BOUNDS.listElements + 1; })),
      codes(changed(works, (d) => { d.acts.finish.adds = { operations: { step: 1 } }; delete d.items.job.holds; delete d.acts.again.adds; d.outcomes.step.most.operations = ["tidy"]; })),
      codes(changed(works, (d) => { d.items.job.holds.decisions = { stop: 1 }; })),
      // A kind that an item holds is counted by its data, so it states its attempts.
      codes(changed(works, (d) => { delete d.outcomes.tidy.attempts; })),
    ]).toEqual([["holds items.job.holds.operations.polish"], ["holds items.job.holds.requests"], ["holds items.job.holds.operations.step"], ["holds acts.finish.adds"], ["holds items.job.holds.decisions"], ["holds outcomes.tidy", "shape outcomes.step.most.operations"]]);
    // The members are platform data: a declared definition that states one is refused, as any member that the validator does not know.
    const { outcomes: _, ...declared } = structuredClone(works);
    const { holds: __, ...job } = declared.items["job"]!;
    expect(codes(validateDefinition({ ...declared, name: "works", receives: {} }, PROPOSED_BOUNDS))).toEqual(["shape items.job.holds"]);
    expect(codes(validateDefinition({ ...declared, name: "works", receives: {}, items: { ...declared.items, job } }, PROPOSED_BOUNDS))).toEqual(["shape acts.again.adds"]);
  });

  test("check 2: a type that states `holds` is opened only by new work: not by the mark of an outcome, not by a mark in a clause, and not by a handler of an advisory", () => {
    expect([
      codes(changed(works, (d) => { d.outcomes.tidy.most = { effects: 2, opens: "job" }; })),
      codes(changed(works, (d) => { d.outcomes.step.send.result = { applied: [{ code: "after", row: "P16", most: { effects: 2, opens: "job" } }] }; })),
      // A mark of a handler of a request may open one: its entry is new work.
      codes(changed(works, (d) => { d.receives.start.opens = null; d.receives.start.effects = [{ code: "begin", row: "P16", most: { effects: 2, opens: "job" } }]; })),
    ]).toEqual([["holds outcomes.tidy.most.opens"], ["holds outcomes.step.send.result.applied"], "valid"]);
    // A settling form is written with no free room. This source counts no mark of one, so a mark there that may open an item, or
    // an operation of a kind that no item holds, is refused. One that lists held kinds draws on a holder, and validates.
    const settling = (operations: string[]) => codes(changed(chain, (d) => { d.acts.finish.settles = { of: "on", in: ["open"] }; d.acts.finish.effects.push({ code: "after", row: "P16", most: { effects: 0, operations } }); }));
    expect([settling(["u"]), settling(["k"])]).toEqual([["reserve-unbounded acts.finish.effects.1"], "valid"]);
  });

  test("18.49 cases 1 and 2: a held kind reserves the closure of a kind that no item holds: C(u) is 6, `one(k)` is 14 and a job reserves 14; with no child, 2", () => {
    const r = chainDefinition.reserving!;
    expect([r.kinds["u"]!.whole, r.kinds["k"]!.whole, r.holders["job"]!.amount, r.kinds["u"]!.held]).toEqual([entries(6), entries(14), entries(14), false]);
    const r0 = valid(changed(chain, (d) => { d.outcomes.k.most.operations = []; })).reserving!;
    expect([r0.kinds["k"]!.whole, r0.holders["job"]!.amount]).toEqual([entries(2), entries(2)]);
  });

  test("18.49 cases 9 and 10, and the control of revision 22: check 5 edge by edge, and check 4: a kind that no item holds reaches no held kind, by its mark or by a clause of its send, and does not reach itself", () => {
    expect([
      // Edge 1: the mark of `u` lists the held kind `k`.
      codes(changed(chain, (d) => { d.outcomes.u.most = { effects: 0, operations: ["k"] }; })),
      // Check 4: the closure of `u` holds `u`.
      codes(changed(chain, (d) => { d.outcomes.u.most = { effects: 0, operations: ["u"] }; })),
      // Edge 2: a clause of the send of `u` holds an effect mark that lists `k`.
      codes(changed(chain, (d) => { d.outcomes.u.send = { code: "report", row: "P16", result: { applied: [{ code: "after", row: "P16", most: { effects: 0, operations: ["k"] } }] } }; })),
      // Edge 3: `v`, which no item holds, is below `u`, and its mark lists `k`. It is refused at `v`.
      codes(changed(chain, (d) => { d.outcomes.u.most = { effects: 0, operations: ["v"] }; d.outcomes.v = { code: "u", row: "P16", attempts: 1, most: { effects: 0, operations: ["k"] } }; })),
    ]).toEqual([["reserve-unbounded outcomes.u.most"], ["reserve-unbounded outcomes.u"], ["reserve-unbounded outcomes.u.send.result.applied"], ["reserve-unbounded outcomes.v.most"]]);
  });

  test("18.49 case 11: a mixed graph validates: `k` lists a held kind and a kind that no item holds, and a job reserves 14 and 2, which is 16 entries", () => {
    const mixed = valid(changed(chain, (d) => { d.items.job.holds.operations.h = 1; d.outcomes.k.most.operations = ["u", "h"]; d.outcomes.h = { code: "u", row: "P16", attempts: 1 }; }));
    expect([mixed.reserving!.holders["job"]!.amount, mixed.reserving!.kinds["k"]!.whole]).toEqual([entries(16), entries(14)]);
    // An outcome of `k` that opens an `h` states `for`, and draws the 1.
    const s = new Works(mixed);
    s.script.begin = ({ resolved }) => opened(0, "k", 1, resolved.self);
    expect(s.start()).toBe("written");
    const job = s.last.seq;
    s.script.derives = (_kind, _given, operation) => ({ effects: [], sends: [], opens: [{ owner: OWNER, kind: "h", attempts: 1, for: operation.for! }] });
    expect([s.outcome(s.opened()[0]!, 1, "confirmed"), s.state.holder(job), s.state.operationsFor(job).map((o) => o.kind)]).toEqual(["written", null, ["k", "h"]]);
  });
});

// Witness 18.47, cases 4 to 14: the fold and the admission. The owner of these cases is B2, on real storage. Here they are plain
// functions over the state in memory: the judges, the fold and the rule of admission are the ones that a scope runs.
describe("18.47: a reservation that an item holds is taken once, drawn down and released (section 17.2a)", () => {
  /** A scope under M whose `start` opens one `step` for the job that it opens. */
  const started = (free = 9) => {
    const s = new Works(worksDefinition);
    s.script.begin = ({ resolved }) => opened(0, "step", 1, resolved.self);
    const before = s.free(free).total();
    const result = s.start();
    // After the taking entry the budget is no part of a case, unless the case sets it again.
    const total = s.total();
    s.budget = Number.POSITIVE_INFINITY;
    return { s, before, total, result, job: s.last.seq, step: s.opened()[0]! };
  };
  const again = (to: Works, job: number, holder: number | undefined) => { to.script.derives = () => ({ effects: [], sends: [], opens: [{ owner: OWNER, kind: "step", attempts: 1, ...(holder === undefined ? {} : { for: holder }) }] }); return job; };

  test("cases 4 and 5: the taking entry is new work, admitted only with the whole amount: with 9 free entries it is written, and with 8 it is not decided", () => {
    const { s, before, total, result, job, step } = started(9);
    // 1 entry and the 8 of the item. The `operation` effect states `for: "self"`.
    expect([result, total - before, s.last.effects.find((effect) => effect.effect === "operation")]).toEqual(["written", 9, { effect: "operation", k: 0, owner: OWNER, kind: "step", attempts: 1, for: "self" }]);
    // The item still holds 1 `step`, 1 `tidy` and 1 request, and the open operation reserves 2 entries by row 5.
    expect([s.state.holder(job), s.state.operation(step)!.for, heldEntries(s.state, s.definition)]).toEqual([{ operations: { step: 1, tidy: 1 }, requests: 1 }, job, 6]);
    // The data states 1 attempt of a `step`: a rule that opens one with 2 has a fault.
    const more = new Works(worksDefinition);
    more.script.begin = ({ resolved }) => opened(0, "step", 2, resolved.self);
    expect(more.start()).toBe("unavailable");
    // Case 5: the entry and the item's 8 do not fit. Nothing is written.
    const short = started(8);
    expect([short.result, short.s.entries.length, short.s.state.holders()]).toEqual(["scope-full", 2, []]);
  });

  test("case 6: at a scope with no free room, the first outcome of the step opens the second step and sends the request: it is written, each draw is within a count, and used plus reserved does not grow", () => {
    const { s, job, step } = started();
    again(s, job, job);
    s.script.report = () => TELL;
    const before = s.free(0).total();
    expect([s.outcome(step, 1, "confirmed"), s.total() <= before, s.total()]).toEqual(["written", true, before - 1]);
    // The item still holds 1 `tidy`. The request has the job as its account, and the second step is for the job.
    expect([s.state.holder(job), s.state.account(s.last.seq, 0), s.state.accountsOf(job), s.state.operationsFor(job).map((o) => o.id)]).toEqual([{ operations: { tidy: 1 } }, job, [{ seq: s.last.seq, n: 0, item: job }], [step, s.opened()[0]]]);
  });

  test("a request and an item of the account draw on `requests` and `items`: a second request, and a second item, are past the count, and nothing is written", () => {
    // M with one more type, `note`, which the mark of `step` may open. A job holds 1 item beside its 1 request.
    const s = new Works(valid(changed(works, (d) => { d.items.note = { ...d.items.job, holds: undefined }; delete d.items.note.holds; d.items.job.holds.items = 1; d.outcomes.step.most = { effects: 2, operations: ["step", "tidy"], opens: "note" }; })));
    expect(s.definition.reserving!.holders["job"]!.amount).toEqual({ entries: 8, items: 1, records: 0, bytes: 9 * EB, requests: 1 });
    s.script.begin = ({ resolved }) => opened(0, "step", 1, resolved.self);
    expect(s.start()).toBe("written");
    const [job, first] = [s.last.seq, s.opened()[0]!];
    // The first outcome opens the second step, sends the request and opens a note: three draws, each within its count.
    s.script.report = () => TELL;
    s.script.derives = (_kind, { resolved }, operation) => ({ effects: [{ effect: "open", item: resolved.self, type: "note", state: "open" }], sends: [], opens: operation.id === first ? [{ owner: OWNER, kind: "step", attempts: 1, for: job }] : [] });
    expect([s.outcome(first, 1, "confirmed"), s.state.holder(job), s.item(s.last.seq).type]).toEqual(["written", { operations: { tidy: 1 } }, "note"]);
    const [second, written] = [s.opened()[0]!, s.entries.length];
    // The second outcome would open a second note: past the count of items. Without the note it would send a second request: past the count of requests.
    s.script.report = () => null;
    expect([s.outcome(second, 1, "confirmed"), s.entries.length]).toEqual(["unavailable", written]);
    s.script.report = () => TELL;
    s.script.derives = () => ({ effects: [], sends: [], opens: [] });
    expect([s.outcome(second, 1, "confirmed"), s.entries.length]).toEqual(["unavailable", written]);
    s.script.report = () => null;
    expect(s.outcome(second, 1, "confirmed")).toBe("written");
  });

  test("cases 7 and 8: a draw past a count is a fault, and so is an operation of a held kind with no `for`: nothing is written, and the outcome stays offered", () => {
    const { s, job, step } = started();
    again(s, job, job);
    expect(s.outcome(step, 1, "confirmed")).toBe("written");
    const second = s.opened()[0]!;
    const [written, held] = [s.entries.length, s.state.holder(job)];
    // Case 7: the count of `step` is 0.
    expect([s.outcome(second, 1, "confirmed"), s.entries.length, s.state.holder(job)]).toEqual(["unavailable", written, held]);
    // Case 8: a `tidy` with no `for`.
    s.script.derives = () => ({ effects: [], sends: [], opens: [{ owner: OWNER, kind: "tidy", attempts: 1 }] });
    expect([s.outcome(second, 1, "confirmed"), s.entries.length]).toEqual(["unavailable", written]);
    // The outcome is still offered: with a rule that stays inside the counts it is judged and written.
    s.script.derives = () => ({ effects: [], sends: [], opens: [{ owner: OWNER, kind: "tidy", attempts: 1, for: job }] });
    expect([s.outcome(second, 1, "confirmed"), s.state.holder(job)]).toEqual(["written", { requests: 1 }]);
    // The same faults, as the fold names them for an entry that no judge wrote: `past-count` and `no-holder`.
    const drawn = (change: (effect: Record<string, unknown>) => void) => {
      const entry = structuredClone(s.entries[written]!.entry);
      change(entry.effects.find((effect) => effect.effect === "operation") as unknown as Record<string, unknown>);
      const state = s.replay(written);
      const found = drawsOf(state, s.definition, entry);
      expect(() => applyEntry(state, s.definition, entry, entryHash(entry))).toThrow(FoldError);
      return "fault" in found ? found.fault : "drawn";
    };
    expect([drawn((effect) => { effect["kind"] = "step"; }), drawn((effect) => { delete effect["for"]; }), drawn((effect) => { effect["for"] = 0; }), drawn((effect) => { effect["for"] = "self"; })]).toEqual(["past-count", "no-holder", "no-holder", "no-holder"]);
  });

  test("case 9: an outcome of a step of one job opens a step for another job that is not final: the draw is on the other job, and this job's counts do not move", () => {
    const { s, job, step } = started();
    expect(s.start()).toBe("written");
    const other = s.last.seq;
    const held = s.state.holder(job);
    again(s, job, other);
    expect([s.outcome(step, 1, "confirmed"), s.state.holder(job), s.state.holder(other), s.state.operation(s.opened()[0]!)!.for]).toEqual(["written", held, { operations: { tidy: 1 }, requests: 1 }, other]);
  });

  test("cases 10 and 11: `again` is an adding entry, new work for its addition: with room for 3 entries the count of step rises by 1, with less it is refused scope-full, and on a final job it is refused `final`", () => {
    const { s, job } = started();
    // Its own entry, and the 2 of its addition.
    expect([s.free(2).does("again", on(s, job)), s.free(3).does("again", on(s, job)), s.state.holder(job)]).toEqual(["scope-full", "written", { operations: { step: 2, tidy: 1 }, requests: 1 }]);
    s.budget = Number.POSITIVE_INFINITY;
    expect(s.does("finish", on(s, job))).toBe("written");
    const judged = s.judge(s.intent(s.keyOf(), "again", on(s, job)), { platform: s.rules });
    expect([judged.result, judged.result === "refused" && judged.reason]).toEqual(["refused", "final"]);
  });

  test("cases 12 and 13: a final job keeps what its open operation can still reach, and the operation keeps 1 entry for its late answer; when every operation for it is settled it holds nothing, and what it did not use is free", () => {
    const base = new Works(worksDefinition).total();
    const { s, job, step } = started();
    expect([s.outcome(step, 1, "unknown"), s.does("finish", on(s, job))]).toEqual(["written", "written"]);
    // The mark of `step` reaches `step` and `tidy`. The job still holds what is left of both, and of its request.
    expect([s.item(job).state, s.state.holder(job), pendingOf(s.state.operation(step)!)]).toEqual(["done", { operations: { step: 1, tidy: 1 }, requests: 1 }, { opened: 0, unknown: 1, unopened: 0 }]);
    expect(s.reserved()).toBe(1 + 6 + 1);
    // Case 13: the late answer settles the operation. Nothing can be reached, and the job holds nothing.
    expect([s.outcome(step, 1, "confirmed"), s.state.holder(job), s.state.holders(), s.total() - base]).toEqual(["written", null, [], 4]);
    // Nothing can then draw on it: an operation for it is a fault.
    expect(s.start()).toBe("written");
    again(s, job, job);
    expect(s.outcome(s.opened()[0]!, 1, "confirmed")).toBe("unavailable");
  });

  test("the release of a final holder keeps a count while a clause of a pending request of its account can reach the kind, and the clause's entry draws on that account", () => {
    // M with one change: the clause `applied` of the send of `step` holds a mark that lists `tidy`.
    const s = new Works(valid(changed(works, (d) => { d.outcomes.step.send.result = { applied: [{ code: "after", row: "P16", most: { effects: 0, operations: ["tidy"] } }] }; })));
    s.script.begin = ({ resolved }) => opened(0, "step", 1, resolved.self);
    s.script.report = () => TELL;
    expect(s.start()).toBe("written");
    const [job, step] = [s.last.seq, s.opened()[0]!];
    expect([s.does("finish", on(s, job)), s.outcome(step, 1, "confirmed")]).toEqual(["written", "written"]);
    const sent = s.last.seq;
    // The job is final and its one operation is settled. Its request is pending, and a clause of it can reach `tidy`: that count stays.
    expect([s.state.holder(job), s.definition.reserving!.reach]).toEqual([{ operations: { tidy: 1 } }, ["tidy"]]);
    // A mark that states `most` opens one operation of each kind that it lists, and no other: a `step` there is a fault of the rule.
    s.script.after = () => opened(0, "step", 1, job);
    expect(s.answered(sent)).toBe("unavailable");
    // The result arrives at a scope with no free room. Its clause opens the `tidy` for the job: the account of the delivery is the job.
    s.script.after = () => opened(0, "tidy", 1, job);
    const before = s.free(0).total();
    expect([s.answered(sent), s.total() <= before, s.state.holder(job), s.state.operationsFor(job).map((o) => o.kind)]).toEqual(["written", true, null, ["step", "tidy"]]);
  });

  test("case 14: the state that a checkpoint digests holds each job's counts, the holder of each operation and the account of each request, so a reader that starts at it derives the same amounts", () => {
    const { s, job, step } = started();
    again(s, job, job);
    s.script.report = () => TELL;
    expect(s.outcome(step, 1, "confirmed")).toBe("written");
    const snapshot = s.state.all();
    expect([snapshot.holders, snapshot.accounts, snapshot.operations.map((o) => o.for)]).toEqual([[{ item: job, held: { operations: { tidy: 1 } } }], [{ seq: s.last.seq, n: 0, item: job }], [job, job]]);
    // A reader that starts at the checkpoint: a state made of the snapshot's members alone reserves the same.
    const reader = new MemoryState();
    reader.setScope(snapshot.scope!);
    for (const item of snapshot.items) reader.putItem(item);
    for (const [type, state, n] of snapshot.counts) reader.addCount(type, state, n);
    for (const request of snapshot.requests) reader.putRequest(request);
    for (const operation of snapshot.operations) reader.putOperation(operation);
    for (const holder of snapshot.holders ?? []) reader.putHolder(holder.item, holder.held);
    for (const account of snapshot.accounts ?? []) reader.putAccount(account);
    expect([owed(reader, s.definition, s.last.input), reader.all().holders, reader.all().accounts]).toEqual([s.reserved(), snapshot.holders, snapshot.accounts]);
    // The digest covers the counts and the accounts: a state that differs in one of them has another digest.
    const digest = stateDigest(snapshot);
    expect([stateDigest({ ...snapshot, holders: [{ item: job, held: { operations: { tidy: 2 } } }] }), stateDigest({ ...snapshot, accounts: [] }), stateDigest({ ...snapshot, operations: snapshot.operations.map(({ for: _, ...operation }) => operation) })].includes(digest)).toBe(false);
    // A state under a definition that states no `holds` has no such member, so its digest is the one it had.
    expect(Object.keys(new Works(valid(changed(works, (d) => { delete d.items.job.holds; delete d.acts.again.adds; d.outcomes.step.most.operations = []; }))).state.all())).not.toContain("holders");
  });
});

// Witness 18.49, cases 3 to 8: a held kind opens a kind that no item holds, at capacity, with its control (B2; here in memory).
describe("18.49: a held kind opens a kind that no item holds, at capacity (sections 17.2 and 17.2a)", () => {
  const started = (definition = chainDefinition, free = 15) => {
    const s = new Works(definition);
    s.script.begin = ({ resolved }) => opened(0, "k", 1, resolved.self);
    const before = s.free(free).total();
    const result = s.start();
    const total = s.total();
    s.budget = Number.POSITIVE_INFINITY;
    return { s, before, total, result, job: s.last.seq, k: s.opened()[0]! };
  };
  const opensU = (s: Works) => { s.script.derives = (kind) => ({ effects: [], sends: [], opens: kind === "k" ? [{ owner: OWNER, kind: "u", attempts: 3 }] : [] }); };

  test("cases 3 and 4: the taking entry needs 1 entry and the 14 of the item: with 15 free it is written, and the open operation of `k` reserves the 14; with 14 it is not decided", () => {
    const { s, before, total, result, job } = started(chainDefinition, 15);
    // The job holds no count of `k`, and the open operation reserves `one(k)`.
    expect([result, total - before, s.state.holder(job), s.reserved() - new Works(chainDefinition).reserved()]).toEqual(["written", 15, null, 14]);
    // By the count of revision 20 it needed 3 and was written: that is the verdict's case.
    expect([started(chainDefinition, 14).result, started(chainDefinition, 3).result]).toEqual(["scope-full", "scope-full"]);
  });

  test("cases 5 and 6: with no free room, the outcome of `k` opens one `u` with no `for`: C(u) moves to the operation of `u`, what was not used is released, and each outcome of the three attempts of `u` is written", () => {
    const { s, k } = started();
    const base = new Works(chainDefinition).total() + 1;
    opensU(s);
    const before = s.free(0).total();
    // Used plus reserved for the job was 14, and is 1 and 6. It did not grow.
    expect([before - base, s.outcome(k, 1, "confirmed"), s.total() - base, s.last.effects.filter((effect) => effect.effect === "operation")]).toEqual([14, "written", 1 + 6, [{ effect: "operation", k: 0, owner: OWNER, kind: "u", attempts: 3 }]]);
    const u = s.opened()[0]!;
    // Case 6: settling entries of the operation of `u`, which reserved 6. The budget is the one of case 5: no room beside it.
    s.script.retries = true;
    expect([s.outcome(u, 1, "refused"), s.outcome(u, 2, "unknown"), s.outcome(u, 3, "refused"), s.outcome(u, 2, "confirmed"), s.total() <= before, s.state.operation(u)!.attempts.length]).toEqual(["written", "written", "written", "written", true, 3]);
    expect(s.total() - base).toBe(1 + 4);
  });

  test("cases 7 and 8, the control: with no child a job reserves 2, a `start` is written with 3 free entries, and an outcome of `k` whose rule opens a `u` that its mark does not list has a fault", () => {
    const m0 = valid(changed(chain, (d) => { d.outcomes.k.most.operations = []; }));
    const { s, result, k } = started(m0, 3);
    expect([result, started(m0, 2).result]).toEqual(["written", "scope-full"]);
    opensU(s);
    const written = s.entries.length;
    expect([s.outcome(k, 1, "confirmed"), s.entries.length]).toEqual(["unavailable", written]);
    // Under M the same outcome may not open two of one kind, or state more attempts than the data of `u` does.
    const m = started().s;
    const twice = (opens: { kind: string; attempts: number }[]) => { m.script.derives = () => ({ effects: [], sends: [], opens: opens.map((open) => ({ owner: OWNER, ...open })) }); return m.outcome(m.opened(m.entries[2]!.entry)[0]!, 1, "confirmed"); };
    expect([twice([{ kind: "u", attempts: 3 }, { kind: "u", attempts: 3 }]), twice([{ kind: "u", attempts: 4 }])]).toEqual(["unavailable", "unavailable"]);
    // A kind that is counted by its data sends only the request of its `send`: a request of the rule's own was reserved by nobody.
    m.script.derives = () => ({ effects: [], sends: [TELL], opens: [] });
    expect(m.outcome(m.opened(m.entries[2]!.entry)[0]!, 1, "confirmed")).toBe("unavailable");
    expect(twice([{ kind: "u", attempts: 2 }])).toBe("written");
  });
});

// Row I3-45: a request that the send of an outcome's kind can make is counted with its operation (I3 delta FC2).
describe("a request that an outcome sends is reserved with its operation (section 17.2)", () => {
  /** `chain` with one more kind, `w`, that no item holds: 2 attempts, and a send with empty clauses. A `start` opens one `w`. */
  const withSend = (once: boolean) => {
    const s = new Works(valid(changed(chain, (d) => { d.outcomes.w = { code: "u", row: "P16", attempts: 2, send: { code: "report", row: "P16", result: {}, ...(once ? { once: true } : {}) } }; })));
    s.script.begin = () => opened(0, "w", 2);
    s.script.report = () => TELL;
    s.script.retries = true;
    const before = s.total();
    expect(s.start()).toBe("written");
    return { s, before, w: s.opened()[0]! };
  };

  test("without `once` the operation reserves the request once for each outcome entry that it may still write, and every outcome that sends it is written with no free room", () => {
    const { s, before, w } = withSend(false);
    // The entry, the job's 14, and C(w): 4 outcome entries, each with a request of 2 entries.
    expect(s.total() - before).toBe(1 + 14 + 4 + 4 * 2);
    const full = s.free(0).total();
    expect([s.outcome(w, 1, "refused"), s.outcome(w, 2, "confirmed"), s.total() <= full, s.state.outstanding().requests]).toEqual(["written", "written", true, 2]);
  });

  test("with `once` it reserves the request once; the first outcome that sends it is written with no free room, and a second request of that operation is a fault", () => {
    const { s, before, w } = withSend(true);
    expect([s.total() - before, s.definition.reserving!.kinds["w"]!.whole]).toEqual([1 + 14 + 4 + 2, { entries: 6, items: 0, records: 0, bytes: 4 * EB + 3 * EB, requests: 1 }]);
    const full = s.free(0).total();
    expect([s.outcome(w, 1, "refused"), s.total() <= full, s.state.operation(w)!.sent, s.state.outstanding().outcomes]).toEqual(["written", true, true, [{ owner: OWNER, kind: "w", entries: 2, unsent: 0 }]]);
    const written = s.entries.length;
    expect([s.outcome(w, 2, "confirmed"), s.entries.length]).toEqual(["unavailable", written]);
    s.script.report = () => null;
    expect(s.outcome(w, 2, "confirmed")).toBe("written");
  });
});

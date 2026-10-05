import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { ActType, Bounds, DeclaredDefinition, FieldValue, Guard, Operand, Range, Send } from "@generalbusiness/artroom-contract";
import { factRefOf } from "@generalbusiness/artroom-bytes";
import { judgeDelivery, validateDefinition, type ActJudgment, type Fetched, type ProblemCode } from "../src/index.ts";
import { Scope, arriving, desk, fields, forged, founded, keys, on, ticketDefinition, valid, variant } from "./fixtures.ts";

const { rita } = keys;

/**
 * A board with jobs, made up for these tests. The board keeps the names of
 * the checks it requires, and a number of approvals. A job has a name, and
 * is requested, then passed or failed. `merge` needs, for each required
 * check, no failed job and a passed job of that name.
 */
const text = { type: "text", max: 40 } as const;
const count = { type: "int", min: 0, max: 9 } as const;
const slot = { fixed: false, required: false } as const;
const act = (a: Partial<ActType> & Pick<ActType, "step" | "on" | "grant">): ActType => ({ also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [], ...a });
/** The jobs in those states with that name. */
const named = (states: string[], name: Operand, more: Partial<Range> = {}): Range => ({ type: "job", states, where: [{ equals: { a: { slot: "name" }, b: name } }], ...more });
const settle = (state: string) => act({ step: "transition", on: "job", grant: "check", guards: [{ state: ["requested"] }], effects: [{ state }] });
const jobs: DeclaredDefinition = {
  format: "artroom-definition-1", name: "jobs", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "start",
  items: {
    board: {
      many: false, max: 1, states: { open: { final: false } }, initial: "open", parties: { owner: { fixed: true, required: true, list: false, author: false } }, refs: {},
      values: { required: { ...slot, of: { type: "list", of: text, max: 8 } }, approvals: { ...slot, of: count }, spare: { ...slot, of: count } },
    },
    job: { many: true, max: 16, states: { requested: { final: false }, passed: { final: true }, failed: { final: true } }, initial: "requested", parties: {}, refs: {}, values: { name: { fixed: true, required: true, of: text } } },
  },
  acts: {
    start: act({ step: "open", on: "board", grant: "start", fields: { opener: { type: "member", required: true } }, effects: [{ party: { slot: "owner", from: { field: "opener" } } }] }),
    rule: act({
      step: "transition", on: "board", grant: "rule", fields: { required: { type: "list", of: text, max: 8, required: true }, approvals: { ...count, required: true } },
      effects: [{ value: { slot: "required", from: { field: "required" } } }, { value: { slot: "approvals", from: { field: "approvals" } } }],
    }),
    request: act({ step: "open", on: "job", grant: "request", fields: { name: { ...text, required: true } }, effects: [{ value: { slot: "name", from: { field: "name" } } }] }),
    pass: settle("passed"),
    fail: settle("failed"),
    merge: act({
      step: "transition", on: "board", grant: "merge",
      guards: [{ each: { list: { slot: "required" }, as: "k", guards: [{ none: named(["failed"], { element: "k" }) }, { some: named(["passed"], { element: "k" }) }] }, reason: "required-check-not-passed" }],
    }),
  },
  receives: {}, timed: {}, rules: {},
};

/** A board that requires those checks, with those jobs in the order given, each left requested or settled. `ordinal` tells two boards apart. */
function board(definition: ReturnType<typeof valid>, required: string[], made: [name: string, end: "pass" | "fail" | null][], ordinal = 0): Scope {
  const s = new Scope(definition, rita.member, true, ordinal);
  s.did(rita, "rule", { ...on(s, 0), ...fields({ required, approvals: 4 }) });
  for (const [name, end] of made) {
    const job = s.did(rita, "request", fields({ name })).seq;
    if (end) s.did(rita, end, on(s, job));
  }
  return s;
}
/** What a judgment says: that the act is written, the name or the code of its refusal, or why it is not judged. */
const said = (j: ActJudgment) => (j.result === "write" ? "passes" : j.result === "refused" ? (j.name ?? j.reason) : j.result === "unavailable" ? j.reason : j.result);
/** A scan that stops after three items. */
const stopped: Bounds = { ...PROPOSED_BOUNDS, guardPage: 2, guardScan: 3 };

describe("list guards with an unfinished scan (section 6.5; witness 18.2)", () => {
  test("each required check needs a passed job: both pass; one has none, on complete evidence; one read stops with no witness; one is false and another's read stops", () => {
    const definition = valid(validateDefinition(jobs, PROPOSED_BOUNDS));
    const merge = (required: string[], made: Parameters<typeof board>[2], bounds = PROPOSED_BOUNDS) => {
      const s = board(definition, required, made);
      const j = s.judge(s.intent(rita, "merge", on(s, 0)), { bounds });
      return j.result === "refused" ? [said(j), j.reason, j.detail] : said(j);
    };
    const others: Parameters<typeof board>[2] = [["x", "pass"], ["x", "pass"], ["x", "pass"]];
    const refused = ["required-check-not-passed", "guard-failed", "guards.0"];
    expect([
      // Case 1: `a` passed and `b` passed. Each `some` holds by one witness.
      merge(["a", "b"], [["a", "pass"], ["b", "pass"]]),
      // Case 2: `b` has no passed job. Every page was read, so that is complete evidence, and the refusal carries the guard's name.
      merge(["a", "b"], [["a", "pass"], ["b", null]]),
      // Case 3: `a` passed, by a witness in the first page. The read for `b` stops at the work limit with no witness. No guard is false.
      merge(["a", "b"], [["a", "pass"], ...others], stopped),
      merge(["a", "b"], [["a", "pass"], ...others]),
      // Case 4: the read for `b` stops, and then `a` has a failed job, by one witness. One guard of the list is false on a completed
      // evaluation, and the unfinished read before it cannot change that.
      merge(["b", "a"], [["a", "fail"], ...others], stopped),
    ]).toEqual(["passes", refused, "guard-incomplete", refused, refused]);
  });
});

// One row of a table: an act with these guards, judged on the shared board with these fields. `job`: the item its `also.job` names.
type Row = [name: string, guards: Guard[], given: (s: Scope) => Record<string, FieldValue>, expected: string, more?: { job?: number; bounds?: Bounds }];
const facts = (...kind: string[]) => ({ type: "list", of: { type: "fact", kind, under: "jobs" }, max: 8, required: false }) as const;
const probing = (rows: readonly Row[]) => variant(jobs, (d) => rows.forEach(([, guards, , , more], i) => {
  d.acts[`probe-${i}`] = act({
    step: "transition", on: "board", grant: "merge", guards, also: more?.job === undefined ? {} : { job: { item: "job", by: "job" } },
    fields: {
      names: { type: "list", of: text, max: 8, required: false }, listed: { type: "list", of: { type: "item", of: "job" }, max: 8, required: false },
      stated: facts("request", "pass"), proofs: facts("pass"), ...(more?.job === undefined ? {} : { job: { type: "item", of: "job", required: true } }),
    },
  });
}));
/**
 * The shared board. Entry 2 sets the rules. Jobs 3 to 8 are named a, x, x,
 * x, f and r. Entries 9 to 12 pass jobs 3 to 6, and entry 13 fails job 7.
 * Job 8 stays requested. Nothing is written after that: every row is judged
 * and not sealed. Returns the name of each row whose result is not the one
 * expected, with what it was.
 */
function judged(rows: readonly Row[]): [string, string][] {
  const s = board(probing(rows), ["a"], [["a", null], ["x", null], ["x", null], ["x", null], ["f", null], ["r", null]]);
  for (const job of [3, 4, 5, 6]) s.did(rita, "pass", on(s, job));
  s.did(rita, "fail", on(s, 7));
  return rows.flatMap(([name, , given, expected, more], i): [string, string][] => {
    const job = more?.job;
    const result = said(s.judge(s.intent(rita, `probe-${i}`, { ...on(s, 0, job === undefined ? {} : { job }), ...fields({ ...given(s), ...(job === undefined ? {} : { job }) }) }), { bounds: more?.bounds ?? PROPOSED_BOUNDS }));
    return result === expected ? [] : [[name, result]];
  });
}
const none = () => ({});
const some = (states: string[], name: Operand): Guard => ({ some: named(states, name) });
// Over the passed jobs, a witness for `a` is in the first page; a scan for a name that no job has does not finish when it stops after three.
const holds = some(["passed"], { const: "a" });
const fails = some(["failed"], { const: "zz" });
const open = some(["passed"], { const: "zz" });

describe("the list forms (section 6.5)", () => {
  test("`anyOf`, `has` and `each` have three results: an alternative or an element that holds completes the form, and one that is not completed leaves it so only when nothing else decides", () => {
    const n: Operand = { element: "n" };
    const kept = [{ differs: { a: n, b: { const: "skip" } } }];
    const has: Guard[] = [{ has: { list: { field: "names" }, as: "n", where: kept, guards: [some(["passed"], n)] } }];
    const each: Guard[] = [{ each: { list: { field: "names" }, as: "n", where: kept, guards: [some(["passed"], n)] } }];
    const names = (...list: string[]) => () => ({ names: list });
    expect(judged([
      // The guards of an act are one list: the first is not completed, and the second is false on complete evidence.
      ["a guard that is false refuses, after one that is not completed", [open, { ...fails, reason: "later" }], none, "later", { bounds: stopped }],
      ["an alternative holds beside one that is not completed", [{ anyOf: [[open], [holds]] }], none, "passes", { bounds: stopped }],
      ["no alternative holds, and one is not completed", [{ anyOf: [[open], [fails]] }], none, "guard-incomplete", { bounds: stopped }],
      ["an alternative with a false guard is false, whatever its other guards are", [{ anyOf: [[open, fails]], reason: "no-alternative" }], none, "no-alternative", { bounds: stopped }],
      ["every alternative is false", [{ anyOf: [[fails], [holds, fails]] }], none, "guard-failed"],
      ["`has`: an element holds beside one that is not completed", has, names("zz", "a"), "passes", { bounds: stopped }],
      ["`has`: no element holds, and one is not completed", has, names("zz"), "guard-incomplete", { bounds: stopped }],
      ["`has`: an empty list fails", has, names(), "guard-failed"],
      ["`has`: a field that is absent is an empty list", has, none, "guard-failed"],
      ["`has`: an element that the `where` leaves out is not judged", [{ has: { list: { field: "names" }, as: "n", where: [{ differs: { a: n, b: { const: "a" } } }], guards: [some(["passed"], n)] } }], names("a"), "guard-failed"],
      ["`each`: an empty list holds", each, names(), "passes"],
      ["`each`: an element that the `where` leaves out is not judged", each, names("skip", "a"), "passes"],
      ["`each`: every other element is judged", each, names("skip", "a", "f"), "guard-failed"],
      // The nested guard reads the state of the job, which is the subject of the guard that holds it.
      ["a nested guard takes the subject of the guard that holds it", [{ of: "also.job", anyOf: [[{ state: ["failed"] }]] }], none, "passes", { job: 7 }],
      ["and fails on that subject", [{ of: "also.job", anyOf: [[{ state: ["failed"] }]] }], none, "guard-failed", { job: 8 }],
    ])).toEqual([]);
  });

  test("a range leaves out the `except` subjects and takes `differs`; a count takes its bound from a slot; `distinct` and `sameSet` compare keys, and `sameSet` is an exact set on complete evidence", () => {
    const key: Operand = { element: "f", part: { field: "name" } };
    const distinct: Guard[] = [{ distinct: { list: { field: "stated" }, as: "f", key } }];
    const stated = (...seqs: number[]) => (s: Scope) => ({ stated: seqs.map((seq) => s.fact(seq)) });
    const same = (states: string[], more: object = {}): Guard[] => [{ sameSet: { list: { field: "listed" }, as: "j", key: { element: "j" }, items: { type: "job", states }, ...more } }];
    const listed = (...ids: number[]) => () => ({ listed: ids });
    const unsettled = ["failed", "requested"];
    expect(judged([
      // From the exact counts: one job is requested, and it is the one left out.
      ["a range with no `where` leaves out the `except` subject", [{ none: { type: "job", states: ["requested"], except: ["also.job"] } }], none, "passes", { job: 8 }],
      ["an `except` subject in another state leaves nothing out", [{ none: { type: "job", states: ["requested"], except: ["also.job"] } }], none, "guard-failed", { job: 7 }],
      ["a range with a `where` leaves out the `except` subject", [{ none: named(["failed"], { const: "f" }, { except: ["also.job"] }) }], none, "passes", { job: 7 }],
      ["a range with a `where` keeps every other item", [{ none: named(["failed"], { const: "f" }, { except: ["also.job"] }) }], none, "guard-failed", { job: 8 }],
      ["a `where` takes `differs`", [{ some: { type: "job", states: ["failed"], where: [{ differs: { a: { slot: "name" }, b: { const: "f" } } }] } }], none, "guard-failed"],
      // The board's `approvals` is 4, and four jobs passed.
      ["a `min` read from a slot is met", [{ count: { type: "job", states: ["passed"], min: { slot: "approvals" } } }], none, "passes"],
      ["a `max` read from a slot is broken", [{ count: { type: "job", states: ["passed", "failed"], max: { slot: "approvals" } } }], none, "guard-failed"],
      ["a bound read from an empty slot fails the guard", [{ count: { type: "job", states: ["passed"], min: { slot: "spare" } } }], none, "guard-failed"],
      // The key is the `name` field of each entry, read from this scope's own history. Entry 9 is a `pass`, which has none.
      ["`distinct`: two keys", distinct, stated(3, 4), "passes"],
      ["`distinct`: two elements with one key", distinct, stated(4, 5), "guard-failed"],
      ["`distinct`: a key that is none", distinct, stated(3, 9), "guard-failed"],
      ["`sameSet`: the keys are the items of the range", same(unsettled, { ordered: true }), listed(7, 8), "passes"],
      ["`sameSet`: with `ordered`, the keys ascend", same(unsettled, { ordered: true }), listed(8, 7), "guard-failed"],
      ["`sameSet`: in any order without it", same(unsettled), listed(8, 7), "passes"],
      ["`sameSet`: an item with no key", same(unsettled), listed(7), "guard-failed"],
      ["`sameSet`: a key with no item", same(["failed"]), listed(7, 8), "guard-failed"],
      ["`sameSet`: a key twice", same(["failed"]), listed(7, 7), "guard-failed"],
      ["`sameSet`: `match` holds between each element and its own item", same(unsettled, { match: [{ differs: { a: { slot: "name" }, b: { const: "q" } } }] }), listed(7, 8), "passes"],
      ["`sameSet`: `match` fails on one item", same(unsettled, { match: [{ differs: { a: { slot: "name" }, b: { const: "r" } } }] }), listed(7, 8), "guard-failed"],
      ["`sameSet`: the range is not read whole", same(["passed"]), listed(3, 4, 5, 6), "guard-incomplete", { bounds: stopped }],
      ["`sameSet`: the same range, read whole", same(["passed"]), listed(3, 4, 5, 6), "passes"],
    ])).toEqual([]);
  });

  test("a `fact` guard over an element holds for each fact of a list: a local entry of a kind the list states, and a fetched entry, which is then in `uses`", () => {
    const rows: Row[] = [["each proof is a `pass`", [{ each: { list: { field: "proofs" }, as: "p", guards: [{ fact: { element: "p" } }] }, reason: "not-a-pass" }], none, "passes"]];
    const definition = probing(rows);
    const s = board(definition, [], [["a", "pass"], ["b", null]]);   // entry 3 requests job 3, entry 4 passes it, and entry 5 requests job 5
    const m = board(definition, [], [["c", "pass"]], 1);
    const fetched: Fetched = { fact: m.fact(4), entry: m.entries[4]!.entry, under: m.under };
    const probe = (proofs: FieldValue[], facts: Fetched[] = []) => s.judge(s.intent(rita, "probe-0", { ...on(s, 0), ...fields({ proofs }) }), { facts });
    const foreign = probe([s.fact(4), m.fact(4)], [fetched]);
    expect([said(foreign), foreign.result === "write" && foreign.draft.uses.map((u) => u.fact)]).toEqual(["passes", [m.fact(4)]]);
    // Entry 5 is this scope's own, and is a `request`: a value of the field's type, and not an entry of the kind that the type states.
    expect(said(probe([s.fact(4), s.fact(5)]))).toBe("not-a-pass");
  });

  test("a handler reads the members of a record element of a list in its message", () => {
    const checked = (name: Operand): Guard => ({ each: { list: { field: "checks" }, as: "k", where: [{ equals: { a: { element: "k.required" }, b: { const: true } } }], guards: [{ differs: { a: { element: "k.name" }, b: name } }] }, reason: "required" });
    const auditing = variant(desk, (d) => {
      const check = { type: "record", of: { name: { type: "text", max: 16, required: true }, required: { type: "bool", required: true } } };
      d.receives.audit = {
        message: "audit", class: "tell", from: { kind: "lane" }, fields: { barred: { type: "text", max: 16, required: true }, checks: { type: "list", of: check, max: 4, required: true } }, opens: null,
        also: {}, guards: [checked({ field: "barred" })], effects: [], sends: [], attention: [],
      };
    });
    const D = founded();
    const X = new Scope(ticketDefinition);
    const decision = (barred: string, checks: unknown = [{ name: "lint", required: true }, { name: "docs", required: false }]) => {
      const tell: Send = { n: 0, to: D.at, message: { class: "request", type: "tell", body: { message: "audit", fields: { barred, checks } } } };
      const source = forged(X.at, 1, X.entries[1]!.entry.input, [tell]);
      const arrival = { ...tell, from: factRefOf(source.entry) };
      const j = judgeDelivery(D.state, auditing, arrival, arriving(D, arrival, source));
      return j.result === "write" && j.draft.input.type === "delivery" && "decision" in j.draft.input ? [j.draft.input.decision, j.draft.input.reason] : j.result;
    };
    // `docs` is not required, so the `where` leaves it out. `lint` is required, and is judged.
    expect([decision("docs"), decision("lint")]).toEqual([["applied", undefined], ["refused", { code: "guard-failed", name: "required" }]]);
    // A handler declares the fields of its message, so a value that is no list of such records is no value of the field.
    expect(decision("docs", "lint")).toEqual(["refused", { code: "bad-field" }]);
  });

  test("the validator refuses a list form that names what it does not have, and a nesting past the bounds", () => {
    const refusal = (change: (d: any) => void, bounds = PROPOSED_BOUNDS) => {   // eslint-disable-line @typescript-eslint/no-explicit-any
      const d = structuredClone(jobs);
      change(d);
      const result = validateDefinition(d, bounds);
      return result.ok ? null : [...new Set(result.problems.map((p) => p.code))];
    };
    const inMerge = (guard: unknown, bounds = PROPOSED_BOUNDS) => refusal((d) => d.acts.merge.guards.push(guard), bounds);
    const k: Operand = { element: "k" };
    const each = (guards: unknown[], list: unknown = { slot: "required" }) => ({ each: { list, as: "k", guards } });
    /** A guard nested that many deep: an `anyOf` in an `anyOf`, and so on. */
    const deep = (depth: number): unknown => (depth === 1 ? { state: ["open"] } : { anyOf: [[deep(depth - 1)]] });
    const rows: [string, ProblemCode[] | null, ProblemCode | null][] = [
      ["an element outside the form that binds it", inMerge({ anyOf: [[each([]), { equals: { a: k, b: { const: "a" } } }]] }), "name"],
      ["a list form over a value that is no list", inMerge(each([], { slot: "approvals" })), "name"],
      ["a member of an element that is no record", inMerge(each([{ equals: { a: { element: "k.name" }, b: { const: "a" } } }])), "name"],
      ["a name for an element with a dot in it", inMerge({ each: { list: { slot: "required" }, as: "k.name", guards: [] } }), "shape"],
      ["a `fact` guard over an element that is not a fact", inMerge(each([{ fact: { element: "k" } }])), "name"],
      ["a `where` on a `fact` guard over an element", inMerge(each([{ fact: { element: "k", where: [] } }])), "shape"],
      ["`ifPresent` on a guard that names no field", inMerge({ ...each([]), ifPresent: true }), "shape"],
      ["an `anyOf` with no alternative", inMerge({ anyOf: [] }), "shape"],
      ["a `has` with no `where`", inMerge({ has: { list: { slot: "required" }, as: "k" } }), "shape"],
      ["an `except` subject of another type", inMerge({ none: { type: "job", states: ["requested"], except: ["on"] } }), "name"],
      ["an `except` subject that is the item its act opens", refusal((d) => d.acts.request.guards.push({ none: { type: "job", states: ["requested"], except: ["on"] } })), "nascent-guard"],
      ["a `sameSet` range that names the element", inMerge({ sameSet: { list: { slot: "required" }, as: "k", key: k, items: named(["requested"], k) } }), "name"],
      ["a count bound from a slot that is no number", inMerge({ count: { type: "job", states: ["passed"], min: { slot: "required" } } }), "name"],
      ["a nested guard that reads the item its act opens", refusal((d) => d.acts.request.guards.push({ anyOf: [[{ set: "name" }]] })), "nascent-guard"],
      ["a nested guard that reads the subject of the guard that holds it, in an act that opens an item", refusal((d) => {
        Object.assign(d.acts.request, { also: { other: { item: "job", by: "other" } }, fields: { ...d.acts.request.fields, other: { type: "item", of: "job", required: true } } });
        d.acts.request.guards.push({ of: "also.other", anyOf: [[{ set: "name" }]] });
      }), null],
      ["a state effect whose only live-state guard is inside an alternative", refusal((d) => { d.acts.pass.guards = [{ anyOf: [[{ state: ["requested"] }]] }]; }), "final"],
      // Section 6.1, at small configured bounds: three deep, and five guards counting those nested. `merge` has three as it stands.
      ["a guard nested as deep as the bound", inMerge(deep(3), { ...PROPOSED_BOUNDS, guardDepth: 3 }), null],
      ["a guard nested deeper than the bound", inMerge(deep(4), { ...PROPOSED_BOUNDS, guardDepth: 3 }), "bound"],
      ["as many guards as the bound, counting those nested", inMerge(deep(2), { ...PROPOSED_BOUNDS, nestedGuards: 5 }), null],
      ["more guards than the bound, counting those nested", inMerge(deep(3), { ...PROPOSED_BOUNDS, nestedGuards: 5 }), "bound"],
    ];
    expect(rows.filter(([, found, code]) => (code === null ? found !== null : found?.length !== 1 || found[0] !== code)).map(([name, found]) => [name, found])).toEqual([]);
  });
});

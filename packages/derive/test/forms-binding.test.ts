import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { FactRef, FieldValue, Input, PlatformDefinition, ScopeKind, ScopeRef, Seed, Send } from "@generalbusiness/artroom-contract";
import { canonicalBytes, entryHash, factRefOf, newIncarnation, parseStrictBytes, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { MemoryState, PROFILES, applyEntry, clockOf, decisionCounts, entryOf, fits, indexItems, itemAwaits, judgeDelivery, keyOf, owed, validateDefinition } from "../src/index.ts";
import type { Counts, Draft, Fetched, Indexed, Judgment, PlatformRule, PlatformRules, RuleEffect, ValidDefinition } from "../src/index.ts";
import { Scope, arriving, d, forged, keys, on, valid, type Over } from "./fixtures.ts";

/**
 * A request that is bound to the pending item that it settles, and the
 * index that finds the item (scope contract, revision 23, section 17.2a;
 * rows I3-55, I3-58 and I3-61; witnesses 18.53 and 18.51). Every definition
 * here is made-up platform data, every rule is a STAND-IN, and every number
 * is made up.
 *
 * The scope uses the real reservation ledger: taking entries set each
 * job's decisions, deciding entries draw on the pre-entry binding, and
 * final jobs release them. The fixture's admission uses the folded counts.
 * The platform data and selector rules remain stand-ins.
 */

const lane = (n: number): ScopeRef => {
  const seed: Seed = { v: 1, kind: "lane" as ScopeKind, definition: d("e"), creator: null, cause: d("c"), ordinal: n };
  return { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(n)), kind: "lane" };
};
const [P, Q, R] = [lane(31), lane(32), lane(33)];
const form = { also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [] };
const TICKET = { type: "fact", kind: ["merge"], under: "ticket" } as const;
const OWNER = { equals: { a: { sender: true }, b: { slot: "owner", of: "also.job" } } } as const;
const JOB_OF = { code: "job-of", row: "P15", item: "job", index: "ticket", key: "ticket" } as const;

/** M, of witness 18.53. The board is the item that the scope's genesis opens. */
const M = {
  format: "artroom-definition-1", name: "platform:jobs", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "file",
  items: {
    board: {
      many: false, max: 1, states: { open: { final: false } }, initial: "open", parties: { opener: { fixed: true, required: true, list: false, author: false } },
      refs: { slot: { fixed: false, required: false, to: { type: "item", of: "job" } }, judging: { fixed: false, required: false, to: { type: "item", of: "job" } } }, values: {},
    },
    job: {
      many: true, max: 64, initial: "queued", states: { queued: { final: false }, taken: { final: false }, gone: { final: true }, done: { final: true } }, parties: {},
      refs: { ticket: { fixed: true, required: true, to: TICKET }, owner: { fixed: true, required: true, to: { type: "scope", kind: "lane" } } }, values: {},
      indexes: ["ticket"], holds: { decisions: { stop: 1 } },
    },
  },
  acts: {
    file: { ...form, step: "open", on: "board", grant: "file", fields: { opener: { type: "member", required: true } }, effects: [{ party: { slot: "opener", from: { field: "opener" } } }] },
    take: { ...form, step: "transition", on: "job", grant: "take", guards: [{ state: ["queued"] }], effects: [{ state: "taken" }] },
    point: {
      ...form, step: "transition", on: "board", grant: "point", fields: { slot: { type: "item", of: "job", required: false }, judging: { type: "item", of: "job", required: false } },
      effects: [{ ref: { slot: "slot", from: { field: "slot" } } }, { ref: { slot: "judging", from: { field: "judging" } } }],
    },
  },
  receives: {
    start: {
      ...form, message: "start", class: "tell", from: { kind: "lane" }, fields: { ticket: { ...TICKET, required: true } }, opens: "job",
      effects: [{ ref: { slot: "ticket", from: { field: "ticket" } } }, { ref: { slot: "owner", from: { sender: true } } }],
    },
    stop: {
      ...form, message: "stop", class: "tell", from: { kind: "lane" }, fields: { ticket: { ...TICKET, required: true } }, opens: null,
      also: { job: JOB_OF }, bound: { of: "also.job", where: [OWNER] },
      guards: [{ ...OWNER, of: "also.job", reason: "not-owner" }, { state: ["queued"], of: "also.job", reason: "too-late" }],
      effects: [{ state: "gone", of: "also.job" }, { code: "open-stopped", row: "P15" }],
    },
  },
  timed: {}, rules: {}, outcomes: {},
};
const JOBS = "platform:jobs@1" as PlatformDefinition;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const changed = (base: unknown, change: (data: any) => void, platform = true) => {
  const data = structuredClone(base);
  change(data);
  return validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform });
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const refusals = (base: unknown, change: (data: any) => void, platform = true): string[] => {
  const v = changed(base, change, platform);
  return v.ok ? [] : [...new Set(v.problems.map((p) => `${p.code} ${p.path}`))];
};
const m = valid(changed(M, () => undefined));

const FINAL = ["gone", "done"];
/**
 * STAND-INS. `job-of` gives the one job that is not final, or the last
 * where each is final. `open-stopped` opens a job and leaves it `gone`
 * when the selector gave none: it opens the job in its initial state, sets
 * its two required fixed references, and then sets the final state, which
 * is four effects (the correction of witness 18.53, cases 9 and 22). The
 * witness's mark states `most: { effects: 2, opens: "job" }`: the member
 * `most` of a mark is row I3-52's, so here the rule's code states its most.
 * `given` keeps what each call of `job-of` was given.
 */
function rules(over: Record<string, PlatformRule> = {}) {
  const given: { items: readonly Indexed[]; fields: Readonly<Record<string, FieldValue>> }[] = [];
  const platform: PlatformRules = {
    named: JOBS,
    rules: {
      "job-of": { place: "also", bind: (items, fields) => { given.push({ items, fields }); return (items.find((item) => !FINAL.includes(item.state)) ?? items.at(-1)!).id; } },
      "open-stopped": {
        place: "effect", most: 4,
        run: ({ resolved, input }): RuleEffect[] => (resolved.subjects.has("also.job") || input.type !== "delivery" ? [] : [
          { effect: "open", item: resolved.self, type: "job", state: "queued" },
          { effect: "ref", item: resolved.self, slot: "ticket", to: resolved.fields["ticket"]! },
          { effect: "ref", item: resolved.self, slot: "owner", to: input.from.at },
          { effect: "state", item: resolved.self, state: "gone" },
        ]),
      },
      ...over,
    },
  };
  return { platform, given, foldPlatform: { ...platform, rules: { ...platform.rules, "job-of": over["job-of"] ?? { place: "also" as const, bind: (items: readonly Indexed[]) => (items.find((item) => !FINAL.includes(item.state)) ?? items.at(-1)!).id } } } };
}

/** One request as it arrives: the envelope, its source entry, and the foreign entries that its fields name. Made by hand: nothing judged the sender's entries. */
interface Arrival { send: Send; from: FactRef; source: ReturnType<typeof forged>; facts: Fetched[] }
let made = 1000;
/** A ticket: the fact of an entry of that lane, with the entry as the receiver fetches it. */
function ticket(of: ScopeRef, seq = ++made): Fetched {
  // The entry says that it recorded an act of the kind `merge`. Nothing signed it.
  const { entry } = forged(of, seq, { type: "act", signed: { intent: { kind: "merge" } }, authority: [] } as unknown as Input, []);
  return { fact: factRefOf(entry), entry, under: "ticket" };
}

/** A scope under made-up platform data, with a real reservation ledger and a budget of entries. */
class Jobs extends Scope {
  budget = 0;
  readonly counts: Counts = decisionCounts(this.state);
  override get foldOptions() { return { bounds: this.bounds, platform: this.using?.foldPlatform }; }
  constructor(definition: ValidDefinition, readonly using = rules()) { super(definition); }
  row() { return [this.head.seq + 1, owed(this.state, this.definition, this.last.input)] as const; }
  free(entries: number) { const [used, reserved] = this.row(); this.budget = used + reserved + entries; return this; }
  commit(j: { result: string; draft?: Draft }): string {
    if (j.result !== "write" || !j.draft) return j.result;
    const [copy, entry] = [this.replay(), entryOf(this.state, j.draft, clockOf(this.state, this.now))];
    applyEntry(copy, this.definition, entry, entryHash(entry), this.foldOptions);
    if (!fits(copy, this.definition, { scopeEntries: this.budget }, entry.input, j.draft.settles)) return "retry";
    this.seal(j.draft);
    return j.draft.settles ? "settles" : "new work";
  }
  does(kind: string, over: Over = {}) { return this.commit(this.judge(this.intent(keys.una, kind, over))); }
  /** A `tell` of that name from that lane, with those fields, in an envelope of its own. */
  request(from: ScopeRef, message: string, fields: Record<string, FieldValue>, facts: Fetched[] = []): Arrival {
    const send: Send = { n: 0, to: this.at, message: { class: "request", type: "tell", body: { message, fields } } };
    const source = forged(from, ++made, { type: "checkpoint", through: 0, state: d("0") }, [send]);
    return { send, from: factRefOf(source.entry), source, facts };
  }
  judged(a: Arrival, state: MemoryState = this.state, using = this.using): Judgment {
    const arrival = { ...a.send, from: a.from };
    return judgeDelivery(state, this.definition, arrival, { ...arriving(this, arrival, a.source, a.facts), platform: using.platform });
  }
  deliver(a: Arrival) { return this.commit(this.judged(a)); }
  start(from: ScopeRef, t: Fetched) { this.free(1 + (this.definition.reserving?.holders["job"]?.amount.entries ?? 0)); expect(this.deliver(this.request(from, "start", { ticket: t.fact }, [t]))).toBe("new work"); return this.head.seq; }
  stop(from: ScopeRef, t: Fetched) { return this.request(from, "stop", { ticket: t.fact }, [t]); }
  /** The decision of the last entry, the name of its reason, and how many effects it holds. */
  last3() { const result = this.last.sends.at(-1)!.message as { outcome: string; reason?: { name?: string } }; return [result.outcome, result.reason?.name ?? null, this.last.effects.length]; }
}

/** G of witness 18.53: three jobs, each with a count of 1 for `stop`, and no free room. A is of P, `queued`, and `board.judging` names it. B is of Q. C is of R, `taken`, and `board.slot` names it. */
function three(using = rules()) {
  const G = new Jobs(m, using);
  const t = { a: ticket(P), b: ticket(Q), c: ticket(R) };
  const [a, b, c] = [G.start(P, t.a), G.start(Q, t.b), G.start(R, t.c)];
  G.free(2);
  expect([G.does("take", on(G, c)), G.does("point", { ...on(G, 0), fields: { slot: c, judging: a } })]).toEqual(["new work", "new work"]);
  G.free(0);
  return { G, t, a, b, c, counts: () => [a, b, c].map((id) => G.counts(G.item(id), "stop")), states: () => [a, b, c].map((id) => G.item(id).state) };
}

describe("18.53, at the validator: the index, the binding selector and `bound`", () => {
  test("18.53 case 1: the data validates; `job-of` is a binding selector on the index that `job` declares", () => {
    expect([m.keyed, m.marks.filter((mark) => mark.place === 2).map((mark) => mark.code)]).toEqual([{ job: ["ticket"] }, ["job-of"]]);
    // The kinds of a `fact` are compared as a set: the field may list them in another order.
    expect(refusals(M, (data) => { data.items.job.refs.ticket.to = { ...TICKET, kind: ["merge", "land"] }; data.receives.start.fields.ticket.kind = ["merge", "land"]; data.receives.stop.fields.ticket.kind = ["land", "merge"]; })).toEqual([]);
    // An index that no selector names validates, and so does a source that a written rule binds.
    expect(refusals(M, (data) => { data.items.job.indexes = ["ticket", "owner"]; })).toEqual([]);
    expect(refusals(M, (data) => { data.receives.stop.fields.job = { type: "item", of: "job", required: true }; data.receives.stop.also.job = { item: "job", by: "job" }; })).toEqual([]);
  });

  test("a binding definition loaded from canonical bytes accepts bound slot operands in equals and differs", () => {
    const data = structuredClone(M);
    const bound: { of: string; where: unknown[] } = data.receives.stop.bound;
    bound.where = [OWNER, { differs: { a: { slot: "ticket", of: "also.job" }, b: { field: "ticket" } } }];
    // Canonical bytes put `of` before `slot`: member order does not change what the operand reads.
    const loaded = parseStrictBytes(canonicalBytes(data));
    expect(validateDefinition(loaded, PROPOSED_BOUNDS, PROFILES, { platform: true })).toMatchObject({ ok: true });
  });

  test("18.53 cases 2, 3 and 18 to 20: a source of `bound.of` that may not bind a request is refused `bound-source`", () => {
    const mark = (change: Record<string, unknown>, drop: string[] = []) => (data: typeof M) => {
      const stated: Record<string, unknown> = { ...JOB_OF, ...change };
      for (const member of drop) delete stated[member];
      (data.receives.stop.also as Record<string, unknown>)["job"] = stated;
    };
    const SOURCE = ["bound-source receives.stop.also.job"];
    // Case 2: the mark states `clock`. So for `most` and `refusals`.
    for (const member of ["clock", "most", "refusals"]) expect(refusals(M, mark({ [member]: true })), member).toEqual(SOURCE);
    // Case 3: the name is bound `via` a slot of a name which a mark binds.
    expect(refusals(M, (data) => {
      data.items.job.refs.twin = { fixed: false, required: false, to: { type: "item", of: "job" } };
      data.receives.stop.also.job = { code: "job-of", row: "P15", item: "job" };
      data.receives.stop.also.next = { item: "job", via: { slot: "twin", of: "also.job" } };
      data.receives.stop.bound = { of: "also.next", where: [] };
    })).toEqual(["bound-source receives.stop.bound.of"]);
    // Case 18: a selector with no index, as revision 22 accepted it. And one with no key.
    expect(refusals(M, mark({}, ["index", "key"]))).toEqual(SOURCE);
    expect(refusals(M, mark({}, ["key"]))).toEqual(SOURCE);
    // Case 19: the type states no `indexes`, or lists `owner` only.
    expect(refusals(M, (data) => { delete data.items.job.indexes; })).toEqual(SOURCE);
    expect(refusals(M, (data) => { data.items.job.indexes = ["owner"]; })).toEqual(SOURCE);
    // Case 20: a key of another type; a field that is optional; a fact under another definition.
    expect(refusals(M, (data) => { data.receives.stop.fields.note = { type: "text", max: 10, required: true }; data.receives.stop.also.job.key = "note"; })).toEqual(SOURCE);
    expect(refusals(M, (data) => { data.receives.stop.fields.ticket.required = false; })).toEqual(SOURCE);
    expect(refusals(M, (data) => { data.receives.stop.fields.ticket.under = "other"; })).toEqual(SOURCE);
    expect(refusals(M, mark({ key: "none" }))).toEqual(SOURCE);
    // The mark's type lists the handler's message in `decisions`.
    expect(refusals(M, (data) => { delete data.items.job.holds; })).toEqual(SOURCE);
    // A mark at place 2 that is no binding selector states neither `index` nor `key`.
    expect(refusals(M, (data) => { delete data.receives.stop.bound; delete data.items.job.holds; })).toEqual(SOURCE);
    expect(refusals(M, (data) => { data.acts.take.also = { other: { ...JOB_OF } }; })).toEqual(["bound-source acts.take.also.other"]);
  });

  test("18.53 case 21, and check 6: an `indexes` that is stated ill is `unsupported-definition`, and a declared definition states none", () => {
    const ill = (change: (job: { indexes: unknown; refs: Record<string, { fixed: boolean; required: boolean; to: unknown }>; values: Record<string, unknown>; parties: Record<string, unknown> }) => void) =>
      refusals(M, (data) => change(data.items.job)).filter((problem) => problem.startsWith("unsupported-definition"));
    // A slot that is not fixed; a slot of the type `text`; five slots.
    expect(ill((job) => { job.refs["twin"] = { fixed: false, required: true, to: { type: "digest" } }; job.indexes = ["ticket", "twin"]; })).toEqual(["unsupported-definition items.job.indexes.1"]);
    expect(ill((job) => { job.values["note"] = { fixed: true, required: true, of: { type: "text", max: 10 } }; job.indexes = ["ticket", "note"]; })).toEqual(["unsupported-definition items.job.indexes.1"]);
    expect(ill((job) => { for (const n of [1, 2, 3]) job.refs[`r${n}`] = { fixed: true, required: true, to: { type: "digest" } }; job.indexes = ["ticket", "owner", "r1", "r2", "r3"]; })).toEqual(["unsupported-definition items.job.indexes"]);
    // Not required; a party slot; no slot; a name twice; an empty list; no list.
    expect(ill((job) => { job.refs["twin"] = { fixed: true, required: false, to: { type: "digest" } }; job.indexes = ["twin"]; })).toEqual(["unsupported-definition items.job.indexes.0"]);
    expect(ill((job) => { job.parties["who"] = { fixed: true, required: true, list: false, author: false }; job.indexes = ["who"]; })).toEqual(["unsupported-definition items.job.indexes.0"]);
    expect(ill((job) => { job.indexes = ["none"]; })).toEqual(["unsupported-definition items.job.indexes.0"]);
    expect(ill((job) => { job.indexes = ["ticket", "ticket"]; })).toEqual(["unsupported-definition items.job.indexes.1"]);
    for (const stated of [[], "ticket"]) expect(ill((job) => { job.indexes = stated; }), JSON.stringify(stated)).toEqual(["unsupported-definition items.job.indexes"]);
    // Without the platform option each member is one that the contract does not define.
    const declared = refusals(M, (data) => { data.name = "jobs"; delete data.outcomes; }, false);
    expect(declared).toEqual(["shape items.job.indexes", "shape items.job.holds"]);
    const written = (data: typeof M) => { (data.receives.stop.fields as Record<string, unknown>)["job"] = { type: "item", of: "job", required: true }; (data.receives.stop.also as Record<string, unknown>)["job"] = { item: "job", by: "job" }; data.receives.stop.effects.pop(); };
    expect(refusals(M, (data) => { data.name = "jobs"; delete data.outcomes; delete data.items.job.indexes; delete data.items.job.holds; written(data); }, false)).toEqual(["shape receives.stop.bound"]);
  });

  test("`bound` and `decisions`: where each may stand, what a `where` reads, and what each count is", () => {
    const stop = (change: (handler: Record<string, unknown> & { bound: { of: string; where: unknown[] } }) => void) => refusals(M, (data) => change(data.receives.stop));
    // On a `tell` handler whose `opens` is null.
    expect(refusals(M, (data) => { data.receives.start.bound = { of: "also.job", where: [] }; })).toEqual(expect.arrayContaining(["shape receives.start.bound"]));
    expect(stop((handler) => { handler.bound.of = "also.none"; })).toEqual(expect.arrayContaining(["name receives.stop.bound.of"]));
    // A `where` reads the sender, a field of the message and a slot of the bound item, by `equals` and `differs`, and nothing else.
    expect(stop((handler) => { handler.bound.where = [OWNER, { differs: { a: { field: "ticket" }, b: { slot: "ticket", of: "also.job" } } }]; })).toEqual([]);
    for (const operand of [{ const: 1 }, { scope: true }, { field: "none" }, { slot: "owner" }, { slot: "none", of: "also.job" }, { slot: "owner", of: "also.other" }, { slot: "owner", of: "also.job", extra: true }, { field: "ticket", part: "scope" }, { source: "ref" }]) {
      expect(stop((handler) => { handler.bound.where = [{ equals: { a: { sender: true }, b: operand } }]; }), JSON.stringify(operand)).toEqual(["shape receives.stop.bound.where.0.equals.b"]);
    }
    expect(stop((handler) => { handler.bound.where = [{ state: ["queued"] }]; })).toEqual(["shape receives.stop.bound.where.0"]);
    // Each key of `decisions` is the message of such a handler, whose `of` names the type. Each count is a whole number of at least 1.
    expect(refusals(M, (data) => { data.items.job.holds.decisions.start = 1; })).toEqual(["name items.job.holds.decisions.start"]);
    expect(refusals(M, (data) => { data.items.board.holds = { decisions: { stop: 1 } }; })).toEqual(["name items.board.holds.decisions.stop"]);
    expect(refusals(M, (data) => { data.items.job.holds.decisions.stop = 0; })).toEqual(expect.arrayContaining(["shape items.job.holds.decisions.stop"]));
    expect(refusals(M, (data) => { data.items.job.holds.decisions.stop = PROPOSED_BOUNDS.listElements + 1; })).toEqual(expect.arrayContaining(["bound items.job.holds.decisions.stop"]));
    // A source that a written rule binds needs the type to list the message too.
    expect(refusals(M, (data) => { data.receives.stop.fields.job = { type: "item", of: "job", required: true }; data.receives.stop.also.job = { item: "job", by: "job" }; delete data.items.job.holds; })).toEqual(["name receives.stop.bound.of"]);
  });
});

describe("18.53, in the judge: a bound request finds its item by a selector, at a full scope", () => {
  test("dec(m) reserves the whole closure of an unheld operation that a bound handler's mark may open", () => {
    const data = structuredClone(M) as unknown as import("@generalbusiness/artroom-contract").PlatformData;
    data.outcomes["audit"] = { code: "audit", row: "P16", attempts: 1 };
    data.receives["stop"]!.effects = [{ code: "open-audit", row: "P16", most: { effects: 0, operations: ["audit"] } }];
    const definition = valid(validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform: true }));
    // The deciding entry, plus the first outcome and late answer of audit.
    expect([definition.reserving!.dec["stop"]!.entries, definition.reserving!.holders["job"]!.amount.entries]).toEqual([3, 3]);
  });

  test("decision reservations are taken, added and drawn by the real ledger; a bound refusal uses its own room and a final holder releases unused decisions", () => {
    const data = structuredClone(M) as unknown as import("@generalbusiness/artroom-contract").PlatformData;
    data.items["job"]!.holds = { decisions: { stop: 2 } };
    data.acts["take"]!.adds = { decisions: { stop: 1 } };
    data.acts["finish"] = { ...M.acts.take, step: "transition", grant: "finish", guards: [{ state: ["taken"] }], effects: [{ state: "done" }] };
    const definition = valid(validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform: true }));
    expect([definition.reserving!.dec["stop"]!.entries, definition.reserving!.holders["job"]!.amount.entries, definition.reserving!.adds["take"]!.amount.entries]).toEqual([1, 2, 1]);
    const G = new Jobs(definition);
    const t = ticket(Q);
    const job = G.start(Q, t);
    expect([G.counts(G.item(job), "stop"), G.state.holder(job)]).toEqual([2, { decisions: { stop: 2 } }]);
    expect(G.free(2).does("take", on(G, job))).toBe("new work");
    expect(G.state.holder(job)).toEqual({ decisions: { stop: 3 } });
    const before = G.row().reduce((a, b) => a + b);
    G.free(0);
    expect(G.deliver(G.stop(Q, t))).toBe("settles");
    expect([G.last3(), G.state.holder(job), G.row().reduce((a, b) => a + b)]).toEqual([["refused", "too-late", 0], { decisions: { stop: 2 } }, before]);
    expect(G.replay().holder(job)).toEqual(G.state.holder(job));
    expect(G.free(1).does("finish", on(G, job))).toBe("new work");
    expect([G.state.holder(job), G.replay().holder(job)]).toEqual([null, null]);
  });

  test("a request sent by a bound deciding entry draws on its holder's request count and preserves its account for its result", () => {
    const data = structuredClone(M) as unknown as import("@generalbusiness/artroom-contract").PlatformData;
    data.items["job"]!.holds = { decisions: { stop: 1 }, requests: 1 };
    data.receives["stop"]!.sends = [{ tell: { to: { slot: "owner", of: "also.job" }, message: "notice", fields: {}, result: {} } }];
    const definition = valid(validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform: true }));
    const G = new Jobs(definition);
    const t = ticket(Q);
    const job = G.start(Q, t);
    const before = G.row().reduce((a, b) => a + b);
    G.free(0);
    expect(G.deliver(G.stop(Q, t))).toBe("settles");
    expect([G.state.account(G.head.seq, 0), G.state.holder(job), G.last.sends.map((send) => send.message.class), G.row().reduce((a, b) => a + b)]).toEqual([job, null, ["request", "result"], before]);
    expect(G.replay().account(G.head.seq, 0)).toBe(job);
  });

  test("18.53 cases 4, 7 and 13: a stop for a job that neither reference of the board names is bound, settles and is applied; a repeat runs no selector; a stop for the final job is new work", () => {
    const { G, t, b, counts, states } = three();
    const [used, reserved] = G.row();
    const first = G.stop(Q, t.b);
    expect([G.deliver(first), G.last3(), states(), counts()]).toEqual(["settles", ["applied", null, 1], ["queued", "gone", "taken"], [1, 0, 1]]);
    // Case 4. The index returned B for that ticket, and no other job: the rule was given B and the fields, and nothing else.
    expect(G.using.given).toEqual([{ items: [{ id: b, state: "queued", parties: {}, refs: { ticket: t.b.fact, owner: Q }, values: {} }], fields: { ticket: t.b.fact } }]);
    expect([G.row()[0] - used, G.row()[1] <= reserved]).toEqual([1, true]);
    // Case 7. The same envelope again: answered from its deciding entry. The selector does not run, and nothing is drawn.
    expect([G.judged(first), G.using.given.length, counts()]).toEqual([{ result: "repeat", seq: G.head.seq }, 1, [1, 0, 1]]);
    // Case 13. Another envelope: the index returns B, which is final and still indexed, and the rule gives it. Not bound: it waits.
    expect([G.free(0).deliver(G.stop(Q, t.b)), G.using.given.at(-1)!.items.map((item) => [item.id, item.state])]).toEqual(["retry", [[b, "gone"]]]);
  });

  test("18.53 cases 5, 8 and 12: a bound stop whose guard fails is settling too, decided refused with no effect; a second one finds the count 0 and waits", () => {
    const { G, t, b, c, counts } = three();
    G.free(1);
    expect(G.does("take", on(G, b))).toBe("new work");
    // Case 5. Bound, as in case 4. The guard on the state fails.
    expect([G.free(0).deliver(G.stop(Q, t.b)), G.last3(), G.item(b).state, counts()]).toEqual(["settles", ["refused", "too-late", 0], "taken", [1, 0, 1]]);
    // Case 8. A second stop from Q for B, in another envelope. The selector gives B, and its count is 0.
    expect([G.deliver(G.stop(Q, t.b)), counts()]).toEqual(["retry", [1, 0, 1]]);
    // Case 12. C, which `board.slot` names and which is `taken`, is found by the same rule as a job that the board does not name.
    expect([G.item(0).refs["slot"], G.deliver(G.stop(R, t.c)), G.last3(), counts()]).toEqual([c, "settles", ["refused", "too-late", 0], [1, 0, 0]]);
  });

  test("18.53 cases 6 and 11: the wrong owner is not bound and moves no count; two stops for two jobs are each bound to their own, in either order", () => {
    // Case 6. The selector gives B. The `where` fails: P is not the owner of B.
    const wrong = three();
    expect([wrong.G.deliver(wrong.G.stop(P, wrong.t.b)), wrong.counts(), wrong.states()]).toEqual(["retry", [1, 1, 1], ["queued", "queued", "taken"]]);
    // With room it is decided by the handler's own guard, and it draws nothing.
    expect([wrong.G.free(1).deliver(wrong.G.stop(P, wrong.t.b)), wrong.G.last3(), wrong.counts()]).toEqual(["new work", ["refused", "not-owner", 0], [1, 1, 1]]);
    // Case 11. Neither selection is given the board, so neither reads `slot` or `judging`.
    for (const order of [["a", "b"], ["b", "a"]] as const) {
      const { G, t, counts, states } = three();
      const from = { a: P, b: Q };
      expect(order.map((job) => G.deliver(G.stop(from[job], t[job])))).toEqual(["settles", "settles"]);
      expect([counts(), states(), G.using.given.map((given) => Object.keys(given))]).toEqual([[0, 0, 1], ["gone", "gone", "taken"], [["items", "fields"], ["items", "fields"]]]);
    }
  });

  test("18.53 cases 9, 10 and 22: with no job for the ticket the rule does not run and the stop is new work; delivered again after its start, the same envelope is bound; of two matches the rule gives the one that is not final", () => {
    const { G } = three();
    const [x, y] = [ticket(Q), ticket(Q)];
    // Case 9. The index returns no job. Not bound: new work, which is not decided at a full scope.
    const early = G.stop(Q, x);
    expect([G.deliver(early), G.using.given.length]).toEqual(["retry", 0]);
    // Case 10. That envelope was not decided, so it is no repeat. After the start for its ticket it finds the job, and is bound.
    const started = G.start(Q, x);
    expect([G.free(0).deliver(early), G.last3(), G.item(started).state, G.using.given.at(-1)!.items.map((item) => item.id)]).toEqual(["settles", ["applied", null, 1], "gone", [started]]);

    // Case 9, with room: decided `applied`, and the rule `open-stopped` opens the job as `gone`, in four effects. It holds nothing.
    const ran = G.using.given.length;
    expect([G.free(1).deliver(G.stop(Q, y)), G.last3(), G.using.given.length - ran]).toEqual(["new work", ["applied", null, 4], 0]);
    const stopped = G.head.seq;
    expect([G.item(stopped).state, G.item(stopped).refs, G.counts(G.item(stopped), "stop")]).toEqual(["gone", { ticket: y.fact, owner: Q }, 0]);
    // Case 22. A start from Q for the same ticket opens a second job. The index returns both, in order of item ID.
    const second = G.start(Q, y);
    expect([G.free(0).deliver(G.stop(Q, y)), G.using.given.at(-1)!.items.map((item) => [item.id, item.state])]).toEqual(["settles", [[stopped, "gone"], [second, "queued"]]]);
    expect([G.last3(), G.item(second).state, G.item(stopped).state, G.item(stopped).revision]).toEqual([["applied", null, 1], "gone", "gone", 1]);
  });

  test("18.53 cases 14, 15 and 24: an open by a rule in a bound delivery, a selection of an item that was not given, and more than 8 items of one key are faults: nothing is written", () => {
    // Case 14. The rule `open-stopped` returns an `open` in a delivery that is bound.
    const opening = three(rules({ "open-stopped": { place: "effect", most: 4, run: ({ resolved }) => [{ effect: "open", item: resolved.self, type: "job", state: "queued" }] } }));
    // Case 15. The rule `job-of` returns the ID of A, or of the board: it was given B only.
    const a = three();
    const others = [a.a, 0].map((id) => three(rules({ "job-of": { place: "also", bind: () => id } })));
    for (const { G, t, counts } of [opening, ...others]) {
      const head = G.head.seq;
      expect([G.free(9).deliver(G.stop(Q, t.b)), G.head.seq, counts()]).toEqual(["unavailable", head, [1, 1, 1]]);
    }
    // A rule that is no binding selector, and one that reads the clock, are faults at the selector too.
    for (const rule of [{ place: "also", run: () => null }, { place: "also", clock: true, bind: () => null }] as PlatformRule[]) {
      const { G, t } = three(rules({ "job-of": rule }));
      expect(G.free(9).deliver(G.stop(Q, t.b))).toBe("unavailable");
    }
    // Case 24. Nine jobs with one ticket, which the `start` of M does not refuse. The rule does not run, and it stays so.
    const { G } = three();
    const one = ticket(Q);
    const nine = Array.from({ length: 9 }, () => G.start(Q, one));
    expect([G.free(9).deliver(G.stop(Q, one)), G.using.given.length, G.state.lookup("job", "ticket", keyOf(one.fact, G.at)!, 9)]).toEqual(["unavailable", 0, nine]);
    // With eight the rule is run on all eight.
    const eight = three();
    const other = ticket(Q);
    for (let i = 0; i < 8; i++) eight.G.start(Q, other);
    expect([eight.G.free(0).deliver(eight.G.stop(Q, other)), eight.G.using.given.at(-1)!.items.length]).toEqual(["settles", 8]);
  });

  test("18.53 cases 16, 17, 23 and 25: the index is complete at the head and rebuilt by folding or from a checkpoint's items; a key is the whole reference; a state with no row answers no lookup", () => {
    const { G, t, b } = three();
    // Case 25. Forty more jobs of Q, each with a ticket in the same scope as the ticket of B and at another position.
    for (let i = 0; i < 40; i++) G.start(Q, ticket(Q, 5000 + i));
    // Another hash at the position of B's ticket, and the same hash under another incarnation, are other keys.
    const near = [{ ...t.b.fact, hash: d("1") }, { ...t.b.fact, at: { ...Q, inc: P.inc } }];
    expect([G.state.lookup("job", "ticket", keyOf(t.b.fact, G.at)!, 9), ...near.map((fact) => G.state.lookup("job", "ticket", keyOf(fact, G.at)!, 9))]).toEqual([[b], [], []]);
    // Case 23. A start is written and fills G, and the next entry is a stop with that ticket: the row was written with the item.
    const fresh = ticket(Q);
    const job = G.start(Q, fresh);
    const stop = G.free(0).stop(Q, fresh);
    const here = G.judged(stop);
    expect(here.result === "write" && [here.draft.settles, here.draft.bound]).toEqual([true, { item: job, message: "stop" }]);

    // Cases 16 and 17. A verifier that folds the entries, and one that starts from the items of a checkpoint and builds the index
    // from them, make the same lookup and derive the same entry. A checkpoint's value holds no row of the index.
    const folded = G.replay();
    const snapshot = G.state.all();
    const loaded = new MemoryState();
    loaded.setScope(snapshot.scope!);
    for (const item of snapshot.items) loaded.putItem(item);
    for (const holder of snapshot.holders ?? []) loaded.putHolder(holder.item, holder.held);
    for (const [type, state, n] of snapshot.counts) loaded.addCount(type, state, n);
    expect([JSON.stringify(snapshot).includes("keyed"), loaded.lookup("job", "ticket", keyOf(fresh.fact, G.at)!, 9)]).toEqual([false, null]);
    indexItems(loaded, m, snapshot.items, G.at);
    for (const state of [folded, loaded]) expect(G.judged(stop, state)).toEqual(here);
    expect([folded, loaded].map((state) => state.lookup("job", "ticket", keyOf(t.b.fact, G.at)!, 9))).toEqual([[b], [b]]);
    // The index is derived state: the two states have one digest, with it or without it.
    expect(loaded.all().items).toEqual(snapshot.items);

    // Case 23, its last sentence. A runtime whose index holds no row for that job answers no lookup: the delivery is not judged.
    const lost = new MemoryState();
    for (const { entry, hash } of G.entries) applyEntry(lost, entry.effects.some((e) => e.effect === "open" && e.item === job) ? { ...m, keyed: {} } : m, entry, hash, G.foldOptions);
    expect([lost.lookup("job", "ticket", keyOf(fresh.fact, G.at)!, 9), G.judged(stop, lost)]).toEqual([null, { result: "unavailable", reason: "unavailable" }]);
  });
});

/**
 * M of witness 18.51: a job has a mark, `flagged`, and a count of 1 for
 * `stop`. Its handlers name the job by a written rule: a field of the type
 * `item`. `flag` settles the job by the mark. `stop` is bound to the job
 * when its sender is the job's owner.
 */
const M51 = {
  ...M, name: "platform:flags",
  items: {
    board: M.items.board,
    job: {
      many: true, max: 8, initial: "open", states: { open: { final: false }, busy: { final: false }, done: { final: true } }, parties: {},
      refs: { owner: { fixed: true, required: true, to: { type: "scope", kind: "lane" } } }, values: { flagged: { fixed: false, required: true, of: { type: "bool" }, default: false } },
      holds: { decisions: { stop: 1 } },
    },
  },
  acts: { file: M.acts.file, work: { ...form, step: "transition", on: "job", grant: "work", guards: [{ state: ["open"] }], effects: [{ state: "busy" }] }, finish: { ...form, step: "transition", on: "job", grant: "work", guards: [{ state: ["open", "busy"] }], effects: [{ state: "done" }] } },
  receives: {
    start: { ...form, message: "start", class: "tell", from: { kind: "lane" }, opens: "job", effects: [{ ref: { slot: "owner", from: { sender: true } } }] },
    flag: {
      ...form, message: "flag", class: "tell", from: { kind: "lane" }, fields: { job: { type: "item", of: "job", required: true } }, opens: null, also: { job: { item: "job", by: "job" } },
      settles: { of: "also.job", sets: "flagged", in: ["open", "busy"] }, guards: [{ ...OWNER, of: "also.job", reason: "not-owner" }], effects: [{ of: "also.job", value: { slot: "flagged", from: { const: true } } }],
    },
    stop: {
      ...form, message: "stop", class: "tell", from: { kind: "lane" }, fields: { job: { type: "item", of: "job", required: true } }, opens: null, also: { job: { item: "job", by: "job" } },
      bound: { of: "also.job", where: [OWNER] }, guards: [{ state: ["open"], of: "also.job", reason: "too-late" }], effects: [{ state: "done", of: "also.job" }],
    },
  },
};

describe("18.51: a settlement by a mark, and a bound request, at a full scope", () => {
  test("the decision fold treats a bound subject named __proto__ as an own name", () => {
    const data = structuredClone(M51) as unknown as import("@generalbusiness/artroom-contract").PlatformData;
    data.receives["stop"] = JSON.parse(JSON.stringify(data.receives["stop"]).replaceAll("also.job", "also.__proto__"));
    data.receives["stop"]!.also = Object.fromEntries([["__proto__", { item: "job", by: "job" }]]);
    const definition = valid(validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform: true }));
    const G = new Jobs(definition);
    expect(G.free(3).deliver(G.request(Q, "start", {}))).toBe("new work");
    const job = G.head.seq;
    expect(G.free(1).does("work", on(G, job))).toBe("new work");
    G.free(0);
    expect(G.deliver(G.request(Q, "stop", { job: G.fact(job) }))).toBe("settles");
    expect([G.last3(), G.state.holder(job), G.replay().holder(job)]).toEqual([["refused", "too-late", 0], null, null]);
  });

  test("a local fact field that names the holder's opening is normalized identically by the judge and decision fold", () => {
    const data = structuredClone(M51) as unknown as import("@generalbusiness/artroom-contract").PlatformData;
    data.receives["stop"]!.fields = { job: { type: "fact", kind: ["start"], under: data.name, required: true } };
    const definition = valid(validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform: true }));
    const G = new Jobs(definition);
    expect(G.free(3).deliver(G.request(Q, "start", {}))).toBe("new work");
    const job = G.head.seq;
    expect(G.free(1).does("work", on(G, job))).toBe("new work");
    G.free(0);
    expect(G.deliver(G.request(Q, "stop", { job: G.fact(job) }))).toBe("settles");
    expect([G.last3(), G.state.holder(job), G.replay().holder(job)]).toEqual([["refused", "too-late", 0], null, null]);
  });

  const m51 = valid(changed(M51, () => undefined));
  const started = () => {
    const G = new Jobs(m51);
    // Case 4. New work: its entry, 1 for the mark, and 1 for the bound decision.
    expect(G.free(1).deliver(G.request(Q, "start", {}))).toBe("retry");
    expect(G.free(2).deliver(G.request(Q, "start", {}))).toBe("retry");
    expect(G.free(3).deliver(G.request(Q, "start", {}))).toBe("new work");
    const job = G.head.seq;
    const of = (from: ScopeRef, message: string) => G.request(from, message, { job: G.fact(job) });
    return { G, job, of };
  };

  test("18.51 cases 1 and 4 to 7: a job that awaits the mark reserves 1 entry; the first flag settles at a full scope; a second flag and a refused one are new work", () => {
    // Case 1. The third form of `settles`, `decisions` and `bound` validate together.
    expect([m51.markers!["job"]!.marks, itemAwaits(m51, { type: "job", state: "open", values: { flagged: false } }), itemAwaits(m51, { type: "job", state: "busy", values: { flagged: true } })]).toEqual([["flagged"], 1, 0]);
    const { G, job, of } = started();
    expect(G.free(1).does("work", on(G, job))).toBe("new work");
    // Case 7. A first flag whose guard fails: a refusal sets no mark, and is new work.
    expect([G.free(0).deliver(of(P, "flag")), G.item(job).values["flagged"]]).toEqual(["retry", false]);
    // Case 5. The job is `busy` and awaits the mark, and the entry sets it. Reserved falls by 1.
    const reserved = G.row()[1];
    expect([G.deliver(of(Q, "flag")), G.item(job).values["flagged"], reserved - G.row()[1], G.item(job).state]).toEqual(["settles", true, 1, "busy"]);
    // Case 6. A second flag, as a new request: the mark is `true`, and the job awaits nothing.
    expect(G.free(0).deliver(of(Q, "flag"))).toBe("retry");
  });

  test("18.51 cases 8 to 13: a stop from the job's owner is settling whatever it decides; from another scope, or with the count at 0, it is new work; a repeat is answered from its entry", () => {
    const { G, job, of } = started();
    expect(G.free(1).does("work", on(G, job))).toBe("new work");
    // Case 10. A stop from another scope than the owner: the `where` fails.
    expect([G.free(0).deliver(of(P, "stop")), G.counts(G.item(job), "stop")]).toEqual(["retry", 1]);
    // Case 8. From the owner, when the job is `busy`: bound. The guard fails. The entry holds no effect, and the count is 0.
    const first = of(Q, "stop");
    expect([G.deliver(first), G.last3(), G.counts(G.item(job), "stop")]).toEqual(["settles", ["refused", "too-late", 0], 0]);
    // Case 11. A second stop from the owner, as a new request: the count is 0.
    expect(G.deliver(of(Q, "stop"))).toBe("retry");
    // Case 12. A repeat of the request of case 8 is answered from its deciding entry.
    expect(G.judged(first)).toEqual({ result: "repeat", seq: G.head.seq });

    // Case 9. The same stop when the job is `open`: bound, and the guard holds.
    const open = started();
    expect([open.G.free(0).deliver(open.of(Q, "stop")), open.G.last3(), open.G.item(open.job).state]).toEqual(["settles", ["applied", null, 1], "done"]);
    // Case 13. The job is `done` with `flagged` false: it left the states of `in`, and it awaits nothing. The entry of the mark is released.
    expect([open.G.item(open.job).values["flagged"], itemAwaits(m51, open.G.item(open.job))]).toEqual([false, 0]);
    // A stop for a job that is final is not bound, whatever its count would be.
    const done = started();
    expect(done.G.free(1).does("finish", on(done.G, done.job))).toBe("new work");
    expect(done.G.free(0).deliver(done.of(Q, "stop"))).toBe("retry");
  });

  test("an omitted count callback reads the folded holder; an absent holder count fails closed", () => {
    const { G, of, job } = started();
    const stop = of(Q, "stop");
    const arrival = { ...stop.send, from: stop.from };
    const judged = judgeDelivery(G.state, m51, arrival, { ...arriving(G, arrival, stop.source, []), platform: G.using.platform });
    expect(judged.result === "write" && [judged.draft.settles, judged.draft.bound]).toEqual([true, { item: job, message: "stop" }]);
    G.state.putHolder(job, null);
    const without = judgeDelivery(G.state, m51, arrival, { ...arriving(G, arrival, stop.source, []), platform: G.using.platform });
    expect(without.result === "write" && [without.draft.settles, without.draft.bound]).toEqual([false, undefined]);
  });
});

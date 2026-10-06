/**
 * Made-up values of platform data, for the tests of a reservation that an
 * item holds (scope contract, revision 23, section 17.2a; its witnesses
 * 18.47 and 18.49). They are no platform definition of Artroom. Every name
 * and every number is made up, and every rule is a STAND-IN: the tests show
 * where a count is taken, drawn and released, and prove nothing about a
 * rule or a count of a platform definition.
 *
 * `works` is the M of witness 18.47. Its item type `job` states `holds: {
 * operations: { step: 2, tidy: 1 }, requests: 1 }`. Its kinds `step` and
 * `tidy` have 1 attempt each. The mark of `step` lists `step` and `tidy`,
 * and holds a `send` with empty clauses. The handler `start` of a request
 * opens a `job`. The act `again`, on a `job`, states `adds: { operations: {
 * step: 1 } }`. The act `finish` makes a job final: the witness needs a job
 * that becomes final, and names no form for it.
 *
 * `chain` is the M of witness 18.49. Its `job` states `holds: { operations:
 * { k: 1 } }`. Its kind `k` has 1 attempt, and its mark lists `u`. Its kind
 * `u` has 3 attempts, lists no kind, and no item holds it.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Entry, OperationId, PlatformData, PlatformDefinition, Request } from "@generalbusiness/artroom-contract";
import { entryHash, factRefOf } from "@generalbusiness/artroom-bytes";
import { PROFILES, applyEntry, clockOf, entryOf, fits, judgeDelivery, owed, settleOutcome, validateDefinition } from "../src/index.ts";
import type { Draft, Operation, OutcomeGives, PlatformRule, PlatformRules, RuleEffect, RuleGiven, RuleRequest, ValidDefinition, Validation } from "../src/index.ts";
import { Scope, arriving, forged, keys, otherLane, valid, type Over } from "./fixtures.ts";

const OPENER = { opener: { fixed: true, required: true, list: false, author: false } } as const;
const NO = { parties: {}, refs: {}, values: {} } as const;
const ACT = { also: {}, fields: {}, guards: [], sends: [], attention: [] } as const;

const base = (name: string): Omit<PlatformData, "outcomes"> => ({
  format: "artroom-definition-1", name, profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "establish",
  items: {
    works: { many: false, max: 1, initial: "open", states: { open: { final: false } }, parties: OPENER, refs: {}, values: {} },
    job: { ...NO, many: true, max: 100, initial: "open", states: { open: { final: false }, done: { final: true } } },
  },
  acts: {
    establish: { ...ACT, step: "open", on: "works", grant: "works.establish", fields: { opener: { type: "member", required: true } }, effects: [{ party: { slot: "opener", from: { field: "opener" } } }] },
    finish: { ...ACT, step: "transition", on: "job", grant: "works.finish", guards: [{ state: ["open"] }], effects: [{ state: "done" }] },
  },
  receives: {
    // A request that opens a job: the taking entry. Its rule `begin` opens what the test says.
    start: { message: "start", class: "tell", from: { kind: "lane" }, fields: {}, opens: "job", also: {}, guards: [], effects: [{ code: "begin", row: "P16" }], sends: [], attention: [] },
  },
  timed: {}, rules: {},
});

/** The M of witness 18.47. */
export const works: PlatformData = (() => {
  const data = base("platform:works");
  return {
    ...data,
    items: { ...data.items, job: { ...data.items["job"]!, holds: { operations: { step: 2, tidy: 1 }, requests: 1 } } },
    acts: { ...data.acts, again: { ...ACT, step: "transition", on: "job", grant: "works.again", effects: [], adds: { operations: { step: 1 } } } },
    outcomes: {
      step: { code: "step", row: "P16", attempts: 1, most: { effects: 0, operations: ["step", "tidy"] }, send: { code: "report", row: "P16", result: {} } },
      tidy: { code: "tidy", row: "P16", attempts: 1 },
    },
  };
})();

/** The M of witness 18.49. */
export const chain: PlatformData = (() => {
  const data = base("platform:chain");
  return {
    ...data,
    items: { ...data.items, job: { ...data.items["job"]!, holds: { operations: { k: 1 } } } },
    outcomes: {
      k: { code: "k", row: "P16", attempts: 1, most: { effects: 0, operations: ["u"] } },
      u: { code: "u", row: "P16", attempts: 3 },
    },
  };
})();

export const validated = (data: unknown): Validation => validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform: true });
/** One of the two values with one change, validated with the platform option. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const changed = (data: PlatformData, change: (data: any) => void = () => {}): Validation => {
  const copy = structuredClone(data);
  change(copy);
  return validated(copy);
};

/** The name and version that a made-up value is given in a test: the name of an operation's owner is one of the platform's seven. No runtime holds these rules under it. */
export const OWNER = "platform:task@1" as PlatformDefinition;

/** One operation of a kind, as a rule at place 5 returns it: the record, and its first attempt. `holder`: the item that it is for. */
export const opened = (k: number, kind: string, attempts: number, holder?: number | "self"): RuleEffect[] => [
  { effect: "operation", k, owner: OWNER, kind, attempts, ...(holder === undefined ? {} : { for: holder }) },
  { effect: "attempt", operation: { k }, attempt: 1, result: "opened", selected: null },
];

/** What the stand-in rules do in one test: each may be replaced before an input is judged. */
export interface Script {
  /** The rule `begin` of the handler `start`: the effects of the taking entry. */
  begin: (given: RuleGiven) => readonly RuleEffect[];
  /** The rule of each kind of `outcomes`: what an outcome entry derives. */
  derives: (kind: string, given: RuleGiven, operation: Operation) => OutcomeGives;
  /** The rule `report`, the send of the kind `step`: no request, or one. */
  report: (given: RuleGiven) => RuleRequest | null;
  /** A rule in a clause, where a test puts one. */
  after: (given: RuleGiven) => readonly RuleEffect[];
  /** Whether another attempt follows a refused outcome. */
  retries: boolean;
}

/** A request to another scope, as a rule at a send returns it. */
export const TELL: RuleRequest = { to: otherLane, message: { class: "request", type: "tell", body: { message: "hello", fields: {} } } };

/**
 * A scope under one of the made-up values, with a budget of entries. It
 * does what a commit does: judge, fold into a copy of the state, and keep
 * the entry only if it fits (section 17.3). `free` sets the budget so that
 * the scope has that many entries beside what it has written and reserved.
 */
export class Works extends Scope {
  budget = Number.POSITIVE_INFINITY;
  script: Script = {
    begin: () => [], derives: () => ({ effects: [], sends: [], opens: [] }), report: () => null, after: () => [], retries: false,
  };

  constructor(definition: ValidDefinition) { super(definition); }

  get rules(): PlatformRules {
    const outcome = (kind: string): PlatformRule => ({ place: "outcome", rules: { selects: false, read: false, retries: () => this.script.retries, derives: (given, operation) => this.script.derives(kind, given, operation) } });
    const kinds = Object.keys((this.definition.declared as unknown as PlatformData).outcomes);
    return {
      named: OWNER,
      rules: {
        begin: { place: "effect", most: 8, run: (given) => this.script.begin(given) },
        after: { place: "effect", most: 8, run: (given) => this.script.after(given) },
        report: { place: "send", run: (given) => this.script.report(given) },
        ...Object.fromEntries(kinds.map((kind) => [kind, outcome(kind)])),
      },
    };
  }

  /** The entries that the pending duties reserve. */
  reserved(): number { return owed(this.state, this.definition, this.last.input); }
  /** Used plus reserved, in entries. */
  total(): number { return this.entries.length + this.reserved(); }
  /** Sets the budget: what is written, what is reserved, and that many entries more. */
  free(entries: number): this { this.budget = this.total() + entries; return this; }

  /** What the commit does with a judged input at this budget. */
  commit(j: { result: string; draft?: Draft }): string {
    if (j.result !== "write" || !j.draft) return j.result;
    const [copy, entry] = [this.replay(), entryOf(this.state, j.draft, clockOf(this.state, this.now))];
    applyEntry(copy, this.definition, entry, entryHash(entry));
    if (!fits(copy, this.definition, { scopeEntries: this.budget }, entry.input, j.draft.settles)) return "scope-full";
    this.seal(j.draft);
    return "written";
  }

  #made = 500;
  /** A `start` from another lane, in an entry made by hand. A request that does not fit is not decided, and transport answers "retry". */
  start(): string {
    const send = { n: 0, to: this.at, message: { class: "request", type: "tell", body: { message: "start", fields: {} } } } as const;
    const source = forged(otherLane, ++this.#made, { type: "checkpoint", through: 0, state: this.entries[0]!.hash }, [send]);
    const arrival = { ...send, from: factRefOf(source.entry) };
    return this.commit(judgeDelivery(this.state, this.definition, arrival, { ...arriving(this, arrival, source), platform: this.rules }));
  }
  /** One outcome of one attempt. */
  outcome(operation: OperationId, attempt: number, result: "confirmed" | "refused" | "unknown"): string {
    const evidence = { basis: result === "unknown" ? "none" : "own-answer", body: {} } as const;
    return this.commit(settleOutcome(this.state, this.definition, { type: "outcome", operation, attempt, result, evidence }, { clock: clockOf(this.state, this.now), bounds: PROPOSED_BOUNDS, own: this.own, platform: this.rules }));
  }
  /** The actor of every act of these tests. */
  keyOf() { return keys.rita; }
  /** An act of rita's. */
  does(kind: string, over: Over = {}): string { return this.commit(this.judge(this.intent(keys.rita, kind, over), { platform: this.rules })); }
  /** The result `applied` of the request that entry `seq` sent at ordinal 0, from an entry made by hand. */
  answered(seq: number): string {
    const request = { from: this.fact(seq), n: 0 };
    const send = { n: 0, to: this.at, message: { class: "result", of: request, outcome: "applied" } } as const;
    const source = forged(otherLane, ++this.#made, { type: "delivery", ...request, message: this.entries[seq]!.entry.sends[0]!.message as Request, decision: "applied" }, [send]);
    const arrival = { ...send, from: factRefOf(source.entry) };
    return this.commit(judgeDelivery(this.state, this.definition, arrival, { ...arriving(this, arrival, source), platform: this.rules }));
  }
  /** The operations that the last entry opened, by their ordinals. */
  opened(entry: Entry = this.last): OperationId[] { return entry.effects.flatMap((effect) => (effect.effect === "operation" ? [`${entry.seq}:${effect.k}` as OperationId] : [])); }
}

export const worksDefinition = valid(validated(works));
export const chainDefinition = valid(validated(chain));

/**
 * A made-up value of platform data, for the tests of the rows of `observes`
 * (scope contract, revisions 20 and 21, sections 6.1 and 16.1; its
 * witnesses 18.46, 18.48, 18.50 and 18.52). It is no platform definition of
 * Artroom, and its names and numbers are made up. Every rule is a
 * STAND-IN: it shows where a subject comes from and what an entry retains,
 * and proves nothing about a rule of a destination or of a rules scope.
 *
 * `weigher` holds one desk.
 *
 * - `set-checks` has a list field `checks`, of records with a member
 *   `checker`, and one row: the checker of each element.
 * - `set` has a field `a`, a member, and one row: that member.
 * - `start` names two entries of a lane as facts, and its effect mark
 *   `opens` opens one operation of the kind `weigh`.
 * - `go` sends one `tell`, `ask`. Its clause `applied` states one row, of
 *   the rules, with `retains`, and one `value` effect on the desk.
 * - `weigh`, of `outcomes`, states `origin: "rule"` and three rows: the
 *   rules; keys that its rule names; and the holders of `x.do`.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Digest, Entry, KeyId, MemberId, ObservationUse, Observe, PlatformData, PlatformDefinition, RulesContent, ScopeRef, Seed } from "@generalbusiness/artroom-contract";
import { newIncarnation, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { PROFILES, validateDefinition, type ContentStates, type FirstStep, type OutcomeRule, type PlatformRules, type RuleEffect, type RuleGiven, type Rules, type ValidDefinition } from "../src/index.ts";
import { T0, d, membership, valid } from "./fixtures.ts";

const MEMBER = { type: "member" } as const;
const LANE_FACT = { type: "fact", kind: ["decide"], under: "lane" } as const;

/** The domain of the extents, and the bound on one value of it, as the row of `go` states them. Both are made up (witness 18.48). */
export const EXTENTS = "x-extents-1";
export const EXTENTS_MAX = 400_000;

/** The three rows of `weigh` in witness 18.46. */
export const WEIGH_ROWS: readonly Observe[] = [
  { of: "rules", window: 10, use: "once", without: "wait" },
  { of: "key", from: "rule", max: 3, window: 10, use: "once", without: "wait" },
  { of: "holders", action: "x.do", most: 2, window: 10, use: "once", without: "write" },
];

/** The three rows of `weigh` in witness 18.52: R1, R2 and R3. */
export const STEP_ROWS: readonly Observe[] = [
  { of: "rules", window: 10, use: "once", without: "wait" },
  { of: "key", from: "rule", max: 3, second: true, window: 10, use: "once", without: "wait" },
  { of: "key", from: "rule", max: 2, window: 10, use: "once", without: "write" },
];

export const weigher: PlatformData = {
  format: "artroom-definition-1",
  // The name of a platform definition is one of seven (the bytes package's `isPlatformDefinition`). This made-up data takes the name
  // of one that the platform package does not hold, as derive's fixture `gate` does in a test of an operation.
  name: "platform:task",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "establish",
  items: {
    desk: {
      many: false, max: 1, initial: "open", states: { open: { final: false } },
      parties: { opener: { fixed: true, required: true, list: false, author: false } },
      refs: { peer: { fixed: false, required: false, to: { type: "scope", kind: "lane" } } },
      values: {
        note: { fixed: false, required: false, of: { type: "text", max: 64 } },
        // What the stand-in rule of `weigh` names beside the keys of the entries in `uses`: more keys, as texts.
        more: { fixed: false, required: false, of: { type: "list", of: { type: "text", max: 80 }, max: 8 } },
      },
    },
  },
  acts: {
    establish: {
      step: "open", on: "desk", grant: "weigher.establish", also: {}, fields: { opener: { ...MEMBER, required: true } },
      guards: [], effects: [{ party: { slot: "opener", from: { field: "opener" } } }], sends: [], attention: [],
    },
    point: {
      step: "transition", on: "desk", grant: "weigher.point", also: {}, fields: { peer: { type: "scope", kind: "lane", required: true } },
      guards: [], effects: [{ ref: { slot: "peer", from: { field: "peer" } } }], sends: [], attention: [],
    },
    more: {
      step: "transition", on: "desk", grant: "weigher.point", also: {}, fields: { more: { type: "list", of: { type: "text", max: 80 }, max: 8, required: true } },
      guards: [], effects: [{ value: { slot: "more", from: { field: "more" } } }], sends: [], attention: [],
    },
    "set-checks": {
      step: "comment", on: null, grant: "weigher.set", also: {},
      fields: { checks: { type: "list", of: { type: "record", of: { name: { type: "text", max: 32, required: true }, checker: { ...MEMBER, required: true } } }, max: 8, required: true } },
      guards: [], effects: [], sends: [], attention: [],
      observes: [{ of: "member", from: { each: { field: "checks" }, as: "c", value: { element: "c.checker" } }, max: 4, window: 300, use: "reuse" }],
    },
    set: {
      step: "comment", on: null, grant: "weigher.set", also: {}, fields: { a: { ...MEMBER, required: true } },
      guards: [], effects: [], sends: [], attention: [],
      observes: [{ of: "member", from: { field: "a" }, max: 1, window: 300, use: "reuse" }],
    },
    // An act whose form states no row. Its guard mark reads an observation, which is a fault (witness 18.46, case 16).
    peek: {
      step: "transition", on: "desk", grant: "weigher.set", also: {}, fields: { a: { ...MEMBER, required: true } },
      guards: [{ code: "sees", row: "M2" }], effects: [], sends: [], attention: [],
    },
    start: {
      step: "transition", on: "desk", grant: "weigher.start", also: {}, fields: { first: { ...LANE_FACT, required: false }, second: { ...LANE_FACT, required: false } },
      guards: [], effects: [{ code: "opens", row: "M1" }], sends: [], attention: [],
    },
    go: {
      step: "transition", on: "desk", grant: "weigher.go", also: {}, fields: {},
      guards: [], effects: [],
      sends: [{
        tell: {
          to: { slot: "peer" }, message: "ask", fields: {},
          result: { applied: [{ value: { slot: "note", from: { const: "done" } } }], refused: [], superseded: [] },
          observes: { applied: [{ of: "rules", window: 10, use: "once", without: "wait", retains: [{ domain: EXTENTS, max: EXTENTS_MAX }] }] },
        },
      }],
      attention: [],
    },
  },
  receives: {},
  timed: {},
  rules: {},
  outcomes: { weigh: { code: "weigh", row: "M1", origin: "rule", observes: WEIGH_ROWS } },
};

/** The name and version that the made-up data is given in a test. No runtime holds it. */
export const WEIGHER = "platform:task@1" as PlatformDefinition;

/** What validating the made-up data with one change gives, with the platform option or as a declared definition. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const weighed = (change: (data: any) => void = () => {}, platform = true) => {
  const data = structuredClone(weigher);
  change(data);
  return validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform });
};
/** The made-up data with one change, validated with the platform option. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const weigherWith = (change: (data: any) => void = () => {}): ValidDefinition => valid(weighed(change));

/** A rules scope that the made-up scope records, and the made-up name of the definition that it pins. Neither is a scope or a definition of Artroom. */
export const rulebook: ScopeRef = (() => {
  const seed: Seed = { v: 1, kind: "rules", definition: d("e"), creator: null, cause: d("c"), ordinal: 9 };
  return { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(9)), kind: "rules" };
})();
export const RULEBOOK = "platform:rules@2" as PlatformDefinition;

/** What the data of the made-up rules definition states of the two members: `content` below says which. */
export const stating = (states: Partial<ContentStates> = {}) => (named: PlatformDefinition): ContentStates | null => (named === RULEBOOK ? { singleControllerException: false, extents: false, ...states } : null);

// ---------------------------------------------------------------- observations, WRITTEN BY HAND

/** Each observation below is written by hand: no scope answered it, and no history stands behind the head that it names. */
const read = (n: number, at = T0): Pick<ObservationUse, "read" | "use" | "prior"> & { at: string } => ({ read: { run: "r1", n }, use: "fresh", prior: null, at });
const from = (at: string) => ({ of: membership, head: { seq: 40, hash: d("4") }, definition: "platform:membership@1" as PlatformDefinition, at });

export function memberSeen(member: MemberId, n: number, at = T0): ObservationUse {
  const { at: began, ...use } = read(n, at);
  return { observation: { subject: "member", ...from(began), member, memberState: "active", role: "member", activeKey: true, controller: null, controllerActive: null }, ...use };
}
export function keySeen(key: KeyId, member: MemberId, n: number, at = T0): ObservationUse {
  const { at: began, ...use } = read(n, at);
  return { observation: { ...from(began), key, keyState: "active", member, memberState: "active", role: "member", actions: ["x.do"], within: { membership }, controller: null, controllerActive: null, notAfter: null }, ...use };
}
export function holdersSeen(holders: readonly MemberId[], count: number, n: number, at = T0): ObservationUse {
  const { at: began, ...use } = read(n, at);
  return { observation: { subject: "holders", ...from(began), action: "x.do", count, holders }, ...use };
}
/** What the rules scope holds: which checks are required, and where given the digest of the extents. */
export function rulesSeen(required: readonly string[], n: number, at = T0, extents?: Digest): ObservationUse {
  const { at: began, ...use } = read(n, at);
  const content: RulesContent = { asked: "rules", approvals: 1, ownerMayReview: false, checks: required.map((name) => ({ name, configuration: d("c"), required: true, checker: "@check" as MemberId })), labels: [], ...(extents ? { extents } : {}) };
  return { observation: { subject: "rules", of: rulebook, head: { seq: 7, hash: d("7") }, revision: 3, content, definition: RULEBOOK, at: began }, ...use };
}

// ---------------------------------------------------------------- the rules, each a STAND-IN

/** The key that signed an entry at hand, and the check that its act names. */
const signedBy = (entry: Entry): { key: KeyId; check: string } | null =>
  (entry.input.type === "act" ? { key: entry.input.signed.intent.actor, check: String(entry.input.signed.intent.fields["check"] ?? "") } : null);

/** What the stand-in rules of one test saw: what `weigh` was told of its rows, the number of the read of each observation that it read, and each list that it named. */
export interface Seen { rows: unknown[]; read: unknown[]; named: unknown[] }

/** The key behind each entry at hand whose check the observed rules require: what the stand-in names for a row of the second step. */
export const counted = (given: RuleGiven, step: FirstStep): KeyId[] => {
  const rules = step.observed({ asked: "rules" })?.observation;
  const required = rules && "subject" in rules && rules.subject === "rules" && rules.content.asked === "rules" ? rules.content.checks.filter((check) => check.required).map((check) => check.name) : [];
  return given.uses.flatMap((used) => { const by = signedBy(used.entry); return by && required.includes(by.check) ? [by.key] : []; });
};
/** The key that signed each entry at hand, and then each text of the desk's value `more`: what the stand-in names for a row of the first step. */
export const signers = (given: RuleGiven): KeyId[] => [...given.uses.flatMap((used) => signedBy(used.entry)?.key ?? []), ...(((given.state.item(0)?.values["more"] as string[] | null | undefined) ?? []) as KeyId[])];

/**
 * STAND-INS, one for each mark of the made-up data.
 *
 * - `opens` opens one operation of the kind `weigh`, with one attempt.
 * - `weigh` selects nothing and allows no other attempt. Its origin is the
 *   entry that opened its operation, which it names by position. For a row
 *   of the first step it names what `first` gives. For a row of the second
 *   step it names the key behind each entry whose check the observed rules
 *   require. Its effects are none: it notes what it was told of each row,
 *   and reads the observation of the rules, of the holders and of every
 *   key that it named.
 * - `sees`, a guard, reads the standing of the member in the field `a`.
 */
export function weigherRules(seen: Seen = { rows: [], read: [], named: [] }, first: (given: RuleGiven) => KeyId[] = signers, over: Partial<OutcomeRule> = {}): PlatformRules {
  let named: KeyId[] = [];
  const weigh: OutcomeRule = {
    selects: false, read: false, retries: () => false,
    origin: (given) => { named = []; return given.input.type === "outcome" ? Number(given.input.operation.split(":")[0]) : null; },
    subjects: (given, _operation, row, step) => {
      const keys = step ? counted(given, step) : first(given);
      seen.named.push([row, keys]);
      named.push(...keys);
      return keys;
    },
    derives: (given) => {
      seen.rows.push([...(given.rows ?? [])]);
      seen.read.push([given.observed({ asked: "rules" })?.read.n ?? null, ...[...new Set(named)].map((key) => given.observed({ key })?.read.n ?? null)]);
      return { effects: [], sends: [], opens: [] };
    },
    ...over,
  };
  const opens: RuleEffect[] = [{ effect: "operation", k: 0, owner: WEIGHER, kind: "weigh", attempts: 1 }, { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null }];
  const rules: Rules = {
    opens: { place: "effect", most: 2, run: () => opens },
    weigh: { place: "outcome", rules: weigh },
    sees: { place: "guard", refusals: ["unseen"], run: (given) => (given.observed({ member: (given.resolved.fields["a"] as { member: MemberId }).member }) ? { holds: true } : { holds: false, name: "unseen" }) },
  };
  return { named: WEIGHER, rules };
}

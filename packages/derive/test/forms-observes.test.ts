import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS, RETAINED_INPUT_BYTES } from "@generalbusiness/artroom-contract";
import type { FactUse, Input, KeyId, MemberId, ObservationUse, OperationId, Send } from "@generalbusiness/artroom-contract";
import { canonicalize, entryHash, factRefOf, isEntry, isObservationUse, signIntent } from "@generalbusiness/artroom-bytes";
import { actNeeds, clockOf, contentChecked, contentStates, judgeDelivery, observationBytes, retainable, retainableByRequest, rowsOfAct, rowsOfKind, settleOutcome, valueDigest, type ActJudgment, type Fetched, type Judgment, type Observing, type OutcomeJudgment, type RuleGiven, type Subject } from "../src/index.ts";
import { Scope, T0, arriving, forged, grantOf, keys, membership, otherLane, t } from "./fixtures.ts";
import { EXTENTS, EXTENTS_MAX, RULEBOOK, STEP_ROWS, holdersSeen, keySeen, memberSeen, rulebook, rulesSeen, signers, stating, weighed, weigher, weigherRules, weigherWith, type Seen } from "./fixtures-observes.ts";

// Scope contract, revisions 20 and 21, sections 6.1 and 16.1; witnesses 18.46, 18.48, 18.50 and 18.52; source rows I3-39, I3-41,
// I3-42, I3-43, I3-53 and I3-56. STAND-INS: the platform data `weigher` and every rule of it are made up (`fixtures-observes.ts`),
// and every observation is written by hand. These show where a subject comes from and what an entry retains. They prove nothing
// about a rule of a destination or of a rules scope, about membership, or about a read.

const { rita, una, vic, paul, sam } = keys;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Change = (data: any) => void;
/** The problems of the made-up data with one change, each as its code and its path. Null: it validates. */
const problems = (change: Change, platform = true): string[] | null => { const v = weighed(change, platform); return v.ok ? null : [...new Set(v.problems.map((p) => `${p.code} ${p.path}`))]; };
const row = (over: object = {}) => ({ of: "member", from: { field: "a" }, max: 1, window: 300, use: "reuse", ...over });
const kindRow = (over: object = {}) => ({ of: "key", from: "rule", max: 3, window: 10, use: "once", without: "wait", ...over });

describe("the rows of `observes` in a definition (section 16.1, the ten checks)", () => {
  test("18.46 cases 1 to 3, and 18.52 cases 1 to 4: the made-up data validates with the platform option; a row of an act that states a rule, the signer, a slot of a name that a mark binds, or `second` does not; and without the option the member is unknown", () => {
    // 18.46 case 1, and 18.52 case 1: each row passes the ten checks. The data states rows, so its entries are judged by them.
    expect([problems(() => {}), problems((d) => { d.outcomes.weigh.origin = "opening"; d.outcomes.weigh.observes = STEP_ROWS; }), weigherWith().observing]).toEqual([null, null, true]);
    // 18.46 case 2: a row of an act states an operand.
    expect(problems((d) => { d.acts["set-checks"].observes[0].from = "rule"; })).toEqual(["name acts.set-checks.observes.0.from"]);
    // 18.46 case 3: as a declared definition the member is unknown, on an act, on a send and on a kind. No pinned lane definition states it.
    expect(problems(() => {}, false)).toEqual(["shape outcomes"]);
    const declared = problems((d) => { delete d.outcomes; d.name = "weigher"; }, false)!;
    expect(["shape acts.set-checks.observes", "shape acts.set.observes", "shape acts.go.sends.0.tell.observes"].map((problem) => declared.includes(problem))).toEqual([true, true, true]);
    // 18.52 case 2: check 10, the signer. Case 3: check 10, a slot of a subject whose name of `also` a mark binds. Case 4: check 9.
    expect(problems((d) => { d.acts.set.observes[0].from = { signer: true }; })).toEqual(["name acts.set.observes.0.from"]);
    expect(problems((d) => {
      d.acts.peek.also = { other: { code: "sees", row: "M3", item: "desk" } };
      d.acts.peek.observes = [row({ from: { slot: "opener", of: "also.other" } })];
    })).toEqual(["name acts.peek.observes.0.from"]);
    expect(problems((d) => { d.acts.set.observes[0].second = true; })).toEqual(["shape acts.set.observes.0.second"]);
  });

  test("each of the ten checks refuses a row that fails it, and the origin of an outcome is one of two words", () => {
    const act = (over: object) => problems((d) => { d.acts.set.observes = [row(over)]; });
    const kind = (rows: object[]) => problems((d) => { d.outcomes.weigh.observes = rows; });
    const clause = (name: string, rows: object[]) => problems((d) => { d.acts.go.sends[0].tell.observes = { [name]: rows }; });
    const RULES = { of: "rules", window: 10, use: "once", without: "wait" };
    expect({
      // Check 1: rows under `undelivered` are refused (witness 18.50, case 10). A `conflict` clause states them only on a creation.
      "1 undelivered": clause("undelivered", [RULES]),
      "1 conflict of a tell": clause("conflict", [RULES]),
      // Check 2: at most 8 rows; a window of at least 1; one of the two words; `most` at most the bound on the elements of a list.
      "2 rows": kind(Array.from({ length: 9 }, () => ({ of: "definitions", window: 10, use: "once", without: "wait" }))),
      "2 window": act({ window: 0 }),
      "2 use": act({ use: "always" }),
      "2 max": act({ max: 0 }),
      "2 most": kind([{ of: "holders", action: "x.do", most: PROPOSED_BOUNDS.listElements + 1, window: 10, use: "once", without: "write" }]),
      // Check 3: the source is an operand that the form may read, whose type is a member; no key, and no rule.
      "3 type": problems((d) => { d.acts.set.fields.a = { type: "text", max: 8, required: true }; }),
      "3 name": act({ from: { field: "nobody" } }),
      "3 key": act({ of: "key" }),
      "3 each": problems((d) => { d.acts["set-checks"].observes[0].from.value = { element: "c.name" }; }),
      // Check 4: in an outcome, a row with subjects states `from: "rule"`.
      "4": kind([kindRow({ from: { field: "a" } })]),
      // Check 5: a row of an outcome or of a clause states `without`, and a row of an act does not.
      "5 act": act({ without: "wait" }),
      "5 kind": kind([{ of: "rules", window: 10, use: "once" }]),
      "5 clause": clause("applied", [{ of: "rules", window: 10, use: "once" }]),
      // Check 6: the sum of `max` is at most the ceiling on the observations of one entry. Such rows also pass the entry size.
      "6": kind([kindRow({ of: "member", max: 100 }), kindRow({ of: "member", max: 29 })]),
      // Check 7: each row at its `max`, each observation at the largest size of its kind, fits the entry size. An act may pass it.
      "7": kind([kindRow({ max: 40 })]),
      "7 act": act({ max: 120 }),
      // Check 8: `retains` only on a row of the rules; no two records of one domain; a `max` within one retained read (18.50, case 9).
      "8 place": kind([{ of: "definitions", window: 10, use: "once", without: "wait", retains: [] }]),
      "8 domain": clause("applied", [{ ...RULES, retains: [{ domain: EXTENTS, max: 8 }, { domain: EXTENTS, max: 9 }] }]),
      "8 max": clause("applied", [{ ...RULES, retains: [{ domain: EXTENTS, max: RETAINED_INPUT_BYTES + 1 }] }]),
      // Check 9: `second` only on a row of an outcome that states `from: "rule"`.
      "9": kind([{ ...RULES, second: true }]),
      // Check 10: no `intent`, and an element only in the value of the row's own `each`, by its `as`.
      "10 intent": act({ from: { intent: true } }),
      "10 element": act({ from: { element: "c.checker" } }),
      "10 as": problems((d) => { d.acts["set-checks"].observes[0].from.value = { element: "other" }; }),
      origin: problems((d) => { d.outcomes.weigh.origin = "closing"; }),
    }).toEqual({
      "1 undelivered": ["shape acts.go.sends.0.tell.observes.undelivered"],
      "1 conflict of a tell": ["shape acts.go.sends.0.tell.observes.conflict"],
      "2 rows": ["bound outcomes.weigh.observes"],
      "2 window": ["shape acts.set.observes.0.window"],
      "2 use": ["shape acts.set.observes.0.use"],
      "2 max": ["shape acts.set.observes.0.max"],
      "2 most": ["bound outcomes.weigh.observes.0.most"],
      "3 type": ["name acts.set.observes.0.from"],
      "3 name": ["name acts.set.observes.0.from"],
      "3 key": ["name acts.set.observes.0.of"],
      "3 each": ["name acts.set-checks.observes.0.from.value"],
      "4": ["name outcomes.weigh.observes.0.from"],
      "5 act": ["shape acts.set.observes.0.without"],
      "5 kind": ["shape outcomes.weigh.observes.0.without"],
      "5 clause": ["shape acts.go.sends.0.tell.observes.applied.0.without"],
      "6": ["bound outcomes.weigh.observes"],
      "7": ["bound outcomes.weigh.observes"],
      "7 act": null,
      "8 place": ["shape outcomes.weigh.observes.0.retains"],
      "8 domain": ["shape acts.go.sends.0.tell.observes.applied.0.retains.1.domain"],
      "8 max": ["bound acts.go.sends.0.tell.observes.applied.0.retains.0.max"],
      "9": ["shape outcomes.weigh.observes.0.second"],
      "10 intent": ["name acts.set.observes.0.from"],
      "10 element": ["name acts.set.observes.0.from"],
      "10 as": ["name acts.set-checks.observes.0.from"],
      origin: ["shape outcomes.weigh.origin"],
    });
    // Check 7 counts each observation at the largest size of its kind: LABELLED PROPOSALS, of which the contract states one, the
    // 48,931 bytes of the content of the rules. The rows of `weigh` take about a third of an entry.
    const { entryBytes } = PROPOSED_BOUNDS;
    const sizes = (["key", "member", "rules", "holders"] as const).map((of) => observationBytes(of, PROPOSED_BOUNDS, 2));
    expect([sizes.every((size) => size < entryBytes), sizes[2]! > 48_931, 40 * sizes[0]! > entryBytes]).toEqual([true, true, true]);
  });

  test("18.50 cases 1 and 2, the part that is a function of the rows: what an entry of a form may newly retain is each value of `retains` at its `max`, and for a request the largest over its clauses that can still run", () => {
    // The byte reservation itself, 1,186,432 against 786,432, is the reservation ledger's: no source counts bytes against a budget
    // (section 17.5; I3 deltas, entry GA8). This is the term that the rows give it: 400,000, and nothing without the row.
    const go = (definition = weigherWith()) => definition.declared.acts["go"]!.sends[0]!;
    expect([retainableByRequest(go()), retainableByRequest(go(weigherWith((d) => { delete d.acts.go.sends[0].tell.observes; })))]).toEqual([EXTENTS_MAX, 0]);
    // A `conflict` result is new work and is not reserved. A kind of `outcomes` and an act count their own rows.
    const both = weigherWith((d) => { d.acts.go.sends[0].tell.observes = { refused: [{ of: "rules", window: 10, use: "once", without: "wait", retains: [{ domain: EXTENTS, max: 7 }, { domain: "x-other-1", max: 5 }] }] }; });
    expect([retainableByRequest(go(both)), retainable(rowsOfKind(weigher, "weigh")), retainable(rowsOfAct(weigher.acts["set"]))]).toEqual([12, 0, 0]);
  });
});

// ---------------------------------------------------------------- the judges

/** What a judgment answered: its result, its reason, and the subjects that the commit lacks. */
const said = (j: ActJudgment | Judgment | OutcomeJudgment) => [j.result, "reason" in j ? j.reason : null, ...("missing" in j && j.missing ? [j.missing.map((needed) => [needed.subject, needed.window.seconds, needed.window.once])] : [])];
/** The scope can still read: a subject with no observation at hand stops the commit. Without it, none can be had. */
const READABLE: Pick<Observing, "unread"> = { unread: () => false };
const observing = (over: Partial<Observing> = {}): Observing => ({ membership, rules: rulebook, content: stating(), ...over });
const observed = (j: ActJudgment | Judgment | OutcomeJudgment): readonly ObservationUse[] | null => (j.result === "write" && "observed" in j.draft.input ? (j.draft.input.observed ?? null) : null);
const numbers = (j: ActJudgment | Judgment | OutcomeJudgment) => observed(j)?.map((use) => use.read.n) ?? null;

describe("an act with rows (section 16.1; witness 18.46, cases 4 to 6 and 16; witness 18.52, case 10)", () => {
  const check = (name: string, checker: MemberId) => ({ name, checker: { membership, member: checker } });
  const checks = (...checkers: string[]) => ({ fields: { checks: checkers.map((checker, i) => check(`c${i}`, `@${checker}` as MemberId)) } });
  const made = () => new Scope(weigherWith());
  const [seenUna, seenVic, seenSam] = [memberSeen("@una", 7), memberSeen("@vic", 8), memberSeen("@sam", 9)];
  const context = (hand: readonly ObservationUse[], over: Partial<Observing> = {}) => ({ platform: weigherRules(), membership, observed: hand, observing: observing(over) });

  test("18.46 cases 4 to 6: a list gives its distinct members as subjects, and the entry retains one record for each, read by a rule or not; a row that is over refuses the act `entry-too-large` and nothing is read for it; a member of another repository is `bad-field`", () => {
    const s = made();
    const three = s.intent(rita, "set-checks", checks("una", "vic", "una"));
    // Case 4. Before the turn the derivation says what to read: two subjects, each within the row's window. It judges nothing.
    expect(actNeeds(s.state, s.definition, three, s.context(context([], READABLE))).map((needed) => [needed.subject, needed.window])).toEqual([[{ member: "@una" }, { seconds: 300, once: false }], [{ member: "@vic" }, { seconds: 300, once: false }]]);
    // In the commit, with one of the two at hand: the commit stops, and names the one that is missing. Once none can be had, the act
    // is answered `authority-unavailable`, and nothing is written.
    expect([said(s.judge(three, context([seenUna], READABLE))), said(s.judge(three, context([seenUna])))]).toEqual([["unavailable", "authority-unavailable", [[{ member: "@vic" }, 300, false]]], ["unavailable", "authority-unavailable"]]);
    // With both at hand, and one of a member that no row gives: written. `observed` holds the two, in ascending order of `read.n`,
    // though no rule of the act reads either. The third is in no entry.
    const judged = s.submit(three, context([seenSam, seenVic, seenUna]));
    expect([said(judged), observed(judged), isEntry(s.last)]).toEqual([["write", null], [seenUna, seenVic], true]);
    expect([s.state.observed(membership, "@una"), s.state.observed(membership, "@vic"), s.state.observed(membership, "@sam")]).toEqual([40, 40, null]);
    // The guards are the judge's, with the row's window: an observation whose age equals 300 seconds is outside it.
    s.now = t(300);
    expect(said(s.act(rita, "set-checks", checks("sam"), context([seenSam])))).toEqual(["unavailable", "authority-unavailable"]);
    s.now = t(299);
    expect(numbers(s.act(rita, "set-checks", checks("sam"), context([seenSam])))).toEqual([9]);

    // Case 5: five checks of five members. The row is over, and no member is read for it.
    const five = s.intent(rita, "set-checks", checks("una", "vic", "sam", "paul", "rita"));
    const refused = s.judge(five, context([], READABLE));
    expect([said(refused), "name" in refused && refused.name, actNeeds(s.state, s.definition, five, s.context(context([], READABLE)))]).toEqual([["refused", "entry-too-large"], "observations", []]);
    // Case 6: the first checker is a member of another repository. It names no subject of this scope.
    const foreign = { fields: { checks: [{ name: "c0", checker: { membership: { ...membership, inc: otherLane.inc }, member: "@una" } }, check("c1", "@vic")] } };
    expect(said(s.act(rita, "set-checks", foreign, context([seenUna, seenVic])))).toEqual(["refused", "bad-field"]);
  });

  test("18.52 case 10, and 18.46 case 16: the signer's own member is served by the grant's observation inside the row's window, and `observed` holds no record of it; a rule of a form that states no row has a fault when it reads an observation; and an entry of such a form has the bytes it had", () => {
    const s = made();
    // Case 10: `a` is the signer's own member, and the grant's observation is 40 seconds old and `reused`. The row states `reuse`.
    const proof = (age: number): ObservationUse => ({ ...keySeen(una.key, "@una", 3, t(-age)), use: "reused", prior: { seq: 1, hash: s.head.hash } });
    const grants = (age: number) => [{ grant: { ...grantOf(una, s.at, ["weigher.set"]), fresh: proof(age) }, current: true }];
    const own = s.act(una, "set", { fields: { a: una.member } }, { ...context([]), grants: grants(40) });
    expect([said(own), s.last.input.type === "act" && "observed" in s.last.input]).toEqual([["write", null], false]);
    // The control: a grant's observation that is outside the row's window does not serve it, and another member is read as any other.
    expect(said(s.act(una, "set", { fields: { a: una.member } }, { ...context([], READABLE), grants: grants(300) }))).toEqual(["unavailable", "authority-unavailable", [[{ member: "@una" }, 300, false]]]);
    expect(said(s.act(una, "set", { fields: { a: vic.member } }, { ...context([]), grants: grants(40) }))).toEqual(["unavailable", "authority-unavailable"]);

    // Case 16: `peek` states no row, and its guard reads the standing of a member. No subject is on the list: a fault.
    const peek = { on: 0, expected: { on: s.item(0).revision }, fields: { a: una.member } };
    const before = s.entries.length;
    expect([said(s.act(rita, "peek", peek, context([seenUna]))), s.entries.length]).toEqual([["unavailable", "unavailable"], before]);

    // A form that states no row: with observations at hand and with none, its entry has the same bytes and no member `observed`.
    const [a, b] = [made(), made()];
    const point = { on: 0, expected: { on: 1 }, fields: { peer: otherLane } };
    a.did(rita, "point", point);
    b.act(rita, "point", point, context([seenUna, seenVic]));
    expect([entryHash(a.last), "observed" in b.last.input]).toEqual([entryHash(b.last), false]);
  });
});

/** A lane's entry that decides one check, MADE BY HAND and signed by that key: nothing judged it. */
function decided(seq: number, who: typeof una, check: string): Fetched {
  const signed = signIntent({ v: 1, to: otherLane, actor: who.key, kind: "decide", on: null, expected: {}, fields: { check }, idempotencyKey: `d${seq}`, notAfter: t(60) }, who.secret);
  const input: Input = { type: "act", signed, authority: [], presented: {} };
  const source = forged(otherLane, seq, input, []);
  return { fact: factRefOf(source.entry), entry: source.entry, under: "lane" };
}

describe("an outcome with rows, and its origin (sections 6.1 and 16.1; witness 18.46, cases 7 to 12; witness 18.52, cases 5 to 9)", () => {
  const [c1, c2] = [decided(41, una, "c1"), decided(42, vic, "c2")];
  const [k1, k2, k3, k4] = [una.key, vic.key, paul.key, sam.key];
  /** A desk whose entry G.n opened one operation of `weigh`, and names the two entries of the lane in `uses`. */
  const made = (change: Change = () => {}) => {
    const s = new Scope(weigherWith(change));
    const started = s.act(rita, "start", { on: 0, expected: { on: 1 }, fields: { first: c1.fact, second: c2.fact } }, { platform: weigherRules(), facts: [c1, c2] });
    if (started.result !== "write") throw new Error(`the operation was not opened: ${JSON.stringify(started)}`);
    return { s, origin: s.last, operation: `${s.last.seq}:0` as OperationId };
  };
  /** The scope's retained copy of an entry that the origin's `uses` names. */
  const retained = (use: FactUse) => [c1, c2].find((copy) => copy.fact.hash === use.fact.hash) ?? null;
  const settleWith = (on: { s: Scope; operation: OperationId }, seen: Seen, hand: readonly ObservationUse[], over: Partial<Observing> = {}, first?: (given: RuleGiven) => KeyId[], at = on.s.now) =>
    settleOutcome(on.s.state, on.s.definition, { type: "outcome", operation: on.operation, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body: {} } },
      { clock: clockOf(on.s.state, at), bounds: PROPOSED_BOUNDS, own: on.s.own, platform: weigherRules(seen, first), observed: hand, retained, observing: observing(over) });
  const blank = (): Seen => ({ rows: [], read: [], named: [] });

  test("18.46 cases 7 to 12: the outcome's `uses` is a copy of its origin's and nothing is fetched; `observed` holds one fresh record for each subject of a whole row; an age that equals the window is outside it; a row that is over is told to the rule; `write` writes without the row and `wait` does not write; and a subject that the commit's list adds stops the commit", () => {
    const g = made();
    const { s, origin } = g;
    s.now = t(8);
    const [rules, seen1, seen2, holders] = [rulesSeen(["c1"], 1, t(3)), keySeen(k1, "@una", 2, t(3)), keySeen(k2, "@vic", 3, t(3)), holdersSeen(["@rita", "@una"], 3, 4, t(3))];
    const all = [holders, seen2, seen1, rules];

    // Case 7: the rule names G.n as its origin and the two keys that signed the entries in its `uses`. Four subjects, each read less
    // than 10 seconds before the commit. Written: `uses` is a copy of the origin's, and `observed` holds four records, each fresh.
    const seen = blank();
    const judged = settleWith(g, seen, all);
    expect([said(judged), numbers(judged), observed(judged)?.every((use) => use.use === "fresh"), judged.result === "write" && [judged.draft.uses, judged.draft.judgesTime]]).toEqual([["write", null], [1, 2, 3, 4], true, [origin.uses, true]]);
    expect([origin.uses.map((use) => use.fact), seen.named, seen.rows, seen.read]).toEqual([[c1.fact, c2.fact], [[1, [k1, k2]]], [["whole", "whole", "whole"]], [[1, 2, 3]]]);
    // An entry that retains an observation judges time: with the clock behind it is not written on that reading.
    expect(settleWith(g, blank(), all, {}, undefined, "2000-01-01T00:00:00Z")).toEqual({ result: "unavailable", reason: "clock-behind" });
    // The retained copy of an entry of the origin's `uses` is not at hand: the outcome is not written now, and nothing is fetched.
    expect(said(settleOutcome(s.state, s.definition, { type: "outcome", operation: g.operation, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body: {} } },
      { clock: clockOf(s.state, s.now), bounds: PROPOSED_BOUNDS, own: s.own, platform: weigherRules(), observed: all, facts: [c1], observing: observing() }))).toEqual(["unavailable", "dependency-unavailable"]);

    // Case 8: the commit's reading is 10 seconds after the read of one key began. An age that equals the window is outside it: not
    // written. The observation is discarded and read again, and the outcome stays offered.
    const late = [rules, seen1, { ...seen2, observation: { ...seen2.observation, at: t(-2) } }, holders];
    expect([said(settleWith(g, blank(), late)), said(settleWith(g, blank(), late, READABLE))]).toEqual([["unavailable", "authority-unavailable"], ["unavailable", "authority-unavailable", [[{ key: k2 }, 10, true]]]]);
    // A record that is not `fresh` does not serve a row that states `once`.
    expect(said(settleWith(g, blank(), [rules, seen1, { ...seen2, use: "reused", prior: { seq: 1, hash: s.head.hash } }, holders]))).toEqual(["unavailable", "authority-unavailable"]);

    // Case 10: membership cannot be reached for the holders, and that row states `write`. Written, with three records. The rule is
    // told that the row is absent. Case 11: the rules scope cannot be reached, and that row states `wait`. Not written.
    const without = blank();
    const three = settleWith(g, without, [rules, seen1, seen2]);
    expect([numbers(three), without.rows, said(settleWith(g, blank(), [seen1, seen2, holders]))]).toEqual([[1, 2, 3], [["whole", "whole", "absent"]], ["unavailable", "authority-unavailable"]]);
    // An answer that lists other than the first `most` holders is no record of the row.
    expect(numbers(settleWith(g, blank(), [rules, seen1, seen2, holdersSeen(["@rita"], 3, 4, t(3))]))).toEqual([1, 2, 3]);

    // Case 12: between the derivation before the turn and the commit, another entry changes the state so that the rule names a
    // third key. The commit's list holds a subject with no observation at hand: the commit stops, and names it.
    s.did(rita, "more", { on: 0, expected: { on: s.item(0).revision }, fields: { more: [k3] } });
    expect(said(settleWith(g, blank(), all, READABLE))).toEqual(["unavailable", "authority-unavailable", [[{ key: k3 }, 10, true]]]);
    // Case 9: the rule names four keys. The row of keys is over: no key is retained, also one that is at hand. Written, with the
    // rules and the holders. The rule is told that the row is over.
    s.did(rita, "more", { on: 0, expected: { on: s.item(0).revision }, fields: { more: [k3, k4] } });
    const over = blank();
    const two = settleWith(g, over, all);
    expect([numbers(two), over.rows, over.read]).toEqual([[1, 4], [["whole", "over", "whole"]], [[1, null, null, null, null]]]);
    if (two.result === "write") expect(isEntry(s.seal(two.draft))).toBe(true);
    expect([s.state.observed(rulebook, "rules"), s.state.observed(membership, "holders:x.do"), s.state.observed(membership, k1)]).toEqual([7, 40, null]);
  });

  test("18.52 cases 5 to 9: the second step names its subjects from the observation of the first; a subject of both steps is one record; a row that is absent and states `write`, or that is over, is told to the rule while a whole row retains its subject; an absent row that states `wait` leaves the outcome offered; and a first step that changes can add a subject", () => {
    const stepped: Change = (d) => { d.outcomes.weigh.origin = "opening"; d.outcomes.weigh.observes = STEP_ROWS; };
    /** R3, the row of the first step, names k1 and then each key of the desk's `more`. R2, of the second step, names the key behind each required check. */
    const first = (given: RuleGiven): KeyId[] => [k1, ...signers(given).slice(2)];
    const g = made(stepped);
    const { s, origin } = g;
    s.did(rita, "more", { on: 0, expected: { on: s.item(0).revision }, fields: { more: [k3] } });
    s.now = t(8);
    const [rules, seen1, seen3] = [rulesSeen(["c1"], 1, t(3)), keySeen(k1, "@una", 2, t(3)), keySeen(k3, "@paul", 3, t(3))];

    // Case 5: the rules require c1 and not c2. The first step reads the rules, k1 and k3. The second step gives k1, which is at
    // hand. Written, with three records: k1 is one subject of both steps. Each row is whole. With `origin: "opening"` the origin is
    // the entry that opened the operation, and no rule names it.
    const seen = blank();
    const judged = settleWith(g, seen, [seen3, seen1, rules], {}, first);
    expect([numbers(judged), seen.named, seen.rows, judged.result === "write" && judged.draft.uses]).toEqual([[1, 2, 3], [[2, [k1, k3]], [1, [k1]]], [["whole", "whole", "whole"]], origin.uses]);
    // Case 6: k3 cannot be read. R3 is absent, and states `write`. R2 gives k1 and is whole: k1 is retained for it.
    const absent = blank();
    expect([numbers(settleWith(g, absent, [rules, seen1], {}, first)), absent.rows]).toEqual([[1, 2], [["whole", "whole", "absent"]]]);
    // Case 7: k1 cannot be read. R2 is absent, and states `wait`: not written. The outcome stays offered.
    expect(said(settleWith(g, blank(), [rules, seen3], {}, first))).toEqual(["unavailable", "authority-unavailable"]);
    // Case 8: in the commit the observation of the rules is past its window: it is read again. The new answer requires c2 too, so
    // the second list holds k2, with no observation at hand. The commit stops, and names it.
    const aged = { ...rules, observation: { ...rules.observation, at: t(-2) } };
    const again = rulesSeen(["c1", "c2"], 4, t(7));
    expect([said(settleWith(g, blank(), [aged, seen1, seen3], READABLE, first)), said(settleWith(g, blank(), [again, seen1, seen3], READABLE, first))])
      .toEqual([["unavailable", "authority-unavailable", [[{ asked: "rules" }, 10, true]]], ["unavailable", "authority-unavailable", [[{ key: k2 }, 10, true]]]]);
    // Case 9: the rule of R3 names k1, k3 and k4. R3 is over: 3 is more than its `max` of 2. Written, with the rules and k1, which
    // R2 gives. The rule is told that R3 is over.
    s.did(rita, "more", { on: 0, expected: { on: s.item(0).revision }, fields: { more: [k3, k4] } });
    const over = blank();
    expect([numbers(settleWith(g, over, [rules, seen1, seen3], {}, first)), over.rows]).toEqual([[1, 2], [["whole", "whole", "over"]]]);
    // A rule of the second step that reads an observation which no row of the first step gives has a fault.
    const reads = weigherRules(blank(), first, { subjects: (_given, _operation, _row, step) => (step?.observed({ member: "@una" }) ? [] : [k1]) });
    expect(said(settleOutcome(s.state, s.definition, { type: "outcome", operation: g.operation, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body: {} } },
      { clock: clockOf(s.state, s.now), bounds: PROPOSED_BOUNDS, own: s.own, platform: reads, observed: [rules, seen1], retained, observing: observing() }))).toEqual(["unavailable", "unavailable"]);
  });
});

describe("a clause of a result with a row, and a value that its observation names (section 16.1; witness 18.48, cases 6, 7 and 9; witness 18.50, cases 4 and 6 to 8)", () => {
  const list = ["src/**", "docs/**"];
  const [bytes, digest] = [canonicalize(list), valueDigest(EXTENTS, list)];
  /** The made-up rules definition U states the slot `extents`, so an observation under it holds the digest. */
  const U = stating({ extents: true });
  /** A desk that sent one `ask`, and the applied result of it as it arrives, from an entry MADE BY HAND. */
  const made = (change: Change = () => {}) => {
    const s = new Scope(weigherWith(change));
    s.did(rita, "point", { on: 0, expected: { on: 1 }, fields: { peer: otherLane } });
    const sent = s.did(rita, "go", { on: 0, expected: { on: 2 } });
    const request = { from: s.fact(sent.seq), n: 0 };
    const answer: Send = { n: 0, to: s.at, message: { class: "result", of: request, outcome: "applied" } };
    const source = forged(otherLane, 9, { type: "delivery", from: request.from, n: 0, message: sent.sends[0]!.message as never, decision: "applied" }, [answer]);
    const arrival = { ...answer, from: factRefOf(source.entry) };
    s.now = t(8);
    const record = (hand: readonly ObservationUse[], values: readonly string[], over: Partial<Observing> = {}) =>
      judgeDelivery(s.state, s.definition, arrival, { ...arriving(s, arrival, source), platform: weigherRules(), observed: hand, values, observing: observing({ content: U, ...over }) });
    return { s, record };
  };

  test("the row is whole when the bytes beside the answer hash to the digest, in a stated domain and within the `max`: the entry holds the digest and the draft names the value for the scope to keep; bytes that are missing, that do not hash, or that are over the `max` are no answer, and the row's `wait` leaves the result not recorded; a record without the member that its definition states is no observation", () => {
    const { s, record } = made();
    const rules = rulesSeen([], 5, t(3), digest);
    // 18.48 case 6, and 18.50 case 4: the observation is at hand. The entry that retains it holds the digest, and the list is one
    // retained value, by its domain and its digest. The clause's effect runs.
    const judged = record([rules], ["\"other bytes\"", bytes]);
    expect([said(judged), observed(judged), judged.result === "write" && [judged.draft.values, judged.draft.judgesTime, judged.draft.effects]])
      .toEqual([["write", null], [rules], [[{ domain: EXTENTS, digest, bytes }], true, [{ effect: "value", item: 0, slot: "note", value: "done" }]]]);
    // Before the turn, the same derivation says what to read: the rules, once, with the domains in which the answer may name a value.
    const asked = record([], [], READABLE);
    expect([said(asked), asked.result === "unavailable" && asked.missing?.[0]?.retains]).toEqual([["unavailable", "authority-unavailable", [[{ asked: "rules" } satisfies Subject, 10, true]]], [{ domain: EXTENTS, max: EXTENTS_MAX }]]);
    // 18.48 case 7, and 18.50 case 7: no bytes beside the answer, or bytes that do not hash to the digest. The answer is not whole:
    // no observation. The row states `wait`: the entry is not written, and the delivery is tried again.
    expect([said(record([rules], [])), said(record([rules], [canonicalize(["src/**"])]))]).toEqual([["unavailable", "authority-unavailable"], ["unavailable", "authority-unavailable"]]);
    // 18.48 case 9: an observation under U whose content has no member `extents`, though the data of its definition states the slot.
    // The record check refuses it: it is no observation. The same for one that holds the member under data that states none.
    const bare = rulesSeen([], 5, t(3));
    expect([said(record([bare], [bytes])), said(record([rules], [bytes], { content: stating() })), said(record([rules], [bytes], { content: () => null }))])
      .toEqual([["unavailable", "authority-unavailable"], ["unavailable", "authority-unavailable"], ["unavailable", "authority-unavailable"]]);
    expect([contentChecked(rules.observation as never, U(RULEBOOK)), contentChecked(bare.observation as never, U(RULEBOOK)), contentChecked(bare.observation as never, stating()(RULEBOOK)), isObservationUse(rules)]).toEqual([true, false, true, true]);
    // What the data of a rules definition states of the two members, read from its item `rules`.
    const states = (values: object) => contentStates({ items: { rules: { ...weigher.items["desk"]!, values } } } as never);
    expect([states({ extents: {} }), states({ singleControllerException: {} }), contentStates(weigher)]).toEqual([{ singleControllerException: false, extents: true }, { singleControllerException: true, extents: false }, { singleControllerException: false, extents: false }]);
    if (judged.result === "write") expect(isEntry(s.seal(judged.draft))).toBe(true);

    // 18.50 case 6: the list is over the row's `max`. No answer, so no observation: the row states `wait`. The number is made up:
    // the row here states 8 bytes, and the list has more. A row that states no `retains` can read no observation that names a value.
    for (const narrow of [(d: Parameters<Change>[0]) => { d.acts.go.sends[0].tell.observes.applied[0].retains[0].max = 8; }, (d: Parameters<Change>[0]) => { delete d.acts.go.sends[0].tell.observes.applied[0].retains; }]) {
      expect(said(made(narrow).record([rules], [bytes]))).toEqual(["unavailable", "authority-unavailable"]);
    }
    // A row that is absent and states `write`: the result is recorded without the observation, and nothing is kept.
    const written = made((d) => { d.acts.go.sends[0].tell.observes.applied[0].without = "write"; }).record([rules], []);
    expect([said(written), observed(written), written.result === "write" && written.draft.values]).toEqual([["write", null], null, undefined]);
  });

  test("a clause that states no row, in a definition that states rows: the entry of its result holds no member `observed`, whatever is at hand", () => {
    const { record } = made((d) => { delete d.acts.go.sends[0].tell.observes; });
    const judged = record([rulesSeen([], 5, t(3), digest), memberSeen("@una", 6, T0)], [bytes]);
    expect([said(judged), observed(judged), judged.result === "write" && judged.draft.values]).toEqual([["write", null], null, undefined]);
  });
});

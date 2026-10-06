import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Entry, FieldValue, OperationId, Request } from "@generalbusiness/artroom-contract";
import { canonicalize, factRefOf } from "@generalbusiness/artroom-bytes";
import { derivable, operationSettled, runnable, type Item, type JudgedInput, type PlatformRule, type RuleGiven } from "@generalbusiness/artroom-derive";
import { t } from "@generalbusiness/artroom-derive/testing";
import { COLLECT_MOST, DESTINATION, DESTINATION_KINDS, NAMED_MOST, RECEIPTS_OWED, REPORTS_MOST, destination, destinationRules, revokedToken, writeSends } from "../src/destination.ts";
import { firstExtents } from "../src/extents.ts";
import { platform } from "../src/index.ts";
import { judgeReservation, type JudgeEvidence, type ReservationRead, type Statement } from "../src/reservation.ts";
import { Branch, FOUND, HEAD, NEXT, OTHER, RECEIPT, TREE, destinationDefinition, fetched, handMade, keyObserved, listed, reading, reportMade, rita, rulesObserved, said, una } from "./support-destination.ts";

// Every scope here is a `Branch` of test support: a destination scope in memory, below a made-up bureau that stands for the
// directory. Its rules are the platform package's, with a STAND-IN reader of what a lane's entries say for a reservation. The judge of an outcome is
// given the observations and the entries at hand, and writes `observed` and `uses` itself. The lane's entries,
// each observation and every answer of the Git host are made by hand. No Git, no network and no provider is reached.

const WRITTEN = ["write", null, null];
const BAD_INPUT = ["refused", "bad-input", null];
/** The result that the last entry sent for the request that it decided: the outcome, and the reason's code and name. */
const result = (b: Branch) => {
  const message = b.last.sends.at(-1)!.message;
  return message.class === "result" ? [message.outcome, message.reason?.code ?? null, message.reason?.name ?? null] : null;
};
const publications = (b: Branch) => b.state.page("publication", ["queued", "reserved", "publishing", "unresolved", "published", "aborted", "not-reserved"], null, 10).items.map((item) => [item.id, item.state, item.values["reason"], item.values["withdrawDecided"]]);
/** The `publication` updates that the last entry sent: the relationship state and the detail of each. */
const updates = (b: Branch) => b.last.sends.flatMap((send) => (send.message.class === "request" && send.message.type === "relate" ? [[(send.message.body as { state: string }).state, (send.message.body as { detail: unknown }).detail]] : []));
/** The ID of the operation that the entry at that position opened at that ordinal. */
const op = (seq: number, k: number) => `${seq}:${k}` as OperationId;
const outcomesOf = (b: Branch, operation: OperationId) => b.state.operation(operation)!.attempts.map((attempt) => attempt.outcomes.map((outcome) => outcome.result));
const rule = (name: string) => { const found = destinationRules[name]!; if (found.place !== "outcome") throw new Error(`${name} is no rule of an outcome`); return found.rules; };
const TOKEN = { token: "host-token-1", ends: t(600) };

// The plan's T43, for `platform:destination@1` (authority note, revision 26, section 12.1.5, and its table of marks, section 12.1.8).
test("the destination definition validates whole with the platform option; its marks and its outcome kinds are listed; every mark has a rule, so the package's rules run it; it names no fence", () => {
  const checked = destinationDefinition;
  expect([checked.underived, derivable(checked, null), destination.capabilities, destination.rules, destination.timed]).toEqual([[], true, [], {}, {}]);
  // Section 12.1.5: three item types, with their states; the genesis `establish` and three acts; four handlers. From revision 28 a
  // receipt is an item of its own, and the slot `publication.receipt` is withdrawn: five of the six slots of revision 25 stand,
  // with the four slots of the item `receipt`. Its `max` is the `max` of `publication`, plus the number of `receipts-owed`, plus 1.
  expect([Object.entries(destination.items).map(([name, type]) => [name, type.max, type.initial, Object.entries(type.states).map(([state, { final }]) => (final ? `${state}!` : state))]), destination.genesis, Object.keys(destination.acts)]).toEqual([
    [["branch", 1, "empty", ["empty", "ready"]], ["publication", 64, "queued", ["queued", "reserved", "publishing", "unresolved", "published!", "aborted!", "not-reserved!"]], ["receipt", 129, "owed", ["owed", "written!", "conflict!"]]],
    "establish", ["establish", "adopt-head", "resend", "resend-receipt", "add-room", "add-branch-room"],
  ]);
  expect([Object.keys(destination.items["branch"]!.refs), Object.keys(destination.items["branch"]!.values), Object.keys(destination.items["publication"]!.values), destination.items["receipt"]!.refs, Object.entries(destination.items["receipt"]!.values).map(([name, slot]) => [name, slot.fixed, slot.required])]).toEqual([
    ["directory", "claim", "slot", "judging"], ["repository", "name", "import", "membership", "rules", "head", "token"], ["integration", "reason", "withdrawDecided", "reservedAt", "aborting", "token"],
    { publication: { fixed: true, required: false, to: { type: "item", of: "publication" } } }, [["commit", true, true], ["opening", true, false], ["token", false, false]],
  ]);
  // The six fields of `reserve` (revision 28, section 6.5): two facts, two written lists of records that name facts, the `collect`
  // list `links`, and the written list `reports` of at most 32 facts of a `report` under `issue`.
  const fields = destination.receives["reserve"]!.fields as Record<string, { type: string; max?: number; of?: unknown; required: boolean }>;
  expect([Object.keys(fields), fields["verdicts"]!.max, fields["jobs"]!.max, fields["reports"], NAMED_MOST, REPORTS_MOST, COLLECT_MOST]).toEqual([
    ["operation", "manifest", "verdicts", "jobs", "links", "reports"], 64, 64, { type: "list", max: 32, required: true, of: { type: "fact", kind: ["report"], under: "issue" } }, 64, 32, { links: 32 },
  ]);
  expect([RECEIPTS_OWED, destination.receives["reserve"]!.guards.at(-1), destination.acts["resend"]!.guards[0], destination.acts["resend-receipt"]!.guards[0]]).toEqual([
    64, { count: { type: "receipt", states: ["owed"], max: 64 }, reason: "receipts-owed" }, { state: ["unresolved"] }, { state: ["owed"], of: "also.receipt", reason: "receipt-not-owed" },
  ]);
  expect(Object.values(destination.receives).map((h) => [h.message, h.class, h.from.kind, h.from.under, h.opens, h.copies ?? null])).toEqual([
    ["import", "relate", "directory", "platform:directory", null, 1], ["reserve", "tell", "lane", "change", "publication", null],
    ["withdraw", "tell", "lane", "change", null, null], ["compromised", "tell", "directory", "platform:directory", null, null],
  ]);
  // "No entry of the destination sends more than one request and the platform's one result": the one written send is the final update of a `withdraw`.
  expect([...Object.values(destination.acts), ...Object.values(destination.receives)].flatMap((row) => row.sends.map((send) => Object.keys(send)[0]))).toEqual(["relate"]);

  // The marks, by the rows of the note's table: rows 30 to 37, row b at its one field, row z, place 7, and the send of rows m and n.
  const marks = [
    [5, "acts.establish.effects.7", "declare-first-head", "P16"], [5, "receives.import.effects.0", "open-first-head", "P16"], [5, "receives.reserve.effects.3", "open-judge", "P16"],
    [2, "receives.withdraw.also.publication", "publication-of", "P15"], [5, "receives.withdraw.effects.3", "open-withdrawn", "P15"], [5, "receives.compromised.effects.0", "abort-if-behind", "P19"],
    [5, "acts.adopt-head.effects.0", "open-branch-read", "P16"], [5, "acts.resend.effects.0", "reopen-publish", "P16"], [4, "acts.resend.guards.1", "resend-due", "P29"],
    // From revision 28 the two marks of `resend` each stand at a second row, `resend-receipt`. No mark is added.
    [5, "acts.resend-receipt.effects.0", "reopen-publish", "P16"], [4, "acts.resend-receipt.guards.1", "resend-due", "P29"],
    // From revision 28 the mark `collect-list` stands on one field, `links`, where it stood on three.
    [3, "receives.reserve.fields.links", "collect-list", "P25"],
    [7, "outcomes.first-head", "first-head", "P16"], [7, "outcomes.judge", "judge", "P19"], [7, "outcomes.push", "push", "P16"], [7, "outcomes.mint", "mint", "P16"],
    [7, "outcomes.revoke", "revoke", "P16"], [7, "outcomes.read", "deciding-read", "P16"], [7, "outcomes.receipt", "receipt", "P16"], [7, "outcomes.adopt-read", "adopt-read", "P16"],
    ...["judge", "push", "mint", "revoke", "read", "receipt"].map((kind) => [6, `outcomes.${kind}.send`, "publication-update", "P16"]),
  ];
  expect(checked.marks.map((m) => [m.place, m.path, m.code, m.row]).sort()).toEqual(marks.sort());
  // The kinds of operation that the definition owns. The fence of section 6.8 is not adopted: the data names none.
  expect([Object.keys(destination.outcomes), Object.values(DESTINATION_KINDS), JSON.stringify(destination).includes("fence")]).toEqual([
    ["first-head", "judge", "push", "mint", "revoke", "read", "receipt", "adopt-read"], Object.keys(destination.outcomes), false,
  ]);

  // The whole-scope rule (the contract's section 6.1): a version with a mark and no rule runs nothing. The package has 19 rules,
  // each of the kind of its place, with the most effects that each states. Every mark has its rule.
  const { rules } = platform(DESTINATION)!;
  expect(rules).toBe(destinationRules);
  expect(Object.entries(rules).map(([name, held]) => [name, held.place, "most" in held ? held.most : held.place === "outcome" ? (held.rules.most?.effects ?? null) : null])).toEqual([
    ["declare-first-head", "effect", 2], ["open-first-head", "effect", 4], ["open-judge", "effect", 3], ["publication-of", "also", null], ["open-withdrawn", "effect", 5],
    ["abort-if-behind", "effect", 6], ["open-branch-read", "effect", 2], ["resend-due", "guard", null], ["reopen-publish", "effect", 4], ["collect-list", "type", null],
    // `most`, counted again (revision 28; I3 deltas, entry FA11): a push that publishes yields 16 effects, and a read that publishes 13.
    ["mint", "outcome", 2], ["revoke", "outcome", 0], ["push", "outcome", 16], ["first-head", "outcome", 15], ["receipt", "outcome", 5], ["deciding-read", "outcome", 13], ["adopt-read", "outcome", 5], ["judge", "outcome", 10], ["publication-update", "send", null],
  ]);
  const lacking = [...new Set(checked.marks.filter((mark) => !Object.hasOwn(rules, mark.code)).map((mark) => mark.code))];
  expect(lacking).toEqual([]);
  expect(runnable(checked, rules)).toBe(true);
  for (const lost of ["first-head", "receipt"]) expect(runnable(checked, { ...rules, [lost]: undefined as never })).toBe(false);
});

// The plan's T50, the destination's first table: each rule of `platform:destination@1` at an act or a handler, as a plain function,
// from its row of the note's table of marks (section 12.1.8). A rule is called with what a judge gives it.
test("each rule of platform:destination@1 at an act or a handler, as a plain function, gives what its row of the table of marks states (authority note, section 12.1.8)", () => {
  /** A destination with its first head and no publication; and one whose one queued publication has its `judge` open. */
  const fresh = new Branch(false).ready();
  const ready = new Branch(false).ready();
  const reserved = ready.reserve();
  const queued = ready.head.seq;
  const empty = new Branch(true).confirmed();
  const relate = (state: string): JudgedInput => ({ type: "delivery", from: empty.bureau.fact(0), n: 0, message: { class: "request", type: "relate", body: { name: "import", item: empty.bureau.fact(0), state, detail: {} } } });
  const tell: JudgedInput = { type: "delivery", from: reserved.operation, n: 0, message: { class: "request", type: "tell", body: {} } };
  /** What a rule is given: the state of that scope, an input, the fields as read and the subjects that are bound. */
  const given = (b: Branch, input: JudgedInput, fields: Record<string, unknown> = {}, subjects: Record<string, Item> = {}): RuleGiven => ({
    state: b.state, input, time: b.now, uses: [], own: b.own,
    resolved: { at: b.at, self: b.head.seq + 1, fields: fields as Record<string, FieldValue>, subjects: new Map(Object.entries(subjects)), signer: null, bounds: PROPOSED_BOUNDS },
    observed: () => null, value: () => undefined, placed: () => undefined,
  });
  const run = (name: string, ...args: unknown[]): unknown => { const held = destinationRules[name] as PlatformRule & { run: (...args: unknown[]) => unknown; bind: (...args: unknown[]) => unknown }; return name === "publication-of" ? held.bind(...args) : held.run(...args); };
  const opens = (kind: string, attempts: number, k = 0, holder = 0) => [{ effect: "operation", k, owner: DESTINATION, kind, attempts, for: holder }, { effect: "attempt", operation: { k }, attempt: 1, result: "opened", selected: null }];
  const publication = (state: string): Item => ({ ...ready.item(queued), state });
  /** A receipt in that state, made by hand: the rule reads its type and its state alone. */
  const receipt = (state: string): Item => ({ ...ready.item(queued), type: "receipt", state });
  const self = ready.head.seq + 1;
  const link = { link: reserved.operation, issue: ready.other.at };
  const type = (field: string, value: unknown) => [given(ready, tell), value, { field }];

  const rows: readonly (readonly [row: string, rule: string, args: readonly unknown[], expected: unknown])[] = [
    // Row 30: with no import the genesis declares the operation and its attempt's mint, held: no attempt. With an import it declares none.
    ["30: no import: `first-head` with 3 attempts stated, and its mint, both held", "declare-first-head", [given(empty, tell, { import: false })],
      [{ effect: "operation", k: 0, owner: DESTINATION, kind: "first-head", attempts: 3, for: empty.head.seq + 1 }, { effect: "operation", k: 1, owner: DESTINATION, kind: "mint", attempts: 1, for: empty.head.seq + 1 }]],
    ["30: an import: nothing", "declare-first-head", [given(empty, tell, { import: true })], []],
    // Row 31: the update's state and its commit.
    ["31: `done` with a commit: `first-head`, its attempt 1 and that attempt's mint", "open-first-head", [given(empty, relate("done"), { commit: HEAD }, { "also.branch": empty.branch })], [...opens("first-head", 3), ...opens("mint", 1, 1)]],
    ["31: `failed`: nothing", "open-first-head", [given(empty, relate("failed"), { commit: HEAD }, { "also.branch": empty.branch })], []],
    ["31: `done` that names no commit: nothing", "open-first-head", [given(empty, relate("done"))], []],
    // Row 32, "The next `judge`": the slot is empty, no `judge` is open, the branch is `ready` and a publication is `queued`.
    ["32: `ready`, nothing queued before: `judge`, and `judging` is the publication that the entry opens", "open-judge", [given(fresh, tell)], [...opens("judge", 1, 0, fresh.head.seq + 1), { effect: "ref", item: 0, slot: "judging", to: fresh.head.seq + 1 }]],
    ["32: a `judge` is open: nothing", "open-judge", [given(ready, tell)], []],
    ["32: the branch is `empty`: nothing", "open-judge", [given(empty, tell)], []],
    // Row 34: the publication by its operation, in any state; and the opening when none is bound.
    ["34: the publication whose operation the message names", "publication-of", [[ready.item(queued)]], queued],
    ["34: another operation: none", "publication-of", [[]], null],
    ["34: no publication is bound: one opening, `not-reserved`, \"withdrawn\"", "open-withdrawn", [given(ready, tell, { operation: reserved.operation })], [
      { effect: "open", item: self, type: "publication", state: "queued" }, { effect: "ref", item: self, slot: "operation", to: reserved.operation },
      { effect: "ref", item: self, slot: "lane", to: ready.lane.at }, { effect: "state", item: self, state: "not-reserved" }, { effect: "value", item: self, slot: "reason", value: "withdrawn" },
    ]],
    ["34: a publication is bound: nothing", "open-withdrawn", [given(ready, tell, { operation: reserved.operation }, { "also.publication": publication("queued") })], []],
    // Row 36: one read of the branch.
    ["36: one read, with 1 attempt", "open-branch-read", [given(ready, tell, {}, { on: ready.branch })], opens("adopt-read", 1)],
    // Row 37: the same compare-and-swap, with 1 attempt and that attempt's mint. At `resend`: the push of an unresolved publication.
    // At `resend-receipt`, which is on the branch: the write of the receipt that the act names, while it is owed.
    ["37: `unresolved`: the push, with 1 attempt, and its mint", "reopen-publish", [given(ready, tell, {}, { on: publication("unresolved") })], [...opens("push", 1, 0, queued), ...opens("mint", 1, 1, queued)]],
    ["37: a receipt that is `owed`: its write, with 1 attempt, and its mint", "reopen-publish", [given(ready, tell, {}, { on: ready.branch, "also.receipt": receipt("owed") })], [...opens("receipt", 1), ...opens("mint", 1, 1)]],
    ["37: a receipt that is final: nothing", "reopen-publish", [given(ready, tell, {}, { on: ready.branch, "also.receipt": receipt("written") })], []],
    ["37: a publication in any other state: nothing", "reopen-publish", [given(ready, tell, {}, { on: publication("published") })], []],
    // Row b: each record of the `collect` list `links`, up to its number. The two other lists have written types now.
    ["b: links", "collect-list", type("links", [link]), true],
    ["b: a link to a scope that is no lane", "collect-list", type("links", [{ ...link, issue: ready.bureau.at }]), false],
    ["b: one link more than the lane holds", "collect-list", type("links", Array(COLLECT_MOST.links + 1).fill(link)), false],
    ["b: a link with a member that the lane does not send", "collect-list", type("links", [{ ...link, label: "x" }]), false],
    ["b: a value that is no list", "collect-list", type("links", link), false],
    ["b: a field that the rule is not the type of", "collect-list", type("verdicts", []), false],
  ];
  for (const [row, name, args, expected] of rows) expect(run(name, ...args), `${name}, row ${row}`).toEqual(expected);
});

// Section 12.2, and rows 30 and 31 of the table of marks, as judgments of the real rows with the real rules.
test("a founding with no import declares the first head and its mint in the genesis, held, and the entry that records the confirm opens attempt 1 of both; a founding by import opens them on the directory's `done` update, from the directory alone", () => {
  // No import. The genesis opens `branch`, `empty`, with the creation's fields, and holds two operations with no attempt.
  const b = new Branch(false);
  expect([b.branch.state, b.branch.values["name"], b.branch.values["import"], b.branch.refs["directory"], b.branch.refs["slot"], b.branch.values["head"], b.state.scope()!.status])
    .toEqual(["empty", "main", false, b.bureau.at, null, null, "provisional"]);
  expect([b.opened, b.state.operation("0:0")]).toEqual([[["first-head", 3, false], ["mint", 1, false]], { id: "0:0", owner: DESTINATION, kind: "first-head", most: 3, attempts: [], selected: null, for: 0 }]);
  // The confirmation activates the scope and opens attempt 1 of each held operation (the contract's section 4.3, item 1).
  b.confirmed();
  expect([b.state.scope()!.status, b.last.effects, b.state.operation("0:0")!.attempts, b.state.operation("0:1")!.attempts]).toEqual([
    "active", [{ effect: "activate" }, { effect: "attempt", operation: "0:0", attempt: 1, result: "opened", selected: null }, { effect: "attempt", operation: "0:1", attempt: 1, result: "opened", selected: null }],
    [{ attempt: 1, opened: 1, outcomes: [] }], [{ attempt: 1, opened: 1, outcomes: [] }],
  ]);
  // That mint serves attempt 1 of the first head: its `confirmed` outcome names itself in `branch.token`.
  expect([said(b.answered("0:1", 1, "confirmed", TOKEN)), b.branch.values["token"]]).toEqual([WRITTEN, "0:1"]);
  // The row `import` asks that `import` is true: an update for a founding with no import is refused `not-importing`, and opens nothing.
  expect([said(b.imported("done")), result(b), b.opened]).toEqual([WRITTEN, ["refused", "guard-failed", "not-importing"], []]);

  // By import. The genesis declares nothing, and the confirmation opens nothing.
  const i = new Branch(true);
  expect([i.opened, i.confirmed().last.effects, i.state.operation("0:0")]).toEqual([[], [{ effect: "activate" }], null]);
  // An update from a scope that is not the directory is no update of this handler's: it is not from a directory under that name.
  expect([said(i.imported("done", HEAD, i.lane)), result(i)]).toEqual([WRITTEN, ["refused", "unknown-message", null]]);
  // `failed`: the update is applied and opens nothing. The branch stays `empty`.
  expect([said(i.imported("failed", null)), result(i), i.opened, i.branch.state]).toEqual([WRITTEN, ["applied", null, null], [], "empty"]);
});

test("the directory's `done` update opens `first-head` with its attempt 1 and that attempt's mint, once the branch is empty; when the branch is ready it is refused", () => {
  const i = new Branch(true).confirmed();
  // A relationship update is applied only at a higher revision, so the `done` update comes from a later entry of the bureau.
  expect([said(i.imported("done")), result(i), i.opened]).toEqual([WRITTEN, ["applied", null, null], [["first-head", 3, true], ["mint", 1, true]]]);
  // The real outcome of `first-head` makes the branch ready. A further `done` update is then refused by the written guard.
  i.answered(op(i.head.seq, 0), 1, "confirmed", { send: "accepted", seen: HEAD });
  expect([i.branch.state, said(i.imported("done", NEXT)), result(i), i.opened]).toEqual(["ready", WRITTEN, ["refused", "guard-failed", null], []]);
});

// Section 12.1.5, cases a and b, with "The rule `open-judge`, and one `judge` at a time" (ER2) and rows 32, 33 and b of the table of marks.
test("a reserve stays queued before the first head and opens `judge` after it, one at a time; the outcome that reserves takes the slot, opens the push with its mint and sends `committed`; another lane's operation is `not-owner`; an ill-typed list is `bad-field`", () => {
  // Case b: a `reserve` while the branch is `empty`. `applied`. The publication is `queued` and stays so. No `judge` is opened.
  const b = new Branch(false).confirmed();
  const first = b.reserve();
  expect([said(first.judgment), result(b), b.opened, publications(b)]).toEqual([WRITTEN, ["applied", null, null], [], [[b.head.seq, "queued", null, false]]]);
  expect([b.item(b.head.seq).refs["operation"], b.item(b.head.seq).refs["lane"], b.last.sends.length]).toEqual([first.operation, b.lane.at, 1]);

  // With a first head, an empty slot and no `judge` open: `applied`, and the entry opens `judge` and sets `branch.judging`.
  const r = new Branch(false).ready();
  const one = r.reserve();
  const [p1, judge] = [r.head.seq, op(r.head.seq, 0)];
  expect([said(one.judgment), result(r), r.opened, r.branch.refs["judging"], r.branch.refs["slot"]]).toEqual([WRITTEN, ["applied", null, null], [["judge", 1, true]], p1, null]);
  // One `judge` at a time: the slot is still empty, and a second `reserve` before the outcome opens none.
  expect([said(r.reserve().judgment), r.opened, r.branch.refs["judging"]]).toEqual([WRITTEN, [], p1]);
  const p2 = r.head.seq;

  // The outcome of `judge` that reserves, by the STAND-IN reader: `reserved`, the slot, `judging` emptied, `integration`,
  // `reservedAt`, the push with 3 attempts and its mint, and the update `committed` with the revision of the observed rules.
  r.read = reading(r.now);
  expect(said(r.answered(judge, 1, "confirmed", FOUND))).toEqual(WRITTEN);
  const at = r.head.seq;
  expect([r.item(p1).state, r.item(p1).values["integration"], r.item(p1).values["reservedAt"], r.branch.refs["slot"], r.branch.refs["judging"], r.opened])
    .toEqual(["reserved", NEXT, at, p1, null, [["push", 3, true], ["mint", 1, true]]]);
  expect(updates(r)).toEqual([["reserved", { operation: one.operation, outcome: "committed", rules: 57 }]]);
  // The entry retains what its rule read, and the judge wrote it (the contract's sections 4.1 and 16.1): the observation of the key
  // that signed the `merge` entry, and the one of the rules, in the order of their reads. Its `uses` names the entries at hand.
  const reservation = r.last.input;
  expect([reservation.type === "outcome" && reservation.observed?.map((use) => [use.read.n, use.use, "subject" in use.observation ? use.observation.subject : use.observation.key]), r.last.uses.map((use) => use.fact), r.last.clamped])
    .toEqual([[[1, "fresh", rita.key], [2, "fresh", "rules"], [3, "fresh", "holders"]], [one.operation, (r.entries[p1]!.entry.input as { message: { body: { fields: { manifest: unknown } } } }).message.body.fields.manifest], false]);
  // A `judge` has one outcome, `confirmed`: one that is offered as `refused` or `unknown` does not follow.
  expect([said(r.answered(judge, 1, "refused", FOUND)), said(r.lost(judge, 1))]).toEqual([{ result: "conflict", seq: at }, { result: "repeat", seq: at }].map((known) => [known.result, null, null]));
  // While a publication holds the slot, a further `reserve` is queued and opens nothing.
  expect([said(r.reserve().judgment), r.opened, publications(r).map(([, state]) => state)]).toEqual([WRITTEN, [], ["reserved", "queued", "queued"]]);

  // Case a: the operation is an entry of another lane than the sender. A deciding entry `refused`, named `not-owner`. No publication.
  const before = publications(r).length;
  const theirs = handMade(r.other.at, "merge");
  expect([said(r.reserve({ operation: factRefOf(theirs) }, r.lane, [theirs]).judgment), result(r)]).toEqual([WRITTEN, ["refused", "guard-failed", "not-owner"]]);
  expect(publications(r).length).toBe(before);

  // A message outside the types of its fields: a record with a required member missing, a verdict that is no verdict of the lane,
  // a list that is longer than its `max`, a link that is no record of the lane's, by the rule `collect-list`, and a message with
  // no field `reports`.
  const review = handMade(r.lane.at, "review-verdict");
  const verdict = { review: factRefOf(review), reviewer: una.member, verdict: "approve" };
  const outside: Record<string, unknown>[] = [
    { verdicts: [{ verdict: "approve" }] }, { verdicts: [{ ...verdict, verdict: "counted" }] }, { verdicts: [{ ...verdict, counted: true }] },
    { jobs: Array(NAMED_MOST + 1).fill({ job: first.operation, name: "x", state: "passed" }) }, { links: [{ link: first.operation }] }, { reports: undefined },
  ];
  expect(outside.map((over) => [said(r.reserve(over, r.lane, [review]).judgment), result(r)])).toEqual(outside.map(() => [WRITTEN, ["refused", "bad-field", null]]));
  expect([publications(r).length, p2 > p1]).toEqual([before, true]);
});

test("a withdraw is decided by the state of the publication: applied while queued or not yet known, refused `reserved` after reservation and `ended` after a final state, and `not-owner` from another lane", () => {
  const b = new Branch(false).confirmed();
  const { merge, operation } = b.reserve();
  const publication = b.head.seq;

  // Another lane cannot withdraw this lane's merge: `refused`, `not-owner`. Nothing changes.
  expect([said(b.withdraw(merge, b.other).judgment), result(b), publications(b)]).toEqual([WRITTEN, ["refused", "guard-failed", "not-owner"], [[publication, "queued", null, false]]]);

  // Case c: a `withdraw` while the publication is `queued`. One entry: the publication is `not-reserved`, "withdrawn"; the mark is
  // set; the final update is at ordinal 0, with the outcome `aborted`, and the result `applied` at ordinal 1.
  const entries = b.entries.length;
  expect([said(b.withdraw(merge).judgment), b.entries.length - entries, publications(b)]).toEqual([WRITTEN, 1, [[publication, "not-reserved", "withdrawn", true]]]);
  expect(b.last.sends.map((send) => [send.n, send.to, send.message.class === "request" ? send.message.body : send.message.class === "result" && send.message.outcome])).toEqual([
    [0, b.lane.at, { name: "publication", item: b.fact(publication), state: "not-reserved", detail: { operation, outcome: "aborted" } }], [1, b.lane.at, "applied"],
  ]);
  // A final publication is never opened again: a second `withdraw`, in another envelope, is refused `ended`, and changes nothing.
  expect([said(b.withdraw(merge).judgment), result(b), b.last.effects, publications(b)]).toEqual([WRITTEN, ["refused", "guard-failed", "ended"], [], [[publication, "not-reserved", "withdrawn", true]]]);

  // Not yet known: a `withdraw` that arrives before its `reserve`. `applied`: the rule opens the publication as `not-reserved`,
  // "withdrawn", and no update is sent. The later `reserve` for that operation is refused, "withdrawn" (section 6.4, the first case).
  const manifest = handMade(b.lane.at, "propose-manifest");
  const reserve: Request = { class: "request", type: "tell", body: { message: "reserve", fields: { operation: { self: true }, manifest: factRefOf(manifest), verdicts: [], jobs: [], links: [], reports: [] } } };
  const early = handMade(b.lane.at, "merge", [{ n: 0, to: b.at, message: reserve }]);
  expect([said(b.withdraw(early).judgment), result(b), b.last.sends.length, publications(b).at(-1)]).toEqual([WRITTEN, ["applied", null, null], 1, [b.head.seq, "not-reserved", "withdrawn", false]]);
  expect([b.item(b.head.seq).refs["operation"], b.item(b.head.seq).refs["lane"]]).toEqual([factRefOf(early), b.lane.at]);
  expect([said(b.from(b.lane.at, "change", "merge", reserve, [fetched(manifest, "change")], early).judgment), result(b), publications(b).length]).toEqual([WRITTEN, ["refused", "guard-failed", "withdrawn"], 2]);
});

// Section 12.1.5, cases d and e, as revision 25 corrects them (ER10), and "A publication that is withdrawn while its `judge` is open" (ER2).
test("after reservation a withdraw is refused `reserved` and sets nothing; the same envelope again is answered with that entry; a publication that is withdrawn while its judge is open is not judged, and the next judge is opened", () => {
  const r = new Branch(false).ready();
  const { merge, publication } = r.reserved();
  expect([r.branch.refs["slot"], r.item(publication).state]).toEqual([publication, "reserved"]);

  // Case d, with free room: written, `refused`, `reserved`. The publication does not change, and the mark is not set: a refused
  // deciding entry applies no effect of its handler.
  const first = r.withdraw(merge);
  const decided = r.head.seq;
  expect([said(first.judgment), result(r), r.last.effects, r.item(publication).state, r.item(publication).values["withdrawDecided"], r.branch.refs["slot"]])
    .toEqual([WRITTEN, ["refused", "guard-failed", "reserved"], [], "reserved", false, publication]);
  // Case e: the same envelope again is answered with the entry of case d, and writes nothing. A second `withdraw`, in another
  // envelope, is its own request with its own result.
  expect([r.withdraw(merge, r.lane, first.entry).judgment, r.head.seq]).toEqual([{ result: "repeat", seq: decided }, decided]);
  expect([said(r.withdraw(merge).judgment), result(r), r.head.seq]).toEqual([WRITTEN, ["refused", "guard-failed", "reserved"], decided + 1]);

  // Two publications are queued, and the `judge` of the first is open. The first is withdrawn: `not-reserved`, and `judging` is
  // left as it is.
  const w = new Branch(false).ready();
  const a = w.reserve();
  const [pa, judge] = [w.head.seq, op(w.head.seq, 0)];
  w.reserve();
  const pb = w.head.seq;
  expect([said(w.withdraw(a.merge).judgment), w.item(pa).state, w.branch.refs["judging"]]).toEqual([WRITTEN, "not-reserved", pa]);
  // The outcome of that `judge` finds a publication that is not `queued`. It changes nothing of it and sends nothing. `judging`
  // becomes the next queued publication, whose `judge` is opened. Its declared rows are read, but no lane reader is asked.
  const revision = w.item(pa).revision;
  w.read = reading(w.now);
  expect([said(w.answered(judge, 1, "confirmed", FOUND)), w.item(pa).revision, w.last.sends, w.branch.refs["judging"], w.opened]).toEqual([WRITTEN, revision, [], pb, [["judge", 1, true]]]);
});

// Section 12.1.5: "Who opens the mint, the revocation and the deciding read of each attempt" (ER7), the evidence of a write, of a
// mint and of a revocation, and "What `seen` decides for a push". Sections 5.4, rule 2, and 6.6, "What `published` settles".
test("the unknown outcome of a push leaves only its own answer able to follow; the deciding read publishes and settles no attempt; a revocation names its mint's token, also when its outcome is not known", () => {
  const b = new Branch(false).ready();
  const { publication, push, mint, merge } = b.reserved();
  const operation = factRefOf(merge);
  // The send waits for the mint: the request of attempt 1 is not ready before its mint has an outcome.
  expect(rule("push").ready!(b.state, b.state.operation(push)!, 1)).toBe(false);
  // A mint's `confirmed` outcome holds the host's ID of the credential and its end, and nothing else.
  expect([said(b.answered(mint, 1, "confirmed", { ...TOKEN, secret: "s" })), said(b.answered(mint, 1, "confirmed", TOKEN))]).toEqual([BAD_INPUT, WRITTEN]);
  // The token is live: the slot names the mint, and the publication is `publishing`. No update is sent for that state.
  expect([b.item(publication).values["token"], b.item(publication).state, b.last.sends, rule("push").ready!(b.state, b.state.operation(push)!, 1)]).toEqual([mint, "publishing", [], true]);

  // A body whose `send` does not fit the result does not follow.
  expect(said(b.answered(push, 1, "refused", { send: "accepted", seen: HEAD }))).toEqual(BAD_INPUT);
  // No answer comes. The driver offers the outcome that the owner states for it: the send is not known, and no read back was made.
  expect(rule("push").unknown!(b.state, b.state.operation(push)!, 1, b.own)).toEqual({ send: "unknown", seen: "failed" });
  expect(said(b.lost(push, 1))).toEqual(WRITTEN);
  const lost = b.head.seq;
  // The first outcome of the attempt opens the revocation of its token and empties the slot. Nothing is decided: the publication
  // is `unresolved`, the slot stays held, the lane is told `unknown`, and one read of the branch is opened. No attempt 2: only a
  // read back that shows the base allows one.
  expect([b.item(publication).state, b.item(publication).values["token"], b.branch.refs["slot"], b.opened, updates(b), outcomesOf(b, push)])
    .toEqual(["unresolved", null, publication, [["revoke", 3, true], ["read", 1, true]], [["unresolved", { operation, outcome: "unknown", rules: 57 }]], [["unknown"]]]);
  const [revoke, read] = [op(lost, 0), op(lost, 1)];

  // Only that attempt's own answer follows an `unknown`: not a second `unknown`, and not a read offered as the attempt's outcome.
  expect([b.lost(push, 1), said(b.outcome(push, 1, "confirmed", { basis: "read", body: { send: "accepted", seen: NEXT } }))]).toEqual([{ result: "repeat", seq: lost }, BAD_INPUT]);

  // The deciding read shows the integration commit. The publication is `published`, the head is that commit, the slot is free,
  // the receipt is owed and its write is opened with its mint, and the lane is told. A read has one outcome, `confirmed`.
  expect([said(b.answered(read, 1, "refused", { seen: NEXT })), said(b.answered(read, 1, "confirmed", { seen: "failed" })), said(b.answered(read, 1, "confirmed", { seen: NEXT }))]).toEqual([BAD_INPUT, BAD_INPUT, WRITTEN]);
  const made = b.item(b.head.seq);
  expect([b.item(publication).state, b.branch.values["head"], b.branch.refs["slot"], [made.type, made.state, made.refs, made.values], b.opened, updates(b)])
    .toEqual(["published", NEXT, null, ["receipt", "owed", { publication }, { commit: NEXT, opening: null, token: null }], [["receipt", 3, true], ["mint", 1, true]], [["published", { operation, outcome: "published", commit: NEXT, rules: 57 }]]]);
  // The read gave no attempt an outcome. The attempt that was `unknown` stays `unknown`, and its operation is not settled.
  expect([outcomesOf(b, push), operationSettled(b.state.operation(push)!)]).toEqual([[["unknown"]], false]);
  // The attempt's own answer may still come, late. It is recorded, and changes nothing of a publication that is final.
  const revision = b.item(publication).revision;
  expect([said(b.answered(push, 1, "confirmed", { send: "accepted", seen: NEXT })), outcomesOf(b, push), b.item(publication).revision, b.last.sends, b.opened, operationSettled(b.state.operation(push)!)])
    .toEqual([WRITTEN, [["unknown", "confirmed"]], revision, [], [], true]);

  // The revocation. Its request's context is the token ID of its mint, read from this scope's own entries.
  expect(revokedToken(b.state, b.own, b.state.operation(revoke)!)).toBe(TOKEN.token);
  // An outcome that is not known holds that ID, so it is written, and the ledger opens attempt 2.
  expect([said(b.lost(revoke, 1)), b.last.input.type === "outcome" && b.last.input.evidence, b.state.operation(revoke)!.attempts.length]).toEqual([WRITTEN, { basis: "none", body: { token: TOKEN.token } }, 2]);
  // A body that names another token than its mint's does not follow. The mint's own does.
  expect([said(b.answered(revoke, 2, "confirmed", { token: "another" })), said(b.answered(revoke, 2, "confirmed", {})), said(b.answered(revoke, 2, "confirmed", { token: TOKEN.token }))]).toEqual([BAD_INPUT, BAD_INPUT, WRITTEN]);
  // A failed revocation is a duty, and decides nothing: the entries of a revocation hold the ledger's records alone.
  expect(b.last.effects).toEqual([{ effect: "attempt", operation: revoke, attempt: 2, result: "confirmed", selected: null }]);
});

// Section 6.8, "The host keeps refusing", and the rows of "What `seen` decides for a push" for the base.
test("a refused attempt whose read back shows the base opens the next attempt with its mint; a token that arrives after its attempt's outcome is revoked and never live; after three refused attempts the publication is aborted `host-refused`, and the next judge is opened", () => {
  const b = new Branch(false).ready();
  const { publication, push, mint, merge } = b.reserved();
  const operation = factRefOf(merge);
  b.reserve();
  const waiting = b.head.seq;
  expect([b.opened, b.branch.refs["judging"]]).toEqual([[], null]);

  // Attempt 1 is `refused`, as not sent, before its mint answered. The read back shows the base, so the ledger opens attempt 2 and
  // the rule opens its mint. The publication is `unresolved`, and the lane is told once.
  expect([said(b.answered(push, 1, "refused", { send: "not-sent", seen: HEAD })), b.item(publication).state, b.opened, b.state.operation(push)!.attempts.length, updates(b)])
    .toEqual([WRITTEN, "unresolved", [["mint", 1, true]], 2, [["unresolved", { operation, outcome: "unknown", rules: 57 }]]]);
  const mint2 = op(b.head.seq, 0);
  // The token of attempt 1 arrives too late to be used: its revocation is opened, and the slot does not name it.
  expect([said(b.answered(mint, 1, "confirmed", TOKEN)), b.opened, b.item(publication).values["token"]]).toEqual([WRITTEN, [["revoke", 3, true]], null]);

  // The mint of attempt 2 is refused. Its request is then ready, and the port, which has no token, sends nothing.
  expect([said(b.answered(mint2, 1, "refused", {})), b.last.effects.length, rule("push").ready!(b.state, b.state.operation(push)!, 2)]).toEqual([WRITTEN, 1, true]);
  expect([said(b.answered(push, 2, "refused", { send: "not-sent", seen: HEAD })), b.opened, updates(b), b.item(publication).state]).toEqual([WRITTEN, [["mint", 1, true]], [], "unresolved"]);
  // Attempt 3 is refused by the host. Every attempt has a `refused` outcome, none is open, and the read back shows the base:
  // nothing that was sent can still land. `aborted`, with the host's reason; the slot is free; the lane's merge becomes `refused`.
  expect(said(b.answered(push, 3, "refused", { send: "refused", seen: HEAD }))).toEqual(WRITTEN);
  expect([b.item(publication).state, b.item(publication).values["reason"], b.branch.refs["slot"], b.branch.values["head"], updates(b)])
    .toEqual(["aborted", "host-refused", null, HEAD, [["aborted", { operation, outcome: "refused", reason: "host-refused", rules: 57 }]]]);
  // The slot is emptied, so the next `judge` is opened, for the publication that waited.
  expect([b.opened, b.branch.refs["judging"]]).toEqual([[["judge", 1, true]], waiting]);
});

// Section 6.8, "A compromised key", and "The rule `abort-if-behind`" (ER5).
test("a compromised notice for a key behind the held publication sets aborting, revokes the live token and opens a read; no further attempt is opened; the base with every attempt refused is aborted `compromised`, and the base with an attempt not refused holds the slot", () => {
  const b = new Branch(false).ready();
  // A notice before any reservation, and one for a key that is not behind the publication, are recorded and change nothing.
  expect([said(b.compromised(rita)), result(b), b.last.effects]).toEqual([WRITTEN, ["applied", null, null], []]);
  const { publication, push, mint, merge } = b.reserved();
  const operation = factRefOf(merge);
  b.answered(mint, 1, "confirmed", TOKEN);
  expect([said(b.compromised(una)), result(b), b.last.effects, b.item(publication).values["aborting"]]).toEqual([WRITTEN, ["applied", null, null], [], false]);

  // The merger's key is in the `observed` of the reservation entry. The abort is this entry: `aborting` is set, the live token's
  // revocation is opened and the slot `token` is emptied, and one read of the branch is opened.
  expect([said(b.compromised(rita)), result(b), b.item(publication).values["aborting"], b.item(publication).values["token"], b.opened, b.item(publication).state])
    .toEqual([WRITTEN, ["applied", null, null], true, null, [["revoke", 3, true], ["read", 1, true]], "publishing"]);
  const [revoke, read] = [op(b.head.seq, 0), op(b.head.seq, 1)];
  // The revocation that the notice opened is of the token that the slot named.
  expect(revokedToken(b.state, b.own, b.state.operation(revoke)!)).toBe(TOKEN.token);
  // A second notice changes nothing: `aborting` is set.
  expect([said(b.compromised(rita)), b.last.effects]).toEqual([WRITTEN, []]);

  // The read shows the base while attempt 1 has no `refused` outcome: not provable. Such an outcome does not follow, so the
  // runtime keeps reading, and the slot stays held.
  expect([said(b.answered(read, 1, "confirmed", { seen: HEAD })), b.item(publication).state, b.branch.refs["slot"]]).toEqual([BAD_INPUT, "publishing", publication]);
  // Attempt 1 is refused, and its read back shows the base. No further attempt is opened, although two are left: the rule for a
  // further attempt reads `aborting`. Every attempt is refused, so the publication is `aborted`, `compromised`.
  expect([said(b.answered(push, 1, "refused", { send: "refused", seen: HEAD })), b.state.operation(push)!.attempts.length, b.item(publication).state, b.item(publication).values["reason"], b.branch.refs["slot"], updates(b)])
    .toEqual([WRITTEN, 1, "aborted", "compromised", null, [["aborted", { operation, outcome: "aborted", reason: "compromised", rules: 57 }]]]);
  // The read then shows a publication that is final, and yields nothing.
  expect([said(b.answered(read, 1, "confirmed", { seen: HEAD })), b.last.effects.length, b.last.sends]).toEqual([WRITTEN, 1, []]);

  // The other end: the integration commit landed before it could be stopped. The read publishes it.
  // No token is live yet, so the notice opens the read alone. The token then arrives for a publication that is `aborting`: it is
  // never live, and its revocation is opened.
  const p = new Branch(false).ready();
  const landed = p.reserved();
  expect([said(p.compromised(rita)), p.opened]).toEqual([WRITTEN, [["read", 1, true]]]);
  const deciding = op(p.head.seq, 0);
  expect([said(p.answered(landed.mint, 1, "confirmed", TOKEN)), p.opened, p.item(landed.publication).values["token"], p.item(landed.publication).state]).toEqual([WRITTEN, [["revoke", 3, true]], null, "reserved"]);
  expect([said(p.answered(deciding, 1, "confirmed", { seen: NEXT })), p.item(landed.publication).state, p.branch.values["head"]]).toEqual([WRITTEN, "published", NEXT]);
});

// "The guard and the effect of `resend`" (ER4), and the last rows of "What `seen` decides for a push".
test("a resend is refused `resend-not-due` while an attempt of the publication's push is not used, and opens one push with its mint once every stated attempt has an outcome; the base with an attempt not known opens one read; a commit of another writer holds the slot and opens nothing", () => {
  const b = new Branch(false).ready();
  const { publication, push } = b.reserved();
  const resend = () => said(b.act(rita, "resend", { on: publication, expected: { on: b.item(publication).revision } }));
  // `reserved` is no state of a resend: the written guard refuses, with no name.
  expect(resend()).toEqual(["refused", "guard-failed", null]);
  // Attempts 1 and 2 are not known, and each read back shows the base: the ledger opens the next.
  const unknown = (attempt: number, seen: string) => said(b.outcome(push, attempt, "unknown", { basis: "none", body: { send: "unknown", seen } }));
  expect([unknown(1, HEAD), b.item(publication).state, resend(), unknown(2, HEAD), b.state.operation(push)!.attempts.length, resend()])
    .toEqual([WRITTEN, "unresolved", ["refused", "guard-failed", "resend-not-due"], WRITTEN, 3, ["refused", "guard-failed", "resend-not-due"]]);
  // The own answer of attempt 1 comes late, while attempt 3 is open: it opens no read, because an attempt of that push is open.
  expect([said(b.answered(push, 1, "refused", { send: "refused", seen: HEAD })), b.opened, outcomesOf(b, push)]).toEqual([WRITTEN, [], [["unknown", "refused"], ["unknown"], []]]);
  // Attempt 3 is not known either, and its read back shows the base. No attempt is left, and not every attempt is refused: nothing
  // is provable. The slot stays held, and one read of the branch is opened.
  expect([unknown(3, HEAD), b.opened, b.item(publication).state, b.branch.refs["slot"], b.last.sends]).toEqual([WRITTEN, [["read", 1, true]], "unresolved", publication, []]);
  // One read for an operation (I3 deltas, entry FA14): the own answer of attempt 2 comes late and decides nothing either. No attempt
  // is open, and an outcome of this push has opened its read, so no second read is opened.
  expect([said(b.answered(push, 2, "refused", { send: "refused", seen: HEAD })), b.opened, outcomesOf(b, push)]).toEqual([WRITTEN, [], [["unknown", "refused"], ["unknown", "refused"], ["unknown"]]]);
  // Every attempt that the push states is opened and has an outcome: the resend is due. It opens one push with 1 attempt, and that attempt's mint.
  expect([resend(), b.opened]).toEqual([WRITTEN, [["push", 1, true], ["mint", 1, true]]]);
  const again = op(b.head.seq, 0);
  // Its one attempt has no outcome yet: a further resend is not due.
  expect(resend()).toEqual(["refused", "guard-failed", "resend-not-due"]);
  // That attempt lands. Its outcome is its own answer, and the read back publishes.
  expect([said(b.answered(again, 1, "confirmed", { send: "accepted", seen: NEXT })), b.item(publication).state, b.branch.values["head"]]).toEqual([WRITTEN, "published", NEXT]);
  // A commit of another writer on the branch (section 6.9): the slot stays held, and no attempt and no read is opened.
  const w = new Branch(false).ready();
  const other = w.reserved();
  expect([said(w.outcome(other.push, 1, "unknown", { basis: "none", body: { send: "unknown", seen: OTHER } })), w.opened, w.state.operation(other.push)!.attempts.length, w.item(other.publication).state, w.branch.refs["slot"]])
    .toEqual([WRITTEN, [], 1, "unresolved", other.publication]);
  // Section 12.1.5 names a `resend` as a way forward there. The guard, as its row states it, does not hold: two of the three
  // attempts that the push states were never opened (I3 deltas, entry FA13).
  expect(said(w.act(rita, "resend", { on: other.publication, expected: { on: w.item(other.publication).revision } }))).toEqual(["refused", "guard-failed", "resend-not-due"]);
  // An attempt whose own answer is `accepted`, while the read back still shows the base: the ledger opens no attempt after a
  // `confirmed` outcome, so the rule opens no mint. Nothing is provable, and one read of the branch is opened.
  const c = new Branch(false).ready();
  const accepted = c.reserved();
  expect([said(c.answered(accepted.push, 1, "confirmed", { send: "accepted", seen: HEAD })), c.opened, c.state.operation(accepted.push)!.attempts.length, c.item(accepted.publication).state])
    .toEqual([WRITTEN, [["read", 1, true]], 1, "unresolved"]);

  // Case h: a `resend` on a `published` publication is refused `final`. A receipt that is owed takes `resend-receipt`, on the branch.
  expect(resend()).toEqual(["refused", "final", null]);
});

// Section 6.9 and the rows `adopt-head` and `adopt-read` (ER13), with row 36 of the table of marks.
test("adopt-head names a commit and why, and opens one read of the branch only while no publication holds the slot; the read's outcome sets the head only when it shows that commit", () => {
  const r = new Branch(false).ready();
  const adopting = (b: Branch, fields: Record<string, FieldValue>) => said(b.act(rita, "adopt-head", { on: 0, expected: { on: b.branch.revision }, fields }));
  const adopt = (fields: Record<string, FieldValue>) => adopting(r, fields);
  // The act records what is adopted and why: both fields are required.
  expect(adopt({ commit: OTHER })).toEqual(["refused", "bad-field", null]);
  expect([adopt({ commit: OTHER, why: "the branch was pushed by hand" }), r.opened]).toEqual([WRITTEN, [["adopt-read", 1, true]]]);
  const first = op(r.head.seq, 0);
  // The read shows another commit than the act names: nothing changes.
  expect([said(r.answered(first, 1, "confirmed", { seen: NEXT })), r.branch.values["head"], r.last.effects.length]).toEqual([WRITTEN, HEAD, 1]);
  expect(adopt({ commit: OTHER, why: "again" })).toEqual(WRITTEN);
  expect([said(r.answered(op(r.head.seq, 0), 1, "confirmed", { seen: OTHER })), r.branch.values["head"], r.branch.state]).toEqual([WRITTEN, OTHER, "ready"]);
  // While a publication is reserved the act is refused.
  const held = new Branch(false).ready();
  const { publication } = held.reserved();
  expect([adopting(held, { commit: OTHER, why: "no" }), held.item(publication).state, held.branch.values["head"]]).toEqual([["refused", "guard-failed", null], "reserved", HEAD]);
  // An act that was admitted before the reservation, and whose read is answered after it, changes nothing: the base of the push stays.
  const racing = new Branch(false).ready();
  adopting(racing, { commit: OTHER, why: "before the reservation" });
  const read = op(racing.head.seq, 0);
  racing.reserved();
  expect([said(racing.answered(read, 1, "confirmed", { seen: OTHER })), racing.branch.values["head"], racing.last.effects.length]).toEqual([WRITTEN, HEAD, 1]);
});

/** The operations that the entry at that position opened, by kind. An entry of these tests opens at most one of a kind. */
const kinds = (b: Branch, seq = b.head.seq) => Object.fromEntries([0, 1, 2, 3, 4].flatMap((k) => { const found = b.state.operation(op(seq, k)); return found ? [[found.kind, found.id]] : []; })) as Record<string, OperationId>;
const TOKEN2 = { token: "host-token-2", ends: t(900) };
/** An attempt of a write whose answer is not known, with a read back that shows the ref absent. */
const absent = (b: Branch, write: OperationId, attempt: number) => said(b.outcome(write, attempt, "unknown", { basis: "none", body: { send: "unknown", seen: "absent" } }));
const resendReceipt = (b: Branch, receipt: number) => said(b.act(rita, "resend-receipt", { on: 0, expected: { on: b.branch.revision, receipt: b.item(receipt).revision }, fields: { receipt } }));
/**
 * One more change is published at that branch: a `reserve`, the outcome of its `judge`, by the STAND-IN reader, and the first
 * attempt of its push, whose own answer and read back show the new commit. It gives the receipt that the publishing entry opened.
 */
const publish = (b: Branch, n: number): number => {
  const [base, next] = [b.branch.values["head"] as string, n.toString(16).padStart(40, "0")];
  b.reserve();
  const publication = b.head.seq;
  b.read = reading(b.now, { manifest: { base, integration: next, tree: TREE, reports: [], authors: [], complete: true } });
  if (b.answered(op(publication, 0), 1, "confirmed", { ...FOUND, head: base, firstParent: base }).result !== "write" || b.answered(kinds(b)["push"]!, 1, "confirmed", { send: "accepted", seen: next }).result !== "write") throw new Error(`change ${n} was not published`);
  return b.head.seq;
};

// Section 12.1.5, "Where a receipt's records stand" and "The rows that change, and three new acts", as the authority note's revision
// 28 has them (I3 deltas, entry FA6), with its cases f, g, i and j. The receipt rule computes its commit from the history.
test("a receipt is an item of its own: the entry that publishes opens it owed, with its write and that attempt's mint; its token and its state change on the receipt and never on the published publication; resend-receipt opens one more write once the stated attempts are used; with 65 receipts owed a reserve is refused receipts-owed", () => {
  const b = new Branch(false).ready();
  const { publication, push, mint } = b.reserved();
  b.answered(mint, 1, "confirmed", TOKEN);
  // Case f: an outcome of a push that shows the integration commit. One entry: the publication is `published`, the item `receipt`
  // is opened `owed` with the publication and the commit, and its `receipt` operation and that attempt's mint are opened beside
  // the revocation of the push's token. The receipt's ID is the position of that entry.
  expect(said(b.answered(push, 1, "confirmed", { send: "accepted", seen: NEXT }))).toEqual(WRITTEN);
  const [R, first] = [b.head.seq, kinds(b)];
  expect([b.item(publication).state, b.item(R).type, b.item(R).state, b.item(R).refs, b.item(R).values, b.opened, updates(b).map(([state]) => state)])
    .toEqual(["published", "receipt", "owed", { publication }, { commit: NEXT, opening: null, token: null }, [["revoke", 3, true], ["receipt", 3, true], ["mint", 1, true]], ["published"]]);
  // The publication is final from that entry, and nothing below changes it.
  const final = b.item(publication);
  // Case g: the outcome of that mint, `confirmed`. `receipt.token` names it, and the request of the receipt's attempt may be sent.
  expect([said(b.answered(first["mint"]!, 1, "confirmed", TOKEN2)), b.item(R).values["token"], b.last.sends, writeSends(b.state, b.own, b.state.operation(first["receipt"]!)!, 1)]).toEqual([WRITTEN, first["mint"], [], true]);
  // Then the outcome of the receipt's attempt 1, which shows the receipt's commit: the slot is emptied with the token's `revoke`,
  // and the receipt is `written`. No effect names the publication, and the kind's send mark gives no update.
  expect([said(b.answered(first["receipt"]!, 1, "confirmed", { send: "accepted", seen: b.receiptCommit(R) })), b.item(R).state, b.item(R).values["token"], b.opened, b.last.sends, b.item(publication)])
    .toEqual([WRITTEN, "written", null, [["revoke", 3, true]], [], final]);
  expect(revokedToken(b.state, b.own, b.state.operation(kinds(b)["revoke"]!)!)).toBe(TOKEN2.token);
  // A receipt that is final takes no `resend-receipt`: the written guard refuses it by name.
  expect(resendReceipt(b, R)).toEqual(["refused", "guard-failed", "receipt-not-owed"]);

  // Case i. The three attempts of a receipt's write are not known, and each read back shows the ref absent. While an attempt that
  // the operation states is not used, the act is refused. After the last, one read of the receipt's ref is opened, and the act is
  // admitted without waiting for that read: it opens one more `receipt` operation, with 1 attempt, and that attempt's mint.
  const c = new Branch(false).ready();
  const owed = publish(c, 1);
  const write = kinds(c)["receipt"]!;
  expect([absent(c, write, 1), absent(c, write, 2), resendReceipt(c, owed), absent(c, write, 3), c.opened, c.item(owed).state]).toEqual([WRITTEN, WRITTEN, ["refused", "guard-failed", "resend-not-due"], WRITTEN, [["read", 1, true]], "owed"]);
  expect([resendReceipt(c, owed), c.opened, c.last.effects.some((effect) => "item" in effect), resendReceipt(c, owed)]).toEqual([WRITTEN, [["receipt", 1, true], ["mint", 1, true]], false, ["refused", "guard-failed", "resend-not-due"]]);

  // Case j, at the number of the guard, once. 64 receipts are owed: a `reserve` is taken, and its publication is published, which
  // opens the 65th. The next `reserve` is refused `receipts-owed`, and opens no publication. When a receipt is written, one is taken again.
  const j = new Branch(false).ready();
  for (let n = 1; n <= RECEIPTS_OWED; n++) publish(j, n);
  const [owing, known] = [() => j.state.count("receipt", "owed"), () => j.state.count("publication", "published") + j.state.count("publication", "queued")];
  expect([owing(), publish(j, 65) > 0, owing(), known()]).toEqual([64, true, 65, 65]);
  expect([said(j.reserve().judgment), result(j), known()]).toEqual([WRITTEN, ["refused", "guard-failed", "receipts-owed"], 65]);
  expect([said(j.answered(kinds(j, j.head.seq - 1)["receipt"]!, 1, "confirmed", { send: "accepted", seen: j.receiptCommit(j.head.seq - 1) })), owing(), said(j.reserve().judgment), result(j), known()]).toEqual([WRITTEN, 64, WRITTEN, ["applied", null, null], 66]);
});

// Section 12.1.5, "A token whose write can no longer act, and who cleans it up", decided in the authority note's revision 28: the
// rules T1 to T8, "The verdict's case, in both orders, as entries", and cases m and n. Every destination rule is the package's.
test("a mint whose receipt an older read made final sets no slot: its outcome records the token and opens the revocation; a mint that confirmed first is revoked by the first outcome of its attempt, which sets nothing on the final receipt; five entries in either order, and the older attempts stay unknown", () => {
  /** R is the receipt of a published publication. The three attempts of its write o1 are not known, and its one read rd1 is pending. An admin signs `resend-receipt`: o2, with 1 attempt, and that attempt's mint m2. */
  const owing = () => {
    const b = new Branch(false).ready();
    const R = publish(b, 1);
    const o1 = kinds(b)["receipt"]!;
    for (const attempt of [1, 2, 3]) absent(b, o1, attempt);
    const rd1 = kinds(b)["read"]!;
    const before = b.entries.length;
    if (resendReceipt(b, R)[0] !== "write") throw new Error("the resend-receipt was not admitted");
    const { receipt: o2, mint: m2 } = kinds(b);
    return { b, R, o1, rd1, o2: o2!, m2: m2!, before, sends: () => writeSends(b.state, b.own, b.state.operation(o2!)!, 1) };
  };

  // Case m, the first order: the old read, and then the new mint.
  const m = owing();
  // Entry 2: the outcome of rd1 shows the receipt's commit. R is `written`. It touches no token and opens nothing (T6).
  expect([said(m.b.answered(m.rd1, 1, "confirmed", { seen: m.b.receiptCommit(m.R) })), m.b.item(m.R).state, m.b.item(m.R).values["token"], m.b.opened]).toEqual([WRITTEN, "written", null, []]);
  const written = m.b.item(m.R);
  // Entry 3: the outcome of m2, `confirmed`. T2: R is closed. The entry is written with `{ token, ends }`, it opens the revocation
  // with its attempt 1, and no effect is on the receipt. Under revision 27 the rule gave `receipt.token`, on a final item: a fault.
  expect([said(m.b.answered(m.m2, 1, "confirmed", TOKEN)), m.b.last.input.type === "outcome" && m.b.last.input.evidence.body, m.b.opened, m.b.item(m.R)]).toEqual([WRITTEN, TOKEN, [["revoke", 3, true]], written]);
  const v2 = kinds(m.b)["revoke"]!;
  // Entry 4: the gateway sends nothing for attempt 1 of o2 (T7), and its outcome is `refused`, `not-sent`. T4 does not apply: the
  // slot does not name m2. R is final, so nothing follows.
  expect([m.sends(), said(m.b.answered(m.o2, 1, "refused", { send: "not-sent", seen: m.b.receiptCommit(m.R) })), m.b.last.effects.length, m.b.opened, m.b.item(m.R)]).toEqual([false, WRITTEN, 1, [], written]);
  // Entry 5: the revocation names the token that entry 3 recorded. Five entries, and the three attempts of o1 stay `unknown`.
  expect([revokedToken(m.b.state, m.b.own, m.b.state.operation(v2)!), said(m.b.answered(v2, 1, "confirmed", { token: TOKEN.token })), m.b.entries.length - m.before, outcomesOf(m.b, m.o1)])
    .toEqual([TOKEN.token, WRITTEN, 5, [["unknown"], ["unknown"], ["unknown"]]]);

  // Case n, the second order: the new mint, and then the old read.
  const n = owing();
  // Entry 2: the outcome of m2, `confirmed`. T1: R is `owed`, and attempt 1 of o2 has no outcome. `receipt.token` is m2.
  expect([said(n.b.answered(n.m2, 1, "confirmed", TOKEN)), n.b.item(n.R).values["token"], n.b.opened, n.sends()]).toEqual([WRITTEN, n.m2, [], true]);
  // Entry 3: the outcome of rd1. R is `written`. `receipt.token` is not touched and still names m2, and no revocation is opened (T6).
  expect([said(n.b.answered(n.rd1, 1, "confirmed", { seen: n.b.receiptCommit(n.R) })), n.b.item(n.R).state, n.b.item(n.R).values["token"], n.b.opened, n.sends()]).toEqual([WRITTEN, "written", n.m2, [], false]);
  const kept = n.b.item(n.R);
  // Entry 4: the first outcome of attempt 1 of o2, whose request was sent before entry 3 and whose answer is lost. T4: the slot
  // names this attempt's own mint, and R was final before the entry. The revocation is opened, and nothing is set on R. Under
  // revision 27 the rule emptied `receipt.token`, on a final item: the same fault.
  expect([said(n.b.lost(n.o2, 1)), n.b.opened, n.b.item(n.R)]).toEqual([WRITTEN, [["revoke", 3, true]], kept]);
  // Entry 5: the revocation names m2's token. Its own answer of the attempt, late, opens no second revocation.
  const v = kinds(n.b)["revoke"]!;
  expect([revokedToken(n.b.state, n.b.own, n.b.state.operation(v)!), said(n.b.answered(v, 1, "confirmed", { token: TOKEN.token })), n.b.entries.length - n.before, outcomesOf(n.b, n.o1)])
    .toEqual([TOKEN.token, WRITTEN, 5, [["unknown"], ["unknown"], ["unknown"]]]);
  expect([said(n.b.answered(n.o2, 1, "confirmed", { send: "accepted", seen: n.b.receiptCommit(n.R) })), n.b.opened, n.b.item(n.R)]).toEqual([WRITTEN, [], kept]);
});

// The same block, "The family of this fault, swept", rows 3, 4, 8 and 16, with cases p, q and r. Case o, the control, a mint that
// answers after its own attempt's outcome, is in the test of the refused attempts, above: "a token that arrives after its
// attempt's outcome is revoked and never live". The rule `first-head` is the package's.
test("a target that another entry closed takes no token and no further attempt: a push that an older read published, in both orders of its new mint; a first head whose branch an adopt-head made ready, in both orders; and an adopt-read yields only while the guards of its act still hold", () => {
  /** P is `unresolved`. The three attempts of its push are not known, and the read of that push is pending. An admin signs `resend`: a push with 1 attempt, and its mint m2. */
  const unresolved = () => {
    const b = new Branch(false).ready();
    const { publication, push } = b.reserved();
    for (const attempt of [1, 2, 3]) b.outcome(push, attempt, "unknown", { basis: "none", body: { send: "unknown", seen: HEAD } });
    const read = kinds(b)["read"]!;
    if (b.act(rita, "resend", { on: publication, expected: { on: b.item(publication).revision } }).result !== "write") throw new Error("the resend was not admitted");
    const { push: again, mint: m2 } = kinds(b);
    return { b, publication, push, read, again: again!, m2: m2!, sends: () => writeSends(b.state, b.own, b.state.operation(again!)!, 1) };
  };
  // Case p, the mint after the read. The old read shows the integration commit: P is `published`, once, and `publication.token`
  // is not touched. The new mint then confirms: T2. Its token is recorded in its outcome and revoked, and no effect is on P.
  const p = unresolved();
  expect([said(p.b.answered(p.read, 1, "confirmed", { seen: NEXT })), p.b.item(p.publication).state, p.b.item(p.publication).values["token"]]).toEqual([WRITTEN, "published", null]);
  const published = p.b.item(p.publication);
  expect([said(p.b.answered(p.m2, 1, "confirmed", TOKEN)), p.b.opened, p.b.item(p.publication), p.sends()]).toEqual([WRITTEN, [["revoke", 3, true]], published, false]);
  expect([said(p.b.answered(p.again, 1, "refused", { send: "not-sent", seen: NEXT })), p.b.last.effects.length, p.b.opened, p.b.item(p.publication)]).toEqual([WRITTEN, 1, [], published]);
  // Case p, the mint before the read. T1 set `publication.token`. The read publishes and leaves the slot as it is. The first
  // outcome of the new attempt opens the revocation by T4 and sets nothing on P, which is final.
  const q = unresolved();
  expect([said(q.b.answered(q.m2, 1, "confirmed", TOKEN)), q.b.item(q.publication).values["token"], q.b.item(q.publication).state, q.sends()]).toEqual([WRITTEN, q.m2, "unresolved", true]);
  expect([said(q.b.answered(q.read, 1, "confirmed", { seen: NEXT })), q.b.item(q.publication).state, q.b.item(q.publication).values["token"], q.sends()]).toEqual([WRITTEN, "published", q.m2, false]);
  const [once, receipts] = [q.b.item(q.publication), q.b.state.count("receipt", "owed")];
  expect([said(q.b.answered(q.again, 1, "confirmed", { send: "accepted", seen: NEXT })), q.b.opened, q.b.item(q.publication), q.b.state.count("receipt", "owed"), q.b.last.sends]).toEqual([WRITTEN, [["revoke", 3, true]], once, receipts, []]);
  expect([receipts, revokedToken(q.b.state, q.b.own, q.b.state.operation(kinds(q.b)["revoke"]!)!)]).toEqual([1, TOKEN.token]);
  // Row 8, rule T8: no further attempt for a closed target. Attempt 1 of a push is not known and its read back failed, so one read
  // is opened. The read publishes. The attempt's own answer then comes, `refused`, and its read back shows the new head, which
  // is the branch's head now: the ledger opens no attempt 2, although two are left.
  const late = new Branch(false).ready();
  const held = late.reserved();
  late.lost(held.push, 1);
  expect([said(late.answered(kinds(late)["read"]!, 1, "confirmed", { seen: NEXT })), late.item(held.publication).state, late.branch.values["head"]]).toEqual([WRITTEN, "published", NEXT]);
  expect([said(late.answered(held.push, 1, "refused", { send: "refused", seen: NEXT })), late.state.operation(held.push)!.attempts.length, late.opened]).toEqual([WRITTEN, 1, []]);

  // Case q, row 4. The branch is `empty`, and attempt 1 of its first head is open with its mint. An admin's `adopt-head`, and its
  // read shows the named commit: the branch is `ready` at the adopted commit. The mint then confirms and takes T2: a branch is
  // never final, and it is closed all the same. Nothing is sent for the first head, its attempt is `refused`, `not-sent`, and
  // no further attempt is opened (T8).
  const adopted = (b: Branch) => {
    b.act(rita, "adopt-head", { on: 0, expected: { on: b.branch.revision }, fields: { commit: OTHER, why: "the branch was pushed by hand" } });
    return said(b.answered(kinds(b)["adopt-read"]!, 1, "confirmed", { seen: OTHER }));
  };
  const [head, token] = [op(0, 0), op(0, 1)];
  const e = new Branch(false).confirmed();
  expect([adopted(e), e.branch.state, e.branch.values["head"]]).toEqual([WRITTEN, "ready", OTHER]);
  expect([said(e.answered(token, 1, "confirmed", TOKEN)), e.opened, e.branch.values["token"], writeSends(e.state, e.own, e.state.operation(head)!, 1)]).toEqual([WRITTEN, [["revoke", 3, true]], null, false]);
  expect([said(e.answered(head, 1, "refused", { send: "not-sent", seen: OTHER })), e.opened, e.state.operation(head)!.attempts.length, e.branch.values["head"]]).toEqual([WRITTEN, [], 1, OTHER]);
  // The other order: the mint confirmed while the branch was `empty`, and T1 set `branch.token`. The adoption leaves the slot as
  // it is. The attempt's first outcome opens the revocation by T4 and empties the slot: the branch is not final.
  const f = new Branch(false).confirmed();
  expect([said(f.answered(token, 1, "confirmed", TOKEN)), f.branch.values["token"], adopted(f), f.branch.values["token"], writeSends(f.state, f.own, f.state.operation(head)!, 1)]).toEqual([WRITTEN, token, WRITTEN, token, false]);
  expect([said(f.lost(head, 1)), f.opened, f.branch.values["token"], f.state.operation(head)!.attempts.length, f.branch.values["head"]]).toEqual([WRITTEN, [["revoke", 3, true]], null, 1, OTHER]);

  // Case r, row 16. `adopt-head` is admitted while a publication is `queued`. Its `judge` then reserves that publication, and the
  // outcome of `adopt-read` shows the named commit: it is written and yields nothing, and `branch.head` is as the reservation
  // read it. When the publication is final and the slot is free, the same act yields again.
  const r = new Branch(false).ready();
  const waiting = r.reserve();
  const judge = kinds(r)["judge"]!;
  r.act(rita, "adopt-head", { on: 0, expected: { on: r.branch.revision }, fields: { commit: OTHER, why: "before the reservation" } });
  const reading1 = kinds(r)["adopt-read"]!;
  r.read = reading(r.now);
  expect([said(r.answered(judge, 1, "confirmed", FOUND)), r.item(r.branch.refs["slot"] as number).refs["operation"]]).toEqual([WRITTEN, waiting.operation]);
  const push = kinds(r)["push"]!;
  expect([said(r.answered(reading1, 1, "confirmed", { seen: OTHER })), r.last.effects.length, r.branch.values["head"], r.opened]).toEqual([WRITTEN, 1, HEAD, []]);
  r.answered(push, 1, "confirmed", { send: "accepted", seen: NEXT });
  expect([r.branch.values["head"], adopted(r), r.branch.values["head"]]).toEqual([NEXT, WRITTEN, OTHER]);
});

// Authority note, revision 28, section 6.5, "`reserve` names each selected report", with cases s and t of section 12.1.5. Every
// request is built by hand: the pinned `change` lane does not send the field `reports`, and the lane forms owe that row. The issue
// lane, its `report` entries and the manifest's field `selected` are STAND-INS, made by hand. The binding, the commits and the
// count are the package's rule and derive's own check of a message against the bound on the foreign entries of one entry.
test("a reserve names each selected report, bound place by place to the manifest's selections; each report's commit is read from its entry and must be among the ancestors; a statement that is not the manifest's is not reserved, evidence-invalid; a message that names 128 entries or more is refused bad-field", () => {
  /** One queued publication whose `reserve` names those reports, under a manifest that selects those, and the outcome of its `judge` with those ancestors. */
  const judged = (named: readonly Entry[], selects: readonly Entry[], ancestors: readonly string[]) => {
    const b = new Branch(false).ready();
    const accepted = factRefOf(handMade(b.other.at, "accept-report")) as unknown as FieldValue;
    const delivered = b.reserve({ reports: named.map((report) => factRefOf(report)) }, b.lane, [...new Set([...named, ...selects])], selects.map((report) => ({ accepted, report: factRefOf(report) as unknown as FieldValue })));
    const [publication, taken] = [b.head.seq, [said(delivered.judgment), result(b)]];
    b.read = reading(b.now);
    const judgment = said(b.answered(op(publication, 0), 1, "confirmed", { ...FOUND, ancestors }));
    return { b, publication, taken, answer: [judgment, b.item(publication).state, b.item(publication).values["reason"] ?? null] };
  };
  const issue = new Branch(true).other.at;
  const [A, B, C] = [reportMade(issue, OTHER), reportMade(issue, TREE), reportMade(issue, RECEIPT)];
  const TAKEN = [WRITTEN, ["applied", null, null]];
  const INVALID = [WRITTEN, "not-reserved", "evidence-invalid"];

  // The reports are the manifest's selections, in their order, and each commit is among the ancestors that the host showed: reserved.
  // The entry that recorded the `reserve` names each report's entry in `uses`, and so does the outcome of `judge`, which read them.
  const good = judged([A, B], [A, B], [OTHER, TREE]);
  const names = (entry: { uses: readonly { fact: unknown }[] }) => [A, B].every((report) => entry.uses.some((use) => canonicalize(use.fact) === canonicalize(factRefOf(report))));
  expect([good.taken, good.answer, names(good.b.entries[good.publication]!.entry), names(good.b.last)]).toEqual([TAKEN, [WRITTEN, "reserved", null], true, true]);
  // Check 2, its last clause: a report's commit that the host did not show to be an ancestor. The commit is read from the entry.
  expect([judged([A, B], [A, B], [OTHER]).answer, judged([A, B], [A, B], []).answer]).toEqual(Array(2).fill([WRITTEN, "not-reserved", "integration-invalid"]));
  // A commit among the ancestors that no named report holds does not follow: the member holds the reports' commits and no other.
  expect(judged([A], [A], [OTHER, TREE]).answer).toEqual([BAD_INPUT, "queued", null]);
  // Case t: the named reports differ from the manifest's selections by one more, one fewer, another fact, or another order. Each
  // message is taken at its delivery, and the outcome of `judge` makes the publication `not-reserved`, `evidence-invalid`.
  const differing = [judged([A, B], [A], [OTHER, TREE]), judged([A], [A, B], [OTHER]), judged([A, C], [A, B], [OTHER, RECEIPT]), judged([B, A], [A, B], [OTHER, TREE])];
  expect(differing.map((one) => [one.taken, one.answer])).toEqual(differing.map(() => [TAKEN, INVALID]));
  // An entry that opened a report and set no commit, and one that opened no report.
  const [bare, none] = [reportMade(issue, null), handMade(issue, "report")];
  expect([judged([bare], [bare], []).answer, judged([none], [none], []).answer]).toEqual([INVALID, INVALID]);
  // One fact twice in `reports` is taken only where the manifest's `selected` holds it twice at the same places.
  expect([judged([A, A], [A, A], [OTHER]).answer, judged([A, A], [A, B], [OTHER]).answer]).toEqual([[WRITTEN, "reserved", null], INVALID]);

  // Where each named entry must come from. The scope of a report is part of its fact, and the binding is exact. An element that is
  // no `report` entry, and a `report` entry of a scope that does not pin `issue`, are no report of an issue lane: `evidence-invalid`.
  // This source's delivery does not check the kind and the definition of a fact that a list names, so the message is taken first
  // (I3 deltas, entry GD11). An entry that is not at hand leaves the delivery not decided.
  const d = new Branch(false).ready();
  const [other, local] = [handMade(issue, "accept-report", [], rita, {}, (seq) => [{ effect: "open", item: seq, type: "report", state: "reported" }, { effect: "value", item: seq, slot: "commit", value: OTHER }]), reportMade(d.lane.at, OTHER)];
  expect([judged([other], [other], []), judged([local], [local], [])].map((one) => [one.taken, one.answer])).toEqual(Array(2).fill([TAKEN, INVALID]));
  expect([said(d.reserve({ reports: [factRefOf(A)] }).judgment), d.state.count("publication", "queued")]).toEqual([["unavailable", "dependency-unavailable", null], 0]);

  // Case s, the count, at the bound on the foreign entries of one entry, 128, once. A message names 2 + v + j + d + r entries, where
  // the 2 are P's `merge` entry and the manifest's. This source's check counts the source entry of the delivery, and then each
  // fact that a field names, the field `operation` among them, which names the source entry again. So a message that names 127 is
  // taken, and one that names 128 is refused `bad-field`, and opens no publication. The note takes 128 and refuses 129: whether
  // the check counts that field again is asked of the contract, and the two readings differ by one entry (I3 deltas, entry GD12).
  const counted = (v: number, decided: number, undecided: number, r: number) => {
    const b = new Branch(false).ready();
    const of = listed(b.lane.at, b.other.at, v, decided, undecided, r);
    const taken = said(b.reserve(of.fields, b.lane, of.entries, of.selected).judgment);
    return { b, of, answer: [2 + v + 2 * decided + undecided + r, taken, result(b), b.state.count("publication", "queued")] };
  };
  const REFUSED = [WRITTEN, ["refused", "bad-field", null], 0];
  const most = counted(64, 15, 0, 31);
  expect([most.answer, counted(64, 15, 0, 32).answer, counted(64, 16, 0, 32).answer, counted(29, 32, 0, 32).answer, counted(30, 32, 0, 32).answer]).toEqual([[127, ...TAKEN, 1], [128, ...REFUSED], [130, ...REFUSED], [127, ...TAKEN, 1], [128, ...REFUSED]]);
  // The entry that records the largest message retains each entry that it names, and the outcome of its `judge` is given the same
  // entries and reads the commits of the 31 reports from them.
  const publication = most.b.head.seq;
  most.b.read = reading(most.b.now, { verdicts: most.of.fields.verdicts.map(() => ({ sound: true, key: null })) });
  expect([most.b.entries[publication]!.entry.uses.length, said(most.b.answered(op(publication, 0), 1, "confirmed", { ...FOUND, ancestors: most.of.commits })), most.b.item(publication).state, most.b.last.uses.length]).toEqual([127, WRITTEN, "reserved", 127]);
});

// Section 6.5, each reason by its name, as the plain judgment of one reservation. What `observed` and `uses` say is the STAND-IN
// `reading`: written by hand, and answered by no scope.
test("judgeReservation gives each reason of section 6.5 by name, in the order of its table, and judges only evidence-too-large, a moved head and a missing integration commit without what observed and uses say", () => {
  const NOW = t(100);
  /** P, the lane whose `merge` the statement is of, and another lane. Each fact is of an entry made by hand. */
  const [P, elsewhere] = [new Branch(true).lane.at, new Branch(true).other.at];
  const made = (kind: string, at = P) => factRefOf(handMade(at, kind));
  const verdict = (who: typeof rita, over: Record<string, unknown> = {}) => ({ review: made("review-verdict"), reviewer: who.member, verdict: "approve", ...over }) as Statement["verdicts"][number];
  const job = (name: string, state: string, over: Record<string, unknown> = {}) => ({ job: made("request-check"), name, state, ...over }) as Statement["jobs"][number];
  const judged = (read: Partial<ReservationRead> | null = {}, evidence: Partial<JudgeEvidence> = {}, statement: Partial<Statement> = {}, recorded: string | null = HEAD) => {
    const answer = judgeReservation({
      recorded, evidence: { ...FOUND, ...evidence } as JudgeEvidence, statement: { operation: made("merge"), manifest: made("propose-manifest"), verdicts: [], jobs: [], links: [], reports: [], ...statement },
      read: read === null ? null : reading(NOW, read), time: NOW,
    });
    return answer.reserved === true ? `reserved${answer.reason === null ? "" : `, ${answer.reason}`}` : answer.reserved === null ? "not judged" : answer.reason;
  };
  const required = { approvals: 0, ownerMayReview: true, checks: [{ name: "combined", configuration: "sha256:c" as never, required: true, checker: "checker" as never }], labels: [] };
  const sound = { sound: true, key: keyObserved(una, NOW) };
  const passed = { opening: "sound", deciding: true, key: keyObserved(una, NOW) } as const;
  const one = rulesObserved(NOW, { approvals: 1 });
  const twice = verdict(una);

  const cases: readonly (readonly [name: string, answer: string, expected: string])[] = [
    ["nothing stands against it", judged(), "reserved"],
    // `evidence-too-large` (G5): judged from the evidence alone. The count of entries has no case here: it is made at the delivery.
    ["the changed set is over its bound", judged(null, { changes: { over: "paths" } }), "evidence-too-large"],
    // `out-of-date`: the head just read is not the recorded head, by this scope's own records; or the manifest's base is not the head.
    ["another writer moved the branch since the recorded head", judged(null, { head: OTHER }), "out-of-date"],
    ["the branch ref is absent", judged(null, { head: null }), "out-of-date"],
    ["the manifest's base is not the head", judged({ manifest: { ...reading(NOW).manifest, base: OTHER } }), "out-of-date"],
    // `integration-invalid`.
    ["the integration commit is not in the repository", judged(null, { present: false, tree: null, firstParent: null, changes: null }), "integration-invalid"],
    ["its tree is not the one named", judged({}, { tree: OTHER }), "integration-invalid"],
    ["the base is not its first parent", judged({}, { firstParent: OTHER }), "integration-invalid"],
    ["a selected report's commit is no ancestor", judged({ manifest: { ...reading(NOW).manifest, reports: [OTHER] } }), "integration-invalid"],
    ["each selected report's commit is an ancestor", judged({ manifest: { ...reading(NOW).manifest, reports: [OTHER] } }, { ancestors: [OTHER] }), "reserved"],
    // `authority-lost`: the merger's key holds `change.merge`, by an observation within ten seconds.
    ["no observation of the merger's key", judged({ merger: null }), "authority-lost"],
    ["the merger's key is retired", judged({ merger: keyObserved(rita, NOW, { keyState: "retired" }) }), "authority-lost"],
    ["the merger is removed", judged({ merger: keyObserved(rita, NOW, { memberState: "removed" }) }), "authority-lost"],
    ["the merger does not hold change.merge", judged({ merger: keyObserved(rita, NOW, { actions: ["change.review"] }) }), "authority-lost"],
    ["the observation is ten seconds old", judged({ merger: keyObserved(rita, t(90)) }), "reserved"],
    ["the observation is older than ten seconds", judged({ merger: keyObserved(rita, t(89)) }), "authority-lost"],
    // `evidence-invalid`: an entry is not what the statement says, or a deciding result's key is compromised.
    ["a verdict's entry is not that verdict", judged({ verdicts: [{ sound: false, key: keyObserved(una, NOW) }] }, {}, { verdicts: [verdict(una)] }), "evidence-invalid"],
    ["a required check's opening entry is not that job's", judged({ rules: rulesObserved(NOW, required), checks: { combined: { ...passed, opening: "unsound" } } }, {}, { jobs: [job("combined", "passed")] }), "evidence-invalid"],
    ["a required check's deciding entry does not hold checks 4 to 7", judged({ rules: rulesObserved(NOW, required), checks: { combined: { ...passed, deciding: false } } }, {}, { jobs: [job("combined", "passed")] }), "evidence-invalid"],
    ["a required check's result is by a compromised key", judged({ rules: rulesObserved(NOW, required), checks: { combined: { ...passed, key: keyObserved(una, NOW, { keyState: "compromised" }) } } }, {}, { jobs: [job("combined", "passed")] }), "evidence-invalid"],
    ["invalid evidence is said before a rule that is not met", judged({ rules: one, verdicts: [{ sound: false, key: null }] }, {}, { verdicts: [verdict(una)] }), "evidence-invalid"],
    // From revision 28, three more causes (section 6.5, "`reserve` names each selected report"): the named reports are not the
    // manifest's selections; an entry that the statement names is not P's; and one entry is named twice in a list.
    ["the named reports are not the manifest's selections", judged({ manifest: { ...reading(NOW).manifest, reports: null } }), "evidence-invalid"],
    ["the same, said after a tree that is not the one named", judged({ manifest: { ...reading(NOW).manifest, reports: null } }, { tree: OTHER }), "integration-invalid"],
    ["the manifest's entry is of another lane than P", judged({}, {}, { manifest: made("propose-manifest", elsewhere) }), "evidence-invalid"],
    ["a verdict's entry is of another lane than P", judged({ verdicts: [sound] }, {}, { verdicts: [verdict(una, { review: made("review-verdict", elsewhere) })] }), "evidence-invalid"],
    ["a job's deciding entry is of another lane than P", judged({}, {}, { jobs: [job("lint", "passed", { decidedBy: made("check", elsewhere) })] }), "evidence-invalid"],
    ["two verdicts name one review", judged({ verdicts: [sound, sound] }, {}, { verdicts: [twice, { ...twice, verdict: "request-changes" }] }), "evidence-invalid"],
    ["two jobs name one deciding entry", judged({}, {}, { jobs: [job("lint", "passed", { decidedBy: twice.review }), job("unit", "passed", { decidedBy: twice.review })] }), "evidence-invalid"],
    ["two jobs, each with its own entries, that no rule requires", judged({}, {}, { jobs: [job("lint", "passed", { decidedBy: made("check") }), job("unit", "requested")] }), "reserved"],
    // `rules-not-met`.
    ["a live request for changes", judged({ verdicts: [sound] }, {}, { verdicts: [verdict(una, { verdict: "request-changes" })] }), "rules-not-met"],
    ["fewer approvals than the rules ask", judged({ rules: one }), "rules-not-met"],
    ["an approval by another member", judged({ rules: one, verdicts: [sound] }, {}, { verdicts: [verdict(una)] }), "reserved"],
    ["an approval by an author", judged({ rules: one, verdicts: [sound], manifest: { ...reading(NOW).manifest, authors: [una.member.member] } }, {}, { verdicts: [verdict(una)] }), "rules-not-met"],
    ["an approval by a compromised key is not counted", judged({ rules: one, verdicts: [{ sound: true, key: keyObserved(una, NOW, { keyState: "compromised" }) }] }, {}, { verdicts: [verdict(una)] }), "rules-not-met"],
    ["an approval whose key is not observed is not counted", judged({ rules: one, verdicts: [{ sound: true, key: null }] }, {}, { verdicts: [verdict(una)] }), "rules-not-met"],
    ["ownerMayReview is false, and the controllers of the authoring agents are not known: no review is shown independent", judged({ rules: rulesObserved(NOW, { approvals: 1, ownerMayReview: false }), verdicts: [sound], controllersOfAuthors: null }, {}, { verdicts: [verdict(una)] }), "rules-not-met"],
    ["the same, with the controllers known", judged({ rules: rulesObserved(NOW, { approvals: 1, ownerMayReview: false }), verdicts: [sound] }, {}, { verdicts: [verdict(una)] }), "reserved"],
    ["a required check has no live job", judged({ rules: rulesObserved(NOW, required) }), "rules-not-met"],
    ["a required check's job is not passed", judged({ rules: rulesObserved(NOW, required), checks: { combined: passed } }, {}, { jobs: [job("combined", "timed-out")] }), "rules-not-met"],
    ["a required check ran under another configuration than the rules hold now", judged({ rules: rulesObserved(NOW, required), checks: { combined: { ...passed, opening: "other-configuration" } } }, {}, { jobs: [job("combined", "passed")] }), "rules-not-met"],
    ["a required check is passed, by sound entries", judged({ rules: rulesObserved(NOW, required), checks: { combined: passed } }, {}, { jobs: [job("combined", "passed")] }), "reserved"],
    // `incomplete`.
    ["the manifest is not complete", judged({ manifest: { ...reading(NOW).manifest, complete: false } }), "incomplete"],
    // Without what `observed` and `uses` say, nothing more is judged.
    ["nothing is at hand", judged(null), "not judged"],
    ["no observation of the rules is at hand", judged({ rules: null }), "not judged"],
  ];
  for (const [name, answer, expected] of cases) expect(answer, name).toBe(expected);

  // Section 12.1.4a, "How the rule `judge` judges extents", with the first definition's three extents. A review counts for the
  // one extent that it states, from a holder of its approver. `rules` is named in the reason when it is not met.
  const extents = firstExtents({ approvals: 1, checks: [] });
  const controller = keyObserved(una, NOW, { actions: ["rules.publish", "change.review"] });
  const touching = (paths: readonly string[], unreadable = 0) => ({ changes: { paths, links: [], unreadable } });
  const withExtents: readonly (readonly [name: string, answer: string, expected: string])[] = [
    ["a change to source with no review", judged({ extents }, touching(["src/a.ts"])), "rules-not-met:source"],
    ["a review that states the extent", judged({ extents, verdicts: [sound] }, touching(["src/a.ts"]), { verdicts: [verdict(una, { extent: "source" })] }), "reserved"],
    ["a review that states no extent counts for none", judged({ extents, verdicts: [sound] }, touching(["src/a.ts"]), { verdicts: [verdict(una)] }), "rules-not-met:source"],
    ["a review that states another extent", judged({ extents, verdicts: [sound] }, touching(["src/a.ts"]), { verdicts: [verdict(una, { extent: "rules" })] }), "rules-not-met:source"],
    ["a change to the rules extent, reviewed for source alone", judged({ extents, verdicts: [sound] }, touching(["AGENTS.md", "src/a.ts"]), { verdicts: [verdict(una, { extent: "source" })] }), "rules-not-met:rules"],
    ["a change to the rules extent, reviewed by the rules scope's controller", judged({ extents, verdicts: [{ sound: true, key: controller }] }, touching(["AGENTS.md"]), { verdicts: [verdict(una, { extent: "rules" })] }), "reserved"],
    ["the same, where the controllers of the authoring agents are not known", judged({ extents, verdicts: [{ sound: true, key: controller }], controllersOfAuthors: null }, touching(["AGENTS.md"]), { verdicts: [verdict(una, { extent: "rules" })] }), "rules-not-met:rules"],
    ["two unmet extents, in the order of the rules", judged({ extents }, touching([".github/x", "AGENTS.md"])), "rules-not-met:rules,infrastructure"],
    ["a changed path that is no text", judged({ extents, verdicts: [sound] }, touching(["src/a.ts"], 1), { verdicts: [verdict(una, { extent: "source" })] }), "rules-not-met:rules"],
    // The exception: declared, exactly one controller, who is among the authors and signed the `merge`. No observation counts the controllers yet (form 11).
    ["the exception, with the count of controllers at hand", judged({ extents, singleControllerException: true, controllers: [rita.member.member], manifest: { ...reading(NOW).manifest, authors: [rita.member.member] } }, touching(["AGENTS.md"])), `reserved, single-controller:rules:${rita.member.member}:m412:r57:h60`],
    ["the exception, with no count of controllers", judged({ extents, singleControllerException: true, manifest: { ...reading(NOW).manifest, authors: [rita.member.member] } }, touching(["AGENTS.md"])), "rules-not-met:rules"],
  ];
  for (const [name, answer, expected] of withExtents) expect(answer, name).toBe(expected);
});

// Section 6.5, "Revocation against reservation, in both orders", and section 7; with the row `judge` of what each outcome yields.
// The forms that exist: the rule reads its observations through the STAND-IN reader, and a notice reaches G as `compromised`.
test("a revocation or a rules change that the reservation's own observation holds leaves the publication not reserved, with the reason in the update; one recorded after it does not stop a reserved publication; and with nothing at hand the rule writes only what its own records decide", () => {
  /** One queued publication with its `judge` open, and the outcome of that `judge` under what the reader says. */
  const judged = (read: Partial<ReservationRead> | null, evidence: unknown = FOUND) => {
    const b = new Branch(false).ready();
    const { operation } = b.reserve();
    const publication = b.head.seq;
    b.read = read === null ? null : reading(b.now, read);
    const judgment = said(b.answered(op(publication, 0), 1, "confirmed", evidence));
    return { b, publication, operation, judgment, state: b.item(publication).state, reason: b.item(publication).values["reason"] };
  };
  // Membership, before: the revocation is in the observation that G read for this reservation. Not reserved, `authority-lost`.
  // `judging` is emptied, nothing is sent to the host, and the final update says `refused` with the reason and the rules' revision.
  const before = judged({ merger: keyObserved(rita, t(0), { keyState: "retired" }) });
  expect([before.judgment, before.state, before.reason, before.b.branch.refs["slot"], before.b.branch.refs["judging"], before.b.opened, updates(before.b)])
    .toEqual([WRITTEN, "not-reserved", "authority-lost", null, null, [], [["not-reserved", { operation: before.operation, outcome: "refused", reason: "authority-lost", rules: 57 }]]]);
  // Membership, after: the observation was read before the revocation. Reserved, and it goes on: a later notice that the key is
  // `compromised` is what reaches a reserved publication, and it starts the abort.
  const after = judged({});
  expect([after.judgment, after.state, after.b.branch.refs["slot"]]).toEqual([WRITTEN, "reserved", after.publication]);

  // The rules, before and after a `publish` that asks one approval more: the reservation is judged under the rules that it observed.
  const stricter = judged({ rules: { ...rulesObserved(t(0), { approvals: 1 }), revision: 58 } });
  expect([stricter.judgment, stricter.state, stricter.reason, updates(stricter.b)]).toEqual([WRITTEN, "not-reserved", "rules-not-met:source", [["not-reserved", { operation: stricter.operation, outcome: "refused", reason: "rules-not-met:source", rules: 58 }]]]);
  expect(updates(after.b)).toEqual([["reserved", { operation: after.operation, outcome: "committed", rules: 57 }]]);
  // A queued publication behind one that is not reserved is judged next.
  const two = new Branch(false).ready();
  two.reserve();
  const first = two.head.seq;
  two.reserve();
  two.read = reading(two.now, { manifest: { ...reading(two.now).manifest, complete: false } });
  expect([said(two.answered(op(first, 0), 1, "confirmed", FOUND)), two.item(first).values["reason"], two.branch.refs["judging"], two.opened]).toEqual([WRITTEN, "incomplete", two.head.seq - 1, [["judge", 1, true]]]);

  // An approval is counted from the observation of the key that signed it, which the entry then retains beside the two others.
  // One whose key has no observation at hand is not counted, and the entry retains none for it.
  const approving = (key: ReturnType<typeof keyObserved> | null, content: object = {}) => {
    const b = new Branch(false).ready();
    const review = handMade(b.lane.at, "review-verdict", [], una);
    b.reserve({ verdicts: [{ review: factRefOf(review), reviewer: una.member, verdict: "approve", extent: "source" }] }, b.lane, [review]);
    const publication = b.head.seq;
    b.read = reading(b.now, { rules: rulesObserved(b.now, { approvals: 1, ...content }), verdicts: [{ sound: true, key }] });
    const judgment = said(b.answered(op(publication, 0), 1, "confirmed", FOUND));
    return [judgment, b.item(publication).state, b.item(publication).values["reason"] ?? null, b.last.input.type === "outcome" && b.last.input.observed?.length];
  };
  expect([approving(keyObserved(una, t(0))), approving(null)]).toEqual([[WRITTEN, "reserved", null, 4], [["unavailable", "authority-unavailable", null], "queued", null, false]]);
  // The manifest has no authors. Its author row is whole with no subjects, so an independent approval is still counted
  // when ownerMayReview is false. A missing reviewer key keeps its declared row absent and its reservation pending.
  expect(approving(keyObserved(una, t(0)), { ownerMayReview: false })).toEqual([WRITTEN, "reserved", null, 4]);

  // With nothing at hand, as in this runtime: no runtime reads an observation for an outcome, and no reader of a lane's entries is
  // written. The rule writes what the evidence and this scope's own records decide, and nothing else. The publication then stays `queued`.
  expect([judged(null, { ...FOUND, changes: { over: "paths" } }), judged(null, { ...FOUND, head: OTHER }), judged(null, { ...FOUND, present: false, tree: null, firstParent: null, changes: null }), judged(null)].map(({ judgment, state, reason }) => [judgment, state, reason])).toEqual([
    [["unavailable", "dependency-unavailable", null], "queued", null], [["unavailable", "dependency-unavailable", null], "queued", null], [["unavailable", "dependency-unavailable", null], "queued", null], [["unavailable", "dependency-unavailable", null], "queued", null],
  ]);
  // Evidence that is not the body of the evidence of `judge` does not follow. From revision 28 that holds for `{ over: "entries" }`
  // too: the count of the entries that a `reserve` names is made at its delivery.
  expect([judged({}, { ...FOUND, counted: 3 }).judgment, judged({}, { over: "entries" }).judgment]).toEqual([BAD_INPUT, BAD_INPUT]);
});

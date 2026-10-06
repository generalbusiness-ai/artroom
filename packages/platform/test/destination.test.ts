import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { FieldValue, Request } from "@generalbusiness/artroom-contract";
import { factRefOf } from "@generalbusiness/artroom-bytes";
import { derivable, runnable, type Item, type JudgedInput, type PlatformRule, type RuleGiven } from "@generalbusiness/artroom-derive";
import { COLLECT_MOST, DESTINATION, DESTINATION_KINDS, destination, destinationRules } from "../src/destination.ts";
import { platform } from "../src/index.ts";
import { Branch, HEAD, NEXT, destinationDefinition, fetched, handMade, rita, said, standInRules } from "./support-destination.ts";

// Every scope here is a `Branch` of test support: a destination scope in memory, below a made-up bureau that stands for the
// directory, with STAND-IN rules for the marks that the package writes no rule for. The lane's entries are made by hand. The eight
// rules that are tested are the platform package's. No Git, no network and no provider is reached.

const WRITTEN = ["write", null, null];
/** The result that the last entry sent for the request that it decided: the outcome, and the reason's code and name. */
const result = (b: Branch) => {
  const message = b.last.sends.at(-1)!.message;
  return message.class === "result" ? [message.outcome, message.reason?.code ?? null, message.reason?.name ?? null] : null;
};
const publications = (b: Branch) => b.state.page("publication", ["queued", "reserved", "publishing", "unresolved", "published", "aborted", "not-reserved"], null, 10).items.map((item) => [item.id, item.state, item.values["reason"], item.values["withdrawDecided"]]);

// The plan's T43, for `platform:destination@1` (authority note, revision 21, section 12.1.5, and its table of marks, section 12.1.8).
test("the destination definition validates whole with the platform option; its marks and its outcome kinds are listed; ten marks have no rule, so the package's rules do not run it; it names no fence", () => {
  const checked = destinationDefinition;
  expect([checked.underived, derivable(checked, null), destination.capabilities, destination.rules, destination.timed]).toEqual([[], true, [], {}, {}]);
  // Section 12.1.5: two item types, with their states; the genesis `establish` and two acts; four handlers.
  expect([Object.entries(destination.items).map(([name, type]) => [name, type.max, type.initial, Object.entries(type.states).map(([state, { final }]) => (final ? `${state}!` : state))]), destination.genesis, Object.keys(destination.acts)]).toEqual([
    [["branch", 1, "empty", ["empty", "ready"]], ["publication", 64, "queued", ["queued", "reserved", "publishing", "unresolved", "published!", "aborted!", "not-reserved!"]]],
    "establish", ["establish", "adopt-head", "resend"],
  ]);
  expect(Object.values(destination.receives).map((h) => [h.message, h.class, h.from.kind, h.from.under, h.opens, h.copies ?? null])).toEqual([
    ["import", "relate", "directory", "platform:directory", null, 1], ["reserve", "tell", "lane", "change", "publication", null],
    ["withdraw", "tell", "lane", "change", null, null], ["compromised", "tell", "directory", "platform:directory", null, null],
  ]);
  // "No entry of the destination sends more than one request and the platform's one result": the one written send is the final update of a `withdraw`.
  expect([...Object.values(destination.acts), ...Object.values(destination.receives)].flatMap((row) => row.sends.map((send) => Object.keys(send)[0]))).toEqual(["relate"]);

  // The marks, by the rows of the note's table: rows 30 to 32 and 34 to 37, row b at the two fields that it names, and place 7.
  const listed = [
    [5, "acts.establish.effects.7", "declare-first-head", "P16"], [5, "receives.import.effects.0", "open-first-head", "P16"], [5, "receives.reserve.effects.3", "open-judge", "P16"],
    [2, "receives.withdraw.also.publication", "publication-of", "P15"], [5, "receives.withdraw.effects.3", "open-withdrawn", "P15"], [5, "receives.compromised.effects.0", "abort-if-behind", "P19"],
    [5, "acts.adopt-head.effects.0", "open-branch-read", "P16"], [5, "acts.resend.effects.0", "reopen-publish", "P16"],
    [3, "receives.reserve.fields.verdicts", "collect-list", "P25"], [3, "receives.reserve.fields.jobs", "collect-list", "P25"],
    [7, "outcomes.first-head", "first-head", "P16"], [7, "outcomes.judge", "judge", "P19"], [7, "outcomes.push", "push", "P16"], [7, "outcomes.mint", "mint", "P16"],
    [7, "outcomes.revoke", "revoke", "P16"], [7, "outcomes.read", "deciding-read", "P16"], [7, "outcomes.receipt", "receipt", "P16"], [7, "outcomes.adopt-read", "adopt-read", "P16"],
  ];
  // Two places that the note's rows state and its table does not list: the type of `links`, and the guard of `resend` on the operations.
  const unlisted = [[3, "receives.reserve.fields.links", "collect-list", "P25"], [4, "acts.resend.guards.1", "resend-due", "ER4"]];
  expect(checked.marks.map((m) => [m.place, m.path, m.code, m.row]).sort()).toEqual([...listed, ...unlisted].sort());
  // The kinds of operation that the definition owns. The fence of section 6.8 is not adopted: the data names none.
  expect([Object.keys(destination.outcomes), Object.values(DESTINATION_KINDS), JSON.stringify(destination).includes("fence")]).toEqual([
    ["first-head", "judge", "push", "mint", "revoke", "read", "receipt", "adopt-read"], Object.keys(destination.outcomes), false,
  ]);

  // The whole-scope rule (the contract's section 6.1): a version with a mark and no rule runs nothing. The package has eight rules,
  // each of the kind of its place. Ten marks have none: `abort-if-behind`, `resend-due` and the eight of `outcomes`.
  const { rules } = platform(DESTINATION)!;
  expect(rules).toBe(destinationRules);
  expect(Object.entries(rules).map(([name, rule]) => [name, rule.place, "most" in rule ? rule.most : null])).toEqual([
    ["declare-first-head", "effect", 1], ["open-first-head", "effect", 2], ["open-judge", "effect", 2], ["publication-of", "also", null],
    ["open-withdrawn", "effect", 5], ["open-branch-read", "effect", 2], ["reopen-publish", "effect", 2], ["collect-list", "type", null],
  ]);
  const lacking = [...new Set(checked.marks.filter((mark) => !Object.hasOwn(rules, mark.code)).map((mark) => mark.code))];
  expect(lacking).toEqual(["resend-due", "abort-if-behind", "first-head", "judge", "push", "mint", "revoke", "deciding-read", "receipt", "adopt-read"]);
  expect(lacking.sort()).toEqual(Object.keys(standInRules).sort());
  expect([runnable(checked, rules), runnable(checked, { ...rules, ...standInRules }), ...lacking.map((lost) => runnable(checked, { ...rules, ...standInRules, [lost]: undefined as never }))])
    .toEqual([false, true, ...lacking.map(() => false)]);
});

// The plan's T50, the destination's first table: each rule of `platform:destination@1` that is written, as a plain function, from
// its row of the note's table of marks (section 12.1.8). A rule is called with what a judge gives it.
test("each rule of platform:destination@1 at an act or a handler, as a plain function, gives what its row of the table of marks states (authority note, section 12.1.8)", () => {
  /** A destination with its first head, and one queued publication (item 3) that the STAND-IN judge has not reserved. */
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
  const run = (name: string, ...args: unknown[]): unknown => (destinationRules[name] as PlatformRule & { run: (...args: unknown[]) => unknown }).run(...args);
  const opens = (kind: string, attempts: number) => [{ effect: "operation", k: 0, owner: DESTINATION, kind, attempts }, { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null }];
  const publication = (state: string): Item => ({ ...ready.item(queued), state });
  const self = ready.head.seq + 1;
  const verdict = { review: reserved.operation, reviewer: rita.member, verdict: "approve" };
  const job = { job: reserved.operation, name: "combined", state: "passed", decidedBy: reserved.operation };
  const link = { link: reserved.operation, issue: ready.other.at };
  const type = (field: string, value: unknown) => [given(ready, tell), value, { field }];

  const rows: readonly (readonly [row: string, rule: string, args: readonly unknown[], expected: unknown])[] = [
    // Row 30: with no import the genesis declares the operation, held: no attempt. With an import it declares none.
    ["30: no import: `first-head`, held, with 3 attempts stated", "declare-first-head", [given(empty, tell, { import: false })], [{ effect: "operation", k: 0, owner: DESTINATION, kind: "first-head", attempts: 3 }]],
    ["30: an import: nothing", "declare-first-head", [given(empty, tell, { import: true })], []],
    // Row 31: the update's state and its commit.
    ["31: `done` with a commit: `first-head` and its attempt 1", "open-first-head", [given(empty, relate("done"), { commit: HEAD })], opens("first-head", 3)],
    ["31: `failed`: nothing", "open-first-head", [given(empty, relate("failed"), { commit: HEAD })], []],
    ["31: `done` that names no commit: nothing", "open-first-head", [given(empty, relate("done"))], []],
    // Row 32: the slot is empty and the branch is `ready`.
    ["32: the branch is `ready` and the slot is empty: `judge` and its attempt 1", "open-judge", [given(ready, tell)], opens("judge", 1)],
    ["32: the branch is `empty`: nothing", "open-judge", [given(empty, tell)], []],
    // Row 34: the publication by its operation, in any state; and the opening when none is bound.
    ["34: the publication whose operation the message names", "publication-of", [given(ready, tell, { operation: reserved.operation }), "publication"], queued],
    ["34: another operation: none", "publication-of", [given(ready, tell, { operation: ready.lane.fact(0) }), "publication"], null],
    ["34: no publication is bound: one opening, `not-reserved`, \"withdrawn\"", "open-withdrawn", [given(ready, tell, { operation: reserved.operation })], [
      { effect: "open", item: self, type: "publication", state: "queued" }, { effect: "ref", item: self, slot: "operation", to: reserved.operation },
      { effect: "ref", item: self, slot: "lane", to: ready.lane.at }, { effect: "state", item: self, state: "not-reserved" }, { effect: "value", item: self, slot: "reason", value: "withdrawn" },
    ]],
    ["34: a publication is bound: nothing", "open-withdrawn", [given(ready, tell, { operation: reserved.operation }, { "also.publication": publication("queued") })], []],
    // Row 36: one read of the branch.
    ["36: one read, with 1 attempt", "open-branch-read", [given(ready, tell)], opens("adopt-read", 1)],
    // Row 37: the same compare-and-swap, with 1 attempt: the push of an unresolved publication, and the receipt of a published one.
    ["37: `unresolved`: the push, with 1 attempt", "reopen-publish", [given(ready, tell, {}, { on: publication("unresolved") })], opens("push", 1)],
    ["37: `published`: the receipt's write, with 1 attempt", "reopen-publish", [given(ready, tell, {}, { on: publication("published") })], opens("receipt", 1)],
    ["37: any other state: nothing", "reopen-publish", [given(ready, tell, {}, { on: publication("queued") })], []],
    // Row b: each record of a `collect` list, up to the `max` of the sender's type.
    ["b: verdicts, up to 256 records", "collect-list", type("verdicts", Array(COLLECT_MOST.verdicts).fill(verdict)), true],
    ["b: one verdict more", "collect-list", type("verdicts", Array(COLLECT_MOST.verdicts + 1).fill(verdict)), false],
    ["b: a verdict that is no verdict of the lane", "collect-list", type("verdicts", [{ ...verdict, verdict: "counted" }]), false],
    ["b: a verdict with a member that the lane does not send", "collect-list", type("verdicts", [{ ...verdict, counted: true }]), false],
    ["b: a verdict with no reviewer", "collect-list", type("verdicts", [{ review: verdict.review, verdict: "approve" }]), false],
    ["b: jobs, with a job that nothing decided yet", "collect-list", type("jobs", [job, { job: job.job, name: "lint", state: "requested" }]), true],
    ["b: one job more than the lane holds", "collect-list", type("jobs", Array(COLLECT_MOST.jobs + 1).fill(job)), false],
    ["b: a job in a state that is not live", "collect-list", type("jobs", [{ ...job, state: "superseded" }]), false],
    ["b: links", "collect-list", type("links", [link]), true],
    ["b: a link to a scope that is no lane", "collect-list", type("links", [{ ...link, issue: ready.bureau.at }]), false],
    ["b: a value that is no list", "collect-list", type("verdicts", verdict), false],
    ["b: a field that the rule is not the type of", "collect-list", type("operation", []), false],
  ];
  for (const [row, rule, args, expected] of rows) expect(run(rule, ...args), `${rule}, row ${row}`).toEqual(expected);
});

// Section 12.2, and rows 30 and 31 of the table of marks, as judgments of the real rows with the real rules.
test("a founding with no import declares the first head in the genesis, held, and the entry that records the confirm opens its attempt 1; a founding by import opens it on the directory's `done` update, from the directory alone", () => {
  // No import. The genesis opens `branch`, `empty`, with the creation's fields, and holds one operation with no attempt.
  const b = new Branch(false);
  expect([b.branch.state, b.branch.values["name"], b.branch.values["import"], b.branch.refs["directory"], b.branch.refs["slot"], b.branch.values["head"], b.state.scope()!.status])
    .toEqual(["empty", "main", false, b.bureau.at, null, null, "provisional"]);
  expect([b.opened, b.state.operation("0:0")]).toEqual([[["first-head", 3, false]], { id: "0:0", owner: DESTINATION, kind: "first-head", most: 3, attempts: [], selected: null }]);
  // The confirmation activates the scope and opens attempt 1 of the held operation (the contract's section 4.3, item 1).
  b.confirmed();
  expect([b.state.scope()!.status, b.last.effects, b.state.operation("0:0")!.attempts]).toEqual([
    "active", [{ effect: "activate" }, { effect: "attempt", operation: "0:0", attempt: 1, result: "opened", selected: null }], [{ attempt: 1, opened: 1, outcomes: [] }],
  ]);
  // The row `import` asks that `import` is true: an update for a founding with no import is refused, and opens nothing.
  expect([said(b.imported("done")), result(b), b.opened]).toEqual([WRITTEN, ["refused", "guard-failed", null], []]);

  // By import. The genesis declares nothing, and the confirmation opens nothing.
  const i = new Branch(true);
  expect([i.opened, i.confirmed().last.effects, i.state.operation("0:0")]).toEqual([[], [{ effect: "activate" }], null]);
  // An update from a scope that is not the directory is no update of this handler's: it is not from a directory under that name.
  expect([said(i.imported("done", HEAD, i.lane)), result(i)]).toEqual([WRITTEN, ["refused", "unknown-message", null]]);
  // `failed`: the update is applied and opens nothing. The branch stays `empty`.
  expect([said(i.imported("failed", null)), result(i), i.opened, i.branch.state]).toEqual([WRITTEN, ["applied", null, null], [], "empty"]);
});

test("the directory's `done` update opens `first-head` with its attempt 1, once the branch is empty; when the branch is ready it is refused", () => {
  const i = new Branch(true).confirmed();
  // A relationship update is applied only at a higher revision, so the `done` update comes from a later entry of the bureau.
  expect([said(i.imported("done")), result(i), i.opened]).toEqual([WRITTEN, ["applied", null, null], [["first-head", 3, true]]]);
  // The STAND-IN outcome of `first-head` makes the branch ready. A further `done` update is then refused by the written guard.
  i.outcome(`${i.head.seq}:0`, 1, "confirmed", { basis: "read", body: { ref: "refs/heads/main", value: HEAD, reported: "created" } });
  expect([i.branch.state, said(i.imported("done", NEXT)), result(i), i.opened]).toEqual(["ready", WRITTEN, ["refused", "guard-failed", null], []]);
});

// Section 12.1.5, cases a to e, with section 6.4, "G's answer to `withdraw`", and rows 32, 34 and b of the table of marks.
test("a reserve is recorded and stays queued before the first head, and opens `judge` after it; one for another lane's operation is refused `not-owner`; an ill-typed list is `bad-field`", () => {
  // Case b: a `reserve` while the branch is `empty`. `applied`. The publication is `queued` and stays so. No `judge` is opened.
  const b = new Branch(false).confirmed();
  const first = b.reserve();
  expect([said(first.judgment), result(b), b.opened, publications(b)]).toEqual([WRITTEN, ["applied", null, null], [], [[b.head.seq, "queued", null, false]]]);
  expect([b.item(b.head.seq).refs["operation"], b.item(b.head.seq).refs["lane"], b.last.sends.length]).toEqual([first.operation, b.lane.at, 1]);

  // With a first head and an empty slot: `applied`, and the entry opens `judge` with its attempt 1.
  const r = new Branch(false).ready();
  expect([said(r.reserve().judgment), result(r), r.opened]).toEqual([WRITTEN, ["applied", null, null], [["judge", 1, true]]]);
  // While a publication holds the slot, a further `reserve` is queued and opens nothing. The reservation is the STAND-IN judge's.
  r.outcome(`${r.head.seq}:0`, 1, "confirmed", { basis: "read", body: {} });
  expect([r.branch.refs["slot"], said(r.reserve().judgment), r.opened, publications(r).map(([, state]) => state)]).toEqual([3, WRITTEN, [], ["reserved", "queued"]]);

  // Case a: the operation is an entry of another lane than the sender. A deciding entry `refused`, named `not-owner`. No publication.
  const before = publications(r).length;
  const theirs = handMade(r.other.at, "merge");
  expect([said(r.reserve({ operation: factRefOf(theirs) }, r.lane, [theirs]).judgment), result(r)]).toEqual([WRITTEN, ["refused", "guard-failed", "not-owner"]]);
  expect(publications(r).length).toBe(before);

  // Row b: a list with a record that is no record of the lane's, and a list that is longer than the lane's type allows.
  expect([said(r.reserve({ verdicts: [{ verdict: "approve" }] }).judgment), result(r), said(r.reserve({ jobs: Array(COLLECT_MOST.jobs + 1).fill({ job: first.operation, name: "x", state: "passed" }) }).judgment), result(r)])
    .toEqual([WRITTEN, ["refused", "bad-field", null], WRITTEN, ["refused", "bad-field", null]]);
  expect(publications(r).length).toBe(before);
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
  const reserve: Request = { class: "request", type: "tell", body: { message: "reserve", fields: { operation: { self: true }, manifest: factRefOf(manifest), verdicts: [], jobs: [], links: [] } } };
  const early = handMade(b.lane.at, "merge", [{ n: 0, to: b.at, message: reserve }]);
  expect([said(b.withdraw(early).judgment), result(b), b.last.sends.length, publications(b).at(-1)]).toEqual([WRITTEN, ["applied", null, null], 1, [b.head.seq, "not-reserved", "withdrawn", false]]);
  expect([b.item(b.head.seq).refs["operation"], b.item(b.head.seq).refs["lane"]]).toEqual([factRefOf(early), b.lane.at]);
  expect([said(b.from(b.lane.at, "change", "merge", reserve, [fetched(manifest, "change")], early).judgment), result(b), publications(b).length]).toEqual([WRITTEN, ["refused", "guard-failed", "withdrawn"], 2]);
});

// Section 12.1.5, cases d and e. The reservation here is the STAND-IN judge's.
test("after reservation a withdraw is refused `reserved` and the publication goes on; the same envelope again is answered with that entry, and a second withdraw is decided again", () => {
  const r = new Branch(false).ready();
  const { merge } = r.reserve();
  const publication = r.head.seq;
  r.outcome(`${publication}:0`, 1, "confirmed", { basis: "read", body: {} });
  expect([r.branch.refs["slot"], r.item(publication).state]).toEqual([publication, "reserved"]);

  // Case d: written, `refused`, `reserved`. The publication does not change. The note's row also sets the mark `withdrawDecided`
  // here. A refused deciding entry applies no effect of its handler, so this source does not set it (I3 deltas, entry ER10).
  const first = r.withdraw(merge);
  const decided = r.head.seq;
  expect([said(first.judgment), result(r), r.last.effects, r.item(publication).state, r.item(publication).values["withdrawDecided"], r.branch.refs["slot"]])
    .toEqual([WRITTEN, ["refused", "guard-failed", "reserved"], [], "reserved", false, publication]);
  // Case e: the same envelope again is answered with the entry of case d, and writes nothing. A second `withdraw`, in another
  // envelope, is its own request with its own result.
  expect([r.withdraw(merge, r.lane, first.entry).judgment, r.head.seq]).toEqual([{ result: "repeat", seq: decided }, decided]);
  expect([said(r.withdraw(merge).judgment), result(r), r.head.seq]).toEqual([WRITTEN, ["refused", "guard-failed", "reserved"], decided + 1]);
});

// Section 6.9 and the rows `adopt-head` and `resend`, with rows 36 and 37 of the table of marks.
test("adopt-head opens one read of the branch only while no publication is reserved and the slot is empty; resend is refused for a publication that is neither unresolved nor published", () => {
  const r = new Branch(false).ready();
  const on = () => ({ on: 0, expected: { on: r.branch.revision } });
  expect([said(r.act(rita, "adopt-head", on())), r.opened]).toEqual([WRITTEN, [["adopt-read", 1, true]]]);
  r.reserve();
  const publication = r.head.seq;
  expect(said(r.act(rita, "resend", { on: publication, expected: { on: r.item(publication).revision } }))).toEqual(["refused", "guard-failed", null]);
  r.outcome(`${publication}:0`, 1, "confirmed", { basis: "read", body: {} });
  expect([said(r.act(rita, "adopt-head", on())), r.item(publication).state]).toEqual([["refused", "guard-failed", null], "reserved"]);
});

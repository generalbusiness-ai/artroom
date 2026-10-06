import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Digest, Entry, FieldValue, Grant, Input, MemberObservation, MemberRef, ObservationUse, RulesObservation, ScopeRef, Seed, Send } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, factRefOf, intentDigest, newIncarnation, parseStrict, scopeIdOf, seedDigest, signIntent } from "@generalbusiness/artroom-bytes";
import { clockOf, derivable, judgeGenesis, runnable, valueDigest, type Item, type Judgment, type OutcomeRule, type PlatformRule, type RuleGiven } from "@generalbusiness/artroom-derive";
import { Ledger, T0, creation, desk, deskDefinition, t, ticket, ticketDefinition } from "@generalbusiness/artroom-derive/testing";
import { DIRECTORY, directory, directoryMembership, directoryRules, membershipId, platform, repositoryName } from "../src/index.ts";
import { rules as rulesScopeRules, rulesScopeDefinition } from "./support-rules.ts";
import { Directory, directoryDefinition, rita, sam, scripted, una, vic } from "./support-founding.ts";

// Every directory here is a `Directory` of test support: a directory in memory that a register in memory created, by its own rules,
// with children and lanes whose entries are SCRIPTED, made by hand. The rows and the rules that are tested are the platform
// package's, and no rule is a stand-in. A founding on scope objects is the scope package's.

const IMPORT = "https://git.example/elsewhere/repo.git";
/** What a judgment answered: the result, with the reason and the refusal's name where it has them. */
const said = (j: { result: string }) => [j.result, "reason" in j ? j.reason : null, "name" in j ? ((j as { name?: string }).name ?? null) : null];
const WRITTEN = ["write", null, null];
const sends = (entry: Entry) => entry.sends.map((send) => [send.n, send.message.class, "type" in send.message ? send.message.type : null]);
/** The canonical bytes of two declared definitions of derive's test fixtures: a desk, whose `create` sends name the ticket's digest. */
const BYTES = { desk: canonicalize(desk), ticket: canonicalize(ticket) };
/** An observation of the rules scope, as the entry would retain it: what it holds as `active`, at one head. */
const rulesObserved = (of: ScopeRef, active: readonly Digest[], n = 1): ObservationUse => {
  const observation: RulesObservation = { subject: "rules", of, head: { seq: 3, hash: definitionDigest(desk) }, revision: 0, content: { asked: "definitions", active: active.map((digest) => ({ digest, name: "ticket" })) }, definition: "platform:rules@1", at: T0 };
  return { observation, read: { run: "r1", n }, use: "fresh", prior: null };
};
/** An observation of one member of that membership scope. */
const memberObserved = (of: ScopeRef, member: string, over: Partial<MemberObservation> = {}): ObservationUse => {
  const observation: MemberObservation = { subject: "member", of, head: { seq: 9, hash: definitionDigest(desk) }, member: member as MemberObservation["member"], memberState: "active", role: "member", activeKey: true, controller: null, controllerActive: null, definition: "platform:membership@1", at: T0, ...over };
  return { observation, read: { run: "r1", n: 2 }, use: "fresh", prior: null };
};
const opening = (d: Directory, more: Record<string, FieldValue> = {}, definition: Digest = ticketDefinition.digest) =>
  ({ expected: { repository: d.item(0).revision }, fields: { definition, title: "A flaky test", conditions: ["it passes ten times"], ...more } });
/** What is at hand for an `open-issue` under the ticket's digest: the observation of the rules, and the bytes. */
const active = (d: Directory) => ({ observed: [rulesObserved(d.children.rules!, [ticketDefinition.digest])], values: [BYTES.ticket] });
/** One index row of a lane's entry: the position of the source entry, its time, and the fields that the row carries. */
type Row = readonly [seq: number, time: string, fields: Record<string, FieldValue>];

// The plan's T43, for `platform:directory@1` (authority note, section 12.1.2, and its table of marks, section 12.1.8, with rows s to u
// of its revision 25).
test("the directory definition validates whole with the platform option; every mark of the note's table has its rule, so the package's rules run it, and with any one missing they do not", () => {
  const valid = directoryDefinition;
  expect([valid.underived, derivable(valid, null), directory.capabilities, directory.rules, directory.timed]).toEqual([[], true, [], {}, {}]);
  // Section 12.1.2: three item types, the genesis `establish` with four acts, two handlers, and one kind of operation.
  expect([Object.keys(directory.items), directory.genesis, Object.keys(directory.acts), Object.values(directory.receives).map((h) => [h.message, h.class, h.from.kind]), Object.keys(directory.outcomes)]).toEqual([
    ["repository", "lane", "task"], "establish", ["establish", "open-issue", "open-pr", "open-task", "retry-import"], [["index", "advisory", "lane"], ["compromised", "tell", "membership"]], ["import"],
  ]);
  // No entry sends more than three requests: the genesis (section 12.1). Every other entry sends at most one.
  expect(Object.entries({ ...directory.acts, ...directory.receives }).map(([name, row]) => [name, row.sends.length])).toEqual([["establish", 3], ["open-issue", 1], ["open-pr", 1], ["open-task", 1], ["retry-import", 0], ["index", 0], ["compromised", 1]]);

  // The marks, by the rows of the note's table: rows 7 to 13, and rows a and d of the further marks.
  const listed = [
    [5, "acts.establish.sends.2.result.applied.1", "open-import", "P16"],
    [4, "acts.open-issue.guards.0", "definition-active", "P19"], [5, "acts.open-issue.effects.4", "next-number", "P17"], [6, "acts.open-issue.sends.0", "create-lane", "P21"],
    [4, "acts.open-pr.guards.2", "definition-active", "P19"], [5, "acts.open-pr.effects.4", "next-number", "P17"], [6, "acts.open-pr.sends.0", "create-lane", "P21"],
    [4, "acts.open-task.guards.0", "worker-standing", "P19"], [5, "acts.retry-import.effects.0", "reopen-import", "P16"],
    [5, "receives.index.effects.0", "index-row", "P15"], [5, "receives.index.effects.1", "index-number", "P17"], [7, "outcomes.import", "import", "P16"],
    // Row l of the further marks: the send of the mark of `import`, which the validator lists as a send.
    [6, "outcomes.import.send", "import-update", "P16"],
    // Rows s to u of the note's revision 25: the two creation rules of the genesis, under the key P20, and the guard of
    // `retry-import`, under the key P29. The genesis holds two send marks, which the contract's revision 19 lets a list hold when at
    // most one does not state `always`: both state it (its section 6.1; witness 18.45).
    [6, "acts.establish.sends.1", "create-rules", "P20"], [6, "acts.establish.sends.2", "create-destination", "P20"], [4, "acts.retry-import.guards.0", "import-spent", "P29"],
  ];
  expect(directory.acts["establish"]!.sends.map((send) => ("code" in send ? [send.code, send.always ?? false] : Object.keys(send)))).toEqual([["create"], ["create-rules", true], ["create-destination", true]]);
  expect(valid.marks.map((m) => [m.place, m.path, m.code, m.row]).sort()).toEqual([...listed].sort());
  // The whole-scope rule (the contract's section 6.1): a version with a mark and no rule runs nothing. The package has a rule of the
  // kind of its place for every mark, so a directory can be created under the package's rules. Without any one of them it cannot.
  const { rules } = platform(DIRECTORY)!;
  expect([rules === directoryRules, valid.marks.filter((mark) => !Object.hasOwn(rules, mark.code)).map((mark) => mark.code)]).toEqual([true, []]);
  expect([runnable(valid, rules), ...Object.keys(rules).map((lost) => runnable(valid, { ...rules, [lost]: undefined as never }))]).toEqual([true, ...Object.keys(rules).map(() => false)]);
});

// The plan's T50, the directory's table: each rule of `platform:directory@1` as a plain function, from its row of the note's table
// of marks (section 12.1.8, rows 7 to 13, a and d) and the cases of section 12.1.2. No scope, no port and no host: a rule is called
// with what a judge gives it, over the folded state of a directory in memory.
describe("the rules of platform:directory@1, each as a plain function (authority note, section 12.1.8)", () => {
  /** A directory that was founded by import, and one that was not. Each holds its three children, and no lane. */
  const d = new Directory({ import: IMPORT });
  const plain = new Directory();
  const { membership, rules } = d.children as Required<Directory["children"]>;
  const lane: ScopeRef = { scope: d.at.scope, inc: newIncarnation(new Uint8Array(16).fill(50)), kind: "lane" };
  const next = d.head.seq + 1;
  /** What is at hand: the further observations, and the values, by their canonical bytes. A value is matched by its digest in its domain. */
  const hand = (observed: readonly ObservationUse[], values: readonly string[]): Pick<RuleGiven, "observed" | "value" | "placed"> => ({
    placed: () => undefined,
    observed: (subject) => observed.find(({ observation: o }) => "subject" in o && ("asked" in subject ? o.subject === "rules" && o.content.asked === subject.asked : "member" in subject && o.subject === "member" && o.member === subject.member)) ?? null,
    value: (domain, digest) => values.map((bytes) => parseStrict(bytes)).find((value) => valueDigest(domain, value) === digest),
  });
  /** What a rule is given for an act of rita at that directory. */
  const given = (s: Directory, kind: string, fields: Record<string, FieldValue> = {}, at: Pick<RuleGiven, "observed" | "value" | "placed"> = hand([], []), grant: Grant | null = null): RuleGiven => ({
    state: s.state, input: { type: "act", signed: s.intent(rita, kind, { fields }), grant, presented: {} }, time: s.now, uses: [], own: s.own,
    resolved: { at: s.at, self: s.head.seq + 1, fields, subjects: new Map<string, Item>([["also.repository", s.item(0)]]), signer: { member: rita.member, principal: null }, bounds: PROPOSED_BOUNDS },
    ...at,
  });
  /** What a rule of the `index` handler is given: the delivery of an advisory from that lane's entry, which is among what the entry read. */
  const indexed = (fields: Record<string, FieldValue>, seq = 6, time = t(5)): RuleGiven => {
    const source = scripted(lane, seq, d.entries[1]!.entry.input, [{ n: 0, to: d.at, message: { class: "advisory", type: "index", body: { fields } } }], "ticket", time);
    const from = factRefOf(source.entry);
    return { ...given(d, "none", fields), input: { type: "delivery", from, n: 0, message: source.entry.sends[0]!.message }, uses: [{ fact: from, entry: source.entry, under: "ticket" }] };
  };
  const run = (name: string, ...args: unknown[]): unknown => (directoryRules[name] as PlatformRule & { run: (...args: unknown[]) => unknown }).run(...args);
  const UNAVAILABLE = { holds: null, reason: "dependency-unavailable" };
  const HOLDS = { holds: true };
  const opened = (kind: string, attempts: number) => [{ effect: "operation", k: 0, owner: DIRECTORY, kind, attempts }, { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null }];

  // Row 9: the definition is the desk, whose named closure is the desk and the ticket.
  const asked = { definition: deskDefinition.digest };
  const both = [BYTES.desk, BYTES.ticket];
  const activeAt = (of: ScopeRef, digests: readonly Digest[] = [deskDefinition.digest]) => [rulesObserved(of, digests)];
  // Row 10: the worker, and the grant that was judged. An agent is a member whose observation has a controller.
  const bot: MemberRef = { membership, member: "@bot" };
  const grantOf = (role: string): Grant => ({ subject: { membership, member: "@rita" }, key: rita.key, fresh: { observation: { role } } }) as unknown as Grant;
  const standing = (over: Partial<MemberObservation>, grant = grantOf("member"), worker = bot) => given(d, "open-task", { worker }, hand([memberObserved(membership, "@bot", over)], []), grant);

  const rows: readonly (readonly [row: string, rule: string, args: readonly unknown[], expected: unknown])[] = [
    // Row 7: when `import` is set, the operation with 3 attempts and its attempt 1. Otherwise nothing.
    ["7: a founding by import opens the import", "open-import", [given(d, "none")], opened("import", 3)],
    ["7: a founding with no import opens nothing", "open-import", [given(plain, "none")], []],
    // Row 8: `number` on the new row, and `lastNumber` on the repository.
    ["8: the new row takes the next number, and `lastNumber` rises", "next-number", [given(d, "open-issue")], [{ effect: "value", item: next, slot: "number", value: 1 }, { effect: "value", item: 0, slot: "lastNumber", value: 1 }]],
    // Row 9: the observation of the rules, and the bytes of the definition and of its closure.
    ["9: active, with its bytes and its closure's", "definition-active", [given(d, "open-issue", asked, hand(activeAt(rules), both))], HOLDS],
    ["9: not `active` in the observation (case c)", "definition-active", [given(d, "open-issue", asked, hand(activeAt(rules, [ticketDefinition.digest]), both))], { holds: false, name: "not-activated" }],
    ["9: the entry would lack the observation", "definition-active", [given(d, "open-issue", asked, hand([], both))], UNAVAILABLE],
    ["9: an observation of another scope than `repository.rules` is none", "definition-active", [given(d, "open-issue", asked, hand(activeAt(membership), both))], UNAVAILABLE],
    ["9: the entry would lack the definition's bytes", "definition-active", [given(d, "open-issue", asked, hand(activeAt(rules), [BYTES.ticket]))], UNAVAILABLE],
    ["9: the entry would lack the bytes of a definition of the closure", "definition-active", [given(d, "open-issue", asked, hand(activeAt(rules), [BYTES.desk]))], UNAVAILABLE],
    // Row 10: the worker is an active member; an agent's controller is the signer, or the signer is an admin.
    ["10: an active member that is no agent", "worker-standing", [standing({})], HOLDS],
    ["10: a removed member", "worker-standing", [standing({ memberState: "removed" })], { holds: false, name: "worker-not-active" }],
    ["10: an active member whose last key is revoked (revision 25, EP11)", "worker-standing", [standing({ activeKey: false })], { holds: false, name: "worker-not-active" }],
    ["10: an agent whose controller is the signer", "worker-standing", [standing({ controller: "@rita" })], HOLDS],
    ["10: an agent of another controller", "worker-standing", [standing({ controller: "@una" })], { holds: false, name: "worker-not-active" }],
    ["10: an agent of another controller, when the signer is an admin", "worker-standing", [standing({ controller: "@una" }, grantOf("admin"))], HOLDS],
    ["10: a worker of another membership scope", "worker-standing", [standing({}, grantOf("admin"), { membership: rules, member: "@bot" })], { holds: false, name: "worker-not-active" }],
    ["10: the entry would lack the observation", "worker-standing", [given(d, "open-task", { worker: bot }, hand([], []), grantOf("admin"))], UNAVAILABLE],
    // Row 11: one new operation, with 1 attempt.
    ["11: one new import, with one attempt", "reopen-import", [given(d, "retry-import")], opened("import", 1)],
    // Rows 12 and 13: no row's `scope` is the sender, so the entry opens one, with what the message carries, and it takes a number.
    ["12: the first row of a lane opens it, with each field that it carries, `first`, `latest` and `seen`", "index-row", [indexed({ kind: "issue", author: una.member, title: "A concern", labels: ["a"], assignees: [vic.member], number: 9 })], [
      { effect: "open", item: next, type: "lane", state: "listed" }, { effect: "ref", item: next, slot: "scope", to: lane },
      { effect: "value", item: next, slot: "kind", value: "issue" }, { effect: "party", item: next, slot: "author", member: una.member },
      { effect: "value", item: next, slot: "title", value: "A concern" }, { effect: "value", item: next, slot: "labels", value: ["a"] }, { effect: "list", item: next, slot: "assignees", change: "add", member: vic.member },
      { effect: "value", item: next, slot: "first", value: t(5) }, { effect: "value", item: next, slot: "latest", value: t(5) }, { effect: "value", item: next, slot: "seen", value: { title: 6, labels: 6, assignees: 6 } },
    ]],
    ["13: a row that this entry opens takes the next number", "index-number", [indexed({ title: "A concern" })], [{ effect: "value", item: next, slot: "number", value: 1 }, { effect: "value", item: 0, slot: "lastNumber", value: 1 }]],
  ];
  for (const [row, rule, args, expected] of rows) test(`${rule}, row ${row}`, () => expect(run(rule, ...args)).toEqual(expected));

  // Row a: the seed names this directory, the act's intent and creation 0. The body holds the lane's genesis fields, and from the
  // platform `directory` and `membership`; for a pull request `destination` and `rules`.
  test("create-lane, row a: one `create` under the digest that the field names, with the lane's genesis fields and the platform's two members", () => {
    for (const [kind, more, sent] of [
      ["open-issue", { conditions: ["c"] }, { conditions: ["c"] }],
      ["open-pr", { draft: true, body: definitionDigest(desk) }, { draft: true, body: definitionDigest(desk), destination: d.children.destination, rules }],
    ] as const) {
      const g = given(d, kind, { definition: ticketDefinition.digest, title: "T", ...more });
      const cause = intentDigest((g.input as Extract<RuleGiven["input"], { type: "act" }>).signed.intent);
      expect(run("create-lane", g)).toEqual({
        to: { v: 1, kind: "lane", definition: ticketDefinition.digest, creator: d.at, cause, ordinal: 0 },
        message: { class: "request", type: "create", body: { fields: { opener: rita.member, title: "T", number: 1, ...sent }, directory: d.at, membership } },
      });
    }
  });

  test("the table has exactly the rules that the note's table of marks names for the directory and that are written, each of the kind of its place; the evidence of a confirmed import states the imported head", () => {
    expect(Object.entries(directoryRules).map(([name, rule]) => [name, rule.place, "refusals" in rule ? rule.refusals : "most" in rule ? rule.most : null])).toEqual([
      ["open-import", "effect", 2], ["next-number", "effect", 2], ["definition-active", "guard", ["not-activated"]], ["worker-standing", "guard", ["worker-not-active"]], ["reopen-import", "effect", 2],
      ["import-spent", "guard", ["import-not-spent"]], ["index-row", "effect", 32], ["index-number", "effect", 2], ["create-lane", "send", null], ["create-rules", "send", null], ["create-destination", "send", null], ["import", "outcome", null], ["import-update", "send", null],
    ]);
    // Row d: basis `own-answer`, so no read is decisive; it selects nothing; another attempt may follow.
    const { rules: outcome } = directoryRules["import"] as { rules: OutcomeRule };
    const formed = (body: unknown, result: "confirmed" | "refused" | "unknown" = "confirmed") => outcome.wellFormed!(result, { basis: result === "unknown" ? "none" : "own-answer", body }, null as never);
    // Revision 25, "The outcomes of `import`": the kind selects one result, no read is decisive, and `most` is 1 effect and the one request.
    expect([outcome.selects, outcome.read, outcome.retries("refused", null as never, null as never), outcome.closure, outcome.most]).toEqual([true, false, true, undefined, { effects: 1, requests: 1, operations: 0 }]);
    expect([formed({ commit: "a".repeat(40) }), formed({ commit: "b".repeat(64) }), formed({ commit: "main" }), formed({ commit: "a".repeat(40), more: 1 }), formed(null)]).toEqual([true, true, false, false, false]);
    // `refused` and `unknown`: an empty record, which is what the rule states for an outcome with no answer. Any other body is not well formed.
    expect([formed({}, "refused"), formed({}, "unknown"), formed(null, "refused"), formed(null, "unknown"), formed({ commit: "a".repeat(40) }, "refused"), outcome.unknown!(null as never, null as never, 1, null as never)]).toEqual([true, true, false, false, false, {}]);
  });
});

// Authority note, section 12.1.2, the row `establish`, and cases a and b; section 3.3, "Where it records its membership reference".
// The scope contract, sections 7.1 and 7.2, with the fourth cause, on a register's real `found` entry.
test("a directory's genesis, by an outcome entry of its register, opens the repository from the creation's fields and holds its three creations; each applied result sets its reference; an act before the confirm, and an `open-pr` before the destination, are not admitted", () => {
  const p = new Directory({ confirmed: false });
  const genesis = p.last.input as Extract<Input, { type: "genesis" }>;
  const claim = p.register.item(p.claim.seq);
  // The seed is the one that the register's `found` entry fixed: the directory's scope ID is the digest that the claim holds, and
  // the cause is the founder's intent. The genesis retains the outcome entry and the claim's entry.
  expect([seedDigest(genesis.seed), genesis.seed.cause, p.at.scope, p.last.uses.map((use) => use.fact.seq)]).toEqual([claim.values["seed"], claim.values["intent"], scopeIdOf(genesis.seed), [p.claim.seq + 1, p.claim.seq]]);
  // The fixed slots, from the creation's fields. The register is the scope of the claim, and the founder is the key that signed it.
  expect([p.item(0).refs, p.item(0).values]).toEqual([
    { register: p.register.at, claim: p.claim, membership: null, rules: null, destination: null },
    { repository: { host: "git.example", namespace: "artroom", name: repositoryName(seedDigest(genesis.seed), 1), id: "r-1" }, branch: "main", founder: rita.key, founderHandle: "@rita", recoveryKey: sam.key, import: null, imported: null, lastNumber: 0 },
  ]);
  // Three creations, in the order membership, rules, destination, each with the digest of the directory's seed as its cause. The
  // result is at ordinal 0, and the three are sealed as duties and held. The second and the third are by the package's rules
  // `create-rules` and `create-destination`, at two send marks that both state `always`: each creation is at the position of its form.
  const cause = seedDigest(genesis.seed);
  expect(p.last.sends.slice(1).map((send) => { const to = send.to as Seed; return [send.n, to.kind, to.definition, to.ordinal, to.cause === cause, to.creator]; })).toEqual([
    [1, "membership", "platform:membership@1", 0, true, p.at], [2, "rules", "platform:rules@1", 1, true, p.at], [3, "destination", "platform:destination@1", 2, true, p.at],
  ]);
  expect((p.last.sends[1]!.message as { body: unknown }).body).toEqual({ fields: { founder: rita.key, founderHandle: "@rita", recoveryKey: sam.key, directory: p.at } });
  // The creation of the rules scope carries its `membership` field: the scope ID of the sibling that creation 0 asks for, which is
  // the contract's `ScopeId` of that seed (the note's revision 25, section 12.1.2: no operand, the rule of the send mark gives it).
  // Its body holds no member `membership`, as the written `create` of membership beside it holds none.
  expect((p.last.sends[2]!.message as { body: unknown }).body).toEqual({ fields: { branch: "main", directory: p.at, membership: scopeIdOf(p.last.sends[1]!.to as Seed) } });
  // The creation of the destination carries its seven fields: `import` as a truth value, and the scope IDs of its two siblings.
  const forDestination = (of: Directory) => (of.entries[0]!.entry.sends[3]!.message as { body: unknown }).body;
  expect([forDestination(p), (forDestination(new Directory({ import: IMPORT, confirmed: false })) as { fields: Record<string, unknown> }).fields["import"]]).toEqual([
    { fields: { repository: p.item(0).values["repository"], branch: "main", import: false, claim: p.claim, directory: p.at, membership: scopeIdOf(p.last.sends[1]!.to as Seed), rules: scopeIdOf(p.last.sends[2]!.to as Seed) } },
    true,
  ]);
  // The real rules scope takes that creation: its genesis is written under `platform:rules@1`, with the package's own rules, and it
  // records the membership scope's ID, which its data requires.
  const founds = () => {
    const child = new Ledger(rulesScopeDefinition, "platform:rules");
    const { asked, source } = creation(p, 0, 2);
    const judgment = judgeGenesis(child.state, rulesScopeDefinition, asked, { clock: clockOf(child.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source, platform: rulesScopeRules });
    if (judgment.result === "write") child.seal(judgment.draft);
    return [judgment.result, judgment.result === "write" ? membershipId(child.state) : null];
  };
  expect(founds()).toEqual(["write", scopeIdOf(p.last.sends[1]!.to as Seed)]);
  expect([p.state.scope()!.status, p.state.scope()!.held, directoryMembership(p.state)]).toEqual(["provisional", [1, 2, 3], null]);
  // Case a: any act before the register's `confirm` is recorded.
  expect(said(p.act(rita, "open-issue", opening(p)))).toEqual(["unavailable", "scope-provisional", null]);

  // After the confirm the held creations are released. Each applied result sets its child's reference, and gets its confirmation.
  // Where a directory records its membership reference is the slot `repository.membership`.
  const d = new Directory({ children: ["membership", "rules"] });
  expect([d.state.scope()!.status, d.state.scope()!.held, d.item(0).refs["membership"], d.item(0).refs["rules"], d.item(0).refs["destination"], directoryMembership(d.state)])
    .toEqual(["active", [], d.children.membership, d.children.rules, null, d.children.membership]);
  expect(sends(d.last)).toEqual([[0, "control", "confirm"]]);
  // A replay is supplied the same reader with the version, and no other version has one: every other scope records the reference in its genesis.
  expect([platform(DIRECTORY)!.membership?.(d.state), platform(DIRECTORY)!.membership?.(p.state), platform("platform:membership@1")!.membership]).toEqual([d.children.membership, null, undefined]);
  // Case b: `open-pr` before the destination's applied result is recorded. No destination.
  const pull = { expected: { repository: d.item(0).revision }, fields: { definition: ticketDefinition.digest, title: "A change", draft: false } };
  expect(said(d.act(rita, "open-pr", pull, active(d)))).toEqual(["refused", "guard-failed", null]);
  // Row 7: the entry that records the destination's applied result opens the import, when the founding names one, and nothing otherwise.
  d.answered("destination");
  expect([d.item(0).refs["destination"], d.last.effects.map((effect) => effect.effect)]).toEqual([d.children.destination, ["ref"]]);
  const imported = new Directory({ import: IMPORT });
  expect([imported.last.effects.map((effect) => effect.effect), imported.state.operation(`${imported.head.seq}:0`)]).toMatchObject([["ref", "operation", "attempt"], { owner: DIRECTORY, kind: "import", most: 3, attempts: [{ attempt: 1 }] }]);
  expect(said(d.act(rita, "open-pr", { ...pull, expected: { repository: d.item(0).revision } }, active(d)))).toEqual(WRITTEN);
  expect((d.last.sends[0]!.message as { body: { fields: unknown } }).body.fields).toEqual({ opener: rita.member, title: "A change", number: 1, draft: false, destination: d.children.destination, rules: d.children.rules });
});

// Authority note, section 12.1.2: the rows `open-issue` and `open-task`, with cases c and f; "Activation and the creator's read".
test("a lane is created only under a digest that the retained observation of the rules shows active, with its bytes at hand; the entry retains what its rules read; a task is opened for a worker whose retained observation shows it active", () => {
  const d = new Directory();
  const { membership, rules } = d.children as Required<Directory["children"]>;
  // Case c: the digest is not `active` in the observation. No entry, no number and no lane. With no observation, or without the
  // bytes, the act is not judged: the signer may send it again.
  const head = d.head.seq;
  expect([
    said(d.act(rita, "open-issue", opening(d), { observed: [rulesObserved(rules, [deskDefinition.digest])], values: [BYTES.ticket] })),
    said(d.act(rita, "open-issue", opening(d), { values: [BYTES.ticket] })),
    said(d.act(rita, "open-issue", opening(d), { observed: active(d).observed })),
    d.head.seq, d.item(0).values["lastNumber"],
  ]).toEqual([["refused", "guard-failed", "not-activated"], ["unavailable", "dependency-unavailable", null], ["unavailable", "dependency-unavailable", null], head, 0]);

  // One entry: the row, with the next number, and the one `create` of a lane under that digest, at ordinal 0. Its cause is the
  // act's intent. The entry retains the observation of the rules that its guard read.
  expect(said(d.act(rita, "open-issue", opening(d), active(d)))).toEqual(WRITTEN);
  const row = d.head.seq;
  const act = d.last.input as Extract<Input, { type: "act" }>;
  expect([d.item(row).values, d.item(row).parties["author"], d.item(0).values["lastNumber"], act.observed]).toMatchObject([{ number: 1, kind: "issue", title: "A flaky test", state: "open" }, rita.member, 1, active(d).observed]);
  expect(d.last.sends).toEqual([{
    n: 0, to: { v: 1, kind: "lane", definition: ticketDefinition.digest, creator: d.at, cause: intentDigest(act.signed.intent), ordinal: 0 },
    message: { class: "request", type: "create", body: { fields: { opener: rita.member, title: "A flaky test", number: 1, conditions: ["it passes ten times"] }, directory: d.at, membership } },
  }]);
  // The `applied` clause of the mark's own clauses sets the row's `scope`. The lane's genesis here is made by hand.
  const lane = d.created(row, 0, "ticket", 60);
  expect([d.item(row).refs["scope"], sends(d.last)]).toEqual([lane, [[0, "control", "confirm"]]]);
  // Case f: the digest is retired. A later act under it is refused on the observation that is read for it, whatever bytes come with it.
  expect([said(d.act(rita, "open-issue", opening(d), { observed: [rulesObserved(rules, [], 2)], values: [BYTES.ticket] })), d.item(0).values["lastNumber"]]).toEqual([["refused", "guard-failed", "not-activated"], 1]);

  // `open-task`: the worker's standing, from the observation that the entry retains. The signer is the agent's controller.
  const bot: MemberRef = { membership, member: "@bot" };
  const task = (observed: readonly ObservationUse[]) => d.act(rita, "open-task", { expected: { repository: d.item(0).revision }, fields: { worker: bot, controller: { membership, member: "@rita" }, lane } }, { observed });
  expect([said(task([])), said(task([memberObserved(membership, "@bot", { memberState: "removed", controller: "@rita" })]))]).toEqual([["unavailable", "dependency-unavailable", null], ["refused", "guard-failed", "worker-not-active"]]);
  expect(said(task([memberObserved(membership, "@bot", { controller: "@rita" })]))).toEqual(WRITTEN);
  expect([d.item(d.head.seq).state, d.item(d.head.seq).parties, d.last.sends.map((send) => [(send.to as Seed).kind, (send.to as Seed).definition, (send.message as { body: { fields: unknown } }).body.fields])]).toEqual([
    "creating", { worker: bot, controller: { membership, member: "@rita" } }, [["task", "platform:task@1", { worker: bot, controller: { membership, member: "@rita" }, lane, membership, directory: d.at }]],
  ]);
});

// The plan's T38 (authority note, section 12.1.2, the row `index`, cases d and e). The lanes' entries are made by hand.
test("two index rows of one lane, in either order, give the same row; a concern's first row opens its row and takes the next number once", () => {
  /** A directory with one lane, which `open-issue` created: its row is item `row`. `index` delivers one index row of a lane's entry. */
  const listed = () => {
    const d = new Directory();
    d.act(rita, "open-issue", opening(d), active(d));
    const row = d.head.seq;
    const lane = d.created(row, 0, "ticket", 60);
    const index = (from: ScopeRef, seq: number, time: string, fields: Record<string, FieldValue>): Judgment => {
      const source = scripted(from, seq, d.entries[1]!.entry.input, [{ n: 0, to: d.at, message: { class: "advisory", type: "index", body: { fields } } }], "ticket", time);
      const judgment = d.judgeDelivered(source, 0);
      if (judgment.result === "write") d.seal(judgment.draft);
      return judgment;
    };
    return { d, row, lane, index };
  };
  const early: Row = [3, t(10), { title: "First", state: "open", labels: ["a"], assignees: [vic.member] }];
  const late: Row = [5, t(20), { title: "Second", state: "closed", assignees: [una.member] }];
  const [a, b] = [listed(), listed()];
  for (const row of [early, late]) a.index(a.lane, ...row);
  for (const row of [late, early]) b.index(b.lane, ...row);
  // Case d: the row from the lower position changes no field that the higher one set, and sets the fields that only it carries.
  const shown = ({ d, row }: typeof a) => ({ ...d.item(row), revision: 0 });
  expect(shown(a)).toEqual(shown(b));
  expect(shown(a)).toMatchObject({
    parties: { author: rita.member, assignees: [una.member] }, refs: { scope: a.lane },
    values: { number: 1, kind: "issue", title: "Second", state: "closed", labels: ["a"], first: t(10), latest: t(20), seen: { title: 5, state: 5, labels: 3, assignees: 5 } },
  });
  // No row of a lane that has its row opens another, or takes a number.
  expect([a.d.state.count("lane", "listed"), a.d.item(0).values["lastNumber"]]).toEqual([1, 1]);

  // Case e: the first index row of a concern, which its parent created, and then the same row again. The row is opened, with the
  // next number: the lane's own `number` is not taken. The repeat is the same advisory, and opens nothing.
  const { d, index } = a;
  const concern: ScopeRef = { scope: d.at.scope, inc: newIncarnation(new Uint8Array(16).fill(70)), kind: "lane" };
  const first: Row = [0, t(30), { kind: "issue", author: una.member, title: "A concern", state: "open", number: 99 }];
  expect(index(concern, ...first).result).toBe("write");
  const opened = d.head.seq;
  expect([d.item(opened).type, d.item(opened).refs["scope"], d.item(opened).parties["author"], d.item(opened).values, d.item(0).values["lastNumber"]])
    .toMatchObject(["lane", concern, una.member, { number: 2, kind: "issue", title: "A concern", state: "open", first: t(30), latest: t(30), seen: { title: 0, state: 0 } }, 2]);
  expect([index(concern, ...first), d.head.seq]).toEqual([{ result: "repeat", seq: opened }, opened]);
  // A later row of the concern changes its row, and takes no number.
  index(concern, 4, t(40), { title: "Renamed", kind: "pr" });
  expect([d.item(opened).values, d.item(0).values["lastNumber"], d.state.count("lane", "listed")]).toMatchObject([{ number: 2, kind: "issue", title: "Renamed", latest: t(40) }, 2, 2]);
});

// Authority note, section 12.1.2: the row `compromised`, which is data; the rows `retry-import` and "An outcome of `import`".
test("a `compromised` notice from the repository's membership scope is sent on to the destination, and one from another scope is refused; an import's confirmed outcome sets the imported head and tells the destination, and its last refusal tells it of the failure", () => {
  const d = new Directory({ import: IMPORT });
  const { membership, destination } = d.children as Required<Directory["children"]>;
  /** A `compromised` notice from that membership scope: a `tell` of an entry made by hand, which is a `revoke-key`. */
  const notice = (from: ScopeRef): Entry => {
    const revoke = signIntent({ v: 1, to: from, actor: rita.key, kind: "revoke-key", on: 3, expected: {}, fields: {}, idempotencyKey: "r", notAfter: t(60) }, rita.secret);
    const tell: Send = { n: 0, to: d.at, message: { class: "request", type: "tell", body: { message: "compromised", fields: { key: una.key, member: { membership: from, member: "@una" }, entry: { self: true } } } } };
    const source = scripted(from, 12, { type: "act", signed: revoke, authority: [], presented: {} }, [tell], "platform:membership");
    return d.take(source, 0);
  };
  const told = notice(membership);
  const source = (told.input as Extract<Input, { type: "delivery" }>).from;
  expect(told.sends).toEqual([
    { n: 0, to: destination, message: { class: "request", type: "tell", body: { message: "compromised", fields: { key: una.key, member: { membership, member: "@una" }, entry: source } } } },
    { n: 1, to: membership, message: { class: "result", of: { from: source, n: 0 }, outcome: "applied" } },
  ]);
  const other = notice({ scope: membership.scope, kind: "membership", inc: newIncarnation(new Uint8Array(16).fill(80)) });
  expect(other.sends.map((send) => send.message)).toMatchObject([{ class: "result", outcome: "refused", reason: { code: "guard-failed", name: "not-the-membership" } }]);

  // The import that the founding opened, with 3 attempts. `retry-import` waits until they are used, by the rule `import-spent`
  // (revision 25, row u): every stated attempt is opened and has an outcome. A directory that was founded with no import is never
  // spent: it asked for none.
  const retry = (of = d) => of.act(rita, "retry-import", { on: 0, expected: { on: of.item(0).revision } });
  const first = [...d.entries].reverse().find(({ entry }) => entry.effects.some((effect) => effect.effect === "operation"))!.entry.seq;
  const operation = `${first}:0` as const;
  const NOT_SPENT = ["refused", "guard-failed", "import-not-spent"];
  expect([said(retry()), said(retry(new Directory()))]).toEqual([NOT_SPENT, NOT_SPENT]);
  // A refusal that is not the last tells nobody. A read of the host settles nothing, and neither does an answer that states no head.
  d.outcome(operation, 1, "refused", {});
  d.outcome(operation, 2, "unknown");
  // Attempt 3 is opened and has no outcome yet, so the import is not spent.
  expect(said(retry())).toEqual(NOT_SPENT);
  d.outcome(operation, 3, "refused", {});
  expect([d.entries.slice(-3).map(({ entry }) => entry.sends), said(d.outcome(operation, 2, "confirmed", { commit: "a".repeat(40) }, "read")), said(d.outcome(operation, 2, "confirmed", { head: "main" }))])
    .toEqual([[[], [], []], ["refused", "bad-input", null], ["refused", "bad-input", null]]);
  // An `unknown` attempt counts as used: its request was sent, and its outcome is recorded. So the import is spent while attempt 2
  // is still `unknown`, and one lost reply does not end a founding by import. `retry-import` opens one new import, with 1 attempt.
  expect(said(retry())).toEqual(WRITTEN);
  const again = `${d.head.seq}:0` as const;
  expect(d.state.operation(again)).toMatchObject({ owner: DIRECTORY, kind: "import", most: 1, attempts: [{ attempt: 1 }] });
  // The new import has no outcome yet, so no second one is opened beside it.
  expect(said(retry())).toEqual(NOT_SPENT);
  // The last `refused`: every stated attempt is opened and refused. The destination is told `failed`, by an update of the repository item.
  d.outcome(operation, 2, "refused", {});
  const update = (state: string, detail: Record<string, string>) => [{ n: 0, to: destination, message: { class: "request", type: "relate", body: { name: "import", item: d.fact(0), state, detail } } }];
  expect([d.last.sends, d.last.effects.map((effect) => effect.effect), d.item(0).values["imported"]]).toEqual([update("failed", {}), ["attempt"], null]);

  // The confirmed outcome of the new import sets `imported`, and tells the destination `done`.
  const commit = "c".repeat(40);
  expect(said(d.outcome(again, 1, "confirmed", { commit }))).toEqual(WRITTEN);
  expect([d.last.sends, d.last.effects, d.item(0).values["imported"], said(retry())]).toEqual([
    update("done", { commit }), [{ effect: "attempt", operation: again, attempt: 1, result: "confirmed", selected: true }, { effect: "value", item: 0, slot: "imported", value: commit }], commit, NOT_SPENT,
  ]);

  // One import is used (revision 25, the delta EP9): the kind selects one result, guarded by `repository.imported`. Every attempt
  // of another founding's import is `unknown`. A retried import is `confirmed` and selected. Then the late answer of attempt 1 of
  // the first operation says `confirmed`, with another head. That operation has selected nothing, and the guard does not hold: the
  // outcome is not selected, derives nothing and sends nothing, and the repository keeps the first head.
  const e = new Directory({ import: IMPORT });
  const imported = `${[...e.entries].reverse().find(({ entry }) => entry.effects.some((effect) => effect.effect === "operation"))!.entry.seq}:0` as const;
  for (const attempt of [1, 2, 3]) e.outcome(imported, attempt, "unknown");
  expect(e.last.input).toMatchObject({ result: "unknown", evidence: { basis: "none", body: {} } });
  expect(said(retry(e))).toEqual(WRITTEN);
  e.outcome(`${e.head.seq}:0`, 1, "confirmed", { commit });
  expect(said(e.outcome(imported, 1, "confirmed", { commit: "d".repeat(40) }))).toEqual(WRITTEN);
  expect([e.state.operation(imported)!.selected, e.last.effects, e.last.sends, e.item(0).values["imported"]]).toEqual([null, [{ effect: "attempt", operation: imported, attempt: 1, result: "confirmed", selected: false }], [], commit]);
});

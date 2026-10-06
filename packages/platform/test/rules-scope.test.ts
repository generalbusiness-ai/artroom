import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type DeclaredDefinition } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, isObservationUse, newIncarnation } from "@generalbusiness/artroom-bytes";
import { PROFILES, derivable, runnable, validateDefinition, valueDigest } from "@generalbusiness/artroom-derive";
import type { ActJudgment, Judgment } from "@generalbusiness/artroom-derive";
import { d, desk, deskDefinition, directory, keys, membership, ticket, ticketDefinition } from "@generalbusiness/artroom-derive/testing";
import { CONFIGURATION_BYTES, CONFIGURATION_DOMAIN, DEFINITION_DOMAIN, PUBLISH, RULES_EXTENTS_VALUE, RULES_SCOPE, extentsOf, firstExtents, membershipId, platform, revisionOf, rulesScope } from "../src/index.ts";
import type { Extent } from "../src/index.ts";
import { rulesScopeRules } from "../src/rules-scope.ts";
import { BRANCH, Rulebook, lanePointingAt, memberOf, standing } from "./support-rules.ts";

// Every scope here is a `Rulebook` of test support: a rules scope in memory, below a STAND-IN registrar, whose acts are judged on the
// test authority of derive's fixture set. The data and the six rules that are tested are the platform package's, and no rule is a
// stand-in. An observation is written by hand (`standing`): nothing here shows a read of membership.

const { rita } = keys;
/** What a judgment answered: the result, with the reason and the refusal's name where it has them. */
const said = (j: ActJudgment | Judgment) => [j.result, "reason" in j ? j.reason : null, "name" in j ? (j.name ?? null) : null];
const WRITTEN = ["write", null, null];
/** What a written act asks the scope to keep of the values beside its intent: the domain and the digest of each that a rule read. */
const kept = (j: ActJudgment) => (j.result === "write" ? (j.draft.values ?? []).map((value) => [value.domain, value.digest]) : null);

/** A check configuration (authority note, section 3.11), with its canonical bytes and its digest in the domain that the rules definition declares. */
const configuration = (name: string, image: unknown = d("a")) => {
  const value = { name, image, environment: {}, steps: [["npm", "test"]], judged: { passed: { exit: 0, line: "ok" }, failed: { exit: 1, line: "not ok" } }, limits: { seconds: 600, bytes: 65536 } };
  return { name, bytes: canonicalize(value), digest: valueDigest(CONFIGURATION_DOMAIN, value) };
};
const [unit, lint] = [configuration("unit"), configuration("lint")];
const check = (of: { name: string; digest: string }, checker = memberOf("@check"), required = true) => ({ name: of.name, configuration: of.digest, required, checker });
const keep = (r: Rulebook, of: { name: string; digest: string; bytes: string }, values: readonly string[] = [of.bytes]) => r.act(rita, "keep-configuration", { fields: { digest: of.digest, name: of.name } }, { values });
/** The extents of the first definition for rules that ask 2 approvals and name no check: what a `publish` of these tests states unless it says otherwise. */
const FIRST = firstExtents({ approvals: 2, checks: [] });
const publish = (r: Rulebook, checks: readonly unknown[], observed: readonly ReturnType<typeof standing>[] = [], over: Record<string, unknown> = {}) =>
  r.act(rita, "publish", { on: 0, expected: { on: r.item(0).revision }, fields: { approvals: 2, ownerMayReview: true, checks, labels: ["bug"], extents: FIRST, ...over } as never }, { observed });
const activate = (r: Rulebook, digest: string, name: string, values: readonly string[]) => r.act(rita, "activate", { fields: { digest, name } }, { values });

// The plan's T43, for `platform:rules@1` (authority note, revision 26, section 12.1.4, and its table of marks, section 12.1.8).
test("the rules definition validates whole with the platform option; its marks are those of the note's table, each with its rule, so the package's rules run it; without any one of them they do not", () => {
  const checked = validateDefinition(JSON.parse(JSON.stringify(rulesScope)), PROPOSED_BOUNDS, PROFILES, { platform: true });
  if (!checked.ok) throw new Error(`the rules definition is refused: ${JSON.stringify(checked.problems)}`);
  expect(checked.definition.digest).toBe(definitionDigest(rulesScope as unknown as DeclaredDefinition));
  expect([checked.definition.underived, derivable(checked.definition, null), rulesScope.capabilities, rulesScope.rules, rulesScope.outcomes, rulesScope.timed]).toEqual([[], true, [], {}, {}, {}]);
  // Section 12.1.4: three item types, the genesis `establish` with four acts in the order of the note's table, and one handler.
  expect([Object.keys(rulesScope.items), rulesScope.genesis, Object.keys(rulesScope.acts), Object.values(rulesScope.receives).map((h) => [h.message, h.class, h.from.kind, h.opens])]).toEqual([
    ["rules", "definition", "configuration"], "establish", ["establish", "publish", "keep-configuration", "activate", "retire-definition"], [["rules-wanted", "tell", "lane", null]],
  ]);
  // The item table, by its bounds and states: one `rules`, 16 live definitions, 1000 configurations. A retired definition is final.
  expect(Object.entries(rulesScope.items).map(([name, item]) => [name, item.many, item.max, item.initial, Object.entries(item.states).filter(([, state]) => state.final).map(([state]) => state)]))
    .toEqual([["rules", false, 1, "current", []], ["definition", true, 16, "active", ["retired"]], ["configuration", true, 1000, "kept", []]]);
  // No act sends a request, and no update goes to any lane from `publish` (G11). The one send is the handler's: the mark
  // `rules-update`, with empty clauses, whose rule gives one request in every entry of the row.
  expect([Object.values(rulesScope.acts).flatMap((act) => act.sends), Object.values(rulesScope.receives).flatMap((h) => h.sends)]).toEqual([[], [{ code: "rules-update", row: "P28", result: {}, always: true }]]);

  // Without the option it is no declared definition, and under a declared name each mark is a form that the contract does not define.
  const { outcomes: _, ...rows } = rulesScope;
  const refused = (value: unknown) => { const checked = validateDefinition(value, PROPOSED_BOUNDS); return checked.ok ? null : checked.problems.map((p) => [p.code, p.path]); };
  expect([refused(rulesScope), refused(rows), refused({ ...rows, name: "rules" })]).toEqual([
    [["shape", "outcomes"]], [["shape", "name"], ["shape", "items.rules.values.extents.of"]], [["shape", "items.rules.values.extents.of"]],
  ]);

  // The marks, by the rows of the note's table: rows 27, 28 and 29, each at place 4, and rows w, x and y of the further marks: the
  // type of the slot and of the field at place 3, a guard at place 4 and the send at place 6. Row 1 derives nothing of an entry and
  // has no mark.
  expect(checked.definition.marks.map((m) => [m.place, m.path, m.code, m.row]).sort()).toEqual([
    [3, "acts.publish.fields.extents", "extent-list", "P28"], [3, "items.rules.values.extents.of", "extent-list", "P28"],
    [4, "acts.activate.guards.0", "definition-bytes", "P21"], [4, "acts.keep-configuration.guards.0", "configuration-bytes", "P18"], [4, "acts.publish.guards.1", "checkers", "P19"],
    [4, "acts.publish.guards.2", "extents-hold", "P28"], [6, "receives.rules-wanted.sends.0", "rules-update", "P28"],
  ]);
  // The table has exactly the rules that the note names, each of the kind of its place, with the refusal names that its row states.
  expect(Object.entries(rulesScopeRules).map(([name, rule]) => [name, rule.place, "refusals" in rule ? rule.refusals : null, rule.clock ?? false]).sort()).toEqual([
    ["checkers", "guard", ["not-a-checker"], false], ["configuration-bytes", "guard", ["configuration-mismatch"], false], ["definition-bytes", "guard", ["unsupported-definition"], false],
    ["extent-list", "type", null, false], ["extents-hold", "guard", ["rules-extent-required", "catch-all-required", "extent-check-unknown"], false],
    ["rules-update", "send", null, false],
  ]);
  // The whole-scope rule (the contract's section 6.1): the package's own rules run the version, with no stand-in. Without any one of
  // the three, or with a rule of another place under a name, it is not runnable.
  const supplied = platform(RULES_SCOPE)!;
  expect([supplied.data, supplied.rules, platform("platform:rules@2")]).toEqual([rulesScope, rulesScopeRules, null]);
  expect([runnable(checked.definition, supplied.rules), ...Object.keys(rulesScopeRules).map((lost) => runnable(checked.definition, { ...supplied.rules, [lost]: undefined as never })), runnable(checked.definition, { ...supplied.rules, checkers: { place: "send", run: () => null } })])
    .toEqual([true, ...Object.keys(rulesScopeRules).map(() => false), false]);
});

// Section 12.1.4, the row `establish`; section 12.1, "The membership reference", and row 1 of the table of marks (I3 deltas, entry EM21).
test("the genesis opens the rules with the branch, the directory and membership's scope ID, and the other values at their defaults; the scope records that ID and no incarnation; a provisional rules scope admits no act", () => {
  const r = new Rulebook();
  const rules = r.item(0);
  expect([rules.type, rules.state, rules.values, rules.refs]).toEqual(["rules", "current", { branch: BRANCH, membership: membership.scope, approvals: 1, ownerMayReview: false, checks: null, labels: null, extents: null, singleControllerException: false }, { directory: r.registrar.at, published: null }]);
  expect([membershipId(r.state), membershipId(r.registrar.state)]).toEqual([membership.scope, null]);
  // The creation's fields hold the ID as a text, which fits the slot: a scope ID is at most 64 bytes.
  expect(membership.scope.length).toBeLessThanOrEqual(64);
  const provisional = new Rulebook(false);
  expect([provisional.state.scope()?.status, said(keep(provisional, unit))[0] === "write"]).toEqual(["provisional", false]);
});

// The plan's T50, the rules scope's table, row 28 (P18, P21), with the contract's witness 18.35, cases 1 to 3, as judgments in memory.
test("keep-configuration keeps a configuration whose bytes beside the intent hash to the digest and whose image is a content digest; other bytes, bytes past the bound and an image that is a tag are each refused configuration-mismatch", () => {
  const r = new Rulebook();
  // Case 1: the value is at hand under its digest in the domain. One entry opens the configuration, and the scope is asked to keep
  // exactly that value. Bytes that no place names are not kept.
  const judged = keep(r, unit, [canonicalize("other bytes"), unit.bytes, lint.bytes]);
  const item = r.item(r.head.seq);
  expect([said(judged), kept(judged), item.type, item.state, item.values, item.parties]).toEqual([WRITTEN, [[CONFIGURATION_DOMAIN, unit.digest]], "configuration", "kept", { digest: unit.digest, name: "unit" }, { keeper: rita.member }]);
  // Case 2: no value at hand has the digest: none came, other bytes came, or the bytes are not the canonical form of the value.
  const MISMATCH = ["refused", "bad-field", null];
  expect([said(keep(r, lint, [])), said(keep(r, lint, [unit.bytes])), said(keep(r, lint, [` ${lint.bytes}`]))]).toEqual([MISMATCH, MISMATCH, MISMATCH]);
  // Case 3: a value that is longer than the bound of its domain is no value at hand. One byte under the bound is.
  const sized = (bytes: number) => { const base = configuration("big"); const value = { ...JSON.parse(base.bytes), pad: "" }; value.pad = "x".repeat(bytes - canonicalize(value).length); return { name: "big", bytes: canonicalize(value), digest: valueDigest(CONFIGURATION_DOMAIN, value) }; };
  const [over, most] = [sized(CONFIGURATION_BYTES + 1), sized(CONFIGURATION_BYTES)];
  expect([most.bytes.length, said(keep(r, over)), said(keep(r, most))]).toEqual([CONFIGURATION_BYTES, MISMATCH, WRITTEN]);
  // The content: an `image` that is a tag, an `image` that is absent, and a value that is no record. Each hashes to its digest.
  const tagged = configuration("tagged", "node:22");
  const bare = (value: unknown) => ({ name: "bare", bytes: canonicalize(value), digest: valueDigest(CONFIGURATION_DOMAIN, value) });
  expect([said(keep(r, tagged)), said(keep(r, bare({ name: "bare" }))), said(keep(r, bare([d("a")])))]).toEqual(Array(3).fill(["refused", "guard-failed", "configuration-mismatch"]));
  // The digest is in the configuration's own domain: the same bytes under their digest as a definition are not the value.
  expect(said(keep(r, { ...lint, digest: valueDigest(DEFINITION_DOMAIN, JSON.parse(lint.bytes)) }))).toEqual(MISMATCH);
});

// The plan's T50, row 27 (P19), with cases a and b of section 12.1.4. Each observation is a STAND-IN, written by hand.
test("publish sets the rules when each check's configuration is kept and each checker is observed as an active member with the role checker; the entry retains exactly the observations read; a missing observation leaves the act not completed", () => {
  const r = new Rulebook();
  keep(r, unit);
  keep(r, lint);
  const [checkA, checkB] = [standing("@check", 7), standing("@bot", 8)];
  const checks = [check(unit), check(lint, memberOf("@bot"), false)];
  const before = r.item(0);

  // Case b: a configuration that was not kept is refused by the written guard, before the rule is run.
  expect(said(publish(r, [check(configuration("absent"))], [checkA]))).toEqual(["refused", "guard-failed", "configuration-unknown"]);
  // Not completed: no observation of a checker is at hand, or of the second only; or the one at hand is of another scope than the
  // membership scope that this scope records.
  const elsewhere = { ...membership, scope: directory.scope };
  for (const observed of [[], [checkA], [checkB], [checkA, standing("@bot", 8, { of: elsewhere })]]) {
    expect(said(publish(r, checks, observed))).toEqual(["unavailable", "authority-unavailable", null]);
  }
  // Case a: `not-a-checker`. The role is not `checker`; the member is removed, or unknown; the field names the checker in another
  // membership scope, or in another incarnation of it than the one observed.
  const reborn = { ...membership, inc: newIncarnation(new Uint8Array(16).fill(77)) };
  const NOT = ["refused", "guard-failed", "not-a-checker"];
  expect([
    said(publish(r, checks, [checkA, standing("@bot", 8, { role: "member" })])),
    said(publish(r, checks, [checkA, standing("@bot", 8, { memberState: "removed" })])),
    said(publish(r, checks, [checkA, standing("@bot", 8, { memberState: "unknown", role: null, activeKey: null })])),
    said(publish(r, [check(unit, memberOf("@check", elsewhere))], [checkA])),
    said(publish(r, [check(unit, memberOf("@check", reborn))], [checkA])),
  ]).toEqual([NOT, NOT, NOT, ["refused", "bad-field", null], ["refused", "bad-field", null]]);
  // The rules did not change, and nothing was written.
  expect([r.item(0), r.last.input.type === "act" && r.last.input.signed.intent.kind]).toEqual([before, "keep-configuration"]);

  // Both hold. The entry sets the four values, and retains the two observations that the rule read, in ascending order of the
  // read's number, and not the one that no check names. One checker of two checks is observed once.
  const extra = standing("@other", 3);
  expect(said(publish(r, [...checks, { ...check(unit), name: "unit-again" }], [checkB, extra, checkA]))).toEqual(WRITTEN);
  expect([r.item(0).values, r.last.input.type === "act" && r.last.input.observed]).toEqual([
    { branch: BRANCH, membership: membership.scope, approvals: 2, ownerMayReview: true, checks: [...checks, { ...check(unit), name: "unit-again" }], labels: ["bug"], extents: FIRST, singleControllerException: false }, [checkA, checkB],
  ]);
  // Rules with no check read no observation: the entry has no member `observed`.
  expect([said(publish(r, [], [checkA])), "observed" in r.last.input, r.item(0).values["checks"]]).toEqual([WRITTEN, false, []]);
});

// The plan's T50, row 29 (P21), with case c of section 12.1.4. `desk` and `ticket` are made-up definitions of derive's fixture set:
// a desk creates tickets under the ticket's digest, so the named closure of `desk` is `desk` and `ticket`.
test("activate opens an active definition when its bytes and its whole named closure are beside the intent, validate and state the name; without one of them the act is not completed; bytes that do not validate, another name and a platform name are each refused unsupported-definition", () => {
  const r = new Rulebook();
  const [deskBytes, ticketBytes] = [canonicalize(desk), canonicalize(ticket)];
  const [deskDigest, ticketDigest] = [deskDefinition.digest, ticketDefinition.digest];
  const UNSUPPORTED = ["refused", "unsupported-definition", "unsupported-definition"];
  const NOT_COMPLETED = ["unavailable", "dependency-unavailable", null];
  const start = r.entries.length;

  // Not completed: the definition's own bytes are not supplied, or a definition of its closure is not.
  expect([said(activate(r, deskDigest, "desk", [])), said(activate(r, deskDigest, "desk", [ticketBytes])), said(activate(r, deskDigest, "desk", [deskBytes]))]).toEqual(Array(3).fill(NOT_COMPLETED));
  // Case c: bytes that hash to the digest and do not validate. A definition from an input is validated without the platform option,
  // so no author gets a platform name by an activation (section 13.8). The rules scope's own data is such bytes.
  const offered = (value: unknown) => ({ bytes: canonicalize(value), digest: valueDigest(DEFINITION_DOMAIN, value) });
  const [broken, named, own] = [offered({ ...ticket, genesis: "no-such-act" }), offered({ ...ticket, name: "platform:ticket" }), offered(rulesScope)];
  expect([said(activate(r, broken.digest, "ticket", [broken.bytes])), said(activate(r, named.digest, "platform:ticket", [named.bytes])), said(activate(r, own.digest, "platform:rules", [own.bytes]))]).toEqual(Array(3).fill(UNSUPPORTED));
  // The bytes state another name than the one given; and a definition of the closure does not validate.
  const badChild = offered({ ...ticket, genesis: "no-such-act" });
  const parent = offered({ ...desk, acts: { ...desk.acts, "open-issue": { ...desk.acts["open-issue"]!, sends: [{ create: { kind: "lane", definition: badChild.digest, fields: {}, result: {} } }] } }, receives: {} });
  expect([said(activate(r, ticketDigest, "desk", [ticketBytes])), said(activate(r, parent.digest, "desk", [parent.bytes, badChild.bytes]))]).toEqual([UNSUPPORTED, UNSUPPORTED]);
  // A closure with more definitions than the judge's bound.
  r.bounds = { ...PROPOSED_BOUNDS, namedDefinitions: 0 };
  expect(said(activate(r, deskDigest, "desk", [deskBytes, ticketBytes]))).toEqual(UNSUPPORTED);
  r.bounds = PROPOSED_BOUNDS;
  // Nothing was written, so nothing is retained.
  expect(r.entries.length).toBe(start);

  // The definition and its closure. One entry opens the definition, `active`, and the scope is asked to keep both definitions, each
  // under its digest in the definition domain, and no other bytes.
  const judged = activate(r, deskDigest, "desk", [canonicalize("other bytes"), ticketBytes, deskBytes]);
  const item = r.item(r.head.seq);
  expect([said(judged), kept(judged), item.type, item.state, item.values, item.parties]).toEqual([
    WRITTEN, [[DEFINITION_DOMAIN, deskDigest], [DEFINITION_DOMAIN, ticketDigest]], "definition", "active", { digest: deskDigest, name: "desk" }, { activator: rita.member },
  ]);
  // A definition with no closure but itself needs its own bytes alone.
  expect([said(activate(r, ticketDigest, "ticket", [ticketBytes])), kept(activate(r, ticketDigest, "ticket", [ticketBytes]))]).toEqual([WRITTEN, null]);
  // The written guard: a digest that is `active` is not activated again. After `retire-definition` it may be.
  const again = () => said(activate(r, deskDigest, "desk", [deskBytes, ticketBytes]));
  expect(again()).toEqual(["refused", "guard-failed", null]);
  expect([said(r.act(rita, "retire-definition", { on: item.id, expected: { on: item.revision } })), r.item(item.id).state, again()]).toEqual([WRITTEN, "retired", WRITTEN]);
});

// Section 12.1.4, the row `rules-wanted` with the send mark `rules-update`, and cases d and k. The lane is a STAND-IN: a made-up
// definition that sends the `tell`.
test("rules-wanted from a lane is applied by one entry that changes nothing: the rules update to the sender at ordinal 0 and the result at ordinal 1; before a first publish the update and the scope give the three extents of the first definition, and after one the extents that it stated, without their patterns in the update", () => {
  const r = new Rulebook();
  const lane = lanePointingAt(r.at);
  /** The lane asks, the rules scope takes the delivery, and what its entry sends: the update's body, and the result. */
  const asked = () => {
    lane.did(rita, "want", { on: 0, expected: { on: lane.item(0).revision } });
    const [before, judged] = [r.item(0), said(r.receive(lane, lane.head.seq))];
    const sends = r.last.sends.map((send) => [send.n, send.to, send.message.class, send.message.class === "request" ? [send.message.type, send.message.body] : send.message.class === "result" ? send.message.outcome : null]);
    return [judged, r.last.effects, JSON.stringify(r.item(0)) === JSON.stringify(before), sends];
  };
  const update = (detail: Record<string, unknown>) => [WRITTEN, [], true, [[0, lane.at, "request", ["relate", { name: "rules", item: r.fact(0), state: "current", detail }]], [1, lane.at, "result", "applied"]]];
  const projected = (extents: readonly Extent[]) => extents.map(({ patterns: _, ...five }) => five);

  // Case k: before any `publish`. The slot `extents` is unset, and a repository has the three extents of the first definition all
  // the same, from the `approvals` of the genesis. The update has no member `checks`, and none for the labels, which are unset too.
  const first = firstExtents({ approvals: 1, checks: [] });
  expect([r.item(0).values["extents"], extentsOf(r.state), first.map((extent) => extent.name)]).toEqual([null, first, ["rules", "infrastructure", "source"]]);
  expect(asked()).toEqual(update({ approvals: 1, ownerMayReview: false, singleControllerException: false, extents: projected(first) }));

  // Case d, after a `publish` that states a repository's own extents and declares the exception. The scope holds them whole, with
  // their patterns. The update carries five members of each, in their order, and no pattern: a lane reads no path.
  keep(r, unit);
  const own: Extent[] = [first[0]!, { name: "deploy", patterns: ["deploy/**"], approvals: 2, approver: "change.merge", checks: ["unit"], class: "deployment" }, { ...first[2]!, name: "code", checks: ["unit"] }];
  expect(said(publish(r, [check(unit)], [standing("@check", 7)], { extents: own, singleControllerException: true }))).toEqual(WRITTEN);
  expect([extentsOf(r.state), extentsOf(r.registrar.state)]).toEqual([own, null]);
  expect(asked()).toEqual(update({ approvals: 2, checks: [check(unit)], ownerMayReview: true, labels: ["bug"], singleControllerException: true, extents: projected(own) }));
});

// Section 12.1.4, "The rows of the rules scope, changed in revision 25", cases f to j: the missing forms 2, 3 and 14 of section 12.1.4a.
test("publish keeps the extents that it states, whole, and the scope holds them; a list outside the bounds of an extent is refused bad-field; one without the fixed minimum of the rules extent, without exactly one extent that has no pattern, or with a check that the act does not hold is refused by name", () => {
  const r = new Rulebook();
  // A repository's own extents: one more pattern in `rules`, a layer of its own, and the extent with no pattern under another name.
  const [rules, infrastructure] = FIRST as [Extent, Extent, Extent];
  const own: Extent[] = [
    { ...rules, patterns: [...rules.patterns, "policy/**"] }, infrastructure,
    { name: "docs", patterns: ["docs/**", "**/*.md"], approvals: 0, approver: "change.review", checks: [], class: "content" },
    { name: "code", patterns: [], approvals: 2, approver: "change.review", checks: [], class: "content" },
  ];
  expect([said(publish(r, [], [], { extents: own })), r.item(0).values["extents"]]).toEqual([WRITTEN, own]);
  // Every `publish` states the rules whole: one with no field `extents` is refused, and the extents stay.
  const { extents: _, ...older } = { approvals: 2, ownerMayReview: true, checks: [], labels: [], extents: null };
  expect([said(r.act(rita, "publish", { on: 0, expected: { on: r.item(0).revision }, fields: older })), r.item(0).values["extents"]]).toEqual([["refused", "bad-field", null], own]);
  // Case i: a name with an uppercase letter, and nine extents. The type is the rule `extent-list`, at check 7.
  const nine = [...own, ...["a", "b", "c", "d", "e"].map((name) => ({ ...own[2]!, name }))];
  expect([said(publish(r, [], [], { extents: [{ ...rules }, infrastructure, { ...own[3]!, name: "Code" }] })), said(publish(r, [], [], { extents: nine })), said(publish(r, [], [], { extents: nine.slice(0, 8) })), r.item(0).values["extents"]])
    .toEqual([["refused", "bad-field", null], ["refused", "bad-field", null], WRITTEN, nine.slice(0, 8)]);

  // The rule `extents-hold`, the third guard: three checks in order, each refused `guard-failed` under its name.
  const before = r.item(0);
  const refusedAs = (name: string) => ["refused", "guard-failed", name];
  const stated = (extents: readonly unknown[], checks: readonly unknown[] = [], observed: readonly ReturnType<typeof standing>[] = []) => said(publish(r, checks, observed, { extents }));
  const [, , docs, code] = own as [Extent, Extent, Extent, Extent];
  // Case f: no extent named `rules`; one that lacks a pattern of the four; one that lowers the approvals, or names another approver or class.
  const lesser = (over: Partial<Extent>) => stated([{ ...rules, ...over }, infrastructure, code]);
  expect([stated([infrastructure, code]), lesser({ patterns: rules.patterns.slice(1) }), lesser({ approvals: 0 }), lesser({ approver: "change.merge" }), lesser({ class: "deployment" }), stated([{ ...rules, name: "policy" }, infrastructure, code])])
    .toEqual(Array(6).fill(refusedAs("rules-extent-required")));
  // Case g: two extents with no pattern, or none.
  expect([stated([rules, { ...docs, patterns: [] }, code]), stated([rules, infrastructure, docs])]).toEqual(Array(2).fill(refusedAs("catch-all-required")));
  // Case h: an extent names a check that the same act does not hold. With the check in the act it is written.
  keep(r, unit);
  const [checked, seen] = [[rules, infrastructure, { ...code, checks: ["unit"] }], [standing("@check", 7)]];
  expect([stated(checked), stated(checked, [check(lint)], seen), r.item(0)]).toEqual([refusedAs("extent-check-unknown"), ["refused", "guard-failed", "configuration-unknown"], before]);
  expect([stated(checked, [check(unit)], seen), r.item(0).values["extents"]]).toEqual([WRITTEN, checked]);
  // The first check that fails gives its name: a list with no `rules` extent and no extent without a pattern, and one with no extent
  // without a pattern and an unknown check.
  expect([stated([infrastructure, docs]), stated([rules, infrastructure, { ...docs, checks: ["absent"] }])]).toEqual([refusedAs("rules-extent-required"), refusedAs("catch-all-required")]);
});

// Section 12.1.4, case j, and section 12.1.4a, "Which rules declare it" (the missing form 14); the contract's revision 19, row I3-36.
test("the declaration of the single-controller exception is false from the genesis, a publish sets it, and a publish that does not state it withdraws it; the record of an observation of the rules takes the declaration, and takes no extents", () => {
  const r = new Rulebook();
  const declared = () => r.item(0).values["singleControllerException"];
  // `publish` has no guard on the number of controllers: the declaration may be made at any time, and gives nobody anything by itself.
  expect([declared(), said(publish(r, [], [], { singleControllerException: true })), declared()]).toEqual([false, WRITTEN, true]);
  // Case j: a `publish` with no such field, after one that declared it. Written, and the value is false.
  expect([said(publish(r, [])), declared(), said(publish(r, [], [], { singleControllerException: "yes" }))[1]]).toEqual([WRITTEN, false, "bad-field"]);

  // What an entry may retain of the rules: the fixed record of the contract, with the declaration under this definition. A record
  // with a member `extents` is no observation: the contract states no such member, so no observation carries the extents.
  const content = { asked: "rules", approvals: 1, ownerMayReview: false, checks: [], labels: [] };
  const use = (over: Record<string, unknown>) => isObservationUse({ observation: { subject: "rules", of: r.at, head: r.head, revision: 0, content: { ...content, ...over }, definition: RULES_SCOPE, at: standing("@check", 1).observation.at }, read: { run: "r1", n: 1 }, use: "fresh", prior: null });
  expect([use({}), use({ singleControllerException: true }), use({ singleControllerException: "yes" }), use({ singleControllerException: false, extents: FIRST })]).toEqual([true, true, false, false]);
});

// Authority note, revision 28, section 12.1.4, "The revision of the rules, and the answer to an observation" (I3 deltas, entries EQ8
// and FB10), with its case e. The answer is the platform's function `observed`, as a runtime and a replay are supplied it.
test("a rules scope answers an observation from its folded state at its head: the revision is 0 and the values are the genesis's before a publish, and the position of the last publish after one; asked as definitions it lists the active ones in the order of their IDs; a provisional scope, another incarnation and a request for a key are answered nothing", () => {
  const r = new Rulebook();
  const supplied = platform(RULES_SCOPE)!;
  const answer = (of: Rulebook, asked: object) => supplied.observed!(of.state, asked as never);
  const common = () => ({ subject: "rules", of: r.at, head: r.head, definition: RULES_SCOPE });
  const byId = { scope: r.at.scope, kind: "rules" };
  // The slot is a reference to a fact of a `publish` under this definition, set by one written effect from the entry itself.
  expect([supplied.revised, PUBLISH, rulesScope.items["rules"]!.refs["published"], rulesScope.acts["publish"]!.effects.at(-1)]).toEqual([
    "publish", "publish", { fixed: false, required: false, to: { type: "fact", kind: ["publish"], under: "platform:rules" } }, { ref: { slot: "published", from: "self" } },
  ]);
  // Before any `publish`: the revision is 0, and the rules are what the genesis gave. A list that is unset is given empty. The
  // answer holds no `at`; its extents digest names the bounded canonical bytes served from this same head.
  expect([revisionOf(r.state), answer(r, { of: r.at, asked: "rules" }), answer(r, { of: byId, asked: "definitions" })]).toEqual([
    0, { ...common(), revision: 0, content: { asked: "rules", approvals: 1, ownerMayReview: false, checks: [], labels: [], singleControllerException: false, extents: valueDigest(RULES_EXTENTS_VALUE.domain, firstExtents({ approvals: 1, checks: [] })) } },
    { ...common(), revision: 0, content: { asked: "definitions", active: [] } },
  ]);

  // After a `publish`: the revision is that entry's position. An entry of another kind moves the head and not the revision.
  keep(r, unit);
  expect(said(publish(r, [check(unit)], [standing("@check", 7)], { singleControllerException: true }))).toEqual(WRITTEN);
  const first = r.head.seq;
  expect(supplied.observedValues!(r.state, { of: r.at, asked: "rules" })).toEqual([{ domain: RULES_EXTENTS_VALUE.domain, bytes: canonicalize(FIRST) }]);
  const [deskBytes, ticketBytes] = [canonicalize(desk), canonicalize(ticket)];
  expect([said(activate(r, ticketDefinition.digest, "ticket", [ticketBytes])), said(activate(r, deskDefinition.digest, "desk", [deskBytes, ticketBytes]))]).toEqual([WRITTEN, WRITTEN]);
  expect([r.item(0).refs["published"], r.head.seq > first, answer(r, { of: byId, asked: "rules" }), answer(r, { of: r.at, asked: "definitions" })]).toEqual([
    first, true,
    { ...common(), revision: first, content: { asked: "rules", approvals: 2, ownerMayReview: true, checks: [{ name: "unit", configuration: unit.digest, required: true, checker: "@check" }], labels: ["bug"], singleControllerException: true, extents: valueDigest(RULES_EXTENTS_VALUE.domain, FIRST) } },
    { ...common(), revision: first, content: { asked: "definitions", active: [{ digest: ticketDefinition.digest, name: "ticket" }, { digest: deskDefinition.digest, name: "desk" }] } },
  ]);
  // A second `publish` is the revision from then on, and a retired definition is not listed. A refused `publish` changes neither.
  expect(said(publish(r, []))).toEqual(WRITTEN);
  const second = r.head.seq;
  const ticketItem = second - 2;
  expect([said(publish(r, [check(lint)], [standing("@check", 7)])), said(r.act(rita, "retire-definition", { on: ticketItem, expected: { on: r.item(ticketItem).revision } }))]).toEqual([["refused", "guard-failed", "configuration-unknown"], WRITTEN]);
  expect([second > first, revisionOf(r.state), answer(r, { of: r.at, asked: "definitions" })]).toMatchObject([true, second, { revision: second, content: { active: [{ name: "desk" }] } }]);

  // No answer: a provisional rules scope (section 12.1); a request that states another incarnation, or another kind; one for a key
  // or for a member; and a state that holds no rules.
  const provisional = new Rulebook(false);
  const reborn = { ...r.at, inc: newIncarnation(new Uint8Array(16).fill(77)) };
  expect([
    answer(provisional, { of: provisional.at, asked: "rules" }), answer(r, { of: reborn, asked: "rules" }), answer(r, { of: { ...r.at, kind: "membership" }, asked: "rules" }),
    answer(r, { of: r.at, key: rita.key }), answer(r, { of: r.at, member: "@check" }), answer(r.registrar as never, { of: r.registrar.at, asked: "rules" }), revisionOf(r.registrar.state),
  ]).toEqual([null, null, null, null, null, null, null]);
  // What an entry may retain: the answer with the asking scope's `at` is an observation of the rules, by the record check.
  const at = standing("@check", 1).observation.at;
  expect(isObservationUse({ observation: { ...(answer(r, { of: r.at, asked: "rules" }) as object), at }, read: { run: "r1", n: 1 }, use: "fresh", prior: null })).toBe(true);
});

import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type DeclaredDefinition } from "@generalbusiness/artroom-contract";
import { definitionDigest } from "@generalbusiness/artroom-bytes";
import { PROFILES, derivable, ruleAt, runnable, outcomeValueDomains, validateDefinition } from "@generalbusiness/artroom-derive";
import { ACTIONS_MOST, DESTINATION_CHANGED_SET, FIRST_ACTIONS, ROLE_LISTS, RULES, definitions, destinationMembership, destinationRulesScope, inbox, membership, platform, rulesMembership } from "../src/index.ts";

// The plan's T43, for `platform:inbox@1` (authority note, revision 16, section 12.1.6). The package holds six definitions: the two
// lists at the end of this test name them. T43 for each of the other five is in this file or in the test file of its definition.
test("the inbox definition validates whole with the platform option, with its marks listed, and is refused without it", () => {
  const checked = validateDefinition(inbox, PROPOSED_BOUNDS, PROFILES, { platform: true });
  if (!checked.ok) throw new Error(`the inbox is refused: ${JSON.stringify(checked.problems)}`);

  // Its digest is the bytes package's, in the definition's own domain. No file pins it: a platform definition is pinned by name and version.
  expect(checked.definition.digest).toBe(definitionDigest(inbox as unknown as DeclaredDefinition));
  // Every form is one that the validator derives: it needs no capability's code. It lists none and declares no rule (section 12.1).
  expect(checked.definition.underived).toEqual([]);
  expect(derivable(checked.definition, null)).toBe(true);
  expect([inbox.capabilities, inbox.rules, inbox.timed]).toEqual([[], {}, {}]);
  // Section 12.1.6: two item types, three acts with the genesis `establish`, and `notify` twice.
  expect([Object.keys(inbox.items), Object.keys(inbox.acts), inbox.genesis, Object.values(inbox.receives).map((h) => [h.message, h.class, h.from.kind])])
    .toEqual([["inbox", "notice"], ["establish", "mark-read", "dismiss"], "establish", [["notify", "advisory", "lane"], ["notify", "advisory", "task"]]]);

  // Without the option it is no declared definition: it has the member `outcomes`; without that, its name is the one problem that
  // is found before the rows are read; and under a declared name each mark is a form that the contract does not define.
  const { outcomes: _, ...rows } = inbox;
  const refused = (value: unknown) => { const checked = validateDefinition(value, PROPOSED_BOUNDS); return checked.ok ? null : checked.problems.map((p) => [p.code, p.path]); };
  // A declared definition would also leave the required slot `source` unset: no written effect sets it.
  const marks = ["lane", "task"].flatMap((kind) => [["shape", `receives.notify-from-${kind}.effects.3`], ["required-unset", `receives.notify-from-${kind}.effects`]]);
  expect([refused(inbox), refused(rows), refused({ ...rows, name: "inbox" })]).toEqual([[["shape", "outcomes"]], [["shape", "name"]], marks]);

  // The data says where each rule stands: the mark `notice-source`, row P22, is the last effect of each `notify` handler, and no
  // written effect sets `source`. No table beside the data says which entries are code.
  expect(checked.definition.marks.map((m) => [m.place, m.path, m.code, m.row])).toEqual([
    [5, "receives.notify-from-lane.effects.3", "notice-source", "P22"], [5, "receives.notify-from-task.effects.3", "notice-source", "P22"],
  ]);
  expect(Object.values(inbox.receives).flatMap((h) => h.effects).filter((e) => "value" in e && e.value.slot === "source")).toEqual([]);
  // The table has a rule of the right kind for every mark, so a runtime with this package can run the inbox. Without the rule, or
  // with a rule of another place under that name, it cannot.
  const { rules } = platform("platform:inbox@1")!;
  expect(Object.keys(RULES)).toEqual(["platform:inbox", "platform:membership", "platform:register", "platform:directory", "platform:rules", "platform:destination"]);
  expect([runnable(checked.definition, rules), runnable(checked.definition, {}), runnable(checked.definition, { "notice-source": { place: "send", run: () => null } })]).toEqual([true, false, false]);
  expect(Object.keys(definitions)).toEqual(["platform:inbox", "platform:membership", "platform:register", "platform:directory", "platform:rules", "platform:destination"]);
});

// The plan's T43, for `platform:membership@1` (authority note, revision 24, section 12.1.3, and its table of marks, section 12.1.8).
test("the membership definition validates whole with the platform option; every mark has its rule, the three of revision 24 and the type `action-list` of revision 28 among them, so the package's rules run it, and with any one of the eleven missing they do not; an active key and an active member each reserve their settlement", () => {
  const checked = validateDefinition(JSON.parse(JSON.stringify(membership)), PROPOSED_BOUNDS, PROFILES, { platform: true });
  if (!checked.ok) throw new Error(`membership is refused: ${JSON.stringify(checked.problems)}`);
  expect([checked.definition.underived, derivable(checked.definition, null), membership.capabilities, membership.rules, membership.outcomes, membership.receives]).toEqual([[], true, [], {}, {}, {}]);
  // Section 12.1.3: three item types, the genesis `establish` with twelve acts in the order of the note's table, and two timed rules.
  expect([Object.keys(membership.items), membership.genesis, Object.keys(membership.acts), Object.keys(membership.timed)]).toEqual([
    ["roster", "member", "key"], "establish",
    ["establish", "seat", "first-key", "invite-member", "invite-key", "join", "enrol", "add-member", "set-role", "set-actions", "remove-member", "revoke-key", "rotate-recovery"],
    ["member-invitation-end", "key-invitation-end"],
  ]);
  // No entry sends more than one request (section 12.1): the `create` of an inbox in three rows, and the `compromised` notice.
  expect(Object.entries(membership.acts).flatMap(([name, act]) => act.sends.map((send) => [name, Object.keys(send)[0]]))).toEqual([["seat", "create"], ["join", "create"], ["add-member", "create"], ["revoke-key", "tell"]]);

  // The marks, by the rows of the note's table: rows 14 to 22 and 24 to 26, and the further rows g, h and i. Row 23 derives nothing
  // of an entry and has no mark.
  const marks = checked.definition.marks.map((m) => [m.place, m.path, m.code, m.row]);
  const listed = [
    [1, "acts.seat.grant", "founding-key", "P13"], [1, "acts.first-key.grant", "founding-key", "P13"],
    [1, "acts.invite-member.grant", "recovery-key", "P13"], [1, "acts.invite-key.grant", "recovery-key", "P13"],
    [1, "acts.join.grant", "by-invitation", "P13"], [2, "acts.join.also.member", "invitation", "P18"], [5, "acts.join.effects.1", "key-id", "P14"],
    [1, "acts.enrol.grant", "by-invitation", "P13"], [2, "acts.enrol.also.key", "invitation", "P18"], [5, "acts.enrol.effects.1", "key-id", "P14"],
    [1, "acts.remove-member.grant", "recovery-key", "P13"], [4, "acts.remove-member.guards.1", "last-admin-kept", "P13"],
    [1, "acts.revoke-key.grant", "recovery-key", "P13"], [4, "acts.revoke-key.guards.1", "last-admin-kept", "P13"],
    [1, "acts.rotate-recovery.grant", "recovery-key", "P13"], [5, "acts.rotate-recovery.effects.1", "former-recovery", "P24"],
  ];
  // Rows o, p and q of the note's revision 24: the role table, a member from a handle, and the form of a handle, each under its row
  // of the table of forms (P10, P26 and P27).
  const later = [
    [5, "acts.establish.effects.4", "role-table", "P10"], [5, "acts.seat.effects.4", "member-of", "P26"],
    [4, "acts.invite-member.guards.1", "handle-form", "P27"], [5, "acts.invite-member.effects.5", "member-of", "P26"],
    [4, "acts.add-member.guards.1", "handle-form", "P27"], [5, "acts.add-member.effects.6", "member-of", "P26"],
  ];
  // Row aa of the note's revision 28 (the second commit of its revision 27): the type of the five lists of the roster and of the
  // field `actions` of `set-actions` is the mark `action-list`, at place 3, under P27.
  const typed = [...Object.values(ROLE_LISTS).map((slot) => [3, `items.roster.values.${slot}.of`, "action-list", "P27"]), [3, "acts.set-actions.fields.actions", "action-list", "P27"]];
  expect([...marks].sort()).toEqual([...listed, ...later, ...typed].sort());
  // The five lists and the field hold 64 names (section 3.2, "The table, counted"). Until revision 28 each was a written list with
  // `max: 64`, and the data did not validate at a bound of 32 on a list. The number is the rule's now, and the data states no list
  // type there, so the validator's bound on a written list does not read it (`ACTIONS_MOST`, with its witness in `rules.test.ts`).
  const at32 = validateDefinition(JSON.parse(JSON.stringify(membership)), { ...PROPOSED_BOUNDS, listElements: 32 }, PROFILES, { platform: true });
  expect([at32.ok, ACTIONS_MOST]).toEqual([true, 64]);
  // Section 5.8, "`settles` on the rows of membership", as the note's revision 28 has it: `revoke-key` and `remove-member` each
  // state `settles: { of: "on", in: ["active"] }`. So an active key reserves 3 entries, the revocation and the pending request of
  // the `compromised` notice with its 2, and an active member 1. `join` and `enrol` state none: their name is bound by a mark, and
  // an invitation reserves its timed end alone (I3 deltas, entry GD4).
  expect([membership.acts["revoke-key"]!.settles, membership.acts["remove-member"]!.settles, Object.values(membership.acts).filter((act) => act.settles).length, checked.definition.pending, checked.definition.deadlines])
    .toEqual([{ of: "on", in: ["active"] }, { of: "on", in: ["active"] }, 2, { member: { active: 1 }, key: { active: 3 } }, { member: { invited: 1 }, key: { invited: 1 } }]);
  // The check that the note's section 12.1.8 leaves to I3 ("One thing that was not checked"): the validator takes a constant list as
  // the source of a list slot. The same data with the mark `role-table` replaced by five written `value` effects, each from a
  // constant, validates. It is a check of the validator only: no entry was derived from that data, and the row stays a rule until
  // the note writes it as data.
  const asData = JSON.parse(JSON.stringify(membership));
  // A constant is of no marked type, so the five slots take the written list type that they had before the mark `action-list`.
  for (const slot of Object.values(ROLE_LISTS)) asData.items.roster.values[slot].of = { type: "list", of: { type: "text", max: 64 }, max: 64 };
  asData.acts["set-actions"].fields.actions = { type: "list", of: { type: "text", max: 64 }, max: 64, required: true };
  asData.acts.establish.effects = [...asData.acts.establish.effects.filter((effect: object) => !("code" in effect)), ...Object.entries(ROLE_LISTS).map(([role, slot]) => ({ value: { slot, from: { const: FIRST_ACTIONS[role as keyof typeof ROLE_LISTS] } } }))];
  expect(validateDefinition(asData, PROPOSED_BOUNDS, PROFILES, { platform: true }).ok).toBe(true);
  // The whole-scope rule (the contract's section 6.1): a version with a mark and no rule runs nothing. The package has the eleven
  // rules of the note's table, each of the kind of its mark's place, and no other. Without any one of them the version is not runnable.
  const { rules } = platform("platform:membership@1")!;
  expect(Object.entries(rules).map(([name, rule]) => [name, rule.place])).toEqual([
    ["founding-key", "grant"], ["recovery-key", "grant"], ["by-invitation", "grant"], ["invitation", "also"], ["key-id", "effect"], ["former-recovery", "effect"],
    ["role-table", "effect"], ["member-of", "effect"], ["action-list", "type"], ["handle-form", "guard"], ["last-admin-kept", "guard"],
  ]);
  expect([runnable(checked.definition, rules), ...Object.keys(rules).map((lost) => runnable(checked.definition, { ...rules, [lost]: undefined as never }))]).toEqual([true, ...Object.keys(rules).map(() => false)]);
});

// The plan's steps 9 and 9c, as the authority note's revision 25 decides them (its "What revision 25 lets the I3 source do next"):
// "Then `platform:directory@1` lacks no rule", and the register's one rule that every founding waited on is written.
// Every definition carries its data and every rule of its marks.
test("every platform definition supplies the rules of its whole pinned data, including destination first-head and receipt", () => {
  /** The marks of one definition's data that the package's table has no rule of the right kind for, by name, once each. */
  const lacks = (named: string): string[] | null => {
    const supplied = platform(named)!;
    const checked = validateDefinition(JSON.parse(JSON.stringify(supplied.data)), PROPOSED_BOUNDS, PROFILES, { platform: true });
    if (!checked.ok) return null;
    const missing = checked.definition.marks.filter((mark) => ruleAt(supplied.rules, mark.code, mark.kind) === null).map((mark) => mark.code);
    // `runnable` is the whole-scope rule that a scope's runtime asks before it founds or creates anything under the definition.
    expect(runnable(checked.definition, supplied.rules)).toBe(missing.length === 0);
    return [...new Set(missing)];
  };
  expect([lacks("platform:register@1"), lacks("platform:directory@1")]).toEqual([[], []]);
  // Revision 28 gives the destination's two formerly missing commit rules, so none is absent.
  expect([lacks("platform:destination@1"), lacks("platform:membership@1"), lacks("platform:rules@1"), lacks("platform:inbox@1")]).toEqual([[], [], [], []]);
});

// Authority note, revision 25, section 12.1, "Where the rules scope and the destination record their membership reference" (I3 deltas
// EM21, EQ7 and EU6). The states are MADE BY HAND: one item with the value, and the incarnations that the fold would hold.
test("a rules scope and a destination record the scope ID of membership as a value, and the incarnation is that of the observations of that ID which their entries retain: none before the first, and no reference from a state that holds two", () => {
  const [id, other] = ["sc_membership", "sc_rules"];
  const holding = (type: string, values: Record<string, string>, fixed: Record<string, readonly string[]>) =>
    ({ page: (asked: string) => ({ items: asked === type ? [{ values }] : [], more: false }), incarnations: (scope: string) => fixed[scope] ?? [] }) as never;
  const { membership: ofRules } = platform("platform:rules@1")!;
  const { membership: ofDestination } = platform("platform:destination@1")!;
  expect([ofRules, ofDestination, platform("platform:membership@1")!.membership, platform("platform:inbox@1")!.membership]).toEqual([rulesMembership, destinationMembership, undefined, undefined]);
  expect([
    ofRules!(holding("rules", { membership: id }, {})), ofRules!(holding("rules", { membership: id }, { [id]: ["in_a"], [other]: ["in_z"] })), ofRules!(holding("rules", { membership: id }, { [id]: ["in_a", "in_b"] })), ofRules!(holding("rules", {}, {})),
    ofDestination!(holding("branch", { membership: id, rules: other }, { [other]: ["in_z"] })), ofDestination!(holding("branch", { membership: id, rules: other }, { [id]: ["in_a"] })),
    destinationRulesScope(holding("branch", { membership: id, rules: other }, { [other]: ["in_z"] })),
  ]).toEqual([
    { scope: id, kind: "membership", inc: null }, { scope: id, kind: "membership", inc: "in_a" }, null, null,
    { scope: id, kind: "membership", inc: null }, { scope: id, kind: "membership", inc: "in_a" },
    { scope: other, kind: "rules", inc: "in_z" },
  ]);
});

// Scope contract revision 23, section 17.2a, and authority revision 28, section 5.8. Each destination operation is counted by
// its branch or publication. Its data gives finite reservations, the bound withdraw and the complete observation rows.
test("destination data validates whole with finite reservations, a bound indexed withdraw and the five adopted judge observation rows", () => {
  const destination = platform("platform:destination@1")!;
  const checked = validateDefinition(destination.data, PROPOSED_BOUNDS, PROFILES, { platform: true, outcomeValues: outcomeValueDomains(destination.data, destination.rules) });
  if (!checked.ok) throw new Error(JSON.stringify(checked.problems));
  expect([checked.definition.observing, checked.definition.keyed, runnable(checked.definition, destination.rules)]).toEqual([true, { publication: ["operation"] }, true]);
  expect(Object.keys(checked.definition.reserving!.kinds).sort()).toEqual(["adopt-read", "first-head", "judge", "mint", "mint-read", "push", "read", "receipt", "revoke"]);
  const rules = Object.values(destination.rules).filter((rule) => rule.place === "outcome");
  expect(rules.filter((rule) => rule.rules.closure !== undefined && !Number.isFinite(rule.rules.closure))).toEqual([]);
  expect(checked.definition.reserving!.holders["publication"]?.holds).toEqual({ operations: { judge: 1, push: 1, mint: 6, revoke: 6, read: 3, receipt: 1 }, requests: 3, items: 1, decisions: { withdraw: 1 } });
  const withoutEvidence = validateDefinition(destination.data, PROPOSED_BOUNDS, PROFILES, { platform: true });
  if (!withoutEvidence.ok) throw new Error(JSON.stringify(withoutEvidence.problems));
  expect(checked.definition.reserving!.kinds["judge"]!.whole.bytes - withoutEvidence.definition.reserving!.kinds["judge"]!.whole.bytes).toBe(2 * DESTINATION_CHANGED_SET.max);
  expect(destination.data.outcomes["judge"]!.observes!.map((row) => [row.of, "max" in row ? row.max : 1])).toEqual([["rules", 1], ["key", 1], ["holders", 1], ["member", 65], ["key", 8]]);
});

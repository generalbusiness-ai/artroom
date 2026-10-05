import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type DeclaredDefinition } from "@generalbusiness/artroom-contract";
import { definitionDigest } from "@generalbusiness/artroom-bytes";
import { PROFILES, derivable, runnable, validateDefinition } from "@generalbusiness/artroom-derive";
import { ROLE_LISTS, RULES, definitions, inbox, membership, platform } from "../src/index.ts";

// The plan's T43, for the one definition that exists: `platform:inbox@1` (authority note, revision 16, section 12.1.6).
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
test("the membership definition validates whole with the platform option; every mark has its rule, the three of revision 24 among them, so the package's rules run it, and with any one of the ten missing they do not", () => {
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
  expect([...marks].sort()).toEqual([...listed, ...later].sort());
  // The five lists of the roster, and the field of `set-actions`, hold 64 (section 3.2, "The table, counted"), which is the contract's
  // bound on a list from its revision 19. At a bound of 32 the data does not validate: no scope is founded under it there.
  const at32 = validateDefinition(JSON.parse(JSON.stringify(membership)), { ...PROPOSED_BOUNDS, listElements: 32 }, PROFILES, { platform: true });
  expect(at32.ok ? null : at32.problems.map((p) => [p.code, p.path])).toEqual(Object.values(ROLE_LISTS).map((slot) => ["bound", `items.roster.values.${slot}.of.max`]));
  // The whole-scope rule (the contract's section 6.1): a version with a mark and no rule runs nothing. The package has the ten rules
  // of the note's table, each of the kind of its mark's place, and no other. Without any one of them the version is not runnable.
  const { rules } = platform("platform:membership@1")!;
  expect(Object.entries(rules).map(([name, rule]) => [name, rule.place])).toEqual([
    ["founding-key", "grant"], ["recovery-key", "grant"], ["by-invitation", "grant"], ["invitation", "also"], ["key-id", "effect"], ["former-recovery", "effect"],
    ["role-table", "effect"], ["member-of", "effect"], ["handle-form", "guard"], ["last-admin-kept", "guard"],
  ]);
  expect([runnable(checked.definition, rules), ...Object.keys(rules).map((lost) => runnable(checked.definition, { ...rules, [lost]: undefined as never }))]).toEqual([true, ...Object.keys(rules).map(() => false)]);
});

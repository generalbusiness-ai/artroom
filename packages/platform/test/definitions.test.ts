import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type DeclaredDefinition } from "@generalbusiness/artroom-contract";
import { definitionDigest } from "@generalbusiness/artroom-bytes";
import { PROFILES, derivable, runnable, validateDefinition } from "@generalbusiness/artroom-derive";
import { RULES, definitions, inbox, membership, platform } from "../src/index.ts";
import { standIns } from "./support.ts";

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

// The plan's T43, for `platform:membership@1` (authority note, revision 21, section 12.1.3, and its table of marks, section 12.1.8).
test("the membership definition validates whole with the platform option; every mark of the note's table has its rule; three marks that the table does not list have none, so the package's rules do not run it", () => {
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
  // Three places that the note's rows state, that no form can say, and that its table does not list. Each is a mark whose row is the
  // entry of the I3 deltas note, and the package has no rule for it.
  const unlisted = [
    [5, "acts.establish.effects.4", "role-table", "EM6"], [5, "acts.seat.effects.4", "member-of", "EM7"],
    [4, "acts.invite-member.guards.1", "handle-form", "EM8"], [5, "acts.invite-member.effects.5", "member-of", "EM7"],
    [4, "acts.add-member.guards.1", "handle-form", "EM8"], [5, "acts.add-member.effects.6", "member-of", "EM7"],
  ];
  expect([...marks].sort()).toEqual([...listed, ...unlisted].sort());
  const { rules } = platform("platform:membership@1")!;
  expect(checked.definition.marks.filter((mark) => !Object.hasOwn(rules, mark.code)).map((mark) => mark.code).sort()).toEqual(unlisted.map(([, , code]) => code).sort());
  // The whole-scope rule (the contract's section 6.1): a version with a mark and no rule runs nothing. With a stand-in for each of the
  // three, of test support, it can be run, and without any one of them it cannot.
  expect([runnable(checked.definition, rules), runnable(checked.definition, { ...rules, ...standIns }), ...Object.keys(standIns).map((lost) => runnable(checked.definition, { ...rules, ...standIns, [lost]: undefined as never }))])
    .toEqual([false, true, false, false, false]);
});

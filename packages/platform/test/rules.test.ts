import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Grant, SignedIntent } from "@generalbusiness/artroom-contract";
import { keyIdOfSecret, textDigest } from "@generalbusiness/artroom-bytes";
import type { ActJudgment, Item, PlatformRule, RuleGiven } from "@generalbusiness/artroom-derive";
import { d, t } from "@generalbusiness/artroom-derive/testing";
import { MEMBERSHIP, NO_MEMBER, ROLE_TABLE, actionsIn, membershipRules, standingOf } from "../src/membership.ts";
import { Roster, TASK_ACTIONS, paul, rita, sam, una, vic } from "./support.ts";

// Every scope here is a `Roster` of test support: a membership scope in memory, below a made-up office, with STAND-IN rules for the
// three marks that the authority note's table of marks does not list. The seven rules that are tested are the platform package's.

/** What a judgment answered: the result, with the reason and the refusal's name where it has them. */
const said = (j: ActJudgment) => [j.result, "reason" in j ? j.reason : null, "name" in j ? (j.name ?? null) : null];
const WRITTEN = ["write", null, null];
const ENDS = t(600);
/** Two keys that no member of the fixture set holds, made as that set makes its keys: a new device, and a new recovery key. */
const [device, spare] = [11, 12].map((seed): typeof rita => { const secret = new Uint8Array(32).fill(seed); return { ...paul, secret, key: keyIdOfSecret(secret) }; }) as [typeof rita, typeof rita];

/** An invitation of a member: an `invite-member` by that signer, for that handle, with the hash of that secret. Returns the invitation's ID. */
const invited = (m: Roster, by = rita, handle = "@una", secret = "a secret of an invitation", role = "member"): number =>
  m.did(by, "invite-member", { fields: { handle, role, inviteHash: textDigest(secret), inviteEnds: ENDS } }).seq;
const join = (m: Roster, who: typeof rita, invitation: number, secret = "a secret of an invitation") => m.act(who, "join", { fields: { invitation, secret } });
/** An invitation of a key for that member, by that signer. Returns its ID. */
const keyInvited = (m: Roster, member: number, by = rita, secret = "a secret of a key"): number =>
  m.did(by, "invite-key", { fields: { member, kind: "device", inviteHash: textDigest(secret), inviteEnds: ENDS }, expected: { member: m.item(member).revision } }).seq;
/** An enrol names the roster as its primary item, and the member of the invited key among its subjects: `expected` has a key for each, and none for the key that the mark selects. */
const enrol = (m: Roster, who: typeof rita, invitation: number, secret = "a secret of a key") =>
  m.act(who, "enrol", { on: 0, expected: { on: m.item(0).revision, member: m.item(m.item(invitation).refs["member"] as number).revision }, fields: { invitation, secret } });
const revoke = (m: Roster, by: typeof rita, key: number, as = "retired") =>
  m.act(by, "revoke-key", { on: key, expected: { on: m.item(key).revision, roster: m.item(0).revision, member: m.item(m.item(key).refs["member"] as number).revision }, fields: { as } });
const authority = (m: Roster): readonly Grant[] | null => (m.last.input.type === "act" ? m.last.input.authority : null);

// The plan's T50, membership's table: each rule of `platform:membership@1` as a plain function, from its row of the note's table of
// marks (section 12.1.8) and the cases of sections 3.1, 3.6 and 12.1.3. No scope, no port and no host: a rule is called with what a
// judge gives it, over the folded state of a roster in memory.
describe("the rules of platform:membership@1, each as a plain function (authority note, section 12.1.8)", () => {
  /** A roster with rita seated on the founding key, una invited as a member (item 4) and a key invited for rita (item 5). */
  const m = new Roster().seated();
  const [invitation, keyInvitation] = [invited(m), keyInvited(m, 2)];
  /** What a rule is given for an act of that signer: the state, the act, and what the judge resolved before the rule's place. */
  const given = (who: typeof rita, fields: Record<string, string | number> = {}, subjects: Record<string, number> = {}, grant: Grant | null = null): RuleGiven => {
    const signed: SignedIntent = m.intent(who, "an-act", { fields });
    return {
      state: m.state, input: { type: "act", signed, grant, presented: {} }, time: m.now, uses: [], own: m.own,
      resolved: { at: m.at, self: m.head.seq + 1, fields, subjects: new Map(Object.entries(subjects).map(([name, id]): [string, Item] => [name, m.item(id)])), signer: null, bounds: PROPOSED_BOUNDS },
      observed: () => null, value: () => undefined,
    };
  };
  const run = (name: string, ...args: unknown[]): unknown => (membershipRules[name] as PlatformRule & { run: (...args: unknown[]) => unknown }).run(...args);
  const PASS = { pass: true, member: null };
  const aGrant = { key: rita.key } as Grant;
  const secret = { invitation, secret: "a secret of an invitation" };

  const rows: readonly (readonly [row: string, rule: string, args: readonly unknown[], expected: unknown])[] = [
    // Rows 14 and 15: the founding key that the genesis recorded, and no other key.
    ["14, 15: the founding key passes, with no member", "founding-key", [given(rita)], PASS],
    ["14, 15: another key does not", "founding-key", [given(una)], { pass: false }],
    // Rows 16, 22, 24 and 25: the recovery key alone. A member's key is not it.
    ["16, 22, 24, 25: the recovery key passes, with no member", "recovery-key", [given(sam)], PASS],
    ["16, 22, 24, 25: the founding key is not the recovery key", "recovery-key", [given(rita)], { pass: false }],
    // Rows 19 and g: the item of the stated type whose ID the act names, when it holds the hash of the secret. One answer otherwise.
    ["19: the invited member, by its ID and the secret", "invitation", [given(una, secret), "member"], invitation],
    ["19: a wrong secret gives none", "invitation", [given(una, { invitation, secret: "another" }), "member"], null],
    ["19: an unknown ID gives none", "invitation", [given(una, { invitation: 99, secret: "a secret of an invitation" }), "member"], null],
    ["19: an ID of an item of another type gives none", "invitation", [given(una, { invitation: keyInvitation, secret: "a secret of a key" }), "member"], null],
    ["g: the invited key, by its ID and the secret", "invitation", [given(una, { invitation: keyInvitation, secret: "a secret of a key" }), "key"], keyInvitation],
    // Rows 17 and 20: checks 5 and 6 of section 3.6, in that order. Each refusal comes before the next check.
    ["17: a new key passes when the invitation is bound", "by-invitation", [given(una, secret, { "also.member": invitation })], PASS],
    ["17: the recovery key is refused first, also with the invitation bound", "by-invitation", [given(sam, secret, { "also.member": invitation })], { pass: false, name: "recovery-key" }],
    ["17: a member's key is refused next", "by-invitation", [given(rita, secret, { "also.member": invitation })], { pass: false, name: "key-in-use" }],
    ["17: with no invitation bound, one answer", "by-invitation", [given(una, secret)], { pass: false, name: "invitation-refused" }],
    ["20: for an enrol, the bound name is `key`", "by-invitation", [given(una, {}, { "also.key": keyInvitation })], PASS],
    // Rows 18 and 21: `id` is the signing key, on the key that the entry opens or on the invited key.
    ["18: on the key that a join opens", "key-id", [given(una)], [{ effect: "value", item: m.head.seq + 1, slot: "id", value: una.key }]],
    ["21: on the invited key of an enrol", "key-id", [given(una, {}, { "also.key": keyInvitation })], [{ effect: "value", item: keyInvitation, slot: "id", value: una.key }]],
    // Row 26: the list, set whole, with the former key added.
    ["26: the former recovery key joins the list", "former-recovery", [given(sam)], [{ effect: "value", item: 0, slot: "formerRecovery", value: [sam.key] }]],
    // Rows h and i: rita is the one admin, and item 3 is her one active key.
    ["h: the last admin is not removed on a grant", "last-admin-kept", [given(rita, {}, { on: 2 }, aGrant)], { holds: false, name: "last-admin" }],
    ["h: the recovery key removes the last admin: no grant was judged", "last-admin-kept", [given(sam, {}, { on: 2 })], { holds: true }],
    ["h: a member that is no admin is removed on a grant", "last-admin-kept", [given(rita, {}, { on: invitation }, aGrant)], { holds: true }],
    ["i: the last active key of the last admin is not revoked on a grant", "last-admin-kept", [given(rita, {}, { on: 3, "also.member": 2 }, aGrant)], { holds: false, name: "last-admin" }],
    ["i: the recovery key revokes it", "last-admin-kept", [given(sam, {}, { on: 3, "also.member": 2 })], { holds: true }],
  ];
  for (const [row, rule, args, expected] of rows) test(`${rule}, row ${row}`, () => expect(run(rule, ...args)).toEqual(expected));

  test("the table has exactly the seven rules that the note's table of marks names for membership, each of the kind of its place", () => {
    expect(Object.entries(membershipRules).map(([name, rule]) => [name, rule.place, "refusals" in rule ? rule.refusals : "most" in rule ? rule.most : null])).toEqual([
      ["founding-key", "grant", []], ["recovery-key", "grant", []], ["by-invitation", "grant", ["recovery-key", "key-in-use", "invitation-refused"]],
      ["invitation", "also", null], ["key-id", "effect", 1], ["former-recovery", "effect", 1], ["last-admin-kept", "guard", ["last-admin"]],
    ]);
  });
});

// The plan's T10 (the proof plan's V6; review row L1), as judgments of the real rows with the real rules, over a roster in memory.
test("a join with a valid invitation admits the key; a used one and none are each refused with its reason, and an ended one after its timed end; a recovery key that signs a join is refused before the secret is compared", () => {
  const m = new Roster().seated();
  // The founder, in two acts (section 12.1.3): each is admitted once, on the founding key and on no grant.
  expect([said(m.act(rita, "seat", { expected: { roster: 1 } })), said(m.act(una, "seat", { expected: { roster: 1 } })), m.entries[2]!.entry.input.type === "act" && m.entries[2]!.entry.input.authority])
    .toEqual([["refused", "guard-failed", null], ["refused", "unauthorized", null], []]);
  const invitation = invited(m);

  // Check 5 comes before check 6: the recovery key, and a former one, are refused with the right secret, and the invitation stays unused.
  expect([said(join(m, sam, invitation)), m.item(invitation).state]).toEqual([["refused", "unauthorized", "recovery-key"], "invited"]);
  // A key that is a member's key is refused next, also with the right secret.
  expect(said(join(m, rita, invitation))).toEqual(["refused", "unauthorized", "key-in-use"]);
  // Check 6: no invitation, an unknown ID and a wrong secret get one answer (section 3.6, cases c and d).
  expect([said(join(m, una, 99)), said(join(m, una, invitation, "a wrong secret")), said(join(m, una, 3))]).toEqual(Array(3).fill(["refused", "unauthorized", "invitation-refused"]));

  // Case a of section 12.1.3: one entry. The key is active with the signing key as its ID, the member is active, and the `create` of
  // the member's inbox is at ordinal 0. No grant judged it: the invitation is its authority. The body of the creation holds the
  // membership scope that the inbox will record and read its observations from (the contract's section 6.6).
  const before = m.entries.length;
  expect(said(join(m, una, invitation))).toEqual(WRITTEN);
  const key = m.head.seq;
  expect([m.entries.length - before, m.item(key).state, m.item(key).values["id"], m.item(key).refs["member"], m.item(invitation).state, authority(m)]).toEqual([1, "active", una.key, invitation, "active", []]);
  expect(m.last.sends.map((send) => [send.n, send.message.class === "request" && send.message.type, "definition" in send.to && send.to.definition, send.message.class === "request" && send.message.body]))
    .toEqual([[0, "create", "platform:inbox@1", { fields: { owner: { membership: m.at, member: "@una" }, membership: m.at }, membership: m.at }]]);
  // Check 7: the right secret after the invitation was used (section 3.6, case e).
  expect(said(join(m, vic, invitation))).toEqual(["refused", "guard-failed", "invitation-used"]);

  // An invitation that has reached its end time (section 3.3, "At the bound"; W9). No act passes a transition that is due (the
  // contract's section 5.2, step 6.3), so the timed end is written first and the invitation is `lapsed`. The join is then refused by
  // the guard on the invitation's state, with that guard's name: the row's guard `invitation-expired` is never the one that fails
  // (I3 deltas, entry EM16). A lost timer admits nothing either way.
  const late = invited(m, rita, "@vic", "another secret");
  m.now = ENDS;
  expect([said(join(m, vic, late, "another secret")), m.drain().map((done) => done.result), m.item(late).state, said(join(m, vic, late, "another secret"))])
    .toEqual([["due", null, null], ["write"], "lapsed", ["refused", "guard-failed", "invitation-used"]]);
});

// The plan's T13 (the proof plan's V9), with the cases of section 3.1 and of section 12.1.3.
test("a member is recovered through an admin and then through the offline key; a removed member is not restored; the last admin's last key is revoked only by the recovery key", () => {
  const m = new Roster().seated();
  const member = invited(m);
  join(m, una, member);
  const unasKey = m.head.seq;

  // Through an admin: rita holds `membership.invite`, so the entry records her grant, and the rule at `grant` is not run.
  const first = keyInvited(m, member);
  expect(authority(m)?.map((grant) => [grant.key, grant.subject.member, grant.fresh.use])).toEqual([[rita.key, "@rita", "fresh"]]);
  expect([said(enrol(m, vic, first)), m.item(first).state, m.item(first).values["id"]]).toEqual([WRITTEN, "active", vic.key]);
  // Through the offline key, when no admin acts: the recovery key holds no grant, and the entry records none.
  expect(said(m.act(una, "invite-key", { fields: { member, kind: "device", inviteHash: textDigest("x"), inviteEnds: ENDS }, expected: { member: m.item(member).revision } }))).toEqual(["refused", "unauthorized", null]);
  const second = keyInvited(m, member, sam, "an offline secret");
  expect(authority(m)).toEqual([]);
  expect([said(enrol(m, paul, second, "an offline secret")), m.item(second).values["id"]]).toEqual([WRITTEN, paul.key]);
  // The recovery key does no work: it signs no enrol (section 3.1).
  const third = keyInvited(m, member, sam, "a third secret");
  expect(said(enrol(m, sam, third, "a third secret"))).toEqual(["refused", "unauthorized", "recovery-key"]);

  // The last admin and the last active key of the last admin (case c of section 12.1.3): not on a grant, and by the recovery key.
  expect([said(revoke(m, rita, 3)), said(m.act(rita, "remove-member", { on: 2, expected: { on: m.item(2).revision } }))]).toEqual(Array(2).fill(["refused", "guard-failed", "last-admin"]));
  // A key that is not the last admin's is revoked on a grant. Case d: revoked as compromised, one `tell` to the directory, at ordinal 0.
  expect([said(revoke(m, rita, unasKey, "compromised")), m.item(unasKey).state, m.item(unasKey).refs["revokedBy"], m.last.sends.map((send) => [send.n, send.to, send.message.class === "request" && (send.message.body as { message: string }).message])])
    .toEqual([WRITTEN, "compromised", m.head.seq, [[0, m.office.at, "compromised"]]]);
  expect([said(revoke(m, sam, 3)), m.item(3).state, authority(m)]).toEqual([WRITTEN, "retired", []]);

  // A removed member is not restored: no key is invited for it, and an invitation that was open admits no key.
  expect(said(m.act(sam, "remove-member", { on: member, expected: { on: m.item(member).revision } }))).toEqual(WRITTEN);
  expect(said(m.act(sam, "invite-key", { fields: { member, kind: "device", inviteHash: textDigest("y"), inviteEnds: ENDS }, expected: { member: m.item(member).revision } }))).toEqual(["refused", "guard-failed", "member-removed"]);
  expect(said(enrol(m, device, third, "a third secret"))).toEqual(["refused", "guard-failed", "member-removed"]);
  // And its handle is never reused.
  expect(said(m.act(sam, "invite-member", { fields: { handle: "@una", role: "member", inviteHash: textDigest("z"), inviteEnds: ENDS } }))).toEqual(["refused", "guard-failed", "handle-in-use"]);

  // The recovery key is replaced by a rotation, and the former one is kept: neither ever signs a join, and a member's key is no recovery key.
  expect(said(m.act(sam, "rotate-recovery", { on: 0, expected: { on: m.item(0).revision }, fields: { key: vic.key } }))).toEqual(["refused", "guard-failed", "key-in-use"]);
  expect([said(m.act(sam, "rotate-recovery", { on: 0, expected: { on: m.item(0).revision }, fields: { key: spare.key } })), m.item(0).values["recoveryKey"], m.item(0).values["formerRecovery"]]).toEqual([WRITTEN, spare.key, [sam.key]]);
  const fourth = invited(m, spare, "@quinn", "a fourth secret");
  expect([said(join(m, sam, fourth, "a fourth secret")), said(join(m, spare, fourth, "a fourth secret")), said(m.act(sam, "invite-member", { fields: { handle: "@x", role: "member", inviteHash: d("1"), inviteEnds: ENDS } }))])
    .toEqual([["refused", "unauthorized", "recovery-key"], ["refused", "unauthorized", "recovery-key"], ["refused", "unauthorized", null]]);
});

// Authority note, sections 3.2 and 3.3; section 12.1.3, "Two things that are answers and no entries"; the contract's section 16.1.
test("membership answers an observation from its head: the key's state, its member's, the role's actions at that head, and the repository as `within`; a removed member answers so for every key; a provisional scope answers nothing", () => {
  const m = new Roster().seated();
  const of = m.at;
  const common = { of, head: m.head, definition: MEMBERSHIP, within: { membership: of }, controller: null, controllerActive: null, notAfter: null };
  // The first table: an admin's list is the table's row for an admin, less the four actions on one task, by the STAND-IN rule.
  const admin = actionsIn("admin").filter((action) => !TASK_ACTIONS.includes(action));
  expect([actionsIn("admin").length, ROLE_TABLE.flat(2).length > 0, admin.length]).toEqual([34, true, 30]);
  expect(standingOf(m.state, { of, key: rita.key })).toEqual({ ...common, key: rita.key, keyState: "active", member: "@rita", memberState: "active", role: "admin", actions: admin });
  // A key that no item holds: `unknown`, with no member and no action. An invited member is no member yet.
  const member = invited(m);
  expect(standingOf(m.state, { of, key: una.key })).toEqual({ ...common, head: m.head, key: una.key, keyState: "unknown", member: NO_MEMBER, memberState: "active", role: "", actions: [] });
  expect(standingOf(m.state, { of, member: "@una" })).toMatchObject({ subject: "member", memberState: "unknown", role: null, activeKey: null });
  join(m, una, member);
  expect(standingOf(m.state, { of, key: una.key })).toMatchObject({ head: m.head, keyState: "active", member: "@una", memberState: "active", role: "member", actions: actionsIn("member") });
  expect(standingOf(m.state, { of, member: "@una" })).toEqual({ of, head: m.head, definition: MEMBERSHIP, subject: "member", member: "@una", memberState: "active", role: "member", activeKey: true, controller: null, controllerActive: null });

  // The role table is a value of the scope at one head: an admin's act changes a list, and the next answer has it.
  m.did(rita, "set-actions", { on: 0, expected: { on: m.item(0).revision }, fields: { role: "member", actions: ["inbox.own"] } });
  expect(standingOf(m.state, { of, key: una.key })).toMatchObject({ actions: ["inbox.own"] });
  // An agent's controller is active while that member is active and has an active key.
  m.did(rita, "add-member", { fields: { handle: "@bot", kind: "agent", controller: { membership: of, member: "@una" } } });
  expect(standingOf(m.state, { of, member: "@bot" })).toMatchObject({ role: "agent", activeKey: false, controller: "@una", controllerActive: true });
  expect([said(m.act(rita, "add-member", { fields: { handle: "@bot2", kind: "agent" } })), said(m.act(rita, "add-member", { fields: { handle: "@Bad", kind: "checker" } }))])
    .toEqual([["refused", "guard-failed", "no-controller"], ["refused", "bad-field", "handle-form"]]);

  // Row 23: after a removal an observation of any key of that member answers that the member is removed. The key item does not change.
  const key = m.item(member + 1);
  m.did(rita, "remove-member", { on: member, expected: { on: m.item(member).revision } });
  expect([standingOf(m.state, { of, key: una.key }), m.item(key.id).state]).toMatchObject([{ keyState: "active", memberState: "removed" }, "active"]);
  expect(standingOf(m.state, { of, member: "@bot" })).toMatchObject({ controllerActive: false });

  // Another scope or incarnation than this one, and a question for the rules: no answer. Case e: a provisional membership answers none.
  expect([standingOf(m.state, { of: m.office.at, key: rita.key }), standingOf(m.state, { of: { ...of, inc: m.office.at.inc }, key: rita.key }), standingOf(m.state, { of, asked: "rules" })]).toEqual([null, null, null]);
  const provisional = new Roster();
  expect([standingOf(provisional.replay(1), { of: provisional.at, key: rita.key }), provisional.replay(1).scope()?.status]).toEqual([null, "provisional"]);
});

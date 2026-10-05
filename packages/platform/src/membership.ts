/**
 * `platform:membership@1`, as data, with its rules and its answer to an
 * observation (authority note, revision 24, sections 3.1 to 3.3, 3.6 and
 * 12.1.3; its table of marks, section 12.1.8, rows 14 to 26, g to i and o
 * to q). One
 * membership scope for a repository. It holds members, keys, the recovery
 * key and the role table. Every other scope of the repository observes it.
 *
 * One member of the data is one row of the note's tables. A cell of the
 * note that begins "Code" is a mark in this data, at the place where its
 * rule is run (the scope contract, section 6.1), and the rule is in
 * `membershipRules`, below. The table of marks gives membership ten rules:
 *
 * | Rule | Place | Rows of the table | At |
 * |---|---|---|---|
 * | `founding-key` | 1, `grant` | 14, 15 | `seat`, `first-key` |
 * | `recovery-key` | 1, `grant` | 16, 22, 24, 25 | `invite-member`, `invite-key`, `remove-member`, `revoke-key`, `rotate-recovery` |
 * | `by-invitation` | 1, `grant` | 17, 20 | `join`, `enrol` |
 * | `invitation` | 2, `also` | 19, g | `join`, the name `member`; `enrol`, the name `key` |
 * | `key-id` | 5, effect | 18, 21 | `join`, `enrol` |
 * | `former-recovery` | 5, effect | 26 | `rotate-recovery` |
 * | `last-admin-kept` | 4, guard | h, i | `remove-member`, `revoke-key` |
 *
 * Row 23 has no mark: what an observation answers after a removal is the
 * rule of the answer, `standingOf`, below.
 *
 * Three rules are new in the note's revision 24 (rows o, p and q; the I3
 * deltas EM6 to EM8). With them every mark of this data has its rule, so
 * the package's rules run `platform:membership@1`.
 *
 * | Rule | Place | Rows of the table | At |
 * |---|---|---|---|
 * | `role-table` | 5, effect | o (P10) | `establish` |
 * | `member-of` | 5, effect | p (P26) | `seat`, `invite-member`, `add-member` |
 * | `handle-form` | 4, guard | q (P27) | `invite-member`, `add-member` |
 *
 * The five role lists hold 64 names, as the note's revision 24 has them,
 * and an admin's first list has 34. That needs the bound on a list of the
 * scope contract's revision 19 (its section 6.1, 64).
 *
 * The note's `max`, text lengths and ranges are examples that the proof
 * plan owns. They are written as the note has them.
 */

import type { KeyId, MemberId, MemberObservation, Observation, ObservationRequest, PlatformData, PlatformDefinition, ScopeRef } from "@generalbusiness/artroom-contract";
import { textDigest } from "@generalbusiness/artroom-bytes";
import type { Item, PlatformRule, RuleGiven, Rules, StateView } from "@generalbusiness/artroom-derive";

/** The name and version that this data and these rules are. An observation states it (section 3.3). */
export const MEMBERSHIP = "platform:membership@1" satisfies PlatformDefinition;

const KEY = { type: "text", max: 64 } as const;
const HANDLE = { type: "text", max: 256 } as const;
/** A list of actions: each of the five lists of the roster, and the field `actions` of `set-actions` (section 3.2, "The table, counted": 64 from revision 24). */
const ACTIONS = { type: "list", of: { type: "text", max: 64 }, max: 64 } as const;
const ROLE = { type: "enum", of: ["admin", "maintainer", "member", "agent", "checker"] } as const;
const INVITATION = { inviteHash: { fixed: true, required: false, of: { type: "digest" } }, inviteEnds: { fixed: true, required: false, of: { type: "time" } } } as const;
const ROSTER = { roster: { item: "roster", one: true } } as const;
/** The states in which a member item holds its handle against reuse (section 3.1): a removed handle is never reused. */
const HANDLE_HELD = ["invited", "active", "removed"] as const;
/** The states in which a key item holds the ID of a key that is, or was, a member's key. An invited key and a lapsed one hold none. */
const KEY_ENROLLED = ["active", "retired", "compromised"] as const;

/** The five roles, and the value slot of the roster that holds the actions of each (section 12.1.3, the item `roster`). */
export const ROLE_LISTS = { admin: "adminActions", maintainer: "maintainerActions", member: "memberActions", agent: "agentActions", checker: "checkerActions" } as const;
export type Role = keyof typeof ROLE_LISTS;

/**
 * The role table of the authority note's section 3.2, "a proposed first
 * table", row for row: the actions of each row, and the roles that hold
 * them. A name that ends `.*` in the note is written out, as that section
 * says: `membership.invite` and `membership.manage`, `rules.publish` and
 * `rules.activate`. A cell with a condition on one task lists the action:
 * the condition is a guard of the acting scope's own row (section 3.3).
 */
export const ROLE_TABLE: readonly (readonly [actions: readonly string[], roles: readonly Role[]])[] = [
  [["issue.open", "issue.comment", "issue.edit-own", "issue.close-own", "issue.revise", "issue.judge"], ["admin", "maintainer", "member", "agent"]],
  [["issue.request", "issue.promise", "issue.work"], ["admin", "maintainer", "member", "agent"]],
  [["issue.plan", "issue.triage", "issue.edit-any"], ["admin", "maintainer"]],
  [["change.open", "change.propose", "change.comment", "change.edit-own"], ["admin", "maintainer", "member", "agent"]],
  [["change.request", "change.promise", "change.work"], ["admin", "maintainer", "member", "agent"]],
  [["change.review"], ["admin", "maintainer", "member"]],
  [["change.edit-any", "change.dismiss", "change.merge"], ["admin", "maintainer"]],
  [["change.check"], ["checker"]],
  [["work.export", "task.control", "task.read-private"], ["admin", "member"]],
  [["membership.invite", "membership.manage", "rules.publish", "rules.activate"], ["admin"]],
  [["destination.adopt", "ledger.retry"], ["admin"]],
  [["task.operate"], ["admin", "maintainer", "member", "agent"]],
  [["inbox.own"], ["admin", "maintainer", "member", "agent", "checker"]],
];

/** The actions that the table of section 3.2 gives one role, in the order of its rows. */
export const actionsIn = (role: Role): string[] => ROLE_TABLE.flatMap(([actions, roles]) => (roles.includes(role) ? actions : []));

const ISSUE_WORK = ["issue.open", "issue.comment", "issue.edit-own", "issue.close-own", "issue.revise", "issue.judge", "issue.request", "issue.promise", "issue.work"] as const;
const ISSUE_PLAN = ["issue.plan", "issue.triage", "issue.edit-any"] as const;
const CHANGE_WORK = ["change.open", "change.propose", "change.comment", "change.edit-own", "change.request", "change.promise", "change.work"] as const;
const CHANGE_MERGE = ["change.edit-any", "change.dismiss", "change.merge"] as const;

/**
 * The first list of each role: the authority note's section 3.2, "The
 * table, counted", row for row, with the names in the order of that table.
 * An admin has 34 actions, a maintainer 25, a member 22, an agent 18 and a
 * checker 2. It is a constant of version 1, and part of the rule
 * `role-table` (section 12.1.8, row o). `ROLE_TABLE`, above, is the table
 * that the note counts them from, and a test holds the two together.
 */
export const FIRST_ACTIONS: { readonly [role in Role]: readonly string[] } = {
  admin: [
    ...ISSUE_WORK, ...ISSUE_PLAN, ...CHANGE_WORK, "change.review", ...CHANGE_MERGE, "work.export", "task.control", "task.read-private",
    "membership.invite", "membership.manage", "rules.publish", "rules.activate", "destination.adopt", "ledger.retry", "task.operate", "inbox.own",
  ],
  maintainer: [...ISSUE_WORK, ...ISSUE_PLAN, ...CHANGE_WORK, "change.review", ...CHANGE_MERGE, "task.operate", "inbox.own"],
  member: [...ISSUE_WORK, ...CHANGE_WORK, "change.review", "work.export", "task.control", "task.read-private", "task.operate", "inbox.own"],
  agent: [...ISSUE_WORK, ...CHANGE_WORK, "task.operate", "inbox.own"],
  checker: ["change.check", "inbox.own"],
};

/**
 * The form of a handle (section 3.1; section 12.1.8, rows q and r): `@`,
 * and then at least one character, each a lowercase ASCII letter, a digit
 * or a hyphen, with no hyphen first or last. The length is the field's own
 * type, and is not judged here.
 */
export const isHandle = (value: unknown): value is MemberId => typeof value === "string" && /^@[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value);

/**
 * The rule `handle-form` on one field (section 12.1.8, rows q and r; the
 * contract's row P27): a guard at place 4. It holds when the field's text
 * is a handle. Otherwise it refuses `bad-field`, named `bad-handle`. The
 * register's version has its own rule of this name, with the same check,
 * on its field `founderHandle`.
 */
export const handleForm = (field: string): PlatformRule => ({
  place: "guard", refusals: ["bad-handle"],
  run: ({ resolved }) => (isHandle(resolved.fields[field]) ? { holds: true } : { holds: false, name: "bad-handle", code: "bad-field" }),
});

/**
 * The `create` of a member's inbox (section 12.1, "Messages between scopes": the fields `owner` and `membership`). `of`: the member
 * item, when it is not the item that the entry opens. The note's rows state the send and no clause, so its result is recorded and
 * changes nothing. No entry sets the member's reference slot `inbox` (I3 deltas, entry EM9).
 */
const inboxOf = (of?: "also.member") => ({
  create: { kind: "inbox", definition: "platform:inbox@1", fields: { owner: { slot: "member", ...(of ? { of } : {}) }, membership: { scope: true } }, result: {} },
} as const);

/** The handle of a new member is unused (section 12.1.3, the row `invite-member`). */
const HANDLE_UNUSED = { none: { type: "member", states: HANDLE_HELD, where: [{ equals: { a: { slot: "handle" }, b: { field: "handle" } } }] }, reason: "handle-in-use" } as const;
/**
 * Check 7 of section 3.6, on the invitation that a mark of `also` selected:
 * it is unused, or `invitation-used`; and it has not ended, or
 * `invitation-expired`. The timed end moves an ended invitation to `lapsed`
 * before any act at or after its end time is judged, and it "changes no
 * answer" (section 12.1.3). So a `lapsed` invitation is one that has ended,
 * and is answered `invitation-expired` (the note's revision 24, section
 * 13.14, entry EM16). The first guard passes the two states of an
 * invitation that nobody used. The second is the row's guard on the end
 * time. The third names a `lapsed` one, whatever the clock reads. It is
 * also the guard that lists no final state, which the `state` effect on the
 * invitation needs.
 */
const invitationOpen = (of: "also.member" | "also.key") => [
  { state: ["invited", "lapsed"], of, reason: "invitation-used" },
  { before: { slot: "inviteEnds" }, of, reason: "invitation-expired" },
  { state: ["invited"], of, reason: "invitation-expired" },
] as const;

export const membership: PlatformData = {
  format: "artroom-definition-1",
  name: "platform:membership",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "establish",
  items: {
    // Section 12.1.3, the first row of the item table.
    roster: {
      many: false, max: 1, initial: "open",
      states: { open: { final: false } },
      parties: {},
      refs: { directory: { fixed: true, required: true, to: { type: "scope", kind: "directory" } } },
      values: {
        foundingKey: { fixed: true, required: true, of: KEY },
        foundingHandle: { fixed: true, required: true, of: HANDLE },
        recoveryKey: { fixed: false, required: true, of: KEY },
        formerRecovery: { fixed: false, required: false, of: { type: "list", of: KEY, max: 32 } },
        adminActions: { fixed: false, required: true, of: ACTIONS },
        maintainerActions: { fixed: false, required: true, of: ACTIONS },
        memberActions: { fixed: false, required: true, of: ACTIONS },
        agentActions: { fixed: false, required: true, of: ACTIONS },
        checkerActions: { fixed: false, required: true, of: ACTIONS },
      },
    },
    // The second row. An invitation of a member is the `invited` state of this item.
    member: {
      many: true, max: 10000, initial: "invited",
      states: { invited: { final: false }, active: { final: false }, removed: { final: true }, lapsed: { final: true } },
      parties: {
        member: { fixed: true, required: true, list: false, author: false },
        controller: { fixed: true, required: false, list: false, author: false },
      },
      refs: { inbox: { fixed: false, required: false, to: { type: "scope", kind: "inbox" } } },
      values: {
        handle: { fixed: true, required: true, of: HANDLE },
        kind: { fixed: true, required: true, of: { type: "enum", of: ["person", "agent", "checker"] } },
        role: { fixed: false, required: true, of: ROLE },
        ...INVITATION,
      },
    },
    // The third row. An invitation of a key is the `invited` state of this item.
    key: {
      many: true, max: 10000, initial: "invited",
      states: { invited: { final: false }, active: { final: false }, retired: { final: true }, compromised: { final: true }, lapsed: { final: true } },
      parties: {},
      refs: {
        member: { fixed: true, required: true, to: { type: "item", of: "member" } },
        revokedBy: { fixed: false, required: false, to: { type: "fact", kind: ["revoke-key"], under: "platform:membership" } },
      },
      values: {
        id: { fixed: false, required: false, of: KEY },
        label: { fixed: false, required: false, of: { type: "text", max: 128 } },
        kind: { fixed: true, required: true, of: { type: "enum", of: ["device", "agent", "checker"] } },
        ...INVITATION,
      },
    },
  },
  acts: {
    // `establish`: genesis, by the directory's `create` (fields `founder`, `founderHandle`, `recoveryKey` and `directory`, section
    // 12.1). It opens `roster`. The note states no grant for it: a genesis is judged by no signer, so nothing reads this one.
    establish: {
      step: "open", on: "roster", grant: "membership.establish",
      also: {},
      fields: {
        founder: { ...KEY, required: true },
        founderHandle: { ...HANDLE, required: true },
        recoveryKey: { ...KEY, required: true },
        directory: { type: "scope", kind: "directory", required: true },
      },
      guards: [],
      effects: [
        { value: { slot: "foundingKey", from: { field: "founder" } } },
        { value: { slot: "foundingHandle", from: { field: "founderHandle" } } },
        { value: { slot: "recoveryKey", from: { field: "recoveryKey" } } },
        { ref: { slot: "directory", from: { field: "directory" } } },
        // "The role table of section 3.2 as its five lists": the rule `role-table` sets them (row o).
        { code: "role-table", row: "P10" },
      ],
      sends: [],
      attention: [],
    },
    // `seat`: an act, signed by the founding key (Code P13 and P14). It opens the founder's member item, `active`, and creates
    // that member's inbox.
    seat: {
      step: "open", on: "member", grant: { code: "founding-key", row: "P13" },
      also: ROSTER,
      fields: {},
      guards: [{ none: { type: "member", states: HANDLE_HELD } }],
      effects: [
        { state: "active" },
        { value: { slot: "handle", from: { slot: "foundingHandle", of: "also.roster" } } },
        { value: { slot: "kind", from: { const: "person" } } },
        { value: { slot: "role", from: { const: "admin" } } },
        { code: "member-of", row: "P26" },
      ],
      sends: [inboxOf()],
      attention: [],
    },
    // `first-key`: an act, signed by the founding key (Code P13 and P14). It opens the founding key as the first key of the seated
    // member. The intent names that member, and the two guards hold it to the member that `seat` opened: `active`, with the founding
    // handle. The note's revision 24 confirms this selection as built (its section 13.14, entry EM10).
    "first-key": {
      step: "open", on: "key", grant: { code: "founding-key", row: "P13" },
      also: { ...ROSTER, member: { item: "member", by: "member" } },
      fields: { member: { type: "item", of: "member", required: true } },
      guards: [
        { none: { type: "key", states: ["invited", "active", "retired", "compromised"] } },
        { state: ["active"], of: "also.member" },
        { equals: { a: { slot: "handle", of: "also.member" }, b: { slot: "foundingHandle", of: "also.roster" } } },
      ],
      effects: [
        { state: "active" },
        { value: { slot: "id", from: { slot: "foundingKey", of: "also.roster" } } },
        { value: { slot: "kind", from: { const: "device" } } },
        { ref: { slot: "member", from: { item: "also.member" } } },
      ],
      sends: [],
      attention: [],
    },
    // `invite-member`: an act. Grant `membership.invite`, or the recovery key (Code P13). It opens a member, `invited`.
    "invite-member": {
      step: "open", on: "member", grant: { code: "recovery-key", row: "P13", grant: "membership.invite" },
      also: {},
      fields: {
        handle: { ...HANDLE, required: true },
        role: { ...ROLE, required: true },
        inviteHash: { type: "digest", required: true },
        inviteEnds: { type: "time", required: true },
      },
      guards: [HANDLE_UNUSED, { code: "handle-form", row: "P27" }],
      effects: [
        { value: { slot: "handle", from: { field: "handle" } } },
        { value: { slot: "kind", from: { const: "person" } } },
        { value: { slot: "role", from: { field: "role" } } },
        { value: { slot: "inviteHash", from: { field: "inviteHash" } } },
        { value: { slot: "inviteEnds", from: { field: "inviteEnds" } } },
        { code: "member-of", row: "P26" },
      ],
      sends: [],
      attention: [],
    },
    // `invite-key`: "The same." It opens a key, `invited`, for an active member.
    "invite-key": {
      step: "open", on: "key", grant: { code: "recovery-key", row: "P13", grant: "membership.invite" },
      also: { member: { item: "member", by: "member" } },
      fields: {
        member: { type: "item", of: "member", required: true },
        kind: { type: "enum", of: ["device", "agent", "checker"], required: true },
        inviteHash: { type: "digest", required: true },
        inviteEnds: { type: "time", required: true },
      },
      guards: [{ state: ["active"], of: "also.member", reason: "member-removed" }],
      effects: [
        { ref: { slot: "member", from: { item: "also.member" } } },
        { value: { slot: "kind", from: { field: "kind" } } },
        { value: { slot: "inviteHash", from: { field: "inviteHash" } } },
        { value: { slot: "inviteEnds", from: { field: "inviteEnds" } } },
      ],
      sends: [],
      attention: [],
    },
    // `join`: an act, signed by the new key (Code P13). Its authority is the invitation. The mark of `also` selects the invited
    // member by the invitation's ID and the hash of the secret, and the act has no key for it in `expected`. The rule at `grant`
    // makes checks 5 and 6 of section 3.6, and the written guards then make check 7.
    join: {
      step: "open", on: "key", grant: { code: "by-invitation", row: "P13" },
      also: { member: { code: "invitation", row: "P18", item: "member" } },
      fields: { invitation: { type: "int", min: 0, max: 1000000000, required: true }, secret: { type: "text", max: 256, required: true } },
      guards: [...invitationOpen("also.member")],
      effects: [
        { state: "active" },
        // `id` is the signing key (Code P14).
        { code: "key-id", row: "P14" },
        { value: { slot: "kind", from: { const: "device" } } },
        { ref: { slot: "member", from: { item: "also.member" } } },
        { state: "active", of: "also.member" },
      ],
      sends: [inboxOf("also.member")],
      attention: [],
    },
    // `enrol`: an act, signed by the new key, on an `invited` key (Code P13). The mark of `also` selects the invited key, as
    // `also.key`, and not as `on`. An act that is no comment has a primary item, so the primary item is the roster (I3 deltas,
    // entry EM11).
    enrol: {
      step: "transition", on: "roster", grant: { code: "by-invitation", row: "P13" },
      also: { key: { code: "invitation", row: "P18", item: "key" }, member: { item: "member", via: { slot: "member", of: "also.key" } } },
      fields: { invitation: { type: "int", min: 0, max: 1000000000, required: true }, secret: { type: "text", max: 256, required: true } },
      guards: [...invitationOpen("also.key"), { state: ["active"], of: "also.member", reason: "member-removed" }],
      effects: [
        { state: "active", of: "also.key" },
        // `id` is the signing key (Code P14).
        { code: "key-id", row: "P14" },
      ],
      sends: [],
      attention: [],
    },
    // `add-member`: an act. Grant `membership.manage`. For an agent and for a checker, which do not join as a person does.
    "add-member": {
      step: "open", on: "member", grant: "membership.manage",
      also: {},
      fields: {
        handle: { ...HANDLE, required: true },
        kind: { type: "enum", of: ["agent", "checker"], required: true },
        controller: { type: "member", required: false },
      },
      guards: [
        HANDLE_UNUSED,
        { code: "handle-form", row: "P27" },
        // For an agent, a controller is named and is an active person. A checker names none.
        {
          anyOf: [
            [{ equals: { a: { field: "kind" }, b: { const: "checker" } } }, { equals: { a: { field: "controller" }, b: { none: true } } }],
            [
              { equals: { a: { field: "kind" }, b: { const: "agent" } } },
              { some: { type: "member", states: ["active"], where: [{ equals: { a: { slot: "member" }, b: { field: "controller" } } }, { equals: { a: { slot: "kind" }, b: { const: "person" } } }] } },
            ],
          ],
          reason: "no-controller",
        },
      ],
      effects: [
        { state: "active" },
        { value: { slot: "handle", from: { field: "handle" } } },
        { value: { slot: "kind", from: { field: "kind" } } },
        // The role of that name.
        { value: { slot: "role", from: { const: "agent" } }, if: [{ equals: { a: { field: "kind" }, b: { const: "agent" } } }] },
        { value: { slot: "role", from: { const: "checker" } }, if: [{ equals: { a: { field: "kind" }, b: { const: "checker" } } }] },
        { party: { slot: "controller", from: { field: "controller" } } },
        { code: "member-of", row: "P26" },
      ],
      sends: [inboxOf()],
      attention: [],
    },
    // `set-role`: an act. Grant `membership.manage`. The member is `active` and a person, and the last admin keeps its role.
    "set-role": {
      step: "transition", on: "member", grant: "membership.manage",
      also: {},
      fields: { role: { type: "enum", of: ["admin", "maintainer", "member"], required: true } },
      guards: [
        { state: ["active"] },
        { equals: { a: { slot: "kind" }, b: { const: "person" } } },
        {
          anyOf: [
            [{ differs: { a: { slot: "role" }, b: { const: "admin" } } }],
            [{ count: { type: "member", states: ["active"], where: [{ equals: { a: { slot: "role" }, b: { const: "admin" } } }], min: 2 } }],
          ],
          reason: "last-admin",
        },
      ],
      effects: [{ value: { slot: "role", from: { field: "role" } } }],
      sends: [],
      attention: [],
    },
    // `set-actions`: an act. Grant `membership.manage`. It sets one of the five lists whole, from the field `actions`.
    "set-actions": {
      step: "transition", on: "roster", grant: "membership.manage",
      also: {},
      fields: { role: { ...ROLE, required: true }, actions: { ...ACTIONS, required: true } },
      guards: [],
      effects: Object.entries(ROLE_LISTS).map(([role, slot]) => ({ value: { slot, from: { field: "actions" } }, if: [{ equals: { a: { field: "role" }, b: { const: role } } }] })),
      sends: [],
      attention: [],
    },
    // `remove-member`: an act. Grant `membership.manage`, or the recovery key (Code P13). The last admin is not removed, except by
    // the recovery key: a written guard cannot read which authority passed check 9, so that guard is a mark (row h). From this
    // entry on, an observation of any key of that member answers that the member is removed (row 23). The key items do not change.
    "remove-member": {
      step: "transition", on: "member", grant: { code: "recovery-key", row: "P13", grant: "membership.manage" },
      also: {},
      fields: {},
      // The note's row states no guard on the member's state. A `state` effect needs one that lists no final state, and the
      // narrowest is the state of a member: an invitation ends by its own end time (I3 deltas, entry EM15).
      guards: [{ state: ["active"] }, { code: "last-admin-kept", row: "P13" }],
      effects: [{ state: "removed" }],
      sends: [],
      attention: [],
    },
    // `revoke-key`: an act. Grant `membership.manage`, or the recovery key (Code P13). The last active key of the last admin is not
    // revoked, except by the recovery key (row i). A key revoked as compromised is told to the directory.
    "revoke-key": {
      step: "transition", on: "key", grant: { code: "recovery-key", row: "P13", grant: "membership.manage" },
      also: { ...ROSTER, member: { item: "member", via: { slot: "member", of: "on" } } },
      fields: { as: { type: "enum", of: ["retired", "compromised"], required: true } },
      // As for `remove-member`: only an active key is revoked (entry EM15).
      guards: [{ state: ["active"] }, { code: "last-admin-kept", row: "P13" }],
      effects: [
        { state: "retired", if: [{ equals: { a: { field: "as" }, b: { const: "retired" } } }] },
        { state: "compromised", if: [{ equals: { a: { field: "as" }, b: { const: "compromised" } } }] },
        { ref: { slot: "revokedBy", from: "self" } },
      ],
      sends: [{
        tell: {
          to: { slot: "directory", of: "also.roster" }, message: "compromised", if: [{ equals: { a: { field: "as" }, b: { const: "compromised" } } }],
          fields: { key: { slot: "id" }, member: { slot: "member", of: "also.member" }, entry: "self" }, result: {},
        },
      }],
      attention: [],
    },
    // `rotate-recovery`: an act, signed by the recovery key (Code P13 and P14). The new key is not, and never was, a member's key.
    "rotate-recovery": {
      step: "transition", on: "roster", grant: { code: "recovery-key", row: "P13" },
      also: {},
      fields: { key: { ...KEY, required: true } },
      guards: [{ none: { type: "key", states: KEY_ENROLLED, where: [{ equals: { a: { slot: "id" }, b: { field: "key" } } }] }, reason: "key-in-use" }],
      effects: [
        { value: { slot: "recoveryKey", from: { field: "key" } } },
        // The former key is added to `formerRecovery` (Code P24).
        { code: "former-recovery", row: "P24" },
      ],
      sends: [],
      attention: [],
    },
  },
  receives: {},
  timed: {
    // A timed end only moves an ended invitation out of the live items. The comparison in the join's commit decides (section 3.12, W9).
    "member-invitation-end": { on: "member", states: ["invited"], deadline: "inviteEnds", effects: [{ state: "lapsed" }], attention: [] },
    "key-invitation-end": { on: "key", states: ["invited"], deadline: "inviteEnds", effects: [{ state: "lapsed" }], attention: [] },
  },
  rules: {},
  // Membership opens no operation.
  outcomes: {},
};

// ---------------------------------------------------------------- reading membership's state

const PAGE = 100;

/** Every item of one type in those states, lowest ID first. No index is by a value, so a search for one reads each page (I3 deltas, entry EM12). */
function* itemsOf(state: Pick<StateView, "page">, type: string, states: readonly string[]): Generator<Item> {
  for (let after: number | null = null; ;) {
    const page = state.page(type, states, after, PAGE);
    yield* page.items;
    const last = page.items.at(-1);
    if (!page.more || !last) return;
    after = last.id;
  }
}

const rosterOf = (state: Pick<StateView, "page">): Item | null => state.page("roster", ["open"], null, 1).items[0] ?? null;
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.filter((element): element is string => typeof element === "string") : []);
/** The key item that holds that key as the ID of a key that is, or was, a member's key. */
const keyItem = (state: Pick<StateView, "page">, key: string): Item | null => {
  for (const item of itemsOf(state, "key", KEY_ENROLLED)) if (item.values["id"] === key) return item;
  return null;
};
/** The member item of that handle that is or was a member: a handle is unique among them, and a removed handle is never reused (section 3.1). */
const memberItem = (state: Pick<StateView, "page">, handle: string): Item | null => {
  for (const item of itemsOf(state, "member", ["active", "removed"])) if (item.values["handle"] === handle) return item;
  return null;
};
/** True when the member has at least one active key. */
const hasActiveKey = (state: Pick<StateView, "page">, member: number): boolean => {
  for (const item of itemsOf(state, "key", ["active"])) if (item.refs["member"] === member) return true;
  return false;
};
/** The other active admins: every active member whose role is `admin`, but that one. */
const otherAdmins = (state: Pick<StateView, "page">, but: number): Item[] => [...itemsOf(state, "member", ["active"])].filter((item) => item.id !== but && item.values["role"] === "admin");

// ---------------------------------------------------------------- the rules

/** The key that signed the act: the intent's `actor` (the contract's section 6.1, "What a rule is given", item 2). */
const signingKey = ({ input }: RuleGiven): string => {
  if (input.type !== "act") throw new Error("this rule stands in an act, and reads its signing key");
  return input.signed.intent.actor;
};

/**
 * The rules of `platform:membership@1`, by the name that a mark states
 * (section 12.1.8, the table of marks). Each is a pure function of what a
 * rule is given. None reads the clock.
 */
export const membershipRules: Rules = {
  /**
   * Rows 14 and 15, at `grant` of `seat` and `first-key` (P13, P14). It
   * reads `roster.foundingKey`. A pass, with no member, when the signing key
   * is the founding key that the genesis recorded. Otherwise `unauthorized`.
   */
  "founding-key": {
    place: "grant", refusals: [],
    run: (given) => (rosterOf(given.state)?.values["foundingKey"] === signingKey(given) ? { pass: true, member: null } : { pass: false }),
  },
  /**
   * Rows 16, 22, 24 and 25, at `grant` of `invite-member`, `invite-key`,
   * `remove-member`, `revoke-key` and `rotate-recovery` (P13). It reads
   * `roster.recoveryKey`. Where the mark states an action, the judge runs it
   * only when no current grant of that action is held. A pass, with no
   * member, when the signing key is the recovery key. The records cannot
   * show that "no admin can act", so the rule checks the key alone
   * (section 12.1, "One thing that the rule cannot check").
   */
  "recovery-key": {
    place: "grant", refusals: [],
    run: (given) => (rosterOf(given.state)?.values["recoveryKey"] === signingKey(given) ? { pass: true, member: null } : { pass: false }),
  },
  /**
   * Rows 17 and 20, at `grant` of `join` and `enrol` (P13): checks 5 and 6
   * of section 3.6, in that order. The signing key is not, and never was,
   * the recovery key: `recovery-key`. It is not, and never was, a member's
   * key: `key-in-use`. And the mark of `also` bound the invitation, which
   * it does only for the ID of an invitation with the hash of the act's
   * secret: `invitation-refused`, one answer for an unknown ID and for a
   * wrong secret. A pass has no member.
   */
  "by-invitation": {
    place: "grant", refusals: ["recovery-key", "key-in-use", "invitation-refused"],
    run: (given) => {
      const key = signingKey(given);
      const roster = rosterOf(given.state);
      if (!roster || roster.values["recoveryKey"] === key || texts(roster.values["formerRecovery"]).includes(key)) return { pass: false, name: "recovery-key" };
      if (keyItem(given.state, key)) return { pass: false, name: "key-in-use" };
      return given.resolved.subjects.has("also.member") || given.resolved.subjects.has("also.key") ? { pass: true, member: null } : { pass: false, name: "invitation-refused" };
    },
  },
  /**
   * Rows 19 and g, at the name `member` of `also` in `join` and the name
   * `key` in `enrol` (P18). The invitation's ID is the ID of the item that
   * it is for (section 12.1.3). It gives that item when it is of the type
   * that the mark states and its `inviteHash` is the hash of the secret.
   * Otherwise none: one answer, after the same work, for an unknown ID and
   * for a wrong secret. It never refuses: `by-invitation` does. The hash of
   * a secret is the digest of the text in the domain of a text (I3 deltas,
   * entry EM13).
   */
  invitation: {
    place: "also",
    run: (given, type) => {
      const { invitation, secret } = given.resolved.fields;
      const hash = textDigest(text(secret) ?? "");
      const item = typeof invitation === "number" ? given.state.item(invitation) : null;
      return item?.type === type && item.values["inviteHash"] === hash ? item.id : null;
    },
  },
  /**
   * Rows 18 and 21, among the effects of `join` and `enrol` (P14). One
   * `value` effect: `id` is the signing key, on the key that a `join` opens,
   * or on the invited key that an `enrol` makes active.
   */
  "key-id": {
    place: "effect", most: 1,
    run: (given) => [{ effect: "value", item: given.resolved.subjects.get("also.key")?.id ?? given.resolved.self, slot: "id", value: signingKey(given) }],
  },
  /**
   * Row 26, among the effects of `rotate-recovery` (P24). It reads
   * `roster.recoveryKey` and `roster.formerRecovery` from the state before
   * the entry. One `value` effect: the list `formerRecovery`, set whole,
   * with the former key added. A list that is full is refused by the slot's
   * type.
   */
  "former-recovery": {
    place: "effect", most: 1,
    run: (given) => {
      const roster = rosterOf(given.state);
      if (!roster) throw new Error("a membership scope has its roster");
      const former = texts(roster.values["formerRecovery"]);
      const was = text(roster.values["recoveryKey"]);
      return [{ effect: "value", item: roster.id, slot: "formerRecovery", value: was === null || former.includes(was) ? former : [...former, was] }];
    },
  },
  /**
   * Rows h and i, among the guards of `remove-member` and `revoke-key`
   * (P13): the last admin, and the last active key of the last admin, are
   * kept, "except by the recovery key". It holds when the rule at `grant`
   * passed the recovery key, which is when the act was judged on no grant.
   * It holds when the member is no active admin, or another admin stays
   * active. For a key it also holds when the key is not active, or the
   * member has another active key. Otherwise `last-admin`.
   */
  /**
   * Row o, among the effects of `establish` (P10). It reads nothing: the
   * five lists are part of the rule. Five `value` effects on the roster that
   * the entry opens, each list set whole, in the order of the note's table.
   */
  "role-table": {
    place: "effect", most: 5,
    run: ({ resolved }) => (Object.keys(ROLE_LISTS) as Role[]).map((role) => ({ effect: "value", item: resolved.self, slot: ROLE_LISTS[role], value: [...FIRST_ACTIONS[role]] })),
  },
  /**
   * Row p, among the effects of `seat`, `invite-member` and `add-member`
   * (P26). It reads the handle: for `seat`, `roster.foundingHandle`; for the
   * two other rows, the field `handle`. And this scope's own reference. One
   * `party` effect on the member that the entry opens: the slot `member` is
   * the member reference of this scope and the handle, as the member's ID.
   * It refuses nothing. A text that is no handle was refused before: by
   * `handle-form` in the same entry, or by the register's at the founding.
   * So a row with no such text is one that no judged entry reaches, and it
   * is a fault of the rule: nothing is written.
   */
  "member-of": {
    place: "effect", most: 1,
    run: (given) => {
      const { input, resolved, state } = given;
      if (input.type !== "act") throw new Error("this rule stands in an act that opens a member");
      const handle = input.signed.intent.kind === "seat" ? rosterOf(state)?.values["foundingHandle"] : resolved.fields["handle"];
      if (!isHandle(handle)) throw new Error("the member that the entry opens has no handle");
      return [{ effect: "party", item: resolved.self, slot: "member", member: { membership: resolved.at, member: handle } }];
    },
  },
  /** Row q, among the guards of `invite-member` and `add-member` (P27), on the field `handle`. */
  "handle-form": handleForm("handle"),
  "last-admin-kept": {
    place: "guard", refusals: ["last-admin"],
    run: (given) => {
      if (given.input.type === "act" && given.input.grant === null) return { holds: true };
      const on = given.resolved.subjects.get("on");
      const member = on?.type === "key" ? given.resolved.subjects.get("also.member") : on;
      if (!on || !member) throw new Error("this rule stands in a row whose primary item is a member or a key");
      if (member.state !== "active" || member.values["role"] !== "admin" || otherAdmins(given.state, member.id).length > 0) return { holds: true };
      if (on.type !== "key") return { holds: false, name: "last-admin" };
      const others = [...itemsOf(given.state, "key", ["active"])].some((key) => key.id !== on.id && key.refs["member"] === member.id);
      return on.state !== "active" || others ? { holds: true } : { holds: false, name: "last-admin" };
    },
  },
};

// ---------------------------------------------------------------- the answer to an observation

/**
 * The member that an answer names for a key that membership does not hold.
 * An observation has a member, and such a key has none. `@-` is no handle:
 * the first and the last character after the `@` are not hyphens (section
 * 3.1). The state beside it is `active`, because `removed` would say that
 * the answer can never become untrue, and a key that is unknown may still
 * be enrolled (I3 deltas, entry EM14).
 */
export const NO_MEMBER = "@-" satisfies MemberId;

/**
 * What membership answers to an observation read, from its folded state at
 * one head (section 3.3, step 3; section 12.1.3, "Two things that are
 * answers and no entries"; the contract's section 16.1). It is the
 * observation without `at`, which is the asking scope's own clock. Null:
 * no answer. A provisional membership answers none (case e), and so does
 * one that is asked as another scope or incarnation, or for the rules.
 *
 * It is a pure function of the state, so a replay derives the same value
 * from membership's history at the head that an observation names.
 *
 * - **A key.** The key's item, its member's item, the role's list of
 *   actions at that head, and for an agent whether its controller is an
 *   active member with an active key. A key that no item holds as a
 *   member's key is `unknown`: the answer then names no real member, and
 *   holds no action (I3 deltas, entry EM14). A member that is `removed`
 *   answers so for every key of that member, whatever the key's own state
 *   (row 23 of the table of marks).
 * - **A member.** The member's item, and whether it has an active key.
 *
 * `within` names the scopes of this repository: this membership scope, with
 * its incarnation. No grant of membership has an end time, so `notAfter`
 * is null.
 */
export function standingOf(state: Pick<StateView, "scope" | "page" | "item">, asked: ObservationRequest): Omit<Observation, "at"> | Omit<MemberObservation, "at"> | null {
  const scope = state.scope();
  if (!scope || scope.status !== "active" || scope.at.kind !== "membership" || asked.of.scope !== scope.at.scope || asked.of.inc !== scope.at.inc || asked.of.kind !== scope.at.kind) return null;
  const of: ScopeRef = scope.at;
  const common = { of, head: scope.head, definition: MEMBERSHIP } as const;
  const roster = rosterOf(state);
  /** For an agent: its controller, and whether that member is active and has an active key. */
  const controlled = (member: Item): { controller: MemberId | null; controllerActive: boolean | null } => {
    const party = member.parties["controller"];
    const controller = party && !Array.isArray(party) ? (party as { member: MemberId }).member : null;
    const item = controller === null ? null : memberItem(state, controller);
    return { controller, controllerActive: controller === null ? null : item?.state === "active" && hasActiveKey(state, item.id) };
  };
  if ("member" in asked) {
    const item = memberItem(state, asked.member);
    if (!item) return { ...common, subject: "member", member: asked.member, memberState: "unknown", role: null, activeKey: null, controller: null, controllerActive: null };
    return { ...common, subject: "member", member: asked.member, memberState: item.state === "active" ? "active" : "removed", role: text(item.values["role"]), activeKey: hasActiveKey(state, item.id), ...controlled(item) };
  }
  if (!("key" in asked)) return null;
  const within = { membership: of };
  const item = keyItem(state, asked.key);
  const member = item && typeof item.refs["member"] === "number" ? state.item(item.refs["member"]) : null;
  const role = member ? text(member.values["role"]) : null;
  const handle = member ? text(member.values["handle"]) : null;
  // A key that membership does not hold as a member's key: its state is `unknown`, and nothing else of the answer is of a member.
  if (!item || !member || role === null || handle === null) {
    return { ...common, key: asked.key, keyState: "unknown", member: NO_MEMBER, memberState: "active", role: "", actions: [], within, controller: null, controllerActive: null, notAfter: null };
  }
  const list = roster && Object.hasOwn(ROLE_LISTS, role) ? texts(roster.values[ROLE_LISTS[role as Role]]) : [];
  return {
    ...common, key: asked.key as KeyId, keyState: item.state as "active" | "retired" | "compromised", member: handle as MemberId, memberState: member.state === "active" ? "active" : "removed",
    role, actions: list, within, ...controlled(member), notAfter: null,
  };
}

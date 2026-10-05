/**
 * For tests only. Nothing here is exported from the package's main entry,
 * and no production entry imports it. The package exports this file as
 * `./testing`, for the test Worker of the scope package.
 *
 * Three things here are STAND-INS, and each is labelled where it is used.
 *
 * - `standIns`: a rule for each of the three marks of membership's data
 *   that the authority note's table of marks does not list (`role-table`,
 *   `member-of` and `handle-form`; I3 deltas, entries EM6 to EM8). The
 *   platform package writes no rule for them, so it cannot run
 *   `platform:membership@1`. With these, a test can. Each does what the
 *   note's row says in prose, and one makes a choice that is nobody's yet:
 *   which actions an admin's first list leaves out. So a test that uses
 *   them shows the rows and the seven real rules of membership, and nothing
 *   about how those three places will be decided.
 * - `office`: a made-up directory that creates one membership scope at its
 *   founding. It stands for the creator of a membership scope, which is the
 *   real directory's genesis, below a register (authority note, section
 *   12.1). It shows nothing of a founding.
 * - `Roster`: a membership scope in memory, below such an office. Its acts
 *   are judged by derive's real judges, with the grant that membership's
 *   own answer gives at its head.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { DeclaredDefinition, KeyId, MemberId, ObservationUse, PlatformDefinition } from "@generalbusiness/artroom-contract";
import { utf8 } from "@generalbusiness/artroom-bytes";
import { PROFILES, clockOf, grantFrom, judgeDelivery, judgeGenesis, observationOf, validateDefinition } from "@generalbusiness/artroom-derive";
import type { ActJudgment, Judgment, PlatformRules, Presented, Rules, ValidDefinition } from "@generalbusiness/artroom-derive";
import { Ledger, T0, creation, founded, keys, sent, type Actor, type Context, type Over } from "@generalbusiness/artroom-derive/testing";
import { MEMBERSHIP, ROLE_LISTS, actionsIn, membership, platform, standingOf, type Platform, type Role } from "../src/index.ts";

/** The four actions that the table of section 3.2 gives a role under a condition on one task. The stand-in leaves them out of an admin's first list, which then has 30 names. */
export const TASK_ACTIONS: readonly string[] = ["work.export", "task.control", "task.read-private", "task.operate"];

/** A handle as section 3.1 has it: `@`, then lowercase ASCII letters, digits and hyphens, of which the first and the last are no hyphen; at most 256 bytes. */
export const isHandle = (value: unknown): value is MemberId => typeof value === "string" && /^@[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value) && utf8(value).length <= 256;

/**
 * STAND-INS: a rule for each mark of membership's data that the note's
 * table of marks does not list. The first actions of each role are those of
 * the table of section 3.2, and an admin's are those less `TASK_ACTIONS`,
 * because the table gives an admin 34 and a list holds at most 32.
 */
export const standIns: Rules = {
  "role-table": {
    place: "effect", most: 5,
    run: ({ resolved }) => (Object.keys(ROLE_LISTS) as Role[]).map((role) =>
      ({ effect: "value", item: resolved.self, slot: ROLE_LISTS[role], value: actionsIn(role).filter((action) => role !== "admin" || !TASK_ACTIONS.includes(action)) })),
  },
  "member-of": {
    place: "effect", most: 1,
    run: ({ state, resolved }) => {
      // The handle of the member that the entry opens: the field of the act, or for `seat` the founding handle.
      const handle = resolved.fields["handle"] ?? state.page("roster", ["open"], null, 1).items[0]?.values["foundingHandle"];
      return typeof handle === "string" && handle.startsWith("@") ? [{ effect: "party", item: resolved.self, slot: "member", member: { membership: resolved.at, member: handle as MemberId } }] : [];
    },
  },
  "handle-form": {
    place: "guard", refusals: ["handle-form"],
    run: ({ resolved }) => (isHandle(resolved.fields["handle"]) ? { holds: true } : { holds: false, name: "handle-form", code: "bad-field" }),
  },
};

/** The platform definitions of this package, with the stand-in rules added to membership's. Every other definition is as the package supplies it. */
export const withStandIns = (named: PlatformDefinition): Platform | null => {
  const supplied = platform(named);
  return supplied && named === MEMBERSHIP ? { ...supplied, rules: { ...supplied.rules, ...standIns } } : supplied;
};

/**
 * STAND-IN: a made-up directory, for the creator of a membership scope.
 * Its founding creates one membership scope, with the fields that the
 * directory's genesis sends (authority note, section 12.1, "Messages
 * between scopes"). It has no other act and no handler, so a `compromised`
 * notice that reaches it is refused `unknown-message`.
 */
export const office: DeclaredDefinition = {
  format: "artroom-definition-1",
  name: "office",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "open",
  items: {
    repository: {
      many: false, max: 1, initial: "open", states: { open: { final: false } }, parties: {},
      refs: { membership: { fixed: false, required: false, to: { type: "scope", kind: "membership" } } },
      values: {},
    },
  },
  acts: {
    open: {
      step: "open", on: "repository", grant: "office.open", also: {},
      fields: { founder: { type: "text", max: 64, required: true }, founderHandle: { type: "text", max: 256, required: true }, recoveryKey: { type: "text", max: 64, required: true } },
      guards: [], effects: [],
      sends: [{
        create: {
          kind: "membership", definition: MEMBERSHIP,
          fields: { founder: { field: "founder" }, founderHandle: { field: "founderHandle" }, recoveryKey: { field: "recoveryKey" }, directory: { scope: true } },
          result: { applied: [{ ref: { slot: "membership", from: { sender: true } } }] },
        },
      }],
      attention: [],
    },
  },
  receives: {},
  timed: {},
  rules: {},
};

const checked = (result: ReturnType<typeof validateDefinition>): ValidDefinition => {
  if (!result.ok) throw new Error(`a definition of test support is refused: ${JSON.stringify(result.problems)}`);
  return result.definition;
};
export const officeDefinition = checked(validateDefinition(office, PROPOSED_BOUNDS));
/** Membership's data, validated as a runtime validates it. */
export const membershipDefinition = checked(validateDefinition(JSON.parse(JSON.stringify(membership)), PROPOSED_BOUNDS, PROFILES, { platform: true }));
/** Membership's rules with the stand-ins: what a judge of these tests is given. */
export const rules: PlatformRules = { named: MEMBERSHIP, rules: withStandIns(MEMBERSHIP)!.rules };

export const { rita, una, vic, paul, sam } = keys;

/**
 * A membership scope in memory, below a stand-in office that rita founded:
 * its genesis, by the office's `create`, and the office's confirmation.
 * rita's key is the founding key, with the handle `@rita`, and sam's key is
 * the recovery key. Each act is judged by derive's judge of an act, with
 * membership's rules and the stand-ins.
 */
export class Roster extends Ledger {
  readonly office: Ledger;
  #reads = 0;

  constructor() {
    super(membershipDefinition, "platform:membership");
    this.office = founded(officeDefinition, { founder: rita.key, founderHandle: "@rita", recoveryKey: sam.key });
    const { asked, source } = creation(this.office, 0);
    this.take(judgeGenesis(this.state, membershipDefinition, asked, { clock: clockOf(this.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source, platform: rules }));
    // The office records the `applied` result and sends the confirmation, which makes the membership scope active.
    const result = sent(this, 0);
    this.office.seal(written(judgeDelivery(this.office.state, officeDefinition, result.delivered, { clock: clockOf(this.office.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], own: this.office.own, source: result.source, origin: this.office.entries[0]!.entry })));
    const confirm = sent(this.office, 1);
    this.take(judgeDelivery(this.state, membershipDefinition, confirm.delivered, { clock: clockOf(this.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], own: this.own, source: confirm.source, origin: null, platform: rules }));
  }

  take(judgment: Judgment): void { this.seal(written(judgment)); }

  /**
   * The grant that membership's own answer gives that key at this head, as
   * the scope builds it for an act of its own (authority note, section 3.3:
   * the observation is built from the folded state at the head before the
   * entry, with `at` as the commit's reading and the use `fresh`). None: the
   * answer is no observation.
   */
  held(key: KeyId): Presented[] {
    const observation = observationOf(standingOf(this.state, { of: this.at, key }), this.now);
    const use: ObservationUse | null = observation && { observation, read: { run: "r1", n: ++this.#reads }, use: "fresh", prior: null };
    return use ? [{ grant: grantFrom(use), current: true }] : [];
  }

  /** An act, judged with membership's rules on the grant that its own answer gives the signing key. */
  override act(who: Actor, kind: string, over: Over = {}, context: Context = {}): ActJudgment {
    return super.act(who, kind, over, { platform: rules, membership: this.at, grants: this.held(who.key), ...context });
  }

  /** rita is seated and holds the founding key as her first key: items 2 and 3. The inbox that `seat` creates is not made. */
  seated(): this {
    this.did(rita, "seat", { expected: { roster: 1 } });
    this.did(rita, "first-key", { fields: { member: 2 }, expected: { roster: 1, member: this.item(2).revision } });
    return this;
  }
}

function written(judgment: Judgment): Extract<Judgment, { result: "write" }>["draft"] {
  if (judgment.result !== "write") throw new Error(`not written: ${JSON.stringify(judgment)}`);
  return judgment.draft;
}

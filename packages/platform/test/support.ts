/**
 * For tests only. Nothing here is exported from the package's main entry,
 * and no production entry imports it. The package exports this file as
 * `./testing`, for the test Worker of the scope package.
 *
 * Two things here are STAND-INS, and each is labelled where it is used.
 * Membership's own rules are all the platform package's: it has none here.
 *
 * - `office`: a made-up directory that creates one membership scope at its
 *   founding. It stands for the creator of a membership scope, which is the
 *   real directory's genesis, below a register (authority note, section
 *   12.1). It shows nothing of a founding.
 * - `Roster`: a membership scope in memory, below such an office. Its acts
 *   are judged by derive's real judges, with the grant that membership's
 *   own answer gives at its head.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { DeclaredDefinition, KeyId, ObservationUse, PlatformDefinition } from "@generalbusiness/artroom-contract";
import { PROFILES, clockOf, grantFrom, judgeDelivery, judgeGenesis, observationOf, validateDefinition } from "@generalbusiness/artroom-derive";
import type { ActJudgment, Judgment, PlatformRules, Presented, ValidDefinition } from "@generalbusiness/artroom-derive";
import { Ledger, T0, creation, founded, keys, sent, type Actor, type Context, type Over } from "@generalbusiness/artroom-derive/testing";
import { MEMBERSHIP, membership, platform, standingOf, type Platform } from "../src/index.ts";

/**
 * A CONTROL, and no stand-in: one version of a platform definition as the package supplies it, less one rule of membership. A runtime
 * with it lacks a rule for a mark of membership's data, so by the whole-scope rule it runs nothing under `platform:membership@1`.
 * `without` null: exactly what the package supplies.
 */
export const lacking = (named: PlatformDefinition, without: string | null): Platform | null => {
  const supplied = platform(named);
  return supplied && named === MEMBERSHIP && without !== null ? { ...supplied, rules: Object.fromEntries(Object.entries(supplied.rules).filter(([name]) => name !== without)) } : supplied;
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
/** Membership's rules, as the package supplies them: what a judge of these tests is given. */
export const rules: PlatformRules = { named: MEMBERSHIP, rules: platform(MEMBERSHIP)!.rules };

export const { rita, una, vic, paul, sam } = keys;

/**
 * A membership scope in memory, below a stand-in office that rita founded:
 * its genesis, by the office's `create`, and the office's confirmation.
 * rita's key is the founding key, with the handle `@rita`, and sam's key is
 * the recovery key. Each act is judged by derive's judge of an act, with
 * membership's rules.
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

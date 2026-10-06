/**
 * For tests only. Nothing here is exported from the package's main entry,
 * and no production entry imports it.
 *
 * Four things here are STAND-INS, and each is labelled where it is used.
 *
 * - `registrar`: a made-up directory that creates one rules scope at its
 *   founding, with the fields that the directory's genesis sends (authority
 *   note, section 12.1, "Messages between scopes"). It stands for the real
 *   directory, below a register. It shows nothing of a founding.
 * - `asker`: a made-up lane that tells a rules scope `rules-wanted`. It
 *   stands for the change lane's side of that message, which is the lane
 *   design's.
 * - The grants of a `Rulebook`'s acts are the test authority of derive's
 *   fixture set: every key of that set holds every action, with no
 *   freshness proof. Nothing here shows who may publish or activate.
 * - `standing`: an observation of a member that the test writes by hand.
 *   No membership scope answered it, and no guard of an observation judged
 *   it. It shows what the rule `checkers` reads, and nothing about a read.
 *
 * The rules scope itself is not a stand-in: its data and its three rules
 * are the platform package's, and derive's real judges run them.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { DeclaredDefinition, MemberId, MemberRef, ObservationUse, ScopeId, ScopeRef } from "@generalbusiness/artroom-contract";
import { PROFILES, clockOf, judgeDelivery, judgeGenesis, validateDefinition } from "@generalbusiness/artroom-derive";
import type { Judgment, PlatformRules, ValidDefinition } from "@generalbusiness/artroom-derive";
import { Ledger, Scope, T0, arriving, creation, d, founded, keys, membership, sent } from "@generalbusiness/artroom-derive/testing";
import { RULES_SCOPE, platform, rulesScope } from "../src/index.ts";

const checked = (result: ReturnType<typeof validateDefinition>): ValidDefinition => {
  if (!result.ok) throw new Error(`a definition of test support is refused: ${JSON.stringify(result.problems)}`);
  return result.definition;
};

/** STAND-IN: a made-up directory, for the creator of a rules scope. Its founding creates one, and it has no other act and no handler. */
export const registrar: DeclaredDefinition = {
  format: "artroom-definition-1",
  name: "registrar",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "open",
  items: {
    repository: {
      many: false, max: 1, initial: "open", states: { open: { final: false } }, parties: {},
      refs: { rules: { fixed: false, required: false, to: { type: "scope", kind: "rules" } } },
      values: {},
    },
  },
  acts: {
    open: {
      step: "open", on: "repository", grant: "registrar.open", also: {},
      fields: { branch: { type: "text", max: 256, required: true }, membership: { type: "text", max: 64, required: true } },
      guards: [], effects: [],
      sends: [{
        create: {
          kind: "rules", definition: RULES_SCOPE,
          fields: { branch: { field: "branch" }, directory: { scope: true }, membership: { field: "membership" } },
          result: { applied: [{ ref: { slot: "rules", from: { sender: true } } }] },
        },
      }],
      attention: [],
    },
  },
  receives: {},
  timed: {},
  rules: {},
};

/** STAND-IN: a made-up lane. `point` records a rules scope, and `want` tells it `rules-wanted`, with no field and no clause. */
export const asker: DeclaredDefinition = {
  format: "artroom-definition-1",
  name: "asker",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "start",
  items: {
    ask: {
      many: false, max: 1, initial: "open", states: { open: { final: false } },
      parties: { opener: { fixed: true, required: true, list: false, author: false } },
      refs: { rulesScope: { fixed: false, required: false, to: { type: "scope", kind: "rules" } } },
      values: {},
    },
  },
  acts: {
    start: { step: "open", on: "ask", grant: "asker.start", also: {}, fields: { opener: { type: "member", required: true } }, guards: [], effects: [{ party: { slot: "opener", from: { field: "opener" } } }], sends: [], attention: [] },
    point: { step: "transition", on: "ask", grant: "asker.point", also: {}, fields: { rules: { type: "scope", kind: "rules", required: true } }, guards: [], effects: [{ ref: { slot: "rulesScope", from: { field: "rules" } } }], sends: [], attention: [] },
    want: { step: "transition", on: "ask", grant: "asker.want", also: {}, fields: {}, guards: [], effects: [], sends: [{ tell: { to: { slot: "rulesScope" }, message: "rules-wanted", fields: {}, result: {} } }], attention: [] },
  },
  receives: {},
  timed: {},
  rules: {},
};

export const registrarDefinition = checked(validateDefinition(registrar, PROPOSED_BOUNDS));
export const askerDefinition = checked(validateDefinition(asker, PROPOSED_BOUNDS));
/** The rules scope's data, validated as a runtime validates it. */
export const rulesScopeDefinition = checked(validateDefinition(JSON.parse(JSON.stringify(rulesScope)), PROPOSED_BOUNDS, PROFILES, { platform: true }));
/** The rules scope's rules, as the platform package supplies them: what a judge of these tests is given. No stand-in rule is among them. */
export const rules: PlatformRules = { named: RULES_SCOPE, rules: platform(RULES_SCOPE)!.rules };

/** The branch that the stand-in registrar names. */
export const BRANCH = "refs/heads/main";

/**
 * A rules scope in memory, below a stand-in registrar that rita founded:
 * its genesis, by the registrar's `create`, and the registrar's
 * confirmation. The membership scope that it records is the made-up
 * reference `membership` of derive's fixture set, by its ID, unless the
 * test names another (`of`). Each act is judged by derive's judge of an
 * act, with the rules scope's own rules, on the test authority of that
 * fixture set, unless the test presents other grants.
 */
export class Rulebook extends Ledger {
  readonly registrar: Ledger;

  constructor(confirmed = true, of: ScopeId = membership.scope) {
    super(rulesScopeDefinition, "platform:rules");
    this.registrar = founded(registrarDefinition, { branch: BRANCH, membership: of });
    const { asked, source } = creation(this.registrar, 0);
    this.take(judgeGenesis(this.state, rulesScopeDefinition, asked, { clock: clockOf(this.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source, platform: rules }));
    if (!confirmed) return;
    // The registrar records the `applied` result and sends the confirmation, which makes the rules scope active.
    const result = sent(this, 0);
    this.registrar.seal(written(judgeDelivery(this.registrar.state, registrarDefinition, result.delivered, { ...arriving(this.registrar, result.delivered, result.source) })));
    const confirm = sent(this.registrar, 1);
    this.take(judgeDelivery(this.state, rulesScopeDefinition, confirm.delivered, { ...arriving(this, confirm.delivered, confirm.source), platform: rules }));
  }

  take(judgment: Judgment): void { this.seal(written(judgment)); }

  /** An act, judged with the rules scope's rules. `context`: what is at hand beside the intent, as `observed` and `values`. */
  override act(...[who, kind, over = {}, context = {}]: Parameters<Ledger["act"]>): ReturnType<Ledger["act"]> {
    return super.act(who, kind, over, { platform: rules, membership, ...context });
  }

  /** The delivery of send `n` of entry `seq` of another scope, judged with the rules scope's rules, and written if it is to be. */
  receive(from: Ledger, seq: number, n = 0): Judgment {
    const { delivered, source } = sent(from, seq, n);
    const judgment = judgeDelivery(this.state, rulesScopeDefinition, delivered, { ...arriving(this, delivered, source), platform: rules });
    if (judgment.result === "write") this.seal(judgment.draft);
    return judgment;
  }
}

/** STAND-IN: a lane that points at that rules scope. Its genesis and its confirmation are made by hand, as derive's fixture makes a lane. */
export function lanePointingAt(to: ScopeRef): Scope {
  const lane = new Scope(askerDefinition);
  lane.did(keys.rita, "point", { on: 0, expected: { on: lane.item(0).revision }, fields: { rules: to } });
  return lane;
}

/** A member of the made-up membership scope of derive's fixture set, or of another scope. */
export const memberOf = (handle: string, of: ScopeRef = membership): MemberRef => ({ membership: of, member: handle as MemberId });

/**
 * STAND-IN: an observation of one member, written by hand, with its read
 * and its use. `n` is the read's number in the run. `over`: what differs
 * from an active member with the role `checker` of the made-up membership
 * scope.
 */
export const standing = (member: string, n: number, over: Partial<Extract<ObservationUse["observation"], { subject: "member" }>> = {}): ObservationUse => ({
  observation: {
    subject: "member", of: membership, head: { seq: 40, hash: d("4") }, member: member as MemberId, memberState: "active", role: "checker", activeKey: true,
    controller: null, controllerActive: null, definition: "platform:membership@1", at: T0, ...over,
  },
  read: { run: "r1", n }, use: "fresh", prior: null,
});

function written(judgment: Judgment): Extract<Judgment, { result: "write" }>["draft"] {
  if (judgment.result !== "write") throw new Error(`not written: ${JSON.stringify(judgment)}`);
  return judgment.draft;
}

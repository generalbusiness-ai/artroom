/**
 * Test support for the replay of a preparation, of outcomes and of an
 * ancestry record (scope contract, sections 5.5, 9.3 and 16.4): one staging
 * lane in memory, whose every entry a judge of derive wrote, so that a
 * verifier can derive each of them again.
 *
 * What is real: the lane's definition is derive's fixture `staging`, a lane
 * with the forms of `hold@1` and `git-read@1`; the capability code is
 * derive's, with the fixture's two numbers; and each entry is judged, sealed
 * and folded as a commit does it.
 *
 * STAND-INS, each labelled where it is made:
 *
 * - The lane's creator. No directory wrote the two entries that create and
 *   confirm the lane: they are made by hand, and a replay is given an anchor
 *   for each. They show nothing about a creation.
 * - Membership. No membership scope answered the observations that the
 *   grants hold: each is written by hand, of one made-up head, and a replay
 *   is given an anchor for that head. So the value of an observation is
 *   taken on the anchor, and the guards of the observation are derived.
 * - The outside system. Each answer of the Git host is written by the test,
 *   and no host was read. The ancestry record is the one of a commit with
 *   nothing foreign on it, written by hand.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Digest, Entry, Evidence, FieldValue, Grant, MemberId, MemberObservation, Observation, ObservationUse, OperationId, PlatformDefinition, RetainedInput, RulesObservation, ScopeRef, Seed, SignedIntent, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, factRefOf, intentDigest, newIncarnation, scopeIdOf, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { RETIRE_ACTION, actionOf, clockOf, grantFrom, judgeDelivery, judgeGenesis, judgePreparation, settleOutcome, valueDigest } from "@generalbusiness/artroom-derive";
import type { OutcomeRule, PlatformRules, Source } from "@generalbusiness/artroom-derive";
import { Ledger, T0, d, directory, keys, membership, t, type Actor, type Context } from "@generalbusiness/artroom-derive/testing";
import { cap, snapshots, staging } from "../../derive/test/fixtures-hold.ts";
import { gateRules, gateWith } from "../../derive/test/fixtures-marks.ts";
import type { Anchor, Coded, MemoryScope } from "../src/index.ts";

/** The one head of membership that every observation of this fixture is of. A STAND-IN: no scope has that history. */
export const STANDING = { seq: 3, hash: d("3") } as const;
const RUN = "run-1";

/**
 * A grant of those actions to that actor's key, on read `n` of the one run,
 * begun at `at`. STAND-IN: the observation is written by hand, and no
 * membership scope answered it.
 */
export function proofOf(who: Actor, actions: readonly string[], n: number, at: Timestamp): Grant {
  const observation: Observation = {
    of: membership, head: STANDING, key: who.key, keyState: "active", member: who.member.member, memberState: "active", role: "member", actions: [...actions], within: { membership },
    controller: null, controllerActive: null, notAfter: null, definition: "platform:membership@1", at,
  };
  return grantFrom({ observation, read: { run: RUN, n }, use: "fresh", prior: null });
}

const written = <J extends { result: string }>(judgment: J): Extract<J, { result: "write" }> => {
  if (judgment.result !== "write") throw new Error(`the fixture history was not written: ${JSON.stringify(judgment)}`);
  return judgment as Extract<J, { result: "write" }>;
};

/**
 * A staging lane. Entry 0 is its genesis and entry 1 its confirmation.
 * `rita` asks and `una` performs: entry 2 is the commitment, entry 3 gives
 * it to `una`, and entry 4 is `una`'s hold under it, with the fork that the
 * capability derives.
 */
export class Lane extends Ledger {
  readonly commitment = 2;
  readonly hold = 4;
  /** The entries of the made-up directory that this lane's entries used. */
  readonly foreign: Source[] = [];
  #reads = 0;

  constructor() {
    super(staging);
    // STAND-IN: the directory's act that creates the lane, and its entry that confirms it, are made by hand.
    const by = (seq: number, input: Entry["input"], sends: Entry["sends"]): Source => {
      const source: Source = { entry: { v: 1, at: directory, seq, prev: d("0"), time: T0, clamped: false, epoch: 0, input, uses: [], prepared: [], effects: [], sends }, under: "desk" };
      this.foreign.push(source);
      return source;
    };
    const opening = signIntent({ v: 1, to: directory, actor: keys.rita.key, kind: "open-lane", on: null, expected: {}, fields: {}, idempotencyKey: "lane", notAfter: t(60) }, keys.rita.secret);
    const seed: Seed = { v: 1, kind: "lane", definition: staging.digest, creator: directory, cause: intentDigest(opening.intent), ordinal: 0 };
    const message = { class: "request", type: "create", body: { fields: { opener: keys.rita.member, title: "work" }, directory, membership } } as const;
    const asked = by(17, { type: "act", signed: opening, authority: [], presented: {} }, [{ n: 0, to: seed, message }]);
    const creation = { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(9)), to: seed, from: factRefOf(asked.entry), n: 0, message };
    this.seal(written(judgeGenesis(this.state, staging, creation, { clock: clockOf(this.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: asked, capabilities: cap })).draft);
    const result = this.last.sends[0]!.message;
    const confirm = { class: "control", type: "confirm", genesis: this.fact(0) } as const;
    const confirmed = by(18, { type: "delivery", from: this.fact(0), n: 0, message: result, clause: "applied" } as Entry["input"], [{ n: 0, to: this.at, message: confirm }]);
    const arrival = { to: this.at, from: factRefOf(confirmed.entry), n: 0, message: confirm };
    this.seal(written(judgeDelivery(this.state, staging, arrival, { clock: clockOf(this.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], own: this.own, source: confirmed, origin: null, capabilities: cap })).draft);

    this.did(keys.rita, "offer", { expected: { intent: 1 }, fields: { intent: 0 } });
    this.did(keys.rita, "assign", { on: this.commitment, expected: { on: 1 }, fields: { performer: keys.una.member } });
    this.did(keys.una, "take-hold", { expected: { commitment: this.item(this.commitment).revision }, fields: { commitment: this.commitment } });
  }

  /** A grant of every action of the lane, and of the step `retire`, to that actor's key, on a new read at this reading. A STAND-IN: `proofOf`. */
  proof(who: Actor): Grant {
    return proofOf(who, [...Object.values(this.definition.declared.acts).flatMap((a) => actionOf(a) ?? []), RETIRE_ACTION], ++this.#reads, this.now);
  }
  override grants() { return Object.values(keys).map((who) => ({ grant: this.proof(who), current: true })); }
  override context(over: Context = {}) { return super.context({ snapshot: (digest) => snapshots.get(digest) ?? null, capabilities: cap, membership, ...over }); }

  /** Ask for one step with that signed intent, and seal the preparation entry. */
  asked(signed: SignedIntent, step: string): Entry {
    const judged = judgePreparation(this.state, this.definition, { signed, capability: "hold@1", step }, {
      clock: clockOf(this.state, this.now), bounds: PROPOSED_BOUNDS, steps: cap, own: this.own, membership,
      granted: ({ key }) => { const who = Object.values(keys).find((k) => k.key === key); return who ? { result: "granted", grant: this.proof(who) } : { result: "refused" }; },
    });
    return this.seal(written(judged).draft);
  }
  /** Ask for a step that has no act, with a new intent of those fields. */
  prepare(who: Actor, step: string, fields: Record<string, FieldValue>): Entry {
    return this.asked(this.intent(who, `hold@1:${step}`, { fields }), step);
  }
  /** Record one outcome of attempt 1 of an operation. STAND-IN: the answer is the test's, and no outside system gave it. */
  outcome(operation: OperationId, result: "confirmed" | "refused", body: unknown, basis: Evidence["basis"]): Entry {
    const judged = settleOutcome(this.state, this.definition, { type: "outcome", operation, attempt: 1, result, evidence: { basis, body } }, { clock: clockOf(this.state, this.now), bounds: PROPOSED_BOUNDS, owners: cap, own: this.own });
    return this.seal(written(judged).draft);
  }
  /** The operation of that kind that an entry opened. */
  opened(seq: number, kind: string): OperationId {
    const found = this.entries[seq]!.entry.effects.find((e) => e.effect === "operation" && e.kind === kind);
    if (found?.effect !== "operation") throw new Error(`entry ${seq} opens no operation ${kind}`);
    return `${seq}:${found.k}`;
  }

  /** What the lane's object would serve: its entries, its declaration, the directory's two entries that it used, and each snapshot that it retains. */
  served(): MemoryScope {
    const retained: RetainedInput[] = [{ kind: "definition", digest: this.definition.digest, bytes: canonicalize(this.definition.declared) }];
    for (const { entry } of this.entries) {
      for (const use of entry.uses) {
        const source = this.foreign.find((made) => factRefOf(made.entry).hash === use.fact.hash)!;
        retained.push({ kind: "entry", digest: use.content, bytes: canonicalize(source.entry), under: source.under });
      }
    }
    for (const [digest, bytes] of snapshots) retained.push({ kind: "snapshot", digest: digest as RetainedInput["digest"], bytes });
    return { scope: this.at, entries: this.entries.map(({ entry, hash }) => ({ seq: entry.seq, hash, bytes: canonicalize(entry) })), retained };
  }
  /** The anchors of the STAND-INS: the directory's two entries, and the one head of membership. */
  anchors(): Anchor[] {
    return [...this.foreign.map(({ entry }) => ({ scope: directory.scope, seq: entry.seq, hash: factRefOf(entry).hash })), { scope: membership.scope, ...STANDING }];
  }
}

/**
 * The name and version that the made-up platform data of derive's fixture
 * `gate` is pinned under here. The owner of an operation is a platform
 * definition by its name and version, and the fixture's own name has not
 * that form. No data and no rule of the real definition of that name is
 * used.
 */
export const OWNER = "platform:task@1" as PlatformDefinition;

/** STAND-IN: a rules scope that a gate's outcome observes. It does not exist, and its one head is anchored. */
export const RULES_SCOPE: ScopeRef = (() => {
  const seed: Seed = { v: 1, kind: "rules", definition: d("e"), creator: null, cause: d("c"), ordinal: 9 };
  return { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(9)), kind: "rules" };
})();
const RULES_HEAD = { seq: 12, hash: d("9") } as const;

/** A made-up byte domain, which the made-up data of a gate with a place declares. */
const PROOF_DOMAIN = "gate-proof-1";

/**
 * A scope under made-up platform data, founded by `rita`: derive's fixture
 * `gate`, whose act `enter` opens one operation `probe` by its rule
 * `key-id`. Entry 0 is the founding, entry 1 issues a ticket, entry 2 is
 * `una`'s `enter`, and entry 3 is the `confirmed` outcome of the probe, for
 * which the rule `probe` gives `derives`.
 *
 * STAND-INS: the data and every rule are made up, and show nothing about a
 * platform definition of Artroom. The scope records its membership
 * reference nowhere: the replay is told it by `coded`, as a directory's
 * version tells where its slot is. The grants are `proofOf`'s.
 */
export class Gate extends Ledger {
  readonly ticket = 1;
  readonly rules: PlatformRules;
  #reads = 0;

  /** The value that the `issue` of a gate with a place names, with its made-up domain, its digest there and its canonical bytes. Null: the gate's data states no place. */
  readonly proof: { domain: string; digest: Digest; bytes: string } | null;

  /**
   * `watched`: the guard rule of `enter` reads an observation of the member `@paul`, which the entry then retains in `observed`. The
   * judge of the outcome is given one too, of another read, and the outcome entry retains it when the rule `derives` reads it.
   * `placed`: the act `issue` has a field `proof` that names a value, in a made-up domain with a bound of 64 bytes (the contract's
   * revision 19, section 6.2), and the issue of entry 1 names one, which came beside its intent.
   * `ruled`: the observation of the rules that the judge of the outcome is given, in place of the one written by hand.
   */
  // `held`: one more change of the made-up data, for a gate whose tickets hold a reservation (the contract's section 17.2a). The rule
  // `key-id` then opens its probe for the ticket.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(derives: NonNullable<OutcomeRule["derives"]>, readonly watched = false, placed = false, held?: (data: any) => void, readonly ruled: ((at: Timestamp) => RulesObservation) | null = null) {
    super(gateWith((data) => {
      data.name = "platform:task";
      data.acts.enter.grant = "gate.enter";
      held?.(data);
      if (placed) data.acts.issue.fields.proof = { type: "digest", required: false, value: { domain: PROOF_DOMAIN, max: 64 } };
    }));
    const proof = { seat: 12 };
    this.proof = placed ? { domain: PROOF_DOMAIN, digest: valueDigest(PROOF_DOMAIN, proof), bytes: canonicalize(proof) } : null;
    this.rules = Gate.rulesWith(derives, watched, held ? this.ticket : undefined);
    const founding = signIntent({ v: 1, to: null, actor: keys.rita.key, kind: "found", on: null, expected: {}, fields: { opener: keys.rita.member }, idempotencyKey: "gate", notAfter: t(60) }, keys.rita.secret);
    const seed: Seed = { v: 1, kind: "directory", definition: OWNER, creator: null, cause: intentDigest(founding.intent), ordinal: 0 };
    const asked = { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(1)), seed, founding };
    this.seal(written(judgeGenesis(this.state, this.definition, asked, { clock: clockOf(this.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: null, platform: this.rules })).draft);
    if (this.act(keys.rita, "issue", { fields: { hash: textDigest("one"), ...(this.proof ? { proof: this.proof.digest } : {}) } }, this.proof ? { values: [this.proof.bytes] } : {}).result !== "write") throw new Error("the issue was not written");
    const entered = this.did(keys.una, "enter", { on: 0, expected: { on: this.item(0).revision }, fields: { secret: "one" } });
    const judged = settleOutcome(this.state, this.definition, { type: "outcome", operation: `${entered.seq}:0`, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body: {} } }, { clock: clockOf(this.state, this.now), bounds: PROPOSED_BOUNDS, own: this.own, platform: this.rules, ...(this.watched ? { observed: [this.seen(), this.rulesSeen()] } : {}) });
    // A gate whose tickets hold a reservation may be given a rule that draws past a count: its outcome is then not judged, and the history ends before it.
    if (held && judged.result === "unavailable") return;
    this.seal(written(judged).draft);
  }

  /** The made-up rules, with that rule for what an outcome of the probe derives. */
  static rulesWith(derives: NonNullable<OutcomeRule["derives"]>, watched = false, holder?: number): PlatformRules {
    const opens = [{ effect: "operation", k: 0, owner: OWNER, kind: "probe", attempts: 1, ...(holder === undefined ? {} : { for: holder }) }, { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null }];
    const made = gateRules({
      "key-id": { place: "effect", most: 2, run: (() => opens) as never }, probe: { place: "outcome", rules: { selects: false, read: false, retries: () => false, derives } },
      // A second kind of operation, for a gate whose data names it. It derives nothing.
      after: { place: "outcome", rules: { selects: false, read: false, retries: () => true } },
      ...(watched ? { fresh: { place: "guard", refusals: ["seated"], run: (given) => (given.observed({ member: "@paul" as MemberId })?.observation ? { holds: true } : { holds: false, name: "seated" }) } } : {}),
    });
    return { named: OWNER, rules: made.rules };
  }
  /** What a replay is supplied for the made-up version: its data, those rules, and where a scope under it records its membership reference. */
  // `data`: other data than this gate was written under, for a replay of its history under a version that states other counts.
  coded(rules: PlatformRules = this.rules, recorded: Coded["membership"] | null = () => membership, rulesScope?: Coded["rulesScope"], data: unknown = this.definition.declared): (named: PlatformDefinition) => Coded | null {
    return (named) => (named === OWNER ? { data: data as never, rules: rules.rules, ...(recorded ? { membership: recorded } : {}), ...(rulesScope ? { rulesScope } : {}) } : null);
  }

  override grants() {
    const actions = ["gate.establish", "gate.issue", "gate.enter"];
    return Object.values(keys).map((who) => ({ grant: proofOf(who, actions, ++this.#reads, this.now), current: true }));
  }
  /** STAND-IN: an observation of a member, written by hand as the grants' observations are, as one more read of the run. The judge of an act or of an outcome retains it only when a rule reads it. */
  seen(): ObservationUse {
    const paul: MemberObservation = { subject: "member", of: membership, head: STANDING, member: "@paul" as MemberId, memberState: "active", role: "member", activeKey: true, controller: null, controllerActive: null, definition: "platform:membership@1", at: this.now };
    return { observation: paul, read: { run: RUN, n: ++this.#reads }, use: "fresh", prior: null };
  }
  /** STAND-IN: an observation of the rules, written by hand, as one more read of the run. No rules scope answered it, unless the test gave `ruled`: then it is what that function gives for the time of the read. */
  rulesSeen(): ObservationUse {
    const rules: RulesObservation = this.ruled?.(this.now) ?? { subject: "rules", of: RULES_SCOPE, head: RULES_HEAD, revision: 7, content: { asked: "rules", approvals: 0, ownerMayReview: true, checks: [], labels: [] }, definition: "platform:rules@1", at: this.now };
    return { observation: rules, read: { run: RUN, n: ++this.#reads }, use: "fresh", prior: null };
  }
  override context(over: Context = {}) {
    return super.context({ platform: this.rules, membership, ...(this.watched ? { observed: [this.seen()] } : {}), ...over });
  }

  /** What the scope's object would serve: its entries, and the value that entry 1 names, as one retained input of the kind `value` with its domain. */
  served(): MemoryScope {
    return { scope: this.at, entries: this.entries.map(({ entry, hash }) => ({ seq: entry.seq, hash, bytes: canonicalize(entry) })), retained: this.proof ? [{ kind: "value", domain: this.proof.domain, digest: this.proof.digest, bytes: this.proof.bytes }] : [] };
  }
  anchors(): Anchor[] { return [{ scope: membership.scope, ...STANDING }, { scope: RULES_SCOPE.scope, ...RULES_HEAD }]; }
}

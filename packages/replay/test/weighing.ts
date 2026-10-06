/**
 * Histories for the replay of the rows of `observes` (scope contract,
 * revisions 20 and 21, sections 6.1 and 16.1; witnesses 18.46, cases 13 to
 * 15, 18.48, case 10, 18.50, case 11, and 18.52, cases 11 and 12).
 *
 * `Weighing` is a scope under derive's made-up platform data `weigher`,
 * founded by `rita`. Derive's judges wrote every entry, with the made-up
 * rules of that fixture.
 *
 * STAND-INS, each written by hand, of which nothing here shows anything:
 * the data and its rules; every observation, of membership and of the
 * rules, which no scope answered; the two entries of a lane and the entry
 * of the peer that answered a request, which no scope judged. A replay is
 * given an anchor for each head and for each of those entries, so each
 * value is taken on the caller's word. It shows what a verifier derives
 * from the rows: the origin, the subject lists, the guards and the values
 * that an observation names.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Digest, Entry, FactUse, Input, KeyId, MemberId, ObservationUse, OperationId, PlatformDefinition, RetainedInput, Seed, Send } from "@generalbusiness/artroom-contract";
import { canonicalize, digestBytes, factRefOf, intentDigest, newIncarnation, scopeIdOf, signIntent, utf8 } from "@generalbusiness/artroom-bytes";
import { clockOf, grantFrom, judgeDelivery, judgeGenesis, settleOutcome, valueDigest, type Fetched, type Observing, type RuleGiven } from "@generalbusiness/artroom-derive";
import { Ledger, T0, arriving, forged, keys, membership, otherLane, t, type Actor, type Context } from "@generalbusiness/artroom-derive/testing";
import { EXTENTS, RULEBOOK, STEP_ROWS, WEIGHER, holdersSeen, keySeen, memberSeen, rulebook, rulesSeen, signers, stating, weigherRules, weigherWith } from "../../derive/test/fixtures-observes.ts";
import type { Anchor, Coded, MemoryScope } from "../src/index.ts";

const { rita, una, vic, paul } = keys;
const written = <J extends { result: string }>(judgment: J): Extract<J, { result: "write" }> => {
  if (judgment.result !== "write") throw new Error(`the fixture history was not written: ${JSON.stringify(judgment)}`);
  return judgment as Extract<J, { result: "write" }>;
};

/** A lane's entry that decides one check, MADE BY HAND and signed by that key. Nothing judged it. */
function decided(seq: number, who: Actor, check: string): Fetched {
  const signed = signIntent({ v: 1, to: otherLane, actor: who.key, kind: "decide", on: null, expected: {}, fields: { check }, idempotencyKey: `d${seq}`, notAfter: t(60) }, who.secret);
  const input: Input = { type: "act", signed, authority: [], presented: {} };
  const source = forged(otherLane, seq, input, []);
  return { fact: factRefOf(source.entry), entry: source.entry, under: "lane" };
}

/** The list of extents that the scripted rules name, a made-up value, with its digest in the made-up domain and its canonical bytes. */
export const LIST = ["src/**", "docs/**"];
export const VALUE = { domain: EXTENTS, digest: valueDigest(EXTENTS, LIST), bytes: canonicalize(LIST) };

/**
 * Which history. `weigh`: the three rows of witness 18.46, and an outcome
 * whose four subjects are read (its case 7), then a `set-checks` of two
 * members. `steps`: the three rows of witness 18.52, and an outcome whose
 * second step gives a key of the first (its case 5). `absent`: the same,
 * where the key k3 could not be read (its case 6). `asked`: a request whose
 * applied result retains an observation of the rules that names the
 * extents (witness 18.50, case 4).
 */
export type Which = "weigh" | "steps" | "absent" | "asked";

export class Weighing extends Ledger {
  readonly c1 = decided(41, una, "c1");
  readonly c2 = decided(42, vic, "c2");
  readonly rules;
  /** The entry of the peer that answered the request of `asked`, MADE BY HAND. */
  #peer: Fetched | null = null;
  #reads = 0;
  /** The position of the entry that each case is about. */
  outcome = -1;

  constructor(readonly which: Which) {
    super(weigherWith((data) => { if (which === "steps" || which === "absent") { data.outcomes.weigh.origin = "opening"; data.outcomes.weigh.observes = STEP_ROWS; } }));
    const first = which === "weigh" || which === "asked" ? signers : (given: RuleGiven): KeyId[] => [una.key, ...signers(given).slice(2)];
    this.rules = weigherRules(undefined, first);
    const founding = signIntent({ v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { opener: rita.member }, idempotencyKey: "weigh", notAfter: t(60) }, rita.secret);
    const seed: Seed = { v: 1, kind: "directory", definition: WEIGHER, creator: null, cause: intentDigest(founding.intent), ordinal: 0 };
    const asked = { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(1)), seed, founding };
    this.seal(written(judgeGenesis(this.state, this.definition, asked, { clock: clockOf(this.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: null, platform: this.rules })).draft);
    this.now = t(5);
    if (which === "asked") this.#asked();
    else this.#weighed();
  }

  #desk() { return { on: 0, expected: { on: this.item(0).revision } }; }
  #observing(): Observing { return { membership, rules: rulebook, content: stating({ extents: this.which === "asked" }) }; }

  #weighed(): void {
    const { which } = this;
    if (which !== "weigh") this.did(rita, "more", { ...this.#desk(), fields: { more: [paul.key] } });
    const start = this.act(rita, "start", { ...this.#desk(), fields: { first: this.c1.fact, second: this.c2.fact } }, { facts: [this.c1, this.c2] });
    if (start.result !== "write") throw new Error("the operation was not opened");
    const operation = `${this.last.seq}:0` as OperationId;
    const n = () => ++this.#reads;
    const hand = which === "weigh" ? [rulesSeen(["c1"], n(), this.now), keySeen(una.key, "@una", n(), this.now), keySeen(vic.key, "@vic", n(), this.now), holdersSeen(["@rita", "@una"], 3, n(), this.now)]
      : [rulesSeen(["c1"], n(), this.now), keySeen(una.key, "@una", n(), this.now), ...(which === "steps" ? [keySeen(paul.key, "@paul", n(), this.now)] : [])];
    const judged = settleOutcome(this.state, this.definition, { type: "outcome", operation, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body: {} } },
      { clock: clockOf(this.state, this.now), bounds: PROPOSED_BOUNDS, own: this.own, platform: this.rules, observed: hand, retained: (use: FactUse) => [this.c1, this.c2].find((copy) => copy.fact.hash === use.fact.hash) ?? null, observing: this.#observing() });
    this.outcome = this.seal(written(judged).draft).seq;
    if (which !== "weigh") return;
    // An act with a row: the checkers of two checks, each read for it.
    this.now = t(9);
    const check = (name: string, who: Actor) => ({ name, checker: who.member });
    // The signer's key is read first, and takes the next number of the run. The two members take the two after it.
    const members = [memberSeen("@una" as MemberId, this.#reads + 2, this.now), memberSeen("@vic" as MemberId, this.#reads + 3, this.now)];
    const set = this.act(rita, "set-checks", { fields: { checks: [check("a", una), check("b", vic)] } }, { observed: members, observing: this.#observing() });
    this.#reads += 2;
    if (set.result !== "write") throw new Error(`the checks were not set: ${JSON.stringify(set)}`);
  }

  #asked(): void {
    this.did(rita, "point", { ...this.#desk(), fields: { peer: otherLane } });
    const sent = this.did(rita, "go", this.#desk());
    const request = { from: this.fact(sent.seq), n: 0 };
    const answer: Send = { n: 0, to: this.at, message: { class: "result", of: request, outcome: "applied" } };
    const source = forged(otherLane, 9, { type: "delivery", from: request.from, n: 0, message: sent.sends[0]!.message as never, decision: "applied" }, [answer]);
    this.#peer = { fact: factRefOf(source.entry), entry: source.entry, under: "lane" };
    const arrival = { ...answer, from: this.#peer.fact };
    const judged = judgeDelivery(this.state, this.definition, arrival, { ...arriving(this, arrival, { entry: source.entry, under: "lane" }), platform: this.rules, observed: [rulesSeen([], ++this.#reads, this.now, VALUE.digest)], values: [VALUE.bytes], observing: this.#observing() });
    this.outcome = this.seal(written(judged).draft).seq;
  }

  /** A grant of every action of the made-up data, on the next read of the one run, begun now. STAND-IN: the observation is written by hand. */
  override grants() {
    const actions = Object.values(this.definition.declared.acts).map((act) => act.grant);
    const seen = keySeen(rita.key, "@rita", ++this.#reads, this.now);
    return [{ grant: grantFrom({ ...seen, observation: { ...seen.observation, actions } as never }), current: true }];
  }
  override context(over: Context = {}) { return super.context({ platform: this.rules, membership, ...over }); }

  /** One more observation of a key, written by hand as one more read of the run, begun at the time of the entry that the case is about. */
  seen(who: Actor): ObservationUse { return keySeen(who.key, who.member.member, 90, this.entries[this.outcome]!.entry.time); }

  /** What a replay is supplied: the made-up data and rules, where a scope under them records its two references, and the made-up data of the rules definition that the observations name. */
  coded(): (named: PlatformDefinition) => Coded | null {
    const rulesData = { items: { rules: { values: this.which === "asked" ? { extents: {} } : {} } } };
    return (named) => (named === WEIGHER ? { data: this.definition.declared as never, rules: this.rules.rules, membership: () => membership, rulesScope: () => rulebook }
      : named === RULEBOOK ? { data: rulesData as never, rules: {} } : null);
  }
  /** What the scope's object would serve: its entries, the copy of each foreign entry that an entry used, and the value that an observation names. */
  served(): MemoryScope {
    const copies = [this.c1, this.c2, ...(this.#peer ? [this.#peer] : [])];
    const retained: RetainedInput[] = this.which === "asked" ? [{ kind: "value", ...VALUE }] : [];
    const kept = new Set<Digest>();
    for (const { entry } of this.entries) {
      for (const use of entry.uses) {
        const copy = copies.find((held) => held.fact.hash === use.fact.hash)!;
        if (kept.has(use.content)) continue;
        kept.add(use.content);
        retained.push({ kind: "entry", digest: digestBytes(utf8(canonicalize(copy.entry))), bytes: canonicalize(copy.entry), under: copy.under });
      }
    }
    return { scope: this.at, entries: this.entries.map(({ entry, hash }) => ({ seq: entry.seq, hash, bytes: canonicalize(entry) })), retained };
  }
  /** An anchor for the one head of each scripted scope, and for each entry that was made by hand. */
  anchors(): Anchor[] {
    const entries: Entry[] = [this.c1.entry, this.c2.entry, ...(this.#peer ? [this.#peer.entry] : [])];
    return [{ scope: membership.scope, seq: 40, hash: keySeen(rita.key, "@rita", 0).observation.head.hash }, { scope: rulebook.scope, seq: 7, hash: rulesSeen([], 0).observation.head.hash }, ...entries.map((entry) => { const fact = factRefOf(entry); return { scope: fact.at.scope, seq: fact.seq, hash: fact.hash }; })];
  }
}

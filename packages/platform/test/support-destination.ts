/**
 * For tests only. Nothing here is exported from the package's main entry,
 * and no production entry imports it.
 *
 * Everything here but `Branch` is a STAND-IN, and each is labelled where
 * it is used.
 *
 * - `standInRules`: a rule for each mark of the destination's data that the
 *   platform package writes no rule for (`abort-if-behind`, `resend-due`,
 *   and the eight rules of `outcomes`; I3 deltas, entries ER4 to ER9). The
 *   package cannot run `platform:destination@1`. With these a test can
 *   judge its rows. `abort-if-behind` gives nothing and `resend-due` holds.
 *   The outcome of `first-head` makes the branch `ready` at the commit that
 *   the evidence names, and the outcome of `judge` reserves the oldest
 *   queued publication. They are there so that a test can reach those
 *   states. They show nothing about how the note's rows 33, 35 and e will be
 *   written.
 * - `bureau`: a made-up directory that creates one destination scope at its
 *   founding. It stands for the real directory's genesis, below a register
 *   (authority note, section 12.1). It shows nothing of a founding.
 * - The lane and its entries: a lane in memory whose entries are made by
 *   hand, read as a lane under `change`. Nothing judged them. They stand for
 *   the `merge`, `propose-manifest` and `cancel-merge` entries of a real
 *   change lane (R2 section 4.2).
 * - The register's claim: one entry made by hand, read as an entry `found`
 *   under `platform:register`.
 *
 * `Branch` is a destination scope in memory, below such a bureau. Its
 * genesis, its confirmation, its deliveries, its acts and its outcomes are
 * judged by derive's real judges, with the destination's own rules and the
 * stand-ins.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { DeclaredDefinition, Entry, Evidence, FactRef, FieldValue, Input, OperationId, Request, ScopeRef, Seed, Send } from "@generalbusiness/artroom-contract";
import { factRefOf, intentDigest, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { PROFILES, clockOf, judgeDelivery, judgeGenesis, settleOutcome, validateDefinition } from "@generalbusiness/artroom-derive";
import type { ActJudgment, Fetched, Judgment, OutcomeJudgment, PlatformRules, Rules, Source, StateView, ValidDefinition } from "@generalbusiness/artroom-derive";
import { Ledger, Scope, T0, creation, d, keys, laneDefinition, sent, t, type Actor, type Context, type Over } from "@generalbusiness/artroom-derive/testing";
import { DESTINATION, destination, destinationRules } from "../src/destination.ts";

export const { rita, una } = keys;
/** Two commits, as text: the first head, and an integration commit. */
export const [HEAD, NEXT] = ["a".repeat(40), "b".repeat(40)];

const branchOf = (state: StateView) => state.page("branch", ["empty", "ready"], null, 1).items[0]!;

/**
 * STAND-INS: a rule for each mark of the destination's data that the
 * package writes no rule for. None is the note's rule.
 */
export const standInRules: Rules = {
  "abort-if-behind": { place: "effect", most: 0, run: () => [] },
  "resend-due": { place: "guard", refusals: [], run: () => ({ holds: true }) },
  // The branch becomes `ready` at the commit that the evidence names. Nothing is checked of it.
  "first-head": {
    place: "outcome",
    rules: {
      selects: false, read: true, retries: () => true,
      derives: ({ state, input }, _operation) => {
        const value = input.type === "outcome" && input.result === "confirmed" ? (input.evidence.body as { value: string }).value : null;
        const branch = branchOf(state);
        return { effects: value === null ? [] : [{ effect: "state", item: branch.id, state: "ready" }, { effect: "value", item: branch.id, slot: "head", value }], sends: [], opens: [] };
      },
    },
  },
  // The oldest queued publication is `reserved` and takes the slot. Nothing of section 6.5 is judged.
  judge: {
    place: "outcome",
    rules: {
      selects: false, read: true, retries: () => false,
      derives: ({ state, input }) => {
        const [branch, queued] = [branchOf(state), state.page("publication", ["queued"], null, 1).items[0]];
        if (input.type !== "outcome" || input.result !== "confirmed" || !queued) return { effects: [], sends: [], opens: [] };
        return { effects: [{ effect: "state", item: queued.id, state: "reserved" }, { effect: "ref", item: branch.id, slot: "slot", to: queued.id }], sends: [], opens: [] };
      },
    },
  },
  ...Object.fromEntries(["push", "mint", "revoke", "deciding-read", "receipt", "adopt-read"].map((code) => [code, { place: "outcome", rules: { selects: false, read: true, retries: () => false } }] as const)),
};

/** The destination's rules with the stand-ins: what a judge of these tests is given. */
export const rules: PlatformRules = { named: DESTINATION, rules: { ...destinationRules, ...standInRules } };

const checked = (result: ReturnType<typeof validateDefinition>): ValidDefinition => {
  if (!result.ok) throw new Error(`a definition of test support is refused: ${JSON.stringify(result.problems)}`);
  return result.definition;
};
/** The destination's data, validated as a runtime validates it. */
export const destinationDefinition = checked(validateDefinition(JSON.parse(JSON.stringify(destination)), PROPOSED_BOUNDS, PROFILES, { platform: true }));

const REPOSITORY = { host: "git.example", namespace: "artroom", name: "demo", id: "r1" };
const NAME = { type: "text", max: 256 } as const;

/**
 * STAND-IN: a made-up directory, for the creator of a destination scope.
 * Its founding creates one destination, with the fields that the
 * directory's genesis sends (authority note, section 12.1, "Messages
 * between scopes"). It has no other act and no handler.
 */
export const bureau: DeclaredDefinition = {
  format: "artroom-definition-1",
  name: "bureau",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "open",
  items: {
    repository: {
      many: false, max: 1, initial: "open", states: { open: { final: false } }, parties: {},
      refs: { destination: { fixed: false, required: false, to: { type: "scope", kind: "destination" } } },
      values: {},
    },
  },
  acts: {
    open: {
      step: "open", on: "repository", grant: "bureau.open", also: {},
      fields: {
        repository: { type: "record", of: { host: { ...NAME, required: true }, namespace: { ...NAME, required: true }, name: { ...NAME, required: true }, id: { ...NAME, required: true } }, required: true },
        branch: { ...NAME, required: true },
        import: { type: "bool", required: true },
        claim: { type: "fact", kind: ["found"], under: "platform:register", required: true },
        membership: { type: "text", max: 64, required: true },
        rules: { type: "text", max: 64, required: true },
      },
      guards: [], effects: [],
      sends: [{
        create: {
          kind: "destination", definition: DESTINATION,
          fields: {
            repository: { field: "repository" }, branch: { field: "branch" }, import: { field: "import" }, claim: { field: "claim" },
            directory: { scope: true }, membership: { field: "membership" }, rules: { field: "rules" },
          },
          result: { applied: [{ ref: { slot: "destination", from: { sender: true } } }] },
        },
      }],
      attention: [],
    },
  },
  receives: {},
  timed: {},
  rules: {},
};
const bureauDefinition = checked(validateDefinition(bureau, PROPOSED_BOUNDS));

let made = 0;
/** An entry made by hand at a scope: it has a hash, and nothing judged it. `kind`: the kind of the act that it says it recorded. */
export function handMade(at: ScopeRef, kind: string, sends: readonly Send[] = [], who: Actor = rita): Entry {
  const signed = signIntent({ v: 1, to: at, actor: who.key, kind, on: null, expected: {}, fields: {}, idempotencyKey: `made-${made}`, notAfter: t(60) }, who.secret);
  const input: Input = { type: "act", signed, authority: [], presented: {} };
  return { v: 1, at, seq: 100 + made++, prev: d("0"), time: T0, clamped: false, epoch: 0, input, uses: [], prepared: [], effects: [], sends };
}
/** An entry of another scope as it is fetched before a turn, with the name of the definition that its scope pins. */
export const fetched = (entry: Entry, under: string): Fetched => ({ fact: factRefOf(entry), entry, under });

/** STAND-IN: the register's `found` entry that a claim names, made by hand. */
const register: ScopeRef = (() => {
  const seed: Seed = { v: 1, kind: "register", definition: d("e"), creator: null, cause: d("c"), ordinal: 0 };
  return { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(7)), kind: "register" };
})();
const claim = handMade(register, "found");

/** What a judgment answered: the result, with the reason and the refusal's name where it has them. */
export const said = (j: Judgment | ActJudgment | OutcomeJudgment) => [j.result, "reason" in j ? j.reason : null, "name" in j ? (j.name ?? null) : null];

/**
 * A destination scope in memory, below a stand-in bureau that rita founded:
 * its genesis, by the bureau's `create`, and the bureau's confirmation.
 * `importing`: the founding is by import, so the genesis declares no first
 * head. The membership and the rules scope are named by made-up scope IDs:
 * nothing here observes either.
 */
export class Branch extends Ledger {
  readonly bureau: Ledger;
  /** STAND-IN: a lane in memory, whose genesis was made by hand. It is read as a lane under `change`. */
  readonly lane = new Scope(laneDefinition);
  readonly other = new Scope(laneDefinition, keys.una.member, true, 1);

  constructor(importing: boolean) {
    super(destinationDefinition, "platform:destination");
    const facts = [fetched(claim, "platform:register")];
    // The bureau is founded as a directory is: by rita's signed intent. It is read as a directory under `platform:directory`.
    this.bureau = new Ledger(bureauDefinition, "platform:directory");
    const founding = signIntent({
      v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, idempotencyKey: `found-${importing}`, notAfter: t(60),
      fields: { repository: REPOSITORY, branch: "main", import: importing, claim: factRefOf(claim) as unknown as FieldValue, membership: "m".repeat(20), rules: "r".repeat(20) },
    }, rita.secret);
    const seed: Seed = { v: 1, kind: "directory", definition: bureauDefinition.digest, creator: null, cause: intentDigest(founding.intent), ordinal: 0 };
    this.bureau.seal(written(judgeGenesis(this.bureau.state, bureauDefinition, { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(1)), seed, founding }, { clock: clockOf(this.bureau.state, T0), bounds: PROPOSED_BOUNDS, facts, prepared: [], source: null })));
    const { asked, source } = creation(this.bureau, 0);
    this.seal(written(judgeGenesis(this.state, destinationDefinition, asked, { clock: clockOf(this.state, T0), bounds: PROPOSED_BOUNDS, facts, prepared: [], source, platform: rules })));
  }

  /** The bureau records the `applied` result and sends the confirmation, which makes the destination active. */
  confirmed(): this {
    const result = sent(this, 0);
    this.bureau.seal(written(judgeDelivery(this.bureau.state, bureauDefinition, result.delivered, { clock: clockOf(this.bureau.state, T0), bounds: PROPOSED_BOUNDS, facts: [fetched(claim, "platform:register")], prepared: [], own: this.bureau.own, source: result.source, origin: this.bureau.entries[0]!.entry })));
    const confirm = sent(this.bureau, 1);
    this.seal(written(this.delivered(confirm.delivered.message as Request, confirm.source, [], confirm.delivered.from, false)));
    return this;
  }

  /** A message of an entry of another scope, delivered here and judged. The entry is written if the judgment is to write. `source`: the entry that holds the send, as it is read. */
  delivered(message: Send["message"], source: Source, facts: readonly Fetched[] = [], from: FactRef = factRefOf(source.entry), write = true): Judgment {
    const judgment = judgeDelivery(this.state, this.definition, { to: this.at, from, n: 0, message }, { clock: clockOf(this.state, this.now), bounds: this.bounds, facts, prepared: [], own: this.own, source, origin: null, platform: rules });
    if (write && judgment.result === "write") this.seal(judgment.draft);
    return judgment;
  }

  /** A request from an entry of that scope that is made by hand: the entry holds that one send, and says it recorded an act of that kind. */
  from(at: ScopeRef, under: string, kind: string, message: Request, facts: readonly Fetched[] = [], entry?: Entry): { judgment: Judgment; entry: Entry } {
    const source = entry ?? handMade(at, kind, [{ n: 0, to: this.at, message }]);
    return { judgment: this.delivered(message, { entry: source, under }, facts), entry: source };
  }

  /** STAND-IN for the directory's `import` update: a `relate` from the bureau, about its repository item, in that state. */
  imported(state: "done" | "failed", commit: string | null = HEAD, by: Ledger | Scope = this.bureau): Judgment {
    const message: Request = { class: "request", type: "relate", body: { name: "import", item: by.fact(0), state, detail: commit === null ? {} : { commit } } };
    return this.from(by.at, by === this.bureau ? "platform:directory" : "change", "imported", message).judgment;
  }

  /**
   * STAND-IN for a lane's `merge` entry and its `reserve` (R2 section 4.2):
   * the entry is the operation, and it names a manifest entry that is made
   * by hand too. `over`: fields of the message that a test changes. `named`:
   * the other entries of a lane that those fields name, as they are fetched.
   */
  reserve(over: Record<string, unknown> = {}, sender: Scope = this.lane, named: readonly Entry[] = []): { judgment: Judgment; operation: FactRef; merge: Entry } {
    const manifest = handMade(sender.at, "propose-manifest");
    const message: Request = { class: "request", type: "tell", body: { message: "reserve", fields: { operation: { self: true }, manifest: factRefOf(manifest), verdicts: [], jobs: [], links: [], ...over } } };
    const { judgment, entry } = this.from(sender.at, "change", "merge", message, [manifest, ...named].map((entry) => fetched(entry, "change")));
    return { judgment, operation: factRefOf(entry), merge: entry };
  }

  /** STAND-IN for a lane's `cancel-merge` entry and its `withdraw`, for that operation. `again`: the entry of an earlier call, for the same envelope again. */
  withdraw(merge: Entry, sender: Scope = this.lane, again?: Entry): { judgment: Judgment; entry: Entry } {
    const message: Request = { class: "request", type: "tell", body: { message: "withdraw", fields: { operation: factRefOf(merge) } } };
    return this.from(sender.at, "change", "cancel-merge", message, [fetched(merge, "change")], again);
  }

  /** An act, judged with the destination's rules and the stand-ins. Every key of the fixture set holds every action here. */
  override act(who: Actor, kind: string, over: Over = {}, context: Context = {}): ActJudgment {
    return super.act(who, kind, over, { platform: rules, ...context });
  }

  /** An outcome of one attempt, as the operations driver offers it, judged with the stand-in rules of `outcomes`. It is written if the judgment is to write. */
  outcome(operation: OperationId, attempt: number, result: "confirmed" | "refused" | "unknown", evidence: Evidence): OutcomeJudgment {
    const judgment = settleOutcome(this.state, this.definition, { type: "outcome", operation, attempt, result, evidence }, { clock: clockOf(this.state, this.now), bounds: this.bounds, own: this.own, platform: rules });
    if (judgment.result === "write") this.seal(judgment.draft);
    return judgment;
  }

  /** The branch has its first head, by the STAND-IN outcome of `first-head`: a read that shows the commit. The operation is the one that the genesis declared. */
  ready(): this {
    this.confirmed();
    if (this.outcome("0:0", 1, "confirmed", { basis: "read", body: { ref: "refs/heads/main", value: HEAD, reported: "created" } }).result !== "write") throw new Error("the stand-in first head was not written");
    return this;
  }

  get branch() { return this.item(0); }
  /** The operations that the last entry opened: each kind, the most attempts it states, and whether its attempt 1 is opened. */
  get opened(): [string, number, boolean][] {
    const { effects, seq } = this.last;
    return effects.flatMap((effect): [string, number, boolean][] => (effect.effect === "operation" ? [[effect.kind, effect.attempts, (this.state.operation(`${seq}:${effect.k}`)?.attempts.length ?? 0) === 1]] : []));
  }
}

function written(judgment: Judgment): Extract<Judgment, { result: "write" }>["draft"] {
  if (judgment.result !== "write") throw new Error(`not written: ${JSON.stringify(judgment)}`);
  return judgment.draft;
}

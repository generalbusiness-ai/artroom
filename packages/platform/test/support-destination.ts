/**
 * For tests only. Nothing here is exported from the package's main entry,
 * and no production entry imports it.
 *
 * Everything here but `Branch` is a STAND-IN, and each is labelled where
 * it is used.
 *
 * - `standInRules`: a rule for each of the two marks of the destination's
 *   data that the platform package writes no rule for, `first-head` and
 *   `receipt` (I3 deltas, entries ER9 and FA6). The package cannot run
 *   `platform:destination@1`. With these a test can judge its rows. The
 *   outcome of `first-head` makes the branch `ready` at the commit that the
 *   read back saw. The outcome of `receipt` derives nothing. They show
 *   nothing about how the note's two rows will be written.
 * - What is at hand for a reservation, `Branch.read`: the observations
 *   that a runtime would have read before the turn of the outcome of
 *   `judge`, and what the lane's entries in `uses` say. The test writes
 *   both by hand. No membership scope, no rules scope and no lane answered.
 *   The judge of the outcome is given the observations and the entries, as
 *   a runtime gives them, and writes the entry's `observed` and `uses`
 *   itself. The rule `judge` reads each observation through the judge. Of
 *   the reader, only the lane's part is a stand-in: `LaneRead`.
 * - `bureau`: a made-up directory that creates one destination scope at its
 *   founding. It stands for the real directory's genesis, below a register
 *   (authority note, section 12.1). It shows nothing of a founding.
 * - The lane and its entries: a lane in memory whose entries are made by
 *   hand, read as a lane under `change`. Nothing judged them. They stand for
 *   the `merge`, `propose-manifest` and `cancel-merge` entries of a real
 *   change lane (R2 section 4.2).
 * - The register's claim: one entry made by hand, read as an entry `found`
 *   under `platform:register`.
 * - Every answer of the Git host: an outcome's evidence is written by the
 *   test. No host, no gateway and no Git command is reached.
 *
 * `Branch` is a destination scope in memory, below such a bureau. Its
 * genesis, its confirmation, its deliveries, its acts and its outcomes are
 * judged by derive's real judges, with the destination's own rules, the
 * two stand-in rules and the stand-in reader of a lane's entries.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { DeclaredDefinition, Entry, Evidence, FactRef, FieldValue, Input, Observation, ObservationUse, OperationId, Request, RulesObservation, ScopeRef, Seed, Send, Timestamp } from "@generalbusiness/artroom-contract";
import { factRefOf, intentDigest, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { PROFILES, clockOf, judgeDelivery, judgeGenesis, settleOutcome, validateDefinition } from "@generalbusiness/artroom-derive";
import type { ActJudgment, Fetched, Item, Judgment, Opening, Operation, OutcomeJudgment, PlatformRule, PlatformRules, RuleEffect, RuleGiven, Rules, Source, StateView, ValidDefinition } from "@generalbusiness/artroom-derive";
import { Ledger, Scope, T0, creation, d, keys, laneDefinition, sent, t, type Actor, type Context, type Over } from "@generalbusiness/artroom-derive/testing";
import { DESTINATION, DESTINATION_KINDS, closed, destination, destinationRulesWith, readFor, targetOf, tokenStep, type LaneRead } from "../src/destination.ts";
import type { JudgeEvidence, ReservationRead } from "../src/reservation.ts";

export const { rita, una } = keys;
/** Three commits and a tree, as text: the first head, an integration commit, a commit that another writer made, and the integration commit's tree. */
export const [HEAD, NEXT, OTHER, TREE] = ["a".repeat(40), "b".repeat(40), "c".repeat(40), "d".repeat(40)];

const branchOf = (state: StateView) => state.page("branch", ["empty", "ready"], null, 1).items[0]!;

/** STAND-IN: the commit of every receipt in these tests. The note's rule computes the ID from the receipt's file. Nothing here computes one. */
export const RECEIPT = "e".repeat(40);

const seenOf = (input: { type: string; evidence?: Evidence }): unknown => (input.type === "outcome" && typeof input.evidence?.body === "object" && input.evidence.body !== null ? (input.evidence.body as { seen?: unknown }).seen : null);
const writeOf = (state: StateView, own: RuleGiven["own"], read: Operation): Operation | null => {
  const input = own(Number(read.id.split(":")[0]))?.entry.input;
  return input?.type === "outcome" ? state.operation(input.operation) : null;
};
/** STAND-IN for the column `receipt` of the note's row, by what was seen, for a receipt that is `owed`: the stand-in commit is `written`, and another commit is `conflict`. */
const receiptSeen = (receipt: Item | null, seen: unknown): RuleEffect[] =>
  (receipt?.state !== "owed" || typeof seen !== "string" || seen === "absent" || seen === "failed" ? [] : [{ effect: "state", item: receipt.id, state: seen === RECEIPT ? "written" : "conflict" }]);

/**
 * STAND-INS: a rule for each of the two marks of the destination's data
 * that the package writes no rule for. Neither is the note's rule: no
 * commit is computed, and the further attempts get no mint.
 *
 * What is the package's own in them: the token of an attempt, by rule T4
 * (`tokenStep`), and whether another attempt is allowed, by rule T8
 * (`closed`, of the write's target, `targetOf`).
 */
export const standInRules: Rules = {
  // The branch becomes `ready` at the commit that the read back saw, where it is `empty`. Nothing is checked of the commit, and no
  // receipt is opened.
  "first-head": {
    place: "outcome",
    rules: {
      selects: false, read: false, covered: true,
      retries: (_result, write, given) => !closed(targetOf(given.state, given.own, write)),
      derives: (given, write) => {
        const { state, input } = given;
        const [token, branch] = [tokenStep(given, write), branchOf(state)];
        const seen = input.type === "outcome" && input.result === "confirmed" ? seenOf(input) : null;
        const ready: RuleEffect[] = typeof seen !== "string" || branch.state !== "empty" ? [] : [{ effect: "state", item: branch.id, state: "ready" }, { effect: "value", item: branch.id, slot: "head", value: seen }];
        return { effects: [...token.effects, ...ready], sends: [], opens: token.opens };
      },
    },
  },
  // The receipt becomes `written` when the read back saw the stand-in commit, and `conflict` when it saw another. `absent` allows
  // another attempt. After the last attempt, and after a read back that failed, one read of the receipt's ref is opened.
  receipt: {
    place: "outcome",
    rules: {
      selects: false, read: false, covered: true,
      retries: (_result, write, given) => !closed(targetOf(given.state, given.own, write)) && seenOf(given.input) === "absent",
      unknown: () => ({ send: "unknown", seen: "failed" }),
      derives: (given, write) => {
        const { state, own, input } = given;
        const [token, receipt, seen] = [tokenStep(given, write), targetOf(state, own, write), seenOf(input)];
        const read = receipt?.state === "owed" && input.type === "outcome" && (seen === "failed" || (seen === "absent" && input.attempt === write.most))
          && !write.attempts.some((attempt) => attempt.outcomes.some((outcome) => [0, 1].some((k) => state.operation(`${outcome.seq}:${k}`)?.kind === DESTINATION_KINDS.read)));
        const one: Opening = { owner: DESTINATION, kind: DESTINATION_KINDS.read, attempts: 1 };
        const opens: Opening[] = [...token.opens, ...(read ? [one] : [])];
        return { effects: [...token.effects, ...receiptSeen(receipt, seen)], sends: [], opens };
      },
    },
  },
};

/**
 * STAND-IN: the package's rule `deciding-read`, but for the read of a
 * receipt's ref, whose outcome the note's row `receipt` judges and the
 * package's rule does not: there it is the stand-in column `receiptSeen`.
 * It sets the receipt's state and touches no slot `token` (rule T6).
 */
const readRule = (packaged: PlatformRule): PlatformRule => {
  if (packaged.place !== "outcome") throw new Error("deciding-read is a rule of an outcome");
  return {
    place: "outcome",
    rules: {
      ...packaged.rules,
      derives: (given, read, selected) => {
        if (readFor(given.state, given.own, read) !== "receipt") return packaged.rules.derives!(given, read, selected);
        const write = writeOf(given.state, given.own, read);
        return { effects: receiptSeen(write && targetOf(given.state, given.own, write), seenOf(given.input)), sends: [], opens: [] };
      },
    },
  };
};

/** STAND-IN: a membership scope and a rules scope that the hand-written observations name. Neither exists. */
const observedScope = (kind: "membership" | "rules", fill: number): ScopeRef => {
  const seed: Seed = { v: 1, kind, definition: d("f"), creator: null, cause: d(String(fill)), ordinal: 0 };
  return { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(fill)), kind };
};
export const [MEMBERSHIP, RULES] = [observedScope("membership", 3), observedScope("rules", 4)];

/** STAND-IN: an observation of one key, written by hand. No membership scope answered it. */
export const keyObserved = (who: Actor, at: Timestamp, over: Partial<Observation> = {}): Observation => ({
  of: MEMBERSHIP, head: { seq: 412, hash: d("4") }, key: who.key, keyState: "active", member: who.member.member, memberState: "active", role: "maintainer", actions: ["change.merge", "change.review"],
  within: { membership: MEMBERSHIP } as unknown as Observation["within"], controller: null, controllerActive: null, notAfter: null, definition: "platform:membership@1", at, ...over,
});
/** STAND-IN: an observation of the rules, written by hand. No rules scope answered it. */
export const rulesObserved = (at: Timestamp, content: Partial<Extract<RulesObservation["content"], { asked: "rules" }>> = {}): RulesObservation => ({
  subject: "rules", of: RULES, head: { seq: 60, hash: d("6") }, revision: 57, content: { asked: "rules", approvals: 0, ownerMayReview: true, checks: [], labels: [], ...content }, definition: "platform:rules@1", at,
});
/** STAND-IN: an observation as an entry retains it. */
export const retained = (observation: Observation | RulesObservation, n: number): ObservationUse => ({ observation, read: { run: "run-1" as ObservationUse["read"]["run"], n }, use: "fresh", prior: null });

/** The evidence of a `judge` whose reads found the branch at the first head and the integration commit whole, with one changed path. */
export const FOUND: JudgeEvidence = { head: HEAD, present: true, tree: TREE, firstParent: HEAD, ancestors: [], changes: { paths: ["src/a.ts"], links: [], unreadable: 0 } };

/**
 * STAND-IN: what `observed` and `uses` say for a reservation that nothing
 * stands against: rita signed the `merge` and holds `change.merge`, the
 * rules ask no approval and no check, and the manifest is complete, from
 * the first head to the integration commit. The plain judgment
 * `judgeReservation` takes it whole. A `Branch` takes its observations and
 * what its lane's entries say (`Hand`).
 */
export const reading = (at: Timestamp, over: Partial<ReservationRead> = {}): ReservationRead => ({
  merger: keyObserved(rita, at), rules: rulesObserved(at), extents: null, singleControllerException: false,
  manifest: { base: HEAD, integration: NEXT, tree: TREE, reports: [], authors: [], complete: true },
  controllersOfAuthors: [], controllers: null, verdicts: [], checks: {}, ...over,
});

/**
 * STAND-IN: what a `Branch` has at hand for the next outcome of `judge`,
 * written by hand. The observations are those that the destination's
 * runtime would read before the turn. `manifest`, and `sound`, `opening`
 * and `deciding`, are what a reader of the lane's entries would say. The
 * four inputs that no form supplies are not here: the package's rule fills
 * `extents`, `controllers` and `controllersOfAuthors`, and reads the
 * declaration of the exception from the rules observation.
 */
export type Hand = Pick<ReservationRead, "merger" | "rules" | "manifest" | "verdicts" | "checks">;

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
/**
 * An entry made by hand at a scope: it has a hash, and nothing judged it. `kind`: the kind of the act that it says it recorded.
 * `fields`: the fields of its intent. `effects`: what it says it derived, given its own position.
 */
export function handMade(at: ScopeRef, kind: string, sends: readonly Send[] = [], who: Actor = rita, fields: Record<string, FieldValue> = {}, effects: (seq: number) => Entry["effects"] = () => []): Entry {
  const signed = signIntent({ v: 1, to: at, actor: who.key, kind, on: null, expected: {}, fields, idempotencyKey: `made-${made}`, notAfter: t(60) }, who.secret);
  const input: Input = { type: "act", signed, authority: [], presented: {} };
  const seq = 100 + made++;
  return { v: 1, at, seq, prev: d("0"), time: T0, clamped: false, epoch: 0, input, uses: [], prepared: [], effects: effects(seq), sends };
}
/**
 * STAND-IN for a `report` entry of an issue lane, made by hand: it says that it opened a report and set its `commit`, as the
 * pinned `issue` lane's act `report` records it. `commit` null: it says that it opened a report and set none.
 */
export const reportMade = (at: ScopeRef, commit: string | null): Entry =>
  handMade(at, "report", [], rita, {}, (seq) => [{ effect: "open", item: seq, type: "report", state: "reported" }, ...(commit === null ? [] : [{ effect: "value", item: seq, slot: "commit", value: commit } as const])]);
/** An entry of another scope as it is fetched before a turn, with the name of the definition that its scope pins. */
export const fetched = (entry: Entry, under: string): Fetched => ({ fact: factRefOf(entry), entry, under });

/**
 * STAND-IN for what a lane's `merge` lists in its `reserve`, made by hand: `v` verdicts, each with the entry of its review;
 * `decided` jobs that state `decidedBy`, and `undecided` jobs that state none, each with the entry that opened it; and `r` reports
 * of an issue lane, each with a commit of its own. It gives the fields of the message, the entries that they name, the field
 * `selected` of a manifest that selects exactly those reports, and the reports' commits.
 */
export function listed(lane: ScopeRef, issue: ScopeRef, v: number, decided: number, undecided: number, r: number) {
  const made = (count: number, kind: string) => Array.from({ length: count }, () => handMade(lane, kind));
  const [reviews, opened, deciding] = [made(v, "review-verdict"), made(decided + undecided, "request-check"), made(decided, "check")];
  const commits = Array.from({ length: r }, (_, n) => (n + 1).toString(16).padStart(40, "1"));
  const reports = commits.map((commit) => reportMade(issue, commit));
  const accepted = factRefOf(handMade(issue, "accept-report")) as unknown as FieldValue;
  return {
    fields: {
      verdicts: reviews.map((review) => ({ review: factRefOf(review), reviewer: una.member, verdict: "approve" })),
      jobs: opened.map((job, n) => ({ job: factRefOf(job), name: `job-${n}`, state: n < decided ? "passed" : "requested", ...(n < decided ? { decidedBy: factRefOf(deciding[n]!) } : {}) })),
      reports: reports.map((report) => factRefOf(report)),
    },
    entries: [...reviews, ...opened, ...deciding, ...reports], reports, commits,
    selected: reports.map((report) => ({ accepted, report: factRefOf(report) as unknown as FieldValue })) as FieldValue[],
  };
}

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
  /** STAND-IN: what is at hand for the next reservation that the rule `judge` judges. Null: nothing is at hand, as in the runtime. */
  read: Hand | null = null;
  /** STAND-IN: the entries that the `reserve` of each publication names, made by hand, as they are fetched for the outcome of its `judge`: the `merge` entry, the manifest's entry and each other entry. */
  readonly #fetched = new Map<number, readonly Fetched[]>();
  /** STAND-IN reader of a lane's entries: what the hand-written record says of them, with each key by its ID. No entry is read. */
  readonly #lane = (): LaneRead | null => this.read && {
    // The commits of the selected reports are not the reader's: the package's rule derives them from the entries that `reserve` names.
    manifest: { base: this.read.manifest.base, integration: this.read.manifest.integration, tree: this.read.manifest.tree, authors: this.read.manifest.authors, complete: this.read.manifest.complete },
    verdicts: this.read.verdicts.map(({ sound, key }) => ({ sound, key: key?.key ?? null })),
    checks: Object.fromEntries(Object.entries(this.read.checks).map(([name, check]) => [name, { opening: check.opening, deciding: check.deciding, key: check.key?.key ?? null }])),
  };
  /** The destination's rules, with the stand-in reader of a lane's entries and the two stand-in rules: what a judge of these tests is given. */
  readonly rules: PlatformRules = (() => {
    const packaged = destinationRulesWith(this.#lane);
    return { named: DESTINATION, rules: { ...packaged, ...standInRules, "deciding-read": readRule(packaged["deciding-read"]!) } };
  })();

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
    this.seal(written(judgeGenesis(this.state, destinationDefinition, asked, { clock: clockOf(this.state, T0), bounds: PROPOSED_BOUNDS, facts, prepared: [], source, platform: this.rules })));
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
    const judgment = judgeDelivery(this.state, this.definition, { to: this.at, from, n: 0, message }, { clock: clockOf(this.state, this.now), bounds: this.bounds, facts, prepared: [], own: this.own, source, origin: null, platform: this.rules });
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
   * by hand too. `over`: fields of the message that a test changes, where
   * `undefined` leaves a field out. `named`:
   * the other entries that those fields name, as they are fetched: an entry
   * of the lane under `change`, and a `report` entry under `issue`.
   * `selected`: the field `selected` of the manifest's intent, as the pinned
   * `change` lane's `propose-manifest` holds it.
   */
  reserve(over: Record<string, unknown> = {}, sender: Scope = this.lane, named: readonly Entry[] = [], selected: readonly FieldValue[] = []): { judgment: Judgment; operation: FactRef; merge: Entry } {
    const manifest = handMade(sender.at, "propose-manifest", [], rita, { selected });
    const message: Request = { class: "request", type: "tell", body: { message: "reserve", fields: Object.fromEntries(Object.entries({ operation: { self: true }, manifest: factRefOf(manifest), verdicts: [], jobs: [], links: [], reports: [], ...over }).filter(([, value]) => value !== undefined)) as Record<string, FieldValue> } };
    // A `report` entry of another scope than the sender is read as an entry of an issue lane. Every other entry is read as the lane's.
    const facts = [manifest, ...named].map((entry) => fetched(entry, entry.input.type === "act" && entry.input.signed.intent.kind === "report" && entry.at.scope !== sender.at.scope ? "issue" : "change"));
    const { judgment, entry } = this.from(sender.at, "change", "merge", message, facts);
    if (judgment.result === "write" && this.item(this.head.seq)?.type === "publication") this.#fetched.set(this.head.seq, [fetched(entry, "change"), ...facts]);
    return { judgment, operation: factRefOf(entry), merge: entry };
  }

  /** STAND-IN for a lane's `cancel-merge` entry and its `withdraw`, for that operation. `again`: the entry of an earlier call, for the same envelope again. */
  withdraw(merge: Entry, sender: Scope = this.lane, again?: Entry): { judgment: Judgment; entry: Entry } {
    const message: Request = { class: "request", type: "tell", body: { message: "withdraw", fields: { operation: factRefOf(merge) } } };
    return this.from(sender.at, "change", "cancel-merge", message, [fetched(merge, "change")], again);
  }

  /** An act, judged with the destination's rules and the stand-ins. Every key of the fixture set holds every action here. */
  override act(who: Actor, kind: string, over: Over = {}, context: Context = {}): ActJudgment {
    return super.act(who, kind, over, { platform: this.rules, ...context });
  }

  /**
   * STAND-IN for what a runtime has at hand for an outcome of `judge`, from the hand-written record: the observations, each as
   * one read of one run, in the order merger, rules, verdicts, checks, and each key once; and the lane's entries that the
   * publication names, as fetched. For any other outcome, and with no record, nothing is at hand.
   */
  #atHand(operation: OperationId): { observed?: readonly ObservationUse[]; facts?: readonly Fetched[] } {
    const of = this.state.operation(operation);
    const judging = this.branch.refs["judging"];
    if (!this.read || of?.kind !== DESTINATION_KINDS.judge || typeof judging !== "number") return {};
    const keys = [this.read.merger, ...this.read.verdicts.map((verdict) => verdict.key), ...Object.values(this.read.checks).map((check) => check.key)].filter((seen): seen is Observation => seen !== null);
    const once = keys.filter((seen, n) => keys.findIndex((other) => other.key === seen.key) === n);
    const [merger, ...others] = this.read.merger ? once : [null, ...once];
    const seen = [merger, this.read.rules, ...others].filter((observation): observation is Observation | RulesObservation => observation !== null);
    return { observed: seen.map((observation, n) => retained(observation, n + 1)), facts: this.#fetched.get(judging) ?? [] };
  }

  /**
   * An outcome of one attempt, as the operations driver offers it. It is written if the judgment is to write. The judge is given
   * what is at hand, and writes the entry's `observed` and `uses` from what its rules read: nothing here seals either by hand.
   */
  outcome(operation: OperationId, attempt: number, result: "confirmed" | "refused" | "unknown", evidence: Evidence): OutcomeJudgment {
    const judgment = settleOutcome(this.state, this.definition, { type: "outcome", operation, attempt, result, evidence }, { clock: clockOf(this.state, this.now), bounds: this.bounds, own: this.own, platform: this.rules, ...this.#atHand(operation) });
    if (judgment.result === "write") this.seal(judgment.draft);
    return judgment;
  }
  /** The answer of the host to one attempt, as an outcome with the basis `own-answer`. */
  answered(operation: OperationId, attempt: number, result: "confirmed" | "refused", body: unknown): OutcomeJudgment {
    return this.outcome(operation, attempt, result, { basis: "own-answer", body } as Evidence);
  }
  /** An attempt that no answer came for: the outcome that the driver offers, with the body that the owner's rule states for it. */
  lost(operation: OperationId, attempt: number): OutcomeJudgment {
    const of = this.state.operation(operation)!;
    const rule = this.rules.rules[destination.outcomes[of.kind]!.code]!;
    const body = rule.place === "outcome" ? (rule.rules.unknown?.(this.state, of, attempt, this.own) ?? null) : null;
    return this.outcome(operation, attempt, "unknown", { basis: "none", body } as Evidence);
  }

  /** The branch has its first head, by the STAND-IN outcome of `first-head`: its own answer, with a read back that shows the commit. The operation is the one that the genesis declared. */
  ready(): this {
    this.confirmed();
    if (this.answered("0:0", 1, "confirmed", { send: "accepted", seen: HEAD }).result !== "write") throw new Error("the stand-in first head was not written");
    return this;
  }

  /**
   * A `reserve` from the lane, and the outcome of its `judge`: by what is at hand, a STAND-IN, rita's `merge` is reserved. The
   * judge writes the entry's `observed`: the hand-written observations of the merger's key and of the rules, which the rule read.
   * It gives the publication, its `merge` entry, the entry that reserved it, and the push and the mint that the reservation opened.
   */
  reserved(over: Partial<Hand> = {}): { publication: number; merge: Entry; at: number; push: OperationId; mint: OperationId } {
    const { merge } = this.reserve();
    const publication = this.head.seq;
    this.read = reading(this.now, over);
    const judgment = this.answered(`${publication}:0`, 1, "confirmed", FOUND);
    if (judgment.result !== "write" || this.item(publication).state !== "reserved") throw new Error(`the reservation was not written: ${JSON.stringify(judgment)}`);
    const at = this.head.seq;
    return { publication, merge, at, push: `${at}:0`, mint: `${at}:1` };
  }

  /**
   * STAND-IN for the directory's `compromised` notice (section 12.1, "Messages between scopes"): a `tell` from the bureau, with the
   * key, its member and a `revoke-key` entry of membership that is made by hand.
   */
  compromised(who: Actor): Judgment {
    const entry = handMade(MEMBERSHIP, "revoke-key");
    const message: Request = { class: "request", type: "tell", body: { message: "compromised", fields: { key: who.key, member: who.member, entry: factRefOf(entry) } } };
    return this.from(this.bureau.at, "platform:directory", "compromised", message, [fetched(entry, "platform:membership")]).judgment;
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

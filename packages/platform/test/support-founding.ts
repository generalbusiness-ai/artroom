/**
 * For tests only: a register and a directory in memory. Nothing here is
 * exported from the package's main entry, and no production entry imports
 * it.
 *
 * Everything that is not the platform package's own data and rules is a
 * STAND-IN, and each is labelled where it is used.
 *
 * - `registerStandIns`: a rule for the one mark of the register's data that
 *   has no rule, `create-repository` (I3 deltas, entry EJ1). It selects the
 *   first repository, sets the claim's `repository`, and opens the two
 *   cleanups. It sends nothing: the judge of an outcome lets a rule send no
 *   creation. It shows the register's other rules, and nothing about how
 *   the selecting outcome will create a directory.
 * - `directoryStandIns`: a rule for each of the two marks of the
 *   directory's data that the authority note's table of marks does not
 *   list (`create-destination` and `import-spent`; entries EP6 and EP7).
 *   Each does what the note's row says in prose.
 * - `Directory`: a directory that a SCRIPTED register created. The
 *   register's outcome entry is judged with the stand-in rule, and the
 *   `create` that the unwritten rule will send is added to it by hand. The
 *   register's confirmation, and the genesis of each of the directory's
 *   three children, are entries made by hand. It shows the directory's
 *   rows and rules. It shows nothing of a founding.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Entry, FactRef, PlatformData, Request, Result, ScopeKind, ScopeRef, Seed, Send, SignedIntent } from "@generalbusiness/artroom-contract";
import { factRefOf, intentDigest, newIncarnation, scopeIdOf, seedDigest, signIntent } from "@generalbusiness/artroom-bytes";
import { PROFILES, clockOf, isObject, judgeDelivery, judgeGenesis, judgeOutcome, operationSettled, validateDefinition } from "@generalbusiness/artroom-derive";
import type { ActJudgment, Judgment, Opening, PlatformRules, Rules, Source, ValidDefinition } from "@generalbusiness/artroom-derive";
import { Ledger, T0, forged, keys, t, type Actor, type Context, type Over } from "@generalbusiness/artroom-derive/testing";
import { CREATION_ATTEMPTS, DIRECTORY, REGISTER, directory, directoryRules, directorySeed, register, registerRules } from "../src/index.ts";

export const { rita, una, vic, paul, sam } = keys;

const checked = (data: PlatformData): ValidDefinition => {
  const result = validateDefinition(JSON.parse(JSON.stringify(data)), PROPOSED_BOUNDS, PROFILES, { platform: true });
  if (!result.ok) throw new Error(`${data.name} is refused: ${JSON.stringify(result.problems)}`);
  return result.definition;
};
/** The register's and the directory's data, validated as a runtime validates them. */
export const registerDefinition = checked(register);
export const directoryDefinition = checked(directory);

/** The cleanups that one outcome entry of `create-repository` may open, in entries: two operations of three attempts each, with a first outcome and a late answer for each attempt. */
const CLEANUPS = 2 * (2 * CREATION_ATTEMPTS);

/**
 * STAND-IN for the rule of `create-repository` (section 12.1.1, the row "An
 * outcome of `create-repository`"; section 3.8, "First selection"). The
 * evidence of a `confirmed` outcome is `{ name, id }`, with `credential`
 * when the host returned one. This body is made up.
 */
export const registerStandIns: Rules = {
  "create-repository": {
    place: "outcome",
    rules: {
      selects: true, read: false, closure: CLEANUPS,
      retries: () => true,
      // First selection: the claim has no repository in this commit. The claim is the item that the entry of the operation opened.
      holds: (given, operation) => (given.state.item(Number(operation.id.split(":")[0]))?.values["repository"] ?? null) === null,
      wellFormed: (result, evidence) => result !== "confirmed" || (isObject(evidence.body) && typeof evidence.body["name"] === "string" && typeof evidence.body["id"] === "string"),
      derives: (given, operation, selected) => {
        const body = given.input.type === "outcome" && isObject(given.input.evidence.body) ? given.input.evidence.body : {};
        const held = given.state.page("register", ["open"], null, 1).items[0]!;
        const claim = Number(operation.id.split(":")[0]);
        const repository = { host: held.values["host"]!, namespace: held.values["namespace"]!, name: body["name"] as string, id: body["id"] as string };
        const cleanup = (kind: string): Opening => ({ owner: REGISTER, kind, attempts: CREATION_ATTEMPTS });
        return {
          effects: selected === true ? [{ effect: "value", item: claim, slot: "repository", value: repository }] : [],
          sends: [],
          opens: [...(selected !== null && body["credential"] !== undefined ? [cleanup("revoke-credential")] : []), ...(selected === false ? [cleanup("delete-repository")] : [])],
        };
      },
    },
  },
};

/** The register's rules with the stand-in: what a judge of these tests is given. */
export const registerPlatform: PlatformRules = { named: REGISTER, rules: { ...registerRules, ...registerStandIns } };

/**
 * STAND-INS: a rule for each mark of the directory's data that the note's
 * table of marks does not list.
 *
 * - `create-destination`: the `create` of the destination, as creation 2 of
 *   the genesis, with `import` as a truth value and the scope IDs of
 *   membership and of the rules scope, each the digest of the seed of
 *   creation 0 and of creation 1.
 * - `import-spent`: an `import` operation exists, each has its stated
 *   attempts opened and settled, and `imported` is not set. Its refusal is
 *   `import-not-spent`.
 */
export const directoryStandIns: Rules = {
  "create-destination": {
    place: "send",
    run: ({ input, resolved }) => {
      if (input.type !== "genesis") throw new Error("create-destination stands in the genesis");
      const cause = seedDigest(input.seed);
      const child = (kind: ScopeKind, name: string, ordinal: number): Seed => ({ v: 1, kind, definition: `platform:${name}@1` as Seed["definition"], creator: resolved.at, cause, ordinal });
      const { fields } = resolved;
      return {
        to: child("destination", "destination", 2),
        message: {
          class: "request", type: "create",
          body: {
            fields: {
              repository: fields["repository"], branch: fields["branch"], import: fields["import"] !== undefined, claim: fields["claim"], directory: resolved.at,
              membership: scopeIdOf(child("membership", "membership", 0)), rules: scopeIdOf(child("rules", "rules", 1)),
            },
          },
        },
      };
    },
  },
  "import-spent": {
    place: "guard", refusals: ["import-not-spent"],
    run: ({ state, own }) => {
      const head = state.scope()!.head.seq;
      const imports = Array.from({ length: head + 1 }, (_, seq) => own(seq)?.entry).flatMap((entry) =>
        (entry?.effects ?? []).flatMap((effect) => (effect.effect === "operation" && effect.kind === "import" ? [state.operation(`${entry!.seq}:${effect.k}`)!] : [])));
      const repository = state.page("repository", ["open"], null, 1).items[0];
      const spent = imports.length > 0 && imports.every((operation) => operation.attempts.length === operation.most && operationSettled(operation)) && (repository?.values["imported"] ?? null) === null;
      return spent ? { holds: true } : { holds: false, name: "import-not-spent" };
    },
  },
};

/** The directory's rules with the stand-ins: what a judge of these tests is given. */
export const directoryPlatform: PlatformRules = { named: DIRECTORY, rules: { ...directoryRules, ...directoryStandIns } };

function written(judgment: Judgment): Extract<Judgment, { result: "write" }>["draft"] {
  if (judgment.result !== "write") throw new Error(`not written: ${JSON.stringify(judgment)}`);
  return judgment.draft;
}

/** The founding intent of a register: an `install`, signed by that key, with `to: null`. */
export const installing = (who: Actor, policy: "keys" | "open", founders: readonly string[] | undefined, kind = "install"): SignedIntent =>
  signIntent({ v: 1, to: null, actor: who.key, kind, on: null, expected: {}, fields: { host: "git.example", namespace: "artroom", policy, ...(founders ? { founders: [...founders] } : {}) }, idempotencyKey: "install", notAfter: t(60) }, who.secret);

/** The seed of a register that an install intent asks for (the contract's section 7.1). */
export const registerSeed = (install: SignedIntent, over: Partial<Seed> = {}): Seed => ({ v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install.intent), ordinal: 0, ...over });

/**
 * A register in memory, founded by paul's `install` intent, with the policy
 * `keys` and rita's key as the one founder. Its genesis and its `found`
 * acts are judged by derive's judges with the register's own rules. An
 * outcome of `create-repository` is judged with the STAND-IN rule.
 */
export class Register extends Ledger {
  constructor(policy: "keys" | "open" = "keys", founders: readonly string[] | undefined = [rita.key]) {
    super(registerDefinition, "platform:register");
    const install = installing(paul, policy, founders);
    const seed = registerSeed(install);
    this.seal(written(judgeGenesis(this.state, registerDefinition, { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(7)), seed, founding: install }, { clock: clockOf(this.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: null, platform: registerPlatform })));
  }

  /** An act, judged with the register's rules. No grant is presented: no act of the register is judged on one. */
  override act(who: Actor, kind: string, over: Over = {}, context: Context = {}): ActJudgment {
    return super.act(who, kind, over, { platform: registerPlatform, grants: [], ...context });
  }

  /** A founding by that key: the `found` act, with the fields of a founding intent. Returns the judgment. */
  found(who: Actor, more: Record<string, string> = {}, key = "a founding"): ActJudgment {
    return this.act(who, "found", { expected: { register: this.item(0).revision }, fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key, ...more }, idempotencyKey: key });
  }

  /** The outcome of one attempt, as the operations driver offers it, judged with the register's rules and the STAND-IN for `create-repository`. Written when the judgment is to write. */
  outcome(operation: `${number}:${number}`, attempt: number, result: "confirmed" | "refused" | "unknown", body: unknown = null, basis: "own-answer" | "read" | "none" = result === "unknown" ? "none" : "own-answer", sends: readonly Send[] = []): Judgment {
    const judgment = judgeOutcome(this.state, registerDefinition, { type: "outcome", operation, attempt, result, evidence: { basis, body } }, { clock: clockOf(this.state, this.now), bounds: this.bounds, platform: registerPlatform, own: this.own });
    if (judgment.result === "write") this.seal({ ...judgment.draft, sends: [...judgment.draft.sends, ...sends] });
    return judgment;
  }
}

/** An entry of a scope that no judge wrote: MADE BY HAND, under that definition's name, at that time. */
export const scripted = (at: ScopeRef, seq: number, input: Entry["input"], sends: readonly Send[], under: string, time = T0): Source =>
  ({ entry: { ...forged(at, seq, input, sends).entry, time }, under });

/**
 * A directory in memory, below a SCRIPTED register: see the head of this
 * file. rita founds it. Its genesis, its acts, its handlers, its clauses and
 * the outcomes of its import are judged by derive's judges, with the
 * directory's rules and the stand-ins. Its acts are judged on the grants of
 * the test authority: every actor of the key set holds every action here.
 *
 * `children`: which of the three children answer `applied`, each from a
 * genesis MADE BY HAND. The directory records each result, which runs the
 * `applied` clause of that `create`.
 */
export class Directory extends Ledger {
  readonly register: Register;
  /** The fact of the register's `found` entry: the claim. */
  readonly claim: FactRef;
  /** The references of the scripted children that answered, by kind. */
  readonly children: Partial<Record<"membership" | "rules" | "destination", ScopeRef>> = {};

  constructor(over: { import?: string; confirmed?: boolean; children?: readonly ("membership" | "rules" | "destination")[] } = {}) {
    super(directoryDefinition, "platform:directory");
    const R = (this.register = new Register());
    const founding = R.intent(rita, "found", { expected: { register: R.item(0).revision }, fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key, ...(over.import === undefined ? {} : { import: over.import }) } });
    if (R.submit(founding, { platform: registerPlatform, grants: [] }).result !== "write") throw new Error("the founding was not admitted");
    const found = R.head.seq;
    this.claim = R.fact(found);
    // SCRIPTED: the selecting outcome, with the `create` that the unwritten rule of `create-repository` will send, added by hand.
    const seed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: R.at, cause: intentDigest(founding.intent), ordinal: 0 };
    const repository = { host: "git.example", namespace: "artroom", name: "repo-1", id: "r-1" };
    const create: Request = { class: "request", type: "create", body: { fields: { claim: this.claim, repository, branch: "main", founderHandle: "@rita", recoveryKey: sam.key, ...(over.import === undefined ? {} : { import: over.import }) } } };
    written(R.outcome(`${found}:0`, 1, "confirmed", { name: "repo-1", id: "r-1" }, "own-answer", [{ n: 0, to: seed, message: create }]));
    const sent = R.head.seq;
    // The directory's genesis: the real judge, with the fourth cause. The claim's entry is at hand, as a fetched fact.
    const context = () => ({ clock: clockOf(this.state, this.now), bounds: this.bounds, prepared: [], own: this.own, platform: directoryPlatform });
    this.seal(written(judgeGenesis(this.state, directoryDefinition, { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(8)), to: seed, from: R.fact(sent), n: 0, message: create },
      { ...context(), facts: [{ fact: this.claim, entry: R.entries[found]!.entry, under: R.under }], source: { entry: R.entries[sent]!.entry, under: R.under } })));
    if (over.confirmed === false) return;
    // SCRIPTED: the register's entry that records the directory's result, and its confirmation.
    const result = this.last.sends[0]!.message as Result;
    const recorded = scripted(R.at, sent + 1, { type: "delivery", from: this.fact(0), n: 0, message: result, clause: "applied" }, [{ n: 0, to: this.at, message: { class: "control", type: "confirm", genesis: this.fact(0) } }], R.under);
    this.take(recorded, 0);
    for (const kind of over.children ?? ["membership", "rules", "destination"]) this.answered(kind);
  }

  /** Judge the delivery of send `n` of a source entry. Nothing is written. */
  judgeDelivered(source: Source, n: number, facts: readonly { fact: FactRef; entry: Entry; under: string }[] = []): Judgment {
    const send = source.entry.sends.find((s) => s.n === n)!;
    const of = send.message.class === "result" ? send.message.of : null;
    const delivered = { to: send.to, from: factRefOf(source.entry), n, message: send.message };
    return judgeDelivery(this.state, directoryDefinition, delivered, { clock: clockOf(this.state, this.now), bounds: this.bounds, facts, prepared: [], own: this.own, source, origin: of ? (this.entries[of.from.seq]?.entry ?? null) : null, platform: directoryPlatform });
  }

  /** Judge the delivery of send `n` of a source entry, and write the entry. */
  take(source: Source, n: number, facts: readonly { fact: FactRef; entry: Entry; under: string }[] = []): Entry {
    return this.seal(written(this.judgeDelivered(source, n, facts)));
  }

  /**
   * SCRIPTED: the scope that the `create` at ordinal `n` of entry `seq` asks for answers it as applied, from a genesis made by
   * hand. The directory records the result, which runs the `applied` clause of that send. Returns the child's reference.
   */
  created(seq: number, n: number, under: string, mint = 30): ScopeRef {
    const send = this.entries[seq]!.entry.sends.find((s) => s.n === n)!;
    const seed = send.to as Seed;
    const at: ScopeRef = { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(mint + seed.ordinal)), kind: seed.kind };
    const genesis = scripted(at, 0, { type: "genesis", seed, inc: at.inc, kind: "establish", founding: null, source: this.fact(seq), n, message: send.message as Request, decision: "applied" },
      [{ n: 0, to: this.at, message: { class: "result", of: { from: this.fact(seq), n }, outcome: "applied" } }], under);
    // A clause reads again each fact that the fields of its origin entry name: for the genesis, the claim's entry, which it retained.
    this.take(genesis, 0, [{ fact: this.claim, entry: this.register.entries[this.claim.seq]!.entry, under: this.register.under }]);
    return at;
  }

  /** SCRIPTED: one child of the directory's genesis answers its `create` as applied. */
  answered(kind: "membership" | "rules" | "destination"): ScopeRef {
    const send = this.entries[0]!.entry.sends.find((s) => "kind" in s.to && s.to.kind === kind)!;
    return (this.children[kind] = this.created(0, send.n, `platform:${kind}`));
  }

  /** An act, judged with the directory's rules and the stand-ins, on the grants of the test authority. */
  override act(who: Actor, kind: string, over: Over = {}, context: Context = {}): ActJudgment {
    return super.act(who, kind, over, { platform: directoryPlatform, ...context });
  }

  /** The outcome of one attempt of an operation of the directory, judged with its rules. Written when the judgment is to write. */
  outcome(operation: `${number}:${number}`, attempt: number, result: "confirmed" | "refused" | "unknown", body: unknown = null, basis: "own-answer" | "read" | "none" = result === "unknown" ? "none" : "own-answer"): Judgment {
    const judgment = judgeOutcome(this.state, directoryDefinition, { type: "outcome", operation, attempt, result, evidence: { basis, body } }, { clock: clockOf(this.state, this.now), bounds: this.bounds, platform: directoryPlatform, own: this.own });
    if (judgment.result === "write") this.seal(judgment.draft);
    return judgment;
  }
}

/** The seed of the directory that a `found` entry of that register fixes, as the register's own rule states it. */
export { directorySeed };

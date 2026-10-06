/**
 * For tests only: a register and a directory in memory. Nothing here is
 * exported from the package's main entry, and no production entry imports
 * it.
 *
 * The rules of the register and of the directory are all the platform
 * package's: this file holds no rule. What is SCRIPTED, an entry made by
 * hand, is labelled where it is used.
 *
 * - `Directory`: a directory that a register in memory created. The
 *   register's `found` entry and its selecting outcome, with the `create`
 *   that its rule sends, are judged with the register's own rules. So
 *   is the register's entry that records the directory's result, with
 *   its clause and its confirmation. The genesis of each of the
 *   directory's three children is SCRIPTED: an entry made by hand. It shows the directory's
 *   rows and rules. A founding on scope objects is the scope package's
 *   (`packages/scope/test/founding-real.test.ts`).
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Digest, Entry, FactRef, PlatformData, Request, ScopeRef, Seed, Send, SignedIntent } from "@generalbusiness/artroom-contract";
import { factRefOf, intentDigest, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { PROFILES, clockOf, judgeDelivery, judgeGenesis, judgeOutcome, ownersOf, validateDefinition } from "@generalbusiness/artroom-derive";
import type { ActJudgment, Judgment, PlatformRules, Source, ValidDefinition } from "@generalbusiness/artroom-derive";
import { Ledger, T0, forged, keys, t, type Actor, type Context, type Over } from "@generalbusiness/artroom-derive/testing";
import { DIRECTORY, REGISTER, directory, directoryRules, directorySeed, register, registerRules, repositoryName } from "../src/index.ts";

export const { rita, una, vic, paul, sam } = keys;

const checked = (data: PlatformData): ValidDefinition => {
  const result = validateDefinition(JSON.parse(JSON.stringify(data)), PROPOSED_BOUNDS, PROFILES, { platform: true });
  if (!result.ok) throw new Error(`${data.name} is refused: ${JSON.stringify(result.problems)}`);
  return result.definition;
};
/** The register's and the directory's data, validated as a runtime validates them. */
export const registerDefinition = checked(register);
export const directoryDefinition = checked(directory);

/** The register's rules, as the package supplies them: what a judge of these tests is given. */
export const registerPlatform: PlatformRules = { named: REGISTER, rules: registerRules };

/** The directory's rules, as the package supplies them: what a judge of these tests is given. */
export const directoryPlatform: PlatformRules = { named: DIRECTORY, rules: directoryRules };

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
 * acts and the outcomes of its operations are judged by derive's judges
 * with the register's own rules.
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

  /**
   * The outcome of one attempt, as the operations driver offers it, judged with the register's rules. Written when the judgment is
   * to write. `body` undefined: for an `unknown`, the body that the owner's rule states for it, as the driver asks; for another
   * result, null.
   */
  outcome(operation: `${number}:${number}`, attempt: number, result: "confirmed" | "refused" | "unknown", body?: unknown, basis: "own-answer" | "read" | "none" = result === "unknown" ? "none" : "own-answer"): Judgment {
    const judgment = judgeOutcome(this.state, registerDefinition, { type: "outcome", operation, attempt, result, evidence: { basis, body: body === undefined ? unknownBody(this, registerDefinition, registerPlatform, operation, attempt, result) : body } }, { clock: clockOf(this.state, this.now), bounds: this.bounds, platform: registerPlatform, own: this.own });
    if (judgment.result === "write") this.seal(judgment.draft);
    return judgment;
  }
}

/** The body that the runtime's driver offers for an outcome with no answer: the one that the owner's rule states for an `unknown`, or null (`scope/src/operations.ts`). */
function unknownBody(ledger: Ledger, definition: ValidDefinition, platform: PlatformRules, operation: `${number}:${number}`, attempt: number, result: string): unknown {
  const of = ledger.state.operation(operation);
  return (result === "unknown" && of && ownersOf(definition, platform, null)?.rules(of.owner, of.kind)?.unknown?.(ledger.state, of, attempt, ledger.own)) ?? null;
}

/** An entry of a scope that no judge wrote: MADE BY HAND, under that definition's name, at that time. */
export const scripted = (at: ScopeRef, seq: number, input: Entry["input"], sends: readonly Send[], under: string, time = T0): Source =>
  ({ entry: { ...forged(at, seq, input, sends).entry, time }, under });

/**
 * A directory in memory, below a SCRIPTED register: see the head of this
 * file. rita founds it. Its genesis, its acts, its handlers, its clauses and
 * the outcomes of its import are judged by derive's judges, with the
 * directory's own rules. Its acts are judged on the grants of
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
    // The selecting outcome, judged with the register's own rules: its send `create-directory` gives the `create` of the directory.
    const repository = { host: "git.example", namespace: "artroom", name: repositoryName(R.item(found).values["seed"] as Digest, 1), id: "r-1" };
    written(R.outcome(`${found}:0`, 1, "confirmed", { name: repository.name, id: "r-1" }));
    const { to: seed, message: create } = R.last.sends[0] as { to: Seed; message: Request };
    const sent = R.head.seq;
    // The directory's genesis: the real judge, with the fourth cause. The claim's entry is at hand, as a fetched fact.
    const context = () => ({ clock: clockOf(this.state, this.now), bounds: this.bounds, prepared: [], own: this.own, platform: directoryPlatform });
    this.seal(written(judgeGenesis(this.state, directoryDefinition, { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(8)), to: seed, from: R.fact(sent), n: 0, message: create },
      { ...context(), facts: [{ fact: this.claim, entry: R.entries[found]!.entry, under: R.under }], source: { entry: R.entries[sent]!.entry, under: R.under } })));
    if (over.confirmed === false) return;
    // The register records the directory's `applied` result, judged with its own rules: the clause `applied` of the send runs the
    // mark `claim-active`, and the entry sends the confirmation, which makes the directory active.
    const result = this.last.sends[0]!;
    R.seal(written(judgeDelivery(R.state, registerDefinition, { to: result.to, from: this.fact(0), n: 0, message: result.message },
      { clock: clockOf(R.state, R.now), bounds: R.bounds, facts: [], prepared: [], own: R.own, source: { entry: this.last, under: this.under }, origin: R.entries[sent]!.entry, platform: registerPlatform })));
    this.take({ entry: R.last, under: R.under }, 0);
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

  /** An act, judged with the directory's rules, on the grants of the test authority. */
  override act(who: Actor, kind: string, over: Over = {}, context: Context = {}): ActJudgment {
    return super.act(who, kind, over, { platform: directoryPlatform, membership: this.children.membership ?? null, observing: { membership: this.children.membership ?? null, rules: this.children.rules ?? null, content: () => ({ singleControllerException: true, extents: true }) }, ...context });
  }

  /** The outcome of one attempt of an operation of the directory, judged with its rules. Written when the judgment is to write. `body` undefined: as for `Register.outcome`. */
  outcome(operation: `${number}:${number}`, attempt: number, result: "confirmed" | "refused" | "unknown", body?: unknown, basis: "own-answer" | "read" | "none" = result === "unknown" ? "none" : "own-answer"): Judgment {
    const judgment = judgeOutcome(this.state, directoryDefinition, { type: "outcome", operation, attempt, result, evidence: { basis, body: body === undefined ? unknownBody(this, directoryDefinition, directoryPlatform, operation, attempt, result) : body } }, { clock: clockOf(this.state, this.now), bounds: this.bounds, platform: directoryPlatform, own: this.own });
    if (judgment.result === "write") this.seal(judgment.draft);
    return judgment;
  }
}

/** The seed of the directory that a `found` entry of that register fixes, as the register's own rule states it. */
export { directorySeed };

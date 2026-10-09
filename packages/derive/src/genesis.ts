/**
 * The judge of a genesis (scope contract, sections 7.1 and 7.2): the first
 * entry of a scope with no creator, which a signed intent asks for, and of
 * a child, which a `create` send of its creator asks for.
 *
 * A scope with no creator is the founding register, which an `install`
 * intent founds under `platform:register` (section 7.1). The first delivery
 * founded a directory with no creator, by a `found` intent, as its stand-in
 * for a register (section 7.2, "Where each scope reads its closure"). That
 * founding stays, for the scopes of today's tests, and it is never of the
 * kind `register` or under the register's definition.
 */

import type { Entry, FactRef, FactUse, GrantMark, Incarnation, Prepared, Reason, Request, ScopeId, ScopeRef, Seed, Send, SignedIntent } from "@generalbusiness/artroom-contract";
import { deliveryCauseDigest, intentDigest, isDigest, isIncarnation, isSeed, messageDigest, scopeIdOf, seedDigest, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { judgeDelivery, reasonOf, sentBy, type DeliveryContext } from "./delivery.ts";
import { creationFields, isEntryOf, isIntent, readFacts, readFields, useOf } from "./fields.ts";
import type { Fetched, Judging } from "./guards.ts";
import { derive, giving } from "./handlers.ts";
import { withinCounts } from "./draws.ts";
import { fieldOutsideType, grantByRule, markOf, unjudged, type JudgedInput } from "./marks.ts";
import { directoryOf } from "./sends.ts";
import { creationContextOf } from "./creation-context.ts";
import type { Judgment } from "./judge.ts";
import type { StateView } from "./state.ts";
import { timeMs } from "./time.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isFactRef, isLocalId, isObject, own, same } from "./values.ts";

/**
 * What asks for a directory (section 7.1). `name` is the name of the object
 * that was reached. `inc` is minted at random by the caller, in the
 * transaction that writes the entry (section 2.2).
 */
export interface Founding { name: ScopeId; inc: Incarnation; seed: Seed; founding: SignedIntent }

/** What asks for a child (section 7.2): the delivery of a `create`, which is addressed by its seed. */
export interface Creation { name: ScopeId; inc: Incarnation; to: Seed; from: FactRef; n: number; message: Request }

/** The name that the founding register's definition states (section 7.1; authority note, section 12.1). */
const REGISTER = "platform:register";

/**
 * Section 7.2, "The kinds of cause", the fourth row: the act that opened the
 * operation of an outcome entry. An operation's ID is the `seq` of the entry
 * that opened it and its ordinal there (section 4.1), so the outcome names
 * that entry's position. A foreign entry is read by its fact (section 7.4),
 * and a position alone names no bytes. So the opening entry is one that the
 * creation itself names by a fact among its fields, as the register's
 * `create` names the `found` entry in `claim` (authority note, section
 * 12.1). The source entry seals that message, and so that fact's hash.
 *
 * The entry is of the creator, at that position, earlier than the outcome,
 * and it holds the `operation` record of that ordinal. Null: no entry at
 * hand is that one (I3 deltas, entry EP1).
 */
function openerOf(source: Entry, message: Request, facts: readonly Fetched[]): Entry | null {
  if (source.input.type !== "outcome") return null;
  const [seq, k] = source.input.operation.split(":").map(Number);
  const fields = isObject(message.body) && isObject(message.body["fields"]) ? Object.values(message.body["fields"]) : [];
  const named = (fact: FactRef): boolean => fields.some((value) => isFactRef(value) && same(value, fact));
  const found = facts.find(({ fact, entry }) => same(fact.at, source.at) && fact.seq === seq && fact.seq < source.seq && named(fact) && isEntryOf(entry, fact));
  return found?.entry.effects.some((effect) => effect.effect === "operation" && effect.k === k) ? found.entry : null;
}

/**
 * Section 7.2, the four kinds of cause: the seed's cause matches the source
 * entry by the kind of that entry's input, each in its own byte domain. For
 * an outcome it is the digest of the intent of the act that opened the
 * outcome's operation, in the domain of an act's intent. `facts`: the
 * foreign entries at hand, among which that act's entry is looked for.
 */
function causeOf(source: Entry, message: Request, facts: readonly Fetched[]): Seed["cause"] | null {
  const input = source.input;
  if (input.type === "act") return intentDigest(input.signed.intent);
  if (input.type === "delivery") return deliveryCauseDigest({ v: 1, from: input.from, n: input.n, message: messageDigest(input.message) });
  if (input.type === "genesis") return seedDigest(input.seed);
  if (input.type === "outcome") {
    const opener = openerOf(source, message, facts)?.input;
    return opener?.type === "act" ? intentDigest(opener.signed.intent) : null;
  }
  return null;
}

/**
 * A genesis is written when its proof holds, whatever its genesis act then
 * decides: `applied`, or `refused`, which is terminal. A proof that fails is
 * `source-unverified` and writes nothing. The scope is provisional after an
 * applied child genesis and active after a directory's; the fold derives
 * that, and which of the entry's sends are held, from the entry.
 *
 * In platform data the genesis act may hold marks, and each rule is run at
 * the check of its place, as for an act (section 4.2). A fault of a rule
 * leaves the genesis not judged, and nothing is written (section 6.1).
 */
export function judgeGenesis(view: StateView, definition: ValidDefinition, asked: Founding | Creation, context: DeliveryContext): Judgment {
  return withinCounts(view, definition, unjudged(() => genesisJudged(view, definition, asked, context)));
}

function genesisJudged(view: StateView, definition: ValidDefinition, asked: Founding | Creation, context: DeliveryContext): Judgment {
  const unverified = (detail: string): Judgment => ({ result: "source-unverified", detail });
  const { clock, bounds } = context;
  const founding = "founding" in asked ? asked.founding : null;
  const seed = "founding" in asked ? asked.seed : asked.to;
  if (!isIncarnation(asked.inc)) throw new Error("the caller mints the incarnation");

  // Section 2.3: at genesis a scope checks that the digest of the seed equals its own name.
  if (!isSeed(seed) || scopeIdOf(seed) !== asked.name) return unverified("the name is not the digest of the seed");
  const existing = view.scope();
  if (existing) {
    // A repeat is answered from the genesis and adds nothing.
    if (!("founding" in asked)) return judgeDelivery(view, definition, asked, context);
    return existing.at.scope === asked.name && verifySignedIntent(asked.founding) && intentDigest(asked.founding.intent) === seed.cause ? { result: "repeat", seq: 0 } : unverified("the scope has another genesis");
  }
  if (isDigest(seed.definition) && seed.definition !== definition.digest) return unverified("the seed names another definition");

  let source: Fetched | null = null;
  if ("founding" in asked) {
    // Section 7.1: the founder's signature commits to the inputs of the seed, and the intent's digest is the seed's cause.
    const intent = asked.founding.intent;
    if (!verifySignedIntent(asked.founding) || !isIntent(intent)) return unverified("not a signed intent");
    // The register is founded by an `install` intent, under its own definition and no other. A directory with no creator is the
    // first delivery's stand-in, by a `found` intent. No other kind of scope has no creator.
    const asks = seed.kind === "register" ? "install" : seed.kind === "directory" ? "found" : null;
    if (seed.creator !== null || asks === null || (seed.kind === "register") !== (definition.declared.name === REGISTER) || seed.ordinal !== 0 || intentDigest(intent) !== seed.cause) return unverified("the seed is not the one this founding intent asks for");
    if (intent.to !== null || intent.kind !== asks || intent.on !== null || Object.keys(intent.expected).length > 0) return { result: "refused", reason: "bad-intent", detail: `a founding intent has kind ${asks}, and names no scope and no item` };
    const now = timeMs(clock.reading)!;
    const notAfter = timeMs(intent.notAfter)!;
    if (now >= notAfter) return { result: "refused", reason: "expired", detail: "notAfter" };
    if (notAfter - now > bounds.intentLifetimeSeconds * 1000) return { result: "refused", reason: "bad-intent", detail: "notAfter is further ahead than an intent may live" };
  } else {
    // Section 7.2, "What the child checks at step 2".
    if (!isFactRef(asked.from) || !isLocalId(asked.n) || !seed.creator || !same(seed.creator, asked.from.at)) return unverified("the source is not the creator the seed names");
    if (!isObject(asked.message) || asked.message.class !== "request" || asked.message.type !== "create") return unverified("not a creation request");
    if (!context.source) return { result: "unavailable", reason: "dependency-unavailable" };
    if (!sentBy(context.source.entry, asked)) return unverified("the source entry holds no create at that ordinal with that seed and that message");
    if (causeOf(context.source.entry, asked.message, context.facts) !== seed.cause) return unverified("the seed's cause does not match the source entry");
    source = { fact: asked.from, entry: context.source.entry, under: context.source.under };
  }

  const at: ScopeRef = { scope: asked.name, inc: asked.inc, kind: seed.kind };
  const child = "founding" in asked ? null : asked;
  const result = (outcome: "applied" | "refused", reason?: Reason): Send[] =>
    (child ? [{ n: 0, to: child.from.at, message: { class: "result", of: { from: child.from, n: child.n }, outcome, ...(reason ? { reason } : {}) } }] : []);
  // Section 4.1: the genesis states its act kind, from the definition that the scope pins. No sender supplies it. A refused genesis holds it too.
  const input = (decision: "applied" | "refused") =>
    ({ type: "genesis", seed, inc: asked.inc, kind: definition.declared.genesis, founding, source: child?.from ?? null, n: child?.n ?? null, message: child?.message ?? null, decision }) as const;
  const sourceUse = source ? [useOf(source.fact, source.entry)] : [];
  /**
   * Section 7.2: a refused genesis is written, sends its `refused` result and
   * nothing else, and is terminal. Section 9.2: it records what its judgment
   * read: the source entry, each named fact once those are read, and each rule
   * result a guard read before the refusal.
   */
  const refuse = (reason: Reason, uses: readonly FactUse[] = sourceUse, prepared: readonly Prepared[] = []): Judgment =>
    ({ result: "write", draft: { input: input("refused"), uses, prepared, effects: [], sends: result("refused", reason), judgesTime: founding !== null } });

  // The source proved the whole message above. Reserved metadata is separate
  // from domain fields; an invalid opt-in is a terminal refusal, with no
  // declared child sends. An absent marker preserves the legacy judgment.
  if (child && creationContextOf(child.message.body).kind === "invalid") return refuse({ code: "bad-field" });

  // The genesis act, with the opener's parties from the creation message, or with the founding intent's fields. It has no signer:
  // nobody signs for a scope that does not exist yet, and the founding rule is the authority note's.
  const act = own(definition.declared.acts, definition.declared.genesis)!;
  const given = founding ? founding.intent.fields : creationFields(child!.message, child!.from, act.fields);
  const read = given ? readFields(act.fields, given, bounds) : null;
  if (!read?.ok) return refuse({ code: "bad-field" });
  // A scope has no entry before its genesis, so a fact that names it names nothing: `fact-mismatch`.
  const named = readFacts(view, act.fields, read.fields, source ? [...context.facts, source] : context.facts, { at, own: () => null, texts: context.texts });
  if (named.result === "unavailable") return { result: "unavailable", reason: "dependency-unavailable" };
  /** The source entry, then each named fact that was read. The source is recorded once. */
  const uses = [...sourceUse, ...named.uses.filter((u) => u.fact.hash !== source?.fact.hash)];
  // A field that names a local item names nothing: no item exists before a genesis. The facts read before it are recorded.
  if (named.result !== "read") return refuse({ code: named.result }, uses);
  // Platform data: what a rule of the genesis act is given (section 6.1). Check 7: a field whose type is a mark is checked by its rule.
  const clocked = { clock: false };
  const judged: JudgedInput = { type: "genesis", seed, founding, source: child?.from ?? null, n: child?.n ?? null, message: child?.message ?? null };
  const g = giving(view, context, { at, creator: seed.creator }, 0, judged, clocked, named.fields, named.facts, source ?? undefined);
  if (fieldOutsideType(g, act.fields)) return refuse({ code: "bad-field" }, uses);
  // Section 4.2, "A founding": the genesis of a scope with no creator makes no check 9. When the genesis act's `grant` is a mark,
  // its rule is run, after the signature and the seed are checked. A founding that the rule does not pass is refused
  // `unauthorized`, and nothing is written: no scope exists on an authority that was not shown. The genesis of a child runs no
  // such rule: its authority is its creator's entry.
  const mark = founding ? (markOf(act.grant) as GrantMark | null) : null;
  const passed = mark ? grantByRule(g, mark) : null;
  if (passed && !passed.pass) return { result: "refused", reason: "unauthorized", detail: `the rule ${mark!.code} does not pass the founding key${passed.name === undefined ? "" : `: ${passed.name}`}` };
  const signer = passed?.pass && passed.member ? { member: passed.member, principal: null } : null;

  const j: Judging = {
    view, definition, bounds, clock, scope: { at, creator: seed.creator }, self: 0, kind: definition.declared.genesis, fields: named.fields, fieldTypes: act.fields,
    subjects: new Map(), signer, facts: named.facts, prepared: context.prepared, used: [], asked: context.asked, capabilities: context.capabilities,
    platform: context.platform, judged, ran: clocked, source: source ?? undefined,
  };
  // A child's result is at ordinal 0; the sends its act declares follow. Each scope a genesis creates has that genesis's own seed digest as its cause.
  // Section 6.6: the scope records its directory with this entry: its creator, or the directory that its creator put in the creation.
  const ran = derive(j, act, act.on, seedDigest(seed), child ? 1 : 0, directoryOf({ seed, message: child?.message ?? null }));
  if (ran.result === "unavailable") return ran;
  if (ran.result === "refused") return refuse(reasonOf(ran), uses, ran.prepared);
  // No item exists before a genesis, so no transition is due (section 5.2, step 6.3), and no entry precedes it, so the clock is not behind.
  return { result: "write", draft: { input: input("applied"), uses, prepared: ran.prepared, effects: ran.effects, sends: [...result("applied"), ...ran.sends], judgesTime: founding !== null || ran.judgesTime } };
}

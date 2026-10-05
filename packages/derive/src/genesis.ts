/**
 * The judge of a genesis (scope contract, sections 7.1 and 7.2): the first
 * entry of a repository's directory, which a founder's signed intent asks
 * for, and of a child, which a `create` send of its creator asks for.
 */

import type { Entry, FactRef, FactUse, Incarnation, Prepared, Request, Result, ScopeId, ScopeRef, Seed, Send, SignedIntent } from "@generalbusiness/artroom-contract";
import { deliveryCauseDigest, intentDigest, isDigest, isIncarnation, messageDigest, scopeIdOf, seedDigest, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { judgeDelivery, sentBy, type DeliveryContext } from "./delivery.ts";
import { creationFields, derive, isIntent, readFacts, readFields, useOf } from "./frame.ts";
import type { Fetched, Judging } from "./guards.ts";
import type { Judgment } from "./judge.ts";
import type { StateView } from "./state.ts";
import { timeMs } from "./time.ts";
import type { ValidDefinition } from "./validate.ts";
import { SCOPE_KINDS, isFactRef, isLocalId, isObject, isScopeRef, same } from "./values.ts";

/**
 * What asks for a directory (section 7.1). `name` is the name of the object
 * that was reached. `inc` is minted at random by the caller, in the
 * transaction that writes the entry (section 2.2).
 */
export interface Founding { name: ScopeId; inc: Incarnation; seed: Seed; founding: SignedIntent }

/** What asks for a child (section 7.2): the delivery of a `create`, which is addressed by its seed. */
export interface Creation { name: ScopeId; inc: Incarnation; to: Seed; from: FactRef; n: number; message: Request }

function isSeed(v: unknown): v is Seed {
  return isObject(v) && Object.keys(v).length === 6 && v["v"] === 1 && SCOPE_KINDS.includes(v["kind"] as never) && typeof v["definition"] === "string"
    && (v["creator"] === null || isScopeRef(v["creator"])) && isDigest(v["cause"]) && isLocalId(v["ordinal"]);
}

/**
 * Section 7.2, the three kinds of cause: the seed's cause matches the source
 * entry by the kind of that entry's input, each in its own byte domain.
 */
function causeOf(source: Entry): Seed["cause"] | null {
  const input = source.input;
  if (input.type === "act") return intentDigest(input.signed.intent);
  if (input.type === "delivery") return deliveryCauseDigest({ v: 1, from: input.from, n: input.n, message: messageDigest(input.message) });
  if (input.type === "genesis") return seedDigest(input.seed);
  return null;
}

/**
 * A genesis is written when its proof holds, whatever its genesis act then
 * decides: `applied`, or `refused`, which is terminal. A proof that fails is
 * `source-unverified` and writes nothing. The scope is provisional after an
 * applied child genesis and active after a directory's; the fold derives
 * that, and which of the entry's sends are held, from the entry.
 */
export function judgeGenesis(view: StateView, definition: ValidDefinition, asked: Founding | Creation, context: DeliveryContext): Judgment {
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
    if (seed.creator !== null || seed.kind !== "directory" || seed.ordinal !== 0 || intentDigest(intent) !== seed.cause) return unverified("the seed is not the one this founding intent asks for");
    if (intent.to !== null || intent.kind !== "found" || intent.on !== null || Object.keys(intent.expected).length > 0) return { result: "refused", reason: "bad-intent", detail: "a founding intent has kind found, and names no scope and no item" };
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
    if (causeOf(context.source.entry) !== seed.cause) return unverified("the seed's cause does not match the source entry");
    source = { fact: asked.from, entry: context.source.entry, under: context.source.under };
  }

  const at: ScopeRef = { scope: asked.name, inc: asked.inc, kind: seed.kind };
  const child = "founding" in asked ? null : asked;
  const result = (outcome: "applied" | "refused", reason?: Result["reason"]): Send[] =>
    (child ? [{ n: 0, to: child.from.at, message: { class: "result", of: { from: child.from, n: child.n }, outcome, ...(reason ? { reason } : {}) } }] : []);
  const input = (decision: "applied" | "refused") =>
    ({ type: "genesis", seed, inc: asked.inc, founding, source: child?.from ?? null, n: child?.n ?? null, message: child?.message ?? null, decision }) as const;
  const sourceUse = source ? [useOf(source.fact, source.entry)] : [];
  /**
   * Section 7.2: a refused genesis is written, sends its `refused` result and
   * nothing else, and is terminal. Section 9.2: it records what its judgment
   * read: the source entry, each named fact once those are read, and each rule
   * result a guard read before the refusal.
   */
  const refuse = (reason: NonNullable<Result["reason"]>, uses: readonly FactUse[] = sourceUse, prepared: readonly Prepared[] = []): Judgment =>
    ({ result: "write", draft: { input: input("refused"), uses, prepared, effects: [], sends: result("refused", reason), judgesTime: founding !== null } });

  // The genesis act, with the opener's parties from the creation message, or with the founding intent's fields. It has no signer:
  // nobody signs for a scope that does not exist yet, and the founding rule is the authority note's.
  const act = definition.declared.acts[definition.declared.genesis]!;
  const given = founding ? founding.intent.fields : creationFields(child!.message, child!.from);
  const read = given ? readFields(act.fields, given, bounds) : null;
  if (!read?.ok) return refuse("bad-field");
  const named = readFacts(view, act.fields, read.fields, source ? [...context.facts, source] : context.facts);
  if (named.result === "unavailable") return { result: "unavailable", reason: "dependency-unavailable" };
  /** The source entry, then each named fact that was read. The source is recorded once. */
  const uses = [...sourceUse, ...named.uses.filter((u) => u.fact.hash !== source?.fact.hash)];
  // A field that names a local item names nothing: no item exists before a genesis. The facts read before it are recorded.
  if (named.result === "no-item") return refuse("no-item", uses);

  const j: Judging = {
    view, definition, bounds, clock, scope: { at, creator: seed.creator }, self: 0, kind: definition.declared.genesis, fields: read.fields, fieldTypes: act.fields,
    subjects: new Map(), signer: null, facts: named.facts, prepared: context.prepared, used: [], asked: context.asked,
  };
  // A child's result is at ordinal 0; the sends its act declares follow. Each scope a genesis creates has that genesis's own seed digest as its cause.
  const ran = derive(j, act, act.on, seedDigest(seed), child ? 1 : 0);
  if (ran.result === "unavailable") return ran;
  if (ran.result === "refused") return refuse(ran.reason, uses, ran.prepared);
  // No item exists before a genesis, so no transition is due (section 5.2, step 6.3), and no entry precedes it, so the clock is not behind.
  return { result: "write", draft: { input: input("applied"), uses, prepared: ran.prepared, effects: ran.effects, sends: [...result("applied"), ...ran.sends], judgesTime: founding !== null || ran.judgesTime } };
}

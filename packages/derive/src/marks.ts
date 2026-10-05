/**
 * Platform code: the rules of a platform definition, and how a judge is
 * given them (scope contract, revision 15, sections 4.2, 6.1 and 9.3;
 * authority note, revision 20, section 12.1). One version of a platform
 * definition is its data and its rules. The data holds a mark, `{ code, row
 * }`, at each place where a rule is needed, and `code` names the rule. A
 * rule is run where a written form of the kind of its place would be
 * derived. It replaces no written form and removes none.
 *
 * This package holds no rule of a platform definition. A judge is given
 * the rules with its reading, as it is given the rules of a capability. A
 * runtime and a verifier give a rule the same six things, and no other. So
 * the same version derives the same bytes.
 *
 * A rule returns values in the contract's forms. An entry gains no member,
 * and nothing in an entry says that a rule ran.
 */

import type { ActType, AlsoMark, Attempt, Bounds, CapabilityName, Digest, DomainTag, Effect, Evidence, FactRef, FieldType, FieldValue, Grant, GrantMark, Guard, KeyId, Mark, MemberId, MemberRef, Message, ObservationUse, OperationId, PlatformDefinition, Request, ScopeRef, Seed, SignedIntent, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, digestBytes, domainBytes, isDigest, isFieldValue, isMemberRef, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import type { Signer } from "./attribution.ts";
import type { Own } from "./fields.ts";
import type { Fetched, GuardResult, Judging } from "./guards.ts";
import type { Opening } from "./ledger.ts";
import type { Item, Operation, StateView } from "./state.ts";
import { valuePlaces } from "./validate/fields.ts";
import type { MarkKind, ValidDefinition } from "./validate/index.ts";
import { isObject, own } from "./values.ts";

/**
 * The input of the entry that is judged, whole, as it arrived (section 6.1,
 * "What a rule is given", item 2): an act's signed intent, whose `actor` is
 * the signing key, with the grant and what was presented beside it; a
 * genesis's seed, with the founding intent or the creation request; a
 * delivery's `from` and message; an outcome's evidence; and a diagnosis's
 * attempt log, for a mark in the `undelivered` clause that it runs.
 *
 * `grant`, of an act: the grant that check 9 judged. Null: none was judged
 * yet, as at checks 7 and 8, or the act's `grant` is a mark and no grant is
 * held.
 */
export type JudgedInput =
  | { readonly type: "act"; readonly signed: SignedIntent; readonly grant: Grant | null; readonly presented: Readonly<Record<string, unknown>> }
  | { readonly type: "genesis"; readonly seed: Seed; readonly founding: SignedIntent | null; readonly source: FactRef | null; readonly n: number | null; readonly message: Request | null }
  | { readonly type: "delivery"; readonly from: FactRef; readonly n: number; readonly message: Message }
  | { readonly type: "outcome"; readonly operation: OperationId; readonly attempt: number; readonly owner: CapabilityName | PlatformDefinition; readonly kind: string; readonly result: "confirmed" | "refused" | "unknown"; readonly evidence: Evidence }
  | { readonly type: "diagnosis"; readonly of: { seq: number; n: number }; readonly attempts: readonly Attempt[] };

/**
 * The subject of a further observation that a rule reads (section 16.1,
 * "An observation outside a grant"): one key, one member, or what the rules
 * scope holds, by what was asked of it.
 */
export type Observed = { key: KeyId } | { member: MemberId } | { asked: "rules" | "definitions" };

/** A value beside an intent that a rule read (section 6.2): its byte domain, its digest in that domain, and its canonical bytes. */
export interface ValueRead { domain: string; digest: Digest; bytes: string }

/**
 * What is at hand for one entry beside its input, and what the rules of its
 * row read of it (sections 4.1, 6.2 and 16.1).
 *
 * `observed`: the further observations that the scope read before the turn
 * for this input, each with its read and its use, and each already judged
 * by the guards of section 16.1. A verifier gives the records of the
 * entry's own `observed`. `values`: each value that came beside the intent,
 * as its canonical bytes; a verifier gives the values that the entry
 * retains. `read`: what a rule read of the two, in the order of the reads.
 *
 * The entry retains exactly what its rules read. An observation that no
 * rule reads is not written, and a value that no rule reads is not kept.
 * So an entry of a row whose rules read neither has the bytes it had.
 *
 * I3 merge: the judge of an act is given both and writes `observed`
 * (`judge.ts`). Three things are owed in modules of other steps, and until
 * then a rule that reads either is given none there and its guard is not
 * completed. The judges of a result's delivery and of an outcome build no
 * `AtHand` and write no `observed` (`delivery.ts`, `handlers.ts` and
 * `outcomes.ts`). The scope makes no further read before a turn, reads no
 * `values` from what came beside an intent and keeps no value
 * (`scope/src/core.ts`, with the store). A replay is given the retained
 * value of each place that the pinned data states, and none for a row whose
 * rule holds the domain in its own code (`replay/src/verify.ts`). The I3
 * deltas note, entries EM1 to EM4 and EX4 to EX6, has the lines.
 */
export interface AtHand {
  readonly observed: readonly ObservationUse[];
  readonly values: readonly string[];
  readonly read: { observed: ObservationUse[]; values: ValueRead[] };
  /**
   * Section 6.2, "How a version states a place" (revision 19): the places of
   * the act that name a value, as its pinned data states them, each with the
   * digest that its field holds in this intent. Empty: the data states none,
   * as for every act of a declared definition.
   */
  readonly places: readonly Placed[];
}

/** One place of an act, in one intent: the field, the byte domain and the bound that the data states, and the digest that the field holds. */
export interface Placed { field: string; domain: string; max: number; digest: Digest }

/** What is at hand for one entry: the observations and the values that its judge was given, and the places of its act that name a value. */
export const atHand = (observed: readonly ObservationUse[] | undefined, values: readonly string[] | undefined, places: readonly Placed[] = []): AtHand =>
  ({ observed: observed ?? [], values: values ?? [], read: { observed: [], values: [] }, places });

/**
 * The places of an act that an intent sets (section 6.2): each field that
 * states `value` in the pinned data and that holds a digest in the fields
 * as read.
 */
export const placesOf = (types: Readonly<Record<string, unknown>> | undefined, fields: Readonly<Record<string, FieldValue>>): Placed[] =>
  valuePlaces(types).flatMap((place) => { const digest = own(fields, place.field); return isDigest(digest) ? [{ ...place, digest }] : []; });

/**
 * One value at hand, matched by its digest in one byte domain (section
 * 6.2). Bytes that are not the canonical form of a JSON value, and a value
 * that is longer than the bound of its domain, are no value at hand. The
 * entry retains a value that is matched, once for a domain and a digest.
 * Undefined: none at hand has that digest.
 */
function matched(hand: AtHand | undefined, domain: string, digest: Digest, most: number): unknown {
  for (const bytes of hand?.values ?? []) {
    if (typeof bytes !== "string" || utf8(bytes).length > most) continue;
    let value: unknown;
    try {
      value = parseStrict(bytes);
      if (canonicalize(value) !== bytes || valueDigest(domain, value) !== digest) continue;
    } catch {
      continue;
    }
    if (hand && !hand.read.values.some((read) => read.domain === domain && read.digest === digest)) hand.read.values.push({ domain, digest, bytes });
    return value;
  }
  return undefined;
}

/**
 * Section 6.2, "The checks, in the commit", with the places that the data
 * states: the name of the first field that names a value and has none at
 * hand, or null. That is so when no value came under its digest, when the
 * bytes that came are not the canonical form of a JSON value, and when the
 * value is longer than the bound of its domain. The input is then refused
 * `bad-field`. A value that a place names is kept with the entry.
 */
export function placeWithoutValue(hand: AtHand | undefined): string | null {
  for (const place of hand?.places ?? []) if (matched(hand, place.domain, place.digest, place.max) === undefined) return place.field;
  return null;
}

/**
 * What the entry retains of what was at hand: each observation that a rule
 * read, once, in ascending order of `read.n` (section 4.1), and each value
 * that a rule read, once for a domain and a digest (section 6.2).
 */
export function retainedOf(hand: AtHand | undefined): { observed: readonly ObservationUse[]; values: readonly ValueRead[] } {
  return { observed: [...(hand?.read.observed ?? [])].sort((a, b) => a.read.n - b.read.n), values: hand?.read.values ?? [] };
}

/** True when a retained observation is of that subject. An observation of a key has no member `subject`. */
const isOf = (use: ObservationUse, subject: Observed): boolean => {
  const o = use.observation;
  if ("key" in subject) return !("subject" in o) && o.key === subject.key;
  if ("member" in subject) return "subject" in o && o.subject === "member" && o.member === subject.member;
  return "subject" in o && o.subject === "rules" && o.content.asked === subject.asked;
};

/**
 * The digest of one value in one byte domain (section 6.2, "What a value
 * is"): over the domain tag, a newline and the value's canonical bytes,
 * like every digest of the contract. The domain is one that the contract
 * names, or one that the owner of the value declares (section 2.1).
 */
export const valueDigest = (domain: string, value: unknown): Digest => digestBytes(domainBytes(domain as DomainTag, value));

/**
 * What the judge resolved before the rule's place (section 6.1, item 6):
 * the fields as read, the subjects that are bound, the signer, and the
 * bounds that the judge was given. Each is a function of the other five
 * things and of the rules before it in the order.
 *
 * `at` and `self` are this scope's reference and the position of the entry
 * that is being written. Both follow from the state, or from the seed at a
 * genesis. A rule needs them to return an effect on the item that its entry
 * opens, whose ID is the entry's `seq`.
 *
 * At check 7 no subject is bound and there is no signer. At check 8 the
 * subjects are those bound so far. A handler, a clause and an outcome have
 * no signer.
 */
export interface Resolved {
  readonly at: ScopeRef;
  readonly self: number;
  readonly fields: Readonly<Record<string, FieldValue>>;
  readonly subjects: ReadonlyMap<string, Item>;
  readonly signer: Signer | null;
  readonly bounds: Bounds;
}

/**
 * What a rule is given (section 6.1): six things, and no other.
 *
 * 1. `state`: the folded state before the entry.
 * 2. `input`: the entry's input, whole.
 * 3. `time`: the commit's one clock reading, which is the entry's time.
 * 4. `uses`: the entry's retained inputs: each foreign entry in `uses`, by
 *    its bytes, with the name of the definition that its scope pins.
 * 5. `own`: the scope's own earlier entries, by position.
 * 6. `resolved`: what the judge resolved before the rule's place.
 *
 * Two readers belong to items 2 and 4. `observed` reads one of the further
 * observations of the entry's input, by its subject: the member `observed`
 * of an act, of an outcome and of a delivery of a result (sections 4.1 and
 * 16.1). Null: the entry would lack it. `value` reads one value beside the
 * intent, by its byte domain and its digest there, when it is no longer
 * than `most` bytes, which is the bound that the owner of the domain
 * states (section 6.2). Undefined: none at hand has that digest. The entry
 * retains what a rule read through them, and nothing else of the two. A
 * rule that needs one and is given none answers that its guard is not
 * completed, `dependency-unavailable`, where its specification says so.
 *
 * A rule is not given the bytes of a detached text, storage, the network,
 * any clock but that one reading, a random value, the order in which inputs
 * arrived, transport's acknowledgments, the present state of another scope,
 * or the result of a read that the entry does not retain. So a rule reads
 * nothing that a replay does not hold.
 */
export interface RuleGiven {
  readonly state: StateView;
  readonly input: JudgedInput;
  readonly time: Timestamp;
  readonly uses: readonly Fetched[];
  readonly own: Own;
  readonly resolved: Resolved;
  observed(subject: Observed): ObservationUse | null;
  value(domain: string, digest: Digest, most: number): unknown;
  /**
   * Revision 19, section 6.2: the value that one field of the act names,
   * which the judge matched by the domain and the bound that the pinned
   * data states for the field. A rule states no domain and no bound of its
   * own. Undefined: the data states no place at that field, or the intent
   * leaves the field out. `value`, above, with the domain and the bound in
   * a rule's code, is a STAND-IN for a row whose data does not state its
   * places yet.
   */
  placed(field: string): unknown;
}

/** The members of `Effect` that a rule returns (section 6.1, "What a rule returns is in this contract's forms"). */
export type RuleEffect = Extract<Effect, { effect: "open" | "state" | "party" | "list" | "ref" | "value" | "operation" | "attempt" }>;

/** The request that a rule at a send gives: a `create`, a `tell` or a `relate`. The judge gives it the ordinal that a written send would take at the mark's position. */
export interface RuleRequest { to: ScopeRef | Seed; message: Request }

/** Place 1, at check 9: the signing key may act, with the member that the act's forms read as the signer, or none; or it may not, with the refusal's name if the rule states one. */
export type GrantRule = (given: RuleGiven) => { pass: true; member: MemberRef | null } | { pass: false; name?: string };
/** Place 2, at check 8: the ID of one local item of the type that the mark states, or null for none. It never refuses. */
export type AlsoSelect = (given: RuleGiven, type: string) => number | null;
/** Place 3, at check 7 for a field and at check 11 for each effect that would set a slot: whether the value is of the type. */
export type TypeRule = (given: RuleGiven, value: FieldValue, of: { field: string } | { item: number; slot: string }) => boolean;
/**
 * Place 4, at check 10, at the mark's position in the written list: the
 * guard holds; it does not, with the refusal's name, and with another code
 * than `guard-failed` where the specification states one; or it is not
 * completed.
 */
export type GuardRule = (given: RuleGiven) =>
  | { holds: true }
  | { holds: false; name: string; code?: "bad-field" | "unsupported-definition" }
  | { holds: null; reason: "guard-incomplete" | "dependency-unavailable" };
/** Place 5, at check 11, at the mark's position in the written list, and in a clause when the clause runs: effects, none, one or several. It never refuses. */
export type EffectRule = (given: RuleGiven) => readonly RuleEffect[];
/** Place 6, at check 12, at the mark's position in the written list: no request, or one. It never refuses. */
export type SendRule = (given: RuleGiven) => RuleRequest | null;

/** What the outcome entry of an operation derives beside the ledger's own records (section 4.3, item 7): effects and requests, as places 5 and 6, and the operations that it opens. */
export interface OutcomeGives { effects: readonly RuleEffect[]; sends: readonly RuleRequest[]; opens: readonly Opening[] }

/**
 * Place 7: the judgment of each outcome entry of one kind of operation, at
 * each thing that section 4.3 leaves to the owner. `selects`: the kind
 * selects one result. `read`: a read of the outside system is decisive for
 * it. `retries`: another attempt is allowed. `holds`: the owner's local
 * guard for a selection; absent, it holds. `wellFormed`: the evidence is
 * well formed; absent, any body is. `derives`: the entry's effects and
 * requests; absent, none. `closure`: the most entries that the operations
 * which one outcome entry opens reserve (section 17.2, row 5).
 */
export interface OutcomeRule {
  selects: boolean;
  read: boolean;
  closure?: number;
  retries(result: "refused" | "unknown", operation: Operation): boolean;
  holds?(given: RuleGiven, operation: Operation): boolean;
  wellFormed?(result: "confirmed" | "refused" | "unknown", evidence: Evidence): boolean;
  derives?(given: RuleGiven, operation: Operation, selected: boolean | null): OutcomeGives;
}

/**
 * One rule, of the kind of one place. `place` is the kind of place at which
 * a mark may name it. `clock`: the rule reads the commit's reading, so an
 * entry of a row with it judges time and is never written clamped (section
 * 6.1, "A rule that reads the clock").
 *
 * `refusals`: each name that the specification states for a refusal of the
 * rule. A name outside it is a fault of the rule. `most`: the most effects
 * that the specification states for the rule (the contract's point R1-59).
 */
export type PlatformRule = { clock?: boolean } & (
  | { place: "grant"; run: GrantRule; refusals: readonly string[] }
  | { place: "also"; run: AlsoSelect }
  | { place: "type"; run: TypeRule }
  | { place: "guard"; run: GuardRule; refusals: readonly string[] }
  | { place: "effect"; run: EffectRule; most: number }
  | { place: "send"; run: SendRule }
  | { place: "outcome"; rules: OutcomeRule }
);

/** The rules of one version of one platform definition, by the name that a mark of its data states in `code`. */
export type Rules = Readonly<Record<string, PlatformRule>>;

/** The rules that a judge is given for the platform definition that the scope pins: its name and version, and its rules. */
export interface PlatformRules { named: PlatformDefinition; rules: Rules }

/** The rule that a mark names, when it is of the kind of the mark's place. */
export function ruleAt<K extends MarkKind>(rules: Rules | null | undefined, code: string, kind: K): Extract<PlatformRule, { place: K }> | null {
  const rule = own(rules, code);
  return rule !== undefined && typeof rule === "object" && rule !== null && rule.place === kind ? (rule as Extract<PlatformRule, { place: K }>) : null;
}

/**
 * Section 6.1, "A mark with no rule: the whole scope". True when a runtime
 * or a verifier with these rules can run the definition: for every mark
 * that its data lists, they hold a rule of that name whose kind is the kind
 * of the mark's place. A declared definition lists no mark, and needs none.
 * When one is missing the answer is `unsupported-definition` for the whole
 * scope, as for a capability form with no code (`derivable`).
 */
export const runnable = (definition: ValidDefinition, rules: Rules | null | undefined): boolean =>
  definition.marks.every((mark) => ruleAt(rules, mark.code, mark.kind) !== null);

// ---------------------------------------------------------------- running a rule

/**
 * Section 6.1, "A fault of a rule is no judgment": a rule that throws, that
 * returns something outside its place's type, an effect that is no member
 * of the allowed list, an item of another type, a refusal name that its
 * specification does not state, or effects that conflict with a written
 * effect. Also a mark that is met with no rule of its kind, which a runtime
 * that can run the definition never meets. The input is then not judged:
 * every judge answers `unavailable`, and nothing is written. It is the rule
 * of section 6.11 for a capability's rules.
 */
export class RuleFault extends Error {
  override readonly name = "RuleFault";
}

/** A fault of a rule leaves the input not judged. Every other failure is the judge's own, and is thrown on. */
export function unjudged<T>(judge: () => T): T | { result: "unavailable"; reason: "unavailable" } {
  try {
    return judge();
  } catch (error) {
    if (error instanceof RuleFault) return { result: "unavailable", reason: "unavailable" };
    throw error;
  }
}

/** A mark, as a judge meets it at one of the seven places of platform data: a record with the two texts `code` and `row`. No written form has them. */
export const markOf = (v: unknown): Mark | null => (isObject(v) && typeof v["code"] === "string" && typeof v["row"] === "string" ? (v as unknown as Mark) : null);

/** What a judge holds when it gives a rule its six things: the parts of a `Judging` that a rule is given. */
export type Giving = Pick<Judging, "view" | "clock" | "bounds" | "scope" | "self" | "fields" | "subjects" | "signer" | "facts" | "own" | "source" | "platform" | "judged" | "ran" | "beside">;

/** The six things, and no other (section 6.1). The entries in `uses` are those that the input's fields name, and for a delivery its source entry. */
export function givenTo(g: Giving): RuleGiven {
  if (!g.judged) throw new RuleFault("a rule is run for an entry whose input the judge did not state");
  const uses = [...(g.source ? [g.source] : []), ...[...g.facts.values()].filter((fact) => fact.fact.hash !== g.source?.fact.hash)];
  const hand = g.beside;
  return {
    state: g.view, input: g.judged, time: g.clock.asOf, uses, own: g.own ?? (() => null),
    resolved: { at: g.scope.at, self: g.self, fields: g.fields, subjects: g.subjects, signer: g.signer, bounds: g.bounds },
    // Sections 4.1 and 16.1: an observation that a rule reads is one that the entry retains. The judge notes each read.
    observed(subject) {
      const use = hand?.observed.find((at) => isOf(at, subject)) ?? null;
      if (use && hand && !hand.read.observed.includes(use)) hand.read.observed.push(use);
      return use;
    },
    // Section 6.2: a value is matched by its digest in the domain that its place states. Bytes that are not the canonical form of a
    // JSON value, and a value that is longer than the bound of its domain, are no value at hand.
    value: (domain, digest, most) => matched(hand, domain, digest, most),
    // Revision 19: the value of a place that the data states, by its field. The judge matched it at check 7.
    placed(field) {
      const place = hand?.places.find((at) => at.field === field);
      return place ? matched(hand, place.domain, place.digest, place.max) : undefined;
    },
  };
}

/** The rule that a mark names, of the kind of the mark's place. A judge that is given no such rule cannot run the definition: a fault. It notes a rule that reads the clock. */
export function ruleFor<K extends MarkKind>(g: Pick<Giving, "platform" | "ran">, mark: Mark, kind: K): Extract<PlatformRule, { place: K }> {
  const rule = ruleAt(g.platform?.rules, mark.code, kind);
  if (!rule) throw new RuleFault(`no rule ${mark.code} of the kind ${kind} was given`);
  if (rule.clock === true && g.ran) g.ran.clock = true;
  return rule;
}

/** One call of a rule. Whatever it throws is a fault of the rule. */
export function run<T>(mark: Mark, call: () => T): T {
  try {
    return call();
  } catch (error) {
    throw error instanceof RuleFault ? error : new RuleFault(`the rule ${mark.code} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The fault of a rule that returned a value outside what its place allows. */
export const outside = (mark: Mark, what: string): RuleFault => new RuleFault(`the rule ${mark.code} returned ${what}`);

/**
 * Place 3: whether a value is of a type that is a mark. The value is a
 * `FieldValue`, whatever its shape: an entry's bytes hold it. Null: the type
 * is one that the forms write, and the judge checks it as data.
 */
export function ofCodedType(g: Giving, type: FieldType | undefined, value: unknown, of: { field: string } | { item: number; slot: string }): boolean | null {
  const mark = markOf(type);
  if (!mark) return null;
  if (!isFieldValue(value)) return false;
  const answer = run(mark, () => ruleFor(g, mark, "type").run(givenTo(g), value, of));
  if (typeof answer !== "boolean") throw outside(mark, "no answer on a type");
  return answer;
}

/** Check 7 of section 4.2: the name of the first field whose type is a mark and whose value its rule says is not of the type, in the order of the names; or null. */
export function fieldOutsideType(g: Giving, types: Readonly<Record<string, FieldType>>): string | null {
  for (const [name, value] of Object.entries(g.fields)) if (ofCodedType(g, own(types, name), value, { field: name }) === false) return name;
  return null;
}

/**
 * Place 2, at check 8: the item that the rule of a mark selects, or null
 * when it gives none. The rule gives the ID of one local item of the type
 * that the mark states. Any other answer is a fault.
 */
export function selectedBy(g: Giving, mark: AlsoMark): Item | null {
  const id = run(mark, () => ruleFor(g, mark, "also").run(givenTo(g), mark.item));
  if (id === null) return null;
  const item = typeof id === "number" && Number.isSafeInteger(id) && id >= 0 ? g.view.item(id) : null;
  if (item?.type !== mark.item) throw outside(mark, `no item of the type ${mark.item}`);
  return item;
}

/**
 * The action that an act's row names in `grant`: the action as written, or
 * in platform data the action that a mark at `grant` states. Null: the mark
 * states none. Such a row reads no observation for the signer, whose key
 * membership may not know (section 4.2).
 */
export const actionOf = (act: Pick<ActType, "grant">): string | null => {
  const mark = markOf(act.grant) as GrantMark | null;
  return mark ? (mark.grant ?? null) : act.grant;
};

/**
 * Place 1, at check 9: the rule of a mark at `grant`, which stands in place
 * of the grant check. It answers that the signing key may act, with the
 * member that the act's forms read as the signer, or none; or that it may
 * not, with the refusal's name if the rule states one. A name that its
 * specification does not state is a fault.
 */
export function grantByRule(g: Giving, mark: GrantMark): { pass: true; member: MemberRef | null } | { pass: false; name?: string } {
  const rule = ruleFor(g, mark, "grant");
  const answer = run(mark, () => rule.run(givenTo(g)));
  if (isObject(answer) && answer.pass === true && (answer.member === null || (isMemberRef(answer.member) && new TextEncoder().encode(answer.member.member).length <= g.bounds.memberBytes))) return { pass: true, member: answer.member };
  if (!isObject(answer) || answer.pass !== false || (answer.name !== undefined && (typeof answer.name !== "string" || !rule.refusals.includes(answer.name)))) throw outside(mark, "no answer on authority, or a refusal that its specification does not state");
  return answer.name === undefined ? { pass: false } : { pass: false, name: answer.name };
}

/** What a guard that is a mark answered when it did not hold: the refusal's name, and its code when that is not `guard-failed`. */
export interface Declined { name: string; code?: "bad-field" | "unsupported-definition" }

/**
 * Place 4, at check 10: the guard that is a mark, at its position in the
 * written list. It holds, it does not, or it is not completed. When it does
 * not hold, `coded` keeps the name that the rule states, for the judge.
 */
export function guardByRule(j: Judging, guard: Guard, mark: Mark): GuardResult {
  const rule = ruleFor(j, mark, "guard");
  const answer = run(mark, () => rule.run(givenTo(j)));
  if (isObject(answer) && answer.holds === true) return "pass";
  if (isObject(answer) && answer.holds === null && (answer.reason === "guard-incomplete" || answer.reason === "dependency-unavailable")) return answer.reason;
  if (!isObject(answer) || answer.holds !== false || typeof answer.name !== "string" || !rule.refusals.includes(answer.name)) throw outside(mark, "no answer of a guard, or a refusal that its specification does not state");
  if (answer.code !== undefined && answer.code !== "bad-field" && answer.code !== "unsupported-definition") throw outside(mark, "a refusal code that no guard has");
  (j.coded ??= new Map()).set(guard, answer.code === undefined ? { name: answer.name } : { name: answer.name, code: answer.code });
  return "fail";
}

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

import type { Bounds, Effect, Evidence, FactRef, FieldValue, Grant, MemberRef, Message, OperationId, PlatformDefinition, Request, ScopeRef, Seed, SignedIntent, Timestamp } from "@generalbusiness/artroom-contract";
import type { Signer } from "./attribution.ts";
import type { Own } from "./fields.ts";
import type { Fetched } from "./guards.ts";
import type { Opening } from "./ledger.ts";
import type { Item, Operation, StateView } from "./state.ts";
import type { MarkKind, ValidDefinition } from "./validate/index.ts";
import { own } from "./values.ts";

/**
 * The input of the entry that is judged, whole, as it arrived (section 6.1,
 * "What a rule is given", item 2): an act's signed intent, whose `actor` is
 * the signing key, with the grant and what was presented beside it; a
 * genesis's seed, with the founding intent or the creation request; a
 * delivery's `from` and message; an outcome's evidence.
 *
 * `grant`, of an act: the grant that check 9 judged. Null: none was judged
 * yet, as at checks 7 and 8, or the act's `grant` is a mark and no grant is
 * held.
 */
export type JudgedInput =
  | { readonly type: "act"; readonly signed: SignedIntent; readonly grant: Grant | null; readonly presented: Readonly<Record<string, unknown>> }
  | { readonly type: "genesis"; readonly seed: Seed; readonly founding: SignedIntent | null; readonly source: FactRef | null; readonly n: number | null; readonly message: Request | null }
  | { readonly type: "delivery"; readonly from: FactRef; readonly n: number; readonly message: Message }
  | { readonly type: "outcome"; readonly operation: OperationId; readonly attempt: number; readonly result: "confirmed" | "refused" | "unknown"; readonly evidence: Evidence };

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

/**
 * Meaning: a declared definition and every form it may use (scope contract,
 * sections 6.1 to 6.8 and 6.11, as revision 11 adopts them). A definition is
 * data. An application writes no guard code.
 *
 * These are the contract's types. They say what a definition may hold. They
 * do not say what a runtime can derive yet: the validator of the derive
 * package refuses every form that it has no derivation for.
 *
 * A few forms are marked "landed form". Each is what the first delivery
 * built before the contract gave the form its adopted shape. It stays in its
 * union until the source that reads it moves to the adopted form, and is
 * then removed. A new definition does not use one.
 */

import type { Digest, PlatformDefinition, ScopeKind } from "./scope.ts";
import type { FieldValue } from "./intent.ts";

export interface DeclaredDefinition {
  format: "artroom-definition-1";
  name: string;                          // what `under` compares with
  profile: { name: string; version: number };
  capabilities: readonly { name: "hold" | "git-read"; version: number }[];
  genesis: string;                       // the act kind that opens the scope
  items: Record<string, ItemType>;       // at most 16
  acts: Record<string, ActType>;         // at most 64
  receives: Record<string, ReceiveType>; // at most 24
  timed: Record<string, TimedRule>;      // at most 8; the timed rules, by name (section 5.2)
  rules: Record<string, string>;         // at most 16; the expressions a `rule` guard names, in the profile's language (section 6.5)
}

/**
 * A timed rule (sections 5.2 and 6.4). A live item of type `on`, in one of
 * `states`, whose value slot `deadline` holds a time, holds that deadline
 * under this rule. The effects change that item only (section 6.8) and must
 * take it out of `states`.
 */
export interface TimedRule {
  on: string;                              // the item type; this makes it a timed item type
  states: readonly string[];               // live states in which the rule applies
  deadline: string;                        // a value slot of type `time`
  effects: readonly EffectForm[];
  attention: readonly Notify[];
}

// ---------------------------------------------------------------- section 6.2

export type FieldType =
  | { type: "text"; max: number; detached?: true }      // at most 64 KiB; detached: held beside the intent and named in it by digest
  | { type: "int"; min: number; max: number }
  | { type: "bool" } | { type: "time" }
  | { type: "enum"; of: readonly string[] }
  | { type: "member" }                        // a MemberRef
  | { type: "item"; of: string }              // a local item of that type
  | { type: "fact"; kind: readonly string[]; under: string }   // an entry of one of those kinds, under a definition of that name
  | { type: "scope"; kind: ScopeKind }
  | { type: "digest" } | { type: "commit" } | { type: "tree" }
  | { type: "record"; of: Record<string, FieldType & { required: boolean }> }   // named members; a member is named after its field with a dot
  | { type: "list"; of: FieldType; max: number };   // at most 32 elements

// ---------------------------------------------------------------- section 6.3

export interface ItemType {
  many: boolean;
  max: number;                               // most live items of this type; not a bound on retained final items
  states: Record<string, { final: boolean }>;        // at most 16
  initial: string;
  parties: Record<string, SlotRule & { list: boolean; max?: number;
                                       author: boolean }>;   // at most 8; a list holds at most 64 members
  refs: Record<string, SlotRule & { to: FieldType }>;        // at most 12
  values: Record<string, SlotRule & { of: FieldType; default?: FieldValue }>;  // at most 12
}
export interface SlotRule { fixed: boolean; required: boolean }

// ---------------------------------------------------------------- section 6.4

export interface ActType {
  step: "open" | "transition" | "comment";
  on: string | null;                       // item type of the primary item
  also: Record<string, AlsoRule>;          // at most 4 other local items
  fields: Record<string, FieldType & { required: boolean; default?: FieldValue }>;
  presents?: Record<string, { kind: readonly string[]; under: string; required: boolean }>;   // at most 4 facts presented beside the intent
  grant: string;                           // the action a current grant must cover; always required
  settles?: Settles;                       // section 17
  guards: readonly Guard[];                // at most 24 as written
  effects: readonly EffectForm[];          // at most 16
  sends: readonly SendForm[];              // at most 8
  attention: readonly Notify[];            // at most 8
}

/** A handler: what a delivered message of one class and name does, from a scope of one kind (section 6.4). */
export interface ReceiveType {
  message: string;                         // a `tell` message's name, or a relationship's name
  class: "tell" | "relate" | "advisory";   // for an advisory, `message` is its type: `index` or `notify`
  from: { kind: ScopeKind; under?: string };
  fields: Record<string, FieldType & { required: boolean }>;   // the message's fields, or a relationship update's detail
  opens: string | null;                    // the item type this handler opens, if any
  copies?: number;                         // `relate` only: the most keys this scope keeps a copy for
  also: Record<string, AlsoRule>;
  settles?: Settles;
  guards: readonly Guard[];
  effects: readonly EffectForm[];
  sends: readonly SendForm[];              // empty when `class` is `advisory`
  attention: readonly Notify[];            // empty when `class` is `advisory`
}

/** The name a definition used for the adopted form while the landed form of a handler was also a `ReceiveType`. It is the same type. */
export type AdoptedReceiveType = ReceiveType;

/** How an act or handler selects one other local item. */
export type AlsoRule =
  | { item: string; by: string }                             // named by a field of type `item`, or by a local fact whose entry opened it
  | { item: string; via: { slot: string; of: Subject } }     // the item that a reference slot of another subject names
  | { item: string; one: true };                             // the one item of a type that is not `many`

/** What a guard or effect is about: the primary item, another named item, or the scope. */
export type Subject = "on" | `also.${string}` | "scope";

/** What an act or handler settles: an item in stated states, or a relationship copy in stated states (section 17). */
export type Settles = { of: Subject; in: readonly string[] } | { copy: readonly string[] };

// ---------------------------------------------------------------- section 6.5

/** What a guard, an effect or a send reads. A slot with no `of` is a slot of the form's own subject. */
export type Operand =
  | { field: string; part?: Part }                 // a field of the act, or of the message in a handler
  | { presented: string; part?: Part }             // a fact presented beside the intent (section 6.4)
  | { slot: string; of?: Subject | "each"; part?: Part }
  | { element: string; part?: Part }               // the element that an enclosing `each`, `has`, `distinct` or `sameSet` binds
  | { item: Subject | "each" }                     // a local reference to that subject's item
  | { signer: true }                               // acts only
  | { sender: true }                               // handlers and result clauses: the envelope's source scope
  | { source: EntryPart }                          // handlers only: a part of the verified source entry
  | { update: "state" | "item" | "revision" }      // `relate` handlers only: the update being applied
  | { result: "reason" }                           // result clauses only: the name in the result's reason
  | { scope: true }                                // this scope's own reference
  | { intent: true }                               // the digest of the intent being judged
  | { none: true }
  | { const: FieldValue };

/** A part reads inside an entry that a fact reference names. */
export type Part = EntryPart | { of: EntryPart; then: "scope" | "seq" };
export type EntryPart =
  | "ref" | "scope" | "seq"                        // read from the reference; nothing is fetched
  | "kind" | "intent" | "on"
  | { field: string }
  | { opened: string }
  | { set: { item: Operand; slot: string } }
  | { carried: string };

export type Where = { equals: { a: Operand; b: Operand } } | { differs: { a: Operand; b: Operand } };

/** The local items a range covers: every item of the type whose present state is listed, but those of the `except` subjects. */
export interface Range { type: string; states: readonly string[]; where?: readonly Where[];
                         except?: readonly Subject[] }

export type CapabilityArg = Operand | { each: Operand; as: string; value: Operand } | { items: Range; slot: string };

/**
 * Every guard may name its subject; the default is `on`. One that names a
 * field or a presented fact may carry `ifPresent`. `reason` names the
 * refusal and changes no judgment.
 */
export type Guard = { of?: Subject; ifPresent?: boolean; reason?: string } & (
  | { state: readonly string[] }
  | { signer: readonly string[] }
  | { notIn: readonly string[] }
  | { set: string }
  | { unset: string }
  | { equals: { a: Operand; b: Operand } }
  | { differs: { a: Operand; b: Operand } }
  | { some: Range }
  | { none: Range }
  | { count: Range & { min?: number | Operand; max?: number | Operand } }
  | { every: { list: string; states: readonly string[] } }
  | { fact: { field: string; where?: readonly Where[] } | { presented: string } | { element: string } }
  | { before: { slot: string } }
  | { after: { slot: string } }
  | { rule: string }
  | { each: { list: Operand; as: string; where?: readonly Where[]; guards: readonly Guard[] } }
  | { has: { list: Operand; as: string; where: readonly Where[]; guards?: readonly Guard[] } }
  | { anyOf: readonly (readonly Guard[])[] }
  | { distinct: { list: Operand; as: string; key: Operand } }
  | { sameSet: { list: Operand; as: string; key: Operand; items: Range;
                 match?: readonly Where[]; ordered?: boolean } }
  | { capability: { name: "hold" | "git-read"; guard: string; with: Record<string, CapabilityArg> } }
);

// ---------------------------------------------------------------- sections 6.6 to 6.8

/** Where a slot's value comes from. `null` empties the slot. */
export type Source = Operand | null;

/** An effect, a send or an attention form with `if` is applied only when every guard holds; with `unless`, only when not every guard holds. */
export interface Condition { if?: readonly Guard[]; unless?: readonly Guard[] }

export type EffectForm = { of?: Subject } & Condition & (
  | { state: string }
  | { party: { slot: string; from: Source | readonly Operand[]; list?: "add" | "remove" } }   // a list of operands sets a list slot whole
  | { ref: { slot: string; from: "self" | Source } }            // `self` is the entry being written (section 6.4)
  | { value: { slot: string; from: Source | { time: { plusSeconds: number } } } }   // the time form is the commit time plus a constant
  | { attribute: { slot: string; of: Subject; with?: readonly AuthorSource[] } }      // section 6.7
  | { hold: { do: "open" | "renew" | "end"; extent?: Operand } }                      // platform code; section 6.8
  | { redact: { slot: string } }
  | { capability: { name: "hold" | "git-read"; do: string; with: Record<string, Operand> } }   // section 6.11
);

/** A further source of an `attribute` effect (section 6.7). */
export type AuthorSource =
  | { items: Range; slot: string }                   // a party list of each local item the range covers
  | { subject: Subject; slot: string }               // a party list of another subject of the act
  | { each: Operand; as: string; list: Operand }     // a list read, by a part, from each fetched fact of a list
  | { list: Operand };                               // a list read from one fetched or presented fact

/** Where a field of a sent message comes from. In a message the receiver reads `self` as the envelope's source. */
export type SendSource = "self" | Operand | { collect: { items: Range; fields: Record<string, string> } };

/** Effects for each terminal outcome of a request. An outcome with no effects written changes nothing. `conflict` is on a creation only. */
export type ResultClauses = Partial<Record<"applied" | "refused" | "superseded" | "undelivered" | "conflict", readonly EffectForm[]>>;

export type SendForm =
  | { create: { kind: ScopeKind; definition: Digest | PlatformDefinition | "self";
                fields: Record<string, SendSource>; result: ResultClauses } }
  | { tell: { to: { slot: string; of?: Subject }; message: string; if?: readonly Guard[];
              fields: Record<string, SendSource>; result: ResultClauses } }
  | { relate: { each?: Range; to: SendSource; name: string; item: SendSource; state: string;
                if?: readonly Guard[]; detail: Record<string, SendSource>; result: ResultClauses } }
  | { index: { fields: Record<string, SendSource> } };   // advisory: no result

/** Tells the members in a party slot as it was before the effects, or as it is after. */
export interface Notify { notify: { slot: string; of: Subject; when: "before" | "after"; reason: string;
                                    if?: readonly Guard[] } }

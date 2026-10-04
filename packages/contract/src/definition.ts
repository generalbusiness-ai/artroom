/**
 * Meaning: a declared definition and every form it may use (scope contract,
 * sections 6.1 to 6.6). A definition is data. An application writes no guard
 * code.
 */

import type { Digest, PlatformDefinition, ScopeKind } from "./scope.ts";
import type { FieldValue } from "./intent.ts";

export interface DeclaredDefinition {
  format: "artroom-definition-1";
  profile: { name: string; version: number };
  capabilities: readonly { name: "hold" | "git-read"; version: number }[];
  genesis: string;                       // the act kind that opens the scope
  items: Record<string, ItemType>;       // at most 12
  acts: Record<string, ActType>;         // at most 48
  receives: Record<string, ReceiveType>; // at most 24
  timed: Record<string, TimedRule>;      // the timed rules, by name (section 5.2)
  rules: Record<string, string>;         // the expressions a `rule` guard names, in the profile's language (section 6.5)
}

/**
 * A timed rule (section 5.2). The contract names timed rules and gives the
 * definition no member for them; this is the concrete form. A live item of
 * type `on`, in one of `states`, whose value slot `deadline` holds a time,
 * holds that deadline under this rule. The effects change that item only
 * (section 6.8) and must take it out of `states`.
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
  | { type: "text"; max: number }            // at most 64 KiB
  | { type: "int"; min: number; max: number }
  | { type: "bool" } | { type: "time" }
  | { type: "enum"; of: readonly string[] }
  | { type: "member" }                        // a MemberRef
  | { type: "item"; of: string }              // a local item of that type
  | { type: "fact"; kind: string; under: string }   // a foreign entry of that act kind, under a definition of that name
  | { type: "scope"; kind: ScopeKind }
  | { type: "digest" } | { type: "commit" } | { type: "tree" }
  | { type: "list"; of: FieldType; max: number };   // at most 32 elements

// ---------------------------------------------------------------- section 6.3

export interface ItemType {
  many: boolean;
  max: number;                               // most live items of this type; not a bound on retained final items
  states: Record<string, { final: boolean }>;        // at most 16
  initial: string;
  parties: Record<string, SlotRule & { list: boolean; max?: number;
                                       author: boolean }>;   // at most 8
  refs: Record<string, SlotRule & { to: FieldType }>;        // at most 12
  values: Record<string, SlotRule & { of: FieldType; default?: FieldValue }>;  // at most 8
}
export interface SlotRule { fixed: boolean; required: boolean }

// ---------------------------------------------------------------- section 6.4

export interface ActType {
  step: "open" | "transition" | "comment";
  on: string | null;                       // item type of the primary item
  also: Record<string, { item: string; by: string }>;   // at most 3 other local items, each named by a field
  fields: Record<string, FieldType & { required: boolean; default?: FieldValue }>;
  grant: string;                           // the action a current grant must cover; always required
  guards: readonly Guard[];                // at most 16
  effects: readonly EffectForm[];          // at most 16
  sends: readonly SendForm[];              // at most 8
  attention: readonly Notify[];            // at most 8
}
export interface ReceiveType {
  message: string;
  from: { kind: ScopeKind; under?: string };
  also: Record<string, { item: string; by: string }>;
  guards: readonly Guard[];
  effects: readonly EffectForm[];
  sends: readonly SendForm[];
  attention: readonly Notify[];
}

/** What a guard or effect is about: the primary item, another named item, or the scope. */
export type Subject = "on" | `also.${string}` | "scope";

// ---------------------------------------------------------------- section 6.5

/** An operand is a field, a slot, the signer or a constant. */
export type Operand = { field: string } | { slot: string } | { signer: true } | { const: FieldValue };

/** `where` is a list of `equals`. */
export interface Where { equals: { a: Operand; b: Operand } }

/** The local items a range guard covers: every item of the type whose present state is listed. */
export interface Range { type: string; states: readonly string[]; where?: readonly Where[] }

/** Every guard may name its subject; the default is `on`. One that names a field may carry `ifPresent`. */
export type Guard = { of?: Subject; ifPresent?: boolean } & (
  | { state: readonly string[] }
  | { signer: readonly string[] }
  | { notIn: readonly string[] }
  | { set: string }
  | { unset: string }
  | { equals: { a: Operand; b: Operand } }
  | { differs: { a: Operand; b: Operand } }
  | { some: Range }
  | { none: Range }
  | { count: Range & { min?: number; max?: number } }
  | { every: { list: string; states: readonly string[] } }
  | { fact: { field: string; where?: readonly Where[] } }
  | { before: { slot: string } }
  | { after: { slot: string } }
  | { rule: string }
);

// ---------------------------------------------------------------- section 6.6

/** Where a party slot's member comes from. `null` empties the slot. */
export type PartySource = { signer: true } | { field: string } | { fact: string; field: string } | { slot: string } | null;

/** Where a reference slot's value comes from. `self` is the entry being written (section 6.4). */
export type RefSource = "self" | { field: string } | { slot: string } | null;

/** Where a value slot's value comes from. The time form is the commit time plus a constant number of seconds. */
export type ValueSource = { field: string } | { const: FieldValue } | { time: { plusSeconds: number } };

export type EffectForm = { of?: Subject } & (
  | { state: string }
  | { party: { slot: string; from: PartySource; list?: "add" | "remove" } }
  | { ref: { slot: string; from: RefSource } }
  | { value: { slot: string; from: ValueSource } }
  | { attribute: { slot: string; of: Subject } }
  | { hold: { do: "open" | "renew" | "end"; extent?: { field: string } | { slot: string } } }   // platform code; section 6.8
);

/** Where a field of a sent message comes from. In a message the receiver reads `self` as the envelope's source. */
export type SendSource = "self" | Operand;

/** Effects for each terminal outcome of a request. An outcome with no effects written changes nothing. */
export type ResultClauses = Partial<Record<"applied" | "refused" | "superseded" | "undelivered", readonly EffectForm[]>>;

export type SendForm =
  | { create: { kind: ScopeKind; definition: Digest | PlatformDefinition; fields: Record<string, SendSource>;
                result: ResultClauses & { conflict?: readonly EffectForm[] } } }
  | { tell: { to: string; message: string; fields: Record<string, SendSource>; result: ResultClauses } }
  | { relate: { to: SendSource; name: string; item: SendSource; state: string;
                detail: Record<string, SendSource>; result: ResultClauses } }
  | { index: { fields: Record<string, SendSource> } };   // advisory: no result

/** Tells the members in a party slot as it was before the effects, or as it is after. */
export interface Notify { notify: { slot: string; of: Subject; when: "before" | "after"; reason: string } }

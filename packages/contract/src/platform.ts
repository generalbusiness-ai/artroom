/**
 * The data of a platform definition (scope contract, revision 15, section
 * 6.1, "Platform code: a mark, and its rule"; authority note, revision 20,
 * section 12.1). One version of a platform definition is its data and its
 * rules, under one name and version. The data is a value in the forms of a
 * declared definition, with a mark at each place that is code.
 *
 * These are types of platform data only. `DeclaredDefinition` does not
 * change, and a declared definition holds no mark: the validator of the
 * derive package refuses each form below unless its platform option is set,
 * and no input reaches that option.
 *
 * A mark stands in the data where a form of the same kind would stand, and
 * its rule is run where that form would be derived. There are seven kinds
 * of place.
 *
 * | # | The place | The form in platform data |
 * |---|---|---|
 * | 1 | The `grant` of an act | `string \| GrantMark` |
 * | 2 | A name of `also` | `AlsoRule \| AlsoMark` |
 * | 3 | The type of a field, or of a slot | `FieldType \| TypeMark` |
 * | 4 | A guard of a written list | `Guard \| Mark` |
 * | 5 | An effect of a written list, also of a result clause | `EffectForm \| Mark` |
 * | 6 | A send of a written list | `SendForm \| SendMark` |
 * | 7 | `outcomes`, by the kind of each operation that the definition owns | `OutcomeMark` |
 */

import type { ActType, AlsoRule, DeclaredDefinition, EffectForm, FieldType, Guard, ItemType, ReceiveType, ResultClauses, SendForm, SlotRule } from "./definition.ts";
import type { FieldValue } from "./intent.ts";

/**
 * A mark: in the data of a platform definition, and nowhere else. `code`
 * names one rule of the definition's version. `row` names the gap that the
 * specification lists for it, such as `P13`, so that a reader knows why the
 * place is code. Neither is empty.
 */
export interface Mark { code: string; row: string }

/**
 * What a mark may start (scope contract, revision 21, section 17.2, "What a
 * mark may start"; the listing of `Mark` in section 6.1). A rule's result
 * is not in the data, so a reservation counts a mark by this, at the worst
 * case: `effects` changes of state; one operation of each kind in
 * `operations`; and one item of the type `opens`. It stands on a mark at
 * place 5 and at place 7. In platform data only.
 */
export interface MarkMost { effects: number; operations?: readonly string[]; opens?: string }

/**
 * A reservation that an item holds (revision 20, section 17.2a). On an item
 * type, as `holds`: what one item of the type reserves, from the entry that
 * opens it. On an act, as `adds`: what the act adds to the reservation of
 * the item that it is on. `operations`: by kind of `outcomes`, the most
 * operations that are opened for one item. `requests`: the most requests
 * that are sent for one item. `items`: the most items that are opened for
 * one item. Each count is a whole number of at least 1. In platform data
 * only.
 */
export interface Held { operations?: Readonly<Record<string, number>>; requests?: number; items?: number }

/** Place 1. With `grant`, check 9 is made as written first, and the rule is run only when no current grant of that action is held (section 4.2). */
export type GrantMark = Mark & { grant?: string };
/** Place 2. The rule gives one local item of the type `item`, or none. */
export type AlsoMark = Mark & { item: string };
/** Place 3. The data states no shape for the value: the rule says whether a value is of the type. */
export type TypeMark = Mark & { type: "code" };
/**
 * Place 6. The rule gives no request or one. Its clauses are the mark's own,
 * as data. `always`, on a send mark of a written list (revision 19, section
 * 6.1, "More than one send mark"): the rule returns exactly one request in
 * every entry of its row, and a rule that returns none there has a fault. A
 * written list may hold several marks when at most one of them does not
 * state it.
 */
export type SendMark = Mark & { result: PlatformClauses; always?: true };

/**
 * Place 7, with the one request that an outcome entry may send (revision
 * 17, section 6.1, "A request of an outcome's rule, and its clauses"; row
 * I3-23). An outcome has no subject and no field, so its row writes no
 * send: the mark of its kind may hold one `send`, a send mark whose rule
 * gives no request or one, and it may give a `create`. Each effect of a
 * clause of that send is an effect mark, whose rule names its items by
 * their IDs.
 */
export type OutcomeSend = Mark & {
  result: { [clause in keyof ResultClauses]?: readonly (Mark & { most?: MarkMost })[] };
  /** Revision 20, section 17.2, "A request that an outcome sends": at most one outcome entry of one operation makes the request. */
  once?: true;
};
/**
 * `attempts`: the most attempts of the kind (revision 17). `most`: what one
 * outcome entry of the kind may start (revision 21, section 17.2, "The
 * closure of an operation"). A kind that states `attempts` is counted by
 * these members. One that states none is counted as its rule declares, as
 * before.
 */
export type OutcomeMark = Mark & { send?: OutcomeSend; attempts?: number; most?: MarkMost };

/**
 * A place of an act that names a value beside the intent (revision 19,
 * section 6.2, "How a version states a place"): a field of type `digest`
 * that states the byte domain of the place, and the bound on one value of
 * that domain, in canonical bytes. Two fields of one definition that state
 * one domain state one `max`. In platform data only, and only as the type
 * of a field of an act.
 */
export interface ValuePlace { type: "digest"; value: { domain: string; max: number } }

/** The type of a field or of a slot, in platform data. */
export type PlatformFieldType = FieldType | TypeMark;
/** An effect of a written list, in platform data. A mark may state what its rule may start (section 17.2). */
export type PlatformEffect = EffectForm | (Mark & { most?: MarkMost });
/** The result clauses of a request, in platform data: a clause may hold an effect mark. */
export type PlatformClauses = { [clause in keyof ResultClauses]?: readonly PlatformEffect[] };

/** A written send whose clauses may hold an effect mark. An `index` send has none. */
type WithClauses<S> = S extends { index: unknown } ? S : { [K in keyof S]: Omit<S[K], "result"> & { result: PlatformClauses } };
/** A send of a written list, in platform data. */
export type PlatformSend = WithClauses<SendForm> | SendMark;

/** The six lists and records of an act or a handler that may hold a mark. */
interface MarkedForms {
  also: Record<string, AlsoRule | AlsoMark>;
  guards: readonly (Guard | Mark)[];
  effects: readonly PlatformEffect[];
  sends: readonly PlatformSend[];
}

export type PlatformAct = Omit<ActType, "grant" | "fields" | keyof MarkedForms> & MarkedForms & {
  grant: string | GrantMark;
  fields: Record<string, (PlatformFieldType | ValuePlace) & { required: boolean; default?: FieldValue }>;
  /** Section 17.2a: what the act adds to the reservation of the item that it is on, whose type states `holds`. */
  adds?: Held;
};
export type PlatformReceive = Omit<ReceiveType, "fields" | keyof MarkedForms> & MarkedForms & {
  fields: Record<string, PlatformFieldType & { required: boolean }>;
};
export type PlatformItem = Omit<ItemType, "refs" | "values"> & {
  refs: Record<string, SlotRule & { to: PlatformFieldType }>;
  values: Record<string, SlotRule & { of: PlatformFieldType; default?: FieldValue }>;
  /** Section 17.2a: what one item of the type reserves for the operations, the requests and the items that are opened or sent for it. */
  holds?: Held;
};

/**
 * The data of a platform definition: the declared forms, and seven places
 * where a mark may stand. Places 1 to 6 are in the forms of an act, a
 * handler and an item type. Place 7 is `outcomes`: the mark of the rule for
 * the outcome entries of each kind of operation that this definition owns
 * (section 4.3), with the one send that such an entry may make. A timed
 * rule holds no mark: its effects are total.
 */
export interface PlatformData extends Omit<DeclaredDefinition, "items" | "acts" | "receives"> {
  items: Record<string, PlatformItem>;
  acts: Record<string, PlatformAct>;
  receives: Record<string, PlatformReceive>;
  outcomes: Record<string, OutcomeMark>;
}

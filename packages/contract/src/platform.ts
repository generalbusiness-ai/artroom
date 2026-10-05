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
 * | 7 | `outcomes`, by the kind of each operation that the definition owns | `Mark` |
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

/** The type of a field or of a slot, in platform data. */
export type PlatformFieldType = FieldType | TypeMark;
/** An effect of a written list, in platform data. */
export type PlatformEffect = EffectForm | Mark;
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
  fields: Record<string, PlatformFieldType & { required: boolean; default?: FieldValue }>;
};
export type PlatformReceive = Omit<ReceiveType, "fields" | keyof MarkedForms> & MarkedForms & {
  fields: Record<string, PlatformFieldType & { required: boolean }>;
};
export type PlatformItem = Omit<ItemType, "refs" | "values"> & {
  refs: Record<string, SlotRule & { to: PlatformFieldType }>;
  values: Record<string, SlotRule & { of: PlatformFieldType; default?: FieldValue }>;
};

/**
 * The data of a platform definition: the declared forms, and seven places
 * where a mark may stand. Places 1 to 6 are in the forms of an act, a
 * handler and an item type. Place 7 is `outcomes`: the mark of the rule for
 * the outcome entries of each kind of operation that this definition owns
 * (section 4.3). A timed rule holds no mark: its effects are total.
 */
export interface PlatformData extends Omit<DeclaredDefinition, "items" | "acts" | "receives"> {
  items: Record<string, PlatformItem>;
  acts: Record<string, PlatformAct>;
  receives: Record<string, PlatformReceive>;
  outcomes: Record<string, Mark>;
}

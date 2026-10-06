/**
 * A request that is bound to the pending item that it settles (scope
 * contract, revision 23, section 17.2a: "A request that is bound to a
 * holder", "An index that an item type declares" and "The source of
 * `bound.of`: a binding selector"; rows I3-55, I3-58 and I3-61).
 *
 * Three things are here, each a pure function of what it is given.
 *
 * - The index: the key of an indexed slot, and the rows that the fold
 *   writes for an item that an entry opens. The index is derived state. It
 *   is in no checkpoint, and a replay rebuilds it by folding.
 * - The binding selector: the rule of a mark at place 2 that binds the
 *   name which `bound.of` names. It is given two things only: the items
 *   that the index returns for the key, and the fields of the message.
 * - The binding: whether a delivery is bound, by the five conditions of
 *   the table of section 17.2a, on the state before its entry.
 *
 * The fifth condition reads the item's folded count for the message. The
 * fold derives the binding again before its effects, draws 1 and releases
 * the decisions when the holder becomes final. `Draft.bound` is only the
 * judge's explanation: no entry records it, and no fold trusts it.
 */

import type { BindingMark, Bound, FieldValue, PlatformReceive, ReceiveType, ScopeRef } from "@generalbusiness/artroom-contract";
import { CanonicalError, canonicalize } from "@generalbusiness/artroom-bytes";
import type { Judging } from "./guards.ts";
import { RuleFault, markOf, outside, ruleFor, run, type Giving } from "./marks.ts";
import { equal, operand } from "./operand.ts";
import type { Item, StateView, StateWriter } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isFactRef, own, same } from "./values.ts";

/** The most slots that one item type declares as indexed. The contract's proposal; a bound of R4 would replace it. */
export const INDEXES_MOST = 4;
/** The most items that a binding selector is given for one key. One row more is read, so that "more than 8" is known from one lookup. The contract's proposal. */
export const SELECTED_MOST = 8;
/** The seven types of an indexed slot: each is an identity with one canonical value. */
export const INDEXED_TYPES: readonly string[] = ["fact", "item", "scope", "member", "digest", "commit", "tree"];

/**
 * The key of a value in an index: its canonical JSON, after a local fact
 * is put in normal form, which is its position (section 6.2). For a fact
 * of another scope it is the whole reference: its text, as section 3 has
 * it. Null: no value. "No value" is never a key: no item is indexed under
 * none, and none finds no item.
 */
export function keyOf(value: unknown, at: ScopeRef): string | null {
  if (value === null || value === undefined) return null;
  // A value with no canonical bytes is no key, and this never throws: negative zero, an object that is not plain. No field as
  // check 7 read it and no slot of a folded item is one.
  try {
    return canonicalize(isFactRef(value) && same(value.at, at) ? value.seq : value);
  } catch (e) {
    if (e instanceof CanonicalError) return null;
    throw e;
  }
}

/**
 * The rows that the fold writes for an item that an entry opens: one for
 * each indexed slot of its type, with the key that the slot holds after the
 * entry's effects. The slot is fixed, so no later entry writes a row.
 */
export function indexRows(definition: Pick<ValidDefinition, "keyed">, item: Item, at: ScopeRef): { slot: string; key: string }[] {
  return (own(definition.keyed, item.type) ?? []).flatMap((slot) => {
    const key = keyOf(own(item.refs, slot) ?? own(item.values, slot), at);
    return key === null ? [] : [{ slot, key }];
  });
}

/**
 * The declared indexes, built from the items of a state that holds none:
 * what a verifier does that starts from a checkpoint which it trusts. The
 * value that a checkpoint digests holds the scope's items, live and final,
 * and no row of an index. `items` are all of them, in order of item ID.
 */
export function indexItems(writer: Pick<StateWriter, "putIndexed">, definition: Pick<ValidDefinition, "keyed">, items: readonly Item[], at: ScopeRef): void {
  for (const item of items) for (const row of indexRows(definition, item, at)) writer.putIndexed(item.type, row.slot, row.key, item.id);
}

/** One item, as a binding selector is given it: its ID, its state and its slots. */
export type Indexed = Pick<Item, "id" | "state" | "parties" | "refs" | "values">;

/**
 * The rule of a binding selector: the ID of one of the items that it is
 * given, or null for none. It is given the items that the index returns
 * for the key, live and final, in order of item ID, at most 8 and at least
 * 1; and the fields of the message as check 7 read them. It is given
 * nothing else: no sender, no clock, no entry, no observation, no other
 * item and no count.
 */
export type BindingSelect = (items: readonly Indexed[], fields: Readonly<Record<string, FieldValue>>) => number | null;

/** The mark of a handler that is its binding selector: the one that binds the name which `bound.of` names. Null: the handler states no `bound`, or a written rule binds the name. */
export function selectorOf(handler: ReceiveType): BindingMark | null {
  const stated = (handler as unknown as PlatformReceive).bound;
  const rule = stated && stated.of.startsWith("also.") ? own(handler.also, stated.of.slice(5)) : undefined;
  return rule ? (markOf(rule) as BindingMark | null) : null;
}

/**
 * Check 8, for a binding selector: the lookup, and then the rule.
 *
 * - The index is not complete for the type: no lookup is answered. The
 *   delivery is not judged, and is retried.
 * - The index returns no item: the selector gives none, and the rule is
 *   not run.
 * - It returns 1 to 8: the rule is run on them and on the fields. It
 *   returns the ID of one of them, or none. Any other answer is a fault.
 * - It returns more than 8: a fault. The rule is not run.
 *
 * A fault leaves the delivery not judged: nothing is written, and it is
 * retried (section 6.1, "A fault of a rule is no judgment").
 */
export function selectedByIndex(g: Pick<Giving, "view" | "scope" | "fields" | "platform">, mark: BindingMark): Item | null {
  const key = keyOf(own(g.fields, mark.key), g.scope.at);
  if (key === null) return null;
  const ids = g.view.lookup(mark.item, mark.index, key, SELECTED_MOST + 1);
  if (ids === null) throw new RuleFault(`the index of ${mark.item} on ${mark.index} does not hold every item of the type, so no lookup is answered`);
  if (ids.length === 0) return null;
  if (ids.length > SELECTED_MOST) throw new RuleFault(`the index of ${mark.item} on ${mark.index} returns more than ${SELECTED_MOST} items for one key`);
  const items = ids.map((id) => g.view.item(id));
  if (items.some((item) => item?.type !== mark.item)) throw new RuleFault(`the index of ${mark.item} on ${mark.index} names what is no item of the type`);
  const rule = ruleFor({ platform: g.platform }, mark, "also");
  if (!("bind" in rule) || rule.clock === true) throw new RuleFault(`the rule ${mark.code} is no binding selector: it is given the indexed items and the fields, and no clock`);
  const given = (items as Item[]).map((item): Indexed => ({ id: item.id, state: item.state, parties: item.parties, refs: item.refs, values: item.values }));
  const id = run(mark, () => rule.bind(given, g.fields));
  if (id === null) return null;
  const chosen = (items as Item[]).find((item) => item.id === id);
  if (!chosen) throw outside(mark, "an item that it was not given");
  return chosen;
}

/**
 * What an item still holds of its `decisions`, for one message: part of
 * the folded state of the reservation ledger (section 17.2a, "What holds
 * the count"). A judge that is given none binds no delivery.
 */
export type Counts = (item: Item, message: string) => number;

/** The count on the folded holder, as runtime and replay both read it. */
export const decisionCounts = (view: Pick<StateView, "holder">): Counts =>
  (item, message) => own(view.holder(item.id)?.decisions, message) ?? 0;

/**
 * Whether a delivery is bound, on the state before its entry (the table of
 * section 17.2a, conditions 2 to 5; condition 1 is the reading of the
 * fields, which the caller made). The item that it is bound to, or null:
 *
 * 2. the source of `bound.of` selects an item;
 * 3. the item is not final;
 * 4. each `where` holds;
 * 5. the item's count for the message is above 0.
 *
 * Two conditions are of the data: the handler states `bound`, and the type
 * of the item lists the message in `decisions`. The validator checked the
 * second. Whether a delivery is bound decides nothing but the room that its
 * entry is admitted against: the handler's guards decide the request in
 * the same way, bound or not.
 */
export function boundTo(j: Judging, handler: ReceiveType, message: string, counts: Counts | undefined): Item | null {
  const stated: Bound | undefined = (handler as unknown as PlatformReceive).bound;
  const item = stated ? j.subjects.get(stated.of) : undefined;
  if (!stated || !item || !counts) return null;
  if (own(own(j.definition.declared.items, item.type)?.states, item.state)?.final !== false) return null;
  const holds = stated.where.every((w) => ("equals" in w ? equal(j, operand(j, w.equals.a, item), operand(j, w.equals.b, item)) : !equal(j, operand(j, w.differs.a, item), operand(j, w.differs.b, item))));
  return holds && counts(item, message) > 0 ? item : null;
}

/** The `decisions` that the `holds` of an item type states for one message: the count that the entry which opens such an item sets. Zero: the type states none. */
export function decisionsOf(definition: Pick<ValidDefinition, "declared">, type: string, message: string): number {
  const stated = (own(definition.declared.items, type) as { holds?: { decisions?: Record<string, number> } } | undefined)?.holds?.decisions;
  return own(stated, message) ?? 0;
}

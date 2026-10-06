/**
 * Marker duties (scope contract, revision 22, section 6.4, "`settles` by a
 * mark" and "Several marks on one item"; section 17.2, "A marker duty";
 * rows I3-54 and I3-59). An act or a handler may declare `settles: { of,
 * sets, in }`: it settles an item by a mark that its entry sets. The mark
 * is a truth value that only becomes `true`.
 *
 * This file is the rule of 11 parts as one pure function, in entries. The
 * validator runs it over the data to find a closure that is not finite,
 * and the runtime and a verifier run it over the folded state to count
 * what the items of a type with marks reserve. Both use the same code, so
 * the amounts cannot drift.
 *
 * - A marker duty is (item, slot). It is pending while the slot is `false`
 *   and the item's state is in the `in` of a form that settles that slot
 *   (rules 1 and 2).
 * - The forms that settle one mark in one state are alternatives of one
 *   duty, and the largest counts. A form that settles another mark, or
 *   that settles by state, is no alternative of it (rule 5).
 * - An item reserves a sum: the chain of its deadline, its state duty and
 *   each pending marker duty (rule 6). The chain is counted by `owed` as
 *   before, so `awaits` here is the other two.
 * - A mark that is `true` is completed, and is in no later count (rules 4
 *   and 8). So the count of an item with several marks ends.
 * - A timed entry is never refused. So a state from which a timed rule
 *   leads to another counts, for each duty, the larger of what it reserves
 *   here and there (point DI19).
 *
 * The amounts are of entries only, as every count of `reserve.ts` is: the
 * other four dimensions are request `cc570904`'s.
 */

import type { Item, StateView } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { own } from "./values.ts";

/**
 * One form that settles an item of a type that has marks, as the amounts
 * read it. `slot`: the mark that it sets, or null for a form that settles
 * by state. `in`: the states that its `settles` lists. `base`: its entry,
 * what its requests reserve, and what its effects can start on its other
 * subjects and in an item that it opens, each counted with no mark
 * completed. `sets`: the states that a written effect of the form can set
 * on the settled item. `chain`: the longest chain of a deadline slot that
 * a written effect of the form sets on the settled item.
 */
export interface MarkerForm { path: string; slot: string | null; in: readonly string[]; base: number; sets: readonly string[]; chain: number }

/**
 * One item type that some form settles by a mark. `marks`: its slots that
 * are marks. `forms`: every form that settles an item of the type, by a
 * mark or by state. `moves`: its timed rules, each with the states that it
 * applies in and the state that it leaves its item in. `held`: the entries
 * that a deadline reserves in each state (`ValidDefinition.deadlines`).
 */
export interface MarkedType {
  marks: readonly string[];
  forms: readonly MarkerForm[];
  moves: readonly { from: readonly string[]; to: string }[];
  held: Readonly<Record<string, number>>;
}

/** The item types of a definition that have marks, by name. */
export type Markers = Readonly<Record<string, MarkedType>>;

/**
 * The amounts of "A marker duty", over the types that have marks.
 *
 * `base`: what a form reserves beside what it leaves on the settled item.
 * The runtime reads the number that the validator stored. The validator
 * computes it while it looks for a cycle. `cyclic`: called when the count
 * of a type in a state, with a set of completed marks, reaches itself. The
 * closure is then not finite (rule 9), and the validator refuses the
 * definition.
 */
export function markerAmounts(types: Markers, base: (type: string, form: MarkerForm) => number = (_, form) => form.base, cyclic: (type: string, state: string) => void = () => undefined) {
  const known = new Map<string, number>();
  const open = new Set<string>();
  const completed = (t: MarkedType, done: readonly string[]): string[] => t.marks.filter((mark) => done.includes(mark));

  /** Rule 7, and point DI18 for a form by state: what one form reserves, where `done` holds the marks that are completed after its entry. */
  const formOf = (name: string, t: MarkedType, form: MarkerForm, done: readonly string[]): number => {
    // A form by state that leaves the item in a state of its own `in` settles nothing there, so that state is not counted.
    const left = form.sets.filter((state) => form.slot !== null || !form.in.includes(state));
    return base(name, form) + Math.max(form.chain, 0, ...left.map((state) => (own(t.held, state) ?? 0) + awaits(name, state, done)));
  };
  /** One duty of an item in a state: the largest over its alternatives there, and over the states that a timed rule leads to (point DI19). `slot` null: the state duty. */
  const dutyOf = (name: string, t: MarkedType, slot: string | null, state: string, done: readonly string[]): number => {
    const here = t.forms.filter((form) => form.slot === slot && form.in.includes(state)).map((form) => formOf(name, t, form, slot === null ? done : [...done, slot]));
    const there = t.moves.filter((move) => move.from.includes(state)).map((move) => dutyOf(name, t, slot, move.to, done));
    return Math.max(0, ...here, ...there);
  };
  /**
   * Rule 6, without the chain of the deadline: what an item of that type in
   * that state awaits, where the marks of `done` are `true`. It is the
   * state duty and each marker duty of a mark that is not completed.
   */
  const awaits = (name: string, state: string, done: readonly string[]): number => {
    const t = own(types, name);
    if (!t) return 0;
    const set = completed(t, done);
    const key = JSON.stringify([name, state, set]);
    const found = known.get(key);
    if (found !== undefined) return found;
    if (open.has(key)) { cyclic(name, state); return 0; }
    open.add(key);
    const total = dutyOf(name, t, null, state, set) + t.marks.filter((mark) => !set.includes(mark)).reduce((sum, mark) => sum + dutyOf(name, t, mark, state, set), 0);
    open.delete(key);
    known.set(key, total);
    return total;
  };
  /** Rule 2: the marks of an item of that type in that state whose duty is pending, where the marks of `done` are `true`. */
  const pending = (name: string, state: string, done: readonly string[]): string[] => {
    const t = own(types, name);
    return t ? t.marks.filter((mark) => !done.includes(mark) && t.forms.some((form) => form.slot === mark && form.in.includes(state))) : [];
  };
  return { awaits, pending };
}

/** The marks of an item that are `true`: completed, and in no later count (rule 8). */
export const marksDone = (type: MarkedType, item: Pick<Item, "values">): string[] => type.marks.filter((mark) => own(item.values, mark) === true);

/**
 * What one item of a type with marks reserves beside the chain of its
 * deadline, in entries: its state duty and each marker duty that is
 * pending (rule 6). Zero for an item of a type that has no mark: `owed`
 * counts that from `ValidDefinition.pending`.
 */
export function itemAwaits(definition: Pick<ValidDefinition, "markers">, item: Pick<Item, "type" | "state" | "values">): number {
  const type = own(definition.markers, item.type);
  return type ? markerAmounts(definition.markers!).awaits(item.type, item.state, marksDone(type, item)) : 0;
}

/**
 * What a rule's effect may not be (section 6.4): the fault's words, or
 * null. A mark is set once, so an effect of a rule that sets one otherwise
 * than to `true` is a fault. And in an entry of a form that declares
 * `settles`, of any of the three forms, an effect that a rule returns is no
 * `state` effect, and sets no slot that a timed rule names as its
 * `deadline`: the validator counts no change of state for an effect mark of
 * such a form ("A rule of a form that declares `settles` sets no state").
 */
export function ruleMayNot(definition: Pick<ValidDefinition, "markers" | "declared">, settling: boolean, type: string, effect: { effect: string; slot?: string; value?: unknown }): string | null {
  if (effect.effect === "value" && effect.slot !== undefined && own(definition.markers, type)?.marks.includes(effect.slot) && effect.value !== true) return `a value of the mark ${effect.slot} that is not true: a mark is set once`;
  if (!settling) return null;
  if (effect.effect === "state") return "a change of state, in an entry of a form that declares settles";
  if (effect.effect === "value" && Object.values(definition.declared.timed).some((rule) => rule.on === type && rule.deadline === effect.slot)) return `a deadline, ${effect.slot}, in an entry of a form that declares settles`;
  return null;
}

/** How many items one page of the count reads. */
const PAGE = 64;

/**
 * Section 17.2, row 3, for the types that have marks: the entries that
 * their items reserve for their settlements, from the folded state (rule
 * 10). `owed` adds it to what the other duties reserve.
 *
 * The items of each live state in which something can be awaited are read,
 * a page at a time, because the amount of one item follows from its marks.
 * That is at most the type's `max` items. The items of a final state are
 * not read: a final state has no marker duty, and its state duty is counted
 * at the count of the state with no mark completed, which is never less.
 */
export function markerOwed(view: StateView, definition: Pick<ValidDefinition, "markers" | "declared">): number {
  const markers = definition.markers;
  if (!markers) return 0;
  const amounts = markerAmounts(markers);
  let entries = 0;
  for (const [name, type] of Object.entries(markers)) {
    for (const [state, { final }] of Object.entries(own(definition.declared.items, name)?.states ?? {})) {
      const most = amounts.awaits(name, state, []);
      if (most === 0) continue;
      if (final) { entries += most * view.count(name, state); continue; }
      for (let after: number | null = null; ;) {
        const page = view.page(name, [state], after, PAGE);
        for (const item of page.items) entries += amounts.awaits(name, state, marksDone(type, item));
        if (!page.more || page.items.length === 0) break;
        after = page.items.at(-1)!.id;
      }
    }
  }
  return entries;
}

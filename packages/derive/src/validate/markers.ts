/**
 * `settles` by a mark, at the validator (scope contract, revision 22,
 * section 6.4, "`settles` by a mark" and "Several marks on one item";
 * section 17.2, "A marker duty"; rows I3-54 and I3-59): the grammar of the
 * third form, the rule that a mark is set once, and what the amounts of the
 * marker duties are derived from. The amounts themselves are `markers.ts`,
 * which the runtime runs on the folded state with the same code.
 */

import { isObject, own } from "../values.ts";
import { NOTHING, sum, type Amount } from "../held.ts";
import { markerReservations, type MarkedType, type MarkerForm, type Markers } from "../markers.ts";
import type { ClauseSet, Defining, Duties, Type } from "./context.ts";
import { at, type Rec } from "./shape.ts";
import type { TimedGraph, TimedMove } from "./timed.ts";

/**
 * The grammar of `{ of, sets, in }`, where `of` already names an item type
 * `s` that exists before the entry and `states` are states of it. `sets`
 * names a value slot of that type which is a truth value, required, with
 * `default: false`, and not fixed: the mark. `in` lists no final state: an
 * item that awaited a mark in a final state could never be settled. The
 * mark's name, or null when the form is refused.
 */
export function settlesByMark(d: Defining, r: Rec, s: Type, states: readonly string[], path: string, top: Rec): string | null {
  const name = r["sets"];
  const slot = typeof name === "string" ? s.slots.get(name) : undefined;
  const type = own(isObject(top["items"]) ? top["items"] : {}, s.name);
  const values = isObject(type) && isObject(type["values"]) ? type["values"] : {};
  const written = typeof name === "string" ? own(values, name) : undefined;
  let ok = true;
  if (slot?.kind !== "value" || slot.type.type !== "bool" || !slot.required || slot.fixed || !isObject(written) || written["default"] !== false) {
    ok = d.bad("name", at(path, "sets"), `names no value slot of ${s.name} that is a truth value, required, with the default false, and not fixed`) ?? false;
  }
  for (const [i, state] of states.entries()) if (s.states.get(state) === true) ok = d.bad("final", at(at(path, "in"), i), "a settlement by a mark lists no final state: a final item cannot be changed, so it could never be settled") ?? false;
  return ok ? (name as string) : null;
}

/** For each item type, the slots that a `settles` of the third form names: its marks. */
export function marksOf(duties: readonly Duties[]): Map<string, Set<string>> {
  const marks = new Map<string, Set<string>>();
  for (const { settles } of duties) {
    if (settles && "subject" in settles && settles.slot !== undefined) marks.set(settles.type, (marks.get(settles.type) ?? new Set<string>()).add(settles.slot));
  }
  return marks;
}

/**
 * "The mark is set once": no written effect of the definition sets a mark
 * but a `value` effect of the constant `true`. A mark is a value slot, and
 * a value slot is set by a `value` effect only, so each one that was read
 * is checked. An effect of a rule that sets a mark otherwise is a fault, in
 * the commit.
 */
export function setOnce(d: Defining): void {
  const marks = marksOf(d.duties);
  for (const set of d.valueSets) if (!set.constant && marks.get(set.type)?.has(set.slot)) d.bad("shape", set.path, `${set.slot} of ${set.type} is a mark that a form settles by: a written effect sets it only to the constant true`);
}

/** What the count of section 17.2 gives this file: the chain of a deadline in a state, what a list of effects can start, and what the requests of a form reserve. */
export interface Counting {
  graph: TimedGraph;
  moves: readonly TimedMove[];
  entry(form: Duties): Amount;
  deadline(entries: number): Amount;
  starts(set: ClauseSet): Amount;
  requests(form: Duties): Amount;
}

/**
 * The types that have marks, with every form that settles an item of one,
 * as `markers.ts` reads them. `unbounded` takes each form whose duty
 * reaches itself (rule 9): the definition is then refused
 * `reserve-unbounded`. `awaits` is what an item of such a type awaits in a
 * state with no mark completed, which is what the count of any item that
 * the data does not name reads (rule 11). `data` gives the value that the
 * runtime keeps, once the closures are known to be finite.
 */
export function markerCapacity(d: Pick<Defining, "duties" | "types">, count: Counting, unbounded: Set<Duties>) {
  const marks = marksOf(d.duties);
  const origin = new Map<MarkerForm, Duties>();
  const types = new Map<string, MarkedType>();
  for (const [name, slots] of marks) {
    const forms = d.duties.flatMap((form): MarkerForm[] => {
      const settled = form.settles && "subject" in form.settles && form.settles.type === name ? form.settles : null;
      if (!settled) return [];
      const own = form.sets.filter((e) => e.subject === settled.subject);
      const chain = Math.max(0, ...own.map((e) => (e.slot === undefined ? 0 : (count.graph.fromSlot.get(name)?.get(e.slot) ?? 0))));
      const read: MarkerForm = {
        path: form.path, slot: settled.slot ?? null, in: [...new Set(settled.states)], base: 0, amount: NOTHING,
        sets: [...new Set(own.flatMap((e) => (e.state === undefined ? [] : [e.state])))],
        chain, chainAmount: count.deadline(chain),
      };
      origin.set(read, form);
      return [read];
    });
    types.set(name, {
      marks: [...slots].sort(), forms,
      moves: count.moves.filter((move) => move.type === name).map((move) => ({ from: move.states, to: move.to })),
      held: Object.fromEntries(count.graph.fromState.get(name) ?? []),
      heldAmounts: Object.fromEntries([...(count.graph.fromState.get(name) ?? [])].map(([state, entries]) => [state, count.deadline(entries)])),
    });
  }
  // Built from entries, so each type is an own name of the record, whatever it is called.
  const markers: Markers = Object.fromEntries(types);
  /** Rule 7: the entry of a form, what its requests reserve, and what its effects can start on its other subjects and in an item that it opens. */
  const base = (form: MarkerForm): Amount => {
    const from = origin.get(form)!;
    const subject = from.settles && "subject" in from.settles ? from.settles.subject : null;
    return sum(count.entry(from), count.starts(from.sets.filter((e) => e.subject !== subject)), count.requests(from));
  };
  const amounts = markerReservations(markers, (_, form) => base(form), (name, state) => {
    const forms = markers[name]!.forms;
    const here = forms.filter((form) => form.in.includes(state));
    for (const form of here.length > 0 ? here : forms) unbounded.add(origin.get(form)!);
  });
  return {
    marked: (type: string): boolean => marks.has(type),
    awaits: (type: string, state: string): Amount => amounts.awaits(type, state, []),
    /** Every type in every state is counted, so a closure that is not finite is found whatever reads it. */
    check(): void {
      for (const name of marks.keys()) for (const state of d.types.get(name)?.states.keys() ?? []) amounts.awaits(name, state, []);
    },
    data(): Markers | null {
      if (marks.size === 0) return null;
      for (const type of types.values()) for (const form of type.forms) { form.amount = base(form); form.base = form.amount.entries; }
      return markers;
    },
  };
}

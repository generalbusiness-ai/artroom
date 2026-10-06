/**
 * What a duty reserves, as far as the definition decides it (scope contract,
 * section 17.2): the chain of timed rules from each state, what
 * an item or a copy that awaits its settlement reserves, and the most that
 * a result clause can start.
 *
 * A reservation is of a duty's whole closure: the duty, and every duty that
 * a settling entry of the closure can create. A settling entry is written
 * whatever is free, so the room for what it starts exists before it.
 */

import type { ScopeKind } from "@generalbusiness/artroom-contract";
import { NOTHING, largest, requestEntries, sum, times, type Amount } from "../held.ts";
import type { Markers } from "../markers.ts";
import type { ClauseSet, Defining, Duties } from "./context.ts";
import { markerCapacity } from "./markers.ts";
import type { TimedGraph, TimedMove } from "./timed.ts";

/** A relationship whose copies await a settlement in those states (section 17.2, row 4), and the entries each reserves. */
export interface PendingCopy { name: string; kind: ScopeKind; states: readonly string[]; entries: number }

/**
 * The known declared duty terms, in Amount form: entries, declared future requests, and their entries' stand-in bytes, including
 * each result's foreign source entry. Item/record terms and other retained inputs remain owed under cc570904. The numeric
 * fields of Capacity are entry projections of these amounts, not a second calculation or five-dimensional admission.
 */
export interface DutyAmounts {
  deadlines: Readonly<Record<string, Readonly<Record<string, Amount>>>>;
  pending: Readonly<Record<string, Readonly<Record<string, Amount>>>>;
  pendingCopies: readonly (Omit<PendingCopy, "entries"> & { amount: Amount })[];
  clause: Amount;
  decisions: Readonly<Record<string, Amount>>;
}

export interface Capacity {
  dutyAmounts: DutyAmounts;
  deadlines: Record<string, Record<string, number>>;
  pending: Record<string, Record<string, number>>;
  pendingCopies: PendingCopy[];
  clauseEntries: number;
  /** What the written effects of each bound handler can start, by its path. Sends draw on the holder's requests. */
  decisionEntries: Record<string, number>;
  /** Section 17.2, "A marker duty": the types that some form settles by a mark. Their items are counted one by one (`markers.ts`), so `pending` has no row for them. Absent: none. */
  markers?: Markers;
}

/**
 * The chains are finite here: the validator refuses a cycle of timed rules
 * first. Each rule's chain was computed once, with the cycle check. A cycle
 * of settling forms is refused here, as `reserve-unbounded`.
 */
export function capacityOf(d: Pick<Defining, "bad" | "bounds" | "duties" | "clauseSets" | "types">, graph: TimedGraph, moves: readonly TimedMove[]): Capacity {
  const entry: Amount = { ...NOTHING, entries: 1, bytes: d.bounds.entryBytes };
  const deadline = (entries: number): Amount => times(entries, entry);
  /** A deadline's known amount in that state, with each timed entry at the entry-size stand-in. */
  const held = (type: string, state: string): Amount => deadline(graph.fromState.get(type)?.get(state) ?? 0);
  // Built from entries, so each type and each state is an own name of its record, whatever it is called (`own`, in values.ts).
  const deadlineAmounts = Object.fromEntries([...graph.fromState].map(([type, states]) => [type, Object.fromEntries([...states].map(([state, entries]) => [state, deadline(entries)]))]));
  const entriesOfStates = (amounts: DutyAmounts["pending"]): Record<string, Record<string, number>> => Object.fromEntries(Object.entries(amounts).map(([type, states]) => [type, Object.fromEntries(Object.entries(states).map(([state, amount]) => [state, amount.entries]))]));
  const deadlines = entriesOfStates(deadlineAmounts);

  const key = (type: string, state: string) => JSON.stringify([type, state]);
  /** The forms that settle an item of that type in that state, by type and state. */
  const settlers = new Map<string, Duties[]>();
  const unbounded = new Set<Duties>();
  // Revision 22, "A marker duty": an item of a type that some form settles by a mark reserves by its state and by the marks that
  // are `true`. Every form that settles an item of such a type, by a mark or by state, is counted there, and not below.
  const markers = markerCapacity(d, { graph, moves, entry, deadline, starts: (set) => starts(set), requests: (form) => requestsOf(form) }, unbounded);
  for (const form of d.duties) {
    if (form.settles && "subject" in form.settles && !markers.marked(form.settles.type)) for (const state of new Set(form.settles.states)) settlers.set(key(form.settles.type, state), [...(settlers.get(key(form.settles.type, state)) ?? []), form]);
  }
  const done = new Map<string, Amount>();
  const open = new Set<string>();
  const forms: Duties[] = [];

  /**
   * Row 3: what an item of that type in that state reserves for its
   * settlement. Where several forms settle one state, the largest. A timed
   * rule may take the item to a state that awaits a settlement, and a timed
   * entry is never refused: so the item reserves that from the state the
   * rule applies in.
   */
  const awaits = (type: string, state: string): Amount => {
    // Rule 11 of "A marker duty": an item that the data does not name is counted with no mark completed.
    if (markers.marked(type)) return markers.awaits(type, state);
    const k = key(type, state);
    const known = done.get(k);
    if (known !== undefined) return known;
    // The closure is not finite: settling forms create one another's pending states in a cycle.
    if (open.has(k)) {
      // A cycle may return through a timed state that no form settles (GC8). The forms whose closures are being counted still
      // reach that cycle, so refuse them rather than letting an empty list of settlers turn a nonfinite closure into zero.
      for (const form of settlers.get(k) ?? forms) unbounded.add(form);
      return NOTHING;
    }
    open.add(k);
    let most = largest(...(settlers.get(k) ?? []).map(amountOf));
    for (const rule of moves) if (rule.type === type && rule.states.includes(state)) most = largest(most, awaits(type, rule.to));
    open.delete(k);
    done.set(k, most);
    return most;
  };
  /**
   * What one list of effects can start: for each subject one item's worth,
   * by the state the list can set or by a deadline slot it sets. An item in
   * a state holds the chain of its deadline and what awaits its settlement.
   * `but`: the states of one subject that are not counted.
   */
  const starts = (set: ClauseSet, but?: { subject: string; states: readonly string[] }): Amount => {
    const bySubject = new Map<string, Amount>();
    for (const e of set) {
      if (e.state !== undefined && but?.subject === e.subject && but.states.includes(e.state)) continue;
      const most = e.state !== undefined ? sum(held(e.type, e.state), awaits(e.type, e.state)) : deadline(graph.fromSlot.get(e.type)?.get(e.slot!) ?? 0);
      bySubject.set(e.subject, largest(bySubject.get(e.subject) ?? NOTHING, most));
    }
    return sum(...bySubject.values());
  };
  /**
   * What a settling form reserves: its own entry; what its effects can
   * start; and for each request it can send, at the bounds, the two entries
   * of row 1 and the most that one clause of that send can start. An entry
   * that leaves its subject in a listed state settles nothing and is new
   * work, so such a state is not counted here.
   */
  // Each request here is future work of a settling form: its pending-request unit is Reserved, not Used. Its result may newly
  // retain its foreign source entry. The largest clause closure is propagated in every dimension already known here.
  const requestsOf = (form: Duties): Amount => sum(...form.requests.map((request) => times(request.most, sum(requestEntries(d.bounds.entryBytes), largest(...request.clauses.map((c) => starts(c)))))));
  const amountOf = (form: Duties): Amount => {
    const settled = form.settles && "subject" in form.settles ? form.settles : undefined;
    forms.push(form);
    const amount = sum(entry, starts(form.sets, settled), requestsOf(form));
    forms.pop();
    return amount;
  };

  // Collected by type and state in maps, so no write reaches a prototype: a name is an own name of the record built from them.
  const waiting = new Map<string, Map<string, Amount>>();
  const wait = (type: string, state: string) => waiting.set(type, (waiting.get(type) ?? new Map<string, Amount>()).set(state, awaits(type, state)));
  markers.check();
  for (const form of d.duties) {
    if (!form.settles || !("subject" in form.settles) || markers.marked(form.settles.type)) continue;
    const { type, states } = form.settles;
    for (const state of states) wait(type, state);
  }
  // A state that a timed rule can take to one that awaits a settlement reserves it too.
  for (const rule of moves) for (const state of rule.states) if (!markers.marked(rule.type) && awaits(rule.type, state).entries > 0) wait(rule.type, state);
  const pendingAmounts = Object.fromEntries([...waiting].map(([type, states]) => [type, Object.fromEntries(states)]));
  const pending = entriesOfStates(pendingAmounts);
  // Row 4: a copy in a listed state reserves what the handler that settles it reserves.
  const copyAmounts = d.duties.flatMap((form): DutyAmounts["pendingCopies"][number][] => (form.settles && "copy" in form.settles ? [{ name: form.settles.name, kind: form.settles.kind as ScopeKind, states: form.settles.copy, amount: amountOf(form) }] : []));
  const pendingCopies = copyAmounts.map(({ amount, ...copy }) => ({ ...copy, entries: amount.entries }));
  // A request reserves, beside its two entries, the most that one of its clauses can start. The runtime holds the largest over
  // every request form of the definition, which is never less (section 17.2, "More, and never less").
  const clause = largest(...d.clauseSets.map((c) => starts(c)));
  for (const form of unbounded) d.bad("reserve-unbounded", form.path, "the forms that settle lead back to the state this one settles, so no reservation covers what its settlement can start");
  const marked = unbounded.size === 0 ? markers.data() : null;
  const decisions = Object.fromEntries(d.duties.filter((form) => form.path.startsWith("receives.")).map((form) => [form.path, starts(form.sets)]));
  const decisionEntries = Object.fromEntries(Object.entries(decisions).map(([path, amount]) => [path, amount.entries]));
  return { dutyAmounts: { deadlines: deadlineAmounts, pending: pendingAmounts, pendingCopies: copyAmounts, clause, decisions }, deadlines, pending, pendingCopies, clauseEntries: clause.entries, decisionEntries, ...(marked ? { markers: marked } : {}) };
}

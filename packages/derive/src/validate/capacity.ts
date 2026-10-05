/**
 * What a duty reserves, as far as the definition decides it (scope contract,
 * section 17.2, in entries): the chain of timed rules from each state, what
 * an item or a copy that awaits its settlement reserves, and the most that
 * a result clause can start.
 *
 * A reservation is of a duty's whole closure: the duty, and every duty that
 * a settling entry of the closure can create. A settling entry is written
 * whatever is free, so the room for what it starts exists before it.
 */

import type { ScopeKind } from "@generalbusiness/artroom-contract";
import type { ClauseSet, Defining, Duties } from "./context.ts";
import type { TimedGraph, TimedMove } from "./timed.ts";

/** A relationship whose copies await a settlement in those states (section 17.2, row 4), and the entries each reserves. */
export interface PendingCopy { name: string; kind: ScopeKind; states: readonly string[]; entries: number }

export interface Capacity {
  deadlines: Record<string, Record<string, number>>;
  pending: Record<string, Record<string, number>>;
  pendingCopies: PendingCopy[];
  clauseEntries: number;
}

/**
 * The chains are finite here: the validator refuses a cycle of timed rules
 * first. Each rule's chain was computed once, with the cycle check. A cycle
 * of settling forms is refused here, as `reserve-unbounded`.
 */
export function capacityOf(d: Pick<Defining, "bad" | "duties" | "clauseSets">, graph: TimedGraph, moves: readonly TimedMove[]): Capacity {
  /** The entries a deadline reserves when an item of that type is in that state. */
  const held = (type: string, state: string): number => graph.fromState.get(type)?.get(state) ?? 0;
  // Built from entries, so each type and each state is an own name of its record, whatever it is called (`own`, in values.ts).
  const deadlines: Record<string, Record<string, number>> = Object.fromEntries([...graph.fromState].map(([type, states]) => [type, Object.fromEntries(states)]));

  const key = (type: string, state: string) => JSON.stringify([type, state]);
  /** The forms that settle an item of that type in that state, by type and state. */
  const settlers = new Map<string, Duties[]>();
  for (const form of d.duties) {
    if (form.settles && "subject" in form.settles) for (const state of new Set(form.settles.states)) settlers.set(key(form.settles.type, state), [...(settlers.get(key(form.settles.type, state)) ?? []), form]);
  }
  const done = new Map<string, number>();
  const open = new Set<string>();
  const unbounded = new Set<Duties>();

  /**
   * Row 3: what an item of that type in that state reserves for its
   * settlement. Where several forms settle one state, the largest. A timed
   * rule may take the item to a state that awaits a settlement, and a timed
   * entry is never refused: so the item reserves that from the state the
   * rule applies in.
   */
  const awaits = (type: string, state: string): number => {
    const k = key(type, state);
    const known = done.get(k);
    if (known !== undefined) return known;
    // The closure is not finite: settling forms create one another's pending states in a cycle.
    if (open.has(k)) { for (const form of settlers.get(k) ?? []) unbounded.add(form); return 0; }
    open.add(k);
    let most = Math.max(0, ...(settlers.get(k) ?? []).map(entriesOf));
    for (const rule of moves) if (rule.type === type && rule.states.includes(state)) most = Math.max(most, awaits(type, rule.to));
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
  const starts = (set: ClauseSet, but?: { subject: string; states: readonly string[] }): number => {
    const bySubject = new Map<string, number>();
    for (const e of set) {
      if (e.state !== undefined && but?.subject === e.subject && but.states.includes(e.state)) continue;
      const most = e.state !== undefined ? held(e.type, e.state) + awaits(e.type, e.state) : (graph.fromSlot.get(e.type)?.get(e.slot!) ?? 0);
      bySubject.set(e.subject, Math.max(bySubject.get(e.subject) ?? 0, most));
    }
    return [...bySubject.values()].reduce((a, b) => a + b, 0);
  };
  /**
   * What a settling form reserves: its own entry; what its effects can
   * start; and for each request it can send, at the bounds, the two entries
   * of row 1 and the most that one clause of that send can start. An entry
   * that leaves its subject in a listed state settles nothing and is new
   * work, so such a state is not counted here.
   */
  const entriesOf = (form: Duties): number => {
    const settled = form.settles && "subject" in form.settles ? form.settles : undefined;
    return 1 + starts(form.sets, settled) + form.requests.reduce((n, request) => n + request.most * (2 + Math.max(0, ...request.clauses.map((c) => starts(c)))), 0);
  };

  const pending: Record<string, Record<string, number>> = {};
  for (const form of d.duties) {
    if (!form.settles || !("subject" in form.settles)) continue;
    const { type, states } = form.settles;
    for (const state of states) (pending[type] ??= {})[state] = awaits(type, state);
  }
  // A state that a timed rule can take to one that awaits a settlement reserves it too.
  for (const rule of moves) for (const state of rule.states) if (awaits(rule.type, state) > 0) (pending[rule.type] ??= {})[state] = awaits(rule.type, state);
  // Row 4: a copy in a listed state reserves what the handler that settles it reserves.
  const pendingCopies = d.duties.flatMap((form): PendingCopy[] => (form.settles && "copy" in form.settles ? [{ name: form.settles.name, kind: form.settles.kind as ScopeKind, states: form.settles.copy, entries: entriesOf(form) }] : []));
  // A request reserves, beside its two entries, the most that one of its clauses can start. The runtime holds the largest over
  // every request form of the definition, which is never less (section 17.2, "More, and never less").
  const clauseEntries = Math.max(0, ...d.clauseSets.map((c) => starts(c)));
  for (const form of unbounded) d.bad("reserve-unbounded", form.path, "the forms that settle lead back to the state this one settles, so no reservation covers what its settlement can start");
  return { deadlines, pending, pendingCopies, clauseEntries };
}

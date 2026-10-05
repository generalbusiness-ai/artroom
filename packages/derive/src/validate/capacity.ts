/**
 * What a duty reserves, as far as the definition decides it (scope contract,
 * section 17.2, in entries): the chain of timed rules from each state, and
 * the most that a result clause can start.
 */

import type { ClauseSet } from "./context.ts";
import type { TimedGraph } from "./timed.ts";

export interface Capacity {
  deadlines: Record<string, Record<string, number>>;
  clauseEntries: number;
}

/** The chains are finite here: the validator refuses a cycle first. Each rule's chain was computed once, with the cycle check. */
export function capacityOf(graph: TimedGraph, clauseSets: readonly ClauseSet[]): Capacity {
  /** The entries a deadline reserves when an item of that type is in that state. */
  const held = (type: string, state: string): number => graph.fromState.get(type)?.get(state) ?? 0;
  // Built from entries, so each type and each state is an own name of its record, whatever it is called (`own`, in values.ts).
  const deadlines: Record<string, Record<string, number>> = Object.fromEntries([...graph.fromState].map(([type, states]) => [type, Object.fromEntries(states)]));
  // What one clause can start: for each subject one deadline, by the state the clause sets or by a deadline slot it sets.
  const starts = (set: ClauseSet): number => {
    const bySubject = new Map<string, number>();
    for (const e of set) {
      const most = e.state !== undefined ? held(e.type, e.state) : (graph.fromSlot.get(e.type)?.get(e.slot!) ?? 0);
      bySubject.set(e.subject, Math.max(bySubject.get(e.subject) ?? 0, most));
    }
    return [...bySubject.values()].reduce((a, b) => a + b, 0);
  };
  return { deadlines, clauseEntries: Math.max(0, ...clauseSets.map(starts)) };
}

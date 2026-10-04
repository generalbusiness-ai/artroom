/**
 * The order of due transitions (scope contract, section 5.2). What is due is
 * derived from the items. No list of pending transitions is kept.
 */

import type { Timestamp } from "@generalbusiness/artroom-contract";
import type { StateView } from "./state.ts";
import { timeMs } from "./time.ts";
import type { ValidDefinition } from "./validate.ts";
import { byteOrder } from "./values.ts";

/** One transition: the item that holds the deadline `due` under the timed rule `rule`. */
export interface Due { item: number; rule: string; due: Timestamp }

/**
 * The next due transition as of `asOf`, or null. A transition is due when its
 * deadline is not later than `asOf`. The order is by deadline, earliest
 * first; then by item ID, lowest first; then by rule name, in byte order.
 * When the clock is behind, `asOf` is the previous entry's time
 * (`Clock.asOf`, section 5.3).
 */
export function nextDue(view: StateView, definition: ValidDefinition, asOf: Timestamp): Due | null {
  const limit = timeMs(asOf);
  if (limit === null) throw new Error("asOf is a timestamp");
  let best: { due: Due; ms: number } | null = null;
  for (const [name, rule] of Object.entries(definition.declared.timed)) {
    // A rule's states are live, and a type's `max` bounds its live items, so this one page is all of them.
    for (const item of view.page(rule.on, rule.states, null, definition.declared.items[rule.on]!.max).items) {
      const due = item.values[rule.deadline];
      const ms = timeMs(due);
      if (ms === null || ms > limit) continue;
      if (best === null || ms < best.ms || (ms === best.ms && (item.id < best.due.item || (item.id === best.due.item && byteOrder(name, best.due.rule) < 0)))) {
        best = { due: { item: item.id, rule: name, due: due as Timestamp }, ms };
      }
    }
  }
  return best?.due ?? null;
}

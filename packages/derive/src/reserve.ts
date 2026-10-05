/**
 * Room to settle (scope contract, section 9.2): a scope that admits a duty
 * must still be able to record how that duty ends. This file counts, from
 * the folded state alone, the entries the admitted duties still need, and
 * says whether an entry that admits new duties leaves room for them. The
 * runtime asks inside the commit, after the fold; a verifier asks the same
 * question of the same state.
 *
 * What is counted, as far as today's forms allow:
 *
 * - each live item of a timed item type: one entry for each timed rule on
 *   that type;
 * - each request this scope sent that has no recorded result and no
 *   `undelivered` diagnosis: one entry for its result, and before any
 *   diagnosis one more, because a `delivery-unavailable` diagnosis may be
 *   followed by a late result;
 * - a provisional scope: the entry that records its confirmation;
 * - each opened attempt of an outside operation: one entry for its outcome,
 *   and before any outcome one more, because `unknown` may be followed by
 *   the same attempt's outcome;
 * - one checkpoint.
 *
 * What is not counted is in the deltas note. The count is of entries, never
 * of bytes.
 */

import type { Bounds, Input } from "@generalbusiness/artroom-contract";
import type { StateView } from "./state.ts";
import type { ValidDefinition } from "./validate.ts";

/** The entries the admitted duties of this state still need. */
export function owed(view: StateView, definition: ValidDefinition): number {
  const scope = view.scope();
  if (!scope) return 0;
  const { declared } = definition;
  let entries = 1;                                             // one checkpoint
  if (scope.status === "provisional") entries += 1;            // the confirmation
  for (const type of definition.timedTypes) {
    const rules = Object.values(declared.timed).filter((rule) => rule.on === type).length;
    const live = Object.entries(declared.items[type]!.states).reduce((n, [state, { final }]) => (final ? n : n + view.count(type, state)), 0);
    entries += rules * live;
  }
  const open = view.outstanding();
  return entries + 2 * open.requests + open.unavailable + 2 * open.opened + open.unknown;
}

/**
 * Whether the state, as the entry just folded left it, has room for every
 * duty it has admitted. An entry that admits new duties is written only when
 * this holds: an act, a genesis, and a delivery of a request or an advisory.
 * A checkpoint uses the one entry counted for it. Every other entry settles
 * a duty that was counted when it was admitted, and is not asked.
 */
export function fits(view: StateView, definition: ValidDefinition, bounds: Pick<Bounds, "scopeEntries">, input: Input): boolean {
  const scope = view.scope();
  if (!scope) return true;
  const settles = input.type === "timed" || input.type === "diagnosis" || input.type === "outcome" || (input.type === "delivery" && (input.message.class === "result" || input.message.class === "control"));
  if (settles) return true;
  return scope.head.seq + 1 + owed(view, definition) - (input.type === "checkpoint" ? 1 : 0) <= bounds.scopeEntries;
}

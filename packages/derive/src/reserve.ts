/**
 * Room to settle (scope contract, sections 9.2 and 17, in the entries
 * dimension): a scope that admits a duty must still be able to record how
 * that duty ends. This file counts, from the folded state and the head
 * entry alone, the entries the pending duties reserve, and says whether an
 * entry leaves room for them. The runtime asks inside the commit, after the
 * fold; a verifier asks the same question of the same state.
 *
 * The count follows section 17.2 of revision 10 of the contract, adopted since and a candidate when this was written,
 * which is not adopted yet. What is reserved:
 *
 * - a deadline: for each live item in a state a timed rule applies in, one
 *   entry for each rule of the longest chain of timed rules from that state
 *   (`ValidDefinition.deadlines`), whether or not the deadline slot holds a
 *   time yet;
 * - a request this scope sent, with no result and no `undelivered`
 *   diagnosis: one entry for its result, and before any diagnosis one more,
 *   because a `delivery-unavailable` diagnosis may be followed by a late
 *   result; and the entries of what its clause can start
 *   (`ValidDefinition.clauseEntries`). Each request reserves that for
 *   itself;
 * - a provisional scope: the entry that records its confirmation;
 * - each opened attempt of an outside operation: one entry for its outcome,
 *   and before any outcome one more, because `unknown` may be followed by
 *   the same attempt's outcome;
 * - the closing checkpoint: one entry, once for the scope, from the genesis
 *   on, except while the head entry is a checkpoint and no other duty is
 *   pending.
 *
 * What is not counted is in the deltas note. The count is of entries, never
 * of bytes.
 */

import type { Bounds, Input } from "@generalbusiness/artroom-contract";
import type { StateView } from "./state.ts";
import type { ValidDefinition } from "./validate.ts";

/** The entries the pending duties of this state reserve. `head` is the input of the head entry. */
export function owed(view: StateView, definition: ValidDefinition, head: Input): number {
  const scope = view.scope();
  if (!scope) return 0;
  let entries = scope.status === "provisional" ? 1 : 0;        // the confirmation
  for (const [type, states] of Object.entries(definition.deadlines)) {
    for (const [state, chain] of Object.entries(states)) entries += chain * view.count(type, state);
  }
  const open = view.outstanding();
  entries += (2 + definition.clauseEntries) * open.requests + (1 + definition.clauseEntries) * open.unavailable + 2 * open.opened + open.unknown;
  // The closing checkpoint is reserved unless the history already ends on a checkpoint with nothing pending.
  return entries === 0 && head.type === "checkpoint" ? 0 : entries + 1;
}

/**
 * Section 17.3, the rule of admission, asked of the state as the entry just
 * folded left it. `input` is that entry's input.
 *
 * A settling entry was reserved by its duty, and is not asked: a timed
 * entry, a diagnosis, an outcome, and a delivery of a control or of a
 * request's result. Everything else is new work, and is kept only if the
 * entries written and reserved are within the budget: an act, a genesis, a
 * delivery of a request or an advisory, a `conflict` result of a creation,
 * and a checkpoint.
 *
 * A checkpoint written while another duty is pending leaves the closing
 * checkpoint reserved, so it needs a free entry. A checkpoint written with
 * nothing else pending is the closing checkpoint: after it nothing is
 * reserved, and it fits because its entry was. The next entry that is not a
 * checkpoint is asked with the reservation counted again.
 */
export function fits(view: StateView, definition: ValidDefinition, bounds: Pick<Bounds, "scopeEntries">, input: Input): boolean {
  const scope = view.scope();
  if (!scope) return true;
  const settles = input.type === "timed" || input.type === "diagnosis" || input.type === "outcome"
    || (input.type === "delivery" && (input.message.class === "control" || ("clause" in input && input.clause !== "conflict")));
  return settles || scope.head.seq + 1 + owed(view, definition, input) <= bounds.scopeEntries;
}

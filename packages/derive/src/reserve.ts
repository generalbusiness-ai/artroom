/**
 * Room to settle (scope contract, sections 9.2 and 17, in the entries
 * dimension): a scope that admits a duty must still be able to record how
 * that duty ends. This file counts, from the folded state and the head
 * entry alone, the entries the pending duties reserve, and says whether an
 * entry leaves room for them. The runtime asks inside the commit, after the
 * fold; a verifier asks the same question of the same state.
 *
 * The count follows section 17.2 of the contract, revision 11, which is
 * adopted. What is reserved:
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
 * - an item that awaits its settlement: for each item in a state that an
 *   act or handler declares with `settles`, the entry of that form and what
 *   it can start (`ValidDefinition.pending`). A copy of a relationship in a
 *   state that its handler declares with `settles: { copy }` reserves the
 *   same (`ValidDefinition.pendingCopies`);
 * - a provisional scope: the entry that records its confirmation;
 * - an operation that is not settled (row 5; authority note, section 5.8):
 *   2 entries for each attempt that has no outcome or may still be opened,
 *   its first outcome and its late answer, and 1 for each attempt whose
 *   latest outcome is `unknown`. The entry that opens the operation states
 *   the most attempts, so all of this is reserved at the opening, and an
 *   outcome entry is never refused for want of room (`pendingOf`, in
 *   `ledger.ts`). With each of those outcome entries, the closure that the
 *   operation's owner declares for one: the entries of the operations that
 *   an outcome opens, such as a cleanup (`OperationRules.closure`);
 * - the closing checkpoint: one entry, once for the scope, from the genesis
 *   on, except while the head entry is a checkpoint and no other duty is
 *   pending.
 *
 * What is not counted is in the deltas note. The count is of entries, never
 * of bytes. For an operation it is partial: the other four dimensions of
 * section 17.1, and so the records that an outcome derives, are request
 * `cc570904`'s. No adopted effect states a closure at the opening, so the
 * owner's code declares it, and the count asks the owners' rules (I3
 * deltas, entries EB6 and EC2).
 */

import type { Bounds, Input } from "@generalbusiness/artroom-contract";
import { closureOf, type Owners } from "./ledger.ts";
import type { StateView } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";

/**
 * The entries the pending duties of this state reserve. `head` is the input
 * of the head entry. `owners`: the rules of the owners of outside
 * operations, which declare the closure of an outcome. With none, no
 * outcome is judged, so none has a closure.
 */
export function owed(view: StateView, definition: ValidDefinition, head: Input, owners?: Owners | null): number {
  const scope = view.scope();
  if (!scope) return 0;
  let entries = scope.status === "provisional" ? 1 : 0;        // the confirmation
  for (const [type, states] of Object.entries(definition.deadlines)) {
    for (const [state, chain] of Object.entries(states)) entries += chain * view.count(type, state);
  }
  // Section 17.2, rows 3 and 4: an item, and a relationship copy, that awaits its settlement.
  for (const [type, states] of Object.entries(definition.pending)) {
    for (const [state, reserved] of Object.entries(states)) entries += reserved * view.count(type, state);
  }
  for (const copy of definition.pendingCopies) entries += copy.entries * view.copies(copy.name, copy.kind, copy.states);
  const open = view.outstanding();
  entries += (2 + definition.clauseEntries) * open.requests + (1 + definition.clauseEntries) * open.unavailable;
  // Section 17.2, row 5: each outcome entry that an operation may still write, and with it the closure that its owner declares.
  for (const { owner, kind, entries: outcomes } of open.outcomes) entries += outcomes * (1 + closureOf(owners, owner, kind));
  // The closing checkpoint is reserved unless the history already ends on a checkpoint with nothing pending.
  return entries === 0 && head.type === "checkpoint" ? 0 : entries + 1;
}

/**
 * Section 17.3, the rule of admission, asked of the state as the entry just
 * folded left it. `input` is that entry's input.
 *
 * A settling entry was reserved by its duty, and is not asked: a timed
 * entry, a diagnosis, an outcome, a delivery of a control or of a
 * request's result, and an act or a delivery of a request that settles what
 * its form declares, which its judge says in `settles`. Everything else is
 * new work, and is kept only if the
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
export function fits(view: StateView, definition: ValidDefinition, bounds: Pick<Bounds, "scopeEntries">, input: Input, settled = false, owners?: Owners | null): boolean {
  const scope = view.scope();
  if (!scope) return true;
  const settles = settled || input.type === "timed" || input.type === "diagnosis" || input.type === "outcome"
    || (input.type === "delivery" && (input.message.class === "control" || ("clause" in input && input.clause !== "conflict")));
  return settles || scope.head.seq + 1 + owed(view, definition, input, owners) <= bounds.scopeEntries;
}

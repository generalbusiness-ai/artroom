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
 * - one checkpoint, always: the entry a scope keeps for its closing
 *   checkpoint.
 *
 * No entry that settles a duty starts another that was not counted. The
 * validator refuses the two ways a definition could: a result clause that
 * moves an item into a state a timed rule names (`clause-timed`), and timed
 * rules of one type that could apply again without an act (`timed-cycle`).
 * So a timed rule applies to an item at most once between two entries that
 * are asked, which is what the count of a live timed item assumes.
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
 * duty it has admitted. An entry that admits new duties or is new work is
 * written only when this holds: an act, a genesis, a delivery of a request
 * or an advisory, and a checkpoint. Every other entry settles a duty that
 * was counted when it was admitted, and is not asked.
 *
 * A checkpoint is new work like an act: it is written into free room, and
 * the one entry kept for a checkpoint stays kept after it. The kept entry is
 * used once, by the scope's last entry: a checkpoint that fills the budget
 * when nothing else is owed. So no checkpoint takes the room of a duty, and
 * a scope whose duties have all settled can always write its closing
 * checkpoint.
 */
export function fits(view: StateView, definition: ValidDefinition, bounds: Pick<Bounds, "scopeEntries">, input: Input): boolean {
  const scope = view.scope();
  if (!scope) return true;
  const settles = input.type === "timed" || input.type === "diagnosis" || input.type === "outcome" || (input.type === "delivery" && (input.message.class === "result" || input.message.class === "control"));
  if (settles) return true;
  const written = scope.head.seq + 1;
  const need = owed(view, definition);
  if (written + need <= bounds.scopeEntries) return true;
  return input.type === "checkpoint" && written === bounds.scopeEntries && need === 1;
}

/**
 * Check obligations and check carry.
 *
 * - An advisory obligation (R-OBL-7) is requested and shown, but never
 *   blocks a landing, so screens never count it among what a landing needs.
 * - A check counts on a new integration only by a sealed `check-carried`
 *   event, and a check that did not carry has its event too (R-CARRY-13).
 *   The feed and the Proposal screen take the reason from that event.
 */

import type { ActId, Generation, Obligation } from "./contract.ts";
import type { CheckCarriedEvent, CheckCarry, RoomSnapshot } from "./adapter.ts";

const entryOf = (act: ActId) => act.split("_")[1] ?? act;

/** One plain sentence for a `check-carried` event. */
export function checkCarriedText(ev: CheckCarriedEvent): string {
  const subject = `The check in entry ${entryOf(ev.act)}`;
  const where = `integration ${ev.integration.slice(0, 7)} (generation ${ev.generation})`;
  return ev.outcome.carried
    ? `${subject} carried to ${where} because ${ev.outcome.reason.text}.`
    : `${subject} did not carry to ${where}. ${ev.outcome.notCarried.text}`;
}

/** True for a check obligation whose checker is advisory. It never blocks a landing. */
export const isAdvisory = (o: Obligation): boolean => o.kind === "check" && o.advisory === true;

/** Every judgment for one obligation of one generation, oldest first. */
export function judgmentsFor(snap: RoomSnapshot, lane: ActId, generation: Generation, obligation: Obligation["id"]): CheckCarry[] {
  return snap.checkCarries.filter((c) => c.event.lane === lane && c.event.generation === generation && c.event.obligation === obligation);
}

/** The latest event that carried `act` onto this generation, if one is loaded. */
export function carriedBy(snap: RoomSnapshot, lane: ActId, generation: Generation, obligation: Obligation["id"], act: ActId): CheckCarry | undefined {
  return judgmentsFor(snap, lane, generation, obligation)
    .filter((c) => c.event.act === act && c.event.outcome.carried)
    .at(-1);
}

/**
 * Check obligations and check carry.
 *
 * - An advisory obligation (R-OBL-7) is requested and shown, but never
 *   blocks a landing, so screens never count it among what a landing needs.
 * - A check counts on a new integration only by a sealed `check-carried`
 *   event, and a check that did not carry has its event too (R-CARRY-13).
 *   The event binds the carry to one operation, one integration and one
 *   policy version. The feed and the Proposal screen take the reason from
 *   that event, and only from an event that matches all three exactly.
 */

import type { ActId, Generation, Obligation, Proposal } from "./contract.ts";
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

/**
 * The latest event that carried `act` onto this generation's current
 * integration under the obligation's policy, if one is loaded. A
 * generation's obligations count on its merge preview, so the event must
 * name that preview operation and its integration, and the policy version
 * that made the obligation (R-CARRY-13). When the preview has no
 * integration, no event can be matched.
 */
export function carriedBy(snap: RoomSnapshot, p: Proposal, o: Obligation, act: ActId): CheckCarry | undefined {
  if (p.preview.state !== "clean") return undefined;
  const { id: op, integration } = p.preview;
  return judgmentsFor(snap, p.lane, p.generation, o.id)
    .filter((c) => c.event.act === act && c.event.outcome.carried && c.event.policy === o.policy && c.event.op === op && c.event.integration === integration)
    .at(-1);
}

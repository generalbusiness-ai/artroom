/**
 * Timestamps and the clock rule (scope contract, section 5.3). Nothing here
 * reads a clock: the caller supplies the one reading of a commit.
 */

import type { Timestamp } from "@generalbusiness/artroom-contract";
import type { StateView } from "./state.ts";

const FORM = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;

/** The last instant a timestamp can name: the end of the year 9999. A derived time past it is not a timestamp. */
export const LAST_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);

/** The text of an instant: whole seconds with no fraction, otherwise three digits. One instant has one text. */
export function timeOf(ms: number): Timestamp {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

/** Milliseconds of a timestamp in that one form, or null. A date that does not exist is null. */
export function timeMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = FORM.exec(value);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), Number(m[7] ?? 0));
  return Number.isFinite(ms) && timeOf(ms) === value ? ms : null;
}

/**
 * One commit's clock reading, judged against the history. `behind`: the
 * reading is earlier than the previous entry's time. `asOf` is the time at
 * which a transition is due: the reading, or the previous entry's time when
 * the clock is behind, which can make more transitions due and never fewer.
 */
export interface Clock { reading: Timestamp; behind: boolean; asOf: Timestamp }

export function clockOf(view: StateView, reading: Timestamp): Clock {
  const now = timeMs(reading);
  if (now === null) throw new Error("a clock reading is a timestamp");
  const last = view.scope()?.time;
  const behind = last !== undefined && now < timeMs(last)!;
  return { reading, behind, asOf: behind ? last : reading };
}

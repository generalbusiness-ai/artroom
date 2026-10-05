/**
 * Timestamps and the clock rule (scope contract, section 5.3). Nothing here
 * reads a clock: the caller supplies the one reading of a commit.
 */

import type { Timestamp } from "@generalbusiness/artroom-contract";
import { timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import type { StateView } from "./state.ts";

/** The one text form of a timestamp and its guard are the bytes package's, beside the other identifiers. */
export { timeMs, timeOf };

/** The last instant a timestamp can name: the end of the year 9999. A derived time past it is not a timestamp. */
export const LAST_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);

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

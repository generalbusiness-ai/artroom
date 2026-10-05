/**
 * Redemption rate limits (R-CRED-9): per client address, and per invitation
 * for every attempt to join with it, through `redeem` or as a `join` act on
 * `POST /acts` and `RoomWire.submit`.
 *
 * The counters are one-minute windows held in memory, one table per room.
 * They are bounded: a window that has ended is dropped on the next attempt,
 * an invitation is counted only when it names one the room issued, and the
 * table holds at most `MAX_WINDOWS` windows; when it is full, an attempt
 * that would open another is refused until a window ends. A restart of the
 * room's object starts the counts again.
 */

import { artroomError } from "./errors.ts";
import { invitation } from "./roster.ts";
import type { RoomCore } from "./core.ts";

export const WINDOW_MS = 60_000;
export const MAX_WINDOWS = 10_000;
const PER_ADDRESS = 20;
const PER_INVITATION = 10;

/** Per room: key to its window. Insertion order is the order windows began, so ended ones are at the front. */
const tables = new WeakMap<RoomCore, Map<string, { n: number; since: number }>>();

const limited = (retryAfterMs: number) =>
  artroomError("rate-limited", "Too many redemption attempts. Wait a minute and try again.", { retryAfterMs: Math.max(retryAfterMs, 1) });

/** Count one attempt under `key`; throws `rate-limited` past `max` in the window. */
export function rateLimit(core: RoomCore, key: string, max: number): void {
  const now = core.now();
  let t = tables.get(core);
  if (!t) tables.set(core, (t = new Map()));
  for (const [k, w] of t) {
    if (now - w.since < WINDOW_MS) break;
    t.delete(k);
  }
  const w = t.get(key);
  if (!w) {
    if (t.size >= MAX_WINDOWS) throw limited(WINDOW_MS - (now - t.values().next().value!.since));
    t.set(key, { n: 1, since: now });
    return;
  }
  w.n++;
  if (w.n > max) throw limited(WINDOW_MS - (now - w.since));
}

/** The windows a room holds now (for tests). */
export function openWindows(core: RoomCore): number {
  return tables.get(core)?.size ?? 0;
}

/**
 * Per client address. A Worker calling over a service binding has no
 * client address, so `null` counts nothing here; the invitation's own limit
 * still applies, and a binding that fronts the public limits its callers.
 */
export function limitAddress(core: RoomCore, address: string | null): void {
  if (address !== null) rateLimit(core, `addr:${address}`, PER_ADDRESS);
}

/**
 * Per invitation, for an attempt to join with it on any path. The ID is
 * caller input: it is counted only when it names an invitation this room
 * issued. Any other value is refused by admission.
 */
export function limitInvitation(core: RoomCore, id: unknown): void {
  if (typeof id !== "string" || !invitation(core.sql, id)) return;
  rateLimit(core, `inv:${id}`, PER_INVITATION);
}

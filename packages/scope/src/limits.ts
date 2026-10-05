/**
 * Serving protection for a join (authority note, section 3.6, "The join, in
 * order" and "The limits"; the contract's section 8.2, row 26). It is held
 * in memory at the front of one membership scope, outside the history, and
 * no guard reads it. It decides only whether to serve.
 *
 * - **Nothing is keyed by an invitation.** No counter, window or limit here
 *   names one. A limit can never use an invitation up, expire it or lock
 *   it: only the commit that admits a join changes an invitation.
 * - **Before the scope.** A request from an address at its limit is
 *   answered `rate-limited` before check 1. Checks 1 and 2, the size and
 *   shape and the signature, need no state and are made here. Nothing of
 *   the scope's state is read for a request that fails either.
 * - **What is counted.** For each address, in a window: the joins that
 *   failed at check 1, 2, 3 or 6. A join that is admitted, and one that is
 *   refused at another check, counts nothing.
 * - **A full table locks nobody out.** The table holds a bounded number of
 *   windows. A window is made only when a request from an address with no
 *   window fails, and then the oldest window is dropped. No request is
 *   refused for lack of a window. A window that was dropped, or lost in a
 *   restart, decides nothing.
 * - **The bound on waiting secret checks** counts the joins of this scope
 *   that passed check 2 and wait for checks 3 to 9. A further join is
 *   answered `busy`, and the same signed bytes may be sent again. Nothing
 *   but a join is counted in it, so it cannot delay a revocation, a
 *   removal, an invitation, a rotation or an observation read.
 *
 * `rate-limited` and `busy` are serving answers: nothing was judged,
 * nothing is recorded and no key is used up.
 *
 * It replaces the parked `room/src/ratelimit.ts`, after the review in
 * `notes/2026-10-05-i3-limits-review.md`.
 */

import type { Answer, Head } from "@generalbusiness/artroom-contract";
import { canonicalBytes, isSignedIntentShape, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { isObject } from "@generalbusiness/artroom-derive";

/**
 * The window, the two bounds, the limit of one address and the most bytes of
 * a join. Configuration: the note proposes no number, I3 proposes these, and
 * the proof plan measures them (I3 deltas, entry ES10).
 */
export interface LimitConfig {
  /** The length of an address's window, in seconds. */
  windowSeconds: number;
  /** The failed joins of one address in one window, at which its further joins are answered `rate-limited`. */
  failures: number;
  /** The most windows the table holds. */
  windows: number;
  /** The most joins that have passed check 2 and wait for checks 3 to 9. */
  waiting: number;
  /** The most canonical bytes of a join's signed intent (check 1). */
  joinBytes: number;
}
export const PROPOSED_LIMITS: LimitConfig = { windowSeconds: 60, failures: 10, windows: 4096, waiting: 8, joinBytes: 16 * 1024 };

/** The least bytes of an invitation's secret (section 3.6: "at least 32 bytes"). */
export const INVITATION_SECRET_BYTES = 32;

/** The acts of `platform:membership@1` that carry an invitation's secret: a new member's join, and a new key of a member (section 12.1.3). */
const JOINS: ReadonlySet<string> = new Set(["join", "enrol"]);

/** Whether an input is a join for these limits: its intent names one of the two kinds. Any other act is served with no limit. */
export function isJoin(signed: unknown): boolean {
  const intent: unknown = isObject(signed) ? signed["intent"] : null;
  return isObject(intent) && typeof intent["kind"] === "string" && JOINS.has(intent["kind"]);
}

/**
 * The key of an address's window. An IPv4 address is its own key. An IPv6
 * address is keyed by its first 64 bits, so that one network is not as many
 * addresses as it likes (section 3.6; I3 deltas, entry ES10). An IPv4
 * address that is written inside an IPv6 one is keyed as the IPv4 address.
 * Null: the value is no address, and nothing is counted for it. A caller
 * over a service binding has no address.
 */
export function addressKey(address: string | null): string | null {
  if (address === null || address.length > 64) return null;
  const v4 = (text: string): number[] | null => {
    const parts = text.split(".");
    if (parts.length !== 4 || !parts.every((p) => /^(0|[1-9][0-9]{0,2})$/.test(p) && Number(p) <= 255)) return null;
    return parts.map(Number);
  };
  const four = v4(address);
  if (four) return `v4:${four.join(".")}`;
  // IPv6: eight groups of 16 bits, with at most one `::`, and perhaps an IPv4 address as the last 32 bits. A zone is not part of it.
  const text = address.split("%")[0]!.toLowerCase();
  if (!/^[0-9a-f:.]+$/.test(text) || !text.includes(":")) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (side: string): number[] | null => {
    if (side === "") return [];
    const out: number[] = [];
    const parts = side.split(":");
    for (const [i, part] of parts.entries()) {
      if (part.includes(".")) {
        const inner = i === parts.length - 1 ? v4(part) : null;
        if (!inner) return null;
        out.push((inner[0]! << 8) | inner[1]!, (inner[2]! << 8) | inner[3]!);
      } else if (/^[0-9a-f]{1,4}$/.test(part)) out.push(parseInt(part, 16));
      else return null;
    }
    return out;
  };
  const [head, tail] = [groups(halves[0]!), halves.length === 2 ? groups(halves[1]!) : []];
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const all = [...head, ...new Array<number>(missing).fill(0), ...tail];
  // `::ffff:a.b.c.d`: the IPv4 address itself.
  if (all.slice(0, 5).every((g) => g === 0) && all[5] === 0xffff) return `v4:${all[6]! >> 8}.${all[6]! & 255}.${all[7]! >> 8}.${all[7]! & 255}`;
  return `v6:${all.slice(0, 4).map((g) => g.toString(16)).join(":")}`;
}

/** What one served join is given. */
export interface Served {
  /** The caller's address as transport gave it, or null. */
  address: string | null;
  /** The scope's clock, in milliseconds. */
  now: number;
  /** The scope's head, for the answer of a join that is refused at check 1 or 2. */
  head: Head;
}

const refused = (head: Head): Answer => ({ answer: "refused", reason: "bad-intent", judgedAt: head });

/** The limits of one membership scope. All of it is in memory, so a restart empties both limits. */
export class JoinLimits {
  readonly #config: LimitConfig;
  /** The window of each address, by its key. The order of insertion is the order in which the windows began, so the oldest is first. */
  readonly #windows = new Map<string, { failed: number; since: number }>();
  #waiting = 0;

  constructor(config: LimitConfig = PROPOSED_LIMITS) { this.#config = config; }

  /** The windows held now, and the joins that wait for checks 3 to 9. */
  counts(): { windows: number; waiting: number } { return { windows: this.#windows.size, waiting: this.#waiting }; }

  /** The address's window, if it has one that has not ended. A window that has ended is removed, and decides nothing. */
  #window(key: string, now: number): { failed: number; since: number } | null {
    const window = this.#windows.get(key);
    if (window && now - window.since >= this.#config.windowSeconds * 1000) this.#windows.delete(key);
    return this.#windows.get(key) ?? null;
  }

  /** Count one join that failed at check 1, 2, 3 or 6 against its address. */
  #failed(key: string | null, now: number): void {
    if (key === null) return;
    const window = this.#window(key, now);
    if (window) {
      window.failed++;
      return;
    }
    // A window is made for this address. When the table is full the oldest window is dropped: no request is refused for lack of one.
    while (this.#windows.size >= this.#config.windows) this.#windows.delete(this.#windows.keys().next().value!);
    this.#windows.set(key, { failed: 1, since: now });
  }

  /**
   * Serve one join. `submit` is the scope's own judgment of the act: checks
   * 3 to 9. It is called at most once, and only for a request that passed
   * checks 1 and 2 and is inside the bound on waiting secret checks.
   */
  async serve(at: Served, signed: unknown, submit: () => Promise<Answer>): Promise<Answer> {
    const key = addressKey(at.address);
    // The address limit, before check 1.
    if (key !== null && (this.#window(key, at.now)?.failed ?? 0) >= this.#config.failures) return { answer: "unavailable", reason: "rate-limited" };
    // Check 1: the size and the shape, and a secret of at least 32 bytes. Check 2: the signature of the new key. Neither needs state.
    if (!this.#sound(signed)) {
      this.#failed(key, at.now);
      return refused(at.head);
    }
    if (this.#waiting >= this.#config.waiting) return { answer: "unavailable", reason: "busy" };
    this.#waiting++;
    let answer: Answer;
    try {
      answer = await submit();
    } finally {
      this.#waiting--;
    }
    // Check 3 answers `misaddressed`. Check 6 answers `invitation-refused`, one answer for an unknown ID and for a wrong secret.
    if (answer.answer === "refused" && (answer.reason === "misaddressed" || answer.name === "invitation-refused")) this.#failed(key, at.now);
    return answer;
  }

  #sound(signed: unknown): boolean {
    try {
      if (!isSignedIntentShape(signed) || canonicalBytes(signed).length > this.#config.joinBytes) return false;
      const secret: unknown = signed.intent.fields["secret"];
      return typeof secret === "string" && utf8(secret).length >= INVITATION_SECRET_BYTES && verifySignedIntent(signed);
    } catch {
      return false;   // not values that have canonical bytes
    }
  }
}

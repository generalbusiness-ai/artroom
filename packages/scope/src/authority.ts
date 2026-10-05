/**
 * The observation read: the authority port of a scope whose grants are
 * judged on membership (scope contract, sections 5.1 and 16.1; authority
 * note, sections 3.3 and 3.12). `observing` is phase one of the port, and
 * what it returns is phase two. The judgments are derive's, in `grant.ts`.
 * This file reads, counts and keeps.
 *
 * - **Before the turn.** A read is made for one act, off the scope's queue.
 *   The scope notes its own clock first: that reading is the observation's
 *   `at`, so an age never leaves out the time the read took.
 * - **Counted.** A run is the life of one `observing`: the object makes one
 *   when it starts. Its `run` is random, and `n` counts the reads that it
 *   began, from 1, also those that got no answer.
 * - **Never kept across a restart.** Everything here is in memory. Nothing
 *   is stored, so after a restart the scope holds no observation and reads
 *   again. The order of heads holds across runs all the same: the folded
 *   state holds the highest head that an entry retained for each subject,
 *   and the commit refuses a read from a lower head.
 * - **At most one for each key.** An observation is kept for reuse by a
 *   later act of the same key, inside its window: the one from the highest
 *   head of membership. The observation of a ten-second kind serves the one
 *   commit it was read for, and is not kept.
 * - **A revoked answer stays.** A read that shows the key revoked, or its
 *   member removed, is kept for the run, whatever its window. It discards
 *   what was held of that key, and from then on no answer that shows the
 *   key active is used: not an older one, and not one that arrives later.
 *
 * A read serves the act it was made for. What `read` returns is held by
 * that act's own call and by nothing else. The observation in it is of that
 * act's signing key, and the grant built from it is to that key alone. Only
 * an observation of an ordinary kind is kept, and only for a later act of
 * the same key, which records the reuse and the entry before it.
 */

import type { Digest, Entry, KeyId, Observation, ObservationRequest, ObservationUse, RunId, ScopeRef } from "@generalbusiness/artroom-contract";
import { hex } from "@generalbusiness/artroom-bytes";
import { highestHead, judgeGrant, observationOf, prefer, revoked, same, type Clock as Reading, type GrantJudgment, type Retains, type StateView } from "@generalbusiness/artroom-derive";
import type { Asked, Authority, Clock, Random, Standing } from "./ports.ts";

/**
 * One read of a membership scope: the standing of one key, answered from
 * that scope's head (authority note, section 3.3, steps 2 and 3). Null, or a
 * failure: no answer. What comes back is checked by the reader of this port
 * and is trusted for nothing until then.
 */
export interface Membership { observe(asked: ObservationRequest, seconds: number): Promise<unknown> }

/** What an observation read is given. */
export interface Observing {
  /** The scope's own clock (section 5.3). */
  clock: Clock;
  /** The source of the run's random value. */
  random: Random;
  /**
   * The membership scope that this scope records, with its incarnation: a
   * function of its genesis entry (section 6.6). Null: it records none, or
   * its incarnation is not fixed yet. Nothing is then read.
   */
  membership(scope: ScopeRef): ScopeRef | null;
  /** How the membership scope is read. */
  reader: Membership;
}

/** One read of this run that was answered: the observation, the read's number, and the latest entry of this scope that retains it. */
interface Read { observation: Observation; n: number; last: Retains | null }

/**
 * The authority port over reads of membership. Each call makes one run.
 */
export function observing(config: Observing): Authority {
  const run: RunId = hex(config.random.bytes(16));
  // I3 merge: `n` counts the reads of membership and of the rules scope with one counter (section 16.1). A read of the rules scope, and
  // of a member or another key for the member `observed`, is the platform definitions' (plan steps 23 and 26), and takes its number here.
  let count = 0;
  /** At most one observation of each key, for reuse; or the revoked answer of that key, for the run. */
  const kept = new Map<KeyId, Read>();
  /** The highest head of membership, by key, of the observations that the entries written in this run retain (section 16.1, "Heads do not go back"). */
  const retained = new Map<KeyId, number>();

  /** How an entry written now would retain that read: `fresh`, or `reused` with the latest entry that retains it. */
  const useOf = (read: Read): ObservationUse => ({ observation: read.observation, read: { run, n: read.n }, use: read.last ? "reused" : "fresh", prior: read.last ? read.last.entry : null });

  return {
    async read(asked: Asked, seconds: number): Promise<Standing | null> {
      const { window, action, scope } = asked;
      // No act of that kind, or no window stated for it: no commit could judge on a read, so none is made.
      const of = action === null || window === null ? null : config.membership(scope);
      if (action === null || window === null || !of) return null;
      const key = asked.signed.intent.actor;
      /**
       * In the commit the order of heads is judged against the folded state, which holds the highest head of each subject over
       * every run (section 16.1, "The fold holds the highest head"). Before the turn there is no state at hand: the heads that
       * this run's entries retain are enough to decide whether to read again, and the commit decides.
       */
      const judge = (read: Read, clock: Reading, view?: StateView): GrantJudgment =>
        judgeGrant(useOf(read), { scope, membership: of, key, action, window, clock, last: read.last, highest: view ? highestHead(view, read.observation) : (retained.get(key) ?? null) });
      /** An observation that failed a guard is not used again: the next act of the key reads again. A revoked answer fails none. */
      const discard = (read: Read): void => { if (kept.get(key) === read) kept.delete(key); };

      // Step 1 of section 3.3: the scope notes its own clock. That is the time of a read that begins now.
      const began = config.clock.read();
      let mine = kept.get(key) ?? null;
      // What is held serves this act when its guards would hold at this reading. A ten-second kind is never served from what is held.
      // Otherwise the observation is discarded and read again, here, for the same act.
      if (window.once || !mine || judge(mine, { reading: began, behind: false, asOf: began }).result === "authority-unavailable") {
        const n = ++count;
        let answer: unknown = null;
        try {
          answer = await config.reader.observe({ of, key }, seconds);
        } catch {
          answer = null;
        }
        // An answer that is not the whole standing of this key in that membership scope is no answer (section 16.0, rule 4).
        const observation = observationOf(answer, began);
        const arrived: Read | null = observation && same(observation.of, of) && observation.key === key ? { observation, n, last: null } : null;
        // A ten-second observation is not kept, unless it shows a revocation: that answer stays for the run and discards what was held.
        if (arrived && (!window.once || revoked(arrived.observation))) kept.set(key, prefer(kept.get(key) ?? null, arrived));
        // With no answer, the scope uses the observation that it holds, until its age reaches the window. A ten-second kind has none.
        if (arrived || window.once) mine = arrived;
      }
      if (!mine) return null;
      const read = mine;

      /** The read that the latest judgment found current. The entry that is written retains that one. */
      let offered: Read | null = null;
      let spent = false;
      return {
        membership: of,
        held(view, clock) {
          offered = null;
          if (spent) return null;
          // A revocation that any read of this run has seen takes effect at once: it is judged in place of an answer that shows the key
          // active, also one that was read for this act.
          // I3 merge: the authority note's revision 19, under review, reads this rule as of the member too: a read that shows a member
          // removed stops every key of that member for the run. Revision 18 states it of one key, and that is what is kept here.
          const seen = kept.get(key);
          const judged = seen && revoked(seen.observation) ? seen : read;
          const result = judge(judged, clock, view);
          if (result.result === "unauthorized") return [];
          // A clock that is behind judged no age: the act is answered `clock-behind`, and its observation is read again before a retry.
          if (result.result === "authority-unavailable" || clock.behind) discard(judged);
          if (result.result === "authority-unavailable") return null;
          offered = judged;
          return [{ grant: result.grant, current: true }];
        },
        sealed({ entry, hash }: { entry: Entry; hash: Digest }) {
          const used = offered;
          // An act and a preparation retain the one grant judged, in the same place (section 16.1, "Where one stands").
          const proof: unknown = entry.input.type === "act" || entry.input.type === "preparation" ? entry.input.authority[0]?.fresh : null;
          if (!used || !same(proof, useOf(used))) return;
          // The last use of the read is this entry. A later entry retains it only as `reused`, on a reading later than this entry's time.
          used.last = { entry: { seq: entry.seq, hash }, time: entry.time, observation: used.observation };
          spent = true;
          // Heads do not go back: an observation of this key from a lower head than this entry retains is not used again.
          const head = used.observation.head.seq;
          retained.set(key, Math.max(retained.get(key) ?? head, head));
          const held = kept.get(key);
          if (held && !revoked(held.observation) && held.observation.head.seq < head) kept.delete(key);
        },
      };
    },
  };
}

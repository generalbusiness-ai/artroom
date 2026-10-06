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

import type { Digest, Entry, Input, KeyId, Observation, ObservationRequest, ObservationUse, ObservedScope, PlatformDefinition, RunId, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, hex, isObservationUse, isRecord, parseStrict } from "@generalbusiness/artroom-bytes";
import { WINDOWS, contentChecked, contentStates, fixedBy, highestHead, judgeGrant, membershipOf, namedBy, observationOf, observedName, observedOf, prefer, revoked, same, subjectName, valueDigest, type Clock as Reading, type ContentStates, type GrantJudgment, type Needed, type RecordedRef, type Retains, type StateView, type ValueRead } from "@generalbusiness/artroom-derive";
import { isPlatformDefinition } from "@generalbusiness/artroom-bytes";
import { platform, standingOf } from "@generalbusiness/artroom-platform";
import type { Asked, Authority, Clock, Further, Random, Standing } from "./ports.ts";

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
   * The membership scope that this scope records: a function of its genesis
   * entry (section 6.6), or of its folded state where its version says so.
   * It is asked before each read and again in each commit. With an
   * incarnation: the read asks that incarnation, and guard 1 takes no
   * other. With none, as for a rules scope or a destination before its
   * first retained observation: the read asks by the scope ID alone, and
   * the entry that retains the answer fixes the incarnation (authority
   * note, section 12.1, decided in revision 25). Null: it records none.
   * Nothing is then read.
   */
  membership(scope: ScopeRef): RecordedRef | null;
  /** How the membership scope is read. */
  reader: Membership;
  /**
   * The rules scope that this scope records, for an observation of the
   * rules (the contract's section 16.1, guard 1): where its version says
   * (`Platform.rulesScope`). Null, or absent: it records none, and nothing
   * is read for a row of the rules.
   */
  rules?(scope: ScopeRef): RecordedRef | null;
  /**
   * What the data of a rules definition states of the two members that an
   * observation of the rules holds only under such a definition (derive's
   * `contentStates`). Null, or absent: this runtime has no data of that
   * version, and its answer is then no observation.
   */
  content?(named: PlatformDefinition): ContentStates | null;
}

/**
 * What the observed scope answers to one read, with the bytes of each value
 * that its answer names beside it (the contract's section 16.1, "A value
 * that a row may retain", "At the read"). The contract states no form for
 * what crosses between the two scopes: this is the form of this port (I3
 * deltas, entry GA6). A reader that gives the bare record gives no value.
 */
export interface Answered { answer: unknown; values: readonly { domain: string; bytes: string }[] }
const answeredOf = (got: unknown): Answered => {
  const beside = isRecord(got) && Object.keys(got).length === 2 && "answer" in got && Array.isArray(got["values"]) ? (got["values"] as unknown[]) : null;
  return beside === null ? { answer: got, values: [] } : { answer: (got as { answer: unknown }).answer, values: beside.filter((value): value is { domain: string; bytes: string } => isRecord(value) && typeof value["domain"] === "string" && typeof value["bytes"] === "string") };
};

/** One further read of this run that was answered: the observation, its number, the latest entry that retains it, and the values that it names. */
interface Seen { observation: ObservationUse["observation"]; n: number; last: Retains | null; values: readonly ValueRead[] }

/** One read of this run that was answered: the observation, the read's number, and the latest entry of this scope that retains it. */
interface Read { observation: Observation; n: number; last: Retains | null }

/**
 * The authority port over reads of membership. Each call makes one run.
 */
export function observing(config: Observing): Authority {
  const run: RunId = hex(config.random.bytes(16));
  // `n` counts the reads of membership and of the rules scope with one counter (section 16.1): the read of a signer's key, below,
  // and each further read for a row of `observes` (`further`).
  let count = 0;
  /** At most one observation of each key, for reuse; or the revoked answer of that key, for the run. */
  const kept = new Map<KeyId, Read>();
  /** The highest head of membership, by key, of the observations that the entries written in this run retain (section 16.1, "Heads do not go back"). */
  const retained = new Map<KeyId, number>();

  /** How an entry written now would retain that read: `fresh`, or `reused` with the latest entry that retains it. */
  const useOf = (read: Read | Seen): ObservationUse => ({ observation: read.observation, read: { run, n: read.n }, use: read.last ? "reused" : "fresh", prior: read.last ? read.last.entry : null });
  /**
   * The further observations that are kept for reuse, by the name of the subject of each: one for each, the one that was read last.
   * An observation that was read for a row which states `once` serves the one input that it was read for, and is not kept here.
   */
  const reusable = new Map<string, Seen>();

  /**
   * One read of one subject (section 16.1, "The order before the turn", part 4). Null: no answer. That is so when the reader fails or
   * gives nothing; when what it gives is not the whole record of that subject, of the scope that this scope records, with exactly
   * its members; and for the rules, when the record is not the one that the data of its definition states, or it names a value
   * whose bytes are missing, are over the `max` of the row, do not hash to the digest, or are in a domain that the row does not
   * state. The scope then keeps no byte of it.
   */
  const one = async (scope: ScopeRef, needed: Needed, n: number, seconds: number): Promise<Seen | null> => {
    const { subject } = needed;
    const of = "asked" in subject ? (config.rules?.(scope) ?? null) : config.membership(scope);
    if (!of) return null;
    const began = config.clock.read();
    const to: ObservedScope = of.inc === null ? { scope: of.scope, kind: of.kind } : (of as ScopeRef);
    let got: unknown = null;
    try {
      got = await config.reader.observe("holders" in subject ? { of: to, holders: subject.holders, most: subject.most } : { of: to, ...subject }, seconds);
    } catch {
      got = null;
    }
    const { answer, values: beside } = answeredOf(got);
    if (!isRecord(answer)) return null;
    const observation = { ...answer, at: began } as ObservationUse["observation"];
    if (!isObservationUse({ observation, read: { run, n }, use: "fresh", prior: null }) || !observedOf(observation.of, of) || observedName(observation) !== subjectName(subject)) return null;
    if ("subject" in observation && observation.subject === "rules" && !contentChecked(observation, config.content?.(observation.definition))) return null;
    // A value that the answer names: each in a domain that the row states, within that `max`, and by the digest that the record holds.
    const named = namedBy(observation);
    const kept: ValueRead[] = [];
    for (const { domain, bytes } of beside) {
      const stated = needed.retains.find((record) => record.domain === domain);
      if (!stated || new TextEncoder().encode(bytes).length > stated.max) return null;
      let digest: Digest | null = null;
      try {
        const value = parseStrict(bytes);
        digest = canonicalize(value) === bytes ? valueDigest(domain, value) : null;
      } catch {
        digest = null;
      }
      if (digest === null || !named.includes(digest)) return null;
      kept.push({ domain, digest, bytes });
    }
    if (named.some((digest) => !kept.some((value) => value.digest === digest))) return null;
    return { observation, n, last: null, values: kept };
  };

  /** The further observations of one input: what it read, and what is kept for reuse (`Further`, in `ports.ts`). */
  const further = (scope: ScopeRef): Further => {
    /** What was read for this input, by the name of its subject; and the subjects that were read for it and gave no answer. */
    const mine = new Map<string, Seen>();
    const failed = new Set<string>();
    let closed = false;
    const hand = (): Seen[] => [...mine.values(), ...[...reusable.entries()].flatMap(([name, seen]) => (mine.has(name) ? [] : [seen]))];
    return {
      async read(needed, seconds) {
        for (const want of needed) {
          const name = subjectName(want.subject);
          // Each read takes the next number of the run, with one counter for membership and for the rules scope, also one that
          // gets no answer.
          const n = ++count;
          const seen = await one(scope, want, n, seconds);
          if (!seen) { failed.add(name); mine.delete(name); continue; }
          failed.delete(name);
          mine.set(name, seen);
          if (!want.window.once) reusable.set(name, seen);
        }
      },
      observed: () => hand().map(useOf),
      values: () => hand().flatMap((seen) => seen.values.map((value) => value.bytes)),
      observing: () => ({
        membership: config.membership(scope), rules: config.rules?.(scope) ?? null,
        last: (use) => (use.read.run === run ? (hand().find((seen) => seen.n === use.read.n)?.last ?? null) : null),
        unread: (subject) => closed || failed.has(subjectName(subject)),
        ...(config.content ? { content: config.content } : {}),
      }),
      close() { closed = true; },
      sealed({ entry, hash }) {
        const input = entry.input;
        const retained = input.type === "act" || input.type === "outcome" || (input.type === "delivery" && "clause" in input) ? (input.observed ?? []) : [];
        for (const use of retained) {
          const seen = use.read.run === run ? hand().find((held) => held.n === use.read.n) : undefined;
          if (!seen) continue;
          // The last use of the read is this entry. A later entry retains it only as `reused`, on a reading later than this entry's time.
          seen.last = { entry: { seq: entry.seq, hash }, time: entry.time, observation: seen.observation as Observation };
          // An observation that was read for one commit has served it.
          if (reusable.get(observedName(seen.observation)) !== seen) mine.delete(observedName(seen.observation));
        }
      },
    };
  };

  return {
    further,
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
      const judge = (read: Read, clock: Reading, view?: StateView, recorded: RecordedRef = of): GrantJudgment =>
        judgeGrant(useOf(read), { scope, membership: recorded, key, action, window, clock, last: read.last, highest: view ? highestHead(view, read.observation) : (retained.get(key) ?? null) });
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
          // The first read of a scope that records no incarnation asks by the scope ID alone. The answer's `of` holds the incarnation.
          answer = await config.reader.observe({ of: of.inc === null ? { scope: of.scope, kind: of.kind } : (of as ScopeRef), key }, seconds);
        } catch {
          answer = null;
        }
        // An answer that is not the whole standing of this key in that membership scope is no answer (section 16.0, rule 4).
        const observation = observationOf(answer, began);
        const arrived: Read | null = observation && observedOf(observation.of, of) && observation.key === key ? { observation, n, last: null } : null;
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
        // The reference with its incarnation: the one recorded, or the one that answered, which the entry that retains it fixes.
        membership: fixedBy(of, read.observation.of),
        held(view, clock) {
          offered = null;
          if (spent) return null;
          // Guard 1 is judged on what the scope records at this commit. An entry written since the read may have fixed an incarnation.
          const recorded = config.membership(scope);
          if (!recorded) return null;
          // A revocation that any read of this run has seen takes effect at once: it is judged in place of an answer that shows the key
          // active, also one that was read for this act.
          // I3 merge: the authority note's revision 20, adopted since this was written, reads this rule as of the member too: a read that
          // shows a member removed stops every key of that member for the run. Revision 18 states it of one key, and that is what is
          // kept here. The member's rule is owed.
          const seen = kept.get(key);
          const judged = seen && revoked(seen.observation) ? seen : read;
          const result = judge(judged, clock, view, recorded);
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

/**
 * The authority port of a membership scope, for its own acts (authority
 * note, section 3.1, and section 3.3, the last row of the table of windows).
 * Membership judges its own acts on its own head. Nothing is read: the
 * commit builds the observation from the folded state at the head before
 * the entry, with `at` as the commit's reading and the use `fresh`. Its age
 * is zero, and it serves that one commit. The value is the one that the
 * scope answers to any other scope at that head (`standingOf`), so a replay
 * derives it from the same history.
 *
 * Each act takes the next number of the run, as a read does, so no two
 * entries hold one read as `fresh`. An act whose row names no action is
 * judged on no grant, and nothing is built for it.
 */
export function ownStanding(random: Random): Authority {
  const run: RunId = hex(random.bytes(16));
  let count = 0;
  return {
    read(asked: Asked): Promise<Standing | null> {
      const { scope, action } = asked;
      if (action === null) return Promise.resolve(null);
      const key = asked.signed.intent.actor;
      const n = ++count;
      return Promise.resolve({
        membership: scope,
        held(view, clock) {
          const observation = observationOf(standingOf(view, { of: scope, key }), clock.reading);
          // No answer: the scope is not an active membership scope at this head, so no grant rests on it (section 12.1.3, case e).
          if (!observation) return null;
          const use: ObservationUse = { observation, read: { run, n }, use: "fresh", prior: null };
          const result = judgeGrant(use, { scope, membership: scope, key, action, window: WINDOWS.once, clock, last: null, highest: highestHead(view, observation) });
          return result.result === "current" ? [{ grant: result.grant, current: true }] : result.result === "unauthorized" ? [] : null;
        },
      });
    },
  };
}

/** What the authority port of a deployed scope is given. */
export interface Repository {
  /** The scope's own clock, and the source of the run's random value. */
  clock: Clock;
  random: Random;
  /** The input of the scope's genesis entry, from its own history. Null: it has no genesis yet. */
  genesis(): Extract<Input, { type: "genesis" }> | null;
  /**
   * The scope's folded state at its head, for a scope whose version records its membership reference there: a directory, in a slot;
   * a rules scope and a destination, as a scope ID with the incarnation of their retained observations. Absent: such a scope reads nothing.
   */
  state?: StateView;
  /** How a membership scope is read: one call on the object that the reference names (`membershipIn`). */
  reader: Membership;
}

/**
 * The membership scope that a scope records, as the list below states it:
 * from its own genesis entry, or from its folded state where its platform
 * version says where (`Platform.membership`, of the platform package). Null:
 * it records none. The authority reads that scope for an observation.
 */
export function recordedMembership(config: Pick<Repository, "genesis" | "state">, scope: ScopeRef): RecordedRef | null {
  const genesis = config.genesis();
  if (!genesis) return null;
  const named = genesis.seed.definition;
  // Where a version's scopes record the reference is code of the version, beside its rules (authority note, section 12.1).
  const coded = isPlatformDefinition(named) ? platform(named)?.membership : undefined;
  if (coded) return config.state ? coded(config.state) : null;
  return membershipOf(genesis, scope);
}

/** The rules scope that a scope records, from its folded state, where its platform version says where (`Platform.rulesScope`). Null: it records none. */
export function recordedRules(config: Pick<Repository, "genesis" | "state">): RecordedRef | null {
  const named = config.genesis()?.seed.definition;
  const coded = isPlatformDefinition(named) ? platform(named)?.rulesScope : undefined;
  return coded && config.state ? coded(config.state) : null;
}

/** The further observations of a scope that reads none: nothing is at hand, and no subject can be had. */
const NOTHING_READ: Further = { read: () => Promise.resolve(), observed: () => [], values: () => [], observing: () => ({}), close: () => undefined, sealed: () => undefined };

/**
 * The same reference, when the scope records it with its incarnation. A
 * read session is accepted only when it names that scope and incarnation
 * (section 3.9; `sessions.ts`). Null also for a rules scope or a
 * destination that records no incarnation yet: no session is accepted
 * there before its first retained observation.
 */
export const fixedMembership = (config: Pick<Repository, "genesis" | "state">, scope: ScopeRef): ScopeRef | null => fixedBy(recordedMembership(config, scope), null);

/**
 * The production authority of one scope of a repository (authority note,
 * section 3.3, "Where it records its membership reference").
 *
 * - A membership scope judges its own acts on its own head: `ownStanding`.
 * - Every other scope reads the membership scope that its own genesis
 *   records, with that incarnation: the member `membership` in the body of
 *   its `create` (the contract's section 6.6; derive's `membershipOf`). It
 *   is read from the scope's own history, and from no request, no answer
 *   and no intent. A scope whose genesis records none reads nothing, and an
 *   act that needs a grant is then answered `authority-unavailable`.
 * - A directory under `platform:directory@1` holds it in its slot
 *   `repository.membership`, which the `applied` clause of its own `create`
 *   sets (the platform package's `directoryMembership`). It is read from
 *   the scope's own folded state at its head, before the turn. Before the
 *   slot is set the directory reads nothing, so it admits no act that needs
 *   a grant (authority note, section 12.1.2, "What the directory admits").
 * - A rules scope under `platform:rules@1` and a destination under
 *   `platform:destination@1` hold the membership scope's ID, as a fixed
 *   value that their genesis set from the creation's fields
 *   (`rulesMembership`, `destinationMembership`). The incarnation is the
 *   one of the observations of that ID that their entries retain, read
 *   from the folded state. Before any entry retains one, the read asks by
 *   the ID alone, guard 1 takes an observation of that ID of the kind
 *   `membership`, and the entry that retains it fixes the incarnation. From
 *   then on the read states it, and an observation that names another is
 *   discarded (authority note, section 12.1, decided in revision 25, which
 *   was not adopted when this was written; I3 deltas, section 26).
 *   Revision 26 is adopted since, at `f7175296`.
 *
 * No grant that is presented beside an intent is read: authority is what
 * the membership scope answers, and nothing a caller brings.
 */
export function repositoryAuthority(config: Repository): Authority {
  const own = ownStanding(config.random);
  const observed = observing({
    clock: config.clock, random: config.random, reader: config.reader, membership: (scope) => recordedMembership(config, scope),
    // Where a version's scopes record their rules reference is code of the version, as for the membership reference. The read goes
    // by the scope ID, through the same namespace. The rules scope answers from its recorded rules, with its publication revision
    // and extents digest; the namespace supplies the extent bytes beside that observation (`rulesAnswer`, `observedAt`).
    rules: () => recordedRules(config),
    content: (named) => { const data = platform(named)?.data; return data ? contentStates(data) : null; },
  });
  return {
    read: (asked, seconds) => (asked.scope.kind === "membership" ? own : observed).read(asked, seconds),
    // A membership scope reads no other scope: an act of it is judged on its own head, and no row of it is read here.
    further: (scope) => (scope.kind === "membership" ? NOTHING_READ : observed.further!(scope)),
  };
}

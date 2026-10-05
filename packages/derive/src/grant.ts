/**
 * The grant of an act, judged on an observation of membership (scope
 * contract, sections 4.2, check 9, and 16.1; authority note, sections 3.2,
 * 3.3 and 3.12). Pure functions: nothing here reads a clock, a scope or a
 * store. The runtime calls `judgeGrant` in the commit, on the commit's one
 * reading, with what it read before the turn. A verifier calls the same
 * function with what the entry retains and the entry's time, and so derives
 * the same decision from the entry and the scope's earlier entries alone.
 *
 * What no function here can show is that the read was made, that it began
 * at `at`, and that a `fresh` value was not held from an earlier read under
 * a new number. The runtime of the observing scope vouches for that, and a
 * replay reports it as `trusted: observation-read` (section 9.3).
 *
 * The guard on the run (authority note, section 3.3, guard 1) is not a
 * function. A run's observations are held in memory and by the call that
 * read them, so none exists after a restart. In a history it is the rule
 * `run-returned`, which is over the order of entries and is the verifier's.
 */

import type { Grant, Head, KeyId, Observation, ObservationAnswer, ObservationUse, ScopeKind, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { isHead, isKeyId, isMemberId, isPlatformDefinition, isRecord, platformName } from "@generalbusiness/artroom-bytes";
import { timeMs, type Clock } from "./time.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isScopeRef, own, same } from "./values.ts";

/** A freshness window, in seconds of the observing scope's clock. `once`: a ten-second kind, whose observation serves one commit. */
export interface Window { seconds: number; once: boolean }

/** The windows of the authority note's section 3.3, rows W1 and W3 of section 3.12. They are that note's proposals, and R4's to measure. */
export const WINDOWS = { ordinary: { seconds: 300, once: false }, once: { seconds: 10, once: true } } as const satisfies Record<string, Window>;

/**
 * The window of an act of that kind in a scope of that kind, under that
 * definition (authority note, section 3.3, the table of windows). Null: no
 * adopted text states one, and the act is then judged on no observation.
 *
 * - Taking or renewing a hold: ten seconds. A declared definition takes or
 *   renews a hold by an act with a `hold` effect that opens or renews
 *   (section 6.8), so the act is known from the definition (I3 deltas,
 *   entry ED3).
 * - Any other act in a lane, the directory or an inbox: 300 seconds.
 */
export function windowOf(definition: ValidDefinition, kind: ScopeKind, act: string): Window | null {
  const row = own(definition.declared.acts, act);
  if (!row) return null;
  if (row.effects.some((effect) => "hold" in effect && effect.hold.do !== "end")) return WINDOWS.once;
  // I3 merge: the authority note's revision 19, under review, restates this as a table of entries. It adds the 300 seconds of an act in
  // membership and in the rules scope, and the 60 seconds and the named acts of a task scope. Revision 18 states a window for none of
  // them, so each is null here (I3 deltas, entry ED4).
  return kind === "lane" || kind === "directory" || kind === "inbox" ? WINDOWS.ordinary : null;
}

/** True when the answer can never become untrue: the key is revoked, or its member is removed (authority note, section 3.3, G10). */
export const revoked = (observation: Observation): boolean =>
  observation.keyState === "retired" || observation.keyState === "compromised" || observation.memberState === "removed";

/**
 * Which of two observations of one key a scope keeps for the run (authority
 * note, section 3.3, "After a revocation is seen"). It keeps at most one. A
 * revoked answer stays, whatever arrives later. A revoked answer that
 * arrives discards what was held. Otherwise the one from the higher head of
 * membership stays, and an answer from a lower head never replaces it.
 */
export function prefer<O extends { observation: Observation }>(held: O | null, arrived: O): O {
  if (held && revoked(held.observation)) return held;
  if (!held || revoked(arrived.observation)) return arrived;
  return arrived.observation.head.seq < held.observation.head.seq ? held : arrived;
}

/**
 * The actions that count as a comment, which an agent whose controller is
 * not active may still sign (authority note, section 3.3). No form says
 * which actions those are: these are the two names of the table of section
 * 3.2 (I3 deltas, entry ED6).
 */
export const COMMENTS: readonly string[] = ["issue.comment", "change.comment"];

/**
 * The role table of the membership scope, as data: the actions that each
 * role holds, each a whole name (authority note, section 3.2). It is a
 * value of the membership scope at one head. An observation's `actions` is
 * `actionsOf` that table for the member's role, and the grant guard reads
 * only that list.
 */
export type RoleTable = Readonly<Record<string, readonly string[]>>;
export const actionsOf = (table: RoleTable, role: string): readonly string[] => own(table, role) ?? [];

/**
 * Whether `within` covers that scope. The contract leaves the type of a
 * grant's filter to the authority note, which states no form for it. So
 * only one value covers a scope: that scope's own reference, with its
 * incarnation (I3 deltas, entry ED2). The judge of an act reads a grant's
 * `within` the same way.
 */
export const covers = (within: unknown, scope: ScopeRef): boolean => isScopeRef(within) && same(within, scope);

/**
 * The observation that one answer of membership gives, with `at`, the
 * observing scope's own clock when its read began. Null: the answer is not
 * the whole standing of one key in a membership scope, member for member,
 * so nothing was read (section 16.0, rules 1 and 4).
 */
export function observationOf(answer: unknown, at: Timestamp): Observation | null {
  if (!isRecord(answer) || Object.keys(answer).length !== 13 || timeMs(at) === null) return null;
  const { of, head, key, keyState, member, memberState, role, actions, within, controller, controllerActive, notAfter, definition } = answer as Record<keyof ObservationAnswer, unknown>;
  if (!isScopeRef(of) || of.kind !== "membership" || !isHead(head) || !isKeyId(key) || !isMemberId(member) || typeof role !== "string") return null;
  if (keyState !== "active" && keyState !== "retired" && keyState !== "compromised" && keyState !== "unknown") return null;
  if (memberState !== "active" && memberState !== "removed") return null;
  if (!Array.isArray(actions) || !actions.every((action) => typeof action === "string") || within === undefined) return null;
  if ((controller !== null && !isMemberId(controller)) || (controllerActive !== null && typeof controllerActive !== "boolean")) return null;
  if ((notAfter !== null && timeMs(notAfter) === null) || !isPlatformDefinition(definition) || platformName(definition) !== "platform:membership") return null;
  return { of, head, key, keyState, member, memberState, role, actions: actions as string[], within, controller, controllerActive, notAfter: notAfter as Timestamp | null, definition, at };
}

/**
 * The grant that an observation gives (section 16.1, the row "Guard path"):
 * its `issued` is the observation's head in membership, and its subject,
 * key, actions, `within` and `notAfter` are the observation's. No key acts
 * for another member, so `principal` is null (authority note, section 3.4).
 * The proof is the member `fresh`, so the entry retains it.
 */
export function grantFrom(use: ObservationUse): Grant {
  const o = use.observation as Observation;
  return { issued: { at: o.of, seq: o.head.seq, hash: o.head.hash }, subject: { membership: o.of, member: o.member }, key: o.key, principal: null, actions: o.actions, within: o.within, notAfter: o.notAfter, fresh: use };
}

/** True when a recorded grant is exactly the grant that the observation it retains gives (section 16.1, the row "Replay path"). */
export function agrees(grant: Grant): boolean {
  try {
    return isRecord(grant.fresh) && isRecord(grant.fresh.observation) && same(grant, grantFrom(grant.fresh));
  } catch {
    return false;
  }
}

/** An earlier entry of the scope that retains a read: the entry, its time, and the observation as it retains it. */
export interface Retains { entry: Head; time: Timestamp; observation: Observation }

/** What the grant guard is asked. */
export interface GrantAsked {
  /** The scope that judges, with its incarnation. */
  scope: ScopeRef;
  /** That scope's own membership reference, with its incarnation: a function of its genesis entry (section 6.6). */
  membership: ScopeRef;
  /** The signing key, and the action that the act's row names in `grant`. */
  key: KeyId;
  action: string;
  /** The window for this kind of commit: `windowOf`. */
  window: Window;
  /** The commit's one reading, or in a replay the entry's time, which is never clamped. */
  clock: Clock;
  /** The latest earlier entry of this scope that retains this read, in a grant or in `observed`. Null: none does. */
  last: Retains | null;
  /** The highest position `head.seq` of the observations of this key, of the same membership scope, that the earlier entries of this scope retain. Null: none retains one. */
  highest: number | null;
}

/** A guard of the observation that failed: the observation is discarded and read again, and the act is not judged. */
export type Discarded = "of" | "once" | "use" | "moved" | "age" | "older";
/** A condition of the grant guard that failed on the value: the act is refused. */
export type Unheld = "key" | "revoked" | "key-state" | "action" | "within" | "not-after" | "controller";

/** The name that a replay reports for an entry whose observation fails that guard (section 16.1). Another failed guard is a `mismatch` with no name of its own. */
export const MISMATCHES: Partial<Record<Discarded, "observation-reused" | "observation-not-moved" | "observation-older">> = { once: "observation-reused", moved: "observation-not-moved", older: "observation-older" };

/**
 * Check 9 of section 4.2, for one observation and how an entry would use
 * it. `current`: the grant that the entry records. `unauthorized`: the act
 * is refused. `authority-unavailable`: the observation is discarded, and
 * the act is not judged on it.
 */
export type GrantJudgment =
  | { result: "current"; grant: Grant }
  | { result: "unauthorized"; failed: Unheld }
  | { result: "authority-unavailable"; failed: Discarded };

/**
 * The commit guards of an observation and the grant guard, in the order of
 * section 16.1, "The guards, in the commit", and then of the authority
 * note's section 3.3. The guards of the observation come before any member
 * of the value is read, but for two things that say whose answer it is.
 *
 * 1. The observation is of this scope's own membership reference, with that
 *    incarnation. One of another scope or incarnation is discarded.
 * 2. It is of the signing key. One of another key is no grant to the signer.
 * 3. A revoked answer refuses, whatever its age: a key is never restored
 *    and a removed member is never restored, so it cannot become untrue
 *    (authority note, section 3.3, G10).
 * 4. A ten-second kind is `fresh`.
 * 5. If an earlier entry retains this read, `use` is `reused`, `prior` is
 *    that entry, the observation is the one that entry retains, and the
 *    reading is later than that entry's time. Otherwise `use` is `fresh`.
 * 6. The age, the reading less `at`, is inside the window: not negative,
 *    and less than the window. An age equal to the window is outside it.
 * 7. Its head is not lower than the head of an observation of this key that
 *    an earlier entry retains.
 * 8. The grant guard: the key is active; the actions include the act's
 *    action; `within` covers this scope; `notAfter`, if set, is later than
 *    the reading; and for an agent the controller is active, or the action
 *    is a comment.
 *
 * With the clock behind, no act is written (section 5.3). The reading then
 * shows no passage of time, so guards 5 and 6 are not judged on it: the
 * judge answers `clock-behind` at check 14, and the runtime reads again
 * before a retry (authority note, section 3.12, case 4c; I3 deltas, entry
 * ED5). A grant's `notAfter` is then compared with the previous entry's
 * time, as section 4.2 says. An entry is never clamped, so a replay never
 * meets this.
 */
export function judgeGrant(use: ObservationUse, asked: GrantAsked): GrantJudgment {
  const o = use.observation as Observation;
  const { clock, window, last } = asked;
  const discard = (failed: Discarded): GrantJudgment => ({ result: "authority-unavailable", failed });
  const refuse = (failed: Unheld): GrantJudgment => ({ result: "unauthorized", failed });

  if (!same(o.of, asked.membership)) return discard("of");
  if (o.key !== asked.key) return refuse("key");
  if (revoked(o)) return refuse("revoked");

  if (window.once && use.use !== "fresh") return discard("once");
  const reading = timeMs(clock.reading)!;
  if (last === null) {
    if (use.use !== "fresh" || use.prior !== null) return discard("use");
  } else {
    if (use.use !== "reused" || !same(use.prior, last.entry) || !same(o, last.observation)) return discard("use");
    if (!clock.behind && reading <= timeMs(last.time)!) return discard("moved");
  }
  const began = timeMs(o.at);
  if (began === null) return discard("age");
  const age = reading - began;
  if (!clock.behind && (age < 0 || age >= window.seconds * 1000)) return discard("age");
  if (asked.highest !== null && o.head.seq < asked.highest) return discard("older");

  if (o.keyState !== "active") return refuse("key-state");
  if (!o.actions.includes(asked.action)) return refuse("action");
  if (!covers(o.within, asked.scope)) return refuse("within");
  if (o.notAfter !== null && timeMs(clock.asOf)! >= (timeMs(o.notAfter) ?? -Infinity)) return refuse("not-after");
  if ((o.controller !== null || o.controllerActive !== null) && o.controllerActive !== true && !COMMENTS.includes(asked.action)) return refuse("controller");
  return { result: "current", grant: grantFrom(use) };
}

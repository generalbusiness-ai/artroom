/**
 * The subjects that an entry observes, as the data of a platform definition
 * states them (scope contract, revisions 20 and 21, section 6.1, "What
 * platform data states for the turn, and for capacity"; section 16.1, "The
 * subjects that an entry observes"; source rows I3-39, I3-41, I3-53 and
 * I3-56). Types only. Each is data and no code, and none is a mark. The
 * validator of the derive package reads each only with its platform option,
 * and refuses each in a declared definition as it refuses any member that
 * it does not know.
 *
 * The rows stand on an act, for its entry; on a kind of `outcomes`, for
 * each outcome entry of an operation of that kind; and on a `create`, a
 * `tell` or a `relate`, by clause, for the delivery of a result that runs
 * that clause. An act's signing key is no row: its observation is the
 * grant's.
 */

import type { Operand } from "./definition.ts";

/**
 * Where the subjects of a row come from, in an act and in a clause of a
 * result: an operand of section 6.5 whose value is a member, or a list of
 * members; or each element of a list, where `value` gives one member for
 * each element, which `as` names.
 */
export type SubjectSource = Operand | { each: Operand; as: string; value: Operand };

/** One value that the observation of a row may name: its byte domain, and the most canonical bytes of one such value (section 16.1, "A value that a row may retain"). */
export interface Retained { domain: string; max: number }

/**
 * One row of `observes`: what the scope reads before the turn.
 *
 * `window`: seconds, on the observing scope's clock. `use`: with `once` the
 * observation serves one commit, and is retained `fresh`. `without`, in an
 * outcome and in a clause: what follows when no observation can be had.
 * `wait`: the entry is not written. `write`: it is written with none for
 * the row, and the rule is told that the row is absent. A row of an act
 * states none.
 *
 * - `of: "member"`, with a source: in an act and in a clause of a result.
 * - `of: "key" | "member"`, `from: "rule"`: in an outcome. The rule of the
 *   kind names the subjects. With `second` it names them after the other
 *   rows are read, and is given their observations.
 * - `of: "rules" | "definitions"`: one subject, what the rules scope holds.
 *   A row of the rules may state `retains`.
 * - `of: "holders"`: one subject, the holders of one action.
 */
export type Observe = { window: number; use: "once" | "reuse"; without?: "wait" | "write" } & (
  | { of: "member"; from: SubjectSource; max: number }
  | { of: "key" | "member"; from: "rule"; max: number; second?: true }
  | { of: "rules"; retains?: readonly Retained[] }
  | { of: "definitions" }
  | { of: "holders"; action: string; most: number }
);

/** The clauses of a result that may state rows. `undelivered` may not: its entry is a diagnosis, whose input holds no observation. */
export type ObservingClause = "applied" | "refused" | "superseded" | "conflict";

/** The rows of a `create`, a `tell` or a `relate`, by clause, beside its `result`. */
export type ClauseObserves = Partial<Record<ObservingClause, readonly Observe[]>>;

/** Which one earlier entry of the scope gives an outcome its `uses` (section 6.1, "The origin of an outcome"). */
export type Origin = "opening" | "rule";

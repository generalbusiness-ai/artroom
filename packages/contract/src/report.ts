/**
 * The report of a verifier (scope contract, section 9.5). A report always
 * states its mode and its coverage. A result is "consistent" for a stated
 * mode, target, coverage and set of trusts.
 */

import type { FactRef, ScopeRef } from "./scope.ts";

export interface Report {
  mode: "integrity" | "replay";
  target: FactRef;                          // the head verified through
  coverage: readonly { scope: ScopeRef; from: number; through: number }[];
  anchors: readonly FactRef[];              // heads taken on trust, or none
  dependencies: { verified: number; anchored: number; missing: readonly FactRef[] };
  trusts: readonly string[];                // for example "service clock", "delivery times", "Git host as read at T"
  /** Each text that a tombstone removed, and that was therefore not derived again: the tombstone entry, and the slot that held the text. */
  redacted: readonly { tombstone: FactRef; item: number; slot: string }[];
  result: "consistent" | "mismatch" | "missing-dependency" | "unsupported-definition" | "incomplete";
  at?: FactRef;                             // the entry a mismatch names
  /**
   * The name of a named mismatch (section 9.5, revisions 13 and 21). It is
   * there exactly when the result is `mismatch` and the failure is one that
   * section 9.4 or section 16.1 names: one of six. Every other mismatch
   * has no name. Two reports are compared by it without reading words.
   */
  name?: MismatchName;
}

/** The six named mismatches: the two of section 9.4, and the four of the order of observations (section 16.1). */
export type MismatchName = "genesis-kind" | "genesis-timed" | "observation-older" | "run-returned" | "observation-not-moved" | "observation-reused";

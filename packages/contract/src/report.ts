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
}

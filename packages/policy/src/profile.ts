/**
 * The `artroom-jsonata-v1` profile (R-EVAL-1, R-EVAL-2). The budgets are
 * atseq's `atseq-jsonata-v1` values, unchanged. The contract's
 * `PolicyProfile` type fixes each value, so a changed budget fails the
 * typecheck as well as the corpus.
 */

import type { PolicyProfile, ProfileStamp } from "@generalbusiness/artroom-contract";

export const PROFILE: PolicyProfile = Object.freeze({
  id: "artroom-jsonata-v1",
  programBytes: 65_536,
  inputBytes: 262_144,
  outputBytes: 262_144,
  inputDepth: 32,
  astNodes: 4_096,
  astDepth: 64,
  evaluationDepth: 64,
  evaluationSteps: 100_000,
  sequenceLength: 16_384,
  intermediateBytes: 1_048_576,
  inspectionBytes: 16_777_216,
  functions: Object.freeze([
    "abs", "ceil", "floor", "round", "count", "sum", "min", "max", "length",
    "exists", "not", "lookup", "append", "merge", "contains", "substring",
  ] as const),
});

/** The pinned interpreter. package.json pins the same exact version (R-EVAL-4). */
export const JSONATA_VERSION = "2.2.2";

/** Recorded with every decision (R-EVAL-4, R-POL-11). */
export const STAMP: ProfileStamp = Object.freeze({ profile: PROFILE.id, jsonata: JSONATA_VERSION });

/**
 * A budget across all rules evaluated for one act, added on top of the
 * per-evaluation budgets above, which stay atseq's. The room-core spike
 * (2026-10-01) estimated 3 to 9 microseconds of deployed CPU per step on
 * the rules it sampled, so 25,000 steps is an estimated 75 to 225 ms for
 * those rules. That is an estimate, not a bound for every admitted program
 * or host. A 99-path propose used 2,772 steps across 7 rules. JSONata's own
 * `timeout` option never fires on Workers, so these counts are the only
 * guard.
 *
 * The accounting is versioned as `ACCOUNTING` and recorded, with the limits
 * and the usage already spent, in every replay context (context.ts).
 */
export const ACT_BUDGET = Object.freeze({
  steps: 25_000,
  inspectedBytes: 4 * 1024 * 1024,
});

/** The version of the per-act accounting: what is counted, and how calls share it. */
export const ACCOUNTING = "artroom-act-budget-v1";

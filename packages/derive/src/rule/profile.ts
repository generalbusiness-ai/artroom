/**
 * The evaluator profile `restricted@1`: a restricted JSONata. The budgets and
 * the function list are those of the earlier evaluator, unchanged, so its
 * engine fingerprint still holds.
 */

export const PROFILE = Object.freeze({
  name: "restricted",
  version: 1,
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
  /** Every function a rule may call. All are pure. None reads a clock, a random source or anything outside its arguments. */
  functions: Object.freeze([
    "abs", "ceil", "floor", "round", "count", "sum", "min", "max", "length",
    "exists", "not", "lookup", "append", "merge", "contains", "substring",
  ] as const),
});

/** The pinned interpreter. `package.json` pins the same exact version, and `ENGINE_FINGERPRINT` pins its behaviour. */
export const JSONATA_VERSION = "2.2.2";

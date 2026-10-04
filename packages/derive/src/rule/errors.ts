/**
 * Two kinds of evaluation failure.
 *
 * - `RuleEvalError` is deterministic. The same expression and input always
 *   give the same code. A rule that ends this way is not true, so its
 *   prepared result is false.
 * - `RuleRuntimeFailure` is a fault of the engine, or an interpreter that is
 *   not the pinned one. No result is prepared, and the input is answered
 *   `unavailable`.
 */

/** The expression or a value passed a budget of the profile. */
export const BUDGET_CODES = [
  "source_bytes",       // expression over 64 KiB
  "source_complexity",  // AST over 4,096 containers or 64 levels
  "value_bytes",        // input, output or one intermediate over its byte cap
  "value_depth",        // JSON container depth over 32
  "step_budget",        // over 100,000 evaluator visits
  "evaluation_depth",   // over 64 active evaluator levels
  "sequence_limit",     // an intermediate sequence over 16,384 items
  "inspection_budget",  // over 16 MiB of inspected intermediate bytes
] as const;

/** The expression or a value is outside the profile. */
export const TYPE_CODES = [
  "invalid_source",          // JSONata syntax error
  "unsupported_expression",  // a node type or operator outside the profile
  "unsupported_function",    // a function outside the allowlist
  "unsupported_variable",    // an unbound variable, or a rebound built-in
  "reserved_key",            // __proto__, constructor, prototype, _jsonata_*
  "wire_number",             // not a safe integer, or negative zero
  "wire_value",              // not plain JSON
  "unicode",                 // malformed Unicode
  "sum_overflow",            // $sum left the safe integer range
  "absent_result",           // the expression produced no value
  "engine_input",            // JSONata rejected the data (a D or T code)
] as const;

export type EvalCode = (typeof BUDGET_CODES)[number] | (typeof TYPE_CODES)[number];

export class RuleEvalError extends Error {
  override readonly name = "RuleEvalError";
  readonly code: EvalCode;
  constructor(code: EvalCode, message: string) {
    super(message);
    this.code = code;
  }
}

export class RuleRuntimeFailure extends Error {
  override readonly name = "RuleRuntimeFailure";
  readonly fault: "engine_error" | "dependency_mismatch";
  constructor(fault: "engine_error" | "dependency_mismatch", message: string) {
    super(message);
    this.fault = fault;
  }
}

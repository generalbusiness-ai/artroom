/**
 * Two kinds of evaluation failure (R-EVAL-5).
 *
 * - `PolicyEvalError` is a deterministic refusal. The same program and input
 *   always give the same code. The room records it as a domain outcome:
 *   `policy-budget-exceeded` or `policy-type-error`.
 * - `PolicyRuntimeFailure` is infrastructure: an engine fault, a stack
 *   overflow, or an interpreter that is not the pinned one. Nothing is
 *   recorded, and the caller gets a retryable `ArtroomError` `policy-runtime`.
 */

import type { ArtroomError } from "@generalbusiness/artroom-contract";

/** Budget codes, ported from atseq. Each maps to `policy-budget-exceeded`. */
export const BUDGET_CODES = [
  "source_bytes", //       program over 64 KiB
  "source_complexity", //  AST over 4,096 containers or 64 levels
  "value_bytes", //        input, output or one intermediate over its byte cap
  "value_depth", //        JSON container depth over 32
  "step_budget", //        over 100,000 evaluator visits
  "evaluation_depth", //   over 64 active evaluator levels
  "sequence_limit", //     an intermediate sequence over 16,384 items
  "inspection_budget", //  over 16 MiB of inspected intermediate bytes
  "act_step_budget", //    Artroom: over the per-act step budget (ACT_BUDGET)
  "act_inspection_budget", // Artroom: over the per-act inspected-byte budget (ACT_BUDGET)
] as const;

/** Type and profile codes, ported from atseq. Each maps to `policy-type-error`. */
export const TYPE_CODES = [
  "invalid_source", //          JSONata syntax error
  "unsupported_expression", //  a node type or operator outside the profile
  "unsupported_function", //    a function outside the allowlist
  "unsupported_variable", //    an unbound variable, or a rebound built-in
  "reserved_key", //            __proto__, constructor, prototype, _jsonata_*
  "wire_number", //             not a safe integer, or negative zero
  "wire_value", //              not plain JSON
  "unicode", //                 malformed Unicode
  "sum_overflow", //            $sum left the safe integer range
  "absent_result", //           the expression produced no value
  "engine_input", //            JSONata rejected the data (a D or T code)
  "result_type", //             Artroom: the rule kind needs a boolean and got something else
] as const;

export type BudgetCode = (typeof BUDGET_CODES)[number];
export type TypeCode = (typeof TYPE_CODES)[number];
export type EvalCode = BudgetCode | TypeCode;

/** The recorded refusal code for an evaluation error (R-EVAL-5). */
export type RefusalCode = "policy-budget-exceeded" | "policy-type-error";

const budget: ReadonlySet<string> = new Set(BUDGET_CODES);

export function refusalCode(code: EvalCode): RefusalCode {
  return budget.has(code) ? "policy-budget-exceeded" : "policy-type-error";
}

/** A deterministic refusal. Replay gives the same code (R-EVAL-6). */
export class PolicyEvalError extends Error {
  override readonly name = "PolicyEvalError";
  readonly code: EvalCode;
  constructor(code: EvalCode, message: string) {
    super(message);
    this.code = code;
  }
  get refusal(): RefusalCode {
    return refusalCode(this.code);
  }
}

/** A runtime failure. It has the `ArtroomError` shape, so it crosses RPC intact. */
export class PolicyRuntimeFailure extends Error implements ArtroomError {
  override readonly name = "ArtroomError";
  readonly code = "policy-runtime";
  readonly retryable = true;
  /** atseq's code for the fault, for logs: `engine_error` or `dependency_mismatch`. */
  readonly fault: "engine_error" | "dependency_mismatch";
  constructor(fault: "engine_error" | "dependency_mismatch", message: string) {
    super(message);
    this.fault = fault;
  }
}

export function isPolicyEvalError(error: unknown): error is PolicyEvalError {
  return error instanceof PolicyEvalError;
}

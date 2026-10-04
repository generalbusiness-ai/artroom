/**
 * The restricted JSONata evaluator, ported from atseq
 * `src/runtime/evaluator.ts` with its budgets, node and operator allowlists,
 * function allowlist and evaluation hooks unchanged (R-EVAL-1, R-EVAL-2).
 *
 * Changes from atseq:
 * - errors map to Artroom's two outcomes (errors.ts, R-EVAL-5);
 * - atseq's Node-only dependency check is replaced by `assertEngine`,
 *   which uses only WebCrypto and data bundled with the code (R-EVAL-7);
 * - `admit` runs the admission checks alone, for policy validation (R-POL-1);
 * - a caller may pass a `Meter`, so a refused evaluation still reports the
 *   budget it used (R-POL-11);
 * - atseq's `fold` is not ported: Artroom has no folds.
 *
 * Nothing here reads the clock, randomness or I/O. The engine itself takes a
 * timestamp for `$now` and `$millis`, but the profile refuses both, so a
 * program can never observe it.
 */

import jsonata from "jsonata";
import jsonataPackage from "jsonata/package.json" with { type: "json" };
import type { Json } from "@generalbusiness/artroom-contract";
import { ACT_BUDGET, JSONATA_VERSION, PROFILE } from "./profile.ts";
import { PolicyEvalError, PolicyRuntimeFailure } from "./errors.ts";
import { PreparedInput, canonicalJson, inspectIntermediate, jsonCopy, prepareInput, safeName } from "./values.ts";
import { sha256Hex } from "./integrity.ts";

const functions: ReadonlySet<string> = new Set(PROFILE.functions);
const nodes = new Set([
  "path",
  "name",
  "string",
  "number",
  "value",
  "variable",
  "binary",
  "unary",
  "function",
  "block",
  "bind",
  "condition",
  "filter",
]);
const operators = new Set(["+", "-", "*", "/", "%", "=", "!=", "<", "<=", ">", ">=", "and", "or", "in", "&"]);
// The engine's AST is untyped JSON with a `type` field on each node.
type Ast = Record<string, any>;

function checkAst(ast: unknown): WeakMap<Ast, Ast | undefined> {
  let count = 0;
  const locals = new Set<string>();
  const reads: string[] = [];
  const parents = new WeakMap<Ast, Ast | undefined>();
  function walk(value: unknown, depth: number, parent?: Ast, field?: string, ancestor?: Ast) {
    if (!value || typeof value !== "object") return;
    if (depth > PROFILE.astDepth || ++count > PROFILE.astNodes)
      throw new PolicyEvalError("source_complexity", "Program AST exceeds the profile");
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, depth + 1, parent, field, ancestor));
      return;
    }
    const node = value as Ast;
    if (typeof node["type"] === "string") {
      parents.set(node, ancestor);
      if (!nodes.has(node["type"]))
        throw new PolicyEvalError("unsupported_expression", `JSONata ${node["type"]} is outside the profile`);
      if (node["type"] === "binary" && !operators.has(node["value"]))
        throw new PolicyEvalError("unsupported_expression", `Operator ${node["value"]} is outside the profile`);
      if (node["type"] === "unary" && !["[", "{", "-"].includes(node["value"]))
        throw new PolicyEvalError("unsupported_expression", `Unary ${node["value"]} is outside the profile`);
      if (
        node["type"] === "function" &&
        (node["procedure"]?.type !== "variable" || !functions.has(node["procedure"].value))
      )
        throw new PolicyEvalError("unsupported_function", "Only the named pure profile functions can be called");
      if (node["type"] === "variable") {
        const name = node["value"] as string;
        const isCall = parent?.["type"] === "function" && field === "procedure";
        // Only context, root and declared data locals are readable. The host
        // never exposes caller bindings, and callable aliases are not admitted.
        if (!isCall && name !== "" && name !== "$") reads.push(name);
      }
      if (
        node["type"] === "bind" &&
        (node["lhs"]?.type !== "variable" ||
          !node["lhs"].value ||
          node["lhs"].value === "$" ||
          functions.has(node["lhs"].value))
      )
        throw new PolicyEvalError("unsupported_variable", "Cannot replace the root or a profile function");
      if (node["type"] === "bind") locals.add(node["lhs"].value);
      if (node["type"] === "name" && !safeName(node["value"]))
        throw new PolicyEvalError("reserved_key", `Reserved property ${node["value"]}`);
      if (node["type"] === "number" && !Number.isSafeInteger(node["value"]))
        throw new PolicyEvalError("wire_number", "Only safe integer literals are admitted");
    }
    for (const [key, v] of Object.entries(node))
      walk(v, depth + 1, node, key, typeof node["type"] === "string" ? node : ancestor);
  }
  walk(ast, 0);
  for (const name of reads)
    if (!locals.has(name) || functions.has(name))
      throw new PolicyEvalError("unsupported_variable", `Variable $${name} is outside the profile`);
  return parents;
}

interface Compiled {
  readonly expression: jsonata.Expression;
  readonly parents: WeakMap<Ast, Ast | undefined>;
}

function compile(source: string): Compiled {
  if (new TextEncoder().encode(source).length > PROFILE.programBytes)
    throw new PolicyEvalError("source_bytes", "Program exceeds 64 KiB");
  let expression: jsonata.Expression;
  // The engine's shared stack counter counts Promise.all siblings as nesting.
  // The host hooks instead count active AST ancestors. Recursion is not admitted.
  try {
    expression = jsonata(source, { sequence: PROFILE.sequenceLength });
  } catch (error) {
    // JSONata syntax errors are plain objects with S0xxx parser codes. Any
    // other exception (including a parser stack overflow) is a runtime fault.
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      typeof error.code !== "string" ||
      !/^S0\d{3}$/.test(error.code)
    )
      throw new PolicyRuntimeFailure("engine_error", `JSONata parser fault: ${String(error)}`);
    throw new PolicyEvalError("invalid_source", "message" in error ? String(error.message) : error.code);
  }
  return { expression, parents: checkAst(expression.ast()) };
}

/**
 * Run the profile's admission checks on a program without evaluating it.
 * Throws `PolicyEvalError` if the program is outside the profile.
 */
export function admit(source: string): void {
  compile(source);
}

/** The budget an evaluation used. Updated as it runs, so it is accurate after a refusal too. */
export interface Meter {
  steps: number;
  inspectedBytes: number;
}

/**
 * The budget left for one act, shared by every rule evaluated for it.
 * Create one per act with `actMeter()` and pass it to each evaluate call
 * for that act. Each call records the meter's state when it starts in its
 * replay context (context.ts), so it replays alone.
 */
export interface ActMeter {
  steps: number;
  inspectedBytes: number;
  readonly limits: { readonly steps: number; readonly inspectedBytes: number };
}

export function actMeter(limits: ActMeter["limits"] = ACT_BUDGET): ActMeter {
  return { steps: 0, inspectedBytes: 0, limits: { steps: limits.steps, inspectedBytes: limits.inspectedBytes } };
}

export interface Evaluation {
  readonly value: Json;
  readonly steps: number;
  readonly inspectedBytes: number;
}

async function run(source: string, input: unknown, meter: Meter, act: ActMeter | undefined): Promise<Evaluation> {
  const { expression, parents } = compile(source);
  const prepared = input instanceof PreparedInput ? input : prepareInput(input);
  const active = new WeakMap<Ast, { depth: number; count: number }>();
  expression.registerFunction(
    "sum",
    (values: number[] | undefined) => {
      if (values === undefined) return undefined;
      let total = 0n;
      for (const value of values) {
        if (!Number.isSafeInteger(value)) throw new PolicyEvalError("wire_number", "sum accepts safe integers only");
        total += BigInt(value);
        if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER))
          throw new PolicyEvalError("sum_overflow", "sum intermediate exceeds the safe integer range");
      }
      return Number(total);
    },
    "<a<n>:n>",
  );
  const charge = (bytes: number) => {
    if ((meter.inspectedBytes += bytes) > PROFILE.inspectionBytes)
      throw new PolicyEvalError("inspection_budget", "Intermediate encoded-byte inspection budget exhausted");
    if (act && (act.inspectedBytes += bytes) > act.limits.inspectedBytes)
      throw new PolicyEvalError("act_inspection_budget", "The act's inspected-byte budget across its rules is exhausted");
  };
  // The pinned engine exposes symbol hooks. These are host-owned and cannot be
  // addressed from JSONata; their behaviour is covered in the corpus.
  const assign = expression.assign as (name: string | symbol, value: unknown) => void;
  assign(Symbol.for("jsonata.__evaluate_entry"), (node: Ast) => {
    if (++meter.steps > PROFILE.evaluationSteps)
      throw new PolicyEvalError("step_budget", "Evaluation step budget exhausted");
    if (act && ++act.steps > act.limits.steps)
      throw new PolicyEvalError("act_step_budget", "The act's step budget across its rules is exhausted");
    if (!parents.has(node)) throw new PolicyRuntimeFailure("engine_error", "Engine evaluated an unadmitted AST node");
    let parent = parents.get(node);
    while (parent && !active.has(parent)) parent = parents.get(parent);
    const depth = (parent ? active.get(parent)!.depth : 0) + 1;
    if (depth > PROFILE.evaluationDepth)
      throw new PolicyEvalError("evaluation_depth", "Evaluation nesting limit reached");
    const previous = active.get(node);
    active.set(node, { depth, count: (previous?.count ?? 0) + 1 });
  });
  assign(Symbol.for("jsonata.__evaluate_exit"), (node: Ast, _input: unknown, _environment: unknown, result: unknown) => {
    const current = active.get(node)!;
    if (current.count === 1) active.delete(node);
    else current.count--;
    // The procedure variable is an engine-owned function object, never data.
    if (node["type"] === "variable" && functions.has(node["value"])) return;
    if (result !== undefined) inspectIntermediate(result, PROFILE.intermediateBytes, PROFILE.inputDepth, charge, prepared.memo);
  });
  try {
    const value: unknown = await expression.evaluate(prepared.value);
    if (value === undefined) throw new PolicyEvalError("absent_result", "Expression produced no JSON value");
    return { value: jsonCopy(value, PROFILE.outputBytes, true), steps: meter.steps, inspectedBytes: meter.inspectedBytes };
  } catch (error) {
    if (error instanceof PolicyEvalError || error instanceof PolicyRuntimeFailure) throw error;
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "D1011") throw new PolicyEvalError("evaluation_depth", "Engine evaluation nesting limit reached");
    if (code === "D2014" || code === "D2015")
      throw new PolicyEvalError("sequence_limit", "Engine sequence length limit reached");
    if (typeof code === "string" && /^[DT][0-9]{4}$/.test(code))
      throw new PolicyEvalError("engine_input", `JSONata rejected the supplied data (${code})`);
    throw new PolicyRuntimeFailure("engine_error", String((error as Error)?.message ?? error));
  }
}

/**
 * Evaluate one program on one input. No user callbacks or external bindings.
 * `input` may be a `PreparedInput`, to share one measured copy across the
 * rules of an act. Throws `PolicyEvalError` for a deterministic refusal and
 * `PolicyRuntimeFailure` for a runtime failure (R-EVAL-5).
 */
export async function evaluate(
  source: string,
  input: unknown,
  meter: Meter = { steps: 0, inspectedBytes: 0 },
  act?: ActMeter,
): Promise<Evaluation> {
  await assertEngine();
  return run(source, input, meter, act);
}

// ------------------------------------------------------- engine integrity

/**
 * Probes whose results, step counts and inspected bytes pin the engine's
 * observable behaviour, including the hooks the budgets rely on.
 */
const PROBES: readonly (readonly [string, Json])[] = [
  ["a + b * 2", { a: 1, b: 3 }],
  ['items[kind = "x"].n', { items: [{ kind: "x", n: 1 }, { kind: "y", n: 2 }, { kind: "x", n: 3 }] }],
  ["$count(items) > 1 and $exists(flag) ? $sum(items) : -1", { items: [4, 5, 6], flag: true }],
  ['($t := "ab"; $t & $substring("xyz", 1, 1))', {}],
  ["$string(1)", {}],
  ['{"k": $lookup(m, "a"), "m": $merge([m, {"b": 2}])}', { m: { a: 1 } }],
  ['$contains("hello", "ell") and $not(false) and 3 in [1, 2, 3]', {}],
  ["$append(a, b)", { a: [1, 2], b: [3] }],
  ["[$abs(-2), $floor(7 / 2), $ceil(1), $round(2), $min([3, 1]), $max([3, 9]), $length(s)]", { s: "four" }],
  ["items{key: value}", { items: [{ key: "a", value: 1 }, { key: "b", value: 2 }] }],
  ["1/2", {}],
  ["$now()", {}],
  ["missing", {}],
];

/** SHA-256 of the canonical probe results on jsonata 2.2.2 with this profile. */
export const ENGINE_FINGERPRINT = "sha256:dfaf558b1f51f37a0340463fb3495b63fa4d759c3e2bfdf8917907efd55d24e3";

/** Run the probes and return their canonical JSON. Exported for the fingerprint test. */
export async function probeResults(): Promise<string> {
  const results: Json[] = [];
  for (const [source, input] of PROBES) {
    try {
      const { value, steps, inspectedBytes } = await run(source, input, { steps: 0, inspectedBytes: 0 }, undefined);
      results.push({ value, steps, inspectedBytes });
    } catch (error) {
      if (!(error instanceof PolicyEvalError)) throw error;
      results.push({ error: error.code });
    }
  }
  return canonicalJson(results, 1 << 20);
}

let engineChecked: Promise<void> | undefined;

/**
 * Refuse to evaluate on an interpreter other than the pinned one. Checks the
 * installed `jsonata` version and the probe fingerprint, using WebCrypto
 * only, so the same check runs in Node, workerd and browsers (R-EVAL-7).
 * Like atseq's check, this detects drift and partial installs; it is not a
 * boundary against someone who can change the installed code.
 */
export function assertEngine(): Promise<void> {
  engineChecked ??= (async () => {
    if (jsonataPackage.version !== JSONATA_VERSION)
      throw new PolicyRuntimeFailure(
        "dependency_mismatch",
        `jsonata ${jsonataPackage.version} is installed; the profile pins ${JSONATA_VERSION}`,
      );
    const fingerprint = `sha256:${await sha256Hex(new TextEncoder().encode(await probeResults()))}`;
    if (fingerprint !== ENGINE_FINGERPRINT)
      throw new PolicyRuntimeFailure("dependency_mismatch", `Engine fingerprint ${fingerprint} is not the pinned one`);
  })();
  // A failed check is not cached: a retry re-runs it and fails the same way.
  engineChecked.catch(() => {
    engineChecked = undefined;
  });
  return engineChecked;
}

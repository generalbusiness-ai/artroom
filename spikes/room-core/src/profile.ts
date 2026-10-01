// Restricted JSONata profile for room rules.
//
// Ported from atseq src/runtime/evaluator.ts (Apache-2.0, same authors):
// the AST admission walk (node, operator and function allowlists, no caller
// variables, safe-integer literals, reserved keys), the evaluate-entry and
// evaluate-exit hooks that count steps and active depth, the per-result byte
// inspection, the checked integer $sum, and the mapping of engine errors to
// stable codes. Changes for the spike: a host $glob function for path rules,
// compiled expressions cached per source, a `guard: false` mode used only to
// measure the unguarded engine, and a smaller value walker in place of
// atseq's canonicalJson.
import jsonata from "jsonata";
import { glob } from "./glob";

export const PROFILE = Object.freeze({
  id: "artroom-spike-jsonata-0",
  programBytes: 64 * 1024,
  inputBytes: 256 * 1024,
  outputBytes: 256 * 1024,
  inputDepth: 32,
  astNodes: 4096,
  astDepth: 64,
  evaluationDepth: 64,
  evaluationSteps: 100_000,
  sequenceLength: 16_384,
  intermediateBytes: 1024 * 1024,
  inspectionBytes: 16 * 1024 * 1024,
});

export class ProfileError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const functions = new Set([
  "abs", "ceil", "floor", "round", "count", "sum", "min", "max", "length", "exists", "not",
  "lookup", "append", "merge", "contains", "substring",
  "glob", // host: path glob, see glob.ts
]);
const nodes = new Set(["path", "name", "string", "number", "value", "variable", "binary", "unary", "function", "block", "bind", "condition", "filter"]);
const operators = new Set(["+", "-", "*", "/", "%", "=", "!=", "<", "<=", ">", ">=", "and", "or", "in", "&"]);
const reserved = new Set(["__proto__", "prototype", "constructor"]);
const safeName = (n: string) => !reserved.has(n) && !n.startsWith("_jsonata_");
type Ast = Record<string, any>;

function checkAst(ast: unknown): WeakMap<Ast, Ast | undefined> {
  let count = 0;
  const locals = new Set<string>();
  const reads: string[] = [];
  const parents = new WeakMap<Ast, Ast | undefined>();
  function walk(value: unknown, depth: number, parent?: Ast, field?: string, ancestor?: Ast) {
    if (!value || typeof value !== "object") return;
    if (depth > PROFILE.astDepth || ++count > PROFILE.astNodes) throw new ProfileError("source_complexity", "Program AST exceeds the profile");
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, depth + 1, parent, field, ancestor));
      return;
    }
    const node = value as Ast;
    if (typeof node.type === "string") {
      parents.set(node, ancestor);
      if (!nodes.has(node.type)) throw new ProfileError("unsupported_expression", `JSONata ${node.type} is outside the profile`);
      if (node.type === "binary" && !operators.has(node.value)) throw new ProfileError("unsupported_expression", `Operator ${node.value} is outside the profile`);
      if (node.type === "unary" && !["[", "{", "-"].includes(node.value)) throw new ProfileError("unsupported_expression", `Unary ${node.value} is outside the profile`);
      if (node.type === "function" && (node.procedure?.type !== "variable" || !functions.has(node.procedure.value)))
        throw new ProfileError("unsupported_function", "Only the named pure profile functions can be called");
      if (node.type === "variable") {
        const name = node.value as string;
        const isCall = parent?.type === "function" && field === "procedure";
        if (!isCall && name !== "" && name !== "$") reads.push(name);
      }
      if (node.type === "bind" && (node.lhs?.type !== "variable" || !node.lhs.value || node.lhs.value === "$" || functions.has(node.lhs.value)))
        throw new ProfileError("unsupported_variable", "Cannot replace the root or a profile function");
      if (node.type === "bind") locals.add(node.lhs.value);
      if (node.type === "name" && !safeName(node.value)) throw new ProfileError("reserved_key", `Reserved property ${node.value}`);
      if (node.type === "number" && !Number.isSafeInteger(node.value)) throw new ProfileError("wire_number", "Only safe integer literals are admitted");
    }
    for (const [key, v] of Object.entries(node)) walk(v, depth + 1, node, key, typeof node.type === "string" ? node : ancestor);
  }
  walk(ast, 0);
  for (const name of reads)
    if (!locals.has(name) || functions.has(name)) throw new ProfileError("unsupported_variable", `Variable $${name} is outside the profile`);
  return parents;
}

const engineArrayProps = new Set(["sequence", "outerWrapper", "keepSingleton", "cons", "tupleStream", "push"]);
const encoder = new TextEncoder();

type Memo = WeakMap<object, { bytes: number; height: number }>;

/**
 * Walk a JSON value, refusing anything outside plain JSON, and return its
 * encoded size. With `memo`, frozen containers already measured (the owned,
 * frozen rule input) are charged their recorded size without a walk; with
 * `record`, every container walked is recorded.
 */
function measure(v: unknown, maxBytes: number, maxDepth: number, charge?: (n: number) => void, depth = 0, intermediate = false, memo?: Memo, record = false): number {
  let bytes = 0;
  const add = (n: number) => {
    charge?.(n);
    if ((bytes += n) > maxBytes) throw new ProfileError("value_bytes", `Value exceeds ${maxBytes} bytes`);
  };
  // Returns the container height of x (0 for scalars).
  const walk = (x: unknown, d: number): number => {
    if (x === null || typeof x === "boolean") return add(x === true ? 4 : 5), 0;
    if (typeof x === "number") {
      if (!Number.isSafeInteger(x) || (!intermediate && Object.is(x, -0))) throw new ProfileError("wire_number", "expected a safe integer");
      return add(String(x).length), 0;
    }
    if (typeof x === "string") return add(encoder.encode(JSON.stringify(x)).length), 0;
    if (!x || typeof x !== "object") throw new ProfileError("wire_value", `unsupported ${typeof x}`);
    if (d >= maxDepth) throw new ProfileError("value_depth", `container depth exceeds ${maxDepth}`);
    const known = memo && !record ? memo.get(x) : undefined;
    if (known) {
      if (d + known.height > maxDepth) throw new ProfileError("value_depth", `container depth exceeds ${maxDepth}`);
      add(known.bytes);
      return known.height;
    }
    const before = bytes;
    let height = 0;
    if (Array.isArray(x)) {
      for (const key of Object.keys(x))
        if (!(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < x.length) && !(intermediate && engineArrayProps.has(key)))
          throw new ProfileError("wire_value", `extra array property ${key}`);
      add(2 + Math.max(0, x.length - 1));
      for (const item of x) height = Math.max(height, walk(item, d + 1));
    } else {
      const proto = Object.getPrototypeOf(x);
      if (proto !== Object.prototype && proto !== null) throw new ProfileError("wire_value", "expected a plain object");
      const keys = Object.keys(x);
      add(2 + Math.max(0, keys.length - 1));
      for (const k of keys) {
        if (!safeName(k)) throw new ProfileError("reserved_key", `reserved key ${k}`);
        add(encoder.encode(JSON.stringify(k)).length + 1);
        height = Math.max(height, walk((x as Record<string, unknown>)[k], d + 1));
      }
    }
    if (record && memo) memo.set(x, { bytes: bytes - before, height: height + 1 });
    return height + 1;
  };
  walk(v, depth);
  return bytes;
}

function deepFreeze<T>(x: T): T {
  if (x && typeof x === "object" && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}

export interface Compiled {
  source: string;
  expression: jsonata.Expression;
  parents: WeakMap<Ast, Ast | undefined>;
}

const cache = new Map<string, Compiled>();

/** `timeoutMs` turns on jsonata's own Date.now() timeout guardrail (measured, not relied on). */
export function compile(source: string, useCache = true, timeoutMs = 0): Compiled {
  const key = `${timeoutMs}\u0000${source}`;
  const hit = useCache ? cache.get(key) : undefined;
  if (hit) return hit;
  if (encoder.encode(source).length > PROFILE.programBytes) throw new ProfileError("source_bytes", "Program exceeds 64 KiB");
  let expression: jsonata.Expression;
  try {
    expression = jsonata(source, { sequence: PROFILE.sequenceLength, ...(timeoutMs ? { timeout: timeoutMs } : {}) } as any);
  } catch (error: any) {
    if (error && typeof error.code === "string" && /^S0\d{3}$/.test(error.code)) throw new ProfileError("invalid_source", String(error.message));
    throw error;
  }
  const parents = checkAst(expression.ast());
  expression.registerFunction(
    "sum",
    (values: number[] | undefined) => {
      if (values === undefined) return undefined;
      let total = 0n;
      for (const value of values) {
        if (!Number.isSafeInteger(value)) throw new ProfileError("wire_number", "sum accepts safe integers only");
        total += BigInt(value);
        if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new ProfileError("sum_overflow", "sum exceeds the safe integer range");
      }
      return Number(total);
    },
    "<a<n>:n>",
  );
  expression.registerFunction(
    "glob",
    (path: string | undefined, patterns: string | string[]) => {
      if (path === undefined) return undefined;
      const list = typeof patterns === "string" ? [patterns] : patterns;
      if (list.length > 256) throw new ProfileError("glob_limit", "at most 256 patterns");
      return list.some((p) => glob(path, p));
    },
    "<s-(sa):b>",
  );
  const compiled = { source, expression, parents };
  if (useCache) cache.set(key, compiled);
  return compiled;
}

export interface Evaluation {
  value: unknown;
  steps: number;
  inspectedBytes: number;
}

/**
 * Evaluate an admitted rule. Guard modes, for measurement:
 *  true     step, depth and intermediate-byte hooks (the atseq profile)
 *  "memo"   as true, but parts of the frozen input are charged their recorded
 *           size instead of being walked again
 *  "steps"  step and depth hooks only, no byte inspection
 *  false    no hooks
 */
export async function evaluate(c: Compiled, input: unknown, opts: { guard?: boolean | "steps" | "memo" } = {}): Promise<Evaluation> {
  const guard = opts.guard ?? true;
  const memo: Memo | undefined = guard === "memo" ? new WeakMap() : undefined;
  const owned = structuredClone(input);
  if (memo) deepFreeze(owned);
  measure(owned, PROFILE.inputBytes, PROFILE.inputDepth, undefined, 0, false, memo, true);
  const { expression, parents } = c;
  const assign = expression.assign as (name: string | symbol, value: unknown) => void;
  let steps = 0;
  let inspectedBytes = 0;
  if (guard) {
    const active = new WeakMap<Ast, { depth: number; count: number }>();
    const charge = (bytes: number) => {
      if ((inspectedBytes += bytes) > PROFILE.inspectionBytes) throw new ProfileError("inspection_budget", "Intermediate byte budget exhausted");
    };
    assign(Symbol.for("jsonata.__evaluate_entry"), (node: Ast) => {
      if (++steps > PROFILE.evaluationSteps) throw new ProfileError("step_budget", "Evaluation step budget exhausted");
      if (!parents.has(node)) throw new ProfileError("engine_error", "Engine evaluated an unadmitted AST node");
      let parent = parents.get(node);
      while (parent && !active.has(parent)) parent = parents.get(parent);
      const depth = (parent ? active.get(parent)!.depth : 0) + 1;
      if (depth > PROFILE.evaluationDepth) throw new ProfileError("evaluation_depth", "Evaluation nesting limit reached");
      const previous = active.get(node);
      active.set(node, { depth, count: (previous?.count ?? 0) + 1 });
    });
    assign(Symbol.for("jsonata.__evaluate_exit"), (node: Ast, _i: unknown, _e: unknown, result: unknown) => {
      const current = active.get(node)!;
      if (current.count === 1) active.delete(node);
      else current.count--;
      if (node.type === "variable" && functions.has(node.value)) return;
      if (guard === "steps") return;
      if (result !== undefined) measure(result, PROFILE.intermediateBytes, PROFILE.inputDepth, charge, 0, true, memo);
    });
  } else {
    assign(Symbol.for("jsonata.__evaluate_entry"), undefined);
    assign(Symbol.for("jsonata.__evaluate_exit"), undefined);
  }
  try {
    const value = await expression.evaluate(owned);
    if (value === undefined) return { value: null, steps, inspectedBytes };
    measure(value, PROFILE.outputBytes, PROFILE.inputDepth, undefined, 0, true);
    return { value: JSON.parse(JSON.stringify(value)), steps, inspectedBytes };
  } catch (error: any) {
    if (error instanceof ProfileError) throw error;
    const code = error?.code;
    if (code === "D1012") throw new ProfileError("engine_timeout", String(error.message));
    if (code === "D1011") throw new ProfileError("evaluation_depth", "Engine evaluation nesting limit reached");
    if (code === "D2014" || code === "D2015") throw new ProfileError("sequence_limit", "Engine sequence length limit reached");
    if (typeof code === "string" && /^[DT][0-9]{4}$/.test(code)) throw new ProfileError("engine_input", `JSONata rejected the data (${code}): ${error.message}`);
    throw new ProfileError("engine_error", String(error?.message ?? error));
  }
}

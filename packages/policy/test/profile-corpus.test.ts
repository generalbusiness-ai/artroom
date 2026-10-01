/**
 * atseq's conformance corpus for the evaluator, ported case for case with
 * expected values unchanged. Sources: atseq tests/support/corpus.ts,
 * tests/support/boundaries.ts and tests/support/profile-corpus.ts.
 *
 * Not ported, because Artroom has no counterpart: fold outcomes and their
 * byte caps (action, state, ineffective reason and message), Lexicon schema
 * cases, Inlay view cases, and the Node dependency-closure check, which
 * test/integrity.test.ts replaces.
 */

import { describe, expect, test } from "vitest";
import { evaluate } from "../src/evaluator.ts";
import { canonicalJson } from "../src/values.ts";
import { PROFILE } from "../src/profile.ts";
import { rejects, same } from "./support/assert.ts";

const summaryQuery = '{"summary":"Total recorded: " & state.total}';
const baseInput = { meta: { app: "did:plc:experiment", position: 1 }, act: { delta: 3 }, state: { total: 2 } };

describe("atseq corpus: values and queries", () => {
  test("pure query", async () => {
    same((await evaluate(summaryQuery, { params: {}, state: { total: 5 } })).value, { summary: "Total recorded: 5" });
  });
  test("array append and multiplication", async () => {
    same(
      (await evaluate('{"items":$append(state.items,act.item),"cost":act.price * act.quantity}', {
        state: { items: ["one"] },
        act: { item: "two", price: 120, quantity: 3 },
      })).value,
      { items: ["one", "two"], cost: 360 },
    );
  });
  test("no floating output", () => rejects(() => evaluate("1/2", {}), "wire_number"));
  test("invalid syntax", () => rejects(() => evaluate("({", {}), "invalid_source"));
  test("literal ambient-function text is data", async () => {
    same((await evaluate('"$now() is text"', {})).value, "$now() is text");
  });
  test("ordinary JSONata locals need no custom naming", async () => {
    same((await evaluate("($amount:=act.delta; $amount * state.total)", baseInput)).value, 6);
  });
  test("built-in callable cannot be replaced", () => rejects(() => evaluate("($sum:=1; $sum([1]))", {}), "unsupported_variable"));
  test("safe integer boundaries", async () => {
    same((await evaluate("$", { high: Number.MAX_SAFE_INTEGER, low: Number.MIN_SAFE_INTEGER })).value, {
      high: Number.MAX_SAFE_INTEGER,
      low: Number.MIN_SAFE_INTEGER,
    });
    await rejects(() => evaluate("$", { bad: Number.MAX_SAFE_INTEGER + 1 }), "wire_number");
  });
  test("null, absent, extras, array order preserved", async () => {
    const value = { nil: null, extra: { values: [2, 1] } };
    same((await evaluate("$", value)).value, value);
  });
  test("prototype and invalid Unicode refused", async () => {
    await rejects(() => evaluate("$", JSON.parse('{"__proto__":1}')), "reserved_key");
    await rejects(() => evaluate("$", "\ud800"), "unicode");
  });
  test("absent expression result is explicit", () => rejects(() => evaluate("missing", {}), "absent_result"));
  test("negative zero input is not a wire integer", () => rejects(() => evaluate("$", { value: -0 }), "wire_number"));
  test("malformed Unicode object key is rejected", () => rejects(() => evaluate("$", { ["\ud800"]: 1 }), "unicode"));
  test("64 sibling object values do not consume nesting depth", async () => {
    const value = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`field${i}`, i]));
    same((await evaluate(JSON.stringify(value), {})).value, value);
  });
  test("100 grouped values do not consume nesting depth", async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ key: `k${i}`, value: i }));
    same((await evaluate("items{key:value}", { items })).value, Object.fromEntries(items.map((x) => [x.key, x.value])));
  });
  test("intermediate negative zero can be consumed as integer zero", async () => {
    same((await evaluate("(-0)+1", {})).value, 1);
    same((await evaluate("$sum([-0,1])", {})).value, 1);
  });
  test("negative zero remains invalid at input and output boundaries", async () => {
    await rejects(() => evaluate("value", { value: -0 }), "wire_number");
    await rejects(() => evaluate("-0", {}), "wire_number");
    await rejects(() => evaluate('{"value":-0}', {}), "wire_number");
  });
  test("sum checks exact intermediate integers before cancellation", async () => {
    same((await evaluate("$sum([9007199254740991,-9007199254740991,2])", {})).value, 2);
    await rejects(() => evaluate("$sum([9007199254740991,2,-9007199254740991])", {}), "sum_overflow");
    await rejects(() => evaluate("$sum([-9007199254740991,-2,9007199254740991])", {}), "sum_overflow");
  });
});

describe("atseq corpus: forbidden programs", () => {
  for (const source of [
    "$now()",
    "$millis()",
    "$random()",
    "$shuffle([1,2])",
    '$eval("1")',
    "function($x){$x}(1)",
    "($v_f := $now; $v_f())",
    "[1..100000000]",
    "/(a+)+$/",
    '$pad("a",100000000)',
    "$map([1],function($x){$x})",
    '$lookup({},"constructor")()',
  ])
    test(`forbidden: ${source}`, () => rejects(() => evaluate(source, {})));
  test("generated range rejected with stable code", () => rejects(() => evaluate("[1..100000000]", {}), "unsupported_expression"));
  test("regex rejected with stable code", () => rejects(() => evaluate("/(a+)+$/", {}), "unsupported_expression"));
  test("Unicode casing is outside the portable profile", async () => {
    for (const name of ["lowercase", "uppercase"]) await rejects(() => evaluate(`$${name}("İß")`, {}), "unsupported_function");
  });
});

describe("atseq corpus: budgets", () => {
  test("deterministic work exhaustion", async () => {
    const source = "($v_rows := state.rows; $count($v_rows.($v_rows.(1))))";
    const outcomes: string[] = [];
    for (let i = 0; i < 2; i++) {
      try {
        await evaluate(source, { state: { rows: Array(400).fill(1) } });
        throw new Error("Budget did not fire");
      } catch (e) {
        outcomes.push((e as { code: string }).code);
      }
    }
    expect(outcomes).toEqual(["step_budget", "step_budget"]);
  });
  test("program bytes exact cap", async () => {
    await evaluate("1" + " ".repeat(PROFILE.programBytes - 1), {});
    await rejects(() => evaluate("1" + " ".repeat(PROFILE.programBytes), {}), "source_bytes");
  });
  test("complete input bytes exact cap", async () => {
    const input = { s: "x".repeat(PROFILE.inputBytes - 8) };
    await evaluate("1", input);
    await rejects(() => evaluate("1", { s: input.s + "x" }), "value_bytes");
  });
  test("query output bytes exact cap", async () => {
    const input = { s: "x".repeat(PROFILE.outputBytes / 2 - 1) };
    const result = await evaluate("s & s", input);
    expect(new TextEncoder().encode(canonicalJson(result.value, PROFILE.outputBytes)).length).toBe(PROFILE.outputBytes);
    await rejects(() => evaluate('s & s & "x"', input), "value_bytes");
  });
  test("source complexity rejected before evaluation", () =>
    rejects(() => evaluate("[".repeat(40) + "1" + "]".repeat(40), {}), "source_complexity"));
  test("intermediate growth is bounded", () =>
    rejects(() => evaluate("($a:=s&s; $b:=$a&$a; $c:=$b&$b; 1)", { s: "x".repeat(150_000) }), "value_bytes"));
  test("input depth exact cap", async () => {
    let value: unknown = 1;
    for (let i = 0; i < PROFILE.inputDepth; i++) value = [value];
    canonicalJson(value);
    await rejects(() => canonicalJson([value]), "value_depth");
  });
  test("engine evaluation nesting exact boundary", async () => {
    same((await evaluate(Array(64).fill("1").join("+"), {})).value, 64);
    await rejects(() => evaluate(Array(65).fill("1").join("+"), {}), "evaluation_depth");
  });
  test("engine sequence exact boundary", async () => {
    expect(((await evaluate("$append(a,b)", { a: Array(8192).fill(1), b: Array(8192).fill(1) })).value as unknown[]).length).toBe(16384);
    await rejects(() => evaluate("$append(a,b)", { a: Array(8192).fill(1), b: Array(8193).fill(1) }), "sequence_limit");
  });
  test("AST container count exact boundary in unevaluated branch", async () => {
    const source = (n: number) => `false ? [${Array(n).fill(1).join(",")}] : 1`;
    same((await evaluate(source(4091), {})).value, 1);
    await rejects(() => evaluate(source(4092), {}), "source_complexity");
  });
  test("AST container depth exact boundary", async () => {
    await evaluate("[".repeat(32) + "1" + "]".repeat(32), {});
    await rejects(() => evaluate("[".repeat(33) + "1" + "]".repeat(33), {}), "source_complexity");
  });
  test("encoded-byte work budget exact boundary", async () => {
    // Repeated string scans dominate work, while the returned value stays tiny.
    const source = "($a:=s; rows.$length($a); p; 1)";
    const input = { s: "x".repeat(250380), rows: Array(64).fill(1), p: "x".repeat(325) };
    expect((await evaluate(source, input)).inspectedBytes).toBe(16777216);
    await rejects(() => evaluate(source, { ...input, p: input.p + "x" }), "inspection_budget");
  });
  test("large repeated intermediate strings exhaust byte budget", () =>
    rejects(
      () => evaluate("($a:=s&s&s;$count(state.rows.$a))", { s: "x".repeat(200000), state: { rows: Array(4096).fill(1) } }),
      "inspection_budget",
    ));
});

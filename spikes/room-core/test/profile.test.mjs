// Evaluator isolation (review 8f5dede9, P1.1) and admission checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, ProfileError, EngineFault } from "./.build/profile.mjs";

const scopeRule = "$count(changed[$glob($, $$.scope)])"; // the checker's repro
const scopeInput = { changed: Array.from({ length: 80 }, (_, i) => `src/f${i}.ts`), scope: ["src/**"] };
const cubic = "$count(changed[$count($$.changed[$count($$.changed[$ = $$.changed[0]]) > 0]) > 0])";
const cubicInput = (n) => ({ changed: Array.from({ length: n }, (_, i) => `src/dir${i % 10}/file${i}.ts`) });

// Run and capture either the evaluation or the error code, for comparison.
const settle = (p) => p.then((r) => ({ ok: true, ...r }), (e) => ({ ok: false, kind: e?.constructor?.name, code: e.code ?? null }));
const sequential = async (cases) => { const out = []; for (const [src, input, opts] of cases) out.push(await settle(evaluate(src, input, opts))); return out; };
const concurrent = (cases) => Promise.all(cases.map(([src, input, opts]) => settle(evaluate(src, input, opts))));

test("sequential baseline is non-trivial", async () => {
  const [r] = await sequential([[scopeRule, scopeInput]]);
  assert.equal(r.value, 80);
  assert.ok(r.steps > 400 && r.inspectedBytes > 50_000, JSON.stringify(r));
});

test("concurrent guarded evaluations match sequential ones", async () => {
  const cases = Array.from({ length: 8 }, () => [scopeRule, scopeInput]);
  assert.deepEqual(await concurrent(cases), await sequential(cases));
});

test("guarded evaluation concurrent with unguarded and other modes matches sequential", async () => {
  const cases = [
    [scopeRule, scopeInput],
    [scopeRule, scopeInput, { guard: false }],
    [scopeRule, scopeInput, { guard: "memo" }],
    [scopeRule, scopeInput, { guard: "steps" }],
    [scopeRule, scopeInput],
    [scopeRule, scopeInput, { guard: false }],
  ];
  const seq = await sequential(cases);
  assert.deepEqual(await concurrent(cases), seq);
  assert.equal(seq[0].steps, seq[4].steps);
  assert.equal(seq[1].steps, 0); // no hooks
});

test("budget failures are the same concurrently and sequentially", async () => {
  const cases = [
    [cubic, cubicInput(25)], // inspection_budget
    [cubic, cubicInput(50), { guard: "steps" }], // step_budget
    [scopeRule, scopeInput],
    [cubic, cubicInput(25), { guard: "memo" }], // inspection_budget
    [scopeRule, scopeInput, { guard: false }],
  ];
  const seq = await sequential(cases);
  assert.deepEqual(seq.map((r) => r.code ?? "ok"), ["inspection_budget", "step_budget", "ok", "inspection_budget", "ok"]);
  assert.deepEqual(await concurrent(cases), seq);
});

test("an evaluation after a failed one is unaffected", async () => {
  const [fresh] = await sequential([[scopeRule, scopeInput]]);
  await settle(evaluate(cubic, cubicInput(25)));
  const [after] = await sequential([[scopeRule, scopeInput]]);
  assert.deepEqual(after, fresh);
  const [fail, ok] = await concurrent([[cubic, cubicInput(25)], [scopeRule, scopeInput]]);
  assert.equal(fail.code, "inspection_budget");
  assert.deepEqual(ok, fresh);
});

test("admission checks still refuse what the profile excludes", async () => {
  const refused = async (src, code) => {
    const r = await settle(evaluate(src, {}));
    assert.equal(r.kind, "ProfileError", src);
    assert.equal(r.code, code, src);
  };
  await refused("$now()", "unsupported_function");
  await refused("$random()", "unsupported_function");
  await refused("$eval('1')", "unsupported_function");
  await refused("$x", "unsupported_variable");
  await refused("a ~> $count", "unsupported_expression");
  await refused("**.a", "unsupported_expression");
  await refused("$count := 1", "unsupported_variable");
  await refused("1.5", "wire_number");
  await refused("a.__proto__", "reserved_key");
});

test("deterministic value failures are ProfileErrors; a wall-clock timeout is an EngineFault", async () => {
  const doubling = '($a0 := "0123456789abcdef"; ' + Array.from({ length: 24 }, (_, i) => `$a${i + 1} := $a${i} & $a${i};`).join(" ") + " $a24)";
  const r = await settle(evaluate(doubling, {}));
  assert.deepEqual([r.kind, r.code], ["ProfileError", "value_bytes"]);
  const t = await settle(evaluate(cubic, cubicInput(100), { guard: false, timeoutMs: 20 }));
  assert.equal(t.kind, "EngineFault");
  assert.ok(ProfileError && EngineFault);
});

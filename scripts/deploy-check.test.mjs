import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDeployment } from "./deploy-check-evaluate.mjs";

// Synthetic metrics-v1 observations, not an observed demo or SQL API recording.
const version = "11111111-1111-1111-1111-111111111111", deployment = "local-fixture", now = 2_000_000;
function point(kind, { place = "acts", end = kind === "route" ? "ok" : "answer", answer = kind === "route" ? "turn" : "accepted", d = [1, 10, 0, 0, 0, 0], sample = 1, time = now, v = version } = {}) {
  const reason = kind === "route" ? ({ ok: "2xx", refused: "4xx", error: "5xx" }[end] ?? "none") : kind === "metric-dropped" ? "summary" : "none";
  return { timeMs: time, _sample_interval: sample, blobs: [kind, deployment, v, place, end, reason, "none", "none", end === "busy" ? "none" : answer], doubles: d };
}
function routeEnd(row, end) { row.blobs[4] = end; row.blobs[5] = { error: "5xx", refused: "4xx" }[end]; }
function turnCount(row, count) { row.doubles[0] = count; row.doubles[5] = count; }
function fixture() {
  return { deployment, version, now, p95BoundMs: 10,
    health: { status: 200, body: { deployment, version, sessions: "ok", register: "ready" } },
    rows: [...Array.from({ length: 100 }, (_, i) => point("route", { d: [1, i < 95 ? 10 : 100, 0, 0, 0, 0] })),
      point("turn", { d: [100, 1000, 7, 0, 0, 100] }),
      point("metric-dropped", { place: "metrics", end: "dropped", answer: "none", d: [1, 0, 0, 0, 0, 0] })] };
}

test("Judge uses weighted event counts, counter sums and route quantiles once", () => {
  const f = fixture();
  f.rows = [point("route", { sample: 95 }), point("route", { sample: 5, d: [1, 100, 0, 0, 0, 0] }),
    point("turn", { sample: 2, d: [50, 500, 7, 0, 0, 50] }), f.rows.at(-1)];
  const r = evaluateDeployment(f);
  assert.equal(r.routeCount, 100); assert.equal(r.turnCount, 100);
  assert.equal(r.eventCount, 201); assert.equal(r.weightedRows, 103);
  assert.equal(r.counters.turn.a, 14); assert.equal(r.routeP95Ms, 10);
  assert.equal(r.coverage, "unknown"); assert.deepEqual(r.failures, ["coverage"]);
});

test("Judge passes the unsampled synthetic boundary with declared limits", () => {
  const f = fixture(); routeEnd(f.rows[0], "error"); routeEnd(f.rows[1], "refused");
  const r = evaluateDeployment(f);
  assert.equal(r.pass, true); assert.equal(r.errorRate, 0.01); assert.equal(r.refusals, 1);
  assert.equal(r.routeP95Ms, 10); assert.equal(r.coverage, "complete");
  assert.match(r.message, /100 turns, no recorded loss, counts balanced/);
  assert.equal(r.rowsWritten, null); assert.equal(r.gaps.length, 3);
});

test("Judge refuses insufficient, stale, erroneous, slow or busy observations", () => {
  const cases = [
    ["no-data", f => f.rows.shift()],
    ["no-data", f => f.rows.splice(100, 1)],
    ["stale", f => f.rows.forEach(r => { r.timeMs = now - 300_001; })],
    ["error-rate", f => { routeEnd(f.rows[0], "error"); routeEnd(f.rows[1], "error"); }],
    ["latency", f => { f.rows[94].doubles[1] = 11; }],
    ["busy", f => { f.rows[100].blobs[4] = "busy"; f.rows[100].blobs[8] = "none"; f.rows[0]._sample_interval = 2; }],
  ];
  for (const [name, change] of cases) { const f = fixture(); change(f); const r = evaluateDeployment(f); assert.equal(r.pass, false, name); assert.ok(r.failures.includes(name), name); }
});

test("Judge requires loss-free unsampled balance at each actual HTTP place", () => {
  const cases = [
    ["critical loss", "incomplete", f => { f.rows.at(-1).doubles = [1, 1, 1, 1, 1, 0]; f.rows[0]._sample_interval = 2; }],
    ["missing turn", "incomplete", f => { turnCount(f.rows[100], 99); }],
    ["RPC cannot balance HTTP", "incomplete", f => { turnCount(f.rows[100], 99); f.rows.push(point("turn", { place: "rpc:acts" })); }],
    ["one place cannot balance another", "incomplete", f => { f.rows[0].blobs[3] = "create"; }],
    ["mixed place", "unknown", f => { f.rows.push(point("turn", { place: "mixed" })); }],
    ["unknown route place", "unknown", f => { f.rows[0].blobs[3] = "other"; }],
    ["sampled", "unknown", f => { f.rows[0]._sample_interval = 2; }],
    ["pre-turn excluded", "complete", f => { f.rows[0].blobs[8] = "pre-turn"; turnCount(f.rows[100], 99); }],
  ];
  for (const [label, coverage, change] of cases) { const f = fixture(); change(f); const r = evaluateDeployment(f); assert.equal(r.coverage, coverage, label); assert.equal(r.pass, coverage === "complete", label); }
});

test("Judge binds health and isolates the selected version and window", () => {
  const f = fixture();
  f.rows.push(point("turn", { end: "busy", v: "22222222-2222-2222-2222-222222222222", sample: 100 }), point("turn", { end: "busy", time: now - 900_001 }));
  assert.equal(evaluateDeployment(f).pass, true);
  f.health.body.version = "22222222-2222-2222-2222-222222222222";
  assert.ok(evaluateDeployment(f).failures.includes("health"));
  f.health.body.version = version; f.health.body.deployment = "another-deployment";
  assert.ok(evaluateDeployment(f).failures.includes("health"));
  f.health.body.deployment = deployment; f.health.status = 503;
  assert.ok(evaluateDeployment(f).failures.includes("health"));
});

test("Judge refuses malformed query observations and a missing bound", () => {
  const f = fixture(); f.rows[100].doubles[0] = Number.MAX_SAFE_INTEGER;
  assert.ok(evaluateDeployment(f).failures.includes("query"));
  const clean = fixture(); delete clean.p95BoundMs;
  assert.ok(evaluateDeployment(clean).failures.includes("calibration"));
});

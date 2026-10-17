import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDeployment } from "./deploy-check-evaluate.mjs";
import { checkDeployment, deploymentCheckMain } from "./deploy-check.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
  assert.equal(r.rowsWritten, null); assert.equal(r.rowsWrittenReason, "not-measured"); assert.equal(r.gaps.length, 3);
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

function apiRows(rows) {
  return { rows: rows.length, data: rows.map(row => Object.fromEntries([
    ["epochSeconds", String(row.timeMs / 1000)], ["_sample_interval", String(row._sample_interval)],
    ...row.blobs.flatMap((s, i) => i === 6 || i === 7 ? [] : [[`blob${i + 1}`, s]]),
    ...row.doubles.map((n, i) => [`double${i + 1}`, n]),
  ])) };
}
const clientOptions = { account: "a".repeat(32), token: "PRIVATE-TOKEN-FIXTURE", deployment, version, p95BoundMs: 10, healthUrl: "https://fixture.invalid/health" };

test("Judge client binds one bounded SQL window and a private independent health read", async () => {
  const f = fixture(), calls = [];
  const r = await checkDeployment(clientOptions, { now: () => now, fetch: async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.redirect, "error");
    if (url === clientOptions.healthUrl) { assert.equal(init.headers, undefined); return Response.json(f.health.body); }
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${clientOptions.account}/analytics_engine/sql`);
    assert.equal(init.method, "POST"); assert.equal(init.headers.Authorization, `Bearer ${clientOptions.token}`);
    assert.match(init.body, /blob3 = '11111111-1111-1111-1111-111111111111'/);
    assert.match(init.body, /toDateTime\(1100\)/); assert.match(init.body, /toDateTime\(2000\)/);
    assert.match(init.body, /LIMIT 50001 FORMAT JSON/);
    assert.doesNotMatch(init.body, /blob7|blob8|index1/);
    return Response.json(apiRows(f.rows));
  } });
  assert.equal(r.pass, true); assert.equal(r.routeCount, 100); assert.equal(calls.length, 2);
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE-TOKEN-FIXTURE/);
});

test("Judge client refuses failed, truncated or oversized observations without echoing them", async () => {
  const f = fixture();
  for (const bad of [new Response("PRIVATE-RESPONSE-FIXTURE", { status: 503 }), Response.json({ rows: 102, data: [] }),
    Response.json({ ...apiRows(f.rows), rows_before_limit_at_least: 50001 })]) {
    const r = await checkDeployment(clientOptions, { now: () => now, fetch: async url => url === clientOptions.healthUrl ? Response.json(f.health.body) : bad });
    assert.equal(r.pass, false); assert.ok(r.failures.includes("query"));
    assert.doesNotMatch(JSON.stringify(r), /PRIVATE-(?:TOKEN|RESPONSE)-FIXTURE/);
  }
  let cancelled = false;
  const r = await checkDeployment(clientOptions, { now: () => now, fetch: async url => url === clientOptions.healthUrl
    ? new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4097)); }, cancel() { cancelled = true; } }))
    : Response.json(apiRows(f.rows)) });
  assert.equal(r.pass, false); assert.ok(r.failures.includes("health")); assert.equal(cancelled, true);
  let pieces = 0, stopped = false;
  const fragmented = await checkDeployment(clientOptions, { now: () => now, fetch: async url => url === clientOptions.healthUrl
    ? Response.json(f.health.body)
    : new Response(new ReadableStream({ pull(c) { pieces++; c.enqueue(new Uint8Array()); }, cancel() { stopped = true; } })) });
  assert.equal(fragmented.pass, false); assert.ok(fragmented.failures.includes("query"));
  assert.equal(stopped, true); assert.ok(pieces <= 65_538);
});

test("Judge CLI takes the completed version from retained output and requires calibration before I/O", async () => {
  const dir = await mkdtemp(join(tmpdir(), "artroom-judge-cli-")), deployPath = join(dir, "deploy.ndjson"), calibrationPath = join(dir, "calibration.json");
  // Synthetic shape of documented Wrangler output, not an executed deployment.
  const session = { type: "wrangler-session", version: 1, wrangler_version: "4.147.0", command_line_args: ["deploy"] };
  const deployed = { type: "deploy", version: 1, worker_name: "fixture", version_id: version };
  const records = JSON.stringify(session) + "\n" + JSON.stringify(deployed) + "\n";
  const calibration = { format: "dap-metric-calibration-1", deployment, version, from: new Date(now - 60_000).toISOString(), through: new Date(now).toISOString(), routeCount: 100, p95Ms: 10, boundMs: 10, recordingSha256: "a".repeat(64) };
  const argv = ["--deploy-output", deployPath, "--calibration", calibrationPath, "--deployment", deployment, "--health", clientOptions.healthUrl];
  const f = fixture(); let output = "", calls = 0;
  const ports = { env: { CLOUDFLARE_ACCOUNT_ID: clientOptions.account, DAP_ANALYTICS_READ_TOKEN: clientOptions.token }, now: () => now,
    write: s => { output += s; }, fetch: async url => { calls++; return Response.json(url === clientOptions.healthUrl ? f.health.body : apiRows(f.rows)); } };
  try {
    await writeFile(deployPath, records); await writeFile(calibrationPath, JSON.stringify(calibration));
    assert.equal(await deploymentCheckMain(argv, ports), 0);
    const result = JSON.parse(output); assert.equal(result.version, version); assert.equal(result.calibration.boundMs, 10);
    assert.match(result.inputs.deploymentOutputSha256, /^[0-9a-f]{64}$/); assert.equal(calls, 2);
    for (const invalid of [records.replace('"type":"deploy"', '"type":"version-upload"'), records + JSON.stringify(deployed) + "\n"]) {
      output = ""; calls = 0; await writeFile(deployPath, invalid);
      assert.equal(await deploymentCheckMain(argv, ports), 2); assert.equal(calls, 0); assert.deepEqual(JSON.parse(output).failures, ["input"]);
    }
    await writeFile(deployPath, records); await writeFile(calibrationPath, "{}"); output = ""; calls = 0;
    assert.equal(await deploymentCheckMain(argv, ports), 2); assert.equal(calls, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

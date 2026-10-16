import { expect, test } from "vitest";
import { LOSS, METRIC_MAX, METRIC_POINTS, Metrics, type Metric, type MetricPoint } from "../src/metrics.ts";
import { correlated, correlation } from "../src/correlation.ts";

const context = { scope: `sc_${"a".repeat(52)}`, deployment: "metrics-test", version: "unknown", request: "abcdef0123456789", trace: "none" };
function recorder(cap = METRIC_POINTS) {
  const points: MetricPoint[] = [];
  const metrics = new Metrics(context, { writeDataPoint: point => points.push(structuredClone(point)) }, cap);
  return { metrics, points, summary: () => points.find(p => p.blobs[0] === "metric-dropped")! };
}

test("metrics-v1 keeps native end separate from public answer and writes the ten kinds without free text", () => {
  const { metrics, points } = recorder();
  const rows: Metric[] = [
    { kind: "turn", place: "acts", end: "answer", answer: "refused", reason: "scope-full", duration: 17, a: 2, b: 3, c: 1, flag: 1 },
    { kind: "turn", place: "dispatch", end: "answer", a: 0, b: 0, c: 0 },
    { kind: "route", place: "acts", end: "refused", reason: "4xx", answer: "turn", duration: 19 },
    { kind: "session", place: "sessions", end: "issued" },
    { kind: "signed-read", place: "summary", end: "refused", reason: "forbidden" },
    { kind: "join", place: "acts", end: "unavailable", reason: "rate-limited", a: 3, b: 4 },
    { kind: "dispatch", place: "dispatch", end: "ok", a: 4, b: 2, c: 1 },
    { kind: "diagnosis", place: "judged", end: "error", reason: "outside-call-failed" },
    { kind: "incident", place: "incidents", end: "error", reason: "outcome-conflict", a: 1 },
    { kind: "stream", place: "stream", end: "ok", a: 2, b: 1 },
  ];
  for (const row of rows) metrics.emit(row);
  metrics.finish(); metrics.finish();
  expect(points).toHaveLength(rows.length + 1);
  expect(new Set(points.map(p => p.blobs[0])).size).toBe(10);
  expect(points[0]!.blobs).toEqual(["turn", "metrics-test", "unknown", "acts", "answer", "scope-full", context.request, "none", "refused"]);
  expect(points[0]!.doubles).toEqual([1, 17, 2, 3, 1, 1]);
  expect(points[1]!.blobs.slice(3)).toEqual(["dispatch", "answer", "none", context.request, "none", "none"]);
  expect(points.at(-1)!.doubles).toEqual([1, 0, 0, 0, 0, 0]);
  for (const p of points) expect([p.indexes.length, p.blobs.length, p.doubles.length]).toEqual([1, 9, 6]);
});

test("tainted fields and invalid numeric domains reach only the bounded loss summary, including critical turns", () => {
  const { metrics, points, summary } = recorder();
  const secrets = ["github_pat_do_not_publish", "https://name:password@host/", "-----BEGIN PRIVATE KEY-----"];
  for (const secret of secrets) {
    metrics.emit({ kind: "turn", place: "acts", end: "busy", reason: secret });
    metrics.emit({ kind: "route", place: secret, end: "ok", reason: "2xx", answer: "pre-turn" });
  }
  for (const n of [-1, -0, NaN, Infinity, 0.1, METRIC_MAX + 1]) metrics.emit({ kind: "stream", place: "stream", end: "ok", a: n });
  metrics.emit({ kind: "turn", place: "acts", end: secrets[0]! });
  metrics.finish();
  expect(points).toHaveLength(1);
  expect(summary().doubles).toEqual([1, LOSS.tainted, 13, 4, 4, 0]);
  for (const secret of secrets) expect(JSON.stringify(points)).not.toContain(secret);
  const badTrace: MetricPoint[] = [];
  const invalid = new Metrics({ ...context, trace: secrets[0]! }, { writeDataPoint: p => badTrace.push(p) });
  invalid.emit({ kind: "stream", place: "stream", end: "ok" }); invalid.finish();
  expect(badTrace).toEqual([]);
});

test("bounded aggregation preserves every native end, sums wrote flags and records coarsening, saturation and mixed loss once", () => {
  const { metrics, points, summary } = recorder(6);
  // More than 64 distinct groups force reason, answer, then place coarsening.
  const turnPlaces = ["acts", "preparations", "found", "dispatch", "alarm"];
  const refusalReasons = ["revision-moved", "alias", "duplicate-relation", "required-unset", "scope-full", "bad-intent", "misaddressed", "expired", "scope-refused", "unknown-act", "bad-field", "no-item", "final", "fact-mismatch", "unauthorized", "guard-failed", "capability-refused", "slot-full", "type-full", "entry-too-large"];
  for (const place of turnPlaces) for (const reason of refusalReasons)
    metrics.emit({ kind: "turn", place, end: "answer", answer: "refused", reason, duration: 1, a: 1, b: 1, c: 1, flag: 1 });
  for (const place of turnPlaces) for (const answer of ["accepted", "refused", "unavailable", "mismatch", "none"])
    metrics.emit({ kind: "turn", place, end: "answer", answer, duration: 1, a: 1, b: 1, c: 1, flag: 1 });
  for (const end of ["idle", "busy", "clock-behind", "unavailable"]) for (const place of turnPlaces) metrics.emit({ kind: "turn", place, end });
  metrics.emit({ kind: "turn", place: "acts", end: "answer", a: METRIC_MAX, flag: 1 });
  metrics.emit({ kind: "turn", place: "acts", end: "answer", a: METRIC_MAX, flag: 1 });
  metrics.emit({ kind: "turn", place: "acts", end: "busy", reason: "a token is not a reason" });
  metrics.sidecar(true, true);
  for (let i = 0; i < 20; i++) metrics.emit({ kind: "route", place: "acts", end: "ok", reason: "2xx", answer: "turn" });
  metrics.finish();
  expect(points).toHaveLength(6);
  const turns = points.filter(p => p.blobs[0] === "turn");
  expect(turns.map(p => p.blobs[4]).sort()).toEqual(["answer", "busy", "clock-behind", "idle", "unavailable"]);
  const answer = turns.find(p => p.blobs[4] === "answer")!;
  expect(answer.blobs[3]).toBe("mixed"); expect(answer.blobs[5]).toBe("aggregated"); expect(answer.blobs[8]).toBe("mixed");
  expect(answer.doubles[0]).toBe(turnPlaces.length * (5 + refusalReasons.length) + 2);
  expect(answer.doubles[5]).toBe(turnPlaces.length * (5 + refusalReasons.length) + 2);
  expect(answer.doubles[2]).toBe(METRIC_MAX);
  expect(summary().doubles[1]).toBe(31);
  expect(summary().doubles[4]).toBeGreaterThanOrEqual(answer.doubles[0]!);
  expect(summary().doubles[5]).toBeGreaterThan(1);
  for (const p of points) for (const n of p.doubles) expect(Number.isInteger(n) && n >= 0 && n <= METRIC_MAX).toBe(true);
});

test("turn priority keeps native outcomes within the invocation cap and optional slow/throwing sinks are never awaited", async () => {
  const { metrics, points } = recorder();
  for (let i = 0; i < METRIC_POINTS * 2; i++) metrics.emit({ kind: "route", place: "summary", end: "ok", reason: "2xx", answer: "pre-turn" });
  for (let i = 0; i < METRIC_POINTS * 2; i++) metrics.emit({ kind: "turn", place: "alarm", end: "idle", flag: 1 });
  metrics.finish();
  expect(points).toHaveLength(METRIC_POINTS);
  expect(points[0]!.blobs[0]).toBe("turn");
  expect(points[0]!.doubles).toEqual([METRIC_POINTS * 2, 0, 0, 0, 0, METRIC_POINTS * 2]);
  expect(points.at(-1)!.blobs[0]).toBe("metric-dropped");
  for (const binding of [undefined, { writeDataPoint: () => { throw Error("private sink failure"); } }, { writeDataPoint: () => new Promise(() => {}) }, { writeDataPoint: () => Promise.reject(Error("private sink failure")) }]) {
    const sink = new Metrics(context, binding);
    sink.emit({ kind: "turn", place: "alarm", end: "unavailable" });
    expect(sink.finish()).toBeUndefined();
  }
  await Promise.resolve();
});

test("request identity is server-minted independently of strictly parsed version00 trace context and headers preserve the native body", async () => {
  const trace = "1234567890abcdef1234567890abcdef", parent = "1234567890abcdef";
  const valid = correlation(`00-${trace}-${parent}-ff`);
  expect(valid.request).toMatch(/^[0-9a-f]{16}$/); expect(valid.request).not.toBe(parent);
  expect(valid.trace).toBe(trace); expect(valid.traceparent).toMatch(new RegExp(`^00-${trace}-[0-9a-f]{16}-01$`));
  for (const header of [null, `00-${trace.toUpperCase()}-${parent}-01`, `00-${"0".repeat(32)}-${parent}-01`, `00-${trace}-${"0".repeat(16)}-01`, `00-${trace.slice(1)}-${parent}-01`, `00-${trace}-${parent}-01-vendor`, `01-${trace}-${parent}-01`]) {
    const absent = correlation(header);
    expect([absent.trace, absent.traceparent]).toEqual([null, null]);
    expect(absent.request).toMatch(/^[0-9a-f]{16}$/);
  }
  expect(correlation(`00-${trace}-${parent}-fe`).traceparent).toMatch(/-00$/);
  const bytes = '{"answer":"accepted","literal":"unchanged"}';
  const response = correlated(new Response(bytes, { status: 201, headers: { "content-type": "application/json", tracestate: "vendor=private" } }), valid);
  expect(await response.text()).toBe(bytes); expect(response.status).toBe(201);
  expect(response.headers.get("dap-request-id")).toBe(valid.request); expect(response.headers.get("tracestate")).toBeNull();
  expect(response.headers.get("traceparent")).toBe(valid.traceparent);
});

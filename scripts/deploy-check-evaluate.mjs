/** Pure Judge evaluator. Inputs are observations, never native authority. */
const KINDS = new Set(["turn", "route", "session", "signed-read", "join", "dispatch", "diagnosis", "incident", "stream", "metric-dropped"]);
const HTTP_TURNS = ["create", "acts", "preparations"];
const TURN_PLACES = new Set([...HTTP_TURNS, "rpc:create", "rpc:acts", "rpc:preparations", "alarm", "dispatch"]);
const ROUTE_PLACES = new Set([...HTTP_TURNS, "settle", "summary", "items", "query-items", "reservation-snapshot", "operations", "history", "entries", "outbox", "outboxItem", "log", "retained", "sessions", "stream", "incidents", "waiting", "credential", "site", "page", "health", "requests"]);
const TURN_ENDS = new Set(["answer", "idle", "busy", "clock-behind", "unavailable"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX = 0x7fffffff;
const integer = n => Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0;
const sum = (a, b) => { const n = a + b; if (!integer(n)) throw new Error("number"); return n; };
const product = (a, b) => { const n = a * b; if (!integer(n)) throw new Error("number"); return n; };
export const COVERAGE_GAPS = [
  "Counts cannot detect the loss of both a route and its turn, or a missing summary row.",
  "Alarm and dispatch turns have no incoming HTTP route to balance.",
  "Observations do not prove the absence of busy turns.",
];

/**
 * Each row has timeMs, _sample_interval, nine blobs and six doubles from
 * metrics-v1. The caller must obtain a complete, bounded query result.
 * p95BoundMs is supplied separately; this function claims no calibration.
 */
export function evaluateDeployment({ deployment, version, now, p95BoundMs, rows, health }) {
  const failures = [];
  const result = {
    pass: false, failures, deployment, version,
    window: { from: now - 900_000, through: now },
    coverage: "unknown", coverageReasons: [], gaps: [...COVERAGE_GAPS],
    eventCount: 0, weightedRows: 0, routeCount: 0, turnCount: 0,
    errors: 0, refusals: 0, errorRate: null, routeP95Ms: null,
    p95BoundMs: integer(p95BoundMs) ? p95BoundMs : null,
    busy: 0, newest: null, counters: {},
    httpTurns: Object.fromEntries(HTTP_TURNS.map(p => [p, { routes: 0, turns: 0 }])),
    loss: { rows: 0, turns: 0, critical: 0, mask: 0 },
    // The delivered point map does not carry SQLite rows-written totals.
    rowsWritten: null,
  };
  const fail = name => { if (!failures.includes(name)) failures.push(name); };
  const finish = () => {
    result.pass = failures.length === 0;
    result.message = result.busy > 0 ? "busy observed"
      : result.coverage === "complete" ? `no busy observed, coverage complete: ${result.turnCount} turns, no recorded loss, counts balanced, undetectable paired loss and alarm turns declared`
      : result.coverage === "incomplete" ? `no busy observed, coverage incomplete: ${result.coverageReasons.join("; ")}`
      : `no busy observed, coverage unknown: ${result.coverageReasons.join("; ") || "unavailable observations"}`;
    return result;
  };
  if (typeof deployment !== "string" || !deployment || new TextEncoder().encode(deployment).length > 128 || typeof version !== "string" || !UUID.test(version) || !integer(now)) {
    fail("input"); return finish();
  }
  if (!integer(p95BoundMs)) fail("calibration");
  if (health?.status !== 200 || health.body?.deployment !== deployment || health.body?.version !== version
      || health.body?.sessions !== "ok" || health.body?.register !== "ready") fail("health");
  if (!Array.isArray(rows) || rows.length > 50_000) { fail("query"); return finish(); }
  let sampled = false, unresolvedPlaces = false;
  const durations = [];
  try {
    for (const row of rows) {
      const b = row?.blobs, d = row?.doubles;
      if (!Array.isArray(b) || b.length !== 9 || typeof b[2] !== "string" || !integer(row.timeMs)) throw new Error("row");
      if (b[2] !== version || b[1] !== deployment || row.timeMs < result.window.from || row.timeMs > now || b[8] === "mcp-metrics-v1") continue;
      if (!b.every(v => typeof v === "string") || !Array.isArray(d) || d.length !== 6
          || !d.every(n => integer(n) && n <= MAX) || d[0] < 1
          || !integer(row._sample_interval) || row._sample_interval < 1) throw new Error("row");
      const [kind, , , place, end, , , , answer] = b;
      const weight = row._sample_interval, count = product(d[0], weight);
      sampled ||= weight > 1;
      result.eventCount = sum(result.eventCount, count);
      result.weightedRows = sum(result.weightedRows, weight);
      result.newest = Math.max(result.newest ?? 0, row.timeMs);
      if (!KINDS.has(kind)) { unresolvedPlaces = true; continue; }
      if (kind !== "metric-dropped" && d[5] > d[0]) throw new Error("flag");
      const counters = result.counters[kind] ??= { a: 0, b: 0, c: 0, flag: 0 };
      for (const [i, key] of ["a", "b", "c", "flag"].entries()) counters[key] = sum(counters[key], product(d[i + 2], weight));
      if (kind === "metric-dropped") {
        if (place !== "metrics" || end !== "dropped" || b[5] !== "summary" || answer !== "none"
            || d[0] !== 1 || d[1] > 31 || d[4] > d[3] || d[3] > d[2]) throw new Error("summary");
        result.loss.rows = sum(result.loss.rows, product(d[2], weight));
        result.loss.turns = sum(result.loss.turns, product(d[3], weight));
        result.loss.critical = sum(result.loss.critical, product(d[4], weight));
        result.loss.mask |= d[1];
      } else if (kind === "route") {
        if (d[0] !== 1 || !["ok", "refused", "error"].includes(end) || !["turn", "pre-turn"].includes(answer)) throw new Error("route");
        if (!ROUTE_PLACES.has(place)) unresolvedPlaces = true;
        if ((end === "error" && b[5] !== "5xx") || (end === "refused" && b[5] !== "4xx")
            || (end === "ok" && !["2xx", "3xx"].includes(b[5]))) throw new Error("status");
        result.routeCount = sum(result.routeCount, count);
        if (end === "error") result.errors = sum(result.errors, count);
        if (end === "refused") result.refusals = sum(result.refusals, count);
        durations.push({ duration: d[1], weight });
        if (HTTP_TURNS.includes(place) && answer === "turn") result.httpTurns[place].routes = sum(result.httpTurns[place].routes, count);
      } else if (kind === "turn") {
        result.turnCount = sum(result.turnCount, count);
        if (end === "busy") result.busy = sum(result.busy, count);
        if (!TURN_PLACES.has(place) || !TURN_ENDS.has(end)) unresolvedPlaces = true;
        if (HTTP_TURNS.includes(place)) result.httpTurns[place].turns = sum(result.httpTurns[place].turns, count);
      }
    }
  } catch { fail("query"); return finish(); }
  if (result.routeCount < 100 || result.turnCount === 0) fail("no-data");
  if (result.newest !== null && now - result.newest > 300_000) fail("stale");
  if (result.routeCount > 0) {
    result.errorRate = result.errors / result.routeCount;
    if (result.errorRate > 0.01) fail("error-rate");
    durations.sort((a, b) => a.duration - b.duration);
    const rank = Number((BigInt(result.routeCount) * 95n + 99n) / 100n);
    let seen = 0;
    for (const row of durations) { seen = sum(seen, row.weight); if (seen >= rank) { result.routeP95Ms = row.duration; break; } }
    if (integer(p95BoundMs) && result.routeP95Ms > p95BoundMs) fail("latency");
  }
  if (result.busy > 0) fail("busy");
  // A complete result says "no recorded loss"; any recorded loss prevents it.
  if (result.loss.rows > 0 || result.loss.turns > 0 || result.loss.critical > 0 || result.loss.mask !== 0) {
    result.coverage = "incomplete";
    result.coverageReasons.push(`recorded loss: ${result.loss.rows} rows, ${result.loss.turns} turns, ${result.loss.critical} critical turns, mask ${result.loss.mask}`);
  } else if (result.eventCount === 0) {
    result.coverageReasons.push("no observations");
  } else if (sampled) {
    result.coverageReasons.push("sampled window; reduce write volume or increase the dataset quota");
  } else if (unresolvedPlaces) {
    result.coverageReasons.push("insufficient kind or turn-place resolution");
  } else {
    const unbalanced = HTTP_TURNS.filter(p => result.httpTurns[p].routes !== result.httpTurns[p].turns);
    result.coverage = unbalanced.length ? "incomplete" : "complete";
    for (const place of unbalanced) result.coverageReasons.push(`${place}: ${result.httpTurns[place].routes} HTTP turns, ${result.httpTurns[place].turns} public turns`);
  }
  if (result.coverage !== "complete") fail("coverage");
  return finish();
}

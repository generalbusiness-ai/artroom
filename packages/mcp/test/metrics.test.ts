import { describe, expect, test } from "vitest";
import { custodyTransition, McpMetrics, MCP_METRIC_SCHEMA, observedFetch, type McpMetricPoint } from "../src/metrics.ts";

const good = { end: "ok", bytes: 123 };
function fixture(report?: (point: McpMetricPoint) => unknown) {
  const points: McpMetricPoint[] = [];
  return { points, metrics: new McpMetrics({ report: report ?? (p => { points.push(p); }), now: () => 100, requestId: () => "1234567890abcdef" }) };
}
describe("closed MCP operational observations", () => {
  test("concurrent calls own their actual read and page attempts", async () => {
    const { points, metrics } = fixture();
    const send = observedFetch(async () => ({ status: 200, body: null }));
    let release!: () => void;
    const held = new Promise<void>(r => { release = r; });
    const first = metrics.call("steps", async () => {
      await send("https://fixture.invalid/v1/scopes/x/history");
      await held;
      await send("https://fixture.invalid/v1/scopes/x/entries/1");
      custodyTransition(null, "prepared"); custodyTransition("prepared", "sent"); custodyTransition("sent", "sent");
      return "first";
    }, () => good);
    await Promise.resolve();
    expect(await metrics.call("room", async () => { await send("https://fixture.invalid/v1/scopes/x/sessions", { method: "POST" }); return "second"; }, () => good)).toBe("second");
    release(); expect(await first).toBe("first");
    const calls = points.filter(p => p.blobs[0] === "tool-call");
    expect(calls.map(p => [p.blobs[3], p.doubles[2], p.doubles[3]])).toEqual([["room", 1, 0], ["steps", 2, 1]]);
    expect(points.filter(p => p.blobs[0] === "custody").map(p => p.blobs[5])).toEqual(["prepared", "sent"]);
    expect(points.every(p => p.blobs[8] === MCP_METRIC_SCHEMA)).toBe(true);
  });
  test("unknown names and reasons are dropped with bounded loss instead of redacted into events", async () => {
    const { points, metrics } = fixture();
    await metrics.call("PRIVATE-TOKEN-FIXTURE", async () => { for (let i = 0; i < 300; i++) custodyTransition(null, "prepared"); return true; }, () => good);
    await metrics.call("room", async () => true, () => ({ end: "error", reason: "https://user:secret@fixture.invalid/", bytes: 1 }));
    expect(points.every(p => p.blobs[0] === "metric-dropped")).toBe(true);
    expect(points.map(p => p.doubles[2])).toEqual([301, 1]);
    expect(JSON.stringify(points)).not.toMatch(/PRIVATE|user:secret/);
    const bounded = fixture();
    await bounded.metrics.call("room", async () => { for (let i = 0; i < 300; i++) custodyTransition(null, "prepared"); return true; }, () => good);
    expect(bounded.points).toHaveLength(250);
    expect(bounded.points.at(-1)?.doubles.slice(1, 3)).toEqual([1, 52]);
    expect(bounded.points.at(-2)?.blobs[0]).toBe("tool-call");
  });
  test("absent, throwing, rejecting and pending reporters cannot replace a result or exception", async () => {
    const answer = { opaque: "native-fixture" }, fault = new Error("native fixture failure");
    for (const metrics of [new McpMetrics(), fixture(() => { throw new Error("telemetry fixture"); }).metrics,
      fixture(() => Promise.reject(new Error("telemetry fixture"))).metrics, fixture(() => new Promise(() => {})).metrics]) {
      expect(await metrics.call("room", async () => answer, () => good)).toBe(answer);
      let caught: unknown;
      try { await metrics.call("room", async () => { throw fault; }, () => good); } catch (error) { caught = error; }
      expect(caught).toBe(fault);
    }
    const formatter = fixture();
    expect(await formatter.metrics.call("room", async () => answer, () => { throw fault; })).toBe(answer);
    expect(formatter.points.map(p => p.blobs[0])).toEqual(["metric-dropped"]);
    expect(formatter.points[0]?.doubles[2]).toBe(1);
  });
  test("list observations report actual pages and whether their listed generation changed", async () => {
    const { points, metrics } = fixture();
    for (const generation of ["a", "a", "b"]) await metrics.list(async () => ({ tools: [{ name: "room" }], generation }));
    const lists = points.filter(p => p.blobs[0] === "tools-list");
    expect(lists.map(p => p.doubles[5])).toEqual([0, 0, 1]);
    expect(lists.map(p => p.doubles[2])).toEqual([1, 1, 1]);
    expect(lists[0]?.doubles[3]).toBe(new TextEncoder().encode(JSON.stringify({ tools: [{ name: "room" }] })).length);
  });
});

import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { signIntent } from "@generalbusiness/artroom-bytes";
import { grantOf } from "@generalbusiness/dap-derive/testing";
import { api, route } from "../src/worker.ts";
import { measuredRequest, operationContext, measured } from "../src/operational.ts";
import type { MetricPoint } from "../src/metrics.ts";
import { metricBindings } from "./worker.ts";
import { at, definition, creation, rita } from "./support.ts";

// Invariant: the real HTTP boundary reports actual native entry into Turns.run,
// while direct RPC cannot balance HTTP counts; correlation stays operational.
test("HTTP and direct RPC retain distinct native turn places and HTTP correlation reaches only the sidecar", async () => {
  const points: MetricPoint[] = [], settings = { DEPLOYMENT: "metrics-http-test", METRICS: { writeDataPoint: (p: MetricPoint) => points.push(structuredClone(p)) } };
  const { signed, name } = creation(), object = env.SCOPES.get(env.SCOPES.idFromName(name));
  metricBindings.set(object.id.toString(), settings);
  const trace = "abcdef0123456789abcdef0123456789";
  const response = await route(new Request("https://scope.test/v1/scopes", { method: "POST", headers: { traceparent: `00-${trace}-1234567890abcdef-ff`, tracestate: "vendor=private", "dap-request-id": "caller-controlled" }, body: JSON.stringify({ creation: signed, definition: definition.declared }) }), env.SCOPES, settings);
  const answer = await response.json<{ answer: string; receipt: { fact: { at: Parameters<typeof grantOf>[1] } } }>();
  expect([response.status, answer.answer]).toEqual([201, "accepted"]);
  const request = response.headers.get("dap-request-id")!;
  expect(request).toMatch(/^[0-9a-f]{16}$/); expect(request).not.toBe("caller-controlled");
  expect(response.headers.get("traceparent")).toMatch(new RegExp(`^00-${trace}-[0-9a-f]{16}-01$`));
  expect(response.headers.get("tracestate")).toBeNull(); expect(JSON.stringify(answer)).not.toContain(request);
  const httpTurn = points.find(p => p.blobs[0] === "turn" && p.blobs[3] === "create")!;
  expect(httpTurn.blobs.slice(4)).toEqual(["answer", "none", request, trace, "accepted"]);
  expect(points.find(p => p.blobs[0] === "route")?.blobs[8]).toBe("turn");
  expect((await api(env.SCOPES).create(signed, definition.declared)).answer).toBe("accepted");
  expect(points.some(p => p.blobs[0] === "turn" && p.blobs[3] === "rpc:create" && p.blobs[8] === "accepted")).toBe(true);
  const atScope = answer.receipt.fact.at;
  const offer = signIntent({ v: 1, to: atScope, actor: rita.key, kind: "offer", on: null, expected: { intent: 1 }, fields: { intent: 0 }, idempotencyKey: "rpc-offer", notAfter: at(60) }, rita.secret);
  expect((await api(env.SCOPES).submit(name, offer, [grantOf(rita, atScope, ["offer"])])).answer).toBe("accepted");
  expect(points.some(p => p.blobs[0] === "turn" && p.blobs[3] === "rpc:acts" && p.blobs[8] === "accepted")).toBe(true);
  const kept = await runInDurableObject(object, (_instance, state) => ({ rows: state.storage.sql.exec("SELECT request,trace,seq,duty FROM request_index ORDER BY n").toArray(), entries: state.storage.sql.exec("SELECT bytes FROM entry ORDER BY seq").toArray() }));
  expect(kept.rows).toEqual([{ request, trace, seq: 0, "duty": null }]);
  expect(JSON.stringify(kept.entries)).not.toContain(request);
  // Actual Worker early answers: invalid name, noncanonical creation,
  // the removed wrapper key, and malformed body. None is a native turn.
  for (const [path, body] of [["/v1/scopes/invalid/acts", { signed: offer, grants: [] }], ["/v1/scopes", { creation: {}, definition: {} }], ["/v1/scopes", { "founding": signed, definition: definition.declared }], ["/v1/scopes", "{"]]) {
    const before = points.length;
    const early = await route(new Request(`https://scope.test${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }), env.SCOPES, settings);
    expect(early.status).toBeGreaterThanOrEqual(400);
    expect(points.slice(before).filter(p => p.blobs[0] === "route").map(p => p.blobs[8])).toEqual(["pre-turn"]);
    expect(points.slice(before).some(p => p.blobs[0] === "turn")).toBe(false);
  }
});

// Invariant: missing RPC metadata is incomplete coverage, and concurrent
// server-owned contexts cannot lend their HTTP classification to another call.
// The binding here is an explicit RPC protocol stand-in, not a native scope.
test("missing execution metadata fails coverage and concurrent RPC work cannot borrow HTTP ingress", async () => {
  const points: MetricPoint[] = [], settings = { DEPLOYMENT: "context-test", METRICS: { writeDataPoint: (p: MetricPoint) => points.push(structuredClone(p)) } };
  const name = `sc_${"a".repeat(52)}`, seen: boolean[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const binding = { idFromName: () => name, get: () => ({ observed: async (_method: unknown, _args: unknown, _identity: unknown, http: boolean) => { seen.push(http); if (http) await held; return { value: { answer: "unavailable", reason: "unavailable" }, turn: http ? undefined : false }; } }) };
  const call = () => api(binding as never).submit(name, {} as never, []);
  const http = measuredRequest(new Request(`https://scope.test/v1/scopes/${name}/acts`), settings, async () => new Response(JSON.stringify(await call()), { status: 503 }));
  const rpc = measured(operationContext(settings, name, "other", { request: null, trace: null }), call);
  await rpc; release(); await http;
  expect(seen).toEqual([true, false]);
  expect(points.filter(p => p.blobs[0] === "route")).toEqual([]);
  const lost = points.filter(p => p.blobs[0] === "metric-dropped");
  expect(lost.some(p => (p.doubles[1]! & 2) !== 0 && p.doubles[4]! > 0)).toBe(true);
});

// Invariant: malformed or ambiguous correlation selectors never reach a
// namespace or its SQL, even if the caller supplies an authorization header.
test("request index route admission precedes every namespace lookup", async () => {
  let lookups = 0;
  const bomb = { idFromName: () => { lookups++; throw Error("Unexpected namespace lookup"); } };
  const name = `sc_${"a".repeat(52)}`;
  for (const query of ["", "request=ABCDEF0123456789", "trace=" + "0".repeat(32), "request=abcdef0123456789&trace=abcdef0123456789abcdef0123456789", "request=abcdef0123456789&request=abcdef0123456789", "request=abcdef0123456789&cursor=0.0", "request=abcdef0123456789&other=value"]) {
    const response = await route(new Request(`https://scope.test/v1/scopes/${name}/requests?${query}`, { headers: { authorization: "untrusted" } }), bomb as never);
    expect(response.status).toBe(404);
  }
  expect(lookups).toBe(0);
});

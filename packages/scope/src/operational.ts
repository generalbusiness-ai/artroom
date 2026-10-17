/** Invocation-local instrumentation. No native envelope or record carries it. */
import { AsyncLocalStorage } from "node:async_hooks";
import type { DutyId } from "@generalbusiness/dap-contract";
import { correlated, correlation, isRequestId, isTraceId } from "./correlation.ts";
import { admittedRequestUrl } from "./item-query-wire.ts";
import { isScopeId } from "@generalbusiness/artroom-bytes";
import { Metrics, type Metric, type MetricBinding } from "./metrics.ts";

export interface MetricEnvironment { METRICS?: MetricBinding; DEPLOYMENT?: string; VERSION_METADATA?: { id: string } }
export interface OperationalIdentity { request: string | null; trace: string | null }
/** Internal RPC surface only. It cannot name a driver, operator or authority method. */
export const OBSERVED_METHODS = ["create", "submit", "prepare", "settle", "summary", "items", "queryItems", "history", "entry", "outbox", "duty", "log", "retained", "session", "stream", "incidents", "waiting", "requests", "credential", "reservationSnapshot"] as const;
export type ObservedMethod = typeof OBSERVED_METHODS[number];
export const operationPlace = (method: ObservedMethod): string => ({ submit: "acts", prepare: "preparations", entry: "entries", session: "sessions", queryItems: "query-items", reservationSnapshot: "reservation-snapshot" } as Partial<Record<ObservedMethod, string>>)[method] ?? method;
interface Invocation {
  metrics: Metrics;
  users: number;
  recordEntry?: (seq: number) => boolean;
  recordDuty?: (duty: DutyId) => boolean;
}
export interface Operational {
  identity: OperationalIdentity;
  place: string;
  turn: { entered: boolean; known: boolean };
  httpPublic: boolean;
  invocation: Invocation;
  entryFailures?: { count: number };
}
const local = new AsyncLocalStorage<Operational>();
/** Promise callbacks can retain an ALS store after its invocation closes.
 * A closed collector cannot own new work or supply its request identity. */
export function operational(): Operational | undefined {
  const context = local.getStore();
  return context && context.invocation.users > 0 ? context : undefined;
}
/** Operational inputs are untrusted correlation, not reader or signer identities. */
export function operationContext(env: MetricEnvironment, scope: string | null, place: string, identity: OperationalIdentity, sidecar?: Pick<Invocation, "recordEntry" | "recordDuty">): Operational {
  const request = isRequestId(identity.request) ? identity.request : null;
  const trace = isTraceId(identity.trace) ? identity.trace : null;
  return { identity: { request, trace }, place, turn: { entered: false, known: true }, httpPublic: false, invocation: {
    metrics: new Metrics({ scope, deployment: env.DEPLOYMENT ?? "unknown", version: env.VERSION_METADATA?.id ?? "unknown", request: request ?? "none", trace: trace ?? "none" }, env.METRICS), users: 1, ...sidecar,
  } };
}
export function inOperation<T>(context: Operational, work: () => T): T { return local.run(context, work); }
function leave(context: Operational): void {
  if (--context.invocation.users === 0) context.invocation.metrics.finish();
}
/** Finish after all native background work, without awaiting a telemetry write. */
export async function measured<T>(context: Operational, work: () => Promise<T>): Promise<T> {
  return inOperation(context, async () => { try { return await work(); } finally { leave(context); } });
}
export function measuredSync<T>(context: Operational, work: () => T): T {
  return inOperation(context, () => { try { return work(); } finally { leave(context); } });
}
/** Track native waitUntil work under its own place in the same invocation. */
export function background<T>(place: "dispatch" | "alarm", work: () => Promise<T>): Promise<T> {
  const parent = operational();
  if (!parent) return work();
  parent.invocation.users++;
  const child: Operational = { ...parent, place, turn: { entered: false, known: true }, httpPublic: false };
  return inOperation(child, async () => { try { return await work(); } finally { leave(child); } });
}
/** Telemetry failures have no native error path. */
export function metric(event: Metric): void { try { operational()?.invocation.metrics.emit(event); } catch { /* best effort */ } }
export function entryCorrelation(seq: number): void {
  const context = operational();
  if (!context?.invocation.recordEntry) return;
  try { if (context.invocation.recordEntry(seq)) return; } catch { /* below */ }
  if (context.entryFailures) context.entryFailures.count++;
  else context.invocation.metrics.sidecar(true, true);
}
export function dutyCorrelation(duty: DutyId): void {
  const context = operational();
  if (!context?.invocation.recordDuty) return;
  try { if (context.invocation.recordDuty(duty)) return; } catch { /* below */ }
  context.invocation.metrics.sidecar();
}
/** A missing execution mark is a critical coverage loss, never pre-turn proof. */
export function unknownTurnMark(context: Operational): void {
  if (!context.turn.known) return;
  context.turn.known = false;
  // Invalid native end deliberately enters the existing tainted/critical loss
  // path. No invented end or free text is ever written to the dataset.
  context.invocation.metrics.emit({ kind: "turn", place: context.place, end: "unobserved" });
}

function location(request: Request): { place: string; scope: string | null } {
  if (!admittedRequestUrl(request.url)) return { place: "other", scope: null };
  const path = new URL(request.url).pathname, parts = path.split("/");
  if (parts[1] === "v1" && parts[2] === "scopes") {
    if (!parts[3]) return { place: "create", scope: null };
    let scope: string | null = null;
    try { const decoded = decodeURIComponent(parts[3]); if (isScopeId(decoded)) scope = decoded; } catch { /* invalid name, no free text */ }
    const route = parts[4] || "summary";
    const place = route === "outbox" && parts[5] ? "duty" : ["acts", "preparations", "settle", "summary", "items", "query-items", "reservation-snapshot", "history", "entries", "outbox", "log", "retained", "sessions", "stream", "incidents", "waiting", "requests", "credential"].includes(route) ? route : "other";
    return { place, scope };
  }
  if (parts[1] === "health" && parts.length === 2) return { place: "health", scope: null };
  if (parts[1] === "site") return { place: "site", scope: isScopeId(parts[2]) ? parts[2] : null };
  if (["page", "brand", "counting", "lending"].includes(parts[1] ?? "")) return { place: "page", scope: null };
  return { place: "other", scope: null };
}
/** One incoming HTTP invocation, including routes that answer before a turn. */
export async function measuredRequest(request: Request, env: MetricEnvironment, serve: () => Promise<Response>): Promise<Response> {
  if (operational()) return serve();
  const identity = correlation(request.headers.get("traceparent")), where = location(request);
  const context = operationContext(env, where.scope, where.place, identity), started = performance.now();
  context.httpPublic = ["create", "acts", "preparations"].includes(where.place);
  return measured(context, async () => {
    const response = await serve(), status = response.status, statusClass = `${Math.floor(status / 100)}xx`;
    metric({ kind: "route", place: where.place, end: status < 400 ? "ok" : status < 500 ? "refused" : "error", reason: statusClass, answer: !context.turn.known ? "unobserved" : context.turn.entered ? "turn" : "pre-turn", duration: Math.max(0, Math.floor(performance.now() - started)) });
    return correlated(response, identity);
  });
}

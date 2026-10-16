/** Operational metrics-v1. Nothing here is an input to a native decision. */
import { isScopeId, utf8 } from "@generalbusiness/artroom-bytes";
import type { MismatchReason, ReadRefusal, RefusalReason, SessionRefusal, UnavailableReason } from "@generalbusiness/dap-contract";

/** Cloudflare Analytics Engine: 250 data points per invocation (2026-10-16). */
export const METRIC_POINTS = 250;
export const METRIC_MAX = 0x7fffffff;
export const METRIC_GROUPS = 64;
export const LOSS = { budget: 1, tainted: 2, groups: 4, sidecar: 8, overflow: 16 } as const;
export const METRIC_KINDS = ["turn", "route", "session", "signed-read", "join", "dispatch", "diagnosis", "incident", "stream", "metric-dropped"] as const;
type Kind = typeof METRIC_KINDS[number];
const ENDS = ["answer", "idle", "busy", "clock-behind", "unavailable"] as const;
const ANSWERS = ["accepted", "refused", "unavailable", "mismatch", "none", "mixed"];
export const STEPS = ["retained-replies", "owner", "judged"] as const;
export const EVENTS = ["outside-call-failed", "outside-replies-failed", "outside-recovery-failed"] as const;
export const METRIC_PLACES = ["found", "acts", "preparations", "rpc:found", "rpc:acts", "rpc:preparations", "settle", "summary", "items", "query-items", "reservation-snapshot", "operations", "history", "entries", "outbox", "duty", "log", "retained", "sessions", "stream", "incidents", "waiting", "credential", "site", "page", "health", "requests", "alarm", "dispatch", "metrics", "mixed", "other", ...STEPS] as const;
// An exhaustive union makes a new contract reason an explicit schema decision.
const REASONS: Record<RefusalReason | UnavailableReason | MismatchReason | ReadRefusal | SessionRefusal, true> = {
  "revision-moved": true, alias: true, "duplicate-relation": true, "required-unset": true, "scope-full": true,
  "bad-intent": true, misaddressed: true, expired: true, "scope-refused": true, "unknown-act": true, "bad-field": true,
  "no-item": true, final: true, "fact-mismatch": true, unauthorized: true, "guard-failed": true, "capability-refused": true,
  "slot-full": true, "type-full": true, "entry-too-large": true, "send-unresolved": true, "unknown-message": true,
  "unsupported-definition": true, "bad-input": true, "dependency-unavailable": true, busy: true, "clock-behind": true,
  "scope-provisional": true, "guard-incomplete": true, "authority-unavailable": true, unavailable: true,
  "rate-limited": true, "idempotency-mismatch": true, "not-found": true, "wrong-incarnation": true, forbidden: true,
  "history-unavailable": true, "too-large": true, "sessions-unavailable": true, "bad-request": true, replayed: true,
};
const INCIDENTS = ["outcome-conflict", "ref-mismatch", "incarnation-conflict", "pin-confirm-no-pin", "unpin-never-admitted", "token-unowned", "branch-moved", "bad-input", "sent-again"];
const reasons = new Set([...Object.keys(REASONS), ...EVENTS, ...INCIDENTS, "2xx", "3xx", "4xx", "5xx", "aggregated", "summary", "none"]);
const places = new Set<string>(METRIC_PLACES);
const kinds = new Set<string>(METRIC_KINDS);
const ends = new Set<string>(ENDS);
const integer = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && !Object.is(n, -0) && n >= 0 && n <= METRIC_MAX;
const requestId = (s: unknown): s is string => typeof s === "string" && /^(?:[0-9a-f]{16}|none|mixed)$/.test(s);
const traceId = (s: unknown): s is string => typeof s === "string" && /^(?:[0-9a-f]{32}|none|mixed)$/.test(s);

export interface MetricContext { scope: string | null; deployment: string; version: string; request: string; trace: string }
/** Untrusted at runtime: validation happens before retaining any caller-supplied string. */
export interface Metric { kind: Exclude<Kind, "metric-dropped">; place: string; end: string; reason?: string; answer?: string; duration?: number; a?: number; b?: number; c?: number; flag?: number }
export interface MetricPoint { indexes: string[]; blobs: string[]; doubles: number[] }
export interface MetricBinding { writeDataPoint(point: MetricPoint): unknown }
interface Row { point: MetricPoint; lost: number; criticalLost: number; critical: number }

function valid(point: MetricPoint): boolean {
  const b = point.blobs, d = point.doubles, kind = b[0];
  if (b.length !== 9 || d.length !== 6 || point.indexes.length > 1 || point.indexes.some(s => !isScopeId(s))
    || !kind || !kinds.has(kind) || !b[1] || utf8(b[1]).length > 128
    || !/^(?:unknown|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(b[2] ?? "")
    || !places.has(b[3] ?? "") || !reasons.has(b[5] ?? "") || !requestId(b[6]) || !traceId(b[7])
    || !d.every(integer) || d[0]! < 1) return false;
  const [count, duration, a, c, e, flag] = d as [number, number, number, number, number, number];
  if (kind === "metric-dropped") return b[3] === "metrics" && b[4] === "dropped" && b[5] === "summary" && b[8] === "none" && count === 1 && duration <= 31 && c <= a && e <= c;
  if (flag > count) return false;
  if (kind === "turn") return ["found", "acts", "preparations", "rpc:found", "rpc:acts", "rpc:preparations", "alarm", "dispatch", "mixed"].includes(b[3]!) && ends.has(b[4] ?? "") && ANSWERS.includes(b[8] ?? "") && (b[4] === "answer" || b[8] === "none");
  if (count !== 1) return false;
  switch (kind) {
    case "route": return ["ok", "refused", "error"].includes(b[4]!) && ["2xx", "3xx", "4xx", "5xx"].includes(b[5]!) && ["turn", "pre-turn"].includes(b[8]!) && a === 0 && c === 0 && e === 0 && flag === 0;
    case "session": return b[3] === "sessions" && ["issued", "refused"].includes(b[4]!) && duration === 0 && a === 0 && c === 0 && e === 0 && flag === 0 && b[8] === "none";
    case "signed-read": return ["ok", "refused"].includes(b[4]!) && duration === 0 && a === 0 && c === 0 && e === 0 && flag === 0 && b[8] === "none";
    case "join": return b[3] === "acts" && ["served", "refused", "unavailable"].includes(b[4]!) && ["rate-limited", "busy", "none"].includes(b[5]!) && duration === 0 && e === 0 && flag === 0 && b[8] === "none";
    case "dispatch": return b[3] === "dispatch" && b[4] === "ok" && b[5] === "none" && duration === 0 && flag === 0 && b[8] === "none";
    case "diagnosis": return b[4] === "error" && (EVENTS as readonly string[]).includes(b[5]!) && duration === 0 && a === 0 && c === 0 && e === 0 && flag === 0 && b[8] === "none";
    case "incident": return b[3] === "incidents" && b[4] === "error" && INCIDENTS.includes(b[5]!) && duration === 0 && a === 1 && c === 0 && e === 0 && flag === 0 && b[8] === "none";
    case "stream": return b[3] === "stream" && b[4] === "ok" && b[5] === "none" && duration === 0 && e === 0 && flag === 0 && b[8] === "none";
    default: return false;
  }
}

/** One instance per invocation; bounded rows, a single finish, no awaited sink. */
export class Metrics {
  readonly #context: MetricContext;
  readonly #binding: MetricBinding | undefined;
  readonly #budget: number;
  #turns = new Map<string, Row>();
  #routes: Row[] = [];
  #rest: Row[] = [];
  #coarse = 0;
  #mask = 0;
  #lost = 0;
  #lostTurns = 0;
  #lostCritical = 0;
  #merged = 0;
  #finished = false;
  constructor(context: MetricContext, binding?: MetricBinding, cap = METRIC_POINTS) {
    this.#context = { ...context };
    this.#binding = binding;
    // Five native ends must still fit, plus the terminal summary.
    this.#budget = Number.isInteger(cap) && cap >= 6 && cap <= METRIC_POINTS ? cap - 1 : METRIC_POINTS - 1;
  }
  scope(scope: string): void { if (isScopeId(scope)) this.#context.scope = scope; }
  #sum(a: number, b: number): number { if (a + b <= METRIC_MAX) return a + b; this.#mask |= LOSS.overflow; return METRIC_MAX; }
  #point(event: Metric): MetricPoint {
    const c = this.#context;
    return { indexes: c.scope === null ? [] : [c.scope], blobs: [event.kind, c.deployment, c.version, event.place, event.end, event.reason ?? "none", c.request, c.trace, event.answer ?? "none"], doubles: [1, event.duration ?? 0, event.a ?? 0, event.b ?? 0, event.c ?? 0, event.flag ?? 0] };
  }
  #loss(row: Row, bit: number): void {
    this.#mask |= bit;
    const n = row.point.doubles[0]!;
    this.#lost = this.#sum(this.#lost, n - row.lost);
    if (row.point.blobs[0] === "turn") {
      this.#lostTurns = this.#sum(this.#lostTurns, n - row.lost);
      this.#lostCritical = this.#sum(this.#lostCritical, row.critical - row.criticalLost);
    }
    row.lost = n; row.criticalLost = row.critical;
  }
  #key(row: Row): string { return JSON.stringify([row.point.blobs[3], row.point.blobs[4], row.point.blobs[8], row.point.blobs[5]]); }
  #coarsenRow(row: Row): void {
    if (this.#coarse >= 1) row.point.blobs[5] = "aggregated";
    if (this.#coarse >= 2 && row.point.blobs[4] === "answer") row.point.blobs[8] = "mixed";
    if (this.#coarse >= 3) row.point.blobs[3] = "mixed";
  }
  #merge(a: Row, b: Row, coarsened = false): Row {
    if (coarsened) { this.#loss(a, LOSS.groups); this.#loss(b, LOSS.groups); }
    const saturated = a.point.doubles.some((n, i) => n + b.point.doubles[i]! > METRIC_MAX);
    for (let i = 0; i < 6; i++) a.point.doubles[i] = this.#sum(a.point.doubles[i]!, b.point.doubles[i]!);
    for (const i of [6, 7]) if (a.point.blobs[i] !== b.point.blobs[i]) a.point.blobs[i] = "mixed";
    a.lost = this.#sum(a.lost, b.lost);
    a.criticalLost = this.#sum(a.criticalLost, b.criticalLost);
    a.critical = this.#sum(a.critical, b.critical);
    if (saturated) {
      this.#loss(a, LOSS.overflow);
      a.critical = a.point.doubles[0]!;
      this.#lostCritical = this.#sum(this.#lostCritical, a.critical - a.criticalLost);
      a.criticalLost = a.critical;
    }
    return a;
  }
  #reduce(limit: number): void {
    while (this.#turns.size > limit && this.#coarse < 3) {
      this.#coarse++;
      const before = this.#turns.size, next = new Map<string, Row>();
      for (const row of this.#turns.values()) {
        this.#coarsenRow(row);
        const key = this.#key(row), old = next.get(key);
        next.set(key, old ? this.#merge(old, row, true) : row);
      }
      this.#turns = next;
      this.#merged = this.#sum(this.#merged, before - next.size);
    }
  }
  emit(event: Metric): void {
    if (this.#finished) return;
    const point = this.#point(event), isTurn = event.kind === "turn";
    const critical = isTurn && (!ends.has(event.end) || ["busy", "clock-behind", "unavailable"].includes(event.end)) ? 1 : 0;
    const row: Row = { point, lost: 0, criticalLost: 0, critical };
    if (!valid(point)) { this.#loss(row, LOSS.tainted); return; }
    if (isTurn) {
      this.#coarsenRow(row);
      const key = this.#key(row), old = this.#turns.get(key);
      this.#turns.set(key, old ? this.#merge(old, row, this.#coarse > 0) : row);
      this.#reduce(METRIC_GROUPS);
    } else {
      const rows = event.kind === "route" ? this.#routes : this.#rest;
      if (rows.length < this.#budget) rows.push(row); else this.#loss(row, LOSS.budget);
    }
  }
  /** A failed operational sidecar loses correlation, never a native fact. */
  sidecar(turn = false, critical = false, count = 1): void {
    if (this.#finished || !integer(count) || count === 0) return;
    this.#mask |= LOSS.sidecar;
    this.#lost = this.#sum(this.#lost, count);
    // Several missing entry-index rows may belong to one native turn.
    if (turn) this.#lostTurns = this.#sum(this.#lostTurns, 1);
    if (turn && critical) this.#lostCritical = this.#sum(this.#lostCritical, 1);
  }
  #write(point: MetricPoint): void {
    try {
      const result = this.#binding?.writeDataPoint(point);
      // Scripted async bindings may fail or never finish; neither owns the reply.
      if (result instanceof Promise) void result.catch(() => undefined);
    } catch { /* best effort; a terminal row cannot prove its own presence */ }
  }
  finish(): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#reduce(this.#budget);
    let n = 0;
    for (const row of [...this.#turns.values(), ...this.#routes, ...this.#rest]) {
      if (n++ < this.#budget) this.#write(row.point); else this.#loss(row, LOSS.budget);
    }
    const summary = this.#point({ kind: "dispatch", place: "metrics", end: "dropped", reason: "summary" });
    summary.blobs[0] = "metric-dropped";
    summary.doubles = [1, this.#mask, this.#lost, this.#lostTurns, this.#lostCritical, this.#merged];
    // Only constants and checked counters reach this fallback; invalid context
    // must not leak through the summary either.
    if (valid(summary)) this.#write(summary);
  }
}

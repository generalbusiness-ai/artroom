/** Closed operational MCP observations. No metric is a native input. */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Fetch } from "@generalbusiness/artroom-client";
import type { MismatchReason, ReadRefusal, RefusalReason, SessionRefusal, UnavailableReason } from "@generalbusiness/dap-contract";
import type { Phase } from "./custody.ts";

export const MCP_METRIC_SCHEMA = "mcp-metrics-v1";
const MAX = 0x7fffffff;
const TOOLS = new Set(["list", "room", "inspect", "create", "join", "prepare", "items", "steps", "step", "record", "sends", "text", "wait", "settle", "credential", "actions", "act", "enrol"]);
const PHASES = new Set(["prepared", "sent", "unknown", "accepted", "refused", "mismatch", "settled"]);
const NATIVE: Record<RefusalReason | UnavailableReason | MismatchReason | ReadRefusal | SessionRefusal, true> = {
  "revision-moved": true, alias: true, "duplicate-relation": true, "required-unset": true, "scope-full": true,
  "bad-intent": true, misaddressed: true, expired: true, "scope-refused": true, "unknown-act": true, "bad-field": true,
  "no-item": true, final: true, "fact-mismatch": true, unauthorized: true, "guard-failed": true, "capability-refused": true,
  "slot-full": true, "type-full": true, "entry-too-large": true, "send-unresolved": true, "unknown-message": true,
  "unsupported-definition": true, "bad-input": true, "dependency-unavailable": true, busy: true, "clock-behind": true,
  "scope-provisional": true, "guard-incomplete": true, "authority-unavailable": true, unavailable: true,
  "rate-limited": true, "idempotency-mismatch": true, "not-found": true, "wrong-incarnation": true, forbidden: true,
  "history-unavailable": true, "too-large": true, "sessions-unavailable": true, "bad-request": true, replayed: true,
};
const REASONS = new Set([...Object.keys(NATIVE), ...PHASES, "none", "exception", "shape", "stale-descriptor", "restart", "transport", "custody", "credential", "target", "unknown-tool", "read", "conflicting", "full", "locked", "unreadable", "terminal", "unkept"]);
const ENDS = new Set(["ok", "refused", "error", "unavailable"]);
const integer = (n: number): boolean => Number.isInteger(n) && !Object.is(n, -0) && n >= 0 && n <= MAX;
const uuid = (s: string): boolean => /^(?:unknown|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(s);
export interface McpMetricPoint { indexes: string[]; blobs: string[]; doubles: number[] }
export interface McpMetricOptions {
  report?: (point: McpMetricPoint) => unknown;
  deployment?: string;
  version?: string;
  now?: () => number;
  requestId?: () => string;
}
export interface McpOutcome { end: string; reason?: string; bytes: number }
interface Operation {
  open: boolean; tool: string | null; deployment: string; version: string; request: string;
  reads: number; pages: number; mask: number; lost: number; points: McpMetricPoint[];
}
const local = new AsyncLocalStorage<Operation>();
const active = (): Operation | undefined => { const op = local.getStore(); return op?.open ? op : undefined; };
function lost(op: Operation, mask = 2): void { op.mask |= mask; if (op.lost < MAX) op.lost++; else op.mask |= 16; }
function emit(op: Operation, kind: "tools-list" | "tool-call" | "custody", end: string, reason: string, numbers: number[], terminal = false): void {
  if (!op.tool || !ENDS.has(end) || !REASONS.has(reason) || numbers.length !== 5 || !numbers.every(integer)) { lost(op); return; }
  if (op.points.length >= (terminal ? 249 : 248)) { lost(op, 1); return; }
  op.points.push({ indexes: [], blobs: [kind, op.deployment, op.version, op.tool, end, reason, op.request, "none", MCP_METRIC_SCHEMA], doubles: [1, ...numbers] });
}
/** Called only after a successful persisted write, with the previous phase captured before mutation. */
export function custodyTransition(from: Phase | null, to: Phase): void {
  try { const op = active(); if (op && from !== to) { if (!PHASES.has(to)) lost(op); else emit(op, "custody", "ok", to, [0, 0, 0, 0, 0]); } } catch { /* observations never own a write */ }
}
/** One attempted operational read; direct hosted authority reads use this too. */
export function mcpRead(page = false): void {
  try {
    const op = active(); if (!op) return;
    if (op.reads < MAX) op.reads++; else lost(op, 16);
    if (page) { if (op.pages < MAX) op.pages++; else lost(op, 16); }
  } catch { /* no native error path */ }
}
/** Count actual attempts, including a session request or signed-read fallback; never consume a body. */
export function observedFetch(original: Fetch): Fetch {
  return (url, init) => {
    try {
      const op = active();
      if (op) {
        const route = new URL(url).pathname.split("/").at(-1), method = init?.method ?? "GET";
        if (method === "GET" || (method === "POST" && route === "sessions")) {
          mcpRead(["items", "history", "outbox", "log", "retained"].includes(route ?? ""));
        }
      }
    } catch { const op = active(); if (op) lost(op); }
    return original(url, init);
  };
}

export class McpMetrics {
  readonly #options: McpMetricOptions;
  #generation: string | null = null;
  constructor(options: McpMetricOptions = {}) { this.#options = { ...options }; }
  get enabled(): boolean { return typeof this.#options.report === "function"; }
  #clock(): number { try { return (this.#options.now ?? Date.now)(); } catch { return NaN; } }
  #context(tool: string): Operation {
    let request = "none";
    try { request = this.#options.requestId?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, "0")).join(""); } catch { /* none */ }
    const deployment = this.#options.deployment ?? "local", version = this.#options.version ?? "unknown";
    const valid = deployment.length > 0 && new TextEncoder().encode(deployment).length <= 128 && uuid(version) && /^(?:none|[0-9a-f]{16})$/.test(request);
    return { open: true, tool: valid && TOOLS.has(tool) ? tool : null, deployment: valid ? deployment : "unknown", version: valid ? version : "unknown", request: valid ? request : "none", reads: 0, pages: 0, mask: 0, lost: 0, points: [] };
  }
  #flush(op: Operation): void {
    op.open = false;
    const summary: McpMetricPoint = { indexes: [], blobs: ["metric-dropped", op.deployment, op.version, "list", "dropped", "summary", op.request, "none", MCP_METRIC_SCHEMA], doubles: [1, op.mask, op.lost, 0, 0, 0] };
    for (const point of [...op.points, summary]) {
      try { const result = this.#options.report?.(point); void Promise.resolve(result).catch(() => {}); } catch { /* no awaited or native error path */ }
    }
  }
  #run<T>(tool: string, kind: "tools-list" | "tool-call", work: () => Promise<T>, describe: (value: T) => { end: string; reason?: string; numbers: number[] }, failure?: (error: unknown) => Pick<McpOutcome, "end" | "reason">): Promise<T> {
    if (!this.enabled) return work();
    let op: Operation;
    try { op = this.#context(tool); } catch { return work(); }
    const start = this.#clock();
    return local.run(op, async () => {
      let outcome: { end: string; reason: string; numbers: number[] } | null = { end: "error", reason: "exception", numbers: [0, 0, 0, 0] };
      try {
        const value = await work();
        try { const got = describe(value); outcome = { end: got.end, reason: got.reason ?? "none", numbers: got.numbers }; } catch { lost(op); outcome = null; }
        return value;
      } catch (error) {
        if (failure) { try { const got = failure(error); outcome = { end: got.end, reason: got.reason ?? "none", numbers: [0, 0, 0, 0] }; } catch { lost(op); outcome = null; } }
        throw error;
      } finally {
        try { if (outcome) emit(op, kind, outcome.end, outcome.reason, [this.#clock() - start, ...outcome.numbers], true); } catch { lost(op); }
        this.#flush(op);
      }
    });
  }
  call<T>(tool: string, work: () => Promise<T>, describe: (value: T) => McpOutcome): Promise<T> {
    return this.#run(tool, "tool-call", work, value => { const outcome = describe(value); const op = active()!; return { ...outcome, numbers: [op.reads, op.pages, outcome.bytes, 0] }; });
  }
  list<T extends { tools: readonly unknown[]; generation: string; nextCursor?: string }>(work: () => Promise<T>, failure?: (error: unknown) => Pick<McpOutcome, "end" | "reason">): Promise<T> {
    return this.#run("list", "tools-list", work, page => {
      const changed = this.#generation !== null && this.#generation !== page.generation;
      this.#generation = page.generation;
      const bytes = new TextEncoder().encode(JSON.stringify({ tools: page.tools, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) })).length;
      return { end: "ok", numbers: [page.tools.length, bytes, active()!.reads, changed ? 1 : 0] };
    }, failure);
  }
}

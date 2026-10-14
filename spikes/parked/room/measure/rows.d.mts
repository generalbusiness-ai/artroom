// Types for rows.mjs: Durable Object rows written and read, from Cloudflare's billing datasets.

export interface Namespace {
  readonly id: string;
  readonly name: string;
  readonly className: string;
  readonly script: string;
}

export interface ObjectRows {
  readonly namespaceId: string;
  readonly namespace: string;
  readonly className: string;
  readonly objectId: string;
  readonly name: string;
  readonly rowsWritten: number;
  readonly rowsRead: number;
  readonly requests: number;
  readonly periodicSamples: number;
}

export interface WorkerRows {
  readonly worker: string;
  readonly from: string;
  readonly to: string;
  readonly namespaces: readonly Namespace[];
  readonly objects: readonly ObjectRows[];
  readonly totalRowsWritten: number;
  readonly totalRowsRead: number;
  readonly totalRequests: number;
  /** The first sample start queried: a minute before `from` (sampleQueryStart). */
  readonly sampledFrom: string;
}

export interface Budget {
  readonly maxRowsWritten: number;
  readonly maxRowsWrittenPerObject: number;
}

export type GateState = "pass" | "violation" | "incomplete";

export interface Decision {
  readonly state: GateState;
  readonly failures: readonly string[];
}

export interface OutputObject {
  readonly className: string;
  readonly object: string;
  readonly objectId: string;
  readonly rowsWritten: number;
  readonly rowsRead: number;
  readonly requests: number;
  readonly periodicSamples: number;
}

export interface GateResult extends Decision {
  readonly worker: string;
  readonly from: string;
  readonly to: string;
  readonly budget: Budget;
  readonly sampledFrom?: string;
  readonly totalRowsWritten?: number;
  readonly totalRowsRead?: number;
  readonly totalRequests?: number;
  readonly namespaces?: readonly { readonly id: string; readonly name: string; readonly className: string }[];
  readonly objects?: readonly OutputObject[];
}

export interface Window {
  readonly name: string;
  readonly kind: "act" | "setup" | "idle" | "quiet";
  readonly room?: string;
  readonly from: string;
  readonly to: string;
  readonly note?: string;
}

export interface Sample {
  readonly className: string;
  readonly objectId: string;
  readonly name: string;
  /** The start of the sample's interval. */
  readonly t: string;
  readonly rowsWritten: number;
  readonly rowsRead: number;
}

export interface MinuteInvocations {
  readonly className: string;
  readonly objectId: string;
  readonly minute: string;
  readonly requests: number;
}

export interface Samples {
  readonly worker: string;
  readonly from: string;
  readonly to: string;
  readonly sampledFrom: string;
  readonly namespaces: readonly { readonly id: string; readonly name: string; readonly className: string }[];
  readonly samples: readonly Sample[];
  readonly invocations: readonly MinuteInvocations[];
}

export interface TableRow {
  readonly window: string;
  readonly kind: string;
  readonly from: string;
  readonly to: string;
  readonly samples: number;
  readonly roomWritten: number;
  readonly roomRead: number;
  readonly baselineWritten: number | null;
  readonly baselineRead: number | null;
  readonly actWritten: number | null;
  readonly actRead: number | null;
  readonly roomInvocationsPerMinute: number | null;
  /** Where the baseline came from: the run's quiet control windows, or the smallest sample in the window. */
  readonly baseline: "quiet controls" | "smallest sample in the window";
  readonly registryWritten: number;
  readonly registryRead: number;
  readonly publisherWritten: number;
  readonly publisherRead: number;
  readonly otherWritten: number;
  readonly note?: string;
  readonly caution?: string;
}

type Fetch = typeof fetch;

export declare const SPIKE_ACCOUNT: string;
export declare const SPIKE_WORKER: string;
export declare const REQUIRED_CLASSES: Readonly<Record<string, readonly string[]>>;
export declare const HEADROOM: { readonly smoke: number; readonly hourly: number };
export declare const SMOKE_BUDGET: Budget;
export declare const HOURLY_BUDGET: Budget;
export declare const SETTLE_MS: number;
export declare const ROW_LIMIT: number;
export declare const PERIODIC_QUERY: string;
export declare const INVOCATIONS_QUERY: string;
export declare const MINUTE_INVOCATIONS_QUERY: string;
export declare const SAMPLE_LOOKBACK_MS: number;

export function workerNamespaces(input: { accountId: string; token: string; worker: string; fetchImpl?: Fetch }): Promise<Namespace[]>;
export function queryWorkerRows(input: {
  accountId: string;
  token: string | null;
  worker: string;
  from: string;
  to: string;
  required?: readonly string[];
  fetchImpl?: Fetch;
}): Promise<WorkerRows>;
export function evaluateRows(report: WorkerRows, budget: Budget): Decision;
export function reportForOutput(report: WorkerRows): Omit<GateResult, keyof Decision | "budget">;
export function rowGate(input: { accountId: string; token: string | null; worker: string; from: string; to: string; budget?: Budget; fetchImpl?: Fetch }): Promise<GateResult>;
export function safeMessage(e: unknown, token: string | null | undefined, limit?: number): string;
export function sampleQueryStart(from: string): string;
export function morePages(page: number, result: readonly unknown[], info: { readonly total_pages?: unknown } | null | undefined, perPage?: number): boolean;
export function gateOk(gate: { readonly state?: string | undefined } | null | undefined): boolean;
export function gateOptions(env?: Record<string, string | undefined>): { run: false; reason: string } | { run: true; token: string; accountId: string };
export function windowEndAfterSettle(ms: number, wait?: (ms: number) => Promise<void>, now?: () => Date): Promise<string>;
export declare const SAMPLES_QUERY: string;
export function querySamples(input: { accountId: string; token: string | null; worker: string; from: string; to: string; required?: readonly string[]; fetchImpl?: Fetch }): Promise<Samples>;
export function windowTable(windows: readonly Window[], samples: Pick<Samples, "samples" | "invocations">, room: string): TableRow[];
export function windowTableMarkdown(rows: readonly TableRow[]): string;
export function checkOptions(args: readonly string[], now?: number): { worker: string; from: string; to: string; budget: Budget };
export function sendAlert(webhook: string, payload: unknown, fetchImpl?: Fetch): Promise<void>;
export function check(args: readonly string[], env?: Record<string, string | undefined>, fetchImpl?: Fetch): Promise<number>;

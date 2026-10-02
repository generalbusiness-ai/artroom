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
  readonly provisional?: boolean;
  readonly totalRowsWritten?: number;
  readonly totalRowsRead?: number;
  readonly totalRequests?: number;
  readonly namespaces?: readonly { readonly id: string; readonly name: string; readonly className: string }[];
  readonly objects?: readonly OutputObject[];
}

export interface Window {
  readonly name: string;
  readonly kind: "act" | "publication" | "setup" | "idle";
  readonly from: string;
  readonly to: string;
  readonly note?: string;
}

export interface TableRow {
  readonly window: string;
  readonly kind: string;
  readonly from: string;
  readonly to: string;
  readonly state: string;
  readonly roomWritten: number;
  readonly roomRead: number;
  readonly registryWritten: number;
  readonly registryRead: number;
  readonly publisherWritten: number;
  readonly publisherRead: number;
  readonly otherWritten: number;
  readonly note?: string;
  readonly failures?: readonly string[];
}

type Fetch = typeof fetch;

export declare const SPIKE_ACCOUNT: string;
export declare const SPIKE_WORKER: string;
export declare const REQUIRED_CLASSES: Readonly<Record<string, readonly string[]>>;
export declare const PROVISIONAL_BUDGET: Budget;
export declare const SETTLE_MS: number;
export declare const ROW_LIMIT: number;
export declare const STORAGE_QUERY: string;

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
export function gateOk(gate: { readonly state?: string | undefined } | null | undefined): boolean;
export function gateOptions(env?: Record<string, string | undefined>): { run: false; reason: string } | { run: true; token: string; accountId: string };
export function windowEndAfterSettle(ms: number, wait?: (ms: number) => Promise<void>, now?: () => Date): Promise<string>;
export function rowTable(windows: readonly Window[], reports: readonly Partial<GateResult>[], room: string): TableRow[];
export function rowTableMarkdown(rows: readonly TableRow[]): string;
export function checkOptions(args: readonly string[], now?: number): { worker: string; from: string; to: string; budget: Budget };
export function sendAlert(webhook: string, payload: unknown, fetchImpl?: Fetch): Promise<void>;
export function check(args: readonly string[], env?: Record<string, string | undefined>, fetchImpl?: Fetch): Promise<number>;

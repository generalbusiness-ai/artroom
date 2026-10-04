// Types for cleanup.mjs, the cleanup rules shared by spike-smoke.mjs and mcp-stage0.mjs.

export type Outcome = "done" | "refused" | "unknown";

export interface Answer {
  readonly success?: unknown;
  readonly result?: unknown;
  readonly result_info?: { readonly total_count?: unknown };
  readonly errors?: unknown;
}

export interface Duty {
  readonly duty: string;
  readonly outcome: Outcome;
  readonly repo?: string;
  readonly repos?: readonly string[];
  readonly token?: string;
  readonly meta?: Record<string, unknown>;
  readonly detail?: string;
}

export interface CleanupOutcome {
  readonly ok: boolean;
  readonly duties: readonly Duty[];
  readonly unresolved: readonly Duty[];
  readonly reposLeft: readonly string[] | null;
}

export type Api = (method: string, path: string, body?: unknown) => Promise<Answer | undefined>;

export declare const REPO_PAGE: number;
export declare const TOKEN_PAGE: number;
export function outcomeOf(answer: Answer | null | undefined): Outcome;
export function isRepoRecord(r: unknown): boolean;
export function isTokenRecord(t: unknown): boolean;
export function readListing(
  answer: Answer | null | undefined,
  page: number,
  usable: (record: unknown) => boolean,
): { readonly outcome: Outcome; readonly items: unknown[] | null; readonly detail?: string };
export function cleanupRun(opts: { api: Api; canonical: string | null; expected?: readonly string[]; minted?: Map<string, string>; incarnations?: boolean }): Promise<CleanupOutcome>;
export function incarnationOf(base: string, names: readonly string[]): string | null;
export function smokeOk(result: { readonly steps: readonly { readonly ok: boolean }[]; readonly cleanup?: { readonly ok: boolean } | null }, failed: boolean): boolean;

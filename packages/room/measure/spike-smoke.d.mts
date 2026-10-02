// Types for the parts of spike-smoke.mjs that test/node/spike-smoke.test.ts imports.

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
  readonly error?: string;
}

export type Api = (method: string, path: string, body?: unknown) => Promise<Answer | undefined>;

export function outcomeOf(answer: Answer | null | undefined): Outcome;
export function completeListing(answer: Answer | null | undefined, page: number): unknown[] | null;
export function cleanupRun(opts: { api: Api; canonical: string | null; expected?: readonly string[]; minted?: Map<string, string> }): Promise<CleanupOutcome>;
export function smokeOk(result: { readonly steps: readonly { readonly ok: boolean }[]; readonly cleanup?: { readonly ok: boolean } | null }, failed: boolean): boolean;

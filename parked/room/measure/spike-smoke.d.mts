// Types for the parts of spike-smoke.mjs that test/node/spike-smoke.cases.ts imports: the cleanup rules, re-exported from cleanup.mjs.

export * from "./cleanup.mjs";

import type { CleanupOutcome, Duty } from "./cleanup.mjs";

/** One cleanup outcome from several, each with its namespace. */
export function combineCleanups(
  releases: Record<string, unknown>,
  parts: readonly (readonly [string, CleanupOutcome])[],
): { readonly releases: Record<string, unknown>; readonly ok: boolean; readonly duties: readonly (Duty & { namespace: string })[]; readonly unresolved: readonly (Duty & { namespace: string })[]; readonly reposLeft: readonly string[] | null };

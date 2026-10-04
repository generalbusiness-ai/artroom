// Types for the parts of mcp-stage0.mjs that test/node/mcp-stage0.cases.ts imports: its cleanup and finalizer.

import type { Api, CleanupOutcome, Duty } from "./cleanup.mjs";

/** An agent the run invited, retained before any effect. */
export interface Agent {
  readonly member: string;
  readonly invitation: string | null;
  readonly redeemed: "not-sent" | "unknown" | "refused" | "done";
  readonly key: string | null;
  readonly bearer: string | null;
}

export interface SessionDuty {
  readonly duty: string;
  readonly member: string;
  readonly key?: string;
  readonly invitation?: string | null;
  readonly outcome: Duty["outcome"];
  readonly detail?: string;
}

export function cleanupMcp(opts: {
  api: Api;
  canonical: string | null;
  expected?: readonly string[];
  minted?: Map<string, string>;
  agents?: readonly Agent[];
  endSession: (a: Agent) => Promise<readonly SessionDuty[]>;
  incarnations?: boolean;
}): Promise<CleanupOutcome & { readonly duties: readonly (Duty | SessionDuty)[]; readonly unresolved: readonly (Duty | SessionDuty)[] }>;

export function finishRun(
  out: { steps: { ok: boolean }[]; cleanup?: unknown; ok?: boolean },
  failed: boolean,
  cleanup: () => Promise<unknown>,
): Promise<0 | 1>;

export function sessionEnder(io: {
  act: (kind: string, target: unknown, body: unknown) => Promise<{ status: number; body?: any }>;
  read: (bearer: string) => Promise<{ status: number }>;
}): (a: Agent) => Promise<readonly SessionDuty[]>;

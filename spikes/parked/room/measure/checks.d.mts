// Types for checks.mjs, the review-and-check flow shared by spike-smoke.mjs and mcp-stage0.mjs.

import type { Api } from "./cleanup.mjs";

export interface KeyPair {
  readonly key: string;
  readonly seed: Uint8Array;
}

export declare const CHECKED_PATHS: readonly string[];
export declare const CHECK: string;
export declare const CHECK_RULE: string;
export declare const REVIEW_RULE: string;
export declare const TESTS_CONFIG: { readonly format: string; readonly volatile: boolean; readonly timeoutSeconds: number };

export function checksPolicy(): { readonly rules: readonly { readonly id: string; readonly kind: string; readonly paths?: readonly string[]; readonly obligation?: Record<string, unknown> }[] } & Record<string, unknown>;
export function checkProject(run: string): Record<string, string>;
export declare const MANUAL_PATHS: readonly string[];
export declare const MANUAL_CONFIG: { readonly format: string; readonly volatile: boolean; readonly timeoutSeconds: number };
export function manualCheckProject(run: string): Record<string, string>;
export function checkedChange(run: string): Record<string, string>;
export function envValue(text: string, name: string): string | null;
export function spikeKeys(text: string, secrets?: Set<string>): { readonly operator: KeyPair | null; readonly checker: KeyPair | null };
export function loadSpikeKeys(secrets?: Set<string>): { readonly operator: KeyPair | null; readonly checker: KeyPair | null };
export function attentionFor(page: unknown, why: string, lane: string): ({ readonly why: string; readonly lane: string; readonly open: boolean } & Record<string, unknown>) | null;
export function obligationOf(proposal: unknown, kind: "check" | "review"): ({ readonly kind: string; readonly state: string } & Record<string, unknown>) | null;
export function checksIn(
  entries: unknown,
  checker: string,
): { readonly accepted: readonly { seq: number; ok: unknown; integration: unknown; check: unknown; runner?: unknown; detail?: string }[]; readonly refused: readonly { seq: number; rule: unknown }[] };

export interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}
export function seedImportRepo(opts: {
  api: Api;
  git: (args: string[], opts: { cwd?: string; token?: string }) => Promise<GitResult>;
  dir: string;
  name: string;
  files: Record<string, string>;
  onSecret?: (token: string) => void;
}): Promise<{
  readonly name: string;
  readonly created: boolean;
  readonly remote?: string;
  readonly seeded?: string;
  readonly pushed?: boolean;
  readonly revoked?: number;
  readonly active?: number | null;
  readonly errors?: unknown;
  readonly stderr?: string;
}>;
export function importDraft(opts: {
  operator: KeyPair;
  admin: KeyPair;
  recovery: KeyPair;
  ns: string;
  repo: string;
  handle: string;
  name: string;
  now?: number;
  ttlMs?: number;
}): {
  readonly name: string;
  readonly repo: { readonly kind: "import"; readonly grant: { readonly grant: { v: 1; repo: string; admin: string; operator: string; notAfter: string }; readonly sig: string } };
  readonly admin: { readonly handle: string; readonly key: string };
  readonly recovery: string;
};

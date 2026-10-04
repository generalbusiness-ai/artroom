/**
 * The body fields each step brings, with their types (docs/protocol.md
 * R-DECL-5; `artroom-steps-v1`). A declared act's body is its own declared
 * fields, its steps' fields, and `because` (R-DECL-12). Clients use this
 * table to prepare a generic act: to show which fields a step needs and to
 * read typed values. The Room's admission (packages/room/src/schema.ts)
 * decides; a Room test checks that this table and admission agree.
 *
 * This module imports no evaluator, so clients can load it without the
 * expression engine.
 */

import type { Step } from "@generalbusiness/artroom-contract";

/** The type of a step's own field, as a client reads and shows it. */
export type StepFieldType =
  | { readonly type: "int"; readonly min: number }
  | { readonly type: "sha" }
  | { readonly type: "globs"; readonly min: number; readonly max: number }
  | { readonly type: "text"; readonly max: number }
  | { readonly type: "enum"; readonly values: readonly string[] }
  | { readonly type: "bool" }
  | { readonly type: "member" }
  | { readonly type: "act" }
  | { readonly type: "digest" }
  | { readonly type: "obligation" }
  | { readonly type: "checker" }
  | { readonly type: "op" }
  | { readonly type: "check-input" };

/** One field a step brings. `optional` fields may be left out. */
export type StepFieldSpec = StepFieldType & { readonly optional?: true };

const LEASE: StepFieldSpec = { type: "int", min: 1 };
const GENERATION: StepFieldSpec = { type: "int", min: 0 };
const HEAD: StepFieldSpec = { type: "sha" };
const SCOPE: StepFieldSpec = { type: "globs", min: 1, max: 64 };

/** Each step's own fields under `artroom-steps-v1`, in the order of `STEP_FIELDS` (acts.ts). */
export const STEP_FIELD_SPECS: Readonly<Record<Step, Readonly<Record<string, StepFieldSpec>>>> = Object.freeze({
  open: { scope: SCOPE },
  take: { scope: SCOPE, expectedGeneration: GENERATION, lease: { ...LEASE, optional: true } },
  version: { lease: LEASE, expectedGeneration: GENERATION, head: HEAD },
  review: {
    head: HEAD,
    verdict: { type: "enum", values: ["approve", "object"] },
    scope: SCOPE,
    dependsOn: { type: "globs", min: 0, max: 64, optional: true },
  },
  check: {
    obligation: { type: "obligation" },
    check: { type: "checker" },
    integration: HEAD,
    input: { type: "check-input" },
    config: { type: "digest" },
    runner: { type: "digest" },
    volatile: { type: "bool" },
    ok: { type: "bool" },
    detail: { type: "text", max: 16384 },
    landOp: { type: "op", optional: true },
  },
  land: { lease: LEASE, head: HEAD },
  release: { lease: LEASE, note: { type: "text", max: 8192, optional: true } },
  "hand-over": { lease: LEASE, to: { type: "member" } },
  comment: { replyTo: { type: "act", optional: true } },
});

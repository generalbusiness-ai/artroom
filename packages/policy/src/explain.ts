/**
 * Data for `explain()` (plan section 5, `Explanation`): which rules were
 * applied, the inputs they saw, their outcomes, and the platform invariants
 * checked. The room puts `decisions` and `invariants` straight into its
 * `Explanation`; `inputs` lets anyone replay a decision (R-EVAL-6).
 */

import type { Decision, Json, ProfileStamp } from "@generalbusiness/artroom-contract";
import type { Invariant } from "./carry.ts";
import type { Explained } from "./rules.ts";
import { STAMP } from "./profile.ts";

export interface ExplainData {
  readonly stamp: ProfileStamp;
  /** Every rule applied, in evaluation order, with its outcome and budget used. */
  readonly decisions: readonly Decision[];
  /** Platform invariants checked, by rule number in docs/protocol.md. */
  readonly invariants: readonly Invariant[];
  /** Each retained rule input, by its digest. */
  readonly inputs: Readonly<Record<string, Json>>;
  /** One plain sentence per decision and failed or noted invariant, in order. */
  readonly lines: readonly string[];
}

export function explain(...results: readonly Explained[]): ExplainData {
  const decisions: Decision[] = [];
  const invariants: Invariant[] = [];
  const inputs: Record<string, Json> = {};
  const lines: string[] = [];
  for (const r of results) {
    for (const e of r.evaluations) {
      decisions.push(e.decision);
      inputs[e.decision.input] = e.input;
      lines.push(e.text);
    }
    for (const i of r.invariants) {
      invariants.push(i);
      if (i.detail) lines.push(`${i.rule} ${i.held ? "held" : "failed"}: ${i.detail}`);
    }
  }
  return { stamp: STAMP, decisions, invariants, inputs, lines };
}

/**
 * Data for `explain()` (plan section 5, `Explanation`): which rules were
 * applied, the inputs they saw, their outcomes, and the platform invariants
 * checked. The room puts `decisions` and `invariants` straight into its
 * `Explanation`; `contexts` lets anyone replay a decision (R-EVAL-6).
 */

import type { Decision, ProfileStamp } from "@generalbusiness/artroom-contract";
import type { ReplayContext } from "./context.ts";
import type { Invariant } from "./carry.ts";
import type { Explained } from "./rules.ts";
import { STAMP } from "./profile.ts";

export interface ExplainData {
  readonly stamp: ProfileStamp;
  /** Every rule applied, in evaluation order, with its outcome and budget used. */
  readonly decisions: readonly Decision[];
  /** Platform invariants checked, by rule number in docs/protocol.md. */
  readonly invariants: readonly Invariant[];
  /** Each retained replay context, by its digest: `replay(policy, context)` reproduces its decisions. */
  readonly contexts: Readonly<Record<string, ReplayContext>>;
  /** One plain sentence per decision and failed or noted invariant, in order. */
  readonly lines: readonly string[];
}

export function explain(...results: readonly Explained[]): ExplainData {
  const decisions: Decision[] = [];
  const invariants: Invariant[] = [];
  const contexts: Record<string, ReplayContext> = {};
  const lines: string[] = [];
  for (const r of results) {
    for (const e of r.evaluations) {
      decisions.push(e.decision);
      contexts[e.decision.input] = e.context;
      lines.push(e.text);
    }
    for (const i of r.invariants) {
      invariants.push(i);
      if (i.detail) lines.push(`${i.rule} ${i.held ? "held" : "failed"}: ${i.detail}`);
    }
  }
  return { stamp: STAMP, decisions, invariants, contexts, lines };
}

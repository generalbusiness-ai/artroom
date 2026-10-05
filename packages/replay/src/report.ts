/**
 * The report of a verifier (scope contract, section 9.5), and its rendering
 * in plain English. A report always states its mode and its coverage. The
 * rendering never calls a history "verified": a result is "consistent" for
 * a stated mode, target, coverage and set of trusts, and the text states
 * all four.
 */

import type { FactRef, Report, ScopeRef } from "@generalbusiness/artroom-contract";

export type { Report };

const scope = (ref: ScopeRef): string => `${ref.scope}, incarnation ${ref.inc}, ${ref.kind}`;
const fact = (ref: FactRef): string => `entry ${ref.seq} of ${ref.at.scope} (${ref.hash})`;

const MODES: Record<Report["mode"], string> = {
  integrity: "integrity. Within the coverage stated below, the chain, each entry's canonical bytes and hash, and the actors' signatures were checked. No judgment was derived again.",
  replay: "replay. Within the coverage stated below, the history was folded from its genesis, and every guard, effect and send was derived again and compared with the entry that records it.",
};

const RESULTS: Record<Report["result"], string> = {
  consistent: "consistent, for the mode, target, coverage and trusts stated below",
  mismatch: "mismatch: the history is not consistent",
  "missing-dependency": "missing dependency: a source history could not be read",
  "unsupported-definition": "unsupported definition: this replay cannot derive under a definition the history pins",
  incomplete: "incomplete: no claim is made beyond the coverage stated below",
};

/** The report as lines of plain English. `why`: what was found, when the result is not `consistent`. */
export function render(report: Report, why: string | null = null): string {
  const lines = [`Result: ${RESULTS[report.result]}.`];
  if (report.at) lines.push(`At: ${fact(report.at)}.`);
  if (why !== null) lines.push(`Finding: ${why}.`);
  lines.push(`Mode: ${MODES[report.mode]}`);
  lines.push(`Target: ${scope(report.target.at)}, ${report.result === "consistent" ? "through" : "aiming for"} entry ${report.target.seq} (${report.target.hash}).`);
  lines.push(report.coverage.length === 0 ? "Coverage: no entry." : "Coverage:");
  for (const c of report.coverage) lines.push(`  - ${scope(c.scope)}: entries ${c.from} to ${c.through}`);
  lines.push(report.anchors.length === 0 ? "Anchors: none." : "Anchors, taken on the caller's word:");
  for (const a of report.anchors) lines.push(`  - ${fact(a)}`);
  const { verified, anchored, missing } = report.dependencies;
  lines.push(`Foreign facts: ${verified} shown by replay of their source scope, ${anchored} taken from an anchor, ${missing.length} missing.`);
  for (const m of missing) lines.push(`  - missing: ${fact(m)}`);
  // Section 9.3: a text that a tombstone removed is not missing. It is reported, and nothing was derived from its bytes.
  if (report.redacted.length > 0) lines.push("Redacted texts, not derived again:");
  for (const r of report.redacted) lines.push(`  - the text of slot ${r.slot} of item ${r.item}, removed by ${fact(r.tombstone)}`);
  lines.push("Trusts, which this report does not show:");
  for (const t of report.trusts) lines.push(`  - ${t}`);
  return lines.join("\n");
}

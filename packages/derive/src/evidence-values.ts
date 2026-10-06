/** Evidence values of one pinned owner: named outside the entry, retained at their declared maxima. */
import { RETAINED_INPUT_BYTES, type Evidence } from "@generalbusiness/artroom-contract";
import { isDigest } from "@generalbusiness/artroom-bytes";
import type { EvidenceValue, OperationRules } from "./ledger.ts";

/** Null: the evidence names a value outside this version's declaration. */
export function evidenceValues(rules: Pick<OperationRules, "valueDomains" | "values"> | null | undefined, evidence: Evidence): readonly EvidenceValue[] | null {
  const domains = rules?.valueDomains ?? [];
  const declared = new Map<string, number>();
  for (const domain of domains) {
    if (typeof domain.domain !== "string" || domain.domain.length === 0 || declared.has(domain.domain) || !Number.isSafeInteger(domain.max) || domain.max < 1 || domain.max > RETAINED_INPUT_BYTES) return null;
    declared.set(domain.domain, domain.max);
  }
  const named = rules?.values?.(evidence) ?? [];
  if (!Array.isArray(named) || named.length > domains.length) return null;
  const seen = new Set<string>();
  for (const value of named) {
    if (!value || !isDigest(value.digest) || declared.get(value.domain) !== value.max || seen.has(value.domain)) return null;
    seen.add(value.domain);
  }
  return named;
}

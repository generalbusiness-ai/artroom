/** Closed native retained consumers, shared by replay and local inventory.
 * A plan names a read. Selection still requires the consumer's byte checks;
 * a plan is neither privacy admission nor a replay/custody verdict. */
import type { Bounds, Digest, Entry, Evidence, FactRef, FieldValue, Input, ObservationUse } from "@generalbusiness/dap-contract";
import { DOMAINS, RETAINED_INPUT_BYTES } from "@generalbusiness/dap-contract";
import { isDigest, isFactRef, retainedValueKey } from "@generalbusiness/artroom-bytes";

import type { ValidDefinition } from "./validate/index.ts";
import type { OperationRules } from "./ledger.ts";
import { HOLD, HOLD_KINDS } from "./capability/hold.ts";
import { isAncestryCheck, type AncestryCheck } from "./capability/ancestry.ts";
import { isObject } from "./values.ts";
import { valuePlaces } from "./validate/fields.ts";
import { placesOf } from "./marks.ts";
import { own } from "./values.ts";
import { namedBy, retainsOf } from "./observes.ts";
import { inputTexts } from "./handlers.ts";
import { evidenceValues } from "./evidence-values.ts";

export type RetainedKey =
  | { readonly kind: "definition" | "entry" | "rule" | "snapshot"; readonly digest: Digest }
  | { readonly kind: "value"; readonly domain: string; readonly digest: Digest };
export interface DependencyOrigin { readonly at: FactRef; readonly input: Input["type"] }
export type DependencyPurpose = "replay-required" | "archive-closure";
const ALL = ["genesis", "act", "delivery", "timed", "diagnosis", "outcome", "preparation", "checkpoint"] as const;
const REQUIRED = {
  declaration: { inputs: ALL, kinds: ["definition"] },
  "foreign-use": { inputs: ALL, kinds: ["entry"] },
  "rule-input": { inputs: ALL, kinds: ["rule"] },
  "act-value": { inputs: ["act"], kinds: ["definition", "value"] },
  "outcome-snapshot": { inputs: ["outcome"], kinds: ["snapshot"] },
  "outcome-value": { inputs: ["outcome"], kinds: ["definition", "value"] },
  "definition-child": { inputs: ALL, kinds: ["definition"] },
} as const;
export type RequiredConsumer = keyof typeof REQUIRED;
export interface RequiredDependency {
  readonly mode: "required";
  readonly origin: DependencyOrigin;
  readonly consumer: RequiredConsumer;
  readonly purpose: DependencyPurpose;
  readonly key: RetainedKey;
}
export interface ProbeDependency {
  readonly mode: "probe";
  readonly origin: DependencyOrigin;
  readonly consumer: "observation-value";
  readonly purpose: "replay-required";
  /** Native declaration order is significant: only the first byte-validated
   * match is selected; failed attempts still spend the pass allowance. */
  readonly choices: readonly { readonly domain: string; readonly key: RetainedKey }[];
}
export interface TextDependency {
  readonly mode: "text";
  readonly origin: DependencyOrigin;
  readonly consumer: "detached-text";
  readonly key: { readonly kind: "text"; readonly digest: Digest };
  /** Ordinary replay may read/redact it. An archive records this omission
   * without reading its body or following later tombstones. */
  readonly archive: "omit";
}
export type RetainedDependency = RequiredDependency | ProbeDependency | TextDependency;
export class UnsupportedConsumer extends Error { override readonly name = "UnsupportedConsumer"; }
const unsupported = (): never => { throw new UnsupportedConsumer("unsupported retained consumer or key"); };
function originOf(origin: DependencyOrigin): DependencyOrigin {
  if (!origin || !isFactRef(origin.at) || !(ALL as readonly string[]).includes(origin.input)) return unsupported();
  return origin;
}
export function checkedRetainedKey(key: RetainedKey): RetainedKey {
  if (!key || !isDigest(key.digest)) return unsupported();
  const fields = Object.keys(key);
  if (key.kind === "value") {
    if (fields.length !== 3 || !fields.includes("kind") || !fields.includes("domain") || !fields.includes("digest") || typeof key.domain !== "string" || key.domain.length === 0 || key.domain === DOMAINS.definition) return unsupported();
  } else if (!["definition", "entry", "rule", "snapshot"].includes(key.kind) || fields.length !== 2 || !fields.includes("kind") || !fields.includes("digest")) return unsupported();
  return key;
}

export function requiredDependency(origin: DependencyOrigin, consumer: RequiredConsumer, key: RetainedKey): RequiredDependency {
  const form = Object.hasOwn(REQUIRED, consumer) ? REQUIRED[consumer] : null;
  if (!form || !(form.inputs as readonly string[]).includes(originOf(origin).input) || !(form.kinds as readonly string[]).includes(checkedRetainedKey(key).kind)) return unsupported();
  return { mode: "required", origin, consumer, purpose: consumer === "definition-child" ? "archive-closure" : "replay-required", key };
}

export function observationDependency(origin: DependencyOrigin, digest: Digest, domains: readonly string[]): ProbeDependency {
  if (!["act", "delivery", "outcome"].includes(originOf(origin).input) || !isDigest(digest)) return unsupported();
  const choices = domains.map(domain => ({ domain, key: checkedRetainedKey(retainedValueKey(domain, digest)) }));
  return { mode: "probe", origin, consumer: "observation-value", purpose: "replay-required", choices };
}

export function textDependency(origin: DependencyOrigin, digest: Digest): TextDependency {
  originOf(origin);
  if (!isDigest(digest)) return unsupported();
  return { mode: "text", origin, consumer: "detached-text", key: { kind: "text", digest }, archive: "omit" };
}

/** Semantic planning below stays beside the native places/rows/owner
 * grammar. Replay and inventory use the same selectors; neither discovers
 * dependencies by searching strings or retained-store contents. */
export function actValueDependencies(definition: ValidDefinition, origin: DependencyOrigin, kind: string, fields: Readonly<Record<string, FieldValue>>) {
  return placesOf(own(definition.declared.acts, kind)?.fields, fields).map(place => ({
    place, dependency: requiredDependency(origin, "act-value", retainedValueKey(place.domain, place.digest)),
  }));
}

export function observedValueDependencies(definition: ValidDefinition, origin: DependencyOrigin, observed: readonly ObservationUse[]) {
  if (!definition.observing) return [];
  const domains = retainsOf(definition);
  return observed.flatMap(use => namedBy(use.observation)).map(digest => ({ digest, dependency: observationDependency(origin, digest, domains) }));
}

export function detachedTextDependencies(definition: ValidDefinition, origin: DependencyOrigin, input: Input, under?: string) {
  return inputTexts(definition, input, under).map(digest => textDependency(origin, digest));
}

/** Null preserves the native owner's unsupported-evidence result. Unknown
 * owners must be refused by inventory admission before calling this. */
export function outcomeValueDependencies(origin: DependencyOrigin, rules: OperationRules | null | undefined, evidence: Evidence) {
  const values = evidenceValues(rules, evidence);
  return values?.map(value => ({ value, dependency: requiredDependency(origin, "outcome-value", retainedValueKey(value.domain, value.digest)) })) ?? null;
}

/** The native ancestry grammar names its snapshot even when the owner's
 * ordinary retained list omits it. This is selection only: neither the
 * record nor an owner's list proves the ancestry walk or snapshot count. */
export function outcomeSnapshotDependencies(origin: DependencyOrigin, input: Extract<Input, { type: "outcome" }>, rules: () => OperationRules | null | undefined): { record: AncestryCheck | null; dependencies: readonly RequiredDependency[]; readable: boolean } {
  let readable = true;
  let named: readonly Digest[] = [];
  try { named = rules()?.retains?.(input.evidence) ?? []; }
  catch { readable = false; /* Ordinary replay leaves this evidence to its judge. */ }
  const body: unknown = isObject(input.evidence) ? input.evidence["body"] : null;
  const candidate = input.owner === HOLD && input.kind === HOLD_KINDS.check && input.result === "confirmed" && isObject(body) ? body["record"] : null;
  const record = isAncestryCheck(candidate) ? candidate : null;
  return { record, readable, dependencies: (record ? [...named, record.snapshot.digest] : named).map(digest => requiredDependency(origin, "outcome-snapshot", { kind: "snapshot", digest })) };
}

/** Domain declarations use the native value-place and observation grammar,
 * independently of whether an entry happened to supply a matching value. */
export function declarationValueDomains(definition: ValidDefinition): readonly string[] {
  return [...new Set([...Object.values(definition.declared.acts).flatMap(act => valuePlaces(act.fields).map(place => place.domain)), ...retainsOf(definition)])];
}

export interface PlannedRetainedDependency { readonly dependency: RetainedDependency; readonly max: number }
export interface LocalRetainedPlan {
  readonly dependencies: readonly PlannedRetainedDependency[];
  readonly ancestry: AncestryCheck | null;
}
/** Composition for local inventory, using the same selectors as replay's
 * actual reads above. This does not prove judgments, foreign histories,
 * current authority, owner evidence or the ancestry walk. */
export function localRetainedPlan(definition: ValidDefinition, entry: Entry, hash: Digest, rules: OperationRules | null, bounds: Bounds, deliveryUnder?: string): LocalRetainedPlan {
  const input = entry.input, origin: DependencyOrigin = { at: { at: entry.at, seq: entry.seq, hash }, input: input.type };
  originOf(origin);
  const dependencies: PlannedRetainedDependency[] = [];
  const add = (dependency: RetainedDependency, max: number) => dependencies.push({ dependency, max });
  for (const use of entry.uses) add(requiredDependency(origin, "foreign-use", { kind: "entry", digest: use.content }), RETAINED_INPUT_BYTES);
  for (const prepared of entry.prepared) {
    if (!Object.hasOwn(definition.declared.rules, prepared.rule)) return unsupported();
    add(requiredDependency(origin, "rule-input", { kind: "rule", digest: prepared.input }), RETAINED_INPUT_BYTES);
  }
  for (const text of detachedTextDependencies(definition, origin, input, deliveryUnder)) add(text, 0);
  if (input.type === "act") for (const { dependency, place } of actValueDependencies(definition, origin, input.signed.intent.kind, input.signed.intent.fields)) add(dependency, place.max);
  if ("observed" in input) for (const { dependency } of observedValueDependencies(definition, origin, input.observed ?? [])) add(dependency, RETAINED_INPUT_BYTES);
  let ancestry: AncestryCheck | null = null;
  if (input.type === "outcome") {
    if (!rules) return unsupported();
    const snapshots = outcomeSnapshotDependencies(origin, input, () => rules);
    if (!snapshots.readable) return unsupported();
    ancestry = snapshots.record;
    for (const dependency of snapshots.dependencies) add(dependency, RETAINED_INPUT_BYTES);
    const values = outcomeValueDependencies(origin, rules, input.evidence);
    if (values === null) return unsupported();
    for (const { dependency, value } of values) add(dependency, value.max);
  }
  // Definitions are validated under their own native ceiling, even when a
  // value place or observation permits a larger retained reply.
  return { dependencies: dependencies.map(plan => plan.dependency.mode === "required" && plan.dependency.key.kind === "definition" ? { ...plan, max: Math.min(plan.max, bounds.definitionBytes) } : plan), ancestry };
}

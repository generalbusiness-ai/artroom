/** Closed native retained consumers, shared by replay and local inventory.
 * A plan names a read. Selection still requires the consumer's byte checks;
 * a plan is neither privacy admission nor a replay/custody verdict. */
import type { Digest, FactRef, Input } from "@generalbusiness/dap-contract";
import { DOMAINS } from "@generalbusiness/dap-contract";
import { isDigest, isFactRef, retainedValueKey } from "@generalbusiness/artroom-bytes";

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
function keyOf(key: RetainedKey): RetainedKey {
  if (!key || !isDigest(key.digest)) return unsupported();
  const fields = Object.keys(key);
  if (key.kind === "value") {
    if (fields.length !== 3 || !fields.includes("kind") || !fields.includes("domain") || !fields.includes("digest") || typeof key.domain !== "string" || key.domain.length === 0 || key.domain === DOMAINS.definition) return unsupported();
  } else if (!["definition", "entry", "rule", "snapshot"].includes(key.kind) || fields.length !== 2 || !fields.includes("kind") || !fields.includes("digest")) return unsupported();
  return key;
}

export function requiredDependency(origin: DependencyOrigin, consumer: RequiredConsumer, key: RetainedKey): RequiredDependency {
  const form = Object.hasOwn(REQUIRED, consumer) ? REQUIRED[consumer] : null;
  if (!form || !(form.inputs as readonly string[]).includes(originOf(origin).input) || !(form.kinds as readonly string[]).includes(keyOf(key).kind)) return unsupported();
  return { mode: "required", origin, consumer, purpose: consumer === "definition-child" ? "archive-closure" : "replay-required", key };
}

export function observationDependency(origin: DependencyOrigin, digest: Digest, domains: readonly string[]): ProbeDependency {
  if (!["act", "delivery", "outcome"].includes(originOf(origin).input) || !isDigest(digest)) return unsupported();
  const choices = domains.map(domain => ({ domain, key: keyOf(retainedValueKey(domain, digest)) }));
  return { mode: "probe", origin, consumer: "observation-value", purpose: "replay-required", choices };
}

export function textDependency(origin: DependencyOrigin, digest: Digest): TextDependency {
  originOf(origin);
  if (!isDigest(digest)) return unsupported();
  return { mode: "text", origin, consumer: "detached-text", key: { kind: "text", digest }, archive: "omit" };
}

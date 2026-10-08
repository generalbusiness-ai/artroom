/** Closed adopted b74 record parser. Checks data; it creates no trusted selection, access or executable facade. */
import type * as Contract from "@generalbusiness/artroom-contract";
import { canonicalBytes, canonicalize, digestBytes, isDigest, isFactRef, isHead, isKeyId, isPlatformDefinition,
  isScopeRef, isSeed, isSignature, parseStrictBytes, semanticContentBytes, timeMs, wellFormed, verify } from "@generalbusiness/artroom-bytes";
import { byteOrder } from "./values.ts";

export interface BundleRecords {
  ArtifactRef: Contract.ArtifactRef;
  EvidenceRef: Contract.EvidenceRef;
  ServiceIdentity: Contract.ServiceIdentity;
  ImportRecord: Contract.ImportRecord;
  ExportRecord: Contract.ExportRecord;
  ModuleRecord: Contract.ModuleRecord;
  ExportRef: Contract.ExportRef;
  ComponentRecord: Contract.ComponentRecord;
  MarkRecord: Contract.MarkRecord;
  PlatformRecord: Contract.PlatformRecord;
  DeclaredRecord: Contract.DeclaredRecord;
  CapabilityRecord: Contract.SemanticBundleCapabilityRecord;
  ProfileRecord: Contract.ProfileRecord;
  BoundsRecord: Contract.BoundsRecord;
  DomainRecord: Contract.DomainRecord;
  DomainsRecord: Contract.DomainsRecord;
  BuildEnvironment: Contract.BuildEnvironment;
  RuntimeCompatibility: Contract.RuntimeCompatibility;
  BuildInput: Contract.BuildInput;
  BuildRecord: Contract.BuildRecord;
  MissingEvidence: Contract.MissingEvidence;
  SemanticBundleManifest: Contract.SemanticBundleManifest;
  HistoricalContext: Contract.HistoricalContext;
  HistoryChunk: Contract.HistoryChunk;
  ScopeCoverage: Contract.ScopeCoverage;
  ReleaseClaim: Contract.ReleaseClaim;
  AdmissionCorrespondence: Contract.AdmissionCorrespondence;
  HistoricalSourceBinding: Contract.HistoricalSourceBinding;
  BindingSetRevision: Contract.BindingSetRevision;
  TrustAnchor: Contract.TrustAnchor;
  SignaturePayload: Contract.SignaturePayload;
  SignatureEnvelope: Contract.SignatureEnvelope;
  AnchorChange: Contract.AnchorChange;
  SignedAnchorChange: Contract.SignedAnchorChange;
  ABITypeRecord: Contract.ABITypeRecord;
  ABISignature: Contract.ABISignature;
  ABIRecord: Contract.ABIRecord;
  SelectionPin: Contract.SelectionPin;
  PreparedSelection: Contract.PreparedSelection;
  FoundingTarget: Contract.FoundingTarget;
  RecordedRefusalTarget: Contract.RecordedRefusalTarget;
  EvidenceClass: Contract.EvidenceClass;
  SelectionSubject: Contract.SelectionSubject;
  SelectionResult: Contract.SelectionResult;
  FoundingHold: Contract.FoundingHold;
  RefusalHold: Contract.RefusalHold;
 }
export type BundleRecordKind = keyof BundleRecords;
/** Explicit caller work/allocation limits. No defaults and no replacement for historical semantic Bounds. */
export interface BundleLimits { bytes: number; records: number; tokens: number; depth: number; artifacts: number; modules: number; edges: number }
export type BundleFailure = { ok: false; reason: "limits" | "canonical" | "schema" | "content" | "closure" | "conflict" | "signature" | "unavailable"; path: string };
export type BundleResult<T> = { ok: true; value: T } | BundleFailure;
export class BundleError extends Error {
  constructor(readonly reason: BundleFailure["reason"], readonly path: string) { super(`${reason} at ${path}`); }
}
function fail(reason: BundleFailure["reason"], path: string): never { throw new BundleError(reason, path); }
export function bundleAttempt<T>(work: () => T): BundleResult<T> {
  try { return { ok: true, value: work() }; }
  catch (error) { if (error instanceof BundleError) return { ok: false, reason: error.reason, path: error.path }; throw error; }
}
export function checkBundleLimits(limits: BundleLimits): void {
  const keys = ["bytes", "records", "tokens", "depth", "artifacts", "modules", "edges"] as const;
  if (!limits || Object.keys(limits).length !== keys.length || keys.some((key) => !Object.hasOwn(limits, key)
    || !Number.isSafeInteger(limits[key]) || Object.is(limits[key], -0) || limits[key] < 0)) fail("limits", "limits");
}
/** Scan raw JSON delimiters/tokens before decoding/parsing allocations. Tokens count keys and values, including containers. */
export function boundedCanonical(bytes: Uint8Array, limits: BundleLimits): unknown {
  checkBundleLimits(limits);
  if (bytes.length > limits.bytes) fail("limits", "bytes");
  let quoted = false, escaped = false, depth = 0, records = 0, tokens = 0, primitive = false;
  for (const byte of bytes) {
    if (quoted) { if (escaped) escaped = false; else if (byte === 92) escaped = true; else if (byte === 34) quoted = false; continue; }
    if (byte === 34) { quoted = true; tokens++; primitive = false; }
    else if (byte === 123 || byte === 91) { depth++; tokens++; primitive = false; if (byte === 123) records++; }
    else if (byte === 125 || byte === 93) { depth--; primitive = false; }
    else if (byte === 44 || byte === 58 || byte === 32 || byte === 9 || byte === 10 || byte === 13) primitive = false;
    else if (!primitive) { primitive = true; tokens++; }
    if (depth > limits.depth || records > limits.records || tokens > limits.tokens) fail("limits", "json");
  }
  let value: unknown;
  try { value = parseStrictBytes(bytes); if (!equalBytes(bytes, canonicalBytes(value))) fail("canonical", "bytes"); }
  catch (error) { if (error instanceof BundleError) throw error; fail("canonical", "bytes"); }
  return value;
}
export const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, index) => byte === b[index]);
type RecordValue = Record<string, unknown>;
type Check = (value: unknown, path: string) => void;
const predicate = (test: (value: unknown) => boolean): Check => (value, path) => { if (!test(value)) fail("schema", path); };
const text = predicate((v) => typeof v === "string" && wellFormed(v));
const integer = predicate((v) => typeof v === "number" && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= 0);
const digest = predicate(isDigest), key = predicate(isKeyId), signature = predicate(isSignature);
const fact = predicate(isFactRef), scope = predicate(isScopeRef), head = predicate((v) => isHead(v) && isDigest(v.hash)), seed = predicate(isSeed);
const named = predicate((v) => isDigest(v) || isPlatformDefinition(v));
const time = predicate((v) => timeMs(v) !== null);
const moduleId = predicate((v) => typeof v === "string" && v.length > 0 && !v.startsWith("/") && !v.includes("\\")
  && v.split("/").every((part) => part !== "" && part !== "." && part !== ".."));
const gitId = predicate((v) => typeof v === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(v));
const capability = predicate((v) => typeof v === "string" && /^(?:hold|git-read)@(0|[1-9][0-9]*)$/.test(v));
const one = (...allowed: readonly unknown[]): Check => predicate((v) => allowed.includes(v));
const nullable = (check: Check): Check => (v, p) => { if (v !== null) check(v, p); };
const record = (fields: Record<string, Check>): Check => (v, p) => {
  if (typeof v !== "object" || v === null || Array.isArray(v) || Object.keys(v).length !== Object.keys(fields).length) fail("schema", p);
  const obj = v as RecordValue;
  for (const [name, check] of Object.entries(fields)) { if (!Object.hasOwn(obj, name)) fail("schema", `${p}.${name}`); check(obj[name], `${p}.${name}`); }
};
const variant = (field: string, variants: Record<string, Check>): Check => (v, p) => {
  const name = v !== null && typeof v === "object" ? (v as RecordValue)[field] : null;
  if (typeof name !== "string" || !Object.hasOwn(variants, name)) fail("schema", p);
  variants[name]!(v, p);
};
const list = (check: Check, ordering?: (v: unknown) => string, nonempty = false): Check => (v, p) => {
  if (!Array.isArray(v) || (nonempty && v.length === 0)) fail("schema", p);
  const values = v as unknown[]; let previous: string | null = null;
  for (let i = 0; i < values.length; i++) { check(values[i], `${p}[${i}]`); if (ordering) {
    const current = ordering(values[i]); if (previous !== null && byteOrder(previous, current) >= 0) fail("schema", p); previous = current;
  } }
};
const field = (name: string) => (v: unknown): string => String((v as RecordValue)[name]);
const self = (v: unknown): string => String(v);
const of = (kind: BundleRecordKind): Check => (v, p) => checkRecord(kind, v, p);
const SLOTS = ["bytes", "records", "validate", "count", "runnable", "profile-admit", "rule-prepare", "rule-evaluate", "judge-genesis", "judge-act", "judge-delivery", "judge-timed", "judge-preparation", "judge-outcome", "judge-diagnosis", "judge-checkpoint", "judge-grant", "fold", "snapshot", "clock", "reservation", "capabilities", "owners", "platform-rules", "observed", "observed-values", "membership-reference", "rules-reference", "revision-kind"] as const;
const TYPES = ["Entry", "Input", "ScopeRef", "FactRef", "FieldValue", "StateSnapshot", "StateView", "StateWriter", "Own", "Fetched", "RuleGiven", "RuleInput", "Prepared", "ObservationUse", "ValueRead", "Reading", "Clock", "Bounds", "ValidDefinition", "Capabilities", "Owners", "PlatformRules", "Judgment", "Draft", "Refusal", "CanonicalValue", "Bytes", "Digest"] as const;
const slot = one(...SLOTS), abiType = one(...TYPES);
const retainedKind = one("definition", "entry", "rule", "text", "snapshot", "value");
const retained = record({ kind: retainedKind, digest, domain: nullable(text), artifact: of("ArtifactRef") });
const retainedKey = (v: unknown) => { const r = v as RecordValue; return canonicalize([r["kind"], r["domain"], r["digest"]]); };
const ranges = list(record({ first: integer, last: integer, entries: of("ArtifactRef") }));
const historicalFields = { service: digest, scope, genesis: fact, named, targetHead: head };
const manifestSignatureFields = { format: one("artroom-semantic-signature-1"), service: digest, anchor: digest, publisher: key,
  subject: variant("kind", { manifest: record({ kind: one("manifest"), id: digest }), "binding-set": record({ kind: one("binding-set"), id: digest }) }), bindingSet: digest, revision: integer, parent: nullable(digest) };
const FOUNDING_INPUTS = ["admission", "binding-set", "activation-tuple", "bundle", "abi", "runtime-release", "compatibility"] as const;
const REFUSAL_INPUTS = ["historical-admission", "source-binding", "bundle", "abi", "local-adapter", "runtime-compatibility"] as const;
const held = (inputs: readonly string[]) => variant("reason", {
  unavailable: record({ reason: one("unavailable"), inputs: list(one(...inputs), self, true) }),
  conflict: record({ reason: one("conflict"), inputs: list(record({ input: one(...inputs), candidates: list(digest, self, true) }), field("input"), true) }),
});
const SCHEMAS: { [K in BundleRecordKind]: Check } = {
  ArtifactRef: record({ digest, bytes: integer, encoding: one("raw", "utf8", "canonical-json") }),
  EvidenceRef: record({ artifact: of("ArtifactRef"), kind: one("source-inventory", "build-output", "deployment-output", "admission-output", "operator-statement", "owner-decision", "independent-review", "compatibility-report") }),
  ServiceIdentity: record({ format: one("artroom-logical-service-1"), name: text, provenance: of("EvidenceRef") }),
  ImportRecord: record({ specifier: text, target: variant("kind", { module: record({ kind: one("module"), module: moduleId }), runtime: record({ kind: one("runtime"), feature: one("ecmascript", "webcrypto", "text-codec", "url") }) }) }),
  ExportRecord: record({ name: text, signature: slot }),
  ModuleRecord: record({ id: moduleId, source: of("ArtifactRef"), imports: list(of("ImportRecord"), field("specifier")), exports: list(of("ExportRecord"), field("name")) }),
  ExportRef: record({ module: moduleId, name: text, signature: slot }),
  ComponentRecord: record({ role: slot, root: of("ExportRef"), closure: list(moduleId, self) }),
  MarkRecord: record({ path: text, code: text, place: one("grant", "also", "type", "guard", "effect", "send", "outcome"), export: of("ExportRef") }),
  PlatformRecord: record({ kind: one("platform"), named: predicate(isPlatformDefinition), data: of("ArtifactRef"), dataDigest: digest, marks: list(of("MarkRecord"), field("path")), observed: nullable(of("ExportRef")), observedValues: nullable(of("ExportRef")), membership: nullable(of("ExportRef")), rulesScope: nullable(of("ExportRef")), revisionKind: nullable(text) }),
  DeclaredRecord: record({ kind: one("declared"), named: digest, data: of("ArtifactRef"), dataDigest: digest, creates: list(digest) }),
  CapabilityRecord: record({ named: capability, schema: of("ArtifactRef"), forms: of("ExportRef"), steps: of("ExportRef"), records: of("ExportRef"), owners: list(record({ kind: text, rule: of("ExportRef"), closure: of("ArtifactRef") })), domains: list(text) }),
  ProfileRecord: record({ named: text, interpreter: of("ArtifactRef"), admit: of("ExportRef"), prepare: of("ExportRef"), evaluate: of("ExportRef"), language: of("ArtifactRef"), functions: of("ArtifactRef"), budgets: of("ArtifactRef"), fingerprint: of("ArtifactRef") }),
  BoundsRecord: record({ format: one("artroom-semantic-bounds-1"), schema: of("ArtifactRef"), values: of("ArtifactRef"), applies: one("historical-admission") }),
  DomainRecord: record({ tag: text, algorithm: one("sha256", "ed25519", "hmac-sha256", "sha1"), framing: one("tag-newline-canonical", "canonical", "raw"), schema: of("ArtifactRef"), maxBytes: nullable(integer) }),
  DomainsRecord: record({ format: one("artroom-semantic-domains-1"), records: list(of("DomainRecord"), field("tag")) }),
  BuildEnvironment: record({ format: one("artroom-pure-build-environment-1"), entries: list(record({ name: text, value: text }), field("name")) }),
  RuntimeCompatibility: record({ format: one("artroom-pure-runtime-1"), runtime: of("ArtifactRef"), moduleFormat: one("esm", "commonjs"), platform: text, flags: list(text), globals: of("ArtifactRef") }),
  BuildInput: record({ path: moduleId, artifact: of("ArtifactRef") }),
  BuildRecord: record({ format: one("artroom-pure-build-1"), sourceCommit: gitId, sourceTree: gitId, inputs: list(of("BuildInput"), field("path")), tools: list(record({ role: one("runtime", "package-manager", "compiler", "bundler"), executable: of("ArtifactRef"), version: text })), recipe: of("ArtifactRef"), arguments: list(text), environment: of("ArtifactRef"), compatibility: of("ArtifactRef"), outputs: list(of("BuildInput"), field("path")) }),
  MissingEvidence: record({ reason: one("not-retained", "not-produced", "not-identified"), subject: text, handoff: one("71b6dde2dc9059659f8fb1b606f85f13162232ce") }),
  EvidenceClass: variant("class", {
    "original-retained": record({ class: one("original-retained"), evidence: list(of("EvidenceRef"), undefined, true) }),
    "fresh-reconstruction": record({ class: one("fresh-reconstruction"), evidence: list(of("EvidenceRef"), undefined, true), original: of("MissingEvidence") }),
    "operator-attested": record({ class: one("operator-attested"), statement: of("EvidenceRef"), underlying: list(of("EvidenceRef")), original: of("MissingEvidence") }),
    missing: record({ class: one("missing"), missing: of("MissingEvidence") }),
  }),
  SemanticBundleManifest: record({ format: one("artroom-semantic-bundle-1"), abi: of("ArtifactRef"), modules: list(of("ModuleRecord"), field("id")), components: list(of("ComponentRecord"), field("role")), definitions: list(variant("kind", { platform: of("PlatformRecord"), declared: of("DeclaredRecord") }), field("named")), capabilities: list(of("CapabilityRecord"), field("named")), profiles: list(of("ProfileRecord"), field("named")), bounds: of("BoundsRecord"), domains: of("ArtifactRef"), build: of("ArtifactRef"), executable: of("ArtifactRef"), buildEvidence: of("EvidenceClass") }),
  HistoricalContext: record(historicalFields),
  HistoryChunk: record({ format: one("artroom-scope-history-chunk-1"), scope, genesis: fact, first: integer, last: integer, entries: list(record({ seq: integer, hash: digest, bytes: of("ArtifactRef") })) }),
  ScopeCoverage: record({ context: of("HistoricalContext"), genesisBytes: of("ArtifactRef"), history: ranges, retained: list(retained, retainedKey), uses: list(record({ user: fact, source: fact, sourceContext: of("HistoricalContext"), role: one("creator", "fact", "observation", "retained-entry", "text", "value") }), (v) => { const r = v as RecordValue; return canonicalize([r["user"], r["role"], r["source"]]); }) }),
  ReleaseClaim: record({ service: digest, release: text, sourceCommit: gitId, sourceTree: gitId, executable: of("ArtifactRef"), build: of("ArtifactRef"), deployedAt: nullable(time), evidence: (v, p) => { of("EvidenceClass")(v, p); if ((v as RecordValue)["class"] !== "original-retained") fail("schema", p); } }),
  AdmissionCorrespondence: record({ context: of("HistoricalContext"), bundle: digest, originalRelease: (v, p) => { if (v !== null && typeof v === "object" && Object.hasOwn(v, "reason")) of("MissingEvidence")(v, p); else of("ReleaseClaim")(v, p); }, alternative: nullable((v, p) => { of("EvidenceClass")(v, p); if (!["fresh-reconstruction", "operator-attested"].includes(String((v as RecordValue)["class"]))) fail("schema", p); }), scopeCoverage: of("ArtifactRef"), adjudication: of("EvidenceRef"), independentReview: of("EvidenceRef") }),
  HistoricalSourceBinding: record({ format: one("artroom-source-binding-1"), context: of("HistoricalContext"), bundle: digest, coverage: of("ArtifactRef"), admission: of("ArtifactRef"), decision: of("EvidenceRef") }),
  BindingSetRevision: record({ format: one("artroom-source-binding-set-1"), service: digest, revision: integer, parent: nullable(digest), bindings: list(record({ context: of("HistoricalContext"), binding: digest }), (v) => canonicalize((v as RecordValue)["context"])), decision: of("EvidenceRef") }),
  TrustAnchor: record({ format: one("artroom-bundle-trust-anchor-1"), service: digest, publisher: key, first: record({ revision: integer, bindingSet: digest }), authority: of("EvidenceRef"), custody: of("EvidenceRef") }),
  SignaturePayload: record(manifestSignatureFields),
  SignatureEnvelope: record({ payload: of("SignaturePayload"), sig: signature }),
  AnchorChange: record({ format: one("artroom-bundle-anchor-change-1"), service: digest, prior: digest, next: digest, at: record({ revision: integer, bindingSet: digest }), decision: of("EvidenceRef") }),
  SignedAnchorChange: record({ payload: of("AnchorChange"), priorSignature: signature, nextSignature: signature }),
  ABITypeRecord: record({ name: abiType, schema: of("ArtifactRef") }),
  ABISignature: record({ slot, contract: of("ArtifactRef"), inputs: list(abiType), output: abiType, timing: one("synchronous", "pure-async"), failure: one("typed-refusal-or-value", "deterministic-profile-refusal-or-fault", "fault-halts") }),
  ABIRecord: record({ format: one("artroom-pure-evaluator-1"), types: list(of("ABITypeRecord"), field("name")), signatures: list(of("ABISignature"), field("slot")), stateReader: of("ArtifactRef"), stateWriter: of("ArtifactRef"), runtime: of("ArtifactRef") }),
  SelectionSubject: variant("kind", { born: record({ kind: one("born"), context: of("HistoricalContext"), binding: digest }), founding: record({ kind: one("founding"), service: digest, seed, intent: digest, admission: digest }) }),
  SelectionPin: record({ service: digest, subject: of("SelectionSubject"), bundle: digest, abi: digest, bindingSet: digest, revision: integer, activationTuple: digest, runtimeRelease: digest, compatibility: digest }),
  PreparedSelection: record({ pin: of("SelectionPin"), before: nullable(head), input: digest, retainedInputs: list(retained), prepared: list(record({ rule: text, input: digest, result: predicate((v) => typeof v === "boolean") })) }),
  FoundingTarget: record({ service: digest, seed, intent: digest }),
  RecordedRefusalTarget: record({ ...historicalFields, genesisBytes: of("ArtifactRef"), history: ranges, retained: list(retained, retainedKey), refusalSchema: of("ArtifactRef") }),
  FoundingHold: held(FOUNDING_INPUTS), RefusalHold: held(REFUSAL_INPUTS),
  SelectionResult: variant("result", { selected: record({ result: one("selected"), pin: of("SelectionPin") }), unresolved: record({ result: one("unresolved"), context: of("HistoricalContext"), missing: list(of("MissingEvidence")) }), conflict: record({ result: one("conflict"), context: of("HistoricalContext"), candidates: list(digest) }), "founding-held": record({ result: one("founding-held"), target: of("FoundingTarget"), hold: of("FoundingHold") }), "existing-refused-held": record({ result: one("existing-refused-held"), target: of("RecordedRefusalTarget"), hold: of("RefusalHold") }) }),
};
const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
const require = (condition: boolean, path: string): void => { if (!condition) fail("schema", path); };
function contiguous(ranges: { first: number; last: number; entries: Contract.ArtifactRef }[], last: number, path: string): void {
  let next = 0;
  for (const range of ranges) {
    require(range.first === next && range.last >= range.first && range.last <= last && range.entries.encoding === "canonical-json", path);
    next = range.last + 1;
  }
  require(ranges.length > 0 && ranges.at(-1)!.last === last, path);
}
function checkRecord<K extends BundleRecordKind>(kind: K, value: unknown, path: string): void {
  SCHEMAS[kind](value, path);
  const v = value as BundleRecords[K];
  if (kind === "HistoricalContext" || kind === "RecordedRefusalTarget") {
    const c = v as Contract.HistoricalContext;
    require(c.genesis.seq === 0 && same(c.genesis.at, c.scope) && (c.targetHead.seq !== 0 || c.targetHead.hash === c.genesis.hash), path);
  }
  if (kind === "HistoryChunk") {
    const c = v as Contract.HistoryChunk;
    require(c.genesis.seq === 0 && same(c.genesis.at, c.scope) && c.last >= c.first && c.entries.length > 0, path);
    require(c.entries.length - 1 === c.last - c.first, path);
    for (let i = 0; i < c.entries.length; i++) require(c.entries[i]!.seq === c.first + i, path);
    if (c.first === 0) require(c.entries[0]!.hash === c.genesis.hash, path);
  }
  if (kind === "ScopeCoverage" || kind === "RecordedRefusalTarget") {
    const c = v as Contract.ScopeCoverage | Contract.RecordedRefusalTarget;
    const context = "context" in c ? c.context : c;
    contiguous(c.history, context.targetHead.seq, `${path}.history`);
    for (const row of c.retained) require((row.kind === "value") === (row.domain !== null), `${path}.retained`);
  }
  if (kind === "PreparedSelection") {
    const p = v as Contract.PreparedSelection;
    require((p.pin.subject.kind === "founding") === (p.before === null), `${path}.before`);
    for (const row of p.retainedInputs) require((row.kind === "value") === (row.domain !== null), `${path}.retainedInputs`);
  }
  if (kind === "SelectionPin") {
    const p = v as Contract.SelectionPin;
    require(p.service === (p.subject.kind === "born" ? p.subject.context.service : p.subject.service), `${path}.service`);
  }
  if (kind === "BindingSetRevision") {
    const set = v as Contract.BindingSetRevision;
    for (const binding of set.bindings) require(binding.context.service === set.service, `${path}.service`);
  }
  if (kind === "AdmissionCorrespondence") {
    const c = v as Contract.AdmissionCorrespondence;
    if ("service" in c.originalRelease) require(c.originalRelease.service === c.context.service, `${path}.originalRelease`);
  }
  if (kind === "FoundingHold" || kind === "RefusalHold") {
    const hold = v as Contract.FoundingHold | Contract.RefusalHold;
    if (hold.reason === "conflict") for (const group of hold.inputs) require(group.candidates.length >= 2, `${path}.inputs`);
  }
  if (kind === "SignaturePayload") {
    const p = v as Contract.SignaturePayload;
    if (p.subject.kind === "binding-set") require(p.subject.id === p.bindingSet, `${path}.subject`);
  }
  if (kind === "BuildRecord") {
    const b = v as Contract.BuildRecord;
    require(new Set(b.tools.map((tool) => tool.role)).size === b.tools.length, `${path}.tools`);
  }
}
/** Syntax/canonical record correctness only. Even SelectionResult.selected is untrusted parsed data here. */
export function parseBundleRecord<K extends BundleRecordKind>(kind: K, bytes: Uint8Array, limits: BundleLimits): BundleResult<BundleRecords[K]> {
  return bundleAttempt(() => {
    if (!Object.hasOwn(SCHEMAS, kind)) fail("schema", "kind");
    const value = boundedCanonical(bytes, limits);
    checkRecord(kind, value, kind);
    return value as BundleRecords[K];
  });
}
/** Correct Ed25519 domain signature and declared anchor equality; no configured-trust/admission verdict. */
export function checkBundleSignature(envelopeBytes: Uint8Array, anchorBytes: Uint8Array, limits: BundleLimits): BundleResult<Contract.SignaturePayload> {
  return bundleAttempt(() => {
    checkBundleLimits(limits);
    if (envelopeBytes.length + anchorBytes.length > limits.bytes) fail("limits", "signature.bytes");
    const envelope = parsed("SignatureEnvelope", envelopeBytes, limits);
    const anchor = parsed("TrustAnchor", anchorBytes, limits);
    const p = envelope.payload;
    const anchorId = digestBytes(semanticContentBytes("artroom-bundle-trust-anchor-1", anchor));
    if (p.anchor !== anchorId || p.service !== anchor.service || p.publisher !== anchor.publisher) fail("conflict", "signature.anchor");
    if (!verify(anchor.publisher, envelope.sig, semanticContentBytes("artroom-semantic-signature-1", p))) fail("signature", "signature.sig");
    return p;
  });
}
/** Both exact keys sign the anchor-change domain, never an intent domain or inferred outgoing custody. */
export function checkAnchorChange(changeBytes: Uint8Array, priorBytes: Uint8Array, nextBytes: Uint8Array, limits: BundleLimits): BundleResult<Contract.AnchorChange> {
  return bundleAttempt(() => {
    checkBundleLimits(limits);
    if (changeBytes.length + priorBytes.length + nextBytes.length > limits.bytes) fail("limits", "anchor-change.bytes");
    const change = parsed("SignedAnchorChange", changeBytes, limits);
    const prior = parsed("TrustAnchor", priorBytes, limits), next = parsed("TrustAnchor", nextBytes, limits);
    const p = change.payload;
    if (p.service !== prior.service || p.service !== next.service
      || p.prior !== digestBytes(semanticContentBytes("artroom-bundle-trust-anchor-1", prior))
      || p.next !== digestBytes(semanticContentBytes("artroom-bundle-trust-anchor-1", next))) fail("conflict", "anchor-change");
    const bytes = semanticContentBytes("artroom-bundle-anchor-change-1", p);
    if (!verify(prior.publisher, change.priorSignature, bytes) || !verify(next.publisher, change.nextSignature, bytes)) fail("signature", "anchor-change");
    return p;
  });
}
export function parsed<K extends BundleRecordKind>(kind: K, bytes: Uint8Array, limits: BundleLimits): BundleRecords[K] {
  const result = parseBundleRecord(kind, bytes, limits);
  if (!result.ok) fail(result.reason, result.path);
  return result.value;
}

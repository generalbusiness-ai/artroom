/** Adopted b74/0bc semantic-bundle data contract. These records do not grant access, trust, admission or execution. */
import type { Digest, ScopeRef, FactRef, Seed, Timestamp, KeyId, Base64Url } from "./scope.ts";
import type { PlatformDefinition } from "./scope.ts";
import type { Head } from "./result.ts";
import type { CapabilityName } from "./capability.ts";
import type { RetainedInput } from "./read.ts";
import type { Prepared } from "./entry.ts";
export type ArtifactId = Digest;
export type BundleId = Digest; type BindingId = Digest; type BindingSetId = Digest;
export type AnchorId = Digest; type ServiceId = Digest;
export type ModuleId = string;             // canonical inventory-relative path
export interface ArtifactRef {
  digest: ArtifactId; bytes: number;
  encoding: "raw" | "utf8" | "canonical-json";
}
export interface EvidenceRef {
  artifact: ArtifactRef;
  kind: "source-inventory" | "build-output" | "deployment-output"
      | "admission-output" | "operator-statement" | "owner-decision"
      | "independent-review" | "compatibility-report";
}
export interface ServiceIdentity {
  format: "artroom-logical-service-1";
  name: string;                      // exact owner-assigned logical identity
  provenance: EvidenceRef;
}

export interface ImportRecord {
  specifier: string;
  target: { kind: "module"; module: ModuleId }
        | { kind: "runtime"; feature: "ecmascript" | "webcrypto" | "text-codec" | "url" };
}
export type ABISlot = "bytes" | "records" | "validate" | "count" | "runnable"
  | "profile-admit" | "rule-prepare" | "rule-evaluate"
  | "judge-genesis" | "judge-act" | "judge-delivery" | "judge-timed"
  | "judge-preparation" | "judge-outcome" | "judge-diagnosis"
  | "judge-checkpoint" | "judge-grant" | "fold" | "snapshot"
  | "clock" | "reservation" | "capabilities" | "owners"
  | "platform-rules" | "observed" | "observed-values"
  | "membership-reference" | "rules-reference" | "revision-kind";
export interface ExportRecord { name: string; signature: ABISlot }
export interface ModuleRecord {
  id: ModuleId; source: ArtifactRef;
  imports: ImportRecord[]; exports: ExportRecord[];
}
export interface ExportRef { module: ModuleId; name: string; signature: ABISlot }
export interface ComponentRecord {
  role: ABISlot;
  root: ExportRef;
  closure: ModuleId[];
}
export interface MarkRecord {
  path: string; code: string;
  place: "grant" | "also" | "type" | "guard" | "effect" | "send" | "outcome";
  export: ExportRef;
}
export interface PlatformRecord {
  kind: "platform"; named: PlatformDefinition;
  data: ArtifactRef; dataDigest: Digest;
  marks: MarkRecord[];
  observed: ExportRef | null; observedValues: ExportRef | null;
  membership: ExportRef | null; rulesScope: ExportRef | null;
  revisionKind: string | null;
}
export interface DeclaredRecord {
  kind: "declared"; named: Digest;
  data: ArtifactRef; dataDigest: Digest;
  creates: Digest[];
}
export interface CapabilityRecord {
  named: CapabilityName; schema: ArtifactRef;
  forms: ExportRef; steps: ExportRef; records: ExportRef;
  owners: { kind: string; rule: ExportRef; closure: ArtifactRef }[];
  domains: string[];
}
export interface ProfileRecord {
  named: string; interpreter: ArtifactRef;
  admit: ExportRef; prepare: ExportRef; evaluate: ExportRef;
  language: ArtifactRef; functions: ArtifactRef;
  budgets: ArtifactRef; fingerprint: ArtifactRef;
}

export interface BoundsRecord {
  format: "artroom-semantic-bounds-1";
  schema: ArtifactRef; values: ArtifactRef;
  applies: "historical-admission";
}
export interface DomainRecord {
  tag: string; algorithm: "sha256" | "ed25519" | "hmac-sha256" | "sha1";
  framing: "tag-newline-canonical" | "canonical" | "raw";
  schema: ArtifactRef;
  maxBytes: number | null;
}
export interface DomainsRecord {
  format: "artroom-semantic-domains-1"; records: DomainRecord[];
}
export interface BuildEnvironment {
  format: "artroom-pure-build-environment-1";
  entries: { name: string; value: string }[];
}
export interface RuntimeCompatibility {
  format: "artroom-pure-runtime-1";
  runtime: ArtifactRef; moduleFormat: "esm" | "commonjs";
  platform: string; flags: string[]; globals: ArtifactRef;
}
export interface BuildInput { path: ModuleId; artifact: ArtifactRef }
export interface BuildRecord {
  format: "artroom-pure-build-1";
  sourceCommit: string; sourceTree: string;
  inputs: BuildInput[];
  tools: { role: "runtime" | "package-manager" | "compiler" | "bundler";
           executable: ArtifactRef; version: string }[];
  recipe: ArtifactRef; arguments: string[];
  environment: ArtifactRef; compatibility: ArtifactRef;
  outputs: { path: ModuleId; artifact: ArtifactRef }[];
}
export type EvidenceClass =
  | { class: "original-retained"; evidence: EvidenceRef[] }
  | { class: "fresh-reconstruction"; evidence: EvidenceRef[];
      original: MissingEvidence }
  | { class: "operator-attested"; statement: EvidenceRef;
      underlying: EvidenceRef[]; original: MissingEvidence }
  | { class: "missing"; missing: MissingEvidence };
export interface MissingEvidence {
  reason: "not-retained" | "not-produced" | "not-identified";
  subject: string; handoff: "71b6dde2dc9059659f8fb1b606f85f13162232ce";
}
export interface SemanticBundleManifest {
  format: "artroom-semantic-bundle-1";
  abi: ArtifactRef; modules: ModuleRecord[]; components: ComponentRecord[];
  definitions: (PlatformRecord | DeclaredRecord)[];
  capabilities: CapabilityRecord[]; profiles: ProfileRecord[];
  bounds: BoundsRecord; domains: ArtifactRef; build: ArtifactRef;
  executable: ArtifactRef;
  buildEvidence: EvidenceClass;
}

export interface HistoricalContext {
  service: ServiceId; scope: ScopeRef;
  genesis: FactRef; named: Digest | PlatformDefinition; targetHead: Head;
}
export interface HistoryChunk {
  format: "artroom-scope-history-chunk-1";
  scope: ScopeRef; genesis: FactRef; first: number; last: number;
  entries: { seq: number; hash: Digest; bytes: ArtifactRef }[];
}
export interface ScopeCoverage {
  context: HistoricalContext;
  genesisBytes: ArtifactRef;
  history: { first: number; last: number; entries: ArtifactRef }[];
  retained: { kind: RetainedInput["kind"]; digest: Digest;
              domain: string | null; artifact: ArtifactRef }[];
  uses: { user: FactRef; source: FactRef;
          sourceContext: HistoricalContext; role: "creator" | "fact" | "observation"
              | "retained-entry" | "text" | "value" }[];
}
export interface ReleaseClaim {
  service: ServiceId; release: string;
  sourceCommit: string; sourceTree: string;
  executable: ArtifactRef; build: ArtifactRef;
  deployedAt: Timestamp | null;
  evidence: Extract<EvidenceClass, { class: "original-retained" }>;
}
export interface AdmissionCorrespondence {
  context: HistoricalContext;
  bundle: BundleId;
  originalRelease: ReleaseClaim | MissingEvidence;
  alternative: Extract<EvidenceClass, { class: "fresh-reconstruction"
    | "operator-attested" }> | null;
  scopeCoverage: ArtifactRef;
  adjudication: EvidenceRef; independentReview: EvidenceRef;
}
export interface HistoricalSourceBinding {
  format: "artroom-source-binding-1";
  context: HistoricalContext; bundle: BundleId;
  coverage: ArtifactRef; admission: ArtifactRef;
  decision: EvidenceRef;
}
export interface BindingSetRevision {
  format: "artroom-source-binding-set-1";
  service: ServiceId; revision: number; parent: BindingSetId | null;
  bindings: { context: HistoricalContext; binding: BindingId }[];
  decision: EvidenceRef;
}

export interface TrustAnchor {
  format: "artroom-bundle-trust-anchor-1";
  service: ServiceId; publisher: KeyId;
  first: { revision: number; bindingSet: BindingSetId };
  authority: EvidenceRef; custody: EvidenceRef;
}
export interface SignaturePayload {
  format: "artroom-semantic-signature-1";
  service: ServiceId; anchor: AnchorId; publisher: KeyId;
  subject: { kind: "manifest"; id: BundleId }
         | { kind: "binding-set"; id: BindingSetId };
  bindingSet: BindingSetId; revision: number; parent: BindingSetId | null;
}
export interface SignatureEnvelope { payload: SignaturePayload; sig: Base64Url }
export interface AnchorChange {
  format: "artroom-bundle-anchor-change-1";
  service: ServiceId; prior: AnchorId; next: AnchorId;
  at: { revision: number; bindingSet: BindingSetId };
  decision: EvidenceRef;
}
export interface SignedAnchorChange {
  payload: AnchorChange; priorSignature: Base64Url; nextSignature: Base64Url;
}

export type ABIType = "Entry" | "Input" | "ScopeRef" | "FactRef" | "FieldValue"
  | "StateSnapshot" | "StateView" | "StateWriter" | "Own" | "Fetched"
  | "RuleGiven" | "RuleInput" | "Prepared" | "ObservationUse" | "ValueRead"
  | "Reading" | "Clock" | "Bounds" | "ValidDefinition" | "Capabilities"
  | "Owners" | "PlatformRules" | "Judgment" | "Draft" | "Refusal"
  | "CanonicalValue" | "Bytes" | "Digest";
export interface ABITypeRecord { name: ABIType; schema: ArtifactRef }
export interface ABISignature {
  slot: ABISlot; contract: ArtifactRef;
  inputs: ABIType[]; output: ABIType;
  timing: "synchronous" | "pure-async";
  failure: "typed-refusal-or-value" | "deterministic-profile-refusal-or-fault"
         | "fault-halts";
}
export interface ABIRecord {
  format: "artroom-pure-evaluator-1";
  types: ABITypeRecord[]; signatures: ABISignature[];
  stateReader: ArtifactRef; stateWriter: ArtifactRef;
  runtime: ArtifactRef;
}

export type SelectionSubject =
  | { kind: "born"; context: HistoricalContext; binding: BindingId }
  | { kind: "founding"; service: ServiceId; seed: Seed;
      intent: Digest; admission: ArtifactId };
export interface SelectionPin {
  service: ServiceId; subject: SelectionSubject;
  bundle: BundleId; abi: ArtifactId;
  bindingSet: BindingSetId; revision: number;
  activationTuple: Digest; runtimeRelease: ArtifactId;
  compatibility: ArtifactId;
}
export interface PreparedSelection {
  pin: SelectionPin;
  before: Head | null;
  input: Digest;
  retainedInputs: { kind: RetainedInput["kind"]; digest: Digest;
                    domain: string | null; artifact: ArtifactRef }[];
  prepared: Prepared[];
}
export interface FoundingTarget {
  service: ServiceId;
  seed: Seed;
  intent: Digest;
}
export type FoundingAdmissionInput = "admission" | "binding-set" | "activation-tuple"
  | "bundle" | "abi" | "runtime-release" | "compatibility";
export type FoundingHold =
  | { reason: "unavailable"; inputs: FoundingAdmissionInput[] }
  | { reason: "conflict";
      inputs: { input: FoundingAdmissionInput; candidates: Digest[] }[] };
export interface RecordedRefusalTarget {
  service: ServiceId; scope: ScopeRef;
  genesis: FactRef; named: Digest | PlatformDefinition; targetHead: Head;
  genesisBytes: ArtifactRef;
  history: { first: number; last: number; entries: ArtifactRef }[];
  retained: { kind: RetainedInput["kind"]; digest: Digest;
              domain: string | null; artifact: ArtifactRef }[];
  refusalSchema: ArtifactRef;
}
export type RefusalCorrespondenceInput = "historical-admission" | "source-binding"
  | "bundle" | "abi" | "local-adapter" | "runtime-compatibility";
export type RefusalHold =
  | { reason: "unavailable"; inputs: RefusalCorrespondenceInput[] }
  | { reason: "conflict";
      inputs: { input: RefusalCorrespondenceInput; candidates: Digest[] }[] };
export type SelectionResult =
  | { result: "selected"; pin: SelectionPin }
  | { result: "unresolved"; context: HistoricalContext; missing: MissingEvidence[] }
  | { result: "conflict"; context: HistoricalContext; candidates: BindingId[] }
  | { result: "founding-held"; target: FoundingTarget; hold: FoundingHold }
  | { result: "existing-refused-held"; target: RecordedRefusalTarget;
      hold: RefusalHold };

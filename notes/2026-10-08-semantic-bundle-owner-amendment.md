# Immutable semantic bundle correspondence

Draft for review under existing `48407a70` and `9be26ef7`, governed by
`c8318a8a06bf88e7ee1422c4ce99c34f602a439f` and adoption
`a515f21b5e1f3f3e1fa75c222722a825255fd8fa`. This proposes a narrow artifact
manifest and contextual interface around the existing evaluator. It is no
implementation, binding publication, bootstrap grant or activation.

This is the prepared proposed successor, following Root review of the complete
changes-requested verdict `28966df36e361fe4ab19efbb0bb8e177422aaa88` and
planner disposition `bb63707edec5a7129ce4cad39d7dbfdc71d4d4ec`, both read in
full through builder in the explicit repository workroom. The frozen review
subject remains `4823ec753940b935d25876a46e67c2e79e2a5f73`; its unchanged
711-line predecessor is retained at `/tmp/artroom-bundle-482-predecessor.md`,
SHA-256
`a745d8abb45475a88c3fd39f70b7cef03cf6892ecfaee1bc0e58b92e0ac349cc`.
The previously reviewed founding-held scratch
proposal is applied below. The recorded-refusal target/result is an additional
proposed owner amendment, requiring complete normal successor DESIGN review
before adoption; neither failure variant creates runnable history or access.

## Evidence inspected and its limits

Read-only inspection used the packet's schema and bounded metadata
projections, its source-family/gap records, validation-ledger provenance and
limits, and the operator gap handoff. It did not reread all 474321 packet
bytes or every archive payload, revalidate signatures, or execute project code.
The packet reports seven fresh tracked source snapshots: original `52`,
clone-era `87`, initial `662`, intermediate `8ec`, strict-birth `3ca`, landed
`cf4`, and future `13ae`. The ledger reports 1607 native payload comparisons,
3364 structural/file-correspondence checks and no failures. These are the
ledger's assertions, not a new validation run by this author.

| Evidence | SHA-256 of inspected file |
|---|---|
| `/tmp/artroom-history-correspondence/packet.json` | `1c175bd5e9417e6d77685f60c454edcfa0067124aea5c858161975a5e603de2d` |
| `/tmp/artroom-history-correspondence/summary.json` | `937166e96f9f249689dcbc9e9fa55fb8804733d4f7dc0a602eb61619a24b43b5` |
| `/tmp/artroom-history-correspondence/validation-ledger.json` | `f499cb90951ecd6445f1c422a2a6d8e62d7f619f5dcb9c50a4c172cafb301250` |
| `/tmp/artroom-history-correspondence/operator-gap-handoff.json` | `c9da8c6dc877073d288eb85eb49a4c96bfc9d47c4ba044d019e0cffb7da1f8b2` |

The snapshots exclude package test suites, docs, notes and Worker deployment
configuration. They include test tsconfigs and root script tests; they do not
exclude every file associated with testing. The
ledger separately hashes native configuration, but a hash is not retention
of its bytes. They contain no original executable Worker bundle or original
toolchain/evaluator/admission receipt. The packet's broader snapshot wording
must be read with this explicit exclusion, not as a deployable release claim.
Selected `3ca`/`cf4` file maps match; different tar hashes reflect archive
metadata. Neither equality nor fresh reconstruction proves which release
admitted a historical entry.

Only register/destination genesis byte-backed projections are established
for the isolated family. Directory/rules references are not their bytes;
membership/inbox genesis bytes are not established here. The planner's
14:19/17:35 and 19:47–19:51 records lack the complete original scope/incarnation,
genesis/head/reference closure and admission/build bindings. Original `52`
has no actual scope-to-source admission mapping in this evidence. The seven
snapshots are not an exhaustive catalog of legacy meanings.

`packages/platform/test/fixtures/native-093-source.json` is narrower still:
native module hashes and previous catalog identity, not executable dependency
closure or historical source attribution. Existing Gate1 source packets
are review/source inventories, not semantic-bundle release receipts.

The reviewed 684-line scratch predecessor is retained unchanged at
`/tmp/artroom-bundle-manifest-correspondence-reviewed-684.md`, SHA-256
`dffa084d00f78e35571d56550f2fe10ad61a91987d09af4c0cef481d3f581869`.
This note adds the explicit artifact privacy boundary below. It remains a
proposed owner amendment for normal DESIGN review, not source approval or
permission to implement or activate the parser/loader.

## Proposed canonical wire contract

This is the exact proposed owner amendment, still requiring normal review and
adoption before executable integration. Identifiers below are proposed schema
and domain names, not allocated runtime definitions. TypeScript notation is
only notation: no parser, loader, signature check or Store field exists yet.

Every object has exactly its listed own fields. A union accepts only its named
variant. There are no optional fields: absence is explicit null where allowed.
Strings are well-formed Unicode; identifiers use existing guards. Counts and
positions are nonnegative safe integers, never negative zero. Canonical JSON
is the existing Artroom profile, with duplicate keys, invalid UTF-8, BOM, lone
surrogates and noncanonical byte forms refused. No property is a function,
class instance, Map, Set, undefined or executable expression.

ArtifactId is SHA-256 of actual raw retained bytes, using digestBytes. The
same bytes have the same ArtifactId regardless of label. Typed ContentIds use
SHA-256 of UTF8(tag + "\n") followed by canonicalBytes(payload). They are
carried outside the payload; no payload contains its own ID or signature.
Proposed tags are closed: artroom-semantic-bundle-1,
artroom-source-binding-1, artroom-source-binding-set-1,
artroom-semantic-signature-1, artroom-bundle-trust-anchor-1 and
artroom-bundle-anchor-change-1. They do not change any historical byte domain.
An algorithm change requires a new identity, not an alias for this one.

```ts
type ArtifactId = Digest;
type BundleId = Digest; type BindingId = Digest; type BindingSetId = Digest;
type AnchorId = Digest; type ServiceId = Digest;
type ModuleId = string;             // canonical inventory-relative path
interface ArtifactRef {
  digest: ArtifactId; bytes: number;
  encoding: "raw" | "utf8" | "canonical-json";
}
interface EvidenceRef {
  artifact: ArtifactRef;
  kind: "source-inventory" | "build-output" | "deployment-output"
      | "admission-output" | "operator-statement" | "owner-decision"
      | "independent-review" | "compatibility-report";
}
interface ServiceIdentity {
  format: "artroom-logical-service-1";
  name: string;                      // exact owner-assigned logical identity
  provenance: EvidenceRef;
}
```

ServiceId is the raw ArtifactId of the canonical ServiceIdentity bytes. The
configured anchor selects it; a scope, URL, Worker label or TLS certificate
cannot mint a trusted service identity. Its name has no resolution behavior.
Canonical record artifacts have encoding canonical-json and must parse as
their exact named schema, not merely some canonical JSON. Artifact labels
are claims until the retained bytes and evidence are checked.
A local filesystem path or acquisition URL is not part of ArtifactRef and
cannot select authority. An ArtifactRef whose bytes are missing remains
missing, even if its digest is known. All acquisition budgets are supplied
before allocation, decoding or traversal; none has a default here.

## Finite artifact, module and evaluator records

```ts
interface ImportRecord {
  specifier: string;
  target: { kind: "module"; module: ModuleId }
        | { kind: "runtime"; feature: "ecmascript" | "webcrypto" | "text-codec" | "url" };
}
type ABISlot = "bytes" | "records" | "validate" | "count" | "runnable"
  | "profile-admit" | "rule-prepare" | "rule-evaluate"
  | "judge-genesis" | "judge-act" | "judge-delivery" | "judge-timed"
  | "judge-preparation" | "judge-outcome" | "judge-diagnosis"
  | "judge-checkpoint" | "judge-grant" | "fold" | "snapshot"
  | "clock" | "reservation" | "capabilities" | "owners"
  | "platform-rules" | "observed" | "observed-values"
  | "membership-reference" | "rules-reference" | "revision-kind";
interface ExportRecord { name: string; signature: ABISlot }
interface ModuleRecord {
  id: ModuleId; source: ArtifactRef;
  imports: ImportRecord[]; exports: ExportRecord[];
}
interface ExportRef { module: ModuleId; name: string; signature: ABISlot }
interface ComponentRecord {
  role: ABISlot;
  root: ExportRef;
  closure: ModuleId[];
}
interface MarkRecord {
  path: string; code: string;
  place: "grant" | "also" | "type" | "guard" | "effect" | "send" | "outcome";
  export: ExportRef;
}
interface PlatformRecord {
  kind: "platform"; named: PlatformDefinition;
  data: ArtifactRef; dataDigest: Digest;
  marks: MarkRecord[];
  observed: ExportRef | null; observedValues: ExportRef | null;
  membership: ExportRef | null; rulesScope: ExportRef | null;
  revisionKind: string | null;
}
interface DeclaredRecord {
  kind: "declared"; named: Digest;
  data: ArtifactRef; dataDigest: Digest;
  creates: Digest[];
}
interface CapabilityRecord {
  named: CapabilityName; schema: ArtifactRef;
  forms: ExportRef; steps: ExportRef; records: ExportRef;
  owners: { kind: string; rule: ExportRef; closure: ArtifactRef }[];
  domains: string[];
}
interface ProfileRecord {
  named: string; interpreter: ArtifactRef;
  admit: ExportRef; prepare: ExportRef; evaluate: ExportRef;
  language: ArtifactRef; functions: ArtifactRef;
  budgets: ArtifactRef; fingerprint: ArtifactRef;
}
```

ModuleId is a nonempty slash-separated relative path with no empty, dot,
dot-dot or backslash component, and no leading slash. It names retained
source, not a URL or executable lookup. Modules are sorted by ModuleId;
imports by specifier, exports by name, components by role, marks by path,
definitions/capabilities/profiles by named. Duplicate keys in these arrays
are refused. closure is the sorted unique transitive import closure including
the root; it must equal the edges actually resolved for that root. Cycles in
module imports are permitted only if the retained toolchain's actual module
semantics admit them; they do not permit a cycle in content-ID dependencies.
Every external library is another retained module/artifact, not just a package
version. Runtime imports are limited to the four named pure ABI features;
other implicit globals/imports require a new reviewed ABI identity.

An ExportRecord's signature must match its use; a loader cannot cast an
arbitrary export into a role. Each role has one component root in this bundle;
multiple platform definitions are data plus their closed mark/export records,
not runtime plugin slots. The ABI artifact supplies the precise function and
result representation for each slot. Capability forms, steps, record folding,
owner outcome/unknown/closure/reservation semantics and all rule dependencies
are included. A declared definition's digest uses its historical definition
domain; matching raw source digests cannot replace that named digest.

A missing observed/reference/revision export is explicit null with the
historical meaning specified by that exact ABI. Null is not permission to
use today's helper. In particular, absent membership derivation may mean
that the recorded reference is in genesis; absent rules derivation can mean
unsupported observation. The loader must implement that distinction rather
than invent it. Profiles bind the interpreter, allowed function set, budget
value, admission, preparation and evaluation together. JSONata 2.2.2 and an
engine fingerprint are current source facts, not sufficient retained closure.

```ts
interface BoundsRecord {
  format: "artroom-semantic-bounds-1";
  schema: ArtifactRef; values: ArtifactRef;
  applies: "historical-admission";
}
interface DomainRecord {
  tag: string; algorithm: "sha256" | "ed25519" | "hmac-sha256" | "sha1";
  framing: "tag-newline-canonical" | "canonical" | "raw";
  schema: ArtifactRef;
  maxBytes: number | null;
}
interface DomainsRecord {
  format: "artroom-semantic-domains-1"; records: DomainRecord[];
}
interface BuildEnvironment {
  format: "artroom-pure-build-environment-1";
  entries: { name: string; value: string }[];
}
interface RuntimeCompatibility {
  format: "artroom-pure-runtime-1";
  runtime: ArtifactRef; moduleFormat: "esm" | "commonjs";
  platform: string; flags: string[]; globals: ArtifactRef;
}
interface BuildInput { path: ModuleId; artifact: ArtifactRef }
interface BuildRecord {
  format: "artroom-pure-build-1";
  sourceCommit: string; sourceTree: string;
  inputs: BuildInput[];
  tools: { role: "runtime" | "package-manager" | "compiler" | "bundler";
           executable: ArtifactRef; version: string }[];
  recipe: ArtifactRef; arguments: string[];
  environment: ArtifactRef; compatibility: ArtifactRef;
  outputs: { path: ModuleId; artifact: ArtifactRef }[];
}
type EvidenceClass =
  | { class: "original-retained"; evidence: EvidenceRef[] }
  | { class: "fresh-reconstruction"; evidence: EvidenceRef[];
      original: MissingEvidence }
  | { class: "operator-attested"; statement: EvidenceRef;
      underlying: EvidenceRef[]; original: MissingEvidence }
  | { class: "missing"; missing: MissingEvidence };
interface MissingEvidence {
  reason: "not-retained" | "not-produced" | "not-identified";
  subject: string; handoff: "71b6dde2dc9059659f8fb1b606f85f13162232ce";
}
interface SemanticBundleManifest {
  format: "artroom-semantic-bundle-1";
  abi: ArtifactRef; modules: ModuleRecord[]; components: ComponentRecord[];
  definitions: (PlatformRecord | DeclaredRecord)[];
  capabilities: CapabilityRecord[]; profiles: ProfileRecord[];
  bounds: BoundsRecord; domains: ArtifactRef; build: ArtifactRef;
  executable: ArtifactRef;
  buildEvidence: EvidenceClass;
}
```

Domain records sort by tag, reject duplicate tags and bind the historical
schema/encoding as well as its algorithm. Their maxima are actual historical
values where the source declared one; null means that no per-domain maximum
was historically declared, not unlimited current acquisition. BoundsRecord
values must be the full value of its retained schema, including every field;
no Partial<Bounds>, current PROPOSED_BOUNDS, missing-zero or newest-profile
fallback is allowed. Current acquisition/serving limits are separate owner
inputs, never a replacement for those historical semantics.

Build records retain manifests/lock/dependency artifacts, export/tsconfig
resolution, generator inputs/outputs, recipe, arguments, nonsecret relevant
environment/platform flags and actual toolchain executable closure. Build
paths/outputs are sorted unique; tool roles are unique. Environment entries
are sorted unique by name and contain only the actual nonsecret inputs used;
RuntimeCompatibility binds the exact flags/global contracts. Secret or
unavailable build inputs cannot be replaced by invented empty strings. Their
absence is a held reproducibility limitation, not a request to publish them. A fresh build receipt
names the exact BuildRecord, input closure and output artifact hashes. An
original receipt retains its original bytes unchanged. Neither points at a
manifest containing that receipt: this prevents a content-ID cycle. Reviews
or attestations over a final manifest are retained separately and referenced
by binding/admission decisions after the manifest ID exists.

The content DAG is bottom-up: raw artifact bytes, then module/export and
schema inventories, build/output evidence, then manifest, then binding, then
binding-set revision, then signature envelope. Artifact references may point
to earlier nodes only; reject self-reference, missing closure and conflicting
length/encoding for the same bytes. Signatures and later reviews are never
inserted into the content they sign. Module import cycles are graph edges
inside an inventory and cannot back-reference its containing manifest ID.

## Artifact privacy and existing access authority

Code/build manifests, content hashes, references and signed metadata do not
authorize acquisition or publication of historical entries, retained values,
private custody or credential-bearing bytes. ScopeCoverage original-byte
artifacts may exist only under already-authorized protected retention and
access. Their ArtifactRefs identify bytes; they grant no public read, export,
bootstrap or wider service permission. Public/nonsecret code artifacts and
protected historical proof inputs retain their distinct access requirements.

Preserve original sealed joins and other entries unchanged in that authorized
protected custody. A redacted export or reserialized substitute is not the
original sealed artifact and cannot fill its reference or prove its original
hash. Do not expose credential plaintext, invitation secrets, signing keys,
raw private values or private custody through 71b or this proposal. Any existing
safe export must use its separately authorized nonsecret metadata boundary.
Missing authorized original bytes stay missing, even when a hash or signature
is available; this is no authorization for a new probe or acquisition path.

## Exact scope coverage and admission correspondence

```ts
interface HistoricalContext {
  service: ServiceId; scope: ScopeRef;
  genesis: FactRef; named: Digest | PlatformDefinition; targetHead: Head;
}
interface HistoryChunk {
  format: "artroom-scope-history-chunk-1";
  scope: ScopeRef; genesis: FactRef; first: number; last: number;
  entries: { seq: number; hash: Digest; bytes: ArtifactRef }[];
}
interface ScopeCoverage {
  context: HistoricalContext;
  genesisBytes: ArtifactRef;
  history: { first: number; last: number; entries: ArtifactRef }[];
  retained: { kind: RetainedInput["kind"]; digest: Digest;
              domain: string | null; artifact: ArtifactRef }[];
  uses: { user: FactRef; source: FactRef;
          sourceContext: HistoricalContext; role: "creator" | "fact" | "observation"
              | "retained-entry" | "text" | "value" }[];
}
interface ReleaseClaim {
  service: ServiceId; release: string;
  sourceCommit: string; sourceTree: string;
  executable: ArtifactRef; build: ArtifactRef;
  deployedAt: Timestamp | null;
  evidence: Extract<EvidenceClass, { class: "original-retained" }>;
}
interface AdmissionCorrespondence {
  context: HistoricalContext;
  bundle: BundleId;
  originalRelease: ReleaseClaim | MissingEvidence;
  alternative: Extract<EvidenceClass, { class: "fresh-reconstruction"
    | "operator-attested" }> | null;
  scopeCoverage: ArtifactRef;
  adjudication: EvidenceRef; independentReview: EvidenceRef;
}
interface HistoricalSourceBinding {
  format: "artroom-source-binding-1";
  context: HistoricalContext; bundle: BundleId;
  coverage: ArtifactRef; admission: ArtifactRef;
  decision: EvidenceRef;
}
interface BindingSetRevision {
  format: "artroom-source-binding-set-1";
  service: ServiceId; revision: number; parent: BindingSetId | null;
  bindings: { context: HistoricalContext; binding: BindingId }[];
  decision: EvidenceRef;
}
```

HistoricalContext.genesis has seq zero, at exactly scope, and the hash of the
retained canonical applied genesis bytes. Its seed, kind/incarnation, declared
pin and scopeIdOf(seed) must agree. Head coverage starts at zero and is gap-free
through targetHead, with entry canonicality, entry-domain hash and every prev
link checked. Each entries artifact is a canonical HistoryChunk; its exact scope/genesis,
first/last and ordered sequence list must match the referring range. Its entry
artifacts retain original bytes unchanged, not a JSON reserialization.
Ranges are ordered, adjacent and nonoverlapping; an empty
coverage cannot resolve a born scope. uses records are sorted by full user,
role and source; each edge is extracted from retained actual entry/observation/
value/text facts, not accepted because the publisher listed it. Every foreign
source has its own full-context binding and at-least-source-position coverage.
sourceContext.targetHead is that exact required source head, whose ancestry
the selected source binding must cover. Foreign proof edges carry contexts,
not reciprocal BindingIds: parent/child histories can cite earlier facts of
one another without a circular content hash of their coverage/binding nodes.
The accepted binding set resolves each edge independently by full context and
verified ancestor coverage. Logical proof traversal and the immutable artifact
DAG are distinct; neither grants a name-only fallback.
A cyclic proof closure requires the existing replay causal checks; it is not
permission to resolve conflicting genesis/head identities.

Retained inputs are sorted by kind/domain/digest, with domain nonnull exactly
for kind value. Their bytes must match the historical named hash/framing and
their owning entry's use. ScopeCoverage and AdmissionCorrespondence are
canonical retained artifacts; their ArtifactId names actual bytes. The binding,
coverage and admission contexts and bundle must agree exactly. originalRelease
must identify the actual original admission release and its correspondence;
a current release, successful replay, feature fingerprint, Git timestamp or
newly signed assertion cannot create that evidence. Full Git IDs/Worker
release identities are retained text validated under the retained schemas,
not accepted prefixes. An unknown original is an explicit missing evidence
record, never a fabricated original ReleaseClaim. An alternative remains in
its separate field and requires the exact owner disposition below; it cannot
fill originalRelease or relabel fresh build evidence as original.

Each binding covers one genesis and one endpoint under one whole bundle.
There is no interval migration or global name-based resolution here. Histories
requiring mixed semantics remain unresolved pending a separately reviewed
owner mechanism. Resolving a lower target requires proving it is an ancestor
of the covered endpoint, not merely seq <= targetHead.seq. Extending coverage
requires a new binding naming the unchanged verified prefix, new exact endpoint
and actual continued-admission correspondence. It never edits the old binding.

EvidenceRef decision/review artifacts approve an earlier candidate tuple or
inventory, not the final containing BindingId/BindingSetId that includes their
own artifact hash. Candidate subjects name service/context/bundle/coverage/
admission, or service/revision/parent/sorted binding list, respectively. Later
reviews may name the final content ID, but stay outside it. This keeps owner
approval and signature publication attributable without circular hashes.

BindingSetRevision is a finite service-specific inventory, not an application
or plugin registry. Sort bindings by full context and prohibit competing
bundles for one genesis/overlapping coverage. A repeated revision with different
content is a conflict. The first accepted revision is the anchor's exact pin;
subsequent revisions advance by one and name the exact accepted parent. No
wall-clock sorting, remote newest or rollback overrides this chain. Old binding
bytes, coverage and outstanding duty provenance remain retained when a later
revision holds their execution. Removing a tuple's execution compatibility is
not deletion of an admitted scope, attempt or cleanup duty.

## Signatures, configured trust and evidence classes

```ts
interface TrustAnchor {
  format: "artroom-bundle-trust-anchor-1";
  service: ServiceId; publisher: KeyId;
  first: { revision: number; bindingSet: BindingSetId };
  authority: EvidenceRef; custody: EvidenceRef;
}
interface SignaturePayload {
  format: "artroom-semantic-signature-1";
  service: ServiceId; anchor: AnchorId; publisher: KeyId;
  subject: { kind: "manifest"; id: BundleId }
         | { kind: "binding-set"; id: BindingSetId };
  bindingSet: BindingSetId; revision: number; parent: BindingSetId | null;
}
interface SignatureEnvelope { payload: SignaturePayload; sig: Base64Url }
interface AnchorChange {
  format: "artroom-bundle-anchor-change-1";
  service: ServiceId; prior: AnchorId; next: AnchorId;
  at: { revision: number; bindingSet: BindingSetId };
  decision: EvidenceRef;
}
interface SignedAnchorChange {
  payload: AnchorChange; priorSignature: Base64Url; nextSignature: Base64Url;
}
```

Use existing Ed25519 verification and signature/KeyId guards over the signature
domain framing of SignaturePayload. A manifest signature attaches that exact
manifest to the named binding-set revision/parent; a binding-set signature
covers the set itself and its subject.id equals bindingSet. A signed manifest
must be referenced by an accepted binding in that exact set. Both must agree
with the configured anchor and accepted set. Parent is null only for its
configured first revision. The publisher
must be the anchor key, not a room member chosen by the manifest. A signature
proves that key signed these bytes; it cannot turn the key's claims into
original deployment evidence or independent review.

Anchor bytes/ServiceId and actual operator authority/custody are independently
provisioned nonsecret trust inputs. Network discovery never supplies its own
anchor. The proposed succession needs a separately accepted owner decision,
exact accepted parent/revision, and both configured outgoing and incoming key
signatures over the anchor-change domain. Do not infer custody or accept a
self-signed replacement key. Loss/reset without those proofs remains held
for explicit security-owner disposition; this draft supplies no recovery
bypass or automatic downgrade. The concrete keys and custody evidence are
missing inputs, not sample trusted keys.

original-retained, fresh-reconstruction, operator-attested and missing are
mutually exclusive tagged records. Evidence arrays are nonempty for original
and fresh classes. An attestation names its actual signed statement and every
underlying artifact it claims; missing originals stay named. Fresh artifacts
can supply an honest runnable reconstruction candidate, never original
admission proof. Attested alternatives require an explicit owner decision
whose subject names that exact evidence class, scope/genesis/head, manifest
and historical gap, and whose permitted use is stated. No general accept-
attestations switch exists. Without that disposition, missing original
correspondence yields unresolved, even if its fresh manifest is complete.
The sole missing-historical-evidence route remains existing operator handoff
71b6dde2dc9059659f8fb1b606f85f13162232ce and its named safe retained paths.
This amendment commissions no new packet, probe, export or credential access.

## Fixed local ABI and current-source seams

```ts
type ABIType = "Entry" | "Input" | "ScopeRef" | "FactRef" | "FieldValue"
  | "StateSnapshot" | "StateView" | "StateWriter" | "Own" | "Fetched"
  | "RuleGiven" | "RuleInput" | "Prepared" | "ObservationUse" | "ValueRead"
  | "Reading" | "Clock" | "Bounds" | "ValidDefinition" | "Capabilities"
  | "Owners" | "PlatformRules" | "Judgment" | "Draft" | "Refusal"
  | "CanonicalValue" | "Bytes" | "Digest";
interface ABITypeRecord { name: ABIType; schema: ArtifactRef }
interface ABISignature {
  slot: ABISlot; contract: ArtifactRef;
  inputs: ABIType[]; output: ABIType;
  timing: "synchronous" | "pure-async";
  failure: "typed-refusal-or-value" | "deterministic-profile-refusal-or-fault"
         | "fault-halts";
}
interface ABIRecord {
  format: "artroom-pure-evaluator-1";
  types: ABITypeRecord[]; signatures: ABISignature[];
  stateReader: ArtifactRef; stateWriter: ArtifactRef;
  runtime: ArtifactRef;
}
```

Types/signatures sort by name/slot, have no duplicates, and cover every slot
and type transitively used by this bundle. contract is the closed complete
argument/result/method schema of that slot, including tuple/list/null variants
and internal adapter callbacks, not a reference to an unspecified TypeScript
name. The wire record describes the locally compiled contract; it does not
create callable network methods. ABI stateWriter describes only the pure fold
adapter's explicit mutations; it is never the live Store's transaction,
append/retention/outbox/custody interface. Runtime specifies deterministic
ECMAScript/crypto/text-codec/URL behavior and the exact permitted API methods;
webcrypto never exposes randomness through this facade. Missing callback/type
contracts or implicit ambient capabilities make the artifact incomplete.

The ABI artifact is a complete closed function/type mapping to retained
source exports, not an executable script for generating a new engine. The
first adapter identity is proposed as artroom-pure-evaluator-1. Its retained
wire schema binds Entry/Input, FactRef/ScopeRef, StateSnapshot, Item/operation/
record/index, RuleInput/Prepared, Fetched, Own, ObservationUse, ValueRead,
Reading/Clock, ValidDefinition and each judgment/draft/refusal variant.
Every named slot has an exact retained input/output schema. No unknown body
or function name is accepted where this ABI specifies a closed record.
Owner-specific evidence bodies remain closed by that bundle's capability/
operation schema; current generic Evidence.body:unknown is not validation.

| ABI surface | Existing function/type mapping; required retained closure |
|---|---|
| validate/count/runnable | validateDefinition, derivable, counted, outcomeValueDomains, runnable and ruleAt, with exact Bounds and profile/capability inputs |
| profile-admit/rule-prepare/rule-evaluate | RULE_PROFILES admission, prepareRules and evaluateRules; retain RuleInput/Prepared framing and deterministic profile-refusal versus engine-fault behavior |
| judges | judgeGenesis, judgeAct, judgeDelivery, judgeTimed, judgePreparation, judgeOutcome, judgeDiagnosis, judgeCheckpoint; retain their complete options/result variants |
| state/fold/snapshot | StateView/StateWriter, MemoryState/StateSnapshot, applyEntry and stateDigest; include indexes, counters, records, holders, draws and retained fold inputs |
| facts/own/clock/grant | Fetched, Own, Reading/Clock, clockOf, grant/freshness/observed derivation at recorded heads/times, and exact retained-value interpretation |
| capabilities/owners | Capabilities/forms/steps/record folding, Owners.rules/reserves, operation outcome/unknown/closure and reservations |
| platform context | data plus Rules, observed/observed-values, membership/rules-reference functions and revision-kind; never alias missing functions to today's version |

This table identifies retained APIs, not completed ABI artifacts. A concrete
ABI inventory must include full exported signatures and all schemas from the
actual selected source; a name match does not prove shape or fold equivalence.
The local facade may expose StateView/Own as synchronous read-only adapters,
but no archived code receives Store append/retain/transaction, network, wall clock,
randomness, custody, sessions or current provider bindings. Asynchronous pure
rule evaluation is permitted only on fully retained inputs; its results are
bound to those exact inputs and the evaluator identity before commit.

Reviewed-local-code selection is a build-time finite map from exact BundleId
to its retained executable adapter and ABI artifact. The immutable manifest
verifier checks its closure against that compiled map. It performs no import
from manifest paths, network text, arbitrary package name or scope-provided
code. A complete artifact can be unresolved because its reviewed local adapter
or compatible ABI is unavailable. That is not a reason to run current code.

Static source inspection for this refinement used main
1eed91aacac56649ac0b75c0652215b0418eeff8, tree
2d00a7ee9b664322f73267923f1e7466d10d23b7. Coverage was selected interfaces and
bodies, not a whole-source approval: scope ports.ts Definitions/Readers;
core.ts validate/platform/pinned/owners/prepare; definitions.ts namedBy;
turn.ts transaction/head/judge/seal; store.ts append/retention; replay verify.ts
Options/Coded/Run/#pin/#code/trusts; source.ts HistorySource; derive marks.ts
RuleGiven, state.ts StateView, ledger.ts Owners, rule/index.ts evaluateRules;
contract bounds.ts Bounds. Existing APIs select platform by name, Core caches
pinned code for object life, and global validator/profiles/capabilities/fold
remain current. Replay Run lacks a bundle binding. Source APIs take ScopeId
for transport but must validate returned full references. None of the new
manifest, binding, trust or preparation fields is implemented by those APIs.

## Preparation, cache and final-commit correspondence

```ts
type SelectionSubject =
  | { kind: "born"; context: HistoricalContext; binding: BindingId }
  | { kind: "founding"; service: ServiceId; seed: Seed;
      intent: Digest; admission: ArtifactId };
interface SelectionPin {
  service: ServiceId; subject: SelectionSubject;
  bundle: BundleId; abi: ArtifactId;
  bindingSet: BindingSetId; revision: number;
  activationTuple: Digest; runtimeRelease: ArtifactId;
  compatibility: ArtifactId;
}
interface PreparedSelection {
  pin: SelectionPin;
  before: Head | null;
  input: Digest;
  retainedInputs: { kind: RetainedInput["kind"]; digest: Digest;
                    domain: string | null; artifact: ArtifactRef }[];
  prepared: Prepared[];
}
interface FoundingTarget {
  service: ServiceId;
  seed: Seed;
  intent: Digest;
}
type FoundingAdmissionInput = "admission" | "binding-set" | "activation-tuple"
  | "bundle" | "abi" | "runtime-release" | "compatibility";
type FoundingHold =
  | { reason: "unavailable"; inputs: FoundingAdmissionInput[] }
  | { reason: "conflict";
      inputs: { input: FoundingAdmissionInput; candidates: Digest[] }[] };
interface RecordedRefusalTarget {
  service: ServiceId; scope: ScopeRef;
  genesis: FactRef; named: Digest | PlatformDefinition; targetHead: Head;
  genesisBytes: ArtifactRef;
  history: { first: number; last: number; entries: ArtifactRef }[];
  retained: { kind: RetainedInput["kind"]; digest: Digest;
              domain: string | null; artifact: ArtifactRef }[];
  refusalSchema: ArtifactRef;
}
type RefusalCorrespondenceInput = "historical-admission" | "source-binding"
  | "bundle" | "abi" | "local-adapter" | "runtime-compatibility";
type RefusalHold =
  | { reason: "unavailable"; inputs: RefusalCorrespondenceInput[] }
  | { reason: "conflict";
      inputs: { input: RefusalCorrespondenceInput; candidates: Digest[] }[] };
type SelectionResult =
  | { result: "selected"; pin: SelectionPin }
  | { result: "unresolved"; context: HistoricalContext; missing: MissingEvidence[] }
  | { result: "conflict"; context: HistoricalContext; candidates: BindingId[] }
  | { result: "founding-held"; target: FoundingTarget; hold: FoundingHold }
  | { result: "existing-refused-held"; target: RecordedRefusalTarget;
      hold: RefusalHold };
```

founding-held identifies the exact requested logical service, complete
intended Seed and intent digest without asserting an applied genesis,
incarnation or target head. It is a typed internal stop, never a pin or
authority grant. The target repeats the exact selection request; a valid
shape alone does not prove the intent or founding authority. unavailable
lists only the absent required inputs. conflict lists the exact input and
actual competing nonsecret content IDs observed, without fabricating an
accepted SelectionPin. Input lists are sorted and unique; conflict groups
are sorted by input and their candidate IDs are sorted unique, with at
least two competing IDs in each group. Neither list is empty. These are
semantic cardinalities, not new acquisition quotas or numeric defaults.
IDs retain their input-specific identity meanings; a digest match across
differently typed inputs never makes them interchangeable.

No founding entry, admission-attribution write, preparation or outside
work is started from founding-held. Missing current admission inputs are
not historical MissingEvidence and do not trigger 71b or a new acquisition
route. Retry may reconsider the same target only through the existing
authorized selection boundary, with new full current checks. It cannot
synthesize HistoricalContext, infer a genesis hash/head, select a conflicting
candidate by newest/time, or treat an already-born scope as founding.

existing-refused-held identifies an actual recorded scope whose sealed
genesis refused. It is not the founding-held target and is never passed as
an applied HistoricalContext, born SelectionSubject or selected pin. service
is the configured logical service; scope is the actual full kind/ScopeId/
incarnation, not a guessed reference from an intended Seed. genesis has seq
zero and exactly that scope. Its hash is verified over the original sealed
genesis bytes using the retained entry-domain/schema, not a reserialization.
named is the exact declared pin in those bytes, including its full digest or
platform name, never a current catalog interpretation of a colliding name.
The original input/Seed and refused result must be present in genesisBytes;
refusalSchema retains the exact entry/result schema used to recognize that
recorded disposition. This structural schema must itself be authenticated
under the configured accepted trust/evidence boundary; a caller-chosen schema
cannot reclassify a sealed record. The full reference and retained Seed must
agree under that schema, without asserting an applied birth. That recognition
is structural evidence, not proof of
the judgment's semantic correctness or permission to execute its bundle.

history uses the same closed HistoryChunk schema above, but its original
genesis bytes are refused, not applied. Ranges are sorted, adjacent and
gap-free from zero through the actual witnessed targetHead; the final hash,
all prev links, full references and original-byte artifacts are verified.
No future/applied endpoint is invented. retained has the same sorted exact
kind/domain/digest/framing rules as ScopeCoverage, with domain nonnull exactly
for values; it preserves the authorized original proof inputs needed for
inspection, not missing-zero replacements. Artifact encoding, length and
hash checks remain exact. Protected entries/values stay under existing
protected retention/access, including any credential-bearing founding input.
An unavailable original artifact cannot be replaced by its hash or unsafe
export; no new byte acquisition or public metadata route follows.

The refused target and its fields are not accepted as caller authority.
They must be authenticated against the actual sealed record, its witnessed
endpoint and already-authorized original-byte evidence. If those facts or
the structural refusal schema cannot be established, classification itself
stays held at the existing evidence/access boundary: do not label unknown
history refused, applied or unborn. This result represents the subsequent
semantic/execution correspondence stop once that exact refused history is
established. It does not assert original admission release, HistoricalSourceBinding
or an available executable adapter. RefusalHold lists only actual unavailable
or competing correspondence inputs, with the same closed nonempty sorted
unique input/candidate validation as FoundingHold. Candidate IDs have their
input-specific identity (original admission artifact, source BindingId,
BundleId, ABI artifact, reviewed local-adapter artifact or compatibility
artifact); a competing BindingId does not imply accepted applied coverage.
Missing historical originals continue to use their exact MissingEvidence and
existing 71b handoff; RefusalHold records the selection stop, not a replacement
for that evidence record or a new acquisition request.

Existing authorized sealed refusal inspection remains supported: verify the
original bytes/reference/hash chain and show their recorded refused result
under their exact retained schema without claiming replay correctness.
Already-authorized reconciliation of that original request, resources and
cleanup retains the full original scope/operation/attempt/provider/custody
identity and existing current checks. Reconciliation requiring unavailable
historical semantics, runnable compatibility or executor proof remains held;
it cannot run today's code to explain or settle the old refusal. No new read,
act, retry or cleanup privilege is granted. Do not erase a refusal, its
history, resource ownership, late/unknown answers or cleanup duty; do not
retry its creation as an unborn/fresh founding. These duties survive every
selection stop. Full refused-genesis semantic/legacy execution coverage remains
owed under existing 484/9be; applied-only staging and truthful raw inspection
do not close it. The missing exact owner correspondence must be supplied or
disposed of through the existing reviewed owner/evidence boundary before
runnable coverage can be extended; this successor adds no new binding kind
or fallback execution path.

Every added record and nested variant follows the exact own-field, canonical
byte and closed-union rules above. Unknown reason/input/result tags, extra or
missing fields, invalid references or mismatched original bytes are validation
failures, not unavailable-input holds. Access denial remains the current
access refusal; it is not historical missing evidence or an acquisition grant.
A resolved semantic refusal keeps its selected contract's recorded/refused
behavior; an evaluator/profile fault retains its exact ABI fault/halting
classification, never a manufactured founding-held or successful inspection.
No protected candidate identity or input is exposed beyond existing authorized
metadata access. These distinctions add no executable API.

These are proposed selection records, not trusted wire flags. selected is an
internal result produced only by the local verifier and configured acceptance
path; it carries no caller-supplied verified:true. Facade objects remain
process-local and cannot be serialized as authority. Compatibility identifies
actual owner-reviewed runtime/Store/authority/custody/ABI correspondence, not
an unchecked boolean. The activationTuple is the exact separately reviewed
coherent runtime/admission/port/executor tuple content ID; this schema links
to it and does not redefine its fields or grant execution itself.

Resolve outside the transaction before semantic, observation and grant
preparation. The exact input digest uses its historical input kind/domain;
retained value identity includes its domain. before is the exact current head,
or null only for an uncreated scope. Preparation carries the whole SelectionPin
and cannot be reused with another input, head, bundle, binding revision,
activation tuple, runtime release, ABI or compatibility decision. Prepared[]
is the existing evaluator's output, not a substitute for the current authority
phase. Every foreign source scope resolves its own context and pin, including
membership/rules subjects whose historical code interprets recorded facts.

A semantic facade cache key contains every SelectionPin field; prepared-data
cache adds before/input/ordered retained-input identities. Artifact bytes may
be cached by raw ArtifactId after verification, but that cache grants no
selection/admission. Refresh accepted binding-set/activation state before every
use: an object-life Core.pinned cache cannot keep a superseded pin runnable.
No TTL establishes currentness, and unavailable acceptance state holds work.

At final commit, inside the existing same transaction/head check, compare
before and the exact currently accepted set/tuple/compatibility/runtime pin,
then perform current strict birth/membership/freshness/admission checks and
judge/fold using the selected bundle. No await separates that final comparison
from synchronous seal/append/fold. Any changed or unavailable pin discards
prepared results and stops/restarts without an admitted write. Current
activation state must have a transactionally authoritative local generation
link; a fresh network read alone cannot provide this property. Store/Turns
lack that link today, so live implementation remains held until its concrete
owner boundary is reviewed. Internal bookkeeping beside entries must retain
selection attribution without repinning genesis or changing historical bytes.
Replay reports each source pin/evidence class and operator trust explicitly.

For a new genesis, there is not yet a historical genesis hash to resolve.
Its founding SelectionSubject instead names the accepted current
admission tuple's specific admission artifact and exact intended Seed/intent/
bundle; before is null only for this variant. The same commit seals genesis
and records that native admission attribution beside it. It does not generate
an operator signature or backfill HistoricalSourceBinding. Subsequent historical
resolution still requires its resulting full context and accepted
correspondence. This is a required separate native admission seam, not a
fabricated historical receipt or an exception accepting unknown old genesis.
Actual fields and atomic storage correspondence remain an owner implementation
obligation. An old scope is never treated as this unfounded case.

Final admission is not a terminal-send fence. Outside work preserves the
original full scope/operation/attempt/provider/custody binding and uses the
separately reviewed executor's final-call ownership/closure barrier. A tuple
change or unknown mint cannot remint, reset markSent, invent an unsent outcome
or discharge cleanup. Unknown provenance or incompatible code leaves affected
work held while raw history and all old duties remain intact.

## Current guards, bootstrap and precise missing inputs

Pure historical semantics cannot authorize present reads, current sessions,
service bootstrap, provider mutation or a broader human grant. Current strict
43d full birth/reference, typed resource/signature, membership, expiry and
post-await checks remain in force before access. Present membership/rules
subjects are interpreted by their own proven semantics, but their selection
cannot bypass current transport/admission. This schema adds no raw-read route.

Semantic-independent bootstrap requires its separate adopted operator
identity/purpose/allowlist, authenticated request/expiry/replay limits and
current full-reference/typed-byte/hash guards. It must not execute the archive
to authorize acquisition of that archive. Until that interface and actual
inputs are reviewed, only already independently authorized safe retained
exports named by 71b are available; this amendment creates no access grant.

The schema is feasible as a small canonical parser, content-closure verifier
and finite reviewed-local adapter map, staged at the four existing boundaries:
manifest/local code; Core contextual preparation; per-Run replay facade; and
current Store/port/fold compatibility. It is not feasible to claim complete
historical execution by replacing Definitions.platform or Options.platform
alone. Actual interpreter/toolchain bytes, full retained semantic bounds and
admission mapping are not present in the seven fresh source tar files.

Required concrete inputs and decisions before executable integration:

- Evaluator/definition owners: the actual finite export/type/ABI artifacts,
  exact whole data/rule/capability/profile/fold/domain closure, compatible
  synchronous state adapters and honest reconstructed build correspondence.
- Operator under existing 71b: original nonsecret admission/build/deployment
  receipts and full service/ScopeRef/applied-genesis/head/reference closure;
  exact NOT RETAINED/NOT PRODUCED reports where absent. No substitute packet.
- Trust/security owners: actual configured service/anchor key and custody,
  accepted binding-set first pin/succession, owner-reviewed signature/coverage
  schema, and exact dispositions for any alternative attested evidence.
- Runtime/Store/port owners: transactional current selection generation,
  final-commit equality, fold/custody compatibility and retained selection
  attribution, plus actual executor final-call/fence/closure proof.
- Capacity owners: explicit measured acquisition and retention limits for
  bytes/modules/edges/proof depth/build work, simultaneous old/new code,
  cache/peak resolution and amendment/cleanup backlog. Historical Bounds and
  acquisition budgets stay distinct; no numeric quotas/defaults are adopted.

All these remain acceptance prerequisites; no missing term counts as zero.
No source implementation, project import/evaluation, build, test, gate,
provider/account/credential access, new history acquisition, binding publication
or activation was performed for this draft. Only this proposal and its
predecessor scratch copy changed.

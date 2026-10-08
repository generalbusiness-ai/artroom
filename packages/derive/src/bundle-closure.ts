/** Bounded declared record/artifact closure. No acquisition, code loading, trust installation or selection. */
import type { ArtifactId, ArtifactRef, BundleId, Digest, ExportRef, ModuleId, SemanticBundleManifest, ABIRecord, HistoricalSourceBinding, ScopeCoverage, AdmissionCorrespondence, BindingSetRevision, SignaturePayload, TrustAnchor, HistoryChunk, HistoricalContext } from "@generalbusiness/artroom-contract";
import { canonicalize, digestBytes, isDigest, semanticContentId, utf8, type SemanticContentDomain } from "@generalbusiness/artroom-bytes";
import { byteOrder } from "./values.ts";
import { boundedCanonical, bundleAttempt, BundleError, checkBundleLimits, parsed, type BundleLimits, type BundleRecordKind, type BundleRecords, type BundleResult } from "./bundle-records.ts";

/** Bytes were independently authorized and retained by the caller. A kind is a requested closed shape, never authority. */
export interface BundleArtifact { ref: ArtifactRef; bytes: Uint8Array; kind: BundleRecordKind | null }
interface CheckedArtifact { ref: ArtifactRef; kind: BundleRecordKind | null; value: unknown; bytes: Uint8Array }
export interface DeclaredClosure {
  root: Digest; artifacts: ArtifactId[];
  /** Import cycles are descriptive, not proof that the original toolchain admitted them. */
  cyclicModules: ModuleId[];
  /** Foreign contexts are logical proof obligations, not content-DAG edges or verified causal history. */
  logicalSources: HistoricalContext[];
}
function fail(reason: "limits" | "content" | "closure" | "conflict" | "unavailable", path: string): never { throw new BundleError(reason, path); }
const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
/** Closed scalar metadata check before any canonical serialization/UTF-8 allocation.
 * Reject accessors/extra fields without traversing their values; validated metadata needs no serialization. */
function checkedArtifactRef(value: unknown, limits: BundleLimits, path: string): ArtifactRef {
  if (limits.records < 1 || limits.tokens < 7 || limits.depth < 1) fail("limits", `${path}.metadata`);
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new BundleError("schema", path);
    let count = 0;
    for (const name in value) if (Object.hasOwn(value, name)) {
      if (++count > 3 || (name !== "digest" && name !== "bytes" && name !== "encoding")) throw new BundleError("schema", path);
    }
    if (count !== 3 || Object.getOwnPropertySymbols(value).length !== 0) throw new BundleError("schema", path);
    const own = (name: string) => {
      const property = Object.getOwnPropertyDescriptor(value, name);
      if (!property || !Object.hasOwn(property, "value")) throw new BundleError("schema", path);
      return property.value as unknown;
    };
    const digest = own("digest"), bytes = own("bytes"), encoding = own("encoding");
    if (typeof digest !== "string" || digest.length !== 71 || !isDigest(digest)
      || typeof bytes !== "number" || !Number.isSafeInteger(bytes) || Object.is(bytes, -0) || bytes < 0
      || (encoding !== "raw" && encoding !== "utf8" && encoding !== "canonical-json")) throw new BundleError("schema", path);
    // All strings are now fixed ASCII forms and the integer has at most sixteen digits.
    const metadataBytes = '{"bytes":,"digest":"","encoding":""}'.length + String(bytes).length + digest.length + encoding.length;
    if (metadataBytes > limits.bytes) fail("limits", `${path}.metadata-bytes`);
    return { digest, bytes, encoding };
  } catch (error) {
    if (error instanceof BundleError) throw error;
    // Malformed host metadata cannot leak a CanonicalError/TypeError outside the typed data result.
    throw new BundleError("schema", path);
  }
}
const DOMAINS: Partial<Record<BundleRecordKind, SemanticContentDomain>> = {
  SemanticBundleManifest: "artroom-semantic-bundle-1", HistoricalSourceBinding: "artroom-source-binding-1",
  BindingSetRevision: "artroom-source-binding-set-1", TrustAnchor: "artroom-bundle-trust-anchor-1",
  SignaturePayload: "artroom-semantic-signature-1", AnchorChange: "artroom-bundle-anchor-change-1",
};
/** Checks raw artifacts and all supported declared references reachable from a typed content ID or raw artifact ID.
 * Success means declared content correspondence only; original imports/schemas/admission and actual local adapters remain separate evidence.
 * Signature checking is separate (checkBundleSignature/checkAnchorChange); this graph result is not a signature or trust verdict. */
export function verifyDeclaredBundleClosure(root: Digest, artifacts: readonly BundleArtifact[], limits: BundleLimits): BundleResult<DeclaredClosure> {
  return bundleAttempt(() => {
    checkBundleLimits(limits);
    if (artifacts.length > limits.artifacts) fail("limits", "artifacts");
    const raw = new Map<ArtifactId, CheckedArtifact>(), ids = new Map<Digest, CheckedArtifact>();
    let bytes = 0, edgeCount = 0;
    const logicalSources = new Map<string, HistoricalContext>();
    for (let i = 0; i < artifacts.length; i++) {
      const item = artifacts[i]!;
      const ref = checkedArtifactRef(item.ref, limits, `artifacts[${i}].ref`);
      bytes += item.bytes.length;
      if (!Number.isSafeInteger(bytes) || bytes > limits.bytes) fail("limits", "artifacts.bytes");
      if (ref.bytes !== item.bytes.length || ref.digest !== digestBytes(item.bytes)) fail("content", `artifacts[${i}]`);
      const previous = raw.get(ref.digest);
      if (previous && (!same(previous.ref, ref) || previous.kind !== item.kind)) fail("conflict", `artifacts[${i}]`);
      if (previous) continue;
      let value: unknown = null;
      if (item.kind !== null) {
        if (ref.encoding !== "canonical-json") fail("content", `artifacts[${i}].encoding`);
        value = parsed(item.kind, item.bytes, limits);
      } else if (ref.encoding === "canonical-json") value = boundedCanonical(item.bytes, limits);
      else if (ref.encoding === "utf8") {
        try { new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(item.bytes); }
        catch { fail("content", `artifacts[${i}].encoding`); }
      }
      const checked = { ref, kind: item.kind, value, bytes: item.bytes };
      raw.set(ref.digest, checked); ids.set(ref.digest, checked);
      const domain = item.kind === null ? undefined : DOMAINS[item.kind];
      if (domain) {
        const id = semanticContentId(domain, value);
        const prior = ids.get(id);
        if (prior && prior.ref.digest !== ref.digest) fail("conflict", `artifacts[${i}].id`);
        ids.set(id, checked);
      }
    }
    const found = (id: Digest, kind?: BundleRecordKind): CheckedArtifact => {
      const artifact = ids.get(id);
      if (!artifact) fail("unavailable", "reference");
      if (kind && artifact.kind !== kind) fail("closure", kind);
      // Kind alone cannot substitute a raw record hash for its adopted typed ContentId.
      const domain = kind === undefined ? undefined : DOMAINS[kind];
      if (kind && id !== (domain ? semanticContentId(domain, artifact.value) : artifact.ref.digest)) fail("content", "reference.domain");
      return artifact;
    };
    const rawFound = (id: ArtifactId, kind?: BundleRecordKind): CheckedArtifact => {
      const artifact = raw.get(id);
      if (!artifact) fail("unavailable", "artifact-reference");
      if (kind && artifact.kind !== kind) fail("closure", kind);
      return artifact;
    };
    const referenced = (ref: ArtifactRef, kind?: BundleRecordKind): CheckedArtifact => {
      const artifact = rawFound(ref.digest, kind);
      if (!same(ref, artifact.ref)) fail("conflict", "artifact-reference");
      return artifact;
    };
    const edges = (artifact: CheckedArtifact): CheckedArtifact[] => {
      if (artifact.kind === null) return [];
      const refs: ArtifactRef[] = [];
      const scan = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { for (const part of value) scan(part); return; }
        const object = value as Record<string, unknown>;
        if (Object.hasOwn(object, "digest") && Object.hasOwn(object, "bytes") && Object.hasOwn(object, "encoding") && Object.keys(object).length === 3) {
          if (++edgeCount > limits.edges) fail("limits", "edges");
          refs.push(object as unknown as ArtifactRef); return;
        }
        for (const value of Object.values(object)) scan(value);
      };
      scan(artifact.value);
      const out = refs.map((ref) => referenced(ref));
      const typed = (id: Digest, kind: BundleRecordKind) => { if (++edgeCount > limits.edges) fail("limits", "edges"); out.push(found(id, kind)); };
      const service = (id: Digest) => typed(id, "ServiceIdentity");
      const selection = (pin: BundleRecords["SelectionPin"]) => {
        service(pin.service); typed(pin.bundle, "SemanticBundleManifest"); typed(pin.bindingSet, "BindingSetRevision");
        typed(pin.abi, "ABIRecord");
        const set = found(pin.bindingSet, "BindingSetRevision").value as BindingSetRevision;
        if (set.service !== pin.service || set.revision !== pin.revision) fail("conflict", "selection.set");
        const manifest = found(pin.bundle, "SemanticBundleManifest").value as SemanticBundleManifest;
        if (manifest.abi.digest !== pin.abi) fail("conflict", "selection.abi");
        // Runtime/compatibility/admission fields are raw ArtifactIds in this contract. Their owner meanings remain opaque here.
        for (const id of [pin.runtimeRelease, pin.compatibility]) { if (++edgeCount > limits.edges) fail("limits", "edges"); out.push(rawFound(id)); }
        if (pin.subject.kind === "born") {
          typed(pin.subject.binding, "HistoricalSourceBinding");
          const binding = found(pin.subject.binding, "HistoricalSourceBinding").value as HistoricalSourceBinding;
          if (!same(pin.subject.context, binding.context) || binding.bundle !== pin.bundle) fail("conflict", "selection.binding");
          const chosen = pin.subject.binding;
          if (!set.bindings.some((entry) => entry.binding === chosen && same(entry.context, pin.subject.kind === "born" ? pin.subject.context : null))) fail("conflict", "selection.binding-set");
        } else { if (++edgeCount > limits.edges) fail("limits", "edges"); out.push(rawFound(pin.subject.admission)); }
      };
      switch (artifact.kind) {
        case "SemanticBundleManifest": {
          const m = artifact.value as SemanticBundleManifest;
          referenced(m.abi, "ABIRecord"); referenced(m.domains, "DomainsRecord");
          const build = referenced(m.build, "BuildRecord").value as BundleRecords["BuildRecord"];
          if (!build.outputs.some((output) => same(output.artifact, m.executable))) fail("conflict", "manifest.executable");
          for (const module of m.modules) if (![...build.inputs, ...build.outputs].some((input) => input.path === module.id && same(input.artifact, module.source))) fail("closure", "module.build-input");
          const domains = referenced(m.domains, "DomainsRecord").value as BundleRecords["DomainsRecord"];
          for (const capability of m.capabilities) for (const tag of capability.domains) if (!domains.records.some((domain) => domain.tag === tag)) fail("closure", "capability.domain");
          const declared = new Map(m.definitions.filter((definition) => definition.kind === "declared").map((definition) => [definition.named, definition]));
          for (const definition of declared.values()) for (const digest of definition.creates) if (!declared.has(digest)) fail("closure", "definition.creates");
          if (m.definitions.length > 0) {
            // Supported current definition-domain subset only. This does not
            // interpret an arbitrary historical ABI/schema or claim its admission meaning.
            const domain = domains.records.find((row) => row.tag === "artroom-definition-1");
            if (!domain || domain.algorithm !== "sha256" || domain.framing !== "tag-newline-canonical") fail("unavailable", "definition.domain");
            for (const definition of m.definitions) {
              const data = referenced(definition.data);
              if (data.ref.encoding !== "canonical-json" || definition.dataDigest !== digestBytes(utf8(`${domain.tag}\n${new TextDecoder().decode(data.bytes)}`))
                || (definition.kind === "declared" && definition.named !== definition.dataDigest)) fail("content", "definition.digest");
            }
          }
          break;
        }
        case "BuildRecord": {
          const b = artifact.value as BundleRecords["BuildRecord"];
          referenced(b.environment, "BuildEnvironment"); referenced(b.compatibility, "RuntimeCompatibility"); break;
        }
        case "HistoricalSourceBinding": {
          const b = artifact.value as HistoricalSourceBinding;
          service(b.context.service); typed(b.bundle, "SemanticBundleManifest");
          const coverage = referenced(b.coverage, "ScopeCoverage").value as ScopeCoverage;
          const admission = referenced(b.admission, "AdmissionCorrespondence").value as AdmissionCorrespondence;
          if (!same(b.context, coverage.context) || !same(b.context, admission.context) || b.bundle !== admission.bundle || !same(b.coverage, admission.scopeCoverage)) fail("conflict", "binding.context");
          break;
        }
        case "AdmissionCorrespondence": {
          const a = artifact.value as AdmissionCorrespondence;
          service(a.context.service); typed(a.bundle, "SemanticBundleManifest");
          const c = referenced(a.scopeCoverage, "ScopeCoverage").value as ScopeCoverage;
          if (!same(a.context, c.context)) fail("conflict", "admission.context"); break;
        }
        case "BindingSetRevision": {
          const set = artifact.value as BindingSetRevision;
          service(set.service); if (set.parent !== null) {
            typed(set.parent, "BindingSetRevision");
            const parent = found(set.parent, "BindingSetRevision").value as BindingSetRevision;
            if (parent.service !== set.service || !Number.isSafeInteger(parent.revision + 1) || parent.revision + 1 !== set.revision) fail("conflict", "binding-set.parent");
          }
          const seen = new Map<string, BundleId>();
          for (const entry of set.bindings) {
            typed(entry.binding, "HistoricalSourceBinding");
            const binding = found(entry.binding, "HistoricalSourceBinding").value as HistoricalSourceBinding;
            if (!same(binding.context, entry.context) || binding.context.service !== set.service) fail("conflict", "binding-set.context");
            const genesis = canonicalize([entry.context.service, entry.context.scope, entry.context.genesis]);
            const prior = seen.get(genesis);
            if (prior !== undefined && prior !== binding.bundle) fail("conflict", "binding-set.genesis");
            seen.set(genesis, binding.bundle);
          }
          break;
        }
        case "SignaturePayload": {
          const p = artifact.value as SignaturePayload;
          service(p.service); typed(p.bindingSet, "BindingSetRevision"); typed(p.anchor, "TrustAnchor");
          const set = found(p.bindingSet, "BindingSetRevision").value as BindingSetRevision;
          const anchor = found(p.anchor, "TrustAnchor").value as TrustAnchor;
          if (p.service !== set.service || p.service !== anchor.service || p.publisher !== anchor.publisher || p.revision !== set.revision || p.parent !== set.parent) fail("conflict", "signature.context");
          if (p.subject.kind === "manifest") {
            typed(p.subject.id, "SemanticBundleManifest");
            if (!set.bindings.some((entry) => (found(entry.binding, "HistoricalSourceBinding").value as HistoricalSourceBinding).bundle === p.subject.id)) fail("conflict", "signature.manifest");
          }
          break;
        }
        case "AnchorChange": case "SignedAnchorChange": {
          const change = artifact.kind === "AnchorChange" ? artifact.value as BundleRecords["AnchorChange"] : (artifact.value as BundleRecords["SignedAnchorChange"]).payload;
          service(change.service); typed(change.prior, "TrustAnchor"); typed(change.next, "TrustAnchor"); typed(change.at.bindingSet, "BindingSetRevision");
          const prior = found(change.prior, "TrustAnchor").value as TrustAnchor, next = found(change.next, "TrustAnchor").value as TrustAnchor;
          const set = found(change.at.bindingSet, "BindingSetRevision").value as BindingSetRevision;
          if (change.service !== prior.service || change.service !== next.service || change.service !== set.service || change.at.revision !== set.revision) fail("conflict", "anchor-change.context");
          break;
        }
        case "SelectionPin": selection(artifact.value as BundleRecords["SelectionPin"]); break;
        case "PreparedSelection": selection((artifact.value as BundleRecords["PreparedSelection"]).pin); break;
        case "SelectionSubject": {
          const subject = artifact.value as BundleRecords["SelectionSubject"];
          if (subject.kind === "born") { service(subject.context.service); typed(subject.binding, "HistoricalSourceBinding"); }
          else { service(subject.service); if (++edgeCount > limits.edges) fail("limits", "edges"); out.push(rawFound(subject.admission)); }
          break;
        }
        case "SelectionResult": {
          const result = artifact.value as BundleRecords["SelectionResult"];
          if (result.result === "selected") selection(result.pin);
          else {
            service(result.result === "founding-held" || result.result === "existing-refused-held" ? result.target.service : result.context.service);
            if (result.result === "existing-refused-held") out.push(...edges({ ...artifact, kind: "RecordedRefusalTarget", value: result.target }));
          }
          // Failure candidates are observed identities, never accepted/referenced executable choices.
          break;
        }
        case "FoundingTarget": service((artifact.value as BundleRecords["FoundingTarget"]).service); break;
        case "HistoricalContext": service((artifact.value as BundleRecords["HistoricalContext"]).service); break;
        case "ReleaseClaim": service((artifact.value as BundleRecords["ReleaseClaim"]).service); break;
        case "SignatureEnvelope": {
          // Payload is embedded; traverse its typed references with its exact closed shape.
          const p = (artifact.value as BundleRecords["SignatureEnvelope"]).payload;
          const embedded = { ...artifact, kind: "SignaturePayload" as const, value: p };
          out.push(...edges(embedded)); break;
        }
        case "TrustAnchor": {
          const anchor = artifact.value as TrustAnchor;
          service(anchor.service); typed(anchor.first.bindingSet, "BindingSetRevision");
          const first = found(anchor.first.bindingSet, "BindingSetRevision").value as BindingSetRevision;
          if (first.service !== anchor.service || first.revision !== anchor.first.revision || first.parent !== null) fail("conflict", "anchor.first"); break;
        }
        case "ScopeCoverage": case "RecordedRefusalTarget": {
          const coverage = artifact.value as ScopeCoverage | BundleRecords["RecordedRefusalTarget"];
          const context = "context" in coverage ? coverage.context : coverage;
          service(context.service);
          if ("uses" in coverage) for (const use of coverage.uses) {
            if (!same(use.user.at, context.scope) || !same(use.source.at, use.sourceContext.scope)) fail("conflict", "history.use-reference");
            const candidates = [...raw.values()].filter((row) => row.kind === "HistoricalSourceBinding"
              && same((row.value as HistoricalSourceBinding).context, use.sourceContext));
            if (candidates.length !== 1) fail(candidates.length === 0 ? "unavailable" : "conflict", "history.source-binding");
            if (++edgeCount > limits.edges) fail("limits", "proof.references");
            // Context references intentionally avoid reciprocal BindingIds/content cycles.
            // Existing replay causal checks, under the actual selected historical adapter, remain owed.
            logicalSources.set(canonicalize(use.sourceContext), use.sourceContext);
          }
          for (const range of coverage.history) {
            const chunk = referenced(range.entries, "HistoryChunk").value as HistoryChunk;
            if (!same(chunk.scope, context.scope) || !same(chunk.genesis, context.genesis) || chunk.first !== range.first || chunk.last !== range.last) fail("conflict", "history.range");
            if (range.first === 0 && !same(coverage.genesisBytes, chunk.entries[0]!.bytes)) fail("conflict", "history.genesis-bytes");
            if (chunk.last === context.targetHead.seq && chunk.entries.at(-1)!.hash !== context.targetHead.hash) fail("conflict", "history.head");
          }
          break;
        }
      }
      return out;
    };
    const visited = new Set<ArtifactId>(), visiting = new Set<ArtifactId>();
    const visit = (artifact: CheckedArtifact, depth: number): void => {
      if (depth > limits.depth) fail("limits", "content.depth");
      if (visiting.has(artifact.ref.digest)) fail("closure", "content.cycle");
      if (visited.has(artifact.ref.digest)) return;
      visiting.add(artifact.ref.digest);
      for (const child of edges(artifact)) visit(child, depth + 1);
      visiting.delete(artifact.ref.digest); visited.add(artifact.ref.digest);
    };
    // Inspection roots intentionally accept a raw artifact ID or a typed ContentId.
    // All semantic fields above use kind-specific framing; ArtifactRefs/raw IDs use rawFound.
    const first = found(root);
    visit(first, 0);
    const cyclic = new Set<ModuleId>();
    for (const id of visited) {
      const artifact = raw.get(id)!;
      if (artifact.kind === "SemanticBundleManifest") for (const module of moduleClosure(artifact.value as SemanticBundleManifest, referenced((artifact.value as SemanticBundleManifest).abi, "ABIRecord").value as ABIRecord, limits)) cyclic.add(module);
    }
    return { root, artifacts: [...visited].sort(byteOrder), cyclicModules: [...cyclic].sort(byteOrder), logicalSources: [...logicalSources.entries()].sort(([a], [b]) => byteOrder(a, b)).map(([, context]) => context) };
  });
}

/** Exact declared module reachability/export slot checks. Does not parse or import source text. */
function moduleClosure(manifest: SemanticBundleManifest, abi: ABIRecord, limits: BundleLimits): ModuleId[] {
  if (manifest.modules.length > limits.modules) fail("limits", "modules");
  const modules = new Map(manifest.modules.map((module) => [module.id, module]));
  const signatures = new Map(abi.signatures.map((signature) => [signature.slot, signature]));
  const types = new Set(abi.types.map((type) => type.name));
  for (const signature of abi.signatures) if ([...signature.inputs, signature.output].some((type) => !types.has(type))) fail("closure", "abi.types");
  let count = 0;
  for (const module of modules.values()) for (const imported of module.imports) {
    if (++count > limits.edges) fail("limits", "module.edges");
    if (imported.target.kind === "module" && !modules.has(imported.target.module)) fail("closure", "module.import");
  }
  const checkExport = (ref: ExportRef, expected?: string): void => {
    const module = modules.get(ref.module);
    const exported = module?.exports.find((row) => row.name === ref.name);
    if (!exported || exported.signature !== ref.signature || (expected !== undefined && ref.signature !== expected) || !signatures.has(ref.signature)) fail("closure", "module.export");
  };
  const cycles = new Set<ModuleId>();
  for (const component of manifest.components) {
    checkExport(component.root, component.role);
    const reachable = new Set<ModuleId>(), stack = new Set<ModuleId>();
    const walk = (id: ModuleId, depth: number): void => {
      if (depth > limits.depth) fail("limits", "module.depth");
      if (stack.has(id)) { let inCycle = false; for (const on of stack) { inCycle ||= on === id; if (inCycle) cycles.add(on); } return; }
      if (reachable.has(id)) return;
      reachable.add(id); stack.add(id);
      for (const edge of modules.get(id)!.imports) {
        if (++count > limits.edges) fail("limits", "module.work");
        if (edge.target.kind === "module") walk(edge.target.module, depth + 1);
      }
      stack.delete(id);
    };
    walk(component.root.module, 0);
    if (!same([...reachable].sort(byteOrder), component.closure)) fail("closure", "component.closure");
  }
  const required = new Set<string>();
  const used = (ref: ExportRef, expected?: string) => {
    checkExport(ref, expected); required.add(ref.signature);
    const component = manifest.components.find((candidate) => candidate.role === ref.signature);
    if (!component || !component.closure.includes(ref.module)) fail("closure", "component.export");
  };
  for (const definition of manifest.definitions) if (definition.kind === "platform") {
    for (const mark of definition.marks) used(mark.export);
    for (const [name, ref] of [["observed", definition.observed], ["observed-values", definition.observedValues], ["membership-reference", definition.membership], ["rules-reference", definition.rulesScope]] as const) if (ref) used(ref, name);
  }
  for (const capability of manifest.capabilities) {
    used(capability.forms); used(capability.steps); used(capability.records);
    for (const owner of capability.owners) used(owner.rule);
  }
  for (const profile of manifest.profiles) { used(profile.admit, "profile-admit"); used(profile.prepare, "rule-prepare"); used(profile.evaluate, "rule-evaluate"); }
  for (const component of manifest.components) required.add(component.role);
  for (const role of required) if (!manifest.components.some((component) => component.role === role)) fail("closure", "component.role");
  return [...cycles];
}

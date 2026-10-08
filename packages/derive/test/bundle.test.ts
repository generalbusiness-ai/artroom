import { expect, test } from "vitest";
import type { ArtifactRef, BundleId, SignaturePayload, TrustAnchor } from "@generalbusiness/artroom-contract";
import { canonicalBytes, digestBytes, keyIdOfSecret, semanticContentBytes, semanticContentId, sign, utf8 } from "@generalbusiness/artroom-bytes";
import { checkAnchorChange, checkBundleSignature, parseBundleRecord, type BundleLimits } from "../src/bundle-records.ts";
import { verifyDeclaredBundleClosure, type BundleArtifact } from "../src/bundle-closure.ts";

// Invariant: retained data can establish exact content/declared closure and signatures, but never executable or admission authority.
// All ABI/build/source/evidence bodies here are made-up data. No original runtime, archive, provider or trust installation is proved.
const limits: BundleLimits = { bytes: 100_000, records: 2000, tokens: 10_000, depth: 32, artifacts: 100, modules: 8, edges: 200 };
const d = (digit: string) => `sha256:${digit.repeat(64)}` as const;
function fixture() {
  const artifacts: BundleArtifact[] = [];
  const raw = (bytes: Uint8Array, encoding: ArtifactRef["encoding"] = "canonical-json", kind: BundleArtifact["kind"] = null) => {
    const ref = { digest: digestBytes(bytes), bytes: bytes.length, encoding };
    artifacts.push({ ref: canonicalBytes(ref), bytes, kind }); return ref;
  };
  const record = (kind: Exclude<BundleArtifact["kind"], null>, value: unknown) => raw(canonicalBytes(value), "canonical-json", kind);
  const opaque = raw(canonicalBytes({}));
  const source = raw(utf8("export const read = () => 0;"), "utf8");
  const executable = raw(utf8("made-up output"), "utf8");
  const abi = record("ABIRecord", { format: "artroom-pure-evaluator-1", types: [{ name: "Entry", schema: opaque }], signatures: [{ slot: "bytes", contract: opaque, inputs: ["Entry"], output: "Entry", timing: "synchronous", failure: "fault-halts" }], stateReader: opaque, stateWriter: opaque, runtime: opaque });
  const environment = record("BuildEnvironment", { format: "artroom-pure-build-environment-1", entries: [] });
  const compatibility = record("RuntimeCompatibility", { format: "artroom-pure-runtime-1", runtime: opaque, moduleFormat: "esm", platform: "fixture", flags: [], globals: opaque });
  const build = record("BuildRecord", { format: "artroom-pure-build-1", sourceCommit: "1".repeat(40), sourceTree: "2".repeat(40), inputs: [{ path: "a.ts", artifact: source }, { path: "b.ts", artifact: source }], tools: [], recipe: opaque, arguments: [], environment, compatibility, outputs: [{ path: "out.js", artifact: executable }] });
  const domains = record("DomainsRecord", { format: "artroom-semantic-domains-1", records: [] });
  const manifest = { format: "artroom-semantic-bundle-1", abi, modules: [
    { id: "a.ts", source, imports: [{ specifier: "./b", target: { kind: "module", module: "b.ts" } }], exports: [{ name: "read", signature: "bytes" }] },
    { id: "b.ts", source, imports: [], exports: [] },
  ], components: [{ role: "bytes", root: { module: "a.ts", name: "read", signature: "bytes" }, closure: ["a.ts", "b.ts"] }], definitions: [], capabilities: [], profiles: [], bounds: { format: "artroom-semantic-bounds-1", schema: opaque, values: opaque, applies: "historical-admission" }, domains, build, executable, buildEvidence: { class: "missing", missing: { reason: "not-produced", subject: "original fixture", handoff: "71b6dde2dc9059659f8fb1b606f85f13162232ce" } } };
  const finish = () => { record("SemanticBundleManifest", manifest); return { root: semanticContentId("artroom-semantic-bundle-1", manifest), artifacts, opaque, abi, manifest }; };
  return { artifacts, manifest, finish };
}

test("declared component closure includes every imported module; missing closure/import/export and supplied limits refuse, while module cycles remain descriptive", () => {
  const original = fixture().finish();
  expect(verifyDeclaredBundleClosure(original.root, original.artifacts, limits)).toMatchObject({ ok: true, value: { root: original.root, cyclicModules: [] } });
  const missing = fixture(); missing.manifest.components[0]!.closure = ["a.ts"];
  const bad = missing.finish();
  expect(verifyDeclaredBundleClosure(bad.root, bad.artifacts, limits)).toMatchObject({ ok: false, reason: "closure", path: "component.closure" });
  expect(verifyDeclaredBundleClosure(original.root, original.artifacts, { ...limits, modules: 1 })).toMatchObject({ ok: false, reason: "limits", path: "modules" });
  expect(verifyDeclaredBundleClosure(original.root, original.artifacts, { ...limits, edges: 1 })).toMatchObject({ ok: false, reason: "limits" });
  const cyclic = fixture(); cyclic.manifest.modules[1]!.imports = [{ specifier: "./a", target: { kind: "module", module: "a.ts" } }];
  const circle = cyclic.finish();
  expect(verifyDeclaredBundleClosure(circle.root, circle.artifacts, limits)).toMatchObject({ ok: true, value: { cyclicModules: ["a.ts", "b.ts"] } });
  const wrongExport = fixture(); wrongExport.manifest.components[0]!.root.name = "absent";
  const wrongExportInput = wrongExport.finish();
  expect(verifyDeclaredBundleClosure(wrongExportInput.root, wrongExportInput.artifacts, limits)).toMatchObject({ ok: false, reason: "closure", path: "module.export" });
  const absent = fixture(); absent.manifest.modules[0]!.imports[0]!.target.module = "absent.ts";
  const absentInput = absent.finish();
  expect(verifyDeclaredBundleClosure(absentInput.root, absentInput.artifacts, limits)).toMatchObject({ ok: false, reason: "closure", path: "module.import" });
});

test("canonical bytes/closed fields precede content claims; explicit preparse bounds and conflicting raw identity refuse without alternate interpretation", () => {
  const emptyBytes = new Uint8Array();
  const emptyRef = { digest: digestBytes(emptyBytes), bytes: 0, encoding: "raw" };
  const empty: BundleArtifact = { ref: canonicalBytes(emptyRef), bytes: emptyBytes, kind: null };
  expect(verifyDeclaredBundleClosure(emptyRef.digest, [empty], { ...limits, bytes: 1 })).toMatchObject({ ok: false, reason: "limits", path: "bytes" });
  const hidden = { ...emptyRef }; Object.defineProperty(hidden, "extra", { value: "hidden", enumerable: false });
  expect(verifyDeclaredBundleClosure(emptyRef.digest, [{ ...empty, ref: hidden as unknown as Uint8Array }], limits)).toMatchObject({ ok: false, reason: "schema" });
  expect(verifyDeclaredBundleClosure(emptyRef.digest, [{ ...empty, ref: canonicalBytes({ ...emptyRef, extra: "actual wire field" }) }], limits)).toMatchObject({ ok: false, reason: "schema" });
  // A caller that serialized away host fields supplied different metadata;
  // accepting those bytes would not validate the original host object.
  const ref: ArtifactRef = { digest: d("a"), bytes: 0, encoding: "raw" };
  expect(parseBundleRecord("ArtifactRef", canonicalBytes(ref), limits)).toEqual({ ok: true, value: ref });
  for (const bytes of [utf8(JSON.stringify(ref, null, 2)), utf8('{"bytes":0,"bytes":0,"digest":"x","encoding":"raw"}'), new Uint8Array([0xef, 0xbb, 0xbf, ...canonicalBytes(ref)]), new Uint8Array([0xff])]) {
    expect(parseBundleRecord("ArtifactRef", bytes, limits)).toMatchObject({ ok: false, reason: "canonical" });
  }
  expect(parseBundleRecord("ArtifactRef", canonicalBytes({ ...ref, verified: true }), limits)).toMatchObject({ ok: false, reason: "schema" });
  expect(parseBundleRecord("ArtifactRef", canonicalBytes(ref), { ...limits, bytes: 1 })).toMatchObject({ ok: false, reason: "limits" });
  expect(parseBundleRecord("ArtifactRef", canonicalBytes(ref), { ...limits, records: 0 })).toMatchObject({ ok: false, reason: "limits" });
  expect(parseBundleRecord("ArtifactRef", canonicalBytes(ref), { ...limits, tokens: 1 })).toMatchObject({ ok: false, reason: "limits" });
  const original = fixture().finish(); const first = original.artifacts[0]!;
  expect(verifyDeclaredBundleClosure(original.root, [...original.artifacts, { ...first, ref: canonicalBytes({ ...original.opaque, encoding: "utf8" }) }], limits)).toMatchObject({ ok: false, reason: "conflict" });
  const changed = original.artifacts.map((item, index) => index === 0 ? { ...item, bytes: utf8("[]") } : item);
  expect(verifyDeclaredBundleClosure(original.root, changed, limits)).toMatchObject({ ok: false, reason: "content" });
  // Representative typed-edge witness: TrustAnchor.first requires the framed
  // BindingSetId, although the same record's raw ArtifactId is a valid inspection root.
  const add = (kind: Exclude<BundleArtifact["kind"], null>, value: unknown) => {
    const bytes = canonicalBytes(value); const ref = { digest: digestBytes(bytes), bytes: bytes.length, encoding: "canonical-json" as const };
    original.artifacts.push({ ref: canonicalBytes(ref), bytes, kind }); return ref;
  };
  const evidence = { artifact: original.opaque, kind: "operator-statement" as const };
  const service = add("ServiceIdentity", { format: "artroom-logical-service-1", name: "fixture", provenance: evidence });
  const set = { format: "artroom-source-binding-set-1", service: service.digest, revision: 0, parent: null, bindings: [], decision: evidence };
  const setRef = add("BindingSetRevision", set);
  const anchor = { format: "artroom-bundle-trust-anchor-1", service: service.digest, publisher: keyIdOfSecret(new Uint8Array(32).fill(1)), first: { revision: 0, bindingSet: semanticContentId("artroom-source-binding-set-1", set) }, authority: evidence, custody: evidence };
  const anchorRef = add("TrustAnchor", anchor);
  expect(verifyDeclaredBundleClosure(semanticContentId("artroom-bundle-trust-anchor-1", anchor), original.artifacts, limits)).toMatchObject({ ok: true });
  expect(verifyDeclaredBundleClosure(anchorRef.digest, original.artifacts, limits)).toMatchObject({ ok: true });
  const pin = { service: service.digest, subject: { kind: "founding", service: service.digest, seed: { v: 1, kind: "register", definition: "platform:register@1", creator: null, cause: d("a"), ordinal: 0 }, intent: d("b"), admission: original.opaque.digest }, bundle: original.root, abi: original.abi.digest, bindingSet: anchor.first.bindingSet, revision: 0, activationTuple: d("c"), runtimeRelease: original.opaque.digest, compatibility: original.opaque.digest };
  const pinRef = add("SelectionPin", pin);
  expect(verifyDeclaredBundleClosure(pinRef.digest, original.artifacts, limits)).toMatchObject({ ok: true });
  const wrongRaw = add("SelectionPin", { ...pin, runtimeRelease: original.root });
  expect(verifyDeclaredBundleClosure(wrongRaw.digest, original.artifacts, limits)).toMatchObject({ ok: false, reason: "unavailable", path: "artifact-reference" });
  const aliased = { ...anchor, first: { ...anchor.first, bindingSet: setRef.digest } };
  const aliasedRef = add("TrustAnchor", aliased);
  expect(verifyDeclaredBundleClosure(aliasedRef.digest, original.artifacts, limits)).toMatchObject({ ok: false, reason: "content", path: "reference.domain" });
  // No hash collision is needed: exact framing bytes have a raw digest equal
  // to the manifest's typed ID. Retention and typed edges remain valid, while
  // the unqualified ambiguous root refuses in either insertion order.
  const framing = semanticContentBytes("artroom-semantic-bundle-1", original.manifest);
  expect(digestBytes(framing)).toBe(original.root);
  const framedRaw: BundleArtifact = { ref: canonicalBytes({ digest: digestBytes(framing), bytes: framing.length, encoding: "raw" }), bytes: framing, kind: null };
  for (const artifacts of [[...original.artifacts, framedRaw], [framedRaw, ...original.artifacts]]) {
    expect(verifyDeclaredBundleClosure(pinRef.digest, artifacts, limits)).toMatchObject({ ok: true });
    expect(verifyDeclaredBundleClosure(original.root, artifacts, limits)).toMatchObject({ ok: false, reason: "conflict", path: "root.identity" });
  }
});

test("founding failures retain exact intended target; recorded refusal remains an existing full reference and cannot become applied/unborn by shape", () => {
  const scope = { kind: "register", scope: `sc_${"a".repeat(52)}`, inc: `in_${"a".repeat(26)}` };
  const seed = { v: 1, kind: "register", definition: "platform:register@1", creator: null, cause: d("b"), ordinal: 0 };
  const target = { service: d("c"), seed, intent: d("d") };
  const held = { result: "founding-held", target, hold: { reason: "unavailable", inputs: ["abi", "bundle"] } };
  expect(parseBundleRecord("SelectionResult", canonicalBytes(held), limits)).toEqual({ ok: true, value: held });
  expect(parseBundleRecord("SelectionResult", canonicalBytes({ ...held, context: {} }), limits)).toMatchObject({ ok: false, reason: "schema" });
  expect(parseBundleRecord("SelectionResult", canonicalBytes({ ...held, hold: { reason: "conflict", inputs: [{ input: "abi", candidates: [d("a")] }] } }), limits)).toMatchObject({ ok: false, reason: "schema" });
  const ref = { digest: d("e"), bytes: 0, encoding: "canonical-json" };
  const refusedTarget = { service: d("c"), scope, genesis: { at: scope, seq: 0, hash: d("f") }, named: "platform:register@1", targetHead: { seq: 0, hash: d("f") }, genesisBytes: ref, history: [{ first: 0, last: 0, entries: ref }], retained: [], refusalSchema: ref };
  const refused = { result: "existing-refused-held", target: refusedTarget, hold: { reason: "unavailable", inputs: ["historical-admission"] } };
  expect(parseBundleRecord("SelectionResult", canonicalBytes(refused), limits)).toEqual({ ok: true, value: refused });
  expect(parseBundleRecord("SelectionResult", canonicalBytes({ ...refused, target: { ...refusedTarget, genesis: { ...refusedTarget.genesis, seq: 1 } } }), limits)).toMatchObject({ ok: false, reason: "schema" });
  // Parsing this envelope does not authenticate its fictitious bytes, schema, scope or standing.
});

test("signatures use their exact adopted domains and exact anchor/service/key identities; two-key rotation is cryptographic correctness, not installed trust", () => {
  const secret = new Uint8Array(32).fill(1), nextSecret = new Uint8Array(32).fill(2);
  const evidence = { artifact: { digest: d("a"), bytes: 0, encoding: "raw" as const }, kind: "operator-statement" as const };
  const anchor: TrustAnchor = { format: "artroom-bundle-trust-anchor-1", service: d("b"), publisher: keyIdOfSecret(secret), first: { revision: 0, bindingSet: d("c") }, authority: evidence, custody: evidence };
  const anchorId = semanticContentId("artroom-bundle-trust-anchor-1", anchor);
  const payload: SignaturePayload = { format: "artroom-semantic-signature-1", service: anchor.service, anchor: anchorId, publisher: anchor.publisher, subject: { kind: "binding-set", id: d("c") }, bindingSet: d("c"), revision: 0, parent: null };
  const envelope = { payload, sig: sign(secret, semanticContentBytes("artroom-semantic-signature-1", payload)) };
  expect(checkBundleSignature(canonicalBytes(envelope), canonicalBytes(anchor), limits)).toEqual({ ok: true, value: payload });
  expect(checkBundleSignature(canonicalBytes({ ...envelope, sig: sign(secret, utf8(`artroom-intent-1\n${new TextDecoder().decode(canonicalBytes(payload))}`)) }), canonicalBytes(anchor), limits)).toMatchObject({ ok: false, reason: "signature" });
  expect(checkBundleSignature(canonicalBytes({ ...envelope, payload: { ...payload, service: d("d") } }), canonicalBytes(anchor), limits)).toMatchObject({ ok: false, reason: "conflict" });
  const next = { ...anchor, publisher: keyIdOfSecret(nextSecret) };
  const change = { format: "artroom-bundle-anchor-change-1" as const, service: anchor.service, prior: anchorId, next: semanticContentId("artroom-bundle-trust-anchor-1", next), at: { revision: 0, bindingSet: d("c") }, decision: evidence };
  const bytes = semanticContentBytes("artroom-bundle-anchor-change-1", change);
  const signed = { payload: change, priorSignature: sign(secret, bytes), nextSignature: sign(nextSecret, bytes) };
  expect(checkAnchorChange(canonicalBytes(signed), canonicalBytes(anchor), canonicalBytes(next), limits)).toEqual({ ok: true, value: change });
  expect(checkAnchorChange(canonicalBytes({ ...signed, nextSignature: sign(secret, bytes) }), canonicalBytes(anchor), canonicalBytes(next), limits)).toMatchObject({ ok: false, reason: "signature" });
  // ID framing is checked independently of the helper's formatter.
  expect(semanticContentId("artroom-semantic-bundle-1", {})).toBe(digestBytes(utf8('artroom-semantic-bundle-1\n{}')) as BundleId);
});

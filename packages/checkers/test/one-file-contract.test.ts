import { expect, test } from "vitest";
import { canonicalBytes, canonicalize, digestBytes, newIncarnation, utf8 } from "@generalbusiness/artroom-bytes";
import { configurationDigest, readConfiguration } from "../src/configuration.ts";
import { readReport } from "../src/outcome.ts";
import type { Configuration2, OneFileCheckABI, OneFileDetails, OneFileRunReport } from "../src/one-file-contract.ts";
import { checkoutTargetRefusal, configuration2Digest, oneFileABIDigest, oneFileDetailsDigest, readCheckTarget, readConfiguration2, readOneFileABI, readOneFileDetails, readOneFileReport, readSelector, reportIdentityRefusal, targetSelectorRefusal, type CheckReadLimits } from "../src/one-file-validation.ts";

// Pure MADE-UP contract records. No job, ABI/image artifact, filesystem,
// gateway, token, authority, runner or required-check satisfaction is proved.
const limits: CheckReadLimits = { bytes: 8192, records: 128, tokens: 512, depth: 12 };
const image = digestBytes(utf8("unresolved fixture image")), abiId = digestBytes(utf8("unresolved fixture ABI"));
const fact = { at: { scope: `sc_${"a".repeat(52)}` as const, inc: newIncarnation(new Uint8Array(16).fill(1)), kind: "lane" as const }, seq: 1, hash: digestBytes(utf8("fixture manifest")) };
const target = { kind: "one-file" as const, manifest: fact, base: "1".repeat(40), tree: "2".repeat(40), path: "README.md", content: "hé", digest: digestBytes(utf8("hé")), size: 3 };
const { content: _content, ...identity } = target;
const legacy = { name: "check", image, environment: [], steps: [["check"]], judged: { passed: { status: 0, line: "PASS" }, failed: { status: 1, line: "FAIL" } }, limits: { seconds: 60, outputBytes: 1024 } };
const configuration: Configuration2 = { ...legacy, checkout: { kind: "one-file", abi: abiId } };
const selection = { domain: "artroom-check-configuration-2" as const, digest: configuration2Digest(configuration) };

test("closed target/selector and domain-2 bytes remain distinct from shipped configuration-1 and caller limits", () => {
  expect(readCheckTarget(canonicalBytes(target), limits)).toEqual({ ok: true, value: target });
  expect(readCheckTarget(canonicalBytes({ ...target, commit: "3".repeat(40) }), limits)).toMatchObject({ ok: false, reason: "schema" });
  expect(readCheckTarget(canonicalBytes({ ...target, size: 4 }), limits)).toMatchObject({ ok: false, reason: "content" });
  expect(readSelector(canonicalBytes(selection), limits)).toEqual({ ok: true, value: selection });
  expect(readSelector(canonicalBytes({ digest: selection.digest }), limits)).toMatchObject({ ok: false, reason: "schema" });
  expect(targetSelectorRefusal(target, { domain: "artroom-check-configuration-1", digest: selection.digest })).toBe("target-incompatible");
  expect(targetSelectorRefusal(target, selection)).toBeNull(); // Encoding match only, not ready.
  expect(configuration2Digest(configuration)).toBe(digestBytes(utf8(`artroom-check-configuration-2\n${canonicalize(configuration)}`)));
  expect(readConfiguration2(canonicalBytes(configuration), selection.digest, limits)).toEqual({ ok: true, value: configuration });
  expect(readConfiguration2(canonicalBytes(configuration), configurationDigest(configuration), limits)).toMatchObject({ ok: false, reason: "content" });
  expect(readConfiguration2(canonicalBytes(configuration), selection.digest, { ...limits, bytes: 1 })).toMatchObject({ ok: false, reason: "limits" });
  expect(readConfiguration(canonicalize(legacy), configurationDigest(legacy))).toEqual(legacy);
  expect(readConfiguration(canonicalize(configuration), configurationDigest(configuration))).toBeNull();
});

test("one-file report/details are closed data and exact identity refusals precede any inferred successful checkout", () => {
  const abi: OneFileCheckABI = { format: "artroom-one-file-check-abi-1", targetInput: abiId, jobInput: abiId, configurationInput: abiId, baseRead: abiId, candidateConstruction: abiId, checkoutVerification: abiId, report: abiId, details: abiId, budgets: abiId, images: [{ image, adapter: abiId, correspondence: abiId }] };
  expect(readOneFileABI(canonicalBytes(abi), limits)).toEqual({ ok: true, value: abi }); // No actual retained artifact closure.
  expect(oneFileABIDigest(abi)).toBe(digestBytes(canonicalBytes(abi)));
  const report: OneFileRunReport = { format: "artroom-one-file-check-run-1", job: { ...fact, seq: 2 }, configuration: selection, abi: abiId, target: identity, started: true, image, environment: [], checkout: { confirmed: true, head: target.base, indexTree: target.tree, worktreeTree: target.tree }, steps: [{ status: 0, line: "PASS" }], end: "complete" };
  expect(readOneFileReport(canonicalBytes(report), limits)).toEqual({ ok: true, value: report });
  expect(reportIdentityRefusal(report, report)).toBeNull(); // Equality is not filesystem/image/permission proof.
  expect(reportIdentityRefusal({ ...report, configuration: { ...selection, digest: abiId }, abi: image }, report)).toBe("target-mismatch");
  expect(reportIdentityRefusal({ ...report, abi: image }, report)).toBe("abi-mismatch");
  const wrongCheckout = { ...report, checkout: { confirmed: true as const, head: "3".repeat(40), indexTree: target.tree, worktreeTree: target.tree } };
  expect(reportIdentityRefusal(wrongCheckout, report)).toBeNull(); // Checkout has its later phase.
  expect(checkoutTargetRefusal(wrongCheckout.checkout, report.target)).toBe("target-mismatch");
  expect(readOneFileReport(canonicalBytes({ ...report, checkout: true }), limits)).toMatchObject({ ok: false, reason: "schema" });
  expect(readOneFileReport(canonicalBytes({ ...report, checkout: { confirmed: false, reason: "arbitrary exception" }, steps: [] }), limits)).toMatchObject({ ok: false, reason: "schema" });
  expect(readOneFileReport(canonicalBytes({ ...report, started: false, checkout: { confirmed: false, reason: "checkout-failed" }, steps: [] }), limits)).toMatchObject({ ok: true });
  expect(readOneFileReport(canonicalBytes({ ...report, started: false }), limits)).toMatchObject({ ok: false, reason: "schema" });
  const details: OneFileDetails = { format: "artroom-one-file-check-details-1", provenance: { job: report.job, configuration: selection, abi: abiId, target: identity, image: { declared: image, resolved: null }, environment: digestBytes(canonicalBytes([])), checkout: null, steps: [{ name: "1", status: null }], run: "fixture-run" } };
  expect(readOneFileDetails(canonicalBytes(details), limits)).toEqual({ ok: true, value: details });
  expect(oneFileDetailsDigest(details)).toBe(digestBytes(canonicalBytes(details)));
  expect(readOneFileDetails(canonicalBytes({ ...details, provenance: { ...details.provenance, content: target.content } }), limits)).toMatchObject({ ok: false, reason: "schema" });
  expect(readReport({ started: false, image: null, environment: [], checkout: false, steps: [], end: "lost" })).not.toBeNull();
  expect(readReport(report)).toBeNull(); // No same-name/missing-field upgrade of old RunReport.
});

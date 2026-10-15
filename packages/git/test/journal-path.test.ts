import { expect, test } from "vitest";
import { isScopeId } from "@generalbusiness/artroom-bytes";
import { archiveDomain, archiveRetainedPath, archiveSegmentPath, domainOfArchiveSegment, firstOfArchiveSegment, journalRef, retainedOfArchivePath, scopeOfJournalRef } from "../src/journal-path.ts";

// Invariant: archive names round-trip without path interpretation, lossy
// Unicode conversion, alternate spellings, or an unbounded path segment.
test("domain segments preserve hostile and Unicode names exactly within the byte limit", () => {
  for (const domain of ["", "artroom-rules-extents-1", "../x", "a/b", "\0", "雪🙂", "\uFEFFx", "a".repeat(158)]) {
    const segment = archiveDomain(domain);
    expect(segment).toMatch(/^d_[a-z2-7]*$/);
    expect(segment.length).toBeLessThanOrEqual(255);
    expect(domainOfArchiveSegment(segment)).toBe(domain);
  }
  expect(archiveDomain("a")).toBe("d_me");
  expect(archiveDomain("a".repeat(158))).toHaveLength(255);
  for (const domain of ["a".repeat(159), "a".repeat(300), "雪".repeat(53)]) expect(() => archiveDomain(domain)).toThrow("too-large");
  expect(() => archiveDomain("\uD800")).toThrow("bad-path");
  for (const segment of ["d_mf", "d_a", "d_ME", "d_74", "d_../x", "d_" + "a".repeat(254)]) expect(domainOfArchiveSegment(segment)).toBeNull();
});

test("retained paths accept only canonical kinds, domains and digests; a text is not an archive input", () => {
  const digest = `sha256:${"a".repeat(64)}` as const;
  const plain = { kind: "rule", digest } as const;
  const value = { kind: "value", domain: "../x\0雪", digest } as const;
  for (const name of [plain, value]) expect(retainedOfArchivePath(archiveRetainedPath(name))).toEqual(name);
  expect(archiveRetainedPath(plain)).toBe(`journal/v1/retained/rule/${"a".repeat(64)}`);
  for (const name of [{ kind: "text", digest }, { ...plain, domain: "hidden" }, { ...value, digest: digest.toUpperCase() }]) {
    expect(() => archiveRetainedPath(name as never)).toThrow("bad-path");
  }
  for (const path of [
    `journal/v1/retained/text/${"a".repeat(64)}`, `journal/v1/retained/value/${"a".repeat(64)}`,
    `journal/v1/retained/rule/d_me/${"a".repeat(64)}`, `journal/v1/retained/value/d_mf/${"a".repeat(64)}`,
    `journal/v1/retained/rule/${"A".repeat(64)}`, `journal/v1/retained/rule/../${"a".repeat(64)}`,
  ]) expect(retainedOfArchivePath(path)).toBeNull();
});

test("journal refs retain native scope spelling and refuse malformed or noncanonical IDs", () => {
  const scope = `sc_${"a".repeat(52)}`;
  expect(isScopeId(scope)).toBe(true);
  expect(journalRef(scope)).toBe(`refs/artroom/journal/${scope}`);
  expect(scopeOfJournalRef(journalRef(scope))).toBe(scope);
  for (const bad of [scope + "/x", scope.slice(0, -1) + "b", scope.toUpperCase()]) {
    expect(() => journalRef(bad)).toThrow("bad-ref-name");
    expect(scopeOfJournalRef("refs/artroom/journal/" + bad)).toBeNull();
  }
});

test("segments have one twelve-digit spelling at both endpoints", () => {
  expect(archiveSegmentPath(0)).toBe("journal/v1/segments/000000000000.jsonl");
  for (const first of [0, 1000, 999_999_999_999]) expect(firstOfArchiveSegment(archiveSegmentPath(first))).toBe(first);
  for (const first of [-1, 0.5, 1_000_000_000_000, NaN]) expect(() => archiveSegmentPath(first)).toThrow("bad-path");
  for (const path of ["journal/v1/segments/0.jsonl", "journal/v1/segments/0000000000000.jsonl", "journal/v1/segments/../000000000000.jsonl"]) expect(firstOfArchiveSegment(path)).toBeNull();
});

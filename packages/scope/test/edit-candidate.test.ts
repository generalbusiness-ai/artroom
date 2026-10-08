import { expect, test } from "vitest";
import { canonicalize, digestBytes, utf8 } from "@generalbusiness/artroom-bytes";
import { idOf, parseTree } from "@generalbusiness/artroom-git";
import type { DestinationObject } from "@generalbusiness/artroom-platform";
import { editCandidate, type CandidateAllowances, type CandidateInput } from "../src/edit-candidate.ts";

// Pure byte adapter: objects are fixture data; no Room, host or permission.
test("candidate needs exact snapshotted base/tree closure and file bytes; preserves modes and full link resolution within explicit allowances", async () => {
  const object = (kind: DestinationObject["kind"], body: Uint8Array): DestinationObject => ({ kind, body, id: idOf(kind, body) });
  const readme = object("blob", utf8("old\n"));
  const link = object("blob", utf8("target"));
  const row = (mode: string, name: string, id: string) => new Uint8Array([...utf8(`${mode} ${name}\0`), ...id.match(/../g)!.map((pair) => parseInt(pair, 16))]);
  const tree = object("tree", new Uint8Array([...row("100755", "README.md", readme.id), ...row("120000", "link", link.id)]));
  const base = object("commit", utf8(`tree ${tree.id}\nauthor a <a@a> 1 +0000\ncommitter a <a@a> 1 +0000\n\nbase\n`));
  const bytes = utf8("new\n");
  const input: CandidateInput = { format: "sha1", base: base.id, objects: [base, tree, readme, link], file: { path: "target", bytes, size: bytes.length, digest: digestBytes(bytes) } };
  const limits: CandidateAllowances = {
    inputBytes: 10000, inputObjects: 16, treeEntries: 1000, depth: 8, work: 100000,
    generatedBytes: 10000, generatedObjects: 8,
    read: { commitBytes: 10000, parents: 8, treeBytes: 10000, blobBytes: 10000, closureObjects: 32, refs: 1 },
    comparison: { trees: 32, files: 32, pathBytes: 1024, depth: 8, changedPaths: 8, links: 8, changedBytes: 10000, linkSteps: 100 },
  };
  const pending = editCandidate(input, limits);
  input.file.path = "mutated"; bytes[0] = 0;
  const made = await pending;
  expect(made.result).toBe("candidate");
  if (made.result !== "candidate") return expect.fail("candidate required");
  expect(made.base).toBe(base.id);
  expect(made.objects.every((o) => o.kind !== "commit")).toBe(true);
  const entries = parseTree(made.objects.find((o) => o.id === made.tree)!.body);
  expect(entries.map((e) => [new TextDecoder().decode(e.name), e.mode])).toEqual([["README.md", "100755"], ["link", "120000"], ["target", "100644"]]);
  expect(made.changes).toEqual({ paths: ["target"], unreadable: 0, links: [{ path: "link", tree: "old", resolves: null }, { path: "link", tree: "new", resolves: ["target"] }] });
  const good: CandidateInput = { ...input, file: { path: "target", bytes: utf8("new\n"), size: 4, digest: digestBytes(utf8("new\n")) } };
  const missing = await editCandidate({ ...good, objects: [base, tree, link] }, limits);
  expect(missing).toEqual({ result: "unknown", reason: "missing-object" });
  const corrupt = await editCandidate({ ...good, objects: [base, tree, { ...readme, body: utf8("bad\n") }, link] }, limits);
  expect(corrupt).toEqual({ result: "unknown", reason: "hash-mismatch" });
  expect(await editCandidate({ ...good, file: { ...good.file, digest: digestBytes(utf8("other")) } }, limits)).toEqual({ result: "refused", reason: "hash-mismatch" });
  expect(await editCandidate({ ...good, file: { ...good.file, size: 3 } }, limits)).toEqual({ result: "refused", reason: "wrong-size" });
  expect(await editCandidate({ ...good, file: { ...good.file, path: "link/file" } }, limits)).toEqual({ result: "refused", reason: "path-conflict" });
  expect(await editCandidate(good, { ...limits, generatedBytes: 1 })).toEqual({ result: "refused", reason: "too-large" });
  expect(await editCandidate(good, { ...limits, treeEntries: 1 })).toEqual({ result: "refused", reason: "too-large" });
  expect(await editCandidate(good, { ...limits, work: 1 })).toEqual({ result: "refused", reason: "too-large" });
  const snapshotWork = good.file.bytes.length + good.objects.reduce((n, object) => n + object.body.length + 1, 0);
  expect(await editCandidate(good, { ...limits, work: snapshotWork })).toEqual({ result: "refused", reason: "too-large" });
  expect(await editCandidate({ ...good, objects: [...good.objects, { kind: "blob", id: "x".repeat(1600), body: new Uint8Array() }] }, limits)).toEqual({ result: "unknown", reason: "bad-object-id" });
  expect(await editCandidate({ ...good, file: { ...good.file, path: "éé" } }, { ...limits, comparison: { ...limits.comparison, pathBytes: 2 } })).toEqual({ result: "refused", reason: "bad-path" });
  expect(await editCandidate(good, { ...limits, read: { ...limits.read, closureObjects: 0 } })).toEqual({ result: "refused", reason: "too-large" });
  expect(await editCandidate(good, { ...limits, read: { ...limits.read, commitBytes: base.body.length - 1 } })).toEqual({ result: "refused", reason: "too-large" });
  expect(await editCandidate(good, { ...limits, comparison: { ...limits.comparison, linkSteps: 0 } })).toEqual({ result: "refused", reason: "too-large" });
  const oneStep = await editCandidate(good, { ...limits, comparison: { ...limits.comparison, linkSteps: 1 } });
  expect(oneStep.result).toBe("candidate");
  if (oneStep.result === "candidate") expect(oneStep.changes).toEqual(made.changes);
  const size = utf8(canonicalize(made.changes)).length;
  expect((await editCandidate(good, { ...limits, comparison: { ...limits.comparison, changedBytes: size } })).result).toBe("candidate");
  expect(await editCandidate(good, { ...limits, comparison: { ...limits.comparison, changedBytes: size - 1 } })).toEqual({ result: "refused", reason: "too-large" });
});

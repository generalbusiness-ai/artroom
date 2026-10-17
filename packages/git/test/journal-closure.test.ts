import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { ArchiveBudget } from "../../scope/src/archive-budget.ts";
import { buildJournalArchive, type JournalArchive, type JournalLayoutResult } from "../src/journal-layout.ts";
import { journalObjectClosure } from "../src/journal-closure.ts";
import { JournalObjectReader, JournalObjects, type JournalFormat, type JournalObjectSource } from "../src/journal-objects.ts";
import { JournalWork } from "../src/journal-work.ts";
import { archiveObjectSource, archiveRepository, described, selectedInput, syntheticJournal, writeArchiveObjects } from "./support/journal.ts";
import { cleanup, git } from "./support/repo.ts";

afterAll(cleanup);
const formats: readonly JournalFormat[] = ["sha1", "sha256"];
function complete(result: JournalLayoutResult): JournalArchive {
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("fixture needs a complete archive");
  return result.archive;
}
async function chain(format: JournalFormat) {
  const firstFixture = syntheticJournal(), first = complete(await buildJournalArchive({ format, ...described(firstFixture), input: selectedInput(firstFixture), parent: null }));
  const dir = archiveRepository(format); writeArchiveObjects(dir, first.objects);
  const secondFixture = syntheticJournal(2), second = complete(await buildJournalArchive({ format, ...described(secondFixture), input: selectedInput(secondFixture), parent: { id: first.commit, source: archiveObjectSource(dir) } }));
  writeArchiveObjects(dir, second.objects);
  return { dir, first, second, current: syntheticJournal(3) };
}

test.each(formats)("a complete multi-commit parent graph extends and missing older commit/tree/blob refuses with the immediate prefix intact (%s)", async format => {
    const { dir, first, second, current } = await chain(format), parent = { id: second.commit, source: archiveObjectSource(dir) };
    const full = complete(await buildJournalArchive({ format, ...described(current), input: selectedInput(current), parent }));
    writeArchiveObjects(dir, full.objects);
    expect(git(dir, ["rev-list", "--count", full.commit])).toBe("3");
    expect(git(dir, ["fsck", "--strict", "--no-dangling", full.commit])).toBe("");
    const oldHead = git(dir, ["rev-parse", `${first.commit}:journal/v1/head.json`]);
    for (const id of [first.commit, first.tree, oldHead]) {
      // A deliberately invalid Git fixture: only an older object vanishes.
      // The immediate parent's complete represented tree remains available.
      rmSync(join(dir, "objects", id.slice(0, 2), id.slice(2)));
      const result = await buildJournalArchive({ format, ...described(current), input: selectedInput(current), parent });
      expect(result.ok ? "accepted" : result.reason).toBe("parent");
      expect(result).not.toHaveProperty("archive");
      writeArchiveObjects(dir, first.objects);
    }
    for (const fault of ["type", "hash"] as const) {
      const ordinary = archiveObjectSource(dir);
      const source: JournalObjectSource = { object: async (id, limit) => {
        const got = await ordinary.object(id, limit);
        if (!got || id !== first.commit) return got;
        if (fault === "type") return { ...got, type: "blob" };
        if (limit === 0 || got.data === null) return got;
        const data = new Uint8Array(got.data); data[data.length - 1] = data[data.length - 1]! ^ 1;
        return { ...got, data };
      } };
      const result = await buildJournalArchive({ format, ...described(current), input: selectedInput(current), parent: { id: second.commit, source } });
      expect(result.ok ? "accepted" : result.reason).toBe("parent");
    }
    expect(full.parentClosure?.commits).toBe(2); expect(full.parentClosure!.cacheHits).toBeGreaterThan(0);
}, 15_000); // Each format runs several real local Git fault/read-back probes.

// This four-object DAG is a mechanical Git fixture, not a native archive
// selection. Five actual edges reach four objects: commit→root, root→a/b
// (the shared tree), then shared→leaf. The cached fifth lookup must spend
// its own attempt; exactly nine attempts include four physical reads.
test("shared subtrees expand once but cached edges still spend the original allowance, with no success after exhaustion", async () => {
  for (const format of formats) {
    const maker = new JournalObjects(format, new JournalWork(new ArchiveBudget({}, () => 0)));
    // Stand-in blob contents with a Git-looking reference, as a native
    // snapshot may contain. Only actual Git object edges are traversed.
    const embedded = "7".repeat(format === "sha1" ? 40 : 64);
    const blob = maker.make("blob", new TextEncoder().encode(JSON.stringify({ commit: embedded }))), shared = maker.tree([{ name: "leaf", mode: "100644", id: blob.id }]);
    const root = maker.tree([{ name: "a", mode: "40000", id: shared.id }, { name: "b", mode: "40000", id: shared.id }]);
    const commit = maker.commit(root.id, null, 0), dir = archiveRepository(format); writeArchiveObjects(dir, maker.objects());
    expect(git(dir, ["fsck", "--strict", "--no-dangling", commit.id])).toBe("");
    const calls: { id: string; limit: number }[] = [], budget = new ArchiveBudget({ attempts: 9 }, () => 0), work = new JournalWork(budget);
    const checked = await journalObjectClosure(new JournalObjectReader(format, archiveObjectSource(dir, calls), work), commit.id, work);
    expect(checked).toEqual({ commits: 1, objects: 4, edges: 5, cacheHits: 1 });
    expect(calls.filter(call => call.id === shared.id).length).toBe(2); // metadata + body, no second physical expansion.
    expect(calls.some(call => call.id === embedded)).toBe(false);
    expect(budget.admitted().attempts).toBe(9);
    const short = new JournalWork(new ArchiveBudget({ attempts: 8 }, () => 0));
    const stopped = await journalObjectClosure(new JournalObjectReader(format, archiveObjectSource(dir), short), commit.id, short).then(() => "accepted", error => error && typeof error === "object" && "reason" in error ? error.reason : "unexpected");
    expect(stopped).toBe("limit"); expect(() => short.check()).toThrow("archive-limit");
    let reads = 0;
    const zero = new JournalWork(new ArchiveBudget({}, () => 0), { objects: 0 });
    const result = await journalObjectClosure(new JournalObjectReader(format, { object: async () => { reads++; return null; } }, zero), commit.id, zero).then(() => "accepted", error => error && typeof error === "object" && "reason" in error ? error.reason : "unexpected");
    expect(result).toBe("limit"); expect(reads).toBe(0);

    // The subtree first seen at depth one is then reused at depth two.
    // Its cached leaf height still counts toward the latter path's bound.
    const wrapper = maker.tree([{ name: "c", mode: "40000", id: shared.id }]);
    const deeper = maker.tree([{ name: "a", mode: "40000", id: shared.id }, { name: "b", mode: "40000", id: wrapper.id }]);
    const deepCommit = maker.commit(deeper.id, null, 0); writeArchiveObjects(dir, maker.objects());
    const enough = new JournalWork(new ArchiveBudget({}, () => 0), { depth: 3 });
    const deep = await journalObjectClosure(new JournalObjectReader(format, archiveObjectSource(dir), enough), deepCommit.id, enough);
    expect(deep.cacheHits).toBe(1); expect(enough.used.depth).toBe(3);
    const shallow = new JournalWork(new ArchiveBudget({}, () => 0), { depth: 2 });
    const tooDeep = await journalObjectClosure(new JournalObjectReader(format, archiveObjectSource(dir), shallow), deepCommit.id, shallow).then(() => "accepted", error => error && typeof error === "object" && "reason" in error ? error.reason : "unexpected");
    expect(tooDeep).toBe("limit"); expect(() => shallow.check()).toThrow("journal-layout-limit");
  }
});

test("a late older-object read cannot outlive the same original pass deadline or return a partial extension", async () => {
  const format = "sha256", { dir, first, second, current } = await chain(format);
  let now = 0, release!: () => void, entered!: () => void;
  const ready = new Promise<void>(done => { entered = done; }), calls: { id: string; limit: number }[] = [], ordinary = archiveObjectSource(dir, calls);
  const source: JournalObjectSource = { object: async (id, limit) => {
    const got = await ordinary.object(id, limit);
    if (id !== first.commit || limit === 0) return got;
    return new Promise(done => { release = () => done(got); entered(); });
  } };
  const pending = buildJournalArchive({ format, ...described(current, new ArchiveBudget({}, () => now, 30_000)), input: selectedInput(current), parent: { id: second.commit, source } });
  await ready; const before = calls.length; now = 30_000; release();
  const result = await pending;
  expect(result).toEqual({ ok: false, reason: "timeout" }); expect(result).not.toHaveProperty("archive");
  expect(calls.length).toBe(before);
});

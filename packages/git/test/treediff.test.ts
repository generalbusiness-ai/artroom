// Path diffs through a tree reader shaped like the Artifacts binding. The
// trees and commits are real git objects, built in memory (support.ts), so a
// read costs no process. Where git itself is the oracle (`git diff`,
// `git merge-base --all`), the same objects are written to a repository on
// disk and git is asked once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Fixture, GitObjects, sh } from "./support.ts";
import {
  TreeCache,
  changedPaths,
  mergeBases,
  overlappingPaths,
  previewPlan,
  touchedPaths,
  treeDiff,
  type TreeReader,
} from "../src/diff/treediff.ts";

/** Paths that differ between two commits, from their file lists: what `git diff --name-only --no-renames` prints. */
function differing(git: GitObjects, a: string, b: string): string[] {
  const [fa, fb] = [git.files(a), git.files(b)];
  return [...new Set([...fa.keys(), ...fb.keys()])].filter((p) => fa.get(p) !== fb.get(p)).sort();
}

test("adds, deletes, modifies, exact renames and directory/file swaps match git, with old and new paths", async (t) => {
  const f = new Fixture().init({
    "README.md": "r\n",
    "src/a.txt": "a\n",
    "src/b.txt": "b\n",
    "src/deep/x/y/z.txt": "z\n",
    "docs/guide.md": "g\n",
    "thing": "file\n",
  });
  t.after(() => f.dispose());
  const head = f.commit(f.main, {
    "src/a.txt": "a2\n", //                     modified
    "src/b.txt": null, //                       renamed …
    "lib/b.txt": "b\n", //                      … to here
    "src/deep/x/y/z.txt": null, //              deleted
    "src/new.txt": "n\n", //                    added
    "thing": null, //                           file → directory
    "thing/inside.txt": "i\n",
  });
  const reader = f.git.reader();
  const r = await changedPaths(reader, f.main, head);
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  assert.deepEqual(r.changes, [
    { status: "renamed", path: "lib/b.txt", from: "src/b.txt" },
    { status: "modified", path: "src/a.txt" },
    { status: "deleted", path: "src/deep/x/y/z.txt" },
    { status: "added", path: "src/new.txt" },
    { status: "deleted", path: "thing" },
    { status: "added", path: "thing/inside.txt" },
  ]);
  // Git's own answer for the same two commits.
  const gitSays = (await sh(f.root, "--git-dir", f.canonical, "diff", "--name-only", "--no-renames", f.main, head)).split("\n").filter(Boolean).sort();
  assert.deepEqual(touchedPaths(r.changes), gitSays);
  assert.deepEqual(differing(f.git, f.main, head), gitSays, "control: the file lists give git's answer too");
  // Unchanged subtrees are skipped: docs/ is never read.
  const docsTree = f.git.treeAt(head, "docs");
  const reads: string[] = [];
  const spy: TreeReader = { readTree: (h) => (reads.push(h), reader.readTree(h)), readCommit: (h) => reader.readCommit(h) };
  await changedPaths(spy, f.main, head);
  assert.ok(reads.length > 0 && !reads.includes(docsTree));
});

test("the merge base is used: changes that came from main are not the proposal's (R-PROP-3)", async () => {
  const git = new GitObjects();
  const main = git.commit([], { "a.txt": "a\n", "b.txt": "b\n" });
  const lane = git.commit([main], { "a.txt": "lane\n" });
  const main2 = git.commit([main], { "b.txt": "main moved\n" });
  // The lane merges main back in, then edits again.
  const merged = git.commit([lane, main2], { "b.txt": "main moved\n" });
  const head = git.commit([merged], { "c.txt": "c\n" });
  const reader = git.reader();
  assert.deepEqual(await mergeBases(reader, main2, head), [main2]);
  const r = await changedPaths(reader, main2, head);
  assert.deepEqual(r.kind === "ok" && touchedPaths(r.changes), ["a.txt", "c.txt"]);
});

test("criss-cross history: every merge base is found, as git merge-base --all finds them", async (t) => {
  const f = new Fixture().init({ "a.txt": "a\n", "b.txt": "b\n", "c.txt": "c\n" });
  t.after(() => f.dispose());
  const x = f.commit(f.main, { "a.txt": "x\n" });
  const y = f.commit(f.main, { "b.txt": "y\n" });
  const m1 = f.commit(f.commit([x, y], { "b.txt": "y\n" }), { "c.txt": "m1\n" });
  const m2 = f.commit([y, x], { "a.txt": "x\n" });
  const bases = await mergeBases(f.git.reader(), m1, m2);
  const gitBases = (await sh(f.root, "--git-dir", f.canonical, "merge-base", "--all", m1, m2)).split("\n").sort();
  assert.deepEqual(bases, gitBases);
  assert.deepEqual(gitBases, [x, y].sort());
});

test("a cache by tree hash makes a repeated diff free, and the bound refuses the same diff every time (R-PROP-6)", async () => {
  const git = new GitObjects();
  const files: Record<string, string> = {};
  for (let d = 0; d < 10; d++) for (let i = 0; i < 20; i++) files[`dir${d}/f${i}.txt`] = `${d}.${i}\n`;
  const main = git.commit([], files);
  const change: Record<string, string> = {};
  for (let d = 0; d < 10; d++) change[`dir${d}/f0.txt`] = "changed\n";
  const head = git.commit([main], change);
  const reader = git.reader();
  const cache = new TreeCache();
  const first = await changedPaths(reader, main, head, { cache });
  assert.equal(first.kind === "ok" && first.changes.length, 10);
  const reads = reader.treeReads;
  assert.ok(reads > 0);
  const second = await changedPaths(reader, main, head, { cache });
  assert.equal(reader.treeReads, reads, "the second diff reads no trees");
  assert.equal(second.kind === "ok" && second.stats.cacheHits > 0, true);
  // 2 roots of 10 entries, then 10 pairs of 20: 20 + 400 = 420 entries.
  assert.equal(first.stats.entries, 420);
  for (const c of [undefined, new TreeCache(), cache]) {
    const r = await treeDiff(reader, git.commitFacts(main).tree, git.commitFacts(head).tree, {
      bounds: { maxEntries: 419 },
      ...(c ? { cache: c } : {}),
    });
    assert.deepEqual([r.kind, r.kind === "too-large" ? r.bound : null], ["too-large", "entries"]);
  }
  const atLimit = await changedPaths(reader, main, head, { bounds: { maxEntries: 420 } });
  assert.equal(atLimit.kind, "ok");
  const shallow = await changedPaths(reader, main, head, { bounds: { maxDepth: 0 } });
  assert.deepEqual([shallow.kind, shallow.kind === "too-large" ? shallow.bound : null], ["too-large", "depth"]);
});

test("tree reads never exceed the concurrency limit", async () => {
  const git = new GitObjects();
  const files: Record<string, string> = {};
  for (let d = 0; d < 30; d++) files[`d${d}/f.txt`] = `${d}\n`;
  const main = git.commit([], files);
  const change: Record<string, string> = {};
  for (let d = 0; d < 30; d++) change[`d${d}/f.txt`] = "x\n";
  const head = git.commit([main], change);
  const inner = git.reader();
  let active = 0;
  let peak = 0;
  const reader: TreeReader = {
    async readTree(h) {
      peak = Math.max(peak, ++active);
      try {
        await new Promise((r) => setImmediate(r)); // a read takes a turn, so reads overlap
        return await inner.readTree(h);
      } finally {
        active--;
      }
    },
    readCommit: (h) => inner.readCommit(h),
  };
  const r = await changedPaths(reader, main, head, { bounds: { concurrency: 4 } });
  assert.equal(r.kind === "ok" && r.changes.length, 30);
  assert.equal(peak, 4);
});

test("overlap: equal paths, a directory and a file inside it, and both sides of a rename", () => {
  const a = [
    { status: "modified" as const, path: "src/a.ts" },
    { status: "renamed" as const, path: "lib/new.ts", from: "lib/old.ts" },
    { status: "added" as const, path: "pkg" },
  ];
  assert.deepEqual(overlappingPaths(a, [{ status: "modified", path: "src/b.ts" }]), []);
  assert.deepEqual(overlappingPaths(a, [{ status: "modified", path: "src/a.ts" }]), ["src/a.ts"]);
  assert.deepEqual(overlappingPaths(a, [{ status: "deleted", path: "lib/old.ts" }]), ["lib/old.ts"]);
  assert.deepEqual(overlappingPaths(a, [{ status: "added", path: "pkg/index.ts" }]), ["pkg"]);
  assert.deepEqual(overlappingPaths([{ status: "added", path: "pkg/index.ts" }], a), ["pkg"]);
});

test("previewPlan: a sandbox preview is needed only when the proposal and main touch the same paths", async () => {
  const git = new GitObjects();
  const main = git.commit([], { "a.txt": "a\n", "b.txt": "b\n", "dir/c.txt": "c\n" });
  const main2 = git.commit([main], { "a.txt": "main\n" });
  const disjoint = git.commit([main], { "b.txt": "lane\n" });
  const same = git.commit([main], { "a.txt": "lane\n" });
  const dirFile = git.commit([main], { "dir/c.txt": null, "dir": "now a file\n" });
  const main3 = git.commit([main2], { "dir/c.txt": "main edit\n" });
  const reader = git.reader();
  assert.equal((await previewPlan(reader, main2, disjoint)).kind, "disjoint");
  const o = await previewPlan(reader, main2, same);
  assert.deepEqual(o.kind === "overlap" && o.paths, ["a.txt"]);
  const d = await previewPlan(reader, main3, dirFile);
  assert.deepEqual(d.kind === "overlap" && d.paths, ["dir", "dir/c.txt"]);
  assert.equal((await previewPlan(reader, main2, main2)).kind, "disjoint");
});

// ------------------------------------------------------------------ review 50104b16, P2.4: clock skew

for (const skew of ["backward", "equal"] as const) {
  test(`merge bases with ${skew} timestamps match git merge-base --all, and the changed paths are the union over exactly those bases`, async (t) => {
    const f = new Fixture().init({ "shared.txt": "r\n", "r.txt": "r\n" });
    t.after(() => f.dispose());
    const R = f.main;
    const time = (n: number) => (skew === "equal" ? 1_700_000_000 : 1_700_000_000 + n * 100);
    // Skewed clocks: A looks newer than its descendants M and B, and B older than its parent M.
    // The time-ordered walk reports A as a base before it reaches M, then stops.
    const A = f.commit([R], { "shared.txt": "a\n" }, { at: time(4), message: "A\n" });
    const M = f.commit([A], { "m.txt": "m\n" }, { at: time(1), message: "M\n" });
    const B = f.commit([M], { "b.txt": "b\n" }, { at: time(0), message: "B\n" });
    const C = f.commit([R], { "c.txt": "c\n" }, { at: time(3), message: "C\n" });
    const X = f.commit([A, B, C], { "shared.txt": "a\n", "m.txt": "m\n", "b.txt": "b\n", "c.txt": "c\n", "x.txt": "x\n" }, { at: time(6), message: "X\n" });
    const Y = f.commit([A, B, C], { "shared.txt": "a\n", "m.txt": "m\n", "b.txt": "b\n", "c.txt": "c\n", "lane.txt": "y\n" }, { at: time(7), message: "Y\n" });
    const reader = f.git.reader();
    const gitBases = (await sh(f.root, "--git-dir", f.canonical, "merge-base", "--all", X, Y)).split("\n").sort();
    assert.deepEqual(gitBases, [B, C].sort(), "git's answer: B and C; A is an ancestor of B");
    assert.deepEqual(await mergeBases(reader, X, Y), gitBases);
    const r = await changedPaths(reader, X, Y);
    assert.equal(r.kind, "ok");
    // The union of what differs between each base and Y (the first test checks this list against git diff).
    const union = new Set(gitBases.flatMap((base) => differing(f.git, base, Y)));
    assert.ok(union.has("shared.txt") && union.has("lane.txt"));
    assert.deepEqual(r.kind === "ok" ? touchedPaths(r.changes) : null, [...union].sort());
  });
}

// ------------------------------------------------------------------ review 50104b16, P2.5: deterministic refusal

test("a diff that crosses both the depth and the entry bounds is refused the same way, whatever the cache and read order", async () => {
  const git = new GitObjects();
  const files: Record<string, string> = { "deep/a/b/c/d/e/f.txt": "0\n" };
  for (let i = 0; i < 40; i++) files[`wide/f${i}.txt`] = "0\n";
  const main = git.commit([], files);
  const change: Record<string, string> = { "deep/a/b/c/d/e/f.txt": "1\n" };
  for (let i = 0; i < 40; i++) change[`wide/f${i}.txt`] = "1\n";
  const head = git.commit([main], change);
  const inner = git.reader();
  const [ta, tb] = [git.commitFacts(main).tree, git.commitFacts(head).tree];
  // Which trees are slow: the deep chain, the wide directory, or neither. A slow read answers a
  // turn of the event loop later, after every read that is not slow.
  const wideTrees = new Set([git.treeAt(main, "wide"), git.treeAt(head, "wide")]);
  const order: string[] = [];
  const delayed = (slow: "deep" | "wide" | "none"): TreeReader => ({
    async readTree(h) {
      const isWide = wideTrees.has(h);
      if ((slow === "wide" && isWide) || (slow === "deep" && !isWide)) await new Promise((r) => setImmediate(r));
      if (isWide) order.push(slow);
      return inner.readTree(h);
    },
    readCommit: (h) => inner.readCommit(h),
  });
  const outcomes = new Set<string>();
  for (const bounds of [{ maxDepth: 3, maxEntries: 60 }, { maxDepth: 3, maxEntries: 1000 }, { maxDepth: 10, maxEntries: 60 }]) {
    const seen = new Set<string>();
    for (const slow of ["deep", "wide", "none"] as const) {
      for (const warm of [false, true]) {
        const cache = new TreeCache();
        if (warm) await treeDiff(inner, ta, tb, { cache, bounds: { maxDepth: 100, maxEntries: 1_000_000 } });
        const r = await treeDiff(delayed(slow), ta, tb, { cache, bounds: { ...bounds, concurrency: 8 } });
        seen.add(r.kind === "too-large" ? `${r.bound}` : "ok");
      }
    }
    assert.equal(seen.size, 1, `bounds ${JSON.stringify(bounds)} gave ${[...seen].join(", ")}`);
    outcomes.add([...seen][0]!);
  }
  // Both limits crossed: entries are counted first, level by level, so the
  // wide directory (level 1) trips the entry bound before depth 4 is reached.
  assert.deepEqual([...outcomes].sort(), ["depth", "entries"]);
  assert.ok(order.includes("deep") && order.includes("wide") && order.includes("none"), "control: the wide directory was read under each order");
});

// ------------------------------------------------------------------ review b78a837f, P2.4: bounded work

test("a refusal on a wide level stops reading at once: reads stay within a small window, and the stats say what was read and counted", async () => {
  const git = new GitObjects();
  const files: Record<string, string> = {};
  for (let d = 0; d < 100; d++) for (let i = 0; i < 20; i++) files[`d${String(d).padStart(3, "0")}/f${i}.txt`] = "0\n";
  const main = git.commit([], files);
  const change: Record<string, string> = {};
  for (let d = 0; d < 100; d++) change[`d${String(d).padStart(3, "0")}/f0.txt`] = "1\n";
  const head = git.commit([main], change);
  const inner = git.reader();
  const [ta, tb] = [git.commitFacts(main).tree, git.commitFacts(head).tree];
  let reads = 0;
  const counting: TreeReader = {
    readTree: async (h) => {
      reads++;
      await new Promise((r) => setImmediate(r)); // a read takes a turn, so a prefetch can be in flight at the refusal
      return inner.readTree(h);
    },
    readCommit: (h) => inner.readCommit(h),
  };
  const r = await treeDiff(counting, ta, tb, { bounds: { maxEntries: 250, concurrency: 8 } });
  assert.deepEqual([r.kind, r.kind === "too-large" ? r.bound : null], ["too-large", "entries"]);
  // The root (2 trees, 200 entries), then the level's first two directories (40 each) cross 250.
  assert.equal(r.stats.entries, 280, "entries counted, in order, up to the refusal");
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); // let any prefetched read finish
  assert.equal(r.stats.treeReads, reads, "the stats count every read started");
  assert.ok(reads <= 2 + 2 * 4, `${reads} tree reads; the whole level would be ${2 + 200}`);
});

// Path diffs through a tree reader shaped like the Artifacts binding, backed
// here by real git objects, and checked against `git diff`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Fixture, sh } from "./support.ts";
import {
  TreeCache,
  changedPaths,
  mergeBases,
  overlappingPaths,
  touchedPaths,
  treeDiff,
  type TreeEntry,
  type TreeReader,
} from "../src/diff/treediff.ts";

/** Reads trees and commits from a bare repo, like `ArtifactsRepo.readTree` and `readCommit`. */
function gitReader(gitDir: string): TreeReader & { treeReads: number; commitReads: number } {
  const typeOf = (mode: string): TreeEntry["type"] =>
    mode === "040000" ? "tree" : mode === "100755" ? "exec" : mode === "120000" ? "symlink" : mode === "160000" ? "gitlink" : "blob";
  const r = {
    treeReads: 0,
    commitReads: 0,
    async readTree(hash: string) {
      r.treeReads++;
      const out = await sh("/", "--git-dir", gitDir, "ls-tree", "--full-tree", hash);
      return out
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [meta, name] = line.split("\t") as [string, string];
          const [mode, , h] = meta.split(" ") as [string, string, string];
          return { name, mode: mode === "040000" ? "40000" : mode, hash: h, type: typeOf(mode) };
        });
    },
    async readCommit(hash: string) {
      r.commitReads++;
      const body = await sh("/", "--git-dir", gitDir, "cat-file", "commit", hash);
      const tree = /^tree ([0-9a-f]{40})$/m.exec(body)![1]!;
      const parents = [...body.matchAll(/^parent ([0-9a-f]{40})$/gm)].map((m) => m[1]!);
      const at = Number(/^committer .* (\d+) [+-]\d{4}$/m.exec(body)![1]);
      return { treeHash: tree, parents, committedAt: at };
    },
  };
  return r;
}

async function commit(f: Fixture, base: string, files: Record<string, string | null>, ref?: string): Promise<string> {
  await sh(f.work, "checkout", "-q", "--detach", base);
  f.write(files);
  await sh(f.work, "add", "-A");
  await sh(f.work, "commit", "-q", "--allow-empty", "-m", "c");
  const head = await sh(f.work, "rev-parse", "HEAD");
  if (ref) await sh(f.work, "push", "-q", f.canonical, `${head}:${ref}`);
  else await sh(f.work, "push", "-q", f.canonical, `${head}:refs/test/${head}`);
  return head;
}

async function gitNameStatus(f: Fixture, a: string, b: string): Promise<string[]> {
  const out = await sh(f.root, "--git-dir", f.canonical, "diff", "--name-only", "--no-renames", a, b);
  return out.split("\n").filter(Boolean).sort();
}

test("adds, deletes, modifies, exact renames and directory/file swaps match git, with old and new paths", async (t) => {
  const f = await new Fixture().init({
    "README.md": "r\n",
    "src/a.txt": "a\n",
    "src/b.txt": "b\n",
    "src/deep/x/y/z.txt": "z\n",
    "docs/guide.md": "g\n",
    "thing": "file\n",
  });
  t.after(() => f.dispose());
  const head = await commit(f, f.main, {
    "src/a.txt": "a2\n", //                     modified
    "src/b.txt": null, //                       renamed …
    "lib/b.txt": "b\n", //                      … to here
    "src/deep/x/y/z.txt": null, //              deleted
    "src/new.txt": "n\n", //                    added
    "thing": null, //                           file → directory
    "thing/inside.txt": "i\n",
  });
  const reader = gitReader(f.canonical);
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
  assert.deepEqual(touchedPaths(r.changes), await gitNameStatus(f, f.main, head));
  // Unchanged subtrees are skipped: docs/ is never read.
  const docsTree = await sh(f.root, "--git-dir", f.canonical, "rev-parse", `${head}:docs`);
  const reads: string[] = [];
  const spy: TreeReader = { readTree: (h) => (reads.push(h), reader.readTree(h)), readCommit: (h) => reader.readCommit(h) };
  await changedPaths(spy, f.main, head);
  assert.ok(!reads.includes(docsTree));
});

test("the merge base is used: changes that came from main are not the proposal's (R-PROP-3)", async (t) => {
  const f = await new Fixture().init({ "a.txt": "a\n", "b.txt": "b\n" });
  t.after(() => f.dispose());
  const lane = await commit(f, f.main, { "a.txt": "lane\n" });
  const main2 = await commit(f, f.main, { "b.txt": "main moved\n" });
  // The lane merges main back in, then edits again.
  await sh(f.work, "checkout", "-q", "--detach", lane);
  await sh(f.work, "merge", "-q", "--no-edit", main2);
  const merged = await sh(f.work, "rev-parse", "HEAD");
  const head = await commit(f, merged, { "c.txt": "c\n" });
  const reader = gitReader(f.canonical);
  assert.deepEqual(await mergeBases(reader, main2, head), [main2]);
  const r = await changedPaths(reader, main2, head);
  assert.deepEqual(r.kind === "ok" && touchedPaths(r.changes), ["a.txt", "c.txt"]);
  const gitBase = await sh(f.root, "--git-dir", f.canonical, "merge-base", main2, head);
  assert.equal(gitBase, main2);
});

test("criss-cross history: every merge base is found, and the changes are the union", async (t) => {
  const f = await new Fixture().init({ "a.txt": "a\n", "b.txt": "b\n", "c.txt": "c\n" });
  t.after(() => f.dispose());
  const x = await commit(f, f.main, { "a.txt": "x\n" });
  const y = await commit(f, f.main, { "b.txt": "y\n" });
  await sh(f.work, "checkout", "-q", "--detach", x);
  await sh(f.work, "merge", "-q", "--no-edit", y);
  const m1 = await commit(f, await sh(f.work, "rev-parse", "HEAD"), { "c.txt": "m1\n" });
  await sh(f.work, "checkout", "-q", "--detach", y);
  await sh(f.work, "merge", "-q", "--no-edit", x);
  const m2 = await sh(f.work, "rev-parse", "HEAD");
  await sh(f.work, "push", "-q", f.canonical, `${m2}:refs/test/m2`);
  const reader = gitReader(f.canonical);
  const bases = await mergeBases(reader, m1, m2);
  const gitBases = (await sh(f.root, "--git-dir", f.canonical, "merge-base", "--all", m1, m2)).split("\n").sort();
  assert.deepEqual(bases, gitBases);
  assert.equal(gitBases.length, 2);
});

test("a cache by tree hash makes a repeated diff free, and the bound refuses the same diff every time (R-PROP-6)", async (t) => {
  const files: Record<string, string> = {};
  for (let d = 0; d < 10; d++) for (let i = 0; i < 20; i++) files[`dir${d}/f${i}.txt`] = `${d}.${i}\n`;
  const f = await new Fixture().init(files);
  t.after(() => f.dispose());
  const change: Record<string, string> = {};
  for (let d = 0; d < 10; d++) change[`dir${d}/f0.txt`] = "changed\n";
  const head = await commit(f, f.main, change);
  const reader = gitReader(f.canonical);
  const cache = new TreeCache();
  const first = await changedPaths(reader, f.main, head, { cache });
  assert.equal(first.kind === "ok" && first.changes.length, 10);
  const reads = reader.treeReads;
  const second = await changedPaths(reader, f.main, head, { cache });
  assert.equal(reader.treeReads, reads, "the second diff reads no trees");
  assert.equal(second.kind === "ok" && second.stats.cacheHits > 0, true);
  // 2 roots of 10 entries, then 10 pairs of 20: 20 + 400 = 420 entries.
  assert.equal(first.stats.entries, 420);
  for (const c of [undefined, new TreeCache(), cache]) {
    const r = await treeDiff(reader, (await reader.readCommit(f.main))!.treeHash, (await reader.readCommit(head))!.treeHash, {
      bounds: { maxEntries: 419 },
      ...(c ? { cache: c } : {}),
    });
    assert.deepEqual([r.kind, r.kind === "too-large" ? r.bound : null], ["too-large", "entries"]);
  }
  const atLimit = await changedPaths(reader, f.main, head, { bounds: { maxEntries: 420 } });
  assert.equal(atLimit.kind, "ok");
  const shallow = await changedPaths(reader, f.main, head, { bounds: { maxDepth: 0 } });
  assert.deepEqual([shallow.kind, shallow.kind === "too-large" ? shallow.bound : null], ["too-large", "depth"]);
});

test("tree reads never exceed the concurrency limit", async (t) => {
  const files: Record<string, string> = {};
  for (let d = 0; d < 30; d++) files[`d${d}/f.txt`] = `${d}\n`;
  const f = await new Fixture().init(files);
  t.after(() => f.dispose());
  const change: Record<string, string> = {};
  for (let d = 0; d < 30; d++) change[`d${d}/f.txt`] = "x\n";
  const head = await commit(f, f.main, change);
  const inner = gitReader(f.canonical);
  let active = 0;
  let peak = 0;
  const reader: TreeReader = {
    async readTree(h) {
      peak = Math.max(peak, ++active);
      try {
        return await inner.readTree(h);
      } finally {
        active--;
      }
    },
    readCommit: (h) => inner.readCommit(h),
  };
  const r = await changedPaths(reader, f.main, head, { bounds: { concurrency: 4 } });
  assert.equal(r.kind === "ok" && r.changes.length, 30);
  assert.ok(peak <= 4 && peak > 1, `peak ${peak}`);
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

test("previewPlan: a sandbox preview is needed only when the proposal and main touch the same paths", async (t) => {
  const f = await new Fixture().init({ "a.txt": "a\n", "b.txt": "b\n", "dir/c.txt": "c\n" });
  t.after(() => f.dispose());
  const main2 = await commit(f, f.main, { "a.txt": "main\n" });
  const disjoint = await commit(f, f.main, { "b.txt": "lane\n" });
  const same = await commit(f, f.main, { "a.txt": "lane\n" });
  const dirFile = await commit(f, f.main, { "dir/c.txt": null, "dir": "now a file\n" });
  const main3 = await commit(f, main2, { "dir/c.txt": "main edit\n" });
  const reader = gitReader(f.canonical);
  const { previewPlan } = await import("../src/diff/treediff.ts");
  assert.equal((await previewPlan(reader, main2, disjoint)).kind, "disjoint");
  const o = await previewPlan(reader, main2, same);
  assert.deepEqual(o.kind === "overlap" && o.paths, ["a.txt"]);
  const d = await previewPlan(reader, main3, dirFile);
  assert.deepEqual(d.kind === "overlap" && d.paths, ["dir", "dir/c.txt"]);
  assert.equal((await previewPlan(reader, main2, main2)).kind, "disjoint");
});

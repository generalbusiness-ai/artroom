/**
 * Review 125ee638 of the per-change history (request d0cbb26d). The
 * checker's diagnostics, turned round to assert the correct outcome:
 * metadata-only rewrites (rename destination, rename source, executable bit)
 * and an edit moved to a different place in the same file are differences;
 * a rebase that only moves an edit is not. Plus the bytes-per-line and work
 * bounds, and the "too large" copy.
 */
import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { treeDiff } from "@generalbusiness/artroom-git";
import { changeHistory, LINE_BOUNDS, type CommitInfo, type FileMeta, type LineBounds } from "../src/room/changes.ts";
import { MemoryRepo } from "../src/room/mock/repo.ts";
import type { Sha } from "../src/room/contract.ts";
import { InterdiffView } from "../src/ui/ChangeHistory.tsx";

afterEach(cleanup);

type Edits = Parameters<MemoryRepo["commit"]>[1];

/**
 * One change, kkkkkkkk, in two generations: `before` on `parents[0]`, `after`
 * on `parents[1]` (the same parent unless the test rebases).
 */
async function compare(repo: MemoryRepo, parents: readonly [Sha, Sha], before: Edits, after: Edits, bounds: Partial<LineBounds> = {}) {
  const info = (commit: Sha, parent: Sha): CommitInfo => ({ commit, parent, changeId: "kkkkkkkk", subject: "change" });
  const a = repo.commit(parents[0], before, "before");
  const b = repo.commit(parents[1], after, "after");
  const h = await changeHistory(repo, { generation: 1, commits: [info(a, parents[0])] }, { generation: 2, commits: [info(b, parents[1])] }, bounds);
  if (h?.kind !== "ok" || h.entries[0]?.kind !== "rewritten") throw new Error("no rewrite");
  return h.entries[0].interdiff;
}

const renamed = (from: string, mode = "100644"): FileMeta => ({ status: "renamed", from, oldMode: mode, newMode: mode });
const exec = (text: string) => ({ text, mode: "100755" });

describe("P2: tree-change metadata is compared", () => {
  test("a different rename destination is a difference", async () => {
    const repo = new MemoryRepo();
    const parent = repo.commit(null, { "a.txt": "retained contents\n" }, "base");
    // The checker's probe: the tree diff sees two different renames.
    const root = (await repo.readCommit(parent))!.treeHash;
    const b = repo.commit(parent, { "a.txt": null, "b.txt": "retained contents\n" }, "probe");
    expect(await treeDiff(repo, root, (await repo.readCommit(b))!.treeHash)).toMatchObject({ kind: "ok", changes: [{ status: "renamed", from: "a.txt", path: "b.txt" }] });

    expect(await compare(repo, [parent, parent], { "a.txt": null, "b.txt": "retained contents\n" }, { "a.txt": null, "c.txt": "retained contents\n" })).toEqual({
      kind: "ok",
      files: [
        { path: "b.txt", meta: { before: renamed("a.txt"), now: null }, now: [], before: [] },
        { path: "c.txt", meta: { before: null, now: renamed("a.txt") }, now: [], before: [] },
      ],
    });
  });

  test("a different rename source is a difference", async () => {
    const repo = new MemoryRepo();
    const parent = repo.commit(null, { "x.txt": "same\n", "y.txt": "same\n" }, "base");
    expect(await compare(repo, [parent, parent], { "x.txt": null, "c.txt": "same\n" }, { "y.txt": null, "c.txt": "same\n" })).toEqual({
      kind: "ok",
      files: [{ path: "c.txt", meta: { before: renamed("x.txt"), now: renamed("y.txt") }, now: [], before: [] }],
    });
  });

  test("setting the executable bit in one version only is a difference", async () => {
    // The checker's probe: the old version leaves run.sh alone; the new one makes it executable.
    const repo = new MemoryRepo();
    const parent = repo.commit(null, { "run.sh": "#!/bin/sh\necho hello\n", "other.txt": "1\n" }, "base");
    expect(await compare(repo, [parent, parent], { "other.txt": "2\n" }, { "other.txt": "2\n", "run.sh": exec("#!/bin/sh\necho hello\n") })).toEqual({
      kind: "ok",
      files: [{ path: "run.sh", meta: { before: null, now: { status: "modified", from: null, oldMode: "100644", newMode: "100755" } }, now: [], before: [] }],
    });
  });

  test("the same text edit, with the executable bit set only in the new version, is a difference", async () => {
    const repo = new MemoryRepo();
    const parent = repo.commit(null, { "run.sh": "#!/bin/sh\necho hello\n" }, "base");
    const d = await compare(repo, [parent, parent], { "run.sh": "#!/bin/sh\necho bye\n" }, { "run.sh": exec("#!/bin/sh\necho bye\n") });
    expect(d).toEqual({
      kind: "ok",
      files: [
        {
          path: "run.sh",
          meta: { before: { status: "modified", from: null, oldMode: "100644", newMode: "100644" }, now: { status: "modified", from: null, oldMode: "100644", newMode: "100755" } },
          now: [],
          before: [],
        },
      ],
    });
  });

  test("control: the same rename and the same mode change, rebased, are not a difference", async () => {
    const repo = new MemoryRepo();
    const p1 = repo.commit(null, { "a.txt": "retained contents\n", "run.sh": "echo\n", "elsewhere.txt": "1\n" }, "base");
    const p2 = repo.commit(p1, { "elsewhere.txt": "2\n" }, "main moved");
    const edits = { "a.txt": null, "b.txt": "retained contents\n", "run.sh": exec("echo\n") };
    expect(await compare(repo, [p1, p2], edits, edits)).toEqual({ kind: "ok", files: [] });
  });
});

describe("P2: hunks keep their context, so edits at different places differ", () => {
  const SOURCE = "function first() {\n  return allow();\n}\nfunction second() {\n  return allow();\n}\n";
  const denyFirst = SOURCE.replace("return allow();", "return deny();");
  const denySecond = SOURCE.replace("function second() {\n  return allow();", "function second() {\n  return deny();");

  test("denying in first() and denying in second() are different edits", async () => {
    const repo = new MemoryRepo();
    const parent = repo.commit(null, { "auth.ts": SOURCE }, "base");
    const d = await compare(repo, [parent, parent], { "auth.ts": denyFirst }, { "auth.ts": denySecond });
    if (d.kind !== "ok") throw new Error(d.kind);
    expect(d.files.map((f) => [f.path, f.meta])).toEqual([["auth.ts", null]]);
    const [f] = d.files;
    // Each version's hunk names the function its edit is in, and where.
    expect(f!.now).toEqual([{ oldStart: 2, newStart: 2, lines: ["   return allow();", " }", " function second() {", "-  return allow();", "+  return deny();", " }", " "] }]);
    expect(f!.before).toEqual([{ oldStart: 1, newStart: 1, lines: [" function first() {", "-  return allow();", "+  return deny();", " }", " function second() {", "   return allow();"] }]);
  });

  test("control: the same edit, moved down by a rebase that changed lines far from it, is not a difference", async () => {
    const repo = new MemoryRepo();
    const header = "// header\n".repeat(10);
    const p1 = repo.commit(null, { "auth.ts": `${header}${SOURCE}` }, "base");
    const p2 = repo.commit(p1, { "auth.ts": `// licence\n// licence\n${header}${SOURCE}` }, "main moved");
    const d = await compare(repo, [p1, p2], { "auth.ts": `${header}${denySecond}` }, { "auth.ts": `// licence\n// licence\n${header}${denySecond}` });
    expect(d).toEqual({ kind: "ok", files: [] });
  });
});

describe("Security: bytes per line and the work of a whole comparison are bounded", () => {
  test("a line over the byte bound is too large, counted in UTF-8 bytes", async () => {
    const repo = new MemoryRepo();
    const parent = repo.commit(null, { "a.txt": "1\n" }, "base");
    const limit = LINE_BOUNDS.maxLineBytes;
    expect(await compare(repo, [parent, parent], { "a.txt": "2\n" }, { "a.txt": `${"x".repeat(limit + 1)}\n` })).toEqual({ kind: "too-large", bound: "line-bytes", limit });
    // Fewer characters than the bound, more bytes: "é" is two bytes in UTF-8.
    expect(await compare(repo, [parent, parent], { "a.txt": "2\n" }, { "a.txt": `${"é".repeat(limit / 2 + 1)}\n` })).toEqual({ kind: "too-large", bound: "line-bytes", limit });
    // At the bound exactly, it is compared.
    expect(await compare(repo, [parent, parent], { "a.txt": "2\n" }, { "a.txt": `${"é".repeat(limit / 2)}\n` })).toMatchObject({ kind: "ok" });
  });

  test("one file's line comparison over the work bound is too large", async () => {
    const repo = new MemoryRepo();
    const lines = (tag: string) => Array.from({ length: 100 }, (_, i) => `${tag}${i}`).join("\n");
    const parent = repo.commit(null, { "a.txt": lines("p") }, "base");
    // The new version replaces every line: reading costs about 1,000 units, comparing 100 x 100 lines 10,000.
    expect(await compare(repo, [parent, parent], { "a.txt": "2\n" }, { "a.txt": lines("x") }, { maxWork: 5_000 })).toEqual({ kind: "too-large", bound: "work", limit: 5_000 });
    expect(await compare(repo, [parent, parent], { "a.txt": "2\n" }, { "a.txt": lines("x") }, { maxWork: 50_000 })).toMatchObject({ kind: "ok" });
  });

  test("the work bound covers all the changes of a comparison together", async () => {
    const repo = new MemoryRepo();
    const lines = (tag: string) => Array.from({ length: 60 }, (_, i) => `${tag}${i}`).join("\n");
    const base = repo.commit(null, { "a.txt": lines("pa"), "b.txt": lines("pb") }, "base");
    const gen = (salt: string, tag: string): CommitInfo[] => {
      const first = repo.commit(base, { "a.txt": lines(`${tag}a`) }, `${salt}1`);
      const second = repo.commit(first, { "b.txt": lines(`${tag}b`) }, `${salt}2`);
      return [
        { commit: first, parent: base, changeId: "aaaaaaaa", subject: "first" },
        { commit: second, parent: first, changeId: "bbbbbbbb", subject: "second" },
      ];
    };
    const history = (maxWork: number) => changeHistory(repo, { generation: 1, commits: gen("g1", "x") }, { generation: 2, commits: gen("g2", "y") }, { maxWork });
    const interdiffs = async (maxWork: number) => {
      const h = await history(maxWork);
      return h?.kind === "ok" ? h.entries.map((e) => (e.kind === "rewritten" ? e.interdiff.kind : e.kind)) : h;
    };
    // Each change alone costs about 2 x (60 x 60 + 500) = 8,200 units: under 10,000. Both together are over.
    expect(await interdiffs(100_000)).toEqual(["ok", "ok"]);
    expect(await interdiffs(10_000)).toEqual(["ok", "too-large"]);
    const h = await history(10_000);
    expect(h?.kind === "ok" && h.entries[1]?.kind === "rewritten" && h.entries[1].interdiff).toEqual({ kind: "too-large", bound: "work", limit: 10_000 });
  });

  test("once the work is spent, a later change that needs no reading is still too large", async () => {
    const repo = new MemoryRepo();
    const lines = Array.from({ length: 100 }, (_, i) => `p${i}`).join("\n");
    const base = repo.commit(null, { "a.txt": lines, "r.txt": "kept\n" }, "base");
    const gen = (salt: string, tag: string): CommitInfo[] => {
      const first = repo.commit(base, { "a.txt": lines.replaceAll("p", tag) }, `${salt}1`);
      const second = repo.commit(first, { "r.txt": null, [`${tag}.txt`]: "kept\n" }, `${salt}2`);
      return [
        { commit: first, parent: base, changeId: "aaaaaaaa", subject: "big" },
        { commit: second, parent: first, changeId: "bbbbbbbb", subject: "pure rename" },
      ];
    };
    const h = await changeHistory(repo, { generation: 1, commits: gen("g1", "x") }, { generation: 2, commits: gen("g2", "y") }, { maxWork: 5_000 });
    expect(h?.kind === "ok" && h.entries.map((e) => e.kind === "rewritten" && e.interdiff)).toEqual([
      { kind: "too-large", bound: "work", limit: 5_000 },
      { kind: "too-large", bound: "work", limit: 5_000 },
    ]);
  });
});

describe("the interdiff on screen", () => {
  test("a metadata-only difference is shown in words", () => {
    render(
      <InterdiffView
        d={{
          kind: "ok",
          files: [
            { path: "c.txt", meta: { before: renamed("x.txt"), now: renamed("y.txt") }, now: [], before: [] },
            { path: "run.sh", meta: { before: null, now: { status: "modified", from: null, oldMode: "100644", newMode: "100755" } }, now: [], before: [] },
          ],
        }}
        from={1}
        to={2}
      />,
    );
    const meta = [...document.querySelectorAll("[data-interdiff-meta]")].map((e) => e.textContent);
    expect(meta).toEqual([
      "Generation 2's version renames it from y.txt; generation 1's renames it from x.txt.",
      "Generation 2's version edits it, mode 100644 to 100755; generation 1's leaves it alone.",
    ]);
    expect(document.querySelector("[data-interdiff='same']")).toBeNull();
  });

  test("each hunk shows where it is, with its context", () => {
    render(<InterdiffView d={{ kind: "ok", files: [{ path: "auth.ts", meta: null, now: [{ oldStart: 2, newStart: 2, lines: [" function second() {", "-  return allow();", "+  return deny();"] }], before: [] }] }} from={1} to={2} />);
    const patch = document.querySelector("pre.patch")!;
    expect(patch.textContent).toBe("@@ -2 +2 @@\n function second() {\n-  return allow();\n+  return deny();\n");
    expect([...patch.querySelectorAll("span")].map((s) => s.className)).toEqual(["hunk", "", "del", "add"]);
  });

  test("too large: this view's own bounds are not said to bound the proposal's diff", () => {
    render(<InterdiffView d={{ kind: "too-large", bound: "lines", limit: 2_000 }} from={1} to={2} />);
    expect(document.body.textContent).toBe("Too large to compare here: more than 2,000 lines in one version of a file. This bound is this view's own; it does not limit the proposal's diff.");
    cleanup();
    render(<InterdiffView d={{ kind: "too-large", bound: "work", limit: 20_000_000 }} from={1} to={2} />);
    expect(document.body.textContent).toContain("more than 20,000,000 units of work for this generation's comparison. This bound is this view's own");
    cleanup();
    render(<InterdiffView d={{ kind: "too-large", bound: "entries", limit: 100_000 }} from={1} to={2} />);
    expect(document.body.textContent).toBe("Too large to compare here: more than 100,000 tree entries. Every proposal's diff has the same bound.");
  });
});

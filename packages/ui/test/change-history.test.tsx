/**
 * Request d0cbb26d: a change's history across generations, from jj
 * change-id headers. Author-supplied; never an input to obligations,
 * evidence or carrying.
 *
 * Then the interdiff of a rewritten change, as two reviews corrected it:
 * tree-change metadata is compared and the work is bounded (125ee638); a
 * hunk is the same edit only at the same place in its parent, mapped across
 * a rebase, and where the place cannot be mapped the interdiff says it could
 * not tell (f3fff92c).
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/app.tsx";
import { treeDiff } from "@generalbusiness/artroom-git";
import { changeHistory, LINE_BOUNDS, type ChangeHistory, type CommitInfo, type FileMeta, type Interdiff, type LineBounds } from "../src/room/changes.ts";
import { SCENARIO_COMMITS } from "../src/room/mock/commits.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import type { Sha } from "../src/room/contract.ts";
import { MemoryRepo } from "../src/room/mock/repo.ts";
import { InterdiffView } from "../src/ui/ChangeHistory.tsx";
import { laneId, settled, waitFor } from "./helpers.tsx";

afterEach(() => {
  cleanup();
  location.hash = "";
});

const SESSION = "Move session checks into authz";
const C = SCENARIO_COMMITS.commits;

async function scenario(): Promise<Extract<ChangeHistory, { kind: "ok" }>> {
  const h = await changeHistory(SCENARIO_COMMITS.repo, { generation: 1, commits: C["L2/1"]! }, { generation: 2, commits: C["L2/2"]! });
  if (!h || h.kind !== "ok") throw new Error("no history");
  return h;
}

/** A small repository: one commit per generation per change. */
function tiny(files: { before: Record<string, string>; after: Record<string, string> }, ids: { before: (string | null)[]; after: (string | null)[] }) {
  const repo = new MemoryRepo();
  const base = repo.commit(null, { "README.md": "hello\n" }, "base");
  const chain = (edits: Record<string, string>, idsFor: (string | null)[], salt: string): CommitInfo[] =>
    idsFor.map((changeId, i) => {
      const commit = repo.commit(base, i === 0 ? edits : { [`extra-${i}.txt`]: `${salt}${i}\n` }, `${salt}${i}`);
      return { commit, parent: base, changeId, subject: `${salt} ${i}` };
    });
  return { repo, before: chain(files.before, ids.before, "a"), after: chain(files.after, ids.after, "b") };
}

describe("change history from change-id headers", () => {
  test("rewritten, added and dropped changes, in the new generation's order", async () => {
    const h = await scenario();
    expect(h.entries.map((e) => [e.kind, e.changeId.slice(0, 8)])).toEqual([
      ["rewritten", "zvqmnwro"],
      ["rewritten", "tkxlpsuy"],
      ["added", "yrwpvlqs"],
      ["dropped", "ommqkrtv"],
    ]);
    expect(h.headerless).toEqual({ before: 0, after: 0 });
  });

  test("a rewritten change's interdiff shows only how its own edits differ", async () => {
    const [moved, whoami] = (await scenario()).entries;
    if (moved?.kind !== "rewritten" || moved.interdiff.kind !== "ok") throw new Error("not rewritten");
    expect(moved.interdiff.files.map((f) => f.path)).toEqual(["src/lib/authz/check.ts", "src/lib/authz/session.ts"]);
    const [check, session] = moved.interdiff.files;
    // check.ts was rebased onto the new rateKey(). Its import edit is the same and is not listed. Its
    // currentUser edit is the same too, but rateKey()'s body, two lines above it, changed underneath, so
    // that hunk's context differs and it is shown from both versions, at their own line numbers.
    expect(check!.meta).toBeNull();
    expect(check!.now.map((h) => [h.oldStart, h.newStart, h.lines[0]])).toEqual([[17, 15, "   return `${req.ip}:${account.toLowerCase()}`;"]]);
    expect(check!.before.map((h) => [h.oldStart, h.newStart, h.lines[0]])).toEqual([[13, 11, "   return req.ip;"]]);
    expect(check!.now[0]!.lines.slice(1)).toEqual(check!.before[0]!.lines.slice(1));
    // session.ts is new in both versions: one hunk each, and generation 2's refuses expired cookies.
    expect(session!.meta).toBeNull();
    expect(session!.now.flatMap((h) => h.lines)).toContain("+  if (isExpired(cookie)) return null;");
    expect(session!.before.flatMap((h) => h.lines)).not.toContain("+  if (isExpired(cookie)) return null;");
    // Rebased only: the same edits.
    expect(whoami?.kind === "rewritten" && whoami.interdiff).toEqual({ kind: "ok", files: [] });
  });

  test("header-less commits: nothing to show", async () => {
    expect(await changeHistory(SCENARIO_COMMITS.repo, { generation: 1, commits: C["L1/1"]! }, { generation: 2, commits: C["L1/2"]! })).toBeNull();
  });

  test("header-less commits beside headed ones are counted, not followed", async () => {
    const t = tiny({ before: { "a.txt": "1\n" }, after: { "a.txt": "2\n" } }, { before: ["kkkkkkkk", null], after: ["kkkkkkkk", null, null] });
    const h = await changeHistory(t.repo, { generation: 1, commits: t.before }, { generation: 2, commits: t.after });
    expect(h?.kind === "ok" && h.headerless).toEqual({ before: 1, after: 2 });
    expect(h?.kind === "ok" && h.entries.map((e) => e.kind)).toEqual(["rewritten"]);
  });

  test("the same change ID twice in a generation is divergent, not matched", async () => {
    const t = tiny({ before: { "a.txt": "1\n" }, after: { "a.txt": "2\n" } }, { before: ["kkkkkkkk"], after: ["kkkkkkkk", "kkkkkkkk"] });
    const h = await changeHistory(t.repo, { generation: 1, commits: t.before }, { generation: 2, commits: t.after });
    expect(h?.kind === "ok" && h.entries.map((e) => e.kind)).toEqual(["divergent"]);
  });

  test("each commit's diff stays within lane B's bounds", async () => {
    // Entries: the bounded tree diff refuses, as it would for a proposal.
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`d/f${i}.txt`, `${i}\n`]));
    const t = tiny({ before: { "a.txt": "1\n" }, after: { ...many, "a.txt": "2\n" } }, { before: ["kkkkkkkk"], after: ["kkkkkkkk"] });
    const h = await changeHistory(t.repo, { generation: 1, commits: t.before }, { generation: 2, commits: t.after }, { maxEntries: 20 });
    const e = h?.kind === "ok" ? h.entries[0] : undefined;
    expect(e?.kind === "rewritten" && e.interdiff).toEqual({ kind: "too-large", bound: "entries", limit: 20 });
    // Depth.
    const deep = tiny({ before: { "a.txt": "1\n" }, after: { "a/b/c/d/e.txt": "2\n" } }, { before: ["kkkkkkkk"], after: ["kkkkkkkk"] });
    const d = await changeHistory(deep.repo, { generation: 1, commits: deep.before }, { generation: 2, commits: deep.after }, { maxDepth: 2 });
    expect(d?.kind === "ok" && d.entries[0]?.kind === "rewritten" && d.entries[0].interdiff).toEqual({ kind: "too-large", bound: "depth", limit: 2 });
    // Commits per generation.
    const c = await changeHistory(t.repo, { generation: 1, commits: t.before }, { generation: 2, commits: t.after }, { maxCommits: 0 });
    expect(c).toMatchObject({ kind: "too-large", bound: "commits", limit: 0 });
    // Lines per file version.
    const big = tiny({ before: { "a.txt": "1\n" }, after: { "a.txt": "x\n".repeat(LINE_BOUNDS.maxLines + 1) } }, { before: ["kkkkkkkk"], after: ["kkkkkkkk"] });
    const l = await changeHistory(big.repo, { generation: 1, commits: big.before }, { generation: 2, commits: big.after });
    expect(l?.kind === "ok" && l.entries[0]?.kind === "rewritten" && l.entries[0].interdiff).toEqual({ kind: "too-large", bound: "lines", limit: LINE_BOUNDS.maxLines });
  });
});

describe("the Proposal screen", () => {
  async function open(goal: string, generation: number) {
    location.hash = `#/lane/${laneId(goal)}/${generation}`;
    render(<App adapter={new MockRoom()} />);
    await waitFor(() => expect(document.querySelector("[data-file]")).not.toBeNull());
  }

  test("shows the per-change view, labelled author-supplied, when headers are present", async () => {
    await open(SESSION, 2);
    const view = await screen.findByTestId("change-history");
    expect(within(view).getByRole("heading", { name: "Changes since generation 1, by jj change ID" })).toBeTruthy();
    expect(view.textContent).toContain("Author-supplied");
    expect(view.textContent).toContain("obligations, evidence and carrying still use the changed paths");
    const kinds = [...view.querySelectorAll<HTMLElement>("[data-change]")].map((e) => e.dataset["change"]);
    expect(kinds).toEqual(["rewritten", "rewritten", "added", "dropped"]);
    const moved = view.querySelector<HTMLElement>("[data-change-id='zvqmnwrokxsl']")!;
    expect(moved.querySelector("[data-interdiff='changed']")!.textContent).toContain("if (isExpired(cookie)) return null;");
    expect(view.querySelector("[data-change-id='tkxlpsuyqmzo'] [data-interdiff='same']")).not.toBeNull();
    expect(view.querySelector("[data-change-id='ommqkrtvnwpy']")!.textContent).toContain("Log the session cookie while debugging");
  });

  test("the interdiff opens and closes from the keyboard", async () => {
    await open(SESSION, 2);
    const view = await screen.findByTestId("change-history");
    const details = view.querySelector<HTMLDetailsElement>("[data-change-id='tkxlpsuyqmzo'] details")!;
    const summary = details.querySelector("summary")!;
    expect(details.open).toBe(false);
    summary.focus();
    expect(document.activeElement).toBe(summary);
    fireEvent.click(summary); // what Enter and Space do on a summary
    expect(details.open).toBe(true);
  });

  test("shows nothing extra when the commits have no headers, or on a first generation", async () => {
    await open("Rate-limit /api/login", 2);
    await settled();
    expect(screen.queryByTestId("change-history")).toBeNull();
    cleanup();
    await open(SESSION, 1);
    await settled();
    expect(screen.queryByTestId("change-history")).toBeNull();
  });

});

describe("the interdiff compares metadata and bounds its work (review 125ee638)", () => {
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

  describe("tree-change metadata is compared", () => {
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
          { path: "b.txt", meta: { before: renamed("a.txt"), now: null }, now: [], before: [], unsure: [] },
          { path: "c.txt", meta: { before: null, now: renamed("a.txt") }, now: [], before: [], unsure: [] },
        ],
      });
    });

    test("a different rename source is a difference", async () => {
      const repo = new MemoryRepo();
      const parent = repo.commit(null, { "x.txt": "same\n", "y.txt": "same\n" }, "base");
      expect(await compare(repo, [parent, parent], { "x.txt": null, "c.txt": "same\n" }, { "y.txt": null, "c.txt": "same\n" })).toEqual({
        kind: "ok",
        files: [{ path: "c.txt", meta: { before: renamed("x.txt"), now: renamed("y.txt") }, now: [], before: [], unsure: [] }],
      });
    });

    test("setting the executable bit in one version only is a difference", async () => {
      // The checker's probe: the old version leaves run.sh alone; the new one makes it executable.
      const repo = new MemoryRepo();
      const parent = repo.commit(null, { "run.sh": "#!/bin/sh\necho hello\n", "other.txt": "1\n" }, "base");
      expect(await compare(repo, [parent, parent], { "other.txt": "2\n" }, { "other.txt": "2\n", "run.sh": exec("#!/bin/sh\necho hello\n") })).toEqual({
        kind: "ok",
        files: [{ path: "run.sh", meta: { before: null, now: { status: "modified", from: null, oldMode: "100644", newMode: "100755" } }, now: [], before: [], unsure: [] }],
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
            unsure: [],
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

  describe("bytes per line and the work of a whole comparison are bounded", () => {
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

    test("reading counts as work, even when the line comparison is trivial", async () => {
      const repo = new MemoryRepo();
      const long = `${Array.from({ length: 50 }, (_, i) => `${i}`.padEnd(100, ".")).join("\n")}\n`;
      const parent = repo.commit(null, { "a.txt": long }, "base");
      // Appending one line: after the common prefix and suffix, no pairs of lines are left to compare,
      // but each version reads about 10,000 characters.
      expect(await compare(repo, [parent, parent], { "a.txt": `${long}old\n` }, { "a.txt": `${long}new\n` }, { maxWork: 5_000 })).toEqual({ kind: "too-large", bound: "work", limit: 5_000 });
      expect(await compare(repo, [parent, parent], { "a.txt": `${long}old\n` }, { "a.txt": `${long}new\n` }, { maxWork: 50_000 })).toMatchObject({ kind: "ok" });
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
              { path: "c.txt", meta: { before: renamed("x.txt"), now: renamed("y.txt") }, now: [], before: [], unsure: [] },
              { path: "run.sh", meta: { before: null, now: { status: "modified", from: null, oldMode: "100644", newMode: "100755" } }, now: [], before: [], unsure: [] },
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
      render(<InterdiffView d={{ kind: "ok", files: [{ path: "auth.ts", meta: null, now: [{ oldStart: 2, newStart: 2, lines: [" function second() {", "-  return allow();", "+  return deny();"] }], before: [], unsure: [] }] }} from={1} to={2} />);
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
});

describe("a hunk is the same edit only at the same place in its parent (review f3fff92c)", () => {
  // Two functions with identical bodies: five preparation lines, return allow(), five finish lines.
  const BODY = `${Array.from({ length: 5 }, (_, i) => `  prepare${i}();`).join("\n")}\n  return allow();\n${Array.from({ length: 5 }, (_, i) => `  finish${i}();`).join("\n")}`;
  const fn = (name: string, body = BODY) => `function ${name}() {\n${body}\n}\n`;
  const deny = (body = BODY) => body.replace("return allow();", "return deny();");
  const SOURCE = fn("first") + fn("second");
  const DENY_FIRST = fn("first", deny()) + fn("second");
  const DENY_SECOND = fn("first") + fn("second", deny());
  const LICENCE = "// licence\n// licence\n";

  /** One change, kkkkkkkk: `before` on `parents[0]`, `after` on `parents[1]`. */
  async function compare(repo: MemoryRepo, parents: readonly [Sha, Sha], before: string, after: string): Promise<Interdiff> {
    const info = (commit: Sha, parent: Sha): CommitInfo => ({ commit, parent, changeId: "kkkkkkkk", subject: "change" });
    const a = repo.commit(parents[0], { "auth.ts": before }, "before");
    const b = repo.commit(parents[1], { "auth.ts": after }, "after");
    const h = await changeHistory(repo, { generation: 1, commits: [info(a, parents[0])] }, { generation: 2, commits: [info(b, parents[1])] });
    if (h?.kind !== "ok" || h.entries[0]?.kind !== "rewritten") throw new Error("no rewrite");
    return h.entries[0].interdiff;
  }

  const HUNK = ["   prepare2();", "   prepare3();", "   prepare4();", "-  return allow();", "+  return deny();", "   finish0();", "   finish1();", "   finish2();"];

  describe("an edit moved between places with the same surrounding lines", () => {
    test("same parent: denying in first() and denying in second() are different edits, at their own places", async () => {
      const repo = new MemoryRepo();
      const base = repo.commit(null, { "auth.ts": SOURCE }, "base");
      // The checker's diagnostic: the hunks' lines are identical; only their places differ.
      expect(await compare(repo, [base, base], DENY_FIRST, DENY_SECOND)).toEqual({
        kind: "ok",
        files: [
          {
            path: "auth.ts",
            meta: null,
            now: [{ oldStart: 17, newStart: 17, lines: HUNK }],
            before: [{ oldStart: 4, newStart: 4, lines: HUNK }],
            unsure: [],
          },
        ],
      });
    });

    test("different parents: the move is still found, through the rebase", async () => {
      const repo = new MemoryRepo();
      const p1 = repo.commit(null, { "auth.ts": SOURCE }, "base");
      const p2 = repo.commit(p1, { "auth.ts": LICENCE + SOURCE }, "main moved");
      expect(await compare(repo, [p1, p2], DENY_FIRST, LICENCE + DENY_SECOND)).toEqual({
        kind: "ok",
        files: [{ path: "auth.ts", meta: null, now: [{ oldStart: 19, newStart: 19, lines: HUNK }], before: [{ oldStart: 4, newStart: 4, lines: HUNK }], unsure: [] }],
      });
    });

    test("control: the same edit, rebased onto lines added above it, is the same edit", async () => {
      const repo = new MemoryRepo();
      const p1 = repo.commit(null, { "auth.ts": SOURCE }, "base");
      const p2 = repo.commit(p1, { "auth.ts": LICENCE + SOURCE }, "main moved");
      expect(await compare(repo, [p1, p2], DENY_SECOND, LICENCE + DENY_SECOND)).toEqual({ kind: "ok", files: [] });
    });

    test("control: the same edit, rebased onto an unrelated change in the other function, is the same edit", async () => {
      const repo = new MemoryRepo();
      const other = fn("second", BODY.replace("  finish4();", "  finish4();\n  audit();"));
      const p1 = repo.commit(null, { "auth.ts": SOURCE }, "base");
      const p2 = repo.commit(p1, { "auth.ts": fn("first") + other }, "main moved");
      expect(await compare(repo, [p1, p2], DENY_FIRST, fn("first", deny()) + other)).toEqual({ kind: "ok", files: [] });
    });

    test("ambiguous: when the old edit's place is gone from the new parent, it says it could not tell", async () => {
      // Main deleted first(). Generation 1 denied in first(); generation 2 denies in second(), the
      // only function left. The hunks' lines are identical, but the old one's place has no match.
      const repo = new MemoryRepo();
      const p1 = repo.commit(null, { "auth.ts": SOURCE }, "base");
      const p2 = repo.commit(p1, { "auth.ts": fn("second") }, "main moved");
      expect(await compare(repo, [p1, p2], DENY_FIRST, fn("second", deny()))).toEqual({
        kind: "ok",
        files: [{ path: "auth.ts", meta: null, now: [], before: [], unsure: [{ before: { oldStart: 4, newStart: 4, lines: HUNK }, now: { oldStart: 4, newStart: 4, lines: HUNK } }] }],
      });
    });

    test("ambiguous: a rebase that repeats a line inside the old edit's surroundings is not claimed as a move", async () => {
      // Main repeats the line "a"; each version changes the same "b" (the one after "c") to "X". The two
      // parents' diff cannot say which "a" is new, and places the new one inside the old hunk's lines,
      // so the old place does not map one to one. Found by fuzzing: without that check, this was
      // reported as a move.
      const repo = new MemoryRepo();
      const lines = (s: string) => [...s].join("\n");
      const p1 = repo.commit(null, { "auth.ts": lines("babcbb") }, "base");
      const p2 = repo.commit(p1, { "auth.ts": lines("baabcbb") }, "main moved");
      const d = await compare(repo, [p1, p2], lines("babcXb"), lines("baabcXb"));
      expect(d.kind === "ok" && d.files.map((f) => [f.now.length, f.before.length, f.unsure.map((u) => [u.before.oldStart, u.now.oldStart])])).toEqual([[0, 0, [[2, 3]]]]);
    });
  });

  describe("the work bound", () => {
    test("diffing the two parents counts as work", async () => {
      // Each version changes only the last line, so each patch is cheap; but main replaced every line
      // underneath, so mapping the old hunk's place compares 100 x 100 parent lines.
      const repo = new MemoryRepo();
      const lines = (tag: string, last = "end") => [...Array.from({ length: 100 }, (_, i) => `${tag}${i}`), last].join("\n");
      const p1 = repo.commit(null, { "auth.ts": lines("p") }, "base");
      const p2 = repo.commit(p1, { "auth.ts": lines("q") }, "main moved");
      const info = (commit: Sha, parent: Sha): CommitInfo => ({ commit, parent, changeId: "kkkkkkkk", subject: "change" });
      const a = repo.commit(p1, { "auth.ts": lines("p", "END") }, "before");
      const b = repo.commit(p2, { "auth.ts": lines("q", "END") }, "after");
      const run = async (maxWork: number) => {
        const h = await changeHistory(repo, { generation: 1, commits: [info(a, p1)] }, { generation: 2, commits: [info(b, p2)] }, { maxWork });
        return h?.kind === "ok" && h.entries[0]?.kind === "rewritten" ? h.entries[0].interdiff : null;
      };
      // Reading the four file versions costs under 2,500 units; the parents' diff about 10,000 more.
      expect(await run(5_000)).toEqual({ kind: "too-large", bound: "work", limit: 5_000 });
      expect(await run(50_000)).toMatchObject({ kind: "ok" });
    });
  });

  describe("on screen", () => {
    test("an unsure match says it could not tell whether the edit moved, and shows the hunk", () => {
      render(
        <InterdiffView
          d={{ kind: "ok", files: [{ path: "auth.ts", meta: null, now: [], before: [], unsure: [{ before: { oldStart: 4, newStart: 4, lines: HUNK }, now: { oldStart: 4, newStart: 4, lines: HUNK } }] }] }}
          from={1}
          to={2}
        />,
      );
      const u = document.querySelector("[data-interdiff-unsure]")!;
      expect(u.textContent).toContain("Could not tell whether this edit moved. Both versions have it, but the lines generation 1's version made it against (from line 4) changed in generation 2's parent.");
      expect(u.querySelector("pre")!.textContent).toBe(`@@ -4 +4 @@\n${HUNK.join("\n")}\n`);
      expect(document.querySelector("[data-interdiff='same']")).toBeNull();
    });
  });
});

/**
 * Review f3fff92c of the per-change history (request d0cbb26d): an edit moved
 * between two places with the same surrounding lines must not look like the
 * same edit. The checker's diagnostic, turned round to assert the correct
 * outcome, is the first test. A hunk is the same edit only at the same place
 * in its parent, mapped across a rebase; where the place cannot be mapped,
 * the interdiff says it could not tell.
 */
import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { changeHistory, type CommitInfo, type Interdiff } from "../src/room/changes.ts";
import { MemoryRepo } from "../src/room/mock/repo.ts";
import type { Sha } from "../src/room/contract.ts";
import { InterdiffView } from "../src/ui/ChangeHistory.tsx";

afterEach(cleanup);

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

describe("bounds", () => {
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

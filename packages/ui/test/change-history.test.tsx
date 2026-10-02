/**
 * Request d0cbb26d: a change's history across generations, from jj
 * change-id headers. Author-supplied; never an input to obligations,
 * evidence or carrying.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/app.tsx";
import { changeHistory, LINE_BOUNDS, type ChangeHistory, type CommitInfo } from "../src/room/changes.ts";
import { SCENARIO_COMMITS } from "../src/room/mock/commits.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import { MemoryRepo } from "../src/room/mock/repo.ts";
import { laneId } from "./helpers.tsx";

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

  test("shows nothing extra when the commits have no headers", async () => {
    await open("Rate-limit /api/login", 2);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("change-history")).toBeNull();
  });

  test("shows nothing on a first generation", async () => {
    await open(SESSION, 1);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("change-history")).toBeNull();
  });

  test("change IDs never reach obligations, evidence or carrying", async () => {
    const snap = new MockRoom().snapshot();
    const json = JSON.stringify({ proposals: snap.proposals, reviews: snap.reviews, checks: snap.checks, policy: snap.policy });
    for (const c of [...C["L2/1"]!, ...C["L2/2"]!]) expect(json).not.toContain(c.changeId!);
    // The session lane's obligations and carry decisions come from its paths alone.
    const lane = snap.lanes.find((l) => l.goal === SESSION)!;
    const g2 = snap.proposals.find((p) => p.lane === lane.lane && p.generation === 2)!;
    expect(g2.obligations.map((o) => [o.rule, o.paths])).toEqual([
      ["security-review", ["src/lib/authz/check.ts", "src/lib/authz/session.test.ts", "src/lib/authz/session.ts", "src/api/session.ts"]],
      ["tests", ["src/lib/authz/check.ts", "src/lib/authz/session.test.ts", "src/lib/authz/session.ts", "src/api/session.ts"]],
    ]);
  });
});

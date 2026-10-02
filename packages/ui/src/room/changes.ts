/**
 * A change's history across generations, from jj `change-id` commit headers
 * (request d0cbb26d; research note on jj, section 5 item 2).
 *
 * For a new generation it lists, by change ID, which changes were rewritten,
 * added or dropped compared with the previous generation, and for each
 * rewritten change an interdiff: how the change's own edits differ, ignoring
 * what changed underneath it. This is `jj evolog` and `jj interdiff` in
 * spirit, computed the way `git range-diff` does: each version of the change
 * becomes a patch against its own parent, and the two patches are compared.
 *
 * A patch keeps, for each path, what the commit did to it (added, modified,
 * deleted or renamed, the rename source, and the file modes) and its hunks
 * with `CONTEXT` lines of context on each side. Two versions are the same
 * edit to a path only when that metadata is equal and every hunk, context
 * included, is in the other version too, at the same place in the file it
 * was made against (its parent). When the two versions' parents differ at
 * that path, an old hunk's parent lines are mapped into the new parent by a
 * line diff of the two parents, so a rebase that only moves an edit does not
 * show. If they do not map one to one (the parent changed within the hunk)
 * and the new version has the same hunk, the interdiff says it could not
 * tell whether the edit moved, rather than calling it the same.
 *
 * A header is author-supplied and proves nothing. Nothing here feeds
 * obligations, evidence or the carry rule, which stay path-based.
 *
 * Bounds. Each commit's path diff runs through lane B's bounded tree diff
 * (`treeDiff` with `DEFAULT_BOUNDS`, R-PROP-6), so it is refused as too large
 * exactly as a proposal's diff would be. A generation longer than
 * `DEFAULT_BOUNDS.maxCommits` commits is not compared. Lane B bounds paths,
 * not file contents, so this comparison has bounds of its own
 * (`LINE_BOUNDS`): lines per file version, bytes per line, and the work of
 * the whole comparison of two generations. Over any bound, the result says
 * "too large" and names the bound; it is never silently empty.
 */

import { DEFAULT_BOUNDS, treeDiff, type DiffBounds, type TreeEntry, type TreeReader } from "@generalbusiness/artroom-git";
import type { Generation, PathChange, RepoPath, Sha } from "./contract.ts";

/** One commit of a generation, oldest first, with its jj header if it has one. */
export interface CommitInfo {
  readonly commit: Sha;
  readonly parent: Sha;
  /** The `change-id` header, or null when the commit has none. */
  readonly changeId: string | null;
  /** The first line of the message. */
  readonly subject: string;
}

/** What the comparison needs from a repository: trees and commits (lane B's `TreeReader`), and blob text. */
export interface CommitStore extends TreeReader {
  readBlob(hash: string): Promise<string | null>;
}

export interface ChangeCommit {
  readonly commit: Sha;
  readonly subject: string;
}

/** What one commit did to one path. */
export interface FileMeta {
  readonly status: PathChange["status"];
  /** The rename source; null unless renamed. */
  readonly from: RepoPath | null;
  /** The git file mode before and after (`100644`, `100755`, `120000`, ...); null where the path is absent. */
  readonly oldMode: string | null;
  readonly newMode: string | null;
}

/** A run of a commit's edits to one file, with up to `CONTEXT` unchanged lines on each side. */
export interface Hunk {
  /** Where the hunk starts in the file before and after the commit, counting from 1. */
  readonly oldStart: number;
  readonly newStart: number;
  /** Each line starts with " " (context), "-" (removed) or "+" (added). */
  readonly lines: readonly string[];
}

/** How the two versions of a change treat one path differently. */
export interface FileInterdiff {
  readonly path: RepoPath;
  /** What each version did to the path, when that differs; null when it is the same. A null side leaves the path alone. */
  readonly meta: { readonly before: FileMeta | null; readonly now: FileMeta | null } | null;
  /** Hunks only the new version has, and those only the old one had. */
  readonly now: readonly Hunk[];
  readonly before: readonly Hunk[];
  /**
   * The same hunk in both versions, where the old one's place could not be
   * found in the new version's parent: it may be the same edit, or one moved.
   */
  readonly unsure: readonly { readonly before: Hunk; readonly now: Hunk }[];
}

type Bound = "depth" | "entries" | "commits" | "lines" | "line-bytes" | "work";

export type Interdiff = { readonly kind: "ok"; readonly files: readonly FileInterdiff[] } | { readonly kind: "too-large"; readonly bound: Bound; readonly limit: number };

export type ChangeEntry =
  | { readonly kind: "rewritten"; readonly changeId: string; readonly before: ChangeCommit; readonly after: ChangeCommit; readonly interdiff: Interdiff }
  | { readonly kind: "added"; readonly changeId: string; readonly after: ChangeCommit }
  | { readonly kind: "dropped"; readonly changeId: string; readonly before: ChangeCommit }
  | { readonly kind: "unchanged"; readonly changeId: string; readonly commit: ChangeCommit }
  /** The same change ID on more than one commit in a generation: jj calls this divergent. Not matched. */
  | { readonly kind: "divergent"; readonly changeId: string; readonly before: readonly ChangeCommit[]; readonly after: readonly ChangeCommit[] };

export type ChangeHistory =
  | {
      readonly kind: "ok";
      readonly from: Generation;
      readonly to: Generation;
      readonly entries: readonly ChangeEntry[];
      /** Commits without a header, which cannot be followed across generations. */
      readonly headerless: { readonly before: number; readonly after: number };
    }
  | { readonly kind: "too-large"; readonly from: Generation; readonly to: Generation; readonly bound: "commits"; readonly limit: number };

/** Unchanged lines kept on each side of an edit. */
export const CONTEXT = 3;

/** This comparison's own bounds, beyond lane B's. */
export interface LineBounds {
  /** Most lines in one version of one file. */
  readonly maxLines: number;
  /** Most bytes (UTF-8) in one line. */
  readonly maxLineBytes: number;
  /**
   * Most work for one comparison of two generations, all files of all
   * commits together: one unit per character of file read, plus one per
   * pair of lines the line comparison examines.
   */
  readonly maxWork: number;
}

export const LINE_BOUNDS: LineBounds = { maxLines: 2_000, maxLineBytes: 10_000, maxWork: 20_000_000 };

type Bounds = DiffBounds & LineBounds;

const brief = (c: CommitInfo): ChangeCommit => ({ commit: c.commit, subject: c.subject });

/**
 * Compare two generations' commits by change ID. Null when no commit in
 * either generation carries a header: then there is nothing extra to show.
 */
export async function changeHistory(
  store: CommitStore,
  before: { readonly generation: Generation; readonly commits: readonly CommitInfo[] },
  after: { readonly generation: Generation; readonly commits: readonly CommitInfo[] },
  bounds: Partial<Bounds> = {},
): Promise<ChangeHistory | null> {
  const b: Bounds = { ...DEFAULT_BOUNDS, ...LINE_BOUNDS, ...bounds };
  if (![...before.commits, ...after.commits].some((c) => c.changeId)) return null;
  const range = { from: before.generation, to: after.generation };
  if (before.commits.length > b.maxCommits || after.commits.length > b.maxCommits) return { kind: "too-large", ...range, bound: "commits", limit: b.maxCommits };

  const group = (cs: readonly CommitInfo[]) => {
    const m = new Map<string, CommitInfo[]>();
    for (const c of cs) if (c.changeId) m.set(c.changeId, [...(m.get(c.changeId) ?? []), c]);
    return m;
  };
  const old = group(before.commits);
  const now = group(after.commits);
  // In the new generation's order, then the dropped ones in the old order.
  const ids = [...new Set([...after.commits.flatMap((c) => (c.changeId ? [c.changeId] : [])), ...before.commits.flatMap((c) => (c.changeId ? [c.changeId] : []))])];

  const entries: ChangeEntry[] = [];
  // Shared by every rewritten change: once spent, the rest are too large.
  let left = b.maxWork;
  const spend = (n: number) => (left -= n) >= 0;
  for (const id of ids) {
    const o = old.get(id) ?? [];
    const n = now.get(id) ?? [];
    if (o.length > 1 || n.length > 1) entries.push({ kind: "divergent", changeId: id, before: o.map(brief), after: n.map(brief) });
    else if (!o.length) entries.push({ kind: "added", changeId: id, after: brief(n[0]!) });
    else if (!n.length) entries.push({ kind: "dropped", changeId: id, before: brief(o[0]!) });
    else if (o[0]!.commit === n[0]!.commit) entries.push({ kind: "unchanged", changeId: id, commit: brief(n[0]!) });
    else entries.push({ kind: "rewritten", changeId: id, before: brief(o[0]!), after: brief(n[0]!), interdiff: await interdiff(store, o[0]!, n[0]!, b, spend) });
  }
  return {
    kind: "ok",
    ...range,
    entries,
    headerless: { before: before.commits.filter((c) => !c.changeId).length, after: after.commits.filter((c) => !c.changeId).length },
  };
}

type TooLarge = Extract<Interdiff, { kind: "too-large" }>;
interface FilePatch {
  readonly meta: FileMeta;
  readonly hunks: readonly Hunk[];
  /** The file the hunks were made against: its blob, and its lines when they were read. */
  readonly parent: { readonly hash: string | null; readonly lines: readonly string[] };
}
type Patch = { readonly kind: "ok"; readonly files: Map<RepoPath, FilePatch> } | TooLarge;
type Spend = (work: number) => boolean;

/** How two versions of one change differ in their own edits. */
async function interdiff(store: CommitStore, a: CommitInfo, b: CommitInfo, bounds: Bounds, spend: Spend): Promise<Interdiff> {
  if (!spend(0)) return { kind: "too-large", bound: "work", limit: bounds.maxWork };
  const pa = await patch(store, a, bounds, spend);
  if (pa.kind === "too-large") return pa;
  const pb = await patch(store, b, bounds, spend);
  if (pb.kind === "too-large") return pb;
  const files: FileInterdiff[] = [];
  for (const path of [...new Set([...pa.files.keys(), ...pb.files.keys()])].sort()) {
    const x = pa.files.get(path);
    const y = pb.files.get(path);
    const meta = sameMeta(x?.meta, y?.meta) ? null : { before: x?.meta ?? null, now: y?.meta ?? null };
    const hunks = x?.hunks.length && y?.hunks.length ? matchHunks(x, y, spend) : { now: y?.hunks ?? [], before: x?.hunks ?? [], unsure: [] };
    if (!hunks) return { kind: "too-large", bound: "work", limit: bounds.maxWork };
    if (meta || hunks.now.length || hunks.before.length || hunks.unsure.length) files.push({ path, meta, ...hunks });
  }
  return { kind: "ok", files };
}

const sameMeta = (x: FileMeta | undefined, y: FileMeta | undefined) =>
  x === y || (!!x && !!y && x.status === y.status && x.from === y.from && x.oldMode === y.oldMode && x.newMode === y.newMode);

const key = (h: Hunk) => h.lines.join("\n");
const parentLength = (h: Hunk) => h.lines.filter((l) => !l.startsWith("+")).length;

/**
 * Pair the two versions' hunks for one path. A pair is the same edit when
 * its lines are equal and the old hunk's place, mapped into the new parent,
 * is the new hunk's place. Null when mapping is over the work bound.
 */
function matchHunks(x: FilePatch, y: FilePatch, spend: Spend): Pick<FileInterdiff, "now" | "before" | "unsure"> | null {
  const place = placeIn(x.parent, y.parent, spend);
  if (!place) return null;
  const now: (Hunk | null)[] = [...y.hunks];
  const left: { h: Hunk; at: number | null }[] = [];
  for (const h of x.hunks) {
    const at = place(h.oldStart, parentLength(h));
    const i = now.findIndex((g) => g !== null && g.oldStart === at && key(g) === key(h));
    if (i >= 0) now[i] = null;
    else left.push({ h, at });
  }
  const before: Hunk[] = [];
  const unsure: { before: Hunk; now: Hunk }[] = [];
  for (const { h, at } of left) {
    const i = at === null ? now.findIndex((g) => g !== null && key(g) === key(h)) : -1;
    if (i >= 0) {
      unsure.push({ before: h, now: now[i]! });
      now[i] = null;
    } else before.push(h);
  }
  return { now: now.filter((g) => g !== null), before, unsure };
}

/**
 * Where a region of the old parent (first line, counting from 1, and length)
 * is in the new parent: the same place when the blobs are equal, otherwise by
 * a line diff of the two. Null for a region that does not map one to one, in
 * order. The outer null: the diff is over the work bound.
 */
function placeIn(a: FilePatch["parent"], b: FilePatch["parent"], spend: Spend): ((start: number, length: number) => number | null) | null {
  if (a.hash === b.hash) return (start) => start;
  const ops = lineDiff(a.lines, b.lines, spend);
  if (!ops) return null;
  const to: number[] = []; // for each old parent line, its index in the new parent, or -1
  let j = 0;
  for (const o of ops) {
    if (o.op === "same") to.push(j++);
    else if (o.op === "del") to.push(-1);
    else j++;
  }
  return (start, length) => {
    const first = to[start - 1];
    if (length === 0 || first === undefined || first < 0) return null;
    for (let k = 1; k < length; k++) if (to[start - 1 + k] !== first + k) return null;
    return first + 1;
  };
}

/** One commit's own edits: for each path it changes, what it did and its hunks. */
async function patch(store: CommitStore, c: CommitInfo, bounds: Bounds, spend: Spend): Promise<Patch> {
  const [self, parent] = [await store.readCommit(c.commit), await store.readCommit(c.parent)];
  if (!self || !parent) throw new Error(`commit ${self ? c.parent : c.commit} not found`);
  const d = await treeDiff(store, parent.treeHash, self.treeHash, { bounds });
  if (d.kind === "too-large") return { kind: "too-large", bound: d.bound, limit: d.limit };
  const files = new Map<RepoPath, FilePatch>();
  for (const change of d.changes) {
    const [from, to] = await Promise.all([entryAt(store, parent.treeHash, oldPath(change)), entryAt(store, self.treeHash, change.status === "deleted" ? null : change.path)]);
    const meta: FileMeta = { status: change.status, from: change.status === "renamed" ? change.from : null, oldMode: from?.mode ?? null, newMode: to?.mode ?? null };
    // The same blob on both sides (a pure rename or mode change): no hunks, nothing to read.
    if (from && to && from.hash === to.hash) {
      files.set(change.path, { meta, hunks: [], parent: { hash: from.hash, lines: [] } });
      continue;
    }
    const [x, y] = [await lines(store, from), await lines(store, to)];
    for (const v of [x, y]) {
      if (v.length > bounds.maxLines) return { kind: "too-large", bound: "lines", limit: bounds.maxLines };
      if (v.some((l) => l.length > bounds.maxLineBytes || (l.length * 3 > bounds.maxLineBytes && utf8.encode(l).length > bounds.maxLineBytes)))
        return { kind: "too-large", bound: "line-bytes", limit: bounds.maxLineBytes };
      if (!spend(v.reduce((n, l) => n + l.length + 1, 0))) return { kind: "too-large", bound: "work", limit: bounds.maxWork };
    }
    const ops = lineDiff(x, y, spend);
    if (!ops) return { kind: "too-large", bound: "work", limit: bounds.maxWork };
    files.set(change.path, { meta, hunks: toHunks(ops, CONTEXT), parent: { hash: from?.hash ?? null, lines: x } });
  }
  return { kind: "ok", files };
}

const utf8 = new TextEncoder();

const oldPath = (c: PathChange): RepoPath | null => (c.status === "added" ? null : c.status === "renamed" ? c.from : c.path);

/** The tree entry at a path, or null when the path is absent. */
async function entryAt(store: CommitStore, tree: string, path: RepoPath | null): Promise<TreeEntry | null> {
  if (path === null) return null;
  let e: TreeEntry | undefined;
  let hash = tree;
  for (const part of path.split("/")) {
    e = (await store.readTree(hash))?.find((x) => x.name === part);
    if (!e) return null;
    hash = e.hash;
  }
  return e ?? null;
}

/** An entry's lines: a blob's text, or a submodule's commit as git shows it. */
async function lines(store: CommitStore, e: TreeEntry | null): Promise<string[]> {
  if (!e) return [];
  const text = e.mode === "160000" ? `Subproject commit ${e.hash}` : await store.readBlob(e.hash);
  return text === null ? [] : text.split("\n");
}

type Op = { op: "same" | "add" | "del"; text: string };

/** Group a line diff into hunks with up to `context` unchanged lines on each side; nearby edits share a hunk. */
export function toHunks(ops: readonly Op[], context: number): Hunk[] {
  const at: { old: number; new: number }[] = [];
  let o = 1;
  let n = 1;
  for (const x of ops) {
    at.push({ old: o, new: n });
    if (x.op !== "add") o++;
    if (x.op !== "del") n++;
  }
  const changed = ops.flatMap((x, i) => (x.op === "same" ? [] : [i]));
  const out: Hunk[] = [];
  for (let k = 0; k < changed.length; k++) {
    const start = Math.max(0, changed[k]! - context);
    while (k + 1 < changed.length && changed[k + 1]! - changed[k]! <= 2 * context + 1) k++;
    const end = Math.min(ops.length, changed[k]! + context + 1);
    out.push({ oldStart: at[start]!.old, newStart: at[start]!.new, lines: ops.slice(start, end).map((x) => (x.op === "same" ? " " : x.op === "add" ? "+" : "-") + x.text) });
  }
  return out;
}

/**
 * A line diff by longest common subsequence, after trimming the common
 * prefix and suffix. Lines are numbered first, so each comparison is of two
 * integers whatever the line's length. `spend` is charged one unit per pair
 * of lines compared, before the work is done; null when it refuses.
 */
export function lineDiff(a: readonly string[], b: readonly string[], spend: Spend = () => true): Op[] | null {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const ids = new Map<string, number>();
  const id = (l: string) => ids.get(l) ?? (ids.set(l, ids.size), ids.size - 1);
  const x = a.slice(p, a.length - s).map(id);
  const y = b.slice(p, b.length - s).map(id);
  const n = x.length;
  const m = y.length;
  if (!spend(n * m)) return null;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: Op[] = a.slice(0, p).map((text) => ({ op: "same" as const, text }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ op: "same", text: a[p + i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ op: "del", text: a[p + i++]! });
    else out.push({ op: "add", text: b[p + j++]! });
  }
  while (i < n) out.push({ op: "del", text: a[p + i++]! });
  while (j < m) out.push({ op: "add", text: b[p + j++]! });
  for (const text of a.slice(a.length - s)) out.push({ op: "same", text });
  return out;
}

/**
 * A change's history across generations, from jj `change-id` commit headers
 * (request d0cbb26d; research note on jj, section 5 item 2).
 *
 * For a new generation it lists, by change ID, which changes were rewritten,
 * added or dropped compared with the previous generation, and for each
 * rewritten change an interdiff: how the change's own edits differ, ignoring
 * what changed underneath it. This is `jj evolog` and `jj interdiff` in
 * spirit, computed the way `git range-diff` does: the two versions' patches
 * are compared line by line.
 *
 * A header is author-supplied and proves nothing. Nothing here feeds
 * obligations, evidence or the carry rule, which stay path-based.
 *
 * Bounds. Each commit's path diff runs through lane B's bounded tree diff
 * (`treeDiff` with `DEFAULT_BOUNDS`, R-PROP-6), so it is refused as too large
 * exactly as a proposal's diff would be. A generation longer than
 * `DEFAULT_BOUNDS.maxCommits` commits is not compared. Lane B bounds paths,
 * not file contents, so the line comparison has one further bound of its own,
 * `LINE_LIMIT` lines per file version.
 */

import { DEFAULT_BOUNDS, treeDiff, type DiffBounds, type TreeReader } from "@generalbusiness/artroom-git";
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

/** For one path: the change's patch lines that only the new version has, and those only the old one had. */
export interface FileInterdiff {
  readonly path: RepoPath;
  readonly now: readonly string[];
  readonly before: readonly string[];
}

export type Interdiff =
  | { readonly kind: "ok"; readonly files: readonly FileInterdiff[] }
  | { readonly kind: "too-large"; readonly bound: "depth" | "entries" | "commits" | "lines"; readonly limit: number };

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

/** Most lines in one version of one file that the line comparison reads. */
export const LINE_LIMIT = 2_000;

const brief = (c: CommitInfo): ChangeCommit => ({ commit: c.commit, subject: c.subject });

/**
 * Compare two generations' commits by change ID. Null when no commit in
 * either generation carries a header: then there is nothing extra to show.
 */
export async function changeHistory(
  store: CommitStore,
  before: { readonly generation: Generation; readonly commits: readonly CommitInfo[] },
  after: { readonly generation: Generation; readonly commits: readonly CommitInfo[] },
  bounds: Partial<DiffBounds> = {},
): Promise<ChangeHistory | null> {
  const b = { ...DEFAULT_BOUNDS, ...bounds };
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
  for (const id of ids) {
    const o = old.get(id) ?? [];
    const n = now.get(id) ?? [];
    if (o.length > 1 || n.length > 1) entries.push({ kind: "divergent", changeId: id, before: o.map(brief), after: n.map(brief) });
    else if (!o.length) entries.push({ kind: "added", changeId: id, after: brief(n[0]!) });
    else if (!n.length) entries.push({ kind: "dropped", changeId: id, before: brief(o[0]!) });
    else if (o[0]!.commit === n[0]!.commit) entries.push({ kind: "unchanged", changeId: id, commit: brief(n[0]!) });
    else entries.push({ kind: "rewritten", changeId: id, before: brief(o[0]!), after: brief(n[0]!), interdiff: await interdiff(store, o[0]!, n[0]!, b) });
  }
  return {
    kind: "ok",
    ...range,
    entries,
    headerless: { before: before.commits.filter((c) => !c.changeId).length, after: after.commits.filter((c) => !c.changeId).length },
  };
}

type Patch = { readonly kind: "ok"; readonly files: Map<RepoPath, string[]> } | { readonly kind: "too-large"; readonly bound: Extract<Interdiff, { kind: "too-large" }>["bound"]; readonly limit: number };

/** How two versions of one change differ in their own edits. */
async function interdiff(store: CommitStore, a: CommitInfo, b: CommitInfo, bounds: DiffBounds): Promise<Interdiff> {
  const [pa, pb] = [await patch(store, a, bounds), await patch(store, b, bounds)];
  if (pa.kind === "too-large") return pa;
  if (pb.kind === "too-large") return pb;
  const files: FileInterdiff[] = [];
  for (const path of [...new Set([...pa.files.keys(), ...pb.files.keys()])].sort()) {
    const x = pa.files.get(path) ?? [];
    const y = pb.files.get(path) ?? [];
    if (x.length > LINE_LIMIT || y.length > LINE_LIMIT) return { kind: "too-large", bound: "lines", limit: LINE_LIMIT };
    const ops = lineDiff(x, y);
    const nowOnly = ops.filter((o) => o.op === "add").map((o) => o.text);
    const beforeOnly = ops.filter((o) => o.op === "del").map((o) => o.text);
    if (nowOnly.length || beforeOnly.length) files.push({ path, now: nowOnly, before: beforeOnly });
  }
  return { kind: "ok", files };
}

/** One commit's own edits: for each path it changes, its `+` and `-` lines. */
async function patch(store: CommitStore, c: CommitInfo, bounds: DiffBounds): Promise<Patch> {
  const [self, parent] = [await store.readCommit(c.commit), await store.readCommit(c.parent)];
  if (!self || !parent) throw new Error(`commit ${self ? c.parent : c.commit} not found`);
  const d = await treeDiff(store, parent.treeHash, self.treeHash, { bounds });
  if (d.kind === "too-large") return { kind: "too-large", bound: d.bound, limit: d.limit };
  const files = new Map<RepoPath, string[]>();
  for (const change of d.changes) {
    const [from, to] = await Promise.all([text(store, parent.treeHash, oldPath(change)), text(store, self.treeHash, change.status === "deleted" ? null : change.path)]);
    const x = from === null ? [] : from.split("\n");
    const y = to === null ? [] : to.split("\n");
    if (x.length > LINE_LIMIT || y.length > LINE_LIMIT) return { kind: "too-large", bound: "lines", limit: LINE_LIMIT };
    files.set(change.path, lineDiff(x, y).flatMap((o) => (o.op === "add" ? [`+${o.text}`] : o.op === "del" ? [`-${o.text}`] : [])));
  }
  return { kind: "ok", files };
}

const oldPath = (c: PathChange): RepoPath | null => (c.status === "added" ? null : c.status === "renamed" ? c.from : c.path);

/** A blob's text at a path in a tree, or null when the path is absent. */
async function text(store: CommitStore, tree: string, path: RepoPath | null): Promise<string | null> {
  if (path === null) return null;
  let hash = tree;
  const parts = path.split("/");
  for (let i = 0; i < parts.length; i++) {
    const entries = await store.readTree(hash);
    const e = entries?.find((x) => x.name === parts[i]);
    if (!e) return null;
    hash = e.hash;
  }
  return store.readBlob(hash);
}

/**
 * A line diff by longest common subsequence, after trimming the common
 * prefix and suffix. Inputs are bounded by LINE_LIMIT.
 */
export function lineDiff(a: readonly string[], b: readonly string[]): { op: "same" | "add" | "del"; text: string }[] {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const x = a.slice(p, a.length - s);
  const y = b.slice(p, b.length - s);
  const n = x.length;
  const m = y.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: { op: "same" | "add" | "del"; text: string }[] = a.slice(0, p).map((text) => ({ op: "same" as const, text }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ op: "same", text: x[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ op: "del", text: x[i++]! });
    else out.push({ op: "add", text: y[j++]! });
  }
  while (i < n) out.push({ op: "del", text: x[i++]! });
  while (j < m) out.push({ op: "add", text: y[j++]! });
  for (const text of a.slice(a.length - s)) out.push({ op: "same", text });
  return out;
}

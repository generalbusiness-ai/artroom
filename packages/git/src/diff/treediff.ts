/**
 * Path-level diffs through the Artifacts Workers binding (plan section 6,
 * "Diffs"; R-PROP-3, R-PROP-6).
 *
 * - Subtrees whose hash is equal on both sides are skipped whole, so the cost
 *   follows the size of the change, not the size of the repository.
 * - Trees are cached by hash. A tree's entries never change, so the cache
 *   needs no invalidation; it is bounded by count.
 * - Tree reads run in parallel up to `concurrency` (the room-core spike saw
 *   no gain past 8 to 16).
 * - The walk is bounded in depth and in entries examined. A diff over a bound
 *   is refused as `too-large`. Because the count covers every entry of every
 *   tree the full walk would compare, the refusal is the same every time for
 *   the same two trees, whatever the cache holds.
 * - Renames are exact: a deleted path and an added path with the same blob
 *   ID become one `renamed` change. A rename with edits shows as `deleted`
 *   plus `added`, which lists the same two paths, so path rules see both.
 */

import type { PathChange, RepoPath } from "@generalbusiness/artroom-contract";

/** The parts of the binding's tree entry used here. */
export interface TreeEntry {
  readonly name: string;
  readonly mode: string;
  readonly hash: string;
  readonly type: "tree" | "blob" | "symlink" | "gitlink" | "exec";
}

/** The parts of an Artifacts repo handle (`ArtifactsRepo`) used here. */
export interface TreeReader {
  readTree(hash: string): Promise<readonly TreeEntry[] | null>;
  readCommit(hash: string): Promise<{ readonly treeHash: string; readonly parents: readonly string[]; readonly committedAt: number } | null>;
}

export interface DiffBounds {
  /** Deepest directory level compared. */
  readonly maxDepth: number;
  /** Most tree entries examined, both sides together. */
  readonly maxEntries: number;
  /** Most commits read to find a merge base. */
  readonly maxCommits: number;
  /** Most tree reads in flight. */
  readonly concurrency: number;
}

/** Initial bounds (protocol section 22, point 9). Lane B's measurements: see the README. */
export const DEFAULT_BOUNDS: DiffBounds = { maxDepth: 64, maxEntries: 100_000, maxCommits: 2_000, concurrency: 8 };

export interface DiffStats {
  treeReads: number;
  cacheHits: number;
  entries: number;
  commitReads: number;
}

export type DiffResult =
  | { readonly kind: "ok"; readonly changes: readonly PathChange[]; readonly stats: DiffStats }
  | { readonly kind: "too-large"; readonly bound: "depth" | "entries" | "commits"; readonly limit: number; readonly stats: DiffStats };

/** Git's empty tree. A diff from it lists every path as added. */
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** A bounded cache of tree entries by tree hash. Share one per room. */
export class TreeCache {
  private readonly map = new Map<string, readonly TreeEntry[]>();
  readonly max: number;
  constructor(max = 20_000) {
    this.max = max;
  }
  get(hash: string): readonly TreeEntry[] | undefined {
    const v = this.map.get(hash);
    if (v) {
      this.map.delete(hash);
      this.map.set(hash, v);
    }
    return v;
  }
  set(hash: string, entries: readonly TreeEntry[]): void {
    this.map.set(hash, entries);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
  get size(): number {
    return this.map.size;
  }
}

class TooLarge extends Error {
  readonly bound: "depth" | "entries" | "commits";
  readonly limit: number;
  constructor(bound: "depth" | "entries" | "commits", limit: number) {
    super(`diff over the ${bound} bound (${limit})`);
    this.bound = bound;
    this.limit = limit;
  }
}

/** A limit on concurrent calls. */
function limiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    while (active >= n) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

interface Leaf {
  readonly hash: string;
  readonly mode: string;
}

/** Diff two root trees. */
export async function treeDiff(
  reader: TreeReader,
  fromTree: string,
  toTree: string,
  opts: { readonly bounds?: Partial<DiffBounds>; readonly cache?: TreeCache } = {},
): Promise<DiffResult> {
  const b = { ...DEFAULT_BOUNDS, ...opts.bounds };
  const cache = opts.cache ?? new TreeCache();
  const stats: DiffStats = { treeReads: 0, cacheHits: 0, entries: 0, commitReads: 0 };
  const limit = limiter(b.concurrency);

  const read = async (hash: string): Promise<readonly TreeEntry[]> => {
    if (hash === EMPTY_TREE) return [];
    const hit = cache.get(hash);
    if (hit) {
      stats.cacheHits++;
      return hit;
    }
    return limit(async () => {
      stats.treeReads++;
      const entries = await reader.readTree(hash);
      if (!entries) throw new Error(`tree ${hash} not found`);
      cache.set(hash, entries);
      return entries;
    });
  };

  const added = new Map<RepoPath, Leaf>();
  const deleted = new Map<RepoPath, Leaf>();
  const modified = new Set<RepoPath>();

  // One unit of work: compare two trees, or list every file of a tree that exists on one side only.
  type Item =
    | { readonly kind: "walk"; readonly a: string; readonly b: string; readonly prefix: string }
    | { readonly kind: "all"; readonly tree: string; readonly prefix: string; readonly into: "added" | "deleted" };

  // Level by level. Each level's trees are read in parallel, but entries
  // are counted and the bounds checked in a fixed order (by path), after the
  // whole level is read. So the same two trees give the same answer, and the
  // same refusal, whatever the cache holds and whichever read finishes first.
  let level: Item[] = fromTree === toTree ? [] : [{ kind: "walk", a: fromTree, b: toTree, prefix: "" }];
  for (let depth = 0; level.length > 0; depth++) {
    if (depth > b.maxDepth) return { kind: "too-large", bound: "depth", limit: b.maxDepth, stats };
    const order = (x: Item) => `${x.prefix}\u0000${x.kind === "all" ? x.into : "walk"}`;
    level.sort((x, y) => cmp(order(x), order(y)));
    const trees = await Promise.all(
      level.map((it) => (it.kind === "walk" ? Promise.all([read(it.a), read(it.b)]) : read(it.tree).then((e) => [e, [] as readonly TreeEntry[]] as const))),
    );
    const next: Item[] = [];
    for (let k = 0; k < level.length; k++) {
      const it = level[k]!;
      const [ea, eb] = trees[k]!;
      stats.entries += ea.length + eb.length;
      if (stats.entries > b.maxEntries) return { kind: "too-large", bound: "entries", limit: b.maxEntries, stats };
      if (it.kind === "all") {
        const into = it.into === "added" ? added : deleted;
        for (const e of ea) {
          if (e.type === "tree") next.push({ kind: "all", tree: e.hash, prefix: `${it.prefix}${e.name}/`, into: it.into });
          else into.set(it.prefix + e.name, e);
        }
        continue;
      }
      const mb = new Map(eb.map((e) => [e.name, e]));
      for (const x of ea) {
        const y = mb.get(x.name);
        mb.delete(x.name);
        const p = it.prefix + x.name;
        if (y && x.hash === y.hash && x.mode === y.mode) continue;
        const xt = x.type === "tree";
        const yt = y?.type === "tree";
        if (y && xt && yt) next.push({ kind: "walk", a: x.hash, b: y.hash, prefix: `${p}/` });
        else if (y && !xt && !yt) modified.add(p);
        else {
          if (xt) next.push({ kind: "all", tree: x.hash, prefix: `${p}/`, into: "deleted" });
          else deleted.set(p, x);
          if (y) {
            if (yt) next.push({ kind: "all", tree: y.hash, prefix: `${p}/`, into: "added" });
            else added.set(p, y);
          }
        }
      }
      for (const [name, y] of mb) {
        const p = it.prefix + name;
        if (y.type === "tree") next.push({ kind: "all", tree: y.hash, prefix: `${p}/`, into: "added" });
        else added.set(p, y);
      }
    }
    level = next;
  }
  return { kind: "ok", changes: pairRenames(added, deleted, modified), stats };
}

/** Exact renames: pair deleted and added paths with the same blob ID, in path order. */
function pairRenames(added: Map<RepoPath, Leaf>, deleted: Map<RepoPath, Leaf>, modified: Set<RepoPath>): PathChange[] {
  const byHash = new Map<string, RepoPath[]>();
  for (const [path, leaf] of [...deleted].sort(([a], [b]) => cmp(a, b))) {
    const list = byHash.get(leaf.hash) ?? [];
    list.push(path);
    byHash.set(leaf.hash, list);
  }
  const out: PathChange[] = [];
  const renamedFrom = new Set<RepoPath>();
  for (const [path, leaf] of [...added].sort(([a], [b]) => cmp(a, b))) {
    const from = byHash.get(leaf.hash)?.shift();
    if (from !== undefined) {
      renamedFrom.add(from);
      out.push({ status: "renamed", path, from });
    } else out.push({ status: "added", path });
  }
  for (const path of deleted.keys()) if (!renamedFrom.has(path)) out.push({ status: "deleted", path });
  for (const path of modified) out.push({ status: "modified", path });
  return out.sort((a, b) => cmp(a.path, b.path) || cmp(a.status, b.status));
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The best common ancestors of two commits, by git's paint-down walk:
 * commits are taken newest first, marked by which side reaches them, and a
 * commit reached from both sides is a merge base; its ancestors are marked
 * stale. Bounded by `maxCommits` reads.
 */
export async function mergeBases(
  reader: TreeReader,
  a: string,
  b: string,
  opts: { readonly maxCommits?: number; readonly stats?: DiffStats } = {},
): Promise<string[] | TooLargeResult> {
  if (a === b) return [a];
  const max = opts.maxCommits ?? DEFAULT_BOUNDS.maxCommits;
  const P1 = 1, P2 = 2, STALE = 4, RESULT = 8;
  const flags = new Map<string, number>();
  const info = new Map<string, { parents: readonly string[]; at: number }>();
  let reads = 0;
  const load = async (h: string) => {
    let c = info.get(h);
    if (!c) {
      if (++reads > max) throw new TooLarge("commits", max);
      if (opts.stats) opts.stats.commitReads++;
      const got = await reader.readCommit(h);
      if (!got) throw new Error(`commit ${h} not found`);
      c = { parents: got.parents, at: got.committedAt };
      info.set(h, c);
    }
    return c;
  };
  const queue: string[] = [];
  const insert = (h: string) => {
    if (!queue.includes(h)) queue.push(h);
    queue.sort((x, y) => info.get(y)!.at - info.get(x)!.at || cmp(x, y));
  };
  try {
    await Promise.all([load(a), load(b)]);
    flags.set(a, P1);
    flags.set(b, P2);
    insert(a);
    insert(b);
    const results: string[] = [];
    while (queue.some((h) => !((flags.get(h) ?? 0) & STALE))) {
      const h = queue.shift()!;
      let f = (flags.get(h) ?? 0) & (P1 | P2 | STALE);
      if (f === (P1 | P2)) {
        if (!((flags.get(h) ?? 0) & RESULT)) {
          flags.set(h, (flags.get(h) ?? 0) | RESULT);
          results.push(h);
        }
        f |= STALE;
      }
      const c = await load(h);
      await Promise.all(c.parents.map((p) => load(p)));
      for (const p of c.parents) {
        const pf = flags.get(p) ?? 0;
        if ((pf & f) === f) continue;
        flags.set(p, pf | f);
        insert(p);
      }
    }
    if (results.length < 2) return results;
    // Remove every candidate that is an ancestor of another candidate. The
    // walk above is ordered by commit time, so with clock skew it can report
    // such a candidate before reaching the commit that makes it redundant.
    // This check uses only parent links, never time, and is bounded by the
    // same commit budget.
    const candidates = new Set(results);
    const reached = new Set<string>();
    const queue2: string[] = [];
    for (const r of results) for (const p of (await load(r)).parents) queue2.push(p);
    while (queue2.length > 0) {
      const h = queue2.pop()!;
      if (reached.has(h)) continue;
      reached.add(h);
      for (const p of (await load(h)).parents) if (!reached.has(p)) queue2.push(p);
    }
    return [...candidates].filter((h) => !reached.has(h)).sort();
  } catch (e) {
    if (e instanceof TooLarge) return { kind: "too-large", bound: e.bound, limit: e.limit };
    throw e;
  }
}

export interface TooLargeResult {
  readonly kind: "too-large";
  readonly bound: "depth" | "entries" | "commits";
  readonly limit: number;
}

/**
 * The changes a proposal makes: from the merge base of `main` and `head`, to
 * `head` (R-PROP-3). With several merge bases (a criss-cross history), the
 * union over all of them, which can only list more paths, never fewer.
 */
export async function changedPaths(
  reader: TreeReader,
  main: string,
  head: string,
  opts: { readonly bounds?: Partial<DiffBounds>; readonly cache?: TreeCache } = {},
): Promise<DiffResult & { readonly bases?: readonly string[] }> {
  const stats: DiffStats = { treeReads: 0, cacheHits: 0, entries: 0, commitReads: 0 };
  const bases = await mergeBases(reader, main, head, { maxCommits: opts.bounds?.maxCommits ?? DEFAULT_BOUNDS.maxCommits, stats });
  if (!Array.isArray(bases)) return { ...bases, stats };
  const headCommit = await reader.readCommit(head);
  if (!headCommit) throw new Error(`commit ${head} not found`);
  stats.commitReads++;
  const seen = new Map<string, PathChange>();
  // Unrelated histories have no merge base: everything in head counts as added.
  for (const base of bases.length > 0 ? bases : [null]) {
    let baseTree = EMPTY_TREE;
    if (base !== null) {
      const baseCommit = await reader.readCommit(base);
      if (!baseCommit) throw new Error(`commit ${base} not found`);
      baseTree = baseCommit.treeHash;
    }
    const r = await treeDiff(reader, baseTree, headCommit.treeHash, opts);
    stats.treeReads += r.stats.treeReads;
    stats.cacheHits += r.stats.cacheHits;
    stats.entries += r.stats.entries;
    if (r.kind === "too-large") return { ...r, stats };
    for (const c of r.changes) seen.set(`${c.status}:${c.path}:${c.status === "renamed" ? c.from : ""}`, c);
  }
  const changes = [...seen.values()].sort((a, b) => cmp(a.path, b.path) || cmp(a.status, b.status));
  return { kind: "ok", changes, stats, bases };
}

/** Every path a change names: old and new for a rename (R-PROP-4). */
export function touchedPaths(changes: readonly PathChange[]): RepoPath[] {
  return [...new Set(changes.flatMap((c) => (c.status === "renamed" ? [c.from, c.path] : [c.path])))].sort(cmp);
}

/**
 * Paths two sets of changes both touch. Two paths collide when they are equal
 * or one is a directory of the other (`a` and `a/b`): git merges those at the
 * same tree entry.
 */
export function overlappingPaths(a: readonly PathChange[], b: readonly PathChange[]): RepoPath[] {
  const pa = touchedPaths(a);
  const pb = new Set(touchedPaths(b));
  const prefixes = (p: string) => p.split("/").map((_, i, s) => s.slice(0, i + 1).join("/"));
  const pbPrefixes = new Set([...pb].flatMap(prefixes));
  const out = new Set<RepoPath>();
  for (const p of pa) {
    if (pb.has(p) || pbPrefixes.has(p)) out.add(p);
    for (const q of prefixes(p)) if (pb.has(q)) out.add(q);
  }
  return [...out].sort(cmp);
}

/**
 * Whether a proposal needs a content preview in the publisher sandbox
 * (plan section 6: "only when paths overlap"). Compares the proposal's
 * changes with main's changes since their merge base. Disjoint paths cannot
 * conflict in git's merge, so no sandbox is needed.
 */
export async function previewPlan(
  reader: TreeReader,
  main: string,
  head: string,
  opts: { readonly bounds?: Partial<DiffBounds>; readonly cache?: TreeCache } = {},
): Promise<
  | { readonly kind: "disjoint"; readonly lane: readonly PathChange[]; readonly main: readonly PathChange[] }
  | { readonly kind: "overlap"; readonly paths: readonly RepoPath[]; readonly lane: readonly PathChange[] }
  | TooLargeResult
> {
  const lane = await changedPaths(reader, main, head, opts);
  if (lane.kind === "too-large") return { kind: "too-large", bound: lane.bound, limit: lane.limit };
  const mainCommit = await reader.readCommit(main);
  if (!mainCommit) throw new Error(`commit ${main} not found`);
  const moved = new Map<string, PathChange>();
  for (const base of lane.bases ?? []) {
    if (base === main) continue;
    const baseCommit = await reader.readCommit(base);
    if (!baseCommit) throw new Error(`commit ${base} not found`);
    const r = await treeDiff(reader, baseCommit.treeHash, mainCommit.treeHash, opts);
    if (r.kind === "too-large") return { kind: "too-large", bound: r.bound, limit: r.limit };
    for (const c of r.changes) moved.set(`${c.status}:${c.path}`, c);
  }
  const paths = overlappingPaths(lane.changes, [...moved.values()]);
  return paths.length === 0 ? { kind: "disjoint", lane: lane.changes, main: [...moved.values()] } : { kind: "overlap", paths, lane: lane.changes };
}

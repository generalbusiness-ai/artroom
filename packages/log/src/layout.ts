/**
 * Layout 2 of a log commit (contract amendment 4, R-LOG-16 to R-LOG-19):
 * the one implementation of its rules, shared by the publisher, its index
 * reader and `verify`. Each rule mirrors a reference function of
 * `packages/contract/examples/log-layout.ts`, and the tests check that they
 * agree (`test/amendment-4.test.ts`):
 * - where each segment starts (`Placement`, `segmentStarts`; R-LOG-17);
 * - how a file over the bound is cut into chunks (`chunks`; R-LOG-18);
 * - which shard directories hold a name (`shard`, `shardsOf`; R-LOG-19).
 */

import type { Checkpoint, Digest, LogLayout, Seq, Sha } from "@generalbusiness/artroom-contract";
import { canonicalize } from "./canonical.ts";
import { encodeTree, gitObject, type TreeEntry } from "./git.ts";

/** Artifacts refuses a larger git object (measured 2026-10-02). */
export const ARTIFACTS_OBJECT_LIMIT = 33_554_432;
/** R-LOG-19: B. Every blob a layout 2 commit writes is at most this: a quarter of Artifacts' limit. */
export let OBJECT_BOUND = 8_388_608;
/** R-LOG-19: a directory lists at most this many names before it splits. */
export let DIRECTORY_ENTRIES = 4_096;
/** R-LOG-9, R-LOG-17: a segment closes at this many entries in both layouts. */
export let SEGMENT_ENTRIES = 1_000;

/** The three limits of the layout rules. */
export interface LayoutLimits {
  readonly objectBound: number;
  readonly directoryEntries: number;
  readonly segmentEntries: number;
}

/**
 * For tests only: run the layout rules at smaller limits, so a test can
 * cross a bound with a few small entries. The publisher, its index reader
 * and `verify` all read the limits from this module, so they stay in
 * agreement. Returns a function that puts the contract's limits back. No
 * other code calls this: a log written at other limits is not a log any
 * other reader verifies.
 */
export function setLayoutLimitsForTests(limits: Partial<LayoutLimits>): () => void {
  const before: LayoutLimits = { objectBound: OBJECT_BOUND, directoryEntries: DIRECTORY_ENTRIES, segmentEntries: SEGMENT_ENTRIES };
  const set = (l: Partial<LayoutLimits>) => {
    OBJECT_BOUND = l.objectBound ?? OBJECT_BOUND;
    DIRECTORY_ENTRIES = l.directoryEntries ?? DIRECTORY_ENTRIES;
    SEGMENT_ENTRIES = l.segmentEntries ?? SEGMENT_ENTRIES;
  };
  set(limits);
  return () => set(before);
}

/** A seq or a chunk index as a name: 12 decimal digits. */
export const twelve = (n: number): string => String(n).padStart(12, "0");

/** The checkpoint's layout; undefined for layout 1. */
export const layoutOf = (checkpoint: Pick<Checkpoint, "layout">): LogLayout | undefined => checkpoint.layout;

/** The segment line for an entry whose canonical line is over B (R-LOG-18): a `ChunkedLine`, canonical. */
export function chunkedLine(seq: Seq, bytes: number, digest: Digest): string {
  return canonicalize({ chunked: { bytes, digest }, seq });
}

/** Whether entry `seq`, whose line is `lineBytes` long, is a chunked entry file in a commit of `layout`. */
export function isChunked(layout: LogLayout | undefined, seq: Seq, lineBytes: number): boolean {
  return layout !== undefined && seq >= layout.from && lineBytes > OBJECT_BOUND;
}

/** The bytes an entry takes in its segment: its line, or its `ChunkedLine` when the line is over B. */
export function placedBytes(seq: Seq, lineBytes: number): number {
  if (lineBytes <= OBJECT_BOUND) return lineBytes;
  // A digest is always `sha256:` and 64 hex characters, so the length does not depend on it.
  return chunkedLine(seq, lineBytes, `sha256:${"0".repeat(64)}`).length;
}

/**
 * R-LOG-17, one entry at a time, from the start of a segment. Entries are
 * placed in seq order; `place` says whether the entry starts a new segment.
 * The first entry placed always does. Before `layout.from` (and always in
 * layout 1) only the count applies.
 */
export class Placement {
  private readonly layout: LogLayout | undefined;
  /** Entries in the open segment. */
  count = 0;
  /** The open segment's bytes: its placed lines joined by newlines. */
  bytes = 0;

  constructor(layout: LogLayout | undefined) {
    this.layout = layout;
  }

  place(seq: Seq, lineBytes: number): boolean {
    const byBytes = this.layout !== undefined && seq >= this.layout.from;
    const placed = byBytes ? placedBytes(seq, lineBytes) : lineBytes;
    const starts = this.count === 0 || this.count === SEGMENT_ENTRIES || (byBytes && this.bytes + 1 + placed > OBJECT_BOUND);
    if (starts) {
      this.count = 0;
      this.bytes = 0;
    }
    this.bytes += (this.count === 0 ? 0 : 1) + placed;
    this.count += 1;
    return starts;
  }
}

/** The `first` of every segment, from each entry's canonical line length in seq order from 0. */
export function segmentStarts(lineBytes: readonly number[], checkpoint: Pick<Checkpoint, "layout">): Seq[] {
  const p = new Placement(layoutOf(checkpoint));
  const starts: Seq[] = [];
  for (const [seq, n] of lineBytes.entries()) if (p.place(seq, n)) starts.push(seq);
  return starts;
}

/**
 * The chunks of a file over B, one at a time: names (12 digits from 0),
 * offsets and lengths. Every chunk is B bytes except the last. Lazy, so a
 * caller that reads each chunk's bytes as it goes never holds more chunks
 * than it has read. `fileBytes` must be a safe integer.
 */
export function* eachChunk(fileBytes: number): Generator<{ readonly name: string; readonly offset: number; readonly bytes: number }> {
  if (!Number.isSafeInteger(fileBytes) || fileBytes < 0) throw new RangeError(`a file of ${fileBytes} bytes has no chunks`);
  for (let at = 0, k = 0; at < fileBytes; at += OBJECT_BOUND, k++) yield { name: twelve(k), offset: at, bytes: Math.min(OBJECT_BOUND, fileBytes - at) };
}

/** Every chunk of a file over B (`eachChunk`, as a list). */
export function chunks(fileBytes: number): { readonly name: string; readonly offset: number; readonly bytes: number }[] {
  return [...eachChunk(fileBytes)];
}

// ------------------------------------------------------------------ fan-out

/** How one directory set names its members (R-LOG-19). */
export interface NameSet {
  /** A member's name. */
  readonly name: RegExp;
  /** A member's key: its 12 digits or 64 hex characters. */
  readonly key: (name: string) => string;
  /** Characters per group: 3 decimal digits or 2 hex characters. */
  readonly group: 2 | 3;
  /** A shard directory's name: one group. */
  readonly shard: RegExp;
}

const decimal = (name: RegExp): NameSet => ({ name, key: (n) => n.slice(0, 12), group: 3, shard: /^[0-9]{3}$/ });
/** `segments/` and `entries/`: `<12 digits>.jsonl`. */
export const SEQ_FILES = decimal(/^[0-9]{12}\.jsonl$/);
/** A chunk directory: `<12 digits>`. */
export const CHUNKS = decimal(/^[0-9]{12}$/);
/** `inputs/` and `policies/`: `<64 hex>.json`. */
export const DIGEST_FILES: NameSet = { name: /^[0-9a-f]{64}\.json$/, key: (n) => n.slice(0, 64), group: 2, shard: /^[0-9a-f]{2}$/ };

/** One directory of a fanned-out set: the names it lists, or its subdirectories by group. */
export type Shard<T> = { readonly names: readonly T[] } | { readonly dirs: ReadonlyMap<string, Shard<T>> };

/**
 * R-LOG-19: a directory lists its members while there are at most
 * `DIRECTORY_ENTRIES` of them; otherwise one subdirectory per distinct next
 * group of their keys, and the rule again inside each. `flat` (layout 1)
 * never splits. Depends only on the set of members.
 */
export function shard<T>(members: readonly T[], key: (m: T) => string, set: Pick<NameSet, "group">, flat = false, depth = 0): Shard<T> {
  if (flat || members.length <= DIRECTORY_ENTRIES) return { names: members };
  const groups = new Map<string, T[]>();
  for (const m of members) {
    const g = key(m).slice(depth * set.group, (depth + 1) * set.group);
    const list = groups.get(g);
    if (list) list.push(m);
    else groups.set(g, [m]);
  }
  const dirs = new Map<string, Shard<T>>();
  for (const [g, list] of groups) dirs.set(g, shard(list, key, set, false, depth + 1));
  return { dirs };
}

/** The shard directories that hold `name` among `names` (the contract's `shardsOf`), from `shard`. */
export function shardsOf(names: readonly string[], name: string, key: (n: string) => string, group: 2 | 3): string[] {
  const dirs: string[] = [];
  let node: Shard<string> = shard(names, key, { group });
  while ("dirs" in node) {
    const g = key(name).slice(dirs.length * group, (dirs.length + 1) * group);
    dirs.push(g);
    const next = node.dirs.get(g);
    if (!next) break;
    node = next;
  }
  return dirs;
}

/** Each member's shard directories, joined by `/` ("" for none), by name. */
export function shardPaths(names: readonly string[], set: NameSet, flat = false): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: Shard<string>, path: string) => {
    if ("names" in node) for (const n of node.names) out.set(n, path);
    else for (const [g, sub] of node.dirs) walk(sub, path ? `${path}/${g}` : g);
  };
  walk(shard(names, set.key, set, flat), "");
  return out;
}

/** A member of a directory set: its name and what the tree lists for it, a blob or a directory. */
export interface Leaf {
  readonly name: string;
  readonly mode: TreeEntry["mode"];
  readonly sha: Sha;
}

/** One tree of a set, by its path below the set's directory ("" for the directory itself). `data` is absent for a reused tree. */
export interface SetTree {
  readonly path: string;
  readonly sha: Sha;
  readonly data?: Uint8Array;
}

/**
 * The trees of one directory set, fanned out by R-LOG-19 (`flat`: listed
 * whole, as layout 1 does). With `reuse`, a tree whose path the parent
 * already has, and under which no member is new or changed, is the
 * parent's tree, by ID: it is not encoded again.
 */
export function fanTrees(
  leaves: readonly Leaf[],
  set: NameSet,
  flat: boolean,
  reuse?: { readonly old: (path: string) => Sha | undefined; readonly changed: (leaf: Leaf) => boolean },
): { readonly root: Sha; readonly trees: readonly SetTree[] } {
  const trees: SetTree[] = [];
  const write = (node: Shard<Leaf>, path: string): { sha: Sha; dirty: boolean } => {
    const entries: TreeEntry[] = [];
    let dirty = false;
    if ("names" in node) {
      for (const l of node.names) entries.push({ name: l.name, mode: l.mode, sha: l.sha });
      dirty = reuse === undefined || node.names.some(reuse.changed);
    } else
      for (const [g, sub] of node.dirs) {
        const w = write(sub, path ? `${path}/${g}` : g);
        dirty ||= w.dirty;
        entries.push({ name: g, mode: "40000", sha: w.sha });
      }
    const old = reuse?.old(path);
    if (old !== undefined && !dirty) {
      trees.push({ path, sha: old });
      return { sha: old, dirty };
    }
    const data = encodeTree(entries);
    const sha = gitObject("tree", data).sha;
    trees.push({ path, sha, data });
    return { sha, dirty: true };
  };
  return { root: write(shard(leaves, (l) => set.key(l.name), set, flat), "").sha, trees };
}

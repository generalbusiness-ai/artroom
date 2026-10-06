/**
 * The Git object reader (authority note, sections 6.2, 6.5 and 11.1; proof
 * plan, key O15): commits with their tree and parents, trees, blobs, refs,
 * the snapshot of the staged refs, and the closure of a commit, object by
 * object. It is the reviewed successor of the earlier log's reader. The
 * review is `notes/2026-10-05-i3-git-review.md`.
 *
 * Nothing that a source returns is taken on its word:
 *
 * - an object ID is checked before it is given to a source, and again when
 *   one is read out of a commit, a tree or a host's answer;
 * - an object counts only when the source states the expected type, its
 *   bytes are exactly the stated size, and the SHA-1 of Git's header and
 *   those bytes is the ID that was asked for. The type is compared before
 *   the bytes are read as that type;
 * - a commit's tree is read as a tree and each parent as a commit, by the
 *   same rule, wherever they are followed;
 * - every count and size has a bound, and passing one is `too-large`.
 *
 * This module reads no clock and keeps nothing. It has one interface to the
 * outside: `GitSource`. It is pure apart from what a source does.
 */

import { hex } from "@generalbusiness/artroom-bytes";
import { sha1 } from "@noble/hashes/legacy.js";
import { GitRefusal, objectId, refName, type GitReason, type ObjectId } from "./names.ts";

export type ObjectType = "commit" | "tree" | "blob" | "tag";
const TYPES: readonly string[] = ["commit", "tree", "blob", "tag"];

/** An object as a store states it. `data` is null when `size` is over the limit that was asked: the bytes were not read. */
export interface StoredObject { type: string; size: number; data: Uint8Array | null }

/**
 * The one interface to a repository or a host. An implementation answers
 * null only when the store itself answers that the thing does not exist. It
 * rejects when it cannot answer: unreadable is never reported as absent.
 * The reader checks every value that comes back, so an implementation is
 * trusted for nothing but that an absence is real (section 12, H2).
 */
export interface GitSource {
  /** One object by ID. `limit`: the most content bytes the caller will take. */
  object(id: ObjectId, limit: number): Promise<StoredObject | null>;
  /** The object that a ref names now, or null when the ref does not exist. */
  ref(name: string): Promise<string | null>;
  /** Every ref whose name begins with `prefix`, with its target, as the store returns them now. At most `limit + 1` of them. */
  refs(prefix: string, limit: number): Promise<readonly { ref: string; target: string }[]>;
}

/**
 * The bounds of one read. Each is a stated constant of this package, with
 * its source. No adopted text gives a bound on a Git object (I3 deltas,
 * entry EG3), so each is a parameter, and the proof plan may set it.
 */
export interface ReadBounds {
  /** The most bytes of one commit object. */
  commitBytes: number;
  /** The most parents of one commit. */
  parents: number;
  /** The most bytes of one tree object. */
  treeBytes: number;
  /** The most bytes of one blob that is read to check a closure. */
  blobBytes: number;
  /** The most objects that one closure check reads. */
  closureObjects: number;
  /** The most refs of one snapshot. */
  refs: number;
}

export const READ_BOUNDS: ReadBounds = {
  commitBytes: 1024 * 1024,             // this package's choice: a commit is headers and a message
  parents: 64,                          // this package's choice; the ancestry record's own lists stop at 64 (section 6.2)
  treeBytes: 8 * 1024 * 1024,           // this package's choice: about 100,000 entries of one directory
  blobBytes: 32 * 1024 * 1024,          // the earlier host's measured limit on one object, 33,554,432 bytes (facts file, section 2.2)
  closureObjects: 100_000,              // the earlier model's bound on the entries of one diff
  refs: 100_000,                        // this package's choice: the authority note proposes none (section 6.2, U18)
};

/** A commit, as far as the platform reads one: its tree and its parents, in the order written. No author text is read (section 6.2). */
export interface Commit { id: ObjectId; tree: ObjectId; parents: readonly ObjectId[] }

/** The kinds of tree entry, by the exact mode Git writes. Any other mode is refused. */
export const MODES = { "100644": "blob", "100755": "blob", "120000": "blob", "40000": "tree", "160000": "gitlink" } as const;
export type Mode = keyof typeof MODES;

/** One entry of a tree. `name` is the entry's bytes: Git does not say that a name is text. */
export interface TreeEntry { mode: Mode; kind: "blob" | "tree" | "gitlink"; name: Uint8Array; id: ObjectId }

/** A ref of a snapshot with its target. */
export interface RefTarget { ref: string; target: ObjectId }

/** What a closure check found. `at` is the first object that does not count, and `reason` why. */
export type Closure = { complete: true; objects: number } | { complete: false; at: ObjectId; reason: GitReason };

const utf8 = new TextEncoder();
const ascii = (bytes: Uint8Array): string => {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
};

/** The ID of an object: the SHA-1 of Git's header, `<type> <size>\0`, and the content. */
export function idOf(type: ObjectType, data: Uint8Array): ObjectId {
  const header = utf8.encode(`${type} ${data.length}\0`);
  const whole = new Uint8Array(header.length + data.length);
  whole.set(header);
  whole.set(data, header.length);
  return hex(sha1(whole));
}

/**
 * A commit's tree and parents, from its content. The headers are read in
 * Git's own order: one `tree`, then each `parent`, then `author` and
 * `committer`. Each of those four names appears only there: a second `tree`,
 * a `parent` after `author`, or a second `author` or `committer` is
 * `repeated-header`, because two readers could otherwise disagree about
 * which line counts. A header this reader does not know, such as `gpgsig`
 * with its continuation lines, is passed over. A tree or parent line that is
 * not a well-formed object ID is refused before the ID is used.
 */
export function parseCommit(data: Uint8Array, bounds: Pick<ReadBounds, "parents"> = READ_BOUNDS): Omit<Commit, "id"> {
  let end = -1;
  for (let i = 0; i + 1 < data.length; i++) if (data[i] === 0x0a && data[i + 1] === 0x0a) { end = i; break; }
  // With no blank line the object is headers only, and each ends with a newline.
  if (end < 0 && data.at(-1) !== 0x0a) throw new GitRefusal("malformed-commit", "commit");
  const lines = ascii(data.subarray(0, end < 0 ? data.length - 1 : end)).split("\n");
  let i = 0;
  const value = (key: string): string | null => (lines[i]?.startsWith(`${key} `) ? lines[i++]!.slice(key.length + 1) : null);
  const tree = value("tree");
  if (tree === null) throw new GitRefusal("malformed-commit", "commit");
  const parents: ObjectId[] = [];
  for (let parent = value("parent"); parent !== null; parent = value("parent")) {
    if (parents.length >= bounds.parents) throw new GitRefusal("too-large", "parents");
    parents.push(objectId(parent, "parent"));
  }
  if (value("author") === null || value("committer") === null) throw new GitRefusal(/^(tree|parent|author|committer) /.test(lines[i] ?? "") ? "repeated-header" : "malformed-commit", "commit");
  for (; i < lines.length; i++) if (/^(tree|parent|author|committer) /.test(lines[i]!)) throw new GitRefusal("repeated-header", "commit");
  return { tree: objectId(tree, "tree"), parents };
}

/** Git's order of two tree entries: by the bytes of the name, where a directory's name ends with `/`. */
function entryOrder(a: TreeEntry, b: TreeEntry): number {
  const n = Math.min(a.name.length, b.name.length);
  for (let i = 0; i < n; i++) if (a.name[i] !== b.name[i]) return a.name[i]! - b.name[i]!;
  const next = (e: TreeEntry) => (e.name.length > n ? e.name[n]! : e.kind === "tree" ? 0x2f : 0);
  return next(a) - next(b);
}

/**
 * A tree's entries, from its content. A mode is kept exactly as written and
 * must be one of the five that Git writes: any other, such as `040000` or
 * `100664`, is `unknown-mode`. A name is not empty, holds no `/`, and is not
 * `.` or `..`. The entries are in Git's order, and no name is there twice.
 * Git's order puts a file `a` before a directory `a`, with other names
 * between them, so the names are compared as a set: a file and a directory
 * of one name cannot both be there.
 */
export function parseTree(data: Uint8Array): TreeEntry[] {
  const bad = () => new GitRefusal("malformed-tree", "tree");
  const out: TreeEntry[] = [];
  const names = new Set<string>();
  for (let i = 0; i < data.length; ) {
    const sp = data.indexOf(0x20, i);
    const nul = sp < 0 ? -1 : data.indexOf(0, sp + 1);
    if (sp < 0 || nul < 0 || nul + 21 > data.length || sp - i > 6) throw bad();
    const mode = ascii(data.subarray(i, sp));
    if (!Object.hasOwn(MODES, mode)) throw new GitRefusal("unknown-mode", "tree");
    const name = data.slice(sp + 1, nul);
    const dots = name.every((b) => b === 0x2e) && name.length <= 2;
    if (name.length === 0 || name.includes(0x2f) || dots) throw bad();
    const entry: TreeEntry = { mode: mode as Mode, kind: MODES[mode as Mode], name, id: objectId(hex(data.subarray(nul + 1, nul + 21)), "tree entry") };
    const last = out.at(-1);
    if ((last !== undefined && entryOrder(last, entry) >= 0) || names.has(ascii(name))) throw bad();
    names.add(ascii(name));
    out.push(entry);
    i = nul + 21;
  }
  return out;
}

export class Reader {
  readonly #source: GitSource;
  readonly #bounds: ReadBounds;

  constructor(source: GitSource, bounds: ReadBounds = READ_BOUNDS) {
    this.#source = source;
    this.#bounds = bounds;
  }

  /** Ask the source, and keep nothing of how it failed: a source's error may hold a host's text. */
  async #ask<T>(what: string, ask: () => Promise<T>): Promise<T> {
    try {
      return await ask();
    } catch (e) {
      if (e instanceof GitRefusal) throw e;
      throw new GitRefusal("unreadable", what);
    }
  }

  /**
   * The content of one object, checked: it exists, the store states the type
   * that is expected, the bytes are the stated size and inside the bound,
   * and they hash to `id`. `what` names the object in a refusal.
   */
  async object(id: ObjectId, expect: ObjectType, what: string = expect): Promise<Uint8Array> {
    objectId(id, what);
    const limit = expect === "commit" ? this.#bounds.commitBytes : expect === "tree" ? this.#bounds.treeBytes : this.#bounds.blobBytes;
    const stored = await this.#ask(what, () => this.#source.object(id, limit));
    if (stored === null) throw new GitRefusal("missing-object", what);
    if (!TYPES.includes(stored.type) || stored.type !== expect) throw new GitRefusal("wrong-type", what);
    if (!Number.isSafeInteger(stored.size) || stored.size < 0) throw new GitRefusal("wrong-size", what);
    if (stored.size > limit) throw new GitRefusal("too-large", what);
    if (stored.data === null || stored.data.length !== stored.size) throw new GitRefusal("wrong-size", what);
    if (idOf(expect, stored.data) !== id) throw new GitRefusal("hash-mismatch", what);
    return stored.data;
  }

  /** One commit: its tree and its parents, each a well-formed ID. Neither is read: `linked` and `closure` do that. */
  async commit(id: ObjectId, what = "commit"): Promise<Commit> {
    return { id, ...parseCommit(await this.object(id, "commit", what), this.#bounds) };
  }

  async tree(id: ObjectId, what = "tree"): Promise<TreeEntry[]> {
    return parseTree(await this.object(id, "tree", what));
  }

  blob(id: ObjectId, what = "blob"): Promise<Uint8Array> {
    return this.object(id, "blob", what);
  }

  /**
   * One commit with what it names checked: its tree is read as a tree, and
   * each parent is read as a commit. A parent that is a tree, a blob or a
   * tag is `wrong-type`, named `parent`. A tree line that names a commit or
   * a blob is `wrong-type`, named `tree`.
   */
  async linked(id: ObjectId, what = "commit"): Promise<Commit> {
    const commit = await this.commit(id, what);
    await this.tree(commit.tree, "tree");
    for (const parent of commit.parents) await this.object(parent, "commit", "parent");
    return commit;
  }

  /** The commit that a ref names now, or null when the ref does not exist. The read that decides (section 6.6, step 6) is this one. */
  async ref(name: string, what = "ref"): Promise<ObjectId | null> {
    refName(name, what);
    const target = await this.#ask(what, () => this.#source.ref(name));
    return target === null ? null : objectId(target, what);
  }

  /**
   * The refs under `prefix` with their targets, in byte order of the ref's
   * name: the snapshot of section 6.2. One ref that this package would not
   * name, one target that is no object ID, or one ref twice refuses the whole
   * read: a list with a ref left out would hide a foreign root.
   */
  async snapshot(prefix: string, what = "snapshot"): Promise<RefTarget[]> {
    if (!prefix.endsWith("/")) throw new GitRefusal("bad-ref-name", what);
    refName(`${prefix}x`, what);
    const listed = await this.#ask(what, () => this.#source.refs(prefix, this.#bounds.refs));
    if (listed.length > this.#bounds.refs) throw new GitRefusal("too-large", what);
    const out = listed.map(({ ref, target }) => {
      if (typeof ref !== "string" || !ref.startsWith(prefix)) throw new GitRefusal("bad-ref-name", what);
      return { ref: refName(ref, what), target: objectId(target, what) };
    });
    // The names are ASCII, so the order of their characters is the order of their bytes.
    out.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
    if (out.some((r, i) => i > 0 && out[i - 1]!.ref === r.ref)) throw new GitRefusal("unreadable", what);
    return out;
  }

  /**
   * Whether the closure of `commit` is here, object by object: the commit,
   * its tree and every tree and blob under it, and the same for every parent,
   * each checked as `object` checks one. A commit ID that resolves is not a
   * closure. The walk does not go into a commit of `stops`: those are
   * commits whose closure is already known, such as a branch's head.
   *
   * The first object that is absent, corrupt, of the wrong type, a gitlink
   * or past a bound ends the check: the closure is not complete, and nothing
   * of it counts. A source that cannot answer rejects the whole check.
   */
  async closure(commit: ObjectId, stops: ReadonlySet<ObjectId> = new Set()): Promise<Closure> {
    objectId(commit, "commit");
    // By type and ID: an ID that one line names as a blob and another as a tree is read as each, and one of the two is refused.
    const seen = new Set<string>();
    const todo: { id: ObjectId; type: "commit" | "tree" | "blob" }[] = [{ id: commit, type: "commit" }];
    let at = commit;
    try {
      for (let next = todo.pop(); next !== undefined; next = todo.pop()) {
        at = next.id;
        const key = `${next.type} ${at}`;
        if (seen.has(key) || (next.type === "commit" && stops.has(at) && at !== commit)) continue;
        if (seen.size >= this.#bounds.closureObjects) return { complete: false, at, reason: "too-large" };
        seen.add(key);
        if (next.type === "blob") await this.blob(at);
        else if (next.type === "tree") {
          for (const entry of await this.tree(at)) {
            if (entry.kind === "gitlink") return { complete: false, at, reason: "gitlink" };
            todo.push({ id: entry.id, type: entry.kind });
          }
        } else {
          const read = await this.commit(at);
          todo.push({ id: read.tree, type: "tree" }, ...read.parents.map((id) => ({ id, type: "commit" as const })));
        }
      }
    } catch (e) {
      if (e instanceof GitRefusal && e.reason !== "unreadable") return { complete: false, at, reason: e.reason };
      throw e;
    }
    return { complete: true, objects: seen.size };
  }
}

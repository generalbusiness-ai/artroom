/**
 * The snapshot of a filtered check (authority note, sections 3.11 and 5.1;
 * I3 plan, step 24): the files of one tree that a check may read, and the
 * commit that holds exactly those files. It is the successor of three
 * earlier files, written again after their review
 * (`notes/2026-10-05-i3-snapshot-review.md`).
 *
 * Two functions, and nothing else:
 *
 * - `snapshotFiles` reads a tree through the reviewed reader and returns the
 *   files that a caller's rule keeps.
 * - `snapshotCommit` builds the trees and the one commit that hold a list of
 *   files, as Git objects, without the `git` program. The commit has no
 *   parent, a fixed identity and a fixed time, so its ID is a function of
 *   the files and the message alone. Anyone derives it again.
 *
 * **A tree that cannot be read is not an empty tree.** The earlier code took
 * a tree that the store did not return as one with no entries, so a missing
 * subtree gave the snapshot of an empty directory, with a digest
 * (`notes/2026-10-05-i3-host-review.md`, fault A3). Here every tree is read
 * by `Reader.tree`, which refuses an absent object `missing-object`, a
 * corrupt one `hash-mismatch`, and a blob or a commit in a tree's place
 * `wrong-type`. A refusal ends the whole read: no list is returned for a
 * tree of which one part was not read. An empty list is returned only for a
 * tree that was read whole and of which the rule kept nothing.
 *
 * **What a snapshot is not.** No adopted text says which check is filtered,
 * in what form its filter is written, or what the snapshot repository's
 * record is (I3 deltas, entry EW3). So this module names no filter form: the
 * rule that keeps a path is the caller's function. It creates no repository,
 * mints no token and sends nothing. The creation of a snapshot repository
 * and the write of this commit into it are an operation of the change
 * lane's ledger, which no step opens yet.
 */

import { wellFormed } from "@generalbusiness/artroom-bytes";
import { GitRefusal, objectId, type ObjectId } from "./names.ts";
import { idOf, type Reader } from "./reader.ts";

/** The modes of a file in a snapshot: the three that Git writes for a blob. A directory is not listed, and a gitlink is refused. */
export const FILE_MODES = ["100644", "100755", "120000"] as const;
export type FileMode = (typeof FILE_MODES)[number];

/** One file of a snapshot: its path from the root, with `/` between its parts; its mode, exactly as Git writes it; and its blob. */
export interface SnapshotFile { path: string; mode: FileMode; id: ObjectId }

/** The bounds of one snapshot. Each is a stated constant of this package: no adopted text gives one (I3 deltas, entries EG3 and EW9). */
export interface SnapshotBounds {
  /** The most files of one snapshot. */
  files: number;
  /** The most trees that one read walks, kept or not. */
  trees: number;
  /** The most bytes of one path, and the most parts of one. */
  pathBytes: number;
  depth: number;
}
export const SNAPSHOT_BOUNDS: SnapshotBounds = { files: 20_000, trees: 20_000, pathBytes: 4096, depth: 64 };

/**
 * The author and the committer of every snapshot commit: a fixed name, the
 * time 0 and UTC. It is the earlier model's line, kept so that the commit's
 * ID has no input but the files and the message. It names nobody: a
 * snapshot commit is made by the service.
 */
export const SNAPSHOT_IDENTITY = "Artroom Snapshot <snapshot@artroom.invalid> 0 +0000";

const utf8 = new TextEncoder();
// `ignoreBOM`: a byte-order mark at the start of a name is part of the name, and is kept.
const strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * One part of a path, or a refusal `bad-path`. A part is not empty, is not
 * `.` or `..`, and holds no `/`, no NUL and no other control character. It
 * is not `.git` in any case of its letters: Git refuses to check such a
 * name out, and a tree that held one would not be the tree that a runner
 * sees.
 */
function part(name: string): string {
  if (name === "" || name === "." || name === ".." || name.toLowerCase() === ".git" || /[\u0000-\u001f\u007f\/]/.test(name)) throw new GitRefusal("bad-path", "path");
  return name;
}

/** The parts of a path, each checked, within the bounds. */
function parts(path: unknown, bounds: SnapshotBounds): string[] {
  if (typeof path !== "string" || utf8.encode(path).length > bounds.pathBytes || !wellFormed(path)) throw new GitRefusal("bad-path", "path");
  const out = path.split("/").map(part);
  if (out.length > bounds.depth) throw new GitRefusal("too-large", "path");
  return out;
}

/**
 * The files of a tree that `keep` keeps, in the order of the walk: the
 * tree's own order, depth first. Every tree under `tree` is read, whether
 * its files are kept or not, each as a tree, by its hash.
 *
 * - A tree that is absent, corrupt or of another type refuses the whole
 *   read, with the reader's own reason. Nothing is returned.
 * - A gitlink is refused, `gitlink`: it names a commit of another
 *   repository, which no snapshot can hold.
 * - A name that is not well-formed UTF-8, or that `part` refuses, is
 *   `bad-path`. The path is given to `keep` only after it is checked.
 * - A blob is named and not read: the commit that `snapshotCommit` builds
 *   names the same blob, and whoever writes that commit into a repository
 *   checks the closure there, object by object (`Reader.closure`).
 */
export async function snapshotFiles(reader: Reader, tree: ObjectId, keep: (path: string) => boolean, bounds: SnapshotBounds = SNAPSHOT_BOUNDS): Promise<SnapshotFile[]> {
  objectId(tree, "tree");
  const files: SnapshotFile[] = [];
  let trees = 0;
  const walk = async (id: ObjectId, prefix: readonly string[]): Promise<void> => {
    if (++trees > bounds.trees || prefix.length >= bounds.depth) throw new GitRefusal("too-large", "tree");
    // Never `?? []`: a tree that is not here is refused by the reader, and the refusal ends the read.
    for (const entry of await reader.tree(id, "tree")) {
      if (entry.kind === "gitlink") throw new GitRefusal("gitlink", "tree");
      let name: string;
      try {
        name = part(strict.decode(entry.name));
      } catch {
        throw new GitRefusal("bad-path", "tree");
      }
      const at = [...prefix, name];
      if (entry.kind === "tree") {
        await walk(entry.id, at);
        continue;
      }
      const path = at.join("/");
      if (utf8.encode(path).length > bounds.pathBytes) throw new GitRefusal("bad-path", "tree");
      if (!keep(path)) continue;
      if (files.length >= bounds.files) throw new GitRefusal("too-large", "tree");
      files.push({ path, mode: entry.mode as FileMode, id: entry.id });
    }
  };
  await walk(tree, []);
  return files;
}

/** One Git object that `snapshotCommit` built: its ID, its type and its content. */
export interface BuiltObject { id: ObjectId; type: "tree" | "commit"; data: Uint8Array }

/** A snapshot commit: its ID, its root tree, and the trees and the commit to write, each tree before the tree or commit that names it. The blobs are the source tree's. */
export interface SnapshotCommit { commit: ObjectId; tree: ObjectId; objects: readonly BuiltObject[] }

interface Dir { files: Map<string, { mode: FileMode; id: ObjectId }>; dirs: Map<string, Dir> }

const bytesOf = (id: ObjectId): Uint8Array => Uint8Array.from(id.match(/../g)!, (pair) => parseInt(pair, 16));

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Git's order of the entries of one tree: by the bytes of the name, where a directory's name ends with `/`. */
function order(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

/**
 * The commit that holds exactly `files`, with `message`, and the objects to
 * write for it. It is a pure function: the same files, in any order, and
 * the same message give the same commit ID.
 *
 * What it refuses, before any object is built:
 *
 * - a path that `part` refuses, or that is too long or too deep: `bad-path`,
 *   `too-large`;
 * - a mode that is not one of the three file modes, written exactly:
 *   `unknown-mode`. So `040000`, `100664` and a gitlink's `160000` are
 *   refused, and no directory is taken from the caller;
 * - a blob ID that is no object ID: `bad-object-id`;
 * - one path twice, and a path that is a file in one entry and a directory
 *   in another: `path-conflict`. The earlier code let the later entry
 *   overwrite the earlier one, so two lists with different files gave one
 *   commit;
 * - a message that is empty, does not end with one newline, or holds a NUL:
 *   `malformed-commit`.
 *
 * An empty list is the commit of Git's empty tree. Whether a check may run
 * on no files is its caller's question.
 *
 * `tally`, when it is given, counts the lookups that find whether a tree is
 * already written: one for each tree that is built. A test reads it, to show
 * that the work is bounded by the number of trees. It changes nothing.
 */
export function snapshotCommit(files: readonly SnapshotFile[], message: string, bounds: SnapshotBounds = SNAPSHOT_BOUNDS, tally?: { lookups: number }): SnapshotCommit {
  if (typeof message !== "string" || message === "" || !message.endsWith("\n") || message.includes("\u0000") || !wellFormed(message)) throw new GitRefusal("malformed-commit", "message");
  if (files.length > bounds.files) throw new GitRefusal("too-large", "files");
  const root: Dir = { files: new Map(), dirs: new Map() };
  for (const file of files) {
    const names = parts(file.path, bounds);
    if (!(FILE_MODES as readonly unknown[]).includes(file.mode)) throw new GitRefusal("unknown-mode", "file");
    const id = objectId(file.id, "file");
    let dir = root;
    for (const name of names.slice(0, -1)) {
      // A directory where an earlier entry put a file.
      if (dir.files.has(name)) throw new GitRefusal("path-conflict", "path");
      let next = dir.dirs.get(name);
      if (!next) dir.dirs.set(name, (next = { files: new Map(), dirs: new Map() }));
      dir = next;
    }
    const last = names.at(-1)!;
    // The same path twice, or a file where an earlier entry put a directory.
    if (dir.files.has(last) || dir.dirs.has(last)) throw new GitRefusal("path-conflict", "path");
    dir.files.set(last, { mode: file.mode, id });
  }
  const objects: BuiltObject[] = [];
  // The IDs of `objects`, beside it: whether a tree is already there is one lookup, whatever the number of trees. The list keeps the
  // order, which is each tree where it was first built, after the trees that it names.
  const written = new Set<ObjectId>();
  const known = (id: ObjectId): boolean => {
    if (tally) tally.lookups++;
    return written.has(id);
  };
  const write = (dir: Dir): ObjectId => {
    const entries = [
      ...[...dir.files].map(([name, f]) => ({ key: utf8.encode(name), line: utf8.encode(`${f.mode} ${name}\0`), id: f.id })),
      ...[...dir.dirs].map(([name, sub]) => ({ key: utf8.encode(`${name}/`), line: utf8.encode(`40000 ${name}\0`), id: write(sub) })),
    ].sort((a, b) => order(a.key, b.key));
    const data = concat(entries.flatMap((e) => [e.line, bytesOf(e.id)]));
    const id = idOf("tree", data);
    if (!known(id)) {
      written.add(id);
      objects.push({ id, type: "tree", data });
    }
    return id;
  };
  const tree = write(root);
  const data = utf8.encode(`tree ${tree}\nauthor ${SNAPSHOT_IDENTITY}\ncommitter ${SNAPSHOT_IDENTITY}\n\n${message}`);
  const commit = idOf("commit", data);
  objects.push({ id: commit, type: "commit", data });
  return { commit, tree, objects };
}

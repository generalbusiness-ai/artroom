/**
 * A scoped checker's filtered snapshot as a commit (R-CARRY-9). The Room
 * derives the commit from the integration's filtered files, so a scoped
 * check that binds it can be traced to the integration it was built from.
 *
 * The commit is a function of its inputs only: a tree holding exactly the
 * filtered files (each at its path, mode and blob), no parents, a fixed
 * identity and time, and the message lane G's job flow uses. A publisher
 * that writes the snapshot must write exactly this commit; that format is a
 * contract change proposed for amendment 3 (see README).
 */

import type { Digest, Sha } from "@generalbusiness/artroom-contract";
import type { SnapshotEntry } from "@generalbusiness/artroom-policy";
import { encodeCommit, encodeTree, gitObject, type GitObject, type TreeEntry } from "@generalbusiness/artroom-log";

export const SNAPSHOT_IDENTITY = "Artroom Snapshot <snapshot@artroom.invalid> 0 +0000";

export function snapshotMessage(checker: string, digest: Digest): string {
  return `Artroom filtered snapshot for ${checker}\n\nDigest: ${digest}\n`;
}

/** The snapshot commit, and the trees and commit object a publisher would write (the blobs are the integration's). */
export function snapshotCommit(entries: readonly SnapshotEntry[], checker: string, digest: Digest): { readonly commit: Sha; readonly objects: readonly GitObject[] } {
  interface Dir {
    files: Map<string, { mode: string; blob: string }>;
    dirs: Map<string, Dir>;
  }
  const top: Dir = { files: new Map(), dirs: new Map() };
  for (const [path, mode, blob] of entries) {
    const parts = path.split("/");
    let d = top;
    for (const p of parts.slice(0, -1)) {
      let next = d.dirs.get(p);
      if (!next) d.dirs.set(p, (next = { files: new Map(), dirs: new Map() }));
      d = next;
    }
    d.files.set(parts.at(-1)!, { mode, blob });
  }
  const objects: GitObject[] = [];
  const write = (d: Dir): Sha => {
    const list: TreeEntry[] = [];
    for (const [name, f] of d.files) list.push({ name, mode: f.mode as TreeEntry["mode"], sha: f.blob as Sha });
    for (const [name, sub] of d.dirs) list.push({ name, mode: "40000", sha: write(sub) });
    const tree = gitObject("tree", encodeTree(list));
    objects.push(tree);
    return tree.sha;
  };
  const tree = write(top);
  const commit = gitObject("commit", encodeCommit({ tree, parents: [], author: SNAPSHOT_IDENTITY, committer: SNAPSHOT_IDENTITY, message: snapshotMessage(checker, digest) }));
  objects.push(commit);
  return { commit: commit.sha, objects };
}

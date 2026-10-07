/**
 * The founding commit, a receipt's commit and the commit of a one-file edit,
 * byte for byte (authority revision 28, section 12.1.5; the edit is i5's,
 * not the note's). Pure: the port gives the repository's
 * object format before writing; the destination's rule reads it from a
 * commit ID in `seen` before comparing. A caller supplies only verified
 * facts: the scope's own history, or facts retained in its entries.
 */

import type { FactRef, ScopeId, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, factRefName, factText, hex, sha1, sha256, timeMs, utf8 } from "@generalbusiness/artroom-bytes";

export type ObjectFormat = "sha1" | "sha256";
export interface DestinationObject { kind: "blob" | "tree" | "commit"; body: Uint8Array; id: string }
export interface DestinationCommit { commit: string; objects: readonly DestinationObject[] }

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  return bytes;
};

const object = (format: ObjectFormat, kind: DestinationObject["kind"], body: Uint8Array): DestinationObject => ({
  kind, body, id: hex((format === "sha1" ? sha1 : sha256)(concat(utf8(`${kind} ${body.length}\0`), body))),
});

function commitObject(format: ObjectFormat, scope: ScopeId, time: Timestamp, tree: string, sentence: string, word: string, fact: FactRef): DestinationObject {
  const [millis, text] = [timeMs(time), factText(fact)];
  if (millis === null || text === null) throw new Error("a destination commit needs its recorded time and a verified fact reference");
  const identity = `artroom <${scope}@artroom.invalid> ${Math.floor(millis / 1000)} +0000`;
  return object(format, "commit", utf8(`tree ${tree}\nauthor ${identity}\ncommitter ${identity}\n\n${sentence}\n\n${word} ${text}\n`));
}

/** The empty tree and the parentless founding commit. The time is the destination's genesis entry's. */
export function foundingObjects(format: ObjectFormat, scope: ScopeId, time: Timestamp, claim: FactRef): DestinationCommit {
  const tree = object(format, "tree", new Uint8Array());
  const commit = commitObject(format, scope, time, tree.id, "Found this repository.", "claim", claim);
  return { commit: commit.id, objects: [tree, commit] };
}

/** The canonical receipt file, its tree and its parentless commit. The time is the entry that opened the receipt item. */
export function receiptObjects(format: ObjectFormat, scope: ScopeId, time: Timestamp, operation: FactRef, receipt: unknown): DestinationCommit {
  const blob = object(format, "blob", utf8(canonicalize(receipt)));
  const rawId = Uint8Array.from(blob.id.match(/../g)!, (pair) => Number.parseInt(pair, 16));
  const tree = object(format, "tree", concat(utf8("100644 receipt.json\0"), rawId));
  const commit = commitObject(format, scope, time, tree.id, "Receipt.", "operation", operation);
  return { commit: commit.id, objects: [blob, tree, commit] };
}

// ---------------------------------------------------------------- a one-file edit (i5 edit; plan 025, section 2, "Edit a page")

/** The most bytes of the path of a one-file edit: the `max` of the slot `path` of the pinned `change` lane's manifest. */
export const EDIT_PATH_BYTES = 1024;

/**
 * The segments of a path that a one-file edit may write, or null. A path is
 * relative, at most 1024 bytes, made of segments split by `/`. No segment is
 * empty, `.` or `..`, or `.git` in any letter case, and no character is a
 * control character. These are the rules of a path in a published tree; the
 * destination refuses any other path by the name `path-invalid`.
 */
export function editPath(path: unknown): readonly string[] | null {
  if (typeof path !== "string" || path.length === 0 || utf8(path).length > EDIT_PATH_BYTES || /[\u0000-\u001f\u007f]/.test(path)) return null;
  const segments = path.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== ".." && segment.toLowerCase() !== ".git") ? segments : null;
}

/** The commit of a one-file edit: the published tree with the file written, one parent, the destination's identity and the time of the entry that reserved it. */
export function editCommit(format: ObjectFormat, scope: ScopeId, time: Timestamp, tree: string, parent: string, path: string, operation: FactRef): DestinationObject {
  const [millis, text] = [timeMs(time), factText(operation)];
  if (millis === null || text === null || editPath(path) === null) throw new Error("an edit's commit needs its recorded time, a verified operation and a path it may write");
  const identity = `artroom <${scope}@artroom.invalid> ${Math.floor(millis / 1000)} +0000`;
  return object(format, "commit", utf8(`tree ${tree}\nparent ${parent}\nauthor ${identity}\ncommitter ${identity}\n\nWrite ${path}.\n\noperation ${text}\n`));
}

const TREE_MODE = "40000";
const FILE_MODES: readonly string[] = ["100644", "100755"];
interface TreeRow { mode: string; name: Uint8Array; id: string }
const hexOf = (raw: Uint8Array): string => Array.from(raw, (byte) => byte.toString(16).padStart(2, "0")).join("");
const rawOf = (id: string): Uint8Array => Uint8Array.from(id.match(/../g)!, (pair) => Number.parseInt(pair, 16));
const ascii = new TextDecoder("latin1");

/** The rows of a tree's body. Null: the body is not a tree of that object format. */
function treeRows(format: ObjectFormat, body: Uint8Array): TreeRow[] | null {
  const width = format === "sha1" ? 20 : 32;
  const rows: TreeRow[] = [];
  for (let at = 0; at < body.length;) {
    const space = body.indexOf(32, at);
    const nul = space < 0 ? -1 : body.indexOf(0, space + 1);
    if (space < 0 || nul < 0 || nul + 1 + width > body.length) return null;
    rows.push({ mode: ascii.decode(body.subarray(at, space)), name: body.slice(space + 1, nul), id: hexOf(body.subarray(nul + 1, nul + 1 + width)) });
    at = nul + 1 + width;
  }
  return rows;
}

/** Git's order of tree rows: by name, bytewise, a tree's name as if it ended in `/`. */
function rowOrder(a: TreeRow, b: TreeRow): number {
  const key = (row: TreeRow) => (row.mode === TREE_MODE ? concat(row.name, utf8("/")) : row.name);
  const [x, y] = [key(a), key(b)];
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * The objects of a one-file edit of the published commit `base`: a blob of
 * the bytes, each tree from the root down to the file's folder written
 * again, and the commit. `read` gives an object of the base's closure, which
 * the caller read from the Git host. An existing regular file at the path
 * keeps its mode, and any other path gets 100644. Null: the published tree
 * does not let the file be written there, because a folder, a symbolic link
 * or a submodule is at the path, or a file, a link or a submodule is at a
 * folder on the way; or the path is not one that `editPath` gives. The
 * commit is `editCommit`'s.
 */
export function editObjects(
  format: ObjectFormat, read: (id: string) => DestinationObject | null, base: string, path: string, bytes: Uint8Array,
  commit: { scope: ScopeId; time: Timestamp; operation: FactRef },
): (DestinationCommit & { tree: string }) | null {
  const segments = editPath(path);
  const parent = read(base);
  const rootLine = parent?.kind === "commit" ? /^tree ([0-9a-f]{40}|[0-9a-f]{64})\n/.exec(ascii.decode(parent.body.subarray(0, 80))) : null;
  if (segments === null || !rootLine) return null;
  const made: DestinationObject[] = [];
  const write = (tree: string | null, rest: readonly string[]): string | null => {
    const body = tree === null ? new Uint8Array() : read(tree)?.kind === "tree" ? read(tree)!.body : null;
    const rows = body === null ? null : treeRows(format, body);
    if (rows === null) return null;
    const name = utf8(rest[0]!);
    const found = rows.find((row) => sameBytes(row.name, name)) ?? null;
    let row: TreeRow;
    if (rest.length === 1) {
      if (found !== null && !FILE_MODES.includes(found.mode)) return null;
      const blob = object(format, "blob", bytes);
      made.push(blob);
      row = { mode: found?.mode ?? "100644", name, id: blob.id };
    } else {
      if (found !== null && found.mode !== TREE_MODE) return null;
      const below = write(found?.id ?? null, rest.slice(1));
      if (below === null) return null;
      row = { mode: TREE_MODE, name, id: below };
    }
    const next = [...rows.filter((kept) => kept !== found), row].sort(rowOrder);
    const written = object(format, "tree", concat(...next.flatMap((kept) => [utf8(`${kept.mode} `), kept.name, new Uint8Array([0]), rawOf(kept.id)])));
    made.push(written);
    return written.id;
  };
  const tree = write(rootLine[1]!, segments);
  if (tree === null) return null;
  const top = editCommit(format, commit.scope, commit.time, tree, base, path, commit.operation);
  return { commit: top.id, tree, objects: [...made, top] };
}

/** The two public ref names: the fact's entry hash, with no additional domain. */
export const receiptRef = (operation: FactRef): string | null => factRefName("refs/artroom/receipts/", operation.hash);
export const importRef = (claim: FactRef): string | null => factRefName("refs/artroom/import/", claim.hash);

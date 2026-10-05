/**
 * The filtered snapshot commit, computed without git (R-CARRY-15). Its ID is
 * a function of the files, the checker and the digest, so the Room (or
 * anyone) derives it before the publisher writes it. The harness uses it as
 * the Room does: to name the snapshot's own repository (R-CARRY-16) and to
 * check that the publisher wrote exactly that commit.
 */

import type { CheckerName, Digest, Sha, SnapshotIdentity, SnapshotMessage } from "@generalbusiness/artroom-contract";
import type { SnapshotEntry } from "@generalbusiness/artroom-policy";

export const SNAPSHOT_IDENTITY: SnapshotIdentity = "Artroom Snapshot <snapshot@artroom.invalid> 0 +0000";

export function snapshotMessage(checker: CheckerName, digest: Digest): SnapshotMessage {
  return `Artroom filtered snapshot for ${checker}\n\nDigest: ${digest}\n`;
}

const enc = new TextEncoder();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (h: string) => Uint8Array.from(h.match(/../g)!, (x) => parseInt(x, 16));

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A git object's ID: SHA-1 over `<type> <size>\0<body>`. */
async function objectId(type: string, body: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-1", concat([enc.encode(`${type} ${body.length}\0`), body])));
}

type Dir = Map<string, Dir | { readonly mode: string; readonly blob: string }>;

function compare(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

async function treeId(dir: Dir): Promise<Uint8Array> {
  const entries: { name: string; mode: string; id: Uint8Array; key: Uint8Array }[] = [];
  for (const [name, v] of dir) {
    // Git orders a subtree as if its name ended in "/".
    if (v instanceof Map) entries.push({ name, mode: "40000", id: await treeId(v), key: enc.encode(`${name}/`) });
    else entries.push({ name, mode: v.mode, id: bytes(v.blob), key: enc.encode(name) });
  }
  entries.sort((a, b) => compare(a.key, b.key));
  return objectId("tree", concat(entries.flatMap((e) => [enc.encode(`${e.mode} ${e.name}\0`), e.id])));
}

/** The ID of the snapshot commit with exactly `files` and `message`. */
export async function snapshotCommitId(files: readonly SnapshotEntry[], message: string): Promise<Sha> {
  const root: Dir = new Map();
  for (const [path, mode, blob] of files) {
    const parts = path.split("/");
    let dir = root;
    for (const p of parts.slice(0, -1)) {
      let next = dir.get(p);
      if (!(next instanceof Map)) dir.set(p, (next = new Map()));
      dir = next;
    }
    dir.set(parts.at(-1)!, { mode, blob });
  }
  const tree = hex(await treeId(root));
  return hex(await objectId("commit", enc.encode(`tree ${tree}\nauthor ${SNAPSHOT_IDENTITY}\ncommitter ${SNAPSHOT_IDENTITY}\n\n${message}`))) as Sha;
}

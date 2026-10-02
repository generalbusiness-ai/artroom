/**
 * A small git object writer and reader: blobs, trees and commits in the
 * SHA-1 object format (R-ID-6), and the two ports the log needs:
 * - `GitReader` reads objects and a ref, for `verify`;
 * - `GitRemote` also pushes objects and moves a ref with a lease, for
 *   publication.
 * `MemoryGit` implements both, for tests and for a Worker that hands
 * objects to another pusher. `gitcli.ts` implements both with the git CLI.
 */

import { sha1 } from "@noble/hashes/legacy.js";
import type { Sha } from "@generalbusiness/artroom-contract";
import { fromUtf8, utf8 } from "./canonical.ts";
import { hex } from "./crypto.ts";

export type ObjectType = "blob" | "tree" | "commit";

export interface GitObject {
  readonly type: ObjectType;
  readonly data: Uint8Array;
  readonly sha: Sha;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function gitObject(type: ObjectType, data: Uint8Array): GitObject {
  const header = utf8(`${type} ${data.length}\0`);
  return { type, data, sha: hex(sha1(concat([header, data]))) as Sha };
}

// ------------------------------------------------------------------ trees

export interface TreeEntry {
  readonly name: string;
  readonly mode: "100644" | "40000";
  readonly sha: Sha;
}

const sortKey = (e: TreeEntry) => (e.mode === "40000" ? `${e.name}/` : e.name);

function compareBytes(a: string, b: string): number {
  const x = utf8(a);
  const y = utf8(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}

export function encodeTree(entries: readonly TreeEntry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => compareBytes(sortKey(a), sortKey(b)));
  const parts: Uint8Array[] = [];
  for (const e of sorted) {
    parts.push(utf8(`${e.mode} ${e.name}\0`));
    const raw = new Uint8Array(20);
    for (let i = 0; i < 20; i++) raw[i] = parseInt(e.sha.slice(i * 2, i * 2 + 2), 16);
    parts.push(raw);
  }
  return concat(parts);
}

export function parseTree(data: Uint8Array): TreeEntry[] {
  const out: TreeEntry[] = [];
  let i = 0;
  while (i < data.length) {
    const sp = data.indexOf(0x20, i);
    const nul = data.indexOf(0, sp);
    if (sp < 0 || nul < 0 || nul + 21 > data.length) throw new Error("malformed tree");
    const mode = fromUtf8(data.subarray(i, sp));
    const name = fromUtf8(data.subarray(sp + 1, nul));
    out.push({ name, mode: mode === "40000" ? "40000" : "100644", sha: hex(data.subarray(nul + 1, nul + 21)) as Sha });
    i = nul + 21;
  }
  return out;
}

/** Build the trees for a set of files, by path. Returns the root tree and every object. */
export function buildTree(files: Readonly<Record<string, Uint8Array>>): { readonly root: Sha; readonly objects: GitObject[] } {
  const objects: GitObject[] = [];
  type Dir = { files: Map<string, Uint8Array>; dirs: Map<string, Dir> };
  const top: Dir = { files: new Map(), dirs: new Map() };
  for (const [path, data] of Object.entries(files)) {
    const parts = path.split("/");
    let d = top;
    for (const p of parts.slice(0, -1)) {
      let next = d.dirs.get(p);
      if (!next) d.dirs.set(p, (next = { files: new Map(), dirs: new Map() }));
      d = next;
    }
    d.files.set(parts.at(-1)!, data);
  }
  const write = (d: Dir): Sha => {
    const entries: TreeEntry[] = [];
    for (const [name, data] of d.files) {
      const blob = gitObject("blob", data);
      objects.push(blob);
      entries.push({ name, mode: "100644", sha: blob.sha });
    }
    for (const [name, sub] of d.dirs) entries.push({ name, mode: "40000", sha: write(sub) });
    const tree = gitObject("tree", encodeTree(entries));
    objects.push(tree);
    return tree.sha;
  };
  return { root: write(top), objects };
}

// ---------------------------------------------------------------- commits

export interface CommitFields {
  readonly tree: Sha;
  readonly parents: readonly Sha[];
  /** `Name <email> <unix seconds> +0000` */
  readonly author: string;
  readonly committer: string;
  readonly message: string;
}

export function encodeCommit(c: CommitFields): Uint8Array {
  const lines = [`tree ${c.tree}`, ...c.parents.map((p) => `parent ${p}`), `author ${c.author}`, `committer ${c.committer}`];
  return utf8(`${lines.join("\n")}\n\n${c.message}`);
}

export function parseCommit(data: Uint8Array): CommitFields {
  const text = fromUtf8(data);
  const split = text.indexOf("\n\n");
  const head = (split < 0 ? text : text.slice(0, split)).split("\n");
  let tree = "";
  const parents: Sha[] = [];
  let author = "";
  let committer = "";
  for (const line of head) {
    if (line.startsWith("tree ")) tree = line.slice(5);
    else if (line.startsWith("parent ")) parents.push(line.slice(7) as Sha);
    else if (line.startsWith("author ")) author = line.slice(7);
    else if (line.startsWith("committer ")) committer = line.slice(10);
  }
  if (!/^[0-9a-f]{40}$/.test(tree)) throw new Error("malformed commit");
  return { tree: tree as Sha, parents, author, committer, message: split < 0 ? "" : text.slice(split + 2) };
}

// ------------------------------------------------------------------ ports

export interface GitReader {
  /** The object's type and content. Throws if absent. */
  readObject(sha: Sha): Promise<{ readonly type: ObjectType; readonly data: Uint8Array }>;
  /** The ref's current commit, or null. */
  readRef(ref: string): Promise<Sha | null>;
}

export type PushOutcome =
  | { readonly ok: true }
  /** The ref was not at the lease: someone else moved it. Nothing was written to the ref. */
  | { readonly ok: false; readonly reason: "lease-mismatch"; readonly current: Sha | null }
  /** The push failed without a clear answer (network, timeout). The ref may or may not have moved. */
  | { readonly ok: false; readonly reason: "unknown"; readonly detail: string };

/** An object a publication will stage: its ID, type and length in bytes. */
export interface StageWant {
  readonly sha: Sha;
  readonly type: ObjectType;
  readonly size: number;
}

/** Bytes `offset` to `offset + data.length` of one object; the whole object when `offset` is 0 and `data.length` is `size`. */
export interface StagePart extends StageWant {
  readonly offset: number;
  readonly data: Uint8Array;
}

export type StageOutcome =
  /** Of the objects asked about, those not yet stored, with how many of their bytes are staged. */
  | { readonly ok: true; readonly missing: readonly { readonly sha: Sha; readonly have: number }[] }
  | { readonly ok: false; readonly detail: string };

export interface GitRemote extends GitReader {
  /**
   * Send `objects` and move `ref` from `lease` (null: the ref must not
   * exist) to `next`. Implementations never force past the lease. Objects
   * staged for `next` beforehand need not be sent again.
   */
  push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<PushOutcome>;
  /**
   * Optional: store objects for the publication of commit `cohort` ahead of
   * its push, in bounded parts, so no one transfer carries more than the
   * bound however large an object is. Idempotent per part: a part already
   * stored is skipped. Each completed object is checked against its type
   * and ID. Answers which of `want` are still missing. Staging may be lost
   * (a restart); the publisher asks again before every push attempt.
   */
  stage?(cohort: Sha, want: readonly StageWant[], parts: readonly StagePart[]): Promise<StageOutcome>;
}

/**
 * Staging for one cohort, shared by the in-process adapters: parts are
 * appended in order per object; a completed object is checked against its
 * type and ID and handed to `store`. `have(sha)` says whether the
 * repository already holds an object.
 */
export class StagingArea {
  private cohort: string | null = null;
  private readonly partial = new Map<string, Uint8Array[]>();
  private readonly has: (sha: Sha) => boolean;
  private readonly store: (o: GitObject) => void;

  constructor(has: (sha: Sha) => boolean, store: (o: GitObject) => void) {
    this.has = has;
    this.store = store;
  }

  /** Forget what is staged but not stored, as a restart would. */
  drop(): void {
    this.partial.clear();
  }

  private staged(sha: string): number {
    return (this.partial.get(sha) ?? []).reduce((n, c) => n + c.length, 0);
  }

  stage(cohort: Sha, want: readonly StageWant[], parts: readonly StagePart[]): StageOutcome {
    if (this.cohort !== cohort) {
      this.partial.clear(); // one cohort's staging at a time
      this.cohort = cohort;
    }
    const wanted = new Map(want.map((w) => [w.sha, w]));
    for (const p of parts) {
      const w = wanted.get(p.sha);
      if (!w || w.type !== p.type || w.size !== p.size) return { ok: false, detail: `part of ${p.sha} does not match what is wanted` };
      if (this.has(p.sha)) continue;
      const have = this.staged(p.sha);
      if (p.offset !== have) continue; // already staged, or out of order: the answer says where to resume
      if (have + p.data.length > p.size) return { ok: false, detail: `a part of ${p.sha} is outside the object` };
      const chunks = this.partial.get(p.sha) ?? [];
      chunks.push(p.data.slice());
      this.partial.set(p.sha, chunks);
      if (have + p.data.length === p.size) {
        this.partial.delete(p.sha);
        const o = gitObject(p.type, concat(chunks));
        if (o.sha !== p.sha) return { ok: false, detail: `staged ${p.type} hashes to ${o.sha}, not ${p.sha}` };
        this.store(o);
      }
    }
    return { ok: true, missing: want.filter((w) => !this.has(w.sha)).map((w) => ({ sha: w.sha, have: this.staged(w.sha) })) };
  }
}

/** An in-memory repository. `failNext` simulates lost answers for retry tests. */
export class MemoryGit implements GitRemote {
  readonly objects = new Map<string, { readonly type: ObjectType; readonly data: Uint8Array }>();
  readonly refs = new Map<string, Sha>();
  /** Pushes to fail with `unknown` before (`"before"`) or after (`"after"`) the ref moves. */
  failNext: ("before" | "after")[] = [];
  pushes = 0;
  readonly staging = new StagingArea(
    (sha) => this.objects.has(sha),
    (o) => this.objects.set(o.sha, { type: o.type, data: o.data }),
  );

  async stage(cohort: Sha, want: readonly StageWant[], parts: readonly StagePart[]): Promise<StageOutcome> {
    return this.staging.stage(cohort, want, parts);
  }

  async readObject(sha: Sha) {
    const o = this.objects.get(sha);
    if (!o) throw new Error(`object ${sha} not found`);
    return o;
  }

  async readRef(ref: string): Promise<Sha | null> {
    return this.refs.get(ref) ?? null;
  }

  async push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<PushOutcome> {
    this.pushes++;
    const fail = this.failNext.shift();
    if (fail === "before") return { ok: false, reason: "unknown", detail: "simulated failure before the update" };
    const current = this.refs.get(ref) ?? null;
    if (current !== lease) return { ok: false, reason: "lease-mismatch", current };
    for (const o of objects) {
      if (gitObject(o.type, o.data).sha !== o.sha) throw new Error(`object ${o.sha} does not match its content`);
      this.objects.set(o.sha, { type: o.type, data: o.data });
    }
    if (!this.objects.has(next)) throw new Error(`commit ${next} was not sent`);
    this.refs.set(ref, next);
    if (fail === "after") return { ok: false, reason: "unknown", detail: "simulated lost answer after the update" };
    return { ok: true };
  }
}

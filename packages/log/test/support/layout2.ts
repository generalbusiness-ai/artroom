/** Helpers for the contract amendment 4 tests: sized entries, raw trees, rewriting and grafting log commits, sources in parts. */

import { expect } from "vitest";
import type { LogEntry, LogLayout, Sha, SystemEvent } from "@generalbusiness/artroom-contract";
import { canonicalize, utf8 } from "../../src/canonical.ts";
import { LOG_REF, seal } from "../../src/entries.ts";
import { MemoryGit, buildTree, encodeCommit, gitObject, parseCommit, parseTree, type GitObject, type GitRemote, type PushOutcome, type StageOutcome, type StagePart, type StageWant, type TreeEntry } from "../../src/git.ts";
import { DIRECTORY_ENTRIES, OBJECT_BOUND, setLayoutLimitsForTests, type LayoutLimits } from "../../src/layout.ts";
import type { EntryLine, EntrySource } from "../../src/publisher.ts";
import { RoomSim, keys, memberAuthority } from "./room-sim.ts";

export const alice = memberAuthority("@alice", keys.alice.key);
export const L2 = (from: number): LogLayout => ({ version: 2, from });

export const lineOf = (e: LogEntry): number => utf8(canonicalize(e)).length;

/**
 * A test body run with the layout rules at smaller limits
 * (`setLayoutLimitsForTests`), so it crosses a bound with a few small
 * entries. The contract's limits are put back when the body ends.
 */
export function at(limits: Partial<LayoutLimits>, body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restore = setLayoutLimitsForTests(limits);
    try {
      await body();
    } finally {
      restore();
    }
  };
}

/** Publisher options in the proportions of the defaults to the contract's bound: one transfer is B, one read is B / 8. */
export const proportional = () => ({ maxTransfer: { objects: 100_000, bytes: OBJECT_BOUND }, read: { entries: 64, bytes: OBJECT_BOUND / 8 } });

/** A note on `lane` with `pad` bytes of text. */
export function note(sim: RoomSim, lane: string, pad: number): LogEntry {
  return sim.accept(sim.envelope(keys.alice, "note", lane, { text: "x".repeat(pad) }), alice);
}

/** An entry whose canonical line is exactly `bytes` long: `make(pad)` seals one that grows by a byte per unit of pad. */
export function exact(sim: RoomSim, bytes: number, make: (pad: number) => LogEntry): LogEntry {
  let pad = 0;
  for (let i = 0; i < 4; i++) {
    const e = make(pad);
    const n = lineOf(e);
    if (n === bytes) return e;
    sim.entries.pop();
    pad += bytes - n;
  }
  throw new Error(`could not make an entry of ${bytes} bytes`);
}

/** A system entry sealed by the room. */
export function system(sim: RoomSim, event: SystemEvent): LogEntry {
  return sim.system(event);
}

/** A room with only its genesis: no policy yet. */
export function bareRoom(): RoomSim {
  const sim = new RoomSim();
  sim.entries.length = 1;
  sim.retained.length = 0;
  return sim;
}

/** Every file of a commit by path, and every tree with its path, size and entries. */
export async function walk(git: MemoryGit, commit: Sha): Promise<{ files: Map<string, Uint8Array>; blobs: Map<string, Sha>; trees: { path: string; size: number; names: string[] }[] }> {
  const files = new Map<string, Uint8Array>();
  const blobs = new Map<string, Sha>();
  const trees: { path: string; size: number; names: string[] }[] = [];
  const visit = async (sha: Sha, path: string) => {
    const t = await git.readObject(sha);
    const entries = parseTree(t.data);
    trees.push({ path, size: t.data.length, names: entries.map((e) => e.name) });
    for (const e of entries) {
      const p = path ? `${path}/${e.name}` : e.name;
      if (e.mode === "40000") await visit(e.sha, p);
      else {
        files.set(p, (await git.readObject(e.sha)).data);
        blobs.set(p, e.sha);
      }
    }
  };
  await visit(parseCommit((await git.readObject(commit)).data).tree, "");
  return { files, blobs, trees };
}

function put(git: MemoryGit, objects: readonly GitObject[]) {
  for (const o of objects) git.objects.set(o.sha, { type: o.type, data: o.data });
}

/** Rewrite a commit's files (by raw path) and move the ref to the result: same parents, message and identity. */
export async function rewrite(git: MemoryGit, commit: Sha, change: (files: Map<string, Uint8Array>) => void): Promise<Sha> {
  const { files } = await walk(git, commit);
  change(files);
  const { root, objects } = buildTree(Object.fromEntries(files));
  const next = gitObject("commit", encodeCommit({ ...parseCommit((await git.readObject(commit)).data), tree: root }));
  put(git, [...objects, next]);
  git.refs.set(LOG_REF, next.sha);
  return next.sha;
}

/** Put `commit` of `source` on top of `parent` in `target`, as another writer would, and move the ref to it. */
export async function graft(target: MemoryGit, source: MemoryGit, commit: Sha, parent: Sha): Promise<Sha> {
  for (const [sha, o] of source.objects) target.objects.set(sha, o);
  const next = gitObject("commit", encodeCommit({ ...parseCommit((await source.readObject(commit)).data), parents: [parent] }));
  put(target, [next]);
  target.refs.set(LOG_REF, next.sha);
  return next.sha;
}

/**
 * A source that gives every entry whose line is over `over` bytes as an
 * `EntryLine`, read in parts from bytes the caller holds (as the Room would
 * hold them in parts). `reads` records each part's length.
 */
export function partsSource(entries: readonly LogEntry[], over = 1 << 20): { source: EntrySource; reads: number[] } {
  const big = new Map<number, Uint8Array>();
  for (const e of entries) {
    const b = utf8(canonicalize(e));
    if (b.length > over) big.set(e.seq, b);
  }
  const reads: number[] = [];
  const through = entries.length - 1;
  const source: EntrySource = {
    through,
    read: (from, limit) =>
      entries.slice(from, Math.min(from + limit, through + 1)).map((e): LogEntry | EntryLine => {
        const b = big.get(e.seq);
        if (!b) return e;
        return {
          seq: e.seq,
          bytes: b.length,
          read: (o, l) => {
            reads.push(l);
            return b.slice(o, o + l);
          },
        };
      }),
  };
  return { source, reads };
}

/**
 * A remote over `git` that follows a script, one step per push: `hold`
 * answers unknown and keeps the push to land later (`land`); `refuse`
 * answers refused without applying; `land-then` lands the held push, then
 * pushes; anything else pushes.
 */
export class Scripted implements GitRemote {
  readonly git: MemoryGit;
  script: ("hold" | "refuse" | "land-then" | "push")[] = [];
  private held: (() => Promise<PushOutcome>) | null = null;
  readonly pushed: Sha[] = [];
  constructor(git: MemoryGit) {
    this.git = git;
  }
  readRef(ref: string) {
    return this.git.readRef(ref);
  }
  readObject(sha: Sha) {
    return this.git.readObject(sha);
  }
  stage(cohort: Sha, want: readonly StageWant[], parts: readonly StagePart[]): Promise<StageOutcome> {
    return this.git.stage(cohort, want, parts);
  }
  /** Land the held push now: the answer an earlier attempt would have had. */
  async land(): Promise<PushOutcome> {
    const h = this.held;
    this.held = null;
    if (!h) throw new Error("nothing is held");
    return h();
  }
  async push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<PushOutcome> {
    this.pushed.push(next);
    const step = this.script.shift() ?? "push";
    if (step === "hold") {
      const copy = [...objects];
      this.held = () => this.git.push(copy, ref, next, lease);
      return { ok: false, reason: "unknown", detail: "simulated: the connection dropped after the pack was sent" };
    }
    if (step === "refuse") return { ok: false, reason: "refused", code: "artifacts_git_receive_pack_object_too_large", detail: "remote: artifacts_git_receive_pack_object_too_large" };
    if (step === "land-then") await this.land();
    return this.git.push(objects, ref, next, lease);
  }
}

/**
 * Expect every tree to list at most the directory limit of members and be
 * under 397,312 bytes (R-LOG-19). A directory that splits lists one shard
 * directory per group, at most 1,000 of them: at the contract's limit of
 * 4,096 that is within the limit too; at a smaller test limit it is not, so
 * shard directories are counted apart.
 */
export function expectSmallTrees(trees: readonly { path: string; size: number; names: string[] }[]) {
  const shard = /^([0-9a-f]{2}|[0-9]{3})$/;
  for (const t of trees) {
    expect(t.names.filter((n) => !shard.test(n)).length, t.path).toBeLessThanOrEqual(DIRECTORY_ENTRIES);
    expect(t.names.length, t.path).toBeLessThanOrEqual(Math.max(DIRECTORY_ENTRIES, 1000));
    expect(t.size, t.path).toBeLessThan(397_312);
  }
}

export { RoomSim, keys, seal, type TreeEntry };

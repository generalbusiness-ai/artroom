/**
 * An in-memory `ArtifactsPort`: a tiny git world with commits, forks, refs,
 * tokens and the log ref. For tests and local development only. Lane B's
 * Artifacts helpers replace it in production.
 */

import type { LaneId, LeaseGeneration, PathChange, PinnedRef, RepoPath, Sha } from "@generalbusiness/artroom-contract";
import { canonicalize, utf8 } from "../canonical.ts";
import { randomToken, sha256Hex } from "../crypto.ts";
import type { ArtifactsPort, ArtroomConfig, DiffResult, PreviewResult } from "../ports.ts";

interface Commit {
  readonly parents: readonly Sha[];
  readonly files: ReadonlyMap<RepoPath, string>;
  readonly tree: Sha;
}

export interface ForkToken {
  readonly id: string;
  readonly lane: LaneId;
  readonly lease: LeaseGeneration;
  readonly token: string;
  readonly expiresAt: number;
  revoked: boolean;
}

const sha = (value: unknown): Sha => sha256Hex(utf8(canonicalize(value))).slice(0, 40) as Sha;

export type ArtifactsMethod = keyof ArtifactsPort;

export class MemoryArtifacts implements ArtifactsPort {
  readonly commits = new Map<Sha, Commit>();
  readonly forks = new Map<LaneId, Set<Sha>>();
  readonly refs = new Map<string, Sha>();
  readonly tokens = new Map<string, ForkToken>();
  main: Sha | null = null;
  /** Largest diff before `too-large` (R-PROP-6). */
  diffLimit = 10_000;
  private readonly failures = new Map<ArtifactsMethod, number>();
  /** Calls made, by method: tests check that refused acts did no I/O. */
  readonly calls = new Map<ArtifactsMethod, number>();

  /** Make the next `count` calls of a method fail, as an outage would. */
  failNext(method: ArtifactsMethod, count = 1): void {
    this.failures.set(method, count);
  }

  private enter(method: ArtifactsMethod): void {
    this.calls.set(method, (this.calls.get(method) ?? 0) + 1);
    const n = this.failures.get(method) ?? 0;
    if (n > 0) {
      this.failures.set(method, n - 1);
      throw new Error(`Artifacts is unavailable (${method})`);
    }
  }

  // ---------------------------------------------------------- test helpers

  /** Make a commit. `changes` maps a path to new content, or to null to delete it. */
  commit(parents: Sha | null | readonly Sha[], changes: Readonly<Record<RepoPath, string | null>>): Sha {
    const ps = parents === null ? [] : typeof parents === "string" ? [parents] : [...parents];
    const files = new Map<RepoPath, string>(ps.length ? this.commits.get(ps[0]!)!.files : []);
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) files.delete(path);
      else files.set(path, content);
    }
    const sorted = [...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const tree = sha({ tree: sorted });
    const id = sha({ parents: ps, tree, n: this.commits.size });
    this.commits.set(id, { parents: ps, files, tree });
    return id;
  }

  /** Push a commit (and its ancestors) to a lane's fork. */
  push(lane: LaneId, head: Sha): void {
    const set = this.forks.get(lane) ?? new Set<Sha>();
    for (const c of this.ancestors(head)) set.add(c);
    this.forks.set(lane, set);
  }

  files(commit: Sha): ReadonlyMap<RepoPath, string> {
    return this.commits.get(commit)!.files;
  }

  ancestors(c: Sha): Set<Sha> {
    const out = new Set<Sha>();
    const stack = [c];
    while (stack.length) {
      const x = stack.pop()!;
      if (out.has(x)) continue;
      out.add(x);
      for (const p of this.commits.get(x)?.parents ?? []) stack.push(p);
    }
    return out;
  }

  mergeBase(a: Sha, b: Sha): Sha | null {
    const as = this.ancestors(a);
    // Breadth-first from b: the first common ancestor found is a best base for these small graphs.
    const queue = [b];
    const seen = new Set<Sha>();
    while (queue.length) {
      const x = queue.shift()!;
      if (seen.has(x)) continue;
      seen.add(x);
      if (as.has(x)) return x;
      queue.push(...(this.commits.get(x)?.parents ?? []));
    }
    return null;
  }

  private changes(from: Sha | null, to: Sha): PathChange[] {
    const a = from ? this.files(from) : new Map<RepoPath, string>();
    const b = this.files(to);
    const out: PathChange[] = [];
    for (const [p, v] of b) {
      if (!a.has(p)) out.push({ status: "added", path: p });
      else if (a.get(p) !== v) out.push({ status: "modified", path: p });
    }
    for (const p of a.keys()) if (!b.has(p)) out.push({ status: "deleted", path: p });
    return out.sort((x, y) => (x.path < y.path ? -1 : 1));
  }

  // ---------------------------------------------------------- the port

  /** Repositories created by a public founding. */
  readonly created = new Set<string>();

  async createRepo(identity: string): Promise<void> {
    this.enter("createRepo");
    this.created.add(identity);
  }

  async readMain(): Promise<Sha | null> {
    this.enter("readMain");
    return this.main;
  }

  async readConfig(commit: Sha): Promise<ArtroomConfig> {
    this.enter("readConfig");
    const files = this.files(commit);
    const checkers: Record<string, string> = {};
    for (const [p, v] of files) {
      const m = /^\.artroom\/checkers\/([a-z][a-z0-9-]{0,63})\.json$/.exec(p);
      if (m) checkers[m[1]!] = v;
    }
    return { policy: files.get(".artroom/policy.json") ?? null, checkers };
  }

  async treeOf(commit: Sha): Promise<Sha | null> {
    this.enter("treeOf");
    return this.commits.get(commit)?.tree ?? null;
  }

  async ensureFork(lane: LaneId): Promise<{ readonly remote: `https://${string}` }> {
    this.enter("ensureFork");
    if (!this.forks.has(lane)) this.forks.set(lane, new Set(this.main ? this.ancestors(this.main) : []));
    return { remote: `https://artifacts.example/forks/${lane}.git` };
  }

  async mintForkToken(lane: LaneId, lease: LeaseGeneration, expiresAt: number): Promise<{ readonly id: string; readonly token: string; readonly expiresAt: number }> {
    this.enter("mintForkToken");
    const t: ForkToken = { id: `tok_${randomToken().slice(0, 16)}`, lane, lease, token: `artws_${randomToken()}`, expiresAt, revoked: false };
    this.tokens.set(t.id, t);
    return { id: t.id, token: t.token, expiresAt: t.expiresAt };
  }

  async revokeForkToken(_lane: LaneId, id: string): Promise<void> {
    this.enter("revokeForkToken");
    const t = this.tokens.get(id);
    if (t) t.revoked = true;
  }

  async headInFork(lane: LaneId, head: Sha): Promise<boolean> {
    this.enter("headInFork");
    return this.forks.get(lane)?.has(head) ?? false;
  }

  async pinObjects(_lane: LaneId, head: Sha): Promise<void> {
    this.enter("pinObjects");
    this.refs.set(`refs/artroom/objects/${head}`, head);
  }

  async pinRef(ref: PinnedRef, head: Sha): Promise<void> {
    this.enter("pinRef");
    const existing = this.refs.get(ref);
    if (existing && existing !== head) throw new Error(`${ref} already points at ${existing}`);
    this.refs.set(ref, head);
  }

  async diff(main: Sha | null, head: Sha): Promise<DiffResult> {
    this.enter("diff");
    const base = main ? (this.mergeBase(main, head) ?? main) : head;
    const changed = this.changes(main ? base : null, head);
    if (changed.length > this.diffLimit) return { kind: "too-large", base };
    return { kind: "ok", base, changed };
  }

  async changedBetween(from: Sha, to: Sha): Promise<readonly RepoPath[] | null> {
    this.enter("changedBetween");
    const changed = this.changes(from, to);
    return changed.length > this.diffLimit ? null : changed.map((c) => c.path);
  }

  /** The integration of head onto main: a fast-forward, or a merge commit with the union of changes. */
  integrate(head: Sha, main: Sha | null): PreviewResult {
    if (main === null || this.ancestors(head).has(main)) return { kind: "clean", base: main ?? head, integration: head };
    if (this.ancestors(main).has(head)) return { kind: "clean", base: head, integration: main };
    const base = this.mergeBase(main, head);
    const b = base ? this.files(base) : new Map<RepoPath, string>();
    const m = this.files(main);
    const h = this.files(head);
    const paths = new Set([...b.keys(), ...m.keys(), ...h.keys()]);
    const conflicts: RepoPath[] = [];
    const merged: Record<RepoPath, string | null> = {};
    for (const p of paths) {
      const bv = b.get(p) ?? null;
      const mv = m.get(p) ?? null;
      const hv = h.get(p) ?? null;
      if (mv === hv) continue;
      if (mv === bv) merged[p] = hv;
      else if (hv === bv) continue;
      else conflicts.push(p);
    }
    if (conflicts.length) return { kind: "conflict", base: base ?? main, paths: conflicts.sort() };
    return { kind: "clean", base: base ?? main, integration: this.commit([main, head], merged) };
  }

  async preview(head: Sha, main: Sha | null): Promise<PreviewResult> {
    this.enter("preview");
    return this.integrate(head, main);
  }

}

/**
 * The production default until Artifacts is wired. The canonical repository
 * reads as empty, so a new room activates the default policy (R-POL-7);
 * every other call is unavailable, so `propose` records nothing.
 */
export class UnwiredArtifacts implements ArtifactsPort {
  private fail(): never {
    throw new Error("Artifacts is not wired into this deployment yet.");
  }
  createRepo = async (): Promise<void> => {};
  readMain = async (): Promise<Sha | null> => null;
  readConfig = async (): Promise<ArtroomConfig> => this.fail();
  treeOf = async (): Promise<Sha | null> => this.fail();
  ensureFork = async (): Promise<{ readonly remote: `https://${string}` }> => this.fail();
  mintForkToken = async (): Promise<{ readonly id: string; readonly token: string; readonly expiresAt: number }> => this.fail();
  revokeForkToken = async (): Promise<void> => this.fail();
  headInFork = async (): Promise<boolean> => this.fail();
  pinObjects = async (): Promise<void> => this.fail();
  pinRef = async (): Promise<void> => this.fail();
  diff = async (): Promise<DiffResult> => this.fail();
  changedBetween = async (): Promise<readonly RepoPath[] | null> => this.fail();
  preview = async (): Promise<PreviewResult> => this.fail();
}

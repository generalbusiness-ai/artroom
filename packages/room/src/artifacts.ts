/**
 * The Room's `ArtifactsPort` over the Cloudflare Artifacts binding and lane
 * B's helpers: tree diffs and merge-preview planning (`changedPaths`,
 * `treeDiff`, `previewPlan`), pinning and previews in the publisher sandbox
 * (`Pinning`), and fork names (`forkName`). Workspaces (forks and tokens)
 * are lane B's `Workspaces`, which the Room hosts directly.
 *
 * A room's repository identity is `<namespace>/<name>` (R-GEN-12). A
 * deployment binds one Artifacts namespace; an identity in any other
 * namespace has no repository here, and every call for it is unavailable.
 */

import type { Glob, LaneId, PathChange, RepoPath, Sha } from "@generalbusiness/artroom-contract";
import {
  DEFAULT_BOUNDS,
  EMPTY_TREE,
  Pinning,
  TreeCache,
  changedPaths,
  forkName,
  previewPlan,
  touchedPaths,
  treeDiff,
  withRetry,
  type ArtifactsNamespace,
  type DiffBounds,
  type PublisherStub,
  type RepoHandle,
} from "@generalbusiness/artroom-git";
import { filterSnapshot, snapshotDigest, type SnapshotEntry } from "@generalbusiness/artroom-policy";
import type { ArtifactsPort, ArtroomConfig, DiffResult, PreviewResult } from "./ports.ts";

/** A repository handle as the binding gives it: lane B's surface, plus blob reads. */
export interface ArtifactsRepoLike extends RepoHandle {
  readBlob(hash: string): Promise<Blob | null>;
}

/** The Artifacts binding: lane B's namespace surface, plus repository creation. */
export interface ArtifactsBinding extends ArtifactsNamespace {
  get(name: string): Promise<ArtifactsRepoLike>;
  create(name: string, opts?: { description?: string }): Promise<{ readonly name: string; readonly remote: string }>;
}

/** Where a repository identity lives: the binding's namespace and the repository's name in it. */
export interface RepoLocation {
  readonly namespace: string;
  readonly name: string;
}

/** Map a repository identity to its location, or null when this deployment has no binding for its namespace. */
export function locate(identity: string, namespace: string): RepoLocation | null {
  const slash = identity.indexOf("/");
  if (slash <= 0) return null;
  const ns = identity.slice(0, slash);
  const name = identity.slice(slash + 1);
  return ns === namespace && /^[A-Za-z0-9._-]{1,100}$/.test(name) ? { namespace: ns, name } : null;
}

export interface ArtifactsAdapterOptions {
  readonly binding: ArtifactsBinding;
  readonly stub: PublisherStub;
  /** The room's repository: known once the room is founded, or while it is being founded. */
  readonly location: () => RepoLocation;
  readonly bounds?: Partial<DiffBounds>;
  readonly sleep?: (ms: number) => Promise<void>;
}

const CHECKER = /^[a-z][a-z0-9-]{0,63}$/;

export class ArtifactsAdapter implements ArtifactsPort {
  private readonly o: ArtifactsAdapterOptions;
  private readonly cache = new TreeCache();
  private remoteCache: string | null = null;

  constructor(opts: ArtifactsAdapterOptions) {
    this.o = opts;
  }

  private retry<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, this.o.sleep ? { sleep: this.o.sleep } : {});
  }

  get name(): string {
    return this.o.location().name;
  }

  private canonical(): Promise<ArtifactsRepoLike> {
    return this.retry(() => this.o.binding.get(this.name));
  }

  private bounds(): Partial<DiffBounds> {
    return this.o.bounds ?? {};
  }

  /** The canonical repository's remote, for the publisher sandbox. */
  async canonicalRemote(): Promise<string> {
    if (this.remoteCache) return this.remoteCache;
    const info = await (await this.canonical()).info();
    this.remoteCache = info.remote;
    return info.remote;
  }

  private async pinning(): Promise<Pinning> {
    const remote = await this.canonicalRemote();
    return new Pinning({ stub: this.o.stub, artifacts: this.o.binding, canonical: { name: this.name, remote }, ...(this.o.sleep ? { sleep: this.o.sleep } : {}) });
  }

  async createRepo(): Promise<void> {
    try {
      await this.retry(() => this.o.binding.create(this.name, { description: "Artroom room repository" }));
    } catch (e) {
      // A repository from an earlier attempt of this same founding: the binding is exact (R-GEN-13).
      if ((e as { code?: string }).code !== "ALREADY_EXISTS") throw e;
    }
  }

  async readMain(): Promise<Sha | null> {
    const repo = await this.canonical();
    for (const ref of ["main", "refs/heads/main"]) {
      const [top] = await repo.log({ ref, limit: 1 });
      if (top) return top.hash as Sha;
    }
    return null;
  }

  private async text(repo: ArtifactsRepoLike, blob: string): Promise<string> {
    const b = await repo.readBlob(blob);
    if (!b) throw new Error(`blob ${blob} is missing`);
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(await b.arrayBuffer());
  }

  async readConfig(commit: Sha): Promise<ArtroomConfig> {
    const repo = await this.canonical();
    const c = await repo.readCommit(commit);
    if (!c) throw new Error(`commit ${commit} is missing`);
    const root = (await repo.readTree(c.treeHash)) ?? [];
    const dir = root.find((e) => e.name === ".artroom" && e.type === "tree");
    if (!dir) return { policy: null, checkers: {} };
    const entries = (await repo.readTree(dir.hash)) ?? [];
    const policyEntry = entries.find((e) => e.name === "policy.json" && e.type !== "tree");
    const checkers: Record<string, string> = {};
    const checkerDir = entries.find((e) => e.name === "checkers" && e.type === "tree");
    if (checkerDir)
      for (const e of (await repo.readTree(checkerDir.hash)) ?? []) {
        const m = /^(.*)\.json$/.exec(e.name);
        if (m && CHECKER.test(m[1]!) && e.type !== "tree") checkers[m[1]!] = await this.text(repo, e.hash);
      }
    return { policy: policyEntry ? await this.text(repo, policyEntry.hash) : null, checkers };
  }

  async treeOf(commit: Sha): Promise<Sha | null> {
    const c = await (await this.canonical()).readCommit(commit);
    return c ? (c.treeHash as Sha) : null;
  }

  /** The lane's fork, if it exists and is a fork of exactly this repository. */
  private async fork(lane: LaneId): Promise<{ repo: ArtifactsRepoLike; name: string; remote: string } | null> {
    const name = forkName(this.name, lane);
    let repo: ArtifactsRepoLike;
    try {
      repo = await this.retry(() => this.o.binding.get(name));
    } catch (e) {
      if ((e as { code?: string }).code === "NOT_FOUND") return null;
      throw e;
    }
    const info = await repo.info();
    const loc = this.o.location();
    if (info.source !== `artifacts:${loc.namespace}/${loc.name}`) return null;
    return { repo, name, remote: info.remote };
  }

  async headInFork(lane: LaneId, head: Sha): Promise<boolean> {
    const f = await this.fork(lane);
    return f ? (await f.repo.readCommit(head)) !== null : false;
  }

  async pinObjects(lane: LaneId, head: Sha): Promise<void> {
    const f = await this.fork(lane);
    if (!f) throw new Error("the lane has no fork");
    const r = await (await this.pinning()).pinObjects({ name: f.name, remote: f.remote }, head);
    if (r.kind !== "pinned") throw new Error(`the head could not be pinned (${r.kind})`);
  }

  async pinRef(lane: LaneId, generation: number, head: Sha): Promise<void> {
    const r = await (await this.pinning()).pinRef(lane, generation, head);
    if (r.kind !== "pinned") throw new Error(`the pinned ref could not be written (${r.kind})`);
  }

  async diff(main: Sha | null, head: Sha): Promise<DiffResult> {
    const repo = await this.canonical();
    if (main === null) {
      const c = await repo.readCommit(head);
      if (!c) throw new Error(`commit ${head} is missing`);
      const r = await treeDiff(repo, EMPTY_TREE, c.treeHash, { bounds: this.bounds(), cache: this.cache });
      return r.kind === "ok" ? { kind: "ok", base: head, changed: r.changes } : { kind: "too-large", base: head };
    }
    const r = await changedPaths(repo, main, head, { bounds: this.bounds(), cache: this.cache });
    const base = ([...(r.bases ?? [])].sort()[0] ?? main) as Sha;
    return r.kind === "ok" ? { kind: "ok", base, changed: r.changes as readonly PathChange[] } : { kind: "too-large", base };
  }

  async changedBetween(from: Sha, to: Sha): Promise<readonly RepoPath[] | null> {
    const repo = await this.canonical();
    const [a, b] = await Promise.all([repo.readCommit(from), repo.readCommit(to)]);
    if (!a || !b) throw new Error("a commit is missing");
    const r = await treeDiff(repo, a.treeHash, b.treeHash, { bounds: this.bounds(), cache: this.cache });
    return r.kind === "ok" ? touchedPaths(r.changes) : null;
  }

  async preview(lane: LaneId, generation: number, head: Sha, main: Sha | null): Promise<PreviewResult> {
    if (main === null) return { kind: "clean", base: head, integration: head };
    const repo = await this.canonical();
    const plan = await previewPlan(repo, main, head, { bounds: this.bounds(), cache: this.cache });
    if (plan.kind === "too-large") throw new Error(`the preview is over the diff bound (${plan.bound})`);
    const lb = await changedPaths(repo, main, head, { bounds: this.bounds(), cache: this.cache });
    const bases = [...(lb.bases ?? [])].sort();
    const base = (bases[0] ?? main) as Sha;
    // A fast-forward: the integration is the head itself.
    const ff = bases.length === 1 && bases[0] === main;
    if (plan.kind === "disjoint") return { kind: "clean", base, integration: ff ? head : null };
    const r = await (await this.pinning()).preview(lane, generation, head);
    return r.kind === "clean" ? { kind: "clean", base: r.base as Sha, integration: ff ? head : null } : { kind: "conflict", base: r.base as Sha, paths: r.paths };
  }

  async snapshot(commit: Sha, inputs: readonly Glob[]): Promise<{ readonly digest: `sha256:${string}`; readonly files: number } | null> {
    const repo = await this.canonical();
    const c = await repo.readCommit(commit);
    if (!c) throw new Error(`commit ${commit} is missing`);
    const max = this.o.bounds?.maxEntries ?? DEFAULT_BOUNDS.maxEntries;
    const entries: SnapshotEntry[] = [];
    let seen = 0;
    const walk = async (tree: string, prefix: string): Promise<boolean> => {
      for (const e of (await repo.readTree(tree)) ?? []) {
        if (++seen > max) return false;
        const p = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.type === "tree") {
          if (!(await walk(e.hash, p))) return false;
        } else entries.push([p as RepoPath, e.mode, e.hash as Sha]);
      }
      return true;
    };
    if (!(await walk(c.treeHash, ""))) return null;
    const kept = filterSnapshot(entries, inputs);
    return { digest: (await snapshotDigest(kept)) as `sha256:${string}`, files: kept.length };
  }
}

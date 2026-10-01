/**
 * Fake remotes, for tests and local development: an in-memory Artifacts
 * namespace with the binding's shape, and an in-memory publisher sandbox
 * with lane B's `PublisherStub` shape, over one store of real git objects
 * (lane L's SHA-1 object format).
 *
 * The Room never talks to these directly. It runs the real adapters (lane
 * B's `Landing`, `Workspaces`, `Pinning` and tree diff, lane L's
 * `LogPublisher`, and the Room's own `ArtifactsAdapter`) over them, so a
 * test exercises the same code a deployment runs. The only things a test
 * steers here are remote behaviours: transport faults, Artifacts error
 * codes, a push held in flight, another writer.
 */

import type { LaneId, RepoPath, Sha } from "@generalbusiness/artroom-contract";
import {
  buildTree,
  encodeCommit,
  gitObject,
  parseCommit,
  parseTree,
  type GitObject,
  type GitRemote,
  type ObjectType,
  type PushOutcome as LogPushOutcome,
} from "@generalbusiness/artroom-log";
import type { PinResult, PreviewResult, BuildResult, PublisherStub, PushOutcome } from "@generalbusiness/artroom-git";
import { forkName } from "@generalbusiness/artroom-git";
import { utf8 } from "../canonical.ts";
import { randomToken } from "../crypto.ts";

const decoder = new TextDecoder();

/** An Artifacts error, as the binding throws it. */
export class FakeArtifactsError extends Error {
  override readonly name = "ArtifactsError";
  constructor(
    readonly code: string,
    readonly numericCode: number,
  ) {
    super(`Artifacts: ${code}`);
  }
}

export const artifactsErrors = {
  internal: () => new FakeArtifactsError("INTERNAL_ERROR", 10400),
  notFound: () => new FakeArtifactsError("NOT_FOUND", 10404),
  exists: () => new FakeArtifactsError("ALREADY_EXISTS", 10409),
  /** A transport failure: no answer from Artifacts at all. */
  transport: () => new Error("network connection lost"),
};

interface Token {
  readonly id: string;
  readonly plaintext: string;
  readonly scope: "read" | "write";
  readonly createdAt: number;
  readonly expiresAt: number;
  revoked: boolean;
}

/** Remote methods a test can make fail, by name. */
export type RemoteMethod =
  | "create"
  | "get"
  | "fork"
  | "createToken"
  | "revokeToken"
  | "listTokens"
  | "readTree"
  | "readCommit"
  | "readBlob"
  | "log"
  | "pinObjects"
  | "pinRef"
  | "preview"
  | "integrate"
  | "push";

/** One repository: its refs, its objects and its tokens. */
export class FakeRepo implements GitRemote {
  readonly refs = new Map<string, Sha>();
  readonly objects = new Set<string>();
  readonly tokens = new Map<string, Token>();

  constructor(
    readonly host: FakeArtifactsHost,
    readonly name: string,
    readonly source: string | null,
  ) {}

  get remote(): string {
    return `https://artifacts.test/${this.host.namespace}/${this.name}.git`;
  }

  // ------------------------------------------------------------ the binding's repo handle

  async createToken(scope: "read" | "write" = "write", ttl = 86_400) {
    this.host.enter("createToken");
    if (ttl < 60 || ttl > 31_536_000) throw new FakeArtifactsError("INVALID_TTL", 10003);
    const t = this.mint(scope, ttl);
    this.host.answer("createToken");
    return t;
  }

  mint(scope: "read" | "write", ttl: number) {
    const t: Token = {
      id: `tok_${randomToken().slice(0, 16)}`,
      // Assembled at runtime: the shape of an Artifacts token, never a real one.
      plaintext: ["art", "v1", randomToken().replace(/[^A-Za-z0-9]/g, "").slice(0, 32)].join("_"),
      scope,
      createdAt: this.host.now(),
      expiresAt: this.host.now() + ttl * 1000,
      revoked: false,
    };
    this.tokens.set(t.id, t);
    return { id: t.id, plaintext: t.plaintext, scope, expiresAt: new Date(t.expiresAt).toISOString() };
  }

  async revokeToken(tokenOrId: string): Promise<boolean> {
    this.host.enter("revokeToken");
    for (const t of this.tokens.values())
      if (t.id === tokenOrId || t.plaintext === tokenOrId) {
        const was = !t.revoked;
        t.revoked = true;
        return was;
      }
    return false;
  }

  async listTokens() {
    this.host.enter("listTokens");
    const tokens = [...this.tokens.values()].map((t) => ({
      id: t.id,
      scope: t.scope,
      state: (t.revoked ? "revoked" : t.expiresAt <= this.host.now() ? "expired" : "active") as "active" | "expired" | "revoked",
      createdAt: new Date(t.createdAt).toISOString(),
      expiresAt: new Date(t.expiresAt).toISOString(),
    }));
    return { tokens, total: tokens.length };
  }

  /** The active tokens, for tests. Never their text. */
  activeTokens(): { id: string; scope: string; expiresAt: number }[] {
    return [...this.tokens.values()].filter((t) => !t.revoked && t.expiresAt > this.host.now()).map((t) => ({ id: t.id, scope: t.scope, expiresAt: t.expiresAt }));
  }

  /** Whether a token's text is live on this repo with this scope (write covers read). */
  admits(token: string, scope: "read" | "write"): boolean {
    for (const t of this.tokens.values())
      if (t.plaintext === token) return !t.revoked && t.expiresAt > this.host.now() && (t.scope === "write" || scope === "read");
    return false;
  }

  async info() {
    this.host.enter("get");
    return { id: `repo_${this.name}`, name: this.name, remote: this.remote, source: this.source, description: null, defaultBranch: "main" };
  }

  private object(sha: string, type: ObjectType): Uint8Array | null {
    if (!this.objects.has(sha)) return null;
    const o = this.host.store.get(sha);
    return o && o.type === type ? o.data : null;
  }

  async readBlob(hash: string): Promise<Blob | null> {
    this.host.enter("readBlob");
    const d = this.object(hash, "blob");
    return d ? new Blob([d as Uint8Array<ArrayBuffer>]) : null;
  }

  async readTree(hash: string) {
    this.host.enter("readTree");
    if (hash === EMPTY_TREE) return [];
    const d = this.object(hash, "tree");
    if (!d) return null;
    return parseTree(d).map((e) => ({ name: e.name, mode: e.mode, hash: e.sha, type: e.mode === "40000" ? ("tree" as const) : ("blob" as const) }));
  }

  async readCommit(hash: string) {
    this.host.enter("readCommit");
    const d = this.object(hash, "commit");
    if (!d) return null;
    const c = parseCommit(d);
    // Decoded as the binding decodes it: identities split, times in seconds, one trailing newline removed.
    const who = (line: string) => {
      const m = /^(.*) <(.*)> (\d+) [+-]\d{4}$/.exec(line);
      return { name: m?.[1] ?? "", email: m?.[2] ?? "", at: Number(m?.[3] ?? 0) };
    };
    const a = who(c.author);
    const k = who(c.committer);
    return {
      hash,
      treeHash: c.tree,
      parents: [...c.parents],
      committedAt: k.at,
      authoredAt: a.at,
      message: c.message.endsWith("\n") ? c.message.slice(0, -1) : c.message,
      author: { name: a.name, email: a.email },
      committer: { name: k.name, email: k.email },
    };
  }

  /** First-parent history from a branch, ref or commit, newest first. */
  async log(opts: { ref?: string; limit?: number } = {}) {
    this.host.enter("log");
    const ref = opts.ref ?? "main";
    let at: string | undefined = this.refs.get(ref) ?? this.refs.get(`refs/heads/${ref}`) ?? (this.objects.has(ref) ? ref : undefined);
    const out: { hash: string; treeHash: string; parents: string[]; committedAt: number }[] = [];
    while (at && out.length < (opts.limit ?? 50)) {
      const d = this.object(at, "commit");
      if (!d) break;
      const c = parseCommit(d);
      out.push({ hash: at, treeHash: c.tree, parents: [...c.parents], committedAt: 0 });
      at = c.parents[0];
    }
    return out;
  }

  async fork(name: string, _opts?: { description?: string; readOnly?: boolean; defaultBranchOnly?: boolean }) {
    this.host.enter("fork");
    if (this.host.repos.has(name)) throw artifactsErrors.exists();
    const f = new FakeRepo(this.host, name, `artifacts:${this.host.namespace}/${this.name}`);
    for (const o of this.objects) f.objects.add(o);
    const main = this.refs.get("refs/heads/main");
    if (main) f.refs.set("refs/heads/main", main);
    this.host.repos.set(name, f);
    // A fork comes with its own 24-hour token, as Artifacts' does.
    const t = f.mint("write", 86_400);
    this.host.answer("fork");
    return { id: `repo_${name}`, name, description: null, defaultBranch: "main", remote: f.remote, token: t.plaintext };
  }

  [Symbol.dispose](): void {}

  // ------------------------------------------------------------ lane L's git remote (the log ref)

  async readObject(sha: Sha) {
    if (!this.objects.has(sha)) throw new Error(`object ${sha} not found`);
    return this.host.store.get(sha)!;
  }

  async readRef(ref: string): Promise<Sha | null> {
    const lost = this.host.log.pushedSinceRead;
    this.host.log.pushedSinceRead = false;
    if (lost && this.host.log.faults.lostReadReply > 0) {
      this.host.log.faults.lostReadReply--;
      throw new Error("the read-back reply was lost");
    }
    return this.refs.get(ref) ?? null;
  }

  async push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<LogPushOutcome> {
    const log = this.host.log;
    log.pushes++;
    log.pushedSinceRead = true;
    if (log.faults.failBeforePush > 0) {
      log.faults.failBeforePush--;
      return { ok: false, reason: "unknown", detail: "the connection failed before the update" };
    }
    const current = this.refs.get(ref) ?? null;
    if (current !== lease) return { ok: false, reason: "lease-mismatch", current };
    for (const o of objects) {
      if (gitObject(o.type, o.data).sha !== o.sha) throw new Error(`object ${o.sha} does not match its content`);
      this.host.store.set(o.sha, { type: o.type, data: o.data });
      this.objects.add(o.sha);
    }
    this.refs.set(ref, next);
    if (log.faults.lostPushReply > 0) {
      log.faults.lostPushReply--;
      return { ok: false, reason: "unknown", detail: "the push reply was lost" };
    }
    return { ok: true };
  }
}

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** Push controls for the sandbox: hold a push in flight, or make pushes fail without an answer. */
export interface PushControls {
  pausePush: boolean;
  /** Pushes that end with no answer (`unknown`): the pack may have been sent. */
  failPushes: number;
  /** Pushes that fail before anything is sent (`error`): nothing applied. */
  errorPushes: number;
  /** Pushes that apply, and whose report is then lost (`unknown`). */
  lostPushReports: number;
}

/**
 * The world a test room talks to: one Artifacts namespace, its canonical
 * repository, lane forks, the publisher sandbox and the log ref.
 */
export class FakeArtifactsHost {
  readonly store = new Map<string, { readonly type: ObjectType; readonly data: Uint8Array }>();
  readonly repos = new Map<string, FakeRepo>();
  namespace: string;
  /** The canonical repository's name in the namespace. */
  canonical = "";
  /** Calls made, by remote method. */
  readonly remoteCalls = new Map<string, number>();
  private readonly failures = new Map<string, Error[]>();
  private made = 0;
  /** The log ref's transport faults and counters (lane L's publisher runs over the canonical repo). */
  readonly log = {
    faults: { lostPushReply: 0, lostReadReply: 0, failBeforePush: 0 },
    pushes: 0,
    pushedSinceRead: false,
  };

  constructor(
    namespace: string,
    readonly now: () => number,
  ) {
    this.namespace = namespace;
  }

  private readonly hooks = new Map<string, (() => void)[]>();
  private readonly lost = new Map<string, number>();

  /** Count a call, run a planned hook, and throw a planned failure. */
  enter(method: string): void {
    this.remoteCalls.set(method, (this.remoteCalls.get(method) ?? 0) + 1);
    this.hooks.get(method)?.shift()?.();
    const planned = this.failures.get(method);
    if (planned?.length) throw planned.shift()!;
  }

  /** Clear every planned failure: the remote has recovered. */
  recover(): void {
    this.failures.clear();
  }

  /** Run `fn` when the next call of a remote method arrives, as something else happening meanwhile. */
  on(method: RemoteMethod, fn: () => void): void {
    this.hooks.set(method, [...(this.hooks.get(method) ?? []), fn]);
  }

  /** The next calls of a remote method apply, and then their answers are lost. */
  loseReply(method: RemoteMethod, count = 1): void {
    this.lost.set(method, (this.lost.get(method) ?? 0) + count);
  }

  /** After a call has applied: throw a lost answer, if one is planned. */
  answer(method: string): void {
    const n = this.lost.get(method) ?? 0;
    if (n > 0) {
      this.lost.set(method, n - 1);
      throw artifactsErrors.transport();
    }
  }

  /** Make the next calls of a remote method fail, in order. */
  failRemote(method: RemoteMethod, ...errors: Error[]): void {
    this.failures.set(method, [...(this.failures.get(method) ?? []), ...(errors.length ? errors : [artifactsErrors.transport()])]);
  }

  // ------------------------------------------------------------ the binding

  readonly binding = {
    create: async (name: string, _opts?: { readOnly?: boolean; description?: string; setDefaultBranch?: string }) => {
      this.enter("create");
      if (this.repos.has(name)) throw artifactsErrors.exists();
      const r = new FakeRepo(this, name, null);
      this.repos.set(name, r);
      if (!this.canonical) this.canonical = name;
      const t = r.mint("write", 86_400);
      return { id: `repo_${name}`, name, description: null, defaultBranch: "main", remote: r.remote, token: t.plaintext };
    },
    get: async (name: string): Promise<FakeRepo> => {
      this.enter("get");
      const r = this.repos.get(name);
      if (!r) throw artifactsErrors.notFound();
      return r;
    },
  };

  repo(name: string): FakeRepo {
    const r = this.repos.get(name);
    if (!r) throw new Error(`no repository ${name}`);
    return r;
  }

  /** The canonical repository, creating it (as an import would) if needed. */
  canonicalRepo(): FakeRepo {
    let r = this.repos.get(this.canonical);
    if (!r) this.repos.set(this.canonical, (r = new FakeRepo(this, this.canonical, null)));
    return r;
  }

  // ------------------------------------------------------------ git objects

  put(o: GitObject): Sha {
    this.store.set(o.sha, { type: o.type, data: o.data });
    return o.sha;
  }

  /** A commit's files: path to content. */
  files(commit: Sha): Map<RepoPath, string> {
    const out = new Map<RepoPath, string>();
    for (const [p, blob] of this.blobs(commit)) out.set(p, decoder.decode(this.store.get(blob)!.data));
    return out;
  }

  /** A commit's files: path to blob SHA. */
  blobs(commit: Sha): Map<RepoPath, Sha> {
    const out = new Map<RepoPath, Sha>();
    const walk = (tree: string, prefix: string) => {
      for (const e of parseTree(this.store.get(tree)!.data)) {
        const p = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.mode === "40000") walk(e.sha, p);
        else out.set(p, e.sha);
      }
    };
    const t = this.commit_(commit).tree;
    if (t !== EMPTY_TREE) walk(t, "");
    return out;
  }

  private commit_(sha: string) {
    const o = this.store.get(sha);
    if (!o || o.type !== "commit") throw new Error(`commit ${sha} not found`);
    return parseCommit(o.data);
  }

  parents(sha: Sha): readonly Sha[] {
    return this.commit_(sha).parents;
  }

  treeOf(sha: Sha): Sha {
    return this.commit_(sha).tree;
  }

  /** Every object a commit reaches. */
  closure(sha: Sha): Set<string> {
    const out = new Set<string>();
    const stack: string[] = [sha];
    while (stack.length) {
      const x = stack.pop()!;
      if (out.has(x)) continue;
      out.add(x);
      const o = this.store.get(x);
      if (!o) continue;
      if (o.type === "commit") {
        const c = parseCommit(o.data);
        stack.push(c.tree, ...c.parents);
      } else if (o.type === "tree") for (const e of parseTree(o.data)) stack.push(e.sha);
    }
    return out;
  }

  /** Write a commit of `files` (path to content) on `parents`. */
  writeCommit(parents: readonly Sha[], files: ReadonlyMap<RepoPath, string | Sha>, opts: { message?: string; at?: number; blobs?: boolean } = {}): Sha {
    const entries: Record<string, Uint8Array> = {};
    const blobByPath = new Map<string, Sha>();
    for (const [p, v] of files) {
      if (opts.blobs) blobByPath.set(p, v as Sha);
      else entries[p] = utf8(v);
    }
    let tree: Sha;
    if (opts.blobs) {
      // Build the tree from existing blobs: read their bytes back and rebuild.
      for (const [p, b] of blobByPath) entries[p] = this.store.get(b)!.data;
    }
    if (Object.keys(entries).length === 0) {
      this.put(gitObject("tree", new Uint8Array()));
      tree = EMPTY_TREE as Sha;
    } else {
      const built = buildTree(entries);
      for (const o of built.objects) this.put(o);
      tree = built.root;
    }
    const at = opts.at ?? 1_700_000_000 + this.made++;
    const who = `Test <test@example.invalid> ${at} +0000`;
    return this.put(gitObject("commit", encodeCommit({ tree, parents: [...parents], author: who, committer: who, message: opts.message ?? `commit ${at}\n` })));
  }

  // ------------------------------------------------------------ test helpers, as the old in-memory world had them

  /** Make a commit on `parents`. `changes` maps a path to new content, or to null to delete it. */
  commit(parents: Sha | null | readonly Sha[], changes: Readonly<Record<RepoPath, string | null>>): Sha {
    const ps = parents === null ? [] : typeof parents === "string" ? [parents] : [...parents];
    const files = new Map<RepoPath, string>(ps.length ? this.files(ps[0]!) : []);
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) files.delete(path);
      else files.set(path, content);
    }
    return this.writeCommit(ps, files);
  }

  /** Main on the canonical repository. Setting it gives the canonical repository the commit's objects. */
  get main(): Sha | null {
    return this.repos.get(this.canonical)?.refs.get("refs/heads/main") ?? null;
  }

  set main(sha: Sha | null) {
    const r = this.canonicalRepo();
    if (sha === null) r.refs.delete("refs/heads/main");
    else {
      for (const o of this.closure(sha)) r.objects.add(o);
      r.refs.set("refs/heads/main", sha);
    }
  }

  /** Push a commit to a lane's fork, as the holder's git client would. Creates the fork if needed. */
  push(lane: LaneId, head: Sha): void {
    const name = forkName(this.canonical, lane);
    let f = this.repos.get(name);
    if (!f) {
      const c = this.canonicalRepo();
      f = new FakeRepo(this, name, `artifacts:${this.namespace}/${this.canonical}`);
      for (const o of c.objects) f.objects.add(o);
      this.repos.set(name, f);
    }
    for (const o of this.closure(head)) f.objects.add(o);
    f.refs.set("refs/heads/main", head);
  }

  /** The canonical repository's refs (pinned heads, objects refs, integrations, the log). */
  get refs(): Map<string, Sha> {
    return this.canonicalRepo().refs;
  }

  /** The tree of a commit, as `commits.get(sha).tree` read it. */
  readonly commits = {
    get: (sha: Sha): { tree: Sha; parents: readonly Sha[] } | undefined => {
      const o = this.store.get(sha);
      if (!o || o.type !== "commit") return undefined;
      const c = parseCommit(o.data);
      return { tree: c.tree, parents: c.parents };
    },
  };

  ancestors(c: Sha): Set<Sha> {
    const out = new Set<Sha>();
    const stack = [c];
    while (stack.length) {
      const x = stack.pop()!;
      if (out.has(x)) continue;
      out.add(x);
      stack.push(...this.parents(x));
    }
    return out;
  }

  mergeBase(a: Sha, b: Sha): Sha | null {
    const as = this.ancestors(a);
    const queue = [b];
    const seen = new Set<Sha>();
    while (queue.length) {
      const x = queue.shift()!;
      if (seen.has(x)) continue;
      seen.add(x);
      if (as.has(x)) return x;
      queue.push(...this.parents(x));
    }
    return null;
  }

  /** A three-way merge of head onto main, by blob: the merged files, or the conflicting paths. */
  merge(main: Sha, head: Sha): { base: Sha; files: Map<RepoPath, Sha> } | { base: Sha; conflicts: RepoPath[] } {
    const base = this.mergeBase(main, head) ?? main;
    const b = this.blobs(base);
    const m = this.blobs(main);
    const h = this.blobs(head);
    const out = new Map(m);
    const conflicts: RepoPath[] = [];
    for (const p of new Set([...b.keys(), ...m.keys(), ...h.keys()])) {
      const bv = b.get(p) ?? null;
      const mv = m.get(p) ?? null;
      const hv = h.get(p) ?? null;
      if (mv === hv || hv === bv) continue;
      if (mv === bv) {
        if (hv === null) out.delete(p);
        else out.set(p, hv);
      } else conflicts.push(p);
    }
    return conflicts.length ? { base, conflicts: conflicts.sort() } : { base, files: out };
  }

  // ------------------------------------------------------------ the publisher sandbox

  /** Push controls: hold a push in flight, or make pushes end with no answer. */
  readonly controls: PushControls = { pausePush: false, failPushes: 0, errorPushes: 0, lostPushReports: 0 };

  private byRemote(remote: string): FakeRepo {
    for (const r of this.repos.values()) if (r.remote === remote) return r;
    throw new Error(`no repository at ${remote}`);
  }

  private authorized(access: { remote: string; token: string }, scope: "read" | "write"): FakeRepo {
    const r = this.byRemote(access.remote);
    if (!r.admits(access.token, scope)) throw new Error(`authentication failed for ${r.name}`);
    return r;
  }

  readonly stub: PublisherStub = {
    pinObjects: async (req): Promise<PinResult> => {
      this.enter("pinObjects");
      const fork = this.authorized(req.fork, "read");
      const canonical = this.authorized(req.canonical, "write");
      if (!fork.objects.has(req.head)) return { kind: "head-unknown" };
      const ref = `refs/artroom/objects/${req.head}`;
      const already = canonical.refs.get(ref) === req.head;
      for (const o of this.closure(req.head as Sha)) canonical.objects.add(o);
      canonical.refs.set(ref, req.head as Sha);
      return { kind: "pinned", already };
    },
    pinRef: async (req): Promise<PinResult> => {
      this.enter("pinRef");
      const canonical = this.authorized(req.canonical, "write");
      const existing = canonical.refs.get(req.ref);
      if (existing && existing !== req.head) return { kind: "conflict", observed: existing };
      if (!canonical.objects.has(req.head)) return { kind: "head-unknown" };
      canonical.refs.set(req.ref, req.head as Sha);
      return { kind: "pinned", already: existing === req.head };
    },
    preview: async (req): Promise<PreviewResult> => {
      this.enter("preview");
      const canonical = this.authorized(req.canonical, "read");
      const main = canonical.refs.get("refs/heads/main");
      if (!main) return { kind: "clean", base: req.head, tree: this.treeOf(req.head as Sha) };
      const m = this.merge(main, req.head as Sha);
      if ("conflicts" in m) return { kind: "conflict", base: m.base, paths: m.conflicts };
      const sha = this.writeCommit([main, req.head as Sha], m.files, { blobs: true, at: 0 });
      return { kind: "clean", base: m.base, tree: this.treeOf(sha) };
    },
    integrate: async (req): Promise<BuildResult> => {
      this.enter("integrate");
      const canonical = this.authorized(req.canonical, "write");
      const head = req.head as Sha;
      const main = req.expectedMain as Sha;
      let integration: Sha;
      let fastForward = false;
      if (this.ancestors(head).has(main)) {
        integration = head;
        fastForward = true;
      } else {
        const m = this.merge(main, head);
        if ("conflicts" in m) return { kind: "conflict", paths: m.conflicts };
        integration = this.writeCommit([main, head], m.files, { blobs: true, at: req.committedAt, message: req.message });
      }
      for (const o of this.closure(integration)) canonical.objects.add(o);
      canonical.refs.set(req.storeRef, integration);
      return { kind: "clean", integration, ref: req.storeRef, fastForward };
    },
    push: async (req): Promise<PushOutcome> => {
      this.enter("push");
      const canonical = this.authorized(req.canonical, "write");
      // Held in flight while the test says so. Polled, because a test's promise cannot be resolved inside the Durable Object.
      while (this.controls.pausePush) await new Promise((r) => setTimeout(r, 2));
      if (this.controls.errorPushes > 0) {
        this.controls.errorPushes--;
        return { outcome: "error", detail: "could not connect: nothing was sent" };
      }
      if (this.controls.failPushes > 0) {
        this.controls.failPushes--;
        return { outcome: "unknown", detail: "the push sent its pack and no report arrived" };
      }
      // The token is checked when the push is sent; a token revoked while the push was held does not stop it.
      const main = canonical.refs.get("refs/heads/main") ?? null;
      if (main === req.integration) return { outcome: "landed", detail: "already at the commit" };
      if (main !== req.expectedMain) return { outcome: "rejected", reason: "lease", detail: "stale info" };
      for (const o of this.closure(req.integration as Sha)) canonical.objects.add(o);
      canonical.refs.set("refs/heads/main", req.integration as Sha);
      if (this.controls.lostPushReports > 0) {
        this.controls.lostPushReports--;
        return { outcome: "unknown", detail: "the pack was sent and the connection dropped before the report" };
      }
      return { outcome: "landed", detail: "updated" };
    },
  };

  // ------------------------------------------------------------ the log ref

  /** The log ref on the canonical repository. */
  get logRef(): Sha | null {
    return this.canonicalRepo().refs.get("refs/artroom/log") ?? null;
  }

  set logRef(sha: Sha | null) {
    const r = this.canonicalRepo();
    if (sha === null) r.refs.delete("refs/artroom/log");
    else {
      for (const o of this.closure(sha)) r.objects.add(o);
      r.refs.set("refs/artroom/log", sha);
    }
  }

  /** Another writer moves the log ref. */
  foreignWrite(): Sha {
    const parent = this.logRef;
    const sha = this.writeCommit(parent ? [parent] : [], new Map([["foreign.txt", "not the room"]]));
    this.logRef = sha;
    return sha;
  }
}

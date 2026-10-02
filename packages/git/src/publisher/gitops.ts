/**
 * The git command sequences the publisher sandbox runs (R-EXEC-2). The same
 * code runs in the container (through `ctx.container.exec`) and in Node tests
 * (through `child_process`), so the tests exercise the real commands against
 * real git.
 *
 * Every invocation:
 * - takes an argument array, never a shell string (R-EXEC-6);
 * - runs with `core.hooksPath=/dev/null`, no fsmonitor, no system or global
 *   config, no attributes from the repository (`attr.tree` is the empty
 *   tree), and no credential helper. Nothing from the repository runs;
 * - works in bare repositories only, so no checkout, no clean or smudge
 *   filters, and no working-tree files are ever written.
 *
 * Remotes are URLs. In the container, git reaches Artifacts through the
 * gateway, which adds the token; no token is ever on a command line here.
 */

import { classifyGitPush, type PushOutcome } from "./push-outcome.ts";

export interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Runs one process. `env` is the complete environment apart from `PATH`: an
 * implementation must not add the caller's own environment to it.
 */
export type Exec = (
  argv: readonly string[],
  opts: { readonly cwd?: string; readonly env: Readonly<Record<string, string>>; readonly timeoutMs?: number },
) => Promise<ExecResult>;

export interface GitOpsOptions {
  readonly exec: Exec;
  /** Where bare repositories live, one per remote. */
  readonly workdir: string;
  /** Extra `-c` settings, for example the protocol allow-list. */
  readonly config?: readonly string[];
  /** Extra environment, for example `GIT_SSL_CAINFO`. */
  readonly env?: Readonly<Record<string, string>>;
  /** Per-command deadline. Default 120 s. */
  readonly timeoutMs?: number;
}

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const SHA = /^[0-9a-f]{40}$/;
const REF = /^refs\/[A-Za-z0-9._/-]{1,240}$/;

/** Settings on every git command. */
export const HARDENING: readonly string[] = [
  "core.hooksPath=/dev/null",
  "core.fsmonitor=false",
  "core.attributesFile=/dev/null",
  `attr.tree=${EMPTY_TREE}`,
  "credential.helper=",
  "gc.auto=0",
  "maintenance.auto=false",
  "fetch.recurseSubmodules=false",
  "submodule.recurse=false",
  "core.symlinks=false",
  "init.defaultBranch=main",
];

export function assertSha(value: string, what = "commit"): string {
  if (!SHA.test(value)) throw new Error(`${what} is not a 40-character SHA-1`);
  return value;
}

export function assertRef(value: string): string {
  if (!REF.test(value) || value.includes("..") || value.includes("//") || value.endsWith(".lock") || value.endsWith("/")) {
    throw new Error(`not an allowed ref name: ${value}`);
  }
  return value;
}

/** The ref a proposal generation is pinned at (R-PROP-1). */
export function pinnedRef(lane: string, generation: number): string {
  return assertRef(`refs/artroom/heads/${lane}/${generation}`);
}

/** The content-named ref that keeps a proposed head's objects in the canonical repo (R-PROP-1 step 1). */
export function objectsRef(head: string): string {
  return `refs/artroom/objects/${assertSha(head, "head")}`;
}

/** Where an integration commit is stored for checkers and for publication. */
export function integrationRef(op: string, attempt: number): string {
  return assertRef(`refs/artroom/integration/${op}/${attempt}`);
}

export type PreviewResult =
  | { readonly kind: "clean"; readonly base: string; readonly tree: string }
  | { readonly kind: "conflict"; readonly base: string; readonly paths: readonly string[] };

export type BuildResult =
  | { readonly kind: "clean"; readonly integration: string; readonly ref: string; readonly fastForward: boolean }
  | { readonly kind: "conflict"; readonly paths: readonly string[] };

export type PinResult = { readonly kind: "pinned"; readonly already: boolean } | { readonly kind: "head-unknown" } | { readonly kind: "conflict"; readonly observed: string };

/** What `integrate` needs. */
export interface IntegrateRequest {
    readonly canonical: string;
    readonly expectedMain: string;
    readonly head: string;
    readonly headRef: string;
    readonly storeRef: string;
    readonly message: string;
    readonly committedAt: number;
  }

/** One file of a snapshot: path, git mode and blob SHA (the order R-CARRY-9 digests). */
export type SnapshotFile = readonly [path: string, mode: string, blob: string];

/** The one ref of a snapshot repository (R-CARRY-16). */
export const SNAPSHOT_REF = "refs/artroom/snapshot";

/** Author and committer of every snapshot commit (R-CARRY-15, `SnapshotIdentity`). */
export const SNAPSHOT_AUTHOR = { name: "Artroom Snapshot", email: "snapshot@artroom.invalid" } as const;

const SNAPSHOT_ENV = {
  GIT_AUTHOR_NAME: SNAPSHOT_AUTHOR.name,
  GIT_AUTHOR_EMAIL: SNAPSHOT_AUTHOR.email,
  GIT_AUTHOR_DATE: "@0 +0000",
  GIT_COMMITTER_NAME: SNAPSHOT_AUTHOR.name,
  GIT_COMMITTER_EMAIL: SNAPSHOT_AUTHOR.email,
  GIT_COMMITTER_DATE: "@0 +0000",
};

export interface IntegrateHooks {
  /** Called with the new merge commit before it is pushed to `storeRef`, so the gateway can allow exactly that update. */
  readonly beforeStore?: (integration: string) => Promise<void>;
}

export class GitError extends Error {
  readonly step: string;
  readonly result: ExecResult;
  constructor(step: string, result: ExecResult) {
    super(`git ${step} failed (exit ${result.code}): ${result.stderr.slice(-400)}`);
    this.step = step;
    this.result = result;
  }
}

export class GitOps {
  private readonly env: Record<string, string>;
  private readonly opts: GitOpsOptions;
  constructor(opts: GitOpsOptions) {
    this.opts = opts;
    this.env = {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_ATTR_NOSYSTEM: "1",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: "/bin/false",
      HOME: "/nonexistent",
      LC_ALL: "C",
      GIT_AUTHOR_NAME: "artroom",
      GIT_AUTHOR_EMAIL: "room@artroom.invalid",
      GIT_COMMITTER_NAME: "artroom",
      GIT_COMMITTER_EMAIL: "room@artroom.invalid",
      ...opts.env,
    };
  }

  /** Run git with the hardening settings. */
  async git(args: readonly string[], extraEnv: Readonly<Record<string, string>> = {}): Promise<ExecResult> {
    const config = [...HARDENING, ...(this.opts.config ?? [])].flatMap((c) => ["-c", c]);
    return this.opts.exec(["git", ...config, ...args], {
      env: { ...this.env, ...extraEnv },
      timeoutMs: this.opts.timeoutMs ?? 120_000,
    });
  }

  private async ok(step: string, args: readonly string[], extraEnv?: Readonly<Record<string, string>>): Promise<string> {
    const r = await this.git(args, extraEnv);
    if (r.code !== 0) throw new GitError(step, r);
    return r.stdout.trim();
  }

  private readonly locks = new Map<string, Promise<unknown>>();

  /**
   * Run `fn` with the remote's bare repository to itself. Git commands on one
   * repository run one operation at a time, as in the container.
   */
  private exclusive<T>(remote: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(remote) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(remote, next.catch(() => undefined));
    return next;
  }

  /** The bare repository for a remote, created on first use. */
  async repo(remote: string): Promise<string> {
    const name = remote.replace(/^[a-z]+:\/\//, "").replace(/[^A-Za-z0-9._-]/g, "_").slice(-120);
    const dir = `${this.opts.workdir}/${name}`;
    const probe = await this.git(["-C", dir, "rev-parse", "--is-bare-repository"]);
    if (probe.code !== 0 || probe.stdout.trim() !== "true") await this.ok("init", ["init", "-q", "--bare", dir]);
    return dir;
  }

  /** Fetch refspecs from a remote into the local bare repo. */
  async fetch(dir: string, remote: string, refspecs: readonly string[]): Promise<void> {
    await this.ok("fetch", ["-C", dir, "fetch", "-q", "--no-tags", "--no-write-fetch-head", remote, ...refspecs]);
  }

  async revParse(dir: string, rev: string): Promise<string | null> {
    const r = await this.git(["-C", dir, "rev-parse", "--verify", "-q", `${rev}^{commit}`]);
    return r.code === 0 ? r.stdout.trim() : null;
  }

  async hasCommit(dir: string, sha: string): Promise<boolean> {
    return (await this.git(["-C", dir, "cat-file", "-e", `${assertSha(sha)}^{commit}`])).code === 0;
  }

  async isAncestor(dir: string, a: string, b: string): Promise<boolean> {
    const r = await this.git(["-C", dir, "merge-base", "--is-ancestor", assertSha(a), assertSha(b)]);
    if (r.code === 0) return true;
    if (r.code === 1) return false;
    throw new GitError("merge-base", r);
  }

  /** `git merge-tree --write-tree`: the merged tree, or the conflicting paths. */
  async mergeTree(dir: string, base: string, head: string): Promise<{ clean: true; tree: string } | { clean: false; paths: string[] }> {
    const r = await this.git(["-C", dir, "merge-tree", "--write-tree", "--name-only", "--no-messages", assertSha(base), assertSha(head)]);
    if (r.code !== 0 && r.code !== 1) throw new GitError("merge-tree", r);
    const lines = r.stdout.split("\n").filter(Boolean);
    const tree = assertSha(lines[0] ?? "", "tree");
    return r.code === 0 ? { clean: true, tree } : { clean: false, paths: [...new Set(lines.slice(1))].sort() };
  }

  /** Main of a remote, read with ls-remote. Null if it has no main. */
  async lsRemote(remote: string, ref: string): Promise<string | null> {
    const out = await this.ok("ls-remote", ["ls-remote", remote, assertRef(ref)]);
    const line = out.split("\n").find((l) => l.endsWith(`\t${ref}`));
    return line ? assertSha(line.slice(0, 40)) : null;
  }

  // ------------------------------------------------------------ pinning (R-PROP-1, R-PROP-2)

  /**
   * Step 1: copy a proposed head's objects from the lane's fork into the
   * canonical repo under `refs/artroom/objects/<head>`. Refuses a head that
   * no branch of the fork reaches.
   */
  pinObjects(fork: string, canonical: string, head: string): Promise<PinResult> {
    return this.exclusive(canonical, () => this.pinObjectsNow(fork, canonical, head));
  }

  private async pinObjectsNow(fork: string, canonical: string, head: string): Promise<PinResult> {
    assertSha(head, "head");
    const dir = await this.repo(canonical);
    const scratch = `refs/artroom-fork/${Math.random().toString(36).slice(2, 10)}`;
    try {
      await this.fetch(dir, fork, [`+refs/heads/*:${scratch}/*`]);
      const reach = await this.ok("for-each-ref", ["-C", dir, "for-each-ref", "--format=%(refname)", `--contains=${head}`, `${scratch}/`]).catch(
        () => "",
      );
      if (reach === "") return { kind: "head-unknown" };
      return await this.createRef(dir, canonical, head, objectsRef(head));
    } finally {
      const refs = await this.git(["-C", dir, "for-each-ref", "--format=%(refname)", `${scratch}/`]);
      for (const ref of refs.stdout.split("\n").filter(Boolean)) await this.git(["-C", dir, "update-ref", "-d", ref]);
    }
  }

  /** Step 2: create the pinned ref. It never moves: an existing ref at another commit is a conflict. */
  pinRef(canonical: string, ref: string, head: string): Promise<PinResult> {
    return this.exclusive(canonical, () => this.pinRefNow(canonical, ref, head));
  }

  private async pinRefNow(canonical: string, ref: string, head: string): Promise<PinResult> {
    const dir = await this.repo(canonical);
    if (!(await this.hasCommit(dir, head))) await this.fetch(dir, canonical, [`+${objectsRef(head)}:${objectsRef(head)}`]);
    return this.createRef(dir, canonical, head, assertRef(ref));
  }

  /** Push `sha` to a ref that must not exist yet; an existing ref at the same commit is fine. */
  private async createRef(dir: string, remote: string, sha: string, ref: string): Promise<PinResult> {
    const r = await this.git(["-C", dir, "push", "--porcelain", `--force-with-lease=${ref}:`, remote, `${assertSha(sha)}:${ref}`]);
    const outcome = classifyGitPush(r.code, r.stdout, r.stderr, ref);
    if (outcome.outcome === "landed") return { kind: "pinned", already: /\[up to date\]/.test(r.stdout) };
    const observed = await this.lsRemote(remote, ref);
    if (observed === sha) return { kind: "pinned", already: true };
    if (observed !== null) return { kind: "conflict", observed };
    throw new GitError(`push ${ref}`, r);
  }

  // ------------------------------------------------------------ preview and integration

  /** Fetch main and a pinned head from the canonical repo; return main's commit. */
  private async syncFor(canonical: string, head: string, headRef: string): Promise<{ dir: string; main: string }> {
    const dir = await this.repo(canonical);
    await this.fetch(dir, canonical, ["+refs/heads/main:refs/remotes/canonical/main", `+${assertRef(headRef)}:${headRef}`]);
    const main = await this.revParse(dir, "refs/remotes/canonical/main");
    if (!main) throw new Error("canonical main is missing");
    const got = await this.revParse(dir, headRef);
    if (got !== head) throw new Error(`${headRef} is ${got ?? "missing"}, not ${head}`);
    return { dir, main };
  }

  /** A merge preview of a pinned head against main (R-PROP-7). */
  preview(canonical: string, head: string, headRef: string): Promise<PreviewResult> {
    return this.exclusive(canonical, () => this.previewNow(canonical, head, headRef));
  }

  private async previewNow(canonical: string, head: string, headRef: string): Promise<PreviewResult> {
    const { dir, main } = await this.syncFor(canonical, head, headRef);
    const m = await this.mergeTree(dir, main, head);
    return m.clean ? { kind: "clean", base: main, tree: m.tree } : { kind: "conflict", base: main, paths: m.paths };
  }

  /**
   * Build the integration commit (R-LAND-4 step 1): `head` itself when it
   * fast-forwards `expectedMain`, otherwise a merge commit with parents
   * (expectedMain, head). The commit is deterministic for the same inputs and
   * `committedAt`, and is pushed to `storeRef` in the canonical repo so that
   * checkers and every later push use exactly this commit.
   */
  integrate(req: IntegrateRequest, hooks: IntegrateHooks = {}): Promise<BuildResult> {
    return this.exclusive(req.canonical, () => this.integrateNow(req, hooks));
  }

  private async integrateNow(req: IntegrateRequest, hooks: IntegrateHooks): Promise<BuildResult> {
    const { dir } = await this.syncFor(req.canonical, req.head, req.headRef);
    if (!(await this.hasCommit(dir, req.expectedMain))) {
      throw new Error(`expected main ${req.expectedMain} is not in the canonical repo`);
    }
    if (await this.isAncestor(dir, req.expectedMain, req.head)) {
      return { kind: "clean", integration: req.head, ref: req.headRef, fastForward: true };
    }
    const m = await this.mergeTree(dir, req.expectedMain, req.head);
    if (!m.clean) return { kind: "conflict", paths: m.paths };
    const date = `@${Math.floor(req.committedAt)} +0000`;
    const integration = assertSha(
      await this.ok(
        "commit-tree",
        ["-C", dir, "commit-tree", m.tree, "-p", assertSha(req.expectedMain), "-p", assertSha(req.head), "-m", req.message],
        { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      ),
      "integration",
    );
    await hooks.beforeStore?.(integration);
    const stored = await this.createRef(dir, req.canonical, integration, assertRef(req.storeRef));
    if (stored.kind !== "pinned") throw new Error(`could not store the integration at ${req.storeRef}`);
    return { kind: "clean", integration, ref: req.storeRef, fastForward: false };
  }

  // ------------------------------------------------------------ filtered snapshots (R-CARRY-15, R-CARRY-16)

  /** Every file in a commit's tree as `[path, mode, blob]`: regular files, executables and symlinks. */
  listTree(canonical: string, commit: string): Promise<SnapshotFile[]> {
    return this.exclusive(canonical, async () => {
      const dir = await this.repo(canonical);
      if (!(await this.hasCommit(dir, commit))) await this.fetch(dir, canonical, [assertSha(commit)]);
      const out = await this.ok("ls-tree", ["-C", dir, "ls-tree", "-r", "-z", "--full-tree", assertSha(commit)]);
      const files: SnapshotFile[] = [];
      for (const rec of out.split("\0").filter(Boolean)) {
        const tab = rec.indexOf("\t");
        const [mode, type, sha] = rec.slice(0, tab).split(" ");
        if (type !== "blob" || !mode || !sha) continue; // submodules (commit entries) are never included
        files.push([rec.slice(tab + 1), mode, assertSha(sha, "blob")]);
      }
      return files;
    });
  }

  /**
   * Write a filtered snapshot (R-CARRY-15, R-CARRY-16): the fixed commit
   * whose tree has exactly `files`, with no parent, author and committer
   * `SNAPSHOT_AUTHOR` at time 0, and the Room's `message`. It goes into
   * `store`, the snapshot's own new repository, at `SNAPSHOT_REF` only.
   *
   * `store` must be empty: a repository that already has any ref is refused
   * and nothing is pushed, so a repository is never given a second snapshot
   * or anything else. Pushing one commit into an empty repository sends
   * exactly that commit's closure: the commit, its trees and its blobs.
   */
  writeSnapshot(
    req: { readonly canonical: string; readonly store: string; readonly files: readonly SnapshotFile[]; readonly message: string },
    hooks: IntegrateHooks = {},
  ): Promise<string> {
    return this.exclusive(req.canonical, async () => {
      const dir = await this.repo(req.canonical);
      const index = `${dir}/snapshot-index-${Math.random().toString(36).slice(2, 10)}`;
      const env = { GIT_INDEX_FILE: index };
      try {
        await this.ok("read-tree", ["-C", dir, "read-tree", "--empty"], env);
        for (let i = 0; i < req.files.length; i += 200) {
          // `--cacheinfo mode,sha,path` splits at the first two commas, so a comma in a path is safe.
          const args = req.files.slice(i, i + 200).flatMap(([path, mode, blob]) => {
            if (!/^(100644|100755|120000)$/.test(mode)) throw new Error(`mode ${mode} cannot be in a snapshot`);
            return ["--add", "--cacheinfo", `${mode},${assertSha(blob, "blob")},${path}`];
          });
          await this.ok("update-index", ["-C", dir, "update-index", ...args], env);
        }
        const tree = assertSha(await this.ok("write-tree", ["-C", dir, "write-tree"], env), "tree");
        const commit = assertSha(await this.ok("commit-tree", ["-C", dir, "commit-tree", "--no-gpg-sign", tree, "-m", req.message], SNAPSHOT_ENV), "snapshot");
        const refs = await this.ok("ls-remote", ["ls-remote", req.store]);
        if (refs !== "") throw new Error("the snapshot repository is not empty; a snapshot is written only into a new, empty repository");
        await hooks.beforeStore?.(commit);
        const stored = await this.createRef(dir, req.store, commit, SNAPSHOT_REF);
        if (stored.kind !== "pinned") throw new Error(`could not store the snapshot at ${SNAPSHOT_REF}`);
        return commit;
      } finally {
        await this.opts.exec(["rm", "-f", index], { env: {} }).catch(() => undefined);
      }
    });
  }

  /**
   * Publish: compare-and-swap main from `expectedMain` to `integration`
   * (R-PUB-4). Fetches the integration from `integrationRef` if this sandbox
   * no longer has it. The outcome is landed, rejected, error or unknown.
   */
  pushMain(canonical: string, integration: string, expectedMain: string, fromRef: string): Promise<PushOutcome> {
    return this.exclusive(canonical, () => this.pushMainNow(canonical, integration, expectedMain, fromRef));
  }

  private async pushMainNow(canonical: string, integration: string, expectedMain: string, fromRef: string): Promise<PushOutcome> {
    // Anything that fails before `git push` runs sent nothing: `error`.
    let dir: string;
    try {
      dir = await this.repo(canonical);
      if (!(await this.hasCommit(dir, integration))) {
        await this.fetch(dir, canonical, [`+${assertRef(fromRef)}:${fromRef}`]);
        if (!(await this.hasCommit(dir, integration))) return { outcome: "error", detail: `integration ${integration} not found at ${fromRef}` };
      }
    } catch (e) {
      return { outcome: "error", detail: `before the push: ${e instanceof Error ? e.message : String(e)}`.slice(0, 600) };
    }
    const target = "refs/heads/main";
    const r = await this.git([
      "-C",
      dir,
      "push",
      "--porcelain",
      `--force-with-lease=${target}:${assertSha(expectedMain)}`,
      canonical,
      `${assertSha(integration)}:${target}`,
    ]);
    return classifyGitPush(r.code, r.stdout, r.stderr, target);
  }
}

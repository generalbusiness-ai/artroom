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
  opts: { readonly cwd?: string; readonly env: Readonly<Record<string, string>>; readonly timeoutMs?: number; readonly stdin?: Uint8Array },
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
  /**
   * A clean preview carries its integration commit: `head` itself when it
   * fast-forwards `base`, otherwise the merge commit, built by the same
   * planner as the landing, so a landing on the same main lands exactly this
   * commit. A merge commit is stored in the canonical repo at
   * `refs/artroom/objects/<integration>`.
   */
  | { readonly kind: "clean"; readonly base: string; readonly tree: string; readonly integration: string; readonly fastForward: boolean }
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
    /** For the commit message. The message and dates depend only on the inputs, so a rebuild is the same commit. */
    readonly lane: string;
    readonly generation: number;
  }

export interface IntegrateHooks {
  /** Called with the new merge commit before it is pushed to `storeRef`, so the gateway can allow exactly that update. */
  readonly beforeStore?: (integration: string) => Promise<void>;
}

/** The message of an integration commit. It names only the inputs, so preview and landing build the same commit. */
export function integrationMessage(lane: string, generation: number): string {
  return `Land ${lane} generation ${generation}\n`;
}

/** An object for `pushLog`: lane L's git object, without its SHA (git computes and checks it). */
export interface LogObject {
  readonly type: "blob" | "tree" | "commit";
  readonly data: Uint8Array;
}

/** The ref lane L publishes the log to (R-LOG-8). The only ref `pushLog` writes. */
export const LOG_REF = "refs/artroom/log";

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
  async git(args: readonly string[], extraEnv: Readonly<Record<string, string>> = {}, stdin?: Uint8Array): Promise<ExecResult> {
    const config = [...HARDENING, ...(this.opts.config ?? [])].flatMap((c) => ["-c", c]);
    return this.opts.exec(["git", ...config, ...args], {
      env: { ...this.env, ...extraEnv },
      timeoutMs: this.opts.timeoutMs ?? 120_000,
      ...(stdin ? { stdin } : {}),
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
  /**
   * Where lane L's log ref is on `canonical` (R-LOG-8), or null when it does
   * not exist. Read with `git ls-remote`, which sees refs outside
   * `refs/heads/` (the Artifacts binding's `log({ ref })` does not). Throws
   * when the remote cannot be read: unreadable is never reported as absent.
   */
  readLogRef(canonical: string, ref: string = LOG_REF): Promise<string | null> {
    if (ref !== LOG_REF) return Promise.reject(new Error(`readLogRef reads only ${LOG_REF}`));
    return this.lsRemote(canonical, LOG_REF);
  }

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
  /**
   * The one push: move `ref` on `remote` to `sha` under a lease (`lease`
   * null: the ref must not exist), and classify the answer (push-outcome.ts).
   * Pinning, staging, publication to main and the log all push through here.
   */
  private async pushWithLease(dir: string, remote: string, sha: string, ref: string, lease: string | null): Promise<PushOutcome> {
    const r = await this.git(["-C", dir, "push", "--porcelain", `--force-with-lease=${assertRef(ref)}:${lease === null ? "" : assertSha(lease, "lease")}`, remote, `${assertSha(sha)}:${ref}`]);
    return classifyGitPush(r.code, r.stdout, r.stderr, ref);
  }

  private async createRef(dir: string, remote: string, sha: string, ref: string): Promise<PinResult> {
    const outcome = await this.pushWithLease(dir, remote, sha, ref, null);
    if (outcome.outcome === "landed") return { kind: "pinned", already: /\[up to date\]/.test(outcome.detail) };
    const observed = await this.lsRemote(remote, ref);
    if (observed === sha) return { kind: "pinned", already: true };
    if (observed !== null) return { kind: "conflict", observed };
    throw new Error(`push ${ref} failed: ${outcome.outcome}: ${outcome.detail.slice(-300)}`);
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

  /** A merge preview of a pinned head against main (R-PROP-7), with its integration commit. */
  preview(canonical: string, head: string, headRef: string, lane: string, generation: number, hooks: IntegrateHooks = {}): Promise<PreviewResult> {
    return this.exclusive(canonical, () => this.previewNow(canonical, head, headRef, lane, generation, hooks));
  }

  private async previewNow(canonical: string, head: string, headRef: string, lane: string, generation: number, hooks: IntegrateHooks): Promise<PreviewResult> {
    const { dir, main } = await this.syncFor(canonical, head, headRef);
    const plan = await this.planIntegration(dir, main, head, lane, generation);
    if (plan.kind === "conflict") return { kind: "conflict", base: main, paths: plan.paths };
    if (!plan.fastForward) {
      await hooks.beforeStore?.(plan.integration);
      const stored = await this.createRef(dir, canonical, plan.integration, objectsRef(plan.integration));
      if (stored.kind !== "pinned") throw new Error(`could not store the previewed integration ${plan.integration}`);
    }
    return { kind: "clean", base: main, tree: plan.tree, integration: plan.integration, fastForward: plan.fastForward };
  }

  /**
   * The integration planner, shared by preview and landing (R-LAND-4 step 1,
   * R-PROP-7): `head` itself when it fast-forwards `base`; otherwise a merge
   * commit with parents (base, head), the merged tree, the message
   * `integrationMessage(lane, generation)`, and author and committer dates
   * equal to the later of the two parents' commit times. Every input of the
   * commit is fixed by (base, head, lane, generation), so the same inputs
   * always give the same commit.
   */
  private async planIntegration(
    dir: string,
    base: string,
    head: string,
    lane: string,
    generation: number,
  ): Promise<{ kind: "clean"; integration: string; tree: string; fastForward: boolean } | { kind: "conflict"; paths: string[] }> {
    if (await this.isAncestor(dir, base, head)) {
      return { kind: "clean", integration: head, tree: await this.ok("rev-parse", ["-C", dir, "rev-parse", `${assertSha(head)}^{tree}`]), fastForward: true };
    }
    const m = await this.mergeTree(dir, base, head);
    if (!m.clean) return { kind: "conflict", paths: m.paths };
    const times = (await this.ok("show", ["-C", dir, "show", "-s", "--format=%ct", assertSha(base), assertSha(head)])).split("\n").map(Number);
    const at = Math.max(...times.filter((t) => Number.isSafeInteger(t)));
    if (!Number.isSafeInteger(at)) throw new Error("could not read the parents' commit times");
    const date = `@${at} +0000`;
    const integration = assertSha(
      await this.ok("commit-tree", ["-C", dir, "commit-tree", m.tree, "-p", assertSha(base), "-p", assertSha(head), "-m", integrationMessage(lane, generation)], {
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      }),
      "integration",
    );
    return { kind: "clean", integration, tree: m.tree, fastForward: false };
  }

  /**
   * Build the integration commit (R-LAND-4 step 1): `head` itself when it
   * fast-forwards `expectedMain`, otherwise a merge commit with parents
   * (expectedMain, head), from the same planner as the preview. The commit is
   * deterministic for the same inputs, and is pushed to `storeRef` in the
   * canonical repo so that checkers and every later push use exactly it.
   */
  integrate(req: IntegrateRequest, hooks: IntegrateHooks = {}): Promise<BuildResult> {
    return this.exclusive(req.canonical, () => this.integrateNow(req, hooks));
  }

  private async integrateNow(req: IntegrateRequest, hooks: IntegrateHooks): Promise<BuildResult> {
    const { dir } = await this.syncFor(req.canonical, req.head, req.headRef);
    if (!(await this.hasCommit(dir, req.expectedMain))) {
      throw new Error(`expected main ${req.expectedMain} is not in the canonical repo`);
    }
    const plan = await this.planIntegration(dir, req.expectedMain, req.head, req.lane, req.generation);
    if (plan.kind === "conflict") return { kind: "conflict", paths: plan.paths };
    if (plan.fastForward) return { kind: "clean", integration: req.head, ref: req.headRef, fastForward: true };
    const integration = plan.integration;
    await hooks.beforeStore?.(integration);
    const stored = await this.createRef(dir, req.canonical, integration, assertRef(req.storeRef));
    if (stored.kind !== "pinned") throw new Error(`could not store the integration at ${req.storeRef}`);
    return { kind: "clean", integration, ref: req.storeRef, fastForward: false };
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
    return this.pushWithLease(dir, canonical, integration, "refs/heads/main", expectedMain);
  }

  // ------------------------------------------------------------ the log (lane L)

  /**
   * Push lane L's log commit to `refs/artroom/log` under a lease (R-LOG-8):
   * write the given objects, check that `next` is a commit whose only parent
   * is `lease` (none when `lease` is null) and whose whole history is
   * present, then push it with the lease. Returns the push outcome and, on a
   * lease refusal, where the ref is now. Anything that fails before the push
   * runs sent nothing (`error`).
   */
  pushLog(
    canonical: string,
    objects: readonly LogObject[],
    next: string,
    lease: string | null,
  ): Promise<{ readonly outcome: PushOutcome; readonly current?: string | null }> {
    return this.exclusive(canonical, async () => {
      const ref = LOG_REF;
      let dir: string;
      try {
        dir = await this.repo(canonical);
        assertSha(next, "next");
        // Where the ref is now. Fetching it also brings the parent's history, so only the new objects are sent.
        const current = await this.lsRemote(canonical, ref);
        if (current !== lease) return { outcome: { outcome: "rejected", reason: "lease", detail: `${ref} is at ${current ?? "nothing"}, not the lease` }, current };
        if (lease !== null) await this.fetch(dir, canonical, [`+${ref}:refs/artroom-remote/log`]);
        for (const o of objects) {
          if (o.type !== "blob" && o.type !== "tree" && o.type !== "commit") throw new Error("not a git object type");
          const w = await this.git(["-C", dir, "hash-object", "-w", "-t", o.type, "--stdin"], {}, o.data);
          if (w.code !== 0) throw new GitError("hash-object", w);
        }
        // The exact type first: rev-list accepts a tree or blob with an empty answer, which would pass as "no parent".
        const type = await this.git(["-C", dir, "cat-file", "-t", next]);
        if (type.code !== 0 || type.stdout.trim() !== "commit") throw new Error(`${next} is not a commit`);
        const parents = (await this.ok("rev-list", ["-C", dir, "rev-list", "--parents", "-n", "1", next])).split(" ").slice(1);
        if (parents.join(" ") !== (lease ?? "")) throw new Error(`${next} does not have exactly the lease as its parent`);
        const connected = await this.git(["-C", dir, "rev-list", "--objects", next]);
        if (connected.code !== 0) throw new Error(`objects reachable from ${next} are missing`);
      } catch (e) {
        return { outcome: { outcome: "error", detail: `before the push: ${e instanceof Error ? e.message : String(e)}`.slice(0, 600) } };
      }
      const outcome = await this.pushWithLease(dir, canonical, next, ref, lease);
      if (outcome.outcome === "rejected" && outcome.reason === "lease") {
        const current = await this.lsRemote(canonical, ref).catch(() => undefined);
        return current === undefined ? { outcome } : { outcome, current };
      }
      return { outcome };
    });
  }
}

/**
 * The Git commands of the publisher and the stager (authority note, sections
 * 6.2, 6.5, 6.6, 6.10 and 12.2): a read of a ref, a list of refs, a fetch,
 * and the one send. It is the reviewed successor of the earlier publisher's
 * `gitops.ts` (`notes/2026-10-05-i3-git-review.md`, section 3).
 *
 * **Every send is one compare-and-set of one ref** (section 6.6): move this
 * ref from this old value to this new one. A ref that must not exist yet has
 * the old value null, and a delete has the new value null. One refspec is
 * sent, with the expected old value, and nothing is forced past it.
 *
 * **A send checks what it sends, before it sends.** The earlier push of the
 * branch checked nothing about its commit. Here, before the push command
 * runs:
 *
 * - the commit is read by the reviewed reader: its exact type is `commit`
 *   (a tag does not pass), its bytes hash to its ID, its tree is a tree and
 *   every parent is a commit;
 * - its tree is the tree the caller states, and its first parent is the
 *   parent the caller states;
 * - every object that the push would send is in the local repository: the
 *   objects reachable from the commit and not from what the host is known
 *   to hold, each by its own ID;
 * - its tree holds no gitlink.
 *
 * A check that fails sends nothing, and says which check.
 *
 * **Nothing here sends twice.** A send runs the push command once and
 * returns what it told. It never retries, whatever the answer. A lost reply
 * is the caller's `unknown` (`push-outcome.ts`).
 *
 * No token is in any argument, environment or URL here: the gateway adds it
 * to the request it forwards (section 5.3).
 */

import { hex } from "@generalbusiness/artroom-bytes";
import { sha1 } from "@noble/hashes/legacy.js";
import { GitRefusal, branchRef, objectId, refName, remoteUrl, type ObjectId } from "./names.ts";
import { GitFailure, directory, repositorySource, type GitProgram } from "./program.ts";
import { NOT_RUN, readAnswer, type PushAnswer, type ReadBack } from "./push-outcome.ts";
import { READ_BOUNDS, Reader, type GitSource, type ReadBounds } from "./reader.ts";

/** The most objects that one send may carry. A stated constant of this package (I3 deltas, entry EG3). */
export const SEND_OBJECTS = 100_000;

/** One compare-and-set of one ref at a remote. `old` null: the ref must not exist. `new` null: delete it. */
export interface RefUpdate { remote: string; ref: string; old: ObjectId | null; new: ObjectId | null }

export interface SendRequest extends RefUpdate {
  /** What the commit must be, when the caller's record states it. `firstParent` null: the commit has no parent. */
  expect?: { tree?: ObjectId; firstParent?: ObjectId | null };
  /** Commits that the host is known to hold whole, such as the branch's head as read. What is reachable from them is not sent, and not checked. */
  have?: readonly ObjectId[];
  /** A ref of the same remote that holds the commit, such as its staged ref. It is fetched when the commit is not here. */
  from?: string;
}

/** A publication's send: the destination's branch, from the reserved base to the reviewed commit, whose tree the destination's row states (section 6.5). */
export interface Publication { remote: string; branch: string; base: ObjectId; commit: ObjectId; tree: ObjectId; from: string }

export interface GitOptions {
  /** A directory of this process's own, where one bare repository for each remote lives. An absolute path. */
  workdir: string;
  bounds?: ReadBounds;
  /** The most objects of one send. */
  sendObjects?: number;
  /** The host's refusal codes (`readAnswer`). */
  refusals?: readonly string[];
}

const text = new TextEncoder();

export class Git {
  readonly #git: GitProgram;
  readonly #workdir: string;
  readonly #bounds: ReadBounds;
  readonly #sendObjects: number;
  readonly #refusals: readonly string[];
  readonly #locks = new Map<string, Promise<unknown>>();

  constructor(program: GitProgram, options: GitOptions) {
    this.#git = program;
    this.#workdir = directory(options.workdir);
    this.#bounds = options.bounds ?? READ_BOUNDS;
    this.#sendObjects = options.sendObjects ?? SEND_OBJECTS;
    this.#refusals = options.refusals ?? [];
  }

  #remote(remote: string): string {
    return remoteUrl(remote, this.#git.transport);
  }

  /** One operation at a time on the local repository of one remote. */
  #exclusive<T>(remote: string, run: () => Promise<T>): Promise<T> {
    const next = (this.#locks.get(remote) ?? Promise.resolve()).then(run, run);
    this.#locks.set(remote, next.catch(() => undefined));
    return next;
  }

  /** The local bare repository for a remote, made on first use. Its name is a hash of the remote, so two remotes never share one. */
  async repository(remote: string): Promise<string> {
    const dir = `${this.#workdir}/${hex(sha1(text.encode(this.#remote(remote))))}.git`;
    const probe = await this.#git.run(["-C", dir, "rev-parse", "--is-bare-repository"]);
    if (probe.code !== 0 || new TextDecoder().decode(probe.stdout).trim() !== "true") await this.#git.ok("init", ["init", "-q", "--bare", "--", dir]);
    return dir;
  }

  /** The refs of a remote that match one pattern, read from the remote itself. A remote that cannot be read is a failure, never an empty list. */
  async #lsRemote(remote: string, pattern: string): Promise<{ ref: string; target: string }[]> {
    const out = await this.#git.ok("ls-remote", ["ls-remote", "--", this.#remote(remote), pattern]);
    return out.split("\n").filter((l) => l !== "").map((l) => ({ target: l.slice(0, l.indexOf("\t")), ref: l.slice(l.indexOf("\t") + 1) }));
  }

  /**
   * The value of one ref at the remote now, or null when the remote answers
   * and has no such ref. This is the read that decides (section 6.6, step 6;
   * section 6.10). It rejects when the remote cannot be read: "the read
   * failed" decides nothing.
   */
  async readRef(remote: string, ref: string): Promise<ReadBack> {
    const name = refName(ref, "ref");
    const line = (await this.#lsRemote(remote, name)).find((l) => l.ref === name);
    return { ref: name, value: line === undefined ? null : objectId(line.target, "ref") };
  }

  /**
   * The reader's source for a remote: refs from the remote itself, and
   * objects from the local repository, where a fetch put them and checked
   * each. The reader checks everything again.
   */
  source(remote: string): GitSource {
    this.#remote(remote);
    return {
      object: async (id, limit) => repositorySource(this.#git, await this.repository(remote)).object(id, limit),
      ref: async (name) => (await this.readRef(remote, name)).value,
      refs: async (prefix, limit) => {
        refName(`${prefix}x`, "prefix");
        return (await this.#lsRemote(remote, `${prefix}*`)).filter((l) => l.ref.startsWith(prefix)).slice(0, limit + 1);
      },
    };
  }

  /** Fetch refs of the remote into the local repository, each under its own name. Every received object is checked by Git as it arrives. */
  fetch(remote: string, refs: readonly string[]): Promise<void> {
    return this.#exclusive(remote, async () => this.#fetch(await this.repository(remote), remote, refs));
  }

  async #fetch(dir: string, remote: string, refs: readonly string[]): Promise<void> {
    const specs = refs.map((ref) => `+${refName(ref, "ref")}:${ref}`);
    await this.#git.ok("fetch", ["-C", dir, "fetch", "-q", "--no-tags", "--no-write-fetch-head", "--", this.#remote(remote), ...specs]);
  }

  /**
   * Whether commit `a` is `b` or an ancestor of `b`, in the local repository of the remote (section 6.5: "each selected report's
   * commit is its ancestor"). Both must be commits that are here. Git's two answers are its exit codes 0 and 1. Any other end is a
   * failure, and never "no".
   */
  isAncestor(remote: string, a: ObjectId, b: ObjectId): Promise<boolean> {
    return this.#exclusive(remote, async () => {
      const r = await this.#git.run(["-C", await this.repository(remote), "merge-base", "--is-ancestor", objectId(a, "ancestor"), objectId(b, "descendant")]);
      if (r.timedOut || (r.code !== 0 && r.code !== 1)) throw new GitFailure("merge-base", r);
      return r.code === 0;
    });
  }

  /** The checks on what a send carries. Each refusal names its check. */
  async #check(dir: string, commit: ObjectId, request: SendRequest): Promise<void> {
    const reader = new Reader(repositorySource(this.#git, dir), this.#bounds);
    // The exact type, the hash, the tree as a tree, and every parent as a commit.
    const read = await reader.linked(commit, "commit");
    const expect = request.expect ?? {};
    if (expect.tree !== undefined && read.tree !== expect.tree) throw new GitRefusal("tree-mismatch", "commit");
    if (expect.firstParent !== undefined && (expect.firstParent === null ? read.parents.length !== 0 : read.parents[0] !== expect.firstParent)) throw new GitRefusal("parent-mismatch", "commit");

    // What the push would send: everything reachable from the commit and not from what the host holds. `rev-list` reads each commit and tree on the way, and names each blob without reading it, so each ID is then asked for by itself.
    const have = (request.have ?? []).map((id) => objectId(id, "have"));
    const listed = await this.#git.run(["-C", dir, "rev-list", "--objects", "--no-object-names", commit, ...(have.length > 0 ? ["--not", ...have] : [])]);
    if (listed.code !== 0 || listed.timedOut) throw new GitRefusal("incomplete", "commit");
    const ids = new TextDecoder().decode(listed.stdout).split("\n").filter((l) => l !== "");
    if (ids.length > this.#sendObjects) throw new GitRefusal("too-large", "commit");
    for (const id of ids) objectId(id, "object");
    const present = await this.#git.ok("cat-file", ["-C", dir, "cat-file", "--batch-check"], text.encode(ids.map((id) => `${id}\n`).join("")));
    const lines = present.split("\n").filter((l) => l !== "");
    if (lines.length !== ids.length || lines.some((l, i) => !new RegExp(`^${ids[i]} (commit|tree|blob|tag) [0-9]+$`).test(l))) throw new GitRefusal("incomplete", "commit");

    // A gitlink names a commit of another repository, which no push carries (I3 deltas, entry EG5).
    const entries = await this.#git.ok("ls-tree", ["-C", dir, "ls-tree", "-r", "-z", "--full-tree", commit]);
    if (entries.split("\0").some((e) => e.startsWith("160000 "))) throw new GitRefusal("gitlink", "commit");
  }

  /**
   * One compare-and-set of one ref, sent once. The answer says what the push
   * told, and nothing here judges it: `classifySend` does, with the
   * gateway's record. A check that fails before the push runs gives
   * `ran: false` with its reason. This never throws for a refusal and never
   * sends again.
   */
  send(request: SendRequest): Promise<PushAnswer> {
    try {
      this.#remote(request.remote);
    } catch (e) {
      return Promise.resolve(NOT_RUN(e instanceof GitRefusal ? e.reason : "bad-remote"));
    }
    return this.#exclusive(request.remote, async () => {
      let args: string[];
      let ref: string;
      try {
        ref = refName(request.ref, "ref");
        const old = request.old === null ? null : objectId(request.old, "old");
        const next = request.new === null ? null : objectId(request.new, "new");
        if (old === next) throw new GitRefusal("same-commit", "new");
        if (request.from !== undefined) refName(request.from, "from");
        if (request.expect?.tree !== undefined) objectId(request.expect.tree, "tree");
        if (request.expect?.firstParent != null) objectId(request.expect.firstParent, "first parent");
        const dir = await this.repository(request.remote);
        if (next !== null) {
          const here = await this.#git.run(["-C", dir, "cat-file", "-e", next]);
          if (here.code !== 0 && request.from !== undefined) await this.#fetch(dir, request.remote, [request.from]);
          await this.#check(dir, next, request);
        }
        args = ["-C", dir, "push", "--porcelain", "--no-verify", `--force-with-lease=${ref}:${old ?? ""}`, "--", request.remote, `${next ?? ""}:${ref}`];
      } catch (e) {
        // Anything that fails before the push command runs sent nothing. A command that failed is no more than that.
        if (e instanceof GitRefusal) return NOT_RUN(e.reason);
        if (e instanceof GitFailure) return NOT_RUN("unreadable");
        throw e;
      }
      const result = await this.#git.run(args);
      const decode = new TextDecoder();
      return readAnswer({ code: result.code, stdout: decode.decode(result.stdout), stderr: decode.decode(result.stderr), timedOut: result.timedOut }, ref, this.#refusals);
    });
  }

  /**
   * The publication's send (sections 6.5 and 6.6). What it enforces, each
   * before anything is sent:
   *
   * - the published ref is a branch, and it is the one ref of the one
   *   refspec: `not-a-branch`, `bad-ref-name`;
   * - the commit is the reviewed one: that exact commit ID, read as a
   *   commit, with the tree that the destination's row states:
   *   `wrong-type`, `hash-mismatch`, `tree-mismatch`;
   * - its first parent is the reserved base: `parent-mismatch`. The same
   *   base is the expected old value of the compare-and-set, so the host
   *   refuses the update when the branch holds anything else (section 12,
   *   H1);
   * - its closure above the base is whole: `incomplete`.
   */
  publish(p: Publication): Promise<PushAnswer> {
    try {
      branchRef(p.branch, "branch");
    } catch (e) {
      return Promise.resolve(NOT_RUN(e instanceof GitRefusal ? e.reason : "bad-ref-name"));
    }
    return this.send({ remote: p.remote, ref: p.branch, old: p.base, new: p.commit, expect: { tree: p.tree, firstParent: p.base }, have: [p.base], from: p.from });
  }
}

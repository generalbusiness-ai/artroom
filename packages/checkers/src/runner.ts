/**
 * The runner's checkout, and the steps of one run (authority note, sections
 * 3.11 and 11; proof plan, key O15). It is the reviewed successor of the
 * earlier runner (`notes/2026-10-05-i3-checkers-review.md`, section 2).
 *
 * **The checkout checks the commit, its tree and its parents against the
 * job, before anything of the tree runs.** The earlier checkout compared the
 * name of `HEAD` and of its tree with the job, and never read a parent.
 * Here, in this order:
 *
 * 1. Every value is checked inside `checkout`, before it is an argument:
 *    the remote, the directory, and the three object IDs. An end-of-options
 *    mark stands before every remote and revision.
 * 2. The commit is fetched by its ID, with its parents, into a new
 *    repository. Git checks every object as it arrives.
 * 3. The commit is read by the reviewed reader: its exact type is `commit`,
 *    so a tag does not pass; its bytes hash to its ID; its tree is read as
 *    a tree, and each parent as a commit.
 * 4. Its tree is the job's tree, and its first parent is the job's base:
 *    `tree-mismatch`, `parent-mismatch`.
 * 5. Its closure is whole, object by object, down to its parents, and holds
 *    no gitlink: `Reader.closure`.
 * 6. Only then is the tree checked out. What is checked out is confirmed
 *    again, by two commands whose exit codes are both read: the commit that
 *    `HEAD` names, and the tree that the index writes.
 *
 * A check that fails gives `confirmed: false` with a fixed word, and no
 * step runs. A refusal never holds a program's output, a URL or a host's
 * text.
 *
 * **What a runner may read and write.** It reads one repository, through
 * its gateway, with the job's read token, which the gateway holds
 * (`sandbox.ts`). It reads and writes its own container's files. It writes
 * nothing outside the container: it holds no write token, no signing key
 * and no address but its gateway's. What it returns is data.
 *
 * `runSteps` is the order of the steps, as a function over the caller's
 * `StepExec`. Nothing here starts a container: a real runner needs a
 * deployment, and none is run (plan question Q8).
 */

import { GitFailure, GitProgram, GitRefusal, READ_BOUNDS, Reader, idOf, isObjectId, objectId, remoteUrl, repositorySource, snapshotFiles, type GitReason, type ObjectId, type ReadBounds } from "@generalbusiness/artroom-git";
import type { Configuration, Variable } from "./configuration.ts";
import type { StepReport } from "./outcome.ts";

/** What the checkout is held to: the job's commit, its tree and its base, as the service read them from the lane (`job.ts`). */
export interface CheckoutAsk {
  /** The repository to read: a URL with no credential, or, for a `local` program, a path on this machine. */
  remote: string;
  /** A new directory of the run's own: an absolute path. The work tree is made there. */
  dir: string;
  commit: ObjectId;
  tree: ObjectId;
  /** The commit's first parent. */
  base: ObjectId;
}

export type CheckoutReason = GitReason | "bad-directory" | "fetch-failed" | "checkout-failed" | "not-as-fetched";
export type Checkout = { confirmed: true; commit: ObjectId; tree: ObjectId; parents: readonly ObjectId[] } | { confirmed: false; reason: CheckoutReason };

const text = new TextDecoder();

/** An absolute path with no control character and no part that is `.` or `..`: it is never read as an option, and never leaves its place. */
const isDirectory = (dir: unknown): dir is string => typeof dir === "string" && dir.startsWith("/") && !/[\u0000-\u001f\u007f]/.test(dir) && !dir.split("/").some((part) => part === "." || part === "..");

export async function checkout(git: GitProgram, ask: CheckoutAsk, bounds?: ReadBounds): Promise<Checkout> {
  const no = (reason: CheckoutReason): Checkout => ({ confirmed: false, reason });
  let remote: string;
  let commit: ObjectId;
  let tree: ObjectId;
  let base: ObjectId;
  try {
    // 1. Checked here, whatever a caller checked before.
    remote = remoteUrl(ask.remote, git.transport);
    commit = objectId(ask.commit, "commit");
    tree = objectId(ask.tree, "tree");
    base = objectId(ask.base, "base");
  } catch (e) {
    return no(e instanceof GitRefusal ? e.reason : "bad-remote");
  }
  if (!isDirectory(ask.dir)) return no("bad-directory");
  const at = ["-C", ask.dir];
  try {
    await git.ok("init", ["init", "-q", "--", ask.dir]);
    // 2. The commit and its parents, by the commit's ID. No tag, no ref and no `FETCH_HEAD` is written: nothing is later read by a name that the remote chose.
    const fetched = await git.run([...at, "fetch", "-q", "--no-tags", "--no-write-fetch-head", "--depth=2", "--", remote, commit]);
    if (fetched.code !== 0 || fetched.timedOut) return no("fetch-failed");
    // 3 to 5. Read by the reviewed reader, from what the fetch stored.
    const reader = new Reader(repositorySource(git, ask.dir), bounds);
    const read = await reader.linked(commit, "commit");
    if (read.tree !== tree) return no("tree-mismatch");
    if (read.parents[0] !== base) return no("parent-mismatch");
    const closure = await reader.closure(commit, new Set(read.parents));
    if (!closure.complete) return no(closure.reason);
    // 6. The work tree, and then what it is, by two commands. Both exit codes are read.
    const out = await git.run([...at, "checkout", "-q", "--detach", "--end-of-options", commit, "--"]);
    if (out.code !== 0 || out.timedOut) return no("checkout-failed");
    const head = await git.run([...at, "rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"]);
    const written = await git.run([...at, "write-tree"]);
    if (head.code !== 0 || head.timedOut || written.code !== 0 || written.timedOut) return no("checkout-failed");
    if (text.decode(head.stdout).trim() !== commit || text.decode(written.stdout).trim() !== tree) return no("not-as-fetched");
    return { confirmed: true, commit, tree, parents: read.parents.filter(isObjectId) };
  } catch (e) {
    if (e instanceof GitRefusal) return no(e.reason);
    if (e instanceof GitFailure) return no("unreadable");
    throw e;
  }
}

/** Immutable reservation objects, including the base's complete closure. No remote or public ref is involved. */
export interface CheckoutObjectsAsk {
  /** A nonexistent leaf below a private, owned directory of this run. */
  dir: string;
  commit: ObjectId;
  tree: ObjectId;
  base: ObjectId;
  objects: readonly { id: string; type: "blob" | "tree" | "commit"; data: Uint8Array }[];
}

/**
 * A Node/container checkout from the reservation's verified object overlay.
 * Validation and byte copying finish before any directory or object is written.
 * The reader currently supports SHA-1 only; SHA-256 receives its named refusal.
 */
export async function checkoutObjects(git: GitProgram, ask: CheckoutObjectsAsk, bounds: ReadBounds = READ_BOUNDS): Promise<Checkout> {
  const no = (reason: CheckoutReason): Checkout => ({ confirmed: false, reason });
  if (!isDirectory(ask.dir)) return no("bad-directory");
  try {
    const commit = objectId(ask.commit, "commit");
    const tree = objectId(ask.tree, "tree");
    const base = objectId(ask.base, "base");
    // Each allocation is bounded before copying. The total is bounded by the
    // object count and these existing per-type limits; no new budget is invented.
    const limits: ReadBounds = { ...bounds };
    if ([limits.commitBytes, limits.parents, limits.treeBytes, limits.blobBytes, limits.closureObjects, limits.refs].some((n) => !Number.isSafeInteger(n) || n < 0)) return no("too-large");
    if (!Array.isArray(ask.objects) || ask.objects.length > limits.closureObjects) return no("too-large");
    const objects = new Map<ObjectId, { type: "blob" | "tree" | "commit"; data: Uint8Array }>();
    for (const supplied of ask.objects) {
      if (supplied === null || typeof supplied !== "object") return no("wrong-type");
      const id = objectId(supplied.id, "object");
      if (supplied.type !== "blob" && supplied.type !== "tree" && supplied.type !== "commit") return no("wrong-type");
      if (!(supplied.data instanceof Uint8Array)) return no("wrong-size");
      const limit = supplied.type === "blob" ? limits.blobBytes : supplied.type === "tree" ? limits.treeBytes : limits.commitBytes;
      if (supplied.data.length > limit) return no("too-large");
      const data = Uint8Array.from(supplied.data);
      if (idOf(supplied.type, data) !== id) return no("hash-mismatch");
      if (objects.has(id)) return no("incomplete");
      objects.set(id, { type: supplied.type, data });
    }
    const reached = new Set<ObjectId>();
    const reader = new Reader({
      object: async (id) => {
        const stored = objects.get(id);
        if (!stored) return null;
        reached.add(id);
        return { type: stored.type, size: stored.data.length, data: stored.data };
      },
      ref: async () => null,
      refs: async () => [],
    }, limits);
    const read = await reader.linked(commit);
    if (read.tree !== tree) return no("tree-mismatch");
    if (read.parents[0] !== base) return no("parent-mismatch");
    const closure = await reader.closure(commit);
    if (!closure.complete) return no(closure.reason);
    if (reached.size !== objects.size) return no("incomplete");
    // Git's checkout and the reader must agree about every path, including
    // names such as .git and control bytes that Git would refuse to write.
    await snapshotFiles(reader, tree, () => true);

    // Node is used only at this private checkout boundary. Resolve the parent
    // once, require ownership and privacy, and create the leaf exclusively:
    // an existing repository, file or symlink is never initialized or changed.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    let dir: string;
    try {
      const parent = await fs.realpath(path.dirname(ask.dir));
      const stat = await fs.stat(parent);
      if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) return no("bad-directory");
      dir = path.join(parent, path.basename(ask.dir));
      await fs.mkdir(dir, { mode: 0o700 });
    } catch {
      return no("bad-directory");
    }
    const at = ["-C", dir];
    await git.ok("init", ["init", "-q", "--object-format=sha1", "--template=", "--", dir]);
    for (const [id, stored] of objects) {
      const written = await git.ok("hash-object", [...at, "hash-object", "-w", "--no-filters", "-t", stored.type, "--stdin"], stored.data);
      if (written.trim() !== id) return no("hash-mismatch");
    }
    const out = await git.run([...at, "checkout", "-q", "--detach", "--end-of-options", commit, "--"]);
    if (out.code !== 0 || out.timedOut) return no("checkout-failed");
    const head = await git.ok("rev-parse", [...at, "rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"]);
    const written = await git.ok("write-tree", [...at, "write-tree"]);
    if (head.trim() !== commit || written.trim() !== tree) return no("not-as-fetched");
    return { confirmed: true, commit, tree, parents: read.parents };
  } catch (e) {
    if (e instanceof GitRefusal) return no(e.reason);
    if (e instanceof GitFailure) return no("unreadable");
    throw e;
  }
}

/** Runs one step in the run's work tree, with exactly these variables, inside the run's limits. It resolves with the step's status and its last line. `status` null: the step did not end. */
export type StepExec = (argv: readonly string[], opts: { cwd: string; env: readonly Variable[]; secondsLeft: number; outputBytesLeft: number }) => Promise<StepReport & { seconds: number; outputBytes: number }>;

/**
 * The steps of a configuration, in order, in a confirmed checkout. A step
 * that does not end with status 0 stops the run: no later step runs, and
 * the judging step is the last. Each step gets what is left of the
 * configuration's limits, and a run that passes one ends there.
 *
 * Every step is started with the configuration's variables and with no
 * other (section 3.11, "The environment is part of what ran").
 */
export async function runSteps(exec: StepExec, configuration: Configuration, dir: string): Promise<{ steps: StepReport[]; end: "complete" | "limits" }> {
  const steps: StepReport[] = [];
  let seconds = configuration.limits.seconds;
  let bytes = configuration.limits.outputBytes;
  for (const argv of configuration.steps) {
    if (seconds <= 0 || bytes <= 0) return { steps, end: "limits" };
    const done = await exec(argv, { cwd: dir, env: configuration.environment, secondsLeft: seconds, outputBytesLeft: bytes });
    seconds -= done.seconds;
    bytes -= done.outputBytes;
    steps.push({ status: done.status, line: done.line });
    if (seconds < 0 || bytes < 0) return { steps, end: "limits" };
    if (done.status !== 0) break;
  }
  return { steps, end: "complete" };
}

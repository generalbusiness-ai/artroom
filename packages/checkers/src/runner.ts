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

import { GitFailure, GitProgram, GitRefusal, Reader, isObjectId, objectId, remoteUrl, repositorySource, type GitReason, type ObjectId, type ReadBounds } from "@generalbusiness/artroom-git";
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

/**
 * Preparing a runner's workspace (R-EXEC-3, R-EXEC-4, R-EXEC-6, R-EXEC-7).
 *
 * - Every command is an argument array, and every exit code is checked.
 * - The runner fetches the exact integration commit (depth 1, so no
 *   history) into a new, empty repository, checks it out detached, and
 *   confirms `HEAD` before anything else runs.
 * - With whole-tree input it also confirms the tree. With a filtered
 *   snapshot it lists every file it received and recomputes the snapshot
 *   digest, and refuses a file outside the declared paths.
 * - Each job gets its own directory, home and npm cache. Isolation between
 *   jobs does not rest on these directories: every job runs in its own new
 *   container (sandbox.ts).
 * - Structured git output (`git ls-tree`) is read whole and unchanged. Only
 *   `step` cuts output, and only for display.
 */

import type { CheckJob, Runner, Sha } from "@generalbusiness/artroom-contract";
import { matchesAny, snapshotDigest, type SnapshotEntry } from "@generalbusiness/artroom-policy";

/** A checked-out, verified job. Untrusted code runs only after this exists. */
export interface Workspace {
  readonly runner: Runner;
  /** The checked-out tree. */
  readonly dir: string;
  readonly head: Sha;
  readonly tree: Sha;
  /** Environment for the job's tools: its own home and cache. */
  readonly env: Readonly<Record<string, string>>;
  /** For a filtered snapshot: the files received. */
  readonly files?: readonly SnapshotEntry[];
}

export type CheckoutResult = { readonly ok: true; readonly ws: Workspace } | { readonly ok: false; readonly detail: string };

export interface CheckoutOptions {
  /** The URL git fetches from. In the sandbox it is `job.readUrl`, reached through the gateway. */
  readonly remote: string;
  /** Where job directories go. */
  readonly root: string;
  /** Extra environment for git and tools (for example the CA bundle for the gateway). */
  readonly env?: Readonly<Record<string, string>>;
  /** Extra `-c` settings for git (tests allow the file protocol). */
  readonly gitConfig?: readonly string[];
  /** Fetch this many commits; 1 unless a checker needs the parent too. */
  readonly depth?: number;
}

const GIT_HARDENING = ["core.hooksPath=/dev/null", "core.fsmonitor=false", "credential.helper=", "protocol.allow=never", "protocol.https.allow=always"];

/** Run a command; the result's exit code must be checked by the caller. */
export async function git(runner: Runner, ws: { dir: string; env: Readonly<Record<string, string>> }, args: readonly string[], config: readonly string[] = []) {
  const cfg = [...GIT_HARDENING, ...config].flatMap((c) => ["-c", c]);
  return runner.exec(["git", ...cfg, "-C", ws.dir, ...args], { env: ws.env, timeoutMs: 120_000 });
}

export async function checkout(runner: Runner, job: CheckJob, opts: CheckoutOptions): Promise<CheckoutResult> {
  const base = `${opts.root}/${job.id}`;
  const dir = `${base}/src`;
  const env: Record<string, string> = {
    HOME: `${base}/home`,
    npm_config_cache: `${base}/npm-cache`,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    CI: "true",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    ...opts.env,
  };
  const ws = { dir, env };
  const fail = (step: string, r: { exitCode: number; stderr: string }) => ({ ok: false as const, detail: `${step} failed (exit ${r.exitCode}): ${r.stderr.slice(-600)}` });
  for (const argv of [["rm", "-rf", base], ["mkdir", "-p", dir, `${base}/home`, `${base}/npm-cache`]] as const) {
    const r = await runner.exec(argv, { env });
    if (r.exitCode !== 0) return fail(argv[0], r);
  }
  const cfg = opts.gitConfig ?? [];
  let r = await git(runner, ws, ["init", "-q"], cfg);
  if (r.exitCode !== 0) return fail("git init", r);
  r = await git(runner, ws, ["fetch", "-q", "--no-tags", "--depth", String(opts.depth ?? 1), opts.remote, job.integration], cfg);
  if (r.exitCode !== 0) return fail("git fetch", r);
  // Check out what the remote actually sent, then confirm it is the integration.
  r = await git(runner, ws, ["checkout", "-q", "--detach", "FETCH_HEAD"], cfg);
  if (r.exitCode !== 0) return fail("git checkout", r);
  // R-EXEC-4: confirm what was checked out before running anything.
  const head = (await git(runner, ws, ["rev-parse", "HEAD"], cfg)).stdout.trim();
  if (head !== job.integration) return { ok: false, detail: `checked-out HEAD ${head || "(none)"} is not the integration ${job.integration}` };
  const tree = (await git(runner, ws, ["rev-parse", "HEAD^{tree}"], cfg)).stdout.trim();
  if (job.input.kind === "tree") {
    if (tree !== job.input.tree) return { ok: false, detail: `checked-out tree ${tree} is not the job's tree ${job.input.tree}` };
    return { ok: true, ws: { runner, dir, head: head as Sha, tree: tree as Sha, env } };
  }
  const listed = await git(runner, ws, ["ls-tree", "-r", "-z", "--full-tree", "HEAD"], cfg);
  if (listed.exitCode !== 0) return fail("git ls-tree", listed);
  const files: SnapshotEntry[] = [];
  for (const rec of listed.stdout.split("\0").filter(Boolean)) {
    const tab = rec.indexOf("\t");
    const [mode, type, sha] = rec.slice(0, tab).split(" ");
    const path = rec.slice(tab + 1);
    if (type !== "blob" || !mode || !sha) return { ok: false, detail: `the snapshot holds a ${type} at ${path}` };
    if (!matchesAny(path, job.input.paths)) return { ok: false, detail: `the snapshot holds ${path}, which is outside its declared paths` };
    files.push([path, mode, sha as Sha]);
  }
  const digest = await snapshotDigest(files);
  if (digest !== job.input.snapshot) return { ok: false, detail: `the snapshot's digest ${digest} is not the job's ${job.input.snapshot}` };
  return { ok: true, ws: { runner, dir, head: head as Sha, tree: tree as Sha, env, files } };
}

/** Run a step in the workspace and keep the tail of its output, for display in the check's detail. */
export async function step(ws: Workspace, argv: readonly [string, ...string[]], timeoutMs = 600_000) {
  const r = await ws.runner.exec(argv, { cwd: ws.dir, env: ws.env, timeoutMs });
  const out = `${r.stdout}\n${r.stderr}`.trim();
  return { ok: r.exitCode === 0, exitCode: r.exitCode, tail: out.slice(-6000) };
}

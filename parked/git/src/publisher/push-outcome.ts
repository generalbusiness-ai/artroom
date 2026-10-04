/**
 * What a push to one ref did, as far as the pusher can know. Carried over
 * from the approved Sandbox spike (spikes/sandbox-git/src/push-outcome.ts).
 *
 * - `landed`: the receiver reported the ref updated, or already at the commit.
 * - `rejected`: the ref was definitely not updated by this push: a lease
 *   (`stale ref` or `stale info`), a non-fast-forward, or another refusal the
 *   receiver reported.
 * - `error`: the push failed before anything was sent (authentication, DNS,
 *   connection, missing repo). The ref did not change because of it.
 * - `unknown`: the pack may have been sent and no report arrived. The ref may
 *   or may not have changed.
 *
 * The rule: never say `error` or `rejected` when the ref might have changed.
 * When in doubt, the answer is `unknown`. The landing engine never decides an
 * outcome from this alone: it reads main back (R-PUB-5).
 */

export type PushOutcome =
  | { readonly outcome: "landed"; readonly detail: string }
  | { readonly outcome: "rejected"; readonly reason: "lease" | "non-fast-forward" | "remote-rejected"; readonly detail: string }
  | { readonly outcome: "error"; readonly detail: string }
  | { readonly outcome: "unknown"; readonly detail: string };

/** Failures that git reports only while sending the pack, or after. */
const AFTER_SEND = [
  /RPC failed/,
  /unexpected disconnect/,
  /remote end hung up unexpectedly/,
  /early EOF/,
  /send-pack:/,
  /\[remote failure\]/,
];

/** Failures during discovery (the GET of info/refs, or connecting), before any pack is sent. */
const BEFORE_SEND = [
  /^fatal: unable to access '[^']*': /m,
  /Authentication failed/,
  /could not read Username/,
  /^fatal: repository '[^']*' not found/m,
  /does not appear to be a git repository/,
];

/**
 * Codes Artifacts answers to a pack before it updates any ref (contract
 * amendment 4, R-LOG-20), so a push that gets one is refused. Measured live
 * on 2026-10-02 (`packages/room/measure/logbig/results/`): an object over
 * 33,554,432 bytes. Add only codes that Artifacts is known to answer before
 * any ref update: an answer is never `rejected` when the ref might have
 * changed.
 */
export const ARTIFACTS_REFUSALS: readonly string[] = ["artifacts_git_receive_pack_object_too_large"];

/** The Artifacts refusal code in a push's output (`remote: <code>` on a line of its own), or null. */
export function artifactsRefusal(text: string): string | null {
  for (const line of text.split("\n")) {
    const m = /^remote: ([a-z0-9_]+)\s*$/.exec(line);
    if (m && ARTIFACTS_REFUSALS.includes(m[1]!)) return m[1]!;
  }
  return null;
}

/** Classify `git push --porcelain` for one destination ref. */
export function classifyGitPush(exitCode: number, stdout: string, stderr: string, dstRef: string): PushOutcome {
  const detail = (stdout + "\n" + stderr).trim().slice(-600);
  for (const line of stdout.split("\n")) {
    const m = /^(.)\t[^\t]*:([^\t]+)\t(.*)$/.exec(line);
    if (!m || m[2] !== dstRef) continue;
    const flag = m[1] ?? "";
    const summary = m[3] ?? "";
    if (" +-*=".includes(flag)) {
      return exitCode === 0 ? { outcome: "landed", detail } : { outcome: "unknown", detail };
    }
    if (flag !== "!") return { outcome: "unknown", detail };
    if (/\(stale info\)|\(stale ref\)/.test(summary)) return { outcome: "rejected", reason: "lease", detail };
    if (/^\[rejected\]/.test(summary)) return { outcome: "rejected", reason: "non-fast-forward", detail };
    if (/^\[remote rejected\]/.test(summary)) return { outcome: "rejected", reason: "remote-rejected", detail };
    if (/^\[no match\]/.test(summary)) return { outcome: "error", detail };
    return { outcome: "unknown", detail }; // includes "[remote failure]": sent, no status
  }
  if (exitCode === 0) return { outcome: "unknown", detail }; // success without a status line for our ref
  // Artifacts refused the pack before updating any ref; git then reports only a hang-up (R-LOG-20).
  if (artifactsRefusal(stderr)) return { outcome: "rejected", reason: "remote-rejected", detail };
  if (AFTER_SEND.some((r) => r.test(stderr))) return { outcome: "unknown", detail };
  if (BEFORE_SEND.some((r) => r.test(stderr))) return { outcome: "error", detail };
  return { outcome: "unknown", detail };
}

/**
 * What a durable record keeps of a push's answer (request d29c09fa): the
 * outcome, the kind of refusal, and an Artifacts refusal code from
 * `ARTIFACTS_REFUSALS`. Never git's or the remote's text, which can echo a
 * URL or a header.
 */
export function outcomeNote(o: PushOutcome): string {
  const code = o.outcome === "rejected" ? artifactsRefusal(o.detail) : null;
  return `push answered: ${o.outcome}${o.outcome === "rejected" ? ` (${o.reason})` : ""}${code ? ` ${code}` : ""}`;
}

/** True when this outcome proves the push did not and cannot update the ref. */
export function definitelyNotApplied(outcome: PushOutcome["outcome"] | null): boolean {
  return outcome === "error" || outcome === "rejected";
}

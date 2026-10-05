/**
 * What is known about one send, and what the ledger records for its attempt
 * (authority note, section 6.6, step 4; section 5.7, "Evidence of each
 * outside effect"; scope contract, section 4.3). It is the reviewed
 * successor of the earlier publisher's classifier
 * (`notes/2026-10-05-i3-git-review.md`, section 4). Pure: no clock, no
 * storage, no network.
 *
 * Section 6.6 gives a send one of three classes, and says what each
 * requires:
 *
 * - **not sent**: the grant is closed and its record shows that nothing was
 *   forwarded;
 * - **refused**: the grant shows one forward, the host's answer was received
 *   whole, and Git reports a rejection of that ref by the remote;
 * - **unknown**: anything else.
 *
 * So the gateway's record decides between "not sent" and the rest. Git's
 * words on standard error decide nothing here: the earlier classifier called
 * a push "not sent" from the text of an error, and that rule is not kept.
 * And no answer of a push says that the ref moved: only a read of the ref
 * says so (section 6.6, step 6). A push that Git reports as applied is
 * `unknown` until that read.
 *
 * Nothing here sends anything, and nothing here asks for another send. An
 * `unknown` stays `unknown` (section 5.4, rule 2).
 */

import type { Evidence } from "@generalbusiness/artroom-contract";
import type { GitReason, ObjectId } from "./names.ts";

/** What Git printed for one ref, in the stable format of `git push --porcelain`. */
export type Reported =
  | "updated"            // ` `: a fast-forward
  | "forced"             // `+`: the ref moved to a commit that does not descend from its old value. Reported apart: a publication never sends one.
  | "created"            // `*`
  | "deleted"            // `-`
  | "up-to-date"         // `=`: the remote already held the value, and Git sent no update
  | "stale"              // `!`, `[rejected] (stale info)`: Git's own check of the expected old value, before anything is sent
  | "rejected"           // `!`, `[rejected]` for another reason of Git's own, before anything is sent
  | "remote-rejected"    // `!`, `[remote rejected]`: the remote's own report for that ref
  | "failed";            // `!` with any other summary, such as `[remote failure]`: sent, and no report for the ref

/** One push, as far as its process told. It holds no text of Git's or of the remote's. */
export interface PushAnswer {
  /** False: a check refused before the push command ran. `refusal` says which. */
  ran: boolean;
  refusal: GitReason | null;
  /** The exit code, or null when the command did not run or passed its deadline. */
  exit: number | null;
  timedOut: boolean;
  /** Git's status line for exactly the ref that was sent, or null when it printed none. */
  reported: Reported | null;
  /** Git printed a status line for another ref. One refspec is sent, so this is never expected. */
  others: boolean;
  /** A refusal code of the host's, from the caller's list, on a line of its own from the remote. */
  code: string | null;
}

export const NOT_RUN = (refusal: GitReason): PushAnswer => ({ ran: false, refusal, exit: null, timedOut: false, reported: null, others: false, code: null });

const FLAGS: Readonly<Record<string, Reported>> = { " ": "updated", "+": "forced", "*": "created", "-": "deleted", "=": "up-to-date" };

/**
 * Read a push's output for one destination ref. `refusals`: the codes that
 * the chosen host is known to answer before it updates any ref, which it
 * prints as `remote: <code>` on a line of its own. The list is the host's,
 * so it is a parameter, and it is empty until a host is named (plan question
 * Q6).
 */
export function readAnswer(result: { code: number; stdout: string; stderr: string; timedOut: boolean }, ref: string, refusals: readonly string[] = []): PushAnswer {
  let reported: Reported | null = null;
  let others = false;
  for (const line of result.stdout.split("\n")) {
    const m = /^(.)\t[^\t]*:([^\t]+)\t(.*)$/.exec(line);
    if (m === null) continue;
    if (m[2] !== ref || reported !== null) { others = true; continue; }
    const [flag, summary] = [m[1]!, m[3]!];
    reported = FLAGS[flag] ?? (flag !== "!" ? "failed" : /^\[rejected\] \(stale info\)$/.test(summary) ? "stale" : summary.startsWith("[rejected]") ? "rejected" : summary.startsWith("[remote rejected]") ? "remote-rejected" : "failed");
  }
  let code: string | null = null;
  for (const line of result.stderr.split("\n")) {
    const m = /^remote: ([a-z0-9_]+)\s*$/.exec(line);
    if (m !== null && refusals.includes(m[1]!)) code = m[1]!;
  }
  return { ran: true, refusal: null, exit: result.timedOut ? null : result.code, timedOut: result.timedOut, reported, others, code };
}

/** What the gateway's record of one grant says, as far as a send is judged on it (`GrantRecord`, in `gateway.ts`). */
export interface Forwarding { state: "open" | "forwarding" | "closed"; forwarded: 0 | 1 }

/** The three classes of section 6.6, step 4. */
export type SendEvidence =
  /** No update of this attempt reached the host. `why`: the check that refused before the push ran, or what Git's own check said, or that the gateway forwarded nothing. */
  | { class: "not-sent"; why: GitReason | "stale" | "rejected" | "up-to-date" | "not-forwarded" }
  /** The host answered this update and did not apply it. `why`: `rejected`, or the host's code. */
  | { class: "refused"; why: string }
  /** The update may have been applied, or may still be. `reported`: what Git said it did, which only a read confirms; null when Git reported no update of the ref. */
  | { class: "unknown"; reported: "updated" | "forced" | "created" | "deleted" | null };

const APPLIED: readonly (Reported | null)[] = ["updated", "forced", "created", "deleted"];
const UNKNOWN: SendEvidence = { class: "unknown", reported: null };

/**
 * The class of one send, from the gateway's record of its grant and from
 * what the push told. `grant` is null when there is no record to read.
 *
 * The rule is the table of section 6.6, read strictly: each of "not sent"
 * and "refused" needs everything that its row requires, and whatever fits
 * neither row is `unknown`. Two answers that contradict each other, such as
 * a record of no forward beside a report that the ref moved, are `unknown`.
 */
export function classifySend(answer: PushAnswer, grant: Forwarding | null): SendEvidence {
  if (grant === null || grant.state !== "closed" || answer.others) return UNKNOWN;
  if (grant.forwarded === 0) {
    if (APPLIED.includes(answer.reported) || answer.reported === "remote-rejected" || answer.code !== null) return UNKNOWN;
    if (!answer.ran) return { class: "not-sent", why: answer.refusal ?? "not-forwarded" };
    return { class: "not-sent", why: answer.reported === "stale" || answer.reported === "rejected" || answer.reported === "up-to-date" ? answer.reported : "not-forwarded" };
  }
  if (!answer.ran || answer.timedOut || answer.exit === null) return UNKNOWN;
  // The remote's own report for this ref, in an answer that Git read to its end.
  if (answer.reported === "remote-rejected" && answer.exit !== 0) return { class: "refused", why: "rejected" };
  // The host's code, where the host is known to give it before any ref is updated, and Git printed no status for the ref.
  if (answer.reported === null && answer.code !== null && answer.exit !== 0) return { class: "refused", why: answer.code };
  if (APPLIED.includes(answer.reported) && answer.exit === 0) return { class: "unknown", reported: answer.reported as "updated" | "forced" | "created" | "deleted" };
  return UNKNOWN;
}

/** The ref as read after the send: the read that decides (section 6.6, step 6). `value` null: the ref does not exist. */
export interface ReadBack { ref: string; value: ObjectId | null }

/** What the ledger records for one attempt: the contract's outcome, with its evidence by basis. */
export interface AttemptOutcome { result: "confirmed" | "refused" | "unknown"; evidence: Evidence }

/**
 * The outcome of one attempt, for the ledger (scope contract, section 4.3,
 * items 3 and 4; authority note, section 5.7, the row "Updating the branch;
 * a fence; the receipt ref" and the rows of a staged ref and a first head).
 *
 * - `refused`, by the attempt's own answer: the send was not sent, or the
 *   host refused it. Either shows that this attempt did nothing.
 * - `confirmed`, by a read: Git reported that this attempt's update was
 *   applied, and the read of that ref shows exactly the value that the
 *   attempt sent. The text does not say which attempt a read confirms
 *   (section 5.7, point O11). Here it is only the attempt whose own answer
 *   said so (I3 deltas, entry EG6).
 * - `unknown`, with no evidence: everything else. A lost reply is `unknown`
 *   whatever the read shows: the read says that the effect happened, and not
 *   which attempt did it (section 6.6). Only that attempt's own late answer
 *   changes it.
 *
 * `update`: the ref and the value that this attempt sent, null for a delete.
 * `read`: null when no read was made, or when it failed.
 */
export function attemptOutcome(update: { ref: string; new: ObjectId | null }, send: SendEvidence, read: ReadBack | null): AttemptOutcome {
  if (send.class !== "unknown") return { result: "refused", evidence: { basis: "own-answer", body: { ref: update.ref, send: send.class, why: send.why } } };
  if (send.reported !== null && read !== null && read.ref === update.ref && read.value === update.new) {
    return { result: "confirmed", evidence: { basis: "read", body: { ref: read.ref, value: read.value, reported: send.reported } } };
  }
  return { result: "unknown", evidence: { basis: "none", body: null } };
}

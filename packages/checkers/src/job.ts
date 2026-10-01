/**
 * Check jobs and what binds them (R-OBL-3, R-EXEC-3, R-CARRY-6, R-CARRY-9).
 *
 * `checkJob` refuses a job before any sandbox starts if it is malformed, is
 * for another room or checker, has expired, or would send the runner
 * anywhere but a read-only URL on the room's own Artifacts host.
 *
 * The read token arrives in `gitAuthEnv` as git configuration for
 * `http.extraHeader`. The service takes it out and hands it to the runner's
 * gateway; it never enters the runner's environment.
 */

import type { CheckJob, Refusal, RoomId } from "@generalbusiness/artroom-contract";
import { isGlob } from "@generalbusiness/artroom-policy";

export interface JobExpectations {
  readonly room: RoomId;
  readonly checker: string;
  /** The room's Artifacts host, for example `<account>.artifacts.cloudflare.net`. */
  readonly host: string;
  readonly namespace: string;
  readonly now: () => number;
}

/** What the service needs from a valid job. */
export interface BoundJob {
  readonly job: CheckJob;
  /** The read-only token, for the gateway. */
  readonly token: string;
  /** `/git/<namespace>/<repo>.git` */
  readonly repoPath: string;
  readonly repo: string;
  readonly deadline: number;
}

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const JOB_ID = /^job_[A-Za-z0-9_-]{1,60}$/;
const OBLIGATION = /^obl_[a-z][a-z0-9-]{0,63}$/;
const ACT = /^act_(0|[1-9][0-9]{0,15})_[0-9a-f]{8}$/;

function refuse(reason: string, fix = "Send a job the room built for this checker."): Refusal {
  return { refused: true, rule: "check-binding", reason, fix };
}

/** The token from `gitAuthEnv`, which must be exactly one `http.extraHeader` bearer header. */
export function tokenFromGitAuthEnv(env: Readonly<Record<string, string>>): string | null {
  const keys = Object.keys(env).sort();
  if (keys.join(",") !== "GIT_CONFIG_COUNT,GIT_CONFIG_KEY_0,GIT_CONFIG_VALUE_0") return null;
  if (env["GIT_CONFIG_COUNT"] !== "1" || env["GIT_CONFIG_KEY_0"]?.toLowerCase() !== "http.extraheader") return null;
  const m = /^Authorization: Bearer ([A-Za-z0-9_?=.-]{8,512})$/.exec(env["GIT_CONFIG_VALUE_0"] ?? "");
  return m?.[1] ?? null;
}

/** `gitAuthEnv` for a token: what the room puts in a job. */
export function gitAuthEnvFor(token: string): Record<string, string> {
  return { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}` };
}

export function checkJob(job: CheckJob, exp: JobExpectations): BoundJob | Refusal {
  if (!JOB_ID.test(job.id)) return refuse("The job ID is malformed.");
  if (job.room !== exp.room) return refuse("The job is for another room.");
  if (job.check !== exp.checker) return refuse(`The job is for checker ${job.check}, not ${exp.checker}.`);
  if (!ACT.test(job.lane)) return refuse("The lane ID is malformed.");
  if (!Number.isSafeInteger(job.generation) || job.generation < 1) return refuse("The generation is not a positive integer.");
  if (!SHA.test(job.head) || !SHA.test(job.integration)) return refuse("The head or integration is not a 40-character SHA-1.");
  if (!OBLIGATION.test(job.obligation) || job.obligation === "obl_admin-approval") {
    return refuse("The obligation is not a check obligation.");
  }
  if (!DIGEST.test(job.config)) return refuse("The configuration digest is malformed.");
  if (job.input.kind === "tree") {
    if (!SHA.test(job.input.tree)) return refuse("The tree is not a 40-character SHA-1.");
  } else if (job.input.kind === "filtered") {
    if (!DIGEST.test(job.input.snapshot)) return refuse("The snapshot digest is malformed.");
    if (job.input.paths.length === 0 || !job.input.paths.every((p) => isGlob(p))) return refuse("The snapshot's paths are not valid globs.");
  } else {
    return refuse("Unknown input kind.");
  }
  let url: URL;
  try {
    url = new URL(job.readUrl);
  } catch {
    return refuse("The read URL is malformed.");
  }
  const prefix = `/git/${exp.namespace}/`;
  const repo = url.pathname.slice(prefix.length, -".git".length);
  if (
    url.protocol !== "https:" ||
    url.hostname !== exp.host ||
    !url.pathname.startsWith(prefix) ||
    !url.pathname.endsWith(".git") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^[A-Za-z0-9._-]{1,100}$/.test(repo)
  ) {
    return refuse("The read URL is not a repository on the room's Artifacts host.");
  }
  const token = tokenFromGitAuthEnv(job.gitAuthEnv);
  if (!token) return refuse("gitAuthEnv must be exactly one bearer header for git.");
  const deadline = Date.parse(job.deadline);
  if (!Number.isFinite(deadline) || deadline <= exp.now()) return refuse("The job's deadline has passed.", "Ask the room for a new job.");
  if (job.landOp !== undefined && !/^op_[A-Za-z0-9_-]{1,120}$/.test(job.landOp)) return refuse("The landing operation ID is malformed.");
  return { job, token, repoPath: url.pathname, repo, deadline };
}

export function isRefusal(x: unknown): x is Refusal {
  return typeof x === "object" && x !== null && (x as { refused?: unknown }).refused === true;
}

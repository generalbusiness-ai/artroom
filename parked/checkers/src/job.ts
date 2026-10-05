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

import type { CheckJob, CheckJobV2, GitAuthEnv, Refusal, RoomId } from "@generalbusiness/artroom-contract";
import { isGlob } from "@generalbusiness/artroom-policy";

export interface JobExpectations {
  /**
   * The one room this service checks for, if it is fixed (the harness, and
   * tests). Absent in production: the room comes from each job, must be a
   * room ID (R-ID-3), and is resolved through the `ROOM` service binding
   * before any sandbox starts (R-EXEC-8).
   */
  readonly room?: RoomId;
  readonly checker: string;
  /** The room's Artifacts host, for example `<account>.artifacts.cloudflare.net`. */
  readonly host: string;
  /** The Artifacts namespaces a job may read from (`ARTIFACTS_NAMESPACES`): the Room's own, and its import namespace if any. */
  readonly namespaces: readonly string[];
  readonly now: () => number;
}

const NAMESPACE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * The accepted namespaces, from the deploy setting `ARTIFACTS_NAMESPACES`: a
 * comma-separated list of namespace names. Throws if it is missing, empty,
 * or holds anything that is not a namespace name, so a misconfigured
 * service runs nothing.
 */
export function parseNamespaces(raw: unknown): readonly string[] {
  if (typeof raw !== "string") throw new Error("ARTIFACTS_NAMESPACES is not set: list the Artifacts namespaces jobs may read from, comma-separated.");
  const list = raw.split(",").map((n) => n.trim());
  if (list.length === 0 || list.some((n) => !NAMESPACE.test(n))) {
    throw new Error(`ARTIFACTS_NAMESPACES must be a comma-separated list of Artifacts namespace names, not ${JSON.stringify(raw.slice(0, 200))}.`);
  }
  return Object.freeze([...new Set(list)]);
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
/** R-ID-3: `room_` and 32 hex characters. A room name never has this form (R-GEN-11). */
const ROOM_ID = /^room_[0-9a-f]{32}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const JOB_ID = /^job_[A-Za-z0-9_-]{1,60}$/;
const OBLIGATION = /^obl_[a-z][a-z0-9-]{0,63}$/;
/** A declared kind's name (R-DECL-2). */
const KIND = /^[a-z][a-z0-9-]{0,31}$/;
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
export function gitAuthEnvFor(token: string): GitAuthEnv {
  return { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}` };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/**
 * The service's own copy of a job: a deep, frozen clone. `handle` takes it
 * before its first await and reads only it, so a caller that changes its job
 * object while the check runs changes nothing that is checked out, run or
 * signed.
 */
export function ownJob(job: CheckJob): CheckJob | Refusal {
  try {
    return deepFreeze(structuredClone(job));
  } catch {
    return refuse("The job is not plain data.");
  }
}

/** The kind and binding a job from a v2 room tells the service to sign (R-DECL-18), or null for a v1 room's job. `checkJob` has checked them. */
export function signedAs(job: CheckJob): { readonly kind: string; readonly binding: string } | null {
  const { kind, binding } = job as Partial<CheckJobV2>;
  return typeof kind === "string" && typeof binding === "string" ? { kind, binding } : null;
}

export function checkJob(job: CheckJob, exp: JobExpectations): BoundJob | Refusal {
  if (!JOB_ID.test(job.id)) return refuse("The job ID is malformed.");
  if (typeof job.room !== "string" || !ROOM_ID.test(job.room)) return refuse("The job's room is not a room ID.");
  if (exp.room !== undefined && job.room !== exp.room) return refuse("The job is for another room.");
  if (job.check !== exp.checker) return refuse(`The job is for checker ${job.check}, not ${exp.checker}.`);
  if (!ACT.test(job.lane)) return refuse("The lane ID is malformed.");
  if (!Number.isSafeInteger(job.generation) || job.generation < 1) return refuse("The generation is not a positive integer.");
  if (!SHA.test(job.head) || !SHA.test(job.integration) || !SHA.test(job.base)) return refuse("The head, integration or base is not a 40-character SHA-1.");
  // R-EXEC-10: copied from the configuration; a job without them is incomplete.
  if (typeof job.volatile !== "boolean" || typeof job.advisory !== "boolean") return refuse("The job's volatile or advisory flag is missing.");
  if (job.runner !== null && !DIGEST.test(job.runner)) return refuse("The job's runner digest is malformed.");
  if (!OBLIGATION.test(job.obligation) || job.obligation === "obl_admin-approval") {
    return refuse("The obligation is not a check obligation.");
  }
  if (!DIGEST.test(job.config)) return refuse("The configuration digest is malformed.");
  // R-DECL-18: a v2 room's job names the kind and the binding to sign, both or neither.
  const { kind, binding } = job as Partial<CheckJobV2>;
  if (kind !== undefined || binding !== undefined) {
    if (typeof kind !== "string" || typeof binding !== "string") return refuse("The job names a kind or a binding, but not both."); // G2:job-both
    if (!KIND.test(kind)) return refuse("The job's kind is malformed."); // G2:job-kind
    if (!DIGEST.test(binding)) return refuse("The job's binding is malformed."); // G2:job-binding-form
  }
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
  // `/git/<namespace>/<repo>.git`, in one of the accepted namespaces.
  const path = /^\/git\/([^/]+)\/([^/]+)\.git$/.exec(url.pathname);
  const repo = path?.[2] ?? "";
  if (
    url.protocol !== "https:" ||
    url.hostname !== exp.host ||
    !path ||
    !exp.namespaces.includes(path[1]!) ||
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

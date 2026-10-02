/**
 * Checkers: service actors that fulfil `require` check obligations with
 * `check` acts (plan sections 5 and 9). Rules R-EXEC and R-CARRY in
 * docs/protocol.md.
 *
 * The room issues every `CheckJob` and sends it to the checker service over
 * a Workers service binding (R-EXEC-8). The service runs it in a separate
 * sandbox with read-only access, then signs the `check` act outside the
 * sandbox. A subclass writes only `run()`.
 */

import type { CheckerName, Digest, Generation, LaneId, ObligationId, OpId, RoomId, Sha, Timestamp } from "./ids.ts";

/**
 * Git's credential for a job, as environment variables (R-EXEC-9): exactly
 * one `http.extraHeader` holding a read-only bearer token for `readUrl`'s
 * repository, expiring no later than the job's deadline.
 */
export type GitAuthEnv = {
  readonly GIT_CONFIG_COUNT: "1";
  readonly GIT_CONFIG_KEY_0: "http.extraHeader";
  readonly GIT_CONFIG_VALUE_0: `Authorization: Bearer ${string}`;
};

/** The author and committer line of every filtered snapshot commit: fixed identity, time 0, UTC (R-CARRY-15). */
export type SnapshotIdentity = "Artroom Snapshot <snapshot@artroom.invalid> 0 +0000";

/** The message of a filtered snapshot commit (R-CARRY-15). */
export type SnapshotMessage = `Artroom filtered snapshot for ${CheckerName}\n\nDigest: ${Digest}\n`;
import type { CheckInput } from "./evidence.ts";
import type { Check } from "./acts.ts";
import type { Result } from "./errors.ts";

/** One unit of work for a checker. Issued only by the room (R-EXEC-8). */
export interface CheckJob {
  /** Unique per run; use it to name the sandbox. */
  readonly id: `job_${string}`;
  readonly room: RoomId;
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly head: Sha;
  readonly obligation: ObligationId;
  readonly check: CheckerName;
  /**
   * The commit to check out. With tree input, the integration. With filtered
   * input, the snapshot commit the room recorded for the integration
   * (R-CARRY-15).
   */
  readonly integration: Sha;
  /**
   * The canonical main commit the integration was built on: the landing's
   * `expectedMain`, or the preview's base (R-EXEC-10). A filtered job's
   * runner cannot read it.
   */
  readonly base: Sha;
  readonly input: CheckInput;
  /**
   * Read-only URL on the room's own Artifacts host: the canonical repository
   * for `tree`; for `filtered`, the repository that holds only this job's
   * snapshot (R-CARRY-16).
   */
  readonly readUrl: `https://${string}`;
  /** Git's credential only (R-EXEC-3, R-EXEC-9). */
  readonly gitAuthEnv: GitAuthEnv;
  /** Digest of the checker configuration in force (from the active policy version). */
  readonly config: Digest;
  /** The configuration's `volatile`. The signed check must state the same (R-EXEC-10). */
  readonly volatile: boolean;
  /** The configuration's `advisory`, false when absent (R-OBL-7). */
  readonly advisory: boolean;
  /** The runner environment the configuration pins; null when none is (R-EXEC-11). */
  readonly runner: Digest | null;
  readonly landOp?: OpId;
  readonly deadline: Timestamp;
}

/** What `run()` returns. The base class turns it into a signed `check` act. */
export interface CheckOutcome {
  readonly ok: boolean;
  /** Shown on the proposal. Truncated to 16 KiB; scanned for secrets before recording. */
  readonly detail: string;
}

/** The result of one command in a runner sandbox. */
export interface ExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Artroom's runner wrapper over `ctx.container.exec(argv, { cwd, env })` and
 * `process.output()`. It takes an argument array, never a shell string. The
 * process receives only `env` plus `PATH`. A non-zero exit resolves normally.
 */
export interface Runner {
  exec(
    argv: readonly [string, ...string[]],
    opts?: { readonly cwd?: string; readonly env?: Readonly<Record<string, string>>; readonly timeoutMs?: number },
  ): Promise<ExecResult>;
  /** The runner environment digest recorded in the check (image and toolchain). */
  readonly digest: Digest;
}

/** Minimal shape of the context a Worker entrypoint receives. */
export interface CheckerContext {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * The base class. Declared here; implemented by the checker package. It
 * accepts jobs only through the service binding (R-EXEC-8), checks the
 * job's binding, calls `run()`, and signs the `check` act with the
 * service's delegation key, outside the sandbox (R-EXEC-5).
 */
export declare abstract class Checker<Env = unknown> {
  constructor(ctx: CheckerContext, env: Env);
  protected readonly env: Env;
  abstract readonly name: CheckerName;
  abstract run(job: CheckJob): Promise<CheckOutcome>;
  /** Called by the room. Returns the recorded check, or a refusal (for example `check-binding`). */
  handle(job: CheckJob): Promise<Result<Check>>;
}

/** The RPC surface a checker service exposes to the room, over a service binding only (R-EXEC-8). */
export interface CheckerService {
  handle(job: CheckJob): Promise<Result<Check>>;
}

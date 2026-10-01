/**
 * Checkers: service actors that fulfil `require` check obligations with
 * `check` acts (plan sections 5 and 9). Rules R-EXEC and R-CARRY in
 * docs/protocol.md.
 *
 * The room sends a `CheckJob` to the checker service. The service runs it in
 * a separate sandbox with read-only access, then signs the `check` act
 * outside the sandbox. A subclass writes only `run()`.
 */

import type { CheckerName, Digest, Generation, LaneId, ObligationId, OpId, RoomId, Sha, Timestamp } from "./ids.ts";
import type { CheckInput } from "./evidence.ts";
import type { Check } from "./acts.ts";
import type { Result } from "./errors.ts";

/** One unit of work for a checker. */
export interface CheckJob {
  /** Unique per run; use it to name the sandbox. */
  readonly id: `job_${string}`;
  readonly room: RoomId;
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly head: Sha;
  readonly obligation: ObligationId;
  readonly check: CheckerName;
  /** The integration commit to check. With filtered input, the commit of the filtered snapshot. */
  readonly integration: Sha;
  readonly input: CheckInput;
  /** Read-only URL on the room's own Artifacts host. Canonical repo for `tree`; snapshot repo for `filtered`. */
  readonly readUrl: `https://${string}`;
  /** Environment for git only: a read-only token, scoped to `readUrl`, expiring at `deadline` (R-EXEC-3). */
  readonly gitAuthEnv: Readonly<Record<string, string>>;
  /** Digest of the checker configuration in force (from the active policy version). */
  readonly config: Digest;
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
 * verifies the job came from the room, calls `run()`, and signs the `check`
 * act with the service's delegation key, outside the sandbox (R-EXEC-5).
 */
export declare abstract class Checker<Env = unknown> {
  constructor(ctx: CheckerContext, env: Env);
  protected readonly env: Env;
  abstract readonly name: CheckerName;
  abstract run(job: CheckJob): Promise<CheckOutcome>;
  /** Called by the room. Returns the recorded check, or a refusal (for example `check-binding`). */
  handle(job: CheckJob): Promise<Result<Check>>;
}

/** The RPC surface a checker service exposes to the room. */
export interface CheckerService {
  handle(job: CheckJob): Promise<Result<Check>>;
}

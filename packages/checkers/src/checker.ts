/**
 * The contract's `Checker` base class, implemented (plan section 5,
 * "Checkers"; R-EXEC, R-OBL-3, R-CARRY-6, R-CARRY-9).
 *
 * `handle(job)`:
 * 1. takes its own deep, frozen copy of the job before anything else, so
 *    nothing the caller changes later reaches the check (`ownJob`);
 * 2. checks that copy's binding before anything starts (`checkJob`);
 * 3. opens a new runner sandbox for this job alone, checks out the exact
 *    integration and confirms `HEAD`, the tree or the snapshot digest
 *    (`checkout`);
 * 4. calls the subclass's `run(job)` with the copy, which runs untrusted code
 *    only inside the sandbox;
 * 5. closes the sandbox, then, outside it, builds the `check` body from the
 *    copy (generation, integration, input, configuration digest) and the
 *    runner digest, labels it machine-run, signs it with the service's
 *    delegation key, and submits it to the room.
 *
 * A subclass writes `run()` (and, for the LLM reviewer, `after()`). Each
 * `handle` call owns its job copy, session and workspace; they are found by
 * the copy's identity, so two calls never share them, even for one job ID.
 */

import type {

  ActRecord,
  ArtroomError,
  Check,
  CheckBody,
  CheckJob,
  CheckOutcome,
  CheckerContext,
  DelegationId,
  Note,
  NoteAnchor,
  Refusal,
  Result,
  Runner,
  SignedEnvelope,
} from "@generalbusiness/artroom-contract";
import { checkJob, isRefusal, ownJob, type BoundJob, type JobExpectations } from "./job.ts";
import { checkout, type CheckoutOptions, type Workspace } from "./runner.ts";
import { isOutputLimit } from "./sandbox.ts";
import { signEnvelope, type Signer } from "./signing.ts";

/** How the service reaches the room: `RoomWire.submit`. */
export interface RoomPort {
  submit(act: SignedEnvelope): Promise<Result<ActRecord>>;
}

/** A runner sandbox opened for one job. `close` ends it. */
export interface RunnerSession extends Omit<CheckoutOptions, "depth"> {
  readonly runner: Runner;
  close(): Promise<void>;
}

export interface RunnerProvider {
  open(bound: BoundJob): Promise<RunnerSession>;
}

export interface CheckerServices {
  readonly signer: Signer;
  /** The delegation the signing key acts under (R-ADM-3, case b). */
  readonly delegation?: DelegationId;
  readonly room: RoomPort;
  readonly runners: RunnerProvider;
  readonly expectations: JobExpectations;
}

/** Check detail is at most 16 KiB (R-EXEC-5). */
export const DETAIL_LIMIT = 16 * 1024;
const TOKEN = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;

/** Redact tokens and cut to `limit` UTF-8 bytes, keeping the start. */
export function clip(text: string, limit = DETAIL_LIMIT): string {
  const clean = text.replace(TOKEN, "<token>");
  const bytes = new TextEncoder().encode(clean);
  if (bytes.length <= limit) return clean;
  return new TextDecoder().decode(bytes.slice(0, limit - 32)).replace(/�$/, "") + "\n… (truncated)";
}

/** An infrastructure failure: thrown, never recorded as a failed check. */
export function unavailable(message: string): ArtroomError {
  return { name: "ArtroomError", code: "unavailable", message: clip(message, 500), retryable: true };
}

/** A runner command's output went over the runner's limit: thrown, never recorded as a failed check, and not worth retrying. */
export function outputTooLarge(message: string): ArtroomError {
  return { name: "ArtroomError", code: "payload-too-large", message: clip(message, 500), retryable: false };
}

/** One job's run, owned by one `handle` call. */
interface JobRun {
  readonly session: RunnerSession;
  readonly ws: Workspace;
}

export abstract class Checker<Env = unknown, Outcome extends CheckOutcome = CheckOutcome> {
  protected readonly env: Env;
  protected readonly ctx: CheckerContext;
  abstract readonly name: string;
  /** True for checkers with volatile inputs; their checks never carry (R-CARRY-10). */
  abstract readonly volatile: boolean;
  /** One line saying what ran, shown at the top of the detail. */
  abstract readonly label: string;
  /** Commits to fetch: 1, or 2 when `run()` needs the parent. */
  protected readonly depth: number = 1;
  /** Runs in progress, by the identity of the job copy each `handle` call owns. */
  private readonly runs = new WeakMap<CheckJob, JobRun>();

  constructor(ctx: CheckerContext, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  /** The key, room, runners and expectations, built from `env`. */
  protected abstract services(): CheckerServices | Promise<CheckerServices>;

  /** The check itself, given the job copy `handle` owns. Untrusted code runs only through `this.workspace(job).runner`. */
  abstract run(job: CheckJob): Promise<Outcome>;

  /** Called after the check is recorded, with the same job copy, when `run()` ran. The LLM reviewer posts its note here. */
  protected after(_job: CheckJob, _check: Check, _outcome: Outcome): Promise<void> {
    return Promise.resolve();
  }

  private run$(job: CheckJob): JobRun {
    const r = this.runs.get(job);
    if (!r) throw new Error("no run in progress for this job: pass the job that run() was given");
    return r;
  }

  /** The verified workspace of the job in progress. */
  protected workspace(job: CheckJob): Workspace {
    return this.run$(job).ws;
  }

  /** The runner session of the job in progress (for fetching more commits). */
  protected session(job: CheckJob): RunnerSession {
    return this.run$(job).session;
  }

  async handle(input: CheckJob): Promise<Result<Check>> {
    // Before the first await: from here on only this copy is read.
    const job = ownJob(input);
    if (isRefusal(job)) return job;
    const s = await this.services();
    const bound = checkJob(job, s.expectations);
    if (isRefusal(bound)) return bound;
    let session: RunnerSession;
    try {
      session = await s.runners.open(bound);
    } catch (e) {
      throw unavailable(`could not start a runner: ${e instanceof Error ? e.message : String(e)}`);
    }
    let outcome: CheckOutcome;
    // What run() returned, when the checkout was confirmed and it ran.
    let produced: Outcome | null = null;
    try {
      const co = await checkout(session.runner, job, { ...session, depth: this.depth });
      if (!co.ok) {
        outcome = { ok: false, detail: `The runner could not confirm what it checked out, so nothing ran.\n${co.detail}` };
      } else {
        this.runs.set(job, { session, ws: co.ws });
        outcome = produced = await this.run(job);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (isOutputLimit(e)) throw outputTooLarge(`Nothing was recorded: ${message}`);
      throw unavailable(`the runner failed: ${message}`);
    } finally {
      this.runs.delete(job);
      await session.close().catch(() => undefined);
    }
    const body: CheckBody = {
      obligation: job.obligation,
      check: this.name,
      integration: job.integration,
      input: job.input,
      config: job.config,
      runner: session.runner.digest,
      volatile: this.volatile,
      ok: outcome.ok,
      detail: clip(`Machine-run check "${this.name}": ${outcome.ok ? "passed" : "failed"}. ${this.label}\n\n${outcome.detail}`),
      ...(job.landOp ? { landOp: job.landOp } : {}),
    };
    const signed = await signEnvelope(s.signer, {
      v: 1,
      room: job.room,
      actor: s.signer.key,
      kind: "check",
      target: { lane: job.lane, generation: job.generation },
      body,
      idempotencyKey: `chk-${job.id}`.slice(0, 64),
      ...(s.delegation ? { delegation: s.delegation } : {}),
    });
    const recorded = await s.room.submit(signed);
    if (isRefusal(recorded)) return recorded as Refusal;
    const check = recorded as Check;
    if (produced) await this.after(job, check, produced);
    return check;
  }

  /** Sign and submit a note, anchored to an act (for example the check just recorded). */
  protected async note(job: CheckJob, anchor: NoteAnchor, text: string, key: string): Promise<Result<Note>> {
    const s = await this.services();
    const signed = await signEnvelope(s.signer, {
      v: 1,
      room: job.room,
      actor: s.signer.key,
      kind: "note",
      target: anchor,
      body: { text: clip(text) },
      idempotencyKey: `${key}-${job.id}`.slice(0, 64),
      ...(s.delegation ? { delegation: s.delegation } : {}),
    });
    return (await s.room.submit(signed)) as Result<Note>;
  }
}


/**
 * The contract's `Checker` base class, implemented (plan section 5,
 * "Checkers"; R-EXEC, R-OBL-3, R-CARRY-6, R-CARRY-9).
 *
 * `handle(job)`:
 * 1. checks the job's binding before anything starts (`checkJob`);
 * 2. opens a runner sandbox, checks out the exact integration and confirms
 *    `HEAD`, the tree or the snapshot digest (`checkout`);
 * 3. calls the subclass's `run(job)`, which runs untrusted code only inside
 *    the sandbox;
 * 4. outside the sandbox, builds the `check` body bound to the generation,
 *    integration, input, configuration digest and runner digest, labels it
 *    machine-run, signs it with the service's delegation key, and submits
 *    it to the room.
 *
 * A subclass writes `run()` (and, for the LLM reviewer, `after()`).
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
import { checkJob, isRefusal, type BoundJob, type JobExpectations } from "./job.ts";
import { checkout, type CheckoutOptions, type Workspace } from "./runner.ts";
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

export abstract class Checker<Env = unknown> {
  protected readonly env: Env;
  protected readonly ctx: CheckerContext;
  abstract readonly name: string;
  /** True for checkers with volatile inputs; their checks never carry (R-CARRY-10). */
  abstract readonly volatile: boolean;
  /** One line saying what ran, shown at the top of the detail. */
  abstract readonly label: string;
  /** Commits to fetch: 1, or 2 when `run()` needs the parent. */
  protected readonly depth: number = 1;
  private readonly workspaces = new Map<string, Workspace>();
  private readonly sessions = new Map<string, RunnerSession>();

  constructor(ctx: CheckerContext, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  /** The key, room, runners and expectations, built from `env`. */
  protected abstract services(): CheckerServices | Promise<CheckerServices>;

  /** The check itself. Untrusted code runs only through `this.workspace(job).runner`. */
  abstract run(job: CheckJob): Promise<CheckOutcome>;

  /** Called after the check is recorded. The LLM reviewer posts its note here. */
  protected after(_job: CheckJob, _check: Check, _outcome: CheckOutcome): Promise<void> {
    return Promise.resolve();
  }

  /** The verified workspace of a job in progress. */
  protected workspace(job: CheckJob): Workspace {
    const ws = this.workspaces.get(job.id);
    if (!ws) throw new Error("no workspace for this job");
    return ws;
  }

  /** The runner session of a job in progress (for fetching more commits). */
  protected session(job: CheckJob): RunnerSession {
    const s = this.sessions.get(job.id);
    if (!s) throw new Error("no session for this job");
    return s;
  }

  async handle(job: CheckJob): Promise<Result<Check>> {
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
    try {
      const co = await checkout(session.runner, job, { ...session, depth: this.depth });
      if (!co.ok) {
        outcome = { ok: false, detail: `The runner could not confirm what it checked out, so nothing ran.\n${co.detail}` };
      } else {
        this.workspaces.set(job.id, co.ws);
        this.sessions.set(job.id, session);
        outcome = await this.run(job);
      }
    } catch (e) {
      throw unavailable(`the runner failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.workspaces.delete(job.id);
      this.sessions.delete(job.id);
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
    await this.after(job, check, outcome);
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


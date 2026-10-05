/**
 * The outcome store, and the record of at most one run for a job (authority
 * note, section 3.11, "Keeping an outcome" and "At most one run for a job").
 *
 * - **At most one run.** Before it starts a runner, the service makes a
 *   record that the job's run has started, keyed by the job's fact, by one
 *   write that creates the record only if it is absent. A delivery that
 *   finds the record, or whose write does not create it, starts no runner.
 * - **An outcome is kept durably**, by the job's fact, before anything is
 *   signed for it, until the lane has admitted it or the job is superseded.
 *   A result that the lane refused for now is submitted again later. The
 *   computation is not run again.
 *
 * The claim is "at most one", and it rests on this store alone. If the
 * storage behind it is lost, a second run can start, and nothing here
 * claims otherwise.
 *
 * `Durable` is the storage's side: three calls, each one atomic write or
 * read of one key. No adapter for a real storage is here: a deployment has
 * none until the checker service is deployed (plan question Q8). Test
 * support has a stand-in.
 *
 * What the store holds: the job's fact, the run's name, the signed request
 * for the read token, the outcome with its details, and the last signed
 * result. None is a secret. No key, no token and no text of a run's output
 * is ever written here.
 */

import type { FactRef, SignedIntent } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import type { Details, Outcome } from "./outcome.ts";

/** The storage's side. Each call is atomic for its key, and resolves only when its effect is durable. */
export interface Durable {
  /** Write the value only if the key is absent. True: this call created it. */
  create(key: string, value: string): Promise<boolean>;
  read(key: string): Promise<string | null>;
  /** Write `next` only if the key holds exactly `expected`. True: this call wrote it. */
  replace(key: string, expected: string, next: string): Promise<boolean>;
}

/**
 * One job's record.
 *
 * | State | Means |
 * |---|---|
 * | `started` | The run's record was made. A runner may be running. No second one starts. |
 * | `kept` | The run ended, and its outcome is kept. It is signed and submitted, again if need be. |
 * | `admitted` | The lane admitted a result for the job. Nothing more is submitted. |
 * | `superseded` | A retry superseded the job. Nothing more is submitted. |
 */
export interface JobRecord {
  job: FactRef;
  state: "started" | "kept" | "admitted" | "superseded";
  /** The service's record of this run: a name made when the record was made. */
  run: string;
  /** The signed request for the step `job-read`, kept so that a repeat sends the same intent (section 3.11: "a repeat is answered with the first"). */
  asked: SignedIntent | null;
  outcome: Outcome | null;
  details: Details | null;
  /** The last signed result that was submitted. The same bytes are sent first on a later submit: a lane that admitted them answers with their receipt. */
  signed: SignedIntent | null;
}

const keyOf = (job: FactRef): string => `job/${job.at.scope}/${job.at.inc}/${job.seq}/${job.hash}`;

export class Outcomes {
  readonly #durable: Durable;
  constructor(durable: Durable) { this.#durable = durable; }

  /**
   * The one write that makes the record of a job's run. True: this delivery
   * made it, and it alone may start a runner. False: a record exists, or
   * the write did not create one, and this delivery starts no runner.
   */
  start(job: FactRef, run: string, asked: SignedIntent | null): Promise<boolean> {
    const record: JobRecord = { job, state: "started", run, asked, outcome: null, details: null, signed: null };
    return this.#durable.create(keyOf(job), canonicalize(record));
  }

  async get(job: FactRef): Promise<JobRecord | null> {
    const kept = await this.#durable.read(keyOf(job));
    return kept === null ? null : (JSON.parse(kept) as JobRecord);
  }

  /** One change of a record, from exactly the record that was read. False: another delivery changed it first, and this one changes nothing. */
  #move(from: JobRecord, to: JobRecord): Promise<boolean> {
    return this.#durable.replace(keyOf(from.job), canonicalize(from), canonicalize(to));
  }

  /**
   * Keep the outcome of a job's one run. Only a `started` record takes one,
   * and only once: an outcome is never replaced, so a second report for the
   * same job changes nothing.
   */
  async keep(job: FactRef, outcome: Outcome, details: Details | null): Promise<boolean> {
    const record = await this.get(job);
    return record !== null && record.state === "started" && this.#move(record, { ...record, state: "kept", outcome, details });
  }

  /** Note the signed result that is about to be submitted, before it is. */
  async signed(job: FactRef, signed: SignedIntent): Promise<boolean> {
    const record = await this.get(job);
    return record !== null && record.state === "kept" && this.#move(record, { ...record, signed });
  }

  /** The lane admitted the result, or a retry superseded the job. The outcome stays in the record: a page reads its details by the job's fact. */
  async close(job: FactRef, state: "admitted" | "superseded"): Promise<boolean> {
    const record = await this.get(job);
    return record !== null && (record.state === "kept" || (record.state === "started" && state === "superseded")) && this.#move(record, { ...record, state });
  }
}

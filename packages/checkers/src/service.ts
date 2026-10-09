/**
 * The checker service (authority note, section 3.11; I3 plan, step 25): one
 * delivery of one notice, from the origin read to the submitted result. It
 * is a separate service with its own key, and it is not a scope. It writes
 * no entry: it reads scopes, asks one lane for one step, and submits signed
 * acts, as any member's client does.
 *
 * **The order of one delivery**, and what each step may cause:
 *
 * 1. *The origin read.* The service reads the job's entry and its manifest's
 *    entry from the lane, the lane's pinned definition, and the rules
 *    scope's item for that definition (`job.ts`). Not a job: nothing is run
 *    and nothing is signed.
 * 2. *The record of the run.* One write that creates the job's record only
 *    if it is absent (`store.ts`). A delivery that does not create it starts
 *    no runner. While the delivery that made the record is at work in this
 *    process, it waits. Otherwise it looks for the end of the run that the
 *    record names, in the runner's own record.
 * 3. *The configuration.* Fetched from the rules scope by the job's digest,
 *    and read only when the bytes hash to it (`configuration.ts`).
 *    Otherwise no run: `check-error`, `configuration-unavailable`.
 * 4. *The read token.* The service asks the lane for the step `job-read`,
 *    with a request that it signed in step 2 and keeps. The lane mints the
 *    token. Its plaintext goes from the mint's answer to the runner's
 *    gateway, and is never given to this code or to the runner. With no
 *    token no runner starts.
 * 5. *The run.* One runner, for this job alone. Its input is `RunAsk`: the
 *    run's name, the job as read, and the configuration. No key, no token
 *    and no member of a notice is in it.
 * 6. *The judgment.* `judge` maps what the runner returned to what is
 *    signed (`outcome.ts`). What the runner returned is data.
 * 7. *The outcome is kept*, durably, with the record of what ran, before
 *    anything is signed.
 * 8. *The signature*, by the checker's key, in this process, outside the
 *    runner (`signing.ts`).
 * 9. *The submit.* Admitted: the record is closed. Refused for now, such as
 *    during a merge, or not answered: the outcome stays kept, and a later
 *    delivery submits it again. The computation is not run again.
 *
 * **A late result.** The service signs and submits an outcome whenever it
 * has one, also after the job's deadline: the deadline ended the lane's
 * waiting and proved nothing about the run. The lane decides what the answer
 * does (section 6.3). On a job that is `timed-out` and that no retry has
 * superseded, the first authentic answer decides the job, and its entry
 * becomes the job's deciding entry. On a job that is already decided it is
 * history only. On a superseded job the lane admits nothing that decides,
 * and the service stops submitting once it reads that state.
 *
 * **A lost run.** When the run's end cannot be found, because this process
 * or the runner's own record was lost, the service signs `check-error`,
 * `run-lost`, and still starts no second run. A job whose record was made
 * and whose runner never started has no run: that is also `run-lost`. A
 * retry is a new job. `run-lost` does not show that the run stopped, or
 * that its read token is no longer in use.
 *
 * **A checker that the rules do not name** gets nothing. At the rules scope
 * a `publish` that names a member who is not an active member with the role
 * `checker` is refused `not-a-checker`, so no rules name such a member
 * (`packages/platform/src/rules-scope.ts`). At the lane, a signer without
 * `change.check` is refused `unauthorized`; a signer who holds it and is not
 * the checker that the lane's copy of the rules names for that check is
 * refused the read token, and its `check` or `check-error` is refused
 * `not-the-checker`. Nothing is recorded for any of them.
 */

import type { ReservationSnapshot, Answer, Digest, PlatformDefinition, ScopeRef, Sealed, SignedIntent } from "@generalbusiness/artroom-contract";
import { b64url, isRecord } from "@generalbusiness/artroom-bytes";
import { readConfiguration, type Configuration } from "./configuration.ts";
import { verifyReservationObjects } from "./reservation-snapshot.ts";
import { manifestOf, originOf, type Job, type NotAJob, type Notice } from "./job.ts";
import { judge, provenanceOf, readReport, type Details, type Outcome } from "./outcome.ts";
import { JOB_READ, signJobRead, signResult, type ResultSigner } from "./signing.ts";
import type { JobRecord, Outcomes } from "./store.ts";

/**
 * The service's side of the scope namespace. Each read is the service's own
 * read of a scope, with its read session. A read that cannot be made
 * rejects: unreadable is never reported as absent.
 *
 * The rules scope is the one that the service is configured with, for the
 * one repository that its key is a checker of (section 5.5, "One key for
 * one member"; I3 deltas, entry EW15). No notice and no lane names it.
 */
export interface Scopes {
  reservationSnapshot?(lane: ScopeRef, signed: SignedIntent): Promise<ReservationSnapshot | { refused: "reservation-stage-missing" | "reservation-stage-mismatch" } | null>;
  /** The lane's entry at that position, with the hash that the lane serves for it. Null: the lane has none. */
  entry(lane: ScopeRef, seq: number): Promise<Sealed | null>;
  /** The definition that the lane pins. */
  pinned(lane: ScopeRef): Promise<Digest | PlatformDefinition | null>;
  /** The rules scope's item for a definition's digest: its name and its state. Null: it holds none. */
  activated(definition: Digest): Promise<{ name: string; state: string } | null>;
  /** The bytes that the rules scope retains under a configuration's digest, as canonical JSON text. Null: it retains none. */
  configuration(digest: Digest): Promise<string | null>;
  /** The job's state now, and the revision of each item that the act names: what the signed result states as `expected`. Null: the lane holds no such job. */
  standing(lane: ScopeRef, job: number, act: Outcome["act"]): Promise<{ state: string; expected: Record<string, number> } | null>;
  /** Ask the lane for one step of a capability. */
  prepare(lane: ScopeRef, signed: SignedIntent, capability: string, step: string): Promise<Answer>;
  /** Submit one signed act to the lane. */
  submit(lane: ScopeRef, signed: SignedIntent): Promise<Answer>;
}

/**
 * The input of one run: everything a runner is given. The run's name, the
 * job as the service read it from the lane, and the configuration that
 * hashed to the job's digest. It holds no key, no token and nothing that a
 * notice carried.
 */
export interface RunAsk { run: string; job: Job; configuration: Configuration }

/**
 * The runner's side: one container for one run, started from the
 * configuration's image with exactly the configuration's variables, with no
 * network but its gateway (`sandbox.ts`). No adapter for a real runner is
 * here (plan question Q8). Test support has a stand-in.
 */
export interface Runner {
  /** Start one runner for the run, and resolve with what it returned at its end. The value is data: `judge` reads it. Rejects, or never resolves, when the runner or this call is lost. */
  run(ask: RunAsk): Promise<unknown>;
  /** The runner's own record of a run that this delivery did not start: `running`, what the run returned at its end, or null when no record of it can be found. */
  find(run: string): Promise<unknown | null>;
}

export interface ServiceOptions {
  signer: ResultSigner;
  scopes: Scopes;
  runner: Runner;
  outcomes: Outcomes;
  /** The service's clock, in milliseconds, for the `notAfter` of what it signs. */
  clock: () => number;
  /** Random bytes, for a run's name and an intent's idempotency key. */
  random: (length: number) => Uint8Array;
  /** Told each step that failed, by fixed words only. Never an error's text, an output or a credential. */
  log?: (event: { step: string; event: string }) => void;
}

/** What one delivery did. */
export type Delivered =
  /** Nothing was run and nothing was signed: the notice names no job, or a read could not be made, or the job's record is closed. */
  | { did: "nothing"; why: NotAJob | "unreadable" | "closed" }
  /** Another delivery's run of this job is in progress. This one started no runner. */
  | { did: "waiting" }
  /** An outcome is kept and was submitted. `ran`: this delivery started the job's one runner. */
  | { did: "submitted"; outcome: Outcome; ran: boolean; lane: "admitted" | "kept" | "superseded" };

export const RUNNING = "running";

const flightOf = (job: Job): string => `${job.fact.at.scope}/${job.fact.at.inc}/${job.fact.seq}/${job.fact.hash}`;

export class CheckerService {
  readonly #o: ServiceOptions;
  /**
   * The jobs whose one run this process started and has not concluded, by
   * the job's fact. In memory only. A delivery that finds its job here
   * waits: the delivery that made the record is still at work, in this
   * process, between the record and the run's end. A restart empties it.
   * Then the record alone says that a run started, and the runner's own
   * record says what became of it.
   */
  readonly #flying = new Set<string>();
  constructor(options: ServiceOptions) { this.#o = options; }

  #log(step: string, event: string): void { this.#o.log?.({ step, event }); }
  #signing() { return { now: this.#o.clock(), nonce: this.#o.random(16) }; }

  /** One notice of one job. It never rejects for what a scope, a runner or a notice did: each failure is a fixed word in the log. */
  async deliver(notice: Notice): Promise<Delivered> {
    // 1. The origin read: the service's own reads, and nothing of the notice but what to read.
    let job: Job;
    // A notice that is not in form names nothing to read.
    const form = originOf(notice, { entry: null, pinned: null, activated: null, manifest: null });
    if ("not" in form && form.not === "bad-notice") return { did: "nothing", why: "bad-notice" };
    try {
      const { scopes } = this.#o;
      const entry = await scopes.entry(notice.lane, notice.job.seq);
      const at = manifestOf(entry, notice.job);
      const pinned = await scopes.pinned(notice.lane);
      const activated = typeof pinned === "string" && pinned.startsWith("sha256:") ? await scopes.activated(pinned as Digest) : null;
      const manifest = at === null ? null : await scopes.entry(notice.lane, at);
      const listManifest = manifest?.entry.input.type === "act" && Array.isArray(manifest.entry.input.signed.intent.fields["files"]);
      const previous = listManifest ? await this.#o.outcomes.get(notice.job) : null;
      if (previous?.state === "admitted" || previous?.state === "superseded") return { did: "nothing", why: "closed" };
      let reservation: ReservationSnapshot | null = previous?.reservation ?? null;
      if (listManifest && !reservation && scopes.reservationSnapshot) {
        const asked = await signJobRead(this.#o.signer, { lane: notice.lane, fact: notice.job }, this.#signing());
        const answer = await scopes.reservationSnapshot(notice.lane, asked);
        if (answer && "refused" in answer) return { did: "nothing", why: answer.refused };
        reservation = answer;
      }
      if (listManifest && (!reservation || !await verifyReservationObjects(reservation))) return { did: "nothing", why: "no-manifest" };
      const origin = originOf(notice, { ...(reservation ? { reservation } : {}), entry, pinned, activated, manifest });
      if ("not" in origin) return { did: "nothing", why: origin.not };
      job = origin.job;
    } catch {
      this.#log("origin", "unreadable");
      return { did: "nothing", why: "unreadable" };
    }

    // 2. The record of the run: one write that creates it only if it is absent.
    const { outcomes } = this.#o;
    let record = await outcomes.get(job.fact);
    if (record === null) {
      const run = b64url(this.#o.random(16));
      const asked = await signJobRead(this.#o.signer, job, this.#signing());
      if (await outcomes.start(job.fact, run, asked, job.snapshot)) {
        // Nothing waits between the write that made the record and this mark.
        const key = flightOf(job);
        this.#flying.add(key);
        try {
          return await this.#first(job, run, asked);
        } finally {
          this.#flying.delete(key);
        }
      }
      record = await outcomes.get(job.fact);
      if (record === null) return { did: "nothing", why: "unreadable" };
    }
    // A record exists. This delivery starts no runner, whatever follows.
    if (record.state === "admitted" || record.state === "superseded") return { did: "nothing", why: "closed" };
    if (record.state === "started") {
      // The delivery that made the record is at work in this process: its run has not ended, or has not begun.
      if (this.#flying.has(flightOf(job))) return { did: "waiting" };
      let found: unknown;
      try {
        found = await this.#o.runner.find(record.run);
      } catch {
        // The runner's record could not be read now. That is not "no record": nothing is concluded.
        this.#log("find", "unreadable");
        return { did: "waiting" };
      }
      if (found === RUNNING) return { did: "waiting" };
      // The run's end as its own record has it, or no record at all: `run-lost`. No second run in either case.
      await this.#conclude(job, record.run, await this.#configuration(job), found);
    }
    return this.#submit(job, false);
  }

  /** The configuration that hashes to the job's digest, fetched from the rules scope, or null. */
  async #configuration(job: Job): Promise<Configuration | null> {
    try {
      return readConfiguration(await this.#o.scopes.configuration(job.configuration), job.configuration);
    } catch {
      this.#log("configuration", "unreadable");
      return null;
    }
  }

  /** Steps 3 to 9, for the delivery that made the job's record. */
  async #first(job: Job, run: string, asked: SignedIntent): Promise<Delivered> {
    const configuration = await this.#configuration(job);
    let report: unknown = null;
    let ran = false;
    if (configuration !== null) {
      // 4. The read token. Without it no runner starts: the run has no end to find, which is `run-lost`.
      let token: Answer | null = null;
      try {
        token = job.snapshot ? null : await this.#o.scopes.prepare(job.lane, asked, JOB_READ.capability, JOB_READ.step);
      } catch {
        this.#log("job-read", "no-answer");
      }
      // The lane's answer is read as data: a value that is no answer is no token, and the log holds one of four fixed words.
      const answered = isRecord(token) ? token["answer"] : null;
      if (job.snapshot || answered === "accepted") {
        ran = true;
        try {
          // 5. The one run of this job.
          report = await this.#o.runner.run({ run, job, configuration });
        } catch {
          // Not the error: a runner's text is data, and may repeat anything. The run's end was not found.
          this.#log("run", "lost");
          report = null;
        }
      } else if (token !== null) this.#log("job-read", answered === "refused" || answered === "unavailable" || answered === "mismatch" ? answered : "no-answer");
    }
    await this.#conclude(job, run, configuration, report);
    return this.#submit(job, ran);
  }

  /**
   * Steps 6 and 7: the outcome of the run, kept with the record of what ran. An outcome that is already kept is not replaced.
   *
   * The report is read once, into a value that canonical bytes can hold (`readReport`), and the judgment and the record of what ran
   * are both made from that one reading. A report that is not in form is `report-malformed`, with a record of what ran that repeats
   * nothing of it. So nothing that a runner returned can fail between the record of the run and the kept outcome, at the run's own
   * delivery or at a later one that finds the same report: the outcome is kept and signed, and no second run starts.
   */
  async #conclude(job: Job, run: string, configuration: Configuration | null, report: unknown): Promise<void> {
    const lost = report === null || report === undefined;
    const read = lost ? null : readReport(report);
    const outcome: Outcome = configuration === null ? { act: "check-error", reason: "configuration-unavailable" } : lost ? { act: "check-error", reason: "run-lost" } : judge(configuration, read);
    const details: Details | null = configuration === null ? null : { provenance: provenanceOf(job, configuration, read, run) };
    await this.#o.outcomes.keep(job.fact, outcome, details);
  }

  /** Steps 8 and 9, for the outcome that the store keeps. */
  async #submit(job: Job, ran: boolean): Promise<Delivered> {
    const { outcomes, scopes } = this.#o;
    const record = await outcomes.get(job.fact);
    if (record === null || record.outcome === null || record.state === "started") return { did: "nothing", why: "unreadable" };
    const done = (lane: "admitted" | "kept" | "superseded"): Delivered => ({ did: "submitted", outcome: record.outcome!, ran, lane });
    if (record.state !== "kept") return done(record.state);
    try {
      // The exact bytes that were submitted before, first: a lane that admitted them answers with their receipt and writes nothing.
      if (record.signed !== null && (await scopes.submit(job.lane, record.signed)).answer === "accepted") return (await outcomes.close(job.fact, "admitted"), done("admitted"));
      const standing = await scopes.standing(job.lane, job.fact.seq, record.outcome.act);
      if (standing === null) return done("kept");
      if (standing.state === "superseded") return (await outcomes.close(job.fact, "superseded"), done("superseded"));
      const signed = await signResult(this.#o.signer, job, record.outcome, record.details, standing.expected, this.#signing());
      // Noted before it is sent, so that a lost answer is asked again with the same bytes.
      if (!(await outcomes.signed(job.fact, signed))) return done("kept");
      const answer = await scopes.submit(job.lane, signed);
      if (answer.answer === "accepted") return (await outcomes.close(job.fact, "admitted"), done("admitted"));
      this.#log("submit", answer.answer === "refused" ? `refused ${answer.reason}` : answer.answer);
    } catch {
      this.#log("submit", "no-answer");
    }
    return done("kept");
  }
}

export type { JobRecord };

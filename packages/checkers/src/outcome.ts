/**
 * What the checker signs, by what happened (authority note, section 3.11,
 * the table of that name, and "What ran"). `judge` is a pure function of a
 * configuration and of what the runner returned. It is the whole mapping:
 * the service signs nothing that this function does not answer.
 *
 * **What the runner returns is data.** A `RunReport` is read as untrusted
 * values: only a well-formed report counts, and a report that is not well
 * formed is an error of the run. Nothing in it is followed or shown as an
 * instruction. No text of the run's output is in an outcome or in the
 * details: a judgment reads the judging step's exit status and its one last
 * line, and compares both with the configuration's own.
 *
 * **A judged pass and a judged fail come only from a judging step that
 * ended with a complete report.** Every other end is an error of the run:
 * `check-error`, with a reason. An error is not a failed check, and it is
 * never a pass.
 *
 * The reasons. Four are the note's words: `configuration-unavailable`,
 * `image-mismatch`, `image-unresolved` and `run-lost`. The note says of the
 * rest "`check-error`, with that reason", or "naming the step", and gives no
 * word. The words here are this package's (I3 deltas, entry EW14).
 */

import type { Digest, FactRef } from "@generalbusiness/artroom-contract";
import { canonicalBytes, digestBytes, isDigest, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import { environmentDigest, exactly, type Configuration, type Variable } from "./configuration.ts";

/** The reasons of a `check-error` that names no step. */
export const ERRORS = [
  "configuration-unavailable", "image-mismatch", "image-unresolved", "run-lost",     // the note's words
  "environment-mismatch", "checkout-unconfirmed", "runner-not-started", "runner-lost", "limits-passed", "report-malformed", "judgment-unreadable",
] as const;
export type ErrorReason = (typeof ERRORS)[number] | `step-failed:${number}`;

/** One step, as the runner reports it. `status` null: the step did not end. `line`: the last line of its output, or null when it wrote none. */
export interface StepReport { status: number | null; line: string | null }

/**
 * What a runner returned for one run. Every member is the runner's or the
 * container platform's statement, and is read as data.
 *
 * - `started`: false when no runner started for the run.
 * - `image`: the content digest of the image that the runner started from,
 *   as the container platform reported it for that start. Null: the
 *   platform reported none. It is never a value that the runner's own
 *   processes computed.
 * - `environment`: the variables that the runner was started with.
 * - `checkout`: whether the checkout was confirmed as the job's commit,
 *   tree and base, before any step ran (`runner.ts`).
 * - `steps`: the steps that ran, in order. A step that did not run is not
 *   listed.
 * - `end`: `complete` when every listed step ended and the runner's own
 *   record of the run was read whole; `lost` when the runner was lost;
 *   `limits` when it passed the configuration's time or output.
 */
export interface RunReport {
  started: boolean;
  image: Digest | null;
  environment: readonly Variable[];
  checkout: boolean;
  steps: readonly StepReport[];
  end: "complete" | "lost" | "limits";
}

/** What ran (section 3.11, `RunProvenance`), member for member. The service's key signs it, through the digest of the details. */
export interface RunProvenance {
  job: FactRef;
  tree: string;
  configuration: Digest;
  image: { declared: Digest; resolved: Digest | null };
  environment: Digest;
  /** Each step by its name, which is its position in the configuration, counted from 1, as text. `status` null: the step did not end, or did not run. */
  steps: readonly { name: string; status: number | null }[];
  /** The checker service's record of this run. */
  run: string;
}

/** The details of a result: the record of what ran, and nothing else (I3 deltas, entry EW13). The `check` intent signs their digest. */
export interface Details { provenance: RunProvenance }
export const detailsDigest = (details: Details): Digest => digestBytes(canonicalBytes(details));

/** What the service signs for a job: a `check` with its outcome, or a `check-error` with its reason. */
export type Outcome = { act: "check"; outcome: "passed" | "failed" } | { act: "check-error"; reason: ErrorReason };

const error = (reason: ErrorReason): Outcome => ({ act: "check-error", reason });

/**
 * The most that a report may hold and still be read. A report is the
 * runner's value, so its size is bounded before anything walks it. The
 * numbers are this package's: no text states one (I3 deltas, entry EZ1).
 * The first two are far above a configuration's own maxima, so a report
 * of more variables or steps than any configuration has is still read,
 * and is answered by its own row of the table.
 */
export const REPORT_BOUNDS = { variables: 1024, steps: 1024, textBytes: 64 * 1024 } as const;

/** A string that canonical bytes can hold, within the bound: no lone surrogate. */
const text = (v: unknown): v is string => typeof v === "string" && v.length <= REPORT_BOUNDS.textBytes && wellFormed(v) && utf8(v).length <= REPORT_BOUNDS.textBytes;
/** A status that canonical bytes can hold: a safe integer, and never negative zero. */
const status = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && !Object.is(v, -0);
/** The elements of an array of at most `max`, each read once by its index, so that a hole is read as the absent value that it is. Null: no such array. */
const listed = (v: unknown, max: number): unknown[] | null => (Array.isArray(v) && v.length <= max ? Array.from({ length: v.length }, (_, k): unknown => v[k]) : null);

/**
 * The report that a value is, as a new plain value, or null when it is not
 * in the form of a `RunReport`. It never throws.
 *
 * The form is exact: the six members and no other, each variable its two
 * and each step its two; every string well formed and within
 * `REPORT_BOUNDS`; every status a safe integer that is not negative zero;
 * no hole in a list. So what is returned can be written as canonical bytes
 * (`packages/bytes/src/canonical.ts`), and the judgment, the record of what
 * ran and the store, which all write such bytes, cannot fail on it.
 *
 * Each member of the value is read once, and what is returned shares
 * nothing with it. A caller that judges a report and records what ran
 * reads it once and gives both the same copy.
 */
export function readReport(v: unknown): RunReport | null {
  try {
    if (!exactly(v, ["started", "image", "environment", "checkout", "steps", "end"])) return null;
    const { started, image, checkout, end } = v;
    if (typeof started !== "boolean" || typeof checkout !== "boolean" || !(image === null || isDigest(image))) return null;
    if (end !== "complete" && end !== "lost" && end !== "limits") return null;
    const variables = listed(v["environment"], REPORT_BOUNDS.variables);
    const ran = listed(v["steps"], REPORT_BOUNDS.steps);
    if (variables === null || ran === null) return null;
    const environment: Variable[] = [];
    for (const x of variables) {
      if (!exactly(x, ["name", "value"])) return null;
      const { name, value } = x;
      if (!text(name) || !text(value)) return null;
      environment.push({ name, value });
    }
    const steps: StepReport[] = [];
    for (const s of ran) {
      if (!exactly(s, ["status", "line"])) return null;
      const { status: ended, line } = s;
      if (!(ended === null || status(ended)) || !(line === null || text(line))) return null;
      steps.push({ status: ended, line });
    }
    return { started, image, environment, checkout, steps, end };
  } catch {
    // A value that fails while it is read, such as a member that throws, is no report.
    return null;
  }
}

/** True when the value has the form of a `RunReport`. A report in any other form is `report-malformed`. */
export const isRunReport = (v: unknown): v is RunReport => readReport(v) !== null;

/**
 * The outcome of one run, by the table of section 3.11, in its order. The
 * first row that fits decides.
 *
 * 1. No well-formed report: `report-malformed`.
 * 2. No runner started: `runner-not-started`.
 * 3. The platform reported no image digest: `image-unresolved`. Another
 *    image than the configuration names: `image-mismatch`.
 * 4. The runner was started with other variables than the configuration's
 *    own list: `environment-mismatch`. This is the guard of "What ran": no
 *    pass and no fail is signed for an image or an environment other than
 *    the one the rules name.
 * 5. The runner was lost, or passed its limits: `runner-lost`,
 *    `limits-passed`.
 * 6. The checkout was not confirmed as the job's tree:
 *    `checkout-unconfirmed`. No step counts after it.
 * 7. A step before the judging step ended with a status that is not 0, or
 *    did not end: `step-failed`, naming the step. An install that fails is
 *    this case.
 * 8. The judging step did not run or did not end, or more steps are
 *    reported than the configuration has: `judgment-unreadable`.
 * 9. The judging step ended with the status and the last line of "passed":
 *    `check`, passed. With those of "failed": `check`, failed. With any
 *    other status, or a status and a last line that disagree:
 *    `judgment-unreadable`.
 */
export function judge(configuration: Configuration, given: unknown): Outcome {
  const report = readReport(given);
  if (report === null) return error("report-malformed");
  if (!report.started) return error("runner-not-started");
  if (report.image === null) return error("image-unresolved");
  if (report.image !== configuration.image) return error("image-mismatch");
  if (environmentDigest(report.environment) !== environmentDigest(configuration.environment)) return error("environment-mismatch");
  if (report.end === "lost") return error("runner-lost");
  if (report.end === "limits") return error("limits-passed");
  if (!report.checkout) return error("checkout-unconfirmed");
  const last = configuration.steps.length - 1;
  if (report.steps.length > configuration.steps.length) return error("judgment-unreadable");
  for (let k = 0; k < last; k++) if (report.steps[k]?.status !== 0) return error(`step-failed:${k + 1}`);
  const judging = report.steps[last];
  if (judging === undefined || judging.status === null || judging.line === null) return error("judgment-unreadable");
  const { passed, failed } = configuration.judged;
  if (judging.status === passed.status && judging.line === passed.line) return { act: "check", outcome: "passed" };
  if (judging.status === failed.status && judging.line === failed.line) return { act: "check", outcome: "failed" };
  return error("judgment-unreadable");
}

/**
 * The record of what ran, from the job, the configuration that was read and
 * the report. A report that is not well formed gives a record with no
 * resolved image, the digest of no variables and no step that ended:
 * nothing of it is repeated, and the record is canonical whatever the
 * report held. With no
 * configuration there is no record: nothing was declared, and nothing ran.
 *
 * `image.resolved` is null when the platform reported none. The note's type
 * has a digest there, and its table has the case "No resolved value" (I3
 * deltas, entry EW13).
 */
export function provenanceOf(job: { fact: FactRef; tree: string; configuration: Digest }, configuration: Configuration, report: unknown, run: string): RunProvenance {
  const read = readReport(report);
  return {
    job: job.fact, tree: job.tree, configuration: job.configuration,
    image: { declared: configuration.image, resolved: read?.image ?? null },
    environment: environmentDigest(read?.started ? read.environment : []),
    steps: configuration.steps.map((_, k) => ({ name: String(k + 1), status: read?.steps[k]?.status ?? null })),
    run,
  };
}

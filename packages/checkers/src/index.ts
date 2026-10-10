/**
 * @generalbusiness/artroom-checkers
 *
 * The checker service (authority note, sections 3.11, 5.5 and 6.3; I3 plan,
 * step 25). It is a separate service with its own key, and it is not a
 * scope. The review that each retained part passed is
 * `notes/2026-10-05-i3-checkers-review.md`.
 *
 * - `job`: the origin read.
 * - `configuration`: a check's configuration, read from its bytes.
 * - `outcome`: what the checker signs, by what happened.
 * - `store`: the record of at most one run for a job, and the kept outcome.
 * - `signing`: the signer, outside the runner.
 * - `service`: one delivery of one notice.
 * - `runner`: the checkout, and the order of the steps.
 * - `sandbox`: the runner's boundary and its gateway's grant.
 */

export { CONFIGURATION_BYTES, CONFIGURATION_DOMAIN, configurationDigest, environmentDigest, readConfiguration } from "./configuration.ts";
export type { Configuration, Judged, Variable } from "./configuration.ts";
export { CHANGE, manifestOf, originOf } from "./job.ts";
export type { Job, NotAJob, Notice, Origin, OriginRead } from "./job.ts";
export { ERRORS, REPORT_BOUNDS, detailsDigest, isRunReport, judge, provenanceOf, readReport } from "./outcome.ts";
export type { Details, ErrorReason, Outcome, RunProvenance, RunReport, StepReport } from "./outcome.ts";
export { Outcomes } from "./store.ts";
export type { Durable, JobRecord } from "./store.ts";
export { JOB_READ, signJobRead, signResult } from "./signing.ts";
export type { ResultSigner, Signing } from "./signing.ts";
export { CheckerService, RUNNING } from "./service.ts";
export type { Delivered, RunAsk, Runner, Scopes, ServiceOptions } from "./service.ts";
export { checkout, checkoutObjects, runSteps } from "./runner.ts";
export type { Checkout, CheckoutAsk, CheckoutReason, StepExec } from "./runner.ts";
export { CHECK_READ, readGrant, runnerGateway } from "./sandbox.ts";

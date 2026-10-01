/**
 * Refusals are values; failures are exceptions (plan section 5, principle 2).
 *
 * - A `Refusal` is a domain outcome: a policy rule or a platform invariant said
 *   no. It names the rule, the reason and, where one exists, the fix.
 * - An `ArtroomError` is a transport, authentication or infrastructure
 *   failure. It is thrown, and says whether a retry may succeed.
 *
 * `ArtroomError` is a shape, not a class: Workers RPC, HTTPS and MCP do not
 * preserve class identity across the wire. Use `isArtroomError` to test.
 */

import type { ActId, OpId, RuleId } from "./ids.ts";

/** Refusal rules that platform code raises. Policy refusals use the policy rule's ID. */
export type PlatformRule =
  // Envelope and admission (R-ADM, R-IDEM)
  | "invalid-body" //           the body does not match its kind's schema
  | "body-too-large" //         R-SIG-6
  | "not-member" //             the signing key belongs to no active member
  | "key-revoked" //            R-ADM-4
  | "delegation-invalid" //     expired, revoked, or the act is outside its grant (R-ADM-4, R-ADM-5)
  | "role-forbids" //           the member's role may not sign this kind (R-ADM-3)
  | "idempotency-mismatch" //   R-IDEM-3
  | "secret-detected" //        R-SEC-2
  | "invitation-invalid" //     unknown, expired, already used, or the secret does not match (R-GEN-6)
  | "key-in-use" //             a `join` signed by a key that is already bound or revoked (R-ADM-3c)
  // Lanes and leases (R-LANE)
  | "lane-unknown"
  | "lane-held" //              take-over of a lane that has a holder
  | "not-holder" //             R-LANE-3
  | "lease-fenced" //           the act carries an old lease generation (R-LANE-6)
  | "generation-moved" //       expectedGeneration is stale (R-LANE-4)
  | "scope-overlap" //          only in `lanes("exclusive")` rooms (R-POL-8)
  // Proposals and paths (R-PROP, R-PATH)
  | "glob-invalid"
  | "head-unknown" //           the head is not reachable in the lane's fork
  | "head-mismatch" //          the act names a head that is not this generation's head
  | "outside-claim" //          R-PROP-4
  | "diff-too-large" //         R-PROP-6
  | "policy-invalid" //         a proposed `.artroom/` file fails its schema or the profile (R-POL-1)
  | "land-in-progress" //       the lane already has a landing operation in flight
  | "recovery-scope" //         a configuration-recovery lane's scope or changed paths leave `.artroom/**` (R-ADMIN-5)
  | "workspace-not-ready" //    a workspace token was requested before the operation is ready (R-WS-2)
  // Review and check authority (R-OBL)
  | "not-authorized-reviewer"
  | "self-review"
  | "not-authorized-checker"
  | "check-binding" //          a check does not bind the expected integration, config or runner
  | "obligation-unknown"
  // Landing (R-LAND)
  | "obligation-open"
  | "objection-open" //         the default land rule (R-POL-7)
  // Roster (R-GEN, R-ADMIN)
  | "admin-required"
  | "last-admin"
  | "recovery-only"
  // Policy evaluation (R-EVAL)
  | "policy-budget-exceeded"
  | "policy-type-error";

/** A refusal. `act` is present when the refusal was recorded in the log (R-ADM-8). */
export interface Refusal {
  readonly refused: true;
  /** A platform rule, or the ID of the policy rule that refused. */
  readonly rule: PlatformRule | RuleId;
  /** One plain sentence: what was wrong. */
  readonly reason: string;
  /** One plain sentence: what to do instead. */
  readonly fix?: string;
  /** The recorded refusal's log entry, when it was recorded. */
  readonly act?: ActId;
  /** Present on lane refusals: the current state the caller should act on. */
  readonly current?: { readonly generation?: number; readonly leaseGeneration?: number; readonly op?: OpId };
}

/** Either the record the caller asked for, or a refusal. */
export type Result<T> = T | Refusal;

/** Codes for thrown failures. None of them is a domain outcome. */
export type ErrorCode =
  | "bad-request" //       malformed JSON, unknown kind, wrong envelope version
  | "unauthenticated" //   bad signature, unknown key, wrong room, bad or expired bearer/session
  | "forbidden" //         the credential cannot perform this read
  | "not-found" //         unknown room, lane, operation or act on a read
  | "payload-too-large"
  | "rate-limited" //      the room is throttling, or Artifacts limits were reached
  | "timeout" //           a wait or request exceeded its deadline; state may have changed
  | "unavailable" //       Artifacts, Sandbox or the room is temporarily unavailable
  | "policy-runtime" //    the evaluator hit an infrastructure limit; nothing was recorded (R-EVAL-5)
  | "internal";

/** A thrown failure. Nothing was recorded unless `recorded` says otherwise. */
export interface ArtroomError {
  readonly name: "ArtroomError";
  readonly code: ErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  /** Suggested wait before a retry, in milliseconds. */
  readonly retryAfterMs?: number;
  /** For `timeout`: the request may have been admitted. Retry with the same idempotency key. */
  readonly maybeRecorded?: boolean;
}

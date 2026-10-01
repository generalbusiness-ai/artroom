/**
 * A stand-in for the Room's admission of checker acts, for tests and the
 * live harness. It is not the Room (lane A). It does what the Room must do
 * for a checker's act, and no more:
 * - verifies the signature against the envelope's `actor` (R-SIG-5);
 * - admits only the checker service's key, and only `check` and `note`;
 * - for a `check`, refuses `check-binding` unless the body binds exactly the
 *   job the room issued: lane, generation, obligation, checker, integration,
 *   input and configuration digest (R-OBL-3);
 * - records the act and returns its record.
 */

import type { ActId, ActRecord, CheckJob, KeyId, MemberId, Refusal, Result, SignedEnvelope } from "@generalbusiness/artroom-contract";
import { canonicalize, sha256Hex } from "@generalbusiness/artroom-policy";
import type { RoomPort } from "./checker.ts";
import { verifyEnvelope } from "./signing.ts";

export interface LedgerOptions {
  /** The checker service's key. */
  readonly key: KeyId;
  /** The member the delegation acts for, for example `@ci`. */
  readonly member: MemberId;
  readonly now?: () => number;
  /** Called with each record admitted, for storage. */
  readonly persist?: (record: ActRecord, signed: SignedEnvelope) => void | Promise<void>;
}

const refuse = (rule: string, reason: string): Refusal => ({ refused: true, rule, reason });

export class Ledger implements RoomPort {
  private readonly o: LedgerOptions;
  private seq = 0;
  readonly jobs = new Map<string, CheckJob>();
  readonly records: ActRecord[] = [];
  private readonly byKey = new Map<string, ActRecord>();

  constructor(opts: LedgerOptions) {
    this.o = opts;
  }

  /** The room issued this job; a check must bind it. */
  issue(job: CheckJob): void {
    this.jobs.set(`${job.lane}/${job.generation}/${job.obligation}/${job.integration}`, job);
  }

  async submit(signed: SignedEnvelope): Promise<Result<ActRecord>> {
    if (!(await verifyEnvelope(signed))) throw { name: "ArtroomError", code: "unauthenticated", message: "bad signature", retryable: false };
    const e = signed.envelope;
    if (e.actor !== this.o.key) return refuse("not-member", "The signing key is not the checker service's.");
    const replay = this.byKey.get(`${e.actor}/${e.idempotencyKey}`);
    if (replay) return replay;
    const seq = ++this.seq;
    const id = `act_${seq}_${(await sha256Hex(new TextEncoder().encode(canonicalize(e as never)))).slice(0, 8)}` as ActId;
    const base = {
      id,
      seq,
      by: { via: "member" as const, member: this.o.member, role: "checker" as const, key: e.actor },
      at: new Date((this.o.now ?? Date.now)()).toISOString(),
      flags: [],
    };
    let record: ActRecord;
    if (e.kind === "check") {
      const b = e.body;
      const job = this.jobs.get(`${e.target.lane}/${e.target.generation}/${b.obligation}/${b.integration}`);
      if (!job) return refuse("check-binding", "No job was issued for this lane, generation, obligation and integration.");
      if (b.check !== job.check || b.config !== job.config || canonicalize(b.input as never) !== canonicalize(job.input as never)) {
        return refuse("check-binding", "The check does not bind the job's checker, configuration or input.");
      }
      if (new TextEncoder().encode(b.detail).length > 16 * 1024) return refuse("body-too-large", "The detail is over 16 KiB.");
      record = { ...base, kind: "check", lane: e.target.lane, generation: e.target.generation, ...b };
    } else if (e.kind === "note") {
      record = { ...base, kind: "note", anchor: e.target, text: e.body.text, ...(e.body.replyTo ? { replyTo: e.body.replyTo } : {}) };
    } else {
      return refuse("role-forbids", "A checker may sign only check and note acts.");
    }
    this.records.push(record);
    this.byKey.set(`${e.actor}/${e.idempotencyKey}`, record);
    await this.o.persist?.(record, signed);
    return record;
  }
}

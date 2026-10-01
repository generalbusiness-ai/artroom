/**
 * The landing engine: the narrow interface the Room hosts (plan section 8).
 *
 * `LandingCore` holds the state machine; this class does the asynchronous
 * work between its transactions: building integrations, minting and revoking
 * the 60 s publication token, pushing, and reading main back.
 *
 * The Room calls:
 * - `accept`, `laneChanged`, `policyActivated`, `abort`, `evaluate` and
 *   `after` synchronously, inside its own admission transactions;
 * - `reserve` synchronously (R-LAND-7);
 * - `prepare`, `publish` and `reconcile` asynchronously. `reconcile` is the
 *   alarm handler: it resolves a held slot first (R-PUB-7);
 * - `view`, `slot` and `status` to read state, and `nextDue` to set its alarm.
 */

import type {
  ActId,
  KeyId,
  LandOp,
  LaneId,
  OpId,
  PolicyVersion,
  PublicationSlot,
  Refusal,
  RetryReason,
  Seq,
  Sha,
} from "@generalbusiness/artroom-contract";
import type { Sql } from "../sql.ts";
import type { PushOutcome } from "../publisher/push-outcome.ts";
import { type IntegrateResult, LandingCore, toView } from "./core.ts";
import type { AcceptInput, LandRecord, LandingRoom, PublicationStatus, Readiness, ReserveResult } from "./types.ts";

/** Builds integrations, pushes them and reads main. The publisher sandbox implements it. */
export interface PublisherPort {
  /** Build `head` merged onto `expectedMain` (or `head` itself when it fast-forwards) and store it in the canonical repo. */
  integrate(req: {
    readonly op: OpId;
    readonly attempt: number;
    readonly lane: LaneId;
    readonly generation: number;
    readonly head: Sha;
    readonly expectedMain: Sha;
    /** Unix seconds for the merge commit's dates, so a rebuild gives the same commit. */
    readonly committedAt: number;
  }): Promise<IntegrateResult>;
  /** `git push --force-with-lease=refs/heads/main:<expectedMain> <integration>:refs/heads/main` with this token (R-PUB-4). */
  push(req: {
    readonly op: OpId;
    readonly n: number;
    readonly integration: Sha;
    /** Where the integration is stored, if the sandbox must fetch it again. */
    readonly integrationRef: string;
    readonly expectedMain: Sha;
    readonly token: string;
  }): Promise<PushOutcome>;
  /** Main on the canonical repository, read now. */
  readMain(): Promise<Sha>;
}

/** Canonical write tokens for one publication attempt each (R-PUB-3). */
export interface PublicationTokens {
  /** A write token on the canonical repo with the shortest lifetime Artifacts allows (60 s). */
  mint(): Promise<{ readonly id: string; readonly plaintext: string }>;
  revoke(id: string): Promise<boolean>;
}

/** Points between transactions where a test may stop the driver, as a crash would. */
export type FaultPoint =
  | "attempt-recorded" //  the attempt is durable; no token yet
  | "token-minted" //      the token ID is durable; nothing pushed
  | "push-in-flight" //    the push has started and is still running
  | "push-returned" //     the push answered; its outcome is not recorded
  | "token-revoked" //     outcome recorded, token revoked; main not read back
  | "read-back"; //        main was read; the result is not applied

export interface LandingOptions {
  readonly sql: Sql;
  readonly room: LandingRoom;
  readonly publisher: PublisherPort;
  readonly tokens: PublicationTokens;
  readonly now?: () => number;
  /** Tests only: throw here to stop the driver as a crash would. */
  readonly fault?: (point: FaultPoint, op: OpId) => void;
}

/** Thrown by a driver step after `kill()`: this engine instance is gone. */
export class EngineStopped extends Error {
  constructor() {
    super("this landing engine was stopped");
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Landing {
  readonly core: LandingCore;
  private readonly room: LandingRoom;
  private readonly publisher: PublisherPort;
  private readonly tokens: PublicationTokens;
  private readonly fault: (point: FaultPoint, op: OpId) => void;
  private readonly now: () => number;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly preparing = new Set<OpId>();
  private stopped = false;

  constructor(opts: LandingOptions) {
    this.now = opts.now ?? Date.now;
    this.core = new LandingCore(opts.sql, opts.room, this.now);
    this.room = opts.room;
    this.publisher = opts.publisher;
    this.tokens = opts.tokens;
    this.fault = opts.fault ?? (() => {});
  }

  /** Stop this instance, as an eviction or crash would. Later steps throw. */
  kill(): void {
    this.stopped = true;
  }

  private alive(): void {
    if (this.stopped) throw new EngineStopped();
  }

  // ---------------------------------------------------------- synchronous

  accept(input: AcceptInput): LandRecord | Refusal {
    return this.core.accept(input);
  }
  laneChanged(lane: LaneId, reason: RetryReason, fix?: string): LandRecord[] {
    return this.core.laneChanged(lane, reason, fix);
  }
  policyActivated(version: PolicyVersion): OpId[] {
    return this.core.policyActivated(version);
  }
  /**
   * Ask the Room again whether an operation is ready, for example after a
   * check arrives (R-LAND-4). The Room's answer may take awaits (policy
   * evaluation, hashing); it is applied only if the operation has not moved
   * on meanwhile.
   */
  async evaluate(id: OpId): Promise<LandOp | null> {
    await this.evaluateNow(id, true);
    return this.view(id);
  }

  private async evaluateNow(id: OpId, force = false): Promise<void> {
    this.alive();
    const due = this.core.readinessDue(id, force);
    if (!due) return;
    const op = this.core.get(id);
    if (!op) return;
    let r: Readiness;
    try {
      r = await this.room.readiness(op, due.integration);
    } catch (e) {
      this.alive();
      this.core.readinessFailed(id, due.attempt, message(e));
      return;
    }
    this.alive();
    this.core.applyReadiness(id, due.attempt, due.integration, r);
  }
  reserve(id: OpId): ReserveResult {
    return this.core.reserve(id);
  }
  abort(trigger: ActId, key: KeyId, at: Seq): LandRecord | null {
    return this.core.abort(trigger, key, at);
  }
  after(): { readonly op: OpId; readonly reservedAt: Seq } | null {
    return this.core.after();
  }
  view(id: OpId): LandOp | null {
    return this.core.view(id);
  }
  slot(): PublicationSlot {
    return this.core.slot();
  }
  status(): PublicationStatus | null {
    return this.core.status();
  }
  nextDue(): number | null {
    return this.core.nextDue();
  }

  /** Read main and record it. Call once before the first `accept`, and when the slot is free. */
  async refreshMain(): Promise<Sha> {
    const main = await this.publisher.readMain();
    this.alive();
    this.core.observeMain(main);
    return main;
  }

  // ---------------------------------------------------------- preparation

  /** Build the integration and apply it (R-LAND-4). Many operations may prepare at once. */
  async prepare(id: OpId): Promise<LandOp | null> {
    this.alive();
    if (this.preparing.has(id)) return this.view(id);
    const start = this.core.startPreparation(id);
    if (!start) return this.view(id);
    const op = this.core.get(id);
    if (!op) return null;
    this.preparing.add(id);
    try {
      let result: IntegrateResult;
      try {
        result = await this.publisher.integrate({
          op: id,
          attempt: start.attempt,
          lane: op.lane,
          generation: op.generation,
          head: start.head,
          expectedMain: start.expectedMain,
          committedAt: Math.floor(op.createdAt / 1000),
        });
      } catch (e) {
        result = { kind: "error", detail: message(e) };
      }
      this.alive();
      this.core.prepared(id, start.attempt, result);
      await this.evaluateNow(id);
    } finally {
      this.preparing.delete(id);
    }
    return this.view(id);
  }

  // ---------------------------------------------------------- publication

  /** One publication step at a time per engine. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /**
   * Drive the held publication one step: finish an abort attempt, read main
   * back when only that is due, or make one forward push and read back.
   * Returns false when nothing was due.
   */
  publish(): Promise<boolean> {
    return this.serial(() => this.publishStep());
  }

  private async publishStep(): Promise<boolean> {
    this.alive();
    const aborting = await this.enforceAbort();
    const readOnly = this.core.readBackDue();
    if (readOnly) {
      await this.readBackAndApply(readOnly.id, "after-push");
      return true;
    }
    const plan = this.core.beginPush();
    if (!plan) return aborting;
    this.fault("attempt-recorded", plan.op);

    let token: { readonly id: string; readonly plaintext: string };
    try {
      token = await this.tokens.mint();
    } catch (e) {
      this.alive();
      this.core.pushResult(plan.op, plan.n, { outcome: "error", detail: `token not minted: ${message(e)}` });
      await this.readBackAndApply(plan.op, "after-push");
      return true;
    }
    this.alive();
    this.core.pushToken(plan.op, plan.n, token.id);
    this.fault("token-minted", plan.op);

    // R-LAND-3: an abort attempt may have arrived while the token was minted.
    if (this.core.get(plan.op)?.abort) {
      this.core.pushResult(plan.op, plan.n, { outcome: "error", detail: "abort attempt before the push started" });
      await this.revokeLive(plan.op);
      return true;
    }

    const pending = this.publisher.push({
      op: plan.op,
      n: plan.n,
      integration: plan.integration,
      integrationRef: plan.integrationRef,
      expectedMain: plan.expectedMain,
      token: token.plaintext,
    });
    pending.catch(() => undefined);
    this.fault("push-in-flight", plan.op);
    let outcome: PushOutcome;
    try {
      outcome = await pending;
    } catch (e) {
      outcome = { outcome: "unknown", detail: `push did not answer: ${message(e)}` };
    }
    this.fault("push-returned", plan.op);
    this.alive();
    this.core.pushResult(plan.op, plan.n, outcome);
    await this.revokeLive(plan.op);
    this.fault("token-revoked", plan.op);
    await this.readBackAndApply(plan.op, "after-push");
    return true;
  }

  /**
   * Carry out an abort attempt (R-REV-5): revoke the publication tokens now,
   * even while a push is in flight, then record the `abort-attempt` event
   * saying whether every token was revoked. Not queued behind the publication
   * step, so it can race the push it is trying to stop. Returns true if it
   * recorded an event.
   */
  async enforceAbort(): Promise<boolean> {
    this.alive();
    const op = this.core.pendingAbort();
    if (!op) return false;
    await this.revokeLive(op.id);
    this.alive();
    this.core.abortRecorded(op.id, this.core.liveTokens(op.id).length === 0);
    return true;
  }

  /** Revoke every publication token of this operation that is not yet revoked. Best effort. */
  private async revokeLive(id: OpId): Promise<void> {
    for (const t of this.core.liveTokens(id)) {
      try {
        await this.tokens.revoke(t.tokenId);
        this.alive();
        this.core.tokenRevoked(id, t.n);
      } catch (e) {
        if (e instanceof EngineStopped) throw e;
        // Leave it: a later step revokes it. It expires within 60 s regardless,
        // and expiry decides nothing (R-PUB-2).
      }
    }
  }

  private async readBackAndApply(id: OpId, mode: "after-push" | "probe"): Promise<void> {
    let main: Sha;
    try {
      main = await this.publisher.readMain();
    } catch (e) {
      this.alive();
      if (mode === "after-push") this.core.readBackFailed(id, `main could not be read: ${message(e)}`);
      return;
    }
    this.fault("read-back", id);
    this.alive();
    this.core.readBack(id, main, mode);
  }

  /**
   * The alarm handler, and the first work after a restart (R-PUB-7):
   * 1. a held slot: revoke tokens a previous instance left live, read main
   *    back, then complete forward;
   * 2. reserve the next ready operation and publish it;
   * 3. start every preparation that is due.
   * Each call does a bounded amount of work; set the alarm to `nextDue()`.
   */
  reconcile(): Promise<void> {
    return this.serial(async () => {
      this.alive();
      const held = this.core.held();
      if (held) {
        await this.revokeLive(held.id);
        await this.readBackAndApply(held.id, "probe");
        for (let i = 0; i < 3 && this.core.held()?.id === held.id; i++) {
          if (!(await this.publishStep())) break;
        }
      }
      if (!this.core.held()) {
        try {
          if (this.core.main() === null) await this.refreshMain();
        } catch {
          // Main unknown: nothing can be accepted or reserved yet.
        }
        const r = this.core.reserveNext();
        if (r?.kind === "reserved") await this.publishStep();
      }
      const due = this.core.active().filter((o) => o.state === "accepted" || (o.state === "preparing" && o.integration === undefined));
      await Promise.all(due.map((o) => this.prepare(o.id)));
      // A built integration whose readiness answer was lost (a crash, a failed evaluation).
      const pending = this.core.active().filter((o) => o.state === "preparing" && o.readinessPending);
      await Promise.all(pending.map((o) => this.evaluateNow(o.id)));
    });
  }

  /**
   * Run `reconcile` until nothing changes, at most `rounds` times. For tests
   * and for a Room that wants to drive work to rest; the alarm calls
   * `reconcile` once per firing.
   */
  async settle(rounds = 20): Promise<void> {
    for (let i = 0; i < rounds; i++) {
      const before = this.fingerprint();
      await this.reconcile();
      if (this.fingerprint() === before) return;
    }
  }

  private fingerprint(): string {
    return JSON.stringify([this.core.slot(), this.core.active().map((o) => [o.id, o.state, o.attempts, o.integration, o.readinessPending, o.pushes?.length, o.nextAt])]);
  }

  /** Every non-terminal operation, as views. */
  activeViews(): LandOp[] {
    return this.core.active().map(toView);
  }
}

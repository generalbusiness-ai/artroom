/**
 * The landing engine: the narrow interface the Room hosts (plan section 8).
 *
 * `LandingCore` holds the state machine; this class does the asynchronous
 * work between its transactions: building integrations, minting and revoking
 * the 60 s publication token, pushing, and reading main back.
 *
 * The publication token is minted through the canonical mint ledger
 * (`publicationTokens`; protocol section 32, mint lane B). The ledger owns
 * the token from before its create request is sent until `pushToken`
 * claims it, in the transaction that records its ID on the push attempt.
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
import { type PushOutcome, outcomeNote } from "../publisher/push-outcome.ts";
import { type RepoHandle, withRetry } from "../artifacts.ts";
import { MINT_WAIT_MS, type MintLedger, errorNote } from "../mints.ts";
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

/** A publication token, as the mint ledger gives it to the engine: still the ledger's until `claim`. */
export interface PublicationToken {
  readonly id: string;
  readonly plaintext: string;
  /** Artifacts' reported expiry (ms), recorded with the landing's token row. */
  readonly expiresAt: number | null;
  /** Hand the token to the landing operation. Synchronous: `pushToken` calls it inside its transaction (R-MINT-4). */
  claim(): void;
  /** Revoke the token while the ledger still owns it (the claim did not commit). */
  release(): Promise<void>;
}

/** Canonical write tokens for one publication attempt each (R-PUB-3, R-MINT-1). */
export interface PublicationTokens {
  /** A write token on the canonical repo with the shortest lifetime Artifacts allows (60 s), recorded under `owner`. */
  mint(owner: string): Promise<PublicationToken>;
  revoke(id: string): Promise<boolean>;
}

/** The publication token's lifetime, in seconds (R-PUB-3): unchanged by the mint ledger. */
export const PUBLICATION_TTL_S = 60;

/**
 * Publication tokens through the canonical mint ledger (R-MINT-1 to
 * R-MINT-4). Each mint is the ledger's: one durable record and a stored
 * wake-up before each create request, any retry a new record, and a 30 s
 * bounded wait. The engine never retries a mint itself. A revocation is by
 * the token's ID: the repository lookup and the revocation, with
 * `withRetry`'s retries of a transient error, share one bounded wait. Once
 * it has run out, nothing more is sent: the wait's end is checked when each
 * attempt starts (after a retry's sleep) and again after each lookup,
 * immediately before the revocation is sent (review d4a4c681). A later
 * answer is dropped, and the caller's record keeps the debt.
 */
export function publicationTokens(o: {
  readonly mints: MintLedger;
  readonly repo: () => Promise<Pick<RepoHandle, "revokeToken">>;
  readonly waitMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}): PublicationTokens {
  const waitMs = o.waitMs ?? MINT_WAIT_MS;
  return {
    mint: (owner) => o.mints.mint(owner, "write", () => PUBLICATION_TTL_S),
    revoke: async (id) => {
      let over = false;
      const gaveUp = () => new Error("the revocation was given up when its bounded wait ran out");
      const answer = withRetry(
        async () => {
          if (over) throw gaveUp(); // after a retry's sleep
          const repo = await o.repo();
          if (over) throw gaveUp(); // after the lookup, immediately before the send
          return repo.revokeToken(id);
        },
        o.sleep ? { sleep: o.sleep } : {},
      );
      try {
        const r = await bounded(answer, waitMs);
        if (r === TIMED_OUT) throw new Error(`Artifacts did not answer the revocation within ${waitMs} ms`);
        return r;
      } finally {
        over = true;
      }
    },
  };
}

const TIMED_OUT = Symbol("timed out");

/** `p`'s answer, or `TIMED_OUT` after `ms`. A later answer, or a later failure, is dropped. */
function bounded<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  p.catch(() => undefined);
  const late = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([p, late]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** Points between transactions where a test may stop the driver, as a crash would. */
export type FaultPoint =
  | "attempt-recorded" //  the attempt is durable; no token yet
  | "token-answered" //    the mint answered; the ledger holds the token, and its ID is not on the attempt yet
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
  /** How long to wait for Artifacts to answer one revocation of an ended operation's token. Default `REVOKE_TIMEOUT_MS`. */
  readonly revokeTimeoutMs?: number;
}

/** An ended operation's token revocation that has not answered by then counts as failed, and is retried with backoff. */
export const REVOKE_TIMEOUT_MS = 30_000;

/** Thrown by a driver step after `kill()`: this engine instance is gone. */
export class EngineStopped extends Error {
  constructor() {
    super("this landing engine was stopped");
  }
}

export class Landing {
  readonly core: LandingCore;
  private readonly room: LandingRoom;
  private readonly publisher: PublisherPort;
  private readonly tokens: PublicationTokens;
  private readonly fault: (point: FaultPoint, op: OpId) => void;
  private readonly now: () => number;
  private chain: Promise<unknown> = Promise.resolve();
  /** The cleanup pass in progress, if any. Never on `chain`. */
  private cleaning: Promise<void> | null = null;
  /** Revocations of tokens the ledger kept because `pushToken` did not commit. Never on `chain`. */
  private readonly releasing = new Set<Promise<void>>();
  /** When the current attempt of that pass times out at the latest. */
  private cleaningUntil = 0;
  private readonly revokeTimeoutMs: number;
  private readonly preparing = new Set<OpId>();
  private stopped = false;

  constructor(opts: LandingOptions) {
    this.now = opts.now ?? Date.now;
    this.core = new LandingCore(opts.sql, opts.room, this.now);
    this.room = opts.room;
    this.publisher = opts.publisher;
    this.tokens = opts.tokens;
    this.fault = opts.fault ?? (() => {});
    this.revokeTimeoutMs = opts.revokeTimeoutMs ?? REVOKE_TIMEOUT_MS;
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
    const due = this.core.startEvaluation(id, force);
    if (!due) return;
    const op = this.core.get(id);
    if (!op) return;
    let r: Readiness;
    try {
      r = await this.room.readiness(op, due.integration);
    } catch (e) {
      this.alive();
      this.core.readinessFailed(id, due.attempt, due.rev, errorNote("readiness could not be computed", e));
      return;
    }
    this.alive();
    this.core.applyReadiness(id, due.attempt, due.integration, due.rev, r);
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
  /** When the Room's alarm should next run. A cleanup pass in progress is due again when its current attempt times out. */
  nextDue(): number | null {
    return this.core.nextDue(this.cleaning ? this.cleaningUntil : null);
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
        });
      } catch (e) {
        result = { kind: "error", detail: errorNote("integration failed", e) };
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

    let token: PublicationToken;
    try {
      // One call: any retry is the ledger's, each under its own record (R-MINT-2).
      token = await this.tokens.mint(`publish:${plan.op}:${plan.n}`);
    } catch (e) {
      this.alive();
      // Safe metadata only: the provider's text never reaches the operation's record (R-MINT-5).
      this.core.pushResult(plan.op, plan.n, { outcome: "error", detail: `token not minted (${errorNote("create failed", e)})` });
      await this.readBackAndApply(plan.op, "after-push");
      return true;
    }
    this.alive();
    // A host that stops here leaves the token with the ledger, which revokes it by its ID after the takeover.
    this.fault("token-answered", plan.op);
    try {
      // The ID is recorded, the landing's token row written and the ledger's record claimed in one transaction.
      this.core.pushToken(plan.op, plan.n, token.id, token.claim, token.expiresAt);
    } catch (e) {
      // Rolled back: the ledger still owns the token. It revokes it, off the publication queue (R-MINT-4).
      this.release(token);
      throw e;
    }
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
      // The record keeps the outcome and safe metadata, never the publisher's text (request d29c09fa).
      const answer = await pending;
      outcome = { ...answer, detail: outcomeNote(answer) };
    } catch (e) {
      outcome = { outcome: "unknown", detail: errorNote("push did not answer", e) };
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
        // Leave it: a later step revokes it, while the slot is held, or from the
        // cleanup records once the operation has ended. It expires within 60 s
        // regardless, and expiry decides nothing (R-PUB-2).
      }
    }
  }

  /**
   * Start a pass over the due revocations of ended operations' tokens
   * (R-PUB-3), unless one is still running. The pass is not on the
   * publication queue, so an unanswered revocation never holds up a push,
   * a preparation or the slot.
   */
  private startCleanup(): void {
    if (this.cleaning) return;
    this.cleaningUntil = this.now() + this.revokeTimeoutMs;
    this.cleaning = this.revokeEnded()
      .catch(() => undefined) // a stopped instance, or a step to retry: the records still owe it
      .finally(() => {
        this.cleaning = null;
      });
  }

  /** Resolves when the cleanup pass in progress, if any, and every release of a token `pushToken` did not take, have ended. */
  async cleanupDone(): Promise<void> {
    while (this.cleaning || this.releasing.size > 0) await Promise.all([this.cleaning, ...this.releasing]);
  }

  /** Revoke a token the ledger still owns, in the background: not awaited by the publication queue. */
  private release(token: PublicationToken): void {
    const p: Promise<void> = token
      .release()
      .catch(() => undefined) // the ledger keeps the debt: `held` until its revocation is answered or a takeover makes it owed
      .finally(() => this.releasing.delete(p));
    this.releasing.add(p);
  }

  /**
   * One bounded pass: each due token, by its own recorded ID, never a sweep of
   * the canonical repository's tokens. An answer that does not arrive in time
   * counts as a failure; a late answer is dropped, and the token stays owed
   * until a later attempt is answered. No answer changes an outcome or a
   * receipt.
   */
  private async revokeEnded(): Promise<void> {
    for (const t of this.core.cleanupDue()) {
      this.alive();
      this.cleaningUntil = this.now() + this.revokeTimeoutMs;
      let answered: boolean;
      try {
        answered = await this.revokeWithin(t.tokenId);
      } catch {
        answered = false;
      }
      this.alive();
      if (answered) {
        try {
          this.core.tokenRevoked(t.op, t.n);
          continue;
        } catch {
          // The completion did not commit, so the record still owes it: a failure like any other.
        }
      }
      try {
        this.core.cleanupFailed(t.op, t.n);
      } catch {
        // Storage could not record the retry either. The record keeps its due time; go on with the batch.
      }
    }
  }

  /** True if Artifacts answered the revocation within the timeout. Throws if it refused it. */
  private revokeWithin(tokenId: string): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), this.revokeTimeoutMs);
      (timer as { unref?: () => void }).unref?.();
    });
    const answer = this.tokens.revoke(tokenId).then(() => true);
    answer.catch(() => undefined); // a late refusal is dropped
    return Promise.race([answer, late]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  }

  private async readBackAndApply(id: OpId, mode: "after-push" | "probe"): Promise<void> {
    let main: Sha;
    try {
      main = await this.publisher.readMain();
    } catch (e) {
      this.alive();
      if (mode === "after-push") this.core.readBackFailed(id, errorNote("main could not be read", e));
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
   * 3. start a pass revoking the due tokens of operations that have ended,
   *    which runs on its own and is not awaited here;
   * 4. start every preparation that is due.
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
      this.startCleanup();
      const due = this.core.active().filter((o) => o.state === "accepted" || (o.state === "preparing" && o.integration === undefined));
      await Promise.all(due.map((o) => this.prepare(o.id)));
      // A built integration whose readiness answer was lost (a crash, a failed evaluation).
      const pending = this.core.active().filter((o) => (o.state === "preparing" || o.state === "ready") && o.integration !== undefined && o.readinessPending);
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
    return JSON.stringify([this.core.slot(), this.core.tokenCleanup(), this.core.active().map((o) => [o.id, o.state, o.attempts, o.integration, o.readinessPending, o.pushes?.length, o.nextAt])]);
  }

  /** Every non-terminal operation, as views. */
  activeViews(): LandOp[] {
    return this.core.active().map(toView);
  }
}

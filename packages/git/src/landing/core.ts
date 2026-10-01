/**
 * The landing state machine (plan section 8; R-LAND, R-PUB, R-REV-5).
 *
 * Every method here is synchronous and runs in one SQLite transaction. There
 * is no I/O and no `await`: the asynchronous driver (engine.ts) does the git
 * and token work between these steps, and every step re-reads what it needs
 * (R-LAND-3). So a crash can only happen between two transactions, and tests
 * can stop the driver at any of those points.
 *
 * The rules this file keeps:
 * - Reservation is one transaction and the only linearization point (R-LAND-7).
 * - One publication slot per room (R-PUB-1). It is released only by `landed`
 *   or `aborted`, each decided by reading main back (R-PUB-2, R-PUB-5).
 *   Elapsed time, token expiry or a lost container never release it.
 * - `aborted` needs proof that no push can still land: every push attempt
 *   ended with an outcome that shows nothing was applied (R-PUB-6, R-REV-5).
 */

import type {
  ActId,
  FailReason,
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
import { type Sql, text } from "../sql.ts";
import { definitelyNotApplied, type PushOutcome } from "../publisher/push-outcome.ts";
import type {
  AcceptInput,
  LandRecord,
  LandingRoom,
  PublicationStatus,
  PushAttempt,
  ReserveResult,
} from "./types.ts";

/** The result of building an integration commit in the publisher sandbox. */
export type IntegrateResult =
  | { readonly kind: "clean"; readonly integration: Sha; readonly ref: string }
  | { readonly kind: "conflict"; readonly paths: readonly string[] }
  | { readonly kind: "error"; readonly detail: string };

/** A push the driver should make now. */
export interface PushPlan {
  readonly op: OpId;
  readonly n: number;
  readonly publication: number;
  readonly integration: Sha;
  readonly integrationRef: string;
  readonly expectedMain: Sha;
}

/** Backoff for forward retries: 1 s doubling to 60 s. Never a deadline. */
export const FORWARD_BACKOFF = { firstMs: 1_000, maxMs: 60_000 } as const;
/** How often to read main back once another writer is seen. */
export const UNEXPECTED_READBACK_MS = 300_000;
/** Backoff for a failed preparation step. */
export const PREPARE_BACKOFF = { firstMs: 2_000, maxMs: 120_000 } as const;

const ACTIVE = ["accepted", "preparing", "ready", "publishing", "unresolved"] as const;
const PRE_RESERVATION = new Set(["accepted", "preparing", "ready"]);

const FIX: Record<RetryReason, string> = {
  "generation-moved": "A newer generation was proposed on this lane. Land that generation instead.",
  "lease-changed": "The lease ended or changed hands. Claim the lane, then land again.",
  released: "The lane was released. Claim it, then land again.",
  "authority-lost": "Your authority to land is no longer current. Ask an admin, then land again.",
  "evidence-invalid": "Evidence this landing relied on no longer counts. Get a new review or check, then land again.",
  "obligation-open": "An obligation reopened. Meet it, then land again.",
};

export function retryFix(reason: RetryReason): string {
  return FIX[reason];
}

const iso = (ms: number) => new Date(ms).toISOString();

function need<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`landing record is missing ${what}`);
  return value;
}

type Slot = { state: "free"; last: number } | { state: "held"; op: OpId; publication: number; reservedAt: Seq; last: number };

export class LandingCore {
  private readonly sql: Sql;
  private readonly room: LandingRoom;
  private readonly now: () => number;

  constructor(sql: Sql, room: LandingRoom, now: () => number) {
    this.sql = sql;
    this.room = room;
    this.now = now;
    sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_land_op (id TEXT PRIMARY KEY, lane TEXT NOT NULL, state TEXT NOT NULL, ord INTEGER NOT NULL, body TEXT NOT NULL)",
    );
    sql.all("CREATE INDEX IF NOT EXISTS artroom_land_op_state ON artroom_land_op (state, ord)");
    sql.all("CREATE TABLE IF NOT EXISTS artroom_land_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
  }

  // ------------------------------------------------------------ storage

  private meta(k: string): string | null {
    return text(this.sql.all("SELECT v FROM artroom_land_meta WHERE k = ?", k)[0], "v");
  }

  private setMeta(k: string, v: string): void {
    this.sql.all("INSERT INTO artroom_land_meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", k, v);
  }

  private save(op: LandRecord): void {
    op.updatedAt = this.now();
    this.sql.all(
      "INSERT INTO artroom_land_op (id, lane, state, ord, body) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT (id) DO UPDATE SET state = excluded.state, body = excluded.body",
      op.id,
      op.lane,
      op.state,
      op.order,
      JSON.stringify(op),
    );
  }

  private slotRaw(): Slot {
    const raw = this.meta("slot");
    return raw ? (JSON.parse(raw) as Slot) : { state: "free", last: 0 };
  }

  private setSlot(slot: Slot): void {
    this.setMeta("slot", JSON.stringify(slot));
  }

  get(id: OpId): LandRecord | null {
    const body = text(this.sql.all("SELECT body FROM artroom_land_op WHERE id = ?", id)[0], "body");
    return body ? (JSON.parse(body) as LandRecord) : null;
  }

  /** Operations that are not terminal, in acceptance order. */
  active(): LandRecord[] {
    const marks = ACTIVE.map(() => "?").join(", ");
    return this.sql
      .all(`SELECT body FROM artroom_land_op WHERE state IN (${marks}) ORDER BY ord`, ...ACTIVE)
      .map((r) => JSON.parse(need(text(r, "body"), "body")) as LandRecord);
  }

  /** Main as the room last recorded it. */
  main(): Sha | null {
    return this.meta("main") as Sha | null;
  }

  tx<T>(fn: () => T): T {
    return this.sql.transaction(fn);
  }

  // ------------------------------------------------------------ views

  /** The contract view of an operation (no credentials, R-WS-4). */
  view(id: OpId): LandOp | null {
    const r = this.get(id);
    return r ? toView(r) : null;
  }

  slot(): PublicationSlot {
    const s = this.slotRaw();
    if (s.state === "free") return { state: "free", last: s.last };
    const op = this.get(s.op);
    return {
      state: "held",
      op: s.op,
      publication: s.publication,
      reservedAt: s.reservedAt,
      ...(op?.since !== undefined ? { unresolvedSince: iso(op.since) } : {}),
    };
  }

  /** The held publication, for admins (plan section 8). Null when the slot is free. */
  status(): PublicationStatus | null {
    const s = this.slotRaw();
    if (s.state === "free") return null;
    const op = need(this.get(s.op), "the slot's operation");
    return {
      op: op.id,
      lane: op.lane,
      state: op.state === "unresolved" ? "unresolved" : "publishing",
      publication: need(op.publication, "publication"),
      reservedAt: need(op.reservedAt, "reservedAt"),
      integration: need(op.integration, "integration"),
      expectedMain: op.expectedMain,
      since: op.since !== undefined ? iso(op.since) : null,
      readBack: op.readBack ?? null,
      unexpectedWriter: op.readBack?.main === "unexpected",
      aborting: op.abort !== undefined,
      pushes: (op.pushes ?? []).map((p) => ({
        n: p.n,
        outcome: p.outcome ?? "in-flight-or-lost",
        tokenRevoked: p.tokenRevoked,
      })),
      nextAttemptAt: op.nextAt !== undefined ? iso(op.nextAt) : null,
      lastError: op.lastError ?? null,
    };
  }

  /** The reservation every act admitted now must name in `after` (R-LAND-8). */
  after(): { readonly op: OpId; readonly reservedAt: Seq } | null {
    const s = this.slotRaw();
    return s.state === "held" ? { op: s.op, reservedAt: s.reservedAt } : null;
  }

  /** The earliest time the driver has work due, for the Room's alarm. */
  nextDue(): number | null {
    let due: number | null = null;
    const at = (t: number) => (due = due === null ? t : Math.min(due, t));
    for (const op of this.active()) {
      if (op.state === "publishing" || op.state === "unresolved") at(op.nextAt ?? this.now());
      else if (op.state === "accepted") at(this.now());
      else if (op.state === "preparing" && op.integration === undefined) at(op.retryAt ?? this.now());
      else if (op.state === "ready" && this.slotRaw().state === "free") at(this.now());
    }
    return due;
  }

  // ------------------------------------------------------------ main

  /** Record main as read from the canonical repository, when the slot is free. */
  observeMain(sha: Sha): void {
    this.tx(() => {
      const known = this.main();
      if (known === sha) return;
      if (this.slotRaw().state === "held") return; // the publication decides main
      this.setMeta("main", sha);
      if (known !== null) this.mainMoved(sha);
    });
  }

  /** R-LAND-5: every unreserved operation re-prepares on the new main. */
  private mainMoved(main: Sha): void {
    for (const op of this.active()) {
      if (op.state === "accepted") {
        op.expectedMain = main;
        this.save(op);
      } else if ((op.state === "preparing" || op.state === "ready") && op.expectedMain !== main) {
        this.rePrepare(op, main);
      }
    }
  }

  private rePrepare(op: LandRecord, main: Sha): void {
    op.state = "preparing";
    op.expectedMain = main;
    op.attempts += 1;
    op.waiting = [];
    delete op.integration;
    delete op.integrationRef;
    delete op.evidence;
    delete op.landInput;
    delete op.retryAt;
    this.save(op);
  }

  // ------------------------------------------------------------ outcomes

  private retryable(op: LandRecord, reason: RetryReason, fix: string): void {
    const { act } = this.room.record({ type: "land-outcome", op: op.id, outcome: { state: "retryable", reason } });
    op.state = "retryable";
    op.reason = reason;
    op.fix = fix;
    op.receipt = act;
    this.save(op);
  }

  private fail(op: LandRecord, reason: FailReason): void {
    const { act } = this.room.record({ type: "land-outcome", op: op.id, outcome: { state: "failed", reason } });
    op.state = "failed";
    op.reason = reason;
    op.receipt = act;
    this.save(op);
  }

  /** The lane checks of R-LAND-3 and R-LAND-7. Null when the lane still matches. */
  private laneMismatch(op: LandRecord): RetryReason | null {
    const lane = this.room.lane(op.lane);
    if (!lane) return "lease-changed";
    if (lane.generation !== op.generation || lane.head !== op.head) return "generation-moved";
    if (lane.holder === "released") return "released";
    if (lane.holder === "expired" || lane.leaseGeneration !== op.leaseGeneration) return "lease-changed";
    return null;
  }

  // ------------------------------------------------------------ admission

  /**
   * Record a landing operation in the Room's admission transaction, before any
   * external I/O (R-LAND-1, R-LAND-2). Call it inside the transaction that
   * records the `land` act.
   */
  accept(input: AcceptInput): LandRecord | Refusal {
    return this.tx(() => {
      const main = this.main();
      if (main === null) throw new Error("main is not known yet: call observeMain first");
      const inFlight = this.active().find((o) => o.lane === input.lane);
      if (inFlight) {
        return {
          refused: true,
          rule: "land-in-progress",
          reason: "This lane already has a landing operation in flight.",
          fix: "Wait for it to finish.",
          current: { op: inFlight.id },
        } satisfies Refusal;
      }
      if (this.get(input.id)) throw new Error(`landing operation ${input.id} exists`);
      const order = Number(this.meta("order") ?? "0") + 1;
      this.setMeta("order", String(order));
      const now = this.now();
      const op: LandRecord = {
        ...input,
        order,
        createdAt: now,
        updatedAt: now,
        state: "accepted",
        expectedMain: main,
        attempts: 0,
      };
      this.save(op);
      return op;
    });
  }

  // ------------------------------------------------------------ preparation

  /**
   * Start (or restart) building the integration. Returns what to build and
   * the attempt number that the result must match, or null if there is
   * nothing to build now.
   */
  startPreparation(id: OpId): { readonly attempt: number; readonly expectedMain: Sha; readonly head: Sha } | null {
    return this.tx(() => {
      const op = this.get(id);
      if (!op) return null;
      if (op.state === "accepted") {
        const mismatch = this.laneMismatch(op);
        if (mismatch) {
          this.retryable(op, mismatch, FIX[mismatch]);
          return null;
        }
        op.state = "preparing";
        op.attempts = 1;
        op.waiting = [];
        op.expectedMain = this.main() ?? op.expectedMain;
        this.save(op);
      } else if (op.state !== "preparing" || op.integration !== undefined || (op.retryAt ?? 0) > this.now()) {
        return null;
      }
      return { attempt: op.attempts, expectedMain: op.expectedMain, head: op.head };
    });
  }

  /** Apply a built integration (R-LAND-4). A result for an older attempt is dropped (R-LAND-3). */
  prepared(id: OpId, attempt: number, result: IntegrateResult): LandRecord | null {
    return this.tx(() => {
      const op = this.get(id);
      if (!op || op.state !== "preparing" || op.attempts !== attempt || op.integration !== undefined) return op;
      if (result.kind === "error") {
        const wait = op.prepareBackoffMs ?? PREPARE_BACKOFF.firstMs;
        op.retryAt = this.now() + wait;
        op.prepareBackoffMs = Math.min(wait * 2, PREPARE_BACKOFF.maxMs);
        op.lastError = result.detail.slice(0, 500);
        this.save(op);
        return op;
      }
      const mismatch = this.laneMismatch(op);
      if (mismatch) {
        this.retryable(op, mismatch, FIX[mismatch]);
        return op;
      }
      const main = this.main();
      if (op.policyVersion !== this.room.policyVersion()) {
        op.policyVersion = this.room.policyVersion();
        this.rePrepare(op, main ?? op.expectedMain);
        return op;
      }
      if (main !== null && main !== op.expectedMain) {
        this.rePrepare(op, main);
        return op;
      }
      if (result.kind === "conflict") {
        this.fail(op, { code: "conflict", paths: [...result.paths] });
        return op;
      }
      op.integration = result.integration;
      op.integrationRef = result.ref;
      delete op.lastError;
      delete op.prepareBackoffMs;
      this.applyReadiness(op);
      return op;
    });
  }

  /** Re-evaluate obligations, for example after a check arrives. */
  evaluate(id: OpId): LandRecord | null {
    return this.tx(() => {
      const op = this.get(id);
      if (!op || (op.state !== "preparing" && op.state !== "ready") || op.integration === undefined) return op;
      const mismatch = this.laneMismatch(op);
      if (mismatch) this.retryable(op, mismatch, FIX[mismatch]);
      else this.applyReadiness(op);
      return op;
    });
  }

  private applyReadiness(op: LandRecord): void {
    const integration = need(op.integration, "integration");
    const r = this.room.readiness(op, integration);
    switch (r.kind) {
      case "ready":
        op.state = "ready";
        op.evidence = [...r.evidence];
        op.landInput = r.landInput;
        op.waiting = [];
        this.save(op);
        return;
      case "waiting":
        op.state = "preparing";
        op.waiting = [...r.obligations];
        this.save(op);
        return;
      case "failed":
        this.fail(op, r.reason);
        return;
      case "retry":
        this.retryable(op, r.reason, r.fix);
        return;
    }
  }

  // ------------------------------------------------------------ invalidation

  /**
   * Something changed on a lane: a release, a new generation, an expiry or
   * take-over, lost authority or evidence (R-LAND-6, R-LAND-9). Unreserved
   * operations on the lane become `retryable`. A reserved one is not touched
   * (R-LAND-8); the caller stamps its receipt with `after()`.
   */
  laneChanged(lane: LaneId, reason: RetryReason, fix: string = FIX[reason]): LandRecord[] {
    return this.tx(() => {
      const hit: LandRecord[] = [];
      for (const op of this.active()) {
        if (op.lane !== lane || !PRE_RESERVATION.has(op.state)) continue;
        this.retryable(op, reason, fix);
        hit.push(op);
      }
      return hit;
    });
  }

  /** A policy activated: every unreserved preparation restarts under it (R-LAND-5, R-POL-9). */
  policyActivated(version: PolicyVersion): OpId[] {
    return this.tx(() => {
      const fenced: OpId[] = [];
      for (const op of this.active()) {
        if (op.state !== "preparing" && op.state !== "ready" && op.state !== "accepted") continue;
        op.policyVersion = version;
        if (op.state === "accepted") this.save(op);
        else this.rePrepare(op, this.main() ?? op.expectedMain);
        fenced.push(op.id);
      }
      return fenced;
    });
  }

  // ------------------------------------------------------------ reservation

  /**
   * R-LAND-7. One synchronous transaction: re-validate, take the next
   * publication number, hold the slot, record `land-reserved`. From here the
   * landing is authorized irrevocably (R-LAND-8).
   */
  reserve(id: OpId): ReserveResult {
    return this.tx((): ReserveResult => {
      const op = this.get(id);
      if (!op || op.state !== "ready") return { kind: "not-ready", state: op?.state ?? null };
      const slot = this.slotRaw();
      if (slot.state === "held") return { kind: "slot-held", by: slot.op };

      const mismatch = this.laneMismatch(op);
      if (mismatch) {
        this.retryable(op, mismatch, FIX[mismatch]);
        return { kind: "retryable", reason: mismatch };
      }
      // Main and policy moves re-prepare (R-LAND-5) rather than end the operation.
      const main = need(this.main(), "main");
      const policy = this.room.policyVersion();
      if (op.policyVersion !== policy || op.expectedMain !== main) {
        op.policyVersion = policy;
        this.rePrepare(op, main);
        return { kind: "re-prepare" };
      }
      const room = this.room.revalidate(op);
      if (room) {
        this.retryable(op, room.reason, room.fix);
        return { kind: "retryable", reason: room.reason };
      }

      const integration = need(op.integration, "integration");
      const evidence = op.evidence ?? [];
      const publication = slot.last + 1;
      const { seq } = this.room.record({
        type: "land-reserved",
        op: op.id,
        lane: op.lane,
        generation: op.generation,
        integration,
        expectedMain: op.expectedMain,
        evidence,
        publication,
      });
      op.state = "publishing";
      op.publication = publication;
      op.reservedAt = seq;
      op.pushes = [];
      op.backoffMs = FORWARD_BACKOFF.firstMs;
      op.nextAt = this.now();
      this.save(op);
      this.setSlot({ state: "held", op: op.id, publication, reservedAt: seq, last: slot.last });
      return { kind: "reserved", publication, reservedAt: seq };
    });
  }

  /** Reserve the oldest ready operation, if the slot is free. */
  reserveNext(): ReserveResult | null {
    return this.tx(() => {
      if (this.slotRaw().state === "held") return null;
      for (const op of this.active()) {
        if (op.state !== "ready") continue;
        const r = this.reserve(op.id);
        if (r.kind === "reserved") return r;
      }
      return null;
    });
  }

  // ------------------------------------------------------------ publication

  /** The operation holding the slot, if any. */
  held(): LandRecord | null {
    const s = this.slotRaw();
    return s.state === "held" ? this.get(s.op) : null;
  }

  /**
   * Begin one forward push of the held publication: the same integration and
   * the same lease every time (R-PUB-5). Null when no push is due, when an
   * abort attempt stopped pushing (R-REV-5), or when another writer was seen.
   */
  beginPush(): PushPlan | null {
    return this.tx(() => {
      const op = this.held();
      if (!op) return null;
      if (op.abort || op.readBack?.main === "unexpected") return null;
      if ((op.nextAt ?? 0) > this.now()) return null;
      const pushes = op.pushes ?? [];
      const n = pushes.length + 1;
      const attempt: PushAttempt = { n, startedAt: this.now(), tokenId: null, tokenRevoked: false, outcome: null };
      op.pushes = [...pushes, attempt];
      // Until this attempt is read back, nothing else is due.
      op.nextAt = this.now() + need(op.backoffMs, "backoff");
      this.save(op);
      return {
        op: op.id,
        n,
        publication: need(op.publication, "publication"),
        integration: need(op.integration, "integration"),
        integrationRef: need(op.integrationRef, "integrationRef"),
        expectedMain: op.expectedMain,
      };
    });
  }

  private attempt(op: LandRecord, n: number): PushAttempt {
    return need(op.pushes?.find((p) => p.n === n), `push attempt ${n}`);
  }

  /** The attempt's token ID, recorded before the token leaves the room. */
  pushToken(id: OpId, n: number, tokenId: string): void {
    this.tx(() => {
      const op = need(this.get(id), id);
      this.attempt(op, n).tokenId = tokenId;
      this.save(op);
    });
  }

  /** What the push reported. It is evidence for `aborted` only, never for `landed`. */
  pushResult(id: OpId, n: number, outcome: PushOutcome): void {
    this.tx(() => {
      const op = need(this.get(id), id);
      const a = this.attempt(op, n);
      if (a.outcome === null) {
        a.outcome = outcome.outcome;
        a.detail = outcome.detail.slice(0, 600);
      }
      this.save(op);
    });
  }

  tokenRevoked(id: OpId, n: number): void {
    this.tx(() => {
      const op = need(this.get(id), id);
      this.attempt(op, n).tokenRevoked = true;
      this.save(op);
    });
  }

  /** Tokens minted for this publication and not yet revoked. */
  liveTokens(id: OpId): { readonly n: number; readonly tokenId: string }[] {
    const op = this.get(id);
    return (op?.pushes ?? []).flatMap((p) => (p.tokenId && !p.tokenRevoked ? [{ n: p.n, tokenId: p.tokenId }] : []));
  }

  /**
   * Apply main as read back (R-PUB-5). `probe` is the first read after a
   * restart: it settles `landed` (or `aborted`) but does not by itself make a
   * publication unresolved, because the forward push comes next.
   */
  readBack(id: OpId, observed: Sha, mode: "after-push" | "probe" = "after-push"): LandRecord | null {
    return this.tx(() => {
      const op = this.get(id);
      if (!op || (op.state !== "publishing" && op.state !== "unresolved")) return op;
      const integration = need(op.integration, "integration");
      if (observed === integration) {
        this.land(op, integration);
        return op;
      }
      if (op.abort && this.cannotLand(op)) {
        this.abortOutcome(op);
        return op;
      }
      if (mode === "probe" && observed === op.expectedMain) {
        // After a restart: any earlier attempt is lost to us, so push forward now.
        op.nextAt = this.now();
        this.save(op);
        return op;
      }
      if (observed === op.expectedMain) {
        this.unresolved(op, { main: "expected-main" });
        const backoff = need(op.backoffMs, "backoff");
        op.nextAt = this.now() + backoff;
        op.backoffMs = Math.min(backoff * 2, FORWARD_BACKOFF.maxMs);
      } else {
        this.unresolved(op, { main: "unexpected", observed });
        op.nextAt = this.now() + UNEXPECTED_READBACK_MS;
      }
      this.save(op);
      return op;
    });
  }

  /** Main could not be read. Nothing is decided; try again later. */
  readBackFailed(id: OpId, error: string): void {
    this.tx(() => {
      const op = this.get(id);
      if (!op || (op.state !== "publishing" && op.state !== "unresolved")) return;
      op.lastError = error.slice(0, 500);
      const backoff = need(op.backoffMs, "backoff");
      op.nextAt = this.now() + backoff;
      op.backoffMs = Math.min(backoff * 2, FORWARD_BACKOFF.maxMs);
      this.save(op);
    });
  }

  private unresolved(op: LandRecord, readBack: NonNullable<LandRecord["readBack"]>): void {
    const first = op.since === undefined;
    op.state = "unresolved";
    op.readBack = readBack;
    if (first) {
      op.since = this.now();
      this.room.record({ type: "publication-unresolved", op: op.id, readBack });
    }
  }

  /** True only if every push attempt ended with an outcome that shows nothing was applied. */
  private cannotLand(op: LandRecord): boolean {
    return (op.pushes ?? []).every((p) => definitelyNotApplied(p.outcome));
  }

  private land(op: LandRecord, commit: Sha): void {
    const publication = need(op.publication, "publication");
    if (op.abort) this.recordAbort(op);
    const { act } = this.room.record({
      type: "land-outcome",
      op: op.id,
      outcome: { state: "landed", commit, publication },
    });
    op.receipt = act;
    if (op.abort) {
      // R-REV-6: the landing completed despite an abort attempt.
      op.revertLane = this.room.record({
        type: "revert-lane",
        of: op.id,
        scope: [...this.room.revertScope(op)],
        reason: "abort-after-landing",
      }).act;
    }
    op.state = "landed";
    delete op.nextAt;
    this.save(op);
    this.setSlot({ state: "free", last: publication });
    this.setMeta("main", commit);
    this.mainMoved(commit);
  }

  private abortOutcome(op: LandRecord): void {
    const publication = need(op.publication, "publication");
    this.recordAbort(op);
    const { act } = this.room.record({ type: "land-outcome", op: op.id, outcome: { state: "aborted", publication } });
    op.receipt = act;
    op.state = "aborted";
    delete op.nextAt;
    this.save(op);
    this.setSlot({ state: "free", last: publication });
  }

  // ------------------------------------------------------------ abort (R-REV-5)

  /**
   * A `compromised` revocation of a key that is evidence for the held
   * publication, or of its initiator. Stops forward pushes at once. The
   * driver then revokes the publication tokens and calls `abortRecorded`.
   * Returns the held operation, or null if no publication is held.
   */
  abort(trigger: ActId, key: KeyId, at: Seq): LandRecord | null {
    return this.tx(() => {
      const op = this.held();
      if (!op) return null;
      if (!op.abort) {
        op.abort = { trigger, key, at, tokenRevoked: false, recorded: false };
        op.nextAt = this.now();
        this.save(op);
      }
      return op;
    });
  }

  /** The held publication if it has an abort attempt not yet recorded. */
  pendingAbort(): LandRecord | null {
    const op = this.held();
    return op?.abort && !op.abort.recorded ? op : null;
  }

  /** Record the `abort-attempt` event, saying whether every publication token was revoked. */
  abortRecorded(id: OpId, tokenRevoked: boolean): void {
    this.tx(() => {
      const op = this.get(id);
      if (!op?.abort || op.abort.recorded) return;
      op.abort.tokenRevoked = tokenRevoked;
      this.recordAbort(op);
      this.save(op);
    });
  }

  private recordAbort(op: LandRecord): void {
    const a = need(op.abort, "abort");
    if (a.recorded) return;
    a.recorded = true;
    this.room.record({
      type: "abort-attempt",
      op: op.id,
      attempt: { trigger: a.trigger, key: a.key, at: a.at, tokenRevoked: a.tokenRevoked },
    });
  }

  /** True when the held publication needs a read of main now (aborting, or another writer seen). */
  readBackDue(): LandRecord | null {
    const op = this.held();
    if (!op) return null;
    if (!op.abort && op.readBack?.main !== "unexpected") return null;
    return (op.nextAt ?? 0) <= this.now() ? op : null;
  }

  /** Push the next read-back time out after a read-only step. */
  deferReadBack(id: OpId): void {
    this.tx(() => {
      const op = this.get(id);
      if (!op || (op.state !== "publishing" && op.state !== "unresolved")) return;
      const backoff = need(op.backoffMs, "backoff");
      op.nextAt = this.now() + (op.readBack?.main === "unexpected" ? UNEXPECTED_READBACK_MS : backoff);
      op.backoffMs = Math.min(backoff * 2, FORWARD_BACKOFF.maxMs);
      this.save(op);
    });
  }
}

/** Map a stored record to the contract view. */
export function toView(r: LandRecord): LandOp {
  const base = {
    id: r.id,
    kind: "land" as const,
    updatedAt: iso(r.updatedAt),
    lane: r.lane,
    generation: r.generation,
    head: r.head,
    act: r.act,
    leaseGeneration: r.leaseGeneration,
    expectedMain: r.expectedMain,
    policyVersion: r.policyVersion,
    attempts: r.attempts,
  };
  const reserved = () => ({
    integration: need(r.integration, "integration"),
    evidence: r.evidence ?? [],
    publication: need(r.publication, "publication"),
    reservedAt: need(r.reservedAt, "reservedAt"),
  });
  const abortView = (a: NonNullable<LandRecord["abort"]>) => ({ trigger: a.trigger, key: a.key, at: a.at, tokenRevoked: a.tokenRevoked });
  const abort = r.abort ? { abort: abortView(r.abort) } : {};
  switch (r.state) {
    case "accepted":
      return { ...base, state: "accepted" };
    case "preparing":
      return { ...base, state: "preparing", waiting: r.waiting ?? [], ...(r.integration ? { integration: r.integration } : {}) };
    case "ready":
      return {
        ...base,
        state: "ready",
        integration: need(r.integration, "integration"),
        evidence: r.evidence ?? [],
        landInput: r.landInput ?? null,
      };
    case "publishing":
      return { ...base, ...reserved(), state: "publishing", pushes: r.pushes?.length ?? 0 };
    case "unresolved":
      return {
        ...base,
        ...reserved(),
        state: "unresolved",
        since: iso(need(r.since, "since")),
        readBack: need(r.readBack, "readBack"),
        ...abort,
      };
    case "landed":
      return {
        ...base,
        ...reserved(),
        state: "landed",
        receipt: need(r.receipt, "receipt"),
        ...abort,
        ...(r.revertLane ? { revertLane: r.revertLane } : {}),
      };
    case "aborted":
      return { ...base, ...reserved(), state: "aborted", receipt: need(r.receipt, "receipt"), abort: abortView(need(r.abort, "abort")) };
    case "retryable":
      return {
        ...base,
        state: "retryable",
        reason: r.reason as RetryReason,
        receipt: need(r.receipt, "receipt"),
        fix: r.fix ?? "",
      };
    case "failed":
      return { ...base, state: "failed", reason: r.reason as FailReason, receipt: need(r.receipt, "receipt") };
  }
}

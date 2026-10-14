/**
 * Lane workspaces: one Artifacts fork per lane, and one write token per lease
 * generation, scoped to that fork and expiring no later than the lease
 * (plan sections 5 and 6; R-CRED-8, R-WS-1 to R-WS-5, R-LANE-8).
 *
 * - The public view (`WorkspaceOp`) never holds a token (R-WS-1).
 * - `grant` returns the token. The Room calls it only after judging the
 *   caller's authority, holdership and lease now (R-WS-2); `grant` checks the
 *   lease generation and expiry again.
 * - `revoke` ends a lease's access on release, expiry or take-over
 *   (R-WS-3).
 * - Fork creation retries Artifacts' transient internal errors (10400).
 *
 * One durable protocol covers every remote step that can leave a token
 * nobody records, and every token that must not stay live. Each is a duty
 * in SQLite, with an explicit state:
 * - `in-flight`: a non-idempotent remote step was sent (creating a fork,
 *   which comes with its own 24-hour token; one attempt to mint a lease
 *   token) and its outcome is not known: no answer yet, or a failure that
 *   does not prove nothing happened (a transport error, or Artifacts'
 *   INTERNAL_ERROR). It may still apply, at any time.
 * - `answered`: success, or an Artifacts error that says the request was
 *   refused and changed nothing (`refusedUnchanged`). Only these close a
 *   step: they are the completion fence.
 * - `owed`: an inventory (revoke every active token except the recorded
 *   lease token) or one known token, to revoke.
 * - `done`: settled, with the reason.
 *
 * An inventory run lists the fork's tokens and revokes every active one that
 * no ready or installing lease has recorded. Only a complete, well-formed
 * listing counts (`completeInventory`); any other leaves every duty owed and
 * scheduled. When it succeeds, it settles
 * every `owed` inventory and every step answered before it started. A step
 * still `in-flight` is never settled, by any snapshot or by elapsed time:
 * it keeps an inventory on a capped backoff (every minute at first, then
 * every 30 minutes), which revokes whatever it creates, for as long as the
 * fork exists. A known token's debt also ends when that token has expired.
 * Every retry is its own step, because an earlier failed attempt may still
 * apply.
 *
 * The read tokens that pinning mints on a fork have their own ledger,
 * which this object owns and builds (`forkTokens`, request 02836f9a; see
 * fork-tokens.ts). A fork's sweep keeps a token that ledger holds for a pin
 * in progress, and while one of its creates on the fork is unsettled it
 * revokes only tokens whose IDs a record names, asking immediately before
 * each revocation. No time ends that: only the create's own answer does.
 *
 * A workspace becomes ready only after an inventory that started after its
 * token was recorded has succeeded, so every attempt that answered (even
 * with a retryable error after it applied) has been swept. The in-memory
 * fork lock coordinates one live host only; it is never restart evidence.
 * The Room's alarm calls `reconcile()` and sets its next alarm from
 * `nextDue()`. Cleanup checks provenance first, and never touches a
 * repository that is not this canonical repo's fork. Such a repository at the
 * fork's name settles answered and owed duties (our fork is gone, with its
 * tokens), never a step in flight: occupancy is not that step's answer.
 *
 * The same ledger covers the canonical repository at public founding
 * (`prepareCanonical`, `sealCanonical`, `settleCanonical`; request b6b51de7,
 * reviews a35b4b61 and 3eb7bc44): see "the canonical repository" below. Each
 * creation attempt is its own incarnation name, never reused; `reconcile`
 * settles abandoned incarnations and never touches the sealed one.
 */

import type {
  ArtroomError,
  LaneId,
  LeaseGeneration,
  OpId,
  Refusal,
  WorkspaceGrant,
  WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import { type Sql, type SqlRow, text } from "../sql.ts";
import { type ArtifactsNamespace, type RepoHandle, type TokenInfo, artifactsCode, completeInventory, refusedUnchanged, withRetry } from "../artifacts.ts";
import { errorNote } from "../mints.ts";
import { safeErrorText } from "../safe-errors.ts";
import { type ForkRepo, ForkTokens } from "./fork-tokens.ts";

/** Artifacts' shortest token lifetime. */
export const MIN_TOKEN_TTL_S = 60;

export interface WorkspacesOptions {
  readonly sql: Sql;
  readonly artifacts: ArtifactsNamespace;
  /** The canonical repo's name in the namespace. */
  readonly canonical: string;
  /** The Artifacts namespace of the canonical repo. A fork's source must be exactly `artifacts:<namespace>/<canonical>`. */
  readonly namespace: string;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * Persist a wake-up at or before `at` (ms), for example the Room's alarm,
   * which then calls `settleCanonical()` before founding. Public founding
   * awaits it after recording each repository create and before sending it
   * (plan 004); a rejection sends nothing. The forks' read-token ledger
   * (`forkTokens`) awaits it before every create; without it, that ledger
   * sends nothing.
   */
  readonly wake?: (at: number) => Promise<void>;
}

/** How often an unresolved remote step's inventory runs: first after 1 minute, backing off to every 30 minutes. */
export const RECHECK_MS = { first: 60_000, max: 1_800_000 } as const;

const iso = (ms: number) => new Date(ms).toISOString();

export function forkName(canonical: string, lane: LaneId): string {
  const name = `${canonical}--${lane}`.replace(/[^A-Za-z0-9._-]/g, "_");
  if (name.length > 100) throw new Error("fork name too long");
  return name;
}

function workspaceOpId(lane: LaneId, lease: LeaseGeneration): OpId {
  return `op_ws_${lane}_${lease}`;
}

/** A repository at the lane's fork name that is not a fork of this canonical repo. It is never used, changed or deleted. */
export class NotOurFork extends Error {}

/** Cleanup is still owed on the fork; provisioning waits for it. */
export class CleanupOwed extends Error {}

/** Seconds kept back from a token's lifetime, so clock differences cannot carry it past the lease. */
export const TOKEN_MARGIN_S = 5;

function failure(e: unknown): ArtroomError {
  if (e instanceof CleanupOwed) return { name: "ArtroomError", code: "unavailable", message: e.message.slice(0, 300), retryable: true, retryAfterMs: 5_000 };
  if (e instanceof NotOurFork) return { name: "ArtroomError", code: "forbidden", message: e.message.slice(0, 300), retryable: false };
  const code = artifactsCode(e);
  return {
    name: "ArtroomError",
    code: code === "INTERNAL_ERROR" || code === "UPSTREAM_UNAVAILABLE" ? "unavailable" : "internal",
    // Safe metadata only: the view and the stored row never hold the provider's text (request d29c09fa).
    message: errorNote("could not provision the workspace", e),
    retryable: true,
  };
}

interface Row {
  lane: LaneId;
  lease: number;
  state: "pending" | "ready" | "failed" | "revoked";
  fork: string;
  remote: string | null;
  leaseExpiresAt: number;
  tokenId: string | null;
  tokenExpiresAt: number | null;
  error: string | null;
  updatedAt: number;
}

export class Workspaces {
  private readonly sql: Sql;
  private readonly artifacts: ArtifactsNamespace;
  private readonly canonical: string;
  private readonly namespace: string;
  private readonly now: () => number;
  private readonly sleep: ((ms: number) => Promise<void>) | undefined;
  private readonly wake: ((at: number) => Promise<void>) | undefined;
  private readonly inFlight = new Map<LaneId, Promise<WorkspaceOp>>();
  private readonly locks = new Map<string, Promise<unknown>>();
  /**
   * The forks' read-token ledger (request 02836f9a): every read token minted
   * on a lane fork for pinning, from before its create is sent until its
   * revocation is answered. Built with this object, so it takes over what a
   * stopped host left. The Room's alarm runs it through its own `reconcile`
   * and `nextDue` (the Room's `forkTokens` step), not through this object's.
   */
  readonly forkTokens: ForkTokens;

  constructor(opts: WorkspacesOptions) {
    this.sql = opts.sql;
    this.artifacts = opts.artifacts;
    this.canonical = opts.canonical;
    this.namespace = opts.namespace;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep;
    this.wake = opts.wake;
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_ws (lane TEXT PRIMARY KEY, lease INTEGER NOT NULL, state TEXT NOT NULL, fork TEXT NOT NULL, " +
        "remote TEXT, lease_expires_at INTEGER NOT NULL, token_id TEXT, token_expires_at INTEGER, error TEXT, updated_at INTEGER NOT NULL)",
    );
    // Secrets live apart from the public row, so no read of the row can carry one.
    this.sql.all("CREATE TABLE IF NOT EXISTS artroom_ws_secret (lane TEXT PRIMARY KEY, lease INTEGER NOT NULL, token TEXT NOT NULL)");
    // The canonical repository's creation token, by its revocation duty, until Artifacts confirms the revocation (public founding).
    this.sql.all("CREATE TABLE IF NOT EXISTS artroom_ws_canon_secret (duty INTEGER PRIMARY KEY, token TEXT NOT NULL)");
    // Duties: remote steps whose outcome matters, and cleanup owed (see the module comment).
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_ws_duty (id INTEGER PRIMARY KEY AUTOINCREMENT, fork TEXT NOT NULL, kind TEXT NOT NULL, " +
        "token_id TEXT, reason TEXT NOT NULL, state TEXT NOT NULL, started_at INTEGER NOT NULL, answered_at INTEGER, expires_at INTEGER, " +
        "attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, last_error TEXT, done_at INTEGER, done_reason TEXT)",
    );
    // Token IDs the workspaces record, for the fork token ledger's observation: point lookups (request 02836f9a). Made at
    // every start, so a stored room gains them at its first start after this change.
    this.sql.all("CREATE INDEX IF NOT EXISTS artroom_ws_token ON artroom_ws (token_id)");
    this.sql.all("CREATE INDEX IF NOT EXISTS artroom_ws_duty_token ON artroom_ws_duty (token_id)");
    this.forkTokens = new ForkTokens({
      sql: this.sql,
      fork: (name) => this.ourFork(name),
      now: this.now,
      wake: opts.wake ?? (() => Promise.reject(new Error("no wake-up can be stored; no fork token is sent"))),
      known: (fork, id) =>
        this.sql.all("SELECT 1 AS x FROM artroom_ws WHERE token_id = ? AND fork = ? LIMIT 1", id, fork).length > 0 ||
        this.sql.all("SELECT 1 AS x FROM artroom_ws_duty WHERE token_id = ? AND fork = ? AND state != 'done' LIMIT 1", id, fork).length > 0,
      ...(opts.sleep ? { sleep: opts.sleep } : {}),
    });
  }

  // ---------------------------------------------------------------- storage

  private row(lane: LaneId): Row | null {
    const r: SqlRow | undefined = this.sql.all("SELECT * FROM artroom_ws WHERE lane = ?", lane)[0];
    if (!r) return null;
    return {
      lane,
      lease: Number(r["lease"]),
      state: text(r, "state") as Row["state"],
      fork: text(r, "fork") ?? "",
      remote: text(r, "remote"),
      leaseExpiresAt: Number(r["lease_expires_at"]),
      tokenId: text(r, "token_id"),
      tokenExpiresAt: r["token_expires_at"] === null ? null : Number(r["token_expires_at"]),
      error: text(r, "error"),
      updatedAt: Number(r["updated_at"]),
    };
  }

  private put(r: Row): void {
    this.sql.all(
      "INSERT INTO artroom_ws (lane, lease, state, fork, remote, lease_expires_at, token_id, token_expires_at, error, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (lane) DO UPDATE SET lease = excluded.lease, state = excluded.state, " +
        "fork = excluded.fork, remote = excluded.remote, lease_expires_at = excluded.lease_expires_at, token_id = excluded.token_id, " +
        "token_expires_at = excluded.token_expires_at, error = excluded.error, updated_at = excluded.updated_at",
      r.lane,
      r.lease,
      r.state,
      r.fork,
      r.remote,
      r.leaseExpiresAt,
      r.tokenId,
      r.tokenExpiresAt,
      r.error,
      this.now(),
    );
  }

  private insertDuty(fork: string, kind: DutyKind, state: DutyState, reason: string, tokenId: string | null, expiresAt: number | null): number {
    this.sql.all(
      "INSERT INTO artroom_ws_duty (fork, kind, token_id, reason, state, started_at, expires_at, next_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      fork,
      kind,
      tokenId,
      reason,
      state,
      this.now(),
      expiresAt,
      this.now(),
    );
    return Number(this.sql.all("SELECT last_insert_rowid() AS id")[0]?.["id"]);
  }

  /** Cleanup owed: an inventory of the fork, or one known token (with its expiry, when known). */
  private owe(fork: string, kind: "inventory" | "token" | "repo-delete", reason: string, tokenId: string | null = null, expiresAt: number | null = null): number {
    return this.insertDuty(fork, kind, "owed", reason, tokenId, expiresAt);
  }

  /**
   * A non-idempotent remote step is about to be sent. Written first, so that
   * if the host stops before the answer, the step is known to be unresolved.
   */
  private beginStep(fork: string, kind: "fork-create" | "mint" | "repo-create" | "repo-delete"): number {
    return this.insertDuty(fork, kind, "in-flight", kind, null, null);
  }

  /**
   * A step failed. Only an Artifacts error that says the request was refused
   * and changed nothing closes it; any other failure leaves it in flight.
   */
  private failedStep(id: number, error: unknown): void {
    if (refusedUnchanged(error)) this.answered(id, error);
    else this.sql.all("UPDATE artroom_ws_duty SET last_error = ? WHERE id = ?", errorNote("workspace step failed", error), id);
  }

  /** A definite answer arrived (success, or refused-unchanged): the remote call has finished. */
  private answered(id: number, error?: unknown): void {
    this.sql.all(
      "UPDATE artroom_ws_duty SET state = 'answered', answered_at = ?, next_at = ?, last_error = ? WHERE id = ? AND state = 'in-flight'",
      this.now(),
      this.now(),
      error === undefined ? null : errorNote("workspace step failed", error),
      id,
    );
  }

  private open_(fork: string): Duty[] {
    return this.sql.all("SELECT * FROM artroom_ws_duty WHERE fork = ? AND state != 'done' ORDER BY id", fork).map((r) => ({
      id: Number(r["id"]),
      kind: text(r, "kind") as DutyKind,
      state: text(r, "state") as DutyState,
      tokenId: text(r, "token_id"),
      startedAt: Number(r["started_at"]),
      answeredAt: r["answered_at"] === null ? null : Number(r["answered_at"]),
      expiresAt: r["expires_at"] === null ? null : Number(r["expires_at"]),
      attempts: Number(r["attempts"]),
      reason: text(r, "reason") ?? "",
    }));
  }

  private done(ids: readonly number[], reason: string): void {
    for (const id of ids) this.sql.all("UPDATE artroom_ws_duty SET state = 'done', done_at = ?, done_reason = ? WHERE id = ?", this.now(), reason, id);
  }

  private defer(ids: readonly number[], error: unknown, maxMs = 300_000): void {
    for (const id of ids) {
      const attempts = Number(this.sql.all("SELECT attempts FROM artroom_ws_duty WHERE id = ?", id)[0]?.["attempts"] ?? 0) + 1;
      const wait = Math.min(1000 * 2 ** Math.min(attempts, 9), maxMs);
      this.sql.all("UPDATE artroom_ws_duty SET attempts = ?, next_at = ?, last_error = ? WHERE id = ?", attempts, this.now() + wait, errorNote("workspace cleanup failed", error), id);
    }
  }

  /** Schedule the next inventory for steps still in flight. */
  private recheck(ids: readonly number[]): void {
    for (const id of ids) {
      const attempts = Number(this.sql.all("SELECT attempts FROM artroom_ws_duty WHERE id = ?", id)[0]?.["attempts"] ?? 0) + 1;
      const wait = Math.min(RECHECK_MS.first * 2 ** Math.min(attempts - 1, 4), RECHECK_MS.max);
      this.sql.all("UPDATE artroom_ws_duty SET attempts = ?, next_at = ? WHERE id = ?", attempts, this.now() + wait, id);
    }
  }

  /** Run `fn` with this fork to itself: one live host never interleaves provisioning and cleanup. */
  private exclusive<T>(fork: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(fork) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(fork, next.catch(() => undefined));
    return next;
  }

  // ---------------------------------------------------------------- views

  /** The public view (R-WS-1). Never a token. */
  view(lane: LaneId): WorkspaceOp | null {
    const r = this.row(lane);
    if (!r || r.state === "revoked") return null;
    const base = { id: workspaceOpId(lane, r.lease), kind: "workspace" as const, lane, updatedAt: iso(r.updatedAt) };
    if (r.state === "ready" && r.remote) {
      return { ...base, state: "ready", detail: { remote: r.remote as `https://${string}`, leaseGeneration: r.lease } };
    }
    if (r.state === "failed") {
      const error = JSON.parse(r.error ?? "{}") as ArtroomError;
      // Only safe metadata is shown, whatever a row written before request d29c09fa holds.
      return { ...base, state: "failed", error: { ...error, message: safeErrorText(typeof error.message === "string" ? error.message : "", "could not provision the workspace") } };
    }
    return { ...base, state: "pending" };
  }

  /** Duties not yet settled: cleanup owed, and remote steps whose outcome is not yet safe. */
  pendingCleanup(): number {
    // Not the holder's founding duties (`prepareCanonical` owns them); abandoned incarnations' are counted.
    const holder = this.holder();
    return Number(
      this.sql.all("SELECT COUNT(*) AS n FROM artroom_ws_duty WHERE state != 'done' AND fork != ? AND NOT (kind = 'repo-create' AND state = 'answered')", holder ?? "")[0]?.["n"] ?? 0,
    );
  }

  /** Every duty, for admins and tests. */
  duties(): { kind: DutyKind; state: DutyState; reason: string; doneReason: string | null }[] {
    return this.sql.all("SELECT kind, state, reason, done_reason FROM artroom_ws_duty ORDER BY id").map((r) => ({
      kind: text(r, "kind") as DutyKind,
      state: text(r, "state") as DutyState,
      reason: text(r, "reason") ?? "",
      doneReason: text(r, "done_reason"),
    }));
  }

  // ---------------------------------------------------------------- open and provision

  /**
   * Open (or return) the lane's workspace for this lease (synchronous; call
   * in the Room's request handling, then `provision`). A renewal of the same
   * lease records the new deadline, even while provisioning is under way. A
   * new lease generation replaces the previous one's row.
   */
  open(lane: LaneId, lease: LeaseGeneration, leaseExpiresAt: number): WorkspaceOp | Refusal {
    return this.sql.transaction(() => {
      if (leaseExpiresAt - this.now() < MIN_TOKEN_TTL_S * 1000) {
        return {
          refused: true,
          rule: "workspace-not-ready",
          reason: "The lease has less than a minute left, and a workspace token cannot be shorter than that.",
          fix: "Renew the lease, then open the workspace again.",
        } satisfies Refusal;
      }
      const r = this.row(lane);
      if (r && r.lease > lease) {
        return { refused: true, rule: "lease-fenced", reason: "This lease generation has ended.", fix: "Claim the lane again." } satisfies Refusal;
      }
      if (r && r.lease === lease && r.state === "pending") {
        // A renewal while pending: the minting reads this deadline after every await.
        if (r.leaseExpiresAt !== leaseExpiresAt) this.put({ ...r, leaseExpiresAt });
        return this.view(lane)!;
      }
      const tokenFresh = r?.tokenExpiresAt != null && r.tokenExpiresAt - this.now() > MIN_TOKEN_TTL_S * 1000;
      if (r && r.lease === lease && r.state === "ready" && tokenFresh && r.leaseExpiresAt === leaseExpiresAt) return this.view(lane)!;
      const fork = r?.fork ?? forkName(this.canonical, lane);
      // A token from a previous state of this row is owed revocation before anything else is minted.
      if (r?.tokenId) this.owe(fork, "token", r.lease === lease ? "renewed" : "lease-ended", r.tokenId, r.tokenExpiresAt);
      this.sql.all("DELETE FROM artroom_ws_secret WHERE lane = ?", lane);
      this.put({ lane, lease, state: "pending", fork, remote: r?.remote ?? null, leaseExpiresAt, tokenId: null, tokenExpiresAt: null, error: null, updatedAt: this.now() });
      return this.view(lane)!;
    });
  }

  /** Create the fork if needed, settle cleanup, mint this lease's token, and sweep the fork. Safe to call again. */
  provision(lane: LaneId): Promise<WorkspaceOp> {
    const running = this.inFlight.get(lane);
    if (running) return running;
    const r = this.row(lane);
    const fork = r?.fork ?? forkName(this.canonical, lane);
    const p = this.exclusive(fork, () => this.provisionNow(lane)).finally(() => this.inFlight.delete(lane));
    this.inFlight.set(lane, p);
    return p;
  }

  private async provisionNow(lane: LaneId): Promise<WorkspaceOp> {
    const start = this.row(lane);
    if (!start || start.state !== "pending") return this.view(lane) ?? this.failed(lane, new Error("no workspace"));
    const lease = start.lease;
    try {
      const { fork, remote } = await this.ensureFork(start.fork);
      this.sql.transaction(() => {
        const now = this.row(lane);
        if (now && now.lease === lease && now.state === "pending" && now.remote !== remote) this.put({ ...now, remote });
      });
      // Settle what is owed before minting, so nothing older is left behind.
      const owed = await this.cleanFork(start.fork);
      if (owed > 0) throw new CleanupOwed(`${owed} token cleanup step(s) on the fork are still owed; trying again later`);
      const token = await this.mintWithinLease(lane, lease, start.fork, fork);
      if (!token) return this.view(lane) ?? this.failed(lane, new Error("the lease ended"));
      // Ready only after an inventory that started after the token was recorded:
      // every attempt that answered, even with an error after applying, is swept.
      const left = await this.cleanFork(start.fork);
      if (left > 0) throw new CleanupOwed(`${left} token cleanup step(s) on the fork are still owed; trying again later`);
      this.sql.transaction(() => {
        const now = this.row(lane);
        if (now && now.lease === lease && now.state === "pending" && now.tokenId === token) this.put({ ...now, state: "ready" });
      });
      return this.view(lane)!;
    } catch (e) {
      return this.fail(lane, lease, e);
    }
  }

  /**
   * Mint a write token that ends no later than the lease (R-CRED-8), and
   * record it on the pending row. Each attempt is one remote step, written
   * as in flight before it is sent and marked answered when its answer
   * arrives; no attempt is retried inside the call, so every attempt is
   * accounted for. The lease is read again after the await: a token for an
   * ended or changed lease, or one whose actual expiry runs past the lease,
   * is owed revocation; an overlong token is replaced by one for the time
   * that is left, if Artifacts' minimum still fits. Returns the recorded
   * token's ID, or null if the lease ended.
   */
  private async mintWithinLease(lane: LaneId, lease: LeaseGeneration, forkName: string, fork: RepoHandle): Promise<string | null> {
    const existing = this.row(lane);
    // A token recorded by an earlier attempt whose sweep did not finish is reused, not doubled.
    if (existing?.tokenId && existing.lease === lease && existing.state === "pending" && existing.tokenExpiresAt !== null && existing.tokenExpiresAt <= existing.leaseExpiresAt && existing.tokenExpiresAt > this.now()) {
      return existing.tokenId;
    }
    let lastError: unknown = null;
    for (let i = 0; i < 4; i++) {
      const before = this.row(lane);
      if (!before || before.lease !== lease || before.state !== "pending") return null;
      const ttl = Math.floor((before.leaseExpiresAt - this.now()) / 1000) - TOKEN_MARGIN_S;
      if (ttl < MIN_TOKEN_TTL_S) throw new Error("the lease ends too soon for a workspace token; renew it first");
      const step = this.beginStep(forkName, "mint");
      let token: Awaited<ReturnType<RepoHandle["createToken"]>>;
      try {
        token = await fork.createToken("write", ttl);
      } catch (e) {
        this.failedStep(step, e);
        lastError = e;
        if (refusedUnchanged(e)) throw e;
        await (this.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))))(500 * 2 ** i);
        continue;
      }
      const outcome = this.sql.transaction(() => {
        this.answered(step);
        const still = this.row(lane);
        const expiresAt = Date.parse(token.expiresAt);
        const current = !!still && still.lease === lease && still.state === "pending";
        if (!current || !Number.isFinite(expiresAt) || expiresAt > still.leaseExpiresAt || expiresAt <= this.now()) {
          this.owe(forkName, "token", current ? "overlong" : "lease-ended", token.id, Number.isFinite(expiresAt) ? expiresAt : null);
          return current ? "retry" : "ended";
        }
        this.put({ ...still, tokenId: token.id, tokenExpiresAt: expiresAt });
        this.sql.all(
          "INSERT INTO artroom_ws_secret (lane, lease, token) VALUES (?, ?, ?) ON CONFLICT (lane) DO UPDATE SET lease = excluded.lease, token = excluded.token",
          lane,
          lease,
          token.plaintext,
        );
        return "recorded";
      });
      if (outcome === "recorded") return token.id;
      await this.cleanFork(forkName);
      if (outcome === "ended") return null;
    }
    throw lastError ?? new Error("could not mint a workspace token that ends within the lease");
  }

  private retryOpts() {
    return this.sleep ? { sleep: this.sleep } : {};
  }

  /** Mark this lease's pending workspace failed. A later lease's row is never touched. */
  private fail(lane: LaneId, lease: LeaseGeneration, e: unknown): WorkspaceOp {
    const r = this.row(lane);
    if (r && r.lease === lease && r.state === "pending") this.put({ ...r, state: "failed", error: JSON.stringify(failure(e)) });
    return this.view(lane) ?? this.failed(lane, e);
  }

  private failed(lane: LaneId, e: unknown): WorkspaceOp {
    return { id: `op_ws_${lane}_0`, kind: "workspace", lane, updatedAt: iso(this.now()), state: "failed", error: failure(e) };
  }

  // ---------------------------------------------------------------- the fork

  /**
   * Get the fork, creating it from the canonical repo on first use. Every
   * attempt is its own remote step, recorded before it is sent, because an
   * attempt that failed without a definite answer may still create the fork
   * and its 24-hour token later.
   */
  private async ensureFork(name: string): Promise<{ fork: RepoHandle; remote: string }> {
    const canonical = await withRetry(() => this.artifacts.get(this.canonical), this.retryOpts());
    let lastError: unknown = null;
    for (let i = 0; i < 5; i++) {
      const state = await this.forkState(name);
      if (state.kind === "ours") return state;
      if (state.kind === "absent") {
        const step = this.beginStep(name, "fork-create");
        try {
          await canonical.fork(name, { description: `Artroom lane fork of ${this.canonical}`, defaultBranchOnly: true });
          this.answered(step);
          continue; // read it back, with provenance
        } catch (e) {
          this.failedStep(step, e);
          lastError = e;
          if (refusedUnchanged(e) && artifactsCode(e) !== "ALREADY_EXISTS") throw e;
        }
      }
      await (this.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))))(500 * 2 ** i);
    }
    throw lastError ?? new Error(`the fork ${name} is not ready`);
  }

  /** The fork by name, only if it is ours: absent, busy or not ours, it throws, and nothing is sent to it. */
  private async ourFork(name: string): Promise<ForkRepo> {
    const state = await this.forkState(name);
    if (state.kind === "ours") return state.fork;
    throw new Error(state.kind === "absent" ? "the lane's fork does not exist" : "the lane's fork is being created");
  }

  /** The fork by name: ours (a fork of exactly this canonical repo), absent, busy, or not ours (thrown). */
  private async forkState(name: string): Promise<{ kind: "ours"; fork: RepoHandle; remote: string } | { kind: "absent" } | { kind: "busy" }> {
    try {
      const fork = await this.artifacts.get(name);
      const info = await fork.info();
      // Positive provenance: exactly a fork of this canonical repo, in this namespace.
      if (info.source !== `artifacts:${this.namespace}/${this.canonical}`) {
        // A fixed message: the stored and shown error keeps no names (request d29c09fa).
        throw new NotOurFork("A repository at the lane's fork name is not a fork of the room's repository. It was not used or changed.");
      }
      return { kind: "ours", fork, remote: info.remote };
    } catch (e) {
      const code = artifactsCode(e);
      if (code === "NOT_FOUND") return { kind: "absent" };
      if (code === "FORK_IN_PROGRESS" || code === "CREATE_IN_PROGRESS") return { kind: "busy" };
      throw e;
    }
  }

  /**
   * Settle the duties of one fork. The caller holds the fork's lock.
   * Returns how many duties still block a ready workspace: everything not
   * settled except remote steps still in flight from a host that stopped,
   * which keep their scheduled inventories without blocking a new lease.
   */
  private async cleanFork(name: string): Promise<number> {
    const runStart = this.now();
    try {
      return await this.cleanForkNow(name, runStart);
    } finally {
      // Whatever path this run took (busy, an error, an answer still settling),
      // no open duty that was due is left due: each gets its next check on the
      // capped backoff, so a Room alarm set from nextDue() never spins.
      const stale = this.open_(name).filter((d) => this.nextAt(d.id) <= runStart);
      this.recheck(stale.map((d) => d.id));
    }
  }

  private nextAt(id: number): number {
    return Number(this.sql.all("SELECT next_at FROM artroom_ws_duty WHERE id = ?", id)[0]?.["next_at"] ?? 0);
  }

  private async cleanForkNow(name: string, runStart: number): Promise<number> {
    const duties = this.open_(name);
    if (duties.length === 0) return 0;
    const blocking = () => this.open_(name).filter((d) => d.state !== "in-flight").length;
    let state: Awaited<ReturnType<Workspaces["forkState"]>>;
    try {
      state = await this.forkState(name);
    } catch (e) {
      if (e instanceof NotOurFork) {
        // Not ours: never touched. Our fork no longer holds the name, so no token of ours is live there, and every
        // answered or owed duty is settled. A step still in flight is not (plan 002): another repository at the name
        // is an observation, not that request's answer, and if the name frees the request may still apply. It keeps its
        // inventory on the capped backoff (`cleanFork`'s finally), and does not block.
        this.done(duties.filter((d) => d.state !== "in-flight").map((d) => d.id), "not-our-repository");
        return 0;
      }
      this.defer(duties.map((d) => d.id), e);
      return blocking();
    }
    // Busy (the fork is being created) is never a completion: every duty stays open, checked again later.
    if (state.kind === "busy") return blocking();
    const inFlight = duties.filter((d) => d.state === "in-flight");
    if (state.kind === "absent") {
      // No repository, so no tokens. But a fork creation still in flight may yet create one.
      this.done(duties.filter((d) => d.state !== "in-flight").map((d) => d.id), "no-repository");
      this.recheck(inFlight.map((d) => d.id));
      return blocking();
    }
    const fork = state.fork;
    for (const d of duties.filter((x) => x.kind === "token" && x.state === "owed")) {
      try {
        await withRetry(() => fork.revokeToken(d.tokenId!), this.retryOpts());
        this.done([d.id], "revoked");
      } catch (e) {
        // A known token's debt ends when the token itself has expired.
        if (d.expiresAt !== null && d.expiresAt <= this.now()) this.done([d.id], "expired");
        else this.defer([d.id], e);
      }
    }
    const sweep = duties.filter((x) => x.kind !== "token");
    if (sweep.length > 0) {
      try {
        // Only a complete inventory settles anything (plan 001): an incomplete or malformed one throws, and the debt stays scheduled.
        const tokens = completeInventory(await withRetry(() => fork.listTokens(), this.retryOpts()), `the token inventory of ${name}`);
        // Keep tokens a ready or installing lease has recorded on this fork, and a token the fork token ledger holds for a
        // pin in progress. While a fork token create on this fork is unsettled (sent or unknown), revoke only tokens whose
        // IDs a record names: the ledger's records, or this object's owed token duties; every other active token is left
        // (R-WS-3 suspended, never inferred around; request 02836f9a). Asked for each token immediately before its
        // revocation, after every earlier await.
        const kept = (t: TokenInfo) =>
          this.sql.all("SELECT 1 AS x FROM artroom_ws WHERE token_id = ? AND fork = ? AND state IN ('ready', 'pending') LIMIT 1", t.id, name).length > 0 ||
          this.forkTokens.holds(name, t.id) ||
          (this.forkTokens.unsettled(name) &&
            !this.forkTokens.names(name, t.id) &&
            this.sql.all("SELECT 1 AS x FROM artroom_ws_duty WHERE token_id = ? AND fork = ? AND state != 'done' LIMIT 1", t.id, name).length === 0);
        for (const t of tokens) {
          if (t.state !== "active" || kept(t)) continue;
          try {
            await withRetry(() => fork.revokeToken(t.id), this.retryOpts());
          } catch (e) {
            // Owed by ID from now on.
            const expires = Date.parse(t.expiresAt);
            this.defer([this.owe(name, "token", "inventory", t.id, Number.isFinite(expires) ? expires : null)], e);
          }
        }
        // This run settles owed inventories, and steps answered before it started.
        this.done(sweep.filter((d) => d.state === "owed").map((d) => d.id), "inventory");
        this.done(sweep.filter((d) => d.state === "answered" && d.answeredAt !== null && d.answeredAt <= runStart).map((d) => d.id), "answered-and-swept");
        this.recheck(inFlight.map((d) => d.id));
      } catch (e) {
        this.defer(sweep.map((d) => d.id), e);
      }
    } else {
      this.recheck(inFlight.map((d) => d.id));
    }
    return blocking();
  }

  // ---------------------------------------------------------------- the alarm contract

  /**
   * The Room's alarm calls this, then sets its next alarm to `nextDue()`.
   * It runs every duty that is due, one fork at a time. Returns how many
   * duties are still not settled (including steps in flight from a host
   * that stopped, or failed without a definite answer, which keep being rechecked).
   */
  async reconcile(): Promise<number> {
    // Incarnations of the canonical repository (public founding) are never forks: abandoned ones are settled here, and
    // the holder or sealed one is never touched.
    const incarnations = new Set(this.incarnationNames());
    const forks = this.sql
      .all("SELECT DISTINCT fork FROM artroom_ws_duty WHERE state != 'done' AND next_at <= ?", this.now())
      .map((r) => text(r, "fork")!)
      .filter((f) => !incarnations.has(f));
    for (const f of forks) {
      // One fork's unexpected failure must not stop the others; its duties were advanced by cleanFork.
      await this.exclusive(f, () => this.cleanFork(f)).catch(() => undefined);
    }
    await this.settleAbandoned().catch(() => undefined);
    return this.pendingCleanup();
  }

  /** When the next duty is due, or null if none is open. */
  nextDue(): number | null {
    const holder = this.holder();
    const r = this.sql.all(
      "SELECT MIN(next_at) AS t FROM artroom_ws_duty WHERE state != 'done' AND fork != ? AND NOT (kind = 'repo-create' AND state = 'answered')",
      holder ?? "",
    )[0];
    return r?.["t"] == null ? null : Number(r["t"]);
  }

  /** Same as `reconcile`, ignoring backoff. Returns how many duties are still open. */
  async sweep(): Promise<number> {
    this.sql.all("UPDATE artroom_ws_duty SET next_at = ? WHERE state != 'done' AND fork != ?", this.now(), this.holder() ?? "");
    return this.reconcile();
  }

  // ---------------------------------------------------------------- grant and revoke

  /**
   * The holder's credential (R-WS-2). The Room has judged authority, holder
   * and lease now; this checks the lease generation, readiness and expiry.
   */
  grant(lane: LaneId, lease: LeaseGeneration): WorkspaceGrant | Refusal {
    const r = this.row(lane);
    if (r && r.lease !== lease) {
      return { refused: true, rule: "lease-fenced", reason: "That lease generation is not current.", current: { leaseGeneration: r.lease } };
    }
    if (r && r.leaseExpiresAt <= this.now()) {
      return { refused: true, rule: "lease-fenced", reason: "The lease has expired.", fix: "Claim the lane again." };
    }
    const secret = this.sql.all("SELECT token FROM artroom_ws_secret WHERE lane = ? AND lease = ?", lane, lease)[0];
    const token = text(secret, "token");
    if (!r || r.state !== "ready" || !r.remote || !token || r.tokenExpiresAt === null || r.tokenExpiresAt <= this.now()) {
      return {
        refused: true,
        rule: "workspace-not-ready",
        reason: "The workspace has no current token.",
        fix: "Open the workspace and wait until it is ready.",
      };
    }
    return {
      op: workspaceOpId(lane, lease),
      lane,
      leaseGeneration: lease,
      remote: r.remote as `https://${string}`,
      token,
      expiresAt: iso(r.tokenExpiresAt),
    };
  }

  /**
   * End a lease's workspace access: on release, expiry or take-over
   * (R-LANE-8, R-WS-3). In one transaction it forgets the secret, records
   * the lease's token and an inventory of the fork as owed, and marks the
   * workspace revoked. Then it settles that cleanup under the fork's lock. A
   * release of a lease that has already been replaced changes nothing.
   * Returns how many duties on the fork still block (0 when everything owed
   * is revoked).
   */
  async revoke(lane: LaneId, lease: LeaseGeneration): Promise<number> {
    const r = this.row(lane);
    if (!r) return 0;
    const ended = this.sql.transaction(() => {
      const now = this.row(lane);
      if (!now || now.lease !== lease || now.state === "revoked") return false;
      this.sql.all("DELETE FROM artroom_ws_secret WHERE lane = ?", lane);
      if (now.tokenId) this.owe(now.fork, "token", "released", now.tokenId, now.tokenExpiresAt);
      this.owe(now.fork, "inventory", "released");
      this.put({ ...now, state: "revoked", tokenId: null, tokenExpiresAt: null });
      return true;
    });
    if (!ended) return 0;
    return this.exclusive(r.fork, () => this.cleanFork(r.fork));
  }

  // ---------------------------------------------------------------- the canonical repository (public founding)

  /*
   * Public founding (R-GEN-12; request b6b51de7, reviews a35b4b61 and
   * 3eb7bc44). The room's repository identity is `<namespace>/<base>`; the
   * repository is stored under an *incarnation* name, `<base>-<step>`, one per
   * creation attempt, where `<step>` is the ID of the create step, recorded
   * before the create is sent. A name is created at most once and never
   * reused, so a late remote effect can only reach the incarnation it was
   * sent for:
   * - `repo-create`: in flight until answered. A success makes the
   *   incarnation the *holder* and owes its 24-hour token (kept by value
   *   until a revocation answers) and an inventory. A create whose answer is
   *   lost abandons its incarnation; existence later proves it applied.
   * - `repo-delete`: owed for an abandoned incarnation, and retried until
   *   Artifacts answers (deleting a missing repository is harmless). A late
   *   delete can only remove that abandoned incarnation, never the one the
   *   room is sealed on.
   * No token is minted on the canonical repository before founding: the
   *   first commit is pushed with the create's own token. An inventory counts
   *   only when complete and well formed. Whenever the Room cannot vouch for
   *   every token on the holder, it abandons it and makes a new incarnation.
   * Abandoned incarnations' duties never block the seal and outlive it: the
   * alarm settles them before founding (`settleCanonical`) and after it
   * (`reconcile`, which never touches the sealed incarnation). `duties()`
   * lists them.
   */

  /** Rows of incarnation steps. */
  private incarnationNames(): string[] {
    return this.sql.all("SELECT DISTINCT fork FROM artroom_ws_duty WHERE kind = 'repo-create'").map((r) => text(r, "fork")!);
  }

  private isAbandoned(name: string): boolean {
    return this.sql.all("SELECT 1 FROM artroom_ws_duty WHERE fork = ? AND kind = 'repo-delete'", name).length > 0;
  }

  /** The incarnation the room is sealed on, or null. */
  sealedIncarnation(): string | null {
    const r = this.sql.all("SELECT fork FROM artroom_ws_duty WHERE kind = 'repo-create' AND done_reason = 'sealed' LIMIT 1")[0];
    return r ? text(r, "fork") : null;
  }

  /** The incarnation an answered create holds, not abandoned and not yet sealed, or null. */
  private holder(): string | null {
    const r = this.sql.all(
      "SELECT c.fork FROM artroom_ws_duty c WHERE c.kind = 'repo-create' AND c.state = 'answered' AND NOT EXISTS (SELECT 1 FROM artroom_ws_duty d WHERE d.fork = c.fork AND d.kind = 'repo-delete') ORDER BY c.id DESC LIMIT 1",
    )[0];
    return r ? text(r, "fork") : null;
  }

  /** Incarnations that are neither the holder nor sealed: each is deleted, or watched, until settled. */
  private abandonedNames(): string[] {
    const keep = new Set([this.holder(), this.sealedIncarnation()]);
    return this.incarnationNames().filter((n) => !keep.has(n));
  }

  /** The holder's creation token, while its revocation is owed. */
  private ownedToken(name: string): { duty: number; token: string; expiresAt: number | null } | null {
    const r = this.sql.all(
      "SELECT d.id, d.expires_at, s.token FROM artroom_ws_duty d JOIN artroom_ws_canon_secret s ON s.duty = d.id WHERE d.fork = ? AND d.kind = 'token' AND d.state = 'owed' ORDER BY d.id DESC LIMIT 1",
      name,
    )[0];
    return r ? { duty: Number(r["id"]), token: text(r, "token")!, expiresAt: r["expires_at"] === null ? null : Number(r["expires_at"]) } : null;
  }

  private dutiesOf(name: string, kind: DutyKind, state: DutyState): number[] {
    return this.sql.all("SELECT id FROM artroom_ws_duty WHERE fork = ? AND kind = ? AND state = ?", name, kind, state).map((r) => Number(r["id"]));
  }

  /** Create a new incarnation of `base`: its name, when its create answered; null when it did not (it is then abandoned). */
  private async createIncarnation(base: string): Promise<string | null> {
    // The step, and so the name, is on record before the create is sent.
    const { step, name } = this.sql.transaction(() => {
      const step = this.beginStep(base, "repo-create");
      const name = `${base}-${step}`;
      this.sql.all("UPDATE artroom_ws_duty SET fork = ? WHERE id = ?", name, step);
      return { step, name };
    });
    // Then a wake-up is stored for now, when the new step is due (and no earlier than any other founding debt), so a
    // host that stops while the create is outstanding leaves it scheduled (plan 004). If it cannot be stored, the
    // create is never sent, and the step says so.
    if (this.wake) {
      try {
        await this.wake(this.now());
      } catch (e) {
        this.done([step], "not-sent");
        throw e;
      }
    }
    let made: Awaited<ReturnType<ArtifactsNamespace["create"]>>;
    try {
      made = await this.artifacts.create(name, { description: "Artroom room repository", setDefaultBranch: "main" });
    } catch (e) {
      if (refusedUnchanged(e)) this.done([step], "refused");
      else this.failedStep(step, e);
      // Never waited on: a later attempt uses a new name, and the alarm deletes this one if it appears.
      return null;
    }
    this.sql.transaction(() => {
      this.answered(step);
      // Artifacts' creation token lasts 24 hours; it is owed by value, the only handle the answer gives.
      const duty = this.owe(name, "token", "created", null, this.now() + 24 * 3_600_000);
      this.sql.all("INSERT INTO artroom_ws_canon_secret (duty, token) VALUES (?, ?)", duty, made.token);
      this.owe(name, "inventory", "created");
    });
    return name;
  }

  /** Main on an incarnation, or null when it has none. */
  private async mainOf(name: string): Promise<string | null> {
    const repo = await withRetry(() => this.artifacts.get(name), this.retryOpts());
    for (const ref of ["main", "refs/heads/main"]) {
      const [top] = await repo.log({ ref, limit: 1 });
      if (top) return top.hash;
    }
    return null;
  }

  /** Revoke the holder's creation token. Only an answer settles it; otherwise it stays owed and this throws. */
  private async revokeOwned(name: string, owned: { duty: number; token: string; expiresAt: number | null }): Promise<void> {
    try {
      const repo = await withRetry(() => this.artifacts.get(name), this.retryOpts());
      await withRetry(() => repo.revokeToken(owned.token), this.retryOpts());
    } catch (e) {
      if (owned.expiresAt !== null && owned.expiresAt <= this.now()) {
        this.closeOwned(owned.duty, "expired");
        return;
      }
      this.defer([owned.duty], e);
      throw e;
    }
    this.closeOwned(owned.duty, "revoked");
  }

  private closeOwned(duty: number, reason: string): void {
    this.sql.transaction(() => {
      this.done([duty], reason);
      this.sql.all("DELETE FROM artroom_ws_canon_secret WHERE duty = ?", duty);
    });
  }

  /**
   * An incarnation's active tokens, from a complete inventory: every record
   * well formed (an ID, a scope, a state, an expiry), and as many records as
   * the total. Anything else throws: an incomplete or malformed listing
   * proves nothing is absent.
   */
  private async inventoryOf(name: string): Promise<readonly TokenInfo[]> {
    const repo = await withRetry(() => this.artifacts.get(name), this.retryOpts());
    const tokens = completeInventory(await withRetry(() => repo.listTokens(), this.retryOpts()), "the canonical repository's token inventory");
    return tokens.filter((t) => t.state === "active" && Date.parse(t.expiresAt) > this.now());
  }

  /** Settle the holder's owed inventories: no active token. Returns false when one is active. */
  private async inventoryClean(name: string): Promise<boolean> {
    const owed = this.dutiesOf(name, "inventory", "owed");
    let active: readonly TokenInfo[];
    try {
      active = await this.inventoryOf(name);
    } catch (e) {
      this.defer(owed, e);
      throw e;
    }
    if (active.length > 0) return false;
    this.done(owed, "inventory");
    return true;
  }

  /** Abandon an incarnation: its deletion is owed from now on, and it is never used again. */
  private abandon(name: string, why: string): void {
    if (!this.isAbandoned(name)) this.owe(name, "repo-delete", why);
  }

  /**
   * One run for an abandoned incarnation. The caller holds its lock. If the
   * repository exists, delete it; Artifacts' answer (deleted, or there was
   * none) settles every duty of the incarnation, including a create whose
   * answer was lost (it applied: the name was created once). If it is
   * absent, settle all but a create in flight, which may still apply and is
   * watched. Returns how many duties of the incarnation are still open.
   */
  private async cleanIncarnation(name: string): Promise<number> {
    const runStart = this.now();
    try {
      if (this.open_(name).length === 0) return 0;
      this.abandon(name, "abandoned");
      let exists: boolean;
      try {
        await (await this.artifacts.get(name)).info();
        exists = true;
      } catch (e) {
        if (artifactsCode(e) !== "NOT_FOUND") {
          this.defer(this.open_(name).filter((d) => d.state !== "in-flight").map((d) => d.id), e);
          return this.open_(name).length;
        }
        exists = false;
      }
      if (exists) {
        // An incarnation name was created once: seeing it proves that create applied, so it can apply no more.
        this.done(this.open_(name).filter((d) => d.kind === "repo-create" && d.state === "in-flight").map((d) => d.id), "seen");
        try {
          await withRetry(() => this.artifacts.delete(name), this.retryOpts());
        } catch (e) {
          this.defer(this.dutiesOf(name, "repo-delete", "owed"), e);
          return this.open_(name).length;
        }
        this.sql.transaction(() => {
          this.done(this.open_(name).map((d) => d.id), "deleted");
          this.sql.all("DELETE FROM artroom_ws_canon_secret WHERE duty IN (SELECT id FROM artroom_ws_duty WHERE fork = ? AND state = 'done')", name);
        });
      } else {
        this.sql.transaction(() => {
          this.done(this.open_(name).filter((d) => !(d.kind === "repo-create" && d.state === "in-flight")).map((d) => d.id), "no-repository");
          this.sql.all("DELETE FROM artroom_ws_canon_secret WHERE duty IN (SELECT id FROM artroom_ws_duty WHERE fork = ? AND state = 'done')", name);
        });
      }
      return this.open_(name).length;
    } finally {
      const stale = this.open_(name).filter((d) => this.nextAt(d.id) <= runStart);
      this.recheck(stale.map((d) => d.id));
    }
  }

  /** Run every abandoned incarnation's due duties. Returns how many are still open. */
  private async settleAbandoned(force = false): Promise<number> {
    let open = 0;
    for (const name of this.abandonedNames()) {
      const due = force || this.open_(name).some((d) => this.nextAt(d.id) <= this.now());
      if (due) open += await this.exclusive(name, () => this.cleanIncarnation(name)).catch(() => this.open_(name).length);
      else open += this.open_(name).length;
    }
    return open;
  }

  /**
   * Public founding, step 6 (R-GEN-12): make an incarnation of `base` ready
   * for the genesis and return its name. It is held by an answered create,
   * main holds the first commit (pushed with the create's token through
   * `firstCommit`), that token's revocation has answered, and a complete
   * inventory shows no active token. Whenever it cannot vouch for every
   * token, it abandons the incarnation and makes a new one (at most three
   * rounds). Throws when not ready; whatever is owed stays owed.
   */
  prepareCanonical(base: string, firstCommit: (remote: string, token: string) => Promise<unknown>): Promise<string> {
    return this.exclusive(`incarnations:${base}`, async () => {
      for (let round = 0; round < 3; round++) {
        let name = this.holder();
        if (name === null) {
          name = await this.createIncarnation(base);
          if (name === null) continue;
        }
        const owned = this.ownedToken(name);
        if ((await this.mainOf(name)) === null) {
          if (!owned) {
            this.abandon(name, "no first commit, and its token is spent");
            continue;
          }
          const repo = await withRetry(() => this.artifacts.get(name!), this.retryOpts());
          await firstCommit((await repo.info()).remote, owned.token);
          if ((await this.mainOf(name)) === null) {
            // Refused: the token may be dead. A new incarnation, rather than a retry with it.
            this.abandon(name, "the first commit was refused");
            continue;
          }
        }
        if (owned) await this.revokeOwned(name, owned);
        if (!(await this.inventoryClean(name))) {
          this.abandon(name, "an active token nobody owes");
          continue;
        }
        // Best effort now; the alarm retries whatever is left.
        await this.settleAbandoned(true).catch(() => undefined);
        return name;
      }
      await this.settleAbandoned(true).catch(() => undefined);
      throw new Error("the canonical repository is not ready yet");
    });
  }

  /**
   * In the transaction that seals the genesis: `name` is the holder, and
   * nothing is owed on it (`prepareCanonical` returned it). No destructive
   * effect can be aimed at it: deletes are only ever sent for abandoned
   * incarnations, and no other attempt uses its name. Throws, and so aborts
   * the seal, otherwise. Abandoned incarnations' duties do not block it.
   */
  sealCanonical(name: string): void {
    const owed = this.sql.all("SELECT 1 FROM artroom_ws_duty WHERE fork = ? AND state != 'done' AND kind != 'repo-create'", name).length;
    if (this.holder() !== name || this.isAbandoned(name) || owed > 0) throw new Error("the canonical repository still owes cleanup");
    this.done(this.dutiesOf(name, "repo-create", "answered"), "sealed");
  }

  /**
   * Before founding, the alarm's work: revoke the holder's creation token if
   * still owed, settle its owed inventory (abandoning it if a token nobody
   * owes is active), and settle abandoned incarnations. Returns how many
   * duties are still open.
   */
  settleCanonical(): Promise<number> {
    const run = async () => {
      const name = this.holder();
      if (name !== null) {
        await this.exclusive(name, async () => {
          const runStart = this.now();
          try {
            const owned = this.ownedToken(name);
            if (owned) await this.revokeOwned(name, owned).catch(() => undefined);
            if (this.dutiesOf(name, "inventory", "owed").length > 0) {
              const clean = await this.inventoryClean(name).catch(() => true);
              if (!clean) this.abandon(name, "an active token nobody owes");
            }
          } finally {
            this.recheck(this.open_(name).filter((d) => d.state === "owed" && this.nextAt(d.id) <= runStart).map((d) => d.id));
          }
        });
      }
      await this.settleAbandoned(true);
      return this.canonicalOpen();
    };
    return run();
  }

  /** Open duties of the holder and of abandoned incarnations (not of the sealed one, which has none). */
  private canonicalOpen(): number {
    const names = [this.holder(), ...this.abandonedNames()].filter((n): n is string => n !== null);
    return names.reduce((n, name) => n + this.open_(name).filter((d) => !(d.kind === "repo-create" && d.state === "answered")).length, 0);
  }

  /** When `settleCanonical` is next due, or null. */
  canonicalDue(): number | null {
    const names = [this.holder(), ...this.abandonedNames()].filter((n): n is string => n !== null);
    const ids = names.flatMap((name) => this.open_(name).filter((d) => !(d.kind === "repo-create" && d.state === "answered")).map((d) => d.id));
    return ids.length ? Math.min(...ids.map((id) => this.nextAt(id))) : null;
  }
}

type DutyKind = "inventory" | "token" | "fork-create" | "mint" | "repo-create" | "repo-delete";
type DutyState = "in-flight" | "answered" | "owed" | "done";
interface Duty {
  readonly id: number;
  readonly kind: DutyKind;
  readonly state: DutyState;
  readonly tokenId: string | null;
  readonly startedAt: number;
  readonly answeredAt: number | null;
  readonly expiresAt: number | null;
  readonly attempts: number;
  readonly reason: string;
}

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
 * no ready or installing lease has recorded. When it succeeds, it settles
 * every `owed` inventory and every step answered before it started. A step
 * still `in-flight` is never settled, by any snapshot or by elapsed time:
 * it keeps an inventory on a capped backoff (every minute at first, then
 * every 30 minutes), which revokes whatever it creates, for as long as the
 * fork exists. A known token's debt also ends when that token has expired.
 * Every retry is its own step, because an earlier failed attempt may still
 * apply.
 *
 * A workspace becomes ready only after an inventory that started after its
 * token was recorded has succeeded, so every attempt that answered (even
 * with a retryable error after it applied) has been swept. The in-memory
 * fork lock coordinates one live host only; it is never restart evidence.
 * The Room's alarm calls `reconcile()` and sets its next alarm from
 * `nextDue()`. Cleanup checks provenance first, and never touches a
 * repository that is not this canonical repo's fork.
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
import { type ArtifactsNamespace, type RepoHandle, artifactsCode, refusedUnchanged, withRetry } from "../artifacts.ts";

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
}

/** How often an unresolved remote step's inventory runs: first after 1 minute, backing off to every 30 minutes. */
export const RECHECK_MS = { first: 60_000, max: 1_800_000 } as const;

const iso = (ms: number) => new Date(ms).toISOString();
const TOKEN = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const redact = (s: string) => s.replace(TOKEN, "<token>");

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
    message: redact(`Could not provision the workspace: ${e instanceof Error ? e.message : String(e)}`).slice(0, 300),
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
  private readonly inFlight = new Map<LaneId, Promise<WorkspaceOp>>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(opts: WorkspacesOptions) {
    this.sql = opts.sql;
    this.artifacts = opts.artifacts;
    this.canonical = opts.canonical;
    this.namespace = opts.namespace;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep;
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_ws (lane TEXT PRIMARY KEY, lease INTEGER NOT NULL, state TEXT NOT NULL, fork TEXT NOT NULL, " +
        "remote TEXT, lease_expires_at INTEGER NOT NULL, token_id TEXT, token_expires_at INTEGER, error TEXT, updated_at INTEGER NOT NULL)",
    );
    // Secrets live apart from the public row, so no read of the row can carry one.
    this.sql.all("CREATE TABLE IF NOT EXISTS artroom_ws_secret (lane TEXT PRIMARY KEY, lease INTEGER NOT NULL, token TEXT NOT NULL)");
    // Duties: remote steps whose outcome matters, and cleanup owed (see the module comment).
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_ws_duty (id INTEGER PRIMARY KEY AUTOINCREMENT, fork TEXT NOT NULL, kind TEXT NOT NULL, " +
        "token_id TEXT, reason TEXT NOT NULL, state TEXT NOT NULL, started_at INTEGER NOT NULL, answered_at INTEGER, expires_at INTEGER, " +
        "attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, last_error TEXT, done_at INTEGER, done_reason TEXT)",
    );
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
  private owe(fork: string, kind: "inventory" | "token", reason: string, tokenId: string | null = null, expiresAt: number | null = null): number {
    return this.insertDuty(fork, kind, "owed", reason, tokenId, expiresAt);
  }

  /**
   * A non-idempotent remote step is about to be sent. Written first, so that
   * if the host stops before the answer, the step is known to be unresolved.
   */
  private beginStep(fork: string, kind: "fork-create" | "mint"): number {
    return this.insertDuty(fork, kind, "in-flight", kind, null, null);
  }

  /**
   * A step failed. Only an Artifacts error that says the request was refused
   * and changed nothing closes it; any other failure leaves it in flight.
   */
  private failedStep(id: number, error: unknown): void {
    if (refusedUnchanged(error)) this.answered(id, error);
    else this.sql.all("UPDATE artroom_ws_duty SET last_error = ? WHERE id = ?", redact(String(error)).slice(0, 300), id);
  }

  /** A definite answer arrived (success, or refused-unchanged): the remote call has finished. */
  private answered(id: number, error?: unknown): void {
    this.sql.all(
      "UPDATE artroom_ws_duty SET state = 'answered', answered_at = ?, next_at = ?, last_error = ? WHERE id = ? AND state = 'in-flight'",
      this.now(),
      this.now(),
      error === undefined ? null : redact(String(error)).slice(0, 300),
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
    }));
  }

  private done(ids: readonly number[], reason: string): void {
    for (const id of ids) this.sql.all("UPDATE artroom_ws_duty SET state = 'done', done_at = ?, done_reason = ? WHERE id = ?", this.now(), reason, id);
  }

  private defer(ids: readonly number[], error: string, maxMs = 300_000): void {
    for (const id of ids) {
      const attempts = Number(this.sql.all("SELECT attempts FROM artroom_ws_duty WHERE id = ?", id)[0]?.["attempts"] ?? 0) + 1;
      const wait = Math.min(1000 * 2 ** Math.min(attempts, 9), maxMs);
      this.sql.all("UPDATE artroom_ws_duty SET attempts = ?, next_at = ?, last_error = ? WHERE id = ?", attempts, this.now() + wait, redact(error).slice(0, 300), id);
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
    if (r.state === "failed") return { ...base, state: "failed", error: JSON.parse(r.error ?? "{}") as ArtroomError };
    return { ...base, state: "pending" };
  }

  /** Duties not yet settled: cleanup owed, and remote steps whose outcome is not yet safe. */
  pendingCleanup(): number {
    return Number(this.sql.all("SELECT COUNT(*) AS n FROM artroom_ws_duty WHERE state != 'done'")[0]?.["n"] ?? 0);
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

  /** The fork by name: ours (a fork of exactly this canonical repo), absent, busy, or not ours (thrown). */
  private async forkState(name: string): Promise<{ kind: "ours"; fork: RepoHandle; remote: string } | { kind: "absent" } | { kind: "busy" }> {
    try {
      const fork = await this.artifacts.get(name);
      const info = await fork.info();
      // Positive provenance: exactly a fork of this canonical repo, in this namespace.
      if (info.source !== `artifacts:${this.namespace}/${this.canonical}`) {
        throw new NotOurFork(`A repository named ${name} exists but is not a fork of ${this.namespace}/${this.canonical}. It was not used or changed.`);
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
        // Not ours: never touched, and nothing of ours can be live in it.
        this.done(duties.map((d) => d.id), "not-our-repository");
        return 0;
      }
      this.defer(duties.map((d) => d.id), String(e));
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
        else this.defer([d.id], String(e));
      }
    }
    const sweep = duties.filter((x) => x.kind !== "token");
    if (sweep.length > 0) {
      try {
        const { tokens } = await withRetry(() => fork.listTokens(), this.retryOpts());
        // Keep only tokens a ready or installing lease has recorded on this fork.
        const keep = new Set(
          this.sql
            .all("SELECT token_id FROM artroom_ws WHERE fork = ? AND state IN ('ready', 'pending') AND token_id IS NOT NULL", name)
            .map((r) => text(r, "token_id")!),
        );
        for (const t of tokens) {
          if (t.state !== "active" || keep.has(t.id)) continue;
          try {
            await withRetry(() => fork.revokeToken(t.id), this.retryOpts());
          } catch (e) {
            // Owed by ID from now on.
            const expires = Date.parse(t.expiresAt);
            this.defer([this.owe(name, "token", "inventory", t.id, Number.isFinite(expires) ? expires : null)], String(e));
          }
        }
        // This run settles owed inventories, and steps answered before it started.
        this.done(sweep.filter((d) => d.state === "owed").map((d) => d.id), "inventory");
        this.done(sweep.filter((d) => d.state === "answered" && d.answeredAt !== null && d.answeredAt <= runStart).map((d) => d.id), "answered-and-swept");
        this.recheck(inFlight.map((d) => d.id));
      } catch (e) {
        this.defer(sweep.map((d) => d.id), String(e));
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
    const forks = this.sql
      .all("SELECT DISTINCT fork FROM artroom_ws_duty WHERE state != 'done' AND next_at <= ?", this.now())
      .map((r) => text(r, "fork")!);
    for (const f of forks) {
      // One fork's unexpected failure must not stop the others; its duties were advanced by cleanFork.
      await this.exclusive(f, () => this.cleanFork(f)).catch(() => undefined);
    }
    return this.pendingCleanup();
  }

  /** When the next duty is due, or null if none is open. */
  nextDue(): number | null {
    const r = this.sql.all("SELECT MIN(next_at) AS t FROM artroom_ws_duty WHERE state != 'done'")[0];
    return r?.["t"] == null ? null : Number(r["t"]);
  }

  /** Same as `reconcile`, ignoring backoff. Returns how many duties are still open. */
  async sweep(): Promise<number> {
    this.sql.all("UPDATE artroom_ws_duty SET next_at = ? WHERE state != 'done'", this.now());
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
}

type DutyKind = "inventory" | "token" | "fork-create" | "mint";
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
}

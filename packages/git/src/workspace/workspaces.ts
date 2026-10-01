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
 * One durable cleanup protocol covers every token that must not stay live:
 * - Before any step that can leave a token nobody records (creating a fork,
 *   which comes with its own long-lived token; minting a lease token;
 *   releasing a lease), an obligation is written to SQLite first.
 * - An obligation is resolved only after Artifacts confirms the cleanup:
 *   `inventory` lists the fork's tokens and revokes every active one except
 *   the current ready lease's recorded token; `token` revokes one known ID.
 * - Every operation on one fork (provisioning, cleanup) runs one at a time,
 *   so cleanup can never revoke a token that is being installed.
 * - A workspace is made ready only when its fork has no cleanup owed, so a
 *   ready workspace has exactly one live token.
 * - The Room's alarm calls `reconcile()` and sets its next alarm from
 *   `nextDue()`. That is how cleanup survives failures and restarts.
 * - Cleanup checks provenance first, and never touches a repository that is
 *   not this canonical repo's fork.
 *
 * The token is kept in this Durable Object's SQLite until revoked, so the
 * holder can retrieve it again. It is never logged, published or put in an
 * error (R-WS-4).
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
import { type ArtifactsNamespace, type RepoHandle, artifactsCode, withRetry } from "../artifacts.ts";

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
    // Cleanup owed on a fork: `inventory` (every active token but the current one) or one `token`.
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_ws_cleanup (id INTEGER PRIMARY KEY AUTOINCREMENT, fork TEXT NOT NULL, kind TEXT NOT NULL, " +
        "token_id TEXT, reason TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, last_error TEXT)",
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

  /** Record cleanup owed on a fork. Returns its ID. */
  private owe(fork: string, kind: "inventory" | "token", reason: string, tokenId: string | null = null): number {
    this.sql.all("INSERT INTO artroom_ws_cleanup (fork, kind, token_id, reason, next_at) VALUES (?, ?, ?, ?, ?)", fork, kind, tokenId, reason, this.now());
    return Number(this.sql.all("SELECT last_insert_rowid() AS id")[0]?.["id"]);
  }

  private owed(fork: string): { id: number; kind: "inventory" | "token"; tokenId: string | null; attempts: number }[] {
    return this.sql.all("SELECT id, kind, token_id, attempts FROM artroom_ws_cleanup WHERE fork = ? ORDER BY id", fork).map((r) => ({
      id: Number(r["id"]),
      kind: text(r, "kind") as "inventory" | "token",
      tokenId: text(r, "token_id"),
      attempts: Number(r["attempts"]),
    }));
  }

  private resolve(ids: readonly number[]): void {
    for (const id of ids) this.sql.all("DELETE FROM artroom_ws_cleanup WHERE id = ?", id);
  }

  private deferCleanup(ids: readonly number[], error: string): void {
    for (const id of ids) {
      const attempts = Number(this.sql.all("SELECT attempts FROM artroom_ws_cleanup WHERE id = ?", id)[0]?.["attempts"] ?? 0) + 1;
      const wait = Math.min(1000 * 2 ** Math.min(attempts, 8), 300_000);
      this.sql.all("UPDATE artroom_ws_cleanup SET attempts = ?, next_at = ?, last_error = ? WHERE id = ?", attempts, this.now() + wait, redact(error).slice(0, 300), id);
    }
  }

  /** Run `fn` with this fork to itself: provisioning and cleanup never interleave. */
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

  /** Cleanup still owed, by fork. For admins and tests. */
  pendingCleanup(): number {
    return Number(this.sql.all("SELECT COUNT(*) AS n FROM artroom_ws_cleanup")[0]?.["n"] ?? 0);
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
      if (r?.tokenId) this.owe(fork, "token", r.lease === lease ? "renewed" : "lease-ended", r.tokenId);
      this.sql.all("DELETE FROM artroom_ws_secret WHERE lane = ?", lane);
      this.put({ lane, lease, state: "pending", fork, remote: r?.remote ?? null, leaseExpiresAt, tokenId: null, tokenExpiresAt: null, error: null, updatedAt: this.now() });
      return this.view(lane)!;
    });
  }

  /** Create the fork if needed, settle any cleanup owed, and mint this lease's token. Safe to call again. */
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
      // Ready only with nothing owed: then the lease's token is the fork's only live token.
      const owedLeft = await this.cleanFork(start.fork);
      if (owedLeft > 0) throw new CleanupOwed(`${owedLeft} token cleanup step(s) on the fork are still owed; trying again later`);
      const minted = await this.mintWithinLease(lane, lease, start.fork, fork);
      if (!minted) return this.view(lane) ?? this.failed(lane, new Error("the lease ended"));
      return this.view(lane)!;
    } catch (e) {
      return this.fail(lane, lease, e);
    }
  }

  /**
   * Mint a write token that ends no later than the lease (R-CRED-8), and
   * install it. An inventory obligation is written before the mint, so a
   * token minted just before a crash is found and revoked. The lease is read
   * again after the await: a token for an ended or changed lease, or one
   * whose actual expiry runs past the lease, is revoked; an overlong token is
   * replaced by one for the time that is left, if Artifacts' minimum still
   * fits. Returns false if the lease ended.
   */
  private async mintWithinLease(lane: LaneId, lease: LeaseGeneration, forkName: string, fork: RepoHandle): Promise<boolean> {
    for (let i = 0; i < 3; i++) {
      const before = this.row(lane);
      if (!before || before.lease !== lease || before.state !== "pending") return false;
      const ttl = Math.floor((before.leaseExpiresAt - this.now()) / 1000) - TOKEN_MARGIN_S;
      if (ttl < MIN_TOKEN_TTL_S) throw new Error("the lease ends too soon for a workspace token; renew it first");
      const mintDebt = this.owe(forkName, "inventory", "mint");
      const token = await withRetry(() => fork.createToken("write", ttl), this.retryOpts());
      const installed = this.sql.transaction(() => {
        const still = this.row(lane);
        const expiresAt = Date.parse(token.expiresAt);
        const current = !!still && still.lease === lease && still.state === "pending";
        if (!current || !Number.isFinite(expiresAt) || expiresAt > still.leaseExpiresAt || expiresAt <= this.now()) {
          this.owe(forkName, "token", current ? "overlong" : "lease-ended", token.id);
          return current ? "retry" : "ended";
        }
        this.put({ ...still, state: "ready", remote: still.remote ?? null, tokenId: token.id, tokenExpiresAt: expiresAt });
        this.sql.all(
          "INSERT INTO artroom_ws_secret (lane, lease, token) VALUES (?, ?, ?) ON CONFLICT (lane) DO UPDATE SET lease = excluded.lease, token = excluded.token",
          lane,
          lease,
          token.plaintext,
        );
        // The minted token is now recorded: this mint can leave no orphan.
        this.resolve([mintDebt]);
        return "ready";
      });
      if (installed === "ready") return true;
      await this.cleanFork(forkName);
      if (installed === "ended") return false;
    }
    throw new Error("could not mint a workspace token that ends within the lease");
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

  /** Get the fork, creating it from the canonical repo on first use. Its creation token is owed revocation from before the call. */
  private async ensureFork(name: string): Promise<{ fork: RepoHandle; remote: string }> {
    const existing = await this.forkState(name);
    if (existing.kind === "ours") return existing;
    const canonical = await withRetry(() => this.artifacts.get(this.canonical), this.retryOpts());
    // Written before the call: the fork's long-lived creation token must never outlive a lost response or a crash.
    this.owe(name, "inventory", "fork-created");
    try {
      const made = await withRetry(() => canonical.fork(name, { description: `Artroom lane fork of ${this.canonical}`, defaultBranchOnly: true }), this.retryOpts());
      const got = await this.forkState(name);
      if (got.kind === "ours") return got;
      return { fork: await withRetry(() => this.artifacts.get(name), this.retryOpts()), remote: made.remote };
    } catch (e) {
      // A fork whose response was lost on an earlier try already exists.
      if (artifactsCode(e) === "ALREADY_EXISTS" || artifactsCode(e) === "FORK_IN_PROGRESS" || artifactsCode(e) === "INTERNAL_ERROR") {
        for (let i = 0; i < 10; i++) {
          const got = await this.forkState(name);
          if (got.kind === "ours") return got;
          await (this.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))))(1000);
        }
      }
      throw e;
    }
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
   * Settle the cleanup owed on one fork. The caller holds the fork's lock.
   * Each obligation is resolved only after Artifacts confirms it. Returns how
   * many are still owed.
   */
  private async cleanFork(name: string): Promise<number> {
    const owed = this.owed(name);
    if (owed.length === 0) return 0;
    let state: Awaited<ReturnType<Workspaces["forkState"]>>;
    try {
      state = await this.forkState(name);
    } catch (e) {
      if (e instanceof NotOurFork) {
        // Not ours: never touched. Nothing of ours can be live in it.
        this.resolve(owed.map((o) => o.id));
        return 0;
      }
      this.deferCleanup(owed.map((o) => o.id), String(e));
      return owed.length;
    }
    if (state.kind === "absent") {
      this.resolve(owed.map((o) => o.id)); // no repository, no tokens
      return 0;
    }
    if (state.kind === "busy") return owed.length;
    const fork = state.fork;
    for (const o of owed.filter((x) => x.kind === "token")) {
      try {
        await withRetry(() => fork.revokeToken(o.tokenId!), this.retryOpts());
        this.resolve([o.id]);
      } catch (e) {
        this.deferCleanup([o.id], String(e));
      }
    }
    const inventory = owed.filter((x) => x.kind === "inventory");
    if (inventory.length > 0) {
      try {
        const { tokens } = await withRetry(() => fork.listTokens(), this.retryOpts());
        // Keep only the token a ready lease has recorded on this fork.
        const keep = new Set(
          this.sql.all("SELECT token_id FROM artroom_ws WHERE fork = ? AND state = 'ready' AND token_id IS NOT NULL", name).map((r) => text(r, "token_id")!),
        );
        let failed = false;
        for (const t of tokens) {
          if (t.state !== "active" || keep.has(t.id)) continue;
          try {
            await withRetry(() => fork.revokeToken(t.id), this.retryOpts());
          } catch (e) {
            failed = true;
            this.owe(name, "token", "inventory", t.id);
            this.deferCleanup([Number(this.sql.all("SELECT last_insert_rowid() AS id")[0]?.["id"])], String(e));
          }
        }
        if (!failed) this.resolve(inventory.map((o) => o.id));
        else this.deferCleanup(inventory.map((o) => o.id), "a revocation failed");
      } catch (e) {
        this.deferCleanup(inventory.map((o) => o.id), String(e));
      }
    }
    return this.owed(name).length;
  }

  // ---------------------------------------------------------------- the alarm contract

  /**
   * The Room's alarm calls this, then sets its next alarm to `nextDue()`.
   * It settles every cleanup that is due, one fork at a time. Returns how
   * many cleanup steps are still owed.
   */
  async reconcile(): Promise<number> {
    const forks = this.sql
      .all("SELECT DISTINCT fork FROM artroom_ws_cleanup WHERE next_at <= ?", this.now())
      .map((r) => text(r, "fork")!);
    for (const f of forks) await this.exclusive(f, () => this.cleanFork(f));
    return this.pendingCleanup();
  }

  /** When the next cleanup step is due, or null if none is owed. */
  nextDue(): number | null {
    const r = this.sql.all("SELECT MIN(next_at) AS t FROM artroom_ws_cleanup")[0];
    return r?.["t"] == null ? null : Number(r["t"]);
  }

  /** Same as `reconcile`, ignoring backoff. Returns how many are still owed. */
  async sweep(): Promise<number> {
    this.sql.all("UPDATE artroom_ws_cleanup SET next_at = ?", this.now());
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
   * workspace revoked. Then it settles that cleanup, under the fork's lock,
   * so it can never revoke a later lease's token. A release of a lease that
   * has already been replaced changes nothing. Returns how many cleanup
   * steps are still owed on the fork (0 when everything is revoked).
   */
  async revoke(lane: LaneId, lease: LeaseGeneration): Promise<number> {
    const r = this.row(lane);
    if (!r) return 0;
    const ended = this.sql.transaction(() => {
      const now = this.row(lane);
      if (!now || now.lease !== lease || now.state === "revoked") return false;
      this.sql.all("DELETE FROM artroom_ws_secret WHERE lane = ?", lane);
      if (now.tokenId) this.owe(now.fork, "token", "released", now.tokenId);
      this.owe(now.fork, "inventory", "released");
      this.put({ ...now, state: "revoked", tokenId: null, tokenExpiresAt: null });
      return true;
    });
    if (!ended) return 0;
    return this.exclusive(r.fork, () => this.cleanFork(r.fork));
  }
}


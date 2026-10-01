/**
 * Lane workspaces: one Artifacts fork per lane, and one write token per lease
 * generation, scoped to that fork and expiring no later than the lease
 * (plan sections 5 and 6; R-CRED-8, R-WS-1 to R-WS-5, R-LANE-8).
 *
 * - The public view (`WorkspaceOp`) never holds a token (R-WS-1).
 * - `grant` returns the token. The Room calls it only after judging the
 *   caller's authority, holdership and lease now (R-WS-2); `grant` checks the
 *   lease generation and expiry again.
 * - `revoke` ends every active token on the fork. The Room calls it on
 *   release, expiry and take-over (R-WS-3). It lists the fork's tokens, so it
 *   also catches a token minted just before a crash and never recorded.
 * - Fork creation retries Artifacts' transient internal errors (10400).
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

/** Seconds kept back from a token's lifetime, so clock differences cannot carry it past the lease. */
export const TOKEN_MARGIN_S = 5;

function failure(e: unknown): ArtroomError {
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
    // Tokens that must be revoked but could not be yet: retried by `sweep`.
    this.sql.all("CREATE TABLE IF NOT EXISTS artroom_ws_revoke (token_id TEXT PRIMARY KEY, fork TEXT NOT NULL)");
  }

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

  /**
   * Open (or return) the lane's workspace for this lease (synchronous; call
   * in the Room's request handling, then `provision`). A new lease generation
   * replaces the previous one's row; its token must already be revoked.
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
      const tokenFresh = r?.tokenExpiresAt != null && r.tokenExpiresAt - this.now() > MIN_TOKEN_TTL_S * 1000;
      if (r && r.lease === lease && (r.state === "pending" || (r.state === "ready" && tokenFresh && r.leaseExpiresAt === leaseExpiresAt))) {
        return this.view(lane)!;
      }
      this.put({
        lane,
        lease,
        state: "pending",
        fork: r?.fork ?? forkName(this.canonical, lane),
        remote: r?.remote ?? null,
        leaseExpiresAt,
        tokenId: r?.lease === lease ? r.tokenId : null,
        tokenExpiresAt: r?.lease === lease ? r.tokenExpiresAt : null,
        error: null,
        updatedAt: this.now(),
      });
      return this.view(lane)!;
    });
  }

  /** Create the fork if needed and mint this lease's token. Safe to call again. */
  provision(lane: LaneId): Promise<WorkspaceOp> {
    const running = this.inFlight.get(lane);
    if (running) return running;
    const p = this.provisionNow(lane).finally(() => this.inFlight.delete(lane));
    this.inFlight.set(lane, p);
    return p;
  }

  private async provisionNow(lane: LaneId): Promise<WorkspaceOp> {
    const start = this.row(lane);
    if (!start || start.state !== "pending") return this.view(lane) ?? this.fail(lane, new Error("no workspace"));
    let fork: RepoHandle;
    let remote: string;
    try {
      await this.sweep();
      ({ fork, remote } = await this.ensureFork(start.fork));
      // A previous token for this lease (a renewal) is replaced, not kept.
      if (start.tokenId) await this.revokeOrRemember(start.fork, fork, start.tokenId);
      const minted = await this.mintWithinLease(lane, start.lease, start.fork, fork);
      if (!minted) return this.view(lane) ?? this.fail(lane, new Error("the lease ended"));
      const { token, expiresAt, still } = minted;
      this.sql.transaction(() => {
        this.put({
          ...still,
          state: "ready",
          remote,
          tokenId: token.id,
          tokenExpiresAt: expiresAt,
        });
        this.sql.all(
          "INSERT INTO artroom_ws_secret (lane, lease, token) VALUES (?, ?, ?) ON CONFLICT (lane) DO UPDATE SET lease = excluded.lease, token = excluded.token",
          lane,
          still.lease,
          token.plaintext,
        );
      });
      return this.view(lane)!;
    } catch (e) {
      return this.fail(lane, e);
    }
  }

  /**
   * Mint a write token that ends no later than the lease (R-CRED-8). The
   * lease is read again after every await: a token minted for an ended or
   * changed lease, or one whose actual expiry runs past the lease, is
   * revoked. An overlong token is replaced by one for the time that is left,
   * if Artifacts' minimum lifetime still fits. Null if the lease ended.
   */
  private async mintWithinLease(lane: LaneId, lease: LeaseGeneration, forkName: string, fork: RepoHandle) {
    for (let i = 0; i < 3; i++) {
      const before = this.row(lane);
      if (!before || before.lease !== lease || before.state !== "pending") return null;
      const ttl = Math.floor((before.leaseExpiresAt - this.now()) / 1000) - TOKEN_MARGIN_S;
      if (ttl < MIN_TOKEN_TTL_S) throw new Error("the lease ends too soon for a workspace token; renew it first");
      const token = await withRetry(() => fork.createToken("write", ttl), this.retryOpts());
      const still = this.row(lane);
      const expiresAt = Date.parse(token.expiresAt);
      const current = !!still && still.lease === lease && still.state === "pending";
      if (current && Number.isFinite(expiresAt) && expiresAt <= still.leaseExpiresAt && expiresAt > this.now()) {
        return { token, expiresAt, still };
      }
      await this.revokeOrRemember(forkName, fork, token.id);
      if (!current) return null;
    }
    throw new Error("could not mint a workspace token that ends within the lease");
  }

  /** Revoke a token; if Artifacts cannot be reached, remember it so `sweep` revokes it later. */
  private async revokeOrRemember(forkName: string, fork: RepoHandle, tokenId: string): Promise<void> {
    this.sql.all("INSERT OR IGNORE INTO artroom_ws_revoke (token_id, fork) VALUES (?, ?)", tokenId, forkName);
    try {
      await withRetry(() => fork.revokeToken(tokenId), this.retryOpts());
      this.sql.all("DELETE FROM artroom_ws_revoke WHERE token_id = ?", tokenId);
    } catch {
      // Left for sweep().
    }
  }

  /** Revoke every token whose revocation failed earlier. The Room's alarm calls it too. Returns how many remain. */
  async sweep(): Promise<number> {
    for (const r of this.sql.all("SELECT token_id, fork FROM artroom_ws_revoke")) {
      const id = text(r, "token_id")!;
      try {
        const got = await this.getFork(text(r, "fork")!);
        if (got) await withRetry(() => got.fork.revokeToken(id), this.retryOpts());
        this.sql.all("DELETE FROM artroom_ws_revoke WHERE token_id = ?", id);
      } catch {
        // Try again next time.
      }
    }
    return Number(this.sql.all("SELECT COUNT(*) AS n FROM artroom_ws_revoke")[0]?.["n"] ?? 0);
  }

  private retryOpts() {
    return this.sleep ? { sleep: this.sleep } : {};
  }

  private fail(lane: LaneId, e: unknown): WorkspaceOp {
    const r = this.row(lane);
    if (r && r.state === "pending") this.put({ ...r, state: "failed", error: JSON.stringify(failure(e)) });
    return this.view(lane) ?? { id: `op_ws_${lane}_0`, kind: "workspace", lane, updatedAt: iso(this.now()), state: "failed", error: failure(e) };
  }

  /** Get the fork, creating it from the canonical repo on first use. */
  private async ensureFork(name: string): Promise<{ fork: RepoHandle; remote: string }> {
    const existing = await this.getFork(name);
    if (existing) return existing;
    const canonical = await withRetry(() => this.artifacts.get(this.canonical), this.retryOpts());
    try {
      const made = await withRetry(() => canonical.fork(name, { description: `Artroom lane fork of ${this.canonical}`, defaultBranchOnly: true }), this.retryOpts());
      const fork = await withRetry(() => this.artifacts.get(name), this.retryOpts());
      // The fork comes with its own long-lived token. Nobody receives it; revoke it now.
      await withRetry(() => fork.revokeToken(made.token), this.retryOpts());
      return { fork, remote: made.remote };
    } catch (e) {
      // A fork whose response was lost on an earlier try already exists.
      if (artifactsCode(e) === "ALREADY_EXISTS" || artifactsCode(e) === "FORK_IN_PROGRESS") {
        for (let i = 0; i < 10; i++) {
          const got = await this.getFork(name);
          if (got) return got;
          await (this.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))))(1000);
        }
      }
      throw e;
    }
  }

  private async getFork(name: string): Promise<{ fork: RepoHandle; remote: string } | null> {
    try {
      const fork = await this.artifacts.get(name);
      const info = await fork.info();
      // Positive provenance: exactly a fork of this canonical repo, in this namespace.
      if (info.source !== `artifacts:${this.namespace}/${this.canonical}`) {
        throw new NotOurFork(`A repository named ${name} exists but is not a fork of ${this.namespace}/${this.canonical}. It was not used or changed.`);
      }
      return { fork, remote: info.remote };
    } catch (e) {
      const code = artifactsCode(e);
      if (code === "NOT_FOUND" || code === "FORK_IN_PROGRESS" || code === "CREATE_IN_PROGRESS") return null;
      throw e;
    }
  }

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
   * End the lane's workspace access: on release, expiry or take-over
   * (R-LANE-8, R-WS-3). Forgets the secret first, then revokes every active
   * token on the fork. Returns how many tokens were revoked.
   */
  async revoke(lane: LaneId): Promise<number> {
    const r = this.row(lane);
    if (!r) return 0;
    this.sql.transaction(() => {
      this.sql.all("DELETE FROM artroom_ws_secret WHERE lane = ?", lane);
      // Remembered until revoked, so an Artifacts outage cannot leave it live unnoticed.
      if (r.tokenId) this.sql.all("INSERT OR IGNORE INTO artroom_ws_revoke (token_id, fork) VALUES (?, ?)", r.tokenId, r.fork);
      this.put({ ...r, state: "revoked", tokenId: null, tokenExpiresAt: null });
    });
    let fork: { fork: RepoHandle; remote: string } | null;
    try {
      fork = await this.getFork(r.fork);
    } catch (e) {
      if (e instanceof NotOurFork) return 0; // never touch a repository that is not ours
      throw e;
    }
    if (!fork) return 0;
    const f = fork.fork;
    const { tokens } = await withRetry(() => f.listTokens(), this.retryOpts());
    let n = 0;
    for (const t of tokens) {
      if (t.state !== "active") continue;
      await this.revokeOrRemember(r.fork, f, t.id);
      const left = Number(this.sql.all("SELECT COUNT(*) AS n FROM artroom_ws_revoke WHERE token_id = ?", t.id)[0]?.["n"] ?? 0);
      if (left === 0) n++;
    }
    await this.sweep();
    return n;
  }
}

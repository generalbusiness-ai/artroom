/**
 * Snapshot repositories (R-CARRY-16): one new, empty Artifacts repository per
 * filtered snapshot commit, one read token per job, and durable retirement.
 *
 * - `prepare(commit, write)` returns the repository that holds the snapshot
 *   commit `commit` (the ID the Room recorded, R-CARRY-15 step 3). A ready
 *   repository for the same commit is reused. Otherwise a new one is
 *   created, `write` (the publisher's `writeSnapshot`) puts exactly that
 *   commit's closure into it at `refs/artroom/snapshot`, the commit written
 *   must be `commit`, and every token on the repository is revoked before it
 *   is ready. The repository's name is the commit, so it can never serve
 *   another. A repository whose preparation was interrupted is deleted, never
 *   finished.
 * - `mint(commit, job, deadline)` mints a read token for that repository
 *   only, expiring no later than the job's deadline. Every job has its own.
 * - `end(commit, job)` revokes that job's token. When no job is left, the
 *   repository is retired after `retainMs` (at most 24 hours).
 *
 * Retirement and revocation are durable duties in SQLite. The retirement
 * duty is recorded in the transaction that records the repository, before
 * Artifacts is asked to create it, so no repository can exist without one.
 * It is due 24 hours after creation, moved later by each job's deadline and
 * earlier when the last job ends. Running it revokes every active token and
 * deletes the repository (which also removes its tokens); only Artifacts'
 * answer to the delete settles it. A job's token is owed revocation when the
 * job ends. Every duty is retried with backoff until Artifacts confirms; an
 * outage leaves it owed. The Room's alarm calls `reconcile()` and sets its
 * next alarm from `nextDue()`.
 */

import { type Sql, text } from "../sql.ts";
import { type ArtifactsNamespace, type RepoHandle, artifactsCode, withRetry } from "../artifacts.ts";
import { MIN_TOKEN_TTL_S, TOKEN_MARGIN_S } from "../workspace/workspaces.ts";

/** The longest a snapshot repository is kept after its last job, or after creation if no job ever uses it. */
export const MAX_RETAIN_MS = 24 * 3600_000;

const SHA = /^[0-9a-f]{40}$/;
const TOKEN = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const redact = (s: string) => s.replace(TOKEN, "<token>");

export interface SnapshotReposOptions {
  readonly sql: Sql;
  readonly artifacts: ArtifactsNamespace;
  /** Starts every snapshot repository's name, for example the canonical repo's name. */
  readonly prefix: string;
  /** How long a repository is kept for reuse by the same commit after its last job ends. Default 0; at most 24 hours. */
  readonly retainMs?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** A ready snapshot repository: it holds exactly one snapshot commit's closure. */
export interface SnapshotRepo {
  readonly commit: string;
  readonly name: string;
  readonly remote: string;
}

/** A job's read token for one snapshot repository. `token` is the plaintext; it is never stored. */
export interface SnapshotToken {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: number;
  readonly name: string;
  readonly remote: string;
}

/** Writes the snapshot into `store` with its write token and returns the commit it wrote (the publisher's `writeSnapshot`). */
export type SnapshotWriter = (store: { readonly name: string; readonly remote: string; readonly token: string }) => Promise<string>;

/** A repository's retirement is owed and Artifacts has not confirmed it yet. Retry later. */
export class RetirementOwed extends Error {}

type DutyKind = "delete" | "revoke";

interface Duty {
  readonly id: number;
  readonly name: string;
  readonly kind: DutyKind;
  readonly tokenId: string | null;
  readonly expiresAt: number | null;
  readonly nextAt: number;
}

export class SnapshotRepos {
  private readonly sql: Sql;
  private readonly artifacts: ArtifactsNamespace;
  private readonly prefix: string;
  private readonly retainMs: number;
  private readonly now: () => number;
  private readonly retry: { readonly sleep?: (ms: number) => Promise<void> };
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(o: SnapshotReposOptions) {
    this.sql = o.sql;
    this.artifacts = o.artifacts;
    this.prefix = o.prefix;
    this.retainMs = Math.min(Math.max(o.retainMs ?? 0, 0), MAX_RETAIN_MS);
    this.now = o.now ?? Date.now;
    this.retry = o.sleep ? { sleep: o.sleep } : {};
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_snap (snapshot TEXT PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL, remote TEXT, created_at INTEGER NOT NULL)",
    );
    // Token IDs only: a plaintext token is never stored.
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_snap_token (token_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, name TEXT NOT NULL, job TEXT NOT NULL, " +
        "expires_at INTEGER NOT NULL, ended INTEGER NOT NULL DEFAULT 0)",
    );
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_snap_duty (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL, token_id TEXT, " +
        "expires_at INTEGER, reason TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, " +
        "last_error TEXT, done_at INTEGER, done_reason TEXT)",
    );
  }

  /** The repository name for a snapshot commit: one name per commit. */
  nameOf(commit: string): string {
    if (!SHA.test(commit)) throw new Error("the snapshot commit is not a 40-character SHA-1");
    const name = `${this.prefix}--snap-${commit}`;
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) throw new Error("the snapshot repository name is not valid");
    return name;
  }

  // ---------------------------------------------------------------- storage

  private row(commit: string): { name: string; state: "creating" | "ready" | "retiring"; remote: string | null } | null {
    const r = this.sql.all("SELECT name, state, remote FROM artroom_snap WHERE snapshot = ?", commit)[0];
    if (!r) return null;
    return { name: text(r, "name")!, state: text(r, "state") as "creating" | "ready" | "retiring", remote: text(r, "remote") };
  }

  private open(name: string): Duty[] {
    return this.sql.all("SELECT * FROM artroom_snap_duty WHERE name = ? AND state = 'owed' ORDER BY id", name).map((r) => ({
      id: Number(r["id"]),
      name,
      kind: text(r, "kind") as DutyKind,
      tokenId: text(r, "token_id"),
      expiresAt: r["expires_at"] === null ? null : Number(r["expires_at"]),
      nextAt: Number(r["next_at"]),
    }));
  }

  /** When the repository's retirement is due, or null if none is owed. */
  private retireAt(name: string): number | null {
    return this.open(name).find((d) => d.kind === "delete")?.nextAt ?? null;
  }

  /** Job tokens on `name` whose job has not ended and whose deadline has not passed. */
  private liveTokens(name: string): number {
    return Number(this.sql.all("SELECT COUNT(*) AS n FROM artroom_snap_token WHERE name = ? AND ended = 0 AND expires_at > ?", name, this.now())[0]?.["n"] ?? 0);
  }

  /** Owe the repository's retirement at `at`, or earlier if it is already owed sooner. */
  private oweDelete(name: string, at: number, reason: string): void {
    const d = this.open(name).find((x) => x.kind === "delete");
    if (d) this.sql.all("UPDATE artroom_snap_duty SET next_at = MIN(next_at, ?) WHERE id = ?", at, d.id);
    else this.sql.all("INSERT INTO artroom_snap_duty (name, kind, reason, state, next_at) VALUES (?, 'delete', ?, 'owed', ?)", name, reason, at);
  }

  private oweRevoke(name: string, tokenId: string, expiresAt: number | null, reason: string): void {
    this.sql.all(
      "INSERT INTO artroom_snap_duty (name, kind, token_id, expires_at, reason, state, next_at) VALUES (?, 'revoke', ?, ?, ?, 'owed', ?)",
      name,
      tokenId,
      expiresAt,
      reason,
      this.now(),
    );
  }

  private done(ids: readonly number[], reason: string): void {
    for (const id of ids) this.sql.all("UPDATE artroom_snap_duty SET state = 'done', done_at = ?, done_reason = ? WHERE id = ?", this.now(), reason, id);
  }

  private defer(ids: readonly number[], error: unknown): void {
    for (const id of ids) {
      const attempts = Number(this.sql.all("SELECT attempts FROM artroom_snap_duty WHERE id = ?", id)[0]?.["attempts"] ?? 0) + 1;
      const wait = Math.min(1000 * 2 ** Math.min(attempts, 9), 300_000);
      this.sql.all(
        "UPDATE artroom_snap_duty SET attempts = ?, next_at = ?, last_error = ? WHERE id = ?",
        attempts,
        this.now() + wait,
        redact(String(error)).slice(0, 300),
        id,
      );
    }
  }

  /** Run `fn` with this repository to itself: one live host never interleaves its preparation, tokens and retirement. */
  private exclusive<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(name) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(name, next.catch(() => undefined));
    return next;
  }

  // ---------------------------------------------------------------- prepare

  /** The ready repository for `commit`: reused if it exists, otherwise created and written. */
  prepare(commit: string, write: SnapshotWriter): Promise<SnapshotRepo> {
    const name = this.nameOf(commit);
    return this.exclusive(name, async () => {
      const row = this.row(commit);
      const due = this.retireAt(name);
      if (row?.state === "ready" && row.remote && due !== null && due > this.now()) return { commit, name, remote: row.remote };
      // Interrupted, retiring or due: delete it first. A repository is never finished by a later attempt.
      if (row) await this.retireNow(name, row.state === "ready" ? "due" : row.state);
      this.sql.transaction(() => {
        this.sql.all("INSERT INTO artroom_snap (snapshot, name, state, remote, created_at) VALUES (?, ?, 'creating', NULL, ?)", commit, name, this.now());
        this.oweDelete(name, this.now() + MAX_RETAIN_MS, "created");
      });
      const created = await withRetry(() => this.artifacts.create(name, { description: `Artroom snapshot ${commit}` }), this.retry);
      // From here the repository exists. If anything below fails, the row stays `creating`, and the next
      // `prepare` deletes the repository first; the retirement duty deletes it in any case.
      let wrote: string;
      try {
        wrote = await write({ name, remote: created.remote, token: created.token });
      } finally {
        // The creation token: revoked by plaintext now. The sweep below is what makes the repository ready.
        await this.artifacts
          .get(name)
          .then((r) => r.revokeToken(created.token))
          .catch(() => false);
      }
      if (wrote !== commit) {
        await this.retireNow(name, "wrong-commit").catch(() => undefined);
        throw new Error(`the publisher wrote snapshot ${wrote}, not the recorded ${commit}; nothing is issued`);
      }
      const repo = await withRetry(() => this.artifacts.get(name), this.retry);
      // Ready only once no token is active: nothing can write to it again.
      for (const t of (await withRetry(() => repo.listTokens(), this.retry)).tokens) {
        if (t.state === "active") await withRetry(() => repo.revokeToken(t.id), this.retry);
      }
      this.sql.all("UPDATE artroom_snap SET state = 'ready', remote = ? WHERE snapshot = ? AND state = 'creating'", created.remote, commit);
      return { commit, name, remote: created.remote };
    });
  }

  // ---------------------------------------------------------------- job tokens

  /**
   * A read token for one job, for this snapshot's repository only, expiring
   * no later than `deadline` (ms). A token that Artifacts returns with a
   * later expiry, or another scope, is revoked and refused.
   */
  mint(commit: string, job: string, deadline: number): Promise<SnapshotToken> {
    const name = this.nameOf(commit);
    return this.exclusive(name, async () => {
      const row = this.row(commit);
      const due = this.retireAt(name);
      if (row?.state !== "ready" || !row.remote || due === null || due <= this.now()) {
        throw new Error("the snapshot repository is not ready; prepare it again");
      }
      const ttl = Math.floor((deadline - this.now()) / 1000) - TOKEN_MARGIN_S;
      if (ttl < MIN_TOKEN_TTL_S) throw new Error("the job's deadline is too soon for a token");
      const repo = await withRetry(() => this.artifacts.get(name), this.retry);
      // One attempt: an unanswered mint may still apply, and dies with the repository.
      const t = await repo.createToken("read", ttl);
      const expiresAt = Date.parse(t.expiresAt);
      const recorded = this.sql.transaction(() => {
        if (t.scope !== "read" || !Number.isFinite(expiresAt) || expiresAt > deadline) {
          this.oweRevoke(name, t.id, Number.isFinite(expiresAt) ? expiresAt : null, "outlives-job");
          return false;
        }
        const others = this.liveTokens(name);
        this.sql.all("INSERT INTO artroom_snap_token (token_id, snapshot, name, job, expires_at) VALUES (?, ?, ?, ?, ?)", t.id, commit, name, job, expiresAt);
        // Retired `retainMs` after the last job's deadline at the latest, even if no job reports its end.
        this.sql.all(
          `UPDATE artroom_snap_duty SET next_at = ${others === 0 ? "?" : "MAX(next_at, ?)"} WHERE name = ? AND kind = 'delete' AND state = 'owed'`,
          deadline + this.retainMs,
          name,
        );
        return true;
      });
      if (!recorded) {
        await this.settle(name);
        throw new Error("Artifacts minted a token that would outlive the job; it is revoked");
      }
      return { id: t.id, token: t.plaintext, expiresAt, name, remote: row.remote };
    });
  }

  /** The job has ended: its token is owed revocation, and with no job left the repository is retired after `retainMs`. Returns duties still owed on it. */
  end(commit: string, job: string): Promise<number> {
    const name = this.nameOf(commit);
    return this.exclusive(name, async () => {
      this.sql.transaction(() => {
        for (const r of this.sql.all("SELECT token_id, expires_at FROM artroom_snap_token WHERE snapshot = ? AND job = ? AND ended = 0", commit, job)) {
          this.oweRevoke(name, text(r, "token_id")!, Number(r["expires_at"]), "job-ended");
        }
        this.sql.all("UPDATE artroom_snap_token SET ended = 1 WHERE snapshot = ? AND job = ?", commit, job);
        if (this.liveTokens(name) === 0) this.sql.all("UPDATE artroom_snap_duty SET next_at = MIN(next_at, ?) WHERE name = ? AND kind = 'delete' AND state = 'owed'", this.now() + this.retainMs, name);
      });
      return this.settle(name);
    });
  }

  // ---------------------------------------------------------------- duties

  /** Retire `name` now; throws `RetirementOwed` if Artifacts has not confirmed. The caller holds the lock. */
  private async retireNow(name: string, reason: string): Promise<void> {
    this.oweDelete(name, this.now(), reason);
    await this.settle(name);
    if (this.retireAt(name) !== null) throw new RetirementOwed(`the snapshot repository ${name} is owed deletion, and Artifacts has not confirmed it yet`);
  }

  /** Run the due duties of one repository. The caller holds its lock. Returns how many are still owed. */
  private async settle(name: string): Promise<number> {
    const due = this.open(name).filter((d) => d.nextAt <= this.now());
    if (due.some((d) => d.kind === "delete")) await this.retire(name);
    else {
      for (const d of due) await this.revoke(d);
    }
    return this.open(name).length;
  }

  /** Revoke every active token, then delete the repository. Only the delete's answer settles it. */
  private async retire(name: string): Promise<void> {
    this.sql.all("UPDATE artroom_snap SET state = 'retiring' WHERE name = ?", name);
    let repo: RepoHandle | null = null;
    try {
      repo = await withRetry(() => this.artifacts.get(name), this.retry);
    } catch (e) {
      if (artifactsCode(e) !== "NOT_FOUND") {
        this.defer(this.open(name).map((d) => d.id), e);
        return;
      }
    }
    if (repo) {
      try {
        for (const t of (await withRetry(() => repo.listTokens(), this.retry)).tokens) {
          if (t.state === "active") await withRetry(() => repo.revokeToken(t.id), this.retry);
        }
      } catch {
        // Deleting the repository removes its tokens too; that answer is the one that counts.
      }
    }
    try {
      await withRetry(() => this.artifacts.delete(name), this.retry);
    } catch (e) {
      this.defer(this.open(name).map((d) => d.id), e);
      return;
    }
    this.sql.transaction(() => {
      this.done(this.open(name).map((d) => d.id), "repository-deleted");
      this.sql.all("DELETE FROM artroom_snap WHERE name = ?", name);
      this.sql.all("DELETE FROM artroom_snap_token WHERE name = ?", name);
    });
  }

  private async revoke(d: Duty): Promise<void> {
    try {
      const repo = await withRetry(() => this.artifacts.get(d.name), this.retry);
      await withRetry(() => repo.revokeToken(d.tokenId!), this.retry);
      this.done([d.id], "revoked");
    } catch (e) {
      if (artifactsCode(e) === "NOT_FOUND") this.done([d.id], "no-repository");
      else if (d.expiresAt !== null && d.expiresAt <= this.now()) this.done([d.id], "expired");
      else this.defer([d.id], e);
    }
  }

  /** Run every due duty, one repository at a time. Returns how many duties are still owed. */
  async reconcile(): Promise<number> {
    const names = this.sql
      .all("SELECT DISTINCT name FROM artroom_snap_duty WHERE state = 'owed' AND next_at <= ?", this.now())
      .map((r) => text(r, "name")!);
    for (const n of names) await this.exclusive(n, () => this.settle(n)).catch(() => undefined);
    return this.pending();
  }

  /** Same as `reconcile`, ignoring backoff (not the retirement schedule). Returns how many duties are still owed. */
  async sweep(): Promise<number> {
    this.sql.all("UPDATE artroom_snap_duty SET next_at = ? WHERE state = 'owed' AND attempts > 0", this.now());
    return this.reconcile();
  }

  /** When the next duty is due, or null if none is owed. */
  nextDue(): number | null {
    const r = this.sql.all("SELECT MIN(next_at) AS t FROM artroom_snap_duty WHERE state = 'owed'")[0];
    return r?.["t"] == null ? null : Number(r["t"]);
  }

  /** Duties still owed. */
  pending(): number {
    return Number(this.sql.all("SELECT COUNT(*) AS n FROM artroom_snap_duty WHERE state = 'owed'")[0]?.["n"] ?? 0);
  }

  /** Every duty, for admins and tests. */
  duties(): { name: string; kind: DutyKind; state: string; reason: string; attempts: number; doneReason: string | null }[] {
    return this.sql.all("SELECT name, kind, state, reason, attempts, done_reason FROM artroom_snap_duty ORDER BY id").map((r) => ({
      name: text(r, "name")!,
      kind: text(r, "kind") as DutyKind,
      state: text(r, "state")!,
      reason: text(r, "reason")!,
      attempts: Number(r["attempts"]),
      doneReason: text(r, "done_reason"),
    }));
  }
}

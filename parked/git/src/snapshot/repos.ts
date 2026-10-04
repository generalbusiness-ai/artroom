/**
 * Snapshot repositories (R-CARRY-16): one new, empty Artifacts repository per
 * filtered snapshot commit, one read token per job, and durable retirement.
 *
 * - `prepare(commit, write)` returns the repository that holds the snapshot
 *   commit `commit` (the ID the Room recorded, R-CARRY-15 step 3). A ready
 *   repository for the same commit is reused. Otherwise a new one is created,
 *   `write` (the publisher's `writeSnapshot`) puts exactly that commit's
 *   closure into it at `refs/artroom/snapshot`, the commit written must be
 *   `commit`, and every token on the repository is revoked before it is
 *   ready, as a complete inventory shows (`completeInventory`; an incomplete
 *   one issues nothing). A repository whose preparation did not finish is deleted, never
 *   finished or reused.
 * - `mint(commit, job, deadline)` mints a read token for that repository
 *   only, expiring no later than the job's deadline. Every job has its own.
 * - `end(commit, job)` revokes that job's token. When no job is left, the
 *   repository is retired after `retainMs` (default 0, at most 24 hours).
 *
 * The cleanup ledger follows the workspace one (`Workspaces`): each duty is
 * a row in SQLite with an explicit state.
 * - `in-flight`: a create was sent and its outcome is not known. It is
 *   written before the call. Every attempt is its own step, with its own
 *   repository name (`<prefix>--snap-<commit>-<step>`), so a late attempt
 *   can never create, or settle the cleanup of, another attempt's
 *   repository. A step is settled only by a definite answer (success, or an
 *   error that says nothing changed) or by seeing its repository exist, after
 *   which its deletion is owed. Absence and elapsed time never settle it: it
 *   is checked again on the workspace backoff (after 1, 1, 2, 4 and 8
 *   minutes, then every 16) for as long as it is unresolved.
 * - `owed`: deleting a repository whose creation is known (revoking every
 *   active token first; deletion removes them too), or revoking one job's
 *   token. Retried with backoff until Artifacts confirms.
 * - `done`: settled, with the reason.
 *
 * Every duty is written before the remote effect it covers, and `wake` (the
 * Room's alarm) is set from `nextDue()` before each create, and after every
 * change that can bring a duty forward. Every alarm run sets the next one,
 * so a wake-up at or before the earliest duty always exists, and a host that
 * stops at any await leaves its debt scheduled. A mint needs no new duty:
 * the repository's deletion, owed and scheduled since its creation, removes
 * a token whose answer is lost. The alarm calls `reconcile()`. A repository
 * is deleted when its preparation stops (15 minutes at most after
 * creation), or when its last job ends or its last deadline passes.
 */

import { type Sql, text } from "../sql.ts";
import { type ArtifactsNamespace, type RepoHandle, artifactsCode, completeInventory, refusedUnchanged, withRetry } from "../artifacts.ts";
import { MIN_TOKEN_TTL_S, RECHECK_MS, TOKEN_MARGIN_S } from "../workspace/workspaces.ts";
import { errorNote } from "../mints.ts";

/** The longest a snapshot repository is kept for reuse after its last job. */
export const MAX_RETAIN_MS = 24 * 3600_000;

/** How long a new repository may wait between its creation and its first job. */
export const PREPARE_WINDOW_MS = 15 * 60_000;

const SHA = /^[0-9a-f]{40}$/;

export interface SnapshotReposOptions {
  readonly sql: Sql;
  readonly artifacts: ArtifactsNamespace;
  /** Starts every snapshot repository's name, for example the canonical repo's name. */
  readonly prefix: string;
  /** How long a repository is kept for reuse by the same commit after its last job ends. Default 0; at most 24 hours. */
  readonly retainMs?: number;
  /**
   * Persist a wake-up at `at` (ms), for example the Room's alarm, which then
   * calls `reconcile()`. Called with `nextDue()` before each create, after
   * every change that can bring a duty forward, and after each reconcile.
   */
  readonly wake?: (at: number) => Promise<void>;
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

type DutyKind = "create" | "delete" | "revoke";
type DutyState = "in-flight" | "owed" | "done";

interface Duty {
  readonly id: number;
  readonly snapshot: string;
  readonly name: string;
  readonly kind: DutyKind;
  readonly state: DutyState;
  readonly reason: string;
  readonly tokenId: string | null;
  readonly expiresAt: number | null;
  readonly nextAt: number;
}

export class SnapshotRepos {
  private readonly sql: Sql;
  private readonly artifacts: ArtifactsNamespace;
  private readonly prefix: string;
  private readonly retainMs: number;
  private readonly wakeAt: ((at: number) => Promise<void>) | undefined;
  private readonly now: () => number;
  private readonly retry: { readonly sleep?: (ms: number) => Promise<void> };
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(o: SnapshotReposOptions) {
    this.sql = o.sql;
    this.artifacts = o.artifacts;
    this.prefix = o.prefix;
    this.retainMs = Math.min(Math.max(o.retainMs ?? 0, 0), MAX_RETAIN_MS);
    this.wakeAt = o.wake;
    this.now = o.now ?? (() => Date.now());
    this.retry = o.sleep ? { sleep: o.sleep } : {};
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(this.prefix)) throw new Error("the snapshot repository prefix is not valid");
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_snap (snapshot TEXT PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL, remote TEXT, created_at INTEGER NOT NULL)",
    );
    // Token IDs only: a plaintext token is never stored.
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_snap_token (token_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, name TEXT NOT NULL, job TEXT NOT NULL, " +
        "expires_at INTEGER NOT NULL, ended INTEGER NOT NULL DEFAULT 0)",
    );
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_snap_duty (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, " +
        "token_id TEXT, expires_at INTEGER, reason TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, " +
        "last_error TEXT, done_at INTEGER, done_reason TEXT)",
    );
  }

  // ---------------------------------------------------------------- storage

  private row(commit: string): { name: string; state: "creating" | "ready" | "retiring"; remote: string | null } | null {
    const r = this.sql.all("SELECT name, state, remote FROM artroom_snap WHERE snapshot = ?", commit)[0];
    if (!r) return null;
    return { name: text(r, "name")!, state: text(r, "state") as "creating" | "ready" | "retiring", remote: text(r, "remote") };
  }

  private duty(r: Record<string, unknown>): Duty {
    return {
      id: Number(r["id"]),
      snapshot: String(r["snapshot"]),
      name: String(r["name"]),
      kind: r["kind"] as DutyKind,
      state: r["state"] as DutyState,
      reason: String(r["reason"]),
      tokenId: (r["token_id"] as string | null) ?? null,
      expiresAt: r["expires_at"] === null ? null : Number(r["expires_at"]),
      nextAt: Number(r["next_at"]),
    };
  }

  /** Open duties of one snapshot commit's repositories. */
  private open(commit: string): Duty[] {
    return this.sql.all("SELECT * FROM artroom_snap_duty WHERE snapshot = ? AND state != 'done' ORDER BY id", commit).map((r) => this.duty(r));
  }

  /** When the repository's deletion is due, or null if none is owed. */
  private retireAt(name: string): number | null {
    const r = this.sql.all("SELECT next_at FROM artroom_snap_duty WHERE name = ? AND kind = 'delete' AND state = 'owed'", name)[0];
    return r ? Number(r["next_at"]) : null;
  }

  /** Owe the repository's deletion at `at`, or earlier if it is already owed sooner. Only for a repository whose creation is known. */
  private oweDelete(commit: string, name: string, at: number, reason: string): void {
    if (this.retireAt(name) !== null) this.sql.all("UPDATE artroom_snap_duty SET next_at = MIN(next_at, ?) WHERE name = ? AND kind = 'delete' AND state = 'owed'", at, name);
    else this.sql.all("INSERT INTO artroom_snap_duty (snapshot, name, kind, reason, state, next_at) VALUES (?, ?, 'delete', ?, 'owed', ?)", commit, name, reason, at);
  }

  private oweRevoke(commit: string, name: string, tokenId: string, expiresAt: number | null, reason: string): void {
    this.sql.all(
      "INSERT INTO artroom_snap_duty (snapshot, name, kind, token_id, expires_at, reason, state, next_at) VALUES (?, ?, 'revoke', ?, ?, ?, 'owed', ?)",
      commit,
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

  /** An owed duty failed: try again with backoff (up to 5 minutes). */
  private defer(ids: readonly number[], error: unknown): void {
    for (const id of ids) {
      const attempts = Number(this.sql.all("SELECT attempts FROM artroom_snap_duty WHERE id = ?", id)[0]?.["attempts"] ?? 0) + 1;
      const wait = Math.min(1000 * 2 ** Math.min(attempts, 9), 300_000);
      this.sql.all("UPDATE artroom_snap_duty SET attempts = ?, next_at = ?, last_error = ? WHERE id = ?", attempts, this.now() + wait, errorNote("snapshot cleanup failed", error), id);
    }
  }

  /** A create step is still unresolved: check it again on the workspace backoff (`RECHECK_MS`, as in `Workspaces`). */
  private recheck(id: number, error: unknown): void {
    const attempts = Number(this.sql.all("SELECT attempts FROM artroom_snap_duty WHERE id = ?", id)[0]?.["attempts"] ?? 0) + 1;
    const wait = Math.min(RECHECK_MS.first * 2 ** Math.min(attempts - 1, 4), RECHECK_MS.max);
    this.sql.all("UPDATE artroom_snap_duty SET attempts = ?, next_at = ?, last_error = ? WHERE id = ?", attempts, this.now() + wait, errorNote("snapshot create not yet seen", error), id);
  }

  /** Persist the next wake-up before a remote effect. */
  private async wake(): Promise<void> {
    const at = this.nextDue();
    if (at !== null && this.wakeAt) await this.wakeAt(at);
  }

  /** Run `fn` with one snapshot commit's repositories to itself, on this host. */
  private exclusive<T>(commit: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(commit) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(commit, next.catch(() => undefined));
    return next;
  }

  // ---------------------------------------------------------------- prepare

  /** The ready repository for `commit`: reused if it exists, otherwise created and written. */
  prepare(commit: string, write: SnapshotWriter): Promise<SnapshotRepo> {
    if (!SHA.test(commit)) throw new Error("the snapshot commit is not a 40-character SHA-1");
    return this.exclusive(commit, async () => {
      const row = this.row(commit);
      if (row?.state === "ready" && row.remote) {
        const due = this.retireAt(row.name);
        if (due !== null && due > this.now()) return { commit, name: row.name, remote: row.remote };
      }
      // A new attempt: its create step, its own name and its row, written before Artifacts is asked.
      const { step, name } = this.sql.transaction(() => {
        if (row) {
          // Unfinished, retiring or due: never reused. If its create is known, its deletion is owed now;
          // if its create is still in flight, that step deletes whatever it creates.
          if (!this.unresolved(row.name)) this.oweDelete(commit, row.name, this.now(), "superseded");
          this.sql.all("DELETE FROM artroom_snap WHERE snapshot = ?", commit);
        }
        this.sql.all(
          "INSERT INTO artroom_snap_duty (snapshot, name, kind, reason, state, next_at) VALUES (?, '', 'create', 'create', 'in-flight', ?)",
          commit,
          this.now() + RECHECK_MS.first,
        );
        const step = Number(this.sql.all("SELECT last_insert_rowid() AS id")[0]?.["id"]);
        const name = `${this.prefix}--snap-${commit}-${step}`;
        this.sql.all("UPDATE artroom_snap_duty SET name = ? WHERE id = ?", name, step);
        this.sql.all("INSERT INTO artroom_snap (snapshot, name, state, remote, created_at) VALUES (?, ?, 'creating', NULL, ?)", commit, name, this.now());
        return { step, name };
      });
      try {
        await this.wake();
      } catch (e) {
        // Not stored: the create is never sent, so this step can never apply (follow-up c9cd4cd8).
        this.sql.transaction(() => {
          this.done([step], "not-sent");
          this.sql.all("DELETE FROM artroom_snap WHERE name = ?", name);
        });
        throw e;
      }
      let created: Awaited<ReturnType<ArtifactsNamespace["create"]>>;
      try {
        // One attempt: a retry is a new step, with a new name.
        created = await this.artifacts.create(name, { description: `Artroom snapshot ${commit}` });
      } catch (e) {
        this.sql.transaction(() => {
          if (refusedUnchanged(e)) {
            this.done([step], "refused");
            this.sql.all("DELETE FROM artroom_snap WHERE name = ?", name);
          } else this.sql.all("UPDATE artroom_snap_duty SET last_error = ? WHERE id = ?", errorNote("snapshot create failed", e), step);
        });
        throw e;
      }
      this.sql.transaction(() => {
        this.done([step], "created");
        this.oweDelete(commit, name, this.now() + PREPARE_WINDOW_MS, "created");
      });
      // No new wake-up is needed: the one set before the create is earlier, and each alarm sets the next.
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
        this.oweDelete(commit, name, this.now(), "wrong-commit");
        await this.settle(commit);
        throw new Error(`the publisher wrote snapshot ${wrote}, not the recorded ${commit}; nothing is issued`);
      }
      const repo = await withRetry(() => this.artifacts.get(name), this.retry);
      // Ready only once no token is active: nothing can write to it again. Only a complete inventory shows that (plan 001);
      // an incomplete or malformed one throws, nothing is issued, and the repository's deletion stays owed.
      const inventory = completeInventory(await withRetry(() => repo.listTokens(), this.retry), `the token inventory of ${name}`);
      for (const t of inventory) {
        if (t.state === "active") await withRetry(() => repo.revokeToken(t.id), this.retry);
      }
      // Fenced by name: only this attempt's own row becomes ready.
      this.sql.all("UPDATE artroom_snap SET state = 'ready', remote = ? WHERE snapshot = ? AND name = ? AND state = 'creating'", created.remote, commit, name);
      const now = this.row(commit);
      if (now?.name !== name || now.state !== "ready") throw new Error(`the preparation of ${name} was superseded; nothing is issued`);
      return { commit, name, remote: created.remote };
    });
  }

  /** True if a create of `name` was sent and its outcome is not known. */
  private unresolved(name: string): boolean {
    return this.sql.all("SELECT 1 FROM artroom_snap_duty WHERE name = ? AND kind = 'create' AND state = 'in-flight'", name).length > 0;
  }

  // ---------------------------------------------------------------- job tokens

  /**
   * A read token for one job, for this snapshot's repository only, expiring
   * no later than `deadline` (ms). A token that Artifacts returns with a
   * later expiry, or another scope, is revoked and refused.
   */
  mint(commit: string, job: string, deadline: number): Promise<SnapshotToken> {
    return this.exclusive(commit, async () => {
      const row = this.row(commit);
      const due = row ? this.retireAt(row.name) : null;
      if (!row || row.state !== "ready" || !row.remote || due === null || due <= this.now()) {
        throw new Error("the snapshot repository is not ready; prepare it again");
      }
      const name = row.name;
      const remote = row.remote;
      const ttl = Math.floor((deadline - this.now()) / 1000) - TOKEN_MARGIN_S;
      if (ttl < MIN_TOKEN_TTL_S) throw new Error("the job's deadline is too soon for a token");
      const repo = await withRetry(() => this.artifacts.get(name), this.retry);
      // One attempt. The repository's deletion is already owed and scheduled (by `prepare`), and removes any
      // token whose answer is lost; that token also expires by the deadline.
      const t = await repo.createToken("read", ttl);
      const expiresAt = Date.parse(t.expiresAt);
      const recorded = this.sql.transaction(() => {
        if (t.scope !== "read" || !Number.isFinite(expiresAt) || expiresAt > deadline) {
          this.oweRevoke(commit, name, t.id, Number.isFinite(expiresAt) ? expiresAt : null, "outlives-job");
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
      // The deletion may now be due sooner (a short deadline).
      await this.wake();
      if (!recorded) {
        await this.settle(commit);
        throw new Error("Artifacts minted a token that would outlive the job; it is revoked");
      }
      return { id: t.id, token: t.plaintext, expiresAt, name, remote };
    });
  }

  /** The job has ended: its token is owed revocation, and with no job left the repository is retired after `retainMs`. Returns duties still owed. */
  end(commit: string, job: string): Promise<number> {
    return this.exclusive(commit, async () => {
      this.sql.transaction(() => {
        const names = new Set<string>();
        for (const r of this.sql.all("SELECT token_id, name, expires_at FROM artroom_snap_token WHERE snapshot = ? AND job = ? AND ended = 0", commit, job)) {
          this.oweRevoke(commit, text(r, "name")!, text(r, "token_id")!, Number(r["expires_at"]), "job-ended");
          names.add(text(r, "name")!);
        }
        this.sql.all("UPDATE artroom_snap_token SET ended = 1 WHERE snapshot = ? AND job = ?", commit, job);
        for (const name of names) {
          if (this.liveTokens(name) === 0) {
            this.sql.all("UPDATE artroom_snap_duty SET next_at = MIN(next_at, ?) WHERE name = ? AND kind = 'delete' AND state = 'owed'", this.now() + this.retainMs, name);
          }
        }
      });
      await this.wake();
      return this.settle(commit);
    });
  }

  /** Job tokens on `name` whose job has not ended and whose deadline has not passed. */
  private liveTokens(name: string): number {
    return Number(this.sql.all("SELECT COUNT(*) AS n FROM artroom_snap_token WHERE name = ? AND ended = 0 AND expires_at > ?", name, this.now())[0]?.["n"] ?? 0);
  }

  // ---------------------------------------------------------------- duties

  /** Run the due duties of one snapshot commit's repositories. The caller holds its lock. Returns how many are still open. */
  private async settle(commit: string): Promise<number> {
    for (const d of this.open(commit).filter((x) => x.kind === "create" && x.nextAt <= this.now())) await this.checkCreate(d);
    const due = this.open(commit).filter((d) => d.nextAt <= this.now());
    const retiring = new Set(due.filter((d) => d.kind === "delete").map((d) => d.name));
    for (const name of retiring) await this.retire(name);
    for (const d of due.filter((x) => x.kind === "revoke" && !retiring.has(x.name))) await this.revoke(d);
    return this.open(commit).length;
  }

  /**
   * An unresolved create: if its repository exists, the create applied, and
   * the repository is deleted now. If not (absent, still being created, or
   * no answer), it is checked again later. Absence never settles it.
   */
  private async checkCreate(d: Duty): Promise<void> {
    try {
      await this.artifacts.get(d.name);
    } catch (e) {
      this.recheck(d.id, e);
      return;
    }
    this.sql.transaction(() => {
      this.done([d.id], "observed");
      this.oweDelete(d.snapshot, d.name, this.now(), "orphan");
    });
  }

  /** Revoke every active token, then delete the repository. Only the delete's answer settles it. */
  private async retire(name: string): Promise<void> {
    const owed = () => this.sql.all("SELECT id FROM artroom_snap_duty WHERE name = ? AND kind != 'create' AND state = 'owed'", name).map((r) => Number(r["id"]));
    this.sql.all("UPDATE artroom_snap SET state = 'retiring' WHERE name = ?", name);
    let repo: RepoHandle | null = null;
    try {
      repo = await withRetry(() => this.artifacts.get(name), this.retry);
    } catch (e) {
      // NOT_FOUND is final here: this repository's one create is known to have applied.
      if (artifactsCode(e) !== "NOT_FOUND") {
        this.defer(owed(), e);
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
      this.defer(owed(), e);
      return;
    }
    this.sql.transaction(() => {
      this.done(owed(), "repository-deleted");
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

  /** Run every due duty, one snapshot commit at a time, then set the next wake-up. Returns how many duties are still open. */
  async reconcile(): Promise<number> {
    const commits = this.sql
      .all("SELECT DISTINCT snapshot FROM artroom_snap_duty WHERE state != 'done' AND next_at <= ?", this.now())
      .map((r) => text(r, "snapshot")!);
    for (const c of commits) await this.exclusive(c, () => this.settle(c)).catch(() => undefined);
    await this.wake();
    return this.pending();
  }

  /** Same as `reconcile`, ignoring backoff (not the retirement schedule). Returns how many duties are still open. */
  async sweep(): Promise<number> {
    this.sql.all("UPDATE artroom_snap_duty SET next_at = ? WHERE state != 'done' AND (attempts > 0 OR kind = 'create')", this.now());
    return this.reconcile();
  }

  /** When the next duty is due, or null if none is open. */
  nextDue(): number | null {
    const r = this.sql.all("SELECT MIN(next_at) AS t FROM artroom_snap_duty WHERE state != 'done'")[0];
    return r?.["t"] == null ? null : Number(r["t"]);
  }

  /** Duties still open: cleanup owed, and creates whose outcome is not known. */
  pending(): number {
    return Number(this.sql.all("SELECT COUNT(*) AS n FROM artroom_snap_duty WHERE state != 'done'")[0]?.["n"] ?? 0);
  }

  /** Every duty, for admins and tests. */
  duties(): { name: string; kind: DutyKind; state: DutyState; reason: string; attempts: number; doneReason: string | null }[] {
    return this.sql.all("SELECT name, kind, state, reason, attempts, done_reason FROM artroom_snap_duty ORDER BY id").map((r) => ({
      name: text(r, "name")!,
      kind: text(r, "kind") as DutyKind,
      state: text(r, "state") as DutyState,
      reason: text(r, "reason")!,
      attempts: Number(r["attempts"]),
      doneReason: text(r, "done_reason"),
    }));
  }
}

/**
 * The lane forks' read-token ledger (request 02836f9a). Pinning a proposed
 * head copies its objects from the lane's fork with a 600-second read token
 * on that fork (R-PROP-1). This ledger owns each such token, from before its
 * create request is sent until Artifacts answers its revocation. It belongs
 * to the fork's owner, `Workspaces`, on the same SQLite, not to the
 * canonical mint ledger (`mints.ts`), whose records are canonical mints only
 * (R-MINT-1).
 *
 * It applies protocol section 32 (R-MINT-2 to R-MINT-7) by analogy. Record
 * states, as in the canonical ledger:
 * - `sent`: the request is out and no answer is recorded;
 * - `held`: known by ID and text, and given to a caller on this live host;
 * - `owed`: known by ID; its revocation is due at `due`;
 * - `unknown`: the create may or may not have applied. Only its own
 *   request's later answer settles it. Time, the token's lifetime, an
 *   inventory and the end of the fork's lease never do.
 * A record is deleted when it ends. Every change is a conditional update of
 * its own row ID in its expected state. Row IDs are never reused.
 *
 * Where it differs from the canonical ledger:
 * - Each record names its fork, and every request (create, revocation,
 *   listing) goes to that fork, looked up with its provenance checked
 *   (`fork`), so a repository at the fork's name that is not this room's
 *   fork is never sent anything.
 * - One kind of token: read, with a fixed lifetime. No `notAfter`, so the
 *   lifetime is recorded with the record, before the wake-up.
 * - No handoff: a token is always released by its caller (`withToken`).
 * - Unknown creates are watched per fork: one watch row per fork holds that
 *   fork's count of unknown records and its observation. Each alarm
 *   observes at most one fork, the one due earliest.
 * - The fork's owner may still sweep the fork (R-WS-3, plans 001 and 002:
 *   revoke every active token no lease records). The sweep asks this ledger
 *   about each token immediately before revoking it: it keeps every token a
 *   record holds for a caller (`holds`), and while a create on that fork is
 *   still `sent` or `unknown` (`unsettled`) it revokes only tokens whose IDs
 *   a record names. So neither the sweep nor this ledger revokes a token
 *   that one of its creates may own, and a sweep never cuts a pin short.
 *
 * Construct one ledger per host start: the constructor takes over what a
 * stopped host left. `sent` records become `unknown`, and `held` records
 * become `owed`, due at once.
 *
 * Every read uses an index; no step reads, writes or waits in proportion to
 * the number of records kept.
 */

import { type Sql, type SqlRow, text } from "../sql.ts";
import { type RepoHandle, completeInventory, refusedUnchanged, retriable } from "../artifacts.ts";
import {
  MINT_CLOCK_ALLOWANCE_MS,
  MINT_ID_WRITE_ATTEMPTS,
  MINT_LISTING_MAX,
  MINT_RETRY,
  MINT_REVOKE_BACKOFF,
  MINT_REVOKE_BATCH,
  MINT_WAIT_MS,
  OBSERVE_WAIT,
  OVERDUE_STEP_MS,
  TAKEOVER_AHEAD_MS,
  TAKEOVER_MOVE_MS,
  errorNote,
  within,
} from "../mints.ts";

export type ForkTokenState = "sent" | "held" | "owed" | "unknown";

/** The fork calls the ledger makes. */
export type ForkRepo = Pick<RepoHandle, "createToken" | "revokeToken" | "listTokens">;

export interface ForkTokensOptions {
  readonly sql: Sql;
  /** The lane fork by name, with its provenance checked. Rejects unless it is this canonical repository's fork. */
  readonly fork: (name: string) => Promise<ForkRepo>;
  /** The room clock, in milliseconds. */
  readonly now: () => number;
  /** Persist a wake-up at or before `at` (room clock), keeping an earlier one; resolve only once it is stored. */
  readonly wake: (at: number) => Promise<void>;
  /** Does the fork's owner hold this token ID on this fork (a lease token, or a revocation it owes)? Point lookups only. */
  readonly known: (fork: string, tokenId: string) => boolean;
  /** The bounded wait for a lookup, a create, a revocation or a listing. Default `MINT_WAIT_MS`. */
  readonly waitMs?: number;
  /** The wait between retries of a transient create error. Tests only. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** A usable fork read token, given only to the caller still waiting for it. */
export interface ForkToken {
  readonly id: string;
  readonly plaintext: string;
  /** Artifacts' reported expiry (ms). Always readable. */
  readonly expiresAt: number;
}

/** One record, for admins: never a token's text. */
export interface ForkTokenDuty {
  readonly id: number;
  readonly fork: string;
  readonly purpose: string;
  readonly state: ForkTokenState;
  readonly ttlSeconds: number;
  readonly sentAt: number;
  readonly tokenId: string | null;
  readonly expiresAt: number | null;
  readonly dueAt: number | null;
  readonly lastError: string | null;
}

/** One fork's watch: its unknown records and their shared observation. */
export interface ForkWatch {
  readonly fork: string;
  readonly unknown: number;
  readonly at: number | null;
  readonly result: string | null;
  readonly unaccounted: number | null;
  readonly nextAt: number | null;
}

export interface ForkTokenDuties {
  readonly records: readonly ForkTokenDuty[];
  /** Pass as `after` for the next page; null when this page is the last. */
  readonly next: number | null;
  readonly owed: number;
  readonly unknown: number;
  readonly takeoverAt: number | null;
}

/** Most records one `duties` page returns. */
const PAGE_MAX = 1_000;
const TIMEOUT = Symbol("timeout");

type Outcome =
  | { readonly kind: "token"; readonly id: string; readonly expiresAt: number | null; readonly usable: boolean; readonly plaintext: string; readonly why: string }
  | { readonly kind: "refused"; readonly why: string }
  | { readonly kind: "unknown"; readonly why: string };

const num = (r: SqlRow | undefined, c: string): number | null => {
  const v = r?.[c];
  return typeof v === "number" ? v : null;
};

export class ForkTokens {
  private readonly sql: Sql;
  private readonly fork: (name: string) => Promise<ForkRepo>;
  private readonly now: () => number;
  private readonly wake: (at: number) => Promise<void>;
  private readonly known: (fork: string, tokenId: string) => boolean;
  private readonly waitMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** The revocation pass in progress, if any. Never awaited by `reconcile`. */
  private pass: Promise<void> | null = null;
  /** While a pass runs: when its current attempt times out. Owed records are not eligible before then. */
  private passUntil = 0;
  private observing = false;
  private observeUntil = 0;
  /** Late create answers this instance is still waiting for. */
  private readonly late = new Set<Promise<unknown>>();

  constructor(o: ForkTokensOptions) {
    this.sql = o.sql;
    this.fork = o.fork;
    this.now = o.now;
    this.wake = o.wake;
    this.known = o.known;
    this.waitMs = o.waitMs ?? MINT_WAIT_MS;
    this.sleep = o.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_fork_mint (id INTEGER PRIMARY KEY AUTOINCREMENT, fork TEXT NOT NULL, purpose TEXT NOT NULL, ttl INTEGER NOT NULL, " +
        "sent_at INTEGER NOT NULL, state TEXT NOT NULL, token TEXT, expires_at INTEGER, due INTEGER, backoff INTEGER, last_error TEXT)",
    );
    this.sql.all("CREATE INDEX IF NOT EXISTS artroom_fork_mint_state ON artroom_fork_mint (state, due, id)");
    this.sql.all("CREATE INDEX IF NOT EXISTS artroom_fork_mint_token ON artroom_fork_mint (token)");
    // The fork's sweep asks whether a create on the fork is still open: by fork and state.
    this.sql.all("CREATE INDEX IF NOT EXISTS artroom_fork_mint_open ON artroom_fork_mint (fork, state)");
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_fork_mint_watch (fork TEXT PRIMARY KEY, unknown INTEGER NOT NULL, observed_at INTEGER, observation TEXT, " +
        "unaccounted INTEGER, observe_due INTEGER, observe_wait INTEGER NOT NULL)",
    );
    this.sql.all("CREATE INDEX IF NOT EXISTS artroom_fork_mint_watch_due ON artroom_fork_mint_watch (observe_due, fork)");
    this.sql.all("CREATE TABLE IF NOT EXISTS artroom_fork_mint_summary (k INTEGER PRIMARY KEY CHECK (k = 1), owed INTEGER NOT NULL, unknown INTEGER NOT NULL, takeover INTEGER)");
    this.sql.all("INSERT INTO artroom_fork_mint_summary (k, owed, unknown) VALUES (1, 0, 0) ON CONFLICT (k) DO NOTHING");
    this.takeOver();
  }

  // ---------------------------------------------------------------- storage

  private summary(): { owed: number; unknown: number; takeover: number | null } {
    const r = this.sql.all("SELECT owed, unknown, takeover FROM artroom_fork_mint_summary WHERE k = 1")[0];
    return { owed: num(r, "owed") ?? 0, unknown: num(r, "unknown") ?? 0, takeover: num(r, "takeover") };
  }

  /**
   * Change the counts, in the caller's transaction: the summary's, and the
   * fork's watch row when its unknown count changes. New unknown records
   * bring the fork's observation forward, but never sooner than 1 min after
   * its last one; a fork with none left is not observed.
   */
  private count(fork: string, owed: number, unknown: number): void {
    if (owed === 0 && unknown === 0) return;
    const s = this.summary();
    this.sql.all("UPDATE artroom_fork_mint_summary SET owed = ?, unknown = ? WHERE k = 1", s.owed + owed, s.unknown + unknown);
    if (unknown === 0) return;
    const w = this.sql.all("SELECT unknown, observed_at, observe_due FROM artroom_fork_mint_watch WHERE fork = ?", fork)[0];
    const n = (num(w, "unknown") ?? 0) + unknown;
    let due = num(w, "observe_due");
    if (n <= 0) due = null;
    else if (unknown > 0) {
      const now = this.now();
      const observed = num(w, "observed_at");
      const floor = observed === null ? now : Math.max(now, observed + OBSERVE_WAIT.firstMs);
      due = due === null ? floor : Math.min(due, floor);
    }
    if (w) this.sql.all("UPDATE artroom_fork_mint_watch SET unknown = ?, observe_due = ? WHERE fork = ?", n, due, fork);
    else this.sql.all("INSERT INTO artroom_fork_mint_watch (fork, unknown, observe_due, observe_wait) VALUES (?, ?, ?, ?)", fork, n, due, OBSERVE_WAIT.firstMs);
  }

  /** Change one record from `from`, by its row ID. True if it was in that state. */
  private move(id: number, from: ForkTokenState, set: string, ...values: (string | number | null)[]): boolean {
    return this.sql.all(`UPDATE artroom_fork_mint SET ${set} WHERE id = ? AND state = ? RETURNING id`, ...values, id, from).length > 0;
  }

  /** Delete one record in state `from`. True if it was. */
  private drop(id: number, from: ForkTokenState): boolean {
    return this.sql.all("DELETE FROM artroom_fork_mint WHERE id = ? AND state = ? RETURNING id", id, from).length > 0;
  }

  /** The fork, looked up (with its provenance) within the bounded wait, or null if the lookup did not answer in time. */
  private async lookup(fork: string): Promise<ForkRepo | null> {
    const repo = await within((async () => this.fork(fork))(), this.waitMs, TIMEOUT);
    return repo === TIMEOUT ? null : repo;
  }

  /** Is any request outstanding, or any token in use, on this host? */
  private inFlight(): boolean {
    return this.sql.all("SELECT id FROM artroom_fork_mint WHERE state IN ('sent', 'held') LIMIT 1").length > 0;
  }

  /**
   * A new host holds nothing: every `sent` record becomes `unknown`, and
   * every `held` record becomes `owed`, due at once. One indexed update of
   * those states only.
   */
  private takeOver(): void {
    this.sql.transaction(() => {
      const moved = this.sql.all(
        "UPDATE artroom_fork_mint SET state = CASE state WHEN 'sent' THEN 'unknown' ELSE 'owed' END, " +
          "due = CASE state WHEN 'sent' THEN NULL ELSE ? END, backoff = NULL, " +
          "last_error = CASE state WHEN 'sent' THEN ? ELSE ? END " +
          "WHERE state IN ('sent', 'held') RETURNING fork, state",
        this.now(),
        "taken over: the host stopped before an answer was recorded",
        "taken over: the host that held it stopped",
      );
      const forks = new Map<string, { owed: number; unknown: number }>();
      for (const r of moved) {
        const f = text(r, "fork") ?? "";
        const c = forks.get(f) ?? { owed: 0, unknown: 0 };
        if (r["state"] === "unknown") c.unknown++;
        else c.owed++;
        forks.set(f, c);
      }
      for (const [f, c] of forks) this.count(f, c.owed, c.unknown);
      if (this.summary().takeover !== null) this.sql.all("UPDATE artroom_fork_mint_summary SET takeover = NULL WHERE k = 1");
    });
  }

  // ---------------------------------------------------------------- mint

  /**
   * Mint a read token on a lane fork (R-MINT-2 and R-MINT-3 by analogy).
   * The fork is looked up first, with its provenance; then each attempt is
   * one request under one record, written before its wake-up and its send.
   * A transient error is retried, each attempt as a new record, only once
   * the earlier record holds its outcome.
   */
  async mint(fork: string, purpose: string, ttl: number): Promise<ForkToken & { release(): Promise<void> }> {
    const repo = await this.lookup(fork);
    if (!repo) throw new Error(`the fork was not reached within ${this.waitMs} ms; nothing was sent`);
    let wait: number = MINT_RETRY.firstMs;
    for (let attempt = 1; ; attempt++) {
      const r = await this.once(repo, fork, purpose, ttl);
      if (r.ok) return r.token;
      if (!r.retry || attempt >= MINT_RETRY.attempts) throw r.error;
      await this.sleep(wait);
      wait *= 2;
    }
  }

  /** Mint, run `fn` with the token, and release it, however `fn` ends. */
  async withToken<T>(fork: string, purpose: string, ttl: number, fn: (token: ForkToken) => Promise<T>): Promise<T> {
    const token = await this.mint(fork, purpose, ttl);
    try {
      return await fn({ id: token.id, plaintext: token.plaintext, expiresAt: token.expiresAt });
    } finally {
      await token.release();
    }
  }

  /** One request under one record. `retry` only when the error is transient and the record holds its outcome. */
  private async once(
    repo: ForkRepo,
    fork: string,
    purpose: string,
    ttl: number,
  ): Promise<{ ok: true; token: ForkToken & { release(): Promise<void> } } | { ok: false; error: unknown; retry: boolean }> {
    // 1. The record, and the takeover time it needs, in one transaction. A failure writes nothing and sends nothing.
    const { id, takeover } = this.sql.transaction(() => {
      const now = this.now();
      const rows = this.sql.all(
        "INSERT INTO artroom_fork_mint (fork, purpose, ttl, sent_at, state) VALUES (?, ?, ?, ?, 'sent') RETURNING id",
        fork,
        purpose,
        ttl,
        now,
      );
      let takeover = this.summary().takeover;
      if (takeover === null || takeover - now < TAKEOVER_MOVE_MS) {
        takeover = now + TAKEOVER_AHEAD_MS;
        this.sql.all("UPDATE artroom_fork_mint_summary SET takeover = ? WHERE k = 1", takeover);
      }
      return { id: Number(rows[0]?.["id"]), takeover };
    });
    const abandon = (error: unknown) => {
      // Nothing was sent: the record goes.
      try {
        this.sql.transaction(() => this.drop(id, "sent"));
      } catch {
        // Left `sent`: the next host's takeover makes it unknown, never settled by guesswork.
      }
      return { ok: false as const, error, retry: false };
    };
    // 2. The wake-up, stored before anything is sent.
    try {
      await this.wake(takeover);
    } catch (e) {
      return abandon(e);
    }
    // 3. After the await, and before the send: the record must still be this request's.
    if (this.sql.all("SELECT id FROM artroom_fork_mint WHERE id = ? AND state = 'sent'", id).length === 0) {
      return abandon(new Error("the fork token record was taken over before its request was sent"));
    }
    // 4. The request, waited on for at most `waitMs`.
    const send = (async () => repo.createToken("read", ttl))();
    const first = await within(
      send.then(
        (v) => ({ v }),
        (e: unknown) => ({ e }),
      ),
      this.waitMs,
      TIMEOUT,
    );
    if (first === TIMEOUT) {
      // The caller stops waiting. The answer, whenever it comes, still settles the record.
      try {
        this.sql.transaction(() => {
          if (this.move(id, "sent", "state = 'unknown', last_error = ?", "no answer to the create in time")) this.count(fork, 0, 1);
        });
      } catch {
        // Left `sent`: the late answer, or the next host's takeover, settles it.
      }
      this.track(
        send.then(
          (v) => this.settleLate(id, fork, repo, this.classify(v, ttl, false)),
          (e: unknown) => this.settleLate(id, fork, repo, this.failure(e)),
        ),
      );
      return { ok: false, error: new Error(`Artifacts did not answer the fork token request within ${this.waitMs} ms; its outcome is unknown`), retry: false };
    }
    const outcome = "e" in first ? this.failure(first.e) : this.classify(first.v, ttl, true);
    let applied: ForkTokenState | "closed" | null;
    try {
      applied = this.apply(id, fork, outcome);
    } catch (e) {
      // The answer could not be recorded: the record keeps its state.
      await this.handoffFailed(id, fork, repo, outcome);
      return { ok: false, error: e, retry: false };
    }
    if (outcome.kind === "token") {
      // In no record: nothing may own it, so it is revoked by its ID at once.
      if (applied === null) await this.handoffFailed(id, fork, repo, outcome);
      if (applied === "held") {
        const tokenId = outcome.id;
        return { ok: true, token: { id: tokenId, plaintext: outcome.plaintext, expiresAt: outcome.expiresAt as number, release: () => this.release(id, fork, repo, tokenId) } };
      }
      await this.wake(this.now()).catch(() => undefined); // owed now; the takeover wake-up covers it as well
      const why = outcome.usable ? "the record was taken over while the caller waited" : outcome.why;
      return { ok: false, error: new Error(`Artifacts' answer cannot be used (${why}); the token is owed revocation`), retry: false };
    }
    if (outcome.kind === "refused") return { ok: false, error: "e" in first ? first.e : new Error(outcome.why), retry: false };
    // Unknown. A transient error is retried under a new record, now that this one holds its outcome.
    const error = "e" in first ? first.e : new Error("Artifacts answered without a token ID; the outcome is unknown");
    return { ok: false, error, retry: "e" in first && retriable(first.e) && applied === "unknown" };
  }

  /**
   * Classify an answer. Usable only with text, read scope, and a readable
   * expiry no later than the answer's arrival plus the lifetime asked plus
   * `MINT_CLOCK_ALLOWANCE_MS` (R-MINT-3: Artifacts sets the expiry by its own
   * clock), for a waiting caller. A fork token has no absolute deadline.
   */
  private classify(answer: unknown, ttlS: number, waiting: boolean): Outcome {
    const a = answer as { id?: unknown; plaintext?: unknown; scope?: unknown; expiresAt?: unknown } | null;
    if (typeof a?.id !== "string" || a.id.length === 0) return { kind: "unknown", why: "an answer without a token ID" };
    const parsed = typeof a.expiresAt === "string" ? Date.parse(a.expiresAt) : NaN;
    const expiresAt = Number.isFinite(parsed) ? parsed : null;
    const why =
      typeof a.plaintext !== "string" || a.plaintext.length === 0
        ? "no token text"
        : a.scope !== "read"
          ? "another scope"
          : expiresAt === null
            ? "an unreadable expiry"
            : expiresAt > this.now() + ttlS * 1000 + MINT_CLOCK_ALLOWANCE_MS
              ? "an expiry later than the lifetime asked"
              : !waiting
                ? "no caller is waiting"
                : "";
    return { kind: "token", id: a.id, expiresAt, usable: why === "", plaintext: why === "" ? (a.plaintext as string) : "", why: why || "usable" };
  }

  private failure(e: unknown): Outcome {
    const why = errorNote("create failed", e);
    return refusedUnchanged(e) ? { kind: "refused", why } : { kind: "unknown", why };
  }

  /**
   * Apply an outcome to its own record, in one transaction, from the state it
   * is in: `sent` while its request is out, or `unknown` once it was given
   * up. Only a usable answer to a record still `sent` makes it `held`.
   * Returns the new state, "closed" if the record was deleted, or null if it
   * was in neither state.
   */
  private apply(id: number, fork: string, o: Outcome): ForkTokenState | "closed" | null {
    return this.sql.transaction(() => {
      for (const from of ["sent", "unknown"] as const) {
        if (o.kind === "token") {
          if (o.usable && from === "sent") {
            if (this.move(id, from, "state = 'held', token = ?, expires_at = ?, last_error = NULL", o.id, o.expiresAt)) return "held";
            continue;
          }
          const why = o.usable ? "no caller is waiting: the record was given up" : o.why;
          if (this.move(id, from, "state = 'owed', token = ?, expires_at = ?, due = ?, backoff = NULL, last_error = ?", o.id, o.expiresAt, this.now(), why)) {
            this.count(fork, 1, from === "unknown" ? -1 : 0);
            return "owed";
          }
        } else if (o.kind === "refused") {
          if (this.drop(id, from)) {
            this.count(fork, 0, from === "unknown" ? -1 : 0);
            return "closed";
          }
        } else if (from === "unknown") {
          if (this.sql.all("SELECT id FROM artroom_fork_mint WHERE id = ? AND state = 'unknown'", id).length > 0) return "unknown";
        } else if (this.move(id, from, "state = 'unknown', last_error = ?", o.why)) {
          this.count(fork, 0, 1);
          return "unknown";
        }
      }
      return null;
    });
  }

  /** A late answer, after the caller stopped waiting: no caller gets the text. */
  private async settleLate(id: number, fork: string, repo: ForkRepo, o: Outcome): Promise<void> {
    try {
      const applied = this.apply(id, fork, o);
      if (applied === "owed") await this.wake(this.now()).catch(() => undefined);
      else if (applied === null) await this.handoffFailed(id, fork, repo, o);
    } catch {
      await this.handoffFailed(id, fork, repo, o);
    }
  }

  /**
   * The answer gave a token ID, but it could not be recorded as the answer
   * (as `held`, say: a write failed), or its record was in no state to take
   * it. The ID is in hand, so before any revocation is attempted the record
   * is written again, as the record of that token owed revocation, up to
   * `MINT_ID_WRITE_ATTEMPTS` times (R-MINT-3, as amended for request
   * 02836f9a). Then the token is revoked by its ID at once. An answer ends
   * the record; a failure leaves it owed, with its ID, for the alarm's
   * passes. If storage refused every write, the Room cannot guarantee that
   * the duty survives: the record keeps its earlier state (`sent`, which the
   * next host's takeover makes `unknown`), and only the revocation at once
   * remains.
   */
  private async handoffFailed(id: number, fork: string, repo: ForkRepo, o: Outcome): Promise<void> {
    if (o.kind !== "token") return;
    let recorded = false;
    for (let attempt = 0; attempt < MINT_ID_WRITE_ATTEMPTS && !recorded; attempt++) {
      try {
        recorded = this.sql.transaction(() => this.oweKnown(id, fork, o));
        if (!recorded) break; // the record is in neither state: nothing to write it to
      } catch {
        recorded = false;
      }
    }
    const answered = await within(repo.revokeToken(o.id).then(() => true), this.waitMs, false).catch(() => false);
    if (answered) {
      try {
        this.sql.transaction(() => {
          if (this.drop(id, "owed")) this.count(fork, -1, 0);
          else if (this.drop(id, "unknown")) this.count(fork, 0, -1);
          else this.drop(id, "sent");
        });
      } catch {
        // The record stays owed, or as it was: its revocation is tried again, never settled by guesswork.
      }
      return;
    }
    await this.wake(this.now() + MINT_REVOKE_BACKOFF.firstMs).catch(() => undefined);
  }

  /**
   * In the caller's transaction: the record, still `sent` or `unknown`, becomes
   * the record of a known token owed revocation, by its ID and reported
   * expiry. False if it was in neither state.
   */
  private oweKnown(id: number, fork: string, o: Extract<Outcome, { kind: "token" }>): boolean {
    for (const from of ["sent", "unknown"] as const) {
      if (this.move(id, from, "state = 'owed', token = ?, expires_at = ?, due = ?, backoff = NULL, last_error = ?", o.id, o.expiresAt, this.now(), "the answer could not be recorded; owed revocation by its ID")) {
        this.count(fork, 1, from === "unknown" ? -1 : 0);
        return true;
      }
    }
    return false;
  }

  /** Does a record hold this token for a caller on `fork` (a pin in progress)? The fork's sweep keeps it. */
  holds(fork: string, tokenId: string): boolean {
    return this.sql.all("SELECT 1 AS x FROM artroom_fork_mint WHERE token = ? AND state = 'held' AND fork = ? LIMIT 1", tokenId, fork).length > 0;
  }

  /** Does a record on `fork` name this token by its ID, in any state? */
  names(fork: string, tokenId: string): boolean {
    return this.sql.all("SELECT 1 AS x FROM artroom_fork_mint WHERE token = ? AND fork = ? LIMIT 1", tokenId, fork).length > 0;
  }

  /**
   * Is a create on `fork` unsettled: still `sent`, or `unknown`? Its token,
   * if it applied, is on the fork with an ID no record holds, and nothing
   * tells it apart (open points 42 and 43): no label, no fence, and no
   * bound on when it applies (R-MINT-6), so no time ends this. While it
   * holds, the fork's sweep revokes only tokens whose IDs a record names
   * (R-WS-3 suspended, not inferred around); it ends only when the record
   * is settled by its own answer.
   */
  unsettled(fork: string): boolean {
    return this.sql.all("SELECT 1 AS x FROM artroom_fork_mint WHERE fork = ? AND state IN ('sent', 'unknown') LIMIT 1", fork).length > 0;
  }

  private track(p: Promise<unknown>): void {
    const q = p.catch(() => undefined).finally(() => this.late.delete(q));
    this.late.add(q);
  }

  /** Revoke a held token by its ID. An answer deletes the record; a refusal, a timeout or a failed completion makes it owed. */
  private async release(id: number, fork: string, repo: ForkRepo, tokenId: string): Promise<void> {
    // Released or taken over: no longer this caller's to revoke.
    if (this.sql.all("SELECT id FROM artroom_fork_mint WHERE id = ? AND state = 'held'", id).length === 0) return;
    let note: string;
    try {
      if (await within(repo.revokeToken(tokenId).then(() => true), this.waitMs, false)) {
        try {
          this.sql.transaction(() => this.drop(id, "held"));
          return;
        } catch (e) {
          note = errorNote("revocation answered, but the completion did not commit", e); // a failure like any other
        }
      } else note = "revocation: no answer in time";
    } catch (e) {
      note = errorNote("revocation failed", e);
    }
    const due = this.now() + MINT_REVOKE_BACKOFF.firstMs;
    this.sql.transaction(() => {
      if (this.move(id, "held", "state = 'owed', due = ?, backoff = ?, last_error = ?", due, MINT_REVOKE_BACKOFF.firstMs, note)) this.count(fork, 1, 0);
    });
    await this.wake(due).catch(() => undefined); // the takeover wake-up, stored while it was held, covers it as well
  }

  // ---------------------------------------------------------------- the fork's owner

  // ---------------------------------------------------------------- the alarm

  /**
   * The alarm's work: keep or clear the takeover time, start a revocation
   * pass (not awaited), and observe one fork if due (awaited, bounded).
   */
  async reconcile(): Promise<void> {
    this.sql.transaction(() => {
      const now = this.now();
      const s = this.summary();
      if (this.inFlight()) {
        if (s.takeover === null || s.takeover - now < TAKEOVER_MOVE_MS) this.sql.all("UPDATE artroom_fork_mint_summary SET takeover = ? WHERE k = 1", now + TAKEOVER_AHEAD_MS);
      } else if (s.takeover !== null) this.sql.all("UPDATE artroom_fork_mint_summary SET takeover = NULL WHERE k = 1");
    });
    this.startPass();
    await this.observe();
  }

  /** Resolves when the revocation pass and every late answer this instance handles have ended. */
  async idle(): Promise<void> {
    while (this.pass || this.late.size > 0) await Promise.all([this.pass, ...this.late]);
  }

  /**
   * Start a pass over at most 20 eligible owed records, earliest due first,
   * unless one is running. If any of them has a readable expiry that has
   * passed, this pass only settles those, with no revocation call, and ends:
   * the others are revoked by the next pass, 1 s later (`nextDue()`).
   */
  private startPass(): void {
    if (this.pass) return;
    const now = this.now();
    const batch = this.sql
      .all("SELECT id, fork, token, expires_at, backoff FROM artroom_fork_mint WHERE state = 'owed' AND due <= ? ORDER BY due, id LIMIT ?", now, MINT_REVOKE_BATCH)
      .map((r) => ({ id: Number(r["id"]), fork: text(r, "fork") ?? "", token: text(r, "token") ?? "", expiresAt: num(r, "expires_at"), backoff: num(r, "backoff") }));
    if (batch.length === 0) return;
    const expired = batch.filter((r) => r.expiresAt !== null && r.expiresAt <= now);
    let run: Promise<void>;
    if (expired.length > 0) {
      try {
        this.sql.transaction(() => {
          for (const r of expired) if (this.drop(r.id, "owed")) this.count(r.fork, -1, 0);
        });
        this.passUntil = now;
        run = Promise.resolve();
      } catch {
        this.passUntil = now + this.waitMs;
        run = this.revoke(batch).catch(() => undefined);
      }
    } else {
      this.passUntil = now + this.waitMs;
      run = this.revoke(batch).catch(() => undefined);
    }
    this.pass = run.then(async () => {
      this.pass = null;
      // A backlog continues 1 s after the pass ends.
      const next = this.nextDue();
      if (next !== null) await this.wake(next).catch(() => undefined);
    });
  }

  /**
   * Revoke each record by its own ID, on its own fork. Each fork is looked
   * up once a pass, with its provenance and within the bounded wait; a
   * failed or timed-out lookup is a failure for that fork's records.
   * Immediately before each revocation, the record's readable expiry is
   * checked again. Then one transaction: at most one write per record, and
   * the summary's.
   */
  private async revoke(batch: readonly { id: number; fork: string; token: string; expiresAt: number | null; backoff: number | null }[]): Promise<void> {
    const results: { id: number; fork: string; done: boolean; backoff: number | null; expiresAt: number | null; note: string }[] = [];
    const forks = new Map<string, { repo: ForkRepo | null; note: string }>();
    for (const r of batch) {
      const x = { id: r.id, fork: r.fork, backoff: r.backoff, expiresAt: r.expiresAt };
      if (r.expiresAt !== null && r.expiresAt <= this.now()) {
        results.push({ ...x, done: true, note: "" });
        continue;
      }
      let f = forks.get(r.fork);
      if (!f) {
        this.passUntil = this.now() + this.waitMs;
        try {
          const repo = await this.lookup(r.fork);
          f = { repo, note: repo ? "" : "the fork was not reached in time" };
        } catch (e) {
          f = { repo: null, note: errorNote("repository lookup failed", e) };
        }
        forks.set(r.fork, f);
        // The lookup took time: an expiry that passed meanwhile settles the record with no call.
        if (r.expiresAt !== null && r.expiresAt <= this.now()) {
          results.push({ ...x, done: true, note: "" });
          continue;
        }
      }
      if (!f.repo) {
        results.push({ ...x, done: false, note: f.note });
        continue;
      }
      this.passUntil = this.now() + this.waitMs;
      try {
        const answered = await within(f.repo.revokeToken(r.token).then(() => true), this.waitMs, false);
        results.push({ ...x, done: answered, note: answered ? "" : "revocation: no answer in time" });
      } catch (e) {
        results.push({ ...x, done: false, note: errorNote("revocation failed", e) });
      }
    }
    const fail = (x: (typeof results)[number], note: string) => {
      const wait = x.backoff === null ? MINT_REVOKE_BACKOFF.firstMs : Math.min(x.backoff * 2, MINT_REVOKE_BACKOFF.maxMs);
      // Never past a readable expiry: the record is settled when it passes.
      const due = x.expiresAt === null ? this.now() + wait : Math.min(this.now() + wait, x.expiresAt);
      this.move(x.id, "owed", "due = ?, backoff = ?, last_error = ?", due, wait, note);
    };
    try {
      this.sql.transaction(() => {
        let gone = 0;
        for (const x of results) {
          if (x.done) gone += this.drop(x.id, "owed") ? 1 : 0;
          else fail(x, x.note);
        }
        if (gone > 0) {
          const s = this.summary();
          this.sql.all("UPDATE artroom_fork_mint_summary SET owed = ? WHERE k = 1", s.owed - gone);
        }
      });
    } catch (e) {
      try {
        this.sql.transaction(() => {
          for (const x of results) fail(x, x.done ? errorNote("revocation answered, but the completion did not commit", e) : x.note);
        });
      } catch {
        // Storage could not record the retries either: each record keeps its due time.
      }
    }
  }

  /**
   * At most one observation per alarm: of the fork whose observation is due
   * earliest, while it has unknown records. One lookup (with provenance) and
   * one listing, which share one deadline, `waitMs`; one write to that
   * fork's watch row. An incomplete listing, or one over 1,000 records,
   * counts nothing. No record is written, and none is settled.
   */
  private async observe(): Promise<void> {
    if (this.observing) return;
    const w = this.sql.all("SELECT fork, observe_wait FROM artroom_fork_mint_watch WHERE observe_due <= ? ORDER BY observe_due, fork LIMIT 1", this.now())[0];
    const fork = text(w, "fork");
    if (fork === null) return;
    this.observing = true;
    this.observeUntil = this.now() + this.waitMs;
    try {
      let result = "";
      let unaccounted: number | null = null;
      let repo: ForkRepo | null = null;
      const deadline = Date.now() + this.waitMs;
      try {
        repo = await this.lookup(fork);
        if (!repo) result = "no inventory: the fork was not reached in time";
      } catch (e) {
        result = errorNote("no inventory: repository lookup failed", e);
      }
      let listing: unknown = null;
      const left = deadline - Date.now();
      if (repo && left <= 0) result = "no inventory: no time was left for the listing";
      else if (repo) {
        try {
          listing = await within(repo.listTokens(), left, TIMEOUT);
          if (listing === TIMEOUT) result = "no inventory: the listing did not answer in time";
        } catch (e) {
          result = errorNote("no inventory: the listing failed", e);
        }
      }
      if (result === "") {
        const raw = listing as { tokens?: unknown; total?: unknown } | null;
        const size = Math.max(Array.isArray(raw?.tokens) ? raw.tokens.length : 0, typeof raw?.total === "number" ? raw.total : 0);
        let tokens: ReturnType<typeof completeInventory> | null = null;
        if (size > MINT_LISTING_MAX) result = `the listing has ${size} records, over ${MINT_LISTING_MAX}; nothing counted`;
        else {
          try {
            tokens = completeInventory(listing);
          } catch {
            result = "no inventory: the listing is incomplete or malformed";
          }
        }
        if (tokens) {
          const at = this.now();
          unaccounted = 0;
          for (const t of tokens) {
            if (t.state !== "active" || Date.parse(t.expiresAt) <= at) continue;
            if (this.sql.all("SELECT id FROM artroom_fork_mint WHERE token = ? LIMIT 1", t.id).length > 0 || this.known(fork, t.id)) continue;
            unaccounted++;
          }
          result = `${unaccounted} live token(s) on the fork not accounted for`;
        }
      }
      this.sql.transaction(() => {
        const at = this.now();
        const wait = num(this.sql.all("SELECT observe_wait FROM artroom_fork_mint_watch WHERE fork = ?", fork)[0], "observe_wait") ?? OBSERVE_WAIT.firstMs;
        // A fork whose unknown records were all settled meanwhile (by their own late answers) is not due again.
        this.sql.all(
          "UPDATE artroom_fork_mint_watch SET observed_at = ?, observation = ?, unaccounted = ?, observe_due = CASE WHEN unknown > 0 THEN ? ELSE NULL END, observe_wait = ? WHERE fork = ?",
          at,
          result,
          unaccounted,
          at + wait,
          Math.min(wait * 2, OBSERVE_WAIT.maxMs),
          fork,
        );
      });
    } finally {
      this.observing = false;
    }
  }

  /**
   * When the alarm should next run for this ledger, or null: the earliest of
   * the owed revocations' due time, the earliest fork observation and the
   * takeover time (while any record is sent or held). A time not yet passed
   * is returned as it is; a time already passed counts as now plus 1 s.
   * While a pass or an observation waits on an answer, its work is not
   * eligible before that attempt's timeout.
   */
  nextDue(): number | null {
    const now = this.now();
    const times: number[] = [];
    const owed = num(this.sql.all("SELECT MIN(due) AS t FROM artroom_fork_mint WHERE state = 'owed'")[0], "t");
    if (owed !== null) times.push(this.pass ? Math.max(owed, this.passUntil) : owed);
    const observe = num(this.sql.all("SELECT MIN(observe_due) AS t FROM artroom_fork_mint_watch")[0], "t");
    if (observe !== null) times.push(this.observing ? Math.max(observe, this.observeUntil) : observe);
    const takeover = this.summary().takeover;
    if (takeover !== null && this.inFlight()) times.push(takeover);
    if (times.length === 0) return null;
    return Math.min(...times.map((t) => (t <= now ? now + OVERDUE_STEP_MS : t)));
  }

  /** One page of records by row ID, with the counts. Every record is reachable by paging; none is ever evicted. */
  duties(opts: { readonly after?: number; readonly limit?: number } = {}): ForkTokenDuties {
    const limit = Math.min(Math.max(Math.floor(opts.limit ?? 100), 1), PAGE_MAX);
    const rows = this.sql.all(
      "SELECT id, fork, purpose, state, ttl, sent_at, token, expires_at, due, last_error FROM artroom_fork_mint WHERE id > ? ORDER BY id LIMIT ?",
      opts.after ?? 0,
      limit + 1,
    );
    const page = rows.slice(0, limit);
    const s = this.summary();
    return {
      records: page.map((r) => ({
        id: Number(r["id"]),
        fork: text(r, "fork") ?? "",
        purpose: text(r, "purpose") ?? "",
        state: text(r, "state") as ForkTokenState,
        ttlSeconds: num(r, "ttl") ?? 0,
        sentAt: num(r, "sent_at") ?? 0,
        tokenId: text(r, "token"),
        expiresAt: num(r, "expires_at"),
        dueAt: num(r, "due"),
        lastError: text(r, "last_error"),
      })),
      next: rows.length > limit ? Number(page[page.length - 1]?.["id"]) : null,
      owed: s.owed,
      unknown: s.unknown,
      takeoverAt: s.takeover,
    };
  }

  /** One fork's watch, or null if it never had an unknown record. */
  watch(fork: string): ForkWatch | null {
    const r = this.sql.all("SELECT * FROM artroom_fork_mint_watch WHERE fork = ?", fork)[0];
    if (!r) return null;
    return {
      fork,
      unknown: num(r, "unknown") ?? 0,
      at: num(r, "observed_at"),
      result: text(r, "observation"),
      unaccounted: num(r, "unaccounted"),
      nextAt: num(r, "observe_due"),
    };
  }
}

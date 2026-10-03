/**
 * The canonical mint ledger (protocol section 32, R-MINT-1 to R-MINT-7;
 * design: notes/2026-10-02-canonical-mint-ownership.md, lane A).
 *
 * One durable record owns each token the Room creates on its canonical
 * repository, from before the create request is sent until Artifacts
 * answers its revocation, or another owner claims it in one transaction.
 *
 * Record states:
 * - `sent`: the request is out and no answer is recorded;
 * - `held`: known by ID and text, and given to a caller on this live host;
 * - `owed`: known by ID; its revocation is due at `due`;
 * - `unknown`: the create may or may not have applied. Only its own
 *   request's later answer settles it. Time, lifetimes, inventories and the
 *   end of the owner never do (R-MINT-5).
 * A record is deleted when it ends. Every change is a conditional update of
 * its own row ID in its expected state, so a late completion never changes
 * another record or another owner's row. Row IDs are never reused.
 *
 * One summary row holds the counts of `owed` and `unknown` records (changed
 * in the same transaction as each record), the takeover time, and the
 * shared observation of unknown creates: its time, result and next due
 * time. An observation never settles a record and writes no record.
 *
 * Construct one ledger per host start (a Durable Object's constructor): the
 * constructor takes over what a stopped host left. `sent` records become
 * `unknown`, and `held` records become `owed`, due at once.
 *
 * Every read uses an index; no step reads, writes or waits in proportion to
 * the number of records kept (R-MINT-7).
 */

import { type Sql, type SqlRow, text } from "./sql.ts";
import { type RepoHandle, completeInventory, refusedUnchanged, retriable } from "./artifacts.ts";

export type MintScope = "read" | "write";
export type MintState = "sent" | "held" | "owed" | "unknown";

/** The canonical repository calls the ledger makes. */
export type MintRepo = Pick<RepoHandle, "createToken" | "revokeToken" | "listTokens">;

export interface MintLedgerOptions {
  readonly sql: Sql;
  /** The canonical repository. Fetched before a record is written, so nothing slow sits between the lifetime and the send. */
  readonly repo: () => Promise<MintRepo>;
  /** The room clock, in milliseconds. */
  readonly now: () => number;
  /** Persist a wake-up at or before `at` (room clock), keeping an earlier one; resolve only once it is stored. */
  readonly wake: (at: number) => Promise<void>;
  /** Does another Room record hold this token ID (job tokens, landing tokens)? Point lookups only. */
  readonly known: (tokenId: string) => boolean;
  /** The bounded wait for a create, a revocation or a listing. Default `MINT_WAIT_MS`. */
  readonly waitMs?: number;
  /** The wait between retries of a transient create error. Tests only. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** A usable token, given only to the caller still waiting for it. */
export interface LedgerToken {
  readonly id: string;
  readonly plaintext: string;
  readonly scope: MintScope;
  /** Artifacts' reported expiry (ms). Always readable, and no later than `notAfter`. */
  readonly expiresAt: number;
  /** Revoke the token by its ID, waiting at most `waitMs`. A refusal or a timeout makes it owed, with backoff. */
  release(): Promise<void>;
  /** Hand the token to another owner. Synchronous: call it inside that owner's transaction. Throws if the ledger no longer holds it. */
  claim(): void;
}

/** One record, for admins: never a token's text. */
export interface MintDuty {
  readonly id: number;
  readonly purpose: string;
  readonly scope: MintScope;
  readonly state: MintState;
  readonly ttlSeconds: number | null;
  readonly notAfter: number | null;
  readonly sentAt: number;
  readonly tokenId: string | null;
  readonly expiresAt: number | null;
  readonly dueAt: number | null;
  readonly lastError: string | null;
}

export interface MintDuties {
  readonly records: readonly MintDuty[];
  /** Pass as `after` for the next page; null when this page is the last. */
  readonly next: number | null;
  readonly owed: number;
  readonly unknown: number;
  readonly takeoverAt: number | null;
  readonly observation: {
    readonly at: number | null;
    readonly result: string | null;
    readonly unaccounted: number | null;
    readonly nextAt: number | null;
  };
}

/** The bounded wait for one create, revocation or listing. */
export const MINT_WAIT_MS = 30_000;
/**
 * How far a reported expiry may pass the answer's arrival plus the lifetime
 * asked. Artifacts sets the expiry by its own clock, and the Room reads the
 * arrival by its own: on the spike, Artifacts' expiry for a 600 s pinning
 * token came 67 ms after the Room's arrival plus 600 s, so every canonical
 * mint was refused and every propose failed (request df6ff8d3). The same
 * margin as the deadline margins (`TOKEN_MARGIN_S`). An answer that gives a
 * longer lifetime than this still fails the check; `notAfter` has no margin.
 */
export const MINT_CLOCK_ALLOWANCE_MS = 5_000;
/** The takeover time is set this far ahead … */
export const TAKEOVER_AHEAD_MS = 60_000;
/** … whenever it is less than this far away. */
export const TAKEOVER_MOVE_MS = 30_000;
/** Overdue work is due again this long after now, never sooner. */
export const OVERDUE_STEP_MS = 1_000;
/** Owed revocations: 1 s doubling to 5 min. Never a deadline. */
export const MINT_REVOKE_BACKOFF = { firstMs: 1_000, maxMs: 300_000 } as const;
/** Observations: 1 min doubling to 6 h. */
export const OBSERVE_WAIT = { firstMs: 60_000, maxMs: 6 * 3600_000 } as const;
/** Most owed revocations one pass tries. */
export const MINT_REVOKE_BATCH = 20;
/** A listing with more records than this counts nothing. */
export const MINT_LISTING_MAX = 1_000;
/**
 * Once an answer's token ID is in hand and its record could not be written,
 * the record is written again, as owed by that ID, at most this many times
 * before the token is revoked at once (R-MINT-3, as amended for request
 * 02836f9a).
 */
export const MINT_ID_WRITE_ATTEMPTS = 3;
/** Retries of a transient create error, as `withRetry`: 5 attempts, from 0.5 s. Each is a new record. */
export const MINT_RETRY = { attempts: 5, firstMs: 500 } as const;
/** Most records one `duties` page returns. */
const PAGE_MAX = 1_000;

/** Error names that may be stored. Any other name is not: it is the thrower's text. */
export const SAFE_NAMES: ReadonlySet<string> = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "AggregateError", "AbortError", "TimeoutError"]);
/** Artifacts codes that may be stored: those `artifacts.ts` classifies (`REFUSED_UNCHANGED`, `retriable`). */
export const SAFE_CODES: ReadonlySet<string> = new Set([
  "ALREADY_EXISTS",
  "INVALID_INPUT",
  "INVALID_REPO_NAME",
  "INVALID_TTL",
  "NOT_FOUND",
  "INTERNAL_ERROR",
  "UPSTREAM_UNAVAILABLE",
]);

/** The fixed phrase for where an error happened. */
export const ERROR_STAGES = [
  "create failed",
  "revocation failed",
  "revocation answered, but the completion did not commit",
  "repository lookup failed",
  "no inventory: repository lookup failed",
  "no inventory: the listing failed",
  // The landing engine and its publishers (request d29c09fa).
  "integration failed",
  "readiness could not be computed",
  "push did not answer",
  "main could not be read",
  "landing step failed",
  // Lane workspaces and snapshot repositories (request d29c09fa).
  "could not provision the workspace",
  "workspace step failed",
  "workspace cleanup failed",
  "snapshot create failed",
  "snapshot create not yet seen",
  "snapshot cleanup failed",
  "snapshot step failed",
  // The Room's job tokens (request d29c09fa).
  "the token inventory could not be read",
] as const;
export type ErrorStage = (typeof ERROR_STAGES)[number];

/**
 * All a record or the observation keeps about an error (review 0ab6dac3):
 * the stage's fixed phrase, the error's name if it is in `SAFE_NAMES`, an
 * Artifacts code if it is in `SAFE_CODES`, and an integer numeric code or
 * HTTP status. Never the error's message or any other provider text: no
 * token format in the contract lets a pattern find every credential.
 * Every durable or projected error field in the Git and Room packages keeps
 * this and nothing more (request d29c09fa); only operator logs keep
 * redacted text (the Room's `diag.ts`).
 */
export function errorNote(stage: ErrorStage, e: unknown): string {
  const x = e as { name?: unknown; code?: unknown; numericCode?: unknown; status?: unknown } | null | undefined;
  const parts: string[] = [e instanceof Error ? (typeof x?.name === "string" && SAFE_NAMES.has(x.name) ? x.name : "an error of another kind") : "not an error"];
  if (typeof x?.code === "string" && SAFE_CODES.has(x.code)) parts.push(x.code);
  const numeric = x?.numericCode;
  if (typeof numeric === "number" && Number.isInteger(numeric) && numeric >= 0 && numeric <= 99_999) parts.push(`(${numeric})`);
  const status = x?.status;
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) parts.push(`status ${status}`);
  return `${stage}: ${parts.join(" ")}`; // bounded: every part comes from a fixed list or a bounded integer
}

/** The error's Artifacts code if it is one `SAFE_CODES` lists, else null. Never any other text. */
export function knownArtifactsCode(e: unknown): string | null {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && SAFE_CODES.has(code) ? code : null;
}

/** What a create's answer, or its failure, says. */
type Outcome =
  | {
      readonly kind: "token";
      readonly id: string;
      readonly expiresAt: number | null;
      readonly usable: boolean;
      /** Given to the caller only when usable. */
      readonly plaintext: string;
      readonly why: string;
    }
  | { readonly kind: "refused"; readonly why: string }
  | { readonly kind: "unknown"; readonly why: string };

interface Summary {
  readonly owed: number;
  readonly unknown: number;
  readonly takeover: number | null;
  readonly observedAt: number | null;
  readonly observation: string | null;
  readonly unaccounted: number | null;
  readonly observeDue: number | null;
  readonly observeWait: number;
}

const num = (r: SqlRow | undefined, c: string): number | null => {
  const v = r?.[c];
  return typeof v === "number" ? v : null;
};

/** Resolve with `p`'s value, reject with its error, or resolve `late` after `ms`. A late result is dropped. */
export function within<T, L>(p: Promise<T>, ms: number, late: L): Promise<T | L> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<L>((resolve) => {
    timer = setTimeout(() => resolve(late), ms);
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([p, t]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

const TIMEOUT = Symbol("timeout");

export class MintLedger {
  private readonly sql: Sql;
  private readonly repo: () => Promise<MintRepo>;
  private readonly now: () => number;
  private readonly wake: (at: number) => Promise<void>;
  private readonly known: (tokenId: string) => boolean;
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

  constructor(o: MintLedgerOptions) {
    this.sql = o.sql;
    this.repo = o.repo;
    this.now = o.now;
    this.wake = o.wake;
    this.known = o.known;
    this.waitMs = o.waitMs ?? MINT_WAIT_MS;
    this.sleep = o.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_mint (id INTEGER PRIMARY KEY AUTOINCREMENT, purpose TEXT NOT NULL, scope TEXT NOT NULL, ttl INTEGER, " +
        "not_after INTEGER, sent_at INTEGER NOT NULL, state TEXT NOT NULL, token TEXT, expires_at INTEGER, due INTEGER, backoff INTEGER, last_error TEXT)",
    );
    this.sql.all("CREATE INDEX IF NOT EXISTS artroom_mint_state ON artroom_mint (state, due, id)");
    this.sql.all("CREATE INDEX IF NOT EXISTS artroom_mint_token ON artroom_mint (token)");
    this.sql.all(
      "CREATE TABLE IF NOT EXISTS artroom_mint_summary (k INTEGER PRIMARY KEY CHECK (k = 1), owed INTEGER NOT NULL, unknown INTEGER NOT NULL, " +
        "takeover INTEGER, observed_at INTEGER, observation TEXT, unaccounted INTEGER, observe_due INTEGER, observe_wait INTEGER NOT NULL)",
    );
    this.sql.all("INSERT INTO artroom_mint_summary (k, owed, unknown, observe_wait) VALUES (1, 0, 0, ?) ON CONFLICT (k) DO NOTHING", OBSERVE_WAIT.firstMs);
    this.takeOver();
  }

  // ---------------------------------------------------------------- storage

  private summary(): Summary {
    const r = this.sql.all("SELECT * FROM artroom_mint_summary WHERE k = 1")[0];
    return {
      owed: num(r, "owed") ?? 0,
      unknown: num(r, "unknown") ?? 0,
      takeover: num(r, "takeover"),
      observedAt: num(r, "observed_at"),
      observation: text(r, "observation"),
      unaccounted: num(r, "unaccounted"),
      observeDue: num(r, "observe_due"),
      observeWait: num(r, "observe_wait") ?? OBSERVE_WAIT.firstMs,
    };
  }

  /**
   * Change the counts, in the caller's transaction. New unknown records
   * bring the observation forward, but never sooner than 1 min after the
   * last one.
   */
  private count(owed: number, unknown: number): void {
    if (owed === 0 && unknown === 0) return;
    const s = this.summary();
    let due = s.observeDue;
    if (unknown > 0) {
      const now = this.now();
      const floor = s.observedAt === null ? now : Math.max(now, s.observedAt + OBSERVE_WAIT.firstMs);
      due = due === null ? floor : Math.min(due, floor);
    }
    this.sql.all("UPDATE artroom_mint_summary SET owed = ?, unknown = ?, observe_due = ? WHERE k = 1", s.owed + owed, s.unknown + unknown, due);
  }

  /** Change one record from `from`, by its row ID. True if it was in that state. */
  private move(id: number, from: MintState, set: string, ...values: (string | number | null)[]): boolean {
    return this.sql.all(`UPDATE artroom_mint SET ${set} WHERE id = ? AND state = ? RETURNING id`, ...values, id, from).length > 0;
  }

  /** Delete one record in state `from`. True if it was. */
  private drop(id: number, from: MintState): boolean {
    return this.sql.all("DELETE FROM artroom_mint WHERE id = ? AND state = ? RETURNING id", id, from).length > 0;
  }

  /**
   * The repository, looked up within the bounded wait, or null if the
   * lookup did not answer in time: that attempt's failure. A lookup that
   * answers later is dropped, so it starts no provider work.
   */
  private async lookup(): Promise<MintRepo | null> {
    const repo = await within((async () => this.repo())(), this.waitMs, TIMEOUT);
    return repo === TIMEOUT ? null : repo;
  }

  /** Is any request outstanding, or any token in use, on this host? */
  private inFlight(): boolean {
    return this.sql.all("SELECT id FROM artroom_mint WHERE state IN ('sent', 'held') LIMIT 1").length > 0;
  }

  /**
   * A new host holds nothing: every `sent` record becomes `unknown`, and
   * every `held` record becomes `owed`, due at once. One indexed update of
   * those states only.
   */
  private takeOver(): void {
    this.sql.transaction(() => {
      const moved = this.sql.all(
        "UPDATE artroom_mint SET state = CASE state WHEN 'sent' THEN 'unknown' ELSE 'owed' END, " +
          "due = CASE state WHEN 'sent' THEN NULL ELSE ? END, backoff = NULL, " +
          "last_error = CASE state WHEN 'sent' THEN ? ELSE ? END " +
          "WHERE state IN ('sent', 'held') RETURNING state",
        this.now(),
        "taken over: the host stopped before an answer was recorded",
        "taken over: the host that held it stopped",
      );
      const unknown = moved.filter((r) => r["state"] === "unknown").length;
      this.count(moved.length - unknown, unknown);
      if (this.summary().takeover !== null) this.sql.all("UPDATE artroom_mint_summary SET takeover = NULL WHERE k = 1");
    });
  }

  /**
   * Take over creates that an earlier owner recorded, whose outcome is
   * unknown: a stored room's own records from before this ledger owned
   * them (mint lane C moves a check job's `mint:<job>` rows here once).
   * Each becomes an `unknown` record, kept like any other (R-MINT-5).
   * Synchronous: call it inside the transaction that removes the earlier
   * records, so none is lost and none is kept twice. One summary write.
   */
  adopt(records: readonly { readonly purpose: string; readonly scope: MintScope; readonly sentAt: number; readonly notAfter: number | null; readonly note: string }[]): void {
    for (const r of records)
      this.sql.all("INSERT INTO artroom_mint (purpose, scope, not_after, sent_at, state, last_error) VALUES (?, ?, ?, ?, 'unknown', ?)", r.purpose, r.scope, r.notAfter, r.sentAt, r.note);
    this.count(0, records.length);
  }

  // ---------------------------------------------------------------- mint

  /**
   * Mint a canonical token (R-MINT-2, R-MINT-3). `ttl` gives the lifetime to
   * ask, in seconds, from the send time; it is called after the wake-up is
   * stored. `notAfter` is an absolute bound (room clock) on the token's
   * expiry: a token that would outlive it is never returned. A transient
   * error is retried, each attempt as a new record.
   */
  async mint(purpose: string, scope: MintScope, ttl: (sentAt: number) => number, opts: { readonly notAfter?: number } = {}): Promise<LedgerToken> {
    const repo = await this.lookup();
    if (!repo) throw new Error(`the canonical repository was not reached within ${this.waitMs} ms; nothing was sent`);
    let wait: number = MINT_RETRY.firstMs;
    for (let attempt = 1; ; attempt++) {
      const r = await this.once(repo, purpose, scope, ttl, opts.notAfter ?? null);
      if (r.ok) return r.token;
      if (!r.retry || attempt >= MINT_RETRY.attempts) throw r.error;
      await this.sleep(wait);
      wait *= 2;
    }
  }

  /** Mint, run `fn` with the token, and release it, however `fn` ends. */
  async withToken<T>(purpose: string, scope: MintScope, ttl: (sentAt: number) => number, fn: (token: LedgerToken) => Promise<T>): Promise<T> {
    const token = await this.mint(purpose, scope, ttl);
    try {
      return await fn(token);
    } finally {
      await token.release();
    }
  }

  /** One request under one record. `retry` only when the error is transient and the record holds its outcome. */
  private async once(
    repo: MintRepo,
    purpose: string,
    scope: MintScope,
    ttl: (sentAt: number) => number,
    notAfter: number | null,
  ): Promise<{ ok: true; token: LedgerToken } | { ok: false; error: unknown; retry: boolean }> {
    // 1. The record, and the takeover time it needs, in one transaction. A failure writes nothing and sends nothing.
    const { id, takeover } = this.sql.transaction(() => {
      const now = this.now();
      const rows = this.sql.all(
        "INSERT INTO artroom_mint (purpose, scope, not_after, sent_at, state) VALUES (?, ?, ?, ?, 'sent') RETURNING id",
        purpose,
        scope,
        notAfter,
        now,
      );
      let takeover = this.summary().takeover;
      if (takeover === null || takeover - now < TAKEOVER_MOVE_MS) {
        takeover = now + TAKEOVER_AHEAD_MS;
        this.sql.all("UPDATE artroom_mint_summary SET takeover = ? WHERE k = 1", takeover);
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
    // 3. Only now the lifetime, so a slow wake-up cannot carry it past `notAfter`; the record holds the lifetime actually asked.
    let ttlS: number;
    try {
      const sentAt = this.now();
      ttlS = ttl(sentAt);
      const stored = this.sql.transaction(() => this.move(id, "sent", "ttl = ?, sent_at = ?", ttlS, sentAt));
      if (!stored) return abandon(new Error("the mint record was taken over before its request was sent"));
    } catch (e) {
      return abandon(e);
    }
    // 4. The request, waited on for at most `waitMs`.
    const send = (async () => repo.createToken(scope, ttlS))();
    const first = await within(
      send.then(
        (v) => ({ v }),
        (e: unknown) => ({ e }),
      ),
      this.waitMs,
      TIMEOUT,
    );
    if (first === TIMEOUT) {
      // The caller stops waiting. The answer, whenever it comes, still settles the record (R-MINT-3).
      try {
        this.sql.transaction(() => {
          if (this.move(id, "sent", "state = 'unknown', last_error = ?", "no answer to the create in time")) this.count(0, 1);
        });
      } catch {
        // Left `sent`: the late answer, or the next host's takeover, settles it.
      }
      this.track(
        send.then(
          (v) => this.settleLate(id, repo, this.classify(v, scope, ttlS, notAfter, false)),
          (e: unknown) => this.settleLate(id, repo, this.failure(e)),
        ),
      );
      return { ok: false, error: new Error(`Artifacts did not answer the token request within ${this.waitMs} ms; its outcome is unknown`), retry: false };
    }
    const outcome = "e" in first ? this.failure(first.e) : this.classify(first.v, scope, ttlS, notAfter, true);
    let applied: MintState | "closed" | null;
    try {
      applied = this.apply(id, outcome);
    } catch (e) {
      // The handoff could not be written: the record keeps its state (R-MINT-3).
      await this.handoffFailed(id, repo, outcome);
      return { ok: false, error: e, retry: false };
    }
    if (outcome.kind === "token") {
      // In no record: nothing may own it, so it is revoked by its ID at once.
      if (applied === null) await this.handoffFailed(id, repo, outcome);
      if (applied === "held") {
        const expiresAt = outcome.expiresAt as number;
        return { ok: true, token: this.token(id, repo, outcome.id, outcome.plaintext, scope, expiresAt) };
      }
      await this.wake(this.now()).catch(() => undefined); // owed now; the takeover wake-up covers it as well
      const why = outcome.usable ? "the record was taken over while the caller waited" : outcome.why;
      return { ok: false, error: new Error(`Artifacts' answer cannot be used (${why}); the token is owed revocation`), retry: false };
    }
    if (outcome.kind === "refused") return { ok: false, error: "e" in first ? first.e : new Error(outcome.why), retry: false };
    // Unknown. A transient error is retried under a new record, now that this one holds its outcome.
    const error = "e" in first ? first.e : new Error(`Artifacts answered without a token ID; the outcome is unknown`);
    return { ok: false, error, retry: "e" in first && retriable(first.e) && applied === "unknown" };
  }

  /** Classify an answer. Usable only with text, the scope asked, and a readable expiry within both bounds (the lifetime's with `MINT_CLOCK_ALLOWANCE_MS`), for a waiting caller. */
  private classify(answer: unknown, scope: MintScope, ttlS: number, notAfter: number | null, waiting: boolean): Outcome {
    const a = answer as { id?: unknown; plaintext?: unknown; scope?: unknown; expiresAt?: unknown } | null;
    if (typeof a?.id !== "string" || a.id.length === 0) return { kind: "unknown", why: "an answer without a token ID" };
    const parsed = typeof a.expiresAt === "string" ? Date.parse(a.expiresAt) : NaN;
    const expiresAt = Number.isFinite(parsed) ? parsed : null;
    const arrival = this.now();
    const why =
      typeof a.plaintext !== "string" || a.plaintext.length === 0
        ? "no token text"
        : a.scope !== scope
          ? "another scope"
          : expiresAt === null
            ? "an unreadable expiry"
            : expiresAt > arrival + ttlS * 1000 + MINT_CLOCK_ALLOWANCE_MS
              ? "an expiry later than the lifetime asked"
              : notAfter !== null && expiresAt > notAfter
                ? "an expiry after notAfter"
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
   * up. Only a usable answer (so, for a waiting caller) to a record still
   * `sent` makes it `held`. Returns the new state, "closed" if the record
   * was deleted, or null if it was in neither state.
   */
  private apply(id: number, o: Outcome): MintState | "closed" | null {
    return this.sql.transaction(() => {
      for (const from of ["sent", "unknown"] as const) {
        if (o.kind === "token") {
          if (o.usable && from === "sent") {
            if (this.move(id, from, "state = 'held', token = ?, expires_at = ?, last_error = NULL", o.id, o.expiresAt)) return "held";
            continue;
          }
          const why = o.usable ? "no caller is waiting: the record was given up" : o.why;
          const owed = this.move(id, from, "state = 'owed', token = ?, expires_at = ?, due = ?, backoff = NULL, last_error = ?", o.id, o.expiresAt, this.now(), why);
          if (owed) {
            this.count(1, from === "unknown" ? -1 : 0);
            return "owed";
          }
        } else if (o.kind === "refused") {
          if (this.drop(id, from)) {
            this.count(0, from === "unknown" ? -1 : 0);
            return "closed";
          }
        } else {
          if (from === "unknown") {
            if (this.sql.all("SELECT id FROM artroom_mint WHERE id = ? AND state = 'unknown'", id).length > 0) return "unknown";
          } else if (this.move(id, from, "state = 'unknown', last_error = ?", o.why)) {
            this.count(0, 1);
            return "unknown";
          }
        }
      }
      return null;
    });
  }

  /** A late answer, after the caller stopped waiting: no caller gets the text. */
  private async settleLate(id: number, repo: MintRepo, o: Outcome): Promise<void> {
    try {
      const applied = this.apply(id, o);
      if (applied === "owed") await this.wake(this.now()).catch(() => undefined);
      else if (applied === null) await this.handoffFailed(id, repo, o);
    } catch {
      await this.handoffFailed(id, repo, o);
    }
  }

  /**
   * The answer gave a token ID, but it could not be recorded as the answer,
   * or its record was in no state to take it. The ID is in hand, so before
   * any revocation is attempted the record is written again, as the record
   * of that token owed revocation, up to `MINT_ID_WRITE_ATTEMPTS` times
   * (R-MINT-3, as amended for request 02836f9a). Then the token is revoked
   * by its ID at once. An answer ends the record; a failure leaves it owed,
   * with its ID, for the alarm's passes. If storage refused every write, the
   * Room cannot guarantee that the duty survives: the record keeps its
   * earlier state, and only the revocation at once remains.
   */
  private async handoffFailed(id: number, repo: MintRepo, o: Outcome): Promise<void> {
    if (o.kind !== "token") return;
    let recorded = false;
    for (let attempt = 0; attempt < MINT_ID_WRITE_ATTEMPTS && !recorded; attempt++) {
      try {
        recorded = this.sql.transaction(() => this.oweKnown(id, o));
        if (!recorded) break; // the record is in neither state: nothing to write it to
      } catch {
        recorded = false;
      }
    }
    const answered = await within(repo.revokeToken(o.id).then(() => true), this.waitMs, false).catch(() => false);
    if (answered) {
      try {
        this.sql.transaction(() => {
          if (this.drop(id, "owed")) this.count(-1, 0);
          else if (this.drop(id, "unknown")) this.count(0, -1);
          else this.drop(id, "sent");
        });
      } catch {
        // The record stays owed, or as it was: its revocation is tried again, never settled by guesswork.
      }
      return;
    }
    await this.wake(this.now() + MINT_REVOKE_BACKOFF.firstMs).catch(() => undefined);
  }

  /** In the caller's transaction: the record, still `sent` or `unknown`, becomes the record of a known token owed revocation. False if it was in neither state. */
  private oweKnown(id: number, o: Extract<Outcome, { kind: "token" }>): boolean {
    for (const from of ["sent", "unknown"] as const) {
      if (this.move(id, from, "state = 'owed', token = ?, expires_at = ?, due = ?, backoff = NULL, last_error = ?", o.id, o.expiresAt, this.now(), "the answer could not be recorded; owed revocation by its ID")) {
        this.count(1, from === "unknown" ? -1 : 0);
        return true;
      }
    }
    return false;
  }

  private track(p: Promise<unknown>): void {
    const q = p.catch(() => undefined).finally(() => this.late.delete(q));
    this.late.add(q);
  }

  private token(id: number, repo: MintRepo, tokenId: string, plaintext: string, scope: MintScope, expiresAt: number): LedgerToken {
    return {
      id: tokenId,
      plaintext,
      scope,
      expiresAt,
      release: () => this.release(id, repo, tokenId),
      claim: () => {
        // Synchronous, so it commits or rolls back with the owner's transaction.
        if (!this.drop(id, "held")) throw new Error("the ledger no longer holds this token; it cannot be claimed");
      },
    };
  }

  /** Revoke a held token by its ID. An answer deletes the record; a refusal, a timeout or a failed completion makes it owed. */
  private async release(id: number, repo: MintRepo, tokenId: string): Promise<void> {
    // Claimed, released or taken over: no longer this caller's to revoke.
    if (this.sql.all("SELECT id FROM artroom_mint WHERE id = ? AND state = 'held'", id).length === 0) return;
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
      const owed = this.move(id, "held", "state = 'owed', due = ?, backoff = ?, last_error = ?", due, MINT_REVOKE_BACKOFF.firstMs, note);
      if (owed) this.count(1, 0);
    });
    await this.wake(due).catch(() => undefined); // the takeover wake-up, stored while it was held, covers it as well
  }

  // ---------------------------------------------------------------- the alarm

  /**
   * The alarm's work: keep or clear the takeover time, start a revocation
   * pass (not awaited), and observe if due (awaited, bounded).
   */
  async reconcile(): Promise<void> {
    this.sql.transaction(() => {
      const now = this.now();
      const s = this.summary();
      if (this.inFlight()) {
        if (s.takeover === null || s.takeover - now < TAKEOVER_MOVE_MS) {
          this.sql.all("UPDATE artroom_mint_summary SET takeover = ? WHERE k = 1", now + TAKEOVER_AHEAD_MS);
        }
      } else if (s.takeover !== null) this.sql.all("UPDATE artroom_mint_summary SET takeover = NULL WHERE k = 1");
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
   * passed, this pass only settles those, with no revocation call and no
   * wait, and ends: the others are revoked by the next pass, 1 s later
   * (`nextDue()`). So a pass makes one summary write, and settlement at
   * expiry never waits on the repository or on a revocation.
   */
  private startPass(): void {
    if (this.pass) return;
    const now = this.now();
    const batch = this.sql
      .all("SELECT id, token, expires_at, backoff FROM artroom_mint WHERE state = 'owed' AND due <= ? ORDER BY due, id LIMIT ?", now, MINT_REVOKE_BATCH)
      .map((r) => ({ id: Number(r["id"]), token: text(r, "token") ?? "", expiresAt: num(r, "expires_at"), backoff: num(r, "backoff") }));
    if (batch.length === 0) return;
    const expired = batch.filter((r) => r.expiresAt !== null && r.expiresAt <= now);
    let run: Promise<void>;
    if (expired.length > 0) {
      try {
        this.sql.transaction(() => {
          let gone = 0;
          for (const r of expired) gone += this.drop(r.id, "owed") ? 1 : 0;
          this.count(-gone, 0);
        });
        this.passUntil = now;
        run = Promise.resolve();
      } catch {
        // Not settled: a revocation pass takes the batch, and settles them at its end, or gives them their backoff.
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
   * Revoke each record by its own ID. The repository is looked up first,
   * within the bounded wait. Then, immediately before each revocation, the
   * record's readable expiry is checked again: one that passed meanwhile,
   * during the lookup or an earlier revocation, is settled with no
   * revocation call, on the failure path too. A failed or timed-out lookup
   * is a failure for every other record. Then one transaction: at most one
   * write per record and one summary write. A completion that cannot
   * commit counts as a failure.
   */
  private async revoke(batch: readonly { id: number; token: string; expiresAt: number | null; backoff: number | null }[]): Promise<void> {
    const results: { id: number; done: boolean; backoff: number | null; expiresAt: number | null; note: string }[] = [];
    let repo: MintRepo | null = null;
    let lookupNote = "";
    this.passUntil = this.now() + this.waitMs;
    try {
      repo = await this.lookup();
      if (!repo) lookupNote = "the repository was not reached in time";
    } catch (e) {
      lookupNote = errorNote("repository lookup failed", e);
    }
    for (const r of batch) {
      const x = { id: r.id, backoff: r.backoff, expiresAt: r.expiresAt };
      if (r.expiresAt !== null && r.expiresAt <= this.now()) {
        results.push({ ...x, done: true, note: "" });
        continue;
      }
      if (!repo) {
        results.push({ ...x, done: false, note: lookupNote });
        continue;
      }
      this.passUntil = this.now() + this.waitMs;
      try {
        const answered = await within(repo.revokeToken(r.token).then(() => true), this.waitMs, false);
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
        this.count(-gone, 0);
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
   * At most one observation, when due and while any record is unknown: one
   * repository lookup and one listing, which share one deadline, `waitMs`
   * from the start, so the whole observation waits at most `waitMs`; one
   * summary write. An
   * incomplete listing, or one over 1,000 records, counts nothing. No
   * record is written, and none is settled.
   */
  private async observe(): Promise<void> {
    const s = this.summary();
    if (this.observing || s.unknown === 0 || s.observeDue === null || s.observeDue > this.now()) return;
    this.observing = true;
    this.observeUntil = this.now() + this.waitMs;
    try {
      let result = "";
      let unaccounted: number | null = null;
      let repo: MintRepo | null = null;
      // One deadline for the lookup and the listing together, in real time, as the waits are.
      const deadline = Date.now() + this.waitMs;
      try {
        repo = await this.lookup();
        if (!repo) result = "no inventory: the repository was not reached in time";
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
            if (this.sql.all("SELECT id FROM artroom_mint WHERE token = ? LIMIT 1", t.id).length > 0 || this.known(t.id)) continue;
            unaccounted++;
          }
          result = `${unaccounted} live token(s) on the canonical repository not accounted for`;
        }
      }
      this.sql.transaction(() => {
        const at = this.now();
        const wait = this.summary().observeWait;
        this.sql.all(
          "UPDATE artroom_mint_summary SET observed_at = ?, observation = ?, unaccounted = ?, observe_due = ?, observe_wait = ? WHERE k = 1",
          at,
          result,
          unaccounted,
          at + wait,
          Math.min(wait * 2, OBSERVE_WAIT.maxMs),
        );
      });
    } finally {
      this.observing = false;
    }
  }

  /**
   * When the alarm should next run for this ledger, or null: the earliest of
   * the owed revocations' due time, the next observation (while any record
   * is unknown) and the takeover time (while any record is sent or held).
   * A time not yet passed is returned as it is. A time already passed
   * (overdue work) counts as now plus 1 s, never sooner, and never later
   * than a still-future time. While a pass or an observation waits on an
   * answer, its work is not eligible before that attempt's timeout.
   */
  nextDue(): number | null {
    const now = this.now();
    const s = this.summary();
    const times: number[] = [];
    const owed = num(this.sql.all("SELECT MIN(due) AS t FROM artroom_mint WHERE state = 'owed'")[0], "t");
    if (owed !== null) times.push(this.pass ? Math.max(owed, this.passUntil) : owed);
    if (s.unknown > 0 && s.observeDue !== null) times.push(this.observing ? Math.max(s.observeDue, this.observeUntil) : s.observeDue);
    if (s.takeover !== null && this.inFlight()) times.push(s.takeover);
    if (times.length === 0) return null;
    return Math.min(...times.map((t) => (t <= now ? now + OVERDUE_STEP_MS : t)));
  }

  /** One page of records by row ID, with the counts. Every record is reachable by paging; none is ever evicted. */
  duties(opts: { readonly after?: number; readonly limit?: number } = {}): MintDuties {
    const limit = Math.min(Math.max(Math.floor(opts.limit ?? 100), 1), PAGE_MAX);
    const rows = this.sql.all(
      "SELECT id, purpose, scope, state, ttl, not_after, sent_at, token, expires_at, due, last_error FROM artroom_mint WHERE id > ? ORDER BY id LIMIT ?",
      opts.after ?? 0,
      limit + 1,
    );
    const page = rows.slice(0, limit);
    const s = this.summary();
    return {
      records: page.map((r) => ({
        id: Number(r["id"]),
        purpose: text(r, "purpose") ?? "",
        scope: text(r, "scope") as MintScope,
        state: text(r, "state") as MintState,
        ttlSeconds: num(r, "ttl"),
        notAfter: num(r, "not_after"),
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
      observation: { at: s.observedAt, result: s.observation, unaccounted: s.unaccounted, nextAt: s.unknown > 0 ? s.observeDue : null },
    };
  }
}

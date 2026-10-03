/**
 * The Room's SQLite schema and low-level accessors. Every function here is
 * synchronous, so admission can read and write in one transaction with no
 * `await` between deciding and recording (R-ADM-6, R-ADM-10).
 *
 * Secrets never enter a public table: room-held private keys live in
 * `held_keys`, and bearer, session and workspace tokens are stored only as
 * hashes or IDs (R-WS-4, R-SEC-5).
 */

import type { Digest, Seq } from "@generalbusiness/artroom-contract";
import type { Sql, SqlRow, SqlValue } from "./ports.ts";
import { SCRUB_TABLES, isSafeErrorText, knownArtifactsCode, safeErrorText, type ScrubCursor, type ScrubTable } from "@generalbusiness/artroom-git";

/**
 * Version 1: the base schema. The spike deployment's earlier versions (2 to
 * 8) were folded into it when its state was wiped (decision D5, request
 * 73eccbec). A new table, column or index is a migration after it.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  // The log (R-LOG-1): one canonical LogEntry per row.
  `CREATE TABLE IF NOT EXISTS entries (seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, hash TEXT NOT NULL,
     type TEXT NOT NULL, kind TEXT NOT NULL, lane TEXT, by_member TEXT, at TEXT NOT NULL, body TEXT NOT NULL)`,
  // Projections that are not entry content: invariants checked, for explain().
  `CREATE TABLE IF NOT EXISTS explain (seq INTEGER PRIMARY KEY, invariants TEXT NOT NULL)`,
  // The record each act returned when admitted, for reads and idempotent replay.
  `CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL)`,
  // R-IDEM: one row per (actor, key), for accepted acts and recorded refusals only.
  `CREATE TABLE IF NOT EXISTS idem (actor TEXT NOT NULL, ikey TEXT NOT NULL, digest TEXT NOT NULL, seq INTEGER NOT NULL,
     result TEXT NOT NULL, PRIMARY KEY (actor, ikey))`,
  // R-LOG-7: retained policy inputs, policy documents and checker configurations, by digest.
  `CREATE TABLE IF NOT EXISTS retained (digest TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL)`,
  // The roster.
  `CREATE TABLE IF NOT EXISTS members (handle TEXT PRIMARY KEY, role TEXT NOT NULL, state TEXT NOT NULL, joined INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS keys (key TEXT PRIMARY KEY, member TEXT NOT NULL, custody TEXT NOT NULL, added INTEGER NOT NULL,
     state TEXT NOT NULL, reason TEXT, revoked_at INTEGER, revoked_by TEXT)`,
  // Keys revoked but never bound to a member (R-ADM-3c: "has never been revoked").
  `CREATE TABLE IF NOT EXISTS revoked_keys (key TEXT PRIMARY KEY, reason TEXT NOT NULL, revoked_at INTEGER NOT NULL, revoked_by TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS teams (team TEXT PRIMARY KEY, members TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS delegations (id TEXT PRIMARY KEY, grantor TEXT NOT NULL, grantee TEXT NOT NULL, kinds TEXT NOT NULL,
     lanes TEXT NOT NULL, expires_at TEXT NOT NULL, expires_ms INTEGER NOT NULL, revoked INTEGER)`,
  `CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, member TEXT NOT NULL, role TEXT, custody TEXT NOT NULL,
     expires_at TEXT NOT NULL, expires_ms INTEGER NOT NULL, secret_hash TEXT NOT NULL, session TEXT, used INTEGER)`,
  // Room-held private keys: room-custody member keys and bearer session keys (R-CRED-3). Never read out.
  `CREATE TABLE IF NOT EXISTS held_keys (key TEXT PRIMARY KEY, seed TEXT NOT NULL, purpose TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS bearers (hash TEXT PRIMARY KEY, member TEXT NOT NULL, key TEXT NOT NULL, delegation TEXT NOT NULL, expires_ms INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, member TEXT NOT NULL, key TEXT NOT NULL, delegation TEXT, expires_ms INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS nonces (key TEXT NOT NULL, nonce TEXT NOT NULL, expires_ms INTEGER NOT NULL, PRIMARY KEY (key, nonce))`,
  // Lanes and generations.
  `CREATE TABLE IF NOT EXISTS lanes (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, purpose TEXT NOT NULL, goal TEXT NOT NULL, plan TEXT,
     scope TEXT NOT NULL, generation INTEGER NOT NULL, lease_gen INTEGER NOT NULL, holder TEXT, expires_ms INTEGER,
     state TEXT NOT NULL, why TEXT, handover TEXT, revert_of TEXT)`,
  `CREATE TABLE IF NOT EXISTS generations (lane TEXT NOT NULL, generation INTEGER NOT NULL, act TEXT NOT NULL, seq INTEGER NOT NULL,
     head TEXT NOT NULL, base TEXT NOT NULL, summary TEXT NOT NULL, proposer TEXT NOT NULL, changed TEXT NOT NULL,
     obligations TEXT NOT NULL, carried TEXT NOT NULL, not_carried TEXT NOT NULL, policy TEXT NOT NULL, landed TEXT,
     blocked TEXT, recompute TEXT, PRIMARY KEY (lane, generation))`,
  // Obligation recomputations after a policy activation, by policy version.
  `CREATE TABLE IF NOT EXISTS recomputations (version TEXT NOT NULL, lane TEXT NOT NULL, generation INTEGER NOT NULL, body TEXT NOT NULL,
     PRIMARY KEY (version, lane, generation))`,
  // Reviews and checks, with the authority recorded at admission (R-REV-1).
  `CREATE TABLE IF NOT EXISTS evidence (act TEXT PRIMARY KEY, seq INTEGER NOT NULL, kind TEXT NOT NULL, lane TEXT NOT NULL,
     generation INTEGER NOT NULL, head TEXT NOT NULL, member TEXT NOT NULL, key TEXT NOT NULL, grantor TEXT,
     verdict TEXT, qualifies TEXT NOT NULL, flags TEXT NOT NULL, body TEXT NOT NULL)`,
  // Operations that are not landing operations.
  `CREATE TABLE IF NOT EXISTS previews (id TEXT PRIMARY KEY, lane TEXT NOT NULL, generation INTEGER NOT NULL, head TEXT NOT NULL,
     state TEXT NOT NULL, body TEXT NOT NULL, main TEXT, updated_ms INTEGER NOT NULL)`,
  // The leases whose workspace the Room opened in lane B's `Workspaces`; `ended` once their access is revoked.
  `CREATE TABLE IF NOT EXISTS ws_leases (lane TEXT NOT NULL, lease_gen INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY (lane, lease_gen))`,
  `CREATE TABLE IF NOT EXISTS pins (ref TEXT PRIMARY KEY, head TEXT NOT NULL, done INTEGER NOT NULL)`,
  // Policy versions (R-POL-9), and `.artroom/` configuration read from integrations.
  `CREATE TABLE IF NOT EXISTS policies (version TEXT PRIMARY KEY, seq INTEGER NOT NULL, digest TEXT NOT NULL, doc TEXT NOT NULL, checkers TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS configs (commit_sha TEXT PRIMARY KEY, body TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS land_evals (op TEXT NOT NULL, digest TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (op, digest))`,
  // Landing evaluations the Room has asked for (after a check or a recomputation), run by the alarm's landing step.
  `CREATE TABLE IF NOT EXISTS land_reeval (op TEXT PRIMARY KEY)`,
  // Checks carried onto a landing's integration (R-CARRY-6 to 10): the earlier check, and why it carries. A carry
  // counts only under the policy version that judged it (R-POL-9), and only with its sealed `check-carried` event
  // (R-CARRY-13).
  `CREATE TABLE IF NOT EXISTS check_carries (lane TEXT NOT NULL, generation INTEGER NOT NULL, integration TEXT NOT NULL, obligation TEXT NOT NULL,
     act TEXT NOT NULL, evidence TEXT NOT NULL, policy TEXT, event TEXT, PRIMARY KEY (lane, generation, integration, obligation))`,
  // Every check carry judgment, carried or not, by the event that sealed it: one per earlier check, obligation,
  // integration and policy version.
  `CREATE TABLE IF NOT EXISTS check_judged (lane TEXT NOT NULL, generation INTEGER NOT NULL, integration TEXT NOT NULL, obligation TEXT NOT NULL,
     act TEXT NOT NULL, policy TEXT NOT NULL, event TEXT NOT NULL, PRIMARY KEY (lane, generation, integration, obligation, act, policy))`,
  // A scoped checker's snapshot commit for an integration, as the Room derived it when it asked for the check (R-CARRY-9).
  `CREATE TABLE IF NOT EXISTS check_snapshots (integration TEXT NOT NULL, checker TEXT NOT NULL, config TEXT NOT NULL, paths TEXT NOT NULL,
     digest TEXT NOT NULL, commit_sha TEXT NOT NULL, PRIMARY KEY (integration, checker, config))`,
  // Check jobs (R-EXEC-8): one logical job per owner (a preview or a landing operation), canonical integration,
  // obligation and configuration. `owed` is due at next_ms. `sent` is attempt `attempt`, in flight until next_ms,
  // its deadline, with its token `token`; after that it is due again. `done` keeps its outcome. Every change is
  // made only for the attempt it read, so a late answer never overwrites a newer attempt.
  `CREATE TABLE IF NOT EXISTS check_jobs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, lane TEXT NOT NULL, generation INTEGER NOT NULL,
     obligation TEXT NOT NULL, checker TEXT NOT NULL, config TEXT NOT NULL, integration TEXT NOT NULL, base TEXT NOT NULL,
     state TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, next_ms INTEGER NOT NULL, token TEXT, outcome TEXT,
     UNIQUE (owner, integration, obligation, config))`,
  // Canonical read tokens of job attempts, claimed from the mint ledger (R-MINT-4): held by an attempt until it
  // ends, then retried until revocation, or until the token's known expiry has passed (R-EXEC-9). A token whose
  // expiry is not known is retried until it is revoked. A row `mint:<job>` is a stored room's mint record from
  // before mint lane C; it moves into the mint ledger once, at the object's start (`moveJobMints`).
  `CREATE TABLE IF NOT EXISTS job_tokens (token_id TEXT PRIMARY KEY, expires_at INTEGER, next_ms INTEGER NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT)`,
  // R-LOG-13: notify runs after commit, from this durable queue.
  `CREATE TABLE IF NOT EXISTS notify_queue (seq INTEGER PRIMARY KEY, entry TEXT NOT NULL, policy TEXT NOT NULL, context TEXT NOT NULL,
     attempts INTEGER NOT NULL, next_ms INTEGER NOT NULL, last_error TEXT)`,
  // Attention items. n: an item's order within its entry, from its ID `att_<seq>_<n>`. pos: one position per item,
  // increasing in the order items were made, so an item made later is never behind a cursor already issued (R-API-8).
  `CREATE TABLE IF NOT EXISTS attention (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, n INTEGER NOT NULL, pos INTEGER NOT NULL,
     principal TEXT NOT NULL, lane TEXT, item TEXT NOT NULL, open INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS attention_pos ON attention (pos)`,
  `CREATE INDEX IF NOT EXISTS attention_principal_pos ON attention (principal, pos)`,
  `CREATE INDEX IF NOT EXISTS evidence_lane ON evidence (lane, generation)`,
  `CREATE INDEX IF NOT EXISTS keys_member ON keys (member)`,
  `CREATE INDEX IF NOT EXISTS check_snapshots_commit ON check_snapshots (commit_sha)`,
];

/** One schema step: idempotent, so a step that ran without recording its version runs again harmlessly. */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly up: (sql: Sql) => void;
}

/**
 * Bring a store to the latest version. Each step runs in its own transaction
 * with the version it records, so a crash leaves a store at a whole version.
 * Every opening of the store calls it; a store already current does nothing.
 */
export function migrate(sql: Sql, steps: readonly Migration[]): number {
  sql.all("CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), v INTEGER NOT NULL)");
  let v = num(one(sql, "SELECT v FROM schema_version WHERE id = 1"), "v") ?? 0;
  for (const step of steps) {
    if (step.version <= v) continue;
    sql.transaction(() => {
      step.up(sql);
      sql.all("INSERT INTO schema_version (id, v) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET v = excluded.v", step.version);
    });
    v = step.version;
  }
  return v;
}

/** The Room's migrations. A new table, column or index is added only here, as a version after the base. */
/**
 * The due indexes (mint lane C, R-MINT-7): bounded batches of due work,
 * earliest due first, read by index. Job tokens owed revocation, and jobs
 * not done (a partial index, which the due queries' `state != 'done'` uses).
 * Idempotent, and they change no row.
 */
export const DUE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS job_tokens_due ON job_tokens (next_ms, token_id)`,
  `CREATE INDEX IF NOT EXISTS check_jobs_due ON check_jobs (next_ms) WHERE state != 'done'`,
] as const;

/**
 * The columns of version 4 (declared acts stage 2, request fd6f00b6): a
 * thread's kind, the binding of the act that opened it, and the lease length
 * and the conflict mode recorded when it opened (R-DECL-6, R-DECL-9); a delegation's signed grant
 * map, and whether an invitation was admitted under a `v2` document
 * (R-DECL-17). Null where the legacy vocabulary leaves them unset.
 */
export const DECLARED_COLUMNS: readonly (readonly [table: string, column: string, type: string])[] = [
  ["lanes", "kind", "TEXT"],
  ["lanes", "binding", "TEXT"],
  ["lanes", "lease_ms", "INTEGER"],
  ["lanes", "conflict", "TEXT"],
  ["delegations", "acts", "TEXT"],
  ["invitations", "declared", "INTEGER"],
];

const hasColumn = (sql: Sql, table: string, column: string): boolean => one(sql, "SELECT 1 AS x FROM pragma_table_info(?) WHERE name = ?", table, column) !== undefined;

/**
 * Version 4: the declared-acts columns, each added only if absent, so the
 * step is idempotent. Every stored lane gets its kind: `room` for a revert
 * lane the room opened (R-REV-6), `claim` for every other, which a `claim`
 * opened (a configuration-recovery lane included). The binding and lease
 * length stay null: those lanes were opened under the legacy vocabulary and
 * keep the room's current lease (R-DECL-9). It updates existing rows in
 * place and adds none.
 */
function declaredColumns(sql: Sql): void {
  for (const [table, column, type] of DECLARED_COLUMNS) if (!hasColumn(sql, table, column)) sql.all(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`); // G2:migration-add
  sql.all("UPDATE lanes SET kind = CASE WHEN revert_of IS NOT NULL THEN 'room' ELSE 'claim' END WHERE kind IS NULL"); // G2:migration-backfill
}

/**
 * The Room's schema steps, run once each, in order, by `migrate`. Version 3
 * (mint lane C) was written as version 2 alongside request d29c09fa's scrub,
 * and renumbered when that landed first: a version-1 room gets both, a
 * version-2 room the indexes only. Version 4 is declared acts stage 2's.
 */
export const ROOM_MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "base", up: (sql) => SCHEMA.forEach((q) => sql.all(q)) },
  { version: 2, name: "safe error metadata at rest (request d29c09fa)", up: scrubErrors },
  { version: 3, name: "due indexes (mint lane C, request 5ff58c9a)", up: (sql) => DUE_INDEXES.forEach((q) => sql.all(q)) },
  { version: 4, name: "thread kind, binding and lease; grant maps (declared acts stage 2, request fd6f00b6)", up: declaredColumns },
];

/** Codes a failed publication may store as `publication_error` and name to the caller: lane L's and the Room's own. */
export const PUBLICATION_CODES: ReadonlySet<string> = new Set([
  "would-rewrite",
  "invalid-input",
  "unexpected-writer",
  "unresolved",
  "cohort-too-large",
  "object-too-large",
  "refused",
  "unknown-version",
  "cohort-mismatch",
]);

/** A job token's `last_error` as it may be kept or shown: safe metadata, or a fixed phrase withholding the rest. */
export function safeJobStatus(text: string | null): string | null {
  if (text === null || isSafeErrorText(text)) return text;
  if (text.startsWith("answer lost: ")) return `answer lost: ${safeErrorText(text.slice("answer lost: ".length), "create failed")}`;
  if (text.startsWith("outcome unknown; ")) return `outcome unknown; ${safeErrorText(text.slice("outcome unknown; ".length), "the token inventory could not be read")}`;
  return safeErrorText(text, "revocation failed");
}

/** The Room's tables the upgrade makes safe: the Git package's, then the job tokens (their state words, `held` and the rest, are safe and stay). */
export const ROOM_SCRUB_TABLES: readonly ScrubTable[] = [
  ...SCRUB_TABLES,
  {
    table: "job_tokens",
    key: "token_id",
    columns: ["last_error"],
    fix: (r) => {
      const was = str(r, "last_error");
      const now = safeJobStatus(was);
      return now !== was ? { last_error: now } : null;
    },
  },
];

/**
 * Version 2 (request d29c09fa): error fields stored before the safe-metadata
 * rule are upgraded. This step only starts it, in O(1): it stores the
 * upgrade's cursor (`error_scrub`) when a table that could hold such a field
 * has rows, and makes an unknown publication code `transport`. The alarm then
 * runs one bounded batch at a time (`RoomCore.scrubErrors`, `SCRUB_BATCH`
 * rows) and deletes the cursor when every table is done; nothing runs after
 * that. Signed history (entries, records, acts) is never rewritten.
 */
function scrubErrors(sql: Sql): void {
  const held = (t: string) => one(sql, "SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", t) !== undefined && one(sql, `SELECT 1 AS x FROM ${t} LIMIT 1`) !== undefined;
  if (ROOM_SCRUB_TABLES.some((t) => held(t.table))) setMeta(sql, "error_scrub", JSON.stringify({ table: 0, after: null } satisfies ScrubCursor));
  const code = getMeta(sql, "publication_error");
  if (code !== null && code !== "transport" && !PUBLICATION_CODES.has(code) && knownArtifactsCode({ code }) === null) setMeta(sql, "publication_error", "transport");
}

export function createSchema(sql: Sql): void {
  migrate(sql, ROOM_MIGRATIONS);
}

export function one(sql: Sql, query: string, ...b: SqlValue[]): SqlRow | undefined {
  return sql.all(query, ...b)[0];
}

export function str(row: SqlRow | undefined, col: string): string | null {
  const v = row?.[col];
  return typeof v === "string" ? v : null;
}

export function num(row: SqlRow | undefined, col: string): number | null {
  const v = row?.[col];
  return typeof v === "number" ? v : null;
}

export function json<T>(row: SqlRow | undefined, col: string): T | null {
  const v = str(row, col);
  return v === null ? null : (JSON.parse(v) as T);
}

export function getMeta(sql: Sql, k: string): string | null {
  return str(one(sql, "SELECT v FROM meta WHERE k = ?", k), "v");
}

export function setMeta(sql: Sql, k: string, v: string): void {
  sql.all("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", k, v);
}

/** The last sealed entry, or null before genesis. */
export function head(sql: Sql): { readonly seq: Seq; readonly hash: Digest } | null {
  const r = one(sql, "SELECT seq, hash FROM entries ORDER BY seq DESC LIMIT 1");
  return r ? { seq: num(r, "seq")!, hash: str(r, "hash") as Digest } : null;
}

export function headSeq(sql: Sql): Seq {
  return head(sql)?.seq ?? -1;
}

/** Keep a canonical JSON value under its digest (R-LOG-7). */
export function retain(sql: Sql, digest: Digest, kind: "input" | "policy" | "checker", canonical: string): void {
  sql.all("INSERT INTO retained (digest, kind, body) VALUES (?, ?, ?) ON CONFLICT (digest) DO NOTHING", digest, kind, canonical);
}

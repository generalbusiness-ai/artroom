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
import type { Role } from "@generalbusiness/artroom-contract";
import type { Sql, SqlRow, SqlValue } from "./ports.ts";
import { delegableBy } from "./roster.ts";

/** Version 1: the schema as first released. Later versions are migrations below. */
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
  // Reviews and checks, with the authority recorded at admission (R-REV-1).
  `CREATE TABLE IF NOT EXISTS evidence (act TEXT PRIMARY KEY, seq INTEGER NOT NULL, kind TEXT NOT NULL, lane TEXT NOT NULL,
     generation INTEGER NOT NULL, head TEXT NOT NULL, member TEXT NOT NULL, key TEXT NOT NULL, grantor TEXT,
     verdict TEXT, qualifies TEXT NOT NULL, flags TEXT NOT NULL, body TEXT NOT NULL)`,
  // Operations that are not landing operations.
  `CREATE TABLE IF NOT EXISTS previews (id TEXT PRIMARY KEY, lane TEXT NOT NULL, generation INTEGER NOT NULL, head TEXT NOT NULL,
     state TEXT NOT NULL, body TEXT NOT NULL, main TEXT, updated_ms INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, lane TEXT NOT NULL, lease_gen INTEGER NOT NULL, state TEXT NOT NULL,
     body TEXT NOT NULL, updated_ms INTEGER NOT NULL)`,
  // Workspace tokens by ID only; the token text is never stored (R-WS-4).
  `CREATE TABLE IF NOT EXISTS fork_tokens (id TEXT PRIMARY KEY, lane TEXT NOT NULL, lease_gen INTEGER NOT NULL, revoked INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pins (ref TEXT PRIMARY KEY, head TEXT NOT NULL, done INTEGER NOT NULL)`,
  // Policy versions (R-POL-9), and `.artroom/` configuration read from integrations.
  `CREATE TABLE IF NOT EXISTS policies (version TEXT PRIMARY KEY, seq INTEGER NOT NULL, digest TEXT NOT NULL, doc TEXT NOT NULL, checkers TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS configs (commit_sha TEXT PRIMARY KEY, body TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS land_evals (op TEXT NOT NULL, digest TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (op, digest))`,
  // R-LOG-13: notify runs after commit, from this durable queue.
  `CREATE TABLE IF NOT EXISTS notify_queue (seq INTEGER PRIMARY KEY, entry TEXT NOT NULL, policy TEXT NOT NULL, context TEXT NOT NULL,
     attempts INTEGER NOT NULL, next_ms INTEGER NOT NULL, last_error TEXT)`,
  `CREATE TABLE IF NOT EXISTS attention (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, principal TEXT NOT NULL, lane TEXT,
     item TEXT NOT NULL, open INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS attention_principal ON attention (principal, seq)`,
  `CREATE INDEX IF NOT EXISTS evidence_lane ON evidence (lane, generation)`,
  `CREATE INDEX IF NOT EXISTS keys_member ON keys (member)`,
];

function columns(sql: Sql, table: string): Set<string> {
  return new Set(sql.all("SELECT name FROM pragma_table_info(?)", table).map((r) => r["name"] as string));
}

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

/** The Room's migrations. A new table, column or index is added only here. */
export const ROOM_MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "base", up: (sql) => SCHEMA.forEach((q) => sql.all(q)) },
  {
    version: 2,
    name: "review aabda1ed: workspace attempts, recomputations",
    up: (sql) => {
      if (!columns(sql, "workspaces").has("attempts")) sql.all("ALTER TABLE workspaces ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0");
      sql.all(`CREATE TABLE IF NOT EXISTS recomputations (version TEXT NOT NULL, lane TEXT NOT NULL, generation INTEGER NOT NULL, body TEXT NOT NULL,
        PRIMARY KEY (version, lane, generation))`);
    },
  },
  {
    version: 3,
    name: "review 8faa2ef9: monotonic attention positions",
    up: (sql) => {
      const cols = columns(sql, "attention");
      // n: an item's order within its entry, from its ID `att_<seq>_<n>`.
      if (!cols.has("n")) {
        sql.all("ALTER TABLE attention ADD COLUMN n INTEGER NOT NULL DEFAULT 0");
        sql.all("UPDATE attention SET n = CAST(substr(id, instr(substr(id, 5), '_') + 5) AS INTEGER)");
      }
      // pos: one position per item, increasing in the order items were made, so an item made later
      // is never behind a cursor already issued. Existing items keep their (seq, n) order.
      if (!cols.has("pos")) {
        sql.all("ALTER TABLE attention ADD COLUMN pos INTEGER");
        sql.all("UPDATE attention SET pos = (SELECT COUNT(*) FROM attention b WHERE b.seq < attention.seq OR (b.seq = attention.seq AND b.n <= attention.n))");
      }
      sql.all("CREATE UNIQUE INDEX IF NOT EXISTS attention_pos ON attention (pos)");
      sql.all("CREATE INDEX IF NOT EXISTS attention_principal_pos ON attention (principal, pos)");
    },
  },
  {
    version: 4,
    name: "review 8faa2ef9: admission facts for earlier evidence",
    up: (sql) => {
      // Evidence admitted before these facts were recorded gets them conservatively: an author if the
      // member proposed that generation or ever claimed the lane before the evidence; no teams. Both
      // can only take eligibility away, never give it (R-REV-1, R-OBL-2).
      for (const r of sql.all("SELECT act, seq, lane, generation, member, body FROM evidence")) {
        const body = JSON.parse(r["body"] as string) as { admission?: unknown };
        if (body.admission) continue;
        const proposer = str(one(sql, "SELECT proposer FROM generations WHERE lane = ? AND generation = ?", r["lane"] as string, r["generation"] as number), "proposer");
        const claimed = sql
          .all("SELECT body FROM entries WHERE seq < ? AND (id = ? OR lane = ?) AND type = 'act' AND kind = 'claim'", r["seq"] as number, r["lane"] as string, r["lane"] as string)
          .some((e) => (JSON.parse(e["body"] as string) as { entry: { receipt?: { authority: { member: string | null } } } }).entry.receipt?.authority.member === r["member"]);
        const admission = { teams: [], author: proposer === r["member"] || claimed };
        sql.all("UPDATE evidence SET body = ? WHERE act = ?", JSON.stringify({ ...body, admission }), r["act"] as string);
      }
    },
  },
  {
    version: 5,
    name: "review 8faa2ef9: '*' delegations fixed at the grant",
    up: (sql) => {
      // A "*" grant covers the kinds the grantor's role could sign when it was granted: the role
      // recorded in the grant's own receipt (R-ADM-5, R-LOG-10).
      for (const r of sql.all("SELECT id FROM delegations WHERE kinds = '\"*\"'")) {
        const entry = one(sql, "SELECT body FROM entries WHERE id = ?", r["id"] as string);
        const role = entry ? (JSON.parse(str(entry, "body")!) as { entry: { receipt?: { authority: { role: Role | null } } } }).entry.receipt?.authority.role : null;
        sql.all("UPDATE delegations SET kinds = ? WHERE id = ?", JSON.stringify(role ? delegableBy(role) : []), r["id"] as string);
      }
    },
  },
  {
    version: 6,
    name: "phase 2b: lane B workspaces and evaluations",
    up: (sql) => {
      // The leases whose workspace the Room opened in lane B's `Workspaces`; `ended` once their access is revoked.
      sql.all("CREATE TABLE IF NOT EXISTS ws_leases (lane TEXT NOT NULL, lease_gen INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY (lane, lease_gen))");
      // Workspaces opened by the previous revision become lane B workspaces when their holder opens them again;
      // their recorded tokens are swept by lane B's first inventory of the fork.
      sql.all("INSERT OR IGNORE INTO ws_leases (lane, lease_gen, state) SELECT lane, lease_gen, 'ended' FROM workspaces");
      // Landing evaluations the Room has asked for (after a check or a recomputation), run by the alarm's landing step.
      sql.all("CREATE TABLE IF NOT EXISTS land_reeval (op TEXT PRIMARY KEY)");
      // Checks carried onto a landing's integration (R-CARRY-6 to 10): the earlier check, and why it carries.
      sql.all(`CREATE TABLE IF NOT EXISTS check_carries (lane TEXT NOT NULL, generation INTEGER NOT NULL, integration TEXT NOT NULL, obligation TEXT NOT NULL,
        act TEXT NOT NULL, evidence TEXT NOT NULL, PRIMARY KEY (lane, generation, integration, obligation))`);
    },
  },
  {
    version: 7,
    name: "review a711f7b6: earlier workspace access into lane B's cleanup; carries bound to a policy",
    up: (sql) => {
      // Access opened before lane B's workspaces: the lease is `legacy` until its end imports the cleanup it is owed
      // (each recorded token, and an inventory of the fork for any mint whose answer was never recorded) into lane B's
      // durable duties. Version 6 marked these `ended` without any cleanup; that is undone here.
      // `token` '' stands for "an inventory of the fork is owed".
      sql.all("CREATE TABLE IF NOT EXISTS ws_legacy (lane TEXT NOT NULL, lease_gen INTEGER NOT NULL, token TEXT NOT NULL, PRIMARY KEY (lane, lease_gen, token))");
      sql.all("UPDATE ws_leases SET state = 'legacy' WHERE state = 'ended' AND EXISTS (SELECT 1 FROM workspaces w WHERE w.lane = ws_leases.lane AND w.lease_gen = ws_leases.lease_gen)");
      sql.all("INSERT OR IGNORE INTO ws_leases (lane, lease_gen, state) SELECT lane, lease_gen, 'legacy' FROM workspaces");
      sql.all("INSERT OR IGNORE INTO ws_legacy (lane, lease_gen, token) SELECT lane, lease_gen, '' FROM workspaces");
      sql.all("INSERT OR IGNORE INTO ws_legacy (lane, lease_gen, token) SELECT lane, lease_gen, id FROM fork_tokens WHERE revoked = 0");
      sql.all("INSERT OR IGNORE INTO ws_leases (lane, lease_gen, state) SELECT lane, lease_gen, 'legacy' FROM fork_tokens WHERE revoked = 0");
      // A carried check counts only under the policy version that judged it (R-POL-9). Earlier rows have none, and never count.
      const cols = new Set(sql.all("SELECT name FROM pragma_table_info('check_carries')").map((r) => r["name"] as string));
      if (!cols.has("policy")) sql.all("ALTER TABLE check_carries ADD COLUMN policy TEXT");
      // A scoped checker's snapshot commit for an integration, as the Room derived it when it asked for the check (R-CARRY-9).
      sql.all(`CREATE TABLE IF NOT EXISTS check_snapshots (integration TEXT NOT NULL, checker TEXT NOT NULL, config TEXT NOT NULL, paths TEXT NOT NULL,
        digest TEXT NOT NULL, commit_sha TEXT NOT NULL, PRIMARY KEY (integration, checker, config))`);
      sql.all("CREATE INDEX IF NOT EXISTS check_snapshots_commit ON check_snapshots (commit_sha)");
    },
  },
];

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

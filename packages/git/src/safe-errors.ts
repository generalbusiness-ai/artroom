/**
 * The one validator for stored and shown error text (request d29c09fa).
 *
 * Every durable or projected error field keeps safe metadata only: lane A's
 * `errorNote`, a push's `outcomeNote`, or a fixed phrase the Room writes
 * itself. `isSafeErrorText` accepts exactly that language and nothing else,
 * so a value written before the rule (provider text, even redacted) never
 * passes. `safeErrorText` is what a projection shows and what the one-time
 * upgrade (`scrubBatch`) stores: the value if it is safe, otherwise a fixed
 * phrase, `<stage>: legacy error withheld`.
 *
 * The language has no free-text production: every part is a fixed phrase, a
 * name or code from a fixed list, a bounded integer or a timestamp. So a
 * value it accepts cannot hold provider text, whatever wrote it; any other
 * value is replaced whole, never cleaned.
 */

import type { Sql, SqlRow, SqlValue } from "./sql.ts";
import { ERROR_STAGES, type ErrorStage, SAFE_CODES, SAFE_NAMES } from "./mints.ts";
import { ARTIFACTS_REFUSALS } from "./publisher/push-outcome.ts";

/** What replaces an error's details that cannot be shown or kept. */
export const WITHHELD = "legacy error withheld";

const alt = (xs: Iterable<string>) => [...xs].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const STAGE = `(?:${alt(ERROR_STAGES)})`;
const NAME = `(?:${alt(SAFE_NAMES)}|an error of another kind|not an error)`;
/** `errorNote`'s output, or the withheld phrase. */
const NOTE = `${STAGE}: (?:${NAME}(?: (?:${alt(SAFE_CODES)}))?(?: \\(\\d{1,5}\\))?(?: status [1-5]\\d\\d)?|${alt([WITHHELD])})`;
/** `outcomeNote`'s output. */
const OUTCOME = `push answered: (?:landed|error|unknown|rejected \\((?:lease|non-fast-forward|remote-rejected)\\)(?: (?:${alt(ARTIFACTS_REFUSALS)}))?)`;
const ISO = "\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z";
const SAFE = new RegExp(
  "^(?:" +
    [
      NOTE,
      OUTCOME,
      // The landing engine's own (lane B).
      `token not minted \\(${NOTE}\\)`,
      "abort attempt before the push started",
      // The Room's job tokens (`jobs.ts`).
      `answer lost: ${NOTE}`,
      `outcome unknown; ${NOTE}`,
      `outcome unknown; \\d{1,9} live token\\(s\\) on the canonical repository not accounted for at ${ISO}`,
      "outcome unknown; the canonical repository's token inventory is incomplete or malformed",
      "ended|held|minting|refused|malformed answer",
      // Workspaces' own failures (`CleanupOwed`, `NotOurFork`).
      "\\d{1,9} token cleanup step\\(s\\) on the fork are still owed; trying again later",
      "A repository at the lane's fork name is not a fork of the room's repository\\. It was not used or changed\\.",
    ].join("|") +
    ")$",
);

/** True only for text in the safe-metadata language. */
export function isSafeErrorText(text: unknown): boolean {
  return typeof text === "string" && SAFE.test(text);
}

/**
 * `text` if it is safe (or absent), else `<stage>: legacy error withheld`,
 * where the stage is the one `text` starts with, if any, or `fallback`.
 */
export function safeErrorText<T extends string | null | undefined>(text: T, fallback: ErrorStage): T | string {
  if (text === null || text === undefined || isSafeErrorText(text)) return text;
  const stage = ERROR_STAGES.find((s) => (text as string).startsWith(`${s}: `)) ?? fallback;
  return `${stage}: ${WITHHELD}`;
}

const tableExists = (sql: Sql, name: string) => sql.all("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", name).length > 0;

/** A table whose error fields the upgrade makes safe: its key, the columns it reads, and the change for one row (null: none). */
export interface ScrubTable {
  readonly table: string;
  readonly key: string;
  readonly columns: readonly string[];
  readonly fix: (row: SqlRow) => Readonly<Record<string, SqlValue>> | null;
}

/** Where the upgrade is: the index of its table in the list, and the last key done there. */
export interface ScrubCursor {
  readonly table: number;
  readonly after: SqlValue;
}

/** The most rows one upgrade batch reads, and so writes. */
export const SCRUB_BATCH = 500;

const unsafe = (v: SqlValue | undefined): v is string => typeof v === "string" && !isSafeErrorText(v);

/**
 * This package's mutable error fields (request d29c09fa), in every row,
 * terminal and completed ones too: the landing records' `lastError` and push
 * attempts' `detail` (the record's JSON body; ownership, tokens, outcomes and
 * timing are left as they are), workspaces' `error` (revoked rows keep it),
 * and workspace and snapshot steps' `last_error`. Safe values stay.
 */
export const SCRUB_TABLES: readonly ScrubTable[] = [
  {
    table: "artroom_land_op",
    key: "id",
    columns: ["body"],
    fix: (r) => {
      const body = JSON.parse(String(r["body"])) as { lastError?: string; pushes?: { detail?: string | null }[] };
      let changed = false;
      if (unsafe(body.lastError)) {
        body.lastError = safeErrorText(body.lastError, "landing step failed");
        changed = true;
      }
      for (const p of body.pushes ?? []) {
        if (unsafe(p.detail ?? undefined)) {
          p.detail = safeErrorText(p.detail as string, "landing step failed");
          changed = true;
        }
      }
      return changed ? { body: JSON.stringify(body) } : null;
    },
  },
  {
    table: "artroom_ws",
    key: "lane",
    columns: ["error"],
    fix: (r) => {
      if (typeof r["error"] !== "string") return null;
      const error = JSON.parse(r["error"]) as { message?: unknown };
      if (isSafeErrorText(error.message)) return null;
      error.message = safeErrorText(typeof error.message === "string" ? error.message : "", "could not provision the workspace");
      return { error: JSON.stringify(error) };
    },
  },
  { table: "artroom_ws_duty", key: "id", columns: ["last_error"], fix: (r) => (unsafe(r["last_error"]) ? { last_error: safeErrorText(r["last_error"], "workspace step failed") } : null) },
  { table: "artroom_snap_duty", key: "id", columns: ["last_error"], fix: (r) => (unsafe(r["last_error"]) ? { last_error: safeErrorText(r["last_error"], "snapshot step failed") } : null) },
];

/**
 * One bounded upgrade batch: at most `limit` rows of one table, after the
 * cursor, each rewritten only if it holds an unsafe value. Call it inside a
 * transaction and store what it returns: the next cursor, or null when every
 * table is done. A table that does not exist holds nothing written before the
 * rule. Running a batch again changes nothing it already made safe.
 */
export function scrubBatch(sql: Sql, tables: readonly ScrubTable[], cursor: ScrubCursor, limit = SCRUB_BATCH): ScrubCursor | null {
  const t = tables[cursor.table];
  if (!t) return null;
  const next = (): ScrubCursor | null => (cursor.table + 1 < tables.length ? { table: cursor.table + 1, after: null } : null);
  if (!tableExists(sql, t.table)) return next();
  const cols = [t.key, ...t.columns].join(", ");
  const rows =
    cursor.after === null
      ? sql.all(`SELECT ${cols} FROM ${t.table} ORDER BY ${t.key} LIMIT ?`, limit)
      : sql.all(`SELECT ${cols} FROM ${t.table} WHERE ${t.key} > ? ORDER BY ${t.key} LIMIT ?`, cursor.after, limit);
  for (const r of rows) {
    const set = t.fix(r);
    if (!set) continue;
    const names = Object.keys(set);
    sql.all(`UPDATE ${t.table} SET ${names.map((n) => `${n} = ?`).join(", ")} WHERE ${t.key} = ?`, ...names.map((n) => set[n]!), r[t.key]!);
  }
  return rows.length === limit ? { table: cursor.table, after: rows[rows.length - 1]![t.key]! } : next();
}

/** Every batch at once, for a host with no alarm (tests, harnesses). The Room runs one batch per alarm. */
export function scrubLegacyErrors(sql: Sql, tables: readonly ScrubTable[] = SCRUB_TABLES): void {
  let c: ScrubCursor | null = { table: 0, after: null };
  while (c) c = sql.transaction(() => scrubBatch(sql, tables, c!));
}

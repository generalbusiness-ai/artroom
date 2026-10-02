/**
 * The one validator for stored and shown error text (request d29c09fa).
 *
 * Every durable or projected error field keeps safe metadata only: lane A's
 * `errorNote`, a push's `outcomeNote`, or a fixed phrase the Room writes
 * itself. `isSafeErrorText` accepts exactly that language and nothing else,
 * so a value written before the rule (provider text, even redacted) never
 * passes. `safeErrorText` is what a projection shows and what the one-time
 * scrub (`scrubLegacyErrors`) stores: the value if it is safe, otherwise a
 * fixed phrase, `<stage>: legacy error withheld`.
 */

import type { Sql } from "./sql.ts";
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
const NAMEPART = "[A-Za-z0-9._-]{1,100}";
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
      `A repository named ${NAMEPART} exists but is not a fork of ${NAMEPART}/${NAMEPART}\\. It was not used or changed\\.`,
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

/**
 * Rewrite every error field this package stores (request d29c09fa) that is
 * not safe: the landing records' `lastError` and push attempts' `detail`,
 * workspaces' `error` and their steps' `last_error`, and snapshot steps'
 * `last_error`. Safe values stay, so a second run changes nothing. Run it
 * inside the host's migration transaction; a table that does not exist yet
 * is skipped. Returns how many rows it rewrote.
 */
export function scrubLegacyErrors(sql: Sql): number {
  let n = 0;
  if (tableExists(sql, "artroom_land_op")) {
    for (const r of sql.all("SELECT id, body FROM artroom_land_op")) {
      const body = JSON.parse(String(r["body"])) as { lastError?: string; pushes?: { detail?: string | null }[] };
      let changed = false;
      if (typeof body.lastError === "string" && !isSafeErrorText(body.lastError)) {
        body.lastError = safeErrorText(body.lastError, "landing step failed");
        changed = true;
      }
      for (const p of body.pushes ?? []) {
        if (typeof p.detail === "string" && !isSafeErrorText(p.detail)) {
          p.detail = safeErrorText(p.detail, "landing step failed");
          changed = true;
        }
      }
      if (changed) {
        sql.all("UPDATE artroom_land_op SET body = ? WHERE id = ?", JSON.stringify(body), r["id"] as string);
        n++;
      }
    }
  }
  if (tableExists(sql, "artroom_ws")) {
    for (const r of sql.all("SELECT lane, error FROM artroom_ws WHERE error IS NOT NULL")) {
      const error = JSON.parse(String(r["error"])) as { message?: unknown };
      if (isSafeErrorText(error.message)) continue;
      error.message = safeErrorText(typeof error.message === "string" ? error.message : "", "could not provision the workspace");
      sql.all("UPDATE artroom_ws SET error = ? WHERE lane = ?", JSON.stringify(error), r["lane"] as string);
      n++;
    }
  }
  for (const [table, fallback] of [
    ["artroom_ws_duty", "workspace step failed"],
    ["artroom_snap_duty", "snapshot step failed"],
  ] as const) {
    if (!tableExists(sql, table)) continue;
    for (const r of sql.all(`SELECT id, last_error FROM ${table} WHERE last_error IS NOT NULL`)) {
      if (isSafeErrorText(r["last_error"])) continue;
      sql.all(`UPDATE ${table} SET last_error = ? WHERE id = ?`, safeErrorText(String(r["last_error"]), fallback), r["id"] as number);
      n++;
    }
  }
  return n;
}

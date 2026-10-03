/**
 * Row budgets for the Room's own bookkeeping (request 8bd623cc, part 3).
 * The other cost requests (99782949) cite these numbers. Nothing in the Room
 * enforces them yet: each constant states the limit that the implementing
 * request must enforce, and why that number was chosen.
 *
 * Every number comes from the measured table in
 * packages/room/measure/results/row-costs-2026-10-02.md: rows written to a
 * Room Durable Object, from Cloudflare's billing datasets, per act, on the
 * spike's folded schema (version 1, decision D5). A table's insert costs one
 * row plus one for each index on it (sqlite_autoindex for a non-integer
 * primary key or a UNIQUE column, and each CREATE INDEX).
 */

/** Rows written per act, measured (Room object; act minus the quiet-minute baseline). */
export const MEASURED_ROWS_WRITTEN = Object.freeze({
  claim: 9,
  invite: 12,
  join: 13,
  review: 16,
  note: 21,
  propose: 26,
  release: 27,
  land: 63,
  landWithThreeOpenPreviews: 73,
  landActivatingPolicyWithThreeOpen: 113,
  /** One publication of a cohort holding only the previous checkpoint: the idle room's minute. */
  checkpointPublication: 7,
  foundOneRoom: 171,
});

/** Rows one attention row costs: the table, its primary-key index, attention_pos and attention_principal_pos. */
export const ATTENTION_ROW_WRITES = 4;

/**
 * At most this many attention rows for one item. One row per principal
 * (core.ts `attend`); beyond the cap, address the role once instead of each
 * member. 15 x 4 = 60 rows, so an item's fan-out never writes more than the
 * dearest ordinary act measured, a landing (63).
 */
export const ATTENTION_FANOUT_PER_ITEM = 15;

/**
 * The newest attention rows a room keeps; older ones are deleted, oldest
 * first. `attend` counts the item's rows with a query that has no index
 * (`SELECT COUNT(*) FROM attention WHERE seq = ?`), so every insert reads the
 * whole table. At 2,048 rows that scan costs about as much as the reads of
 * one landing with three open previews (1,241 to 1,523 measured). It holds
 * at least 136 items at the full fan-out. Each deletion costs another 4
 * rows, so an attention row costs 8 rows in its whole life.
 */
export const ATTENTION_FIFO_PER_ROOM = 2_048;

/**
 * The newest idempotency records a room keeps (`idem`: the table and its
 * primary-key index, 2 rows written per act; a deletion costs 2 more).
 * Under the hourly per-object ceiling (3,600 rows, measure/rows.mjs
 * HOURLY_BUDGET, re-grounded after the idle-write fix) a room admits at most
 * 3,600 / 9 = 400 of the cheapest act, a claim, in an hour, so 24 hours is
 * 9,600 records. Rounded up to 16,384: a retry within a day always replays.
 * The quota changes storage, not rows written: in steady state each act
 * costs one insert and one deletion.
 */
export const IDEM_FIFO_PER_ROOM = 16_384;

/**
 * Alarms. After the idle-write fix (request 3da1d82b), measured on
 * 2026-10-02 and 03: an idle room writes 0 rows, an alarm tick with
 * nothing pending writes 0 rows (202 read), and a tick that completes one
 * pending pin writes at most 2 rows (136 read). The history below is why.
 *
 * Measured on 2026-10-02, before the fix: an idle room wrote 7 rows a minute,
 * forever, because each log publication sealed a `checkpoint` entry that
 * was itself unpublished and became due a minute later. That was 420 rows
 * written an hour and 10,080 a day per room, and each publication read
 * about 16 rows per entry in the log. A room whose repository was deleted
 * failed to publish and wrote about 12 rows a minute (720 an hour).
 */
export const ALARM = Object.freeze({
  /** Rows an idle room may write in an hour: a cohort of only checkpoint entries is never due. */
  idleRowsPerHour: 0,
  /** While a step is due and making progress, the alarm may run every 5 s (today's loop, core.ts `nextAlarm`). */
  pendingIntervalMs: 5_000,
  /**
   * A step that fails retries with exponential backoff up to 5 minutes: at
   * most 12 retries an hour, instead of 720 at 5 s.
   */
  retryBackoffMaxMs: 300_000,
});

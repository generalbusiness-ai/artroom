/** Seven-day operational correlation, outside every sealed history. */
import type { DutyId, Timestamp } from "@generalbusiness/dap-contract";
import { isDutyId } from "@generalbusiness/artroom-bytes";
import { timeOf } from "@generalbusiness/dap-derive";
import { isRequestId, isTraceId } from "./correlation.ts";
import type { Sql } from "./sqlite.ts";

export const REQUEST_ROWS = 4096;
export const REQUEST_PAGE = 100;
export const REQUEST_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const position = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const SCHEMA = `CREATE TABLE IF NOT EXISTS request_index (
  n INTEGER PRIMARY KEY AUTOINCREMENT CHECK(n <= 9007199254740991),
  request TEXT NOT NULL, trace TEXT, time INTEGER NOT NULL, seq INTEGER, duty TEXT
);
CREATE INDEX IF NOT EXISTS request_index_time ON request_index(time, n);
CREATE INDEX IF NOT EXISTS request_index_request ON request_index(request, time DESC, n DESC);
CREATE INDEX IF NOT EXISTS request_index_trace ON request_index(trace, time DESC, n DESC);`;
export interface RequestRow { n: number; request: string; trace: string | null; time: Timestamp; seq: number | null; duty: DutyId | null }
export interface RequestQuery { by: "request" | "trace"; id: string; before: { time: number; n: number } | null }
export interface RequestPage { rows: readonly RequestRow[]; window: { oldest: Timestamp; newest: Timestamp } | null; complete: boolean; next?: string }
/** Closed query admission is independent of SQL and of session authority. */
export function requestQuery(request: unknown, trace: unknown, cursor?: unknown): RequestQuery | null {
  if ((request === undefined) === (trace === undefined)) return null;
  const by = request === undefined ? "trace" : "request", id = request ?? trace;
  if (!(by === "request" ? isRequestId(id) : isTraceId(id))) return null;
  if (cursor === undefined) return { by, id: id as string, before: null };
  if (typeof cursor !== "string" || !/^[0-9]{1,16}\.[1-9][0-9]{0,15}$/.test(cursor)) return null;
  const [time, n] = cursor.split(".").map(Number);
  if (!position(time) || !position(n)) return null;
  return { by, id: id as string, before: { time, n } };
}

export class RequestIndex {
  readonly #sql: Pick<Sql, "exec">;
  #ready = false;
  constructor(sql: Pick<Sql, "exec">) { this.#sql = sql; this.#initialize(); }
  #initialize(): void {
    try { this.#sql.exec(SCHEMA).toArray(); this.#ready = true; } catch { /* no native fact depends on this table */ }
  }
  /** Called only after the native entry/outbox write. Never throws. */
  record(request: unknown, trace: unknown, now: number, seq: number | null, duty: DutyId | null): boolean {
    if (!isRequestId(request) || !(trace === null || isTraceId(trace)) || !position(now)
      || !(seq === null || position(seq)) || !(duty === null || isDutyId(duty)) || seq === null && duty === null) return false;
    try {
      if (!this.#ready) this.#initialize();
      if (!this.#ready) return false;
      // Complete indexed expiry, then capacity eviction, then the new row.
      // No await occurs between these bounded statements.
      this.#sql.exec("DELETE FROM request_index WHERE time < ?", now - REQUEST_AGE_MS).toArray();
      const count = this.#sql.exec("SELECT COUNT(*) AS n FROM request_index").toArray()[0]?.["n"];
      if (!position(count) || count > REQUEST_ROWS) return false;
      if (count === REQUEST_ROWS) this.#sql.exec("DELETE FROM request_index WHERE n = (SELECT n FROM request_index ORDER BY time, n LIMIT 1)").toArray();
      this.#sql.exec("INSERT INTO request_index(request, trace, time, seq, duty) VALUES (?, ?, ?, ?, ?)", request, trace, now, seq, duty).toArray();
      return true;
    } catch { return false; }
  }
  /** The caller must authorize admin access first. No read creates or deletes rows. */
  page(query: RequestQuery, now: number): RequestPage | null {
    if (!this.#ready || !position(now)) return null;
    // Recheck even typed callers: no unvalidated identifier chooses a SQL column.
    const checked = requestQuery(query.by === "request" ? query.id : undefined, query.by === "trace" ? query.id : undefined, query.before === null ? undefined : `${query.before.time}.${query.before.n}`);
    if (!checked || checked.by !== query.by) return null;
    try {
      const cutoff = now - REQUEST_AGE_MS;
      const window = this.#sql.exec("SELECT MIN(time) AS oldest, MAX(time) AS newest FROM request_index WHERE time >= ?", cutoff).toArray()[0];
      const oldest = window?.["oldest"], newest = window?.["newest"];
      const rows = this.#sql.exec(`SELECT n, request, trace, time, seq, duty FROM request_index WHERE ${checked.by} = ? AND time >= ? AND (? IS NULL OR time < ? OR (time = ? AND n < ?)) ORDER BY time DESC, n DESC LIMIT ?`, checked.id, cutoff, checked.before?.time ?? null, checked.before?.time ?? null, checked.before?.time ?? null, checked.before?.n ?? null, REQUEST_PAGE + 1).toArray();
      const complete = rows.length <= REQUEST_PAGE;
      const value = rows.slice(0, REQUEST_PAGE).map((row): RequestRow => {
        if (!position(row["n"]) || !isRequestId(row["request"]) || !(row["trace"] === null || isTraceId(row["trace"])) || !position(row["time"])
          || !(row["seq"] === null || position(row["seq"])) || !(row["duty"] === null || isDutyId(row["duty"]))) throw Error("Unavailable correlation row");
        return { n: row["n"], request: row["request"], trace: row["trace"], time: timeOf(row["time"]), seq: row["seq"], duty: row["duty"] };
      });
      if (!(oldest === null && newest === null) && !(position(oldest) && position(newest))) return null;
      const last = rows[REQUEST_PAGE - 1];
      return { rows: value, window: oldest === null || newest === null ? null : { oldest: timeOf(oldest as number), newest: timeOf(newest as number) }, complete, ...(!complete ? { next: `${last!["time"]}.${last!["n"]}` } : {}) };
    } catch { return null; }
  }
}

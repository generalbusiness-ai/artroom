/** Internal synchronous metadata seeks, not a public authorized item query. */
import { canonicalize, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import { byteOrder } from "@generalbusiness/dap-derive";
import type { Sql, SqlValue } from "./sqlite.ts";

export const ITEM_CANDIDATE_BOUNDS = { rows: 100, states: 16, ids: 100, candidates: 1616, metadataBytes: 128 * 1024, nameBytes: 64 } as const;
export interface ItemCandidateQuery { type: string; states: readonly string[]; after: number | null; ids?: readonly number[] }
export interface ItemCandidate { id: number; bytes: number }
export interface ItemCandidateAllowance { rows: number; candidates: number; metadataBytes: number }
export type ItemCandidates =
  | { ok: true; rows: readonly ItemCandidate[]; exhausted: boolean; candidatesRead: number; metadataBytes: number }
  | { ok: false; reason: "invalid-query" | "too-large" | "query-not-ready" | "invalid-metadata" };

const whole = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const name = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= ITEM_CANDIDATE_BOUNDS.nameBytes && wellFormed(s) && utf8(s).length <= ITEM_CANDIDATE_BOUNDS.nameBytes;
const no = (reason: Extract<ItemCandidates, { ok: false }>["reason"]): ItemCandidates => ({ ok: false, reason });

/**
 * Caller authenticates and validates definition/head separately, then keeps
 * this and any admitted body reads in one synchronous pass. Only IDs and
 * direct-column octet_length(record) leave SQLite here. Caller supplies the
 * verified UTF8 Scope backend. A missing primitive/index refuses: there is
 * no record-materializing fallback or migration.
 */
export function itemCandidates(sql: Pick<Sql, "exec">, query: ItemCandidateQuery, allowance: ItemCandidateAllowance): ItemCandidates {
  if (!query || !name(query.type) || !Array.isArray(query.states) || query.states.length > ITEM_CANDIDATE_BOUNDS.states
    || query.states.some((s, i) => !name(s) || (i > 0 && byteOrder(query.states[i - 1]!, s) >= 0))
    || !(query.after === null || whole(query.after))
    || (query.ids !== undefined && (!Array.isArray(query.ids) || query.ids.length > ITEM_CANDIDATE_BOUNDS.ids || query.ids.some((id, i) => !whole(id) || (i > 0 && query.ids![i - 1]! >= id))))) return no("invalid-query");
  const { rows, candidates, metadataBytes } = { ...allowance };
  if (!whole(rows) || rows < 1 || rows > ITEM_CANDIDATE_BOUNDS.rows || !whole(candidates) || candidates > ITEM_CANDIDATE_BOUNDS.candidates || !whole(metadataBytes) || metadataBytes > ITEM_CANDIDATE_BOUNDS.metadataBytes) return no("too-large");
  if (metadataBytes < 2) return no("too-large");
  // Empty IDs means no items. It must never broaden into a state scan.
  if (query.states.length === 0 || query.ids?.length === 0) return { ok: true, rows: [], exhausted: true, candidatesRead: 0, metadataBytes: 2 };
  const maximum = query.ids === undefined ? query.states.length * (rows + 1) : query.ids.filter(id => id > (query.after ?? -1)).length;
  // Admit worst-case metadata and SQL seek counts before any execution.
  // Each {id,bytes} of safe integers costs under64 UTF8 bytes incl comma.
  if (maximum > candidates || 2 + 64 * maximum > metadataBytes) return no("too-large");
  const found: ItemCandidate[] = [];
  let used = 2;
  const take = (selected: Record<string, SqlValue>[], limit: number): boolean => {
    if (selected.length > limit) return false;
    let previous = query.after ?? -1;
    for (const row of selected) {
      const id = row["id"], bytes = row["bytes"];
      if (!whole(id) || id <= previous || !whole(bytes)) return false;
      const next = { id, bytes };
      used += utf8(canonicalize(next)).length + (found.length > 0 ? 1 : 0);
      if (used > metadataBytes || found.length >= candidates) return false;
      found.push(next); previous = id;
    }
    return true;
  };
  try {
    if (query.ids === undefined) {
      for (const state of query.states) {
        const selected = sql.exec("SELECT id, octet_length(record) AS bytes FROM item INDEXED BY item_by_state WHERE type = ? AND state = ? AND id > ? ORDER BY id LIMIT ?", query.type, state, query.after ?? -1, rows + 1).toArray();
        if (!take(selected, rows + 1)) return no("invalid-metadata");
      }
    } else {
      // Individual PK seeks use at most18 bindings, below the backend100 cap.
      const states = query.states.map(() => "?").join(",");
      for (const id of query.ids) if (id > (query.after ?? -1)) {
        const selected = sql.exec(`SELECT id, octet_length(record) AS bytes FROM item NOT INDEXED WHERE id = ? AND type = ? AND state IN (${states}) LIMIT 1`, id, query.type, ...query.states).toArray();
        if (!take(selected, 1) || (selected[0] !== undefined && selected[0]["id"] !== id)) return no("invalid-metadata");
      }
    }
  } catch { return no("query-not-ready"); }
  found.sort((a, b) => a.id - b.id);
  if (found.some((row, i) => i > 0 && row.id === found[i - 1]!.id)) return no("invalid-metadata");
  return { ok: true, rows: found.slice(0, rows + 1), exhausted: found.length <= rows, candidatesRead: found.length, metadataBytes: used };
}

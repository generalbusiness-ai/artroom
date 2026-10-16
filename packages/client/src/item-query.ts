/** Explicit finite collection. Default: one page, with visible suffix coverage. */
import { ITEM_QUERY_BOUNDS as B } from "@generalbusiness/dap-contract";
import type { Head, Item, ItemQuery, ItemQueryRefusal } from "@generalbusiness/dap-contract";
import { canonicalize, encodeItemQueryParameter, readItemQueryParameter, utf8, within, LATE } from "@generalbusiness/artroom-bytes";
import type { ScopeHandle } from "./handle.ts";
export const ITEM_QUERY_COLLECTION_BOUNDS = Object.freeze({ pages: 4, bytes: 1024 * 1024, milliseconds: 10_000, restarts: 1 });
export interface ItemQueryCollectionOptions { pages?: number; bytes?: number; milliseconds?: number; restarts?: number }
export type ItemQueryCoverageReason = ItemQueryRefusal | "page-budget" | "byte-budget" | "deadline" | "head-changed";
export interface ItemQueryCoverage {
  /** Complete means only the selected suffix at `at`, never a whole inventory. */
  complete: boolean;
  at: Head | null;
  items: readonly Item[];
  /** Exact continuation for this prefix, retained on a refusal. */
  next: string | null;
  reason: ItemQueryCoverageReason | null;
  pages: number;
  bytes: number;
}

/** No default all-pages scan. Page reservations, elapsed time and consumed
 * bytes survive a permitted restart; a late task starts no further read.
 * Logical expiry cannot physically stop a custom transport that ignores it. */
export async function collectItemQuery(handle: Pick<ScopeHandle, "queryItems">, selection: ItemQuery, options: ItemQueryCollectionOptions = {}): Promise<ItemQueryCoverage> {
  const caps = { pages: options.pages ?? 1, bytes: options.bytes ?? B.payloadBytes, milliseconds: options.milliseconds ?? 10_000, restarts: options.restarts ?? 0 };
  for (const key of ["pages", "bytes", "milliseconds", "restarts"] as const) if (!Number.isSafeInteger(caps[key]) || caps[key] < (key === "restarts" ? 0 : 1) || caps[key] > ITEM_QUERY_COLLECTION_BOUNDS[key]) throw new RangeError("invalid item query collection bounds");
  const initial = readItemQueryParameter(encodeItemQueryParameter(selection));
  if (!initial) throw new RangeError("invalid item query selection");
  let pages = 0, bytes = 0, reserved = 0, restarts = 0, at: Head | null = null, cursor = initial.cursor;
  let items: Item[] = [];
  const coverage = (reason: ItemQueryCoverageReason | null, complete = false): ItemQueryCoverage => ({ complete, at: at && { ...at }, items: [...items], next: cursor, reason, pages, bytes });
  const result = await within(caps.milliseconds / 1000, async signal => {
    while (pages < caps.pages && !signal.aborted) {
      // A transport may return the full legal envelope. Reserve that upper
      // bound before dispatch, rather than discover an overrun afterwards.
      if (reserved + B.payloadBytes > caps.bytes) return coverage("byte-budget");
      reserved += B.payloadBytes; pages++;
      let page;
      try { page = await handle.queryItems({ ...initial, cursor }); }
      catch { return coverage(signal.aborted ? "deadline" : "unavailable"); }
      if (signal.aborted) return coverage("deadline");
      bytes += utf8(canonicalize(page)).length;
      if (!page.ok) {
        if (page.reason === "stale-cursor" && initial.cursor === null && restarts < caps.restarts) { restarts++; at = null; items = []; cursor = null; continue; }
        return coverage(page.reason);
      }
      if (at && (at.seq !== page.at.seq || at.hash !== page.at.hash)) return coverage("head-changed");
      at = page.at; items.push(...page.value.items); cursor = page.next ?? null;
      if (page.complete) return coverage(null, true);
    }
    return coverage(signal.aborted ? "deadline" : "page-budget");
  });
  return result === LATE ? coverage("deadline") : result;
}

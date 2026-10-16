/** Pure wire support for a bounded item query; not an enabled read route. */
import type { Digest, ScopeRef } from "./scope.ts";
import type { Head } from "./result.ts";
import type { Item } from "./read.ts";

export const ITEM_QUERY_ORDER = "id-ascending" as const;
export const ITEM_QUERY_BOUNDS = Object.freeze({ rows: 100, states: 16, ids: 100, candidates: 1616, metadataBytes: 128 * 1024, payloadBytes: 256 * 1024, nameBytes: 64, queryBytes: 8192, cursorBytes: 2048, depth: 3 });
export const ITEM_QUERY_DOMAINS = Object.freeze({ selection: "artroom-item-query-selection-1", argument: "artroom-item-query-argument-1" });
export const ITEM_QUERY_ARGUMENT_PREFIX = "query-items-v1:" as const;
export const ITEM_QUERY_CURSOR_PREFIX = "iq1." as const;
export const ITEM_QUERY_WIRE_BOUNDS = Object.freeze({ encodedChars: 10923, urlBytes: 12 * 1024, commonUrlBytes: 16 * 1024, errorBytes: 4096, signedChars: 2055, sessionChars: 4104 });
export const ITEM_QUERY_REFUSALS = Object.freeze(["invalid-query", "wrong-scope", "invalid-cursor", "stale-cursor", "query-mismatch", "unknown-type", "unknown-state", "query-not-ready", "too-large", "invalid-metadata", "invalid-item", "row-too-large", "forbidden", "sessions-unavailable", "clock-behind", "unavailable"] as const);
export type ItemQueryRefusal = typeof ITEM_QUERY_REFUSALS[number];
export interface ItemQueryValue { v: 1; scope: ScopeRef; query: Digest; argument: string; items: readonly Item[] }
export type ItemQueryRead = { ok: true; at: Head; value: ItemQueryValue; complete: boolean; next?: string } | { ok: false; reason: ItemQueryRefusal };

export interface ItemQuery {
  readonly v: 1;
  /** Bind the initial page's full resource too, before any cursor exists. */
  readonly scope: ScopeRef;
  readonly type: string;
  /** UTF-8 byte-sorted unique declared state names. Empty selects nothing. */
  readonly states: readonly string[];
  /** Numeric-sorted unique IDs. Null means all matching IDs; [] means none. */
  readonly ids: readonly number[] | null;
  readonly limit: number;
  /** Explicit null for the initial page. Present bytes bind this exact page. */
  readonly cursor: string | null;
}

/** Continuation only: no authority, integrity guarantee or proof of a prefix. */
export interface ItemQueryCursor {
  readonly v: 1;
  readonly scope: ScopeRef;
  readonly head: Head;
  readonly query: Digest;
  readonly order: typeof ITEM_QUERY_ORDER;
  readonly bounds: typeof ITEM_QUERY_BOUNDS;
  readonly limit: number;
  readonly last: number;
}

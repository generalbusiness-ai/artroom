/** Pure wire support for a bounded item query; not an enabled read route. */
import type { Digest, ScopeRef } from "./scope.ts";
import type { Head } from "./result.ts";

export const ITEM_QUERY_ORDER = "id-ascending" as const;
export const ITEM_QUERY_BOUNDS = Object.freeze({ rows: 100, states: 16, ids: 100, candidates: 1616, metadataBytes: 128 * 1024, payloadBytes: 256 * 1024, nameBytes: 64, queryBytes: 8192, cursorBytes: 2048, depth: 3 });
export const ITEM_QUERY_DOMAINS = Object.freeze({ selection: "artroom-item-query-selection-1", argument: "artroom-item-query-argument-1" });
export const ITEM_QUERY_ARGUMENT_PREFIX = "query-items-v1:" as const;
export const ITEM_QUERY_CURSOR_PREFIX = "iq1." as const;

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

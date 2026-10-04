/**
 * Reads (scope contract, section 9.1). Every list is a page with a stated
 * maximum and a cursor. A read of state is a statement about `at`.
 */

import type { Digest, FactRef, ScopeRef } from "./scope.ts";
import type { Receipt } from "./entry.ts";
import type { ReadRefusal } from "./result.ts";

/** An opaque, resumable position in a paged read. */
export type Cursor = string;

export type Read<T> =
  | { ok: true; at: { seq: number; hash: Digest }; value: T; complete: boolean; next?: Cursor }
  | { ok: false; reason: ReadRefusal; detail?: FactRef | ScopeRef };

/** Settlement of one signed intent: one receipt or `not-found` (section 4.2). */
export type Settlement = Read<Receipt>;

/** The page bounds of section 9.1. */
export const RETAINED_ITEMS_PAGE = 100;
export const HISTORY_PAGE_ENTRIES = 200;
export const HISTORY_PAGE_BYTES = 1024 * 1024;
export const ENTRY_READ_BYTES = 256 * 1024;
export const COMMENTS_PAGE = 100;
export const INDEX_PAGE_ROWS = 100;
export const OUTBOX_PAGE_DUTIES = 100;

/**
 * Attention, the log and live updates: paginated and resumable with cursors
 * (plan section 5). Rules R-API-6..8 in docs/protocol.md.
 */

import type { ActId, Cursor, LaneId, ObligationId, OpId, RuleId, Seq, Timestamp } from "./ids.ts";
import type { ProposalRef } from "./acts.ts";
import type { EntrySummary, LogEntry } from "./log.ts";
import type { Principal } from "./roster.ts";

export interface PageRequest {
  readonly cursor?: Cursor;
  /** Default 50, at most 500. */
  readonly limit?: number;
}

/** A page. `cursor` is always present: pass it back to resume, even when `more` is false. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly cursor: Cursor;
  readonly more: boolean;
}

export interface LogRequest {
  /** Return entries with seq greater than this. Default -1 (from genesis). */
  readonly after?: Seq;
  readonly cursor?: Cursor;
  readonly limit?: number;
}

export interface LogPage {
  readonly acts: readonly LogEntry[];
  readonly cursor: Cursor;
  readonly more: boolean;
  /** The highest seq published to `refs/artroom/log` (R-LOG-8). */
  readonly publishedThrough: Seq;
  /** The highest seq recorded. `head - publishedThrough` is the publication lag. */
  readonly head: Seq;
}

/** Why an item is in this actor's attention queue. Each item says so (plan section 3, item 4). */
export type AttentionWhy =
  | { readonly why: "review-requested"; readonly proposal: ProposalRef; readonly obligation: ObligationId; readonly as: Principal | "owners" }
  | { readonly why: "check-requested"; readonly proposal: ProposalRef; readonly obligation: ObligationId; readonly op?: OpId }
  | { readonly why: "objection"; readonly proposal: ProposalRef; readonly review: ActId }
  | { readonly why: "note"; readonly note: ActId; readonly replyTo?: ActId }
  | { readonly why: "land-outcome"; readonly op: OpId; readonly state: "landed" | "aborted" | "retryable" | "failed" }
  | { readonly why: "recut-needed"; readonly lane: LaneId; readonly op: OpId; readonly unheld: boolean }
  | { readonly why: "lease-expiring"; readonly lane: LaneId; readonly expiresAt: Timestamp }
  | { readonly why: "lane-unheld"; readonly lane: LaneId; readonly reason: "released" | "expired" }
  | { readonly why: "evidence-invalidated"; readonly proposal: ProposalRef; readonly obligation: ObligationId }
  | { readonly why: "publication-unresolved"; readonly op: OpId; readonly since: Timestamp }
  | { readonly why: "revert-lane"; readonly lane: LaneId; readonly of: OpId }
  | { readonly why: "policy"; readonly rule: RuleId; readonly act: ActId; readonly text: string };

export type AttentionItem = AttentionWhy & {
  readonly id: string;
  /** The log entry that put it here. */
  readonly seq: Seq;
  readonly lane?: LaneId;
  /** One plain sentence: what to do. */
  readonly text: string;
  /** False once what it asks for has happened; resolved items stay readable. */
  readonly open: boolean;
};

/**
 * A page of the attention queue, with the publication point (R-LOG-11,
 * R-API-9). `publishedThrough` comes from the same read as the items, so a
 * caller never needs a second read of the log to learn it.
 */
export type AttentionPage = Page<AttentionItem> & {
  /** The highest seq published to `refs/artroom/log` (R-LOG-8). */
  readonly publishedThrough: Seq;
};

/**
 * One live update. Over RPC, one line of a newline-delimited JSON byte
 * stream; over HTTPS, a long poll or one WebSocket message; over MCP,
 * `attention` with a cursor (R-API-8).
 */
export interface Update {
  readonly cursor: Cursor;
  readonly entries: readonly EntrySummary[];
  readonly attention: readonly AttentionItem[];
  readonly publishedThrough: Seq;
}

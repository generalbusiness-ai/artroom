/**
 * Lanes, leases and lane transitions (plan sections 4, 5 and 9).
 * Rules R-LANE in docs/protocol.md.
 */

import type {
  ActId,
  Generation,
  Glob,
  LaneId,
  LeaseGeneration,
  MemberId,
  OpId,
  Seq,
  Sha,
  Timestamp,
} from "./ids.ts";
import type { LanePurpose } from "./acts.ts";

export interface Lease {
  readonly holder: MemberId;
  /** The lease generation. Acts on the lane carry it, and an old one is fenced (R-LANE-6). */
  readonly generation: LeaseGeneration;
  readonly expiresAt: Timestamp;
}

/**
 * Proof the caller believes it holds a lane. Every lane-changing method takes
 * one. A `Claim` record and a held `Lane` both satisfy it.
 */
export interface Held {
  readonly lane: LaneId;
  readonly lease: Lease;
}

/** One possible overlap between two claims. Overlap is conservative (R-PATH-3). */
export interface Overlap {
  readonly lane: LaneId;
  readonly holder: MemberId | null;
  readonly mine: Glob;
  readonly theirs: Glob;
  /** False when the patterns may intersect but no existing path is known to match both. */
  readonly certain: boolean;
}

/** A generation in a lane's history. Earlier generations stay readable. */
export interface GenerationSummary {
  readonly generation: Generation;
  readonly head: Sha;
  readonly act: ActId;
  readonly landed?: { readonly commit: Sha; readonly at: Seq };
}

interface LaneBase {
  readonly lane: LaneId;
  readonly purpose: LanePurpose;
  readonly goal: string;
  readonly plan?: string;
  readonly scope: readonly Glob[];
  /** The latest generation; 0 when nothing has been proposed. */
  readonly generation: Generation;
  readonly generations: readonly GenerationSummary[];
  readonly overlaps: readonly Overlap[];
  /** The landing operation in flight on this lane, if any. */
  readonly landing?: OpId;
  /** Set on a revert lane the room opened (R-REV-6). */
  readonly revertOf?: OpId;
  /**
   * The thread's kind: the kind of the act that opened it, or `room` for a
   * revert lane (R-DECL-6). An act may act on this thread only if its
   * declaration's `threads` names this kind (R-DECL-8). The room always
   * gives it; it is optional here so that older readers and test doubles
   * that build a lane without it still fit.
   */
  readonly kind?: string;
}

export type Lane =
  | (LaneBase & { readonly state: "held"; readonly lease: Lease })
  | (LaneBase & {
      readonly state: "unheld";
      readonly lease: null;
      /** The last lease generation; a take-over gets the next one. */
      readonly leaseGeneration: LeaseGeneration;
      readonly why: "released" | "expired" | "opened-by-room";
      /** The handover note, if the last holder wrote one. Never invented (plan section 4). */
      readonly handover?: ActId;
    });

export type LaneState = Lane["state"];

/** Filters for `room.lanes()`. */
export interface LaneFilter {
  readonly state?: LaneState;
  readonly holder?: MemberId;
  /** Lanes whose scope may overlap this pattern. */
  readonly touches?: Glob;
}

/**
 * Lane effects, as recorded in receipts. Together with `expectedGeneration`
 * on bodies they are the lane transitions of plan section 5:
 *
 * | Transition                  | Effect        | Rule      |
 * |-----------------------------|---------------|-----------|
 * | claim on a new scope        | `opened`      | R-LANE-1  |
 * | claim by holder (rescope)   | `rescoped`    | R-LANE-2  |
 * | claim of an unheld lane     | `taken-over`  | R-LANE-7  |
 * | propose                     | `proposed`    | R-LANE-4  |
 * | renew, or any holder act    | `renewed`     | R-LANE-5  |
 * | release                     | `released`    | R-LANE-8  |
 * | lease expiry (system)       | `expired`     | R-LANE-8  |
 * | landing outcome (system)    | `landed`      | R-PUB-5   |
 */
export type LaneEffect =
  /**
   * The lane is the entry that records this effect. Its ID depends on the
   * entry's hash, so it is never written here (R-LOG-12).
   */
  | {
      readonly type: "opened";
      readonly purpose: LanePurpose;
      readonly lease: Lease;
      /**
       * In a room whose active document is `v2`: the thread's kind, and the
       * binding of the act that opened it, null for a `recover` thread
       * (R-LOG-6 as amended, R-DECL-6). Absent under a `v1` document.
       */
      readonly kind?: string;
      readonly binding?: string | null;
    }
  | {
      readonly type: "rescoped";
      readonly lane: LaneId;
      readonly scope: readonly Glob[];
      readonly obligationsRecomputed: boolean;
    }
  | { readonly type: "taken-over"; readonly lane: LaneId; readonly lease: Lease; readonly previous: MemberId | null }
  | { readonly type: "proposed"; readonly lane: LaneId; readonly generation: Generation; readonly head: Sha }
  | { readonly type: "renewed"; readonly lane: LaneId; readonly expiresAt: Timestamp }
  | { readonly type: "released"; readonly lane: LaneId; readonly leaseGeneration: LeaseGeneration }
  | { readonly type: "expired"; readonly lane: LaneId; readonly leaseGeneration: LeaseGeneration }
  | { readonly type: "landed"; readonly lane: LaneId; readonly generation: Generation; readonly commit: Sha };

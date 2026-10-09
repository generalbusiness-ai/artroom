import type { FactRef, ScopeRef } from "./scope.ts";
import type { Sealed } from "./read.ts";
/** Public object bytes of one job's recorded reservation, never a credential. */
export interface ReservationSnapshot {
  destination: ScopeRef;
  job: Sealed;
  manifest: Sealed;
  reservation: Sealed;
  sources: readonly Sealed[];
  base: string;
  commit: string;
  tree: string;
  objects: readonly { id: string; type: "blob" | "tree" | "commit"; data: Uint8Array }[];
}
export interface ReservationSnapshotAsk { job: FactRef }

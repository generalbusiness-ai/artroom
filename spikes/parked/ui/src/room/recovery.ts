/**
 * What the room is doing about an unresolved publication, from the
 * operation's current recorded facts (R-PUB-5, R-REV-5). A sentence about
 * recovery is only ever made from a loaded operation: an event alone never
 * shows whether an abort attempt exists.
 */

import type { LandOp } from "./contract.ts";

export function recoveryNow(op: Extract<LandOp, { state: "unresolved" }>): string {
  if (op.abort) return "Abort attempt in progress. The room no longer pushes this landing; it keeps reading main back.";
  if (op.readBack.main === "unexpected") return "Main shows another writer. The room stopped pushing and keeps the slot held until an admin reconciles main.";
  return "Main still reads as before, so the room pushes the same reserved commit forward again. Later landings wait.";
}

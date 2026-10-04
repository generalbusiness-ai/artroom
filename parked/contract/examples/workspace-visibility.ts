/**
 * Workspace operations are public; their credential is not (review 45431cd9,
 * P1.4; R-WS). Compiled, never run.
 *
 * Member B reads and waits on member A's workspace operation. B sees the
 * state and the remote, and the types give B no token. B's request for the
 * token is refused.
 */

import { isRefusal, type Held, type OpId, type RoomApi } from "@generalbusiness/artroom-contract";

declare function show(message: string): void;

export async function memberBWatchesA(roomB: RoomApi, aOp: OpId, aLane: Held): Promise<void> {
  const op = await roomB.op({ id: aOp, kind: "workspace" });
  show(`A's workspace is ${op.state}`);

  const ready = await roomB.wait(op, { until: ["ready", "failed"] });
  if (ready.state === "ready") {
    // The public view: remote and lease generation, never a token (R-WS-1).
    show(`remote ${ready.detail.remote}, lease ${ready.detail.leaseGeneration}`);
  }

  // B is not the holder, so the grant is refused (R-WS-2).
  const grant = await roomB.workspaceToken(aLane);
  if (isRefusal(grant)) {
    show(`${grant.rule}: ${grant.reason}`); // "not-holder"
    return;
  }
  // Only reachable for the current holder with the current lease generation.
  show(`token expires ${grant.expiresAt}`);
}

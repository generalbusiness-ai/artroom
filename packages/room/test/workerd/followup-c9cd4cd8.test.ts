/**
 * Follow-up c9cd4cd8 (2): a fresh Room object schedules every cleanup debt it
 * owns, not only founding debt. The snapshot and job-token controls are in
 * snapshot-repos.test.ts and job-token-mint.test.ts; this is the workspace one.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { Claim } from "@generalbusiness/artroom-contract";
import { forkName } from "@generalbusiness/artroom-git";
import type { Room } from "../../src/index.ts";
import { artifactsErrors } from "../../src/memory/artifacts.ts";
import { clock, makeRoom } from "./support.ts";

describe("follow-up c9cd4cd8 (2): a fresh object schedules workspace debt it finds", () => {
  it("a released workspace whose token revocation and inventory are owed, with no alarm stored: the fresh object stores one, and its alarm settles the debt", async () => {
    const r = await makeRoom();
    const a = r.world.artifacts;
    const { lane } = await r.admin.ok<Claim>("claim", null, { goal: "work", scope: ["src/**"] });
    const before = r.stub as unknown as DurableObjectStub<Room>;
    const owed = await runInDurableObject(before, async (room: Room) => {
      const ws = room.core.workspaces;
      ws.open(lane, 1, clock.now + 20 * 60_000);
      expect((await ws.provision(lane)).state).toBe("ready");
      // The release's revocation and its inventory both fail without an answer.
      a.failRemote("revokeToken", artifactsErrors.transport());
      a.failRemote("listTokens", artifactsErrors.transport());
      return ws.revoke(lane, 1);
    });
    expect(owed).toBeGreaterThan(0);
    const fork = a.repo(`${forkName(a.canonical, lane)}`);
    expect(fork.activeTokens().length).toBeGreaterThan(0);
    await runInDurableObject(before, (_room: Room, s: DurableObjectState) => s.storage.deleteAlarm());
    await runInDurableObject(before, (_room: Room, s: DurableObjectState) => s.abort("restart")).catch(() => undefined);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(r.id)) as unknown as DurableObjectStub<Room>;
    expect(await runInDurableObject(stub, (_room: Room, s: DurableObjectState) => s.storage.getAlarm()), "the fresh object stored an alarm").not.toBeNull();
    clock.now += 10 * 60_000; // past the deferred duties' backoff
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await runInDurableObject(stub, (room: Room) => room.core.workspaces.pendingCleanup())).toBe(0);
    expect(fork.activeTokens()).toEqual([]);
  });
});

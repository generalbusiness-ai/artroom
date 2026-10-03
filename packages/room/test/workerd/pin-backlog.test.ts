/**
 * Scheduling with a large backlog of pending pins, on the ordinary path (no
 * PIN_DELAY_MS): the checker's control on 48b1fee9. Uses only the Room's
 * ordinary interfaces, so it runs unchanged on main and on this lane.
 */

import { expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import type { Room } from "../../src/index.ts";
import { makeRoom } from "./support.ts";

const inDO = <T>(r: Awaited<ReturnType<typeof makeRoom>>, fn: (room: Room, state: DurableObjectState) => T | Promise<T>) =>
  runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);

const backlog = (room: Room, n: number) =>
  room.core.sql.all(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < ${n}) INSERT INTO pins (ref, head, done) SELECT 'refs/artroom/heads/lane_probe/' || x, '${"a".repeat(40)}', 0 FROM n`);

it("nextAlarm reads each of 5,000 pending pins once, by one scan", async () => {
  const r = await makeRoom();
  const seen = await inDO(r, async (room, state) => {
    await room.core.idle();
    room.core.run = () => {};
    backlog(room, 5_000);
    const original = room.core.sql.all;
    let rows = 0;
    const queries: string[] = [];
    (room.core.sql as { all: unknown }).all = (q: string, ...b: SqlStorageValue[]) => {
      const c = state.storage.sql.exec(q, ...b);
      const out = c.toArray();
      if (/FROM pins|pin_due/.test(q)) {
        rows += c.rowsRead;
        queries.push(q);
      }
      return out;
    };
    try {
      expect(room.core.nextAlarm()).not.toBeNull();
    } finally {
      (room.core.sql as { all: unknown }).all = original;
    }
    return { rows, queries };
  });
  expect(seen.queries).toEqual(["SELECT 1 AS x FROM pins WHERE done = 0"]);
  expect(seen.rows).toBe(5_000);
});

it("150,000 pending pins: loopPendingKinds and nextAlarm do not overflow the call stack", async () => {
  const r = await makeRoom();
  const out = await inDO(r, async (room) => {
    await room.core.idle();
    room.core.run = () => {};
    backlog(room, 150_000);
    return { pending: [...room.core.loopPendingKinds()], next: room.core.nextAlarm() };
  });
  expect(out.pending).toContain("pins");
  expect(out.next).not.toBeNull();
});

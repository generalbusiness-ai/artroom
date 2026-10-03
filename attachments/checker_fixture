/** Private paired probe for the new completed-read guard at exact624; MemoryRoom only. */
import { afterEach, describe, expect, test } from "vitest";
import type { Catalogue, HttpRoom } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { MemoryRoom } from "../src/room/mock/memory-room.ts";
import { BAND } from "../src/room/mock/declared-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";
const adapters: LiveRoom[] = [];
afterEach(() => { for (const a of adapters.splice(0)) a.stop(); });
function gate() { let release!: () => void; const promise = new Promise<void>(r => { release = r; }); return { promise, release }; }
async function quiet(reuse: boolean) {
  const room = await MemoryRoom.found("checker/624-read-observations", BAND, { acts: SETLIST_ACTS });
  room.me = "@noor";
  const actual = room.acts.bind(room);
  let prior: Catalogue | undefined;
  // Every call reads the actual current room. Reusing equal readonly results changes identity only, never content.
  room.acts = async () => {
    const current = await actual();
    if (reuse && prior !== undefined && JSON.stringify(current) === JSON.stringify(prior)) return prior;
    prior = current;
    return current;
  };
  const watch = room.watch.bind(room); room.watch = (cursor, _onUpdate) => watch(cursor, () => {});
  const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor"); adapters.push(adapter); await adapter.start();
  await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label: "Confirmed new policy" } } });
  const confirmed = (await adapter.readCatalogue())!;
  expect(confirmed.since).toBeGreaterThan(1);
  return { room, adapter, confirmed };
}
function holdError(room: MemoryRoom) {
  const read = room.acts.bind(room); const asked = gate(); const held = gate(); let n = 0;
  room.acts = async () => {
    if (++n === 1) { asked.release(); await held.promise; throw new Error("the earlier answer was lost"); }
    return read();
  };
  return { asked: asked.promise, release: held.release };
}
describe("checker624 availability after a completed equal-catalogue read", () => {
  test.each([false, true])("an earlier error cannot blank a successful later answer, reuseEqualResult=%s", async reuse => {
    const { room, adapter, confirmed } = await quiet(reuse);
    const held = holdError(room); const earlier = adapter.readCatalogue(); await held.asked;
    const later = await adapter.readCatalogue();
    expect(later).toEqual(confirmed);
    if (reuse) expect(later).toBe(confirmed);
    else expect(later).not.toBe(confirmed);
    held.release();
    const answer = await earlier;
    console.info(JSON.stringify({ probe: "completed equal catalogue before earlier error", reuse, confirmed: confirmed.since, lateAnswer: answer?.since ?? null, snapshot: adapter.snapshot()!.catalogue?.since ?? null }));
    expect.soft(answer, "a successful later read must remain available after an earlier error completes").toEqual(later);
    expect.soft(adapter.snapshot()!.catalogue, "completed-read ordering must not depend on object identity").toEqual(later);
  });
  test("with no intervening successful answer, an error still honestly makes the catalogue unavailable", async () => {
    const { room, adapter } = await quiet(true);
    const held = holdError(room); const earlier = adapter.readCatalogue(); await held.asked;
    held.release();
    expect(await earlier).toBeNull();
    expect(adapter.snapshot()!.catalogue).toBeNull();
    expect(adapter.snapshot()!.policy.version).toBeNull();
  });
});


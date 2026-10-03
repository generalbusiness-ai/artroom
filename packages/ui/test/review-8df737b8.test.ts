/**
 * Declared acts stage 5, the UI (request a5d64b35): the checker's act
 * 8df737b8, accepted by the planner's act 80bef90a.
 *
 * A read of the active catalogue that fails says nothing of its own age,
 * so it leaves the page without a catalogue only if no other answer was
 * taken while it was on its way. Whether one was taken must not be told by
 * comparing catalogue objects: a room's handle may give the same readonly
 * object for two reads of an unchanged catalogue, and the contract does not
 * promise a new one. The page counts the answers it takes instead.
 *
 * The room is the in-memory stand-in, with its change notices held back so
 * that each test decides the order of answers itself. Nothing here shows a
 * real Room, or the built-in HTTP handle, which parses a new object from
 * each answer.
 */

import { waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import type { ActsCatalogue, Catalogue, HttpRoom } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { BAND } from "../src/room/mock/declared-room.ts";
import { MemoryRoom } from "../src/room/mock/memory-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";

const adapters: LiveRoom[] = [];
afterEach(() => {
  for (const a of adapters.splice(0)) a.stop();
});

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

/**
 * A room and its adapter, loaded once, with a later activation confirmed. With `sameObject`, the room's handle
 * gives the object it gave before whenever the active catalogue is unchanged: every answer is still read from the
 * room, and only its identity is reused.
 */
async function confirmed(sameObject: boolean) {
  const room = await MemoryRoom.found("the-band/setlist", BAND, { acts: SETLIST_ACTS });
  room.me = "@noor";
  const actual = room.acts.bind(room);
  let last: Catalogue | undefined;
  room.acts = async () => {
    const now = await actual();
    if (sameObject && last !== undefined && JSON.stringify(now) === JSON.stringify(last)) return last;
    last = now;
    return now;
  };
  const watch = room.watch.bind(room);
  room.watch = (cursor, _onUpdate) => watch(cursor, () => {});
  const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor");
  adapters.push(adapter);
  await adapter.start();
  await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label: "A later meaning" } } });
  const held = (await adapter.readCatalogue()) as ActsCatalogue;
  expect(held.acts["start-song"]!.declaration.label).toBe("A later meaning");
  return { room, adapter, held };
}

/** The next read of the active catalogue is asked at once, waits for `release`, and then fails; later reads answer. */
function nextReadLost(room: MemoryRoom) {
  const read = room.acts.bind(room);
  const asked = gate();
  const release = gate();
  let n = 0;
  room.acts = async () => {
    if (++n === 1) {
      asked.open();
      await release.opened;
      throw new Error("the earlier answer was lost");
    }
    return read();
  };
  return { asked: asked.opened, release: release.open };
}

describe("a failed read and an answer taken while it was on its way (R-DECL-23)", () => {
  for (const sameObject of [true, false])
    test(`an explicit read that fails late does not blank the catalogue a later read gave, when the handle ${sameObject ? "gives the same object again" : "gives a new object"}`, async () => {
      const { room, adapter, held } = await confirmed(sameObject);
      const lost = nextReadLost(room);
      const earlier = adapter.readCatalogue();
      await lost.asked;
      const later = await adapter.readCatalogue();
      expect(later).toEqual(held);
      // The control differs from the case only in the identity of the answer.
      expect(later === held).toBe(sameObject);
      lost.release();
      // The late caller gets what the page holds, and the page still holds it.
      expect(await earlier).toEqual(held);
      expect(adapter.snapshot()!.catalogue).toEqual(held);
      expect(adapter.snapshot()!.policy.version).toBe(held.policy);
    });

  test("with no answer taken meanwhile, a failed read honestly leaves the page without a catalogue, also for a handle that reuses objects", async () => {
    const { room, adapter } = await confirmed(true);
    const lost = nextReadLost(room);
    const earlier = adapter.readCatalogue();
    await lost.asked;
    lost.release();
    expect(await earlier).toBeNull();
    expect(adapter.snapshot()!.catalogue).toBeNull();
    expect(adapter.snapshot()!.policy.version).toBeNull();
    // What was confirmed outlasts the failed read: the next answer of the same activation is taken.
    const again = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(again.acts["start-song"]!.declaration.label).toBe("A later meaning");
    expect(adapter.snapshot()!.catalogue).toEqual(again);
  });
});

describe("a load whose read of the catalogue fails late (R-DECL-23)", () => {
  /** A load is started by an act; its read of the active catalogue is the one held, and then lost. */
  async function loadWithLostRead(sameObject: boolean) {
    const { room, adapter, held } = await confirmed(sameObject);
    const lost = nextReadLost(room);
    let seen = 0;
    const off = adapter.subscribe(() => void (seen += 1));
    await adapter.act("start-song", null, { scope: ["songs/one/**"], title: "One", key: "c", tempo: 120 }, held.acts["start-song"]!.binding);
    await lost.asked;
    const published = async () => {
      const before = seen;
      lost.release();
      await waitFor(() => expect(seen).toBeGreaterThan(before));
      off();
      return adapter.snapshot()!;
    };
    return { adapter, held, published };
  }

  for (const sameObject of [true, false])
    test(`it is published under the catalogue an explicit read gave meanwhile, when the handle ${sameObject ? "gives the same object again" : "gives a new object"}`, async () => {
      const { adapter, held, published } = await loadWithLostRead(sameObject);
      const later = await adapter.readCatalogue();
      expect(later).toEqual(held);
      expect(later === held).toBe(sameObject);
      const snap = await published();
      expect(snap.catalogue).toEqual(held);
      expect(snap.policy.version).toBe(held.policy);
    });

  test("with no answer taken meanwhile, the load is published with no catalogue", async () => {
    const { published } = await loadWithLostRead(true);
    const snap = await published();
    expect(snap.catalogue).toBeNull();
    expect(snap.policy.version).toBeNull();
  });
});

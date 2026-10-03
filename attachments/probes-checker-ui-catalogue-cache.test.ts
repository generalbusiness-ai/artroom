/** A local read-route control with watch delivery paused; no live service. */
import { afterEach, describe, expect, test } from "vitest";
import type { Catalogue, HttpRoom } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { BAND } from "../src/room/mock/declared-room.ts";
import { MemoryRoom } from "../src/room/mock/memory-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";

const adapters: LiveRoom[] = [];
afterEach(() => { for (const adapter of adapters.splice(0)) adapter.stop(); });

async function pausedWatch() {
  const room = await MemoryRoom.found("checker/local-reads", BAND, { acts: SETLIST_ACTS });
  const watch = room.watch.bind(room);
  room.watch = (cursor, _onUpdate) => watch(cursor, () => {});
  const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor");
  adapters.push(adapter);
  await adapter.start();
  const old = (await room.acts()) as Catalogue;
  expect(await adapter.catalogueAt(old.since)).toEqual(old);
  return { room, adapter, old };
}

describe("checker catalogue baseline", () => {
  test("an explicit refresh with no activation retains the governing catalogue", async () => {
    const { adapter, old } = await pausedWatch();
    expect(await adapter.readCatalogue()).toEqual(old);
    expect(await adapter.catalogueAt(old.since)).toEqual(old);
  });
});

describe("checker catalogue regression", () => {
  test("an explicit current read after activation uses the new catalogue for a later accepted act", async () => {
    const { room, adapter, old } = await pausedWatch();
    const nextPolicy = await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label: "Begin a tune", help: "New help for this version." } } });
    const fresh = (await adapter.readCatalogue())!;
    expect(fresh.policy).toBe(nextPolicy);
    expect(adapter.snapshot()!.catalogue!.policy).toBe(nextPolicy);
    expect(fresh.policy).not.toBe(old.policy);
    expect(fresh.vocabulary).toBe("declared");
    if (fresh.vocabulary !== "declared") throw new Error("fixture is declared");
    const entry = await room.act("start-song", null, { scope: ["songs/after/**"], title: "After", key: "c", tempo: 120 }, { binding: fresh.acts["start-song"]!.binding });
    expect("refused" in entry).toBe(false);
    if ("refused" in entry) throw new Error("fixture act was accepted");
    expect(entry.seq).toBeGreaterThan(fresh.since);
    const at = await adapter.catalogueAt(entry.seq);
    expect(at!.policy).toBe(fresh.policy);
  });
  test("an explicit current read after retirement refreshes the old kind's retired mark", async () => {
    const { room, adapter, old } = await pausedWatch();
    const { cue: _retired, ...withoutCue } = SETLIST_ACTS;
    await room.activate({ acts: withoutCue });
    const fresh = (await adapter.readCatalogue())!;
    const expected = (await room.actsAt({ seq: old.since }))!;
    expect(expected.vocabulary).toBe("declared");
    if (expected.vocabulary !== "declared") throw new Error("fixture is declared");
    expect(expected.acts["cue"]!.retired).toBe(fresh.since);
    const read = (await adapter.catalogueAt(old.since))!;
    expect(read).toEqual(expected);
  });
});
